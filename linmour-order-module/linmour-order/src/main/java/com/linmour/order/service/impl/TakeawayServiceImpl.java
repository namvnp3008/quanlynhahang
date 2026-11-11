package com.linmour.order.service.impl;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.linmour.mq.KafkaProducer;
import com.linmour.order.feign.ProductFeign;
import com.linmour.order.feign.SystemFeign;
import com.linmour.order.mapper.OrderInfoMapper;
import com.linmour.order.pojo.Do.OrderInfo;
import com.linmour.order.pojo.Do.OrderItem;
import com.linmour.order.pojo.Dto.*;
import com.linmour.order.service.OrderItemService;
import com.linmour.order.service.TakeawayService;
import com.linmour.order.utils.IdGenerateUtil;
import com.linmour.product.pojo.Dto.PriceQuoteDto;
import com.linmour.product.pojo.Dto.PriceQuoteVo;
import com.linmour.product.pojo.Dto.ReduceInventoryDto;
import com.linmour.security.dtos.Result;
import com.linmour.security.utils.RedisCache;
import com.linmour.security.utils.SecurityUtils;
import com.linmour.system.pojo.Dto.AuditLogReqDto;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import javax.annotation.Resource;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import static com.linmour.order.constants.OrderConstant.*;
import static com.linmour.security.utils.SecurityUtils.getShopId;

/**
 * AO-2: Đơn mang về.
 * - giá luôn lấy từ linmour-product; trừ kho trước, ghi MySQL (đã thanh toán) trong một transaction
 * - bản sao Redis dùng tableId = -ticketNo để bếp / trạng thái món / WS chạy lại nguyên
 * - TAKEAWAY_REQ:<shop>:<requestId> (SET NX) chống tạo hai phiếu khi bấm lại
 */
@Slf4j
@Service
public class TakeawayServiceImpl implements TakeawayService {

    static final int MAX_QUANTITY = 99;
    static final int MAX_REMARK = 100;
    static final int MAX_TICKET_ATTEMPTS = 50;
    private static final ZoneId VN = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("yyyyMMdd");
    /** Giá trị TAKEAWAY_REQ khi phiếu đang tạo (khác hằng PENDING = 3 của OrderConstant) */
    private static final String REQ_PENDING = "PENDING";

    @Resource private RedisCache redisCache;
    @Resource private ProductFeign productFeign;
    @Resource private SystemFeign systemFeign;
    @Resource private OrderInfoMapper orderInfoMapper;
    @Resource private OrderItemService orderItemService;
    @Resource private KafkaProducer kafkaProducer;
    @Resource private TransactionTemplate transactionTemplate;

    public static String ticketSeqKey(Long shopId, Instant now) {
        return TAKEAWAY_SEQ + ":" + shopId + ":" + DAY.format(now.atZone(VN));
    }

    @Override
    public Result quote(List<TakeawayItemDto> items) {
        Long shopId = getShopId();
        if (shopId == null || shopId <= 0) {
            return Result.error(400, "Thiếu shopId");
        }
        Result invalid = validateItems(items);
        if (invalid != null) {
            return invalid;
        }
        return priceLines(shopId, items);
    }

    @Override
    public Result create(TakeawayReqDto req) {
        Long shopId = getShopId();
        if (shopId == null || shopId <= 0) {
            return Result.error(400, "Thiếu shopId");
        }
        if (req == null || StringUtils.isBlank(req.getRequestId())) {
            return Result.error(400, "Thiếu mã yêu cầu, vui lòng tải lại");
        }
        if (req.getPayType() == null || (req.getPayType() != 4 && req.getPayType() != 1)) {
            return Result.error(400, "Hình thức thu tiền không hợp lệ");
        }
        if (req.getRemark() != null && req.getRemark().length() > MAX_REMARK) {
            return Result.error(400, "Ghi chú tối đa " + MAX_REMARK + " ký tự");
        }
        Result invalid = validateItems(req.getItems());
        if (invalid != null) {
            return invalid;
        }

        String reqKey = TAKEAWAY_REQ + ":" + shopId + ":" + req.getRequestId();
        if (!Boolean.TRUE.equals(redisCache.setIfAbsent(reqKey, REQ_PENDING, 24L, TimeUnit.HOURS))) {
            Object done = redisCache.getCacheObject(reqKey);
            if (done == null || REQ_PENDING.equals(done.toString())) {
                return Result.error(409, "Đơn đang được xử lý, vui lòng đợi");
            }
            return Result.success(JSON.parseObject(done.toString(), TakeawayRespDto.class));
        }

        boolean stockReduced = false;
        boolean committed = false;
        List<ReduceInventoryDto> stock = null;
        try {
            Result quoteRes = priceLines(shopId, req.getItems());
            if (quoteRes.getCode() == null || quoteRes.getCode() != 200) {
                redisCache.deleteObject(reqKey);
                return quoteRes;
            }
            TakeawayQuoteVo quote = (TakeawayQuoteVo) quoteRes.getData();
            stock = quote.getLines().stream()
                    .map(l -> new ReduceInventoryDto(l.getProductId(), l.getQuantity()))
                    .collect(Collectors.toList());
            Result reduceRes = productFeign.reduceInventories(stock);
            if (reduceRes == null || reduceRes.getCode() == null || reduceRes.getCode() != 200) {
                redisCache.deleteObject(reqKey);
                return reduceRes != null ? reduceRes : Result.error(500, "Lỗi kiểm tra tồn kho món");
            }
            stockReduced = true;

            String seqKey = ticketSeqKey(shopId, Instant.now());
            int ticketNo = 0;
            for (int attempt = 0; attempt < MAX_TICKET_ATTEMPTS && ticketNo == 0; attempt++) {
                int candidate = redisCache.increment(seqKey).intValue();
                if (!redisCache.hasKey(ORDERINFO + ":" + shopId + ":-" + candidate)) {
                    ticketNo = candidate;
                }
            }
            redisCache.expire(seqKey, 2L, TimeUnit.DAYS);
            if (ticketNo == 0) {
                throw new IllegalStateException("Không cấp được số phiếu, vui lòng thử lại");
            }
            String orderId = String.valueOf(IdGenerateUtil.get().nextId());
            LocalDateTime now = LocalDateTime.now(VN);

            OrderInfo info = new OrderInfo();
            info.setId(orderId);
            info.setShopId(shopId);
            info.setTableId(null);
            info.setPayType(req.getPayType());
            info.setPayStatus(PAYMENT);
            info.setPayAmount(quote.getTotal());
            info.setOrderStatus(COMPLETED);
            info.setRemark(StringUtils.trimToEmpty(req.getRemark()));
            info.setOrderType(ORDER_TYPE_TAKEAWAY);
            info.setTicketNo(ticketNo);
            info.setCreateTime(now);

            List<OrderItem> dbItems = toItems(quote, shopId, orderId, 1);
            transactionTemplate.execute(status -> {
                orderInfoMapper.insert(info);
                orderItemService.saveBatch(dbItems);
                return null;
            });

            committed = true;

            TakeawayRespDto resp = new TakeawayRespDto(ticketNo, orderId, quote.getTotal());
            try {
                redisCache.setCacheObject(reqKey, JSON.toJSONString(resp), 24, TimeUnit.HOURS);
            } catch (Exception e) {
                log.error("Phiếu MV-{} đã thu tiền nhưng không lưu được khoá chống trùng: {}", ticketNo, e.getMessage());
            }

            try {
                kafkaProducer.originalOrder(new OrderAllDto(info, dbItems));
            } catch (Exception e) {
                log.warn("Không gửi được Kafka cho phiếu mang về MV-{}: {}", ticketNo, e.getMessage());
            }

            try {
                long tableKey = -ticketNo;
                Map<String, Object> hash = new HashMap<>();
                hash.put("id", orderId);
                hash.put("tableId", tableKey);
                hash.put("shopId", shopId);
                hash.put("payAmount", quote.getTotal());
                hash.put("payType", req.getPayType());
                hash.put("payStatus", PAYMENT);
                hash.put("paid", 1);
                hash.put("orderType", ORDER_TYPE_TAKEAWAY);
                hash.put("ticketNo", ticketNo);
                hash.put("remark", info.getRemark());
                hash.put("version", 1L);
                hash.put("createTime", now);
                redisCache.setHashValues(ORDERINFO + ":" + shopId + ":" + tableKey, hash);
                redisCache.setCacheList(ORDER_ITEM + ":" + shopId + ":" + tableKey, toItems(quote, shopId, orderId, 0));
                publish(shopId, tableKey, orderId, quote.getTotal(), "TAKEAWAY");
            } catch (Exception e) {
                log.error("Phiếu MV-{} đã thu tiền nhưng không tạo được bản bếp: {}", ticketNo, e.getMessage());
            }
            audit(shopId, orderId, "TAKEAWAY_CREATE", ticketNo, quote.getTotal());
            return Result.success(resp);
        } catch (Exception e) {
            log.error("Lỗi tạo phiếu mang về: ", e);
            if (committed) {
                // đã commit MySQL: không hoàn kho, không xoá khoá, không báo lỗi "chưa thu tiền"
                return Result.error(500, "Đơn đã tạo nhưng có lỗi sau khi lưu, vui lòng kiểm tra lại");
            }
            if (stockReduced) {
                try {
                    Result restoreRes = productFeign.restoreInventories(stock);
                    if (restoreRes == null || restoreRes.getCode() == null || restoreRes.getCode() != 200) {
                        log.error("Hoàn kho thất bại cho {}: {}", stock, restoreRes);
                    }
                } catch (Exception restoreErr) {
                    log.error("Không hoàn được kho sau khi tạo phiếu mang về lỗi: {}", restoreErr.getMessage());
                }
            }
            redisCache.deleteObject(reqKey);
            if (e instanceof IllegalStateException) {
                return Result.error(500, e.getMessage());
            }
            return Result.error(500, "Không tạo được đơn, chưa thu tiền");
        }
    }

    @Override
    public Result handover(Integer ticketNo) {
        Long shopId = getShopId();
        if (shopId == null || shopId <= 0) {
            return Result.error(400, "Thiếu shopId");
        }
        if (ticketNo == null || ticketNo <= 0) {
            return Result.error(400, "Số phiếu không hợp lệ");
        }
        long tableKey = -ticketNo;
        String infoKey = ORDERINFO + ":" + shopId + ":" + tableKey;
        Map<String, Object> map = redisCache.getAllHash(infoKey);
        if (map == null || map.isEmpty() || map.get("id") == null) {
            return Result.error(404, "Phiếu MV-" + ticketNo + " không còn");
        }
        redisCache.deleteObject(infoKey);
        redisCache.deleteObject(ORDER_ITEM + ":" + shopId + ":" + tableKey);
        String orderId = map.get("id").toString();
        publish(shopId, tableKey, orderId, BigDecimal.ZERO, "HANDOVER");
        audit(shopId, orderId, "TAKEAWAY_HANDOVER", ticketNo, null);
        return Result.success();
    }

    private static Result validateItems(List<TakeawayItemDto> items) {
        if (items == null || items.isEmpty()) {
            return Result.error(400, "Chưa chọn món nào");
        }
        for (TakeawayItemDto it : items) {
            if (it == null || it.getProductId() == null) {
                return Result.error(400, "Thiếu món cần thêm");
            }
            int qty = it.getQuantity() != null ? it.getQuantity() : 1;
            if (qty < 1 || qty > MAX_QUANTITY) {
                return Result.error(400, "Số lượng phải từ 1 đến " + MAX_QUANTITY);
            }
        }
        return null;
    }

    private Result priceLines(Long shopId, List<TakeawayItemDto> items) {
        List<TakeawayQuoteLineVo> lines = new ArrayList<>();
        BigDecimal total = BigDecimal.ZERO;
        for (TakeawayItemDto it : items) {
            Result res = productFeign.priceQuote(new PriceQuoteDto(shopId, it.getProductId(), it.getSpecOptionIds()));
            if (res == null || res.getCode() == null || res.getCode() != 200 || res.getData() == null) {
                return res != null && res.getCode() != null && res.getCode() != 200
                        ? res : Result.error(500, "Không lấy được giá món, vui lòng thử lại");
            }
            PriceQuoteVo q = JSON.parseObject(JSON.toJSONString(res.getData()), PriceQuoteVo.class);
            int qty = it.getQuantity() != null ? it.getQuantity() : 1;
            BigDecimal lineTotal = q.getPrice().multiply(BigDecimal.valueOf(qty));
            lines.add(new TakeawayQuoteLineVo(q.getProductId(), q.getName(), q.getSortId(), q.getPicture(),
                    q.getPropsText(), it.getSpecOptionIds(), q.getPrice(), qty, lineTotal));
            total = total.add(lineTotal);
        }
        return Result.success(new TakeawayQuoteVo(lines, total));
    }

    private static List<OrderItem> toItems(TakeawayQuoteVo quote, Long shopId, String orderId, int status) {
        List<OrderItem> list = new ArrayList<>();
        for (TakeawayQuoteLineVo l : quote.getLines()) {
            OrderItem item = new OrderItem();
            item.setProductId(l.getProductId());
            item.setName(l.getName());
            item.setSortId(l.getSortId());
            item.setPicture(l.getPicture());
            item.setPrice(l.getPrice());
            item.setPropsText(l.getPropsText());
            item.setQuantity(l.getQuantity());
            item.setStatus(status);
            item.setShopId(shopId);
            item.setOrderId(orderId);
            list.add(item);
        }
        return list;
    }

    private void publish(Long shopId, long tableKey, String orderId, BigDecimal payAmount, String op) {
        JSONObject msg = new JSONObject();
        msg.put("shopId", shopId);
        msg.put("tableId", String.valueOf(tableKey));
        msg.put("orderId", orderId);
        msg.put("op", op);
        msg.put("version", 1L);
        msg.put("payAmount", payAmount);
        msg.put("payosCancelled", false);
        redisCache.convertAndSend("order_edited", msg.toJSONString());
    }

    private void audit(Long shopId, String orderId, String action, int ticketNo, BigDecimal amount) {
        try {
            Map<String, Object> detail = new LinkedHashMap<>();
            detail.put("ticketNo", ticketNo);
            if (amount != null) {
                detail.put("payAmount", amount);
            }
            String actor = (SecurityUtils.getLoginUser() != null && SecurityUtils.getLoginUser().getLoginVo() != null
                    && SecurityUtils.getLoginUser().getLoginVo().getPhone() != null)
                    ? SecurityUtils.getLoginUser().getLoginVo().getPhone() : "Thu ngân";
            AuditLogReqDto dto = AuditLogReqDto.builder()
                    .shopId(shopId)
                    .merchantId(SecurityUtils.getUserId())
                    .actorName(actor)
                    .actorType(SecurityUtils.getUserType() != null ? SecurityUtils.getUserType() : 2)
                    .action(action)
                    .targetType("order")
                    .targetId(orderId)
                    .detail(detail)
                    .result("SUCCESS")
                    .build();
            // giống OrderEditServiceImpl: chuyển classloader của request sang luồng ForkJoinPool (fat jar)
            ClassLoader requestClassLoader = Thread.currentThread().getContextClassLoader();
            CompletableFuture.runAsync(() -> {
                ClassLoader previous = Thread.currentThread().getContextClassLoader();
                Thread.currentThread().setContextClassLoader(requestClassLoader);
                try {
                    systemFeign.recordInternalAudit(dto);
                } catch (Exception err) {
                    log.error("Lỗi gửi audit log {} qua Feign: {}", action, err.getMessage());
                } finally {
                    Thread.currentThread().setContextClassLoader(previous);
                }
            });
        } catch (Exception e) {
            log.error("Lỗi chuẩn bị audit log {}: {}", action, e.getMessage());
        }
    }
}

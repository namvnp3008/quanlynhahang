package com.linmour.order.service.impl;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.linmour.order.feign.ProductFeign;
import com.linmour.order.feign.SystemFeign;
import com.linmour.order.pojo.Do.OrderInfo;
import com.linmour.order.pojo.Do.OrderItem;
import com.linmour.order.pojo.Dto.OrderEditReqDto;
import com.linmour.order.pojo.Dto.OrderEditRespDto;
import com.linmour.order.service.OrderEditService;
import com.linmour.order.service.PayosPaymentService;
import com.linmour.product.pojo.Dto.PriceQuoteDto;
import com.linmour.product.pojo.Dto.PriceQuoteVo;
import com.linmour.product.pojo.Dto.ReduceInventoryDto;
import com.linmour.security.dtos.Result;
import com.linmour.security.utils.RedisCache;
import com.linmour.security.utils.SecurityUtils;
import com.linmour.system.pojo.Dto.AuditLogReqDto;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.math.BigDecimal;
import java.util.*;
import java.util.concurrent.CompletableFuture;

import static com.linmour.order.constants.OrderConstant.ORDERINFO;
import static com.linmour.order.constants.OrderConstant.ORDER_ITEM;
import static com.linmour.security.utils.SecurityUtils.getShopId;

/**
 * OE-2: Sửa đơn đang mở:
 * - khoá theo thứ tự lock:order (dùng chung với đặt món qua WS) rồi lock:checkout (dùng chung với thanh toán)
 * - kiểm version chống sửa đè, giá lấy từ linmour-product, trừ / hoàn kho trước khi ghi Redis
 * - tính lại payAmount = Σ price × quantity, huỷ link PayOS PENDING, phát order_edited, ghi audit ORDER_EDIT
 */
@Slf4j
@Service
public class OrderEditServiceImpl implements OrderEditService {

    static final int MAX_QUANTITY = 99;

    private enum Op { ADD, QTY, REMOVE }

    @Resource
    private RedisCache redisCache;

    @Resource
    private RedissonClient redissonClient;

    @Resource
    private ProductFeign productFeign;

    @Resource
    private SystemFeign systemFeign;

    @Resource
    private PayosPaymentService payosPaymentService;

    @Override
    public Result addItem(Long tableId, OrderEditReqDto req) {
        return edit(Op.ADD, tableId, -1, req);
    }

    @Override
    public Result updateItemQuantity(Long tableId, int index, OrderEditReqDto req) {
        return edit(Op.QTY, tableId, index, req);
    }

    @Override
    public Result removeItem(Long tableId, int index, OrderEditReqDto req) {
        return edit(Op.REMOVE, tableId, index, req);
    }

    private Result edit(Op op, Long tableId, int index, OrderEditReqDto req) {
        Long shopId = getShopId();
        if (shopId == null || shopId <= 0) {
            return Result.error(400, "Thiếu shopId");
        }
        if (tableId == null || tableId <= 0) {
            return Result.error(400, "Thiếu tableId");
        }
        if (req == null || req.getVersion() == null) {
            return Result.error(400, "Thiếu phiên bản đơn, vui lòng tải lại");
        }
        String orderInfoKey = ORDERINFO + ":" + shopId + ":" + tableId;
        String orderItemKey = ORDER_ITEM + ":" + shopId + ":" + tableId;

        RLock orderLock = redissonClient.getLock("lock:order:" + shopId + ":" + tableId);
        RLock checkoutLock = redissonClient.getLock("lock:checkout:" + shopId + ":" + tableId);
        orderLock.lock();
        checkoutLock.lock();
        try {
            Map<String, Object> map = redisCache.getAllHash(orderInfoKey);
            if (map == null || map.isEmpty() || map.get("id") == null) {
                return Result.error(404, "Bàn này không còn đơn đang mở");
            }
            long currentVersion = parseLong(map.get("version"));
            if (req.getVersion() != currentVersion) {
                return Result.error(409, "Đơn vừa thay đổi, đã tải lại");
            }
            String orderId = map.get("id").toString();
            BigDecimal amountBefore = parseAmount(map.get("payAmount"));

            List<Object> cacheList = redisCache.getCacheList(orderItemKey);
            List<OrderItem> items = cacheList != null
                    ? new ArrayList<>(JSONObject.parseArray(JSONObject.toJSONString(cacheList), OrderItem.class))
                    : new ArrayList<>();

            Map<String, Object> detail = new LinkedHashMap<>();
            detail.put("tableId", tableId);
            detail.put("orderId", orderId);
            detail.put("op", op.name());

            Result failure;
            switch (op) {
                case ADD:
                    failure = applyAdd(shopId, orderId, items, req, detail);
                    break;
                case QTY:
                    failure = applyQuantity(items, index, req, detail);
                    break;
                default:
                    failure = applyRemove(items, index, req, detail);
            }
            if (failure != null) {
                return failure;
            }

            BigDecimal amountAfter = BigDecimal.ZERO;
            for (OrderItem it : items) {
                BigDecimal price = it.getPrice() != null ? it.getPrice() : BigDecimal.ZERO;
                int qty = it.getQuantity() != null ? it.getQuantity() : 1;
                amountAfter = amountAfter.add(price.multiply(BigDecimal.valueOf(qty)));
            }
            long newVersion = currentVersion + 1;
            redisCache.deleteObject(orderItemKey);
            if (!items.isEmpty()) {
                redisCache.setCacheList(orderItemKey, items);
            }
            redisCache.setHashValue(orderInfoKey, "payAmount", amountAfter);
            redisCache.setHashValue(orderInfoKey, "version", newVersion);

            boolean payosCancelled = false;
            if (amountAfter.compareTo(amountBefore) != 0) {
                try {
                    payosCancelled = payosPaymentService.cancelPendingLinksForTable(shopId, tableId);
                } catch (Exception e) {
                    log.warn("Không huỷ được link PayOS khi sửa đơn bàn {}: {}", tableId, e.getMessage());
                }
            }

            JSONObject msg = new JSONObject();
            msg.put("shopId", shopId);
            msg.put("tableId", String.valueOf(tableId));
            msg.put("orderId", orderId);
            msg.put("version", newVersion);
            msg.put("payAmount", amountAfter);
            msg.put("payosCancelled", payosCancelled);
            redisCache.convertAndSend("order_edited", msg.toJSONString());

            detail.put("payAmountBefore", amountBefore);
            detail.put("payAmountAfter", amountAfter);
            recordAudit(shopId, orderId, detail);

            OrderInfo orderInfo = JSON.parseObject(JSON.toJSONString(redisCache.getAllHash(orderInfoKey)), OrderInfo.class);
            return Result.success(new OrderEditRespDto(orderInfo, items, payosCancelled));
        } catch (Exception e) {
            log.error("Lỗi sửa đơn bàn {}: ", tableId, e);
            return Result.error(500, "Lỗi sửa đơn, vui lòng thử lại");
        } finally {
            if (checkoutLock.isHeldByCurrentThread()) {
                checkoutLock.unlock();
            }
            if (orderLock.isHeldByCurrentThread()) {
                orderLock.unlock();
            }
        }
    }

    private Result applyAdd(Long shopId, String orderId, List<OrderItem> items, OrderEditReqDto req, Map<String, Object> detail) {
        if (req.getProductId() == null) {
            return Result.error(400, "Thiếu món cần thêm");
        }
        int qty = req.getQuantity() != null ? req.getQuantity() : 1;
        if (qty < 1 || qty > MAX_QUANTITY) {
            return Result.error(400, "Số lượng phải từ 1 đến " + MAX_QUANTITY);
        }
        Result quoteRes = productFeign.priceQuote(new PriceQuoteDto(shopId, req.getProductId(), req.getSpecOptionIds()));
        if (quoteRes == null || quoteRes.getCode() == null || quoteRes.getCode() != 200 || quoteRes.getData() == null) {
            return quoteRes != null && quoteRes.getCode() != null && quoteRes.getCode() != 200
                    ? quoteRes : Result.error(500, "Không lấy được giá món, vui lòng thử lại");
        }
        PriceQuoteVo quote = JSON.parseObject(JSON.toJSONString(quoteRes.getData()), PriceQuoteVo.class);
        Result reduceRes = productFeign.reduceInventories(Collections.singletonList(new ReduceInventoryDto(req.getProductId(), qty)));
        if (reduceRes == null || reduceRes.getCode() == null || reduceRes.getCode() != 200) {
            return reduceRes != null ? reduceRes : Result.error(500, "Lỗi kiểm tra tồn kho món");
        }
        OrderItem item = new OrderItem();
        item.setProductId(quote.getProductId());
        item.setName(quote.getName());
        item.setSortId(quote.getSortId());
        item.setPicture(quote.getPicture());
        item.setPrice(quote.getPrice());
        item.setPropsText(quote.getPropsText());
        item.setQuantity(qty);
        item.setStatus(0);
        item.setShopId(shopId);
        item.setOrderId(orderId);
        items.add(item);
        detail.put("item", describe(item));
        detail.put("after", qty);
        return null;
    }

    private Result applyQuantity(List<OrderItem> items, int index, OrderEditReqDto req, Map<String, Object> detail) {
        if (index < 0 || index >= items.size()) {
            return Result.error(400, "Món không tồn tại trong đơn");
        }
        Integer newQty = req.getQuantity();
        if (newQty == null || newQty < 1 || newQty > MAX_QUANTITY) {
            return Result.error(400, "Số lượng phải từ 1 đến " + MAX_QUANTITY);
        }
        OrderItem item = items.get(index);
        int oldQty = item.getQuantity() != null ? item.getQuantity() : 1;
        int delta = newQty - oldQty;
        if (delta == 0) {
            return Result.error(400, "Số lượng không thay đổi");
        }
        if (delta < 0 && needsReason(item) && StringUtils.isBlank(req.getReason())) {
            return Result.error(400, "Cần chọn lý do");
        }
        Result stockRes = delta > 0
                ? productFeign.reduceInventories(Collections.singletonList(new ReduceInventoryDto(item.getProductId(), delta)))
                : productFeign.restoreInventories(Collections.singletonList(new ReduceInventoryDto(item.getProductId(), -delta)));
        if (stockRes == null || stockRes.getCode() == null || stockRes.getCode() != 200) {
            return delta > 0 && stockRes != null ? stockRes : Result.error(500, "Không cập nhật được kho, vui lòng thử lại");
        }
        item.setQuantity(newQty);
        detail.put("item", describe(item));
        detail.put("before", oldQty);
        detail.put("after", newQty);
        putReason(detail, req);
        return null;
    }

    private Result applyRemove(List<OrderItem> items, int index, OrderEditReqDto req, Map<String, Object> detail) {
        if (index < 0 || index >= items.size()) {
            return Result.error(400, "Món không tồn tại trong đơn");
        }
        OrderItem item = items.get(index);
        if (needsReason(item) && StringUtils.isBlank(req.getReason())) {
            return Result.error(400, "Cần chọn lý do");
        }
        int qty = item.getQuantity() != null ? item.getQuantity() : 1;
        Result stockRes = productFeign.restoreInventories(Collections.singletonList(new ReduceInventoryDto(item.getProductId(), qty)));
        if (stockRes == null || stockRes.getCode() == null || stockRes.getCode() != 200) {
            return Result.error(500, "Không cập nhật được kho, vui lòng thử lại");
        }
        items.remove(index);
        detail.put("item", describe(item));
        detail.put("before", qty);
        detail.put("after", 0);
        putReason(detail, req);
        return null;
    }

    /** Món đang làm (1) hoặc đã lên (2) thì giảm / xoá phải có lý do */
    private static boolean needsReason(OrderItem item) {
        return item.getStatus() != null && (item.getStatus() == 1 || item.getStatus() == 2);
    }

    private static void putReason(Map<String, Object> detail, OrderEditReqDto req) {
        if (StringUtils.isNotBlank(req.getReason())) {
            detail.put("reason", req.getReason().trim());
        }
    }

    private static Map<String, Object> describe(OrderItem item) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("productId", item.getProductId());
        m.put("name", item.getName());
        m.put("propsText", item.getPropsText());
        m.put("price", item.getPrice());
        m.put("status", item.getStatus());
        return m;
    }

    private static long parseLong(Object value) {
        if (value == null) {
            return 0L;
        }
        try {
            return Long.parseLong(value.toString().trim());
        } catch (NumberFormatException e) {
            return 0L;
        }
    }

    private static BigDecimal parseAmount(Object value) {
        if (value == null) {
            return BigDecimal.ZERO;
        }
        try {
            return new BigDecimal(value.toString().trim());
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }

    private void recordAudit(Long shopId, String orderId, Map<String, Object> detail) {
        try {
            String actor = (SecurityUtils.getLoginUser() != null && SecurityUtils.getLoginUser().getLoginVo() != null
                    && SecurityUtils.getLoginUser().getLoginVo().getPhone() != null)
                    ? SecurityUtils.getLoginUser().getLoginVo().getPhone() : "Thu ngân";
            AuditLogReqDto auditDto = AuditLogReqDto.builder()
                    .shopId(shopId)
                    .merchantId(SecurityUtils.getUserId())
                    .actorName(actor)
                    .actorType(SecurityUtils.getUserType() != null ? SecurityUtils.getUserType() : 2)
                    .action("ORDER_EDIT")
                    .targetType("order")
                    .targetId(orderId)
                    .detail(detail)
                    .result("SUCCESS")
                    .build();
            // Luồng ForkJoinPool không có classloader của Spring Boot (fat jar): lần đầu khởi tạo Feign client
            // trên luồng đó sẽ lỗi "Could not find class ...OnPropertyCondition", nên chuyển classloader của request sang
            ClassLoader requestClassLoader = Thread.currentThread().getContextClassLoader();
            CompletableFuture.runAsync(() -> {
                ClassLoader previous = Thread.currentThread().getContextClassLoader();
                Thread.currentThread().setContextClassLoader(requestClassLoader);
                try {
                    systemFeign.recordInternalAudit(auditDto);
                } catch (Exception err) {
                    log.error("Lỗi gửi audit log ORDER_EDIT qua Feign: {}", err.getMessage());
                } finally {
                    Thread.currentThread().setContextClassLoader(previous);
                }
            });
        } catch (Exception auditEx) {
            log.error("Lỗi chuẩn bị audit log ORDER_EDIT: {}", auditEx.getMessage());
        }
    }
}

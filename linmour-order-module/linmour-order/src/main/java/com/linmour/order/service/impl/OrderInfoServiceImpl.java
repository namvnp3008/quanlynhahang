package com.linmour.order.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.util.ObjectUtil;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.linmour.mq.KafkaProducer;
import com.linmour.order.feign.SystemFeign;
import com.linmour.order.feign.RestaurantFeign;
import org.apache.commons.lang3.StringUtils;
import com.linmour.order.pojo.Dto.*;
import com.linmour.product.pojo.Dto.ReduceInventoryDto;
import com.linmour.security.dtos.Result;
import com.linmour.security.utils.RedisCache;
import com.linmour.order.convert.OrderInfoConvert;
import com.linmour.order.feign.ProductFeign;
import com.linmour.order.mapper.OrderInfoMapper;
import com.linmour.order.mapper.OrderItemMapper;
import com.linmour.order.pojo.Do.OrderInfo;
import com.linmour.order.pojo.Do.OrderItem;
import com.linmour.order.service.OrderInfoService;
import com.linmour.order.service.OrderItemService;
import com.linmour.order.utils.IdGenerateUtil;

import com.linmour.system.pojo.Do.Merchant;
import com.linmour.system.pojo.Do.Shop;
import com.linmour.system.pojo.Dto.AuditLogReqDto;
import com.linmour.security.utils.SecurityUtils;
import com.linmour.security.exception.CustomException;
import com.linmour.security.exception.enums.AppHttpCodeEnum;
import lombok.extern.slf4j.Slf4j;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

import static com.linmour.security.exception.enums.AppHttpCodeEnum.ORDER_ITEM_NOT_NULL;
import static com.linmour.security.utils.SecurityUtils.getShopId;
import static com.linmour.order.constants.OrderConstant.*;


/**
 * @author linmour
 * @description 针对表【order_info】的数据库操作Service实现
 * @createDate 2023-08-16 15:25:38
 */
@Service
@Slf4j
public class OrderInfoServiceImpl extends ServiceImpl<OrderInfoMapper, OrderInfo>
        implements OrderInfoService {

    @Resource
    private OrderInfoMapper orderInfoMapper;
    @Resource
    private OrderItemService orderItemService;
    @Resource
    private OrderItemMapper orderItemMapper;
    @Resource
    private KafkaProducer kafkaProducer;
    @Resource
    private ProductFeign productFeign;
    @Resource
    private RedisCache redisCache;
    @Resource
    private RedissonClient redissonClient;
    @Resource
    private SystemFeign systemFeign;
    @Resource
    private RestaurantFeign restaurantFeign;


    @Override
    public Result createOrder(CreateOrderDto createOrderDto) {
        if (createOrderDto == null) {
            return Result.error(AppHttpCodeEnum.PARAM_ERROR.getCode(), "Dữ liệu đơn hàng không hợp lệ");
        }
        if (createOrderDto.getTableId() == null) {
            return Result.error(AppHttpCodeEnum.PARAM_ERROR.getCode(), "Thiếu tableId");
        }
        Long currentShopId = getShopId();
        Long shopId = (currentShopId != null && currentShopId > 0) ? currentShopId : createOrderDto.getShopId();
        if (shopId == null || shopId <= 0) {
            return Result.error(AppHttpCodeEnum.PARAM_ERROR.getCode(), "Thiếu shopId");
        }
        if (createOrderDto.getOrderItems() == null || createOrderDto.getOrderItems().isEmpty())
            return Result.error(ORDER_ITEM_NOT_NULL);
        OrderInfo orderInfo = new OrderInfo();
        String orderId;
        String tableId = createOrderDto.getTableId().toString();
        String orderInfoKey = ORDERINFO + ":" + shopId + ":" + tableId;
        String orderItemKey = ORDER_ITEM + ":" + shopId + ":" + tableId;

        boolean wasNewOrder = ObjectUtil.isEmpty(redisCache.getAllHash(orderInfoKey));
        BigDecimal previousAmount = BigDecimal.ZERO;
        String previousRemark = "";
        if (!wasNewOrder) {
            Object prevAmt = redisCache.getHashValue(orderInfoKey, "payAmount");
            previousAmount = prevAmt != null ? new BigDecimal(prevAmt.toString()) : BigDecimal.ZERO;
            Object rem = redisCache.getHashValue(orderInfoKey, "remark");
            previousRemark = rem != null ? rem.toString() : "";
        }

        //缓存中没有本桌订单信息
        if (wasNewOrder) {
            //创建订单基本信息
            orderId = String.valueOf(IdGenerateUtil.get().nextId());
            orderInfo.setId(orderId);
            orderInfo.setTableId(Long.parseLong(tableId));
            orderInfo.setPayAmount(createOrderDto.getAmount());
            orderInfo.setShopId(shopId);
            orderInfo.setRemark(createOrderDto.getRemark());
            orderInfo.setCreateTime(LocalDateTime.now());
            //转为map批量缓存订单信息
            Map<String, Object> ordereInfoMap = BeanUtil.beanToMap(orderInfo);
            redisCache.setHashValues(orderInfoKey, ordereInfoMap);
        } else {
            orderId = redisCache.getHashValue(orderInfoKey, "id").toString();
            //原有订单改变金额和备注
            redisCache.setHashValue(orderInfoKey, "remark", createOrderDto.getRemark());
            redisCache.setHashValue(orderInfoKey, "payAmount", createOrderDto.getAmount().add(new BigDecimal(redisCache.getHashValue(orderInfoKey, "payAmount").toString())));
            orderInfo.setId(orderId);
            orderInfo.setTableId(Long.parseLong(redisCache.getHashValue(orderInfoKey, "tableId").toString()));
            orderInfo.setPayAmount(new BigDecimal(redisCache.getHashValue(orderInfoKey, "payAmount").toString()));
            orderInfo.setShopId(shopId);
            orderInfo.setRemark(redisCache.getHashValue(orderInfoKey, "remark").toString());
        }
        createOrderDto.setOrderId(orderId);
        List<OrderItem> orderItems = createOrderDto.getOrderItems();
        if (orderItems != null) {
            orderItems.forEach(item -> {
                if (item.getStatus() == null) {
                    item.setStatus(0);
                }
            });
        }
        //扣减库存 (Q8 / F3: trừ kho theo số lượng, kiểm tra hết hàng)
        List<ReduceInventoryDto> reduceDtos = orderItems.stream()
                .map(item -> new ReduceInventoryDto(item.getProductId(), item.getQuantity() != null ? item.getQuantity() : 1))
                .collect(Collectors.toList());
        Result reduceResult = productFeign.reduceInventories(reduceDtos);
        if (reduceResult != null && reduceResult.getCode() != 200) {
            log.warn("createOrder aborted: inventory reduction failed: {}", reduceResult.getMsg());
            if (wasNewOrder) {
                redisCache.deleteObject(orderInfoKey);
            } else {
                redisCache.setHashValue(orderInfoKey, "payAmount", previousAmount);
                redisCache.setHashValue(orderInfoKey, "remark", previousRemark);
            }
            return reduceResult;
        }


        //推送到mq，由webstock推送给餐厅订单来了
        Result<Object> result1 = new Result<>();
        SeatOrderDto seatOrderDto = new SeatOrderDto(orderInfo.getId(), orderInfo.getPayAmount().toString(), orderInfo.getTableId().toString(), orderItems);
        result1.setData(seatOrderDto);
//            producerMq.orderCreationCompleted(result1);
        redisCache.setCacheList(orderItemKey, orderItems);

        return result1;

    }


    @Override
    public Result checkout(CheckoutDto checkoutDto) {
        if (checkoutDto == null || checkoutDto.getTableId() == null) {
            return Result.error(AppHttpCodeEnum.PARAM_ERROR.getCode(), "Thiếu tableId");
        }
        Long shopId = getShopId();
        if (shopId == null || shopId <= 0) {
            return Result.error(AppHttpCodeEnum.PARAM_ERROR.getCode(), "Thiếu shopId");
        }
        String tableId = checkoutDto.getTableId().toString();
        String orderInfoKey = ORDERINFO + ":" + shopId + ":" + tableId;
        String orderItemKey = ORDER_ITEM + ":" + shopId + ":" + tableId;
        RLock lock = redissonClient.getLock("lock:checkout:" + shopId + ":" + tableId);
        lock.lock();
        try {
            // B-7: Kiểm tra đơn hàng có thực sự tồn tại trong Redis không trước khi ghi nhận thanh toán
            Map<String, Object> map = redisCache.getAllHash(orderInfoKey);
            if (ObjectUtil.isEmpty(map) || map.get("id") == null) {
                return Result.error(AppHttpCodeEnum.PARAM_ERROR.getCode(), "Không tìm thấy đơn hàng cho bàn này");
            }

            // Cập nhật trạng thái thanh toán trong Redis
            redisCache.setHashValue(orderInfoKey, "payType", checkoutDto.getPayType());
            redisCache.setHashValue(orderInfoKey, "payStatus", PAYMENT);
            if (checkoutDto.getPayType() == null || checkoutDto.getPayType() != 4) {
                redisCache.setHashValue(orderInfoKey, "openid", checkoutDto.getOpenid());
            }

            // Đọc lại hash map sau cập nhật để parse ra OrderInfo
            map = redisCache.getAllHash(orderInfoKey);
            String s = JSON.toJSONString(map);
            OrderInfo orderInfo = JSON.parseObject(s, OrderInfo.class);
            if (orderInfo == null || orderInfo.getId() == null) {
                return Result.error(AppHttpCodeEnum.PARAM_ERROR.getCode(), "Dữ liệu đơn hàng không hợp lệ");
            }
            if (orderInfo.getShopId() == null) {
                orderInfo.setShopId(shopId);
            }
            if (orderInfo.getTableId() == null) {
                try {
                    orderInfo.setTableId(Long.valueOf(tableId));
                } catch (Exception ignored) {}
            }
            orderInfo.setOpenid(checkoutDto.getOpenid());
            orderInfoMapper.insert(orderInfo);
            List<Object> cacheList = redisCache.getCacheList(orderItemKey);
            List<OrderItem> list = cacheList != null ? JSONObject.parseArray(JSONObject.toJSONString(cacheList), OrderItem.class) : new ArrayList<>();
            list.forEach(m -> {
                m.setOrderId(orderInfo.getId());
                m.setStatus(1);
            });
            if (!list.isEmpty()) {
                orderItemService.saveBatch(list);
            }
            // Tiến hành Kafka stream
            kafkaProducer.originalOrder(new OrderAllDto(orderInfo, list));
            // Xóa cache
            redisCache.deleteObject(orderInfoKey);
            redisCache.deleteObject(orderItemKey);

            // B6 / BUG-TY-1-B: Publish table_paid to Redis Pub/Sub with full order details
            JSONObject paidMsg = new JSONObject();
            Long currentShopId = shopId != null ? shopId : orderInfo.getShopId();
            paidMsg.put("shopId", currentShopId);
            paidMsg.put("tableId", tableId);
            paidMsg.put("orderId", String.valueOf(orderInfo.getId()));
            paidMsg.put("payType", checkoutDto.getPayType() != null ? checkoutDto.getPayType() : 4);
            paidMsg.put("payAmount", orderInfo.getPayAmount() != null ? orderInfo.getPayAmount() : BigDecimal.ZERO);
            paidMsg.put("tableName", resolveTableName(currentShopId, tableId));
            paidMsg.put("shopName", resolveShopName(currentShopId));
            paidMsg.put("paidAt", java.time.LocalDateTime.now().format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")));

            com.alibaba.fastjson.JSONArray itemsArray = new com.alibaba.fastjson.JSONArray();
            if (list != null) {
                for (OrderItem it : list) {
                    JSONObject itemObj = new JSONObject();
                    itemObj.put("name", it.getName() != null ? it.getName() : "");
                    itemObj.put("quantity", it.getQuantity() != null ? it.getQuantity() : 1);
                    itemObj.put("price", it.getPrice() != null ? it.getPrice() : BigDecimal.ZERO);
                    itemObj.put("propsText", it.getPropsText() != null ? it.getPropsText() : "");
                    itemsArray.add(itemObj);
                }
            }
            paidMsg.put("items", itemsArray);

            log.info("OrderInfoServiceImpl publishing table_paid: {}", paidMsg.toJSONString());
            redisCache.convertAndSend("table_paid", paidMsg.toJSONString());

            // S3: Audit CHECKOUT
            try {
                Map<String, Object> auditDetail = new HashMap<>();
                auditDetail.put("tableId", tableId);
                auditDetail.put("payType", checkoutDto.getPayType() != null ? checkoutDto.getPayType() : 4);
                auditDetail.put("amount", orderInfo.getPayAmount());
                auditDetail.put("orderId", orderInfo.getId());

                Long merchantId = SecurityUtils.getUserId();
                String actor = (SecurityUtils.getLoginUser() != null && SecurityUtils.getLoginUser().getLoginVo() != null
                        && SecurityUtils.getLoginUser().getLoginVo().getPhone() != null)
                        ? SecurityUtils.getLoginUser().getLoginVo().getPhone() : "Khách hàng / Thu ngân";
                Integer actorType = SecurityUtils.getUserType() != null ? SecurityUtils.getUserType() : 2;

                AuditLogReqDto auditDto = AuditLogReqDto.builder()
                        .shopId(currentShopId)
                        .merchantId(merchantId)
                        .actorName(actor)
                        .actorType(actorType)
                        .action("CHECKOUT")
                        .targetType("order")
                        .targetId(String.valueOf(orderInfo.getId()))
                        .detail(auditDetail)
                        .result("SUCCESS")
                        .build();

                java.util.concurrent.CompletableFuture.runAsync(() -> {
                    try {
                        systemFeign.recordInternalAudit(auditDto);
                    } catch (Exception err) {
                        log.error("Lỗi gửi audit log CHECKOUT qua Feign: {}", err.getMessage());
                    }
                });
            } catch (Exception auditEx) {
                log.error("Lỗi chuẩn bị audit log CHECKOUT: {}", auditEx.getMessage());
            }
        } catch (Exception e) {
            log.error("Lỗi xử lý thanh toán checkout: ", e);
            return Result.error("Lỗi xử lý thanh toán");
        } finally {
            if (lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
        return Result.success();
    }

    @Override
    public OrderAllDto GetCurrentOrderInfo(Long tableId) {
        OrderAllDto orderAllDto = new OrderAllDto();

        String orderInfoKey = ORDERINFO + ":" + getShopId() + ":" + tableId;
        String orderItemKey = ORDER_ITEM + ":" + getShopId() + ":" + tableId;
        Map<String, Object> map = redisCache.getAllHash(orderInfoKey);
        if (map.size() == 0) {
            return orderAllDto;
        }
        String s = JSON.toJSONString(map);
        OrderInfo orderInfo = JSON.parseObject(s, OrderInfo.class);

        //找到相对应的所有菜品id
        List<Object> cacheList = redisCache.getCacheList(orderItemKey);
        List<OrderItem> orderItems = cacheList != null ? JSONObject.parseArray(JSONObject.toJSONString(cacheList), OrderItem.class) : new ArrayList<>();
        orderAllDto.setOrderInfo(orderInfo);
        orderAllDto.setOrderItems(orderItems);
        return orderAllDto;
    }

    @Override
    public Result changeOrder(OrderInfoDto orderInfoDto) {
        orderInfoMapper.updateById(OrderInfoConvert.IN.OrderInfoDtoToOrderInfo(orderInfoDto));
        return Result.success();
    }

    @Override
    public List<OrderAllDto> GetHistoryOrderList(Long tableId) {
        //找出本桌所有已支付订单
        List<OrderInfo> orderInfos = orderInfoMapper.selectList(new LambdaQueryWrapper<OrderInfo>()
                .eq(OrderInfo::getTableId, tableId)
                .eq(OrderInfo::getPayStatus, PAYMENT)
        );
        List<OrderAllDto> orderAllDtos = new ArrayList<>();

        orderInfos.forEach(m -> {
            OrderAllDto orderAllDto = new OrderAllDto();
            //这一桌已持久化的菜品
            List<OrderItem> list = orderItemMapper.selectList(new LambdaQueryWrapper<OrderItem>().eq(OrderItem::getOrderId, m.getId()));
            orderAllDto.setOrderInfo(m);
            orderAllDto.setOrderItems(list != null ? list : new ArrayList<>());
            orderAllDtos.add(orderAllDto);
        });
        Collections.reverse(orderAllDtos);
        return orderAllDtos;
    }

    @Override
    public OrderAllDto GetOrderInfoDetail(Long orderId) {
        OrderInfo orderInfo = orderInfoMapper.selectById(orderId);
        List<OrderItem> list = orderItemMapper.selectList(new LambdaQueryWrapper<OrderItem>().eq(OrderItem::getOrderId, orderId));
        OrderAllDto orderAllDto = new OrderAllDto();
        orderAllDto.setOrderInfo(orderInfo);
        orderAllDto.setOrderItems(list);
        return orderAllDto;
    }

    @Override
    public Result setOrderItemStatus(String tableId, Long index, Integer status) {
        if (status == null || (status != 0 && status != 1 && status != 2)) {
            return Result.error("Trạng thái không hợp lệ (chỉ chấp nhận 0: Chờ làm, 1: Đang làm, 2: Đã lên)");
        }
        Long shopId = getShopId();
        if (shopId == null || shopId == 0L) {
            return Result.error("Thiếu thông tin quán");
        }
        String orderItemKey = ORDER_ITEM + ":" + shopId + ":" + tableId;
        Object obj = redisCache.getListValue(orderItemKey, index);
        if (obj == null) {
            return Result.error("Không tìm thấy món ăn trong bàn");
        }
        OrderItem orderItem = JSONObject.parseObject(JSONObject.toJSONString(obj), OrderItem.class);
        orderItem.setStatus(status);
        redisCache.setListValue(orderItemKey, index, orderItem);

        // Đẩy tin qua Redis PubSub cho WebSocket broadcast đến bàn ăn
        JSONObject msg = new JSONObject();
        msg.put("shopId", shopId);
        msg.put("tableId", tableId);
        msg.put("index", index);
        msg.put("status", status);
        redisCache.convertAndSend("item_status", msg.toJSONString());
        return Result.success();
    }

    @Override
    public void updateOrderItemStatus(String tableId, Long index) {
        Long shopId = getShopId();
        if (shopId == null || shopId == 0L) {
            return;
        }
        String orderItemKey = ORDER_ITEM + ":" + shopId + ":" + tableId;
        Object obj = redisCache.getListValue(orderItemKey, index);
        if (obj == null) {
            return;
        }
        OrderItem orderItem = JSONObject.parseObject(JSONObject.toJSONString(obj), OrderItem.class);
        Integer currentStatus = orderItem.getStatus() == null ? 0 : orderItem.getStatus();
        // Quy ước: 0 = Chờ làm, 1 = Đang làm, 2 = Đã lên. Đảo: 0/1 thành 2, 2 thành 0.
        int newStatus = (currentStatus == 2) ? 0 : 2;
        orderItem.setStatus(newStatus);
        redisCache.setListValue(orderItemKey, index, orderItem);

        // Đẩy tin qua Redis PubSub cho WebSocket broadcast đến bàn ăn
        JSONObject msg = new JSONObject();
        msg.put("shopId", shopId);
        msg.put("tableId", tableId);
        msg.put("index", index);
        msg.put("status", newStatus);
        redisCache.convertAndSend("item_status", msg.toJSONString());
    }

    @Override
    public List<OrderAllDto> getOpenOrders() {
        Long shopId = getShopId();
        if (shopId == null || shopId <= 0) {
            throw new CustomException(400, "Vui lòng chọn quán ăn hợp lệ");
        }
        String pattern = ORDERINFO + ":" + shopId + ":*";
        Set<String> keys = redisCache.scan(pattern);
        if (keys == null || keys.isEmpty()) {
            return Collections.emptyList();
        }
        List<OrderAllDto> result = new ArrayList<>();
        for (String orderInfoKey : keys) {
            Map<String, Object> map = redisCache.getAllHash(orderInfoKey);
            if (map == null || map.isEmpty()) {
                continue;
            }
            String s = JSON.toJSONString(map);
            OrderInfo orderInfo = JSON.parseObject(s, OrderInfo.class);

            String tableId = orderInfoKey.substring(orderInfoKey.lastIndexOf(":") + 1);
            String orderItemKey = ORDER_ITEM + ":" + shopId + ":" + tableId;
            List<Object> cacheList = redisCache.getCacheList(orderItemKey);
            List<OrderItem> orderItems = cacheList != null
                    ? JSONObject.parseArray(JSONObject.toJSONString(cacheList), OrderItem.class)
                    : new ArrayList<>();

            result.add(new OrderAllDto(orderInfo, orderItems));
        }
        result.sort((a, b) -> {
            Long tA = a.getOrderInfo() != null && a.getOrderInfo().getTableId() != null ? a.getOrderInfo().getTableId() : 0L;
            Long tB = b.getOrderInfo() != null && b.getOrderInfo().getTableId() != null ? b.getOrderInfo().getTableId() : 0L;
            return tA.compareTo(tB);
        });
        return result;
    }

    @Override
    public List<OrderAllDto> GetOrderByShopId() {
        Long shopId = getShopId();
        if (shopId == null || shopId <= 0) {
            throw new CustomException(400, "Vui lòng chọn quán ăn hợp lệ");
        }
        List<OrderAllDto> orderAllDtos = new ArrayList<>();
        List<OrderInfo> orderInfos = orderInfoMapper.selectList(new LambdaQueryWrapper<OrderInfo>().eq(OrderInfo::getShopId, shopId));
        if (orderInfos == null || orderInfos.isEmpty()) {
            return Collections.emptyList();
        }
        List<String> orderIds = orderInfos.stream().map(OrderInfo::getId).collect(Collectors.toList());
        List<OrderItem> orderItems = orderIds.isEmpty() ? Collections.emptyList() :
                orderItemMapper.selectList(new LambdaQueryWrapper<OrderItem>().in(OrderItem::getOrderId, orderIds));

        orderInfos.forEach(m -> {
            orderAllDtos.add(new OrderAllDto(m, orderItems.stream().filter(n -> n.getOrderId().equals(m.getId())).collect(Collectors.toList())));
        });

        return orderAllDtos;
    }

    @Override
    public List<OrderInfoDto> getOrderPayAmount(OrderInfoPage orderInfoPage) {
        Integer userType = SecurityUtils.getUserType();
        Long shopId = getShopId();
        if (userType != null && userType.equals(1)) {
            // Platform admin có thể xem tất cả hoặc lọc theo orderInfoPage.getShopId()
        } else {
            if (shopId == null || shopId <= 0) {
                throw new CustomException(400, "Vui lòng chọn quán ăn hợp lệ");
            }
            orderInfoPage.setShopId(shopId);
        }
        LambdaQueryWrapper<OrderInfo> queryWrapper = new LambdaQueryWrapper<OrderInfo>()
                .eq(!ObjectUtil.isNull(orderInfoPage.getPayType()), OrderInfo::getPayType, orderInfoPage.getPayType());
        if (orderInfoPage.getShopId() != null && orderInfoPage.getShopId() > 0) {
            queryWrapper.eq(OrderInfo::getShopId, orderInfoPage.getShopId());
        }
        List<OrderInfo> orderInfos = orderInfoMapper.selectList(queryWrapper);
        List<OrderInfoDto> orderInfoDtos = BeanUtil.copyToList(orderInfos, OrderInfoDto.class);
        List<Shop> shopList = systemFeign.getShopByIds(orderInfos.stream().map(OrderInfo::getShopId).collect(Collectors.toList()));

        orderInfoDtos.forEach(m -> {
            shopList.forEach(n -> {
                if (m.getShopId().equals(n.getId())){
                    m.setCommission(m.getPayAmount().multiply(n.getFeeRate().divide(new BigDecimal("100"))));
                    log.debug("Shop fee rate: {}", n.getFeeRate().divide(new BigDecimal("100")));
                    m.setShopName(n.getName());
                }
            });
        });

        return orderInfoDtos;
    }

    @Override
    public Result getPlatformRevenue(String startDate, String endDate, Long shopId) {
        Integer userType = SecurityUtils.getUserType();
        if (userType == null || !userType.equals(1)) {
            throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
        }

        LambdaQueryWrapper<OrderInfo> wrapper = new LambdaQueryWrapper<>();
        if (shopId != null) {
            wrapper.eq(OrderInfo::getShopId, shopId);
        }
        if (startDate != null && !startDate.trim().isEmpty()) {
            LocalDateTime start = parseDateTime(startDate, false);
            if (start != null) {
                wrapper.ge(OrderInfo::getCreateTime, start);
            }
        }
        if (endDate != null && !endDate.trim().isEmpty()) {
            LocalDateTime end = parseDateTime(endDate, true);
            if (end != null) {
                wrapper.le(OrderInfo::getCreateTime, end);
            }
        }

        List<OrderInfo> orders = orderInfoMapper.selectList(wrapper);
        if (orders == null || orders.isEmpty()) {
            return Result.success(PlatformRevenueDto.builder()
                    .totalRevenue(BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP))
                    .totalCommission(BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP))
                    .orderCount(0L)
                    .shopBreakdown(Collections.emptyList())
                    .build());
        }

        List<Long> shopIds = orders.stream().map(OrderInfo::getShopId).filter(Objects::nonNull).distinct().collect(Collectors.toList());
        List<Shop> shops = (shopIds.isEmpty()) ? Collections.emptyList() : systemFeign.getShopByIds(shopIds);
        Map<Long, Shop> shopMap = shops != null
                ? shops.stream().collect(Collectors.toMap(Shop::getId, s -> s, (a, b) -> a))
                : Collections.emptyMap();

        Map<Long, List<OrderInfo>> ordersByShop = orders.stream()
                .filter(o -> o.getShopId() != null)
                .collect(Collectors.groupingBy(OrderInfo::getShopId));

        BigDecimal grandTotalRevenue = BigDecimal.ZERO;
        BigDecimal grandTotalCommission = BigDecimal.ZERO;
        long grandTotalOrders = orders.size();
        List<ShopRevenueDto> breakdown = new ArrayList<>();

        for (Map.Entry<Long, List<OrderInfo>> entry : ordersByShop.entrySet()) {
            Long sId = entry.getKey();
            List<OrderInfo> shopOrders = entry.getValue();
            Shop s = shopMap.get(sId);
            String shopName = (s != null && s.getName() != null) ? s.getName() : ("Quán #" + sId);
            BigDecimal feeRate = (s != null && s.getFeeRate() != null) ? s.getFeeRate() : BigDecimal.ZERO;

            BigDecimal shopRevenue = shopOrders.stream()
                    .map(o -> o.getPayAmount() != null ? o.getPayAmount() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            BigDecimal shopCommission = shopRevenue.multiply(feeRate)
                    .divide(new BigDecimal("100"), 2, RoundingMode.HALF_UP);

            breakdown.add(ShopRevenueDto.builder()
                    .shopId(sId)
                    .shopName(shopName)
                    .feeRate(feeRate)
                    .totalRevenue(shopRevenue.setScale(2, RoundingMode.HALF_UP))
                    .totalCommission(shopCommission)
                    .orderCount((long) shopOrders.size())
                    .build());

            grandTotalRevenue = grandTotalRevenue.add(shopRevenue);
            grandTotalCommission = grandTotalCommission.add(shopCommission);
        }

        breakdown.sort((a, b) -> b.getTotalRevenue().compareTo(a.getTotalRevenue()));

        PlatformRevenueDto dto = PlatformRevenueDto.builder()
                .totalRevenue(grandTotalRevenue.setScale(2, RoundingMode.HALF_UP))
                .totalCommission(grandTotalCommission.setScale(2, RoundingMode.HALF_UP))
                .orderCount(grandTotalOrders)
                .shopBreakdown(breakdown)
                .build();

        return Result.success(dto);
    }

    private String resolveTableName(Long shopId, String tableId) {
        if (StringUtils.isBlank(tableId)) {
            return "";
        }
        try {
            Long tid = Long.valueOf(tableId);
            Result res = restaurantFeign.getTable(tid, shopId);
            if (res != null && res.getData() != null) {
                JSONObject obj = (JSONObject) JSONObject.toJSON(res.getData());
                String name = obj.getString("name");
                if (StringUtils.isNotBlank(name)) {
                    return name;
                }
            }
        } catch (Exception e) {
            log.warn("Không thể lấy tên bàn từ restaurantFeign cho table {}: {}", tableId, e.getMessage());
        }
        try {
            return String.format("Bàn %02d", Integer.parseInt(tableId));
        } catch (Exception e) {
            return "Bàn " + tableId;
        }
    }

    private String resolveShopName(Long shopId) {
        if (shopId == null) {
            return "";
        }
        try {
            List<Shop> shops = systemFeign.getShopByIds(Collections.singletonList(shopId));
            if (shops != null && !shops.isEmpty() && shops.get(0) != null && StringUtils.isNotBlank(shops.get(0).getName())) {
                return shops.get(0).getName();
            }
        } catch (Exception e) {
            log.warn("Không thể lấy tên quán từ systemFeign cho shop {}: {}", shopId, e.getMessage());
        }
        return "";
    }

    private LocalDateTime parseDateTime(String str, boolean endOfDay) {
        if (str == null || str.trim().isEmpty()) {
            return null;
        }
        String clean = str.trim().replace("T", " ");
        if (clean.length() == 10) {
            clean += endOfDay ? " 23:59:59" : " 00:00:00";
        }
        try {
            return LocalDateTime.parse(clean, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        } catch (Exception e) {
            log.warn("Cannot parse date: {}", str);
            return null;
        }
    }
}





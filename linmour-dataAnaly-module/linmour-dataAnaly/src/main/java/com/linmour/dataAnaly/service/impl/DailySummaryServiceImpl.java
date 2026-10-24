package com.linmour.dataAnaly.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.linmour.dataAnaly.pojo.Do.OrderSummaryDay;
import com.linmour.dataAnaly.pojo.Do.OrderSummaryTimePeriod;
import com.linmour.dataAnaly.pojo.Do.ProductSummaryDay;
import com.linmour.dataAnaly.pojo.Dto.OrderItemRawDto;
import com.linmour.dataAnaly.pojo.Dto.OrderRawDto;
import com.linmour.dataAnaly.service.DailySummaryService;
import com.linmour.dataAnaly.service.OrderSummaryDayService;
import com.linmour.dataAnaly.service.OrderSummaryTimePeriodService;
import com.linmour.dataAnaly.service.ProductSummaryDayService;
import com.linmour.redisPub.RedisPublisher;
import com.linmour.security.utils.RedisCache;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.annotation.Resource;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.WeekFields;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
public class DailySummaryServiceImpl implements DailySummaryService {

    @Resource
    private RedisCache redisCache;

    @Resource
    private RedisPublisher redisPublisher;

    @Resource
    private OrderSummaryDayService orderSummaryDayService;

    @Resource
    private OrderSummaryTimePeriodService orderSummaryTimePeriodService;

    @Resource
    private ProductSummaryDayService productSummaryDayService;

    @Resource
    private com.linmour.dataAnaly.mapper.OrderSummaryDayMapper orderSummaryDayMapper;

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void executeDailySummary(LocalDate targetDate) {
        if (targetDate == null) {
            targetDate = LocalDate.now().minusDays(1);
        }
        Date summaryDate = java.sql.Date.valueOf(targetDate);
        log.info("Executing daily summary for date: {}", targetDate);

        if (redisCache == null) {
            log.warn("RedisCache is null, skipping summary");
            return;
        }

        // 1. Tổng hợp orderSummaryDay
        List<String> orderKeys = redisCache.getMatchingKeys("dataAnaly:orderSummaryDay:*");
        if (orderKeys != null) {
            for (String key : orderKeys) {
                try {
                    String[] segments = key.split(":");
                    Long shopId = segments.length >= 3 ? Long.valueOf(segments[2]) : null;
                    if (shopId == null) {
                        continue;
                    }

                    Map<String, Object> hash = redisCache.getAllHash(key);
                    if (hash == null || hash.isEmpty()) {
                        continue;
                    }

                    int orderNum = hash.get("orderNum") != null ? Integer.parseInt(hash.get("orderNum").toString()) : 0;
                    int productNum = hash.get("productNum") != null ? Integer.parseInt(hash.get("productNum").toString()) : 0;
                    BigDecimal price = hash.get("price") != null ? new BigDecimal(hash.get("price").toString()) : BigDecimal.ZERO;

                    OrderSummaryDay existing = orderSummaryDayService.getOne(new LambdaQueryWrapper<OrderSummaryDay>()
                            .eq(OrderSummaryDay::getShopId, shopId)
                            .eq(OrderSummaryDay::getDate, summaryDate));

                    if (existing != null) {
                        int newOrderNum = (existing.getOrderNum() != null ? existing.getOrderNum() : 0) + orderNum;
                        int newProductNum = (existing.getProductNum() != null ? existing.getProductNum() : 0) + productNum;
                        BigDecimal newPrice = (existing.getPrice() != null ? existing.getPrice() : BigDecimal.ZERO).add(price);
                        BigDecimal newAvg = newOrderNum > 0 ? newPrice.divide(new BigDecimal(newOrderNum), 2, RoundingMode.HALF_UP) : BigDecimal.ZERO;

                        existing.setOrderNum(newOrderNum);
                        existing.setProductNum(newProductNum);
                        existing.setPrice(newPrice);
                        existing.setAvgPrice(newAvg);
                        orderSummaryDayService.updateById(existing);
                    } else {
                        BigDecimal avg = orderNum > 0 ? price.divide(new BigDecimal(orderNum), 2, RoundingMode.HALF_UP) : BigDecimal.ZERO;
                        OrderSummaryDay newRecord = OrderSummaryDay.builder()
                                .date(summaryDate)
                                .shopId(shopId)
                                .orderNum(orderNum)
                                .productNum(productNum)
                                .price(price)
                                .avgPrice(avg)
                                .build();
                        orderSummaryDayService.save(newRecord);
                    }
                    if (targetDate != null && targetDate.isBefore(LocalDate.now())) {
                        redisCache.deleteObject(key);
                    }
                } catch (Exception e) {
                    log.error("Error processing orderSummaryDay key {}: {}", key, e.getMessage(), e);
                }
            }
        }

        // 2. Tổng hợp productSummaryDay
        List<String> productKeys = redisCache.getMatchingKeys("dataAnaly:productSummaryDay:*");
        if (productKeys != null) {
            for (String key : productKeys) {
                try {
                    String[] segments = key.split(":");
                    Long shopId = segments.length >= 3 ? Long.valueOf(segments[2]) : null;
                    if (shopId == null) {
                        continue;
                    }

                    Map<String, Object> hash = redisCache.getAllHash(key);
                    if (hash == null || hash.isEmpty()) {
                        continue;
                    }

                    for (Map.Entry<String, Object> entry : hash.entrySet()) {
                        String productName = entry.getKey();
                        int qty = entry.getValue() != null ? Integer.parseInt(entry.getValue().toString()) : 0;

                        ProductSummaryDay existing = productSummaryDayService.getOne(new LambdaQueryWrapper<ProductSummaryDay>()
                                .eq(ProductSummaryDay::getShopId, shopId)
                                .eq(ProductSummaryDay::getName, productName)
                                .eq(ProductSummaryDay::getDate, summaryDate));

                        if (existing != null) {
                            existing.setNum((existing.getNum() != null ? existing.getNum() : 0) + qty);
                            productSummaryDayService.updateById(existing);
                        } else {
                            ProductSummaryDay newRecord = ProductSummaryDay.builder()
                                    .name(productName)
                                    .num(qty)
                                    .date(summaryDate)
                                    .shopId(shopId)
                                    .build();
                            productSummaryDayService.save(newRecord);
                        }
                    }
                    if (targetDate != null && targetDate.isBefore(LocalDate.now())) {
                        redisCache.deleteObject(key);
                    }
                } catch (Exception e) {
                    log.error("Error processing productSummaryDay key {}: {}", key, e.getMessage(), e);
                }
            }
        }

        // 3. Tổng hợp orderSummaryTimePeriod
        List<String> periodKeys = redisCache.getMatchingKeys("dataAnaly:orderSummaryTimePeriod:*");
        if (periodKeys != null) {
            for (String key : periodKeys) {
                try {
                    String[] segments = key.split(":");
                    Long shopId = segments.length >= 3 ? Long.valueOf(segments[2]) : null;
                    String timePeriod = segments.length >= 4 ? segments[3] : "";
                    if (shopId == null) {
                        continue;
                    }

                    Map<String, Object> hash = redisCache.getAllHash(key);
                    if (hash == null || hash.isEmpty()) {
                        continue;
                    }

                    int orderNum = hash.get("orderNum") != null ? Integer.parseInt(hash.get("orderNum").toString()) : 0;
                    int productNum = hash.get("productNum") != null ? Integer.parseInt(hash.get("productNum").toString()) : 0;
                    BigDecimal price = hash.get("price") != null ? new BigDecimal(hash.get("price").toString()) : BigDecimal.ZERO;

                    OrderSummaryTimePeriod existing = orderSummaryTimePeriodService.getOne(new LambdaQueryWrapper<OrderSummaryTimePeriod>()
                            .eq(OrderSummaryTimePeriod::getShopId, shopId)
                            .eq(OrderSummaryTimePeriod::getTimePeriod, timePeriod));

                    if (existing != null) {
                        int newOrderNum = (existing.getOrderNum() != null ? existing.getOrderNum() : 0) + orderNum;
                        int newProductNum = (existing.getProductNum() != null ? existing.getProductNum() : 0) + productNum;
                        BigDecimal newPrice = (existing.getPrice() != null ? existing.getPrice() : BigDecimal.ZERO).add(price);
                        BigDecimal newAvg = newOrderNum > 0 ? newPrice.divide(new BigDecimal(newOrderNum), 2, RoundingMode.HALF_UP) : BigDecimal.ZERO;

                        existing.setOrderNum(newOrderNum);
                        existing.setProductNum(newProductNum);
                        existing.setPrice(newPrice);
                        existing.setAvgPrice(newAvg);
                        orderSummaryTimePeriodService.updateById(existing);
                    } else {
                        BigDecimal avg = orderNum > 0 ? price.divide(new BigDecimal(orderNum), 2, RoundingMode.HALF_UP) : BigDecimal.ZERO;
                        OrderSummaryTimePeriod newRecord = OrderSummaryTimePeriod.builder()
                                .timePeriod(timePeriod)
                                .shopId(shopId)
                                .orderNum(orderNum)
                                .productNum(productNum)
                                .price(price)
                                .avgPrice(avg)
                                .build();
                        orderSummaryTimePeriodService.save(newRecord);
                    }
                    if (targetDate != null && targetDate.isBefore(LocalDate.now())) {
                        redisCache.deleteObject(key);
                    }
                } catch (Exception e) {
                    log.error("Error processing orderSummaryTimePeriod key {}: {}", key, e.getMessage(), e);
                }
            }
        }
        syncDailySummary(targetDate);
        log.info("Daily summary completed for date: {}", targetDate);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void syncDailySummary(LocalDate targetDate) {
        String dateStr = targetDate != null ? targetDate.toString() : null;
        log.info("Syncing daily summary from orders for date: {}", dateStr != null ? dateStr : "ALL");
        try {
            int rows = orderSummaryDayMapper.syncDailySummaryFromOrders(dateStr);
            log.info("Synced {} rows into order_summary_day", rows);
        } catch (Exception e) {
            log.error("Failed to sync daily summary from orders: {}", e.getMessage(), e);
        }
    }

    @Override
    public void rebuildRedisStats(LocalDate targetDate, Long shopId) {
        if (targetDate == null) {
            targetDate = LocalDate.now();
        }
        String dateStr = targetDate.toString();
        log.info("Rebuilding Redis stats for date: {}, shopId: {}", dateStr, shopId);

        if (redisCache == null) {
            log.warn("RedisCache is null, cannot rebuild Redis stats");
            return;
        }

        List<OrderRawDto> orders = orderSummaryDayMapper.selectPaidOrdersByDate(dateStr, shopId);
        List<OrderItemRawDto> items = orderSummaryDayMapper.selectPaidOrderItemsByDate(dateStr, shopId);

        if (orders == null) {
            orders = Collections.emptyList();
        }
        if (items == null) {
            items = Collections.emptyList();
        }

        Map<String, List<OrderItemRawDto>> itemsByOrder = items.stream()
                .filter(i -> i != null && i.getOrderId() != null)
                .collect(Collectors.groupingBy(OrderItemRawDto::getOrderId));

        Map<Long, List<OrderRawDto>> ordersByShop = orders.stream()
                .filter(o -> o != null && o.getShopId() != null)
                .collect(Collectors.groupingBy(OrderRawDto::getShopId));

        Set<Long> affectedShopIds = new HashSet<>(ordersByShop.keySet());
        if (shopId != null) {
            affectedShopIds.add(shopId);
        }

        // Nếu shopId = null và không có đơn nào hôm nay, quét Redis xem quán nào đang có key để reset
        if (shopId == null && affectedShopIds.isEmpty()) {
            List<String> existingKeys = redisCache.getMatchingKeys("dataAnaly:orderSummaryDay:*");
            if (existingKeys != null) {
                for (String k : existingKeys) {
                    String[] parts = k.split(":");
                    if (parts.length >= 3) {
                        try {
                            affectedShopIds.add(Long.valueOf(parts[2]));
                        } catch (Exception ignored) {}
                    }
                }
            }
        }

        List<String> mealPeriods = Arrays.asList("早餐", "午餐", "晚餐", "深夜");

        for (Long sId : affectedShopIds) {
            // 1. Clear old Redis keys for this shop
            redisCache.deleteObject("dataAnaly:orderSummaryDay:" + sId);
            redisCache.deleteObject("dataAnaly:productSummaryDay:" + sId);
            for (String period : mealPeriods) {
                redisCache.deleteObject("dataAnaly:orderSummaryTimePeriod:" + sId + ":" + period);
            }

            List<OrderRawDto> shopOrders = ordersByShop.getOrDefault(sId, Collections.emptyList());
            if (shopOrders.isEmpty()) {
                if (redisPublisher != null) {
                    try {
                        redisPublisher.publishMessage(String.valueOf(sId));
                    } catch (Exception e) {
                        log.error("Failed to publish Redis message for shop {}: {}", sId, e.getMessage());
                    }
                }
                continue;
            }

            long totalOrderNum = 0;
            long totalProductNum = 0;
            long totalPrice = 0;

            Map<String, Long> productQuantities = new HashMap<>();

            Map<String, long[]> periodStatsMap = new HashMap<>();
            for (String period : mealPeriods) {
                // index 0: orderNum, 1: productNum, 2: price
                periodStatsMap.put(period, new long[]{0L, 0L, 0L});
            }

            for (OrderRawDto order : shopOrders) {
                totalOrderNum++;
                long payAmount = order.getPayAmount() != null ? order.getPayAmount().longValue() : 0L;
                totalPrice += payAmount;

                List<OrderItemRawDto> orderItems = itemsByOrder.getOrDefault(order.getId(), Collections.emptyList());
                long orderProductCount = 0;
                for (OrderItemRawDto item : orderItems) {
                    long qty = (item.getQuantity() != null && item.getQuantity() > 0) ? item.getQuantity() : 1L;
                    orderProductCount += qty;
                    if (item.getName() != null && !item.getName().trim().isEmpty()) {
                        String pName = item.getName().trim();
                        productQuantities.put(pName, productQuantities.getOrDefault(pName, 0L) + qty);
                    }
                }
                totalProductNum += orderProductCount;

                String mealPeriod = detectMealTime(order.getCreateTime());
                long[] ps = periodStatsMap.get(mealPeriod);
                if (ps != null) {
                    ps[0]++;
                    ps[1] += orderProductCount;
                    ps[2] += payAmount;
                }
            }

            // Write orderSummaryDay
            String dayKey = "dataAnaly:orderSummaryDay:" + sId;
            redisCache.incrementHash(dayKey, "orderNum", totalOrderNum);
            redisCache.incrementHash(dayKey, "productNum", totalProductNum);
            redisCache.incrementHash(dayKey, "price", totalPrice);

            // Write productSummaryDay
            String prodKey = "dataAnaly:productSummaryDay:" + sId;
            for (Map.Entry<String, Long> entry : productQuantities.entrySet()) {
                redisCache.incrementHash(prodKey, entry.getKey(), entry.getValue());
            }

            // Write orderSummaryTimePeriod
            for (Map.Entry<String, long[]> entry : periodStatsMap.entrySet()) {
                long[] ps = entry.getValue();
                if (ps[0] > 0 || ps[1] > 0 || ps[2] > 0) {
                    String pKey = "dataAnaly:orderSummaryTimePeriod:" + sId + ":" + entry.getKey();
                    redisCache.incrementHash(pKey, "orderNum", ps[0]);
                    redisCache.incrementHash(pKey, "productNum", ps[1]);
                    redisCache.incrementHash(pKey, "price", ps[2]);
                }
            }

            log.info("Rebuilt Redis stats for shop {}: orderNum={}, productNum={}, price={}",
                    sId, totalOrderNum, totalProductNum, totalPrice);

            if (redisPublisher != null) {
                try {
                    redisPublisher.publishMessage(String.valueOf(sId));
                } catch (Exception e) {
                    log.error("Failed to publish Redis message for shop {}: {}", sId, e.getMessage());
                }
            }
        }
    }

    private String detectMealTime(LocalDateTime localDateTime) {
        if (localDateTime == null) {
            localDateTime = LocalDateTime.now();
        }
        LocalTime time = localDateTime.toLocalTime();
        if (!time.isBefore(LocalTime.of(7, 0)) && time.isBefore(LocalTime.of(11, 0))) {
            return "早餐";
        } else if (!time.isBefore(LocalTime.of(11, 0)) && time.isBefore(LocalTime.of(15, 0))) {
            return "午餐";
        } else if (!time.isBefore(LocalTime.of(15, 0)) && time.isBefore(LocalTime.of(23, 0))) {
            return "晚餐";
        } else {
            return "深夜";
        }
    }

    @Override
    public List<OrderRawDto> getPaidOrdersByDate(LocalDate date, Long shopId) {
        String dateStr = date != null ? date.toString() : null;
        return orderSummaryDayMapper.selectPaidOrdersByDate(dateStr, shopId);
    }

    @Override
    public Map<String, Object> getShopReport(Long shopId, LocalDate startDate, LocalDate endDate, String groupBy) {
        if (shopId == null) {
            throw new IllegalArgumentException("shopId cannot be null");
        }
        if (startDate == null || endDate == null || startDate.isAfter(endDate)) {
            throw new IllegalArgumentException("Invalid date range");
        }
        if (groupBy == null || (!groupBy.equals("day") && !groupBy.equals("week") && !groupBy.equals("month"))) {
            groupBy = "day";
        }

        String startStr = startDate.toString();
        String endStr = endDate.toString();

        List<OrderRawDto> orders = orderSummaryDayMapper.selectPaidOrdersByDateRange(startStr, endStr, shopId);
        List<OrderItemRawDto> items = orderSummaryDayMapper.selectPaidOrderItemsByDateRange(startStr, endStr, shopId);

        if (orders == null) {
            orders = Collections.emptyList();
        }
        if (items == null) {
            items = Collections.emptyList();
        }

        // 1. Khởi tạo series Map với đầy đủ mốc (các khoảng không có đơn vẫn có điểm 0)
        Map<String, Map<String, Object>> seriesMap = new LinkedHashMap<>();
        WeekFields weekFields = WeekFields.ISO;
        for (LocalDate d = startDate; !d.isAfter(endDate); d = d.plusDays(1)) {
            String periodKey;
            if ("week".equals(groupBy)) {
                int y = d.get(weekFields.weekBasedYear());
                int w = d.get(weekFields.weekOfWeekBasedYear());
                periodKey = String.format("%04d-W%02d", y, w);
            } else if ("month".equals(groupBy)) {
                periodKey = d.format(DateTimeFormatter.ofPattern("yyyy-MM"));
            } else {
                periodKey = d.format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
            }

            seriesMap.computeIfAbsent(periodKey, k -> {
                Map<String, Object> m = new HashMap<>();
                m.put("period", k);
                m.put("orderCount", 0L);
                m.put("revenue", BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP));
                return m;
            });
        }

        // 2. Khởi tạo khung giờ Map
        Map<String, Long> tpOrderMap = new LinkedHashMap<>();
        Map<String, BigDecimal> tpRevMap = new LinkedHashMap<>();
        for (String k : Arrays.asList("breakfast", "lunch", "dinner", "lateNight")) {
            tpOrderMap.put(k, 0L);
            tpRevMap.put(k, BigDecimal.ZERO);
        }

        // 3. Xử lý danh sách đơn hàng
        long totalOrderCount = orders.size();
        BigDecimal totalRevenue = BigDecimal.ZERO;

        for (OrderRawDto o : orders) {
            BigDecimal pay = o.getPayAmount() != null ? o.getPayAmount() : BigDecimal.ZERO;
            totalRevenue = totalRevenue.add(pay);

            LocalDateTime ct = o.getCreateTime() != null ? o.getCreateTime() : LocalDateTime.now();
            LocalDate orderDate = ct.toLocalDate();

            String periodKey;
            if ("week".equals(groupBy)) {
                int y = orderDate.get(weekFields.weekBasedYear());
                int w = orderDate.get(weekFields.weekOfWeekBasedYear());
                periodKey = String.format("%04d-W%02d", y, w);
            } else if ("month".equals(groupBy)) {
                periodKey = orderDate.format(DateTimeFormatter.ofPattern("yyyy-MM"));
            } else {
                periodKey = orderDate.format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
            }

            Map<String, Object> sm = seriesMap.get(periodKey);
            if (sm != null) {
                sm.put("orderCount", (Long) sm.get("orderCount") + 1L);
                sm.put("revenue", ((BigDecimal) sm.get("revenue")).add(pay).setScale(2, RoundingMode.HALF_UP));
            }

            LocalTime time = ct.toLocalTime();
            String timeKey;
            if (!time.isBefore(LocalTime.of(7, 0)) && time.isBefore(LocalTime.of(11, 0))) {
                timeKey = "breakfast";
            } else if (!time.isBefore(LocalTime.of(11, 0)) && time.isBefore(LocalTime.of(15, 0))) {
                timeKey = "lunch";
            } else if (!time.isBefore(LocalTime.of(15, 0)) && time.isBefore(LocalTime.of(23, 0))) {
                timeKey = "dinner";
            } else {
                timeKey = "lateNight";
            }

            tpOrderMap.put(timeKey, tpOrderMap.get(timeKey) + 1L);
            tpRevMap.put(timeKey, tpRevMap.get(timeKey).add(pay));
        }

        // 4. Xử lý danh sách món
        long totalItemCount = 0;
        Map<String, Integer> productQtyMap = new HashMap<>();
        Map<String, BigDecimal> productRevMap = new HashMap<>();

        for (OrderItemRawDto item : items) {
            int qty = (item.getQuantity() != null && item.getQuantity() > 0) ? item.getQuantity() : 1;
            totalItemCount += qty;

            if (item.getName() != null && !item.getName().trim().isEmpty()) {
                String name = item.getName().trim();
                BigDecimal unitPrice = item.getPrice() != null ? item.getPrice() : BigDecimal.ZERO;
                BigDecimal itemRev = unitPrice.multiply(new BigDecimal(qty));

                productQtyMap.put(name, productQtyMap.getOrDefault(name, 0) + qty);
                productRevMap.put(name, productRevMap.getOrDefault(name, BigDecimal.ZERO).add(itemRev));
            }
        }

        // 5. Build summary
        BigDecimal avgOrderValue = totalOrderCount > 0
                ? totalRevenue.divide(new BigDecimal(totalOrderCount), 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);

        Map<String, Object> summary = new HashMap<>();
        summary.put("orderCount", totalOrderCount);
        summary.put("revenue", totalRevenue.setScale(2, RoundingMode.HALF_UP));
        summary.put("avgOrderValue", avgOrderValue);
        summary.put("itemCount", totalItemCount);

        // 6. Build series
        List<Map<String, Object>> series = new ArrayList<>(seriesMap.values());

        // 7. Build topProducts (tối đa 10, xếp theo quantity giảm dần)
        List<Map<String, Object>> topProducts = productQtyMap.entrySet().stream()
                .sorted((e1, e2) -> e2.getValue().compareTo(e1.getValue()))
                .limit(10)
                .map(e -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("name", e.getKey());
                    m.put("quantity", e.getValue());
                    m.put("revenue", productRevMap.getOrDefault(e.getKey(), BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP));
                    return m;
                })
                .collect(Collectors.toList());

        // 8. Build timePeriods
        List<Map<String, Object>> timePeriods = new ArrayList<>();

        Map<String, Object> bMap = new HashMap<>();
        bMap.put("key", "breakfast");
        bMap.put("label", "Sáng (7–11h)");
        bMap.put("orderCount", tpOrderMap.get("breakfast"));
        bMap.put("revenue", tpRevMap.get("breakfast").setScale(2, RoundingMode.HALF_UP));
        timePeriods.add(bMap);

        Map<String, Object> lMap = new HashMap<>();
        lMap.put("key", "lunch");
        lMap.put("label", "Trưa (11–15h)");
        lMap.put("orderCount", tpOrderMap.get("lunch"));
        lMap.put("revenue", tpRevMap.get("lunch").setScale(2, RoundingMode.HALF_UP));
        timePeriods.add(lMap);

        Map<String, Object> dMap = new HashMap<>();
        dMap.put("key", "dinner");
        dMap.put("label", "Tối (15–23h)");
        dMap.put("orderCount", tpOrderMap.get("dinner"));
        dMap.put("revenue", tpRevMap.get("dinner").setScale(2, RoundingMode.HALF_UP));
        timePeriods.add(dMap);

        Map<String, Object> lnMap = new HashMap<>();
        lnMap.put("key", "lateNight");
        lnMap.put("label", "Khuya (23–7h)");
        lnMap.put("orderCount", tpOrderMap.get("lateNight"));
        lnMap.put("revenue", tpRevMap.get("lateNight").setScale(2, RoundingMode.HALF_UP));
        timePeriods.add(lnMap);

        Map<String, Object> result = new HashMap<>();
        result.put("summary", summary);
        result.put("series", series);
        result.put("topProducts", topProducts);
        result.put("timePeriods", timePeriods);

        return result;
    }
}


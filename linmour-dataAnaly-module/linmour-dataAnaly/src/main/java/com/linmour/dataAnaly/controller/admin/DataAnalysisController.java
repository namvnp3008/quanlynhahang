package com.linmour.dataAnaly.controller.admin;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.linmour.dataAnaly.feign.SystemFeign;
import com.linmour.dataAnaly.pojo.Do.OrderSummaryDay;
import com.linmour.dataAnaly.pojo.Dto.OrderRawDto;
import com.linmour.dataAnaly.service.DailySummaryService;
import com.linmour.dataAnaly.service.OrderSummaryDayService;
import com.linmour.security.dtos.Result;
import com.linmour.security.exception.CustomException;
import com.linmour.security.exception.enums.AppHttpCodeEnum;
import com.linmour.security.utils.SecurityUtils;
import com.linmour.system.pojo.Do.Shop;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Slf4j
@RestController
@RequestMapping("/dataAnaly/analysis")
public class DataAnalysisController {

    @Resource
    private DailySummaryService dailySummaryService;

    @Resource
    private OrderSummaryDayService orderSummaryDayService;

    @Resource
    private SystemFeign systemFeign;

    /**
     * P6: Thống kê doanh thu & hoa hồng toàn sàn từ order_summary_day
     * Chỉ admin nền tảng (type = 1) được gọi.
     */
    @GetMapping("/platformRevenue")
    public Result platformRevenue(
            @RequestParam(value = "startDate", required = false) String startDate,
            @RequestParam(value = "endDate", required = false) String endDate,
            @RequestParam(value = "shopId", required = false) Long shopId) {
        Integer userType = SecurityUtils.getUserType();
        if (userType == null || !userType.equals(1)) {
            throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
        }

        // B-2: Tự động sync nếu order_summary_day đang rỗng
        if (orderSummaryDayService.count() == 0) {
            log.info("order_summary_day is empty, triggering auto backfill from orders");
            try {
                dailySummaryService.syncDailySummary(null);
            } catch (Exception e) {
                log.warn("Auto backfill failed: {}", e.getMessage());
            }
        }

        LocalDate today = LocalDate.now();
        LocalDate start = null;
        LocalDate end = null;
        if (startDate != null && !startDate.trim().isEmpty()) {
            try {
                start = LocalDate.parse(startDate.trim(), DateTimeFormatter.ofPattern("yyyy-MM-dd"));
            } catch (Exception e) {
                throw new CustomException(AppHttpCodeEnum.PARAM_ERROR);
            }
        }
        if (endDate != null && !endDate.trim().isEmpty()) {
            try {
                end = LocalDate.parse(endDate.trim(), DateTimeFormatter.ofPattern("yyyy-MM-dd"));
            } catch (Exception e) {
                throw new CustomException(AppHttpCodeEnum.PARAM_ERROR);
            }
        }

        boolean includesToday = (start == null || !start.isAfter(today)) && (end == null || !end.isBefore(today));

        LambdaQueryWrapper<OrderSummaryDay> wrapper = new LambdaQueryWrapper<>();
        if (shopId != null) {
            wrapper.eq(OrderSummaryDay::getShopId, shopId);
        }
        if (start != null) {
            wrapper.ge(OrderSummaryDay::getDate, java.sql.Date.valueOf(start));
        }
        if (includesToday) {
            // B-9: Nếu khoảng ngày bao gồm hôm nay, loại trừ hôm nay khỏi order_summary_day để tránh tính trùng
            wrapper.lt(OrderSummaryDay::getDate, java.sql.Date.valueOf(today));
        } else if (end != null) {
            wrapper.le(OrderSummaryDay::getDate, java.sql.Date.valueOf(end));
        }

        List<OrderSummaryDay> summaries = orderSummaryDayService.list(wrapper);
        BigDecimal totalRevenue = BigDecimal.ZERO;
        long totalOrders = 0;
        Map<Long, BigDecimal> shopRevenueMap = new HashMap<>();
        Map<Long, Long> shopOrderMap = new HashMap<>();

        if (summaries != null) {
            for (OrderSummaryDay s : summaries) {
                BigDecimal p = s.getPrice() != null ? s.getPrice() : BigDecimal.ZERO;
                int count = s.getOrderNum() != null ? s.getOrderNum() : 0;
                totalRevenue = totalRevenue.add(p);
                totalOrders += count;

                Long sid = s.getShopId();
                if (sid != null) {
                    shopRevenueMap.put(sid, shopRevenueMap.getOrDefault(sid, BigDecimal.ZERO).add(p));
                    shopOrderMap.put(sid, shopOrderMap.getOrDefault(sid, 0L) + count);
                }
            }
        }

        // B-9: Nếu khoảng ngày bao gồm hôm nay, lấy đơn hàng real-time hôm nay trực tiếp từ order_info
        if (includesToday) {
            List<OrderRawDto> todayOrders = dailySummaryService.getPaidOrdersByDate(today, shopId);
            if (todayOrders != null) {
                for (OrderRawDto o : todayOrders) {
                    BigDecimal p = o.getPayAmount() != null ? o.getPayAmount() : BigDecimal.ZERO;
                    totalRevenue = totalRevenue.add(p);
                    totalOrders += 1;

                    Long sid = o.getShopId();
                    if (sid != null) {
                        shopRevenueMap.put(sid, shopRevenueMap.getOrDefault(sid, BigDecimal.ZERO).add(p));
                        shopOrderMap.put(sid, shopOrderMap.getOrDefault(sid, 0L) + 1L);
                    }
                }
            }
        }

        // B-1: Lấy thông tin quán thật (tên thật, fee_rate thật theo %) qua Feign
        List<Long> shopIds = new ArrayList<>(shopRevenueMap.keySet());
        Map<Long, Shop> shopMap = new HashMap<>();
        if (!shopIds.isEmpty()) {
            try {
                List<Shop> shops = systemFeign.getShopByIds(shopIds);
                if (shops != null) {
                    for (Shop s : shops) {
                        if (s != null && s.getId() != null) {
                            shopMap.put(s.getId(), s);
                        }
                    }
                }
            } catch (Exception e) {
                log.error("Failed to fetch shop info from systemFeign: {}", e.getMessage());
            }
        }

        BigDecimal grandTotalCommission = BigDecimal.ZERO;
        List<Map<String, Object>> shopBreakdown = new ArrayList<>();
        for (Map.Entry<Long, BigDecimal> entry : shopRevenueMap.entrySet()) {
            Long sId = entry.getKey();
            BigDecimal shopRevenue = entry.getValue().setScale(2, RoundingMode.HALF_UP);
            Shop shop = shopMap.get(sId);
            String shopName = (shop != null && shop.getName() != null && !shop.getName().trim().isEmpty())
                    ? shop.getName()
                    : ("Shop " + sId);
            BigDecimal feeRate = (shop != null && shop.getFeeRate() != null)
                    ? shop.getFeeRate()
                    : BigDecimal.ZERO;

            // shopCommission = shopRevenue * (feeRate / 100)
            BigDecimal shopCommission = shopRevenue.multiply(feeRate)
                    .divide(new BigDecimal("100"), 2, RoundingMode.HALF_UP);
            grandTotalCommission = grandTotalCommission.add(shopCommission);

            Map<String, Object> item = new HashMap<>();
            item.put("shopId", sId);
            item.put("shopName", shopName);
            item.put("feeRate", feeRate.setScale(2, RoundingMode.HALF_UP));
            item.put("feeRateUnit", "%");
            item.put("totalRevenue", shopRevenue);
            item.put("totalCommission", shopCommission);
            item.put("orderCount", shopOrderMap.getOrDefault(sId, 0L));
            shopBreakdown.add(item);
        }

        // Sắp xếp giảm dần theo doanh thu
        shopBreakdown.sort((a, b) -> ((BigDecimal) b.get("totalRevenue")).compareTo((BigDecimal) a.get("totalRevenue")));

        Map<String, Object> res = new HashMap<>();
        res.put("totalRevenue", totalRevenue.setScale(2, RoundingMode.HALF_UP));
        res.put("totalCommission", grandTotalCommission.setScale(2, RoundingMode.HALF_UP));
        res.put("orderCount", totalOrders);
        res.put("shopBreakdown", shopBreakdown);

        return Result.success(res);
    }

    /**
     * R2: Kích hoạt tổng hợp doanh thu cuối ngày thủ công cho ngày được chỉ định (hoặc hôm trước nếu không truyền)
     * date = "all" để backfill toàn bộ lịch sử.
     * Chỉ admin nền tảng (type = 1) được gọi.
     * @param date Ngày dạng yyyy-MM-dd hoặc "all"
     * @return Result
     */
    @PostMapping("/triggerDailySummary")
    public Result triggerDailySummary(@RequestParam(value = "date", required = false) String date) {
        Integer userType = SecurityUtils.getUserType();
        if (userType == null || !userType.equals(1)) {
            throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
        }

        if ("all".equalsIgnoreCase(date != null ? date.trim() : "")) {
            dailySummaryService.syncDailySummary(null);
            return Result.success("Tổng hợp toàn bộ doanh thu lịch sử thành công");
        }

        LocalDate targetDate;
        if (date != null && !date.trim().isEmpty()) {
            try {
                targetDate = LocalDate.parse(date.trim(), DateTimeFormatter.ofPattern("yyyy-MM-dd"));
            } catch (Exception e) {
                throw new CustomException(AppHttpCodeEnum.PARAM_ERROR);
            }
        } else {
            targetDate = LocalDate.now().minusDays(1);
        }

        dailySummaryService.executeDailySummary(targetDate);
        return Result.success("Tổng hợp doanh thu thành công cho ngày " + targetDate);
    }

    /**
     * B-8: Dựng lại Redis stats hôm nay (orderSummaryDay, productSummaryDay, orderSummaryTimePeriod) từ order_info và order_item
     * Chỉ admin nền tảng (type = 1) được gọi.
     * @param date Ngày dạng yyyy-MM-dd (mặc định hôm nay nếu null)
     * @param shopId ID quán (mặc định tất cả các quán nếu null)
     * @return Result
     */
    @PostMapping("/rebuildTodayStats")
    public Result rebuildTodayStats(
            @RequestParam(value = "date", required = false) String date,
            @RequestParam(value = "shopId", required = false) Long shopId) {
        Integer userType = SecurityUtils.getUserType();
        if (userType == null || !userType.equals(1)) {
            throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
        }

        LocalDate targetDate;
        if (date != null && !date.trim().isEmpty()) {
            try {
                targetDate = LocalDate.parse(date.trim(), DateTimeFormatter.ofPattern("yyyy-MM-dd"));
            } catch (Exception e) {
                throw new CustomException(AppHttpCodeEnum.PARAM_ERROR);
            }
        } else {
            targetDate = LocalDate.now();
        }

        dailySummaryService.rebuildRedisStats(targetDate, shopId);
        return Result.success("Dựng lại Redis stats thành công cho ngày " + targetDate + (shopId != null ? (" quán " + shopId) : " tất cả các quán"));
    }

    /**
     * R1: Báo cáo quán theo khoảng ngày và gom nhóm day/week/month
     * Header Token, Shopid
     * Merchant chỉ xem được quán của mình. Admin nền tảng xem được mọi quán.
     */
    @GetMapping("/shopReport")
    public Result shopReport(
            @RequestParam(value = "startDate", required = false) String startDate,
            @RequestParam(value = "endDate", required = false) String endDate,
            @RequestParam(value = "groupBy", required = false) String groupBy,
            @RequestParam(value = "shopId", required = false) Long queryShopId) {
        Integer userType = SecurityUtils.getUserType();
        if (userType == null) {
            throw new CustomException(AppHttpCodeEnum.NEED_LOGIN);
        }

        Long shopIdHeader = SecurityUtils.getShopId();
        Long targetShopId;
        if (userType.equals(1)) {
            targetShopId = queryShopId != null ? queryShopId : shopIdHeader;
        } else {
            if (shopIdHeader == null || shopIdHeader <= 0) {
                throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
            }
            if (queryShopId != null && !queryShopId.equals(shopIdHeader)) {
                throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
            }
            targetShopId = shopIdHeader;
        }

        if (targetShopId == null || targetShopId <= 0) {
            throw new CustomException(AppHttpCodeEnum.PARAM_ERROR);
        }

        LocalDate today = LocalDate.now();
        LocalDate start;
        LocalDate end;

        if (startDate != null && !startDate.trim().isEmpty()) {
            try {
                start = LocalDate.parse(startDate.trim(), DateTimeFormatter.ofPattern("yyyy-MM-dd"));
            } catch (Exception e) {
                throw new CustomException(AppHttpCodeEnum.PARAM_ERROR);
            }
        } else {
            start = today.minusDays(6);
        }

        if (endDate != null && !endDate.trim().isEmpty()) {
            try {
                end = LocalDate.parse(endDate.trim(), DateTimeFormatter.ofPattern("yyyy-MM-dd"));
            } catch (Exception e) {
                throw new CustomException(AppHttpCodeEnum.PARAM_ERROR);
            }
        } else {
            end = today;
        }

        if (start.isAfter(end)) {
            throw new CustomException(AppHttpCodeEnum.PARAM_ERROR);
        }

        String group = (groupBy != null && !groupBy.trim().isEmpty()) ? groupBy.trim().toLowerCase() : "day";
        if (!Arrays.asList("day", "week", "month").contains(group)) {
            group = "day";
        }

        Map<String, Object> report = dailySummaryService.getShopReport(targetShopId, start, end, group);
        return Result.success(report);
    }
}

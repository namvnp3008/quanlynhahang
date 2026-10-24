package com.linmour.dataAnaly.service;

import java.time.LocalDate;

public interface DailySummaryService {
    /**
     * R2: Tổng hợp dữ liệu doanh thu cuối ngày từ Redis sang MySQL (order_summary_day, order_summary_time_period, product_summary_day)
     * @param targetDate Ngày cần tổng hợp (mặc định hôm trước nếu null)
     */
    void executeDailySummary(LocalDate targetDate);

    /**
     * B-2: Đồng bộ/backfill order_summary_day từ order_info vào MySQL
     * @param targetDate Ngày cần đồng bộ, null nếu đồng bộ toàn bộ lịch sử
     */
    void syncDailySummary(LocalDate targetDate);

    /**
     * B-8: Dựng lại key thống kê Redis của một ngày từ order_info và order_item
     * @param targetDate Ngày cần dựng lại (mặc định hôm nay nếu null)
     * @param shopId Mã quán cần dựng lại (mặc định tất cả nếu null)
     */
    void rebuildRedisStats(LocalDate targetDate, Long shopId);

    /**
     * B-9: Lấy danh sách đơn hàng đã thanh toán theo ngày trực tiếp từ order_info
     * @param date Ngày cần lấy (mặc định hôm nay nếu null)
     * @param shopId Mã quán (null nếu tất cả)
     * @return Danh sách đơn hàng
     */
    java.util.List<com.linmour.dataAnaly.pojo.Dto.OrderRawDto> getPaidOrdersByDate(LocalDate date, Long shopId);

    /**
     * R1: Báo cáo quán theo khoảng ngày và gom nhóm day/week/month
     * @param shopId Mã quán
     * @param startDate Ngày bắt đầu
     * @param endDate Ngày kết thúc
     * @param groupBy day | week | month
     * @return Map dữ liệu báo cáo gồm summary, series, topProducts, timePeriods
     */
    java.util.Map<String, Object> getShopReport(Long shopId, LocalDate startDate, LocalDate endDate, String groupBy);
}

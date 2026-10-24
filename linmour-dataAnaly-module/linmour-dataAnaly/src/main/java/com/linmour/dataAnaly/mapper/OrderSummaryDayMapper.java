package com.linmour.dataAnaly.mapper;

import com.linmour.dataAnaly.pojo.Do.OrderSummaryDay;
import com.linmour.dataAnaly.pojo.Dto.OrderItemRawDto;
import com.linmour.dataAnaly.pojo.Dto.OrderRawDto;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
* @author linmour
* @description 针对表【order_summary_day】的数据库操作Mapper
* @createDate 2024-04-03 16:11:59
* @Entity com.linmour.dataAnaly.pojo.Do.OrderSummaryDay
*/
public interface OrderSummaryDayMapper extends BaseMapper<OrderSummaryDay> {

    int syncDailySummaryFromOrders(@Param("targetDate") String targetDate);

    List<OrderRawDto> selectPaidOrdersByDate(@Param("targetDate") String targetDate, @Param("shopId") Long shopId);

    List<OrderItemRawDto> selectPaidOrderItemsByDate(@Param("targetDate") String targetDate, @Param("shopId") Long shopId);

    List<OrderRawDto> selectPaidOrdersByDateRange(@Param("startDate") String startDate, @Param("endDate") String endDate, @Param("shopId") Long shopId);

    List<OrderItemRawDto> selectPaidOrderItemsByDateRange(@Param("startDate") String startDate, @Param("endDate") String endDate, @Param("shopId") Long shopId);
}





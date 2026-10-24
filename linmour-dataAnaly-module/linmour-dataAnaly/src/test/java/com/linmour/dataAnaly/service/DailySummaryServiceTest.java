package com.linmour.dataAnaly.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.linmour.dataAnaly.controller.admin.DataAnalysisController;
import com.linmour.dataAnaly.pojo.Do.OrderSummaryDay;
import com.linmour.dataAnaly.pojo.Do.OrderSummaryTimePeriod;
import com.linmour.dataAnaly.pojo.Do.ProductSummaryDay;
import com.linmour.dataAnaly.pojo.Dto.OrderItemRawDto;
import com.linmour.dataAnaly.pojo.Dto.OrderRawDto;
import com.linmour.dataAnaly.service.impl.DailySummaryServiceImpl;
import com.linmour.redisPub.RedisPublisher;
import com.linmour.security.dtos.LoginUser;
import com.linmour.security.dtos.LoginVo;
import com.linmour.security.dtos.Result;
import com.linmour.security.exception.CustomException;
import com.linmour.security.exception.enums.AppHttpCodeEnum;
import com.linmour.security.utils.RedisCache;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@RunWith(MockitoJUnitRunner.class)
public class DailySummaryServiceTest {

    @InjectMocks
    private DailySummaryServiceImpl dailySummaryService;

    @Mock
    private RedisCache redisCache;

    @Mock
    private OrderSummaryDayService orderSummaryDayService;

    @Mock
    private OrderSummaryTimePeriodService orderSummaryTimePeriodService;

    @Mock
    private ProductSummaryDayService productSummaryDayService;

    @Mock
    private RedisPublisher redisPublisher;

    @Mock
    private com.linmour.dataAnaly.mapper.OrderSummaryDayMapper orderSummaryDayMapper;

    @After
    public void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    public void testExecuteDailySummaryInsertsNewRecordsAndClearsRedis() {
        LocalDate date = LocalDate.of(2024, 4, 11);

        when(redisCache.getMatchingKeys("dataAnaly:orderSummaryDay:*"))
                .thenReturn(Collections.singletonList("dataAnaly:orderSummaryDay:1"));
        when(redisCache.getMatchingKeys("dataAnaly:productSummaryDay:*"))
                .thenReturn(Collections.singletonList("dataAnaly:productSummaryDay:1"));
        when(redisCache.getMatchingKeys("dataAnaly:orderSummaryTimePeriod:*"))
                .thenReturn(Collections.singletonList("dataAnaly:orderSummaryTimePeriod:1:早餐"));

        Map<String, Object> orderMap = new HashMap<>();
        orderMap.put("orderNum", 10);
        orderMap.put("productNum", 25);
        orderMap.put("price", "500000.00");
        when(redisCache.getAllHash("dataAnaly:orderSummaryDay:1")).thenReturn(orderMap);

        Map<String, Object> prodMap = new HashMap<>();
        prodMap.put("Phở Bò Tái Nạm", 15);
        prodMap.put("Bún Chả Hà Nội", 10);
        when(redisCache.getAllHash("dataAnaly:productSummaryDay:1")).thenReturn(prodMap);

        Map<String, Object> periodMap = new HashMap<>();
        periodMap.put("orderNum", 5);
        periodMap.put("productNum", 12);
        periodMap.put("price", "250000.00");
        when(redisCache.getAllHash("dataAnaly:orderSummaryTimePeriod:1:早餐")).thenReturn(periodMap);

        when(orderSummaryDayService.getOne(any())).thenReturn(null);
        when(productSummaryDayService.getOne(any())).thenReturn(null);
        when(orderSummaryTimePeriodService.getOne(any())).thenReturn(null);

        dailySummaryService.executeDailySummary(date);

        // Verify orderSummaryDay insert
        ArgumentCaptor<OrderSummaryDay> dayCaptor = ArgumentCaptor.forClass(OrderSummaryDay.class);
        verify(orderSummaryDayService).save(dayCaptor.capture());
        OrderSummaryDay savedDay = dayCaptor.getValue();
        assertEquals(Long.valueOf(1), savedDay.getShopId());
        assertEquals(Integer.valueOf(10), savedDay.getOrderNum());
        assertEquals(Integer.valueOf(25), savedDay.getProductNum());
        assertEquals(new BigDecimal("500000.00"), savedDay.getPrice());
        assertEquals(new BigDecimal("50000.00"), savedDay.getAvgPrice());

        // Verify productSummaryDay inserts
        verify(productSummaryDayService, times(2)).save(any(ProductSummaryDay.class));

        // Verify orderSummaryTimePeriod insert
        ArgumentCaptor<OrderSummaryTimePeriod> periodCaptor = ArgumentCaptor.forClass(OrderSummaryTimePeriod.class);
        verify(orderSummaryTimePeriodService).save(periodCaptor.capture());
        OrderSummaryTimePeriod savedPeriod = periodCaptor.getValue();
        assertEquals(Long.valueOf(1), savedPeriod.getShopId());
        assertEquals("早餐", savedPeriod.getTimePeriod());
        assertEquals(Integer.valueOf(5), savedPeriod.getOrderNum());
        assertEquals(new BigDecimal("250000.00"), savedPeriod.getPrice());
        assertEquals(new BigDecimal("50000.00"), savedPeriod.getAvgPrice());

        // Verify redis keys deleted
        verify(redisCache).deleteObject("dataAnaly:orderSummaryDay:1");
        verify(redisCache).deleteObject("dataAnaly:productSummaryDay:1");
        verify(redisCache).deleteObject("dataAnaly:orderSummaryTimePeriod:1:早餐");
    }

    @Test
    public void testExecuteDailySummaryUpdatesExistingRecords() {
        LocalDate date = LocalDate.of(2024, 4, 11);

        when(redisCache.getMatchingKeys("dataAnaly:orderSummaryDay:*"))
                .thenReturn(Collections.singletonList("dataAnaly:orderSummaryDay:1"));
        when(redisCache.getMatchingKeys("dataAnaly:productSummaryDay:*"))
                .thenReturn(Collections.emptyList());
        when(redisCache.getMatchingKeys("dataAnaly:orderSummaryTimePeriod:*"))
                .thenReturn(Collections.emptyList());

        Map<String, Object> orderMap = new HashMap<>();
        orderMap.put("orderNum", 5);
        orderMap.put("productNum", 10);
        orderMap.put("price", "200000.00");
        when(redisCache.getAllHash("dataAnaly:orderSummaryDay:1")).thenReturn(orderMap);

        OrderSummaryDay existing = OrderSummaryDay.builder()
                .id(99L)
                .shopId(1L)
                .orderNum(5)
                .productNum(10)
                .price(new BigDecimal("200000.00"))
                .avgPrice(new BigDecimal("40000.00"))
                .build();
        when(orderSummaryDayService.getOne(any())).thenReturn(existing);

        dailySummaryService.executeDailySummary(date);

        ArgumentCaptor<OrderSummaryDay> dayCaptor = ArgumentCaptor.forClass(OrderSummaryDay.class);
        verify(orderSummaryDayService).updateById(dayCaptor.capture());
        OrderSummaryDay updated = dayCaptor.getValue();
        assertEquals(Integer.valueOf(10), updated.getOrderNum());
        assertEquals(Integer.valueOf(20), updated.getProductNum());
        assertEquals(new BigDecimal("400000.00"), updated.getPrice());
        assertEquals(new BigDecimal("40000.00"), updated.getAvgPrice());
    }

    @Test
    public void testTriggerDailySummaryControllerByAdminSuccess() {
        LoginVo vo = new LoginVo();
        vo.setId(1L);
        vo.setType(1); // platform admin
        LoginUser loginUser = new LoginUser(vo);
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(loginUser, null, null);
        SecurityContextHolder.getContext().setAuthentication(auth);

        DataAnalysisController controller = new DataAnalysisController();
        DailySummaryService mockService = mock(DailySummaryService.class);
        ReflectionTestUtils.setField(controller, "dailySummaryService", mockService);

        Result result = controller.triggerDailySummary("2024-04-11");
        assertNotNull(result);
        assertEquals(200, result.getCode().intValue());
        verify(mockService).executeDailySummary(LocalDate.of(2024, 4, 11));
    }

    @Test
    public void testTriggerDailySummaryControllerByRegularMerchantThrowsForbidden() {
        LoginVo vo = new LoginVo();
        vo.setId(25L);
        vo.setType(2); // regular merchant
        LoginUser loginUser = new LoginUser(vo);
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(loginUser, null, null);
        SecurityContextHolder.getContext().setAuthentication(auth);

        DataAnalysisController controller = new DataAnalysisController();
        DailySummaryService mockService = mock(DailySummaryService.class);
        ReflectionTestUtils.setField(controller, "dailySummaryService", mockService);

        try {
            controller.triggerDailySummary("2024-04-11");
            fail("Expected CustomException 403 NO_OPERATOR_AUTH");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.NO_OPERATOR_AUTH, e.getExceptionEnum());
        }
        verify(mockService, never()).executeDailySummary(any());
    }

    @Test
    public void testPlatformRevenueByAdminReturnsRealShopInfoAndCommission() {
        LoginVo vo = new LoginVo();
        vo.setId(1L);
        vo.setType(1); // platform admin
        LoginUser loginUser = new LoginUser(vo);
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(loginUser, null, null);
        SecurityContextHolder.getContext().setAuthentication(auth);

        DataAnalysisController controller = new DataAnalysisController();
        OrderSummaryDayService mockOrderSummaryDayService = mock(OrderSummaryDayService.class);
        com.linmour.dataAnaly.feign.SystemFeign mockSystemFeign = mock(com.linmour.dataAnaly.feign.SystemFeign.class);
        DailySummaryService mockDailySummaryService = mock(DailySummaryService.class);

        ReflectionTestUtils.setField(controller, "orderSummaryDayService", mockOrderSummaryDayService);
        ReflectionTestUtils.setField(controller, "systemFeign", mockSystemFeign);
        ReflectionTestUtils.setField(controller, "dailySummaryService", mockDailySummaryService);

        when(mockOrderSummaryDayService.count()).thenReturn(2);

        OrderSummaryDay day1 = OrderSummaryDay.builder()
                .shopId(1L)
                .orderNum(10)
                .productNum(20)
                .price(new BigDecimal("1000000.00"))
                .build();
        OrderSummaryDay day2 = OrderSummaryDay.builder()
                .shopId(2L)
                .orderNum(5)
                .productNum(10)
                .price(new BigDecimal("500000.00"))
                .build();
        when(mockOrderSummaryDayService.list(any())).thenReturn(Arrays.asList(day1, day2));

        com.linmour.system.pojo.Do.Shop s1 = new com.linmour.system.pojo.Do.Shop();
        s1.setId(1L);
        s1.setName("Nhà Hàng Bếp Việt");
        s1.setFeeRate(new BigDecimal("5.00"));

        com.linmour.system.pojo.Do.Shop s2 = new com.linmour.system.pojo.Do.Shop();
        s2.setId(2L);
        s2.setName("Quán Mì Quảng");
        s2.setFeeRate(new BigDecimal("10.00"));

        when(mockSystemFeign.getShopByIds(anyList())).thenReturn(Arrays.asList(s1, s2));

        Result result = controller.platformRevenue(null, null, null);
        assertNotNull(result);
        assertEquals(200, result.getCode().intValue());

        @SuppressWarnings("unchecked")
        Map<String, Object> data = (Map<String, Object>) result.getData();
        assertEquals(new BigDecimal("1500000.00"), data.get("totalRevenue"));
        assertEquals(15L, ((Long) data.get("orderCount")).longValue());
        // Commission = (1,000,000 * 5%) + (500,000 * 10%) = 50,000 + 50,000 = 100,000.00
        assertEquals(new BigDecimal("100000.00"), data.get("totalCommission"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> breakdown = (List<Map<String, Object>>) data.get("shopBreakdown");
        assertEquals(2, breakdown.size());

        Map<String, Object> item1 = breakdown.get(0);
        assertEquals(1L, item1.get("shopId"));
        assertEquals("Nhà Hàng Bếp Việt", item1.get("shopName"));
        assertEquals(new BigDecimal("5.00"), item1.get("feeRate"));
        assertEquals("%", item1.get("feeRateUnit"));
        assertEquals(new BigDecimal("1000000.00"), item1.get("totalRevenue"));
        assertEquals(new BigDecimal("50000.00"), item1.get("totalCommission"));
        assertEquals(10L, item1.get("orderCount"));

        Map<String, Object> item2 = breakdown.get(1);
        assertEquals(2L, item2.get("shopId"));
        assertEquals("Quán Mì Quảng", item2.get("shopName"));
        assertEquals(new BigDecimal("10.00"), item2.get("feeRate"));
        assertEquals("%", item2.get("feeRateUnit"));
        assertEquals(new BigDecimal("500000.00"), item2.get("totalRevenue"));
        assertEquals(new BigDecimal("50000.00"), item2.get("totalCommission"));
        assertEquals(5L, item2.get("orderCount"));
    }

    @Test
    public void testPlatformRevenueByMerchantThrowsForbidden() {
        LoginVo vo = new LoginVo();
        vo.setId(25L);
        vo.setType(2); // regular merchant
        LoginUser loginUser = new LoginUser(vo);
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(loginUser, null, null);
        SecurityContextHolder.getContext().setAuthentication(auth);

        DataAnalysisController controller = new DataAnalysisController();

        try {
            controller.platformRevenue(null, null, null);
            fail("Expected CustomException 403 NO_OPERATOR_AUTH");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.NO_OPERATOR_AUTH, e.getExceptionEnum());
        }
    }

    @Test
    public void testExecuteDailySummaryDoesNotDeleteRedisWhenTargetDateIsToday() {
        LocalDate today = LocalDate.now();

        when(redisCache.getMatchingKeys("dataAnaly:orderSummaryDay:*"))
                .thenReturn(Collections.singletonList("dataAnaly:orderSummaryDay:1"));
        when(redisCache.getMatchingKeys("dataAnaly:productSummaryDay:*"))
                .thenReturn(Collections.emptyList());
        when(redisCache.getMatchingKeys("dataAnaly:orderSummaryTimePeriod:*"))
                .thenReturn(Collections.emptyList());

        Map<String, Object> orderMap = new HashMap<>();
        orderMap.put("orderNum", 10);
        orderMap.put("productNum", 25);
        orderMap.put("price", "500000.00");
        when(redisCache.getAllHash("dataAnaly:orderSummaryDay:1")).thenReturn(orderMap);
        when(orderSummaryDayService.getOne(any())).thenReturn(null);

        dailySummaryService.executeDailySummary(today);

        verify(orderSummaryDayService).save(any(OrderSummaryDay.class));
        verify(redisCache, never()).deleteObject("dataAnaly:orderSummaryDay:1");
    }

    @Test
    public void testRebuildRedisStatsSuccess() {
        LocalDate today = LocalDate.now();
        Long shopId = 1L;

        OrderRawDto o1 = OrderRawDto.builder()
                .id("ord_1")
                .shopId(1L)
                .payAmount(new BigDecimal("100000"))
                .createTime(today.atTime(8, 30)) // 早餐
                .build();
        OrderRawDto o2 = OrderRawDto.builder()
                .id("ord_2")
                .shopId(1L)
                .payAmount(new BigDecimal("250000"))
                .createTime(today.atTime(12, 15)) // 午餐
                .build();
        OrderRawDto o3 = OrderRawDto.builder()
                .id("ord_3")
                .shopId(1L)
                .payAmount(new BigDecimal("150000"))
                .createTime(today.atTime(19, 0)) // 晚餐
                .build();

        OrderItemRawDto item1 = OrderItemRawDto.builder()
                .orderId("ord_1")
                .shopId(1L)
                .name("Phở Bò Tái Nạm")
                .quantity(2)
                .build();
        OrderItemRawDto item2 = OrderItemRawDto.builder()
                .orderId("ord_2")
                .shopId(1L)
                .name("Bún Chả Hà Nội")
                .quantity(1)
                .build();
        OrderItemRawDto item3 = OrderItemRawDto.builder()
                .orderId("ord_3")
                .shopId(1L)
                .name("Phở Bò Tái Nạm")
                .quantity(1)
                .build();

        when(orderSummaryDayMapper.selectPaidOrdersByDate(today.toString(), shopId))
                .thenReturn(Arrays.asList(o1, o2, o3));
        when(orderSummaryDayMapper.selectPaidOrderItemsByDate(today.toString(), shopId))
                .thenReturn(Arrays.asList(item1, item2, item3));

        dailySummaryService.rebuildRedisStats(today, shopId);

        // Verify old keys deleted
        verify(redisCache).deleteObject("dataAnaly:orderSummaryDay:1");
        verify(redisCache).deleteObject("dataAnaly:productSummaryDay:1");
        verify(redisCache).deleteObject("dataAnaly:orderSummaryTimePeriod:1:早餐");
        verify(redisCache).deleteObject("dataAnaly:orderSummaryTimePeriod:1:午餐");
        verify(redisCache).deleteObject("dataAnaly:orderSummaryTimePeriod:1:晚餐");
        verify(redisCache).deleteObject("dataAnaly:orderSummaryTimePeriod:1:深夜");

        // Verify orderSummaryDay increments
        verify(redisCache).incrementHash("dataAnaly:orderSummaryDay:1", "orderNum", 3L);
        verify(redisCache).incrementHash("dataAnaly:orderSummaryDay:1", "productNum", 4L); // 2 + 1 + 1
        verify(redisCache).incrementHash("dataAnaly:orderSummaryDay:1", "price", 500000L); // 100000 + 250000 + 150000

        // Verify productSummaryDay increments
        verify(redisCache).incrementHash("dataAnaly:productSummaryDay:1", "Phở Bò Tái Nạm", 3L);
        verify(redisCache).incrementHash("dataAnaly:productSummaryDay:1", "Bún Chả Hà Nội", 1L);

        // Verify orderSummaryTimePeriod increments
        verify(redisCache).incrementHash("dataAnaly:orderSummaryTimePeriod:1:早餐", "orderNum", 1L);
        verify(redisCache).incrementHash("dataAnaly:orderSummaryTimePeriod:1:早餐", "productNum", 2L);
        verify(redisCache).incrementHash("dataAnaly:orderSummaryTimePeriod:1:早餐", "price", 100000L);

        verify(redisCache).incrementHash("dataAnaly:orderSummaryTimePeriod:1:午餐", "orderNum", 1L);
        verify(redisCache).incrementHash("dataAnaly:orderSummaryTimePeriod:1:午餐", "productNum", 1L);
        verify(redisCache).incrementHash("dataAnaly:orderSummaryTimePeriod:1:午餐", "price", 250000L);

        verify(redisCache).incrementHash("dataAnaly:orderSummaryTimePeriod:1:晚餐", "orderNum", 1L);
        verify(redisCache).incrementHash("dataAnaly:orderSummaryTimePeriod:1:晚餐", "productNum", 1L);
        verify(redisCache).incrementHash("dataAnaly:orderSummaryTimePeriod:1:晚餐", "price", 150000L);

        // Verify WebSocket notification sent
        verify(redisPublisher).publishMessage("1");
    }

    @Test
    public void testRebuildTodayStatsControllerByAdminSuccess() {
        LoginVo vo = new LoginVo();
        vo.setId(1L);
        vo.setType(1); // platform admin
        LoginUser loginUser = new LoginUser(vo);
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(loginUser, null, null);
        SecurityContextHolder.getContext().setAuthentication(auth);

        DataAnalysisController controller = new DataAnalysisController();
        DailySummaryService mockService = mock(DailySummaryService.class);
        ReflectionTestUtils.setField(controller, "dailySummaryService", mockService);

        Result result = controller.rebuildTodayStats("2026-10-22", 1L);
        assertNotNull(result);
        assertEquals(200, result.getCode().intValue());
        verify(mockService).rebuildRedisStats(LocalDate.of(2026, 10, 22), 1L);
    }

    @Test
    public void testRebuildTodayStatsControllerByMerchantThrowsForbidden() {
        LoginVo vo = new LoginVo();
        vo.setId(25L);
        vo.setType(2); // regular merchant
        LoginUser loginUser = new LoginUser(vo);
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(loginUser, null, null);
        SecurityContextHolder.getContext().setAuthentication(auth);

        DataAnalysisController controller = new DataAnalysisController();
        DailySummaryService mockService = mock(DailySummaryService.class);
        ReflectionTestUtils.setField(controller, "dailySummaryService", mockService);

        try {
            controller.rebuildTodayStats("2026-10-22", 1L);
            fail("Expected CustomException 403 NO_OPERATOR_AUTH");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.NO_OPERATOR_AUTH, e.getExceptionEnum());
        }
        verify(mockService, never()).rebuildRedisStats(any(), any());
    }

    @Test
    public void testRebuildTodayStatsControllerWithInvalidDateThrowsParamError() {
        LoginVo vo = new LoginVo();
        vo.setId(1L);
        vo.setType(1); // platform admin
        LoginUser loginUser = new LoginUser(vo);
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(loginUser, null, null);
        SecurityContextHolder.getContext().setAuthentication(auth);

        DataAnalysisController controller = new DataAnalysisController();
        DailySummaryService mockService = mock(DailySummaryService.class);
        ReflectionTestUtils.setField(controller, "dailySummaryService", mockService);

        try {
            controller.rebuildTodayStats("invalid-date", 1L);
            fail("Expected CustomException PARAM_ERROR");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.PARAM_ERROR, e.getExceptionEnum());
        }
        verify(mockService, never()).rebuildRedisStats(any(), any());
    }

    @Test
    public void testPlatformRevenueIncludesTodayOrdersDirectlyFromOrderInfoWithoutDoubleCounting() {
        LoginVo vo = new LoginVo();
        vo.setId(1L);
        vo.setType(1); // platform admin
        LoginUser loginUser = new LoginUser(vo);
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(loginUser, null, null);
        SecurityContextHolder.getContext().setAuthentication(auth);

        DataAnalysisController controller = new DataAnalysisController();
        OrderSummaryDayService mockOrderSummaryDayService = mock(OrderSummaryDayService.class);
        com.linmour.dataAnaly.feign.SystemFeign mockSystemFeign = mock(com.linmour.dataAnaly.feign.SystemFeign.class);
        DailySummaryService mockDailySummaryService = mock(DailySummaryService.class);

        ReflectionTestUtils.setField(controller, "orderSummaryDayService", mockOrderSummaryDayService);
        ReflectionTestUtils.setField(controller, "systemFeign", mockSystemFeign);
        ReflectionTestUtils.setField(controller, "dailySummaryService", mockDailySummaryService);

        when(mockOrderSummaryDayService.count()).thenReturn(1);

        // Historical order in order_summary_day (before today)
        OrderSummaryDay histDay = OrderSummaryDay.builder()
                .shopId(1L)
                .orderNum(1)
                .productNum(2)
                .price(new BigDecimal("100000.00"))
                .build();
        when(mockOrderSummaryDayService.list(any())).thenReturn(Collections.singletonList(histDay));

        // Real-time orders today from order_info
        OrderRawDto todayOrder1 = OrderRawDto.builder()
                .id("today_ord_1")
                .shopId(1L)
                .payAmount(new BigDecimal("50000.00"))
                .build();
        OrderRawDto todayOrder2 = OrderRawDto.builder()
                .id("today_ord_2")
                .shopId(2L)
                .payAmount(new BigDecimal("70000.00"))
                .build();
        when(mockDailySummaryService.getPaidOrdersByDate(eq(LocalDate.now()), isNull()))
                .thenReturn(Arrays.asList(todayOrder1, todayOrder2));

        com.linmour.system.pojo.Do.Shop s1 = new com.linmour.system.pojo.Do.Shop();
        s1.setId(1L);
        s1.setName("Shop 1");
        s1.setFeeRate(new BigDecimal("5.00"));

        com.linmour.system.pojo.Do.Shop s2 = new com.linmour.system.pojo.Do.Shop();
        s2.setId(2L);
        s2.setName("Shop 2");
        s2.setFeeRate(new BigDecimal("10.00"));

        when(mockSystemFeign.getShopByIds(anyList())).thenReturn(Arrays.asList(s1, s2));

        Result result = controller.platformRevenue(null, null, null);
        assertNotNull(result);
        assertEquals(200, result.getCode().intValue());

        @SuppressWarnings("unchecked")
        Map<String, Object> data = (Map<String, Object>) result.getData();
        // Total revenue = 100,000 + 50,000 + 70,000 = 220,000.00
        assertEquals(new BigDecimal("220000.00"), data.get("totalRevenue"));
        // Total orders = 1 + 2 = 3
        assertEquals(3L, ((Long) data.get("orderCount")).longValue());
        // Commission = (150,000 * 5%) + (70,000 * 10%) = 7,500 + 7,000 = 14,500.00
        assertEquals(new BigDecimal("14500.00"), data.get("totalCommission"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> breakdown = (List<Map<String, Object>>) data.get("shopBreakdown");
        assertEquals(2, breakdown.size());
        Map<String, Object> item1 = breakdown.get(0);
        assertEquals(1L, item1.get("shopId"));
        assertEquals(new BigDecimal("150000.00"), item1.get("totalRevenue"));
        assertEquals(2L, item1.get("orderCount"));

        Map<String, Object> item2 = breakdown.get(1);
        assertEquals(2L, item2.get("shopId"));
        assertEquals(new BigDecimal("70000.00"), item2.get("totalRevenue"));
        assertEquals(1L, item2.get("orderCount"));
    }

    @Test
    public void testPlatformRevenueHistoricalRangeDoesNotQueryTodayOrders() {
        LoginVo vo = new LoginVo();
        vo.setId(1L);
        vo.setType(1); // platform admin
        LoginUser loginUser = new LoginUser(vo);
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(loginUser, null, null);
        SecurityContextHolder.getContext().setAuthentication(auth);

        DataAnalysisController controller = new DataAnalysisController();
        OrderSummaryDayService mockOrderSummaryDayService = mock(OrderSummaryDayService.class);
        com.linmour.dataAnaly.feign.SystemFeign mockSystemFeign = mock(com.linmour.dataAnaly.feign.SystemFeign.class);
        DailySummaryService mockDailySummaryService = mock(DailySummaryService.class);

        ReflectionTestUtils.setField(controller, "orderSummaryDayService", mockOrderSummaryDayService);
        ReflectionTestUtils.setField(controller, "systemFeign", mockSystemFeign);
        ReflectionTestUtils.setField(controller, "dailySummaryService", mockDailySummaryService);

        when(mockOrderSummaryDayService.count()).thenReturn(1);
        when(mockOrderSummaryDayService.list(any())).thenReturn(Collections.emptyList());

        Result result = controller.platformRevenue("2024-04-01", "2024-04-20", null);
        assertNotNull(result);
        assertEquals(200, result.getCode().intValue());

        // Since date range does not include today, getPaidOrdersByDate must NEVER be called
        verify(mockDailySummaryService, never()).getPaidOrdersByDate(any(), any());
    }

    @Test
    public void testPlatformRevenueInvalidStartDateThrowsParamError() {
        LoginVo vo = new LoginVo();
        vo.setId(1L);
        vo.setType(1); // platform admin
        LoginUser loginUser = new LoginUser(vo);
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(loginUser, null, null);
        SecurityContextHolder.getContext().setAuthentication(auth);

        DataAnalysisController controller = new DataAnalysisController();
        OrderSummaryDayService mockOrderSummaryDayService = mock(OrderSummaryDayService.class);
        when(mockOrderSummaryDayService.count()).thenReturn(1);
        ReflectionTestUtils.setField(controller, "orderSummaryDayService", mockOrderSummaryDayService);

        try {
            controller.platformRevenue("invalid-date", null, null);
            fail("Expected CustomException PARAM_ERROR");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.PARAM_ERROR, e.getExceptionEnum());
        }
    }

    @Test
    public void testShopReportServiceCalculatesSummarySeriesTopProductsAndTimePeriods() {
        Long shopId = 1L;
        LocalDate start = LocalDate.of(2026, 10, 20);
        LocalDate end = LocalDate.of(2026, 10, 22);

        OrderRawDto o1 = OrderRawDto.builder()
                .id("ord_1")
                .shopId(shopId)
                .payAmount(new BigDecimal("100000.00"))
                .createTime(LocalDate.of(2026, 10, 20).atTime(8, 0)) // breakfast
                .build();
        OrderRawDto o2 = OrderRawDto.builder()
                .id("ord_2")
                .shopId(shopId)
                .payAmount(new BigDecimal("200000.00"))
                .createTime(LocalDate.of(2026, 10, 22).atTime(12, 0)) // lunch
                .build();
        OrderRawDto o3 = OrderRawDto.builder()
                .id("ord_3")
                .shopId(shopId)
                .payAmount(new BigDecimal("150000.00"))
                .createTime(LocalDate.of(2026, 10, 22).atTime(19, 0)) // dinner
                .build();

        when(orderSummaryDayMapper.selectPaidOrdersByDateRange("2026-10-20", "2026-10-22", shopId))
                .thenReturn(Arrays.asList(o1, o2, o3));

        OrderItemRawDto i1 = OrderItemRawDto.builder()
                .orderId("ord_1")
                .shopId(shopId)
                .name("Phở Bò Tái Nạm")
                .quantity(2)
                .price(new BigDecimal("50000.00"))
                .build();
        OrderItemRawDto i2 = OrderItemRawDto.builder()
                .orderId("ord_2")
                .shopId(shopId)
                .name("Bún Chả Hà Nội")
                .quantity(3)
                .price(new BigDecimal("50000.00"))
                .build();
        OrderItemRawDto i3 = OrderItemRawDto.builder()
                .orderId("ord_3")
                .shopId(shopId)
                .name("Phở Bò Tái Nạm")
                .quantity(1)
                .price(new BigDecimal("50000.00"))
                .build();

        when(orderSummaryDayMapper.selectPaidOrderItemsByDateRange("2026-10-20", "2026-10-22", shopId))
                .thenReturn(Arrays.asList(i1, i2, i3));

        Map<String, Object> report = dailySummaryService.getShopReport(shopId, start, end, "day");
        assertNotNull(report);

        // 1. Summary
        @SuppressWarnings("unchecked")
        Map<String, Object> summary = (Map<String, Object>) report.get("summary");
        assertEquals(3L, ((Long) summary.get("orderCount")).longValue());
        assertEquals(new BigDecimal("450000.00"), summary.get("revenue"));
        assertEquals(new BigDecimal("150000.00"), summary.get("avgOrderValue"));
        assertEquals(6L, ((Long) summary.get("itemCount")).longValue()); // 2 + 3 + 1

        // 2. Series (3 days: 2026-10-20, 2026-10-21, 2026-10-22)
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> series = (List<Map<String, Object>>) report.get("series");
        assertEquals(3, series.size());
        assertEquals("2026-10-20", series.get(0).get("period"));
        assertEquals(1L, ((Long) series.get(0).get("orderCount")).longValue());
        assertEquals(new BigDecimal("100000.00"), series.get(0).get("revenue"));

        assertEquals("2026-10-21", series.get(1).get("period"));
        assertEquals(0L, ((Long) series.get(1).get("orderCount")).longValue());
        assertEquals(new BigDecimal("0.00"), series.get(1).get("revenue"));

        assertEquals("2026-10-22", series.get(2).get("period"));
        assertEquals(2L, ((Long) series.get(2).get("orderCount")).longValue());
        assertEquals(new BigDecimal("350000.00"), series.get(2).get("revenue"));

        // 3. Top Products (Bún Chả Hà Nội: 3, Phở Bò Tái Nạm: 3)
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> topProducts = (List<Map<String, Object>>) report.get("topProducts");
        assertEquals(2, topProducts.size());
        assertEquals(Integer.valueOf(3), topProducts.get(0).get("quantity"));
        assertEquals(Integer.valueOf(3), topProducts.get(1).get("quantity"));

        // 4. Time Periods (breakfast: 1, lunch: 1, dinner: 1, lateNight: 0)
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> timePeriods = (List<Map<String, Object>>) report.get("timePeriods");
        assertEquals(4, timePeriods.size());
        assertEquals("breakfast", timePeriods.get(0).get("key"));
        assertEquals(1L, ((Long) timePeriods.get(0).get("orderCount")).longValue());
        assertEquals(new BigDecimal("100000.00"), timePeriods.get(0).get("revenue"));

        assertEquals("lunch", timePeriods.get(1).get("key"));
        assertEquals(1L, ((Long) timePeriods.get(1).get("orderCount")).longValue());
        assertEquals(new BigDecimal("200000.00"), timePeriods.get(1).get("revenue"));

        assertEquals("dinner", timePeriods.get(2).get("key"));
        assertEquals(1L, ((Long) timePeriods.get(2).get("orderCount")).longValue());
        assertEquals(new BigDecimal("150000.00"), timePeriods.get(2).get("revenue"));

        assertEquals("lateNight", timePeriods.get(3).get("key"));
        assertEquals(0L, ((Long) timePeriods.get(3).get("orderCount")).longValue());
        assertEquals(new BigDecimal("0.00"), timePeriods.get(3).get("revenue"));
    }

    @Test
    public void testShopReportServiceGroupByWeekAndMonth() {
        Long shopId = 1L;
        LocalDate start = LocalDate.of(2026, 10, 1);
        LocalDate end = LocalDate.of(2026, 10, 22);

        when(orderSummaryDayMapper.selectPaidOrdersByDateRange("2026-10-01", "2026-10-22", shopId))
                .thenReturn(Collections.emptyList());
        when(orderSummaryDayMapper.selectPaidOrderItemsByDateRange("2026-10-01", "2026-10-22", shopId))
                .thenReturn(Collections.emptyList());

        Map<String, Object> weekReport = dailySummaryService.getShopReport(shopId, start, end, "week");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> weekSeries = (List<Map<String, Object>>) weekReport.get("series");
        assertTrue(weekSeries.size() >= 4);
        assertTrue(((String) weekSeries.get(0).get("period")).matches("\\d{4}-W\\d{2}"));

        Map<String, Object> monthReport = dailySummaryService.getShopReport(shopId, start, end, "month");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> monthSeries = (List<Map<String, Object>>) monthReport.get("series");
        assertEquals(1, monthSeries.size());
        assertEquals("2026-10", monthSeries.get(0).get("period"));
    }

    @Test
    public void testShopReportControllerMerchantAccessOwnShopSuccess() {
        LoginVo vo = new LoginVo();
        vo.setId(10L);
        vo.setType(2); // merchant
        vo.setShopId(1L);
        LoginUser loginUser = new LoginUser(vo);
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(loginUser, null, null);
        SecurityContextHolder.getContext().setAuthentication(auth);

        DataAnalysisController controller = new DataAnalysisController();
        DailySummaryService mockDailySummaryService = mock(DailySummaryService.class);
        ReflectionTestUtils.setField(controller, "dailySummaryService", mockDailySummaryService);

        when(mockDailySummaryService.getShopReport(eq(1L), any(), any(), eq("day")))
                .thenReturn(Collections.singletonMap("status", "ok"));

        Result result = controller.shopReport("2026-10-16", "2026-10-22", "day", 1L);
        assertNotNull(result);
        assertEquals(200, result.getCode().intValue());
    }

    @Test
    public void testShopReportControllerMerchantAccessOtherShopForbidden() {
        LoginVo vo = new LoginVo();
        vo.setId(10L);
        vo.setType(2); // merchant
        vo.setShopId(1L);
        LoginUser loginUser = new LoginUser(vo);
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(loginUser, null, null);
        SecurityContextHolder.getContext().setAuthentication(auth);

        DataAnalysisController controller = new DataAnalysisController();
        try {
            controller.shopReport("2026-10-16", "2026-10-22", "day", 2L);
            fail("Expected CustomException NO_OPERATOR_AUTH");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.NO_OPERATOR_AUTH, e.getExceptionEnum());
        }
    }

    @Test
    public void testShopReportControllerAdminAccessAnyShopSuccess() {
        LoginVo vo = new LoginVo();
        vo.setId(1L);
        vo.setType(1); // platform admin
        LoginUser loginUser = new LoginUser(vo);
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(loginUser, null, null);
        SecurityContextHolder.getContext().setAuthentication(auth);

        DataAnalysisController controller = new DataAnalysisController();
        DailySummaryService mockDailySummaryService = mock(DailySummaryService.class);
        ReflectionTestUtils.setField(controller, "dailySummaryService", mockDailySummaryService);

        when(mockDailySummaryService.getShopReport(eq(5L), any(), any(), eq("day")))
                .thenReturn(Collections.singletonMap("status", "ok"));

        Result result = controller.shopReport(null, null, null, 5L);
        assertNotNull(result);
        assertEquals(200, result.getCode().intValue());
    }

    @Test
    public void testShopReportControllerInvalidDateRangeThrowsParamError() {
        LoginVo vo = new LoginVo();
        vo.setId(1L);
        vo.setType(1); // platform admin
        LoginUser loginUser = new LoginUser(vo);
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(loginUser, null, null);
        SecurityContextHolder.getContext().setAuthentication(auth);

        DataAnalysisController controller = new DataAnalysisController();
        try {
            controller.shopReport("2026-10-25", "2026-10-20", "day", 1L);
            fail("Expected CustomException PARAM_ERROR");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.PARAM_ERROR, e.getExceptionEnum());
        }
    }
}

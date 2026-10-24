package com.linmour.order.service;

import com.linmour.mq.KafkaProducer;
import com.linmour.order.feign.ProductFeign;
import com.linmour.order.mapper.OrderInfoMapper;
import com.linmour.order.mapper.OrderItemMapper;
import com.linmour.order.pojo.Do.OrderInfo;
import com.linmour.order.pojo.Do.OrderItem;
import com.linmour.order.pojo.Dto.CheckoutDto;
import com.linmour.order.pojo.Dto.CreateOrderDto;
import com.linmour.order.pojo.Dto.OrderAllDto;
import com.linmour.order.service.impl.OrderInfoServiceImpl;
import com.linmour.security.dtos.Result;
import com.linmour.security.utils.RedisCache;
import com.linmour.security.utils.SecurityUtils;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;

import java.math.BigDecimal;
import java.util.*;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@RunWith(MockitoJUnitRunner.class)
public class OrderInfoServiceTest {

    @InjectMocks
    private OrderInfoServiceImpl orderInfoService;

    @Mock
    private OrderInfoMapper orderInfoMapper;

    @Mock
    private OrderItemService orderItemService;

    @Mock
    private OrderItemMapper orderItemMapper;

    @Mock
    private KafkaProducer kafkaProducer;

    @Mock
    private ProductFeign productFeign;

    @Mock
    private com.linmour.order.feign.SystemFeign systemFeign;

    @Mock
    private com.linmour.order.feign.RestaurantFeign restaurantFeign;

    @Mock
    private RedisCache redisCache;

    @Mock
    private RedissonClient redissonClient;

    @Before
    public void setUp() {
        SecurityUtils.setShopId(1L);
    }

    @After
    public void tearDown() {
        SecurityUtils.clearShopId();
    }

    @Test
    public void testCreateOrderSetsStatusZeroForNewItems() {
        CreateOrderDto dto = new CreateOrderDto();
        dto.setTableId(6L);
        dto.setAmount(new BigDecimal("55000"));
        dto.setRemark("Không ớt");

        OrderItem item1 = new OrderItem();
        item1.setProductId(1L);
        item1.setName("Phở Bò Tái Nạm");
        item1.setStatus(null); // status initially null

        OrderItem item2 = new OrderItem();
        item2.setProductId(2L);
        item2.setName("Trứng chần");
        item2.setStatus(null);

        dto.setOrderItems(Arrays.asList(item1, item2));

        when(redisCache.getAllHash(anyString())).thenReturn(Collections.emptyMap());

        Result result = orderInfoService.createOrder(dto);

        assertNotNull(result);
        assertEquals(Integer.valueOf(0), item1.getStatus());
        assertEquals(Integer.valueOf(0), item2.getStatus());

        verify(redisCache).setCacheList(eq("orderItem:1:6"), anyList());
    }

    @Test
    public void testUpdateOrderItemStatusTreatsNullOrZeroAsZeroAndTogglesToTwo() {
        OrderItem item = new OrderItem();
        item.setId(10L);
        item.setName("Phở Bò Tái Nạm");
        item.setStatus(null); // null status treated as 0, toggled to 2

        when(redisCache.getListValue("orderItem:1:6", 0L)).thenReturn(item);

        orderInfoService.updateOrderItemStatus("6", 0L);

        ArgumentCaptor<OrderItem> captor = ArgumentCaptor.forClass(OrderItem.class);
        verify(redisCache).setListValue(eq("orderItem:1:6"), eq(0L), captor.capture());

        OrderItem updated = captor.getValue();
        assertEquals(Integer.valueOf(2), updated.getStatus());

        ArgumentCaptor<String> channelCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object> msgCaptor = ArgumentCaptor.forClass(Object.class);
        verify(redisCache).convertAndSend(channelCaptor.capture(), msgCaptor.capture());
        assertEquals("item_status", channelCaptor.getValue());
        assertTrue(msgCaptor.getValue().toString().contains("\"status\":2"));
    }

    @Test
    public void testUpdateOrderItemStatusTogglesOneToTwo() {
        OrderItem item = new OrderItem();
        item.setId(10L);
        item.setName("Phở Bò Tái Nạm");
        item.setStatus(1); // 1 toggled to 2

        when(redisCache.getListValue("orderItem:1:6", 0L)).thenReturn(item);

        orderInfoService.updateOrderItemStatus("6", 0L);

        ArgumentCaptor<OrderItem> captor = ArgumentCaptor.forClass(OrderItem.class);
        verify(redisCache).setListValue(eq("orderItem:1:6"), eq(0L), captor.capture());

        OrderItem updated = captor.getValue();
        assertEquals(Integer.valueOf(2), updated.getStatus());
    }

    @Test
    public void testUpdateOrderItemStatusTogglesTwoToZero() {
        OrderItem item = new OrderItem();
        item.setId(10L);
        item.setName("Phở Bò Tái Nạm");
        item.setStatus(2);

        when(redisCache.getListValue("orderItem:1:6", 0L)).thenReturn(item);

        orderInfoService.updateOrderItemStatus("6", 0L);

        ArgumentCaptor<OrderItem> captor = ArgumentCaptor.forClass(OrderItem.class);
        verify(redisCache).setListValue(eq("orderItem:1:6"), eq(0L), captor.capture());

        OrderItem updated = captor.getValue();
        assertEquals(Integer.valueOf(0), updated.getStatus());
    }

    @Test
    public void testSetOrderItemStatusValid() {
        OrderItem item = new OrderItem();
        item.setId(10L);
        item.setName("Phở Bò Tái Nạm");
        item.setStatus(0);

        when(redisCache.getListValue("orderItem:1:6", 0L)).thenReturn(item);

        Result result = orderInfoService.setOrderItemStatus("6", 0L, 1);
        assertEquals(Integer.valueOf(200), result.getCode());

        ArgumentCaptor<OrderItem> captor = ArgumentCaptor.forClass(OrderItem.class);
        verify(redisCache).setListValue(eq("orderItem:1:6"), eq(0L), captor.capture());
        assertEquals(Integer.valueOf(1), captor.getValue().getStatus());

        ArgumentCaptor<String> channelCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object> msgCaptor = ArgumentCaptor.forClass(Object.class);
        verify(redisCache).convertAndSend(channelCaptor.capture(), msgCaptor.capture());
        assertEquals("item_status", channelCaptor.getValue());
        assertTrue(msgCaptor.getValue().toString().contains("\"status\":1"));
    }

    @Test
    public void testSetOrderItemStatusInvalidStatus() {
        Result r1 = orderInfoService.setOrderItemStatus("6", 0L, null);
        assertNotEquals(Integer.valueOf(200), r1.getCode());

        Result r2 = orderInfoService.setOrderItemStatus("6", 0L, 3);
        assertNotEquals(Integer.valueOf(200), r2.getCode());

        Result r3 = orderInfoService.setOrderItemStatus("6", 0L, -1);
        assertNotEquals(Integer.valueOf(200), r3.getCode());

        verify(redisCache, never()).setListValue(anyString(), anyLong(), any());
    }

    @Test
    public void testSetOrderItemStatusMissingShopId() {
        SecurityUtils.clearShopId();
        Result result = orderInfoService.setOrderItemStatus("6", 0L, 1);
        assertNotEquals(Integer.valueOf(200), result.getCode());
        assertEquals("Thiếu thông tin quán", result.getMsg());
    }

    @Test
    public void testSetOrderItemStatusItemNotFound() {
        when(redisCache.getListValue("orderItem:1:6", 99L)).thenReturn(null);

        Result result = orderInfoService.setOrderItemStatus("6", 99L, 2);
        assertNotEquals(Integer.valueOf(200), result.getCode());
        verify(redisCache, never()).setListValue(anyString(), anyLong(), any());
    }

    @Test
    public void testGetOpenOrdersUsesScanAndReturnsAllTables() {
        Set<String> scannedKeys = new HashSet<>(Arrays.asList("orderInfo:1:6", "orderInfo:1:7"));
        when(redisCache.scan("orderInfo:1:*")).thenReturn(scannedKeys);

        Map<String, Object> map6 = new HashMap<>();
        map6.put("id", "order_006");
        map6.put("tableId", 6L);
        map6.put("shopId", 1L);
        map6.put("payAmount", "55000");

        Map<String, Object> map7 = new HashMap<>();
        map7.put("id", "order_007");
        map7.put("tableId", 7L);
        map7.put("shopId", 1L);
        map7.put("payAmount", "80000");

        when(redisCache.getAllHash("orderInfo:1:6")).thenReturn(map6);
        when(redisCache.getAllHash("orderInfo:1:7")).thenReturn(map7);

        OrderItem item6 = new OrderItem();
        item6.setName("Món Bàn 6");
        when(redisCache.getCacheList("orderItem:1:6")).thenReturn(Collections.singletonList(item6));

        OrderItem item7 = new OrderItem();
        item7.setName("Món Bàn 7");
        when(redisCache.getCacheList("orderItem:1:7")).thenReturn(Collections.singletonList(item7));

        List<OrderAllDto> openOrders = orderInfoService.getOpenOrders();

        assertNotNull(openOrders);
        assertEquals(2, openOrders.size());
        assertEquals(Long.valueOf(6), openOrders.get(0).getOrderInfo().getTableId());
        assertEquals(Long.valueOf(7), openOrders.get(1).getOrderInfo().getTableId());
    }

    @Test
    public void testCheckoutPublishesTablePaidChannel() {
        RLock lock = mock(RLock.class);
        when(redissonClient.getLock(anyString())).thenReturn(lock);
        when(lock.isHeldByCurrentThread()).thenReturn(true);

        Map<String, Object> orderMap = new HashMap<>();
        orderMap.put("id", "order_12345");
        orderMap.put("tableId", 6L);
        orderMap.put("shopId", 1L);
        orderMap.put("payAmount", "100000");
        orderMap.put("payType", 4);
        when(redisCache.getAllHash("orderInfo:1:6")).thenReturn(orderMap);

        CheckoutDto checkoutDto = new CheckoutDto();
        checkoutDto.setTableId("6");
        checkoutDto.setPayType(4);

        Result result = orderInfoService.checkout(checkoutDto);
        assertNotNull(result);

        // Verify keys deleted
        verify(redisCache).deleteObject("orderInfo:1:6");
        verify(redisCache).deleteObject("orderItem:1:6");

        // Verify Redis convertAndSend published table_paid
        ArgumentCaptor<String> channelCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object> msgCaptor = ArgumentCaptor.forClass(Object.class);
        verify(redisCache).convertAndSend(channelCaptor.capture(), msgCaptor.capture());

        assertEquals("table_paid", channelCaptor.getValue());
        String payload = msgCaptor.getValue().toString();
        assertTrue(payload.contains("\"shopId\":1"));
        assertTrue(payload.contains("\"tableId\":\"6\""));
        assertTrue(payload.contains("\"orderId\":\"order_12345\""));
        assertTrue(payload.contains("\"payType\":4"));
        assertTrue(payload.contains("\"payAmount\":100000") || payload.contains("\"payAmount\":\"100000\""));
        assertTrue(payload.contains("\"tableName\":\"Bàn 06\"") || payload.contains("\"tableName\""));
        assertTrue(payload.contains("\"shopName\""));
        assertTrue(payload.contains("\"paidAt\""));
        assertTrue(payload.contains("\"items\""));
    }

    @Test
    public void testPlatformRevenueByAdminSuccess() {
        com.linmour.security.dtos.LoginUser loginUser = new com.linmour.security.dtos.LoginUser();
        loginUser.setLoginVo(new com.linmour.security.dtos.LoginVo(1L, 1)); // platform admin
        org.springframework.security.authentication.UsernamePasswordAuthenticationToken auth =
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginUser, null, null);
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(auth);

        OrderInfo o1 = new OrderInfo();
        o1.setId("1");
        o1.setShopId(1L);
        o1.setPayAmount(new BigDecimal("100000.00"));
        o1.setCreateTime(java.time.LocalDateTime.of(2024, 4, 11, 10, 0, 0));

        OrderInfo o2 = new OrderInfo();
        o2.setId("2");
        o2.setShopId(1L);
        o2.setPayAmount(new BigDecimal("200000.00"));
        o2.setCreateTime(java.time.LocalDateTime.of(2024, 4, 11, 12, 0, 0));

        OrderInfo o3 = new OrderInfo();
        o3.setId("3");
        o3.setShopId(2L);
        o3.setPayAmount(new BigDecimal("150000.00"));
        o3.setCreateTime(java.time.LocalDateTime.of(2024, 4, 12, 14, 0, 0));

        when(orderInfoMapper.selectList(any())).thenReturn(Arrays.asList(o1, o2, o3));

        com.linmour.system.pojo.Do.Shop s1 = new com.linmour.system.pojo.Do.Shop();
        s1.setId(1L);
        s1.setName("Quán Bún Chả");
        s1.setFeeRate(new BigDecimal("5.00")); // 5%

        com.linmour.system.pojo.Do.Shop s2 = new com.linmour.system.pojo.Do.Shop();
        s2.setId(2L);
        s2.setName("Quán Phở Bò");
        s2.setFeeRate(new BigDecimal("10.00")); // 10%

        when(systemFeign.getShopByIds(anyList())).thenReturn(Arrays.asList(s1, s2));

        Result result = orderInfoService.getPlatformRevenue("2024-04-11", "2024-04-12", null);
        assertNotNull(result);
        assertEquals(200, result.getCode().intValue());

        com.linmour.order.pojo.Dto.PlatformRevenueDto dto = (com.linmour.order.pojo.Dto.PlatformRevenueDto) result.getData();
        assertNotNull(dto);
        // Total revenue: 100k + 200k + 150k = 450k
        assertEquals(new BigDecimal("450000.00"), dto.getTotalRevenue());
        // Quán 1: 300k * 5% = 15k
        // Quán 2: 150k * 10% = 15k
        // Total commission: 15k + 15k = 30k
        assertEquals(new BigDecimal("30000.00"), dto.getTotalCommission());
        assertEquals(Long.valueOf(3), dto.getOrderCount());
        assertEquals(2, dto.getShopBreakdown().size());

        org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }

    @Test
    public void testPlatformRevenueByRegularMerchantThrowsForbidden() {
        com.linmour.security.dtos.LoginUser loginUser = new com.linmour.security.dtos.LoginUser();
        loginUser.setLoginVo(new com.linmour.security.dtos.LoginVo(25L, 2)); // regular merchant
        org.springframework.security.authentication.UsernamePasswordAuthenticationToken auth =
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginUser, null, null);
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(auth);

        try {
            orderInfoService.getPlatformRevenue("2024-04-11", "2024-04-12", null);
            fail("Expected CustomException 403 NO_OPERATOR_AUTH");
        } catch (com.linmour.security.exception.CustomException e) {
            assertEquals(com.linmour.security.exception.enums.AppHttpCodeEnum.NO_OPERATOR_AUTH, e.getExceptionEnum());
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    @Test
    public void testPlatformRevenueNoOrdersReturnsZero() {
        com.linmour.security.dtos.LoginUser loginUser = new com.linmour.security.dtos.LoginUser();
        loginUser.setLoginVo(new com.linmour.security.dtos.LoginVo(1L, 1));
        org.springframework.security.authentication.UsernamePasswordAuthenticationToken auth =
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginUser, null, null);
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(auth);

        when(orderInfoMapper.selectList(any())).thenReturn(Collections.emptyList());

        Result result = orderInfoService.getPlatformRevenue("2024-04-11", "2024-04-12", null);
        assertNotNull(result);
        assertEquals(200, result.getCode().intValue());

        com.linmour.order.pojo.Dto.PlatformRevenueDto dto = (com.linmour.order.pojo.Dto.PlatformRevenueDto) result.getData();
        assertNotNull(dto);
        assertEquals(new BigDecimal("0.00"), dto.getTotalRevenue());
        assertEquals(new BigDecimal("0.00"), dto.getTotalCommission());
        assertEquals(Long.valueOf(0), dto.getOrderCount());
        assertTrue(dto.getShopBreakdown().isEmpty());

        org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }

    @Test
    public void testCreateOrderWithoutShopIdReturnsError() {
        SecurityUtils.clearShopId();
        CreateOrderDto dto = new CreateOrderDto();
        dto.setTableId(6L);
        dto.setAmount(new BigDecimal("55000"));
        dto.setShopId(null);
        OrderItem item = new OrderItem();
        item.setProductId(1L);
        dto.setOrderItems(Collections.singletonList(item));

        Result result = orderInfoService.createOrder(dto);
        assertNotNull(result);
        assertEquals(514, result.getCode().intValue());
        assertEquals("Thiếu shopId", result.getMsg());
    }

    @Test
    public void testCheckoutWithoutExistingOrderReturnsError() {
        CheckoutDto dto = new CheckoutDto();
        dto.setTableId("6");
        dto.setPayType(4);

        when(redisCache.getAllHash(eq("orderInfo:1:6"))).thenReturn(Collections.emptyMap());
        org.redisson.api.RLock mockLock = mock(org.redisson.api.RLock.class);
        when(redissonClient.getLock("lock:checkout:1:6")).thenReturn(mockLock);

        Result result = orderInfoService.checkout(dto);
        assertNotNull(result);
        assertEquals(514, result.getCode().intValue());
        assertEquals("Không tìm thấy đơn hàng cho bàn này", result.getMsg());
        verify(orderInfoMapper, never()).insert(any(OrderInfo.class));
    }

    @Test
    public void testCheckoutWithoutShopIdReturnsError() {
        SecurityUtils.clearShopId();
        CheckoutDto dto = new CheckoutDto();
        dto.setTableId("6");
        dto.setPayType(4);

        Result result = orderInfoService.checkout(dto);
        assertNotNull(result);
        assertEquals(514, result.getCode().intValue());
        assertEquals("Thiếu shopId", result.getMsg());
        verify(orderInfoMapper, never()).insert(any(OrderInfo.class));
    }

    @Test
    public void testGetOpenOrdersWithoutShopId_Throws400() {
        SecurityUtils.clearShopId();
        try {
            orderInfoService.getOpenOrders();
            fail("Expected CustomException 400 when shopId is missing");
        } catch (com.linmour.security.exception.CustomException e) {
            assertEquals(400, e.getCode());
            assertTrue(e.getMessage().contains("quán ăn"));
        }
    }

    @Test
    public void testGetOrderByShopIdWithoutShopId_Throws400() {
        SecurityUtils.clearShopId();
        try {
            orderInfoService.GetOrderByShopId();
            fail("Expected CustomException 400 when shopId is missing");
        } catch (com.linmour.security.exception.CustomException e) {
            assertEquals(400, e.getCode());
            assertTrue(e.getMessage().contains("quán ăn"));
        }
    }

    @Test
    public void testGetOrderPayAmountWithoutShopId_Throws400() {
        SecurityUtils.clearAll();
        com.linmour.security.dtos.LoginUser loginUser = new com.linmour.security.dtos.LoginUser();
        loginUser.setLoginVo(new com.linmour.security.dtos.LoginVo(1L, 2)); // merchant
        org.springframework.security.authentication.UsernamePasswordAuthenticationToken auth =
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginUser, null, null);
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(auth);

        try {
            orderInfoService.getOrderPayAmount(new com.linmour.order.pojo.Dto.OrderInfoPage());
            fail("Expected CustomException 400 when shopId is missing for merchant");
        } catch (com.linmour.security.exception.CustomException e) {
            assertEquals(400, e.getCode());
            assertTrue(e.getMessage().contains("quán ăn"));
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }
}

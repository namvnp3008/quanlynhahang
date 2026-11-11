package com.linmour.order.service;

import com.linmour.order.pojo.Dto.CheckoutDto;
import com.linmour.order.pojo.Dto.CreateOrderDto;
import com.linmour.order.service.impl.OrderInfoServiceImpl;
import com.linmour.security.dtos.Result;
import com.linmour.security.utils.RedisCache;
import com.linmour.security.utils.SecurityUtils;
import com.linmour.order.mapper.OrderInfoMapper;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;

import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@RunWith(MockitoJUnitRunner.Silent.class)
public class OrderInfoGuardTest {

    @InjectMocks private OrderInfoServiceImpl orderInfoService;
    @Mock private RedisCache redisCache;
    @Mock private RedissonClient redissonClient;
    @Mock private RLock lock;
    @Mock private OrderInfoMapper orderInfoMapper;

    @Before
    public void setUp() {
        SecurityUtils.setShopId(1L);
        when(redissonClient.getLock(anyString())).thenReturn(lock);
        when(lock.isHeldByCurrentThread()).thenReturn(true);
    }

    @After
    public void tearDown() {
        SecurityUtils.clearShopId();
    }

    @Test
    public void createOrder_NegativeTableId_Rejected() {
        CreateOrderDto dto = new CreateOrderDto();
        dto.setTableId(-12L);
        Result r = orderInfoService.createOrder(dto);
        assertEquals(400, r.getCode().intValue());
        assertEquals("Bàn không hợp lệ", r.getMsg());
        verify(redisCache, never()).getAllHash(anyString());
    }

    @Test
    public void checkout_TakeawayTicket_Rejected() {
        Map<String, Object> hash = new HashMap<>();
        hash.put("id", "9001");
        hash.put("orderType", 1);
        when(redisCache.getAllHash("orderInfo:1:-12")).thenReturn(hash);
        CheckoutDto dto = new CheckoutDto();
        dto.setTableId("-12");
        dto.setPayType(4);
        Result r = orderInfoService.checkout(dto);
        assertEquals(400, r.getCode().intValue());
        assertEquals("Đơn mang về đã thanh toán, không sửa được", r.getMsg());
        verify(orderInfoMapper, never()).insert(any());
        verify(redisCache, never()).setHashValue(anyString(), anyString(), any());
    }
}

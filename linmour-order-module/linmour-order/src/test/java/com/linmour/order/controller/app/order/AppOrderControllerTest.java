package com.linmour.order.controller.app.order;

import com.linmour.order.pojo.Dto.CreateOrderDto;
import com.linmour.order.service.OrderInfoService;
import com.linmour.order.service.PayosPaymentService;
import com.linmour.security.dtos.Result;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@RunWith(MockitoJUnitRunner.class)
public class AppOrderControllerTest {

    @Mock
    private OrderInfoService orderInfoService;

    @Mock
    private PayosPaymentService payosPaymentService;

    @InjectMocks
    private AppOrderController appOrderController;

    @Test
    public void testInsecureEndpointsRemoved() {
        List<String> methodNames = Arrays.stream(AppOrderController.class.getDeclaredMethods())
                .map(Method::getName)
                .collect(Collectors.toList());

        // SEC-0: Ensure public client checkout and order query endpoints are deleted
        assertFalse("checkout must be removed from AppOrderController", methodNames.contains("checkout"));
        assertFalse("GetHistoryOrderList must be removed from AppOrderController", methodNames.contains("GetHistoryOrderList"));
        assertFalse("GetOrderInfoDetail must be removed from AppOrderController", methodNames.contains("GetOrderInfoDetail"));
    }

    @Test
    public void testSecureEndpointsRetained() {
        List<String> methodNames = Arrays.stream(AppOrderController.class.getDeclaredMethods())
                .map(Method::getName)
                .collect(Collectors.toList());

        assertTrue(methodNames.contains("createOrder"));
        assertTrue(methodNames.contains("getCurrentOrderInfo"));
        assertTrue(methodNames.contains("payosCreate"));
        assertTrue(methodNames.contains("payosWebhook"));
    }

    @Test
    public void testGetCurrentOrderInfoDelegatesToService() {
        when(orderInfoService.GetCurrentOrderInfo(5L)).thenReturn(null);

        Result result = appOrderController.getCurrentOrderInfo(5L);
        assertNotNull(result);
        assertEquals((Integer) 200, (Integer) result.getCode());
        verify(orderInfoService).GetCurrentOrderInfo(5L);
    }

    @Test
    public void testCreateOrderDelegatesToService() {
        CreateOrderDto dto = new CreateOrderDto();
        dto.setTableId(5L);
        when(orderInfoService.createOrder(any())).thenReturn(Result.success());

        Result result = appOrderController.createOrder(dto);
        assertNotNull(result);
        assertEquals((Integer) 200, (Integer) result.getCode());
        verify(orderInfoService).createOrder(dto);
    }

    @Test
    public void testTableTokenMismatchEnforcement() {
        try {
            // Client has session for table 3
            com.linmour.security.utils.SecurityUtils.setTableId(3L);
            com.linmour.security.utils.SecurityUtils.setShopId(1L);

            // 1. GetCurrentOrderInfo for table 4 -> 403
            Result resInfo = appOrderController.getCurrentOrderInfo(4L);
            assertNotNull(resInfo);
            assertEquals((Integer) 403, (Integer) resInfo.getCode());
            assertTrue(resInfo.getMsg().contains("Không thể thao tác trên bàn khác"));

            // 2. PayosCreate for table 4 -> 403
            com.linmour.order.pojo.Dto.PayosCreateReqDto payosDto = new com.linmour.order.pojo.Dto.PayosCreateReqDto(4L);
            Result resPayos = appOrderController.payosCreate(1L, payosDto);
            assertNotNull(resPayos);
            assertEquals((Integer) 403, (Integer) resPayos.getCode());
            assertTrue(resPayos.getMsg().contains("Không thể thao tác trên bàn khác"));

            // 3. CreateOrder for table 4 -> 403
            CreateOrderDto orderDto = new CreateOrderDto();
            orderDto.setTableId(4L);
            Result resOrder = appOrderController.createOrder(orderDto);
            assertNotNull(resOrder);
            assertEquals((Integer) 403, (Integer) resOrder.getCode());
            assertTrue(resOrder.getMsg().contains("Không thể thao tác trên bàn khác"));
        } finally {
            com.linmour.security.utils.SecurityUtils.clearAll();
        }
    }
}

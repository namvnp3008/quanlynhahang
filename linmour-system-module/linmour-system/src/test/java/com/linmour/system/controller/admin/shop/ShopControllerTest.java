package com.linmour.system.controller.admin.shop;

import com.linmour.security.dtos.Result;
import com.linmour.security.exception.CustomException;
import com.linmour.security.exception.enums.AppHttpCodeEnum;
import com.linmour.system.pojo.Do.Shop;
import com.linmour.system.service.ShopPaymentConfigService;
import com.linmour.system.service.ShopService;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

@RunWith(MockitoJUnitRunner.class)
public class ShopControllerTest {

    @Mock
    private ShopService shopService;

    @Mock
    private ShopPaymentConfigService shopPaymentConfigService;

    @InjectMocks
    private ShopController shopController;

    private final String INTERNAL_TOKEN = "test-internal-token-xyz";

    @Before
    public void setUp() {
        ReflectionTestUtils.setField(shopController, "internalToken", INTERNAL_TOKEN);
    }

    @Test
    public void testGetShopByIdsWithValidInternalToken() {
        Shop shop = new Shop();
        shop.setId(1L);
        shop.setName("Quán Test");
        when(shopService.getShopByIds(Collections.singletonList(1L)))
                .thenReturn(Collections.singletonList(shop));

        List<Shop> result = shopController.getShopByIds(Collections.singletonList(1L), INTERNAL_TOKEN);
        assertNotNull(result);
        assertEquals(1, result.size());
        assertEquals("Quán Test", result.get(0).getName());
        verify(shopService, times(1)).getShopByIds(Collections.singletonList(1L));
    }

    @Test
    public void testGetShopByIdsMissingInternalTokenThrows403() {
        try {
            shopController.getShopByIds(Collections.singletonList(1L), null);
            fail("Phải ném CustomException khi thiếu X-Internal-Token");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.NO_OPERATOR_AUTH, e.getExceptionEnum());
        }
        verify(shopService, never()).getShopByIds(any());
    }

    @Test
    public void testGetShopByIdsWrongInternalTokenThrows403() {
        try {
            shopController.getShopByIds(Collections.singletonList(1L), "wrong-token");
            fail("Phải ném CustomException khi sai X-Internal-Token");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.NO_OPERATOR_AUTH, e.getExceptionEnum());
        }
        verify(shopService, never()).getShopByIds(any());
    }

    @Test
    public void testGetMerchantShopIdsWithValidInternalToken() {
        when(shopService.getShopIdsByMerchantId(1L)).thenReturn(Arrays.asList(1L, 2L));

        Result<List<Long>> result = shopController.getMerchantShopIds(1L, INTERNAL_TOKEN);
        assertNotNull(result);
        assertEquals(200, result.getCode().intValue());
        assertEquals(Arrays.asList(1L, 2L), result.getData());
        verify(shopService, times(1)).getShopIdsByMerchantId(1L);
    }

    @Test
    public void testGetMerchantShopIdsMissingInternalTokenThrows403() {
        try {
            shopController.getMerchantShopIds(1L, null);
            fail("Phải ném CustomException khi thiếu X-Internal-Token");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.NO_OPERATOR_AUTH, e.getExceptionEnum());
        }
        verify(shopService, never()).getShopIdsByMerchantId(any());
    }

    @Test
    public void testGetMerchantShopIdsWrongInternalTokenThrows403() {
        try {
            shopController.getMerchantShopIds(1L, "invalid-token");
            fail("Phải ném CustomException khi sai X-Internal-Token");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.NO_OPERATOR_AUTH, e.getExceptionEnum());
        }
        verify(shopService, never()).getShopIdsByMerchantId(any());
    }
}

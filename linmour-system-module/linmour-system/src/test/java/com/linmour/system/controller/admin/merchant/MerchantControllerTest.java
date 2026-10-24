package com.linmour.system.controller.admin.merchant;

import com.linmour.security.exception.CustomException;
import com.linmour.security.exception.enums.AppHttpCodeEnum;
import com.linmour.system.pojo.Do.Merchant;
import com.linmour.system.service.MerchantService;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Collections;
import java.util.List;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

@RunWith(MockitoJUnitRunner.class)
public class MerchantControllerTest {

    @Mock
    private MerchantService merchantService;

    @InjectMocks
    private MerchantController merchantController;

    private final String INTERNAL_TOKEN = "test-internal-token-merchant";

    @Before
    public void setUp() {
        ReflectionTestUtils.setField(merchantController, "internalToken", INTERNAL_TOKEN);
    }

    @Test
    public void testGetMerchantByIdsWithValidInternalToken() {
        Merchant merchant = new Merchant();
        merchant.setId(1L);
        merchant.setRealName("Chủ Quán 1");
        when(merchantService.getMerchantByIds(Collections.singletonList(1L)))
                .thenReturn(Collections.singletonList(merchant));

        List<Merchant> result = merchantController.getMerchantByIds(Collections.singletonList(1L), INTERNAL_TOKEN);
        assertNotNull(result);
        assertEquals(1, result.size());
        assertEquals("Chủ Quán 1", result.get(0).getRealName());
        verify(merchantService, times(1)).getMerchantByIds(Collections.singletonList(1L));
    }

    @Test
    public void testGetMerchantByIdsMissingInternalTokenThrows403() {
        try {
            merchantController.getMerchantByIds(Collections.singletonList(1L), null);
            fail("Phải ném CustomException khi thiếu X-Internal-Token");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.NO_OPERATOR_AUTH, e.getExceptionEnum());
        }
        verify(merchantService, never()).getMerchantByIds(any());
    }

    @Test
    public void testGetMerchantByIdsWrongInternalTokenThrows403() {
        try {
            merchantController.getMerchantByIds(Collections.singletonList(1L), "wrong-token");
            fail("Phải ném CustomException khi sai X-Internal-Token");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.NO_OPERATOR_AUTH, e.getExceptionEnum());
        }
        verify(merchantService, never()).getMerchantByIds(any());
    }
}

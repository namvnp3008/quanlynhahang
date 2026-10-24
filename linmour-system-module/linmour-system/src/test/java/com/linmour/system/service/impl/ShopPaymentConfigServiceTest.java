package com.linmour.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.linmour.security.dtos.LoginUser;
import com.linmour.security.dtos.LoginVo;
import com.linmour.security.dtos.Result;
import com.linmour.security.exception.CustomException;
import com.linmour.security.exception.enums.AppHttpCodeEnum;
import com.linmour.security.utils.LoginAttemptService;
import com.linmour.security.utils.AesGcmUtil;
import com.linmour.system.controller.admin.shop.ShopController;
import com.linmour.system.mapper.MerchantMapper;
import com.linmour.system.mapper.ShopPaymentConfigMapper;
import com.linmour.system.pojo.Do.Merchant;
import com.linmour.system.pojo.Do.ShopPaymentConfig;
import com.linmour.system.pojo.Dto.PayosConfigDto;
import com.linmour.system.pojo.Dto.PayosConfigReqDto;
import com.linmour.system.pojo.Dto.PayosConfigRespDto;
import com.linmour.system.service.ShopPaymentConfigService;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@RunWith(MockitoJUnitRunner.class)
public class ShopPaymentConfigServiceTest {

    @InjectMocks
    private ShopPaymentConfigServiceImpl shopPaymentConfigService;

    @Mock
    private ShopPaymentConfigMapper shopPaymentConfigMapper;

    @Mock
    private MerchantMapper merchantMapper;

    @Mock
    private LoginAttemptService loginAttemptService;

    @Mock
    private com.linmour.system.service.AuditService auditService;

    @Mock
    private com.linmour.system.service.PayosKeyValidator payosKeyValidator;

    private static final String MASTER_KEY = "test-master-payos-secret-key-123456";
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @Before
    public void setUp() {
        ReflectionTestUtils.setField(shopPaymentConfigService, "baseMapper", shopPaymentConfigMapper);
        ReflectionTestUtils.setField(shopPaymentConfigService, "payosConfigSecret", MASTER_KEY);
    }

    @After
    public void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private void authenticateUser(Long merchantId) {
        LoginVo vo = new LoginVo();
        vo.setId(merchantId);
        vo.setType(2);
        vo.setShopId(1L);
        LoginUser loginUser = new LoginUser(vo);
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(loginUser, null, null);
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    @Test
    public void testGetPayosConfigReturnsMaskedClientIdAndNoRawKeys() {
        Long shopId = 1L;
        String clientId = "payos_client_abc1234";
        String encClientId = AesGcmUtil.encrypt(clientId, MASTER_KEY);
        String encApiKey = AesGcmUtil.encrypt("secret_api_key", MASTER_KEY);
        String encChecksum = AesGcmUtil.encrypt("secret_checksum", MASTER_KEY);
        java.time.LocalDateTime now = java.time.LocalDateTime.now();

        ShopPaymentConfig config = ShopPaymentConfig.builder()
                .shopId(shopId)
                .clientIdEnc(encClientId)
                .apiKeyEnc(encApiKey)
                .checksumKeyEnc(encChecksum)
                .enabled(1)
                .updatedBy(10L)
                .updatedByName("Admin Test")
                .updatedIp("127.0.0.1")
                .validatedAt(now)
                .validationResult("SUCCESS")
                .updateTime(now)
                .deleted(0)
                .build();

        doReturn(config).when(shopPaymentConfigMapper).selectOne(any());

        PayosConfigRespDto resp = shopPaymentConfigService.getPayosConfig(shopId);
        assertNotNull(resp);
        assertTrue(resp.getConfigured());
        assertTrue(resp.getEnabled());
        assertEquals("••••1234", resp.getClientIdMasked());
        assertEquals("Admin Test", resp.getLastChangedByName());
        assertEquals("127.0.0.1", resp.getLastChangedIp());
        assertEquals(now, resp.getLastChangedAt());
        assertEquals(now, resp.getValidatedAt());
        assertEquals("SUCCESS", resp.getValidationResult());
    }

    @Test
    public void testGetPayosConfigWhenNotConfigured() {
        Long shopId = 2L;
        doReturn(null).when(shopPaymentConfigMapper).selectOne(any());

        PayosConfigRespDto resp = shopPaymentConfigService.getPayosConfig(shopId);
        assertNotNull(resp);
        assertFalse(resp.getConfigured());
        assertFalse(resp.getEnabled());
        assertNull(resp.getClientIdMasked());
    }

    @Test
    public void testGetInternalPayosConfigDecryptsAllKeys() {
        Long shopId = 1L;
        String clientId = "my_client_id";
        String apiKey = "my_api_key";
        String checksumKey = "my_checksum_key";

        ShopPaymentConfig config = ShopPaymentConfig.builder()
                .shopId(shopId)
                .clientIdEnc(AesGcmUtil.encrypt(clientId, MASTER_KEY))
                .apiKeyEnc(AesGcmUtil.encrypt(apiKey, MASTER_KEY))
                .checksumKeyEnc(AesGcmUtil.encrypt(checksumKey, MASTER_KEY))
                .enabled(1)
                .deleted(0)
                .build();

        doReturn(config).when(shopPaymentConfigMapper).selectOne(any());

        PayosConfigDto internal = shopPaymentConfigService.getInternalPayosConfig(shopId);
        assertNotNull(internal);
        assertEquals(shopId, internal.getShopId());
        assertEquals(clientId, internal.getClientId());
        assertEquals(apiKey, internal.getApiKey());
        assertEquals(checksumKey, internal.getChecksumKey());
        assertTrue(internal.getEnabled());
    }

    @Test
    public void testSavePayosConfigRequiresAuthentication() {
        PayosConfigReqDto req = PayosConfigReqDto.builder()
                .clientId("client_001")
                .apiKey("api_001")
                .checksumKey("checksum_001")
                .currentPassword("test1234")
                .build();

        Result res = shopPaymentConfigService.saveOrUpdatePayosConfig(1L, req);
        assertNotNull(res);
        assertEquals(Integer.valueOf(AppHttpCodeEnum.NEED_LOGIN.getCode()), res.getCode());
    }

    @Test
    public void testSavePayosConfigLockedOutBruteForce() {
        Long merchantId = 10L;
        authenticateUser(merchantId);

        Merchant merchant = new Merchant();
        merchant.setId(merchantId);
        merchant.setPhone("0901234567");
        merchant.setPassword(passwordEncoder.encode("correctPassword1"));
        when(merchantMapper.selectById(merchantId)).thenReturn(merchant);

        when(loginAttemptService.getRetryAfterSeconds(eq("0901234567"), any())).thenReturn(300L);

        PayosConfigReqDto req = PayosConfigReqDto.builder()
                .clientId("client_001")
                .apiKey("api_001")
                .checksumKey("checksum_001")
                .currentPassword("correctPassword1")
                .build();

        Result res = shopPaymentConfigService.saveOrUpdatePayosConfig(1L, req);
        assertNotNull(res);
        assertEquals(Integer.valueOf(429), res.getCode());
        verify(shopPaymentConfigMapper, never()).insert(any());
        verify(shopPaymentConfigMapper, never()).updateById(any());
    }

    @Test
    public void testSavePayosConfigWrongPasswordFails() {
        Long merchantId = 10L;
        authenticateUser(merchantId);

        Merchant merchant = new Merchant();
        merchant.setId(merchantId);
        merchant.setPhone("0901234567");
        merchant.setPassword(passwordEncoder.encode("correctPassword1"));
        when(merchantMapper.selectById(merchantId)).thenReturn(merchant);
        when(loginAttemptService.getRetryAfterSeconds(eq("0901234567"), any())).thenReturn(0L);

        PayosConfigReqDto req = PayosConfigReqDto.builder()
                .clientId("client_001")
                .apiKey("api_001")
                .checksumKey("checksum_001")
                .currentPassword("wrongPassword123")
                .build();

        Result res = shopPaymentConfigService.saveOrUpdatePayosConfig(1L, req);
        assertNotNull(res);
        assertEquals(Integer.valueOf(403), res.getCode());
        verify(loginAttemptService).recordFailure(eq("0901234567"), any());
        verify(shopPaymentConfigMapper, never()).insert(any());
    }

    @Test
    public void testSavePayosConfigCreatesNewEncryptedRecordWithAuditFields() {
        Long merchantId = 10L;
        authenticateUser(merchantId);

        Merchant merchant = new Merchant();
        merchant.setId(merchantId);
        merchant.setPhone("0901234567");
        merchant.setRealName("Nguyen Van A");
        merchant.setPassword(passwordEncoder.encode("correctPassword1"));
        merchant.setOtpEnabled(0);
        when(merchantMapper.selectById(merchantId)).thenReturn(merchant);
        when(loginAttemptService.getRetryAfterSeconds(eq("0901234567"), any())).thenReturn(0L);
        when(payosKeyValidator.validate(eq("client_001"), eq("api_001"), eq("checksum_001")))
                .thenReturn(Result.success("SUCCESS"));

        Long shopId = 1L;
        doReturn(null).when(shopPaymentConfigMapper).selectOne(any());

        PayosConfigReqDto req = PayosConfigReqDto.builder()
                .clientId("client_001")
                .apiKey("api_001")
                .checksumKey("checksum_001")
                .enabled(true)
                .currentPassword("correctPassword1")
                .build();

        Result res = shopPaymentConfigService.saveOrUpdatePayosConfig(shopId, req);
        assertNotNull(res);
        assertEquals(Integer.valueOf(200), res.getCode());

        verify(loginAttemptService).recordSuccess("0901234567");

        ArgumentCaptor<ShopPaymentConfig> captor = ArgumentCaptor.forClass(ShopPaymentConfig.class);
        verify(shopPaymentConfigMapper).insert(captor.capture());

        ShopPaymentConfig saved = captor.getValue();
        assertEquals(shopId, saved.getShopId());
        assertEquals(Integer.valueOf(1), saved.getEnabled());
        assertEquals(merchantId, saved.getUpdatedBy());
        assertEquals("Nguyen Van A", saved.getUpdatedByName());
        assertEquals("127.0.0.1", saved.getUpdatedIp());
        assertEquals("SUCCESS", saved.getValidationResult());
        assertNotNull(saved.getValidatedAt());
        assertNotNull(saved.getClientIdEnc());
        assertNotNull(saved.getApiKeyEnc());
        assertNotNull(saved.getChecksumKeyEnc());

        // Verify decrypted values match original
        assertEquals("client_001", AesGcmUtil.decrypt(saved.getClientIdEnc(), MASTER_KEY));
        assertEquals("api_001", AesGcmUtil.decrypt(saved.getApiKeyEnc(), MASTER_KEY));
        assertEquals("checksum_001", AesGcmUtil.decrypt(saved.getChecksumKeyEnc(), MASTER_KEY));
    }

    @Test
    public void testSavePayosConfigValidationFailsDoesNotSave() {
        Long merchantId = 10L;
        authenticateUser(merchantId);

        Merchant merchant = new Merchant();
        merchant.setId(merchantId);
        merchant.setPhone("0901234567");
        merchant.setPassword(passwordEncoder.encode("correctPassword1"));
        merchant.setOtpEnabled(0);
        when(merchantMapper.selectById(merchantId)).thenReturn(merchant);
        when(loginAttemptService.getRetryAfterSeconds(eq("0901234567"), any())).thenReturn(0L);

        when(payosKeyValidator.validate(eq("client_001"), eq("api_001"), eq("checksum_001")))
                .thenReturn(Result.error(400, "Key PayOS không hợp lệ: Cổng thanh toán tạm dừng"));

        Long shopId = 1L;
        doReturn(null).when(shopPaymentConfigMapper).selectOne(any());

        PayosConfigReqDto req = PayosConfigReqDto.builder()
                .clientId("client_001")
                .apiKey("api_001")
                .checksumKey("checksum_001")
                .enabled(true)
                .currentPassword("correctPassword1")
                .build();

        Result res = shopPaymentConfigService.saveOrUpdatePayosConfig(shopId, req);
        assertNotNull(res);
        assertEquals(Integer.valueOf(400), res.getCode());
        assertTrue(res.getMsg().contains("Cổng thanh toán tạm dừng"));

        verify(shopPaymentConfigMapper, never()).insert(any());
        verify(shopPaymentConfigMapper, never()).updateById(any());
    }

    @Test
    public void testSavePayosConfigDisablingOnlySkipsValidation() {
        Long merchantId = 10L;
        authenticateUser(merchantId);

        Merchant merchant = new Merchant();
        merchant.setId(merchantId);
        merchant.setPhone("0901234567");
        merchant.setPassword(passwordEncoder.encode("correctPassword1"));
        merchant.setOtpEnabled(0);
        when(merchantMapper.selectById(merchantId)).thenReturn(merchant);
        when(loginAttemptService.getRetryAfterSeconds(eq("0901234567"), any())).thenReturn(0L);

        Long shopId = 1L;
        ShopPaymentConfig existing = ShopPaymentConfig.builder()
                .shopId(shopId)
                .clientIdEnc(AesGcmUtil.encrypt("c", MASTER_KEY))
                .apiKeyEnc(AesGcmUtil.encrypt("a", MASTER_KEY))
                .checksumKeyEnc(AesGcmUtil.encrypt("k", MASTER_KEY))
                .enabled(1)
                .deleted(0)
                .build();
        doReturn(existing).when(shopPaymentConfigMapper).selectOne(any());

        PayosConfigReqDto req = PayosConfigReqDto.builder()
                .enabled(false)
                .currentPassword("correctPassword1")
                .build();

        Result res = shopPaymentConfigService.saveOrUpdatePayosConfig(shopId, req);
        assertNotNull(res);
        assertEquals(Integer.valueOf(200), res.getCode());

        verifyNoInteractions(payosKeyValidator);
        verify(shopPaymentConfigMapper).updateById(existing);
        assertEquals(Integer.valueOf(0), existing.getEnabled());
    }

    @Test
    public void testShopControllerPayosConfigMerchantPermissions() {
        LoginVo vo = new LoginVo();
        vo.setId(10L);
        vo.setType(2); // merchant
        vo.setShopId(1L);
        LoginUser loginUser = new LoginUser(vo);
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(loginUser, null, null);
        SecurityContextHolder.getContext().setAuthentication(auth);

        ShopController controller = new ShopController();
        ShopPaymentConfigService mockService = mock(ShopPaymentConfigService.class);
        ReflectionTestUtils.setField(controller, "shopPaymentConfigService", mockService);

        when(mockService.getPayosConfig(1L))
                .thenReturn(PayosConfigRespDto.builder().configured(true).enabled(true).clientIdMasked("••••9999").build());

        // Merchant accessing own shop
        Result res = controller.getPayosConfig(1L, null);
        assertNotNull(res);
        assertEquals(200, res.getCode().intValue());

        // Merchant accessing other shop -> 403
        try {
            controller.getPayosConfig(1L, 2L);
            fail("Expected NO_OPERATOR_AUTH");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.NO_OPERATOR_AUTH, e.getExceptionEnum());
        }
    }

    @Test
    public void testShopControllerInternalPayosConfigProtectedByInternalToken() {
        ShopController controller = new ShopController();
        ShopPaymentConfigService mockService = mock(ShopPaymentConfigService.class);
        ReflectionTestUtils.setField(controller, "shopPaymentConfigService", mockService);
        ReflectionTestUtils.setField(controller, "internalToken", "secret-internal-token-123");

        when(mockService.getInternalPayosConfig(1L))
                .thenReturn(PayosConfigDto.builder().shopId(1L).clientId("c").apiKey("a").checksumKey("k").enabled(true).build());

        // Call with valid internal token
        Result<PayosConfigDto> validRes = controller.getInternalPayosConfig(1L, "secret-internal-token-123");
        assertNotNull(validRes);
        assertEquals(200, validRes.getCode().intValue());
        assertEquals("c", validRes.getData().getClientId());

        // Call with invalid internal token -> 403
        try {
            controller.getInternalPayosConfig(1L, "wrong-token");
            fail("Expected NO_OPERATOR_AUTH");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.NO_OPERATOR_AUTH, e.getExceptionEnum());
        }

        // Call with missing internal token -> 403
        try {
            controller.getInternalPayosConfig(1L, null);
            fail("Expected NO_OPERATOR_AUTH");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.NO_OPERATOR_AUTH, e.getExceptionEnum());
        }
    }

    @Test
    public void testGetSecurityNoticeChangedWithin24h() {
        Long shopId = 1L;
        java.time.LocalDateTime recentTime = java.time.LocalDateTime.now().minusHours(2);

        ShopPaymentConfig config = ShopPaymentConfig.builder()
                .shopId(shopId)
                .updatedBy(10L)
                .updatedByName("Nguyen Van A")
                .updatedIp("192.168.1.50")
                .updateTime(recentTime)
                .deleted(0)
                .build();

        doReturn(config).when(shopPaymentConfigMapper).selectOne(any());

        com.linmour.system.pojo.Dto.SecurityNoticeRespDto notice = shopPaymentConfigService.getSecurityNotice(shopId);
        assertNotNull(notice);
        assertTrue(notice.getPayosChangedWithin24h());
        assertEquals("Nguyen Van A", notice.getChangedByName());
        assertEquals("192.168.1.50", notice.getChangedIp());
        assertEquals(recentTime, notice.getChangedAt());
    }

    @Test
    public void testGetSecurityNoticeChangedOlderThan24h() {
        Long shopId = 1L;
        java.time.LocalDateTime oldTime = java.time.LocalDateTime.now().minusHours(25);

        ShopPaymentConfig config = ShopPaymentConfig.builder()
                .shopId(shopId)
                .updatedBy(10L)
                .updatedByName("Nguyen Van A")
                .updatedIp("192.168.1.50")
                .updateTime(oldTime)
                .deleted(0)
                .build();

        doReturn(config).when(shopPaymentConfigMapper).selectOne(any());

        com.linmour.system.pojo.Dto.SecurityNoticeRespDto notice = shopPaymentConfigService.getSecurityNotice(shopId);
        assertNotNull(notice);
        assertFalse(notice.getPayosChangedWithin24h());
    }

    @Test
    public void testShopControllerSecurityNotice() {
        LoginVo vo = new LoginVo();
        vo.setId(10L);
        vo.setType(2); // merchant
        vo.setShopId(1L);
        LoginUser loginUser = new LoginUser(vo);
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(loginUser, null, null);
        SecurityContextHolder.getContext().setAuthentication(auth);

        ShopController controller = new ShopController();
        ShopPaymentConfigService mockService = mock(ShopPaymentConfigService.class);
        ReflectionTestUtils.setField(controller, "shopPaymentConfigService", mockService);

        when(mockService.getSecurityNotice(1L))
                .thenReturn(com.linmour.system.pojo.Dto.SecurityNoticeRespDto.builder()
                        .payosChangedWithin24h(true)
                        .changedByName("Nguyen Van A")
                        .changedIp("127.0.0.1")
                        .build());

        Result res = controller.getSecurityNotice(1L, null);
        assertNotNull(res);
        assertEquals(200, res.getCode().intValue());
        com.linmour.system.pojo.Dto.SecurityNoticeRespDto data = (com.linmour.system.pojo.Dto.SecurityNoticeRespDto) res.getData();
        assertTrue(data.getPayosChangedWithin24h());
    }

    @Test(expected = IllegalStateException.class)
    public void testMissingPayosConfigSecretThrowsIllegalStateException() {
        ShopPaymentConfigServiceImpl service = new ShopPaymentConfigServiceImpl();
        ReflectionTestUtils.setField(service, "payosConfigSecret", "");
        service.validatePayosConfigSecret();
    }

    @Test(expected = IllegalStateException.class)
    public void testMissingInternalTokenThrowsIllegalStateException() {
        ShopController controller = new ShopController();
        ReflectionTestUtils.setField(controller, "internalToken", "   ");
        controller.validateInternalToken();
    }
}


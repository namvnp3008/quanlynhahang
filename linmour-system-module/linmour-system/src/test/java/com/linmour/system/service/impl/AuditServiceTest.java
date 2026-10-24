package com.linmour.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.linmour.security.dtos.LoginUser;
import com.linmour.security.dtos.LoginVo;
import com.linmour.security.dtos.PageResult;
import com.linmour.security.dtos.Result;
import com.linmour.security.exception.CustomException;
import com.linmour.security.exception.enums.AppHttpCodeEnum;
import com.linmour.system.controller.admin.audit.AuditController;
import com.linmour.system.mapper.AuditLogMapper;
import com.linmour.system.pojo.Do.AuditLog;
import com.linmour.system.pojo.Dto.AuditLogQueryDto;
import com.linmour.system.pojo.Dto.AuditLogReqDto;
import com.linmour.system.service.ShopService;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.MockitoJUnitRunner;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.*;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@RunWith(MockitoJUnitRunner.class)
public class AuditServiceTest {

    @Spy
    @InjectMocks
    private AuditServiceImpl auditService;

    @Mock
    private AuditLogMapper auditLogMapper;

    @Mock
    private ShopService shopService;

    @Before
    public void setUp() {
        SecurityContextHolder.clearContext();
        com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(
                new org.apache.ibatis.builder.MapperBuilderAssistant(
                        new com.baomidou.mybatisplus.core.MybatisConfiguration(), ""
                ),
                AuditLog.class
        );
    }

    @After
    public void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private void mockLoginUser(Long userId, Integer userType) {
        LoginVo loginVo = new LoginVo();
        loginVo.setId(userId);
        loginVo.setType(userType);
        loginVo.setPhone("0912345678");
        LoginUser loginUser = new LoginUser();
        loginUser.setLoginVo(loginVo);
        loginUser.setJti("test-jti-123");
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(loginUser, null, Collections.emptyList());
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    @Test
    public void testRecordAuditMasksSensitiveFields() throws Exception {
        doReturn(true).when(auditService).save(any(AuditLog.class));

        Map<String, Object> detail = new HashMap<>();
        detail.put("currentPassword", "p@ssword123");
        detail.put("apiKey", "api-key-xyz-789");
        detail.put("checksumKey", "checksum-secret");
        detail.put("otpCode", "123456");
        detail.put("clientId", "payos-client-id-9999");
        detail.put("priceOld", 25000);
        detail.put("priceNew", 30000);

        AuditLogReqDto dto = AuditLogReqDto.builder()
                .shopId(10L)
                .merchantId(2L)
                .actorName("Chủ Quán")
                .actorType(2)
                .action("PAYOS_CONFIG_CHANGE")
                .targetType("shop_payment_config")
                .targetId("10")
                .detail(detail)
                .ip("192.168.1.50")
                .userAgent("Mozilla/5.0")
                .result("SUCCESS")
                .build();

        auditService.recordAudit(dto);

        // Đợi async CompletableFuture hoàn tất
        Thread.sleep(200);

        ArgumentCaptor<AuditLog> captor = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditService, atLeastOnce()).save(captor.capture());
        AuditLog saved = captor.getValue();

        assertNotNull(saved);
        assertEquals(Long.valueOf(10L), saved.getShopId());
        assertEquals("PAYOS_CONFIG_CHANGE", saved.getAction());

        String savedDetail = saved.getDetail();
        assertNotNull(savedDetail);
        assertFalse("Không được chứa mật khẩu thô trong detail", savedDetail.contains("p@ssword123"));
        assertFalse("Không được chứa apiKey thô trong detail", savedDetail.contains("api-key-xyz-789"));
        assertFalse("Không được chứa checksum thô trong detail", savedDetail.contains("checksum-secret"));
        assertFalse("Không được chứa OTP thô trong detail", savedDetail.contains("123456"));
        assertTrue("Chứa masked client ID 4 ký tự cuối", savedDetail.contains("••••9999"));
        assertTrue("Chứa giá không bị che", savedDetail.contains("25000"));
        assertTrue("Chứa giá mới không bị che", savedDetail.contains("30000"));
    }

    @Test(expected = CustomException.class)
    public void testGetAuditLogsRequiresLogin() {
        AuditLogQueryDto queryDto = new AuditLogQueryDto();
        auditService.getAuditLogs(queryDto);
    }

    @Test
    public void testGetAuditLogsAdminCanSeeAll() {
        mockLoginUser(1L, 1); // Platform admin

        doAnswer(invocation -> {
            Page<AuditLog> page = invocation.getArgument(0);
            List<AuditLog> list = new ArrayList<>();
            list.add(AuditLog.builder().id(1L).action("SHOP_AUDIT").build());
            page.setRecords(list);
            page.setTotal(1L);
            return page;
        }).when(auditService).page(any(Page.class), any(LambdaQueryWrapper.class));

        AuditLogQueryDto queryDto = new AuditLogQueryDto();
        queryDto.setShopId(5L);
        queryDto.setMerchantId(2L);
        queryDto.setAction("SHOP_AUDIT");
        queryDto.setFrom("2026-10-01");
        queryDto.setTo("2026-10-24");

        PageResult<AuditLog> res = auditService.getAuditLogs(queryDto);
        assertNotNull(res);
        assertEquals(1, res.getTotal().intValue());
        assertEquals("SHOP_AUDIT", res.getList().get(0).getAction());
    }

    @Test
    public void testGetAuditLogsMerchantUnauthorizedShopReturnsEmpty() {
        mockLoginUser(2L, 2); // Merchant
        when(shopService.getShopIdsByMerchantId(2L)).thenReturn(Arrays.asList(10L, 20L));

        AuditLogQueryDto queryDto = new AuditLogQueryDto();
        queryDto.setShopId(999L); // Quán không thuộc sở hữu của merchant 2

        PageResult<AuditLog> res = auditService.getAuditLogs(queryDto);
        assertNotNull(res);
        assertEquals(0, res.getTotal().intValue());
        assertTrue(res.getList().isEmpty());
    }

    @Test
    public void testGetAuditLogsMerchantOwnedShopSuccess() {
        mockLoginUser(2L, 2); // Merchant
        when(shopService.getShopIdsByMerchantId(2L)).thenReturn(Arrays.asList(10L, 20L));

        doAnswer(invocation -> {
            Page<AuditLog> page = invocation.getArgument(0);
            List<AuditLog> list = new ArrayList<>();
            list.add(AuditLog.builder().id(100L).shopId(10L).action("PAYOS_CONFIG_CHANGE").build());
            page.setRecords(list);
            page.setTotal(1L);
            return page;
        }).when(auditService).page(any(Page.class), any(LambdaQueryWrapper.class));

        AuditLogQueryDto queryDto = new AuditLogQueryDto();
        queryDto.setShopId(10L);

        PageResult<AuditLog> res = auditService.getAuditLogs(queryDto);
        assertNotNull(res);
        assertEquals(1, res.getTotal().intValue());
        assertEquals("PAYOS_CONFIG_CHANGE", res.getList().get(0).getAction());
    }

    @Test
    public void testAuditControllerInternalTokenSecurity() {
        AuditController controller = new AuditController();
        ReflectionTestUtils.setField(controller, "auditService", auditService);
        ReflectionTestUtils.setField(controller, "internalToken", "secret-internal-token-456");

        // 1. Missing header -> throw 403 NO_OPERATOR_AUTH
        try {
            controller.recordInternalAudit(null, new AuditLogReqDto());
            fail("Phải ném CustomException khi thiếu X-Internal-Token");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.NO_OPERATOR_AUTH.getCode(), e.getCode());
        }

        // 2. Wrong header -> throw 403 NO_OPERATOR_AUTH
        try {
            controller.recordInternalAudit("wrong-token", new AuditLogReqDto());
            fail("Phải ném CustomException khi sai X-Internal-Token");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.NO_OPERATOR_AUTH.getCode(), e.getCode());
        }

        // 3. Valid header -> success
        doNothing().when(auditService).recordAudit(any(AuditLogReqDto.class));
        Result result = controller.recordInternalAudit("secret-internal-token-456", new AuditLogReqDto());
        assertNotNull(result);
        assertEquals(200, result.getCode().intValue());
    }
}

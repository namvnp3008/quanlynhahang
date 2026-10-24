package com.linmour.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.linmour.security.dtos.PageResult;
import com.linmour.security.dtos.Result;
import com.linmour.security.exception.CustomException;
import com.linmour.security.exception.enums.AppHttpCodeEnum;
import com.linmour.system.mapper.MerchantMapper;
import com.linmour.system.pojo.Do.Merchant;
import com.linmour.system.pojo.Do.Shop;
import com.linmour.system.pojo.Dto.MerchantRegisterDto;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.MockitoJUnitRunner;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@RunWith(MockitoJUnitRunner.class)
public class MerchantServiceImplTest {

    @Mock
    private MerchantMapper merchantMapper;

    @Mock
    private org.springframework.security.authentication.AuthenticationManager authenticationManager;

    @Mock
    private com.linmour.security.utils.LoginAttemptService loginAttemptService;

    @Mock
    private com.linmour.security.utils.RedisCache redisCache;

    @Mock
    private com.linmour.system.service.ShopService shopService;

    @Mock
    private com.linmour.system.service.AuditService auditService;

    @Spy
    @InjectMocks
    private MerchantServiceImpl merchantService;

    @Test
    public void testRegisterSuccess() {
        MerchantRegisterDto dto = new MerchantRegisterDto();
        dto.setRealName("Chủ Quán Mới");
        dto.setPhone("0912345678");
        dto.setPassword("secret123");

        when(merchantMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(0);
        doReturn(true).when(merchantService).save(any(Merchant.class));

        Result result = merchantService.register(dto);
        assertNotNull(result);
        assertEquals(Integer.valueOf(200), Integer.valueOf(result.getCode()));

        ArgumentCaptor<Merchant> captor = ArgumentCaptor.forClass(Merchant.class);
        verify(merchantService).save(captor.capture());
        Merchant saved = captor.getValue();
        assertEquals("Chủ Quán Mới", saved.getRealName());
        assertEquals("0912345678", saved.getPhone());
        assertEquals(Integer.valueOf(2), saved.getType());
        assertEquals(Integer.valueOf(1), saved.getStatus());
        assertNotNull(saved.getPassword());
        assertTrue(saved.getPassword().startsWith("$2a$"));
        assertTrue(new BCryptPasswordEncoder().matches("secret123", saved.getPassword()));
    }

    @Test
    public void testRegisterDuplicatePhone() {
        MerchantRegisterDto dto = new MerchantRegisterDto();
        dto.setRealName("Trùng SĐT");
        dto.setPhone("0912345678");
        dto.setPassword("password123");

        when(merchantMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(1);

        try {
            merchantService.register(dto);
            fail("Expected CustomException for duplicate phone");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.PHONENUMBER_EXIST, e.getExceptionEnum());
            assertEquals("Số điện thoại đã được đăng ký", e.getExceptionEnum().getMsg());
        }
    }

    @Test
    public void testRegisterInvalidPhoneFormats() {
        String[] invalidPhones = {null, "", "1234567890", "091234567", "091234567890", "091234abcd", "012345678"};
        for (String phone : invalidPhones) {
            MerchantRegisterDto dto = new MerchantRegisterDto();
            dto.setRealName("Test");
            dto.setPhone(phone);
            dto.setPassword("validPass123");

            try {
                merchantService.register(dto);
                fail("Expected CustomException for invalid phone: " + phone);
            } catch (CustomException e) {
                assertEquals("Phone failed: " + phone, AppHttpCodeEnum.INVALID_PHONE_NUMBER, e.getExceptionEnum());
                assertEquals("Số điện thoại không hợp lệ", e.getExceptionEnum().getMsg());
            }
        }
    }

    @Test
    public void testRegisterPasswordTooShort() {
        String[] shortPasswords = {null, "", "12345", "  abc  "};
        for (String pass : shortPasswords) {
            MerchantRegisterDto dto = new MerchantRegisterDto();
            dto.setRealName("Test");
            dto.setPhone("0987654321");
            dto.setPassword(pass);

            try {
                merchantService.register(dto);
                fail("Expected CustomException for short password: " + pass);
            } catch (CustomException e) {
                assertEquals(AppHttpCodeEnum.PASSWORD_TOO_SHORT, e.getExceptionEnum());
                assertEquals("Mật khẩu phải có ít nhất 6 ký tự", e.getExceptionEnum().getMsg());
            }
        }
    }

    @Test
    public void testRegisterEnforcesType2AndStatus1() {
        MerchantRegisterDto dto = new MerchantRegisterDto();
        dto.setRealName("Thử Quyền");
        dto.setPhone("0909090909");
        dto.setPassword("securePassword");

        when(merchantMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(0);
        doReturn(true).when(merchantService).save(any(Merchant.class));

        merchantService.register(dto);

        ArgumentCaptor<Merchant> captor = ArgumentCaptor.forClass(Merchant.class);
        verify(merchantService).save(captor.capture());
        Merchant saved = captor.getValue();
        assertEquals("Type must be 2", Integer.valueOf(2), saved.getType());
        assertEquals("Status must be 1", Integer.valueOf(1), saved.getStatus());
        assertNull("Id must be null for auto-gen", saved.getId());
    }

    @Test
    public void testSaveOrUpdateMerchantBlockedForType2Merchant() {
        com.linmour.security.dtos.LoginUser loginUser = new com.linmour.security.dtos.LoginUser();
        loginUser.setLoginVo(new com.linmour.security.dtos.LoginVo(25L, 2));
        org.springframework.security.authentication.UsernamePasswordAuthenticationToken auth =
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginUser, null, null);
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(auth);

        Merchant m = new Merchant();
        m.setId(25L);
        m.setType(1); // attempting privilege escalation to platform admin

        try {
            merchantService.saveOrUpdateMerchant(m);
            fail("Expected CustomException 403 NO_OPERATOR_AUTH");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.NO_OPERATOR_AUTH, e.getExceptionEnum());
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    @Test
    public void testGetMerchantPageBlockedForType2Merchant() {
        com.linmour.security.dtos.LoginUser loginUser = new com.linmour.security.dtos.LoginUser();
        loginUser.setLoginVo(new com.linmour.security.dtos.LoginVo(25L, 2));
        org.springframework.security.authentication.UsernamePasswordAuthenticationToken auth =
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginUser, null, null);
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(auth);

        try {
            merchantService.getMerchantPage(new com.linmour.system.pojo.Dto.MerchantPage());
            fail("Expected CustomException 403 NO_OPERATOR_AUTH");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.NO_OPERATOR_AUTH, e.getExceptionEnum());
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    @Test
    public void testGetMerchantPageDoesNotLeakPasswordHash() {
        com.linmour.security.dtos.LoginUser loginUser = new com.linmour.security.dtos.LoginUser();
        loginUser.setLoginVo(new com.linmour.security.dtos.LoginVo(1L, 1)); // platform admin
        org.springframework.security.authentication.UsernamePasswordAuthenticationToken auth =
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginUser, null, null);
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(auth);

        Merchant m1 = new Merchant();
        m1.setId(10L);
        m1.setPhone("0911222333");
        m1.setPassword("$2a$10$secretHashThatMustBeCleared");

        Page<Merchant> page = new Page<>(1, 10);
        page.setRecords(java.util.Collections.singletonList(m1));
        page.setTotal(1L);
        when(merchantMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(1);
        when(merchantMapper.selectPage(any(Page.class), any(LambdaQueryWrapper.class))).thenReturn(page);

        PageResult<Merchant> result = merchantService.getMerchantPage(new com.linmour.system.pojo.Dto.MerchantPage());
        assertNotNull(result);
        assertEquals(Long.valueOf(1L), result.getTotal());
        assertNotNull(result.getList());
        assertEquals(1, result.getList().size());
        assertNull("Password must be stripped/null", result.getList().get(0).getPassword());

        org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }

    @Test
    public void testGetMerchantPageWithFiltersAndPagination() {
        com.linmour.security.dtos.LoginUser loginUser = new com.linmour.security.dtos.LoginUser();
        loginUser.setLoginVo(new com.linmour.security.dtos.LoginVo(1L, 1)); // platform admin
        org.springframework.security.authentication.UsernamePasswordAuthenticationToken auth =
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginUser, null, null);
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(auth);

        com.linmour.system.pojo.Dto.MerchantPage param = new com.linmour.system.pojo.Dto.MerchantPage();
        param.setRealName("Nam");
        param.setPhone("0987");
        param.setStatus(1);
        param.setPageNo(2);
        param.setPageSize(5);

        Merchant m = new Merchant();
        m.setId(15L);
        m.setRealName("Nam");
        m.setPhone("0987123456");
        m.setStatus(1);
        m.setPassword("secret");

        Page<Merchant> page = new Page<>(2, 5);
        page.setRecords(java.util.Collections.singletonList(m));
        page.setTotal(7L);
        when(merchantMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(7);
        when(merchantMapper.selectPage(any(Page.class), any(LambdaQueryWrapper.class))).thenReturn(page);

        PageResult<Merchant> result = merchantService.getMerchantPage(param);
        assertNotNull(result);
        assertEquals(Long.valueOf(7L), result.getTotal());
        assertEquals(1, result.getList().size());
        assertEquals("Nam", result.getList().get(0).getRealName());
        assertNull(result.getList().get(0).getPassword());

        org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }

    @Test
    public void testUpdateMerchantProfileEnforcesSelfUpdateAndOldPassword() {
        com.linmour.security.dtos.LoginUser loginUser = new com.linmour.security.dtos.LoginUser();
        loginUser.setLoginVo(new com.linmour.security.dtos.LoginVo(25L, 2)); // merchant 25
        org.springframework.security.authentication.UsernamePasswordAuthenticationToken auth =
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginUser, null, null);
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(auth);

        // 1. Cannot update other merchant
        com.linmour.system.pojo.Dto.UserInfoDto otherDto = new com.linmour.system.pojo.Dto.UserInfoDto();
        otherDto.setId(26L);
        try {
            merchantService.updateMerchantProfile(otherDto);
            fail("Expected CustomException 403 for updating other user");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.NO_OPERATOR_AUTH, e.getExceptionEnum());
        }

        // 2. Old password mismatch
        Merchant existing = new Merchant();
        existing.setId(25L);
        existing.setPassword(new BCryptPasswordEncoder().encode("correctOldPassword"));
        when(merchantMapper.selectById(25L)).thenReturn(existing);

        com.linmour.system.pojo.Dto.UserInfoDto selfDto = new com.linmour.system.pojo.Dto.UserInfoDto();
        selfDto.setId(25L);
        selfDto.setPassword("newSecret123");
        selfDto.setOldPassword("wrongPassword");

        try {
            merchantService.updateMerchantProfile(selfDto);
            fail("Expected CustomException for wrong old password");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.OLD_PASSWORD_ERROR, e.getExceptionEnum());
            assertEquals("Mật khẩu cũ không chính xác", e.getExceptionEnum().getMsg());
        }

        // 3. Success update
        selfDto.setOldPassword("correctOldPassword");
        selfDto.setRealName("Tên Mới");
        when(merchantMapper.updateById(any(Merchant.class))).thenReturn(1);

        boolean success = merchantService.updateMerchantProfile(selfDto);
        assertTrue(success);

        org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }

    @Test
    public void testChangeStatusByPlatformAdminSuccess() {
        com.linmour.security.dtos.LoginUser loginUser = new com.linmour.security.dtos.LoginUser();
        loginUser.setLoginVo(new com.linmour.security.dtos.LoginVo(1L, 1)); // platform admin
        org.springframework.security.authentication.UsernamePasswordAuthenticationToken auth =
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginUser, null, null);
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(auth);

        Merchant m = new Merchant();
        m.setId(10L);
        m.setStatus(1);
        when(merchantMapper.selectById(10L)).thenReturn(m);
        when(merchantMapper.updateById(any(Merchant.class))).thenReturn(1);

        Result result = merchantService.changeStatus(10L, 0);
        assertNotNull(result);
        assertEquals(200, result.getCode().intValue());

        ArgumentCaptor<Merchant> captor = ArgumentCaptor.forClass(Merchant.class);
        verify(merchantMapper).updateById(captor.capture());
        assertEquals(Integer.valueOf(0), captor.getValue().getStatus());

        org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }

    @Test
    public void testChangeStatusByRegularMerchantThrowsForbidden() {
        com.linmour.security.dtos.LoginUser loginUser = new com.linmour.security.dtos.LoginUser();
        loginUser.setLoginVo(new com.linmour.security.dtos.LoginVo(25L, 2)); // merchant
        org.springframework.security.authentication.UsernamePasswordAuthenticationToken auth =
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginUser, null, null);
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(auth);

        try {
            merchantService.changeStatus(10L, 0);
            fail("Expected CustomException 403 NO_OPERATOR_AUTH");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.NO_OPERATOR_AUTH, e.getExceptionEnum());
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    @Test
    public void testChangeStatusInvalidStatusThrowsParamError() {
        com.linmour.security.dtos.LoginUser loginUser = new com.linmour.security.dtos.LoginUser();
        loginUser.setLoginVo(new com.linmour.security.dtos.LoginVo(1L, 1)); // admin
        org.springframework.security.authentication.UsernamePasswordAuthenticationToken auth =
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginUser, null, null);
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(auth);

        try {
            merchantService.changeStatus(10L, 5);
            fail("Expected CustomException PARAM_ERROR");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.PARAM_ERROR, e.getExceptionEnum());
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    @Test
    public void testLoginReturns429WhenLockedWithoutCheckingPassword() {
        String phone = "0912345678";
        when(loginAttemptService.getRetryAfterSeconds(eq(phone), any())).thenReturn(720L);

        com.linmour.security.dtos.LoginVo loginVo = new com.linmour.security.dtos.LoginVo();
        loginVo.setPhone(phone);
        loginVo.setPassword("any_password");

        Result result = merchantService.login(loginVo);
        assertNotNull(result);
        assertEquals((Integer) 429, (Integer) result.getCode());
        assertTrue(result.getMsg().contains("Đăng nhập sai quá nhiều lần, vui lòng thử lại sau 12 phút"));

        java.util.Map data = (java.util.Map) result.getData();
        assertNotNull(data);
        assertEquals(Long.valueOf(720L), data.get("retryAfterSeconds"));

        // Verify password was NEVER checked
        verify(authenticationManager, never()).authenticate(any());
    }

    @Test
    public void testLoginFailureIncrementsCounterAndThrowsLoginError() {
        String phone = "0912345678";
        when(loginAttemptService.getRetryAfterSeconds(eq(phone), any())).thenReturn(0L, 0L);
        when(authenticationManager.authenticate(any())).thenThrow(new org.springframework.security.authentication.BadCredentialsException("bad creds"));

        com.linmour.security.dtos.LoginVo loginVo = new com.linmour.security.dtos.LoginVo();
        loginVo.setPhone(phone);
        loginVo.setPassword("wrong_pass");

        try {
            merchantService.login(loginVo);
            fail("Expected CustomException LOGIN_ERROR");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.LOGIN_ERROR, e.getExceptionEnum());
        }

        verify(loginAttemptService).recordFailure(eq(phone), any());
    }

    @Test
    public void testLoginFifthFailureImmediatelyReturns429() {
        String phone = "0912345678";
        // 0 before authenticate, 900 after 5th failure
        when(loginAttemptService.getRetryAfterSeconds(eq(phone), any())).thenReturn(0L, 900L);
        when(authenticationManager.authenticate(any())).thenThrow(new org.springframework.security.authentication.BadCredentialsException("bad creds"));

        com.linmour.security.dtos.LoginVo loginVo = new com.linmour.security.dtos.LoginVo();
        loginVo.setPhone(phone);
        loginVo.setPassword("wrong_pass");

        Result result = merchantService.login(loginVo);
        assertNotNull(result);
        assertEquals((Integer) 429, (Integer) result.getCode());
        assertTrue(result.getMsg().contains("15 phút"));

        java.util.Map data = (java.util.Map) result.getData();
        assertNotNull(data);
        assertEquals(Long.valueOf(900L), data.get("retryAfterSeconds"));

        verify(loginAttemptService).recordFailure(eq(phone), any());
    }

    @Test
    public void testLoginSuccessClearsPhoneFailureCounter() {
        String phone = "0912345678";
        when(loginAttemptService.getRetryAfterSeconds(eq(phone), any())).thenReturn(0L);

        com.linmour.security.dtos.LoginUser loginUser = new com.linmour.security.dtos.LoginUser();
        com.linmour.security.dtos.LoginVo userVo = new com.linmour.security.dtos.LoginVo(15L, 2);
        userVo.setStatus(1);
        loginUser.setLoginVo(userVo);

        Merchant mockMerchant = new Merchant();
        mockMerchant.setId(15L);
        mockMerchant.setPhone(phone);
        mockMerchant.setRealName("Test User");
        when(merchantMapper.selectById(15L)).thenReturn(mockMerchant);

        org.springframework.security.authentication.UsernamePasswordAuthenticationToken auth =
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginUser, null, null);
        when(authenticationManager.authenticate(any())).thenReturn(auth);

        com.linmour.security.utils.JwtUtil.setJwtKey("testSecretKey12345678901234567890");
        try {
            com.linmour.security.dtos.LoginVo loginVo = new com.linmour.security.dtos.LoginVo();
            loginVo.setPhone(phone);
            loginVo.setPassword("correct_pass");

            Result result = merchantService.login(loginVo);
            assertNotNull(result);
            assertEquals((Integer) 200, (Integer) result.getCode());

            verify(loginAttemptService).recordSuccess(phone);
        } finally {
            com.linmour.security.utils.JwtUtil.setJwtKey(null);
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    @Test
    public void testLoginS2CreatesJtiSessionWithSlidingTtlAndMetadata() {
        String phone = "0912345678";
        when(loginAttemptService.getRetryAfterSeconds(eq(phone), any())).thenReturn(0L);

        com.linmour.security.dtos.LoginUser loginUser = new com.linmour.security.dtos.LoginUser();
        com.linmour.security.dtos.LoginVo userVo = new com.linmour.security.dtos.LoginVo(15L, 2);
        userVo.setStatus(1);
        loginUser.setLoginVo(userVo);

        Merchant mockMerchant = new Merchant();
        mockMerchant.setId(15L);
        mockMerchant.setPhone(phone);
        mockMerchant.setRealName("Test User");
        mockMerchant.setMustChangePassword(1); // Needs change
        when(merchantMapper.selectById(15L)).thenReturn(mockMerchant);

        org.springframework.security.authentication.UsernamePasswordAuthenticationToken auth =
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginUser, null, null);
        when(authenticationManager.authenticate(any())).thenReturn(auth);

        com.linmour.security.utils.JwtUtil.setJwtKey("testSecretKey12345678901234567890");
        try {
            com.linmour.security.dtos.LoginVo loginVo = new com.linmour.security.dtos.LoginVo();
            loginVo.setPhone(phone);
            loginVo.setPassword("123"); // Weak password

            Result result = merchantService.login(loginVo);
            assertNotNull(result);
            assertEquals((Integer) 200, (Integer) result.getCode());

            java.util.Map map = (java.util.Map) result.getData();
            assertNotNull(map.get("token"));
            assertEquals(true, map.get("mustChangePassword"));

            // Verify session was saved with login:15:<jti> and 8-hour TTL
            ArgumentCaptor<String> keyCaptor = ArgumentCaptor.forClass(String.class);
            ArgumentCaptor<com.linmour.security.dtos.LoginUser> userCaptor = ArgumentCaptor.forClass(com.linmour.security.dtos.LoginUser.class);
            verify(redisCache).setCacheObject(
                    keyCaptor.capture(),
                    userCaptor.capture(),
                    eq(8),
                    eq(java.util.concurrent.TimeUnit.HOURS)
            );

            String sessionKey = keyCaptor.getValue();
            assertTrue(sessionKey.startsWith("login:15:"));
            com.linmour.security.dtos.LoginUser savedUser = userCaptor.getValue();
            assertNotNull(savedUser.getJti());
            assertNotNull(savedUser.getCreatedAt());
            assertNotNull(savedUser.getLastSeenAt());
            assertEquals(true, savedUser.getMustChangePassword());
        } finally {
            com.linmour.security.utils.JwtUtil.setJwtKey(null);
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    @Test
    public void testLogoutCurrentDeletesCurrentJtiSession() {
        com.linmour.security.dtos.LoginUser loginUser = new com.linmour.security.dtos.LoginUser();
        com.linmour.security.dtos.LoginVo vo = new com.linmour.security.dtos.LoginVo(15L, 2);
        loginUser.setLoginVo(vo);
        loginUser.setJti("jti-session-123");

        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginUser, null, null)
        );

        try {
            Result result = merchantService.logoutCurrent();
            assertNotNull(result);
            assertEquals((Integer) 200, (Integer) result.getCode());

            verify(redisCache).deleteObject("login:15:jti-session-123");
            verify(redisCache).deleteObject("login:15");
            verify(redisCache).deleteObject("merchant:shops:15");
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    @Test
    public void testLogoutAllDeletesAllMerchantSessions() {
        com.linmour.security.dtos.LoginUser loginUser = new com.linmour.security.dtos.LoginUser();
        com.linmour.security.dtos.LoginVo vo = new com.linmour.security.dtos.LoginVo(15L, 2);
        loginUser.setLoginVo(vo);

        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginUser, null, null)
        );

        java.util.Set<String> sessionKeys = new java.util.HashSet<>(java.util.Arrays.asList(
                "login:15:jti1", "login:15:jti2", "login:15:jti3"
        ));
        when(redisCache.scan("login:15:*")).thenReturn(sessionKeys);

        try {
            Result result = merchantService.logoutAll();
            assertNotNull(result);
            assertEquals((Integer) 200, (Integer) result.getCode());

            verify(redisCache).deleteObject(sessionKeys);
            verify(redisCache).deleteObject("login:15");
            verify(redisCache).deleteObject("merchant:shops:15");
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    @Test
    public void testLogoutOtherMerchantByNormalMerchantFailsWith403() {
        com.linmour.security.dtos.LoginUser loginUser = new com.linmour.security.dtos.LoginUser();
        com.linmour.security.dtos.LoginVo vo = new com.linmour.security.dtos.LoginVo(15L, 2); // merchant type 2
        loginUser.setLoginVo(vo);

        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginUser, null, null)
        );

        try {
            merchantService.logout(16L);
            fail("Expected CustomException 403 NO_OPERATOR_AUTH");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.NO_OPERATOR_AUTH, e.getExceptionEnum());
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    @Test
    public void testLogoutSelfSucceeds() {
        com.linmour.security.dtos.LoginUser loginUser = new com.linmour.security.dtos.LoginUser();
        com.linmour.security.dtos.LoginVo vo = new com.linmour.security.dtos.LoginVo(15L, 2);
        loginUser.setLoginVo(vo);

        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginUser, null, null)
        );

        java.util.Set<String> sessionKeys = new java.util.HashSet<>(java.util.Collections.singletonList("login:15:jti1"));
        when(redisCache.scan("login:15:*")).thenReturn(sessionKeys);

        try {
            Result result = merchantService.logout(15L);
            assertNotNull(result);
            assertEquals((Integer) 200, (Integer) result.getCode());
            verify(redisCache).deleteObject(sessionKeys);
            verify(redisCache).deleteObject("login:15");
            verify(auditService, atLeastOnce()).recordAudit(any());
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    @Test
    public void testForceLogoutByPlatformAdminSucceeds() {
        com.linmour.security.dtos.LoginUser adminUser = new com.linmour.security.dtos.LoginUser();
        com.linmour.security.dtos.LoginVo vo = new com.linmour.security.dtos.LoginVo(2L, 1); // platform admin type 1
        adminUser.setLoginVo(vo);

        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(adminUser, null, null)
        );

        java.util.Set<String> targetSessionKeys = new java.util.HashSet<>(java.util.Collections.singletonList("login:15:jti1"));
        when(redisCache.scan("login:15:*")).thenReturn(targetSessionKeys);

        try {
            Result result = merchantService.logout(15L);
            assertNotNull(result);
            assertEquals((Integer) 200, (Integer) result.getCode());
            verify(redisCache).deleteObject(targetSessionKeys);
            verify(redisCache).deleteObject("login:15");
            verify(auditService, atLeastOnce()).recordAudit(argThat(dto ->
                    "FORCE_LOGOUT".equals(dto.getAction()) && Long.valueOf(15L).equals(dto.getMerchantId())
            ));
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    @Test
    public void testGetSessionsReturnsSessionListWithCurrentFlag() {
        com.linmour.security.dtos.LoginUser loginUser = new com.linmour.security.dtos.LoginUser();
        com.linmour.security.dtos.LoginVo vo = new com.linmour.security.dtos.LoginVo(15L, 2);
        loginUser.setLoginVo(vo);
        loginUser.setJti("current-jti-4567");

        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginUser, null, null)
        );

        when(redisCache.scan("login:15:*")).thenReturn(new java.util.HashSet<>(java.util.Arrays.asList(
                "login:15:current-jti-4567",
                "login:15:other-jti-8901"
        )));

        com.linmour.security.dtos.LoginUser sess1 = new com.linmour.security.dtos.LoginUser();
        sess1.setJti("current-jti-4567");
        sess1.setCreatedAt("2026-10-24 00:00:00");
        sess1.setLastSeenAt("2026-10-24 00:10:00");
        sess1.setIp("127.0.0.1");
        sess1.setUserAgent("Chrome/120");

        com.linmour.security.dtos.LoginUser sess2 = new com.linmour.security.dtos.LoginUser();
        sess2.setJti("other-jti-8901");
        sess2.setCreatedAt("2026-10-24 00:05:00");
        sess2.setLastSeenAt("2026-10-24 00:15:00");
        sess2.setIp("192.168.1.100");
        sess2.setUserAgent("Firefox/115");

        when(redisCache.getCacheObject("login:15:current-jti-4567")).thenReturn(sess1);
        when(redisCache.getCacheObject("login:15:other-jti-8901")).thenReturn(sess2);

        try {
            Result result = merchantService.getSessions();
            assertNotNull(result);
            assertEquals((Integer) 200, (Integer) result.getCode());

            java.util.List<com.linmour.security.dtos.SessionVo> list = (java.util.List<com.linmour.security.dtos.SessionVo>) result.getData();
            assertEquals(2, list.size());

            // Current session comes first
            com.linmour.security.dtos.SessionVo first = list.get(0);
            assertTrue(first.getCurrent());
            assertEquals("…4567", first.getJti4());
            assertEquals("127.0.0.1", first.getIp());

            com.linmour.security.dtos.SessionVo second = list.get(1);
            assertFalse(second.getCurrent());
            assertEquals("…8901", second.getJti4());
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    @Test
    public void testChangePasswordWrongOldPasswordReturnsOldPasswordError() {
        com.linmour.security.dtos.LoginUser loginUser = new com.linmour.security.dtos.LoginUser();
        com.linmour.security.dtos.LoginVo vo = new com.linmour.security.dtos.LoginVo(15L, 2);
        loginUser.setLoginVo(vo);
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginUser, null, null)
        );

        Merchant merchant = new Merchant();
        merchant.setId(15L);
        merchant.setPhone("0912345678");
        merchant.setPassword(new BCryptPasswordEncoder().encode("correct_pass123"));
        when(merchantMapper.selectById(15L)).thenReturn(merchant);

        when(loginAttemptService.getRetryAfterSeconds(eq("0912345678"), any())).thenReturn(0L, 0L);

        try {
            com.linmour.system.pojo.Dto.ChangePasswordDto dto = new com.linmour.system.pojo.Dto.ChangePasswordDto("wrong_old_pass", "NewPass1234");
            Result result = merchantService.changePassword(dto);

            assertNotNull(result);
            assertEquals((Integer) AppHttpCodeEnum.OLD_PASSWORD_ERROR.getCode(), (Integer) result.getCode());
            verify(loginAttemptService).recordFailure(eq("0912345678"), any());
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    @Test
    public void testChangePasswordWeakOrInvalidNewPasswordReturns400() {
        com.linmour.security.dtos.LoginUser loginUser = new com.linmour.security.dtos.LoginUser();
        com.linmour.security.dtos.LoginVo vo = new com.linmour.security.dtos.LoginVo(15L, 2);
        loginUser.setLoginVo(vo);
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginUser, null, null)
        );

        Merchant merchant = new Merchant();
        merchant.setId(15L);
        merchant.setPhone("0912345678");
        merchant.setPassword(new BCryptPasswordEncoder().encode("correct_pass123"));
        when(merchantMapper.selectById(15L)).thenReturn(merchant);

        when(loginAttemptService.getRetryAfterSeconds(eq("0912345678"), any())).thenReturn(0L);

        try {
            // Short (<8 chars)
            Result r1 = merchantService.changePassword(new com.linmour.system.pojo.Dto.ChangePasswordDto("correct_pass123", "abc1"));
            assertEquals((Integer) 400, (Integer) r1.getCode());
            assertTrue(r1.getMsg().contains("8 ký tự"));

            // No digit
            Result r2 = merchantService.changePassword(new com.linmour.system.pojo.Dto.ChangePasswordDto("correct_pass123", "abcdefghij"));
            assertEquals((Integer) 400, (Integer) r2.getCode());
            assertTrue(r2.getMsg().contains("cả chữ và số"));

            // Same as old
            Result r3 = merchantService.changePassword(new com.linmour.system.pojo.Dto.ChangePasswordDto("correct_pass123", "correct_pass123"));
            assertEquals((Integer) 400, (Integer) r3.getCode());
            assertTrue(r3.getMsg().contains("trùng với mật khẩu cũ"));

            // Weak list
            Result r4 = merchantService.changePassword(new com.linmour.system.pojo.Dto.ChangePasswordDto("correct_pass123", "12345678"));
            assertEquals((Integer) 400, (Integer) r4.getCode());
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    @Test
    public void testChangePasswordSuccessUpdatesDbAndRedisSessions() {
        com.linmour.security.dtos.LoginUser loginUser = new com.linmour.security.dtos.LoginUser();
        com.linmour.security.dtos.LoginVo vo = new com.linmour.security.dtos.LoginVo(15L, 2);
        loginUser.setLoginVo(vo);
        loginUser.setJti("current-jti-pass");
        loginUser.setMustChangePassword(true);
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginUser, null, null)
        );

        Merchant merchant = new Merchant();
        merchant.setId(15L);
        merchant.setPhone("0912345678");
        merchant.setPassword(new BCryptPasswordEncoder().encode("oldPass123"));
        merchant.setMustChangePassword(1);
        when(merchantMapper.selectById(15L)).thenReturn(merchant);

        when(loginAttemptService.getRetryAfterSeconds(eq("0912345678"), any())).thenReturn(0L);

        java.util.Set<String> allSessions = new java.util.HashSet<>(java.util.Arrays.asList(
                "login:15:current-jti-pass",
                "login:15:other-device-session"
        ));
        when(redisCache.scan("login:15:*")).thenReturn(allSessions);

        try {
            com.linmour.system.pojo.Dto.ChangePasswordDto dto =
                    new com.linmour.system.pojo.Dto.ChangePasswordDto("oldPass123", "BrandNewPass2026");
            Result result = merchantService.changePassword(dto);

            assertNotNull(result);
            assertEquals((Integer) 200, (Integer) result.getCode());

            // 1. Verify DB update: password updated, must_change_password=0, passwordChangedAt set
            assertEquals(Integer.valueOf(0), merchant.getMustChangePassword());
            assertNotNull(merchant.getPasswordChangedAt());
            assertTrue(new BCryptPasswordEncoder().matches("BrandNewPass2026", merchant.getPassword()));
            verify(merchantMapper).updateById(merchant);

            // 2. Verify current session kept with mustChangePassword=false
            verify(redisCache).setCacheObject(
                    eq("login:15:current-jti-pass"),
                    eq(loginUser),
                    eq(8),
                    eq(java.util.concurrent.TimeUnit.HOURS)
            );
            assertEquals(false, loginUser.getMustChangePassword());

            // 3. Verify other session deleted
            verify(redisCache).deleteObject("login:15:other-device-session");
            verify(redisCache, never()).deleteObject("login:15:current-jti-pass");

            // 4. Verify login attempt success recorded
            verify(loginAttemptService).recordSuccess("0912345678");
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    @Test
    public void testChangeStatusZeroDeletesAllSessions() {
        com.linmour.security.dtos.LoginUser adminUser = new com.linmour.security.dtos.LoginUser();
        adminUser.setLoginVo(new com.linmour.security.dtos.LoginVo(1L, 1)); // Platform admin
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(adminUser, null, null)
        );

        Merchant merchant = new Merchant();
        merchant.setId(25L);
        merchant.setStatus(1);
        when(merchantMapper.selectById(25L)).thenReturn(merchant);

        java.util.Set<String> sessions = new java.util.HashSet<>(java.util.Arrays.asList(
                "login:25:jtiA", "login:25:jtiB"
        ));
        when(redisCache.scan("login:25:*")).thenReturn(sessions);

        try {
            Result result = merchantService.changeStatus(25L, 0);
            assertNotNull(result);
            assertEquals((Integer) 200, (Integer) result.getCode());

            assertEquals(Integer.valueOf(0), merchant.getStatus());
            verify(merchantMapper).updateById(merchant);

            // Verify all sessions deleted
            verify(redisCache).deleteObject(sessions);
            verify(redisCache).deleteObject("login:25");
            verify(redisCache).deleteObject("merchant:shops:25");
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    // ==========================================
    // S4 Tests: Xác thực 2 lớp TOTP RFC 6238
    // ==========================================

    @Test
    public void testLoginReturnsOtpRequiredWhenOtpEnabled() {
        Merchant merchant = new Merchant();
        merchant.setId(10L);
        merchant.setPhone("0987654321");
        merchant.setPassword(new BCryptPasswordEncoder().encode("Password@123"));
        merchant.setStatus(1);
        merchant.setOtpEnabled(1);
        merchant.setType(2);

        com.linmour.security.dtos.LoginVo loginVo = new com.linmour.security.dtos.LoginVo(10L, 2);
        loginVo.setPhone("0987654321");
        loginVo.setPassword("Password@123");
        loginVo.setStatus(1);

        com.linmour.security.dtos.LoginUser loginUser = new com.linmour.security.dtos.LoginUser(loginVo);
        org.springframework.security.authentication.UsernamePasswordAuthenticationToken authToken =
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginUser, null, null);

        when(authenticationManager.authenticate(any())).thenReturn(authToken);
        when(merchantMapper.selectById(10L)).thenReturn(merchant);

        Result result = merchantService.login(loginVo);
        assertNotNull(result);
        assertEquals(200, (int) result.getCode());

        java.util.Map<?, ?> data = (java.util.Map<?, ?>) result.getData();
        assertEquals(true, data.get("otpRequired"));
        assertNotNull(data.get("otpTicket"));

        // Verify ticket stored in Redis with 5 minutes TTL
        String ticket = (String) data.get("otpTicket");
        verify(redisCache).setCacheObject(eq("otp:ticket:" + ticket), eq("10"), eq(5), eq(java.util.concurrent.TimeUnit.MINUTES));
    }

    @Test
    public void testLoginOtpSuccessWithTotpCode() {
        com.linmour.security.utils.JwtUtil.setJwtKey("testSecretKey12345678901234567890");
        try {
            String testSecret = com.linmour.security.utils.TotpUtil.generateSecret();
            String encSecret = com.linmour.security.utils.AesGcmUtil.encrypt(testSecret, "test-otp-master-secret-123456");
            merchantService.setOtpSecret("test-otp-master-secret-123456");

            Merchant merchant = new Merchant();
            merchant.setId(11L);
            merchant.setPhone("0911223344");
            merchant.setPassword(new BCryptPasswordEncoder().encode("Secret@123"));
            merchant.setStatus(1);
            merchant.setOtpEnabled(1);
            merchant.setOtpSecretEnc(encSecret);
            merchant.setType(2);
            when(merchantMapper.selectById(11L)).thenReturn(merchant);

            when(redisCache.getCacheObject("otp:ticket:valid-ticket-123")).thenReturn("11");

            long nowStep = (System.currentTimeMillis() / 1000L) / 30L;
            String validTotp = com.linmour.security.utils.TotpUtil.generateTotp(testSecret, nowStep, 6);

            com.linmour.system.pojo.Dto.OtpLoginReqDto reqDto = new com.linmour.system.pojo.Dto.OtpLoginReqDto();
            reqDto.setOtpTicket("valid-ticket-123");
            reqDto.setCode(validTotp);

            Result result = merchantService.loginOtp(reqDto);
            assertNotNull(result);
            assertEquals(200, (int) result.getCode());

            java.util.Map<?, ?> data = (java.util.Map<?, ?>) result.getData();
            assertNotNull(data.get("token"));
            assertEquals(1, data.get("otpEnabled"));

            // Verify single use ticket deleted
            verify(redisCache).deleteObject("otp:ticket:valid-ticket-123");
            verify(loginAttemptService).recordSuccess("0911223344");
        } finally {
            com.linmour.security.utils.JwtUtil.setJwtKey(null);
        }
    }

    @Test
    public void testLoginOtpSuccessWithRecoveryCode() {
        com.linmour.security.utils.JwtUtil.setJwtKey("testSecretKey12345678901234567890");
        try {
            merchantService.setOtpSecret("test-otp-master-secret-123456");

            BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
            String rawRecovery = "a1b2c3d4";
            java.util.List<String> hashes = new java.util.ArrayList<>();
            hashes.add(encoder.encode(rawRecovery));
            hashes.add(encoder.encode("othercode"));

            Merchant merchant = new Merchant();
            merchant.setId(12L);
            merchant.setPhone("0922334455");
            merchant.setPassword(encoder.encode("Secret@123"));
            merchant.setStatus(1);
            merchant.setOtpEnabled(1);
            merchant.setOtpRecoveryHashes(com.alibaba.fastjson.JSON.toJSONString(hashes));
            merchant.setType(2);
            when(merchantMapper.selectById(12L)).thenReturn(merchant);

            when(redisCache.getCacheObject("otp:ticket:rec-ticket-456")).thenReturn("12");

            com.linmour.system.pojo.Dto.OtpLoginReqDto reqDto = new com.linmour.system.pojo.Dto.OtpLoginReqDto();
            reqDto.setOtpTicket("rec-ticket-456");
            reqDto.setCode(rawRecovery);

            Result result = merchantService.loginOtp(reqDto);
            assertNotNull(result);
            assertEquals(200, (int) result.getCode());

            // Verify recovery code was consumed and merchant updated with remaining hash
            verify(merchantMapper).updateById(merchant);
            java.util.List<String> updatedHashes = com.alibaba.fastjson.JSON.parseArray(merchant.getOtpRecoveryHashes(), String.class);
            assertEquals(1, updatedHashes.size());
            assertFalse(encoder.matches(rawRecovery, updatedHashes.get(0)));

            verify(redisCache).deleteObject("otp:ticket:rec-ticket-456");
            verify(loginAttemptService).recordSuccess("0922334455");
        } finally {
            com.linmour.security.utils.JwtUtil.setJwtKey(null);
        }
    }

    @Test
    public void testLoginOtpFailsWithInvalidCode() {
        merchantService.setOtpSecret("test-otp-master-secret-123456");

        Merchant merchant = new Merchant();
        merchant.setId(13L);
        merchant.setPhone("0933445566");
        merchant.setStatus(1);
        merchant.setOtpEnabled(1);
        merchant.setOtpSecretEnc(null);
        merchant.setOtpRecoveryHashes(null);
        merchant.setType(2);
        when(merchantMapper.selectById(13L)).thenReturn(merchant);

        when(redisCache.getCacheObject("otp:ticket:ticket-fail")).thenReturn("13");

        com.linmour.system.pojo.Dto.OtpLoginReqDto reqDto = new com.linmour.system.pojo.Dto.OtpLoginReqDto();
        reqDto.setOtpTicket("ticket-fail");
        reqDto.setCode("000000");

        Result result = merchantService.loginOtp(reqDto);
        assertNotNull(result);
        assertEquals(400, (int) result.getCode());

        verify(loginAttemptService).recordOtpFailure(eq(13L));
    }

    @Test
    public void testSetupOtpSuccessWithCorrectPassword() {
        com.linmour.security.dtos.LoginUser loginUser = new com.linmour.security.dtos.LoginUser();
        loginUser.setLoginVo(new com.linmour.security.dtos.LoginVo(14L, 2));
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginUser, null, null)
        );

        Merchant merchant = new Merchant();
        merchant.setId(14L);
        merchant.setPhone("0944556677");
        merchant.setPassword(new BCryptPasswordEncoder().encode("CurrentPass@123"));
        when(merchantMapper.selectById(14L)).thenReturn(merchant);

        try {
            com.linmour.system.pojo.Dto.OtpSetupReqDto reqDto = new com.linmour.system.pojo.Dto.OtpSetupReqDto("CurrentPass@123");
            Result result = merchantService.setupOtp(reqDto);
            assertNotNull(result);
            assertEquals(200, (int) result.getCode());

            com.linmour.system.pojo.Dto.OtpSetupRespDto resp = (com.linmour.system.pojo.Dto.OtpSetupRespDto) result.getData();
            assertNotNull(resp.getOtpauthUri());
            assertTrue(resp.getOtpauthUri().contains("0944556677"));
            assertNotNull(resp.getSecret());
            assertNotNull(resp.getSecretMasked());

            verify(redisCache).setCacheObject(eq("otp:setup:14"), anyString(), eq(10), eq(java.util.concurrent.TimeUnit.MINUTES));
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    @Test
    public void testEnableOtpGenerates8RecoveryCodes() {
        merchantService.setOtpSecret("test-otp-master-secret-123456");

        com.linmour.security.dtos.LoginUser loginUser = new com.linmour.security.dtos.LoginUser();
        loginUser.setLoginVo(new com.linmour.security.dtos.LoginVo(15L, 2));
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginUser, null, null)
        );

        String tempSecret = com.linmour.security.utils.TotpUtil.generateSecret();
        when(redisCache.getCacheObject("otp:setup:15")).thenReturn(tempSecret);

        Merchant merchant = new Merchant();
        merchant.setId(15L);
        merchant.setPhone("0955667788");
        merchant.setRealName("Chủ Quán 15");
        when(merchantMapper.selectById(15L)).thenReturn(merchant);

        long nowStep = (System.currentTimeMillis() / 1000L) / 30L;
        String validCode = com.linmour.security.utils.TotpUtil.generateTotp(tempSecret, nowStep, 6);

        try {
            com.linmour.system.pojo.Dto.OtpEnableReqDto reqDto = new com.linmour.system.pojo.Dto.OtpEnableReqDto(validCode);
            Result result = merchantService.enableOtp(reqDto);
            assertNotNull(result);
            assertEquals(200, (int) result.getCode());

            java.util.Map<?, ?> data = (java.util.Map<?, ?>) result.getData();
            java.util.List<?> recoveryCodes = (java.util.List<?>) data.get("recoveryCodes");
            assertNotNull(recoveryCodes);
            assertEquals(8, recoveryCodes.size());

            assertEquals(Integer.valueOf(1), merchant.getOtpEnabled());
            assertNotNull(merchant.getOtpSecretEnc());
            assertNotNull(merchant.getOtpRecoveryHashes());

            verify(merchantMapper).updateById(merchant);
            verify(redisCache).deleteObject("otp:setup:15");
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    @Test
    public void testDisableOtpBlockedForPlatformAdmin() {
        merchantService.setRequireOtpForPlatformAdmin(true);

        com.linmour.security.dtos.LoginUser adminUser = new com.linmour.security.dtos.LoginUser();
        adminUser.setLoginVo(new com.linmour.security.dtos.LoginVo(2L, 1)); // Platform admin
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(adminUser, null, null)
        );

        Merchant merchant = new Merchant();
        merchant.setId(2L);
        merchant.setType(1); // Platform admin
        merchant.setOtpEnabled(1);
        when(merchantMapper.selectById(2L)).thenReturn(merchant);

        try {
            com.linmour.system.pojo.Dto.OtpDisableReqDto reqDto = new com.linmour.system.pojo.Dto.OtpDisableReqDto("pass", "123456");
            Result result = merchantService.disableOtp(reqDto);
            assertNotNull(result);
            assertEquals(400, (int) result.getCode());
            assertTrue(result.getMsg().contains("quản trị viên nền tảng bắt buộc"));
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    @Test
    public void testForceWeakPasswordChangeFalseDoesNotForceChangeOnWeakPassword() {
        merchantService.setForceWeakPasswordChange(false);
        String phone = "0912345678";
        when(loginAttemptService.getRetryAfterSeconds(eq(phone), any())).thenReturn(0L);

        com.linmour.security.dtos.LoginUser loginUser = new com.linmour.security.dtos.LoginUser();
        com.linmour.security.dtos.LoginVo userVo = new com.linmour.security.dtos.LoginVo(15L, 2);
        userVo.setStatus(1);
        loginUser.setLoginVo(userVo);

        Merchant mockMerchant = new Merchant();
        mockMerchant.setId(15L);
        mockMerchant.setPhone(phone);
        mockMerchant.setRealName("Test User");
        mockMerchant.setMustChangePassword(0); // DB does not flag
        when(merchantMapper.selectById(15L)).thenReturn(mockMerchant);

        org.springframework.security.authentication.UsernamePasswordAuthenticationToken auth =
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(loginUser, null, null);
        when(authenticationManager.authenticate(any())).thenReturn(auth);

        com.linmour.security.utils.JwtUtil.setJwtKey("testSecretKey12345678901234567890");
        try {
            com.linmour.security.dtos.LoginVo loginVo = new com.linmour.security.dtos.LoginVo();
            loginVo.setPhone(phone);
            loginVo.setPassword("123"); // Weak password, but forceWeakPasswordChange is false

            Result result = merchantService.login(loginVo);
            assertNotNull(result);
            assertEquals((Integer) 200, (Integer) result.getCode());
            java.util.Map<?, ?> map = (java.util.Map<?, ?>) result.getData();
            assertFalse((Boolean) map.get("mustChangePassword"));
        } finally {
            merchantService.setForceWeakPasswordChange(true);
            com.linmour.security.utils.JwtUtil.setJwtKey(null);
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    @Test
    public void testCreateWsTicketSuccess() {
        com.linmour.security.dtos.LoginUser user = new com.linmour.security.dtos.LoginUser();
        user.setLoginVo(new com.linmour.security.dtos.LoginVo(15L, "0912345678", "pwd", 1, 1L, 2));
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(user, null, null)
        );

        Shop mockShop = new Shop();
        mockShop.setId(1L);
        mockShop.setMerchantId(15L);
        when(shopService.getById(1L)).thenReturn(mockShop);

        try {
            Result result = merchantService.createWsTicket(1L);
            assertNotNull(result);
            assertEquals((Integer) 200, (Integer) result.getCode());
            java.util.Map<?, ?> map = (java.util.Map<?, ?>) result.getData();
            assertNotNull(map.get("ticket"));
            verify(redisCache).setCacheObject(startsWith("ws:ticket:"), anyString(), eq(60), eq(java.util.concurrent.TimeUnit.SECONDS));
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    @Test
    public void testCreateWsTicketCrossShopBlocked() {
        com.linmour.security.dtos.LoginUser user = new com.linmour.security.dtos.LoginUser();
        user.setLoginVo(new com.linmour.security.dtos.LoginVo(15L, "0912345678", "pwd", 1, 1L, 2));
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(user, null, null)
        );

        Shop otherShop = new Shop();
        otherShop.setId(2L);
        otherShop.setMerchantId(99L); // Owned by someone else
        when(shopService.getById(2L)).thenReturn(otherShop);

        try {
            Result result = merchantService.createWsTicket(2L);
            assertNotNull(result);
            assertEquals((Integer) 403, (Integer) result.getCode());
            assertTrue(result.getMsg().contains("không có quyền"));
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }
}

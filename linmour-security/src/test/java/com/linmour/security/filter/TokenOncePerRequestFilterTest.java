package com.linmour.security.filter;

import com.linmour.security.dtos.LoginUser;
import com.linmour.security.dtos.LoginVo;
import com.linmour.security.utils.JwtUtil;
import com.linmour.security.utils.SecurityUtils;
import com.linmour.security.utils.RedisCache;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import javax.servlet.ServletException;
import java.io.IOException;

import static org.junit.Assert.*;

public class TokenOncePerRequestFilterTest {

    private TokenOncePerRequestFilter filter;

    @Before
    public void setUp() {
        SecurityContextHolder.clearContext();
        SecurityUtils.clearAll();
        TokenOncePerRequestFilter.redisCache = null;
        filter = new TokenOncePerRequestFilter();
        ReflectionTestUtils.setField(filter, "configuredInternalToken", "test-secret-internal-token");
        ReflectionTestUtils.setField(filter, "configuredJwtSecret", "test-secret-jwt-key-1234567890123");
        ReflectionTestUtils.setField(filter, "configuredTableTokenSecret", "test-table-token-secret-1234567890123");
        ReflectionTestUtils.setField(filter, "allowRawTableIds", true);
        TokenOncePerRequestFilter.internalToken = "test-secret-internal-token";
        JwtUtil.setJwtKey("test-secret-jwt-key-1234567890123");
        com.linmour.security.utils.TableTokenUtil.setTableTokenKey("test-table-token-secret-1234567890123");
    }

    @After
    public void tearDown() {
        SecurityContextHolder.clearContext();
        SecurityUtils.clearAll();
        TokenOncePerRequestFilter.redisCache = null;
    }

    @Test
    public void testToken1WithMatchingInternalTokenAuthenticatesSuccessfully() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/product/product/getProductPage");
        request.addHeader("Token", "1");
        request.addHeader("Shopid", "1");
        request.addHeader("X-Internal-Token", "test-secret-internal-token");

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertNotNull("SecurityContext must have authentication", SecurityContextHolder.getContext().getAuthentication());
        Object principal = SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        assertTrue("Principal must be LoginUser", principal instanceof LoginUser);
        LoginUser loginUser = (LoginUser) principal;
        assertEquals(Long.valueOf(1L), loginUser.getLoginVo().getShopId());
    }

    @Test
    public void testToken1WithoutInternalTokenIsRejectedUnauthenticated() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/product/product/getProductPage");
        request.addHeader("Token", "1");
        request.addHeader("Shopid", "1");
        // No X-Internal-Token header

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertNull("SecurityContext must NOT have authentication when X-Internal-Token is missing",
                SecurityContextHolder.getContext().getAuthentication());
    }

    @Test
    public void testToken1WithWrongInternalTokenIsRejectedUnauthenticated() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/product/product/getProductPage");
        request.addHeader("Token", "1");
        request.addHeader("Shopid", "1");
        request.addHeader("X-Internal-Token", "wrong-secret-token");

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertNull("SecurityContext must NOT have authentication when X-Internal-Token does not match",
                SecurityContextHolder.getContext().getAuthentication());
    }

    @Test
    public void testNoTokenPassesWithoutAuthentication() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/app/system/shop/info");
        // No token

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertNull("SecurityContext must remain null for unauthenticated requests",
                SecurityContextHolder.getContext().getAuthentication());
    }

    @Test(expected = IllegalStateException.class)
    public void testPostConstructThrowsExceptionWhenInternalTokenMissing() {
        TokenOncePerRequestFilter unconfiguredFilter = new TokenOncePerRequestFilter();
        ReflectionTestUtils.setField(unconfiguredFilter, "configuredInternalToken", null);
        ReflectionTestUtils.setField(unconfiguredFilter, "configuredJwtSecret", "valid-jwt");
        unconfiguredFilter.b();
    }

    @Test(expected = IllegalStateException.class)
    public void testPostConstructThrowsExceptionWhenInternalTokenEmpty() {
        TokenOncePerRequestFilter unconfiguredFilter = new TokenOncePerRequestFilter();
        ReflectionTestUtils.setField(unconfiguredFilter, "configuredInternalToken", "   ");
        ReflectionTestUtils.setField(unconfiguredFilter, "configuredJwtSecret", "valid-jwt");
        unconfiguredFilter.b();
    }

    @Test(expected = IllegalStateException.class)
    public void testPostConstructThrowsExceptionWhenJwtSecretMissing() {
        TokenOncePerRequestFilter unconfiguredFilter = new TokenOncePerRequestFilter();
        ReflectionTestUtils.setField(unconfiguredFilter, "configuredInternalToken", "valid-token");
        ReflectionTestUtils.setField(unconfiguredFilter, "configuredJwtSecret", null);
        unconfiguredFilter.b();
    }

    @Test(expected = IllegalStateException.class)
    public void testPostConstructThrowsExceptionWhenJwtSecretEmpty() {
        TokenOncePerRequestFilter unconfiguredFilter = new TokenOncePerRequestFilter();
        ReflectionTestUtils.setField(unconfiguredFilter, "configuredInternalToken", "valid-token");
        ReflectionTestUtils.setField(unconfiguredFilter, "configuredJwtSecret", "   ");
        unconfiguredFilter.b();
    }

    @Test
    public void testPostConstructSucceedsWhenInternalTokenAndJwtSecretProvided() {
        TokenOncePerRequestFilter configuredFilter = new TokenOncePerRequestFilter();
        ReflectionTestUtils.setField(configuredFilter, "configuredInternalToken", "valid-token-xyz");
        ReflectionTestUtils.setField(configuredFilter, "configuredJwtSecret", "valid-jwt-secret-xyz");
        configuredFilter.b();
        assertEquals("valid-token-xyz", TokenOncePerRequestFilter.internalToken);
    }

    @Test
    public void testMerchantAccessingOwnedShopSucceeds() throws ServletException, IOException {
        String token = JwtUtil.createJWT("1");
        RedisCache mockRedis = org.mockito.Mockito.mock(RedisCache.class);
        LoginUser loginUser = new LoginUser();
        loginUser.setLoginVo(new LoginVo(1L, "0912345678", "pwd", 1, 1L, 2)); // type = 2 (merchant)
        org.mockito.Mockito.when(mockRedis.getCacheObject("login:1")).thenReturn(loginUser);
        org.mockito.Mockito.when(mockRedis.getCacheObject("merchant:shops:1")).thenReturn(java.util.Arrays.asList(1L, 2L));

        ReflectionTestUtils.setField(filter, "a", mockRedis);
        TokenOncePerRequestFilter.redisCache = mockRedis;

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/restaurant/table/getTable");
        request.addHeader("Token", token);
        request.addHeader("Shopid", "1");

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertNotNull("Should authenticate", SecurityContextHolder.getContext().getAuthentication());
        assertEquals(200, response.getStatus());
    }

    @Test
    public void testMerchantAccessingUnownedShopIsRejectedWith403() throws ServletException, IOException {
        String token = JwtUtil.createJWT("1");
        RedisCache mockRedis = org.mockito.Mockito.mock(RedisCache.class);
        LoginUser loginUser = new LoginUser();
        loginUser.setLoginVo(new LoginVo(1L, "0912345678", "pwd", 1, 1L, 2)); // type = 2 (merchant)
        org.mockito.Mockito.when(mockRedis.getCacheObject("login:1")).thenReturn(loginUser);
        org.mockito.Mockito.when(mockRedis.getCacheObject("merchant:shops:1")).thenReturn(java.util.Arrays.asList(1L, 2L));

        ReflectionTestUtils.setField(filter, "a", mockRedis);
        TokenOncePerRequestFilter.redisCache = mockRedis;

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/restaurant/table/getTable");
        request.addHeader("Token", token);
        request.addHeader("Shopid", "4"); // Shop 4 is NOT owned by merchant 1!

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(403, response.getStatus());
        assertTrue("Error message must say 'Bạn không có quyền với quán này'",
                response.getContentAsString().contains("Bạn không có quyền với quán này"));
        assertNull("Authentication should not proceed for forbidden request",
                SecurityContextHolder.getContext().getAuthentication());
    }

    @Test
    public void testMerchantAccessingAdminPathWithoutShopId_Returns400() throws ServletException, IOException {
        String token = JwtUtil.createJWT("1");
        RedisCache mockRedis = org.mockito.Mockito.mock(RedisCache.class);
        LoginUser loginUser = new LoginUser();
        loginUser.setLoginVo(new LoginVo(1L, "0912345678", "pwd", 1, null, 2)); // type = 2 (merchant)
        org.mockito.Mockito.when(mockRedis.getCacheObject("login:1")).thenReturn(loginUser);

        ReflectionTestUtils.setField(filter, "a", mockRedis);
        TokenOncePerRequestFilter.redisCache = mockRedis;

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/product/product/getProductPage");
        request.addHeader("Token", token);

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(400, response.getStatus());
        assertTrue("Error message must say 'Vui lòng chọn quán ăn hợp lệ'",
                response.getContentAsString().contains("Vui lòng chọn quán ăn hợp lệ"));
    }

    @Test
    public void testMerchantAccessingAdminPathWithInvalidShopId_Returns400() throws ServletException, IOException {
        String token = JwtUtil.createJWT("1");
        RedisCache mockRedis = org.mockito.Mockito.mock(RedisCache.class);
        LoginUser loginUser = new LoginUser();
        loginUser.setLoginVo(new LoginVo(1L, "0912345678", "pwd", 1, null, 2)); // type = 2 (merchant)
        org.mockito.Mockito.when(mockRedis.getCacheObject("login:1")).thenReturn(loginUser);

        ReflectionTestUtils.setField(filter, "a", mockRedis);
        TokenOncePerRequestFilter.redisCache = mockRedis;

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/product/product/getProductPage");
        request.addHeader("Token", token);
        request.addHeader("Shopid", "0");

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(400, response.getStatus());
        assertTrue("Error message must say 'Vui lòng chọn quán ăn hợp lệ'",
                response.getContentAsString().contains("Vui lòng chọn quán ăn hợp lệ"));
    }

    @Test
    public void testMerchantAccessingExemptPathWithoutShopId_Succeeds() throws ServletException, IOException {
        String token = JwtUtil.createJWT("1");
        RedisCache mockRedis = org.mockito.Mockito.mock(RedisCache.class);
        LoginUser loginUser = new LoginUser();
        loginUser.setLoginVo(new LoginVo(1L, "0912345678", "pwd", 1, null, 2)); // type = 2 (merchant)
        org.mockito.Mockito.when(mockRedis.getCacheObject("login:1")).thenReturn(loginUser);

        ReflectionTestUtils.setField(filter, "a", mockRedis);
        TokenOncePerRequestFilter.redisCache = mockRedis;

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/system/shop/shopList");
        request.addHeader("Token", token);

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
        assertNotNull(SecurityContextHolder.getContext().getAuthentication());
    }

    @Test
    public void testPlatformAdminAccessingAdminPathWithoutShopId_Succeeds() throws ServletException, IOException {
        String token = JwtUtil.createJWT("2");
        RedisCache mockRedis = org.mockito.Mockito.mock(RedisCache.class);
        LoginUser adminUser = new LoginUser();
        adminUser.setLoginVo(new LoginVo(2L, "admin", "pwd", 1, null, 1)); // type = 1 (platform admin)
        org.mockito.Mockito.when(mockRedis.getCacheObject("login:2")).thenReturn(adminUser);

        ReflectionTestUtils.setField(filter, "a", mockRedis);
        TokenOncePerRequestFilter.redisCache = mockRedis;

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/product/product/getProductPage");
        request.addHeader("Token", token);

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
        assertNotNull(SecurityContextHolder.getContext().getAuthentication());
    }

    @Test
    public void testPlatformAdminCanAccessAnyShop() throws ServletException, IOException {
        String token = JwtUtil.createJWT("2");
        RedisCache mockRedis = org.mockito.Mockito.mock(RedisCache.class);
        LoginUser adminUser = new LoginUser();
        adminUser.setLoginVo(new LoginVo(2L, "admin", "pwd", 1, 1L, 1)); // type = 1 (platform admin)
        org.mockito.Mockito.when(mockRedis.getCacheObject("login:2")).thenReturn(adminUser);

        ReflectionTestUtils.setField(filter, "a", mockRedis);
        TokenOncePerRequestFilter.redisCache = mockRedis;

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/restaurant/table/getTable");
        request.addHeader("Token", token);
        request.addHeader("Shopid", "4");

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertNotNull("Admin should authenticate", SecurityContextHolder.getContext().getAuthentication());
        assertEquals(200, response.getStatus());
    }

    @Test
    public void testMerchantAccessingAppPathWithAnyShopIdPasses() throws ServletException, IOException {
        String token = JwtUtil.createJWT("1");
        RedisCache mockRedis = org.mockito.Mockito.mock(RedisCache.class);
        LoginUser loginUser = new LoginUser();
        loginUser.setLoginVo(new LoginVo(1L, "0912345678", "pwd", 1, 1L, 2));
        org.mockito.Mockito.when(mockRedis.getCacheObject("login:1")).thenReturn(loginUser);

        ReflectionTestUtils.setField(filter, "a", mockRedis);
        TokenOncePerRequestFilter.redisCache = mockRedis;

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/app/product/product/getProductList/4");
        request.addHeader("Token", token);
        request.addHeader("Shopid", "4");

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
        assertNotNull(SecurityContextHolder.getContext().getAuthentication());
    }

    @Test
    public void testInvalidTokenOnPublicAppPathIsIgnoredAndPasses() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/app/restaurant/table/3");
        request.addHeader("Token", "abc");
        request.addHeader("Shopid", "1");

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
        // Authentication is null because token was invalid, but request was allowed to pass to filter chain
        assertNull(SecurityContextHolder.getContext().getAuthentication());
        assertTrue(response.getContentAsString().isEmpty());
    }

    @Test
    public void testExpiredOrMissingUserTokenOnPublicAppPathIsIgnoredAndPasses() throws ServletException, IOException {
        String token = JwtUtil.createJWT("999");
        RedisCache mockRedis = org.mockito.Mockito.mock(RedisCache.class);
        org.mockito.Mockito.when(mockRedis.getCacheObject("login:999")).thenReturn(null);

        ReflectionTestUtils.setField(filter, "a", mockRedis);
        TokenOncePerRequestFilter.redisCache = mockRedis;

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/app/system/shop/info");
        request.addHeader("Token", token);
        request.addHeader("Shopid", "1");

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
        assertNull(SecurityContextHolder.getContext().getAuthentication());
        assertTrue(response.getContentAsString().isEmpty());
    }

    @Test
    public void testInvalidTokenOnAdminPathReturns401() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/restaurant/table/getTable");
        request.addHeader("Token", "abc");
        request.addHeader("Shopid", "1");

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertTrue("Response content should indicate 401 need login",
                response.getContentAsString().contains("\"code\":401"));
        assertNull(SecurityContextHolder.getContext().getAuthentication());
    }

    @Test
    public void testSessionLookupByJtiWithSlidingTtl() throws ServletException, IOException {
        String jti = "test-jti-uuid-1234";
        String token = JwtUtil.createJWT(jti, "1", JwtUtil.JWT_TTL);
        RedisCache mockRedis = org.mockito.Mockito.mock(RedisCache.class);
        LoginUser loginUser = new LoginUser();
        loginUser.setLoginVo(new LoginVo(1L, "0912345678", "pwd", 1, 1L, 2));
        loginUser.setJti(jti);
        org.mockito.Mockito.when(mockRedis.getCacheObject("login:1:" + jti)).thenReturn(loginUser);
        org.mockito.Mockito.when(mockRedis.getCacheObject("merchant:shops:1")).thenReturn(java.util.Arrays.asList(1L));

        ReflectionTestUtils.setField(filter, "a", mockRedis);
        TokenOncePerRequestFilter.redisCache = mockRedis;

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/restaurant/table/getTable");
        request.addHeader("Token", token);
        request.addHeader("Shopid", "1");

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
        assertNotNull(SecurityContextHolder.getContext().getAuthentication());
        // Verify sliding TTL refreshed to 8 hours
        org.mockito.Mockito.verify(mockRedis).setCacheObject(
                org.mockito.ArgumentMatchers.eq("login:1:" + jti),
                org.mockito.ArgumentMatchers.any(LoginUser.class),
                org.mockito.ArgumentMatchers.eq(8),
                org.mockito.ArgumentMatchers.eq(java.util.concurrent.TimeUnit.HOURS)
        );
    }

    @Test
    public void testMustChangePasswordBlocksAdminEndpointWith403() throws ServletException, IOException {
        String jti = "must-change-jti";
        String token = JwtUtil.createJWT(jti, "1", JwtUtil.JWT_TTL);
        RedisCache mockRedis = org.mockito.Mockito.mock(RedisCache.class);
        LoginUser loginUser = new LoginUser();
        loginUser.setLoginVo(new LoginVo(1L, "0912345678", "pwd", 1, 1L, 2));
        loginUser.setJti(jti);
        loginUser.setMustChangePassword(true);
        org.mockito.Mockito.when(mockRedis.getCacheObject("login:1:" + jti)).thenReturn(loginUser);

        ReflectionTestUtils.setField(filter, "a", mockRedis);
        TokenOncePerRequestFilter.redisCache = mockRedis;
        filter.setForceWeakPasswordChange(true);

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/product/product/getProductPage");
        request.addHeader("Token", token);

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(403, response.getStatus());
        assertTrue(response.getContentAsString().contains("MUST_CHANGE_PASSWORD"));
        assertTrue(response.getContentAsString().contains("Bạn cần đổi mật khẩu trước khi tiếp tục"));
    }

    @Test
    public void testMustChangePasswordAllowsExemptEndpoints() throws ServletException, IOException {
        String jti = "must-change-jti-exempt";
        String token = JwtUtil.createJWT(jti, "1", JwtUtil.JWT_TTL);
        RedisCache mockRedis = org.mockito.Mockito.mock(RedisCache.class);
        LoginUser loginUser = new LoginUser();
        loginUser.setLoginVo(new LoginVo(1L, "0912345678", "pwd", 1, 1L, 2));
        loginUser.setJti(jti);
        loginUser.setMustChangePassword(true);
        org.mockito.Mockito.when(mockRedis.getCacheObject("login:1:" + jti)).thenReturn(loginUser);

        ReflectionTestUtils.setField(filter, "a", mockRedis);
        TokenOncePerRequestFilter.redisCache = mockRedis;
        filter.setForceWeakPasswordChange(true);

        // 1. changePassword is exempt
        MockHttpServletRequest req1 = new MockHttpServletRequest("POST", "/system/merchant/changePassword");
        req1.addHeader("Token", token);
        MockHttpServletResponse resp1 = new MockHttpServletResponse();
        filter.doFilter(req1, resp1, new MockFilterChain());
        assertEquals(200, resp1.getStatus());

        // 2. logout is exempt
        MockHttpServletRequest req2 = new MockHttpServletRequest("POST", "/system/merchant/logout");
        req2.addHeader("Token", token);
        MockHttpServletResponse resp2 = new MockHttpServletResponse();
        filter.doFilter(req2, resp2, new MockFilterChain());
        assertEquals(200, resp2.getStatus());

        // 3. userInfo is exempt
        MockHttpServletRequest req3 = new MockHttpServletRequest("POST", "/system/merchant/userInfo");
        req3.addHeader("Token", token);
        MockHttpServletResponse resp3 = new MockHttpServletResponse();
        filter.doFilter(req3, resp3, new MockFilterChain());
        assertEquals(200, resp3.getStatus());
    }

    @Test
    public void testMustChangePasswordNotBlockedWhenFlagDisabled() throws ServletException, IOException {
        String jti = "flag-disabled-jti";
        String token = JwtUtil.createJWT(jti, "1", JwtUtil.JWT_TTL);
        RedisCache mockRedis = org.mockito.Mockito.mock(RedisCache.class);
        LoginUser loginUser = new LoginUser();
        loginUser.setLoginVo(new LoginVo(1L, "0912345678", "pwd", 1, 1L, 2));
        loginUser.setJti(jti);
        loginUser.setMustChangePassword(true);
        org.mockito.Mockito.when(mockRedis.getCacheObject("login:1:" + jti)).thenReturn(loginUser);
        org.mockito.Mockito.when(mockRedis.getCacheObject("merchant:shops:1")).thenReturn(java.util.Arrays.asList(1L));

        ReflectionTestUtils.setField(filter, "a", mockRedis);
        TokenOncePerRequestFilter.redisCache = mockRedis;
        filter.setForceWeakPasswordChange(false); // Flag disabled

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/restaurant/table/getTable");
        request.addHeader("Token", token);
        request.addHeader("Shopid", "1");

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
        assertNotNull(SecurityContextHolder.getContext().getAuthentication());
    }

    @Test
    public void testMustSetupOtpBlocksRegularRequestsWith403() throws ServletException, IOException {
        String jti = "otp-setup-jti-1";
        String token = JwtUtil.createJWT(jti, "2", JwtUtil.JWT_TTL);
        RedisCache mockRedis = org.mockito.Mockito.mock(RedisCache.class);
        LoginUser loginUser = new LoginUser();
        loginUser.setLoginVo(new LoginVo(2L, "0912345679", "pwd", 1, null, 1)); // Platform admin
        loginUser.setJti(jti);
        loginUser.setMustSetupOtp(true);
        org.mockito.Mockito.when(mockRedis.getCacheObject("login:2:" + jti)).thenReturn(loginUser);

        ReflectionTestUtils.setField(filter, "a", mockRedis);
        TokenOncePerRequestFilter.redisCache = mockRedis;
        filter.setRequireOtpForPlatformAdmin(true);

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/system/shop/getShopList");
        request.addHeader("Token", token);

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(403, response.getStatus());
        String body = response.getContentAsString();
        assertTrue(body.contains("MUST_SETUP_OTP"));
        assertNull(SecurityContextHolder.getContext().getAuthentication());
    }

    @Test
    public void testMustSetupOtpAllowsExemptEndpoints() throws ServletException, IOException {
        String jti = "otp-setup-jti-2";
        String token = JwtUtil.createJWT(jti, "2", JwtUtil.JWT_TTL);
        RedisCache mockRedis = org.mockito.Mockito.mock(RedisCache.class);
        LoginUser loginUser = new LoginUser();
        loginUser.setLoginVo(new LoginVo(2L, "0912345679", "pwd", 1, null, 1));
        loginUser.setJti(jti);
        loginUser.setMustSetupOtp(true);
        org.mockito.Mockito.when(mockRedis.getCacheObject("login:2:" + jti)).thenReturn(loginUser);

        ReflectionTestUtils.setField(filter, "a", mockRedis);
        TokenOncePerRequestFilter.redisCache = mockRedis;
        filter.setRequireOtpForPlatformAdmin(true);

        // 1. otp/setup is exempt
        MockHttpServletRequest req1 = new MockHttpServletRequest("POST", "/system/merchant/otp/setup");
        req1.addHeader("Token", token);
        MockHttpServletResponse resp1 = new MockHttpServletResponse();
        filter.doFilter(req1, resp1, new MockFilterChain());
        assertEquals(200, resp1.getStatus());

        // 2. otp/enable is exempt
        MockHttpServletRequest req2 = new MockHttpServletRequest("POST", "/system/merchant/otp/enable");
        req2.addHeader("Token", token);
        MockHttpServletResponse resp2 = new MockHttpServletResponse();
        filter.doFilter(req2, resp2, new MockFilterChain());
        assertEquals(200, resp2.getStatus());

        // 3. logout is exempt
        MockHttpServletRequest req3 = new MockHttpServletRequest("POST", "/system/merchant/logout");
        req3.addHeader("Token", token);
        MockHttpServletResponse resp3 = new MockHttpServletResponse();
        filter.doFilter(req3, resp3, new MockFilterChain());
        assertEquals(200, resp3.getStatus());
    }

    @Test
    public void testMustSetupOtpNotBlockedWhenFlagDisabled() throws ServletException, IOException {
        String jti = "otp-setup-jti-3";
        String token = JwtUtil.createJWT(jti, "2", JwtUtil.JWT_TTL);
        RedisCache mockRedis = org.mockito.Mockito.mock(RedisCache.class);
        LoginUser loginUser = new LoginUser();
        loginUser.setLoginVo(new LoginVo(2L, "0912345679", "pwd", 1, null, 1));
        loginUser.setJti(jti);
        loginUser.setMustSetupOtp(true);
        org.mockito.Mockito.when(mockRedis.getCacheObject("login:2:" + jti)).thenReturn(loginUser);

        ReflectionTestUtils.setField(filter, "a", mockRedis);
        TokenOncePerRequestFilter.redisCache = mockRedis;
        filter.setRequireOtpForPlatformAdmin(false); // Flag disabled

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/system/shop/getShopList");
        request.addHeader("Token", token);

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
        assertNotNull(SecurityContextHolder.getContext().getAuthentication());
    }

    @Test
    public void testTableTokenValidAuthenticatesAndSetsContext() throws ServletException, IOException {
        filter.setAllowRawTableIds(false);
        String qv = com.linmour.security.utils.TableTokenUtil.calculateQv("test_qr_token_12345");
        String tableToken = com.linmour.security.utils.TableTokenUtil.createTableAccessToken(1L, 3L, qv);

        RedisCache mockRedis = org.mockito.Mockito.mock(RedisCache.class);
        org.mockito.Mockito.when(mockRedis.getCacheObject("table:qv:1:3")).thenReturn(qv);
        ReflectionTestUtils.setField(filter, "a", mockRedis);
        TokenOncePerRequestFilter.redisCache = mockRedis;

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/app/order/order/GetCurrentOrderInfo/3");
        request.addHeader("X-Table-Token", tableToken);

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
    }

    @Test
    public void testTableTokenMismatchedPathTableIdReturns403() throws ServletException, IOException {
        filter.setAllowRawTableIds(false);
        String qv = com.linmour.security.utils.TableTokenUtil.calculateQv("test_qr_token_12345");
        String tableToken = com.linmour.security.utils.TableTokenUtil.createTableAccessToken(1L, 3L, qv);

        RedisCache mockRedis = org.mockito.Mockito.mock(RedisCache.class);
        org.mockito.Mockito.when(mockRedis.getCacheObject("table:qv:1:3")).thenReturn(qv);
        ReflectionTestUtils.setField(filter, "a", mockRedis);
        TokenOncePerRequestFilter.redisCache = mockRedis;

        // Token is for table 3, but request path is table 4
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/app/order/order/GetCurrentOrderInfo/4");
        request.addHeader("X-Table-Token", tableToken);

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(403, response.getStatus());
        assertTrue(response.getContentAsString().contains("Không thể thao tác trên bàn khác"));
    }

    @Test
    public void testTableTokenMismatchedHeaderShopIdReturns403() throws ServletException, IOException {
        filter.setAllowRawTableIds(false);
        String qv = com.linmour.security.utils.TableTokenUtil.calculateQv("test_qr_token_12345");
        String tableToken = com.linmour.security.utils.TableTokenUtil.createTableAccessToken(1L, 3L, qv);

        RedisCache mockRedis = org.mockito.Mockito.mock(RedisCache.class);
        org.mockito.Mockito.when(mockRedis.getCacheObject("table:qv:1:3")).thenReturn(qv);
        ReflectionTestUtils.setField(filter, "a", mockRedis);
        TokenOncePerRequestFilter.redisCache = mockRedis;

        // Token is for shop 1, but header claims shop 2
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/app/order/order/GetCurrentOrderInfo/3");
        request.addHeader("X-Table-Token", tableToken);
        request.addHeader("Shopid", "2");

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(403, response.getStatus());
        assertTrue(response.getContentAsString().contains("Không thể thao tác trên quán khác"));
    }

    @Test
    public void testTableTokenMissingWhenFlagFalseReturns401() throws ServletException, IOException {
        filter.setAllowRawTableIds(false);

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/app/order/order/GetCurrentOrderInfo/3");
        // No X-Table-Token header

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(401, response.getStatus());
        assertTrue(response.getContentAsString().contains("Yêu cầu cần quét mã QR tại bàn"));
    }

    @Test
    public void testTableTokenExemptPathsPassEvenWhenFlagFalse() throws ServletException, IOException {
        filter.setAllowRawTableIds(false);

        // /app/restaurant/qr/** is exempt
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/app/restaurant/qr/random_token_123");

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(200, response.getStatus());
    }

    @Test
    public void testTableTokenRevokedQvReturns401() throws ServletException, IOException {
        filter.setAllowRawTableIds(false);
        String oldQv = "oldqv123";
        String tableToken = com.linmour.security.utils.TableTokenUtil.createTableAccessToken(1L, 3L, oldQv);

        RedisCache mockRedis = org.mockito.Mockito.mock(RedisCache.class);
        org.mockito.Mockito.when(mockRedis.getCacheObject("table:qv:1:3")).thenReturn("newqv456");

        ReflectionTestUtils.setField(filter, "a", mockRedis);
        TokenOncePerRequestFilter.redisCache = mockRedis;

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/app/order/order/GetCurrentOrderInfo/3");
        request.addHeader("X-Table-Token", tableToken);

        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(401, response.getStatus());
        assertTrue(response.getContentAsString().contains("Mã QR đã được thay mới"));
    }

    @Test
    public void testTableTokenCacheMissFailClosedWhenQvMismatchInDb() throws ServletException, IOException {
        filter.setAllowRawTableIds(false);
        String oldQv = "oldqv123";
        String tableToken = com.linmour.security.utils.TableTokenUtil.createTableAccessToken(1L, 3L, oldQv);

        RedisCache mockRedis = org.mockito.Mockito.mock(RedisCache.class);
        org.mockito.Mockito.when(mockRedis.getCacheObject("table:qv:1:3")).thenReturn(null);

        ReflectionTestUtils.setField(filter, "a", mockRedis);
        TokenOncePerRequestFilter.redisCache = mockRedis;

        // DB returns new qv
        com.linmour.security.utils.TableQvResolver.setTestResolver((sid, tid) -> "newqv456");
        try {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/app/order/order/GetCurrentOrderInfo/3");
            request.addHeader("X-Table-Token", tableToken);

            MockHttpServletResponse response = new MockHttpServletResponse();
            MockFilterChain chain = new MockFilterChain();

            filter.doFilter(request, response, chain);

            assertEquals(401, response.getStatus());
            assertTrue(response.getContentAsString().contains("Mã QR đã được thay mới"));
        } finally {
            com.linmour.security.utils.TableQvResolver.setTestResolver(null);
        }
    }

    @Test
    public void testTableTokenCacheMissFailClosedWhenTableNotFoundInDb() throws ServletException, IOException {
        filter.setAllowRawTableIds(false);
        String oldQv = "oldqv123";
        String tableToken = com.linmour.security.utils.TableTokenUtil.createTableAccessToken(1L, 3L, oldQv);

        RedisCache mockRedis = org.mockito.Mockito.mock(RedisCache.class);
        org.mockito.Mockito.when(mockRedis.getCacheObject("table:qv:1:3")).thenReturn(null);

        ReflectionTestUtils.setField(filter, "a", mockRedis);
        TokenOncePerRequestFilter.redisCache = mockRedis;

        // DB returns null (table not found / deleted)
        com.linmour.security.utils.TableQvResolver.setTestResolver((sid, tid) -> null);
        try {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/app/order/order/GetCurrentOrderInfo/3");
            request.addHeader("X-Table-Token", tableToken);

            MockHttpServletResponse response = new MockHttpServletResponse();
            MockFilterChain chain = new MockFilterChain();

            filter.doFilter(request, response, chain);

            assertEquals(401, response.getStatus());
            assertTrue(response.getContentAsString().contains("Mã QR đã được thay mới"));
        } finally {
            com.linmour.security.utils.TableQvResolver.setTestResolver(null);
        }
    }

    @Test
    public void testTableTokenCacheMissPassWhenQvMatchesInDb() throws ServletException, IOException {
        filter.setAllowRawTableIds(false);
        String currentQv = "validqv123";
        String tableToken = com.linmour.security.utils.TableTokenUtil.createTableAccessToken(1L, 3L, currentQv);

        RedisCache mockRedis = org.mockito.Mockito.mock(RedisCache.class);
        org.mockito.Mockito.when(mockRedis.getCacheObject("table:qv:1:3")).thenReturn(null);

        ReflectionTestUtils.setField(filter, "a", mockRedis);
        TokenOncePerRequestFilter.redisCache = mockRedis;

        // DB returns matching qv
        com.linmour.security.utils.TableQvResolver.setTestResolver((sid, tid) -> currentQv);
        try {
            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/app/order/order/GetCurrentOrderInfo/3");
            request.addHeader("X-Table-Token", tableToken);

            MockHttpServletResponse response = new MockHttpServletResponse();
            MockFilterChain chain = new MockFilterChain();

            filter.doFilter(request, response, chain);

            assertEquals(200, response.getStatus());
        } finally {
            com.linmour.security.utils.TableQvResolver.setTestResolver(null);
        }
    }
}

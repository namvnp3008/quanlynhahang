package com.linmour.security.filter;


import com.alibaba.fastjson.JSON;

import com.linmour.security.dtos.LoginUser;
import com.linmour.security.dtos.LoginVo;
import com.linmour.security.dtos.Result;
import com.linmour.security.utils.JwtUtil;
import com.linmour.security.utils.TableTokenUtil;
import com.linmour.security.utils.TableQvResolver;
import com.linmour.security.utils.RedisCache;
import com.linmour.security.utils.WebUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.annotation.PostConstruct;
import javax.annotation.Resource;
import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Objects;

import com.linmour.security.utils.SecurityUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cloud.client.ServiceInstance;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.util.AntPathMatcher;
import org.springframework.web.client.RestTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import static com.linmour.security.constants.constant.USER_LOGIN_KEY;
import static com.linmour.security.exception.enums.AppHttpCodeEnum.NEED_LOGIN;

@Component
public class TokenOncePerRequestFilter extends OncePerRequestFilter {

    @Resource
    private RedisCache a;

    //注入为空
    public static RedisCache redisCache;

    @Autowired(required = false)
    private DiscoveryClient discoveryClient;

    @Value("${security.internal-token:}")
    private String configuredInternalToken;

    @Value("${security.jwt-secret:}")
    private String configuredJwtSecret;

    @Value("${security.force-weak-password-change:true}")
    private boolean forceWeakPasswordChange;

    @Value("${security.require-otp-for-platform-admin:true}")
    private boolean requireOtpForPlatformAdmin = true;

    @Value("${security.table-token-secret:}")
    private String configuredTableTokenSecret;

    @Value("${security.allow-raw-table-ids:false}")
    private boolean allowRawTableIds = false;

    public void setForceWeakPasswordChange(boolean forceWeakPasswordChange) {
        this.forceWeakPasswordChange = forceWeakPasswordChange;
    }

    public void setRequireOtpForPlatformAdmin(boolean requireOtpForPlatformAdmin) {
        this.requireOtpForPlatformAdmin = requireOtpForPlatformAdmin;
    }

    public void setAllowRawTableIds(boolean allowRawTableIds) {
        this.allowRawTableIds = allowRawTableIds;
    }

    public static String internalToken;

    private static final AntPathMatcher PATH_MATCHER = new AntPathMatcher();
    private static final String[] PERMIT_ALL_PATTERNS = {
            "/app/**",
            "/websocket/**",
            "/file/**",
            "/error",
            "/system/merchant/login",
            "/system/merchant/register",
            "/doc.html#/**",
            "/swagger-resources/**"
    };

    private static final String[] SHOP_EXEMPT_ADMIN_PATTERNS = {
            "/error",
            "/system/merchant/**",
            "/system/menu/**",
            "/system/dict/**",
            "/system/upload/**",
            "/system/shop/shopList",
            "/system/shop/shopList/**",
            "/system/shop/saveOrUpdateShop",
            "/system/shop/saveOrUpdateShop/**",
            "/system/shop/save0rUpdateShop",
            "/system/shop/save0rUpdateShop/**",
            "/system/shop/SonShopList/**",
            "/system/shop/sonShopList/**",
            "/system/audit/**",
            "/doc.html#/**",
            "/swagger-resources/**",
            "/v2/api-docs/**",
            "/v3/api-docs/**"
    };

    public static boolean isPermitAllPath(String uri) {
        if (uri == null) {
            return false;
        }
        if (uri.contains("login")) {
            return true;
        }
        for (String pattern : PERMIT_ALL_PATTERNS) {
            if (PATH_MATCHER.match(pattern, uri)) {
                return true;
            }
        }
        return false;
    }

    public static boolean isShopExemptAdminPath(String uri) {
        if (uri == null) {
            return false;
        }
        for (String pattern : SHOP_EXEMPT_ADMIN_PATTERNS) {
            if (PATH_MATCHER.match(pattern, uri)) {
                return true;
            }
        }
        return false;
    }

    @PostConstruct
    public void b() {
        redisCache = this.a;
        if (configuredInternalToken == null || configuredInternalToken.trim().isEmpty()) {
            throw new IllegalStateException("Cấu hình 'security.internal-token' không được để trống! Dịch vụ không thể khởi động nếu thiếu token nội bộ.");
        }
        internalToken = configuredInternalToken;
        if (configuredJwtSecret == null || configuredJwtSecret.trim().isEmpty()) {
            throw new IllegalStateException("Cấu hình 'security.jwt-secret' không được để trống! Dịch vụ không thể khởi động nếu thiếu JWT secret.");
        }
        JwtUtil.setJwtKey(configuredJwtSecret.trim());
        if (configuredTableTokenSecret != null && !configuredTableTokenSecret.trim().isEmpty()) {
            TableTokenUtil.setTableTokenKey(configuredTableTokenSecret.trim());
        }
    }


    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain) throws ServletException, IOException {
        String shopId = request.getHeader("Shopid");
        String token = request.getHeader("Token");
        String uri = request.getRequestURI();
        boolean isPublicPath = isPermitAllPath(uri);

        try {
            SecurityUtils.clearAll();
            String xTableToken = request.getHeader("X-Table-Token");
            if (xTableToken != null && !xTableToken.trim().isEmpty()) {
                try {
                    io.jsonwebtoken.Claims tableClaims = TableTokenUtil.parseTableAccessToken(xTableToken.trim());
                    Long tSid = tableClaims.get("sid", Number.class).longValue();
                    Long tTid = tableClaims.get("tid", Number.class).longValue();
                    String tQv = tableClaims.get("qv", String.class);

                    // T-FIX-1: Kiểm tra qv theo cơ chế FAIL-CLOSED khi trượt cache
                    String currentSecret = this.configuredInternalToken != null ? this.configuredInternalToken : internalToken;
                    String currentQv = TableQvResolver.resolveQv(tSid, tTid, redisCache, currentSecret);
                    if (currentQv == null || !currentQv.equals(tQv)) {
                        Result result = Result.error(401, "Mã QR đã được thay mới, vui lòng quét lại");
                        WebUtils.renderString(response, JSON.toJSONString(result), 401);
                        return;
                    }

                    SecurityUtils.setShopId(tSid);
                    SecurityUtils.setTableId(tTid);
                    SecurityUtils.setTableToken(xTableToken.trim());

                    // Lớp 2: Kiểm tra header Shopid nếu client gửi kèm thì không được lệch
                    if (shopId != null && !shopId.trim().isEmpty()) {
                        try {
                            Long parsedShopId = Long.valueOf(shopId.trim());
                            if (!tSid.equals(parsedShopId)) {
                                Result result = Result.error(403, "Không thể thao tác trên quán khác");
                                WebUtils.renderString(response, JSON.toJSONString(result), 403);
                                return;
                            }
                        } catch (NumberFormatException ignored) {}
                    }

                    // Lớp 2: Kiểm tra tableId trong URI nếu có
                    if (uri.startsWith("/app/order/order/GetCurrentOrderInfo/") ||
                        uri.startsWith("/app/order/order/updateOrderItemStatus/") ||
                        uri.startsWith("/app/restaurant/table/")) {
                        String[] parts = uri.split("/");
                        if (parts.length > 0) {
                            String idStr = parts[parts.length - 1];
                            if (uri.startsWith("/app/order/order/updateOrderItemStatus/")) {
                                idStr = parts[parts.length - 2];
                            }
                            try {
                                Long pathTableId = Long.valueOf(idStr);
                                if (!tTid.equals(pathTableId)) {
                                    Result result = Result.error(403, "Không thể thao tác trên bàn khác");
                                    WebUtils.renderString(response, JSON.toJSONString(result), 403);
                                    return;
                                }
                            } catch (NumberFormatException ignored) {}
                        }
                    }
                } catch (io.jsonwebtoken.ExpiredJwtException e) {
                    Result result = Result.error(401, "Phiên bàn đã hết hạn, vui lòng quét lại mã QR");
                    WebUtils.renderString(response, JSON.toJSONString(result), 401);
                    return;
                } catch (Exception e) {
                    Result result = Result.error(401, "Mã QR không hợp lệ hoặc đã được thay mới");
                    WebUtils.renderString(response, JSON.toJSONString(result), 401);
                    return;
                }
            } else {
                if (shopId != null && !shopId.trim().isEmpty()) {
                    try {
                        SecurityUtils.setShopId(Long.valueOf(shopId.trim()));
                    } catch (NumberFormatException ignored) {
                    }
                }

                // T-1 Lớp 2: Nếu không có X-Table-Token và cờ allow-raw-table-ids = false
                if (uri.startsWith("/app/") && !allowRawTableIds) {
                    boolean isExemptAppPath = uri.startsWith("/app/restaurant/qr/") ||
                                              uri.startsWith("/app/order/order/payos/webhook");
                    if (!isExemptAppPath) {
                        Result result = Result.error(401, "Yêu cầu cần quét mã QR tại bàn (thiếu X-Table-Token hợp lệ)");
                        WebUtils.renderString(response, JSON.toJSONString(result), 401);
                        return;
                    }
                }
            }

            // Hỗ trợ request nội bộ có X-Internal-Token hợp lệ
            String reqInternalToken = request.getHeader("X-Internal-Token");
            String currentSecret = this.configuredInternalToken != null ? this.configuredInternalToken : internalToken;
            if (reqInternalToken != null && currentSecret != null && !currentSecret.trim().isEmpty() && currentSecret.equals(reqInternalToken.trim())) {
                LoginUser loginUser = new LoginUser();
                loginUser.setLoginVo(new LoginVo(1L, 1));
                if (shopId != null && !shopId.trim().isEmpty()) {
                    try {
                        loginUser.getLoginVo().setShopId(Long.valueOf(shopId.trim()));
                    } catch (NumberFormatException ignored) {}
                }
                UsernamePasswordAuthenticationToken authenticationToken = new UsernamePasswordAuthenticationToken(loginUser, null, loginUser.getAuthorities());
                SecurityContextHolder.getContext().setAuthentication(authenticationToken);
                filterChain.doFilter(request, response);
                return;
            }

            //这个为空说明用户未注册，就直接放行，让他就像往下面的过滤链走
            if ((token == null || uri.contains("login"))) {
                filterChain.doFilter(request, response);
                return;
            }

            // 支持内部Feign调用或测试
            if (token.equals("1")) {
                // Nếu có X-Internal-Token hợp lệ thì đã được xác thực ở trên.
                // Đến đây nghĩa là thiếu hoặc sai X-Internal-Token: xử lý như chưa đăng nhập, để Spring Security chặn 403.
                filterChain.doFilter(request, response);
                return;
            } else {
                String id;
                String jti = null;
                // 从token解析出id和jti
                try {
                    io.jsonwebtoken.Claims claims = JwtUtil.parseJWT(token);
                    id = claims.getSubject();
                    jti = claims.getId();
                } catch (Exception e) {
                    if (isPublicPath) {
                        filterChain.doFilter(request, response);
                        return;
                    }
                    Result result = Result.error(NEED_LOGIN);
                    WebUtils.renderString(response, JSON.toJSONString(result));
                    return;
                }
                LoginUser user = null;
                String sessionKey = (jti != null && !jti.trim().isEmpty())
                        ? USER_LOGIN_KEY + id + ":" + jti
                        : USER_LOGIN_KEY + id;

                if (redisCache != null && id != null) {
                    Object cachedUser = redisCache.getCacheObject(sessionKey);
                    if (cachedUser == null && jti != null) {
                        cachedUser = redisCache.getCacheObject(USER_LOGIN_KEY + id);
                        if (cachedUser != null) {
                            sessionKey = USER_LOGIN_KEY + id;
                        }
                    }
                    if (cachedUser instanceof LoginUser) {
                        user = (LoginUser) cachedUser;
                    } else if (cachedUser instanceof com.alibaba.fastjson.JSON) {
                        user = JSON.toJavaObject((com.alibaba.fastjson.JSON) cachedUser, LoginUser.class);
                    } else if (cachedUser instanceof String) {
                        user = JSON.parseObject((String) cachedUser, LoginUser.class);
                    } else if (cachedUser != null) {
                        user = JSON.parseObject(JSON.toJSONString(cachedUser), LoginUser.class);
                    }
                }
                if (Objects.isNull(user)) {
                    if (isPublicPath) {
                        filterChain.doFilter(request, response);
                        return;
                    }
                    Result result = Result.error(NEED_LOGIN);
                    WebUtils.renderString(response, JSON.toJSONString(result));
                    return;
                }

                // S2: Gia hạn sliding TTL 8 giờ và cập nhật lastSeenAt
                if (redisCache != null) {
                    try {
                        String nowStr = java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").format(java.time.LocalDateTime.now());
                        user.setLastSeenAt(nowStr);
                        redisCache.setCacheObject(sessionKey, user, 8, java.util.concurrent.TimeUnit.HOURS);
                    } catch (Exception ignored) {
                        try {
                            redisCache.expire(sessionKey, 8, java.util.concurrent.TimeUnit.HOURS);
                        } catch (Exception ignored2) {}
                    }
                }

                // S2: Bắt buộc đổi mật khẩu yếu nếu forceWeakPasswordChange = true
                if (forceWeakPasswordChange && Boolean.TRUE.equals(user.getMustChangePassword())) {
                    boolean isExempt = uri.contains("/system/merchant/changePassword")
                            || uri.contains("/system/merchant/otp/setup")
                            || uri.contains("/system/merchant/otp/enable")
                            || uri.contains("/system/merchant/logout")
                            || uri.contains("/system/merchant/userInfo")
                            || isPublicPath;
                    if (!isExempt) {
                        java.util.Map<String, Object> data = new java.util.HashMap<>();
                        data.put("reason", "MUST_CHANGE_PASSWORD");
                        Result result = Result.error(403, "Bạn cần đổi mật khẩu trước khi tiếp tục", data);
                        WebUtils.renderString(response, JSON.toJSONString(result), 403);
                        return;
                    }
                }

                // S4: Bắt buộc cài đặt OTP cho platform admin nếu requireOtpForPlatformAdmin = true
                if (requireOtpForPlatformAdmin && Boolean.TRUE.equals(user.getMustSetupOtp())) {
                    boolean isExempt = uri.contains("/system/merchant/otp/setup")
                            || uri.contains("/system/merchant/otp/enable")
                            || uri.contains("/system/merchant/changePassword")
                            || uri.contains("/system/merchant/logout")
                            || uri.contains("/system/merchant/userInfo")
                            || isPublicPath;
                    if (!isExempt) {
                        java.util.Map<String, Object> data = new java.util.HashMap<>();
                        data.put("reason", "MUST_SETUP_OTP");
                        Result result = Result.error(403, "Bạn cần cài đặt xác thực 2 lớp (OTP) trước khi tiếp tục", data);
                        WebUtils.renderString(response, JSON.toJSONString(result), 403);
                        return;
                    }
                }

                if (shopId != null && !shopId.trim().isEmpty()){
                    try {
                        user.getLoginVo().setShopId(Long.valueOf(shopId.trim()));
                    } catch (NumberFormatException ignored) {}
                }

                // Q7 & BUG-PROD-2: Chống truy cập chéo quán và bắt buộc Shopid trên đường admin của merchant
                boolean isAdminPath = !uri.startsWith("/app/") && !uri.startsWith("/websocket/") && !uri.startsWith("/file/");
                if (isAdminPath && user.getLoginVo() != null && Integer.valueOf(2).equals(user.getLoginVo().getType())) {
                    if (!isShopExemptAdminPath(uri)) {
                        if (shopId == null || shopId.trim().isEmpty()) {
                            Result result = Result.error(400, "Vui lòng chọn quán ăn hợp lệ");
                            WebUtils.renderString(response, JSON.toJSONString(result), 400);
                            return;
                        }
                        Long targetShopId;
                        try {
                            targetShopId = Long.valueOf(shopId.trim());
                            if (targetShopId <= 0) {
                                Result result = Result.error(400, "Vui lòng chọn quán ăn hợp lệ");
                                WebUtils.renderString(response, JSON.toJSONString(result), 400);
                                return;
                            }
                        } catch (NumberFormatException e) {
                            Result result = Result.error(400, "Vui lòng chọn quán ăn hợp lệ");
                            WebUtils.renderString(response, JSON.toJSONString(result), 400);
                            return;
                        }
                        Long merchantId = user.getLoginVo().getId();
                        if (!isShopOwnedByMerchant(merchantId, targetShopId)) {
                            Result result = Result.error(403, "Bạn không có quyền với quán này");
                            WebUtils.renderString(response, JSON.toJSONString(result), 403);
                            return;
                        }
                    }
                }

                UsernamePasswordAuthenticationToken authenticationToken = new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities());
                SecurityContextHolder.getContext().setAuthentication(authenticationToken);
                filterChain.doFilter(request, response);
            }
        } finally {
            SecurityUtils.clearAll();
        }
    }

    public boolean isShopOwnedByMerchant(Long merchantId, Long shopId) {
        if (merchantId == null || shopId == null) {
            return false;
        }
        String cacheKey = "merchant:shops:" + merchantId;
        RedisCache cache = this.a != null ? this.a : redisCache;
        if (cache != null) {
            try {
                Object cached = cache.getCacheObject(cacheKey);
                if (cached instanceof List) {
                    List<?> list = (List<?>) cached;
                    for (Object item : list) {
                        if (item != null && Long.valueOf(item.toString()).equals(shopId)) {
                            return true;
                        }
                    }
                    return false;
                }
            } catch (Exception ignored) {
            }
        }

        // Cache miss: attempt to load from linmour-system
        List<Long> shopIds = fetchMerchantShopIds(merchantId);
        if (shopIds != null) {
            if (cache != null) {
                try {
                    cache.setCacheObject(cacheKey, shopIds, 10, TimeUnit.MINUTES);
                } catch (Exception ignored) {}
            }
            return shopIds.contains(shopId);
        }

        return false;
    }

    private List<Long> fetchMerchantShopIds(Long merchantId) {
        if (discoveryClient == null) {
            return null;
        }
        try {
            List<ServiceInstance> instances = discoveryClient.getInstances("linmour-system");
            if (instances == null || instances.isEmpty()) {
                return null;
            }
            ServiceInstance instance = instances.get(0);
            String url = instance.getUri().toString() + "/system/shop/internal/merchantShopIds/" + merchantId;

            SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
            factory.setConnectTimeout(2000);
            factory.setReadTimeout(2000);
            RestTemplate restTemplate = new RestTemplate(factory);

            HttpHeaders headers = new HttpHeaders();
            headers.set("Token", "1");
            String currentSecret = this.configuredInternalToken != null ? this.configuredInternalToken : internalToken;
            if (currentSecret != null && !currentSecret.trim().isEmpty()) {
                headers.set("X-Internal-Token", currentSecret);
            }
            HttpEntity<Void> requestEntity = new HttpEntity<>(headers);

            ResponseEntity<String> resp = restTemplate.exchange(url, HttpMethod.GET, requestEntity, String.class);
            if (resp.getStatusCode().is2xxSuccessful() && resp.getBody() != null) {
                com.alibaba.fastjson.JSONObject json = JSON.parseObject(resp.getBody());
                if (json != null && json.containsKey("data")) {
                    com.alibaba.fastjson.JSONArray arr = json.getJSONArray("data");
                    if (arr != null) {
                        List<Long> ids = new ArrayList<>();
                        for (int i = 0; i < arr.size(); i++) {
                            ids.add(arr.getLong(i));
                        }
                        return ids;
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return null;
    }
}

package com.linmour.system.service.impl;

import cn.hutool.core.util.ObjectUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.linmour.common.tess4j.Tess4jClient;
import com.linmour.security.dtos.LoginUser;
import com.linmour.security.dtos.LoginVo;
import com.linmour.security.dtos.PageResult;
import com.linmour.security.dtos.Result;
import com.linmour.security.dtos.SessionVo;
import com.linmour.security.exception.CustomException;
import com.linmour.security.exception.enums.AppHttpCodeEnum;
import com.linmour.security.utils.JwtUtil;
import com.linmour.security.utils.LoginAttemptService;
import com.linmour.security.utils.PasswordPolicyUtils;
import com.linmour.security.utils.RedisCache;
import com.linmour.security.utils.WebUtils;
import com.linmour.system.convert.MerchantConvert;
import com.linmour.system.service.AuditService;
import com.linmour.system.pojo.Dto.AuditLogReqDto;
import com.linmour.system.service.ShopService;
import com.linmour.system.mapper.MerchantMapper;
import com.linmour.system.pojo.Do.Merchant;
import com.linmour.system.pojo.Do.Shop;
import com.linmour.system.pojo.Dto.ChangePasswordDto;
import com.linmour.system.pojo.Dto.MerchantPage;
import com.linmour.system.pojo.Dto.MerchantRegisterDto;
import com.linmour.system.pojo.Dto.UserInfoDto;
import com.alibaba.fastjson.JSON;
import com.linmour.security.utils.AesGcmUtil;
import com.linmour.security.utils.SecurityUtils;
import com.linmour.security.utils.TotpUtil;
import com.linmour.system.pojo.Dto.OtpDisableReqDto;
import com.linmour.system.pojo.Dto.OtpEnableReqDto;
import com.linmour.system.pojo.Dto.OtpLoginReqDto;
import com.linmour.system.pojo.Dto.OtpSetupReqDto;
import com.linmour.system.pojo.Dto.OtpSetupRespDto;
import com.linmour.system.service.MerchantService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.multipart.MultipartFile;
import org.apache.commons.lang3.StringUtils;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import javax.annotation.Resource;
import javax.imageio.ImageIO;
import javax.servlet.http.HttpServletRequest;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static com.linmour.security.constants.constant.USER_LOGIN_KEY;


/**
 * @author linmour
 * @description 针对表【system_merchant】的数据库操作Service实现
 * @createDate 2023-07-17 20:05:36
 */
@Service
public class MerchantServiceImpl extends ServiceImpl<MerchantMapper, Merchant>
        implements MerchantService {

    @Resource
    private AuthenticationManager authenticationManager;
    @Resource
    private RedisCache redisCache;
    @Resource
    private MerchantMapper merchantMapper;

    @Resource
    private Tess4jClient tess4jClient;

    @Resource
    private ShopService shopService;

    @Resource
    private LoginAttemptService loginAttemptService;

    @Resource
    private AuditService auditService;

    @Value("${security.otp-secret:}")
    private String otpSecret;

    @Value("${security.require-otp-for-platform-admin:true}")
    private boolean requireOtpForPlatformAdmin = true;

    @Value("${security.force-weak-password-change:true}")
    private boolean forceWeakPasswordChange = true;

    public void setOtpSecret(String otpSecret) {
        this.otpSecret = otpSecret;
    }

    public void setRequireOtpForPlatformAdmin(boolean requireOtpForPlatformAdmin) {
        this.requireOtpForPlatformAdmin = requireOtpForPlatformAdmin;
    }

    public void setForceWeakPasswordChange(boolean forceWeakPasswordChange) {
        this.forceWeakPasswordChange = forceWeakPasswordChange;
    }

    private String getEffectiveOtpSecret() {
        if (otpSecret != null && !otpSecret.trim().isEmpty()) {
            return otpSecret.trim();
        }
        String env = System.getenv("OTP_SECRET");
        if (env != null && !env.trim().isEmpty()) {
            return env.trim();
        }
        return "default-otp-secret-master-key-123456";
    }

    private HttpServletRequest getCurrentHttpRequest() {
        RequestAttributes attribs = RequestContextHolder.getRequestAttributes();
        if (attribs instanceof ServletRequestAttributes) {
            return ((ServletRequestAttributes) attribs).getRequest();
        }
        return null;
    }

    @Override
    public Result login(LoginVo loginVo) {
        String phone = loginVo != null ? loginVo.getPhone() : null;
        HttpServletRequest request = getCurrentHttpRequest();
        String clientIp = WebUtils.getClientIp(request);

        // 1. S1: Kiểm tra khoá brute-force theo SĐT hoặc IP
        long retryAfter = loginAttemptService.getRetryAfterSeconds(phone, clientIp);
        if (retryAfter > 0) {
            long minutes = (long) Math.ceil(retryAfter / 60.0);
            if (minutes < 1) minutes = 1;
            Map<String, Object> data = new HashMap<>();
            data.put("retryAfterSeconds", retryAfter);
            auditService.recordAudit(AuditLogReqDto.builder()
                    .actorName(phone != null ? phone : "Ẩn danh")
                    .actorType(2)
                    .action("LOGIN_LOCKED")
                    .ip(clientIp)
                    .userAgent(request != null ? request.getHeader("User-Agent") : null)
                    .result("FAIL")
                    .build());
            return Result.error(429, "Đăng nhập sai quá nhiều lần, vui lòng thử lại sau " + minutes + " phút", data);
        }

        UsernamePasswordAuthenticationToken authenticationToken = new UsernamePasswordAuthenticationToken(phone, loginVo != null ? loginVo.getPassword() : null);
        Authentication authenticate;
        try {
            //调用UserDetailsService进行验证
            authenticate = authenticationManager.authenticate(authenticationToken);
        } catch (AuthenticationException e) {
            loginAttemptService.recordFailure(phone, clientIp);
            long newRetry = loginAttemptService.getRetryAfterSeconds(phone, clientIp);
            if (newRetry > 0) {
                long minutes = (long) Math.ceil(newRetry / 60.0);
                if (minutes < 1) minutes = 1;
                Map<String, Object> data = new HashMap<>();
                data.put("retryAfterSeconds", newRetry);
                auditService.recordAudit(AuditLogReqDto.builder()
                        .actorName(phone != null ? phone : "Ẩn danh")
                        .actorType(2)
                        .action("LOGIN_LOCKED")
                        .ip(clientIp)
                        .userAgent(request != null ? request.getHeader("User-Agent") : null)
                        .result("FAIL")
                        .build());
                return Result.error(429, "Đăng nhập sai quá nhiều lần, vui lòng thử lại sau " + minutes + " phút", data);
            }
            auditService.recordAudit(AuditLogReqDto.builder()
                    .actorName(phone != null ? phone : "Ẩn danh")
                    .actorType(2)
                    .action("LOGIN_FAIL")
                    .ip(clientIp)
                    .userAgent(request != null ? request.getHeader("User-Agent") : null)
                    .result("FAIL")
                    .build());
            throw new CustomException(AppHttpCodeEnum.LOGIN_ERROR);
        }

        LoginUser loginUser = (LoginUser) authenticate.getPrincipal();
        if (loginUser.getLoginVo().getStatus() == 0) {
            throw new CustomException(AppHttpCodeEnum.ACCOUNT_DISABLE);
        }
        String UserId = loginUser.getLoginVo().getId().toString();
        Merchant merchant = merchantMapper.selectById(Long.valueOf(UserId));

        // S4: Nếu tài khoản đã bật OTP -> Không cấp JWT, trả về { otpRequired: true, otpTicket }
        if (merchant != null && Integer.valueOf(1).equals(merchant.getOtpEnabled())) {
            String otpTicket = UUID.randomUUID().toString().replace("-", "");
            redisCache.setCacheObject("otp:ticket:" + otpTicket, UserId, 5, TimeUnit.MINUTES);
            Map<String, Object> otpData = new HashMap<>();
            otpData.put("otpRequired", true);
            otpData.put("otpTicket", otpTicket);
            return Result.success(otpData, "Cần xác thực 2 bước");
        }

        // Đăng nhập thành công (không dùng OTP) -> Xoá bộ đếm thất bại của SĐT
        loginAttemptService.recordSuccess(phone);

        // S2: Tạo JTI riêng cho mỗi phiên đăng nhập
        String jti = JwtUtil.getUUID();
        String jwt = JwtUtil.createJWT(jti, UserId, JwtUtil.JWT_TTL);

        // Ghi lại siêu dữ liệu của phiên
        String nowStr = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").format(LocalDateTime.now());
        loginUser.setJti(jti);
        loginUser.setCreatedAt(nowStr);
        loginUser.setLastSeenAt(nowStr);
        loginUser.setIp(clientIp);
        String userAgent = request != null ? request.getHeader("User-Agent") : null;
        loginUser.setUserAgent(userAgent);

        // S2: Kiểm tra chính sách mật khẩu yếu hoặc cờ must_change_password
        boolean isWeak = PasswordPolicyUtils.isWeakPassword(loginVo != null ? loginVo.getPassword() : null, merchant != null ? merchant.getPhone() : phone);
        boolean mustChange = (merchant != null && Integer.valueOf(1).equals(merchant.getMustChangePassword()))
                || (forceWeakPasswordChange && isWeak);
        loginUser.setMustChangePassword(mustChange);

        // S4: Bắt buộc cài đặt OTP cho platform admin nếu requireOtpForPlatformAdmin = true
        boolean isPlatformAdmin = merchant != null && Integer.valueOf(1).equals(merchant.getType());
        boolean mustSetupOtp = isPlatformAdmin && requireOtpForPlatformAdmin;
        loginUser.setMustSetupOtp(mustSetupOtp);

        // S2: Lưu phiên vào Redis theo key login:<merchantId>:<jti> với sliding TTL 8 giờ
        String sessionKey = USER_LOGIN_KEY + UserId + ":" + jti;
        redisCache.setCacheObject(sessionKey, loginUser, 8, TimeUnit.HOURS);

        // Q7: Cache danh sách quán của merchant trong Redis DB 2 (TTL 10 phút)
        if (loginUser.getLoginVo() != null && loginUser.getLoginVo().getId() != null) {
            try {
                List<Long> shopIds = shopService.getShopIdsByMerchantId(loginUser.getLoginVo().getId());
                redisCache.setCacheObject("merchant:shops:" + UserId, shopIds, 10, java.util.concurrent.TimeUnit.MINUTES);
            } catch (Exception ignored) {}
        }

        SecurityContextHolder.getContext().setAuthentication(authenticate);
        HashMap<String, Object> map = new HashMap<>();
        UserInfoDto userInfo = merchant != null ? MerchantConvert.IN.MerchantToUserInfoDto(merchant) : getUserInfo(Long.valueOf(UserId));
        map.put("token", jwt);
        map.put("userInfo", userInfo);
        map.put("mustChangePassword", mustChange);
        map.put("otpRequired", false);
        map.put("mustSetupOtp", mustSetupOtp);
        map.put("otpEnabled", merchant != null && merchant.getOtpEnabled() != null ? merchant.getOtpEnabled() : 0);

        // S3: Audit LOGIN_SUCCESS
        auditService.recordAudit(AuditLogReqDto.builder()
                .merchantId(Long.valueOf(UserId))
                .actorName(merchant != null && StringUtils.isNotBlank(merchant.getRealName()) ? merchant.getRealName() : phone)
                .actorType(loginUser.getLoginVo() != null ? loginUser.getLoginVo().getType() : 2)
                .action("LOGIN_SUCCESS")
                .ip(clientIp)
                .userAgent(userAgent)
                .result("SUCCESS")
                .build());

        return Result.success(map);
    }

    @Override
    public Result logoutCurrent() {
        Long userId = SecurityUtils.getUserId();
        String jti = SecurityUtils.getJti();
        if (userId == null || userId == 0L) {
            throw new CustomException(AppHttpCodeEnum.NEED_LOGIN);
        }
        if (jti != null && !jti.trim().isEmpty()) {
            redisCache.deleteObject(USER_LOGIN_KEY + userId + ":" + jti);
        }
        redisCache.deleteObject(USER_LOGIN_KEY + userId);
        redisCache.deleteObject("merchant:shops:" + userId);

        // S3: Audit LOGOUT
        HttpServletRequest req = getCurrentHttpRequest();
        String clientIp = WebUtils.getClientIp(req);
        String uName = SecurityUtils.getLoginUser() != null && SecurityUtils.getLoginUser().getLoginVo() != null
                && StringUtils.isNotBlank(SecurityUtils.getLoginUser().getLoginVo().getPhone())
                ? SecurityUtils.getLoginUser().getLoginVo().getPhone() : "User " + userId;
        Integer uType = SecurityUtils.getUserType();
        auditService.recordAudit(AuditLogReqDto.builder()
                .merchantId(userId)
                .actorName(uName)
                .actorType(uType != null ? uType : 2)
                .action("LOGOUT")
                .ip(clientIp)
                .userAgent(req != null ? req.getHeader("User-Agent") : null)
                .result("SUCCESS")
                .build());

        return Result.success();
    }

    @Override
    public Result logoutAll() {
        Long userId = SecurityUtils.getUserId();
        if (userId == null || userId == 0L) {
            throw new CustomException(AppHttpCodeEnum.NEED_LOGIN);
        }
        java.util.Set<String> keys = redisCache.scan(USER_LOGIN_KEY + userId + ":*");
        if (keys != null && !keys.isEmpty()) {
            redisCache.deleteObject(keys);
        }
        redisCache.deleteObject(USER_LOGIN_KEY + userId);
        redisCache.deleteObject("merchant:shops:" + userId);

        // S3: Audit LOGOUT_ALL
        HttpServletRequest req = getCurrentHttpRequest();
        String clientIp = WebUtils.getClientIp(req);
        String uName = SecurityUtils.getLoginUser() != null && SecurityUtils.getLoginUser().getLoginVo() != null
                && StringUtils.isNotBlank(SecurityUtils.getLoginUser().getLoginVo().getPhone())
                ? SecurityUtils.getLoginUser().getLoginVo().getPhone() : "User " + userId;
        Integer uType = SecurityUtils.getUserType();
        auditService.recordAudit(AuditLogReqDto.builder()
                .merchantId(userId)
                .actorName(uName)
                .actorType(uType != null ? uType : 2)
                .action("LOGOUT_ALL")
                .ip(clientIp)
                .userAgent(req != null ? req.getHeader("User-Agent") : null)
                .result("SUCCESS")
                .build());

        return Result.success();
    }

    @Override
    public Result getSessions() {
        Long userId = SecurityUtils.getUserId();
        if (userId == null || userId == 0L) {
            throw new CustomException(AppHttpCodeEnum.NEED_LOGIN);
        }
        String currentJti = SecurityUtils.getJti();
        java.util.Set<String> keys = redisCache.scan(USER_LOGIN_KEY + userId + ":*");
        List<SessionVo> sessionList = new ArrayList<>();
        if (keys != null) {
            for (String key : keys) {
                Object cached = redisCache.getCacheObject(key);
                LoginUser u = null;
                if (cached instanceof LoginUser) {
                    u = (LoginUser) cached;
                } else if (cached != null) {
                    try {
                        u = com.alibaba.fastjson.JSON.parseObject(com.alibaba.fastjson.JSON.toJSONString(cached), LoginUser.class);
                    } catch (Exception ignored) {}
                }
                if (u != null) {
                    String sessJti = u.getJti();
                    if (sessJti == null && key.contains(":")) {
                        sessJti = key.substring(key.lastIndexOf(":") + 1);
                    }
                    String jti4 = sessJti != null && sessJti.length() > 4 ? "…" + sessJti.substring(sessJti.length() - 4) : sessJti;
                    boolean isCurrent = currentJti != null && currentJti.equals(sessJti);
                    sessionList.add(SessionVo.builder()
                            .jti4(jti4)
                            .createdAt(u.getCreatedAt())
                            .lastSeenAt(u.getLastSeenAt())
                            .ip(u.getIp())
                            .userAgent(u.getUserAgent())
                            .current(isCurrent)
                            .build());
                }
            }
        }
        sessionList.sort((a, b) -> {
            if (Boolean.TRUE.equals(a.getCurrent())) return -1;
            if (Boolean.TRUE.equals(b.getCurrent())) return 1;
            if (a.getLastSeenAt() != null && b.getLastSeenAt() != null) {
                return b.getLastSeenAt().compareTo(a.getLastSeenAt());
            }
            return 0;
        });
        return Result.success(sessionList);
    }

    @Override
    public Result changePassword(ChangePasswordDto changePasswordDto) {
        Long userId = SecurityUtils.getUserId();
        if (userId == null || userId == 0L) {
            throw new CustomException(AppHttpCodeEnum.NEED_LOGIN);
        }
        Merchant merchant = merchantMapper.selectById(userId);
        if (merchant == null) {
            throw new CustomException(AppHttpCodeEnum.USERINFO_ERROR);
        }

        HttpServletRequest request = getCurrentHttpRequest();
        String clientIp = WebUtils.getClientIp(request);
        String phone = merchant.getPhone();

        // 1. S1: Kiểm tra khoá brute-force
        long retryAfter = loginAttemptService.getRetryAfterSeconds(phone, clientIp);
        if (retryAfter > 0) {
            long minutes = (long) Math.ceil(retryAfter / 60.0);
            if (minutes < 1) minutes = 1;
            Map<String, Object> data = new HashMap<>();
            data.put("retryAfterSeconds", retryAfter);
            return Result.error(429, "Đăng nhập sai quá nhiều lần, vui lòng thử lại sau " + minutes + " phút", data);
        }

        if (changePasswordDto == null || changePasswordDto.getOldPassword() == null || changePasswordDto.getOldPassword().trim().isEmpty()) {
            return Result.error(400, "Mật khẩu cũ không được để trống");
        }
        if (changePasswordDto.getNewPassword() == null || changePasswordDto.getNewPassword().trim().isEmpty()) {
            return Result.error(400, "Mật khẩu mới không được để trống");
        }

        org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder encoder =
                new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder();

        // 2. Xác thực mật khẩu cũ
        if (!encoder.matches(changePasswordDto.getOldPassword(), merchant.getPassword())) {
            loginAttemptService.recordFailure(phone, clientIp);
            long newRetry = loginAttemptService.getRetryAfterSeconds(phone, clientIp);
            if (newRetry > 0) {
                long minutes = (long) Math.ceil(newRetry / 60.0);
                if (minutes < 1) minutes = 1;
                Map<String, Object> data = new HashMap<>();
                data.put("retryAfterSeconds", newRetry);
                return Result.error(429, "Đăng nhập sai quá nhiều lần, vui lòng thử lại sau " + minutes + " phút", data);
            }
            return Result.error(AppHttpCodeEnum.OLD_PASSWORD_ERROR.getCode(), AppHttpCodeEnum.OLD_PASSWORD_ERROR.getMsg());
        }

        // Mật khẩu cũ đúng -> Xóa bộ đếm thất bại
        loginAttemptService.recordSuccess(phone);

        // 3. Kiểm tra chính sách mật khẩu mới
        String policyError = PasswordPolicyUtils.validateNewPassword(
                changePasswordDto.getNewPassword(),
                changePasswordDto.getOldPassword(),
                phone
        );
        if (policyError != null) {
            return Result.error(400, policyError);
        }

        // Mật khẩu mới không được trùng với mật khẩu cũ trong DB
        if (encoder.matches(changePasswordDto.getNewPassword(), merchant.getPassword())) {
            return Result.error(400, "Mật khẩu mới không được trùng với mật khẩu cũ");
        }

        // 4. Cập nhật CSDL
        merchant.setPassword(encoder.encode(changePasswordDto.getNewPassword()));
        merchant.setMustChangePassword(0);
        merchant.setPasswordChangedAt(LocalDateTime.now());
        merchantMapper.updateById(merchant);

        // 5. Cập nhật phiên hiện tại trong Redis và xoá mọi phiên khác
        String currentJti = SecurityUtils.getJti();
        String currentKey = currentJti != null ? USER_LOGIN_KEY + userId + ":" + currentJti : USER_LOGIN_KEY + userId;
        LoginUser currentUser = SecurityUtils.getLoginUser();
        if (currentUser != null) {
            currentUser.setMustChangePassword(false);
            redisCache.setCacheObject(currentKey, currentUser, 8, TimeUnit.HOURS);
        }

        java.util.Set<String> allSessions = redisCache.scan(USER_LOGIN_KEY + userId + ":*");
        if (allSessions != null) {
            for (String sessKey : allSessions) {
                if (!sessKey.equals(currentKey)) {
                    redisCache.deleteObject(sessKey);
                }
            }
        }
        if (!currentKey.equals(USER_LOGIN_KEY + userId)) {
            redisCache.deleteObject(USER_LOGIN_KEY + userId);
        }

        // S3: Audit PASSWORD_CHANGE
        auditService.recordAudit(AuditLogReqDto.builder()
                .merchantId(userId)
                .actorName(StringUtils.isNotBlank(merchant.getRealName()) ? merchant.getRealName() : phone)
                .actorType(merchant.getType() != null ? merchant.getType() : 2)
                .action("PASSWORD_CHANGE")
                .targetType("merchant")
                .targetId(String.valueOf(userId))
                .ip(clientIp)
                .userAgent(request != null ? request.getHeader("User-Agent") : null)
                .result("SUCCESS")
                .build());

        return Result.success();
    }

    @Override
    public Result logout(Long id) {
        Long currentUserId = SecurityUtils.getUserId();
        Integer userType = SecurityUtils.getUserType();
        if (currentUserId == null || currentUserId == 0L) {
            throw new CustomException(AppHttpCodeEnum.NEED_LOGIN);
        }
        if (id == null) {
            id = currentUserId;
        }

        boolean isSelf = id.equals(currentUserId);
        boolean isPlatformAdmin = (userType != null && userType == 1);

        if (!isSelf && !isPlatformAdmin) {
            throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
        }

        java.util.Set<String> keys = redisCache.scan(USER_LOGIN_KEY + id + ":*");
        if (keys != null && !keys.isEmpty()) {
            redisCache.deleteObject(keys);
        }
        redisCache.deleteObject(USER_LOGIN_KEY + id);
        redisCache.deleteObject("merchant:shops:" + id);

        HttpServletRequest req = getCurrentHttpRequest();
        String clientIp = WebUtils.getClientIp(req);
        String uName = SecurityUtils.getLoginUser() != null && SecurityUtils.getLoginUser().getLoginVo() != null
                && StringUtils.isNotBlank(SecurityUtils.getLoginUser().getLoginVo().getPhone())
                ? SecurityUtils.getLoginUser().getLoginVo().getPhone() : "User " + currentUserId;

        auditService.recordAudit(AuditLogReqDto.builder()
                .merchantId(isSelf ? currentUserId : id)
                .actorName(uName)
                .actorType(userType != null ? userType : 2)
                .action(isSelf ? "LOGOUT" : "FORCE_LOGOUT")
                .targetType("MERCHANT")
                .targetId(String.valueOf(id))
                .detail(isSelf ? java.util.Collections.singletonMap("merchantId", (Object) id)
                        : java.util.Collections.singletonMap("targetMerchantId", (Object) id))
                .ip(clientIp)
                .userAgent(req != null ? req.getHeader("User-Agent") : null)
                .result("SUCCESS")
                .build());

        return Result.success();
    }

    @Override
    public UserInfoDto getUserInfo(Long userId) {
        Long currentUserId = SecurityUtils.getUserId();
        Integer userType = SecurityUtils.getUserType();
        if (userId == null) {
            userId = currentUserId;
        }
        if (userType == null || (userType != 1 && !userId.equals(currentUserId))) {
            throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
        }
        Merchant merchant = merchantMapper.selectById(userId);
        if (ObjectUtil.isNull(merchant)) {
            throw new CustomException(AppHttpCodeEnum.USERINFO_ERROR);
        }
        UserInfoDto userInfo = MerchantConvert.IN.MerchantToUserInfoDto(merchant);
        userInfo.setPassword(null);
        userInfo.setOldPassword(null);
        return userInfo;
    }

    @Override
    public Result uploadAvatar(MultipartFile multipartFile) {
        LoginUser user = (LoginUser) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        Long id = user.getLoginVo().getId();
        String fileName = id.toString();
        return Result.success(fileName);
    }

    @Override
    public Result ocr(MultipartFile file) {

        String result = null;
        try {
            ByteArrayInputStream in = new ByteArrayInputStream(file.getBytes());
            BufferedImage bufferedImage = ImageIO.read(in);
            result = tess4jClient.doOCR(bufferedImage);
            Pattern pattern = Pattern.compile("\\b\\d{17}[\\dXx]\\b");
            Matcher matcher = pattern.matcher(result);
            if (matcher.find()) {
                result = matcher.group(0);
            }
        } catch (Exception e) {
            throw new CustomException(AppHttpCodeEnum.OCR_ERRER);
        }

        return Result.success(result);
    }

    @Override
    public Long saveOrUpdateMerchant(Merchant merchant) {
        Integer userType = SecurityUtils.getUserType();
        if (userType == null || userType != 1) {
            throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
        }
        if (merchant.getPassword() != null && !merchant.getPassword().trim().isEmpty() && !merchant.getPassword().startsWith("$2a$")) {
            merchant.setPassword(new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode(merchant.getPassword()));
        }
        this.saveOrUpdate(merchant);
        return merchant.getId();
    }

    @Override
    public PageResult<Merchant> getMerchantPage(MerchantPage merchant) {
        Integer userType = SecurityUtils.getUserType();
        if (userType == null || userType != 1) {
            throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
        }
        int pageNo = (merchant != null && merchant.getPageNo() != null && merchant.getPageNo() > 0) ? merchant.getPageNo() : 1;
        int pageSize = (merchant != null && merchant.getPageSize() != null && merchant.getPageSize() > 0) ? merchant.getPageSize() : 10;

        LambdaQueryWrapper<Merchant> wrapper = new LambdaQueryWrapper<Merchant>()
                .eq(Merchant::getType, 2);

        if (merchant != null) {
            if (StringUtils.isNotBlank(merchant.getRealName())) {
                wrapper.like(Merchant::getRealName, merchant.getRealName().trim());
            }
            if (StringUtils.isNotBlank(merchant.getPhone())) {
                wrapper.like(Merchant::getPhone, merchant.getPhone().trim());
            }
            if (merchant.getStatus() != null) {
                wrapper.eq(Merchant::getStatus, merchant.getStatus());
            }
        }

        Integer count = merchantMapper.selectCount(wrapper);
        long total = count != null ? count.longValue() : 0L;

        Page<Merchant> pageParam = new Page<>(pageNo, pageSize);
        Page<Merchant> page = merchantMapper.selectPage(pageParam, wrapper);
        List<Merchant> records = (page != null && page.getRecords() != null) ? page.getRecords() : new ArrayList<>();
        if (records.size() > pageSize) {
            int fromIndex = (pageNo - 1) * pageSize;
            if (fromIndex < records.size()) {
                int toIndex = Math.min(fromIndex + pageSize, records.size());
                records = new ArrayList<>(records.subList(fromIndex, toIndex));
            } else {
                records = new ArrayList<>();
            }
        }
        records.forEach(m -> m.setPassword(null));
        return new PageResult<>(records, total);
    }

    @Override
    public Long save0rUpdateMerchant(Merchant merchant) {
        return saveOrUpdateMerchant(merchant);
    }

    @Override
    public List<Merchant> getMerchantByIds(List<Long> ids) {
        Integer userType = SecurityUtils.getUserType();
        if (userType == null || userType != 1) {
            throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
        }
        List<Merchant> list = merchantMapper.selectBatchIds(ids);
        if (list != null) {
            list.forEach(m -> m.setPassword(null));
        }
        return list;
    }

    @Override
    public boolean updateMerchantProfile(UserInfoDto userInfoDto) {
        Long currentUserId = SecurityUtils.getUserId();
        Integer userType = SecurityUtils.getUserType();
        if (userType == null || currentUserId == null || currentUserId == 0L) {
            throw new CustomException(AppHttpCodeEnum.NEED_LOGIN);
        }

        if (userType != 1) {
            // Merchant chỉ được sửa chính mình
            if (userInfoDto.getId() != null && !userInfoDto.getId().equals(currentUserId)) {
                throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
            }
            Merchant currentMerchant = merchantMapper.selectById(currentUserId);
            if (currentMerchant == null) {
                throw new CustomException(AppHttpCodeEnum.USERINFO_ERROR);
            }

            // Chỉ cho sửa realName và password (kèm mật khẩu cũ)
            if (userInfoDto.getRealName() != null) {
                currentMerchant.setRealName(userInfoDto.getRealName().trim());
            }

            if (userInfoDto.getPassword() != null && !userInfoDto.getPassword().trim().isEmpty()) {
                String newPass = userInfoDto.getPassword().trim();
                if (newPass.length() < 6) {
                    throw new CustomException(AppHttpCodeEnum.PASSWORD_TOO_SHORT);
                }
                if (userInfoDto.getOldPassword() == null || userInfoDto.getOldPassword().trim().isEmpty()) {
                    throw new CustomException(AppHttpCodeEnum.REQUIRE_OLD_PASSWORD);
                }
                org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder encoder =
                        new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder();
                if (!encoder.matches(userInfoDto.getOldPassword(), currentMerchant.getPassword())) {
                    throw new CustomException(AppHttpCodeEnum.OLD_PASSWORD_ERROR);
                }
                currentMerchant.setPassword(encoder.encode(newPass));
            }

            return merchantMapper.updateById(currentMerchant) > 0;
        } else {
            // Admin nền tảng
            Long targetId = userInfoDto.getId() != null ? userInfoDto.getId() : currentUserId;
            Merchant merchant = merchantMapper.selectById(targetId);
            if (merchant == null) {
                throw new CustomException(AppHttpCodeEnum.USERINFO_ERROR);
            }
            if (userInfoDto.getRealName() != null) {
                merchant.setRealName(userInfoDto.getRealName().trim());
            }
            if (userInfoDto.getPhone() != null) {
                merchant.setPhone(userInfoDto.getPhone().trim());
            }
            if (userInfoDto.getSex() != null) {
                merchant.setSex(userInfoDto.getSex());
            }
            if (userInfoDto.getPassword() != null && !userInfoDto.getPassword().trim().isEmpty()) {
                String newPass = userInfoDto.getPassword().trim();
                if (newPass.length() < 6) {
                    throw new CustomException(AppHttpCodeEnum.PASSWORD_TOO_SHORT);
                }
                if (!newPass.startsWith("$2a$")) {
                    newPass = new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode(newPass);
                }
                merchant.setPassword(newPass);
            }
            return merchantMapper.updateById(merchant) > 0;
        }
    }

    @Override
    public Result register(MerchantRegisterDto registerDto) {
        if (registerDto == null) {
            throw new CustomException(AppHttpCodeEnum.CONTENT_NOT_NULL);
        }
        String phone = registerDto.getPhone();
        if (phone == null || !phone.matches("^0\\d{9}$")) {
            throw new CustomException(AppHttpCodeEnum.INVALID_PHONE_NUMBER);
        }
        String password = registerDto.getPassword();
        if (password == null || password.trim().length() < 6) {
            throw new CustomException(AppHttpCodeEnum.PASSWORD_TOO_SHORT);
        }

        Integer count = merchantMapper.selectCount(new LambdaQueryWrapper<Merchant>().eq(Merchant::getPhone, phone));
        if (count != null && count > 0) {
            throw new CustomException(AppHttpCodeEnum.PHONENUMBER_EXIST);
        }

        Merchant merchant = new Merchant();
        merchant.setRealName(registerDto.getRealName() != null ? registerDto.getRealName().trim() : "");
        merchant.setPhone(phone);
        merchant.setPassword(new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode(password));
        merchant.setType(2);
        merchant.setStatus(1);
        merchant.setIdCard("");
        merchant.setIdCardUrl("");
        merchant.setSex(1);
        merchant.setDeleted(0);

        try {
            this.save(merchant);
        } catch (org.springframework.dao.DuplicateKeyException e) {
            throw new CustomException(AppHttpCodeEnum.PHONENUMBER_EXIST);
        }

        return Result.success(merchant.getId());
    }

    @Override
    public Result changeStatus(Long id, Integer status) {
        Integer userType = SecurityUtils.getUserType();
        if (userType == null || !userType.equals(1)) {
            throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
        }
        if (id == null || status == null || (status != 0 && status != 1)) {
            throw new CustomException(AppHttpCodeEnum.PARAM_ERROR);
        }
        Merchant merchant = merchantMapper.selectById(id);
        if (merchant == null || (merchant.getDeleted() != null && merchant.getDeleted() == 1)) {
            throw new CustomException(AppHttpCodeEnum.USERINFO_ERROR);
        }
        merchant.setStatus(status);
        merchantMapper.updateById(merchant);

        // S3: Audit MERCHANT_STATUS
        HttpServletRequest req = getCurrentHttpRequest();
        String clientIp = WebUtils.getClientIp(req);
        Map<String, Object> detail = new HashMap<>();
        detail.put("newStatus", status);
        auditService.recordAudit(AuditLogReqDto.builder()
                .merchantId(id)
                .actorName((SecurityUtils.getLoginUser() != null && SecurityUtils.getLoginUser().getLoginVo() != null
                        && StringUtils.isNotBlank(SecurityUtils.getLoginUser().getLoginVo().getPhone()))
                        ? SecurityUtils.getLoginUser().getLoginVo().getPhone() : "Admin")
                .actorType(1)
                .action("MERCHANT_STATUS")
                .targetType("merchant")
                .targetId(String.valueOf(id))
                .detail(detail)
                .ip(clientIp)
                .userAgent(req != null ? req.getHeader("User-Agent") : null)
                .result("SUCCESS")
                .build());

        // Nếu khoá tài khoản (status = 0), xoá mọi session cache đăng nhập login:<id>:*
        if (status == 0 && redisCache != null) {
            try {
                java.util.Set<String> keys = redisCache.scan("login:" + id + ":*");
                if (keys != null && !keys.isEmpty()) {
                    redisCache.deleteObject(keys);
                }
                redisCache.deleteObject("login:" + id);
                redisCache.deleteObject("merchant:shops:" + id);
            } catch (Exception ignored) {}
        }
        return Result.success();
    }

    @Override
    public Result setupOtp(OtpSetupReqDto reqDto) {
        Long userId = SecurityUtils.getUserId();
        if (userId == null || userId == 0L) {
            throw new CustomException(AppHttpCodeEnum.NEED_LOGIN);
        }
        Merchant merchant = merchantMapper.selectById(userId);
        if (merchant == null) {
            throw new CustomException(AppHttpCodeEnum.USERINFO_ERROR);
        }

        HttpServletRequest request = getCurrentHttpRequest();
        String clientIp = WebUtils.getClientIp(request);

        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        if (reqDto == null || reqDto.getPassword() == null || reqDto.getPassword().trim().isEmpty()
                || !encoder.matches(reqDto.getPassword().trim(), merchant.getPassword())) {
            loginAttemptService.recordFailure(merchant.getPhone(), clientIp);
            return Result.error(400, "Mật khẩu hiện tại không chính xác");
        }

        String secret = TotpUtil.generateSecret();
        redisCache.setCacheObject("otp:setup:" + userId, secret, 10, TimeUnit.MINUTES);

        String masked = TotpUtil.maskSecret(secret);
        String uri = TotpUtil.getOtpAuthUri("Linmour", merchant.getPhone(), secret);

        OtpSetupRespDto resp = OtpSetupRespDto.builder()
                .otpauthUri(uri)
                .secretMasked(masked)
                .secret(secret)
                .build();

        return Result.success(resp);
    }

    @Override
    public Result enableOtp(OtpEnableReqDto reqDto) {
        Long userId = SecurityUtils.getUserId();
        if (userId == null || userId == 0L) {
            throw new CustomException(AppHttpCodeEnum.NEED_LOGIN);
        }
        Merchant merchant = merchantMapper.selectById(userId);
        if (merchant == null) {
            throw new CustomException(AppHttpCodeEnum.USERINFO_ERROR);
        }

        HttpServletRequest request = getCurrentHttpRequest();
        String clientIp = WebUtils.getClientIp(request);
        String userAgent = request != null ? request.getHeader("User-Agent") : null;

        String tempSecret = redisCache.getCacheObject("otp:setup:" + userId);
        if (tempSecret == null || tempSecret.trim().isEmpty()) {
            return Result.error(400, "Yêu cầu thiết lập OTP đã hết hạn, vui lòng thao tác lại");
        }

        if (reqDto == null || reqDto.getCode() == null || !TotpUtil.verifyCode(tempSecret, reqDto.getCode().trim())) {
            loginAttemptService.recordFailure(merchant.getPhone(), clientIp);
            auditService.recordAudit(AuditLogReqDto.builder()
                    .merchantId(userId)
                    .actorName(merchant.getRealName() != null ? merchant.getRealName() : merchant.getPhone())
                    .actorType(merchant.getType() != null ? merchant.getType() : 2)
                    .action("OTP_FAIL")
                    .ip(clientIp)
                    .userAgent(userAgent)
                    .result("FAIL")
                    .build());
            return Result.error(400, "Mã xác thực OTP không chính xác");
        }

        String encSecret = AesGcmUtil.encrypt(tempSecret, getEffectiveOtpSecret());
        List<String> rawCodes = TotpUtil.generateRecoveryCodes();
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        List<String> hashedCodes = new ArrayList<>();
        for (String rc : rawCodes) {
            hashedCodes.add(encoder.encode(rc));
        }

        merchant.setOtpEnabled(1);
        merchant.setOtpSecretEnc(encSecret);
        merchant.setOtpRecoveryHashes(JSON.toJSONString(hashedCodes));
        merchant.setOtpEnabledAt(LocalDateTime.now());
        merchantMapper.updateById(merchant);

        redisCache.deleteObject("otp:setup:" + userId);

        String jti = SecurityUtils.getJti();
        if (jti != null && !jti.trim().isEmpty()) {
            String sessionKey = USER_LOGIN_KEY + userId + ":" + jti;
            Object cached = redisCache.getCacheObject(sessionKey);
            LoginUser loginUser = null;
            if (cached instanceof LoginUser) {
                loginUser = (LoginUser) cached;
            } else if (cached != null) {
                try {
                    loginUser = JSON.parseObject(JSON.toJSONString(cached), LoginUser.class);
                } catch (Exception ignored) {}
            }
            if (loginUser != null) {
                loginUser.setMustSetupOtp(false);
                redisCache.setCacheObject(sessionKey, loginUser, 8, TimeUnit.HOURS);
            }
        }

        auditService.recordAudit(AuditLogReqDto.builder()
                .merchantId(userId)
                .actorName(merchant.getRealName() != null ? merchant.getRealName() : merchant.getPhone())
                .actorType(merchant.getType() != null ? merchant.getType() : 2)
                .action("OTP_ENABLE")
                .targetType("merchant")
                .targetId(String.valueOf(userId))
                .ip(clientIp)
                .userAgent(userAgent)
                .result("SUCCESS")
                .build());

        return Result.success(Collections.singletonMap("recoveryCodes", rawCodes));
    }

    @Override
    public Result disableOtp(OtpDisableReqDto reqDto) {
        Long userId = SecurityUtils.getUserId();
        if (userId == null || userId == 0L) {
            throw new CustomException(AppHttpCodeEnum.NEED_LOGIN);
        }
        Merchant merchant = merchantMapper.selectById(userId);
        if (merchant == null) {
            throw new CustomException(AppHttpCodeEnum.USERINFO_ERROR);
        }

        if (requireOtpForPlatformAdmin && Integer.valueOf(1).equals(merchant.getType())) {
            return Result.error(400, "Tài khoản quản trị viên nền tảng bắt buộc phải bật xác thực 2 lớp");
        }

        HttpServletRequest request = getCurrentHttpRequest();
        String clientIp = WebUtils.getClientIp(request);
        String userAgent = request != null ? request.getHeader("User-Agent") : null;

        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        if (reqDto == null || reqDto.getPassword() == null || reqDto.getPassword().trim().isEmpty()
                || !encoder.matches(reqDto.getPassword().trim(), merchant.getPassword())) {
            loginAttemptService.recordFailure(merchant.getPhone(), clientIp);
            return Result.error(400, "Mật khẩu không chính xác");
        }

        boolean valid = verifyOtp(merchant, reqDto.getCode());
        if (!valid) {
            loginAttemptService.recordFailure(merchant.getPhone(), clientIp);
            auditService.recordAudit(AuditLogReqDto.builder()
                    .merchantId(userId)
                    .actorName(merchant.getRealName() != null ? merchant.getRealName() : merchant.getPhone())
                    .actorType(merchant.getType() != null ? merchant.getType() : 2)
                    .action("OTP_FAIL")
                    .ip(clientIp)
                    .userAgent(userAgent)
                    .result("FAIL")
                    .build());
            return Result.error(400, "Mã xác thực OTP hoặc mã khôi phục không chính xác");
        }

        merchant.setOtpEnabled(0);
        merchant.setOtpSecretEnc(null);
        merchant.setOtpRecoveryHashes(null);
        merchant.setOtpEnabledAt(null);
        merchantMapper.updateById(merchant);

        auditService.recordAudit(AuditLogReqDto.builder()
                .merchantId(userId)
                .actorName(merchant.getRealName() != null ? merchant.getRealName() : merchant.getPhone())
                .actorType(merchant.getType() != null ? merchant.getType() : 2)
                .action("OTP_DISABLE")
                .targetType("merchant")
                .targetId(String.valueOf(userId))
                .ip(clientIp)
                .userAgent(userAgent)
                .result("SUCCESS")
                .build());

        return Result.success();
    }

    @Override
    public Result loginOtp(OtpLoginReqDto reqDto) {
        HttpServletRequest request = getCurrentHttpRequest();
        String clientIp = WebUtils.getClientIp(request);
        String userAgent = request != null ? request.getHeader("User-Agent") : null;

        if (reqDto == null || reqDto.getOtpTicket() == null || reqDto.getOtpTicket().trim().isEmpty()) {
            return Result.error(400, "Mã phiên OTP không hợp lệ");
        }

        String ticket = reqDto.getOtpTicket().trim();
        String userIdStr = redisCache.getCacheObject("otp:ticket:" + ticket);
        if (userIdStr == null || userIdStr.trim().isEmpty()) {
            return Result.error(400, "Mã phiên OTP không hợp lệ hoặc đã hết hạn");
        }

        Long userId = Long.valueOf(userIdStr);
        Merchant merchant = merchantMapper.selectById(userId);
        if (merchant == null) {
            return Result.error(400, "Tài khoản không tồn tại");
        }

        String phone = merchant.getPhone();
        if (loginAttemptService.isOtpLocked(userId) || loginAttemptService.isLocked(phone, clientIp)) {
            long retryAfter = Math.max(loginAttemptService.getOtpRetryAfterSeconds(userId), loginAttemptService.getRetryAfterSeconds(phone, clientIp));
            long minutes = (long) Math.ceil(retryAfter / 60.0);
            if (minutes < 1) minutes = 1;
            Map<String, Object> data = new HashMap<>();
            data.put("retryAfterSeconds", retryAfter);
            auditService.recordAudit(AuditLogReqDto.builder()
                    .merchantId(userId)
                    .actorName(merchant.getRealName() != null ? merchant.getRealName() : phone)
                    .actorType(merchant.getType() != null ? merchant.getType() : 2)
                    .action("LOGIN_LOCKED")
                    .ip(clientIp)
                    .userAgent(userAgent)
                    .result("FAIL")
                    .build());
            return Result.error(429, "Đăng nhập sai quá nhiều lần, vui lòng thử lại sau " + minutes + " phút", data);
        }

        String codeToVerify = reqDto.getCode();
        if (codeToVerify == null || codeToVerify.trim().isEmpty()) {
            codeToVerify = reqDto.getRecoveryCode();
        }

        boolean valid = verifyOtp(merchant, codeToVerify);
        if (!valid) {
            loginAttemptService.recordOtpFailure(userId);
            long newRetry = loginAttemptService.getOtpRetryAfterSeconds(userId);
            auditService.recordAudit(AuditLogReqDto.builder()
                    .merchantId(userId)
                    .actorName(merchant.getRealName() != null ? merchant.getRealName() : phone)
                    .actorType(merchant.getType() != null ? merchant.getType() : 2)
                    .action("OTP_FAIL")
                    .ip(clientIp)
                    .userAgent(userAgent)
                    .result("FAIL")
                    .build());
            if (newRetry > 0) {
                long minutes = (long) Math.ceil(newRetry / 60.0);
                if (minutes < 1) minutes = 1;
                Map<String, Object> data = new HashMap<>();
                data.put("retryAfterSeconds", newRetry);
                return Result.error(429, "Đăng nhập sai quá nhiều lần, vui lòng thử lại sau " + minutes + " phút", data);
            }
            return Result.error(400, "Mã xác thực OTP hoặc mã khôi phục không chính xác");
        }

        loginAttemptService.recordOtpSuccess(userId);

        // Huỷ ticket một lần
        redisCache.deleteObject("otp:ticket:" + ticket);
        // Xoá đếm lỗi
        loginAttemptService.recordSuccess(phone);

        String jti = JwtUtil.getUUID();
        String jwt = JwtUtil.createJWT(jti, userIdStr, JwtUtil.JWT_TTL);

        String nowStr = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").format(LocalDateTime.now());
        LoginUser loginUser = new LoginUser();
        LoginVo loginVo = new LoginVo(merchant.getId(), merchant.getPhone(), merchant.getPassword(), merchant.getStatus(), null, merchant.getType());
        loginUser.setLoginVo(loginVo);
        loginUser.setJti(jti);
        loginUser.setCreatedAt(nowStr);
        loginUser.setLastSeenAt(nowStr);
        loginUser.setIp(clientIp);
        loginUser.setUserAgent(userAgent);

        boolean isWeak = PasswordPolicyUtils.isWeakPassword(merchant.getPassword(), merchant.getPhone());
        boolean mustChange = Integer.valueOf(1).equals(merchant.getMustChangePassword())
                || (forceWeakPasswordChange && isWeak);
        loginUser.setMustChangePassword(mustChange);
        loginUser.setMustSetupOtp(false);

        String sessionKey = USER_LOGIN_KEY + userIdStr + ":" + jti;
        redisCache.setCacheObject(sessionKey, loginUser, 8, TimeUnit.HOURS);

        if (loginVo.getId() != null) {
            try {
                List<Long> shopIds = shopService.getShopIdsByMerchantId(loginVo.getId());
                redisCache.setCacheObject("merchant:shops:" + userIdStr, shopIds, 10, java.util.concurrent.TimeUnit.MINUTES);
            } catch (Exception ignored) {}
        }

        UsernamePasswordAuthenticationToken authenticationToken =
                new UsernamePasswordAuthenticationToken(loginUser, null, loginUser.getAuthorities());
        SecurityContextHolder.getContext().setAuthentication(authenticationToken);

        HashMap<String, Object> map = new HashMap<>();
        UserInfoDto userInfo = MerchantConvert.IN.MerchantToUserInfoDto(merchant);
        map.put("token", jwt);
        map.put("userInfo", userInfo);
        map.put("mustChangePassword", mustChange);
        map.put("otpEnabled", 1);
        map.put("otpRequired", false);
        map.put("mustSetupOtp", false);

        auditService.recordAudit(AuditLogReqDto.builder()
                .merchantId(userId)
                .actorName(merchant.getRealName() != null ? merchant.getRealName() : phone)
                .actorType(merchant.getType() != null ? merchant.getType() : 2)
                .action("LOGIN_SUCCESS")
                .ip(clientIp)
                .userAgent(userAgent)
                .result("SUCCESS")
                .build());

        return Result.success(map);
    }

    @Override
    public boolean verifyOtp(Merchant merchant, String code) {
        if (merchant == null || code == null || code.trim().isEmpty()) {
            return false;
        }
        String cleanCode = code.trim();
        // 1. Kiểm tra mã TOTP 6 số
        if (cleanCode.length() == 6 && merchant.getOtpSecretEnc() != null) {
            try {
                String decryptedSecret = AesGcmUtil.decrypt(merchant.getOtpSecretEnc(), getEffectiveOtpSecret());
                if (TotpUtil.verifyCode(decryptedSecret, cleanCode)) {
                    return true;
                }
            } catch (Exception ignored) {}
        }

        // 2. Kiểm tra mã khôi phục
        if (merchant.getOtpRecoveryHashes() != null && !merchant.getOtpRecoveryHashes().trim().isEmpty()) {
            try {
                List<String> hashes = new ArrayList<>(JSON.parseArray(merchant.getOtpRecoveryHashes(), String.class));
                if (hashes != null && !hashes.isEmpty()) {
                    BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
                    for (int i = 0; i < hashes.size(); i++) {
                        if (encoder.matches(cleanCode, hashes.get(i))) {
                            // Tiêu thụ mã khôi phục
                            hashes.remove(i);
                            merchant.setOtpRecoveryHashes(JSON.toJSONString(hashes));
                            merchantMapper.updateById(merchant);

                            HttpServletRequest request = getCurrentHttpRequest();
                            String clientIp = WebUtils.getClientIp(request);
                            String userAgent = request != null ? request.getHeader("User-Agent") : null;
                            auditService.recordAudit(AuditLogReqDto.builder()
                                    .merchantId(merchant.getId())
                                    .actorName(merchant.getRealName() != null ? merchant.getRealName() : merchant.getPhone())
                                    .actorType(merchant.getType() != null ? merchant.getType() : 2)
                                    .action("OTP_RECOVERY_USED")
                                    .targetType("merchant")
                                    .targetId(merchant.getId().toString())
                                    .ip(clientIp)
                                    .userAgent(userAgent)
                                    .result("SUCCESS")
                                    .build());
                            return true;
                        }
                    }
                }
            } catch (Exception ignored) {}
        }
        return false;
    }

    @Override
    public Result createWsTicket(Long shopId) {
        Long currentUserId = SecurityUtils.getUserId();
        if (currentUserId == null || currentUserId <= 0) {
            return Result.error(401, "Cần đăng nhập để lấy vé kết nối WebSocket");
        }
        if (shopId == null || shopId <= 0) {
            shopId = SecurityUtils.getShopId();
        }
        if (shopId == null || shopId <= 0) {
            return Result.error(400, "Thiếu thông tin quán (shopId)");
        }

        Integer uType = SecurityUtils.getUserType();
        if (uType == null || !uType.equals(1)) {
            Shop shop = shopService.getById(shopId);
            if (shop == null || shop.getMerchantId() == null || !shop.getMerchantId().equals(currentUserId)) {
                return Result.error(403, "Bạn không có quyền quản lý quán này");
            }
        }

        String ticket = UUID.randomUUID().toString().replace("-", "");
        com.alibaba.fastjson.JSONObject ticketData = new com.alibaba.fastjson.JSONObject();
        ticketData.put("merchantId", currentUserId);
        ticketData.put("shopId", shopId);

        redisCache.setCacheObject("ws:ticket:" + ticket, ticketData.toJSONString(), 60, TimeUnit.SECONDS);

        Map<String, String> res = new HashMap<>();
        res.put("ticket", ticket);
        return Result.success(res);
    }
}





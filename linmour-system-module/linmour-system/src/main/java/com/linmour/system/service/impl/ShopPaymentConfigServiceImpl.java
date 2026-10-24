package com.linmour.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.linmour.security.dtos.Result;
import com.linmour.security.exception.enums.AppHttpCodeEnum;
import com.linmour.security.utils.AesGcmUtil;
import com.linmour.security.utils.LoginAttemptService;
import com.linmour.security.utils.SecurityUtils;
import com.linmour.security.utils.WebUtils;
import com.linmour.system.mapper.MerchantMapper;
import com.linmour.system.mapper.ShopPaymentConfigMapper;
import com.linmour.system.pojo.Do.Merchant;
import com.linmour.system.pojo.Do.ShopPaymentConfig;
import com.linmour.system.pojo.Dto.PayosConfigDto;
import com.linmour.system.pojo.Dto.PayosConfigReqDto;
import com.linmour.system.pojo.Dto.PayosConfigRespDto;
import com.linmour.system.pojo.Dto.AuditLogReqDto;
import com.linmour.system.service.AuditService;
import com.linmour.system.service.MerchantService;
import com.linmour.system.service.ShopPaymentConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import javax.annotation.Resource;
import javax.servlet.http.HttpServletRequest;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@Service
public class ShopPaymentConfigServiceImpl extends ServiceImpl<ShopPaymentConfigMapper, ShopPaymentConfig>
        implements ShopPaymentConfigService {

    @Value("${security.payos-config-secret:}")
    private String payosConfigSecret;

    @Resource
    private MerchantMapper merchantMapper;

    @Resource
    private LoginAttemptService loginAttemptService;

    @Resource
    private AuditService auditService;

    @Resource
    private com.linmour.system.service.PayosKeyValidator payosKeyValidator;

    @Resource
    @org.springframework.context.annotation.Lazy
    private MerchantService merchantService;

    private HttpServletRequest getCurrentHttpRequest() {
        RequestAttributes attribs = RequestContextHolder.getRequestAttributes();
        if (attribs instanceof ServletRequestAttributes) {
            return ((ServletRequestAttributes) attribs).getRequest();
        }
        return null;
    }

    @javax.annotation.PostConstruct
    public void validatePayosConfigSecret() {
        if (org.apache.commons.lang3.StringUtils.isBlank(payosConfigSecret)) {
            throw new IllegalStateException("Cấu hình 'security.payos-config-secret' không được để trống! Dịch vụ linmour-system không thể khởi động nếu thiếu secret mã hóa PayOS.");
        }
    }

    private String getMasterKey() {
        if (org.apache.commons.lang3.StringUtils.isBlank(payosConfigSecret)) {
            throw new IllegalStateException("Cấu hình 'security.payos-config-secret' không được để trống!");
        }
        return payosConfigSecret.trim();
    }

    @Override
    public PayosConfigRespDto getPayosConfig(Long shopId) {
        if (shopId == null) {
            return PayosConfigRespDto.builder().configured(false).enabled(false).build();
        }
        ShopPaymentConfig config = this.getOne(new LambdaQueryWrapper<ShopPaymentConfig>()
                .eq(ShopPaymentConfig::getShopId, shopId)
                .eq(ShopPaymentConfig::getDeleted, 0));

        if (config == null || config.getClientIdEnc() == null || config.getClientIdEnc().trim().isEmpty()) {
            return PayosConfigRespDto.builder()
                    .configured(false)
                    .enabled(config != null && Integer.valueOf(1).equals(config.getEnabled()))
                    .clientIdMasked(null)
                    .lastChangedAt(config != null ? config.getUpdateTime() : null)
                    .lastChangedByName(config != null ? config.getUpdatedByName() : null)
                    .lastChangedIp(config != null ? config.getUpdatedIp() : null)
                    .validatedAt(config != null ? config.getValidatedAt() : null)
                    .validationResult(config != null ? config.getValidationResult() : null)
                    .build();
        }

        String masterKey = getMasterKey();
        String masked = null;
        try {
            String clientId = AesGcmUtil.decrypt(config.getClientIdEnc(), masterKey);
            if (clientId != null && !clientId.isEmpty()) {
                if (clientId.length() > 4) {
                    masked = "••••" + clientId.substring(clientId.length() - 4);
                } else {
                    masked = "••••" + clientId;
                }
            }
        } catch (Exception e) {
            log.error("Failed to decrypt clientId for shop {}: {}", shopId, e.getMessage());
            masked = "••••";
        }

        return PayosConfigRespDto.builder()
                .configured(true)
                .enabled(Integer.valueOf(1).equals(config.getEnabled()))
                .clientIdMasked(masked)
                .lastChangedAt(config.getUpdateTime())
                .lastChangedByName(config.getUpdatedByName())
                .lastChangedIp(config.getUpdatedIp())
                .validatedAt(config.getValidatedAt())
                .validationResult(config.getValidationResult())
                .build();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public Result saveOrUpdatePayosConfig(Long shopId, PayosConfigReqDto reqDto) {
        if (shopId == null || reqDto == null) {
            return Result.error(AppHttpCodeEnum.PARAM_ERROR);
        }
        Long userId = SecurityUtils.getUserId();
        if (userId == null || userId == 0L) {
            return Result.error(AppHttpCodeEnum.NEED_LOGIN);
        }
        Merchant merchant = merchantMapper.selectById(userId);
        if (merchant == null) {
            return Result.error(AppHttpCodeEnum.USERINFO_ERROR);
        }

        HttpServletRequest request = getCurrentHttpRequest();
        String clientIp = WebUtils.getClientIp(request);
        String phone = merchant.getPhone();
        String updaterName = org.apache.commons.lang3.StringUtils.isNotBlank(merchant.getRealName())
                ? merchant.getRealName().trim() : phone;

        // 1. S1: Kiểm tra khoá brute-force theo SĐT hoặc IP
        long retryAfter = loginAttemptService.getRetryAfterSeconds(phone, clientIp);
        if (retryAfter > 0) {
            long minutes = (long) Math.ceil(retryAfter / 60.0);
            if (minutes < 1) minutes = 1;
            Map<String, Object> data = new HashMap<>();
            data.put("retryAfterSeconds", retryAfter);
            return Result.error(429, "Đăng nhập sai quá nhiều lần, vui lòng thử lại sau " + minutes + " phút", data);
        }

        // 2. K1: Xác thực mật khẩu hiện tại (bắt buộc)
        org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder encoder =
                new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder();

        boolean passwordValid = reqDto.getCurrentPassword() != null
                && !reqDto.getCurrentPassword().trim().isEmpty()
                && encoder.matches(reqDto.getCurrentPassword().trim(), merchant.getPassword());

        // 3. K1: Xác thực OTP nếu tài khoản đã bật OTP
        boolean otpRequired = Integer.valueOf(1).equals(merchant.getOtpEnabled());
        boolean otpValid = true;
        if (otpRequired) {
            if (reqDto.getOtpCode() == null || reqDto.getOtpCode().trim().isEmpty()) {
                otpValid = false;
            } else if (merchantService != null) {
                otpValid = merchantService.verifyOtp(merchant, reqDto.getOtpCode().trim());
            }
        }

        if (!passwordValid || !otpValid) {
            loginAttemptService.recordFailure(phone, clientIp);
            long newRetry = loginAttemptService.getRetryAfterSeconds(phone, clientIp);
            Map<String, Object> detail = new HashMap<>();
            detail.put("reason", !passwordValid ? "Mật khẩu không đúng" : "Mã OTP không đúng");
            detail.put("enabled", reqDto.getEnabled());
            auditService.recordAudit(AuditLogReqDto.builder()
                    .shopId(shopId)
                    .merchantId(userId)
                    .actorName(updaterName)
                    .actorType(merchant.getType() != null ? merchant.getType() : 2)
                    .action("PAYOS_CONFIG_REJECTED")
                    .targetType("shop_payment_config")
                    .targetId(String.valueOf(shopId))
                    .detail(detail)
                    .ip(clientIp)
                    .userAgent(request != null ? request.getHeader("User-Agent") : null)
                    .result("FAIL")
                    .build());

            if (newRetry > 0) {
                long minutes = (long) Math.ceil(newRetry / 60.0);
                if (minutes < 1) minutes = 1;
                Map<String, Object> data = new HashMap<>();
                data.put("retryAfterSeconds", newRetry);
                return Result.error(429, "Đăng nhập sai quá nhiều lần, vui lòng thử lại sau " + minutes + " phút", data);
            }
            return Result.error(403, "Mật khẩu (hoặc mã OTP) không đúng");
        }

        // Xác thực thành công -> Xóa bộ đếm thất bại của SĐT
        loginAttemptService.recordSuccess(phone);

        String masterKey = getMasterKey();

        ShopPaymentConfig existing = this.getOne(new LambdaQueryWrapper<ShopPaymentConfig>()
                .eq(ShopPaymentConfig::getShopId, shopId)
                .eq(ShopPaymentConfig::getDeleted, 0));

        boolean hasNewKeys = (reqDto.getClientId() != null && !reqDto.getClientId().trim().isEmpty())
                || (reqDto.getApiKey() != null && !reqDto.getApiKey().trim().isEmpty())
                || (reqDto.getChecksumKey() != null && !reqDto.getChecksumKey().trim().isEmpty());

        // K2: Chỉ tắt PayOS (enabled = false, không đổi key) thì không cần kiểm tra key
        boolean isDisablingOnly = Boolean.FALSE.equals(reqDto.getEnabled()) && !hasNewKeys;

        LocalDateTime validatedAt = null;
        String validationResult = null;

        if (!isDisablingOnly) {
            String targetClientId = (reqDto.getClientId() != null && !reqDto.getClientId().trim().isEmpty())
                    ? reqDto.getClientId().trim()
                    : (existing != null && existing.getClientIdEnc() != null ? AesGcmUtil.decrypt(existing.getClientIdEnc(), masterKey) : null);
            String targetApiKey = (reqDto.getApiKey() != null && !reqDto.getApiKey().trim().isEmpty())
                    ? reqDto.getApiKey().trim()
                    : (existing != null && existing.getApiKeyEnc() != null ? AesGcmUtil.decrypt(existing.getApiKeyEnc(), masterKey) : null);
            String targetChecksumKey = (reqDto.getChecksumKey() != null && !reqDto.getChecksumKey().trim().isEmpty())
                    ? reqDto.getChecksumKey().trim()
                    : (existing != null && existing.getChecksumKeyEnc() != null ? AesGcmUtil.decrypt(existing.getChecksumKeyEnc(), masterKey) : null);

            Result valResult = payosKeyValidator.validate(targetClientId, targetApiKey, targetChecksumKey);
            if (valResult != null && valResult.getCode() != 200) {
                // K2: Lỗi -> 400, msg "Key PayOS không hợp lệ: <desc của PayOS>", data { payosCode }, không lưu
                Map<String, Object> detail = new HashMap<>();
                detail.put("reason", "Key PayOS không hợp lệ");
                detail.put("payosMsg", valResult.getMsg());
                detail.put("payosData", valResult.getData());
                detail.put("enabled", reqDto.getEnabled());
                auditService.recordAudit(AuditLogReqDto.builder()
                        .shopId(shopId)
                        .merchantId(userId)
                        .actorName(updaterName)
                        .actorType(merchant.getType() != null ? merchant.getType() : 2)
                        .action("PAYOS_CONFIG_REJECTED")
                        .targetType("shop_payment_config")
                        .targetId(String.valueOf(shopId))
                        .detail(detail)
                        .ip(clientIp)
                        .userAgent(request != null ? request.getHeader("User-Agent") : null)
                        .result("FAIL")
                        .build());
                return valResult;
            }
            validatedAt = LocalDateTime.now();
            validationResult = (valResult != null && valResult.getData() != null) ? valResult.getData().toString() : "SUCCESS";
        }

        if (existing == null) {
            String clientEnc = reqDto.getClientId() != null && !reqDto.getClientId().trim().isEmpty()
                    ? AesGcmUtil.encrypt(reqDto.getClientId().trim(), masterKey) : null;
            String apiEnc = reqDto.getApiKey() != null && !reqDto.getApiKey().trim().isEmpty()
                    ? AesGcmUtil.encrypt(reqDto.getApiKey().trim(), masterKey) : null;
            String checkEnc = reqDto.getChecksumKey() != null && !reqDto.getChecksumKey().trim().isEmpty()
                    ? AesGcmUtil.encrypt(reqDto.getChecksumKey().trim(), masterKey) : null;
            int enabled = (reqDto.getEnabled() != null && reqDto.getEnabled()) ? 1 : 0;

            ShopPaymentConfig newConfig = ShopPaymentConfig.builder()
                    .shopId(shopId)
                    .clientIdEnc(clientEnc)
                    .apiKeyEnc(apiEnc)
                    .checksumKeyEnc(checkEnc)
                    .enabled(enabled)
                    .updatedBy(userId)
                    .updatedByName(updaterName)
                    .updatedIp(clientIp)
                    .validatedAt(validatedAt)
                    .validationResult(validationResult)
                    .createTime(LocalDateTime.now())
                    .updateTime(LocalDateTime.now())
                    .deleted(0)
                    .build();
            this.save(newConfig);
        } else {
            if (reqDto.getClientId() != null && !reqDto.getClientId().trim().isEmpty()) {
                existing.setClientIdEnc(AesGcmUtil.encrypt(reqDto.getClientId().trim(), masterKey));
            }
            if (reqDto.getApiKey() != null && !reqDto.getApiKey().trim().isEmpty()) {
                existing.setApiKeyEnc(AesGcmUtil.encrypt(reqDto.getApiKey().trim(), masterKey));
            }
            if (reqDto.getChecksumKey() != null && !reqDto.getChecksumKey().trim().isEmpty()) {
                existing.setChecksumKeyEnc(AesGcmUtil.encrypt(reqDto.getChecksumKey().trim(), masterKey));
            }
            if (reqDto.getEnabled() != null) {
                existing.setEnabled(reqDto.getEnabled() ? 1 : 0);
            }
            if (validatedAt != null) {
                existing.setValidatedAt(validatedAt);
                existing.setValidationResult(validationResult);
            }
            existing.setUpdatedBy(userId);
            existing.setUpdatedByName(updaterName);
            existing.setUpdatedIp(clientIp);
            existing.setUpdateTime(LocalDateTime.now());
            this.updateById(existing);
        }

        // S3: Ghi nhận audit log PAYOS_CONFIG_CHANGE
        Map<String, Object> auditDetail = new HashMap<>();
        String clientRaw = reqDto.getClientId();
        if (clientRaw == null || clientRaw.trim().isEmpty()) {
            clientRaw = existing != null && existing.getClientIdEnc() != null ? AesGcmUtil.decrypt(existing.getClientIdEnc(), masterKey) : null;
        }
        String clientLast4 = (clientRaw != null && clientRaw.length() >= 4) ? clientRaw.substring(clientRaw.length() - 4) : clientRaw;
        auditDetail.put("clientIdLast4", clientLast4);
        auditDetail.put("enabled", reqDto.getEnabled());
        auditDetail.put("validationResult", validationResult);
        auditService.recordAudit(AuditLogReqDto.builder()
                .shopId(shopId)
                .merchantId(userId)
                .actorName(updaterName)
                .actorType(merchant.getType() != null ? merchant.getType() : 2)
                .action("PAYOS_CONFIG_CHANGE")
                .targetType("shop_payment_config")
                .targetId(String.valueOf(shopId))
                .detail(auditDetail)
                .ip(clientIp)
                .userAgent(request != null ? request.getHeader("User-Agent") : null)
                .result("SUCCESS")
                .build());

        return Result.success();
    }

    @Override
    public PayosConfigDto getInternalPayosConfig(Long shopId) {
        if (shopId == null) {
            return null;
        }
        ShopPaymentConfig config = this.getOne(new LambdaQueryWrapper<ShopPaymentConfig>()
                .eq(ShopPaymentConfig::getShopId, shopId)
                .eq(ShopPaymentConfig::getDeleted, 0));

        if (config == null) {
            return null;
        }
        String masterKey = getMasterKey();
        String clientId = null;
        String apiKey = null;
        String checksumKey = null;

        try {
            if (config.getClientIdEnc() != null) {
                clientId = AesGcmUtil.decrypt(config.getClientIdEnc(), masterKey);
            }
            if (config.getApiKeyEnc() != null) {
                apiKey = AesGcmUtil.decrypt(config.getApiKeyEnc(), masterKey);
            }
            if (config.getChecksumKeyEnc() != null) {
                checksumKey = AesGcmUtil.decrypt(config.getChecksumKeyEnc(), masterKey);
            }
        } catch (Exception e) {
            log.error("Failed to decrypt PayOS config for shop {}: {}", shopId, e.getMessage());
        }

        return PayosConfigDto.builder()
                .shopId(shopId)
                .clientId(clientId)
                .apiKey(apiKey)
                .checksumKey(checksumKey)
                .enabled(Integer.valueOf(1).equals(config.getEnabled()))
                .build();
    }

    @Override
    public Boolean isPayosEnabled(Long shopId) {
        if (shopId == null) {
            return false;
        }
        ShopPaymentConfig config = this.getOne(new LambdaQueryWrapper<ShopPaymentConfig>()
                .eq(ShopPaymentConfig::getShopId, shopId)
                .eq(ShopPaymentConfig::getDeleted, 0));
        return config != null && Integer.valueOf(1).equals(config.getEnabled());
    }

    @Override
    public com.linmour.system.pojo.Dto.SecurityNoticeRespDto getSecurityNotice(Long shopId) {
        if (shopId == null) {
            return com.linmour.system.pojo.Dto.SecurityNoticeRespDto.builder()
                    .payosChangedWithin24h(false)
                    .build();
        }
        ShopPaymentConfig config = this.getOne(new LambdaQueryWrapper<ShopPaymentConfig>()
                .eq(ShopPaymentConfig::getShopId, shopId)
                .eq(ShopPaymentConfig::getDeleted, 0));

        if (config == null || config.getUpdateTime() == null || config.getUpdatedBy() == null) {
            return com.linmour.system.pojo.Dto.SecurityNoticeRespDto.builder()
                    .payosChangedWithin24h(false)
                    .build();
        }

        LocalDateTime updateTime = config.getUpdateTime();
        boolean within24h = updateTime.isAfter(LocalDateTime.now().minusHours(24));

        return com.linmour.system.pojo.Dto.SecurityNoticeRespDto.builder()
                .payosChangedWithin24h(within24h)
                .changedAt(within24h ? updateTime : null)
                .changedByName(within24h ? config.getUpdatedByName() : null)
                .changedIp(within24h ? config.getUpdatedIp() : null)
                .build();
    }
}

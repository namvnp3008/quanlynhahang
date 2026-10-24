package com.linmour.security.utils;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.util.concurrent.TimeUnit;

/**
 * S1: Dịch vụ kiểm soát và chống dò mật khẩu brute-force
 * - Đếm sai theo SĐT và IP trong Redis DB 2
 * - Ngưỡng 5 lần sai -> Khoá 15 phút, trả 429 kèm retryAfterSeconds
 */
@Service
@Slf4j
public class LoginAttemptService {

    public static final String PHONE_FAIL_PREFIX = "login:fail:phone:";
    public static final String IP_FAIL_PREFIX = "login:fail:ip:";
    public static final String OTP_FAIL_PREFIX = "login:fail:otp:";
    public static final int MAX_ATTEMPTS = 5;
    public static final int MAX_PHONE_ATTEMPTS = 5;
    public static final int MAX_IP_ATTEMPTS = 30;
    public static final int MAX_OTP_ATTEMPTS = 5;
    public static final long LOCK_MINUTES = 15;

    @Resource
    private RedisCache redisCache;

    public long getRetryAfterSeconds(String phone, String ip) {
        long phoneRetry = 0;
        if (phone != null && !phone.trim().isEmpty()) {
            String pKey = PHONE_FAIL_PREFIX + phone.trim();
            int count = getCount(pKey);
            if (count >= MAX_PHONE_ATTEMPTS) {
                Long ttl = redisCache.getExpire(pKey, TimeUnit.SECONDS);
                if (ttl != null && ttl > 0) {
                    phoneRetry = ttl;
                }
            }
        }

        long ipRetry = 0;
        if (ip != null && !ip.trim().isEmpty()) {
            String iKey = IP_FAIL_PREFIX + ip.trim();
            int count = getCount(iKey);
            if (count >= MAX_IP_ATTEMPTS) {
                Long ttl = redisCache.getExpire(iKey, TimeUnit.SECONDS);
                if (ttl != null && ttl > 0) {
                    ipRetry = ttl;
                }
            }
        }

        return Math.max(phoneRetry, ipRetry);
    }

    public boolean isLocked(String phone, String ip) {
        return getRetryAfterSeconds(phone, ip) > 0;
    }

    public int recordFailure(String phone, String ip) {
        int maxAttempts = 0;
        if (phone != null && !phone.trim().isEmpty()) {
            String pKey = PHONE_FAIL_PREFIX + phone.trim();
            Long count = redisCache.increment(pKey);
            if (count != null) {
                if (count == 1 || count >= MAX_PHONE_ATTEMPTS) {
                    redisCache.expire(pKey, LOCK_MINUTES, TimeUnit.MINUTES);
                }
                if (count.intValue() > maxAttempts) {
                    maxAttempts = count.intValue();
                }
            }
        }

        if (ip != null && !ip.trim().isEmpty()) {
            String iKey = IP_FAIL_PREFIX + ip.trim();
            Long count = redisCache.increment(iKey);
            if (count != null) {
                if (count == 1 || count >= MAX_IP_ATTEMPTS) {
                    redisCache.expire(iKey, LOCK_MINUTES, TimeUnit.MINUTES);
                }
                if (count.intValue() > maxAttempts) {
                    maxAttempts = count.intValue();
                }
            }
        }
        return maxAttempts;
    }

    public long getOtpRetryAfterSeconds(Long merchantId) {
        if (merchantId == null) {
            return 0;
        }
        String oKey = OTP_FAIL_PREFIX + merchantId;
        int count = getCount(oKey);
        if (count >= MAX_OTP_ATTEMPTS) {
            Long ttl = redisCache.getExpire(oKey, TimeUnit.SECONDS);
            if (ttl != null && ttl > 0) {
                return ttl;
            }
        }
        return 0;
    }

    public boolean isOtpLocked(Long merchantId) {
        return getOtpRetryAfterSeconds(merchantId) > 0;
    }

    public int recordOtpFailure(Long merchantId) {
        if (merchantId == null) {
            return 0;
        }
        String oKey = OTP_FAIL_PREFIX + merchantId;
        Long count = redisCache.increment(oKey);
        if (count != null) {
            if (count == 1 || count >= MAX_OTP_ATTEMPTS) {
                redisCache.expire(oKey, LOCK_MINUTES, TimeUnit.MINUTES);
            }
            return count.intValue();
        }
        return 0;
    }

    public void recordOtpSuccess(Long merchantId) {
        if (merchantId != null) {
            redisCache.deleteObject(OTP_FAIL_PREFIX + merchantId);
        }
    }

    public void resetOtp(Long merchantId) {
        if (merchantId != null) {
            redisCache.deleteObject(OTP_FAIL_PREFIX + merchantId);
        }
    }

    public void recordSuccess(String phone) {
        if (phone != null && !phone.trim().isEmpty()) {
            redisCache.deleteObject(PHONE_FAIL_PREFIX + phone.trim());
        }
    }

    public void reset(String phone, String ip) {
        if (phone != null && !phone.trim().isEmpty()) {
            redisCache.deleteObject(PHONE_FAIL_PREFIX + phone.trim());
        }
        if (ip != null && !ip.trim().isEmpty()) {
            redisCache.deleteObject(IP_FAIL_PREFIX + ip.trim());
        }
    }

    private int getCount(String key) {
        try {
            Object val = redisCache.getCacheObject(key);
            if (val == null) {
                return 0;
            }
            if (val instanceof Number) {
                return ((Number) val).intValue();
            }
            return Integer.parseInt(val.toString().trim());
        } catch (Exception e) {
            return 0;
        }
    }
}

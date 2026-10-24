package com.linmour.security.utils;

import org.junit.Before;
import org.junit.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.concurrent.TimeUnit;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

public class LoginAttemptServiceTest {

    @InjectMocks
    private LoginAttemptService loginAttemptService;

    @Mock
    private RedisCache redisCache;

    @Before
    public void setUp() {
        MockitoAnnotations.initMocks(this);
        ReflectionTestUtils.setField(loginAttemptService, "redisCache", redisCache);
    }

    @Test
    public void testRecordFailureUnderThresholdDoesNotLock() {
        String phone = "0912345678";
        String ip = "192.168.1.50";

        when(redisCache.increment(LoginAttemptService.PHONE_FAIL_PREFIX + phone)).thenReturn(3L);
        when(redisCache.increment(LoginAttemptService.IP_FAIL_PREFIX + ip)).thenReturn(3L);

        int count = loginAttemptService.recordFailure(phone, ip);
        assertEquals(3, count);

        when(redisCache.getCacheObject(LoginAttemptService.PHONE_FAIL_PREFIX + phone)).thenReturn(3);
        when(redisCache.getCacheObject(LoginAttemptService.IP_FAIL_PREFIX + ip)).thenReturn(3);

        assertFalse(loginAttemptService.isLocked(phone, ip));
        assertEquals(0, loginAttemptService.getRetryAfterSeconds(phone, ip));
    }

    @Test
    public void testRecordFailureReachesThresholdLocksPhoneAt5AndIpAt30() {
        String phone = "0912345678";
        String ip = "192.168.1.50";

        when(redisCache.increment(LoginAttemptService.PHONE_FAIL_PREFIX + phone)).thenReturn(5L);
        when(redisCache.increment(LoginAttemptService.IP_FAIL_PREFIX + ip)).thenReturn(5L);

        int count = loginAttemptService.recordFailure(phone, ip);
        assertEquals(5, count);

        // Phone reaches 5: sets expire
        verify(redisCache).expire(eq(LoginAttemptService.PHONE_FAIL_PREFIX + phone), eq(15L), eq(TimeUnit.MINUTES));
        // IP at 5: does NOT reach 30 threshold, only expires on first attempt
        when(redisCache.getCacheObject(LoginAttemptService.PHONE_FAIL_PREFIX + phone)).thenReturn(5);
        when(redisCache.getCacheObject(LoginAttemptService.IP_FAIL_PREFIX + ip)).thenReturn(5);
        when(redisCache.getExpire(eq(LoginAttemptService.PHONE_FAIL_PREFIX + phone), eq(TimeUnit.SECONDS))).thenReturn(850L);

        assertTrue(loginAttemptService.isLocked(phone, ip));
        assertEquals(850L, loginAttemptService.getRetryAfterSeconds(phone, ip));

        // IP reaches 30
        when(redisCache.increment(LoginAttemptService.IP_FAIL_PREFIX + ip)).thenReturn(30L);
        loginAttemptService.recordFailure(null, ip);
        verify(redisCache).expire(eq(LoginAttemptService.IP_FAIL_PREFIX + ip), eq(15L), eq(TimeUnit.MINUTES));
    }

    @Test
    public void testOtpLockingTracksSeparatelyPerMerchantId() {
        Long merchantId = 88L;
        when(redisCache.increment(LoginAttemptService.OTP_FAIL_PREFIX + merchantId)).thenReturn(5L);

        int count = loginAttemptService.recordOtpFailure(merchantId);
        assertEquals(5, count);
        verify(redisCache).expire(eq(LoginAttemptService.OTP_FAIL_PREFIX + merchantId), eq(15L), eq(TimeUnit.MINUTES));

        when(redisCache.getCacheObject(LoginAttemptService.OTP_FAIL_PREFIX + merchantId)).thenReturn(5);
        when(redisCache.getExpire(eq(LoginAttemptService.OTP_FAIL_PREFIX + merchantId), eq(TimeUnit.SECONDS))).thenReturn(900L);

        assertTrue(loginAttemptService.isOtpLocked(merchantId));
        assertEquals(900L, loginAttemptService.getOtpRetryAfterSeconds(merchantId));

        loginAttemptService.recordOtpSuccess(merchantId);
        verify(redisCache).deleteObject(eq(LoginAttemptService.OTP_FAIL_PREFIX + merchantId));
    }

    @Test
    public void testRecordSuccessClearsPhoneFailureOnly() {
        String phone = "0912345678";

        loginAttemptService.recordSuccess(phone);

        verify(redisCache).deleteObject(eq(LoginAttemptService.PHONE_FAIL_PREFIX + phone));
        // Verify IP key is NOT deleted on phone success
        verify(redisCache, never()).deleteObject(startsWith(LoginAttemptService.IP_FAIL_PREFIX));
    }

    @Test
    public void testIpLockingWorksIndependentlyOfPhone() {
        String phone = "0988888888";
        String ip = "10.0.0.1";

        // Phone has 1 failure, IP has 30 failures
        when(redisCache.getCacheObject(LoginAttemptService.PHONE_FAIL_PREFIX + phone)).thenReturn(1);
        when(redisCache.getCacheObject(LoginAttemptService.IP_FAIL_PREFIX + ip)).thenReturn(30);
        when(redisCache.getExpire(eq(LoginAttemptService.IP_FAIL_PREFIX + ip), eq(TimeUnit.SECONDS))).thenReturn(600L);

        assertTrue(loginAttemptService.isLocked(phone, ip));
        assertEquals(600L, loginAttemptService.getRetryAfterSeconds(phone, ip));
    }
}

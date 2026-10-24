package com.linmour.security.utils;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

public class TotpUtilTest {

    /**
     * Kiểm tra vector chuẩn RFC 6238 Phụ lục B (HMAC-SHA1, 6 chữ số).
     * Seed: "12345678901234567890" (20 bytes ASCII).
     */
    @Test
    void testRfc6238AppendixBVectors() {
        byte[] rfcSeedBytes = "12345678901234567890".getBytes(StandardCharsets.US_ASCII);

        // T = 59, step = 1 -> 8 digits: 94287082 -> 6 digits: 287082
        assertEquals("287082", TotpUtil.generateTotpFromRawKey(rfcSeedBytes, 59L / 30L, 6));

        // T = 1111111109, step = 37037036 -> 8 digits: 07081804 -> 6 digits: 081804
        assertEquals("081804", TotpUtil.generateTotpFromRawKey(rfcSeedBytes, 1111111109L / 30L, 6));

        // T = 1111111111, step = 37037037 -> 8 digits: 14050471 -> 6 digits: 050471
        assertEquals("050471", TotpUtil.generateTotpFromRawKey(rfcSeedBytes, 1111111111L / 30L, 6));

        // T = 1234567890, step = 41152263 -> 8 digits: 89005924 -> 6 digits: 005924
        assertEquals("005924", TotpUtil.generateTotpFromRawKey(rfcSeedBytes, 1234567890L / 30L, 6));

        // T = 2000000000, step = 66666666 -> 8 digits: 69279037 -> 6 digits: 279037
        assertEquals("279037", TotpUtil.generateTotpFromRawKey(rfcSeedBytes, 2000000000L / 30L, 6));

        // T = 20000000000, step = 666666666 -> 8 digits: 65353130 -> 6 digits: 353130
        assertEquals("353130", TotpUtil.generateTotpFromRawKey(rfcSeedBytes, 20000000000L / 30L, 6));
    }

    @Test
    void testDriftTolerance() {
        String secret = TotpUtil.generateSecret();
        assertNotNull(secret);
        assertTrue(secret.length() >= 26);

        long now = 1700000000L;
        long step = now / 30L;
        String currentCode = TotpUtil.generateTotp(secret, step, 6);
        String prevCode = TotpUtil.generateTotp(secret, step - 1, 6);
        String nextCode = TotpUtil.generateTotp(secret, step + 1, 6);
        String farPrevCode = TotpUtil.generateTotp(secret, step - 2, 6);
        String farNextCode = TotpUtil.generateTotp(secret, step + 2, 6);

        // Hiện tại: hợp lệ
        assertTrue(TotpUtil.verifyCode(secret, currentCode, now));
        // Lệch -1 bước (trong vòng 30s trước): hợp lệ
        assertTrue(TotpUtil.verifyCode(secret, prevCode, now));
        // Lệch +1 bước (trong vòng 30s sau): hợp lệ
        assertTrue(TotpUtil.verifyCode(secret, nextCode, now));

        // Lệch >= 2 bước: không hợp lệ (trừ khi ngẫu nhiên trùng)
        if (!farPrevCode.equals(currentCode) && !farPrevCode.equals(prevCode) && !farPrevCode.equals(nextCode)) {
            assertFalse(TotpUtil.verifyCode(secret, farPrevCode, now));
        }
        if (!farNextCode.equals(currentCode) && !farNextCode.equals(prevCode) && !farNextCode.equals(nextCode)) {
            assertFalse(TotpUtil.verifyCode(secret, farNextCode, now));
        }
    }

    @Test
    void testMaskSecretAndUri() {
        String secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
        String masked = TotpUtil.maskSecret(secret);
        assertEquals("JBSW...3PXP", masked);

        String uri = TotpUtil.getOtpAuthUri("Linmour", "0901234567", secret);
        assertTrue(uri.startsWith("otpauth://totp/Linmour:0901234567?secret="));
        assertTrue(uri.contains("digits=6"));
        assertTrue(uri.contains("period=30"));
    }

    @Test
    void testRecoveryCodes() {
        List<String> codes = TotpUtil.generateRecoveryCodes();
        assertEquals(8, codes.size());
        for (String c : codes) {
            assertEquals(8, c.length());
        }
        assertEquals(8, codes.stream().distinct().count());
    }
}

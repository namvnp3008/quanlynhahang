package com.linmour.security.utils;

import org.apache.commons.codec.binary.Base32;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;

/**
 * Tiện ích xác thực 2 lớp TOTP (RFC 6238 / RFC 4226).
 * - HMAC-SHA1
 * - Bước nhảy 30 giây
 * - 6 chữ số
 * - Cho phép lệch ±1 bước thời gian (drift tolerance)
 */
public class TotpUtil {

    public static final int TIME_STEP_SECONDS = 30;
    public static final int CODE_DIGITS = 6;
    private static final String HMAC_ALGORITHM = "HmacSHA1";
    private static final Base32 BASE32 = new Base32();
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    /**
     * Sinh khoá bí mật ngẫu nhiên Base32 160-bit (20 bytes, 32 ký tự).
     */
    public static String generateSecret() {
        byte[] buffer = new byte[20];
        SECURE_RANDOM.nextBytes(buffer);
        return BASE32.encodeAsString(buffer).replace("=", "").trim();
    }

    /**
     * Che bớt chuỗi bí mật để hiển thị an toàn (giữ 4 ký tự đầu và 4 ký tự cuối).
     */
    public static String maskSecret(String secret) {
        if (secret == null || secret.length() <= 8) {
            return "****";
        }
        return secret.substring(0, 4) + "..." + secret.substring(secret.length() - 4);
    }

    /**
     * Tạo URI otpauth:// chuẩn RFC 6238 cho ứng dụng Google Authenticator / Authy.
     */
    public static String getOtpAuthUri(String issuer, String account, String secret) {
        try {
            String encodedIssuer = URLEncoder.encode(issuer, StandardCharsets.UTF_8.name()).replace("+", "%20");
            String encodedAccount = URLEncoder.encode(account, StandardCharsets.UTF_8.name()).replace("+", "%20");
            return String.format("otpauth://totp/%s:%s?secret=%s&issuer=%s&algorithm=SHA1&digits=%d&period=%d",
                    encodedIssuer, encodedAccount, secret, encodedIssuer, CODE_DIGITS, TIME_STEP_SECONDS);
        } catch (UnsupportedEncodingException e) {
            return String.format("otpauth://totp/%s:%s?secret=%s&issuer=%s&algorithm=SHA1&digits=%d&period=%d",
                    issuer, account, secret, issuer, CODE_DIGITS, TIME_STEP_SECONDS);
        }
    }

    /**
     * Tính mã TOTP từ khoá Base32 tại bước thời gian timeStep.
     */
    public static String generateTotp(String base32Secret, long timeStep, int digits) {
        byte[] keyBytes = BASE32.decode(base32Secret.trim().toUpperCase());
        return generateTotpFromRawKey(keyBytes, timeStep, digits);
    }

    /**
     * Tính mã TOTP từ mảng byte khoá tại bước thời gian timeStep.
     */
    public static String generateTotpFromRawKey(byte[] keyBytes, long timeStep, int digits) {
        try {
            byte[] data = new byte[8];
            long value = timeStep;
            for (int i = 7; i >= 0; i--) {
                data[i] = (byte) (value & 0xFF);
                value >>= 8;
            }

            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(keyBytes, HMAC_ALGORITHM));
            byte[] hash = mac.doFinal(data);

            int offset = hash[hash.length - 1] & 0x0F;
            int binary = ((hash[offset] & 0x7F) << 24)
                    | ((hash[offset + 1] & 0xFF) << 16)
                    | ((hash[offset + 2] & 0xFF) << 8)
                    | (hash[offset + 3] & 0xFF);

            int modulo = (int) Math.pow(10, digits);
            int otp = binary % modulo;
            return String.format("%0" + digits + "d", otp);
        } catch (Exception e) {
            throw new RuntimeException("Lỗi sinh mã TOTP: " + e.getMessage(), e);
        }
    }

    /**
     * Kiểm tra mã TOTP người dùng nhập vào so với khoá bí mật tại thời điểm epochSeconds.
     * Cho phép lệch ±1 bước thời gian (drift tolerance: T-1, T, T+1).
     */
    public static boolean verifyCode(String base32Secret, String code, long epochSeconds) {
        if (base32Secret == null || code == null || code.trim().length() != CODE_DIGITS) {
            return false;
        }
        String cleanCode = code.trim();
        long currentStep = epochSeconds / TIME_STEP_SECONDS;

        for (int i = -1; i <= 1; i++) {
            long step = currentStep + i;
            String calculated = generateTotp(base32Secret, step, CODE_DIGITS);
            if (calculated.equals(cleanCode)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Kiểm tra mã TOTP tại thời điểm hiện tại.
     */
    public static boolean verifyCode(String base32Secret, String code) {
        return verifyCode(base32Secret, code, System.currentTimeMillis() / 1000L);
    }

    /**
     * Sinh 8 mã khôi phục ngẫu nhiên dạng 8 ký tự hex/alphanumeric.
     */
    public static List<String> generateRecoveryCodes() {
        List<String> codes = new ArrayList<>(8);
        byte[] bytes = new byte[5];
        for (int i = 0; i < 8; i++) {
            SECURE_RANDOM.nextBytes(bytes);
            StringBuilder sb = new StringBuilder();
            for (byte b : bytes) {
                sb.append(String.format("%02x", b));
            }
            // Lấy 8 ký tự
            codes.add(sb.substring(0, 8).toLowerCase());
        }
        return codes;
    }
}

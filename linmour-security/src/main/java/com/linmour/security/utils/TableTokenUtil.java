package com.linmour.security.utils;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Date;

public class TableTokenUtil {

    public static final Long TABLE_TOKEN_TTL = 24 * 60 * 60 * 1000L; // 24 hours
    private static String TABLE_TOKEN_KEY = null;

    public static void setTableTokenKey(String key) {
        if (key != null && !key.trim().isEmpty()) {
            TABLE_TOKEN_KEY = key.trim();
        } else {
            TABLE_TOKEN_KEY = null;
        }
    }

    public static String getTableTokenKey() {
        return TABLE_TOKEN_KEY;
    }

    /**
     * Tính qv: 8 ký tự đầu SHA-256 của qr_token hiện tại
     */
    public static String calculateQv(String qrToken) {
        if (qrToken == null || qrToken.trim().isEmpty()) {
            return "";
        }
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(qrToken.trim().getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.substring(0, Math.min(8, hexString.length()));
        } catch (Exception e) {
            throw new RuntimeException("Lỗi tính hash SHA-256 cho QR token: " + e.getMessage(), e);
        }
    }

    public static SecretKey generalKey() {
        if (TABLE_TOKEN_KEY == null || TABLE_TOKEN_KEY.trim().isEmpty()) {
            throw new IllegalStateException("Cấu hình 'security.table-token-secret' không được để trống! TableTokenUtil yêu cầu khóa bí mật để ký/giải mã token bàn.");
        }
        byte[] encodedKey = TABLE_TOKEN_KEY.getBytes(StandardCharsets.UTF_8);
        return new SecretKeySpec(encodedKey, 0, encodedKey.length, "HmacSHA256");
    }

    public static String createTableAccessToken(Long shopId, Long tableId, String qv) {
        return createTableAccessToken(shopId, tableId, qv, TABLE_TOKEN_TTL);
    }

    public static String createTableAccessToken(Long shopId, Long tableId, String qv, Long ttlMillis) {
        SignatureAlgorithm signatureAlgorithm = SignatureAlgorithm.HS256;
        SecretKey secretKey = generalKey();
        long nowMillis = System.currentTimeMillis();
        Date now = new Date(nowMillis);
        long expMillis = nowMillis + (ttlMillis != null ? ttlMillis : TABLE_TOKEN_TTL);
        Date expDate = new Date(expMillis);

        return Jwts.builder()
                .claim("sid", shopId)
                .claim("tid", tableId)
                .claim("qv", qv)
                .setIssuedAt(now)
                .setExpiration(expDate)
                .signWith(signatureAlgorithm, secretKey)
                .compact();
    }

    public static Claims parseTableAccessToken(String token) {
        SecretKey secretKey = generalKey();
        return Jwts.parser()
                .setSigningKey(secretKey)
                .parseClaimsJws(token)
                .getBody();
    }
}

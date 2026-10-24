package com.linmour.order.utils;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.TreeMap;

/**
 * Tiện ích tạo và kiểm tra chữ ký HMAC-SHA256 chuẩn PayOS
 */
public class PayosSignatureUtil {

    private static final String HMAC_SHA256 = "HmacSHA256";

    /**
     * Tạo chữ ký cho request tạo link thanh toán (5 trường theo thứ tự alphabet):
     * amount=...&cancelUrl=...&description=...&orderCode=...&returnUrl=...
     */
    public static String createRequestSignature(Long amount, String cancelUrl, String description, Long orderCode, String returnUrl, String checksumKey) {
        String dataString = "amount=" + amount +
                "&cancelUrl=" + (cancelUrl != null ? cancelUrl : "") +
                "&description=" + (description != null ? description : "") +
                "&orderCode=" + orderCode +
                "&returnUrl=" + (returnUrl != null ? returnUrl : "");
        return hmacSha256(dataString, checksumKey);
    }

    /**
     * Xác thực chữ ký webhook từ PayOS (sắp xếp key alphabet, null -> "")
     */
    public static boolean verifyWebhookSignature(Map<String, Object> data, String signature, String checksumKey) {
        if (data == null || signature == null || checksumKey == null) {
            return false;
        }
        TreeMap<String, Object> sortedMap = new TreeMap<>(data);
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, Object> entry : sortedMap.entrySet()) {
            if (sb.length() > 0) {
                sb.append("&");
            }
            sb.append(entry.getKey()).append("=");
            Object val = entry.getValue();
            sb.append(val != null ? val.toString() : "");
        }
        String calculatedSig = hmacSha256(sb.toString(), checksumKey);
        return calculatedSig.equalsIgnoreCase(signature.trim());
    }

    /**
     * Tính toán HMAC-SHA256
     */
    public static String hmacSha256(String data, String key) {
        try {
            Mac mac = Mac.getInstance(HMAC_SHA256);
            SecretKeySpec secretKeySpec = new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), HMAC_SHA256);
            mac.init(secretKeySpec);
            byte[] bytes = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte b : bytes) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) {
                    hexString.append('0');
                }
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (Exception e) {
            throw new RuntimeException("Lỗi tính HMAC-SHA256", e);
        }
    }
}

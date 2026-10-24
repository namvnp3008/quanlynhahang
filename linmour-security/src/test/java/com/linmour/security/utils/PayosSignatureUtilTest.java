package com.linmour.security.utils;

import org.junit.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.*;

public class PayosSignatureUtilTest {

    private final String checksumKey = "96d997233dfb1e3e5b32ec8ee00eb2bc20e2ef64d7c570f44e8574be0ff2f582";

    @Test
    public void testCreateRequestSignature() {
        Long amount = 2000L;
        String cancelUrl = "https://localhost";
        String description = "Kiem tra ket noi";
        Long orderCode = 1729601234L;
        String returnUrl = "https://localhost";

        String sig = PayosSignatureUtil.createRequestSignature(amount, cancelUrl, description, orderCode, returnUrl, checksumKey);
        assertNotNull(sig);
        assertFalse(sig.isEmpty());
    }

    @Test
    public void testVerifyWebhookSignature() {
        Map<String, Object> data = new HashMap<>();
        data.put("amount", 2000);
        data.put("orderCode", 123);

        String raw = "amount=2000&orderCode=123";
        String expectedSig = PayosSignatureUtil.hmacSha256(raw, checksumKey);

        assertTrue(PayosSignatureUtil.verifyWebhookSignature(data, expectedSig, checksumKey));
        assertFalse(PayosSignatureUtil.verifyWebhookSignature(data, "invalid_sig", checksumKey));
    }
}

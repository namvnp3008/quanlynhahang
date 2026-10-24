package com.linmour.order.utils;

import org.junit.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class PayosSignatureUtilTest {

    @Test
    public void testOfficialPayosWebhookSignatureVector() {
        String checksumKey = "1a54716c8f0efb2744fb28b6e38b25da7f67a925d98bc1c18bd8faaecadd7675";

        Map<String, Object> data = new HashMap<>();
        data.put("orderCode", 123);
        data.put("amount", 3000);
        data.put("description", "VQRIO123");
        data.put("accountNumber", "12345678");
        data.put("reference", "TF230204212323");
        data.put("transactionDateTime", "2023-02-04 18:25:00");
        data.put("currency", "VND");
        data.put("paymentLinkId", "124c33293c43417ab7879e14c8d9eb18");
        data.put("code", "00");
        data.put("desc", "Thành công");
        data.put("counterAccountBankId", "");
        data.put("counterAccountBankName", "");
        data.put("counterAccountName", "");
        data.put("counterAccountNumber", "");
        data.put("virtualAccountName", "");
        data.put("virtualAccountNumber", "");

        String expectedSignature = "412e915d2871504ed31be63c8f62a149a4410d34c4c42affc9006ef9917eaa03";

        boolean verified = PayosSignatureUtil.verifyWebhookSignature(data, expectedSignature, checksumKey);
        assertTrue("Chữ ký webhook từ vector PayOS chính thức phải xác thực thành công", verified);
    }

    @Test
    public void testCreateRequestSignature() {
        String checksumKey = "test-checksum-key-123";
        Long amount = 50000L;
        String cancelUrl = "http://localhost:5181/?payos=cancel";
        String description = "Ban 08 #1234";
        Long orderCode = 1729601234L;
        String returnUrl = "http://localhost:5181/?payos=return";

        String sig = PayosSignatureUtil.createRequestSignature(amount, cancelUrl, description, orderCode, returnUrl, checksumKey);

        String manualData = "amount=" + amount +
                "&cancelUrl=" + cancelUrl +
                "&description=" + description +
                "&orderCode=" + orderCode +
                "&returnUrl=" + returnUrl;
        String expectedSig = PayosSignatureUtil.hmacSha256(manualData, checksumKey);

        assertEquals(expectedSig, sig);
    }
}

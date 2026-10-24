package com.linmour.system.service.impl;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.linmour.security.dtos.Result;
import com.linmour.security.utils.PayosSignatureUtil;
import com.linmour.system.service.PayosKeyValidator;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

@Slf4j
@Component
public class PayosKeyValidatorImpl implements PayosKeyValidator {

    private static final String PAYOS_CREATE_URL = "https://api-merchant.payos.vn/v2/payment-requests";

    @Value("${payos.mock:false}")
    private boolean payosMock;

    private HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    public void setHttpClient(HttpClient httpClient) {
        this.httpClient = httpClient;
    }

    public void setPayosMock(boolean payosMock) {
        this.payosMock = payosMock;
    }

    @Override
    public Result validate(String clientId, String apiKey, String checksumKey) {
        if (payosMock) {
            log.info("Chế độ payos.mock=true: Bỏ qua gọi thật tới PayOS, ghi nhận MOCK");
            return Result.success("MOCK");
        }

        if (StringUtils.isAnyBlank(clientId, apiKey, checksumKey)) {
            Map<String, Object> data = new HashMap<>();
            data.put("payosCode", "PARAM_ERROR");
            return Result.error(400, "Key PayOS không hợp lệ: Thiếu clientId, apiKey hoặc checksumKey", data);
        }

        long nowEpoch = Instant.now().getEpochSecond();
        long random2 = ThreadLocalRandom.current().nextInt(10, 99);
        long orderCode = nowEpoch * 100 + random2;
        long amount = 2000L;
        String description = "Kiem tra ket noi";
        String cancelUrl = "https://localhost";
        String returnUrl = "https://localhost";
        long expiredAt = nowEpoch + 15 * 60;

        String signature;
        try {
            signature = PayosSignatureUtil.createRequestSignature(
                    amount, cancelUrl, description, orderCode, returnUrl, checksumKey.trim()
            );
        } catch (Exception e) {
            log.error("Lỗi khi tạo chữ ký kiểm tra PayOS: {}", e.getMessage());
            Map<String, Object> data = new HashMap<>();
            data.put("payosCode", "SIGNATURE_ERROR");
            return Result.error(400, "Key PayOS không hợp lệ: " + e.getMessage(), data);
        }

        Map<String, Object> body = new HashMap<>();
        body.put("orderCode", orderCode);
        body.put("amount", amount);
        body.put("description", description);
        body.put("cancelUrl", cancelUrl);
        body.put("returnUrl", returnUrl);
        body.put("expiredAt", expiredAt);
        body.put("signature", signature);

        String jsonBody = JSON.toJSONString(body);

        try {
            HttpRequest createReq = HttpRequest.newBuilder()
                    .uri(URI.create(PAYOS_CREATE_URL))
                    .header("Content-Type", "application/json")
                    .header("x-client-id", clientId.trim())
                    .header("x-api-key", apiKey.trim())
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                    .timeout(Duration.ofSeconds(15))
                    .build();

            HttpResponse<String> createResp = httpClient.send(createReq, HttpResponse.BodyHandlers.ofString());
            String respBody = createResp.body();
            log.info("PayOS validate response (code {}): {}", createResp.statusCode(), respBody);

            JSONObject jsonResp = JSON.parseObject(respBody);
            String code = jsonResp != null ? jsonResp.getString("code") : null;
            if ("00".equals(code)) {
                try {
                    Map<String, String> cancelBody = new HashMap<>();
                    cancelBody.put("cancellationReason", "Kiem tra ket noi");
                    HttpRequest cancelReq = HttpRequest.newBuilder()
                            .uri(URI.create(PAYOS_CREATE_URL + "/" + orderCode + "/cancel"))
                            .header("Content-Type", "application/json")
                            .header("x-client-id", clientId.trim())
                            .header("x-api-key", apiKey.trim())
                            .POST(HttpRequest.BodyPublishers.ofString(JSON.toJSONString(cancelBody)))
                            .timeout(Duration.ofSeconds(10))
                            .build();
                    HttpResponse<String> cancelResp = httpClient.send(cancelReq, HttpResponse.BodyHandlers.ofString());
                    log.info("PayOS cancel test link (orderCode {}): HTTP {}", orderCode, cancelResp.statusCode());
                } catch (Exception e) {
                    log.warn("Không thể huỷ link test PayOS orderCode {}: {}", orderCode, e.getMessage());
                }
                return Result.success("SUCCESS");
            } else {
                String desc = jsonResp != null ? jsonResp.getString("desc") : "Lỗi không xác định từ PayOS";
                log.warn("PayOS validation trả lỗi code: {}, desc: {}", code, desc);
                Map<String, Object> data = new HashMap<>();
                data.put("payosCode", code != null ? code : "UNKNOWN");
                return Result.error(400, "Key PayOS không hợp lệ: " + desc, data);
            }
        } catch (Exception e) {
            log.error("Ngoại lệ khi gọi PayOS kiểm tra key: {}", e.getMessage(), e);
            Map<String, Object> data = new HashMap<>();
            data.put("payosCode", "CONNECT_ERROR");
            return Result.error(400, "Key PayOS không hợp lệ: Không thể kết nối tới PayOS (" + e.getMessage() + ")", data);
        }
    }
}

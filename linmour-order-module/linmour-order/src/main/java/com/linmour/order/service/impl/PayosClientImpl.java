package com.linmour.order.service.impl;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.linmour.order.pojo.Dto.PayosCreateRespDto;
import com.linmour.order.service.PayosClient;
import com.linmour.order.utils.PayosSignatureUtil;
import com.linmour.security.exception.CustomException;
import com.linmour.security.utils.RedisCache;
import com.linmour.system.pojo.Dto.PayosConfigDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@Service
public class PayosClientImpl implements PayosClient {

    private static final String PAYOS_CREATE_URL = "https://api-merchant.payos.vn/v2/payment-requests";

    @Value("${payos.mock:false}")
    private boolean payosMock;

    @Resource
    private RedisCache redisCache;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    @Override
    public PayosCreateRespDto createPaymentLink(
            Long orderCode,
            Long amount,
            String description,
            String returnUrl,
            String cancelUrl,
            Long expiredAt,
            PayosConfigDto config
    ) {
        String signature = PayosSignatureUtil.createRequestSignature(
                amount,
                cancelUrl,
                description,
                orderCode,
                returnUrl,
                config.getChecksumKey()
        );

        // P-4: Chỉ bật mock khi cấu hình payos.mock=true
        if (payosMock) {
            log.info("Sử dụng mock PayOS client cho orderCode: {}, amount: {}", orderCode, amount);
            return createMockResponse(orderCode, amount, expiredAt);
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
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(PAYOS_CREATE_URL))
                    .header("Content-Type", "application/json")
                    .header("x-client-id", config.getClientId())
                    .header("x-api-key", config.getApiKey())
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                    .timeout(Duration.ofSeconds(15))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            String respBody = response.body();
            log.info("PayOS response (code {}): {}", response.statusCode(), respBody);

            JSONObject jsonResp = JSON.parseObject(respBody);
            String code = jsonResp != null ? jsonResp.getString("code") : null;
            if ("00".equals(code)) {
                JSONObject data = jsonResp.getJSONObject("data");
                return PayosCreateRespDto.builder()
                        .orderCode(orderCode)
                        .checkoutUrl(data.getString("checkoutUrl"))
                        .qrCode(data.getString("qrCode"))
                        .amount(amount)
                        .expiredAt(expiredAt)
                        .paymentLinkId(data != null ? data.getString("paymentLinkId") : null)
                        .build();
            } else {
                String desc = jsonResp != null ? jsonResp.getString("desc") : "Lỗi không xác định từ PayOS";
                log.error("PayOS trả lỗi code: {}, desc: {}", code, desc);
                throw new CustomException(514, "PayOS lỗi: " + desc);
            }
        } catch (CustomException ce) {
            throw ce;
        } catch (Exception e) {
            log.error("Ngoại lệ khi gọi PayOS create payment link: {}", e.getMessage(), e);
            throw new CustomException(514, "Không thể kết nối tới cổng thanh toán PayOS: " + e.getMessage());
        }
    }

    private PayosCreateRespDto createMockResponse(Long orderCode, Long amount, Long expiredAt) {
        String checkoutUrl = "https://pay.payos.vn/web/mock-" + orderCode;
        String qrCode = "00020101021238540010A000000727012600069704220112123456780208QRIBFTTA520460115303704540" +
                amount + "5802VN62150811MOCKPAYOS6304ABCD";
        return PayosCreateRespDto.builder()
                .orderCode(orderCode)
                .checkoutUrl(checkoutUrl)
                .qrCode(qrCode)
                .amount(amount)
                .expiredAt(expiredAt)
                .paymentLinkId("mock-link-" + orderCode)
                .build();
    }

    @Override
    public JSONObject getPaymentLinkInformation(Long orderCode, PayosConfigDto config) {
        // P-4: Ở chế độ mock, recheck trả PENDING trừ khi giao dịch đã nhận webhook
        if (payosMock) {
            log.info("Sử dụng mock getPaymentLinkInformation cho orderCode: {}", orderCode);
            JSONObject mockData = new JSONObject();
            mockData.put("orderCode", orderCode);

            String orderKey = "payos:order:" + orderCode;
            Object redisValObj = redisCache != null ? redisCache.getCacheObject(orderKey) : null;
            String txStatus = "PENDING";
            Long amount = null;
            if (redisValObj != null) {
                try {
                    Map<String, Object> map = JSON.parseObject(redisValObj.toString(), Map.class);
                    if (map != null && map.get("status") != null) {
                        txStatus = map.get("status").toString();
                    }
                    if (map != null && map.get("amount") != null) {
                        amount = Long.valueOf(map.get("amount").toString());
                    }
                } catch (Exception ignored) {}
            }

            if ("PAID".equalsIgnoreCase(txStatus)) {
                mockData.put("status", "PAID");
                mockData.put("reference", "MOCK_WEBHOOK_PAID_" + orderCode);
            } else {
                mockData.put("status", "PENDING");
            }
            if (amount != null) {
                mockData.put("amount", amount);
            }
            return mockData;
        }

        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(PAYOS_CREATE_URL + "/" + orderCode))
                    .header("Content-Type", "application/json")
                    .header("x-client-id", config.getClientId())
                    .header("x-api-key", config.getApiKey())
                    .GET()
                    .timeout(Duration.ofSeconds(15))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            JSONObject jsonResp = JSON.parseObject(response.body());
            if (jsonResp != null && "00".equals(jsonResp.getString("code"))) {
                return jsonResp.getJSONObject("data");
            } else {
                String desc = jsonResp != null ? jsonResp.getString("desc") : "Không lấy được thông tin từ PayOS";
                throw new CustomException(400, "PayOS lỗi: " + desc);
            }
        } catch (CustomException ce) {
            throw ce;
        } catch (Exception e) {
            throw new CustomException(400, "Lỗi kết nối PayOS: " + e.getMessage());
        }
    }

    @Override
    public JSONObject cancelPaymentLink(Long orderCode, String cancellationReason, PayosConfigDto config) {
        if (payosMock) {
            log.info("Sử dụng mock cancelPaymentLink cho orderCode: {}, lý do: {}", orderCode, cancellationReason);
            JSONObject mockData = new JSONObject();
            mockData.put("orderCode", orderCode);
            mockData.put("status", "CANCELLED");
            mockData.put("cancellationReason", cancellationReason);
            return mockData;
        }

        try {
            Map<String, String> body = new HashMap<>();
            body.put("cancellationReason", org.apache.commons.lang3.StringUtils.isNotBlank(cancellationReason)
                    ? cancellationReason : "Đơn hàng thay đổi");
            String jsonBody = JSON.toJSONString(body);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(PAYOS_CREATE_URL + "/" + orderCode + "/cancel"))
                    .header("Content-Type", "application/json")
                    .header("x-client-id", config.getClientId())
                    .header("x-api-key", config.getApiKey())
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                    .timeout(Duration.ofSeconds(15))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            String respBody = response.body();
            log.info("PayOS cancel link response (code {}): {}", response.statusCode(), respBody);

            JSONObject jsonResp = JSON.parseObject(respBody);
            if (jsonResp != null && "00".equals(jsonResp.getString("code"))) {
                return jsonResp.getJSONObject("data");
            } else {
                String desc = jsonResp != null ? jsonResp.getString("desc") : "Không hủy được link trên PayOS";
                log.warn("PayOS hủy link thất bại cho orderCode {}: {}", orderCode, desc);
                // P-7: PayOS trả code ≠ "00" thì luôn coi là hủy thất bại, trả null (kể cả khi data khác null)
                return null;
            }
        } catch (Exception e) {
            log.warn("Ngoại lệ khi gọi PayOS cancel link cho orderCode {}: {}", orderCode, e.getMessage());
            return null;
        }
    }
}

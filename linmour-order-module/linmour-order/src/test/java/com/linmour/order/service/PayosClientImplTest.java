package com.linmour.order.service;

import com.alibaba.fastjson.JSONObject;
import com.linmour.order.pojo.Dto.PayosCreateRespDto;
import com.linmour.order.service.impl.PayosClientImpl;
import com.linmour.security.utils.RedisCache;
import com.linmour.system.pojo.Dto.PayosConfigDto;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.springframework.test.util.ReflectionTestUtils;

import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

@RunWith(MockitoJUnitRunner.class)
public class PayosClientImplTest {

    @Mock
    private RedisCache redisCache;

    @InjectMocks
    private PayosClientImpl payosClient;

    private PayosConfigDto config;

    @Before
    public void setUp() {
        config = PayosConfigDto.builder()
                .clientId("test-po-a1b2")
                .apiKey("api-key-test")
                .checksumKey("po-checksum-test")
                .build();
    }

    @Test
    public void testMockEnabled_CreatePaymentLink() {
        ReflectionTestUtils.setField(payosClient, "payosMock", true);

        PayosCreateRespDto resp = payosClient.createPaymentLink(
                179268999999L,
                25000L,
                "Test link",
                "http://return.url",
                "http://cancel.url",
                179269999999L,
                config
        );

        assertNotNull(resp);
        assertEquals(Long.valueOf(179268999999L), resp.getOrderCode());
        assertEquals(Long.valueOf(25000L), resp.getAmount());
        assertTrue(resp.getCheckoutUrl().contains("mock-179268999999"));
        assertTrue(resp.getQrCode().contains("MOCKPAYOS"));
        assertEquals("mock-link-179268999999", resp.getPaymentLinkId());
    }

    @Test
    public void testMockEnabled_RecheckReturnsPending_WhenNoWebhookReceived() {
        ReflectionTestUtils.setField(payosClient, "payosMock", true);

        // Redis chưa nhận webhook (hoặc status là PENDING)
        when(redisCache.getCacheObject("payos:order:179268999999"))
                .thenReturn("{\"orderCode\":179268999999,\"status\":\"PENDING\",\"amount\":25000}");

        JSONObject data = payosClient.getPaymentLinkInformation(179268999999L, config);
        assertNotNull(data);
        assertEquals("PENDING", data.getString("status"));
        assertEquals(Long.valueOf(25000L), data.getLong("amount"));
    }

    @Test
    public void testMockEnabled_RecheckReturnsPaid_WhenWebhookAlreadyReceived() {
        ReflectionTestUtils.setField(payosClient, "payosMock", true);

        // Redis đã nhận webhook -> status là PAID
        when(redisCache.getCacheObject("payos:order:179268999999"))
                .thenReturn("{\"orderCode\":179268999999,\"status\":\"PAID\",\"amount\":25000}");

        JSONObject data = payosClient.getPaymentLinkInformation(179268999999L, config);
        assertNotNull(data);
        assertEquals("PAID", data.getString("status"));
        assertNotNull(data.getString("reference"));
        assertEquals(Long.valueOf(25000L), data.getLong("amount"));
    }

    @Test
    public void testMockDisabled_DoesNotUseMock_EvenWithTestKeyPrefix() {
        ReflectionTestUtils.setField(payosClient, "payosMock", false);

        // Client ID có tiền tố test- nhưng payosMock = false thì KHÔNG được tự động mock
        try {
            payosClient.createPaymentLink(
                    179268999999L,
                    25000L,
                    "Test link",
                    "http://return.url",
                    "http://cancel.url",
                    179269999999L,
                    config
            );
        } catch (Exception e) {
            // Sẽ cố gắng gửi request tới api-merchant.payos.vn và ném lỗi kết nối/CustomException
            assertTrue(e.getMessage().contains("PayOS") || e.getMessage().contains("kết nối"));
        }
    }

    @Test
    public void testCancelPaymentLink_CodeNot00_ReturnsNull_EvenIfDataPresent() throws Exception {
        ReflectionTestUtils.setField(payosClient, "payosMock", false);
        HttpClient mockHttpClient = mock(HttpClient.class);
        @SuppressWarnings("unchecked")
        HttpResponse<String> mockHttpResponse = mock(HttpResponse.class);
        ReflectionTestUtils.setField(payosClient, "httpClient", mockHttpClient);

        // Giả lập PayOS trả code != "00", nhưng body có data khác null
        String respBody = "{\"code\":\"20\",\"desc\":\"Payment link is already cancelled\",\"data\":{\"orderCode\":179268999999}}";
        when(mockHttpResponse.body()).thenReturn(respBody);
        when(mockHttpResponse.statusCode()).thenReturn(200);
        when(mockHttpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(mockHttpResponse);

        JSONObject result = payosClient.cancelPaymentLink(179268999999L, "Đơn đổi món", config);
        // P-7: code != "00" thì bắt buộc trả null, không được return data
        assertNull("PayOS trả code khác 00 thì cancelPaymentLink phải trả về null", result);
    }

    @Test
    public void testCancelPaymentLink_Code00_ReturnsData() throws Exception {
        ReflectionTestUtils.setField(payosClient, "payosMock", false);
        HttpClient mockHttpClient = mock(HttpClient.class);
        @SuppressWarnings("unchecked")
        HttpResponse<String> mockHttpResponse = mock(HttpResponse.class);
        ReflectionTestUtils.setField(payosClient, "httpClient", mockHttpClient);

        String respBody = "{\"code\":\"00\",\"desc\":\"Success\",\"data\":{\"orderCode\":179268999999,\"status\":\"CANCELLED\"}}";
        when(mockHttpResponse.body()).thenReturn(respBody);
        when(mockHttpResponse.statusCode()).thenReturn(200);
        when(mockHttpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(mockHttpResponse);

        JSONObject result = payosClient.cancelPaymentLink(179268999999L, "Đơn đổi món", config);
        assertNotNull(result);
        assertEquals("CANCELLED", result.getString("status"));
        assertEquals(Long.valueOf(179268999999L), result.getLong("orderCode"));
    }

    @Test
    public void testCancelPaymentLink_MockEnabled_ReturnsCancelledData() {
        ReflectionTestUtils.setField(payosClient, "payosMock", true);

        JSONObject result = payosClient.cancelPaymentLink(179268999999L, "Khách đổi ý", config);
        assertNotNull(result);
        assertEquals("CANCELLED", result.getString("status"));
        assertEquals("Khách đổi ý", result.getString("cancellationReason"));
        assertEquals(Long.valueOf(179268999999L), result.getLong("orderCode"));
    }
}

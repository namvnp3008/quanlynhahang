package com.linmour.system.service.impl;

import com.linmour.security.dtos.Result;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@RunWith(MockitoJUnitRunner.class)
public class PayosKeyValidatorImplTest {

    private PayosKeyValidatorImpl validator;

    @Mock
    private HttpClient mockHttpClient;

    @Mock
    private HttpResponse<String> mockResponse;

    @Before
    public void setUp() {
        validator = new PayosKeyValidatorImpl();
        validator.setHttpClient(mockHttpClient);
        validator.setPayosMock(false);
    }

    @Test
    public void testMockModeSkipsRealCall() {
        validator.setPayosMock(true);
        Result res = validator.validate("client", "api", "checksum");
        assertNotNull(res);
        assertEquals(Integer.valueOf(200), res.getCode());
        assertEquals("MOCK", res.getData());
        verifyNoInteractions(mockHttpClient);
    }

    @Test
    public void testMissingKeysReturns400() {
        Result res = validator.validate("", "api", "checksum");
        assertNotNull(res);
        assertEquals(Integer.valueOf(400), res.getCode());
        assertTrue(res.getMsg().contains("Thiếu clientId"));
    }

    @Test
    public void testPayosSuccessCreatesAndCancelsLink() throws Exception {
        when(mockResponse.statusCode()).thenReturn(200);
        when(mockResponse.body()).thenReturn("{\"code\":\"00\",\"desc\":\"Success\",\"data\":{}}");
        when(mockHttpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(mockResponse);

        Result res = validator.validate("c_id", "a_key", "c_key");
        assertNotNull(res);
        assertEquals(Integer.valueOf(200), res.getCode());
        assertEquals("SUCCESS", res.getData());
        // Verify both create and cancel requests were sent
        verify(mockHttpClient, times(2)).send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
    }

    @Test
    public void testPayosErrorReturns400WithPayosCode() throws Exception {
        when(mockResponse.statusCode()).thenReturn(200);
        when(mockResponse.body()).thenReturn("{\"code\":\"214\",\"desc\":\"Cổng thanh toán không tồn tại hoặc đã tạm dừng\"}");
        when(mockHttpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(mockResponse);

        Result res = validator.validate("c_id", "a_key", "c_key");
        assertNotNull(res);
        assertEquals(Integer.valueOf(400), res.getCode());
        assertTrue(res.getMsg().contains("Cổng thanh toán không tồn tại hoặc đã tạm dừng"));
        Map data = (Map) res.getData();
        assertNotNull(data);
        assertEquals("214", data.get("payosCode"));
    }

    @Test
    public void testConnectionExceptionReturns400() throws Exception {
        when(mockHttpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenThrow(new IOException("Connection timed out"));

        Result res = validator.validate("c_id", "a_key", "c_key");
        assertNotNull(res);
        assertEquals(Integer.valueOf(400), res.getCode());
        assertTrue(res.getMsg().contains("Không thể kết nối tới PayOS"));
        Map data = (Map) res.getData();
        assertNotNull(data);
        assertEquals("CONNECT_ERROR", data.get("payosCode"));
    }
}

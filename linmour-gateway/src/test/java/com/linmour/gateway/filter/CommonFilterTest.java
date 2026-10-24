package com.linmour.gateway.filter;

import org.junit.Test;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.*;

public class CommonFilterTest {

    @Test
    public void testCommonFilterStripsInternalTokenHeader() {
        CommonFilter filter = new CommonFilter();

        MockServerHttpRequest request = MockServerHttpRequest.get("/product/product/getProductPage")
                .header("Token", "1")
                .header("Shopid", "1")
                .header("X-Internal-Token", "fake-client-token")
                .build();

        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        AtomicReference<ServerWebExchange> capturedExchange = new AtomicReference<>();
        GatewayFilterChain chain = ex -> {
            capturedExchange.set(ex);
            return Mono.empty();
        };

        filter.filter(exchange, chain).block();

        assertNotNull("Exchange must be passed down chain", capturedExchange.get());
        HttpHeaders downstreamHeaders = capturedExchange.get().getRequest().getHeaders();

        assertFalse("Downstream request must NOT contain X-Internal-Token",
                downstreamHeaders.containsKey("X-Internal-Token"));
        assertTrue("Downstream request still contains Token",
                downstreamHeaders.containsKey("Token"));
        assertTrue("Downstream request still contains Shopid",
                downstreamHeaders.containsKey("Shopid"));
    }

    @Test
    public void testCommonFilterOverwritesSpoofedXForwardedForWithRealClientIp() {
        CommonFilter filter = new CommonFilter();

        MockServerHttpRequest request = MockServerHttpRequest.post("/system/merchant/login")
                .header("X-Forwarded-For", "203.0.113.195, 70.41.3.18") // Spoofed client IP
                .remoteAddress(new java.net.InetSocketAddress("192.168.1.100", 54321))
                .build();

        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        AtomicReference<ServerWebExchange> capturedExchange = new AtomicReference<>();
        GatewayFilterChain chain = ex -> {
            capturedExchange.set(ex);
            return Mono.empty();
        };

        filter.filter(exchange, chain).block();

        assertNotNull("Exchange must be passed down chain", capturedExchange.get());
        HttpHeaders downstreamHeaders = capturedExchange.get().getRequest().getHeaders();

        assertEquals("Downstream request MUST contain the real remote address, not the client-spoofed IP",
                "192.168.1.100", downstreamHeaders.getFirst("X-Forwarded-For"));
    }

    @Test
    public void testCommonFilterBlocksInternalRoute() {
        CommonFilter filter = new CommonFilter();

        MockServerHttpRequest request = MockServerHttpRequest.get("/system/shop/internal/payos-config/1")
                .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        GatewayFilterChain chain = ex -> Mono.empty();
        filter.filter(exchange, chain).block();

        assertEquals(org.springframework.http.HttpStatus.NOT_FOUND, exchange.getResponse().getStatusCode());
    }
}

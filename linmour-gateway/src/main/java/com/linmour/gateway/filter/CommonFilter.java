package com.linmour.gateway.filter;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.InetSocketAddress;

/**
 * Global filter for Linmour Gateway:
 * - Xoá header X-Internal-Token khỏi mọi request đến từ client để ngăn chặn truy cập trái phép.
 * - Chặn không mở các route nội bộ /internal/** ra bên ngoài (trả 404).
 * - S1: Ghi đè header X-Forwarded-For bằng IP thật của client, không tin giá trị client tự gửi.
 */
@Component
public class CommonFilter implements GlobalFilter, Ordered {

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        // Chặn các route nội bộ không được mở ra ngoài qua Gateway
        if (exchange.getRequest().getURI().getPath().contains("/internal/")) {
            exchange.getResponse().setStatusCode(HttpStatus.NOT_FOUND);
            return exchange.getResponse().setComplete();
        }

        // Lấy IP thật của client từ kết nối mạng
        InetSocketAddress remoteAddress = exchange.getRequest().getRemoteAddress();
        String clientIp = "127.0.0.1";
        if (remoteAddress != null && remoteAddress.getAddress() != null) {
            clientIp = remoteAddress.getAddress().getHostAddress();
        }

        // Strip X-Internal-Token và ghi đè X-Forwarded-For bằng IP thật
        final String realClientIp = clientIp;
        ServerHttpRequest request = exchange.getRequest().mutate()
                .headers(httpHeaders -> {
                    httpHeaders.remove("X-Internal-Token");
                    httpHeaders.set("X-Forwarded-For", realClientIp);
                })
                .build();
        return chain.filter(exchange.mutate().request(request).build());
    }

    @Override
    public int getOrder() {
        return -100;
    }
}

package com.linmour.security.utils;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.linmour.security.dtos.Result;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.beans.BeansException;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationContextAware;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.lang.reflect.Method;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import java.util.function.BiFunction;

@Component
@Slf4j
public class TableQvResolver implements ApplicationContextAware {

    private static ApplicationContext applicationContext;
    private static BiFunction<Long, Long, String> testResolver;

    @Override
    public void setApplicationContext(ApplicationContext context) throws BeansException {
        applicationContext = context;
    }

    public static void setTestResolver(BiFunction<Long, Long, String> resolver) {
        testResolver = resolver;
    }

    /**
     * T-FIX-1: Xác minh qv của bàn (shopId, tableId) theo cơ chế FAIL-CLOSED:
     * 1. Kiểm tra cache Redis table:qv:<shopId>:<tableId>
     * 2. Nếu trượt cache (null): truy vấn DB (qua RestaurantTableService nếu cùng context, hoặc gọi API nội bộ linmour-restaurant)
     * 3. Ghi lại cache nếu tìm thấy
     * 4. Trả về qv hiện tại hoặc null nếu không tìm thấy bàn / lỗi
     */
    public static String resolveQv(Long shopId, Long tableId, RedisCache redisCache, String internalToken) {
        if (shopId == null || tableId == null) {
            return null;
        }

        // Test hook
        if (testResolver != null) {
            String testQv = testResolver.apply(shopId, tableId);
            if (testQv != null && redisCache != null) {
                try {
                    redisCache.setCacheObject("table:qv:" + shopId + ":" + tableId, testQv, 24, TimeUnit.HOURS);
                } catch (Exception ignored) {}
            }
            return testQv;
        }

        // 1. Kiểm tra Redis cache
        if (redisCache != null) {
            try {
                Object cached = redisCache.getCacheObject("table:qv:" + shopId + ":" + tableId);
                if (cached != null && StringUtils.isNotBlank(String.valueOf(cached))) {
                    return String.valueOf(cached).trim();
                }
            } catch (Exception e) {
                log.warn("Lỗi đọc cache table:qv cho {}:{}: {}", shopId, tableId, e.getMessage());
            }
        }

        // 2. Trượt cache: Đọc từ DB (cùng service) hoặc gọi HTTP nội bộ tới linmour-restaurant
        String resolvedQv = null;

        // 2a. Nếu đang chạy trong linmour-restaurant (có bean restaurantTableServiceImpl)
        if (applicationContext != null) {
            try {
                if (applicationContext.containsBean("restaurantTableServiceImpl")) {
                    Object service = applicationContext.getBean("restaurantTableServiceImpl");
                    Method method = service.getClass().getMethod("getInternalTableQv", Long.class, Long.class);
                    Object res = method.invoke(service, shopId, tableId);
                    if (res instanceof Result) {
                        Result r = (Result) res;
                        if (Integer.valueOf(200).equals(r.getCode()) && r.getData() != null) {
                            resolvedQv = String.valueOf(r.getData());
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("Lỗi gọi local getInternalTableQv cho {}:{}: {}", shopId, tableId, e.getMessage());
            }
        }

        // 2b. Nếu chưa lấy được, gọi API nội bộ tới linmour-restaurant
        if (resolvedQv == null) {
            resolvedQv = fetchFromRestaurantApi(shopId, tableId, internalToken);
        }

        // 3. Nếu tìm thấy qv từ DB, lưu lại vào Redis cache
        if (resolvedQv != null && redisCache != null) {
            try {
                redisCache.setCacheObject("table:qv:" + shopId + ":" + tableId, resolvedQv, 24, TimeUnit.HOURS);
            } catch (Exception e) {
                log.warn("Lỗi ghi lại cache table:qv cho {}:{}: {}", shopId, tableId, e.getMessage());
            }
        }

        return resolvedQv;
    }

    private static String fetchFromRestaurantApi(Long shopId, Long tableId, String token) {
        String baseUrl = "http://127.0.0.1:12803";
        if (applicationContext != null) {
            try {
                org.springframework.cloud.client.discovery.DiscoveryClient dc =
                    applicationContext.getBean(org.springframework.cloud.client.discovery.DiscoveryClient.class);
                if (dc != null) {
                    java.util.List<org.springframework.cloud.client.ServiceInstance> instances = dc.getInstances("linmour-restaurant");
                    if (instances != null && !instances.isEmpty()) {
                        org.springframework.cloud.client.ServiceInstance inst = instances.get(0);
                        baseUrl = "http://" + inst.getHost() + ":" + inst.getPort();
                    }
                }
            } catch (Exception ignored) {}
        }
        String urlStr = baseUrl + "/restaurant/table/internal/qv/" + shopId + "/" + tableId;

        try {
            URL url = new URL(urlStr);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(2500);
            conn.setReadTimeout(2500);
            if (token != null && !token.trim().isEmpty()) {
                conn.setRequestProperty("Token", "1");
                conn.setRequestProperty("X-Internal-Token", token.trim());
            }

            int code = conn.getResponseCode();
            if (code == 200) {
                try (InputStream is = conn.getInputStream();
                     BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        sb.append(line);
                    }
                    JSONObject json = JSON.parseObject(sb.toString());
                    if (json != null && Integer.valueOf(200).equals(json.getInteger("code"))) {
                        return json.getString("data");
                    }
                }
            } else {
                log.warn("fetchFromRestaurantApi trả mã HTTP {}: {}", code, urlStr);
            }
        } catch (Exception e) {
            log.warn("fetchFromRestaurantApi thất bại cho {}:{}: {}", shopId, tableId, e.getMessage());
        }
        return null;
    }
}

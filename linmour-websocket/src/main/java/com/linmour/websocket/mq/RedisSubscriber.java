package com.linmour.websocket.mq;

import com.linmour.dataAnaly.pojo.Do.ProductSummaryDay;
import com.linmour.security.utils.RedisCache;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import javax.annotation.Resource;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static com.linmour.websocket.ws.WebSocketServer.sendInfo;

@Component
@Slf4j
public class RedisSubscriber implements MessageListener {

    @Resource
    private RedisCache a;

    //注入为空
    public static RedisCache redisCache;

    @PostConstruct
    public void b() {
        redisCache = this.a;
    }


    @Override
    public void onMessage(Message message, byte[] pattern) {
        if (message == null || message.getBody() == null) {
            return;
        }
        String rawBody = new String(message.getBody(), java.nio.charset.StandardCharsets.UTF_8).trim();
        if (rawBody.startsWith("\"") && rawBody.endsWith("\"") && rawBody.length() >= 2) {
            rawBody = rawBody.substring(1, rawBody.length() - 1).trim();
        }
        String shopId = rawBody;
        Map<String, Object> map = new HashMap<>();
        Map<String, Object> allHash = redisCache != null ? redisCache.getAllHash("dataAnaly:orderSummaryDay:" + shopId) : null;
        if (allHash == null) {
            allHash = new HashMap<>();
        }
        Map<String, Object> allHash1 = redisCache != null ? redisCache.getAllHash("dataAnaly:productSummaryDay:" + shopId) : null;
        List<ProductSummaryDay> productSummaryDays = new ArrayList<>();
        if (allHash1 != null) {
            for (Map.Entry<String, Object> entry : allHash1.entrySet()) {
                ProductSummaryDay productSummaryDay = new ProductSummaryDay();
                productSummaryDay.setName(entry.getKey());
                if (entry.getValue() instanceof Number) {
                    productSummaryDay.setNum(((Number) entry.getValue()).intValue());
                } else if (entry.getValue() != null) {
                    try {
                        productSummaryDay.setNum(Integer.parseInt(entry.getValue().toString()));
                    } catch (NumberFormatException ignored) {}
                }
                productSummaryDays.add(productSummaryDay);
            }
        }
        List<String> s = new ArrayList<>();
        s.add("晚餐");
        s.add("深夜");
        s.add("午餐");
        s.add("早餐");
        List<Map<String, Object>> list = new ArrayList<>();
        s.forEach(m -> {
            Map<String, Object> allHash2 = redisCache != null ? redisCache.getAllHash("dataAnaly:orderSummaryTimePeriod:" + shopId + ":" + m) : null;
            list.add(allHash2 != null ? allHash2 : new HashMap<>());
        });
        map.put("orderSummaryDay", allHash);
        map.put("productSummaryDay", productSummaryDays);
        map.put("timePeriodMap", list);
        try {
            sendInfo(map, shopId);
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
        // 处理收到的消息
        log.debug("Received message for shopId {}: {}", shopId, map);
    }
}
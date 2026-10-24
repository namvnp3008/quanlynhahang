package com.linmour.websocket.mq;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.linmour.websocket.ws.WebSocketServer;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;

/**
 * Lắng nghe kênh Redis 'payos_mismatch' để đẩy cảnh báo WebSocket tới admin (Story P-1)
 * Payload format:
 * {"shopId":1,"msg":"payosMismatch","data":{"tableId":"8","orderCode":179268908575,"paidAmount":25000,"dueAmount":60000}}
 */
@Component
@Slf4j
public class PayosMismatchSubscriber implements MessageListener {

    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            if (message == null || message.getBody() == null) {
                return;
            }
            String body = new String(message.getBody(), StandardCharsets.UTF_8).trim();
            log.debug("PayosMismatchSubscriber received raw message: {}", body);
            if (StringUtils.isBlank(body)) {
                return;
            }

            Object parsed = JSON.parse(body);
            JSONObject json;
            if (parsed instanceof String) {
                json = JSONObject.parseObject((String) parsed);
            } else if (parsed instanceof JSONObject) {
                json = (JSONObject) parsed;
            } else {
                json = JSONObject.parseObject(body);
            }

            String shopId = json.getString("shopId");
            if (StringUtils.isBlank(shopId)) {
                log.warn("PayosMismatch message missing shopId: {}", body);
                return;
            }

            JSONObject wsMsg = new JSONObject();
            wsMsg.put("msg", json.getString("msg") != null ? json.getString("msg") : "payosMismatch");
            wsMsg.put("data", json.get("data"));

            WebSocketServer.sendInfo(wsMsg, shopId);
            log.info("PayosMismatchSubscriber successfully pushed to admin shop {}: {}", shopId, wsMsg);
        } catch (Exception e) {
            log.error("PayosMismatchSubscriber exception: ", e);
        }
    }
}

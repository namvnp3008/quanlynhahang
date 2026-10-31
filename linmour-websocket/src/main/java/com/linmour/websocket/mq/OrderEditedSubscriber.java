package com.linmour.websocket.mq;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.linmour.websocket.ws.AppWebSocketServer;
import com.linmour.websocket.ws.WebSocketServer;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;

/**
 * OE-3: Chủ quán sửa đơn đang mở → báo cho bàn (khách) và admin / bếp của quán:
 * {"msg":"orderEdited","data":{"tableId","orderId","version","payAmount","payosCancelled"}}
 */
@Component
@Slf4j
public class OrderEditedSubscriber implements MessageListener {

    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            String body = new String(message.getBody(), StandardCharsets.UTF_8).trim();
            if (StringUtils.isBlank(body)) {
                return;
            }
            Object parsed = JSON.parse(body);
            JSONObject json = parsed instanceof String ? JSONObject.parseObject((String) parsed)
                    : parsed instanceof JSONObject ? (JSONObject) parsed : JSONObject.parseObject(body);

            Long shopId = json.getLong("shopId");
            String tableId = json.getString("tableId");
            if (shopId == null || StringUtils.isBlank(tableId)) {
                log.warn("Invalid order_edited payload missing fields: {}", body);
                return;
            }

            JSONObject data = new JSONObject();
            data.put("tableId", tableId);
            data.put("orderId", json.getString("orderId"));
            data.put("version", json.getLong("version"));
            data.put("payAmount", json.getBigDecimal("payAmount"));
            data.put("payosCancelled", json.getBooleanValue("payosCancelled"));
            JSONObject wsMsg = new JSONObject();
            wsMsg.put("msg", "orderEdited");
            wsMsg.put("data", data);

            AppWebSocketServer.AppSendInfo(wsMsg, AppWebSocketServer.getShopTableKey(String.valueOf(shopId), tableId), null, false);
            WebSocketServer.sendInfo(wsMsg, String.valueOf(shopId));
        } catch (Exception e) {
            log.error("OrderEditedSubscriber exception: ", e);
        }
    }
}

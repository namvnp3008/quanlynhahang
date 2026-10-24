package com.linmour.websocket.mq;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.linmour.websocket.ws.AppWebSocketServer;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

@Component
@Slf4j
public class TablePaidSubscriber implements MessageListener {

    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            String body = new String(message.getBody(), StandardCharsets.UTF_8).trim();
            log.debug("TablePaidSubscriber received raw message: {}", body);
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

            Long shopId = json.getLong("shopId");
            String tableId = json.getString("tableId");
            String orderId = json.getString("orderId");
            Integer payType = json.getInteger("payType");

            if (shopId == null || StringUtils.isBlank(tableId)) {
                log.warn("Invalid table_paid payload missing shopId or tableId: {}", body);
                return;
            }

            String shopTableKey = AppWebSocketServer.getShopTableKey(String.valueOf(shopId), tableId);

            // 1. Prepare WebSocket message: {"msg":"paid","data":{"orderId":"...","payType":4,...}}
            JSONObject wsMsg = new JSONObject();
            wsMsg.put("msg", "paid");
            JSONObject data = new JSONObject();
            data.put("orderId", orderId != null ? orderId : "");
            data.put("payType", payType != null ? payType : 4);
            if (json.containsKey("payAmount")) {
                data.put("payAmount", json.get("payAmount"));
            }
            if (json.containsKey("tableName")) {
                data.put("tableName", json.getString("tableName"));
            }
            if (json.containsKey("shopName")) {
                data.put("shopName", json.getString("shopName"));
            }
            if (json.containsKey("paidAt")) {
                data.put("paidAt", json.getString("paidAt"));
            }
            if (json.containsKey("items")) {
                data.put("items", json.getJSONArray("items"));
            }
            wsMsg.put("data", data);

            // 2. Broadcast to all connections on this table
            AppWebSocketServer.AppSendInfo(wsMsg, shopTableKey, null, false);

            // 3. Clear table cart history (like ClearHandler)
            AppWebSocketServer.getRecordMap().remove(shopTableKey);

            // 4. Reset createOrder flag for all connections of this table
            ConcurrentHashMap<String, List<AppWebSocketServer>> webSocketMap = AppWebSocketServer.getWebSocketMap();
            if (webSocketMap.containsKey(shopTableKey)) {
                List<AppWebSocketServer> serverList = webSocketMap.get(shopTableKey);
                if (serverList != null) {
                    serverList.forEach(server -> server.getCreateOrder().set(false));
                }
            }

            log.debug("TablePaidSubscriber successfully processed table_paid for shopTableKey: {}", shopTableKey);
        } catch (Exception e) {
            log.error("TablePaidSubscriber exception: ", e);
        }
    }
}

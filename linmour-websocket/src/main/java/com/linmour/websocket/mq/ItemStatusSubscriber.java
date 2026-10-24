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

@Component
@Slf4j
public class ItemStatusSubscriber implements MessageListener {

    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            String body = new String(message.getBody(), StandardCharsets.UTF_8).trim();
            log.debug("ItemStatusSubscriber received raw message: {}", body);
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
            Long index = json.getLong("index");
            Integer status = json.getInteger("status");

            if (shopId == null || StringUtils.isBlank(tableId) || index == null || status == null) {
                log.warn("Invalid item_status payload missing fields: {}", body);
                return;
            }

            String shopTableKey = AppWebSocketServer.getShopTableKey(String.valueOf(shopId), tableId);

            // Broadcast to all connections on this table: {"msg":"itemStatus","data":{"index":0,"status":2}}
            JSONObject wsMsg = new JSONObject();
            wsMsg.put("msg", "itemStatus");
            JSONObject data = new JSONObject();
            data.put("index", index);
            data.put("status", status);
            wsMsg.put("data", data);

            AppWebSocketServer.AppSendInfo(wsMsg, shopTableKey, null, false);
            log.debug("ItemStatusSubscriber successfully broadcast itemStatus for shopTableKey {}: {}", shopTableKey, wsMsg);
        } catch (Exception e) {
            log.error("ItemStatusSubscriber exception: ", e);
        }
    }
}

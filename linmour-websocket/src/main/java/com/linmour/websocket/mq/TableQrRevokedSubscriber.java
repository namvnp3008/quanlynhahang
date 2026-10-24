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
public class TableQrRevokedSubscriber implements MessageListener {

    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            String body = new String(message.getBody(), StandardCharsets.UTF_8).trim();
            if (StringUtils.isBlank(body)) {
                return;
            }

            Object parsed = JSON.parse(body);
            if (parsed instanceof String) {
                parsed = JSON.parse((String) parsed);
            }
            if (!(parsed instanceof JSONObject)) {
                log.warn("table_qr_revoked message không phải JSONObject: {}", body);
                return;
            }
            JSONObject json = (JSONObject) parsed;
            Long shopId = json.getLong("shopId");
            Long tableId = json.getLong("tableId");

            log.info("Nhận event table_qr_revoked cho shopId={}, tableId={}", shopId, tableId);
            AppWebSocketServer.closeTableSessions(shopId, tableId, 4401, "Mã QR đã được thay mới, vui lòng quét lại");
        } catch (Exception e) {
            log.error("Lỗi xử lý table_qr_revoked message: {}", e.getMessage());
        }
    }
}

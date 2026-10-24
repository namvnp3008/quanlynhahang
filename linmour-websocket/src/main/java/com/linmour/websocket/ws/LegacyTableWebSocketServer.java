package com.linmour.websocket.ws;

import com.linmour.websocket.config.WebSocketCustomEncoding;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.websocket.CloseReason;
import javax.websocket.OnClose;
import javax.websocket.OnError;
import javax.websocket.OnMessage;
import javax.websocket.OnOpen;
import javax.websocket.Session;
import javax.websocket.server.PathParam;
import javax.websocket.server.ServerEndpoint;

@ServerEndpoint(value = "/websocket/shop/{shopId}/table/{tableId}", encoders = WebSocketCustomEncoding.class)
@Component
@Slf4j
public class LegacyTableWebSocketServer extends AppWebSocketServer {

    @OnOpen
    public void onOpen(Session session, @PathParam("tableId") String tableId, @PathParam("shopId") String shopId) {
        if (!allowRawTableIdsStatic) {
            java.util.List<String> tokens = session.getRequestParameterMap().get("t");
            String t = (tokens != null && !tokens.isEmpty()) ? tokens.get(0) : null;
            if (t == null || t.trim().isEmpty()) {
                log.warn("LegacyTableWebSocketServer: từ chối kết nối raw ID khi allow-raw-table-ids=false: shop={}, table={}", shopId, tableId);
                try {
                    session.close(new CloseReason(() -> 4401, "Raw table IDs not allowed. Use /websocket/table?t=..."));
                } catch (Exception ignored) {}
                return;
            }
        }

        handleOpen(session, tableId, shopId);
    }

    @OnClose
    public void onClose() {
        handleClose();
    }

    @OnMessage
    public void onMessage(String message, Session session) {
        handleMessage(message, session);
    }

    @OnError
    public void onError(Session session, Throwable error) {
        handleError(session, error);
    }
}

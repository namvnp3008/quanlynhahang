package com.linmour.websocket.ws;

import com.linmour.security.utils.TableTokenUtil;
import com.linmour.websocket.config.WebSocketCustomEncoding;
import io.jsonwebtoken.Claims;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.websocket.CloseReason;
import javax.websocket.OnClose;
import javax.websocket.OnError;
import javax.websocket.OnMessage;
import javax.websocket.OnOpen;
import javax.websocket.Session;
import javax.websocket.server.ServerEndpoint;
import java.util.List;

@ServerEndpoint(value = "/websocket/table", encoders = WebSocketCustomEncoding.class)
@Component
@Slf4j
public class TableWebSocketServer extends AppWebSocketServer {

    @OnOpen
    public void onOpen(Session session) {
        List<String> tokens = session.getRequestParameterMap().get("t");
        String t = (tokens != null && !tokens.isEmpty()) ? tokens.get(0) : null;
        if (t == null || t.trim().isEmpty()) {
            log.warn("TableWebSocketServer: thiếu tham số 't'");
            try {
                session.close(new CloseReason(() -> 4401, "Missing table token"));
            } catch (Exception ignored) {}
            return;
        }

        try {
            Claims claims = TableTokenUtil.parseTableAccessToken(t.trim());
            Long sid = claims.get("sid", Number.class).longValue();
            Long tid = claims.get("tid", Number.class).longValue();
            String qv = claims.get("qv", String.class);

            // T-FIX-1: Kiểm tra qv theo cơ chế FAIL-CLOSED khi trượt cache
            String internalToken = com.linmour.security.filter.TokenOncePerRequestFilter.internalToken;
            String currentQv = com.linmour.security.utils.TableQvResolver.resolveQv(sid, tid, getRedisCacheStatic(), internalToken);
            if (currentQv == null || !currentQv.equals(qv)) {
                log.warn("TableWebSocketServer: qv không hợp lệ hoặc đã đổi cho bàn {}:{}", sid, tid);
                session.close(new CloseReason(() -> 4401, "Mã QR đã được thay mới, vui lòng quét lại"));
                return;
            }

            handleOpen(session, String.valueOf(tid), String.valueOf(sid));
        } catch (Throwable e) {
            log.warn("TableWebSocketServer token error: {}", e.getMessage());
            try {
                session.close(new CloseReason(() -> 4401, "Invalid or expired table token"));
            } catch (Exception ignored) {}
        }
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

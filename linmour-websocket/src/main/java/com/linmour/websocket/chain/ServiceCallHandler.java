package com.linmour.websocket.chain;

import com.alibaba.fastjson.JSONObject;
import com.linmour.websocket.feign.OrderFeign;
import com.linmour.websocket.ws.AppWebSocketServer;
import com.linmour.websocket.ws.WebSocketServer;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.websocket.Session;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Xử lý yêu cầu gọi nhân viên từ khách (Story B2)
 * Payload nhận: {"serviceCall": "<nội dung>"}
 * Thông báo admin: {"msg":"serviceCall","data":{"tableId":"3","content":"...","time":"2026-10-21T14:30:00"}}
 * Phản hồi người gửi: "Đã gửi yêu cầu tới nhân viên"
 * Chống spam: tối đa 1 yêu cầu / 5 giây trên mỗi kết nối
 */
@Slf4j
@Component
public class ServiceCallHandler extends Handler {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    @Override
    public void handleRequest(ConcurrentHashMap<String, List<AppWebSocketServer>> webSocketMap,
                              JSONObject jsonObject,
                              ConcurrentHashMap<String, List<JSONObject>> recordMap,
                              AppWebSocketServer webSocket, OrderFeign orderFeign, Session session) throws IOException {

        if (jsonObject.containsKey("serviceCall")) {
            long now = System.currentTimeMillis();
            if (now - webSocket.getLastServiceCallTime() < 5000) {
                webSocket.sendMessage("Bạn vừa gửi yêu cầu, vui lòng đợi giây lát");
                return;
            }
            webSocket.setLastServiceCallTime(now);

            String content = jsonObject.getString("serviceCall");
            if (content == null) {
                content = "";
            }
            if (content.length() > 200) {
                content = content.substring(0, 200);
            }

            JSONObject adminMsg = new JSONObject();
            adminMsg.put("msg", "serviceCall");
            JSONObject data = new JSONObject();
            data.put("tableId", webSocket.getTableId() != null ? webSocket.getTableId() : "");
            data.put("content", content);
            data.put("time", LocalDateTime.now().format(TIME_FORMATTER));
            adminMsg.put("data", data);

            String shopId = webSocket.getShopId();
            try {
                WebSocketServer.sendInfo(adminMsg, shopId);
            } catch (Exception e) {
                log.error("Gửi thông báo gọi nhân viên tới admin shop {} thất bại: ", shopId, e);
            }

            webSocket.sendMessage("Đã gửi yêu cầu tới nhân viên");
        } else {
            if (nextHandler != null) {
                nextHandler.handleRequest(webSocketMap, jsonObject, recordMap, webSocket, orderFeign, session);
            }
        }
    }
}

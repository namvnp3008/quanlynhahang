package com.linmour.websocket.chain;

import com.alibaba.fastjson.JSONObject;
import com.linmour.websocket.feign.OrderFeign;
import com.linmour.websocket.ws.AppWebSocketServer;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Component;

import javax.websocket.Session;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

//处理前端初次扫码同步购物车
@Component
public class SyncHandler extends Handler {

    @Override
    public void handleRequest(ConcurrentHashMap<String, List<AppWebSocketServer>> webSocketMap,
                              JSONObject jsonObject,
                              ConcurrentHashMap<String, List<JSONObject>> recordMap,
                              AppWebSocketServer webSocket, OrderFeign orderFeign, Session session) throws IOException {
        if (jsonObject.containsKey("sync")) {
            String shopTableKey = webSocket.getShopTableKey();
            List<JSONObject> recordList = recordMap.get(shopTableKey);
            if (recordList == null) {
                recordList = new ArrayList<>();
                recordMap.put(shopTableKey, recordList);
            }
            //指定发送对象
            if (StringUtils.isNotBlank(webSocket.getTableId()) && webSocketMap.containsKey(shopTableKey)) {
                List<AppWebSocketServer> serverList = webSocketMap.get(shopTableKey);
                if (serverList != null) {
                    for (AppWebSocketServer server : serverList) {
                        //发送给请求同步的人
                        if (server.getSession() != null && server.getSession().getId().equals(session.getId())) {
                            server.sendMessage(recordList);
                        }
                    }
                }
            }
            webSocket.getSync().set(!webSocket.getSync().get());
        } else {
            // 无法处理，传递给下一个处理器
            if (nextHandler != null) {
                nextHandler.handleRequest(webSocketMap, jsonObject, recordMap, webSocket, orderFeign, session);
            }
        }
    }
}

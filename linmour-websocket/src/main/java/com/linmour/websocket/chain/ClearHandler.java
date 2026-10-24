package com.linmour.websocket.chain;

import com.alibaba.fastjson.JSONObject;
import com.linmour.websocket.feign.OrderFeign;
import com.linmour.websocket.ws.AppWebSocketServer;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Component;

import javax.websocket.Session;
import java.io.IOException;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

//处理前端订单已完成，把订单标志位置为false
@Component
public class ClearHandler extends Handler {

    @Override
    public void handleRequest(ConcurrentHashMap<String, List<AppWebSocketServer>> webSocketMap,
                              JSONObject jsonObject,
                              ConcurrentHashMap<String, List<JSONObject>> recordMap,
                              AppWebSocketServer webSocket, OrderFeign orderFeign, Session session) throws IOException {
        if (jsonObject.containsKey("clear")) {
            String shopTableKey = webSocket.getShopTableKey();
            // 清理本桌订单记录
            if (StringUtils.isNotBlank(webSocket.getTableId())) {
                recordMap.remove(shopTableKey);
            }
            if (StringUtils.isNotBlank(webSocket.getTableId()) && webSocketMap.containsKey(shopTableKey)) {
                List<AppWebSocketServer> serverList = webSocketMap.get(shopTableKey);
                //遍历所有对象，把订单都改为未提交，为了下一次点餐
                serverList.forEach(m -> m.getCreateOrder().set(false));
            }
        } else {
            // 无法处理，传递给下一个处理器
            if (nextHandler != null) {
                nextHandler.handleRequest(webSocketMap, jsonObject, recordMap, webSocket, orderFeign, session);
            }
        }
    }
}

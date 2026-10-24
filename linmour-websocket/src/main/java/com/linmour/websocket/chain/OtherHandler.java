package com.linmour.websocket.chain;

import com.alibaba.fastjson.JSONObject;
import com.linmour.websocket.feign.OrderFeign;
import com.linmour.websocket.ws.AppWebSocketServer;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Component;

import javax.websocket.Session;
import java.io.IOException;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

import static com.linmour.websocket.ws.AppWebSocketServer.AppSendInfo;

//兜底处理器
@Component
@Slf4j
public class OtherHandler extends Handler {
    @Override
    public void handleRequest(ConcurrentHashMap<String, List<AppWebSocketServer>> webSocketMap,
                              JSONObject jsonObject,
                              ConcurrentHashMap<String, List<JSONObject>> recordMap,
                              AppWebSocketServer webSocket, OrderFeign orderFeign, Session session) throws IOException {

        String shopTableKey = webSocket.getShopTableKey();
        //传送给对应shopTableKey用户的websocket
        if (StringUtils.isNotBlank(webSocket.getTableId()) && webSocketMap.containsKey(shopTableKey)) {
            AppSendInfo("1", shopTableKey, null, false);
        } else {
            log.debug("请求的shopTableKey: {} 不在该服务器上", shopTableKey);
        }
    }
}

package com.linmour.websocket.mq;

import com.alibaba.fastjson.JSONObject;
import com.linmour.websocket.ws.AppWebSocketServer;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.connection.DefaultMessage;

import javax.websocket.RemoteEndpoint;
import javax.websocket.Session;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class ItemStatusSubscriberTest {

    private ItemStatusSubscriber subscriber;

    @Before
    public void setUp() {
        subscriber = new ItemStatusSubscriber();
        AppWebSocketServer.getRecordMap().clear();
        AppWebSocketServer.getWebSocketMap().clear();
    }

    @After
    public void tearDown() {
        AppWebSocketServer.getRecordMap().clear();
        AppWebSocketServer.getWebSocketMap().clear();
    }

    @Test
    public void testItemStatusSubscriberBroadcastsToTableClients() throws Exception {
        String shopId = "1";
        String tableId = "6";
        String shopTableKey = shopId + ":" + tableId;

        // Setup mock WebSocket client
        AppWebSocketServer wsServer = new AppWebSocketServer();
        wsServer.setShopId(shopId);
        wsServer.setTableId(tableId);

        Session session = mock(Session.class);
        when(session.getId()).thenReturn("sess-001");
        RemoteEndpoint.Basic basic = mock(RemoteEndpoint.Basic.class);
        when(session.getBasicRemote()).thenReturn(basic);
        wsServer.setSession(session);

        AppWebSocketServer.getWebSocketMap().put(shopTableKey, new ArrayList<>(Collections.singletonList(wsServer)));

        // Send Redis message on item_status
        JSONObject payload = new JSONObject();
        payload.put("shopId", 1);
        payload.put("tableId", "6");
        payload.put("index", 0);
        payload.put("status", 2);

        DefaultMessage redisMsg = new DefaultMessage(
                "item_status".getBytes(StandardCharsets.UTF_8),
                payload.toJSONString().getBytes(StandardCharsets.UTF_8)
        );

        subscriber.onMessage(redisMsg, null);

        // Verify message was sent to client WebSocket
        ArgumentCaptor<Object> msgCaptor = ArgumentCaptor.forClass(Object.class);
        verify(basic).sendObject(msgCaptor.capture());

        Object sent = msgCaptor.getValue();
        assertNotNull(sent);
        JSONObject sentJson = (JSONObject) sent;
        assertEquals("itemStatus", sentJson.getString("msg"));
        JSONObject data = sentJson.getJSONObject("data");
        assertNotNull(data);
        assertEquals(Long.valueOf(0), data.getLong("index"));
        assertEquals(Integer.valueOf(2), data.getInteger("status"));
    }
}

package com.linmour.websocket.mq;

import com.alibaba.fastjson.JSONObject;
import com.linmour.websocket.ws.AppWebSocketServer;
import com.linmour.websocket.ws.WebSocketServer;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.connection.DefaultMessage;

import javax.websocket.RemoteEndpoint;
import javax.websocket.Session;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class OrderEditedSubscriberTest {

    private OrderEditedSubscriber subscriber;

    @Before
    public void setUp() {
        subscriber = new OrderEditedSubscriber();
        AppWebSocketServer.getRecordMap().clear();
        AppWebSocketServer.getWebSocketMap().clear();
        WebSocketServer.getWebSocketMap().clear();
    }

    @After
    public void tearDown() {
        AppWebSocketServer.getRecordMap().clear();
        AppWebSocketServer.getWebSocketMap().clear();
        WebSocketServer.getWebSocketMap().clear();
    }

    private static RemoteEndpoint.Basic mockSession(Object ws, String id) {
        Session session = mock(Session.class);
        when(session.getId()).thenReturn(id);
        RemoteEndpoint.Basic basic = mock(RemoteEndpoint.Basic.class);
        when(session.getBasicRemote()).thenReturn(basic);
        if (ws instanceof AppWebSocketServer) {
            ((AppWebSocketServer) ws).setSession(session);
        } else {
            ((WebSocketServer) ws).setSession(session);
        }
        return basic;
    }

    @Test
    public void broadcastsOrderEditedToTableAndAdmin() throws Exception {
        AppWebSocketServer tableWs = new AppWebSocketServer();
        tableWs.setShopId("1");
        tableWs.setTableId("5");
        RemoteEndpoint.Basic tableRemote = mockSession(tableWs, "table-sess");
        AppWebSocketServer.getWebSocketMap().put("1:5", new ArrayList<>(Collections.singletonList(tableWs)));

        WebSocketServer adminWs = new WebSocketServer();
        adminWs.setShopId("1");
        RemoteEndpoint.Basic adminRemote = mockSession(adminWs, "admin-sess");
        WebSocketServer.getWebSocketMap().put("1", adminWs);

        JSONObject payload = new JSONObject();
        payload.put("shopId", 1);
        payload.put("tableId", "5");
        payload.put("orderId", "9001");
        payload.put("version", 4);
        payload.put("payAmount", new BigDecimal("165000"));
        payload.put("payosCancelled", true);

        subscriber.onMessage(new DefaultMessage("order_edited".getBytes(StandardCharsets.UTF_8),
                payload.toJSONString().getBytes(StandardCharsets.UTF_8)), null);

        for (RemoteEndpoint.Basic remote : new RemoteEndpoint.Basic[]{tableRemote, adminRemote}) {
            ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
            verify(remote).sendObject(captor.capture());
            JSONObject sent = (JSONObject) captor.getValue();
            assertEquals("orderEdited", sent.getString("msg"));
            JSONObject data = sent.getJSONObject("data");
            assertEquals("5", data.getString("tableId"));
            assertEquals(Long.valueOf(4), data.getLong("version"));
            assertEquals(0, new BigDecimal("165000").compareTo(data.getBigDecimal("payAmount")));
            assertTrue(data.getBooleanValue("payosCancelled"));
        }
    }

    @Test
    public void ignoresPayloadWithoutTable() throws Exception {
        WebSocketServer adminWs = new WebSocketServer();
        adminWs.setShopId("1");
        RemoteEndpoint.Basic adminRemote = mockSession(adminWs, "admin-sess");
        WebSocketServer.getWebSocketMap().put("1", adminWs);

        subscriber.onMessage(new DefaultMessage("order_edited".getBytes(StandardCharsets.UTF_8),
                "{\"shopId\":1}".getBytes(StandardCharsets.UTF_8)), null);

        verify(adminRemote, never()).sendObject(any());
    }
}

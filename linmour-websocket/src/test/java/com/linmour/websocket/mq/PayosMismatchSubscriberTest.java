package com.linmour.websocket.mq;

import com.alibaba.fastjson.JSONObject;
import com.linmour.websocket.ws.WebSocketServer;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.connection.DefaultMessage;

import javax.websocket.RemoteEndpoint;
import javax.websocket.Session;
import java.nio.charset.StandardCharsets;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class PayosMismatchSubscriberTest {

    private PayosMismatchSubscriber subscriber;

    @Before
    public void setUp() {
        subscriber = new PayosMismatchSubscriber();
        WebSocketServer.getWebSocketMap().clear();
    }

    @After
    public void tearDown() {
        WebSocketServer.getWebSocketMap().clear();
    }

    @Test
    public void testPayosMismatchSubscriberPushesToAdminWebSocket() throws Exception {
        String shopId = "1";

        // Setup mock admin WebSocket connection
        WebSocketServer adminWs = new WebSocketServer();
        adminWs.setShopId(shopId);

        Session session = mock(Session.class);
        when(session.getId()).thenReturn("admin-sess-001");
        RemoteEndpoint.Basic basic = mock(RemoteEndpoint.Basic.class);
        when(session.getBasicRemote()).thenReturn(basic);
        adminWs.setSession(session);

        WebSocketServer.getWebSocketMap().put(shopId, adminWs);

        // Prepare mismatch payload
        JSONObject payload = new JSONObject();
        payload.put("shopId", 1);
        payload.put("msg", "payosMismatch");
        JSONObject data = new JSONObject();
        data.put("tableId", "8");
        data.put("orderCode", 179268908575L);
        data.put("paidAmount", 25000);
        data.put("dueAmount", 60000);
        payload.put("data", data);

        DefaultMessage redisMsg = new DefaultMessage(
                "payos_mismatch".getBytes(StandardCharsets.UTF_8),
                payload.toJSONString().getBytes(StandardCharsets.UTF_8)
        );

        subscriber.onMessage(redisMsg, null);

        // Verify message was delivered to admin session
        ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
        verify(basic, times(1)).sendObject(captor.capture());

        Object sent = captor.getValue();
        assertNotNull(sent);
        assertTrue(sent instanceof JSONObject);
        JSONObject sentJson = (JSONObject) sent;
        assertEquals("payosMismatch", sentJson.getString("msg"));
        JSONObject sentData = sentJson.getJSONObject("data");
        assertEquals("8", sentData.getString("tableId"));
        assertEquals(Long.valueOf(179268908575L), sentData.getLong("orderCode"));
        assertEquals(Integer.valueOf(25000), sentData.getInteger("paidAmount"));
        assertEquals(Integer.valueOf(60000), sentData.getInteger("dueAmount"));
    }
}

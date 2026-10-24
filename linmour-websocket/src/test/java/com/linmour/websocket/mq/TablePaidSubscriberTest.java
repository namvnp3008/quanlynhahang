package com.linmour.websocket.mq;

import com.alibaba.fastjson.JSONObject;
import com.linmour.websocket.ws.AppWebSocketServer;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.springframework.data.redis.connection.DefaultMessage;

import javax.websocket.RemoteEndpoint;
import javax.websocket.Session;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class TablePaidSubscriberTest {

    private TablePaidSubscriber subscriber;

    @Before
    public void setUp() {
        subscriber = new TablePaidSubscriber();
        AppWebSocketServer.getRecordMap().clear();
        AppWebSocketServer.getWebSocketMap().clear();
    }

    @After
    public void tearDown() {
        AppWebSocketServer.getRecordMap().clear();
        AppWebSocketServer.getWebSocketMap().clear();
    }

    @Test
    public void testTablePaidSubscriberBroadcastsAndClearsCart() throws Exception {
        String shopId = "1";
        String tableId = "6";
        String shopTableKey = shopId + ":" + tableId;

        // Seed recordMap with some cart item
        JSONObject cartItem = new JSONObject();
        cartItem.put("productId", 1);
        cartItem.put("name", "Phở Bò");
        AppWebSocketServer.getRecordMap().put(shopTableKey, new ArrayList<>(Collections.singletonList(cartItem)));

        // Setup mock WebSocket client
        AppWebSocketServer wsServer = new AppWebSocketServer();
        wsServer.setShopId(shopId);
        wsServer.setTableId(tableId);
        wsServer.getCreateOrder().set(true); // order in progress

        Session session = mock(Session.class);
        when(session.getId()).thenReturn("sess-001");
        RemoteEndpoint.Basic basic = mock(RemoteEndpoint.Basic.class);
        when(session.getBasicRemote()).thenReturn(basic);
        wsServer.setSession(session);

        AppWebSocketServer.getWebSocketMap().put(shopTableKey, new ArrayList<>(Collections.singletonList(wsServer)));

        // Send Redis message on table_paid (BUG-TY-1-B: full payload)
        JSONObject payload = new JSONObject();
        payload.put("shopId", 1);
        payload.put("tableId", "6");
        payload.put("orderId", "order-abc");
        payload.put("payType", 4);
        payload.put("payAmount", 25000);
        payload.put("tableName", "Bàn 06");
        payload.put("shopName", "Nhà Hàng Bếp Việt");
        payload.put("paidAt", "2026-10-24T13:29:00");

        com.alibaba.fastjson.JSONArray items = new com.alibaba.fastjson.JSONArray();
        JSONObject it1 = new JSONObject();
        it1.put("name", "Cà Phê Sữa Đá Sài Gòn");
        it1.put("quantity", 1);
        it1.put("price", 25000);
        it1.put("propsText", "Ít đá");
        items.add(it1);
        payload.put("items", items);

        DefaultMessage redisMsg = new DefaultMessage(
                "table_paid".getBytes(StandardCharsets.UTF_8),
                payload.toJSONString().getBytes(StandardCharsets.UTF_8)
        );

        subscriber.onMessage(redisMsg, null);

        // 1. Verify recordMap was cleared
        assertFalse(AppWebSocketServer.getRecordMap().containsKey(shopTableKey));

        // 2. Verify createOrder flag was reset to false
        assertFalse(wsServer.getCreateOrder().get());

        // 3. Verify message was sent to client WebSocket with all BUG-TY-1 fields
        org.mockito.ArgumentCaptor<JSONObject> captor = org.mockito.ArgumentCaptor.forClass(JSONObject.class);
        verify(basic).sendObject(captor.capture());
        JSONObject sent = captor.getValue();
        assertEquals("paid", sent.getString("msg"));
        JSONObject data = sent.getJSONObject("data");
        assertNotNull(data);
        assertEquals("order-abc", data.getString("orderId"));
        assertEquals(Integer.valueOf(4), data.getInteger("payType"));
        assertEquals(Integer.valueOf(25000), data.getInteger("payAmount"));
        assertEquals("Bàn 06", data.getString("tableName"));
        assertEquals("Nhà Hàng Bếp Việt", data.getString("shopName"));
        assertEquals("2026-10-24T13:29:00", data.getString("paidAt"));
        com.alibaba.fastjson.JSONArray sentItems = data.getJSONArray("items");
        assertNotNull(sentItems);
        assertEquals(1, sentItems.size());
        assertEquals("Cà Phê Sữa Đá Sài Gòn", sentItems.getJSONObject(0).getString("name"));
        assertEquals("Ít đá", sentItems.getJSONObject(0).getString("propsText"));
    }
}

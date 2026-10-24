package com.linmour.websocket.mq;

import com.alibaba.fastjson.JSONObject;
import com.linmour.websocket.ws.AppWebSocketServer;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.springframework.data.redis.connection.DefaultMessage;

import javax.websocket.CloseReason;
import javax.websocket.Session;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import static org.mockito.Mockito.*;

public class TableQrRevokedSubscriberTest {

    private TableQrRevokedSubscriber subscriber;

    @Before
    public void setUp() {
        subscriber = new TableQrRevokedSubscriber();
        AppWebSocketServer.getWebSocketMap().clear();
    }

    @After
    public void tearDown() {
        AppWebSocketServer.getWebSocketMap().clear();
    }

    @Test
    public void testTableQrRevokedClosesMatchingTableSessionsWithQuotedJson() throws Exception {
        Session session = mock(Session.class);
        AppWebSocketServer server = new AppWebSocketServer();
        server.setShopId("1");
        server.setTableId("6");
        server.setSession(session);

        List<AppWebSocketServer> list = new ArrayList<>();
        list.add(server);
        AppWebSocketServer.getWebSocketMap().put("1:6", list);

        // Quoted JSON string as published by RedisTemplate with string serialization
        String quotedJson = "\"{\\\"shopId\\\":1,\\\"tableId\\\":6}\"";
        DefaultMessage message = new DefaultMessage("table_qr_revoked".getBytes(StandardCharsets.UTF_8), quotedJson.getBytes(StandardCharsets.UTF_8));

        subscriber.onMessage(message, null);

        verify(session).close(argThat((CloseReason cr) -> cr.getCloseCode().getCode() == 4401));
    }

    @Test
    public void testTableQrRevokedClosesMatchingTableSessionsWithRawJson() throws Exception {
        Session session = mock(Session.class);
        AppWebSocketServer server = new AppWebSocketServer();
        server.setShopId("1");
        server.setTableId("6");
        server.setSession(session);

        List<AppWebSocketServer> list = new ArrayList<>();
        list.add(server);
        AppWebSocketServer.getWebSocketMap().put("1:6", list);

        JSONObject obj = new JSONObject();
        obj.put("shopId", 1L);
        obj.put("tableId", 6L);
        DefaultMessage message = new DefaultMessage("table_qr_revoked".getBytes(StandardCharsets.UTF_8), obj.toJSONString().getBytes(StandardCharsets.UTF_8));

        subscriber.onMessage(message, null);

        verify(session).close(argThat((CloseReason cr) -> cr.getCloseCode().getCode() == 4401));
    }
}

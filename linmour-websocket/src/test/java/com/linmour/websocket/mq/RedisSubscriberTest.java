package com.linmour.websocket.mq;

import com.alibaba.fastjson.JSONObject;
import com.linmour.dataAnaly.pojo.Do.ProductSummaryDay;
import com.linmour.security.utils.RedisCache;
import com.linmour.websocket.ws.WebSocketServer;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.connection.DefaultMessage;

import javax.websocket.RemoteEndpoint;
import javax.websocket.Session;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

public class RedisSubscriberTest {

    private RedisSubscriber subscriber;
    private RedisCache redisCacheMock;

    @Before
    public void setUp() {
        subscriber = new RedisSubscriber();
        redisCacheMock = mock(RedisCache.class);
        RedisSubscriber.redisCache = redisCacheMock;
        WebSocketServer.getWebSocketMap().clear();
    }

    @After
    public void tearDown() {
        WebSocketServer.getWebSocketMap().clear();
    }

    @Test
    public void testOnMessageWithRawShopId() throws Exception {
        String shopId = "1";

        // Setup mock WebSocketServer for shopId "1"
        WebSocketServer wsServer = new WebSocketServer();
        wsServer.setShopId(shopId);

        Session session = mock(Session.class);
        RemoteEndpoint.Basic basic = mock(RemoteEndpoint.Basic.class);
        when(session.getBasicRemote()).thenReturn(basic);
        wsServer.setSession(session);

        WebSocketServer.getWebSocketMap().put(shopId, wsServer);

        Map<String, Object> orderSummary = new HashMap<>();
        orderSummary.put("orderNum", 5);
        orderSummary.put("price", 250000);
        when(redisCacheMock.getAllHash("dataAnaly:orderSummaryDay:" + shopId)).thenReturn(orderSummary);

        Map<String, Object> prodSummary = new HashMap<>();
        prodSummary.put("Phở Bò", 3);
        when(redisCacheMock.getAllHash("dataAnaly:productSummaryDay:" + shopId)).thenReturn(prodSummary);

        DefaultMessage redisMsg = new DefaultMessage(
                "my_channel".getBytes(StandardCharsets.UTF_8),
                "1".getBytes(StandardCharsets.UTF_8)
        );

        subscriber.onMessage(redisMsg, null);

        ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
        verify(basic).sendObject(captor.capture());

        Object sent = captor.getValue();
        assertNotNull(sent);
        assertTrue(sent instanceof Map);
        @SuppressWarnings("unchecked")
        Map<String, Object> map = (Map<String, Object>) sent;
        assertEquals(orderSummary, map.get("orderSummaryDay"));
        @SuppressWarnings("unchecked")
        List<ProductSummaryDay> prods = (List<ProductSummaryDay>) map.get("productSummaryDay");
        assertNotNull(prods);
        assertEquals(1, prods.size());
        assertEquals("Phở Bò", prods.get(0).getName());
        assertEquals(Integer.valueOf(3), prods.get(0).getNum());
    }

    @Test
    public void testOnMessageWithJsonQuotedShopId() throws Exception {
        String shopId = "1";

        // Setup mock WebSocketServer for shopId "1" (WITHOUT quotes)
        WebSocketServer wsServer = new WebSocketServer();
        wsServer.setShopId(shopId);

        Session session = mock(Session.class);
        RemoteEndpoint.Basic basic = mock(RemoteEndpoint.Basic.class);
        when(session.getBasicRemote()).thenReturn(basic);
        wsServer.setSession(session);

        WebSocketServer.getWebSocketMap().put(shopId, wsServer);

        Map<String, Object> orderSummary = new HashMap<>();
        orderSummary.put("orderNum", 2);
        orderSummary.put("price", 100000);
        when(redisCacheMock.getAllHash("dataAnaly:orderSummaryDay:1")).thenReturn(orderSummary);

        // Redis message has quotes: "\"1\""
        DefaultMessage redisMsg = new DefaultMessage(
                "my_channel".getBytes(StandardCharsets.UTF_8),
                "\"1\"".getBytes(StandardCharsets.UTF_8)
        );

        subscriber.onMessage(redisMsg, null);

        // Verify that quotes were stripped, so it found the session for "1"
        ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
        verify(basic).sendObject(captor.capture());

        Object sent = captor.getValue();
        assertNotNull(sent);
        @SuppressWarnings("unchecked")
        Map<String, Object> map = (Map<String, Object>) sent;
        assertEquals(orderSummary, map.get("orderSummaryDay"));
    }
}

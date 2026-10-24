package com.linmour.websocket.chain;

import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.linmour.order.pojo.Dto.CreateOrderDto;
import com.linmour.security.dtos.Result;
import com.linmour.websocket.feign.OrderFeign;
import com.linmour.websocket.ws.AppWebSocketServer;
import org.junit.Before;
import org.junit.Test;
import org.mockito.Mockito;

import javax.websocket.RemoteEndpoint;
import javax.websocket.Session;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

public class HandlerTest {

    private ConcurrentHashMap<String, List<AppWebSocketServer>> webSocketMap;
    private ConcurrentHashMap<String, List<JSONObject>> recordMap;

    @Before
    public void setUp() {
        webSocketMap = new ConcurrentHashMap<>();
        recordMap = new ConcurrentHashMap<>();
        AppWebSocketServer.getWebSocketMap().clear();
        AppWebSocketServer.getRecordMap().clear();
    }

    @org.junit.After
    public void tearDown() {
        AppWebSocketServer.getWebSocketMap().clear();
        AppWebSocketServer.getRecordMap().clear();
    }

    private Session createMockSession(String id) throws Exception {
        Session session = mock(Session.class);
        when(session.getId()).thenReturn(id);
        RemoteEndpoint.Basic basic = mock(RemoteEndpoint.Basic.class);
        when(session.getBasicRemote()).thenReturn(basic);
        return session;
    }

    @Test
    public void testShopTableKeyIsolation() {
        AppWebSocketServer wsShop1 = new AppWebSocketServer();
        wsShop1.setShopId("1");
        wsShop1.setTableId("3");

        AppWebSocketServer wsShop2 = new AppWebSocketServer();
        wsShop2.setShopId("2");
        wsShop2.setTableId("3");

        assertEquals("1:3", wsShop1.getShopTableKey());
        assertEquals("2:3", wsShop2.getShopTableKey());
        assertNotEquals(wsShop1.getShopTableKey(), wsShop2.getShopTableKey());
    }

    @Test
    public void testSyncHandlerIsolatesCartBetweenShops() throws Exception {
        SyncHandler syncHandler = new SyncHandler();

        Session sessionShop1 = createMockSession("s1");
        AppWebSocketServer wsShop1 = new AppWebSocketServer();
        wsShop1.setShopId("1");
        wsShop1.setTableId("3");
        wsShop1.setSession(sessionShop1);

        Session sessionShop2 = createMockSession("s2");
        AppWebSocketServer wsShop2 = new AppWebSocketServer();
        wsShop2.setShopId("2");
        wsShop2.setTableId("3");
        wsShop2.setSession(sessionShop2);

        List<AppWebSocketServer> list1 = new ArrayList<>();
        list1.add(wsShop1);
        webSocketMap.put(wsShop1.getShopTableKey(), list1);

        List<AppWebSocketServer> list2 = new ArrayList<>();
        list2.add(wsShop2);
        webSocketMap.put(wsShop2.getShopTableKey(), list2);

        // Đưa dữ liệu giỏ vào shop 1
        ArrayList<JSONObject> cartShop1 = new ArrayList<>();
        JSONObject item1 = new JSONObject();
        item1.put("name", "Phở Bò");
        cartShop1.add(item1);
        recordMap.put(wsShop1.getShopTableKey(), cartShop1);

        // Shop 2 gửi sync
        JSONObject syncMsg = new JSONObject();
        syncMsg.put("sync", true);
        syncHandler.handleRequest(webSocketMap, syncMsg, recordMap, wsShop2, null, sessionShop2);

        // Giỏ của shop 2 phải rỗng, không bị ảnh hưởng bởi shop 1
        List<JSONObject> cartShop2 = recordMap.get(wsShop2.getShopTableKey());
        assertNotNull(cartShop2);
        assertTrue(cartShop2.isEmpty());
    }

    @Test
    public void testCreateOrderHandlerResetsFlagAndAllowsSecondOrder() throws Exception {
        CreateOrderHandler handler = new CreateOrderHandler();
        OrderFeign orderFeign = mock(OrderFeign.class);
        when(orderFeign.createOrder(any(CreateOrderDto.class))).thenReturn(Result.success("ok"));

        Session session = createMockSession("s1");
        AppWebSocketServer ws = new AppWebSocketServer();
        ws.setShopId("1");
        ws.setTableId("3");
        ws.setSession(session);

        List<AppWebSocketServer> serverList = new ArrayList<>();
        serverList.add(ws);
        webSocketMap.put(ws.getShopTableKey(), serverList);
        AppWebSocketServer.getWebSocketMap().put(ws.getShopTableKey(), serverList);

        JSONObject orderPayload = new JSONObject();
        orderPayload.put("createOrder", true);
        orderPayload.put("amount", "100000");
        orderPayload.put("remark", "Ít cay");
        orderPayload.put("orderItem", new JSONArray());

        // Đặt đơn lần 1
        handler.handleRequest(webSocketMap, orderPayload, recordMap, ws, orderFeign, session);

        // Cờ createOrder phải được reset về false
        assertFalse("createOrder flag must be false after first order", ws.getCreateOrder().get());

        // Đặt đơn lần 2 (gọi thêm món) phải thành công, không bị chặn
        handler.handleRequest(webSocketMap, orderPayload, recordMap, ws, orderFeign, session);
        assertFalse("createOrder flag must be false after second order", ws.getCreateOrder().get());
        verify(orderFeign, times(2)).createOrder(any(CreateOrderDto.class));
    }

    @Test
    public void testCreateOrderFailsDueToOutOfStockSendsVietnameseReason() throws Exception {
        CreateOrderHandler handler = new CreateOrderHandler();
        OrderFeign orderFeign = mock(OrderFeign.class);
        when(orderFeign.createOrder(any(CreateOrderDto.class)))
                .thenReturn(Result.error(400, "Món Bánh mì vỏ giòn (ổ) đã hết hàng"));

        Session session = createMockSession("s1");
        AppWebSocketServer ws = new AppWebSocketServer();
        ws.setShopId("1");
        ws.setTableId("6");
        ws.setSession(session);

        List<AppWebSocketServer> serverList = new ArrayList<>();
        serverList.add(ws);
        webSocketMap.put(ws.getShopTableKey(), serverList);
        AppWebSocketServer.getWebSocketMap().put(ws.getShopTableKey(), serverList);

        JSONObject orderPayload = new JSONObject();
        orderPayload.put("createOrder", true);
        orderPayload.put("amount", "25000");
        orderPayload.put("orderItem", new JSONArray());

        handler.handleRequest(webSocketMap, orderPayload, recordMap, ws, orderFeign, session);

        // Verify Vietnamese message sent, not Chinese string
        verify(session.getBasicRemote(), times(1)).sendObject("Món Bánh mì vỏ giòn (ổ) đã hết hàng");
        verify(session.getBasicRemote(), never()).sendObject("本桌订单提交失败");
        assertFalse("createOrder flag must be reset", ws.getCreateOrder().get());
    }

    @Test
    public void testConcurrentOrderBlockedWhenFlagIsTrue() throws Exception {
        CreateOrderHandler handler = new CreateOrderHandler();
        OrderFeign orderFeign = mock(OrderFeign.class);

        Session session1 = createMockSession("s1");
        AppWebSocketServer ws1 = new AppWebSocketServer();
        ws1.setShopId("1");
        ws1.setTableId("3");
        ws1.setSession(session1);

        Session session2 = createMockSession("s2");
        AppWebSocketServer ws2 = new AppWebSocketServer();
        ws2.setShopId("1");
        ws2.setTableId("3");
        ws2.setSession(session2);

        List<AppWebSocketServer> serverList = new ArrayList<>();
        serverList.add(ws1);
        serverList.add(ws2);
        webSocketMap.put(ws1.getShopTableKey(), serverList);

        // Giả lập ws1 đang tạo đơn (cờ createOrder = true)
        ws1.getCreateOrder().set(true);

        JSONObject orderPayload = new JSONObject();
        orderPayload.put("createOrder", true);
        orderPayload.put("amount", "50000");
        orderPayload.put("orderItem", new JSONArray());

        // ws2 gửi createOrder trong khi ws1 đang bận
        handler.handleRequest(webSocketMap, orderPayload, recordMap, ws2, orderFeign, session2);

        // ws2 phải nhận thông báo đang có người đặt và không gọi Feign
        verify(orderFeign, never()).createOrder(any(CreateOrderDto.class));
        verify(session2.getBasicRemote(), times(1)).sendObject("已有人提交订单，请稍后");
    }

    @Test
    public void testServiceCallSuccessAndNotifiesAdmin() throws Exception {
        ServiceCallHandler handler = new ServiceCallHandler();

        Session clientSession = createMockSession("client1");
        AppWebSocketServer ws = new AppWebSocketServer();
        ws.setShopId("1");
        ws.setTableId("3");
        ws.setSession(clientSession);

        // Giả lập admin WebSocketServer
        Session adminSession = createMockSession("admin1");
        com.linmour.websocket.ws.WebSocketServer adminServer = new com.linmour.websocket.ws.WebSocketServer();
        adminServer.setSession(adminSession);
        com.linmour.websocket.ws.WebSocketServer.getWebSocketMap().put("1", adminServer);

        JSONObject payload = new JSONObject();
        payload.put("serviceCall", "Xin thêm đá");

        handler.handleRequest(webSocketMap, payload, recordMap, ws, null, clientSession);

        // Khách nhận xác nhận
        verify(clientSession.getBasicRemote(), times(1)).sendObject("Đã gửi yêu cầu tới nhân viên");

        // Admin nhận thông báo đúng cấu trúc
        verify(adminSession.getBasicRemote(), times(1)).sendObject(argThat(msg -> {
            JSONObject obj = (JSONObject) msg;
            assertEquals("serviceCall", obj.getString("msg"));
            JSONObject data = obj.getJSONObject("data");
            assertNotNull(data);
            assertEquals("3", data.getString("tableId"));
            assertEquals("Xin thêm đá", data.getString("content"));
            assertNotNull(data.getString("time"));
            return true;
        }));
    }

    @Test
    public void testServiceCallTruncatesContentOver200Chars() throws Exception {
        ServiceCallHandler handler = new ServiceCallHandler();

        Session clientSession = createMockSession("client1");
        AppWebSocketServer ws = new AppWebSocketServer();
        ws.setShopId("1");
        ws.setTableId("3");
        ws.setSession(clientSession);

        Session adminSession = createMockSession("admin1");
        com.linmour.websocket.ws.WebSocketServer adminServer = new com.linmour.websocket.ws.WebSocketServer();
        adminServer.setSession(adminSession);
        com.linmour.websocket.ws.WebSocketServer.getWebSocketMap().put("1", adminServer);

        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 250; i++) {
            sb.append("A");
        }
        JSONObject payload = new JSONObject();
        payload.put("serviceCall", sb.toString());

        handler.handleRequest(webSocketMap, payload, recordMap, ws, null, clientSession);

        verify(adminSession.getBasicRemote(), times(1)).sendObject(argThat(msg -> {
            JSONObject obj = (JSONObject) msg;
            JSONObject data = obj.getJSONObject("data");
            assertEquals(200, data.getString("content").length());
            return true;
        }));
    }

    @Test
    public void testServiceCallRateLimitBlocksWithin5Seconds() throws Exception {
        ServiceCallHandler handler = new ServiceCallHandler();

        Session clientSession = createMockSession("client1");
        AppWebSocketServer ws = new AppWebSocketServer();
        ws.setShopId("1");
        ws.setTableId("3");
        ws.setSession(clientSession);

        Session adminSession = createMockSession("admin1");
        com.linmour.websocket.ws.WebSocketServer adminServer = new com.linmour.websocket.ws.WebSocketServer();
        adminServer.setSession(adminSession);
        com.linmour.websocket.ws.WebSocketServer.getWebSocketMap().put("1", adminServer);

        JSONObject payload = new JSONObject();
        payload.put("serviceCall", "Khăn lạnh");

        // Lần 1: Thành công
        handler.handleRequest(webSocketMap, payload, recordMap, ws, null, clientSession);
        verify(clientSession.getBasicRemote(), times(1)).sendObject("Đã gửi yêu cầu tới nhân viên");
        verify(adminSession.getBasicRemote(), times(1)).sendObject(any());

        // Lần 2 (ngay lập tức, < 5000ms): Bị từ chối
        handler.handleRequest(webSocketMap, payload, recordMap, ws, null, clientSession);
        verify(clientSession.getBasicRemote(), times(1)).sendObject("Bạn vừa gửi yêu cầu, vui lòng đợi giây lát");
        // Admin không nhận thêm thông báo nào
        verify(adminSession.getBasicRemote(), times(1)).sendObject(any());

        // Giả lập sau 5001ms: Thành công
        ws.setLastServiceCallTime(System.currentTimeMillis() - 5001L);
        handler.handleRequest(webSocketMap, payload, recordMap, ws, null, clientSession);
        verify(clientSession.getBasicRemote(), times(2)).sendObject("Đã gửi yêu cầu tới nhân viên");
        verify(adminSession.getBasicRemote(), times(2)).sendObject(any());
    }
}

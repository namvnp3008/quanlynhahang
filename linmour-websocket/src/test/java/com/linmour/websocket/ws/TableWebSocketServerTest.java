package com.linmour.websocket.ws;

import com.linmour.security.utils.TableTokenUtil;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import javax.websocket.CloseReason;
import javax.websocket.RemoteEndpoint;
import javax.websocket.Session;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

public class TableWebSocketServerTest {

    @BeforeAll
    public static void setUp() {
        TableTokenUtil.setTableTokenKey("0f3234500dfe527e4e786a6f5e8c8c5d4103e9bcbbf44301d9f19a8833f2ff61");
    }

    @Test
    public void testOnOpenWithValidToken() throws Exception {
        String token = TableTokenUtil.createTableAccessToken(1L, 3L, "7c1e9704");

        Session session = mock(Session.class);
        RemoteEndpoint.Basic basic = mock(RemoteEndpoint.Basic.class);
        when(session.getBasicRemote()).thenReturn(basic);

        Map<String, List<String>> paramMap = new HashMap<>();
        paramMap.put("t", Collections.singletonList(token));
        when(session.getRequestParameterMap()).thenReturn(paramMap);

        com.linmour.security.utils.TableQvResolver.setTestResolver((sid, tid) -> "7c1e9704");
        try {
            TableWebSocketServer server = new TableWebSocketServer();
            server.onOpen(session);

            // Verify sendMessage("1") called
            verify(basic).sendObject("1");
            // Verify session was NOT closed
            verify(session, never()).close(any(CloseReason.class));
            verify(session, never()).close();
        } finally {
            com.linmour.security.utils.TableQvResolver.setTestResolver(null);
        }
    }

    @Test
    public void testOnOpenWithMissingTokenCloses4401() throws Exception {
        Session session = mock(Session.class);
        when(session.getRequestParameterMap()).thenReturn(new HashMap<>());

        TableWebSocketServer server = new TableWebSocketServer();
        server.onOpen(session);

        verify(session).close(argThat((CloseReason cr) -> cr.getCloseCode().getCode() == 4401));
    }

    @Test
    public void testOnOpenWithInvalidTokenCloses4401() throws Exception {
        Session session = mock(Session.class);
        Map<String, List<String>> paramMap = new HashMap<>();
        paramMap.put("t", Collections.singletonList("invalid-token-xyz"));
        when(session.getRequestParameterMap()).thenReturn(paramMap);

        TableWebSocketServer server = new TableWebSocketServer();
        server.onOpen(session);

        verify(session).close(argThat((CloseReason cr) -> cr.getCloseCode().getCode() == 4401));
    }

    @Test
    public void testOnOpenWithCacheMissFailClosedWhenDbMismatches() throws Exception {
        String token = TableTokenUtil.createTableAccessToken(1L, 3L, "oldqv123");

        Session session = mock(Session.class);
        Map<String, List<String>> paramMap = new HashMap<>();
        paramMap.put("t", Collections.singletonList(token));
        when(session.getRequestParameterMap()).thenReturn(paramMap);

        com.linmour.security.utils.TableQvResolver.setTestResolver((sid, tid) -> "newqv456");
        try {
            TableWebSocketServer server = new TableWebSocketServer();
            server.onOpen(session);

            verify(session).close(argThat((CloseReason cr) -> cr.getCloseCode().getCode() == 4401));
        } finally {
            com.linmour.security.utils.TableQvResolver.setTestResolver(null);
        }
    }

    @Test
    public void testOnOpenWithCacheMissFailClosedWhenDbReturnsNull() throws Exception {
        String token = TableTokenUtil.createTableAccessToken(1L, 3L, "oldqv123");

        Session session = mock(Session.class);
        Map<String, List<String>> paramMap = new HashMap<>();
        paramMap.put("t", Collections.singletonList(token));
        when(session.getRequestParameterMap()).thenReturn(paramMap);

        com.linmour.security.utils.TableQvResolver.setTestResolver((sid, tid) -> null);
        try {
            TableWebSocketServer server = new TableWebSocketServer();
            server.onOpen(session);

            verify(session).close(argThat((CloseReason cr) -> cr.getCloseCode().getCode() == 4401));
        } finally {
            com.linmour.security.utils.TableQvResolver.setTestResolver(null);
        }
    }

    @Test
    public void testOnOpenWithCacheMissPassWhenDbMatches() throws Exception {
        String token = TableTokenUtil.createTableAccessToken(1L, 3L, "validqv");

        Session session = mock(Session.class);
        RemoteEndpoint.Basic basic = mock(RemoteEndpoint.Basic.class);
        when(session.getBasicRemote()).thenReturn(basic);

        Map<String, List<String>> paramMap = new HashMap<>();
        paramMap.put("t", Collections.singletonList(token));
        when(session.getRequestParameterMap()).thenReturn(paramMap);

        com.linmour.security.utils.TableQvResolver.setTestResolver((sid, tid) -> "validqv");
        try {
            TableWebSocketServer server = new TableWebSocketServer();
            server.onOpen(session);

            verify(basic).sendObject("1");
            verify(session, never()).close(any(CloseReason.class));
            verify(session, never()).close();
        } finally {
            com.linmour.security.utils.TableQvResolver.setTestResolver(null);
        }
    }
}

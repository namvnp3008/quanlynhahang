package com.linmour.websocket.feign;

import com.linmour.security.dtos.Result;
import com.linmour.websocket.WebsocketApplication;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.web.socket.server.standard.ServerEndpointExporter;

import javax.annotation.Resource;

import static org.junit.Assert.*;

@RunWith(SpringRunner.class)
@SpringBootTest(classes = WebsocketApplication.class, webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = {"server.port=0"})
public class OrderFeignIntegrationTest {

    @MockBean
    private ServerEndpointExporter serverEndpointExporter;

    @Resource
    private OrderFeign orderFeign;

    @org.junit.BeforeClass
    public static void checkIntegrationEnabled() {
        org.junit.Assume.assumeTrue("Integration test skipped without -Pintegration or -Dintegration.test=true",
                "true".equalsIgnoreCase(System.getProperty("integration.test")));
    }

    @Test
    public void testGetOrderInfoViaNacos() {
        assertNotNull("OrderFeign bean must be injected", orderFeign);
        Result result = orderFeign.getOrderInfo(6L);
        assertNotNull("Result from OrderFeign.getOrderInfo should not be null", result);
        assertEquals("Response code should be 200", Integer.valueOf(200), result.getCode());
    }
}

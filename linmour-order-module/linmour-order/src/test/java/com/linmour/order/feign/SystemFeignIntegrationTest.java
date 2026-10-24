package com.linmour.order.feign;

import com.linmour.order.OrderApplication;
import com.linmour.system.pojo.Do.Merchant;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.junit4.SpringRunner;

import javax.annotation.Resource;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.*;

@RunWith(SpringRunner.class)
@SpringBootTest(classes = OrderApplication.class, webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = {"server.port=0"})
public class SystemFeignIntegrationTest {

    @Resource
    private SystemFeign systemFeign;

    @org.junit.BeforeClass
    public static void checkIntegrationEnabled() {
        org.junit.Assume.assumeTrue("Integration test skipped without -Pintegration or -Dintegration.test=true",
                "true".equalsIgnoreCase(System.getProperty("integration.test")));
    }

    @Test
    public void testGetMerchantByIdsViaNacos() {
        assertNotNull("SystemFeign bean must be injected", systemFeign);
        List<Merchant> list = systemFeign.getMerchantByIds(Collections.singletonList(1L));
        assertNotNull("Merchant list should not be null", list);
        assertFalse("Merchant list should not be empty", list.isEmpty());
        assertEquals(Long.valueOf(1L), list.get(0).getId());
        assertEquals("林某", list.get(0).getRealName());
    }
}

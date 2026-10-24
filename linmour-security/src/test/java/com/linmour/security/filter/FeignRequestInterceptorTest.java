package com.linmour.security.filter;

import feign.RequestTemplate;
import org.junit.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Collection;
import java.util.Map;

import static org.junit.Assert.*;

public class FeignRequestInterceptorTest {

    @Test
    public void testApplyAddsTokenAndInternalTokenHeaders() {
        FeignRequestInterceptor interceptor = new FeignRequestInterceptor();
        ReflectionTestUtils.setField(interceptor, "internalToken", "secret-token-123");

        RequestTemplate template = new RequestTemplate();
        interceptor.apply(template);

        Map<String, Collection<String>> headers = template.headers();
        assertTrue("Headers must contain Token", headers.containsKey("Token"));
        assertTrue("Token must be 1", headers.get("Token").contains("1"));

        assertTrue("Headers must contain X-Internal-Token", headers.containsKey("X-Internal-Token"));
        assertTrue("X-Internal-Token must match configured value", headers.get("X-Internal-Token").contains("secret-token-123"));
    }

    @Test(expected = IllegalStateException.class)
    public void testValidateThrowsExceptionWhenInternalTokenMissing() {
        FeignRequestInterceptor interceptor = new FeignRequestInterceptor();
        ReflectionTestUtils.setField(interceptor, "internalToken", null);
        interceptor.validate();
    }

    @Test(expected = IllegalStateException.class)
    public void testValidateThrowsExceptionWhenInternalTokenEmpty() {
        FeignRequestInterceptor interceptor = new FeignRequestInterceptor();
        ReflectionTestUtils.setField(interceptor, "internalToken", "   ");
        interceptor.validate();
    }

    @Test
    public void testValidateSucceedsWhenInternalTokenProvided() {
        FeignRequestInterceptor interceptor = new FeignRequestInterceptor();
        ReflectionTestUtils.setField(interceptor, "internalToken", "secret-token-123");
        interceptor.validate();
    }
}

package com.linmour.security.utils;

import io.jsonwebtoken.Claims;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

import static org.junit.Assert.*;

public class JwtUtilTest {

    @Before
    public void setUp() {
        JwtUtil.setJwtKey("testSecretKey12345678901234567890");
    }

    @After
    public void tearDown() {
        JwtUtil.setJwtKey(null);
    }

    @Test
    public void testJwtGenerationAndParsingWithConfiguredKey() throws Exception {
        String token = JwtUtil.createJWT("user123");
        assertNotNull(token);

        Claims claims = JwtUtil.parseJWT(token);
        assertEquals("user123", claims.getSubject());
    }

    @Test(expected = IllegalStateException.class)
    public void testMissingJwtKeyThrowsIllegalStateException() {
        JwtUtil.setJwtKey(null);
        JwtUtil.createJWT("user123");
    }

    @Test
    public void testCustomJwtKeyConfiguration() throws Exception {
        JwtUtil.setJwtKey("customSecretKey98765432101234567");
        String token = JwtUtil.createJWT("admin456");
        assertNotNull(token);

        Claims claims = JwtUtil.parseJWT(token);
        assertEquals("admin456", claims.getSubject());
    }
}

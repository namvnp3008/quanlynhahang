package com.linmour.security.utils;

import org.junit.Test;

import static org.junit.Assert.*;

public class AesGcmUtilTest {

    private static final String MASTER_KEY = "test-master-secret-key-123456789";

    @Test
    public void testEncryptAndDecryptRoundTrip() {
        String original = "payos_client_id_secret_abc123";
        String encrypted = AesGcmUtil.encrypt(original, MASTER_KEY);
        assertNotNull(encrypted);
        assertNotEquals(original, encrypted);

        String decrypted = AesGcmUtil.decrypt(encrypted, MASTER_KEY);
        assertEquals(original, decrypted);
    }

    @Test
    public void testNullOrEmptyHandling() {
        assertNull(AesGcmUtil.encrypt(null, MASTER_KEY));
        assertNull(AesGcmUtil.encrypt("", MASTER_KEY));
        assertNull(AesGcmUtil.decrypt(null, MASTER_KEY));
        assertNull(AesGcmUtil.decrypt("", MASTER_KEY));
    }

    @Test(expected = RuntimeException.class)
    public void testDecryptWithWrongKeyThrowsException() {
        String original = "secret_data";
        String encrypted = AesGcmUtil.encrypt(original, MASTER_KEY);
        AesGcmUtil.decrypt(encrypted, "wrong-key-999999");
    }
}

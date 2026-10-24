package com.linmour.security.utils;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

public class PasswordPolicyUtilsTest {

    @Test
    void testIsWeakPassword() {
        // Null or blank
        assertTrue(PasswordPolicyUtils.isWeakPassword(null, "0901234567"));
        assertTrue(PasswordPolicyUtils.isWeakPassword("", "0901234567"));
        assertTrue(PasswordPolicyUtils.isWeakPassword("   ", "0901234567"));

        // Length < 8
        assertTrue(PasswordPolicyUtils.isWeakPassword("123", "0901234567"));
        assertTrue(PasswordPolicyUtils.isWeakPassword("123456", "0901234567"));
        assertTrue(PasswordPolicyUtils.isWeakPassword("abc1", "0901234567"));

        // In weak list
        assertTrue(PasswordPolicyUtils.isWeakPassword("12345678", "0901234567"));
        assertTrue(PasswordPolicyUtils.isWeakPassword("password", "0901234567"));
        assertTrue(PasswordPolicyUtils.isWeakPassword("PASSWORD", "0901234567"));
        assertTrue(PasswordPolicyUtils.isWeakPassword("11111111", "0901234567"));
        assertTrue(PasswordPolicyUtils.isWeakPassword("00000000", "0901234567"));

        // Matches phone
        assertTrue(PasswordPolicyUtils.isWeakPassword("0901234567", "0901234567"));

        // Only letters or only digits (>= 8 chars)
        assertTrue(PasswordPolicyUtils.isWeakPassword("abcdefgh", "0901234567"));
        assertTrue(PasswordPolicyUtils.isWeakPassword("98765432", "0901234567"));

        // Strong passwords (>= 8 chars, letters and digits)
        assertFalse(PasswordPolicyUtils.isWeakPassword("Admin12345", "0901234567"));
        assertFalse(PasswordPolicyUtils.isWeakPassword("pass1234", "0901234567"));
        assertFalse(PasswordPolicyUtils.isWeakPassword("Secure#99", "0901234567"));
    }

    @Test
    void testValidateNewPassword() {
        // Blank
        assertEquals("Mật khẩu mới không được để trống",
                PasswordPolicyUtils.validateNewPassword(null, "old123", "0901234567"));
        assertEquals("Mật khẩu mới không được để trống",
                PasswordPolicyUtils.validateNewPassword("   ", "old123", "0901234567"));

        // Length < 8
        assertEquals("Mật khẩu mới phải có ít nhất 8 ký tự",
                PasswordPolicyUtils.validateNewPassword("short1", "old123", "0901234567"));

        // Missing letters or digits
        assertEquals("Mật khẩu mới phải chứa cả chữ và số",
                PasswordPolicyUtils.validateNewPassword("abcdefghij", "old123", "0901234567"));
        assertEquals("Mật khẩu mới phải chứa cả chữ và số",
                PasswordPolicyUtils.validateNewPassword("1234567890", "old123", "0901234567"));

        // Same as old password
        assertEquals("Mật khẩu mới không được trùng với mật khẩu cũ",
                PasswordPolicyUtils.validateNewPassword("StrongPass1", "StrongPass1", "0901234567"));

        // Weak passwords (>= 8 chars)
        assertEquals("Mật khẩu mới phải chứa cả chữ và số",
                PasswordPolicyUtils.validateNewPassword("12345678", "old123", "0901234567"));
        assertEquals("Mật khẩu mới phải chứa cả chữ và số",
                PasswordPolicyUtils.validateNewPassword("password", "old123", "0901234567"));

        // Matches phone
        assertEquals("Mật khẩu mới phải chứa cả chữ và số",
                PasswordPolicyUtils.validateNewPassword("0901234567", "old123", "0901234567"));

        // Valid new password
        assertNull(PasswordPolicyUtils.validateNewPassword("NewSecurePass1", "old123", "0901234567"));
        assertNull(PasswordPolicyUtils.validateNewPassword("linmour2026", "old123", "0901234567"));
    }
}

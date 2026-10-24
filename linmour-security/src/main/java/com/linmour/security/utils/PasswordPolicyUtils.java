package com.linmour.security.utils;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * Tiện ích kiểm tra và thực thi chính sách mật khẩu (Sprint 9 - S2)
 * Quy định:
 * - Độ dài: >= 8 ký tự
 * - Có cả chữ và số
 * - Khác mật khẩu cũ
 * - Không thuộc danh sách yếu: 123, 123456, 12345678, password, 11111111, 00000000, SĐT chính tài khoản
 */
public class PasswordPolicyUtils {

    private static final Set<String> WEAK_PASSWORDS = new HashSet<>(Arrays.asList(
            "123",
            "123456",
            "12345678",
            "password",
            "11111111",
            "00000000"
    ));

    /**
     * Kiểm tra mật khẩu có thuộc diện mật khẩu yếu cần bắt buộc đổi hay không
     * (dùng khi đăng nhập để gán cờ mustChangePassword)
     */
    public static boolean isWeakPassword(String password, String phone) {
        if (password == null || password.trim().isEmpty()) {
            return true;
        }
        String p = password.trim();
        if (p.length() < 8) {
            return true;
        }
        if (WEAK_PASSWORDS.contains(p.toLowerCase())) {
            return true;
        }
        if (phone != null && !phone.trim().isEmpty() && p.equals(phone.trim())) {
            return true;
        }
        boolean hasLetter = p.chars().anyMatch(Character::isLetter);
        boolean hasDigit = p.chars().anyMatch(Character::isDigit);
        return !hasLetter || !hasDigit;
    }

    /**
     * Xác thực mật khẩu mới theo chính sách bảo mật
     * Trả về thông báo lỗi nếu không đạt, hoặc null nếu hợp lệ
     */
    public static String validateNewPassword(String newPassword, String oldPassword, String phone) {
        if (newPassword == null || newPassword.trim().isEmpty()) {
            return "Mật khẩu mới không được để trống";
        }
        String p = newPassword.trim();
        if (p.length() < 8) {
            return "Mật khẩu mới phải có ít nhất 8 ký tự";
        }
        boolean hasLetter = p.chars().anyMatch(Character::isLetter);
        boolean hasDigit = p.chars().anyMatch(Character::isDigit);
        if (!hasLetter || !hasDigit) {
            return "Mật khẩu mới phải chứa cả chữ và số";
        }
        if (oldPassword != null && p.equals(oldPassword.trim())) {
            return "Mật khẩu mới không được trùng với mật khẩu cũ";
        }
        if (WEAK_PASSWORDS.contains(p.toLowerCase()) || (phone != null && !phone.trim().isEmpty() && p.equals(phone.trim()))) {
            return "Mật khẩu quá yếu hoặc không an toàn";
        }
        return null;
    }
}

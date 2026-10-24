package com.linmour.security.exception.enums;

public enum AppHttpCodeEnum {
    SUCCESS(200,"Thành công"),

    ERROR(204,"Thao tác thất bại"),
    NEED_LOGIN(401,"Cần đăng nhập để tiếp tục"),
    TOKEN_ERROR(402,"Mã xác thực không hợp lệ"),
    NO_OPERATOR_AUTH(403,"Không có quyền thực hiện"),
    REQUEST_ERROR(499,"Phương thức yêu cầu không hợp lệ"),


    SYSTEM_ERROR(500,"Đã xảy ra lỗi, vui lòng thử lại"),
    USERNAME_EXIST(501,"Tên đăng nhập đã tồn tại"),
    PHONENUMBER_EXIST(502,"Số điện thoại đã được đăng ký"),
    INVALID_PHONE_NUMBER(516, "Số điện thoại không hợp lệ"),
    PASSWORD_TOO_SHORT(517, "Mật khẩu phải có ít nhất 6 ký tự"),
    OLD_PASSWORD_ERROR(518, "Mật khẩu cũ không chính xác"),
    REQUIRE_OLD_PASSWORD(519, "Vui lòng nhập mật khẩu cũ"),
    EMAIL_EXIST(503, "Email đã tồn tại"),
    REQUIRE_USERNAME(504, "Bắt buộc nhập tên đăng nhập"),
    LOGIN_ERROR(505,"Tên đăng nhập hoặc mật khẩu không chính xác"),
    CONTENT_NOT_NULL(506,"Nội dung không được để trống"),
    FILE_TYPE_ERROR(507,"Định dạng tệp không hợp lệ"),
    USERNAME_NOT_NULL(508, "Tên đăng nhập không được để trống"),
    NICKNAME_NOT_NULL(509, "Biệt danh không được để trống"),
    PASSWORD_NOT_NULL(510, "Mật khẩu không được để trống"),
    EMAIL_NOT_NULL(511, "Email không được để trống"),
    NICKNAME_EXIST(512, "Biệt danh đã tồn tại"),
    ACCOUNT_DISABLE(513,"Tài khoản đã bị vô hiệu hóa"),
    ARAUMENT_ERROR(514,"Tham số không hợp lệ"),
    PARAM_ERROR(514,"Tham số không hợp lệ"),
    OCR_ERRER(515,"Nhận diện hình ảnh thất bại"),
    LOGOUT_ERROR(603,"Đăng xuất thất bại"),

    USERINFO_ERROR(1000,"Lấy thông tin người dùng thất bại"),
    SHOP_ERRPR(1001, "Lấy danh sách quán thất bại"),
    PRODUCT_ERROR(1002,"Lấy thông tin món thất bại"),
    ORDER_ITEM_NOT_NULL(80401,"Danh sách món trong đơn không được để trống");


    int code;
    String msg;

    AppHttpCodeEnum(int code, String errorMessage){
        this.code = code;
        this.msg = errorMessage;
    }

    public int getCode() {
        return code;
    }

    public String getMsg() {
        return msg;
    }
}


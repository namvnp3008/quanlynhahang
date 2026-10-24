package com.linmour.security.exception;

import com.linmour.security.dtos.Result;
import org.junit.Test;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.Assert.*;

public class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    public void testCustomExceptionStandardHttpStatus400SetsResponseStatus400() {
        MockHttpServletResponse response = new MockHttpServletResponse();
        CustomException ex = new CustomException(400, "Yêu cầu không hợp lệ");

        Result result = handler.exception(ex, response);

        assertNotNull(result);
        assertEquals(400, result.getCode().intValue());
        assertEquals("Yêu cầu không hợp lệ", result.getMsg());
        assertEquals(400, response.getStatus());
    }

    @Test
    public void testCustomExceptionStandardHttpStatus403SetsResponseStatus403() {
        MockHttpServletResponse response = new MockHttpServletResponse();
        CustomException ex = new CustomException(403, "Bạn không có quyền");

        Result result = handler.exception(ex, response);

        assertNotNull(result);
        assertEquals(403, result.getCode().intValue());
        assertEquals("Bạn không có quyền", result.getMsg());
        assertEquals(403, response.getStatus());
    }

    @Test
    public void testCustomExceptionBusinessCode514KeepsResponseStatus200() {
        MockHttpServletResponse response = new MockHttpServletResponse();
        CustomException ex = new CustomException(514, "Bàn chưa có đơn để thanh toán");

        Result result = handler.exception(ex, response);

        assertNotNull(result);
        assertEquals(514, result.getCode().intValue());
        assertEquals("Bàn chưa có đơn để thanh toán", result.getMsg());
        assertEquals(200, response.getStatus());
    }

    @Test
    public void testCustomExceptionBusinessCode518KeepsResponseStatus200() {
        MockHttpServletResponse response = new MockHttpServletResponse();
        CustomException ex = new CustomException(518, "Lỗi nghiệp vụ đặt hàng");

        Result result = handler.exception(ex, response);

        assertNotNull(result);
        assertEquals(518, result.getCode().intValue());
        assertEquals("Lỗi nghiệp vụ đặt hàng", result.getMsg());
        assertEquals(200, response.getStatus());
    }
}

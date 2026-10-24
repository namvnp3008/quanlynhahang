package com.linmour.security.exception;

import com.linmour.security.dtos.Result;
import com.linmour.security.exception.enums.AppHttpCodeEnum;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.validation.BindException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.RestControllerAdvice;

//控制器增强类
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    /**
     * 处理不可控异常
     * @param e
     * @return
     */
    @ExceptionHandler(Exception.class)
    @ResponseBody
    public Result exception(Exception e){
        log.error("Unhandled exception: ", e);

        return Result.error(AppHttpCodeEnum.SYSTEM_ERROR);
    }

    //密码错误
    @ExceptionHandler(BadCredentialsException.class)
    @ResponseBody
    public Result exception(BadCredentialsException e){
        log.error("BadCredentialsException: {}", e.getMessage());

        return Result.error(AppHttpCodeEnum.LOGIN_ERROR);
    }
    //请求方式不对
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    @ResponseBody
    public Result exception(HttpRequestMethodNotSupportedException e){
        log.error("HttpRequestMethodNotSupportedException: {}", e.getMessage());

        return Result.error(AppHttpCodeEnum.REQUEST_ERROR);
    }
    //请求参数不对
    @ExceptionHandler(BindException.class)
    @ResponseBody
    public Result exception(BindException e){
        log.error("BindException: {}", e.getMessage());


        return Result.error(AppHttpCodeEnum.ARAUMENT_ERROR);
    }

    private static final java.util.Set<Integer> STANDARD_HTTP_STATUSES = new java.util.HashSet<>(
            java.util.Arrays.asList(400, 401, 403, 404, 409, 429)
    );

    /**
     * 处理可控异常  自定义异常
     * @param e
     * @return
     */
    @ExceptionHandler(CustomException.class)
    @ResponseBody
    public Result exception(CustomException e, javax.servlet.http.HttpServletResponse response){
        if (response != null && STANDARD_HTTP_STATUSES.contains(e.getCode())) {
            response.setStatus(e.getCode());
        }
        if (e.getExceptionEnum() != null) {
            return Result.error(e.getExceptionEnum());
        }
        return Result.error(e.getCode(), e.getCustomMsg());
    }
}

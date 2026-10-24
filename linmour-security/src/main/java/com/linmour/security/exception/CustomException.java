package com.linmour.security.exception;

import com.linmour.security.exception.enums.AppHttpCodeEnum;

public class CustomException extends RuntimeException {

    private AppHttpCodeEnum appHttpCodeEnum;
    private int code;
    private String customMsg;

    public CustomException(AppHttpCodeEnum appHttpCodeEnum){
        super(appHttpCodeEnum != null ? appHttpCodeEnum.getMsg() : "");
        this.appHttpCodeEnum = appHttpCodeEnum;
        if (appHttpCodeEnum != null) {
            this.code = appHttpCodeEnum.getCode();
            this.customMsg = appHttpCodeEnum.getMsg();
        }
    }

    public CustomException(int code, String customMsg) {
        super(customMsg);
        this.code = code;
        this.customMsg = customMsg;
    }

    public AppHttpCodeEnum getExceptionEnum() {
        return appHttpCodeEnum;
    }

    public int getCode() {
        return code;
    }

    public String getCustomMsg() {
        return customMsg;
    }
}

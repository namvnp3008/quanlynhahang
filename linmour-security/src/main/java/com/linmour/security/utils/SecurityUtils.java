package com.linmour.security.utils;


import com.linmour.security.dtos.LoginUser;
import org.springframework.security.core.context.SecurityContextHolder;

public class SecurityUtils {

    private static final ThreadLocal<Long> SHOP_ID_HOLDER = new ThreadLocal<>();
    private static final ThreadLocal<Long> TABLE_ID_HOLDER = new ThreadLocal<>();
    private static final ThreadLocal<String> TABLE_TOKEN_HOLDER = new ThreadLocal<>();

    public static LoginUser getLoginUser() {
        if (SecurityContextHolder.getContext().getAuthentication() == null || "anonymousUser".equals(SecurityContextHolder.getContext().getAuthentication().getPrincipal())){
            return null;
        }
        Object principal = SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        if (principal instanceof LoginUser) {
            return (LoginUser) principal;
        }
        return null;
    }

    public static String getJti() {
        LoginUser user = getLoginUser();
        return user != null ? user.getJti() : null;
    }

    public static Long getUserId(){
        LoginUser user = getLoginUser();
        if (user != null && user.getLoginVo() != null) {
            return user.getLoginVo().getId();
        }
        return 0L;
    }

    public static Integer getUserType() {
        LoginUser user = getLoginUser();
        if (user != null && user.getLoginVo() != null) {
            return user.getLoginVo().getType();
        }
        return null;
    }

    public static Long getShopId() {
        if (!a()){
            LoginUser user = getLoginUser();
            if (user != null && user.getLoginVo() != null && user.getLoginVo().getShopId() != null) {
                return user.getLoginVo().getShopId();
            }
        }
        Long sId = SHOP_ID_HOLDER.get();
        return sId != null ? sId : 0L;
    }

    public static void setShopId(Long i) {
        if (i == null) {
            SHOP_ID_HOLDER.remove();
        } else {
            SHOP_ID_HOLDER.set(i);
        }
    }

    public static void clearShopId() {
        SHOP_ID_HOLDER.remove();
    }

    public static Long getTableId() {
        return TABLE_ID_HOLDER.get();
    }

    public static void setTableId(Long id) {
        if (id == null) {
            TABLE_ID_HOLDER.remove();
        } else {
            TABLE_ID_HOLDER.set(id);
        }
    }

    public static void clearTableId() {
        TABLE_ID_HOLDER.remove();
    }

    public static String getTableToken() {
        return TABLE_TOKEN_HOLDER.get();
    }

    public static void setTableToken(String token) {
        if (token == null) {
            TABLE_TOKEN_HOLDER.remove();
        } else {
            TABLE_TOKEN_HOLDER.set(token);
        }
    }

    public static void clearTableToken() {
        TABLE_TOKEN_HOLDER.remove();
    }

    public static void clearAll() {
        SHOP_ID_HOLDER.remove();
        TABLE_ID_HOLDER.remove();
        TABLE_TOKEN_HOLDER.remove();
    }

    public static Boolean a(){
        if (SecurityContextHolder.getContext().getAuthentication() == null){
            return true;
        }
        Object principal = SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return "anonymousUser".equals(principal);
    }

}

package com.linmour.security.filter;

import feign.RequestInterceptor;
import feign.RequestTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

import javax.annotation.PostConstruct;

import static com.linmour.security.utils.SecurityUtils.getShopId;

/**
 * feign调用拦截器，应该我们的认证放在每个服务里，所以feign调用也会触发，我们给feign调用加上请求头参数来区别和普通请求来跳过认证
 */
@Configuration
public class FeignRequestInterceptor implements RequestInterceptor {

    @Value("${security.internal-token:}")
    private String internalToken;

    @PostConstruct
    public void validate() {
        if (internalToken == null || internalToken.trim().isEmpty()) {
            throw new IllegalStateException("Cấu hình 'security.internal-token' không được để trống! FeignRequestInterceptor yêu cầu token nội bộ hợp lệ.");
        }
    }

    @Override
    public void apply(RequestTemplate template) {
        template.header("Token", "1");
        if (internalToken != null && !internalToken.trim().isEmpty()) {
            template.header("X-Internal-Token", internalToken);
        }
        if (getShopId() == null)
            template.header("Shopid", "0");
        else
            template.header("Shopid", getShopId().toString());
    }
}

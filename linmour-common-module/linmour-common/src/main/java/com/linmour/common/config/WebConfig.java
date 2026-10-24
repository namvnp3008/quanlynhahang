package com.linmour.common.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * @BelongsProject: demo
 * @Author: DanBrown
 * @CreateTime: 2020-03-28 14:33
 * @description: TODO
 */
//url映射本地路径
@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Value("${file.upload-path:}")
    private String configuredUploadPath;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String baseDir;
        if (configuredUploadPath != null && !configuredUploadPath.trim().isEmpty()) {
            baseDir = configuredUploadPath.endsWith("/") || configuredUploadPath.endsWith("\\") ? configuredUploadPath : configuredUploadPath + "/";
        } else {
            baseDir = System.getProperty("user.home") + "/linmour/upload/";
        }
        new java.io.File(baseDir).mkdirs();
        registry.addResourceHandler("/file/**").addResourceLocations("file:" + baseDir);
    }

}

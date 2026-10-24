package com.linmour.system.service.impl;

import cn.hutool.core.lang.UUID;
import com.linmour.security.dtos.LoginUser;
import com.linmour.security.dtos.Result;
import com.linmour.security.utils.SecurityUtils;
import com.linmour.system.service.UploadService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import static com.linmour.security.dtos.Result.success;
import static com.linmour.security.utils.SecurityUtils.getShopId;

@Service
public class UploadServiceImpl implements UploadService {

    @Value("${file.upload-path:}")
    private String configuredUploadPath;

    @Value("${app.public-base-url:http://localhost:12800}")
    private String publicBaseUrl;

    private String getBaseUploadDir() {
        if (configuredUploadPath != null && !configuredUploadPath.trim().isEmpty()) {
            return configuredUploadPath.endsWith("/") || configuredUploadPath.endsWith("\\") ? configuredUploadPath : configuredUploadPath + "/";
        }
        return System.getProperty("user.home") + "/linmour/upload/";
    }

    @Override
    public Result uploadImg(MultipartFile file, String prefix) {
        if (file == null || file.isEmpty()) {
            return Result.error("Tệp không được để trống");
        }
        Long id = SecurityUtils.getUserId();
        String originalFilename = file.getOriginalFilename();
        String ext = ".png";
        if (originalFilename != null && originalFilename.contains(".")) {
            ext = originalFilename.substring(originalFilename.lastIndexOf("."));
        }
        String p = prefix != null && !prefix.trim().isEmpty() ? prefix : "common";
        String relativePath = p + "/" + id + "/" + UUID.randomUUID().toString().replace("-", "") + ext;
        
        File dest = new File(getBaseUploadDir() + relativePath);
        if (!dest.getParentFile().exists()) {
            dest.getParentFile().mkdirs();
        }
        try {
            file.transferTo(dest);
        } catch (IOException e) {
            throw new RuntimeException("Tải tệp lên thất bại: " + e.getMessage(), e);
        }
        String base = publicBaseUrl != null && !publicBaseUrl.trim().isEmpty() ? publicBaseUrl : "http://localhost:12800";
        if (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        String fileUrl = base + "/file/" + relativePath;
        return Result.success(fileUrl);
    }

    @Override
    public Result uploadImgs(MultipartFile[] file, String prefix) {
        if (file == null || file.length == 0) {
            return Result.error("Tệp không được để trống");
        }
        List<String> urls = new ArrayList<>();
        for (MultipartFile multipartFile : file) {
            Result res = uploadImg(multipartFile, prefix);
            if (res != null && res.getData() != null) {
                urls.add(res.getData().toString());
            }
        }
        return Result.success(urls);
    }
}

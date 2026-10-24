package com.linmour.system.service.impl;

import com.alibaba.fastjson.JSON;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.linmour.security.dtos.PageResult;
import com.linmour.security.exception.CustomException;
import com.linmour.security.exception.enums.AppHttpCodeEnum;
import com.linmour.security.utils.SecurityUtils;
import com.linmour.system.mapper.AuditLogMapper;
import com.linmour.system.pojo.Do.AuditLog;
import com.linmour.system.pojo.Dto.AuditLogQueryDto;
import com.linmour.system.pojo.Dto.AuditLogReqDto;
import com.linmour.system.service.AuditService;
import com.linmour.system.service.ShopService;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.CompletableFuture;

@Slf4j
@Service
public class AuditServiceImpl extends ServiceImpl<AuditLogMapper, AuditLog> implements AuditService {

    @Resource
    private ShopService shopService;

    private static final DateTimeFormatter DATE_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    @Override
    public void recordAudit(AuditLogReqDto dto) {
        if (dto == null) {
            return;
        }
        CompletableFuture.runAsync(() -> {
            try {
                String detailJson = null;
                if (dto.getDetail() != null && !dto.getDetail().isEmpty()) {
                    Map<String, Object> masked = maskSecrets(dto.getDetail());
                    detailJson = JSON.toJSONString(masked);
                }

                AuditLog auditLog = AuditLog.builder()
                        .shopId(dto.getShopId())
                        .merchantId(dto.getMerchantId())
                        .actorName(StringUtils.isNotBlank(dto.getActorName()) ? dto.getActorName().trim() : "Hệ thống")
                        .actorType(dto.getActorType() != null ? dto.getActorType() : 2)
                        .action(dto.getAction())
                        .targetType(dto.getTargetType())
                        .targetId(dto.getTargetId())
                        .detail(detailJson)
                        .ip(StringUtils.isNotBlank(dto.getIp()) ? dto.getIp().trim() : "127.0.0.1")
                        .userAgent(dto.getUserAgent())
                        .result(StringUtils.isNotBlank(dto.getResult()) ? dto.getResult().trim() : "SUCCESS")
                        .createTime(LocalDateTime.now())
                        .build();

                this.save(auditLog);
            } catch (Exception e) {
                log.error("Lỗi khi lưu audit log action {}: {}", dto.getAction(), e.getMessage());
            }
        });
    }

    @Override
    public PageResult<AuditLog> getAuditLogs(AuditLogQueryDto queryDto) {
        Long currentUserId = SecurityUtils.getUserId();
        Integer userType = SecurityUtils.getUserType();
        if (currentUserId == null || userType == null) {
            throw new CustomException(AppHttpCodeEnum.NEED_LOGIN);
        }

        LambdaQueryWrapper<AuditLog> wrapper = new LambdaQueryWrapper<>();

        // Phân quyền theo vai trò
        if (userType == 1) {
            // Platform admin: Xem tất cả, hỗ trợ lọc theo shopId và merchantId
            if (queryDto.getShopId() != null) {
                wrapper.eq(AuditLog::getShopId, queryDto.getShopId());
            }
            if (queryDto.getMerchantId() != null) {
                wrapper.eq(AuditLog::getMerchantId, queryDto.getMerchantId());
            }
        } else {
            // Merchant: Chỉ xem các quán mình sở hữu VÀ các thao tác của tài khoản mình
            List<Long> ownedShopIds = shopService.getShopIdsByMerchantId(currentUserId);
            if (queryDto.getShopId() != null) {
                if (ownedShopIds == null || !ownedShopIds.contains(queryDto.getShopId())) {
                    return PageResult.empty(0L);
                }
                wrapper.eq(AuditLog::getShopId, queryDto.getShopId());
            } else {
                if (ownedShopIds == null || ownedShopIds.isEmpty()) {
                    wrapper.eq(AuditLog::getMerchantId, currentUserId);
                } else {
                    wrapper.and(w -> w.eq(AuditLog::getMerchantId, currentUserId)
                            .or().in(AuditLog::getShopId, ownedShopIds));
                }
            }
        }

        // Lọc action
        if (StringUtils.isNotBlank(queryDto.getAction())) {
            wrapper.eq(AuditLog::getAction, queryDto.getAction().trim());
        }

        // Lọc thời gian from - to
        LocalDateTime fromTime = parseDateTime(queryDto.getFrom(), false);
        if (fromTime != null) {
            wrapper.ge(AuditLog::getCreateTime, fromTime);
        }
        LocalDateTime toTime = parseDateTime(queryDto.getTo(), true);
        if (toTime != null) {
            wrapper.le(AuditLog::getCreateTime, toTime);
        }

        wrapper.orderByDesc(AuditLog::getCreateTime).orderByDesc(AuditLog::getId);

        long pageNo = (queryDto.getPageNo() != null && queryDto.getPageNo() > 0) ? queryDto.getPageNo() : 1;
        long pageSize = (queryDto.getPageSize() != null && queryDto.getPageSize() > 0) ? queryDto.getPageSize() : 10;

        Page<AuditLog> page = new Page<>(pageNo, pageSize);
        this.page(page, wrapper);

        return new PageResult<>(page.getRecords(), page.getTotal());
    }

    private Map<String, Object> maskSecrets(Map<String, Object> map) {
        if (map == null) return Collections.emptyMap();
        Map<String, Object> masked = new HashMap<>();
        for (Map.Entry<String, Object> entry : map.entrySet()) {
            String key = entry.getKey();
            Object value = entry.getValue();
            String lowerKey = key.toLowerCase();

            // Loại bỏ hoàn toàn các trường nhạy cảm
            if (lowerKey.contains("password") || lowerKey.contains("pwd") || lowerKey.contains("secret")
                    || lowerKey.contains("apikey") || lowerKey.contains("checksum")
                    || lowerKey.contains("recovery") || lowerKey.contains("otpcode") || lowerKey.contains("ticket")) {
                masked.put(key, "[PROTECTED]");
            } else if (lowerKey.contains("clientid") && value != null) {
                String str = String.valueOf(value).trim();
                if (str.length() > 4) {
                    masked.put(key, "••••" + str.substring(str.length() - 4));
                } else {
                    masked.put(key, "••••" + str);
                }
            } else if (value instanceof Map) {
                //noinspection unchecked
                masked.put(key, maskSecrets((Map<String, Object>) value));
            } else {
                masked.put(key, value);
            }
        }
        return masked;
    }

    private LocalDateTime parseDateTime(String input, boolean isEndOfDay) {
        if (StringUtils.isBlank(input)) {
            return null;
        }
        String trimmed = input.trim().replace("T", " ");
        try {
            if (trimmed.length() <= 10) {
                LocalDate date = LocalDate.parse(trimmed, DATE_FORMATTER);
                return isEndOfDay ? date.atTime(23, 59, 59) : date.atStartOfDay();
            }
            if (trimmed.length() == 19) {
                return LocalDateTime.parse(trimmed, DATE_TIME_FORMATTER);
            }
            return LocalDateTime.parse(trimmed);
        } catch (Exception e) {
            log.warn("Không thể parse ngày kiểm toán: {}", input);
            return null;
        }
    }
}

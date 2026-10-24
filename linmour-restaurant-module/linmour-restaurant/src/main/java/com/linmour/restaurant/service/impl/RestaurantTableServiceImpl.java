package com.linmour.restaurant.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;
import com.linmour.restaurant.covert.TableConvert;
import com.linmour.restaurant.mapper.RestaurantTableMapper;
import com.linmour.restaurant.pojo.Do.RestaurantTable;
import com.linmour.restaurant.pojo.Dto.AppTableInfoDto;
import com.linmour.restaurant.pojo.Dto.RestaurantTableDto;
import com.linmour.restaurant.service.RestaurantTableService;
import com.linmour.restaurant.feign.SystemFeign;
import com.linmour.system.pojo.Dto.AuditLogReqDto;
import com.linmour.security.utils.SecurityUtils;
import com.linmour.security.dtos.Result;
import com.linmour.security.exception.CustomException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import javax.annotation.Resource;
import java.io.File;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

import static com.linmour.security.utils.SecurityUtils.getShopId;
import static com.linmour.security.utils.SecurityUtils.getUserId;

/**
 * @author linmour
 * @description 针对表【restaurant_table】的数据库操作Service实现
 * @createDate 2023-08-05 20:01:23
 */
@Slf4j
@Service
public class RestaurantTableServiceImpl extends ServiceImpl<RestaurantTableMapper, RestaurantTable>
        implements RestaurantTableService {

    @Resource
    private RestaurantTableMapper restaurantTableMapper;

    @Resource
    private SystemFeign systemFeign;

    @Resource
    private RestTemplate restTemplate;

    @Resource
    private com.linmour.security.utils.RedisCache redisCache;

    @Value("${app.web-base-url:http://localhost:5181}")
    private String webBaseUrl;

    @Value("${app.public-base-url:http://localhost:12800}")
    private String publicBaseUrl;

    @Value("${file.upload-path:}")
    private String configuredUploadPath;

    public String getBaseUploadDir() {
        if (configuredUploadPath != null && !configuredUploadPath.trim().isEmpty()) {
            return configuredUploadPath.endsWith("/") || configuredUploadPath.endsWith("\\") ? configuredUploadPath : configuredUploadPath + "/";
        }
        return System.getProperty("user.home") + "/linmour/upload/";
    }

    private String generateRandomToken() {
        byte[] bytes = new byte[16];
        new java.security.SecureRandom().nextBytes(bytes);
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

    public void generateAndSaveQrCode(Long userId, Long shopId, Long tableId, int size) throws Exception {
        String baseUrl = webBaseUrl.endsWith("/") ? webBaseUrl.substring(0, webBaseUrl.length() - 1) : webBaseUrl;
        RestaurantTable table = this.getById(tableId);
        String token = (table != null && table.getQrToken() != null && !table.getQrToken().trim().isEmpty())
                ? table.getQrToken() : "";
        String qrContent = (!token.isEmpty())
                ? baseUrl + "/?qr=" + token
                : baseUrl + "/?shopId=" + shopId + "&tableId=" + tableId;

        int qrSize = size > 0 ? size : 430;
        QRCodeWriter qrCodeWriter = new QRCodeWriter();
        Map<EncodeHintType, Object> hints = new HashMap<>();
        hints.put(EncodeHintType.CHARACTER_SET, "UTF-8");
        hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M);
        hints.put(EncodeHintType.MARGIN, 1);
        BitMatrix bitMatrix = qrCodeWriter.encode(qrContent, BarcodeFormat.QR_CODE, qrSize, qrSize, hints);

        String path = "QR/user_" + userId + "/shop_" + shopId + "/" + tableId + ".png";
        String baseDir = getBaseUploadDir();
        File targetFile = new File(baseDir + path);
        File directory = targetFile.getParentFile();
        if (!directory.exists()) {
            directory.mkdirs();
        }
        MatrixToImageWriter.writeToPath(bitMatrix, "PNG", targetFile.toPath());
    }

    public String buildQrCodeUrl(Long userId, Long shopId, Long tableId) {
        String pubBase = publicBaseUrl.endsWith("/") ? publicBaseUrl.substring(0, publicBaseUrl.length() - 1) : publicBaseUrl;
        String path = "QR/user_" + userId + "/shop_" + shopId + "/" + tableId + ".png";
        return pubBase + "/file/" + path;
    }

    @Override
    public Result getTable() {
        Long shopId = getShopId();
        if (shopId == null || shopId <= 0) {
            throw new CustomException(400, "Vui lòng chọn quán ăn hợp lệ");
        }
        com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<RestaurantTable> wrapper =
            new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<RestaurantTable>()
                .ne(RestaurantTable::getDeleted, 1)
                .eq(RestaurantTable::getShopId, shopId);
        List<RestaurantTable> restaurantTables = restaurantTableMapper.selectList(wrapper);
        return Result.success(restaurantTables);
    }

    @Override
    public Result updateTable(RestaurantTable table) {
        if (table == null || table.getId() == null) {
            return Result.error("Thông tin bàn không hợp lệ");
        }
        RestaurantTable existing = restaurantTableMapper.selectById(table.getId());
        if (existing == null || (existing.getDeleted() != null && existing.getDeleted() == 1)) {
            return Result.error("Không tìm thấy bàn");
        }
        Long currentShopId = getShopId();
        if (currentShopId != null && currentShopId > 0 && existing.getShopId() != null && !existing.getShopId().equals(currentShopId)) {
            throw new CustomException(403, "Bạn không có quyền thao tác trên bàn của quán khác");
        }
        table.setShopId(existing.getShopId());
        this.updateById(table);
        return Result.success();
    }

    @Override
    public Result deleteTable(Long id) {
        if (id == null) {
            return Result.error("ID bàn không hợp lệ");
        }
        RestaurantTable table = this.getById(id);
        if (table == null || (table.getDeleted() != null && table.getDeleted() == 1)) {
            return Result.error("Không tìm thấy bàn");
        }
        Long currentShopId = getShopId();
        if (currentShopId != null && currentShopId > 0 && table.getShopId() != null && !table.getShopId().equals(currentShopId)) {
            throw new CustomException(403, "Bạn không có quyền thao tác trên bàn của quán khác");
        }
        String redisKey = "orderInfo:" + table.getShopId() + ":" + id;
        Boolean hasOrder = redisCache.redisTemplate.hasKey(redisKey);
        if (Boolean.TRUE.equals(hasOrder)) {
            return Result.error("Bàn đang có khách, không thể xoá");
        }
        this.removeById(id);

        // S3: Audit TABLE_DELETE
        try {
            Long currentUserId = SecurityUtils.getUserId();
            String actor = (SecurityUtils.getLoginUser() != null && SecurityUtils.getLoginUser().getLoginVo() != null
                    && SecurityUtils.getLoginUser().getLoginVo().getPhone() != null)
                    ? SecurityUtils.getLoginUser().getLoginVo().getPhone() : "User " + currentUserId;
            Integer uType = SecurityUtils.getUserType() != null ? SecurityUtils.getUserType() : 2;

            Map<String, Object> detail = new HashMap<>();
            detail.put("name", table.getName());
            detail.put("tableId", id);
            detail.put("shopId", table.getShopId());

            AuditLogReqDto auditDto = AuditLogReqDto.builder()
                    .shopId(table.getShopId())
                    .merchantId(currentUserId)
                    .actorName(actor)
                    .actorType(uType)
                    .action("TABLE_DELETE")
                    .targetType("table")
                    .targetId(String.valueOf(id))
                    .detail(detail)
                    .result("SUCCESS")
                    .build();

            CompletableFuture.runAsync(() -> {
                try {
                    systemFeign.recordInternalAudit(auditDto);
                } catch (Exception err) {
                    log.error("Lỗi gửi audit log TABLE_DELETE qua Feign: {}", err.getMessage());
                }
            });
        } catch (Exception ignored) {}

        return Result.success();
    }

    @Override
    public Result clearTable(Long id) {
        if (id == null) {
            return Result.error("ID bàn không hợp lệ");
        }
        RestaurantTable table = this.getById(id);
        if (table == null || (table.getDeleted() != null && table.getDeleted() == 1)) {
            return Result.error("Không tìm thấy bàn");
        }
        Long currentShopId = getShopId();
        if (currentShopId != null && currentShopId > 0 && table.getShopId() != null && !table.getShopId().equals(currentShopId)) {
            throw new CustomException(403, "Bạn không có quyền thao tác trên bàn của quán khác");
        }
        Long shopId = table.getShopId() != null ? table.getShopId() : getShopId();
        String orderInfoKey = "orderInfo:" + shopId + ":" + id;
        String orderItemKey = "order_item:" + shopId + ":" + id;
        redisCache.deleteObject(orderInfoKey);
        redisCache.deleteObject(orderItemKey);

        // S3: Audit TABLE_CLEAR
        try {
            Long currentUserId = SecurityUtils.getUserId();
            String actor = (SecurityUtils.getLoginUser() != null && SecurityUtils.getLoginUser().getLoginVo() != null
                    && SecurityUtils.getLoginUser().getLoginVo().getPhone() != null)
                    ? SecurityUtils.getLoginUser().getLoginVo().getPhone() : "User " + currentUserId;
            Integer uType = SecurityUtils.getUserType() != null ? SecurityUtils.getUserType() : 2;

            Map<String, Object> detail = new HashMap<>();
            detail.put("name", table.getName());
            detail.put("tableId", id);
            detail.put("shopId", shopId);

            AuditLogReqDto auditDto = AuditLogReqDto.builder()
                    .shopId(shopId)
                    .merchantId(currentUserId)
                    .actorName(actor)
                    .actorType(uType)
                    .action("TABLE_CLEAR")
                    .targetType("table")
                    .targetId(String.valueOf(id))
                    .detail(detail)
                    .result("SUCCESS")
                    .build();

            CompletableFuture.runAsync(() -> {
                try {
                    systemFeign.recordInternalAudit(auditDto);
                } catch (Exception err) {
                    log.error("Lỗi gửi audit log TABLE_CLEAR qua Feign: {}", err.getMessage());
                }
            });
        } catch (Exception ignored) {}

        return Result.success();
    }

    @Override
    public Result createTable(RestaurantTableDto dto) {
        RestaurantTable restaurantTable = TableConvert.IN.TableDtoToTable(dto);
        Long sid = getShopId();
        if (sid != null && sid > 0) {
            restaurantTable.setShopId(sid);
        } else if (restaurantTable.getShopId() == null || restaurantTable.getShopId() <= 0) {
            return Result.error("Chưa chọn quán");
        }
        if (restaurantTable.getQrToken() == null || restaurantTable.getQrToken().trim().isEmpty()) {
            restaurantTable.setQrToken(generateRandomToken());
        }
        restaurantTableMapper.insert(restaurantTable);
        Long tableId = restaurantTable.getId();
        Long shopId = restaurantTable.getShopId();
        Long userId = (getUserId() != null && getUserId() > 0) ? getUserId() : 1L;
        int size = 430;
        if (dto.getSize() != null && !dto.getSize().trim().isEmpty()) {
            try {
                int parsed = Integer.parseInt(dto.getSize().trim());
                if (parsed >= 100) {
                    size = parsed;
                }
            } catch (NumberFormatException ignored) {
            }
        }

        try {
            generateAndSaveQrCode(userId, shopId, tableId, size);
            String qrUrl = buildQrCodeUrl(userId, shopId, tableId);
            restaurantTable.setQrCodeUrl(qrUrl);
            restaurantTableMapper.updateById(restaurantTable);
        } catch (Exception e) {
            throw new RuntimeException("Lỗi sinh mã QR: " + e.getMessage(), e);
        }

        // S3: Audit TABLE_CREATE
        try {
            Long currentUserId = SecurityUtils.getUserId();
            String actor = (SecurityUtils.getLoginUser() != null && SecurityUtils.getLoginUser().getLoginVo() != null
                    && SecurityUtils.getLoginUser().getLoginVo().getPhone() != null)
                    ? SecurityUtils.getLoginUser().getLoginVo().getPhone() : "User " + userId;
            Integer uType = SecurityUtils.getUserType() != null ? SecurityUtils.getUserType() : 2;

            Map<String, Object> detail = new HashMap<>();
            detail.put("name", restaurantTable.getName());
            detail.put("tableId", tableId);
            detail.put("shopId", shopId);

            AuditLogReqDto auditDto = AuditLogReqDto.builder()
                    .shopId(shopId)
                    .merchantId(currentUserId)
                    .actorName(actor)
                    .actorType(uType)
                    .action("TABLE_CREATE")
                    .targetType("table")
                    .targetId(String.valueOf(tableId))
                    .detail(detail)
                    .result("SUCCESS")
                    .build();

            CompletableFuture.runAsync(() -> {
                try {
                    systemFeign.recordInternalAudit(auditDto);
                } catch (Exception err) {
                    log.error("Lỗi gửi audit log TABLE_CREATE qua Feign: {}", err.getMessage());
                }
            });
        } catch (Exception ignored) {}

        return Result.success(restaurantTable);
    }

    @Override
    public Result regenerateQr(Long id) {
        if (id == null) {
            return Result.error("ID bàn không hợp lệ");
        }
        RestaurantTable table = this.getById(id);
        if (table == null || (table.getDeleted() != null && table.getDeleted() == 1)) {
            return Result.error("Không tìm thấy bàn");
        }
        Long currentShopId = getShopId();
        if (currentShopId != null && currentShopId > 0 && table.getShopId() != null && !table.getShopId().equals(currentShopId)) {
            throw new CustomException(403, "Bạn không có quyền thao tác trên bàn của quán khác");
        }
        Long tableId = table.getId();
        Long shopId = table.getShopId() != null ? table.getShopId() : 1L;
        Long userId = (getUserId() != null && getUserId() > 0) ? getUserId() : 1L;
        int size = 430;

        String newQrToken = generateRandomToken();
        table.setQrToken(newQrToken);
        String qv = com.linmour.security.utils.TableTokenUtil.calculateQv(newQrToken);
        redisCache.setCacheObject("table:qv:" + shopId + ":" + tableId, qv, 24, java.util.concurrent.TimeUnit.HOURS);
        this.updateById(table);

        try {
            generateAndSaveQrCode(userId, shopId, tableId, size);
            String qrUrl = buildQrCodeUrl(userId, shopId, tableId);
            table.setQrCodeUrl(qrUrl);
            this.updateById(table);
        } catch (Exception e) {
            log.error("Lỗi vẽ lại ảnh QR bàn {}: {}", tableId, e.getMessage());
        }

        // T-1: Đóng các kết nối WebSocket đang mở của bàn này
        try {
            com.alibaba.fastjson.JSONObject msg = new com.alibaba.fastjson.JSONObject();
            msg.put("shopId", shopId);
            msg.put("tableId", tableId);
            redisCache.redisTemplate.convertAndSend("table_qr_revoked", msg.toJSONString());
        } catch (Exception e) {
            log.warn("Không thể publish table_qr_revoked: {}", e.getMessage());
        }

        return Result.success(table);
    }

    @Override
    public Result regenerateAllQr() {
        Long shopId = getShopId();
        if (shopId == null || shopId <= 0) {
            return Result.error("Chưa chọn quán để thao tác");
        }
        Long userId = (getUserId() != null && getUserId() > 0) ? getUserId() : 1L;
        List<RestaurantTable> tableList = restaurantTableMapper.selectList(
            new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<RestaurantTable>()
                .eq(RestaurantTable::getShopId, shopId)
                .ne(RestaurantTable::getDeleted, 1)
        );
        for (RestaurantTable t : tableList) {
            String newQrToken = generateRandomToken();
            t.setQrToken(newQrToken);
            String qv = com.linmour.security.utils.TableTokenUtil.calculateQv(newQrToken);
            redisCache.setCacheObject("table:qv:" + shopId + ":" + t.getId(), qv, 24, java.util.concurrent.TimeUnit.HOURS);
            this.updateById(t);
            try {
                generateAndSaveQrCode(userId, shopId, t.getId(), 430);
                t.setQrCodeUrl(buildQrCodeUrl(userId, shopId, t.getId()));
                this.updateById(t);
            } catch (Exception e) {
                log.error("Lỗi vẽ lại ảnh QR bàn {}: {}", t.getId(), e.getMessage());
            }
        }

        // T-1: Gửi event đóng tất cả WebSocket đang mở của quán này
        try {
            com.alibaba.fastjson.JSONObject msg = new com.alibaba.fastjson.JSONObject();
            msg.put("shopId", shopId);
            redisCache.redisTemplate.convertAndSend("table_qr_revoked", msg.toJSONString());
        } catch (Exception e) {
            log.warn("Không thể publish table_qr_revoked: {}", e.getMessage());
        }

        return Result.success();
    }

    @Override
    public Result resolveQrToken(String token, String clientIp, javax.servlet.http.HttpServletResponse response) {
        String rateLimitKey = "rl:qr:fail:" + (clientIp != null ? clientIp : "unknown");
        Object currentFailObj = redisCache.getCacheObject(rateLimitKey);
        if (currentFailObj != null) {
            try {
                long currentFails = Long.parseLong(String.valueOf(currentFailObj));
                if (currentFails > 20) {
                    if (response != null) response.setStatus(429);
                    return Result.error(429, "Quá nhiều yêu cầu không hợp lệ, vui lòng thử lại sau");
                }
            } catch (NumberFormatException ignored) {}
        }

        if (token == null || token.trim().isEmpty()) {
            recordFail(rateLimitKey);
            if (response != null) response.setStatus(404);
            return Result.error(404, "Mã QR không hợp lệ hoặc đã được thay mới");
        }

        RestaurantTable table = restaurantTableMapper.selectOne(
            new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<RestaurantTable>()
                .eq(RestaurantTable::getQrToken, token.trim())
                .ne(RestaurantTable::getDeleted, 1)
        );

        if (table == null) {
            recordFail(rateLimitKey);
            if (response != null) response.setStatus(404);
            return Result.error(404, "Mã QR không hợp lệ hoặc đã được thay mới");
        }

        String suffix = token.length() >= 4 ? token.substring(token.length() - 4) : "****";
        log.info("Xử lý quét QR bàn: tableId={}, shopId={}, tokenSuffix=...{}", table.getId(), table.getShopId(), suffix);

        String qv = com.linmour.security.utils.TableTokenUtil.calculateQv(table.getQrToken());
        redisCache.setCacheObject("table:qv:" + table.getShopId() + ":" + table.getId(), qv, 24, java.util.concurrent.TimeUnit.HOURS);

        String tableAccessToken = com.linmour.security.utils.TableTokenUtil.createTableAccessToken(table.getShopId(), table.getId(), qv);

        String shopName = "";
        Integer shopStatus = 1;
        Integer auditStatus = 1;

        try {
            List<com.linmour.system.pojo.Do.Shop> shops = systemFeign.getShopByIds(java.util.Collections.singletonList(table.getShopId()));
            if (shops != null && !shops.isEmpty()) {
                com.linmour.system.pojo.Do.Shop s = shops.get(0);
                shopName = s.getName();
                shopStatus = s.getShopStatus();
                auditStatus = s.getAuditStatus();
            }
        } catch (Exception e) {
            log.warn("Không thể lấy thông tin quán từ Feign: {}", e.getMessage());
        }

        com.linmour.restaurant.pojo.Dto.ResolvedQrDto dto = com.linmour.restaurant.pojo.Dto.ResolvedQrDto.builder()
            .shopId(table.getShopId())
            .tableId(table.getId())
            .tableName(table.getName())
            .shopName(shopName)
            .shopStatus(shopStatus)
            .auditStatus(auditStatus)
            .tableAccessToken(tableAccessToken)
            .expiresAt(java.time.Instant.ofEpochMilli(System.currentTimeMillis() + com.linmour.security.utils.TableTokenUtil.TABLE_TOKEN_TTL).toString())
            .build();

        return Result.success(dto);
    }

    private void recordFail(String rateLimitKey) {
        try {
            Long fails = redisCache.redisTemplate.opsForValue().increment(rateLimitKey);
            if (fails != null && fails == 1) {
                redisCache.redisTemplate.expire(rateLimitKey, 60, java.util.concurrent.TimeUnit.SECONDS);
            }
        } catch (Exception e) {
            log.warn("Không thể tăng fail count rate limit: {}", e.getMessage());
        }
    }

    @Override
    public Result getAppTableInfo(Long id, Long shopId) {
        if (id == null || shopId == null) {
            return Result.error("Không tìm thấy bàn");
        }
        RestaurantTable table = this.getById(id);
        if (table == null || (table.getDeleted() != null && table.getDeleted() == 1)) {
            return Result.error("Không tìm thấy bàn");
        }
        if (!shopId.equals(table.getShopId())) {
            return Result.error("Không tìm thấy bàn");
        }
        AppTableInfoDto dto = AppTableInfoDto.builder()
                .id(table.getId())
                .name(table.getName())
                .shopId(table.getShopId())
                .build();
        return Result.success(dto);
    }

    @Override
    public Result getInternalTableQv(Long shopId, Long tableId) {
        if (shopId == null || tableId == null) {
            return Result.error(400, "shopId và tableId không được để trống");
        }
        RestaurantTable table = restaurantTableMapper.selectOne(
            new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<RestaurantTable>()
                .eq(RestaurantTable::getId, tableId)
                .eq(RestaurantTable::getShopId, shopId)
                .ne(RestaurantTable::getDeleted, 1)
        );
        if (table == null) {
            return Result.error(404, "Không tìm thấy bàn");
        }
        if (org.apache.commons.lang3.StringUtils.isBlank(table.getQrToken())) {
            table.setQrToken(generateRandomToken());
            this.updateById(table);
        }
        String qv = com.linmour.security.utils.TableTokenUtil.calculateQv(table.getQrToken());
        if (redisCache != null) {
            try {
                redisCache.setCacheObject("table:qv:" + shopId + ":" + tableId, qv, 24, java.util.concurrent.TimeUnit.HOURS);
            } catch (Exception e) {
                log.warn("Không thể lưu cache table:qv cho {}:{}: {}", shopId, tableId, e.getMessage());
            }
        }
        return Result.success(qv);
    }
}

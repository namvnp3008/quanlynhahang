package com.linmour.system.controller.admin.shop;

import com.linmour.security.dtos.Result;
import com.linmour.security.exception.CustomException;
import com.linmour.security.exception.enums.AppHttpCodeEnum;
import com.linmour.security.utils.SecurityUtils;
import com.linmour.system.pojo.Do.Shop;
import com.linmour.system.pojo.Dto.PayosConfigDto;
import com.linmour.system.pojo.Dto.PayosConfigReqDto;
import com.linmour.system.pojo.Dto.ShopPage;
import com.linmour.system.service.ShopPaymentConfigService;
import com.linmour.system.service.ShopService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import javax.validation.Valid;
import java.util.List;

@RestController
@RequestMapping("/system/shop")
public class ShopController {

    @Resource
    private ShopService shopService;

    @Resource
    private ShopPaymentConfigService shopPaymentConfigService;

    @Value("${security.internal-token:}")
    private String internalToken;

    @javax.annotation.PostConstruct
    public void validateInternalToken() {
        if (org.apache.commons.lang3.StringUtils.isBlank(internalToken)) {
            throw new IllegalStateException("Cấu hình 'security.internal-token' không được để trống! Dịch vụ linmour-system không thể khởi động nếu thiếu token nội bộ.");
        }
    }

    @GetMapping("/shopList")
    public Result shopList(@Valid ShopPage dto) {
        return shopService.shopList(dto);
    }

    @PostMapping({"/save0rUpdateShop", "/saveOrUpdateShop"})
    public Result save0rUpdateShop(@RequestBody Shop shop) {
        return Result.success(shopService.save0rUpdateShop(shop));
    }

    @GetMapping({"/SonShopList", "/sonShopList"})
    public Result SonShopList(@Valid ShopPage dto) {
        return shopService.SonShopList(dto);
    }

    @GetMapping({"/SonShopList/{parentId}", "/sonShopList/{parentId}"})
    public Result getSonShopList(@PathVariable("parentId") Long parentId) {
        return shopService.getSonShopListByParentId(parentId);
    }

    @PostMapping("/auditShop")
    public Result auditShop(@Valid @RequestBody com.linmour.system.pojo.Dto.AuditShopDto dto) {
        return shopService.auditShop(dto);
    }

    @GetMapping("/internal/getShopByIds")
    public List<Shop> getShopByIds(
            @RequestParam("ids") List<Long> ids,
            @RequestHeader(value = "X-Internal-Token", required = false) String reqInternalToken) {
        String configuredToken = internalToken != null ? internalToken.trim() : "";
        if (reqInternalToken == null || !reqInternalToken.trim().equals(configuredToken)) {
            throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
        }
        return shopService.getShopByIds(ids);
    }

    @GetMapping("/internal/merchantShopIds/{merchantId}")
    public Result<List<Long>> getMerchantShopIds(
            @PathVariable("merchantId") Long merchantId,
            @RequestHeader(value = "X-Internal-Token", required = false) String reqInternalToken) {
        String configuredToken = internalToken != null ? internalToken.trim() : "";
        if (reqInternalToken == null || !reqInternalToken.trim().equals(configuredToken)) {
            throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
        }
        return Result.success(shopService.getShopIdsByMerchantId(merchantId));
    }

    private Long resolveTargetShopId(Long shopIdHeader, Long queryShopId) {
        Integer userType = SecurityUtils.getUserType();
        if (userType == null) {
            throw new CustomException(AppHttpCodeEnum.NEED_LOGIN);
        }
        Long targetShopId;
        if (userType.equals(1)) {
            targetShopId = queryShopId != null ? queryShopId : shopIdHeader;
        } else {
            Long currentShopId = SecurityUtils.getShopId();
            if (currentShopId == null || currentShopId <= 0) {
                currentShopId = shopIdHeader;
            }
            if (currentShopId == null || currentShopId <= 0) {
                throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
            }
            if (queryShopId != null && !queryShopId.equals(currentShopId)) {
                throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
            }
            targetShopId = currentShopId;
        }
        if (targetShopId == null || targetShopId <= 0) {
            throw new CustomException(AppHttpCodeEnum.PARAM_ERROR);
        }
        return targetShopId;
    }

    /**
     * Y1: Lấy thông tin cấu hình PayOS của quán (chỉ trả masked clientId, không bao giờ lộ key thật)
     */
    @GetMapping("/payos-config")
    public Result getPayosConfig(@RequestHeader(value = "Shopid", required = false) Long shopIdHeader,
                                 @RequestParam(value = "shopId", required = false) Long queryShopId) {
        Long targetShopId = resolveTargetShopId(shopIdHeader, queryShopId);
        return Result.success(shopPaymentConfigService.getPayosConfig(targetShopId));
    }

    /**
     * Y1: Cập nhật cấu hình PayOS của quán. Các trường để trống sẽ giữ nguyên giá trị cũ.
     */
    @PostMapping("/payos-config")
    public Result savePayosConfig(@RequestHeader(value = "Shopid", required = false) Long shopIdHeader,
                                  @RequestParam(value = "shopId", required = false) Long queryShopId,
                                  @RequestBody PayosConfigReqDto reqDto) {
        Long targetShopId = resolveTargetShopId(shopIdHeader, queryShopId);
        return shopPaymentConfigService.saveOrUpdatePayosConfig(targetShopId, reqDto);
    }

    /**
     * K3: Kiểm tra cảnh báo bảo mật cấu hình PayOS (thay đổi trong vòng 24 giờ qua)
     */
    @GetMapping("/securityNotice")
    public Result<com.linmour.system.pojo.Dto.SecurityNoticeRespDto> getSecurityNotice(
            @RequestHeader(value = "Shopid", required = false) Long shopIdHeader,
            @RequestParam(value = "shopId", required = false) Long queryShopId) {
        Long targetShopId = resolveTargetShopId(shopIdHeader, queryShopId);
        return Result.success(shopPaymentConfigService.getSecurityNotice(targetShopId));
    }

    /**
     * Y1: API Feign nội bộ cho linmour-order lấy thông tin key PayOS đã giải mã.
     * Bắt buộc có header X-Internal-Token hợp lệ.
     */
    @GetMapping("/internal/payos-config/{shopId}")
    public Result<PayosConfigDto> getInternalPayosConfig(
            @PathVariable("shopId") Long shopId,
            @RequestHeader(value = "X-Internal-Token", required = false) String reqInternalToken) {
        String configuredToken = internalToken != null ? internalToken.trim() : "";
        if (reqInternalToken == null || !reqInternalToken.trim().equals(configuredToken)) {
            throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
        }
        PayosConfigDto config = shopPaymentConfigService.getInternalPayosConfig(shopId);
        return Result.success(config);
    }
}

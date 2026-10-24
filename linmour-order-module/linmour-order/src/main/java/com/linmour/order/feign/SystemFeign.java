package com.linmour.order.feign;

import com.linmour.order.feign.fallback.ProductFeignFallback;
import com.linmour.security.dtos.Result;
import com.linmour.system.pojo.Do.Merchant;
import com.linmour.system.pojo.Do.Shop;
import com.linmour.system.pojo.Dto.AuditLogReqDto;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;

@FeignClient(name = "linmour-system")
public interface SystemFeign {
    @GetMapping("/system/shop/internal/getShopByIds")
    List<Shop> getShopByIds(@RequestParam("ids") List<Long> ids) ;

    @GetMapping("/system/merchant/internal/getMerchantByIds")
    List<Merchant> getMerchantByIds(@RequestParam("ids") List<Long> ids);

    @GetMapping("/system/shop/internal/payos-config/{shopId}")
    Result<com.linmour.system.pojo.Dto.PayosConfigDto> getPayosConfig(@org.springframework.web.bind.annotation.PathVariable("shopId") Long shopId);

    @PostMapping("/system/internal/audit")
    Result recordInternalAudit(@RequestBody AuditLogReqDto reqDto);
}

package com.linmour.restaurant.feign;

import com.linmour.security.dtos.Result;
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
    List<Shop> getShopByIds(@RequestParam("ids") List<Long> ids);

    @PostMapping("/system/internal/audit")
    Result recordInternalAudit(@RequestBody AuditLogReqDto reqDto);
}

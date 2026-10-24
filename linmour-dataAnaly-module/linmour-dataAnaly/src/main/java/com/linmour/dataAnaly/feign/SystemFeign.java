package com.linmour.dataAnaly.feign;

import com.linmour.system.pojo.Do.Shop;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;

@FeignClient(name = "linmour-system")
public interface SystemFeign {

    @GetMapping("/system/shop/internal/getShopByIds")
    List<Shop> getShopByIds(@RequestParam("ids") List<Long> ids);
}

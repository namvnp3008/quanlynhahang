package com.linmour.system.controller.app.shop;

import com.linmour.security.dtos.Result;
import com.linmour.security.utils.SecurityUtils;
import com.linmour.system.pojo.Dto.AppShopInfoDto;
import com.linmour.system.service.ShopService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.annotation.Resource;

@RestController
@RequestMapping("/app/system/shop")
public class AppShopController {

    @Resource
    private ShopService shopService;

    @GetMapping("/info")
    public Result getShopInfo(@RequestHeader(value = "Shopid", required = false) Long shopIdHeader) {
        Long shopId = shopIdHeader != null ? shopIdHeader : SecurityUtils.getShopId();
        if (shopId == null) {
            return Result.error("Không tìm thấy thông tin quán");
        }
        AppShopInfoDto shopInfo = shopService.getShopInfo(shopId);
        if (shopInfo == null) {
            return Result.error("Không tìm thấy thông tin quán");
        }
        return Result.success(shopInfo);
    }
}

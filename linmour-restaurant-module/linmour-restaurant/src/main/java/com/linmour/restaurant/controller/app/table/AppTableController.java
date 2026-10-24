package com.linmour.restaurant.controller.app.table;

import com.linmour.restaurant.service.RestaurantTableService;
import com.linmour.security.dtos.Result;
import com.linmour.security.utils.SecurityUtils;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;

@RestController
@RequestMapping("/app/restaurant/table")
public class AppTableController {

    @Resource
    private RestaurantTableService restaurantTableService;

    @GetMapping("/{id}")
    public Result getTable(@PathVariable("id") Long id, @RequestHeader(value = "Shopid", required = false) Long shopIdHeader) {
        Long shopId = shopIdHeader != null ? shopIdHeader : SecurityUtils.getShopId();
        return restaurantTableService.getAppTableInfo(id, shopId);
    }
}

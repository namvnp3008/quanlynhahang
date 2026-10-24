package com.linmour.restaurant.controller.app.table;

import com.linmour.restaurant.service.RestaurantTableService;
import com.linmour.security.dtos.Result;
import com.linmour.security.utils.WebUtils;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

@RestController
@RequestMapping("/app/restaurant/qr")
public class AppQrController {

    @Resource
    private RestaurantTableService restaurantTableService;

    @GetMapping("/{token}")
    public Result resolveQr(
            @PathVariable("token") String token,
            HttpServletRequest request,
            HttpServletResponse response) {
        String clientIp = WebUtils.getClientIp(request);
        return restaurantTableService.resolveQrToken(token, clientIp, response);
    }
}

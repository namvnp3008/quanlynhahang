package com.linmour.order.feign;

import com.linmour.security.dtos.Result;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;

@FeignClient(name = "linmour-restaurant")
public interface RestaurantFeign {
    @GetMapping("/app/restaurant/table/{id}")
    Result getTable(@PathVariable("id") Long id, @RequestHeader(value = "Shopid", required = false) Long shopIdHeader);
}

package com.linmour.restaurant.controller.table;

import com.linmour.security.dtos.Result;
import com.linmour.restaurant.pojo.Do.RestaurantTable;
import com.linmour.restaurant.pojo.Dto.RestaurantTableDto;
import com.linmour.restaurant.service.RestaurantTableService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import java.io.IOException;
import java.util.Map;

@RestController
@RequestMapping("/restaurant/table")
public class TableController {

    @Resource
    private RestaurantTableService restaurantTableService;

    @Value("${security.internal-token:}")
    private String internalToken;

    @GetMapping("/getTable")
    public Result getTable(){
        return restaurantTableService.getTable();
    }

    @PostMapping("/update")
    public Result update(@RequestBody Map<String, Object> map){
        RestaurantTable table;
        if (map.containsKey("dto") && map.get("dto") != null) {
            table = com.alibaba.fastjson.JSON.parseObject(com.alibaba.fastjson.JSON.toJSONString(map.get("dto")), RestaurantTable.class);
        } else {
            table = com.alibaba.fastjson.JSON.parseObject(com.alibaba.fastjson.JSON.toJSONString(map), RestaurantTable.class);
        }
        if (table == null || table.getId() == null) {
            return Result.error("Thông tin bàn không hợp lệ");
        }
        return restaurantTableService.updateTable(table);
    }

    @PostMapping("/createTable")
    public Result createTable(@RequestBody Map<String, Object> map) throws IOException {
        RestaurantTableDto dto;
        if (map.containsKey("dto") && map.get("dto") != null) {
            dto = com.alibaba.fastjson.JSON.parseObject(com.alibaba.fastjson.JSON.toJSONString(map.get("dto")), RestaurantTableDto.class);
        } else {
            dto = com.alibaba.fastjson.JSON.parseObject(com.alibaba.fastjson.JSON.toJSONString(map), RestaurantTableDto.class);
        }
        if (dto == null) {
            return Result.error("Tham số không được để trống");
        }
        return restaurantTableService.createTable(dto);
    }

    @GetMapping("/delete/{id}")
    public Result deleteTable(@PathVariable("id") Long id) {
        return restaurantTableService.deleteTable(id);
    }

    @PostMapping({"/clearTable/{id}", "/clear/{id}"})
    public Result clearTable(@PathVariable("id") Long id) {
        return restaurantTableService.clearTable(id);
    }

    @PostMapping("/regenerateQr/{id}")
    public Result regenerateQr(@PathVariable("id") Long id) {
        return restaurantTableService.regenerateQr(id);
    }

    @PostMapping("/regenerateAllQr")
    public Result regenerateAllQr() {
        return restaurantTableService.regenerateAllQr();
    }

    @GetMapping("/internal/qv/{shopId}/{tableId}")
    public Result getInternalTableQv(@PathVariable("shopId") Long shopId,
                                     @PathVariable("tableId") Long tableId,
                                     @RequestHeader(value = "X-Internal-Token", required = false) String token) {
        String configuredToken = internalToken != null ? internalToken.trim() : "";
        if (configuredToken.isEmpty() || token == null || !configuredToken.equals(token.trim())) {
            return Result.error(403, "Từ chối truy cập nội bộ");
        }
        return restaurantTableService.getInternalTableQv(shopId, tableId);
    }
}

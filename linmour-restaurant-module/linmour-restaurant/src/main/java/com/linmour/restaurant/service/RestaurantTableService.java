package com.linmour.restaurant.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.linmour.restaurant.pojo.Do.RestaurantTable;
import com.linmour.restaurant.pojo.Dto.RestaurantTableDto;
import com.linmour.security.dtos.Result;

import java.io.IOException;

/**
* @author linmour
* @description 针对表【restaurant_table】的数据库操作Service
* @createDate 2023-08-05 20:01:23
*/
public interface RestaurantTableService extends IService<RestaurantTable> {

    Result getTable();

    Result updateTable(RestaurantTable table);

    Result createTable(RestaurantTableDto dto) throws IOException;

    Result getAppTableInfo(Long id, Long shopId);

    Result deleteTable(Long id);

    Result clearTable(Long id);

    Result regenerateQr(Long id);

    Result regenerateAllQr();

    Result resolveQrToken(String token, String clientIp, javax.servlet.http.HttpServletResponse response);

    Result getInternalTableQv(Long shopId, Long tableId);
}

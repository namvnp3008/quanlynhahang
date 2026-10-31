package com.linmour.order.feign.fallback;

import com.linmour.order.feign.ProductFeign;
import com.linmour.product.pojo.Dto.PriceQuoteDto;
import com.linmour.product.pojo.Dto.ReduceInventoryDto;
import com.linmour.security.dtos.Result;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class ProductFeignFallback implements ProductFeign {
    @Override
    public Result getProductDetails(List<Long> productIds) {
        return null;
    }

    @Override
    public Result reduceInventories(List<ReduceInventoryDto> list) {
        return Result.error(500, "Lỗi kiểm tra tồn kho món");
    }

    @Override
    public Result restoreInventories(List<ReduceInventoryDto> list) {
        return Result.error(500, "Không cập nhật được kho, vui lòng thử lại");
    }

    @Override
    public Result priceQuote(PriceQuoteDto dto) {
        return Result.error(500, "Không lấy được giá món, vui lòng thử lại");
    }
}

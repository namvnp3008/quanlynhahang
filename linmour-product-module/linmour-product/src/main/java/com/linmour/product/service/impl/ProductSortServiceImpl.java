package com.linmour.product.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.linmour.product.mapper.ProductInfoMapper;
import com.linmour.product.mapper.ProductSortMapper;
import com.linmour.product.pojo.Do.ProductInfo;
import com.linmour.product.pojo.Do.ProductSort;
import com.linmour.product.service.ProductSortService;
import com.linmour.security.dtos.Result;
import com.linmour.security.exception.CustomException;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.util.List;

/**
* @author linmour
* @description 针对表【product_sort】的数据库操作Service实现
* @createDate 2023-08-12 18:34:04
*/
@Service
public class ProductSortServiceImpl extends ServiceImpl<ProductSortMapper, ProductSort>
    implements ProductSortService {

    @Resource
    private ProductSortMapper productSortMapper;

    @Resource
    private ProductInfoMapper productInfoMapper;

    @Override
    public List<ProductSort> getProductSort() {
        Long shopId = com.linmour.security.utils.SecurityUtils.getShopId();
        if (shopId == null || shopId <= 0) {
            throw new CustomException(400, "Vui lòng chọn quán ăn hợp lệ");
        }
        QueryWrapper<ProductSort> wrapper = new QueryWrapper<ProductSort>()
                .eq("shop_id", shopId)
                .orderByAsc("sort_order")
                .orderByAsc("id");
        return productSortMapper.selectList(wrapper);
    }

    @Override
    public void createProductSort(ProductSort productSort) {
        if (productSort == null) {
            throw new CustomException(400, "Thông tin danh mục không hợp lệ");
        }
        Long currentShopId = com.linmour.security.utils.SecurityUtils.getShopId();
        if (currentShopId != null && currentShopId > 0) {
            productSort.setShopId(currentShopId);
        } else if (productSort.getShopId() == null || productSort.getShopId() <= 0) {
            throw new CustomException(400, "Vui lòng chọn quán ăn hợp lệ");
        }
        if (productSort.getSortOrder() == null) {
            productSort.setSortOrder(0);
        }
        productSortMapper.insert(productSort);
    }

    @Override
    public void updateProductSort(ProductSort productSort) {
        if (productSort == null || productSort.getId() == null) {
            return;
        }
        ProductSort existing = productSortMapper.selectById(productSort.getId());
        if (existing != null) {
            Long currentShopId = com.linmour.security.utils.SecurityUtils.getShopId();
            if (currentShopId != null && currentShopId > 0 && existing.getShopId() != null && !existing.getShopId().equals(currentShopId)) {
                throw new CustomException(403, "Bạn không có quyền thao tác trên danh mục của quán khác");
            }
        }
        // Chỉ cho phép cập nhật sort và sortOrder; bỏ qua shopId, deleted, createBy...
        ProductSort updateEntity = new ProductSort();
        updateEntity.setId(productSort.getId());
        updateEntity.setSort(productSort.getSort());
        updateEntity.setSortOrder(productSort.getSortOrder());
        productSortMapper.updateById(updateEntity);
    }

    @Override
    public Result deleteProductSort(Long id) {
        if (id == null) {
            return Result.error("ID không hợp lệ");
        }
        ProductSort existing = productSortMapper.selectById(id);
        if (existing != null) {
            Long currentShopId = com.linmour.security.utils.SecurityUtils.getShopId();
            if (currentShopId != null && currentShopId > 0 && existing.getShopId() != null && !existing.getShopId().equals(currentShopId)) {
                throw new CustomException(403, "Bạn không có quyền thao tác trên danh mục của quán khác");
            }
        }
        Integer count = productInfoMapper.selectCount(new QueryWrapper<ProductInfo>()
                .eq("sort_id", id));
        if (count != null && count > 0) {
            return Result.error("Danh mục còn món, không thể xoá");
        }
        productSortMapper.deleteById(id);
        return Result.success();
    }
}





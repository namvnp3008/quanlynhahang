package com.linmour.product.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.util.ObjectUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.linmour.security.dtos.PageResult;
import com.linmour.security.dtos.Result;
import com.linmour.security.exception.CustomException;
import com.linmour.security.exception.enums.AppHttpCodeEnum;
import com.linmour.product.convert.*;
import com.linmour.product.mapper.*;
import com.linmour.product.pojo.Do.*;
import com.linmour.product.pojo.Dto.*;
import com.linmour.product.service.*;
import com.linmour.product.feign.SystemFeign;
import com.linmour.security.utils.SecurityUtils;
import com.linmour.system.pojo.Dto.AuditLogReqDto;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;

import static com.linmour.security.dtos.Result.success;

/**
 * @author linmour
 * @description 针对表【product_info】的数据库操作Service实现
 * @createDate 2023-08-12 18:34:04
 */
@Slf4j
@Service
public class ProductInfoServiceImpl extends ServiceImpl<ProductInfoMapper, ProductInfo>
        implements ProductInfoService {

    @Resource
    private SystemFeign systemFeign;

    @Resource
    private ProductInfoMapper productInfoMapper;
    @Resource
    private ProductInventoryService productInventoryService;
    @Resource
    private ProductSpecSortMapper productSpecSortMapper;
    @Resource
    private ProductSpecSortService productSpecSortService;
    @Resource
    private ProductInventoryMapper productInventoryMapper;
    @Resource
    private ProductSortService productSortService;
    @Resource
    private ProductSortMapper productSortMapper;
    @Resource
    private ProductSpecOptionMapper productSpecOptionMapper;
    @Resource
    private ProductSpecOptionService productSpecOptionService;
    @Resource
    private RProductInventotyMapper rProductInventotyMapper;
    @Resource
    private RProductInventotyService rProductInventotyService;


    @Override
    public Result getProductPage(ProductInfoPageDto dto) {
        Long shopId = SecurityUtils.getShopId();
        if (shopId == null || shopId <= 0) {
            throw new CustomException(400, "Vui lòng chọn quán ăn hợp lệ");
        }
        LambdaQueryWrapper<ProductInfo> countWrapper = new LambdaQueryWrapper<ProductInfo>()
                .eq(!ObjectUtil.isNull(dto.getSortId()), ProductInfo::getSortId, dto.getSortId())
                .eq(ProductInfo::getShopId, shopId);
        List<ProductInfo> productInfos = productInfoMapper.selectList(countWrapper);
        //因为前台的缘故，第一次没传sort值，所以要默认拿到第一个sort
        if (dto.getSortId() == null && productInfos.size() > 0)
            dto.setSortId(productInfos.get(0).getSortId());

        //这个是新店没有分类会报空指针
        if (dto.getSortId() == null)
            return success();
        List<ProductDetailDto> productDetails = getProductDetails(productInfos.stream().map(ProductInfo::getId).collect(Collectors.toList()));
        LambdaQueryWrapper<ProductInfo> pageWrapper = new LambdaQueryWrapper<ProductInfo>()
                .eq(StringUtils.isNotBlank(dto.getSortId().toString()), ProductInfo::getSortId, dto.getSortId())
                .eq(ProductInfo::getShopId, shopId);
        Page<ProductInfo> productInfoPage = page(new Page<ProductInfo>(dto.getPageNo(), dto.getPageSize()), pageWrapper);
        if (ObjectUtil.isNull(productInfoPage.getRecords()))
            throw new CustomException(AppHttpCodeEnum.PRODUCT_ERROR);


        return success(new PageResult<>(productDetails, productInfoPage.getTotal()));
    }

    @Override
    public void changeProduct(Long id, Integer status) {
        if (id == null) {
            throw new CustomException(400, "ID món không hợp lệ");
        }
        ProductInfo existing = this.getById(id);
        if (existing == null) {
            throw new CustomException(404, "Món ăn không tồn tại");
        }
        Long currentShopId = SecurityUtils.getShopId();
        if (currentShopId != null && currentShopId > 0 && existing.getShopId() != null && !existing.getShopId().equals(currentShopId)) {
            throw new CustomException(403, "Bạn không có quyền thao tác trên món ăn của quán khác");
        }
        productInfoMapper.update(null, new LambdaUpdateWrapper<ProductInfo>().eq(ProductInfo::getId, id).set(ProductInfo::getStatus, status));

        // S3: Audit PRODUCT_STATUS
        try {
            Long shopId = SecurityUtils.getShopId();
            Long userId = SecurityUtils.getUserId();
            String actor = (SecurityUtils.getLoginUser() != null && SecurityUtils.getLoginUser().getLoginVo() != null
                    && SecurityUtils.getLoginUser().getLoginVo().getPhone() != null)
                    ? SecurityUtils.getLoginUser().getLoginVo().getPhone() : "User " + userId;
            Integer uType = SecurityUtils.getUserType() != null ? SecurityUtils.getUserType() : 2;

            Map<String, Object> detail = new HashMap<>();
            detail.put("productId", id);
            detail.put("status", status);

            AuditLogReqDto auditDto = AuditLogReqDto.builder()
                    .shopId(shopId)
                    .merchantId(userId)
                    .actorName(actor)
                    .actorType(uType)
                    .action("PRODUCT_STATUS")
                    .targetType("product")
                    .targetId(String.valueOf(id))
                    .detail(detail)
                    .result("SUCCESS")
                    .build();

            CompletableFuture.runAsync(() -> {
                try {
                    systemFeign.recordInternalAudit(auditDto);
                } catch (Exception err) {
                    log.error("Lỗi gửi audit log PRODUCT_STATUS qua Feign: {}", err.getMessage());
                }
            });
        } catch (Exception ignored) {}
    }


    @Override
    public List<ProductDetailDto> getProductDetails(List<Long> productIds) {
        if (productIds.isEmpty())
            return new ArrayList<>();
        List<ProductInfo> productInfos = productInfoMapper.selectBatchIds(productIds);
        List<ProductDetailDto> productDetailDtos = ProductInfoConvert.IN.ProductInfoToProductDetailDto(productInfos);
        //查询规格分类
        List<ProductSpecSort> productSpecSorts = productSpecSortMapper.selectList(new LambdaQueryWrapper<ProductSpecSort>().in(productIds.size() > 0, ProductSpecSort::getProductId, productIds));
        List<Long> productSpecSortIds = productSpecSorts.stream().map(ProductSpecSort::getId).collect(Collectors.toList());
        //查询规格选项
        List<ProductSpecOption> productSpecOptions = productSpecOptionMapper.selectList(new LambdaQueryWrapper<ProductSpecOption>().in(productSpecSortIds.size() > 0, ProductSpecOption::getSpecSortId, productSpecSortIds));
        List<Long> sortIds = productInfos.stream().map(ProductInfo::getSortId).collect(Collectors.toList());
                //查出商品分类
        List<ProductSort> productSorts = productSortMapper.selectBatchIds(sortIds);
        productDetailDtos.forEach(m -> {
            //材料
            List<RProductInventoty> rProductInventoty = rProductInventotyMapper.selectList(new LambdaQueryWrapper<RProductInventoty>().in(RProductInventoty::getProductId,m.getId()));
            List<ProductInventoryAllDto> productInventoryAllDtos = BeanUtil.copyToList(rProductInventoty, ProductInventoryAllDto.class);
            if (!rProductInventoty.isEmpty()){
                List<Long> inventoryIds = rProductInventoty.stream().map(RProductInventoty::getInventoryId).collect(Collectors.toList());
                List<ProductInventory> productInventories = productInventoryMapper.selectList(new LambdaQueryWrapper<ProductInventory>().in(ProductInventory::getId, inventoryIds));
                productInventories.forEach(p ->{
                    productInventoryAllDtos.forEach(l ->{
                        if (p.getId().equals(l.getInventoryId())){
                            l.setName(p.getName());
                            l.setUnit(p.getUnit());
                        }
                    });
                });
                m.setInventoryAllList(productInventoryAllDtos);
            }

            List<ProductSortAndOption> productSortAndOptions = new ArrayList<>();
            productSorts.forEach(n -> {
                if (n.getId().equals(m.getSortId())) {
                    m.setSort(n.getSort());
                }
            });
            productSpecSorts.forEach(i -> {
                if (m.getId().equals(i.getProductId())) {
                    ProductSortAndOption productSortAndOption = new ProductSortAndOption();
                    productSortAndOption.setProductSpecSort(i);
                    List<ProductSpecOption> productSpecOption = new ArrayList<>();
                    productSpecOptions.forEach(j -> {
                        if (j.getSpecSortId().equals(i.getId())) {
                            productSpecOption.add(j);
                        }
                    });
                    productSortAndOption.setProductSpecOptions(productSpecOption);
                    productSortAndOptions.add(productSortAndOption);
                }
            });
            m.setProductSortAndOptions(productSortAndOptions);
        });


        return productDetailDtos;

    }

    @Override
    @org.springframework.transaction.annotation.Transactional(rollbackFor = Exception.class)
    public void saveOrUpdateProduct(AddProductDto product) {
        if (product == null) {
            throw new CustomException(400, "Thông tin món ăn không hợp lệ");
        }
        Long currentShopId = SecurityUtils.getShopId();
        if (currentShopId == null || currentShopId <= 0) {
            throw new CustomException(400, "Vui lòng chọn quán ăn hợp lệ");
        }

        ProductInfo existing = (product.getId() != null) ? this.getById(product.getId()) : null;
        if (product.getId() != null) {
            if (existing == null) {
                throw new CustomException(404, "Món ăn không tồn tại");
            }
            if (existing.getShopId() != null && !existing.getShopId().equals(currentShopId)) {
                throw new CustomException(403, "Bạn không có quyền thao tác trên món ăn của quán khác");
            }
        }

        ProductInfo productInfo = ProductInfoConvert.IN.AddProductDtoToProductInfo(product);
        if (product.getId() != null) {
            productInfo.setShopId(existing.getShopId());
            if (productInfo.getStatus() == null) {
                productInfo.setStatus(existing.getStatus() != null ? existing.getStatus() : 1);
            }
        } else {
            productInfo.setShopId(currentShopId);
            if (productInfo.getStatus() == null) {
                productInfo.setStatus(1);
            }
        }

        this.saveOrUpdate(productInfo);
        List<ProductSortAndOption> specSortAndOption = product.getSpecSortAndOption();
        List<Long> collect;

        //库存关系更新
        rProductInventotyMapper.delete(new LambdaQueryWrapper<RProductInventoty>().eq(RProductInventoty::getProductId, productInfo.getId()));
        if (product.getInventoryAllList() != null && !product.getInventoryAllList().isEmpty()) {
            List<RProductInventoty> rProductInventoties = BeanUtil.copyToList(product.getInventoryAllList(), RProductInventoty.class);
            rProductInventoties.forEach(r -> r.setProductId(productInfo.getId()));
            rProductInventotyService.saveOrUpdateBatch(rProductInventoties);
        }

        if (specSortAndOption != null && !specSortAndOption.isEmpty()) {
            collect = specSortAndOption.stream()
                    .map(ProductSortAndOption::getProductSpecSort)
                    .filter(java.util.Objects::nonNull)
                    .map(ProductSpecSort::getId)
                    .filter(java.util.Objects::nonNull)
                    .collect(Collectors.toList());
        } else {
            collect = new ArrayList<>();
        }

        //这些是要删除的规格
        List<ProductSpecSort> productSpecSorts = productSpecSortMapper.selectList(new LambdaQueryWrapper<ProductSpecSort>().eq(ProductSpecSort::getProductId, productInfo.getId()));
        if (productSpecSorts != null && !productSpecSorts.isEmpty()) {
            List<Long> specSortIds = productSpecSorts.stream().map(ProductSpecSort::getId).collect(Collectors.toList());
            List<Long> missingValues = specSortIds.stream()
                    .filter(value -> !collect.contains(value))
                    .collect(Collectors.toList());
            if (!missingValues.isEmpty()) {
                productSpecSortMapper.deleteBatchIds(missingValues);
                productSpecOptionMapper.delete(new LambdaQueryWrapper<ProductSpecOption>().in(ProductSpecOption::getSpecSortId, missingValues));
            }
        }

        //插入新增/更新的
        if (specSortAndOption != null) {
            specSortAndOption.forEach(n -> {
                ProductSpecSort productSpecSort = n.getProductSpecSort();
                if (productSpecSort != null) {
                    productSpecSort.setProductId(productInfo.getId());
                    productSpecSortService.saveOrUpdate(productSpecSort);
                    List<ProductSpecOption> productSpecOptions = n.getProductSpecOptions();
                    if (productSpecOptions != null && !productSpecOptions.isEmpty()) {
                        productSpecOptions.forEach(m -> {
                            m.setSpecSortId(productSpecSort.getId());
                        });
                        productSpecOptionService.saveOrUpdateBatch(productSpecOptions);
                    }
                }
            });
        }

        // S3: Audit PRODUCT_CREATE / PRODUCT_UPDATE
        try {
            Long shopId = SecurityUtils.getShopId();
            Long userId = SecurityUtils.getUserId();
            String actor = (SecurityUtils.getLoginUser() != null && SecurityUtils.getLoginUser().getLoginVo() != null
                    && SecurityUtils.getLoginUser().getLoginVo().getPhone() != null)
                    ? SecurityUtils.getLoginUser().getLoginVo().getPhone() : "User " + userId;
            Integer uType = SecurityUtils.getUserType() != null ? SecurityUtils.getUserType() : 2;

            boolean isCreate = (existing == null);
            String action = isCreate ? "PRODUCT_CREATE" : "PRODUCT_UPDATE";

            Map<String, Object> detail = new HashMap<>();
            detail.put("name", product.getName());
            detail.put("productId", productInfo.getId());
            if (!isCreate && existing.getPrice() != null && product.getPrice() != null
                    && existing.getPrice().compareTo(product.getPrice()) != 0) {
                detail.put("priceOld", existing.getPrice());
                detail.put("priceNew", product.getPrice());
            }

            AuditLogReqDto auditDto = AuditLogReqDto.builder()
                    .shopId(shopId != null && shopId > 0 ? shopId : (productInfo.getShopId() != null ? productInfo.getShopId() : null))
                    .merchantId(userId)
                    .actorName(actor)
                    .actorType(uType)
                    .action(action)
                    .targetType("product")
                    .targetId(String.valueOf(productInfo.getId()))
                    .detail(detail)
                    .result("SUCCESS")
                    .build();

            CompletableFuture.runAsync(() -> {
                try {
                    systemFeign.recordInternalAudit(auditDto);
                } catch (Exception err) {
                    log.error("Lỗi gửi audit log {} qua Feign: {}", action, err.getMessage());
                }
            });
        } catch (Exception ignored) {}
    }


    @Override
    public List<AppProductSort> getProductList() {
        Long shopId = SecurityUtils.getShopId();
        if (shopId == null || shopId <= 0) {
            throw new CustomException(400, "Vui lòng chọn quán ăn hợp lệ");
        }
        List<AppProductSort> sorts = ProductInfoConvert.IN.convert(productSortService.getProductSort());

        LambdaQueryWrapper<ProductInfo> queryWrapper = new LambdaQueryWrapper<ProductInfo>()
                .ne(ProductInfo::getStatus, 0)
                .eq(ProductInfo::getShopId, shopId);
        List<ProductDetailDto> productDetails = getProductDetails(productInfoMapper.selectList(queryWrapper).stream()
                .map(ProductInfo::getId).collect(Collectors.toList()));
        sorts.forEach(m -> {
            List<ProductDetailDto> productDetailDtos = new ArrayList<>();
            productDetails.forEach(n -> {
                if (m.getId().equals(n.getSortId()))
                    productDetailDtos.add(n);
            });
            m.setList(productDetailDtos);

        });
        return sorts;
    }

    @Override
    public void deletedProduct(Long id) {
        if (id == null) {
            throw new CustomException(400, "ID món không hợp lệ");
        }
        ProductInfo existing = this.getById(id);
        if (existing == null) {
            return;
        }
        Long currentShopId = SecurityUtils.getShopId();
        if (currentShopId != null && currentShopId > 0 && existing.getShopId() != null && !existing.getShopId().equals(currentShopId)) {
            throw new CustomException(403, "Bạn không có quyền thao tác trên món ăn của quán khác");
        }
        productInfoMapper.deleteById(id);

        // S3: Audit PRODUCT_DELETE
        try {
            Long shopId = SecurityUtils.getShopId();
            Long userId = SecurityUtils.getUserId();
            String actor = (SecurityUtils.getLoginUser() != null && SecurityUtils.getLoginUser().getLoginVo() != null
                    && SecurityUtils.getLoginUser().getLoginVo().getPhone() != null)
                    ? SecurityUtils.getLoginUser().getLoginVo().getPhone() : "User " + userId;
            Integer uType = SecurityUtils.getUserType() != null ? SecurityUtils.getUserType() : 2;

            Map<String, Object> detail = new HashMap<>();
            detail.put("productId", id);
            if (existing != null) {
                detail.put("name", existing.getName());
            }

            AuditLogReqDto auditDto = AuditLogReqDto.builder()
                    .shopId(shopId != null && shopId > 0 ? shopId : (existing != null ? existing.getShopId() : null))
                    .merchantId(userId)
                    .actorName(actor)
                    .actorType(uType)
                    .action("PRODUCT_DELETE")
                    .targetType("product")
                    .targetId(String.valueOf(id))
                    .detail(detail)
                    .result("SUCCESS")
                    .build();

            CompletableFuture.runAsync(() -> {
                try {
                    systemFeign.recordInternalAudit(auditDto);
                } catch (Exception err) {
                    log.error("Lỗi gửi audit log PRODUCT_DELETE qua Feign: {}", err.getMessage());
                }
            });
        } catch (Exception ignored) {}
    }
}




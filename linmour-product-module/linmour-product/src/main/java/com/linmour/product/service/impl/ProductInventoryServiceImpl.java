package com.linmour.product.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.util.ObjectUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.linmour.product.mapper.ProductInfoMapper;
import com.linmour.product.mapper.ProductInventoryMapper;
import com.linmour.product.mapper.RProductInventotyMapper;
import com.linmour.product.pojo.Do.ProductInfo;
import com.linmour.product.pojo.Do.ProductInventory;
import com.linmour.product.pojo.Do.RProductInventoty;
import com.linmour.product.pojo.Dto.ProductInventoryAllDto;
import com.linmour.product.pojo.Dto.ReduceInventoryDto;
import com.linmour.product.service.ProductInventoryService;
import com.linmour.security.dtos.PageResult;
import com.linmour.security.dtos.Result;
import com.linmour.security.exception.CustomException;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.annotation.Resource;
import java.util.*;
import java.util.stream.Collectors;

import static com.linmour.security.utils.SecurityUtils.getShopId;

/**
 * @author linmour
 * @description 针对表【product_inventory】的数据库操作Service实现
 * @createDate 2023-08-12 18:34:04
 */
@Service
public class ProductInventoryServiceImpl extends ServiceImpl<ProductInventoryMapper, ProductInventory>
        implements ProductInventoryService {

    private static final Logger log = LoggerFactory.getLogger(ProductInventoryServiceImpl.class);

    @Resource
    private ProductInventoryMapper productInventoryMapper;
    @Resource
    private ProductInfoMapper productInfoMapper;
    @Resource
    private RProductInventotyMapper rProductInventotyMapper;
    @Resource
    private RedissonClient redissonClient;

    @Override
    public PageResult getProductInventory(ProductInventoryAllDto dto) {
        Long shopId = getShopId();
        if (shopId == null || shopId <= 0) {
            throw new CustomException(400, "Vui lòng chọn quán ăn hợp lệ");
        }
        List<ProductInventory> productInventories = productInventoryMapper.selectList(
                new LambdaQueryWrapper<ProductInventory>().eq(ProductInventory::getShopId, shopId)
        );
        if (productInventories == null || productInventories.isEmpty()) {
            return new PageResult<>(new ArrayList<>(), 0L);
        }
        List<ProductInventoryAllDto> productInventoryAllDtos = BeanUtil.copyToList(productInventories, ProductInventoryAllDto.class);
        List<Long> inventorieIds = productInventories.stream().map(ProductInventory::getId).collect(Collectors.toList());
        List<RProductInventoty> rProductInventoties = inventorieIds.isEmpty() ? new ArrayList<>() :
                rProductInventotyMapper.selectList(new LambdaQueryWrapper<RProductInventoty>().in(RProductInventoty::getInventoryId, inventorieIds));
        List<Long> productIds = rProductInventoties.stream().map(RProductInventoty::getProductId).collect(Collectors.toList());
        List<ProductInfo> productInfos = productIds.isEmpty() ? new ArrayList<>() : productInfoMapper.selectBatchIds(productIds);
        productInventoryAllDtos.forEach(n -> {
            List<ProductInfo> productInfos1 = new ArrayList<>();
            rProductInventoties.forEach(o -> {
                productInfos.forEach(l -> {
                    if (o.getProductId().equals(l.getId()) && o.getInventoryId().equals(n.getId()))
                        productInfos1.add(l);
                });
            });
            n.setProductInfo(productInfos1);

        });

        return new PageResult<>(productInventoryAllDtos, Long.valueOf(productInventoryAllDtos.size()));
    }

    @Override
    public void createInventory(ProductInventoryAllDto dto) {
        if (dto == null) {
            throw new CustomException(400, "Thông tin nguyên liệu không hợp lệ");
        }
        Long currentShopId = getShopId();
        if (currentShopId == null || currentShopId <= 0) {
            throw new CustomException(400, "Vui lòng chọn quán ăn hợp lệ");
        }
        ProductInventory inv = BeanUtil.copyProperties(dto, ProductInventory.class);
        inv.setShopId(currentShopId);
        productInventoryMapper.insert(inv);
    }

    @Override
    public void deletedInventory(Long id) {
        if (id == null) {
            throw new CustomException(400, "ID nguyên liệu không hợp lệ");
        }
        ProductInventory existing = productInventoryMapper.selectById(id);
        if (existing == null) {
            return;
        }
        Long currentShopId = getShopId();
        if (currentShopId != null && currentShopId > 0 && existing.getShopId() != null && !existing.getShopId().equals(currentShopId)) {
            throw new CustomException(403, "Bạn không có quyền thao tác trên kho của quán khác");
        }
        productInventoryMapper.deleteById(id);
    }

    @Override
    public ProductInventory getProductInventoryById(Long id) {
        if (id == null) {
            return null;
        }
        ProductInventory existing = productInventoryMapper.selectById(id);
        if (existing == null) {
            return null;
        }
        Long currentShopId = getShopId();
        if (currentShopId != null && currentShopId > 0 && existing.getShopId() != null && !existing.getShopId().equals(currentShopId)) {
            throw new CustomException(403, "Bạn không có quyền xem kho của quán khác");
        }
        return existing;
    }

    @Override
    public void updateInventory(ProductInventory productInventory) {
        if (productInventory == null || productInventory.getId() == null) {
            throw new CustomException(400, "Thông tin nguyên liệu không hợp lệ");
        }
        ProductInventory existing = productInventoryMapper.selectById(productInventory.getId());
        if (existing == null) {
            throw new CustomException(404, "Nguyên liệu không tồn tại");
        }
        Long currentShopId = getShopId();
        if (currentShopId != null && currentShopId > 0 && existing.getShopId() != null && !existing.getShopId().equals(currentShopId)) {
            throw new CustomException(403, "Bạn không có quyền thao tác trên kho của quán khác");
        }
        productInventory.setShopId(existing.getShopId());
        productInventoryMapper.updateById(productInventory);
    }

    /**
     * Q8 / Backlog F3: Trừ kho theo số lượng:
     * - Nhận [{productId, quantity}]
     * - Trừ định mức × quantity trong 1 transaction + khoá Redisson theo kho
     * - Chặn âm: hết hàng thì trả lỗi "Món {tên} đã hết hàng"
     * - Khi tồn kho <= threshold: tự động cập nhật ProductInfo status = 0 (hạ kệ món)
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public Result reduceInventories(List<ReduceInventoryDto> list) {
        if (list == null || list.isEmpty()) {
            return Result.success();
        }

        // 1. Group quantities by productId (handle duplicate items in order)
        Map<Long, Integer> productQtyMap = new HashMap<>();
        for (ReduceInventoryDto item : list) {
            if (item != null && item.getProductId() != null) {
                int qty = (item.getQuantity() != null && item.getQuantity() > 0) ? item.getQuantity() : 1;
                productQtyMap.merge(item.getProductId(), qty, Integer::sum);
            }
        }
        if (productQtyMap.isEmpty()) {
            return Result.success();
        }

        List<Long> productIds = new ArrayList<>(productQtyMap.keySet());

        // 2. Query recipe / quota mappings
        List<RProductInventoty> rels = rProductInventotyMapper.selectList(
                new LambdaQueryWrapper<RProductInventoty>().in(RProductInventoty::getProductId, productIds)
        );
        if (rels == null || rels.isEmpty()) {
            return Result.success();
        }

        // 3. Map inventory needed and map inventory to productId
        Map<Long, Integer> inventoryNeedMap = new HashMap<>();
        Map<Long, Long> inventoryToProductMap = new HashMap<>();

        for (RProductInventoty rel : rels) {
            Long invId = rel.getInventoryId();
            Long pId = rel.getProductId();
            int quota = (rel.getNum() != null && rel.getNum() > 0) ? rel.getNum() : 1;
            int orderQty = productQtyMap.getOrDefault(pId, 1);
            int needed = quota * orderQty;

            inventoryNeedMap.merge(invId, needed, Integer::sum);
            inventoryToProductMap.put(invId, pId);
        }

        List<Long> sortedInvIds = inventoryNeedMap.keySet().stream().sorted().collect(Collectors.toList());
        if (sortedInvIds.isEmpty()) {
            return Result.success();
        }

        // 4. Acquire distributed locks in sorted order
        List<RLock> acquiredLocks = new ArrayList<>();
        try {
            for (Long invId : sortedInvIds) {
                RLock lock = redissonClient.getLock("lock:inventory:" + invId);
                lock.lock();
                acquiredLocks.add(lock);
            }

            // 5. Query latest inventory records from DB
            List<ProductInventory> inventories = productInventoryMapper.selectBatchIds(sortedInvIds);
            Map<Long, ProductInventory> invMap = inventories != null
                    ? inventories.stream().collect(Collectors.toMap(ProductInventory::getId, inv -> inv))
                    : Collections.emptyMap();

            // Validate all stock sufficiency first
            for (Long invId : sortedInvIds) {
                ProductInventory inv = invMap.get(invId);
                int needed = inventoryNeedMap.get(invId);
                int currentStock = (inv != null && inv.getNum() != null) ? inv.getNum() : 0;

                if (inv == null || currentStock < needed) {
                    Long failedPid = inventoryToProductMap.get(invId);
                    ProductInfo failedProd = productInfoMapper.selectById(failedPid);
                    String dishName = (failedProd != null && failedProd.getName() != null)
                            ? failedProd.getName()
                            : "sản phẩm";
                    log.warn("Deduction failed: dish {} (id {}) needs {} of inventory {}, but available is {}",
                            dishName, failedPid, needed, invId, currentStock);
                    return Result.error(400, "Món " + dishName + " đã hết hàng");
                }
            }

            // 6. Deduct and check threshold
            List<Long> depletedInventoryIds = new ArrayList<>();
            for (Long invId : sortedInvIds) {
                ProductInventory inv = invMap.get(invId);
                int needed = inventoryNeedMap.get(invId);
                int remaining = inv.getNum() - needed;
                inv.setNum(remaining);
                productInventoryMapper.updateById(inv);

                if (inv.getThreshold() != null && remaining <= inv.getThreshold()) {
                    depletedInventoryIds.add(invId);
                }
            }

            // 7. Auto set status=0 on dishes whose ingredients reached threshold
            if (!depletedInventoryIds.isEmpty()) {
                List<RProductInventoty> depletedRels = rProductInventotyMapper.selectList(
                        new LambdaQueryWrapper<RProductInventoty>().in(RProductInventoty::getInventoryId, depletedInventoryIds)
                );
                if (depletedRels != null && !depletedRels.isEmpty()) {
                    List<Long> affectedProductIds = depletedRels.stream()
                            .map(RProductInventoty::getProductId)
                            .distinct()
                            .collect(Collectors.toList());
                    for (Long pid : affectedProductIds) {
                        ProductInfo pi = ProductInfo.builder().id(pid).status(0).build();
                        productInfoMapper.updateById(pi);
                    }
                    log.info("Auto offline products {} due to inventory depleted below threshold", affectedProductIds);
                }
            }

            return Result.success();
        } finally {
            for (int i = acquiredLocks.size() - 1; i >= 0; i--) {
                try {
                    acquiredLocks.get(i).unlock();
                } catch (Exception ignored) {}
            }
        }
    }
}

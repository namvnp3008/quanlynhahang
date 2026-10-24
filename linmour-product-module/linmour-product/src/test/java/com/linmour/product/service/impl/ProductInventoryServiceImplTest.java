package com.linmour.product.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.linmour.product.mapper.ProductInfoMapper;
import com.linmour.product.mapper.ProductInventoryMapper;
import com.linmour.product.mapper.RProductInventotyMapper;
import com.linmour.product.pojo.Do.ProductInfo;
import com.linmour.product.pojo.Do.ProductInventory;
import com.linmour.product.pojo.Do.RProductInventoty;
import com.linmour.product.pojo.Dto.ProductInventoryAllDto;
import com.linmour.product.pojo.Dto.ReduceInventoryDto;
import com.linmour.security.dtos.Result;
import com.linmour.security.exception.CustomException;
import com.linmour.security.utils.SecurityUtils;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@RunWith(MockitoJUnitRunner.Silent.class)
public class ProductInventoryServiceImplTest {

    @Mock
    private ProductInventoryMapper productInventoryMapper;

    @Mock
    private ProductInfoMapper productInfoMapper;

    @Mock
    private RProductInventotyMapper rProductInventotyMapper;

    @Mock
    private RedissonClient redissonClient;

    @Mock
    private RLock mockLock;

    @InjectMocks
    private ProductInventoryServiceImpl productInventoryService;

    @Before
    public void setup() {
        when(redissonClient.getLock(anyString())).thenReturn(mockLock);
    }

    @Test
    public void testReduceInventories_SuccessWithQuantityDeduction() {
        // Product 1 ordered with quantity = 2
        Long productId = 1L;
        ReduceInventoryDto orderItem = new ReduceInventoryDto(productId, 2);

        // Recipe: Product 1 requires 100g of Inventory 10 (Thịt bò) and 150g of Inventory 20 (Bánh phở)
        RProductInventoty recipe1 = new RProductInventoty();
        recipe1.setProductId(productId);
        recipe1.setInventoryId(10L);
        recipe1.setNum(100);

        RProductInventoty recipe2 = new RProductInventoty();
        recipe2.setProductId(productId);
        recipe2.setInventoryId(20L);
        recipe2.setNum(150);

        when(rProductInventotyMapper.selectList(any(LambdaQueryWrapper.class)))
                .thenReturn(Arrays.asList(recipe1, recipe2));

        // Available inventories in DB
        ProductInventory inv1 = new ProductInventory();
        inv1.setId(10L);
        inv1.setName("Thịt bò");
        inv1.setNum(1000);
        inv1.setThreshold(100);

        ProductInventory inv2 = new ProductInventory();
        inv2.setId(20L);
        inv2.setName("Bánh phở");
        inv2.setNum(1500);
        inv2.setThreshold(200);

        when(productInventoryMapper.selectBatchIds(anyList()))
                .thenReturn(Arrays.asList(inv1, inv2));

        Result result = productInventoryService.reduceInventories(Collections.singletonList(orderItem));

        assertNotNull(result);
        assertEquals(200, (int) result.getCode());

        // Verify updateById deductions:
        // inv1: 1000 - (100 * 2) = 800
        // inv2: 1500 - (150 * 2) = 1200
        ArgumentCaptor<ProductInventory> captor = ArgumentCaptor.forClass(ProductInventory.class);
        verify(productInventoryMapper, times(2)).updateById(captor.capture());

        List<ProductInventory> updatedList = captor.getAllValues();
        assertEquals(800, (int) updatedList.get(0).getNum());
        assertEquals(1200, (int) updatedList.get(1).getNum());

        // Verify lock and unlock were called
        verify(mockLock, atLeastOnce()).lock();
        verify(mockLock, atLeastOnce()).unlock();
    }

    @Test
    public void testReduceInventories_OutOfStock_ReturnsErrorWithDishName() {
        // Product 1 ordered with quantity = 5 (needs 500g)
        Long productId = 1L;
        ReduceInventoryDto orderItem = new ReduceInventoryDto(productId, 5);

        RProductInventoty recipe = new RProductInventoty();
        recipe.setProductId(productId);
        recipe.setInventoryId(10L);
        recipe.setNum(100);

        when(rProductInventotyMapper.selectList(any(LambdaQueryWrapper.class)))
                .thenReturn(Collections.singletonList(recipe));

        // Only 300g available in DB
        ProductInventory inv = new ProductInventory();
        inv.setId(10L);
        inv.setName("Thịt bò");
        inv.setNum(300);
        inv.setThreshold(50);

        when(productInventoryMapper.selectBatchIds(anyList()))
                .thenReturn(Collections.singletonList(inv));

        ProductInfo productInfo = ProductInfo.builder()
                .id(productId)
                .name("Phở Bò Tái Nạm")
                .status(1)
                .build();
        when(productInfoMapper.selectById(productId)).thenReturn(productInfo);

        Result result = productInventoryService.reduceInventories(Collections.singletonList(orderItem));

        assertNotNull(result);
        assertEquals(400, (int) result.getCode());
        assertEquals("Món Phở Bò Tái Nạm đã hết hàng", result.getMsg());

        // DB update should NOT occur when out of stock
        verify(productInventoryMapper, never()).updateById(any());

        // Lock must still be released in finally block
        verify(mockLock, atLeastOnce()).unlock();
    }

    @Test
    public void testReduceInventories_ThresholdReached_AutoSetsProductStatusZero() {
        // Product 2 ordered with quantity = 2 (needs 2 units of Inventory 30)
        Long productId = 2L;
        ReduceInventoryDto orderItem = new ReduceInventoryDto(productId, 2);

        RProductInventoty recipe = new RProductInventoty();
        recipe.setProductId(productId);
        recipe.setInventoryId(30L);
        recipe.setNum(1);

        when(rProductInventotyMapper.selectList(any(LambdaQueryWrapper.class)))
                .thenReturn(Collections.singletonList(recipe));

        // Stock = 10, threshold = 8.
        // Deduction: 10 - 2 = 8 <= threshold (8). Triggers auto offline!
        ProductInventory inv = new ProductInventory();
        inv.setId(30L);
        inv.setName("Sườn nướng");
        inv.setNum(10);
        inv.setThreshold(8);

        when(productInventoryMapper.selectBatchIds(anyList()))
                .thenReturn(Collections.singletonList(inv));

        Result result = productInventoryService.reduceInventories(Collections.singletonList(orderItem));

        assertNotNull(result);
        assertEquals(200, (int) result.getCode());
        assertEquals(8, (int) inv.getNum());

        // Verify productInfoMapper was updated to status 0
        verify(productInfoMapper, times(1)).updateById(argThat(p ->
                p != null && Long.valueOf(2L).equals(p.getId()) && Integer.valueOf(0).equals(p.getStatus())
        ));
    }

    @Test
    public void testReduceInventories_ConcurrentRequests_NoNegativeStock() throws InterruptedException {
        // Test 10 concurrent threads attempting to deduct from a stock of 10
        // Each order takes 4 units. Only 2 orders (8 units) can succeed, the rest must fail (out of stock).
        int threadCount = 8;
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        CountDownLatch startLatch = new CountDownLatch(1);
        CountDownLatch doneLatch = new CountDownLatch(threadCount);

        AtomicInteger currentStock = new AtomicInteger(10);
        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger failureCount = new AtomicInteger(0);

        // Synchronize on a real ReentrantLock in place of Redisson for concurrency unit test
        java.util.concurrent.locks.ReentrantLock realLock = new java.util.concurrent.locks.ReentrantLock();
        RLock testLock = mock(RLock.class);
        doAnswer(invocation -> {
            realLock.lock();
            return null;
        }).when(testLock).lock();
        doAnswer(invocation -> {
            realLock.unlock();
            return null;
        }).when(testLock).unlock();
        when(redissonClient.getLock(anyString())).thenReturn(testLock);

        RProductInventoty recipe = new RProductInventoty();
        recipe.setProductId(100L);
        recipe.setInventoryId(99L);
        recipe.setNum(4);

        when(rProductInventotyMapper.selectList(any(LambdaQueryWrapper.class)))
                .thenReturn(Collections.singletonList(recipe));

        ProductInfo mockProduct = ProductInfo.builder().id(100L).name("Cà Phê Sữa").build();
        when(productInfoMapper.selectById(100L)).thenReturn(mockProduct);

        doAnswer(inv -> {
            ProductInventory pi = new ProductInventory();
            pi.setId(99L);
            pi.setNum(currentStock.get());
            pi.setThreshold(0);
            return Collections.singletonList(pi);
        }).when(productInventoryMapper).selectBatchIds(anyList());

        doAnswer(inv -> {
            ProductInventory pi = inv.getArgument(0);
            currentStock.set(pi.getNum());
            return 1;
        }).when(productInventoryMapper).updateById(any(ProductInventory.class));

        for (int i = 0; i < threadCount; i++) {
            executor.submit(() -> {
                try {
                    startLatch.await();
                    Result r = productInventoryService.reduceInventories(
                            Collections.singletonList(new ReduceInventoryDto(100L, 1))
                    );
                    if (r.getCode() == 200) {
                        successCount.incrementAndGet();
                    } else {
                        failureCount.incrementAndGet();
                    }
                } catch (Exception e) {
                    failureCount.incrementAndGet();
                } finally {
                    doneLatch.countDown();
                }
            });
        }

        startLatch.countDown();
        assertTrue(doneLatch.await(5, TimeUnit.SECONDS));
        executor.shutdown();

        // Stock was 10, each order takes 4: exactly 2 orders can succeed (10 - 4 - 4 = 2 remaining)
        assertEquals(2, successCount.get());
        assertEquals(6, failureCount.get());
        assertEquals(2, currentStock.get());
        assertTrue(currentStock.get() >= 0);
    }

    @Test
    public void testCreateInventory_AssignsShopId() {
        SecurityUtils.setShopId(1L);
        try {
            ProductInventoryAllDto dto = new ProductInventoryAllDto();
            dto.setName("Đường cát trắng");
            dto.setNum(100);

            productInventoryService.createInventory(dto);

            ArgumentCaptor<ProductInventory> captor = ArgumentCaptor.forClass(ProductInventory.class);
            verify(productInventoryMapper).insert(captor.capture());
            assertEquals(Long.valueOf(1L), captor.getValue().getShopId());
            assertEquals("Đường cát trắng", captor.getValue().getName());
        } finally {
            SecurityUtils.clearAll();
        }
    }

    @Test
    public void testCreateInventoryMissingShop_Throws400() {
        SecurityUtils.clearShopId();
        ProductInventoryAllDto dto = new ProductInventoryAllDto();
        dto.setName("Sữa tươi");

        try {
            productInventoryService.createInventory(dto);
            fail("Expected CustomException 400 when shop is missing");
        } catch (CustomException e) {
            assertEquals(400, e.getCode());
            assertTrue(e.getMessage().contains("quán ăn"));
        }
    }

    @Test
    public void testUpdateInventoryOtherShop_Throws403() {
        SecurityUtils.setShopId(1L);
        try {
            ProductInventory existing = new ProductInventory();
            existing.setId(50L);
            existing.setShopId(2L); // Thuộc shop 2
            when(productInventoryMapper.selectById(50L)).thenReturn(existing);

            ProductInventory toUpdate = new ProductInventory();
            toUpdate.setId(50L);
            toUpdate.setName("Tên mới");

            productInventoryService.updateInventory(toUpdate);
            fail("Expected CustomException 403 when updating inventory of other shop");
        } catch (CustomException e) {
            assertEquals(403, e.getCode());
            assertTrue(e.getMessage().contains("quán khác"));
        } finally {
            SecurityUtils.clearAll();
        }
    }

    @Test
    public void testGetProductInventoryMissingShop_Throws400() {
        SecurityUtils.clearShopId();
        try {
            productInventoryService.getProductInventory(new ProductInventoryAllDto());
            fail("Expected CustomException 400 when shop is missing");
        } catch (CustomException e) {
            assertEquals(400, e.getCode());
            assertTrue(e.getMessage().contains("quán ăn"));
        }
    }

    @Test
    public void testDeletedInventoryOtherShop_Throws403() {
        SecurityUtils.setShopId(1L);
        try {
            ProductInventory existing = new ProductInventory();
            existing.setId(50L);
            existing.setShopId(2L);
            when(productInventoryMapper.selectById(50L)).thenReturn(existing);

            productInventoryService.deletedInventory(50L);
            fail("Expected CustomException 403 when deleting inventory of other shop");
        } catch (CustomException e) {
            assertEquals(403, e.getCode());
            assertTrue(e.getMessage().contains("quán khác"));
        } finally {
            SecurityUtils.clearAll();
        }
    }
}

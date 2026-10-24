package com.linmour.product.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.linmour.product.mapper.ProductInfoMapper;
import com.linmour.product.mapper.ProductSortMapper;
import com.linmour.product.pojo.Do.ProductSort;
import com.linmour.security.dtos.Result;
import com.linmour.security.exception.CustomException;
import com.linmour.security.utils.SecurityUtils;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;

import java.util.Arrays;
import java.util.List;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@RunWith(MockitoJUnitRunner.class)
public class ProductSortServiceImplTest {

    @Mock
    private ProductSortMapper productSortMapper;

    @Mock
    private ProductInfoMapper productInfoMapper;

    @InjectMocks
    private ProductSortServiceImpl productSortService;

    @Before
    public void setUp() {
        SecurityUtils.setShopId(1L);
    }

    @After
    public void tearDown() {
        SecurityUtils.clearAll();
    }

    @Test
    public void testGetProductSortWithoutShopId_Throws400() {
        SecurityUtils.clearAll();
        try {
            productSortService.getProductSort();
            fail("Expected CustomException 400 when shopId is missing");
        } catch (CustomException e) {
            assertEquals(400, e.getCode());
            assertTrue(e.getMessage().contains("quán ăn"));
        }
    }

    @Test
    public void testGetProductSortOrderedBySortOrderThenId() {
        ProductSort sort1 = new ProductSort();
        sort1.setId(1L);
        sort1.setSort("Phở & Bún");
        sort1.setSortOrder(10);

        ProductSort sort2 = new ProductSort();
        sort2.setId(2L);
        sort2.setSort("Cà Phê");
        sort2.setSortOrder(5);

        when(productSortMapper.selectList(any())).thenReturn(Arrays.asList(sort2, sort1));

        List<ProductSort> list = productSortService.getProductSort();
        assertNotNull(list);
        assertEquals(2, list.size());
        assertEquals("Cà Phê", list.get(0).getSort());
        assertEquals("Phở & Bún", list.get(1).getSort());

        verify(productSortMapper).selectList(any());
    }

    @Test
    public void testDeleteProductSortFailsWhenProductsExist() {
        when(productInfoMapper.selectCount(any())).thenReturn(3);

        Result result = productSortService.deleteProductSort(1L);
        assertNotNull(result);
        assertEquals(Integer.valueOf(201), result.getCode());
        assertEquals("Danh mục còn món, không thể xoá", result.getMsg());

        verify(productSortMapper, never()).deleteById(any());
    }

    @Test
    public void testDeleteProductSortSuccessWhenEmpty() {
        when(productInfoMapper.selectCount(any())).thenReturn(0);
        when(productSortMapper.deleteById(5L)).thenReturn(1);

        Result result = productSortService.deleteProductSort(5L);
        assertNotNull(result);
        assertEquals(Integer.valueOf(200), result.getCode());

        verify(productSortMapper).deleteById(5L);
    }

    @Test
    public void testUpdateProductSort() {
        ProductSort sort = new ProductSort();
        sort.setId(2L);
        sort.setSort("Cơm Đĩa & Món Nóng");
        sort.setSortOrder(2);

        when(productSortMapper.updateById(any(ProductSort.class))).thenReturn(1);

        productSortService.updateProductSort(sort);

        verify(productSortMapper).updateById(argThat(entity ->
            entity.getId().equals(2L) &&
            "Cơm Đĩa & Món Nóng".equals(entity.getSort()) &&
            Integer.valueOf(2).equals(entity.getSortOrder()) &&
            entity.getShopId() == null &&
            entity.getDeleted() == null
        ));
    }

    @Test
    public void testUpdateProductSortIgnoresShopIdAndDeleted() {
        ProductSort payload = new ProductSort();
        payload.setId(2L);
        payload.setSort("Cơm Đĩa");
        payload.setSortOrder(3);
        payload.setShopId(999L);
        payload.setDeleted(1);

        when(productSortMapper.updateById(any(ProductSort.class))).thenReturn(1);

        productSortService.updateProductSort(payload);

        verify(productSortMapper).updateById(argThat(entity ->
            entity.getId().equals(2L) &&
            "Cơm Đĩa".equals(entity.getSort()) &&
            Integer.valueOf(3).equals(entity.getSortOrder()) &&
            entity.getShopId() == null &&
            entity.getDeleted() == null
        ));
    }
}

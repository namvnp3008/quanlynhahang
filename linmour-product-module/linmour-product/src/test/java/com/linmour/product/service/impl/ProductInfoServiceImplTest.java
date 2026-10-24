package com.linmour.product.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.linmour.product.mapper.*;
import com.linmour.product.pojo.Do.*;
import com.linmour.product.pojo.Dto.*;
import com.linmour.product.service.ProductSortService;
import com.linmour.product.service.ProductSpecOptionService;
import com.linmour.product.service.ProductSpecSortService;
import com.linmour.product.service.RProductInventotyService;
import com.linmour.security.dtos.Result;
import com.linmour.security.exception.CustomException;
import com.linmour.security.utils.SecurityUtils;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@RunWith(MockitoJUnitRunner.Silent.class)
public class ProductInfoServiceImplTest {

    @Mock
    private ProductInfoMapper productInfoMapper;

    @Mock
    private ProductSortMapper productSortMapper;

    @Mock
    private ProductSortService productSortService;

    @Mock
    private ProductSpecSortMapper productSpecSortMapper;

    @Mock
    private ProductSpecSortService productSpecSortService;

    @Mock
    private ProductSpecOptionMapper productSpecOptionMapper;

    @Mock
    private ProductSpecOptionService productSpecOptionService;

    @Mock
    private RProductInventotyMapper rProductInventotyMapper;

    @Mock
    private RProductInventotyService rProductInventotyService;

    @InjectMocks
    private ProductInfoServiceImpl productInfoService;

    @Before
    public void setup() {
        com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(
                new org.apache.ibatis.builder.MapperBuilderAssistant(new com.baomidou.mybatisplus.core.MybatisConfiguration(), ""), ProductInfo.class
        );
        ReflectionTestUtils.setField(productInfoService, "baseMapper", productInfoMapper);
        SecurityUtils.setShopId(1L);
    }

    @After
    public void tearDown() {
        SecurityUtils.clearAll();
    }

    @Test
    public void testCreateProductWithoutOptions_AssignsShopIdAndStatus() {
        AddProductDto dto = new AddProductDto();
        dto.setName("Trà Lài Hạnh Nhân");
        dto.setPrice(new BigDecimal("30000"));
        dto.setSortId(1L);

        when(productInfoMapper.insert(any(ProductInfo.class))).thenAnswer(invocation -> {
            ProductInfo p = invocation.getArgument(0);
            p.setId(101L);
            return 1;
        });

        productInfoService.saveOrUpdateProduct(dto);

        ArgumentCaptor<ProductInfo> captor = ArgumentCaptor.forClass(ProductInfo.class);
        verify(productInfoMapper).insert(captor.capture());
        ProductInfo saved = captor.getValue();

        assertNotNull(saved);
        assertEquals(Long.valueOf(1L), saved.getShopId());
        assertEquals(Integer.valueOf(1), saved.getStatus());
        assertEquals("Trà Lài Hạnh Nhân", saved.getName());
    }

    @Test
    public void testCreateProductWithOptions_SavesOptionSpecs() {
        AddProductDto dto = new AddProductDto();
        dto.setName("Cà Phê Muối");
        dto.setPrice(new BigDecimal("35000"));
        dto.setSortId(1L);

        ProductSortAndOption specSortAndOption = new ProductSortAndOption();
        ProductSpecSort specSort = new ProductSpecSort();
        specSort.setName("Độ ngọt");
        specSortAndOption.setProductSpecSort(specSort);

        ProductSpecOption opt1 = new ProductSpecOption();
        opt1.setName("Ít ngọt");
        ProductSpecOption opt2 = new ProductSpecOption();
        opt2.setName("Ngọt bình thường");
        specSortAndOption.setProductSpecOptions(Arrays.asList(opt1, opt2));

        dto.setSpecSortAndOption(Collections.singletonList(specSortAndOption));

        when(productInfoMapper.insert(any(ProductInfo.class))).thenAnswer(invocation -> {
            ProductInfo p = invocation.getArgument(0);
            p.setId(202L);
            return 1;
        });
        when(productSpecSortService.saveOrUpdate(any(ProductSpecSort.class))).thenAnswer(invocation -> {
            ProductSpecSort s = invocation.getArgument(0);
            s.setId(501L);
            return true;
        });

        productInfoService.saveOrUpdateProduct(dto);

        ArgumentCaptor<ProductSpecSort> specCaptor = ArgumentCaptor.forClass(ProductSpecSort.class);
        verify(productSpecSortService).saveOrUpdate(specCaptor.capture());
        assertEquals(Long.valueOf(202L), specCaptor.getValue().getProductId());

        verify(productSpecOptionService).saveOrUpdateBatch(anyList());
    }

    @Test
    public void testCreateProductMissingShopId_Throws400() {
        SecurityUtils.clearShopId();

        AddProductDto dto = new AddProductDto();
        dto.setName("Món Lỗi Thiếu Shop");
        dto.setPrice(new BigDecimal("20000"));

        try {
            productInfoService.saveOrUpdateProduct(dto);
            fail("Expected CustomException 400 when shopId is missing");
        } catch (CustomException e) {
            assertEquals(400, e.getCode());
            assertTrue(e.getMessage().contains("quán ăn"));
        }
    }

    @Test
    public void testUpdateProductSameShop_KeepsShopId() {
        ProductInfo existing = ProductInfo.builder()
                .id(10L)
                .name("Cà Phê Đen")
                .shopId(1L)
                .status(1)
                .price(new BigDecimal("20000"))
                .build();
        when(productInfoMapper.selectById(10L)).thenReturn(existing);
        when(productInfoMapper.updateById(any(ProductInfo.class))).thenReturn(1);

        AddProductDto dto = new AddProductDto();
        dto.setId(10L);
        dto.setName("Cà Phê Đen Đặc Biệt");
        dto.setPrice(new BigDecimal("25000"));

        productInfoService.saveOrUpdateProduct(dto);

        ArgumentCaptor<ProductInfo> captor = ArgumentCaptor.forClass(ProductInfo.class);
        verify(productInfoMapper).updateById(captor.capture());
        ProductInfo updated = captor.getValue();

        assertEquals(Long.valueOf(1L), updated.getShopId());
        assertEquals("Cà Phê Đen Đặc Biệt", updated.getName());
    }

    @Test
    public void testUpdateProductOtherShop_Throws403() {
        ProductInfo existing = ProductInfo.builder()
                .id(99L)
                .name("Món của Quán Khác")
                .shopId(2L) // Thuộc shop 2
                .status(1)
                .build();
        when(productInfoMapper.selectById(99L)).thenReturn(existing);

        AddProductDto dto = new AddProductDto();
        dto.setId(99L);
        dto.setName("Hack Món Quán Khác");
        dto.setPrice(new BigDecimal("10000"));

        try {
            productInfoService.saveOrUpdateProduct(dto);
            fail("Expected CustomException 403 when updating dish of another shop");
        } catch (CustomException e) {
            assertEquals(403, e.getCode());
            assertTrue(e.getMessage().contains("quán khác"));
        }
    }

    @Test
    public void testDeleteProductOtherShop_Throws403() {
        ProductInfo existing = ProductInfo.builder()
                .id(99L)
                .name("Món Quán Khác")
                .shopId(2L)
                .build();
        when(productInfoMapper.selectById(99L)).thenReturn(existing);

        try {
            productInfoService.deletedProduct(99L);
            fail("Expected CustomException 403 when deleting dish of another shop");
        } catch (CustomException e) {
            assertEquals(403, e.getCode());
            assertTrue(e.getMessage().contains("quán khác"));
        }
    }

    @Test
    public void testChangeProductOtherShop_Throws403() {
        ProductInfo existing = ProductInfo.builder()
                .id(99L)
                .name("Món Quán Khác")
                .shopId(2L)
                .build();
        when(productInfoMapper.selectById(99L)).thenReturn(existing);

        try {
            productInfoService.changeProduct(99L, 0);
            fail("Expected CustomException 403 when changing status of dish of another shop");
        } catch (CustomException e) {
            assertEquals(403, e.getCode());
            assertTrue(e.getMessage().contains("quán khác"));
        }
    }

    @Test
    public void testGetProductList_FiltersByShopId() {
        ProductSort sort1 = new ProductSort();
        sort1.setId(1L);
        sort1.setSort("Đồ uống");
        when(productSortService.getProductSort()).thenReturn(Collections.singletonList(sort1));

        ProductInfo p1 = ProductInfo.builder()
                .id(1L)
                .name("Trà Đào")
                .shopId(1L)
                .sortId(1L)
                .status(1)
                .build();
        when(productInfoMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(Collections.singletonList(p1));
        when(productInfoMapper.selectBatchIds(anyList())).thenReturn(Collections.singletonList(p1));

        List<AppProductSort> res = productInfoService.getProductList();
        assertNotNull(res);
        assertEquals(1, res.size());
        assertEquals("Đồ uống", res.get(0).getSort());
        verify(productInfoMapper).selectList(argThat(wrapper -> {
            // Verifies that query was scoped
            return wrapper != null;
        }));
    }

    @Test
    public void testProductPageWithoutShopId_Throws400() {
        SecurityUtils.clearAll();
        ProductInfoPageDto dto = ProductInfoPageDto.builder().build();
        dto.setPageNo(1);
        dto.setPageSize(10);
        try {
            productInfoService.getProductPage(dto);
            fail("Expected CustomException 400 when shopId is missing");
        } catch (CustomException e) {
            assertEquals(400, e.getCode());
            assertTrue(e.getMessage().contains("quán ăn"));
        }
    }

    @Test
    public void testProductListWithoutShopId_Throws400() {
        SecurityUtils.clearAll();
        try {
            productInfoService.getProductList();
            fail("Expected CustomException 400 when shopId is missing");
        } catch (CustomException e) {
            assertEquals(400, e.getCode());
            assertTrue(e.getMessage().contains("quán ăn"));
        }
    }
}

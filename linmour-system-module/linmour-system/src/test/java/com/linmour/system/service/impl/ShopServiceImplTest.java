package com.linmour.system.service.impl;

import com.linmour.security.dtos.LoginUser;
import com.linmour.security.dtos.LoginVo;
import com.linmour.security.exception.CustomException;
import com.linmour.security.exception.enums.AppHttpCodeEnum;
import com.linmour.system.pojo.Do.Shop;
import com.linmour.system.pojo.Dto.AppShopInfoDto;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Spy;
import org.mockito.junit.MockitoJUnitRunner;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.time.LocalTime;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doReturn;

@RunWith(MockitoJUnitRunner.class)
public class ShopServiceImplTest {

    @org.mockito.Mock
    private com.linmour.system.mapper.ShopMapper shopMapper;

    @org.mockito.Mock
    private com.linmour.system.service.AuditService auditService;

    @Spy
    @InjectMocks
    private ShopServiceImpl shopService;

    @Test
    public void testGetShopInfoSuccessWithQ4Fields() {
        Shop shop = new Shop();
        shop.setId(1L);
        shop.setName("Nhà Hàng Bếp Việt");
        shop.setPosition("Số 128 Xuân Thủy, Cầu Giấy, Hà Nội");
        shop.setAddress("Số 128 Xuân Thủy, Cầu Giấy, Hà Nội");
        shop.setPhone("0912345678");
        shop.setBusinessHours(LocalTime.of(7, 0, 0));
        shop.setOpenTime(LocalTime.of(7, 0, 0));
        shop.setCloseTime(LocalTime.of(22, 0, 0));
        shop.setAuditStatus(1);
        shop.setShopStatus(1);
        shop.setMerchantId(999L);
        shop.setFeeRate(new BigDecimal("0.05"));
        shop.setCertificate("http://secret.cert.png");

        doReturn(shop).when(shopService).getById(1L);

        AppShopInfoDto info = shopService.getShopInfo(1L);
        assertNotNull(info);
        assertEquals(Long.valueOf(1L), info.getId());
        assertEquals("Nhà Hàng Bếp Việt", info.getName());
        assertEquals("Số 128 Xuân Thủy, Cầu Giấy, Hà Nội", info.getPosition());
        assertEquals("Số 128 Xuân Thủy, Cầu Giấy, Hà Nội", info.getAddress());
        assertEquals("0912345678", info.getPhone());
        assertEquals("07:00", info.getBusinessHours());
        assertEquals("07:00", info.getOpenTime());
        assertEquals("22:00", info.getCloseTime());
        assertEquals(Integer.valueOf(1), info.getAuditStatus());
        assertEquals(Integer.valueOf(1), info.getShopStatus());
    }

    @Test
    public void testGetShopInfoFallbackToLegacyFieldsWhenNewAreNull() {
        Shop shop = new Shop();
        shop.setId(1L);
        shop.setName("Nhà Hàng Bếp Việt");
        shop.setPosition("Phố Cổ Hà Nội");
        shop.setBusinessHours(LocalTime.of(8, 30, 0));
        shop.setAuditStatus(1);
        shop.setShopStatus(1);

        doReturn(shop).when(shopService).getById(1L);

        AppShopInfoDto info = shopService.getShopInfo(1L);
        assertNotNull(info);
        assertEquals("Phố Cổ Hà Nội", info.getAddress());
        assertEquals("08:30", info.getOpenTime());
        assertNull(info.getCloseTime());
        assertNull(info.getPhone());
    }

    @Test
    public void testGetShopInfoReturnsNullWhenDeleted() {
        Shop shop = new Shop();
        shop.setId(2L);
        shop.setDeleted(1);

        doReturn(shop).when(shopService).getById(2L);

        AppShopInfoDto info = shopService.getShopInfo(2L);
        assertNull(info);
    }

    @Test
    public void testGetShopInfoReturnsNullWhenNotFound() {
        doReturn(null).when(shopService).getById(99L);

        AppShopInfoDto info = shopService.getShopInfo(99L);
        assertNull(info);
    }

    @After
    public void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private void setupMockUser(Long userId, Integer userType) {
        LoginVo vo = new LoginVo();
        vo.setId(userId);
        vo.setType(userType);
        LoginUser loginUser = new LoginUser(vo);
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(loginUser, null, null);
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    @Test
    public void testCreateNewShopEnforcesAuditStatus2AndShopStatus1AndCurrentUserMerchantId() {
        setupMockUser(10L, 2);

        Shop newShop = new Shop();
        newShop.setName("Quán Phở Mới");
        newShop.setFeeRate(new BigDecimal("0.50"));
        newShop.setAuditStatus(1);

        doReturn(true).when(shopService).save(any(Shop.class));

        shopService.save0rUpdateShop(newShop);

        ArgumentCaptor<Shop> captor = ArgumentCaptor.forClass(Shop.class);
        org.mockito.Mockito.verify(shopService).save(captor.capture());
        Shop saved = captor.getValue();

        assertEquals(Long.valueOf(10L), saved.getMerchantId());
        assertEquals(Integer.valueOf(2), saved.getAuditStatus());
        assertEquals(Integer.valueOf(1), saved.getShopStatus());
        assertEquals(0, saved.getFeeRate().compareTo(new BigDecimal("0.00")));
    }

    @Test
    public void testUpdateOwnShopPreservesAuditStatusAndFeeRateAndMerchantId() {
        setupMockUser(10L, 2);

        Shop existing = new Shop();
        existing.setId(5L);
        existing.setName("Quán Cũ");
        existing.setMerchantId(10L);
        existing.setAuditStatus(1);
        existing.setFeeRate(new BigDecimal("0.03"));

        doReturn(existing).when(shopService).getById(5L);
        doReturn(true).when(shopService).updateById(any(Shop.class));

        Shop updateRequest = new Shop();
        updateRequest.setId(5L);
        updateRequest.setName("Quán Đã Đổi Tên");
        updateRequest.setMerchantId(999L);
        updateRequest.setAuditStatus(0);
        updateRequest.setFeeRate(new BigDecimal("0.00"));

        shopService.save0rUpdateShop(updateRequest);

        ArgumentCaptor<Shop> captor = ArgumentCaptor.forClass(Shop.class);
        org.mockito.Mockito.verify(shopService).updateById(captor.capture());
        Shop updated = captor.getValue();

        assertEquals("Quán Đã Đổi Tên", updated.getName());
        assertEquals(Long.valueOf(10L), updated.getMerchantId());
        assertEquals(Integer.valueOf(1), updated.getAuditStatus());
        assertEquals(0, updated.getFeeRate().compareTo(new BigDecimal("0.03")));
    }

    @Test
    public void testUpdateOtherMerchantShopThrowsForbidden() {
        setupMockUser(10L, 2);

        Shop otherShop = new Shop();
        otherShop.setId(8L);
        otherShop.setName("Quán Người Khác");
        otherShop.setMerchantId(999L);

        doReturn(otherShop).when(shopService).getById(8L);

        Shop updateRequest = new Shop();
        updateRequest.setId(8L);
        updateRequest.setName("Hack Quán");

        try {
            shopService.save0rUpdateShop(updateRequest);
            fail("Expected CustomException NO_OPERATOR_AUTH");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.NO_OPERATOR_AUTH, e.getExceptionEnum());
        }
    }

    @Test
    public void testSaveShopWithoutLoginThrowsNeedLogin() {
        SecurityContextHolder.clearContext();

        Shop shop = new Shop();
        shop.setName("Quán Ẩn Danh");

        try {
            shopService.save0rUpdateShop(shop);
            fail("Expected CustomException NEED_LOGIN");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.NEED_LOGIN, e.getExceptionEnum());
        }
    }

    @Test
    public void testCreateBranchWithParentOwnedByMerchantSuccess() {
        setupMockUser(10L, 2);

        Shop parentShop = new Shop();
        parentShop.setId(1L);
        parentShop.setMerchantId(10L);
        parentShop.setDeleted(0);
        doReturn(parentShop).when(shopService).getById(1L);
        doReturn(true).when(shopService).save(any(Shop.class));

        Shop branch = new Shop();
        branch.setName("Chi Nhánh 1");
        branch.setParentId(1L);

        Long id = shopService.save0rUpdateShop(branch);
        ArgumentCaptor<Shop> captor = ArgumentCaptor.forClass(Shop.class);
        org.mockito.Mockito.verify(shopService).save(captor.capture());
        Shop saved = captor.getValue();

        assertEquals(Long.valueOf(10L), saved.getMerchantId());
        assertEquals(Long.valueOf(1L), saved.getParentId());
    }

    @Test
    public void testCreateBranchWithParentOfOtherMerchantThrowsForbidden() {
        setupMockUser(10L, 2);

        Shop parentShop = new Shop();
        parentShop.setId(1L);
        parentShop.setMerchantId(999L); // thuộc người khác
        parentShop.setDeleted(0);
        doReturn(parentShop).when(shopService).getById(1L);

        Shop branch = new Shop();
        branch.setName("Chi Nhánh Lậu");
        branch.setParentId(1L);

        try {
            shopService.save0rUpdateShop(branch);
            fail("Expected CustomException NO_OPERATOR_AUTH");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.NO_OPERATOR_AUTH, e.getExceptionEnum());
        }
    }

    @Test
    public void testGetSonShopListByParentIdOwnerSuccess() {
        setupMockUser(10L, 2);

        Shop parentShop = new Shop();
        parentShop.setId(1L);
        parentShop.setMerchantId(10L);
        parentShop.setDeleted(0);
        doReturn(parentShop).when(shopService).getById(1L);

        Shop branch1 = new Shop();
        branch1.setId(2L);
        branch1.setName("Chi nhánh 1");
        branch1.setParentId(1L);

        org.mockito.Mockito.when(shopMapper.selectList(any())).thenReturn(java.util.Collections.singletonList(branch1));

        com.linmour.security.dtos.Result result = shopService.getSonShopListByParentId(1L);
        assertNotNull(result);
        assertEquals(200, result.getCode().intValue());
        java.util.List<?> list = (java.util.List<?>) result.getData();
        assertEquals(1, list.size());
    }

    @Test
    public void testGetSonShopListByParentIdOtherMerchantThrowsForbidden() {
        setupMockUser(10L, 2);

        Shop parentShop = new Shop();
        parentShop.setId(1L);
        parentShop.setMerchantId(999L); // thuộc người khác
        parentShop.setDeleted(0);
        doReturn(parentShop).when(shopService).getById(1L);

        try {
            shopService.getSonShopListByParentId(1L);
            fail("Expected CustomException NO_OPERATOR_AUTH");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.NO_OPERATOR_AUTH, e.getExceptionEnum());
        }
    }

    @Test
    public void testAuditShopByAdminSuccess() {
        setupMockUser(1L, 1); // admin nền tảng

        Shop existing = new Shop();
        existing.setId(5L);
        existing.setName("Quán Chờ Duyệt");
        existing.setAuditStatus(2);
        existing.setFeeRate(BigDecimal.ZERO);
        doReturn(existing).when(shopService).getById(5L);
        doReturn(true).when(shopService).updateById(any(Shop.class));

        com.linmour.system.pojo.Dto.AuditShopDto dto = new com.linmour.system.pojo.Dto.AuditShopDto();
        dto.setId(5L);
        dto.setAuditStatus(1);
        dto.setFeeRate(new BigDecimal("3.5"));

        com.linmour.security.dtos.Result result = shopService.auditShop(dto);
        assertNotNull(result);
        assertEquals(200, result.getCode().intValue());

        ArgumentCaptor<Shop> captor = ArgumentCaptor.forClass(Shop.class);
        org.mockito.Mockito.verify(shopService).updateById(captor.capture());
        Shop updated = captor.getValue();
        assertEquals(Integer.valueOf(1), updated.getAuditStatus());
        assertEquals(new BigDecimal("3.5"), updated.getFeeRate());
    }

    @Test
    public void testAuditShopByRegularMerchantThrowsForbidden() {
        setupMockUser(10L, 2); // merchant thường

        com.linmour.system.pojo.Dto.AuditShopDto dto = new com.linmour.system.pojo.Dto.AuditShopDto();
        dto.setId(5L);
        dto.setAuditStatus(1);
        dto.setFeeRate(new BigDecimal("3.5"));

        try {
            shopService.auditShop(dto);
            fail("Expected CustomException NO_OPERATOR_AUTH");
        } catch (CustomException e) {
            assertEquals(AppHttpCodeEnum.NO_OPERATOR_AUTH, e.getExceptionEnum());
        }
    }

    @Test
    public void testGetShopIdsByMerchantIdIncludesDirectAndChildShops() {
        // Merchant 10 trực tiếp sở hữu shop 1
        Shop shop1 = new Shop();
        shop1.setId(1L);
        shop1.setMerchantId(10L);
        shop1.setParentId(0L);

        // Shop 2 là con của shop 1
        Shop shop2 = new Shop();
        shop2.setId(2L);
        shop2.setMerchantId(99L);
        shop2.setParentId(1L);

        // First selectList: shops where merchantId = 10 -> returns shop 1
        // Second selectList: shops where parentId in (1) -> returns shop 2
        // Third selectList: shops where parentId in (2) -> returns empty
        org.mockito.Mockito.when(shopMapper.selectList(any()))
                .thenReturn(java.util.Collections.singletonList(shop1))
                .thenReturn(java.util.Collections.singletonList(shop2))
                .thenReturn(java.util.Collections.emptyList());

        java.util.List<Long> ids = shopService.getShopIdsByMerchantId(10L);
        assertNotNull(ids);
        assertEquals(2, ids.size());
        assertTrue(ids.contains(1L));
        assertTrue(ids.contains(2L));
    }
}

package com.linmour.restaurant.service.impl;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.client.j2se.BufferedImageLuminanceSource;
import com.google.zxing.common.HybridBinarizer;
import com.linmour.restaurant.mapper.RestaurantTableMapper;
import com.linmour.restaurant.pojo.Do.RestaurantTable;
import com.linmour.restaurant.pojo.Dto.AppTableInfoDto;
import com.linmour.security.dtos.Result;
import com.linmour.security.utils.RedisCache;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.MockitoJUnitRunner;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.File;
import java.nio.file.Files;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

@RunWith(MockitoJUnitRunner.class)
public class RestaurantTableServiceImplTest {

    @Mock
    private RedisCache redisCache;

    @Mock
    private RedisTemplate redisTemplate;

    @Mock
    private RestaurantTableMapper restaurantTableMapper;

    @Mock
    private com.linmour.restaurant.feign.SystemFeign systemFeign;

    @Spy
    @InjectMocks
    private RestaurantTableServiceImpl restaurantTableService;

    private File tempDir;

    @Before
    public void setUp() throws Exception {
        tempDir = Files.createTempDirectory("qr_test_upload").toFile();
        tempDir.deleteOnExit();

        redisCache.redisTemplate = redisTemplate;
        com.linmour.security.utils.TableTokenUtil.setTableTokenKey("test-table-token-secret-1234567890123");

        ReflectionTestUtils.setField(restaurantTableService, "webBaseUrl", "http://192.168.1.173:5181");
        ReflectionTestUtils.setField(restaurantTableService, "publicBaseUrl", "http://192.168.1.173:12800");
        ReflectionTestUtils.setField(restaurantTableService, "configuredUploadPath", tempDir.getAbsolutePath() + "/");
        ReflectionTestUtils.setField(restaurantTableService, "systemFeign", systemFeign);
    }

    @Test
    public void testGetAppTableInfoSuccess() {
        RestaurantTable table = new RestaurantTable();
        table.setId(3L);
        table.setName("Bàn 03");
        table.setShopId(1L);
        table.setDeleted(0);

        doReturn(table).when(restaurantTableService).getById(3L);

        Result result = restaurantTableService.getAppTableInfo(3L, 1L);
        assertNotNull(result);
        assertEquals(Integer.valueOf(200), result.getCode());
        AppTableInfoDto data = (AppTableInfoDto) result.getData();
        assertEquals(Long.valueOf(3L), data.getId());
        assertEquals("Bàn 03", data.getName());
        assertEquals(Long.valueOf(1L), data.getShopId());
    }

    @Test
    public void testGetAppTableInfoMismatchedShopIdFails() {
        RestaurantTable table = new RestaurantTable();
        table.setId(3L);
        table.setName("Bàn 03");
        table.setShopId(1L);
        table.setDeleted(0);

        doReturn(table).when(restaurantTableService).getById(3L);

        // Shopid 2 gọi tới bàn 3 của Shop 1 -> phải bị từ chối
        Result result = restaurantTableService.getAppTableInfo(3L, 2L);
        assertNotNull(result);
        assertNotEquals(Integer.valueOf(200), result.getCode());
        assertEquals("Không tìm thấy bàn", result.getMsg());
    }

    @Test
    public void testGetAppTableInfoDeletedTableFails() {
        RestaurantTable table = new RestaurantTable();
        table.setId(4L);
        table.setName("Bàn 04");
        table.setShopId(1L);
        table.setDeleted(1);

        doReturn(table).when(restaurantTableService).getById(4L);

        Result result = restaurantTableService.getAppTableInfo(4L, 1L);
        assertNotNull(result);
        assertNotEquals(Integer.valueOf(200), result.getCode());
        assertEquals("Không tìm thấy bàn", result.getMsg());
    }

    @Test
    public void testGetAppTableInfoNotFoundFails() {
        doReturn(null).when(restaurantTableService).getById(99L);

        Result result = restaurantTableService.getAppTableInfo(99L, 1L);
        assertNotNull(result);
        assertNotEquals(Integer.valueOf(200), result.getCode());
        assertEquals("Không tìm thấy bàn", result.getMsg());
    }

    @Test
    public void testDeleteTableFailsWhenTableHasOpenOrderInRedis() {
        RestaurantTable table = new RestaurantTable();
        table.setId(3L);
        table.setName("Bàn 03");
        table.setShopId(1L);
        table.setDeleted(0);

        doReturn(table).when(restaurantTableService).getById(3L);
        redisCache.redisTemplate = redisTemplate;
        when(redisTemplate.hasKey("orderInfo:1:3")).thenReturn(true);

        Result result = restaurantTableService.deleteTable(3L);
        assertNotNull(result);
        assertEquals(Integer.valueOf(201), result.getCode());
        assertEquals("Bàn đang có khách, không thể xoá", result.getMsg());

        verify(restaurantTableService, never()).updateById(any());
    }

    @Test
    public void testDeleteTableSuccessWhenIdle() {
        RestaurantTable table = new RestaurantTable();
        table.setId(3L);
        table.setName("Bàn 03");
        table.setShopId(1L);
        table.setDeleted(0);

        doReturn(table).when(restaurantTableService).getById(3L);
        doReturn(true).when(restaurantTableService).removeById(3L);
        redisCache.redisTemplate = redisTemplate;
        when(redisTemplate.hasKey("orderInfo:1:3")).thenReturn(false);

        Result result = restaurantTableService.deleteTable(3L);
        assertNotNull(result);
        assertEquals(Integer.valueOf(200), result.getCode());

        verify(restaurantTableService).removeById(3L);
    }

    @Test
    public void testGenerateAndSaveQrCodeCreatesValidQrFile() throws Exception {
        Long userId = 1L;
        Long shopId = 1L;
        Long tableId = 9L;
        int size = 430;

        RestaurantTable table = new RestaurantTable();
        table.setId(9L);
        table.setQrToken("token_hex_12345");
        doReturn(table).when(restaurantTableService).getById(9L);

        restaurantTableService.generateAndSaveQrCode(userId, shopId, tableId, size);

        File qrFile = new File(tempDir, "QR/user_1/shop_1/9.png");
        assertTrue("QR file must exist on disk", qrFile.exists());
        assertTrue("QR file must not be empty", qrFile.length() > 0);

        // Decode QR using ZXing MultiFormatReader
        BufferedImage image = ImageIO.read(qrFile);
        assertNotNull(image);
        assertEquals(430, image.getWidth());
        assertEquals(430, image.getHeight());

        BinaryBitmap bitmap = new BinaryBitmap(new HybridBinarizer(new BufferedImageLuminanceSource(image)));
        com.google.zxing.Result decoded = new MultiFormatReader().decode(bitmap);
        assertEquals("http://192.168.1.173:5181/?qr=token_hex_12345", decoded.getText());

        // Verify generated URL format
        String qrUrl = restaurantTableService.buildQrCodeUrl(userId, shopId, tableId);
        assertEquals("http://192.168.1.173:12800/file/QR/user_1/shop_1/9.png", qrUrl);
    }

    @Test
    public void testResolveQrTokenSuccess() {
        RestaurantTable table = new RestaurantTable();
        table.setId(3L);
        table.setName("Bàn 03");
        table.setShopId(1L);
        table.setQrToken("valid_qr_token_32_characters_long");
        table.setDeleted(0);

        when(restaurantTableMapper.selectOne(any())).thenReturn(table);

        com.linmour.system.pojo.Do.Shop shop = new com.linmour.system.pojo.Do.Shop();
        shop.setId(1L);
        shop.setName("Nhà Hàng Bếp Việt");
        shop.setShopStatus(1);
        shop.setAuditStatus(1);
        when(systemFeign.getShopByIds(any())).thenReturn(java.util.Collections.singletonList(shop));

        Result res = restaurantTableService.resolveQrToken("valid_qr_token_32_characters_long", "127.0.0.1", null);
        assertNotNull(res);
        assertEquals(Integer.valueOf(200), res.getCode());

        com.linmour.restaurant.pojo.Dto.ResolvedQrDto dto = (com.linmour.restaurant.pojo.Dto.ResolvedQrDto) res.getData();
        assertEquals(Long.valueOf(3L), dto.getTableId());
        assertEquals(Long.valueOf(1L), dto.getShopId());
        assertEquals("Bàn 03", dto.getTableName());
        assertEquals("Nhà Hàng Bếp Việt", dto.getShopName());
        assertNotNull(dto.getTableAccessToken());

        // Verify token can be parsed
        io.jsonwebtoken.Claims claims = com.linmour.security.utils.TableTokenUtil.parseTableAccessToken(dto.getTableAccessToken());
        assertEquals(1L, claims.get("sid", Number.class).longValue());
        assertEquals(3L, claims.get("tid", Number.class).longValue());
    }

    @Test
    public void testResolveQrTokenNotFoundReturns404() {
        when(restaurantTableMapper.selectOne(any())).thenReturn(null);

        org.springframework.data.redis.core.ValueOperations valOps = mock(org.springframework.data.redis.core.ValueOperations.class);
        redisTemplate.opsForValue();
        when(redisTemplate.opsForValue()).thenReturn(valOps);
        when(valOps.increment(anyString())).thenReturn(1L);

        Result res = restaurantTableService.resolveQrToken("invalid_qr_token", "127.0.0.1", null);
        assertNotNull(res);
        assertEquals(Integer.valueOf(404), res.getCode());
        assertEquals("Mã QR không hợp lệ hoặc đã được thay mới", res.getMsg());
    }

    @Test
    public void testResolveQrTokenRateLimitedReturns429() {
        when(redisCache.getCacheObject("rl:qr:fail:127.0.0.1")).thenReturn(25L);

        Result res = restaurantTableService.resolveQrToken("any_token", "127.0.0.1", null);
        assertNotNull(res);
        assertEquals(Integer.valueOf(429), res.getCode());
        assertTrue(res.getMsg().contains("Quá nhiều yêu cầu không hợp lệ"));
    }

    @Test
    public void testRegenerateQrSuccess() throws Exception {
        RestaurantTable table = new RestaurantTable();
        table.setId(9L);
        table.setName("Bàn 09");
        table.setShopId(1L);
        table.setDeleted(0);

        doReturn(table).when(restaurantTableService).getById(9L);
        doReturn(true).when(restaurantTableService).updateById(any(RestaurantTable.class));

        Result result = restaurantTableService.regenerateQr(9L);
        assertNotNull(result);
        assertEquals(Integer.valueOf(200), result.getCode());

        RestaurantTable updated = (RestaurantTable) result.getData();
        assertNotNull(updated);
        assertEquals("http://192.168.1.173:12800/file/QR/user_1/shop_1/9.png", updated.getQrCodeUrl());

        File qrFile = new File(tempDir, "QR/user_1/shop_1/9.png");
        assertTrue(qrFile.exists());
    }

    @Test
    public void testRegenerateQrFailsWhenTableNotFoundOrDeleted() {
        doReturn(null).when(restaurantTableService).getById(99L);

        Result notFound = restaurantTableService.regenerateQr(99L);
        assertNotNull(notFound);
        assertEquals(Integer.valueOf(201), notFound.getCode());
        assertEquals("Không tìm thấy bàn", notFound.getMsg());

        RestaurantTable deletedTable = new RestaurantTable();
        deletedTable.setId(10L);
        deletedTable.setDeleted(1);
        doReturn(deletedTable).when(restaurantTableService).getById(10L);

        Result deletedResult = restaurantTableService.regenerateQr(10L);
        assertNotNull(deletedResult);
        assertEquals(Integer.valueOf(201), deletedResult.getCode());
        assertEquals("Không tìm thấy bàn", deletedResult.getMsg());
    }

    @Test
    public void testGetInternalTableQvSuccess() {
        RestaurantTable table = new RestaurantTable();
        table.setId(6L);
        table.setShopId(1L);
        table.setQrToken("test-qr-token-1234567890abcdef");
        table.setDeleted(0);

        when(restaurantTableMapper.selectOne(any())).thenReturn(table);

        Result res = restaurantTableService.getInternalTableQv(1L, 6L);
        assertNotNull(res);
        assertEquals(Integer.valueOf(200), res.getCode());

        String expectedQv = com.linmour.security.utils.TableTokenUtil.calculateQv("test-qr-token-1234567890abcdef");
        assertEquals(expectedQv, res.getData());

        verify(redisCache).setCacheObject(eq("table:qv:1:6"), eq(expectedQv), eq(24), eq(java.util.concurrent.TimeUnit.HOURS));
    }

    @Test
    public void testGetInternalTableQvNotFound() {
        when(restaurantTableMapper.selectOne(any())).thenReturn(null);

        Result res = restaurantTableService.getInternalTableQv(1L, 999L);
        assertNotNull(res);
        assertEquals(Integer.valueOf(404), res.getCode());
        assertEquals("Không tìm thấy bàn", res.getMsg());
    }

    @Test
    public void testGetInternalTableQvMissingParams() {
        Result res1 = restaurantTableService.getInternalTableQv(null, 6L);
        assertNotNull(res1);
        assertEquals(Integer.valueOf(400), res1.getCode());

        Result res2 = restaurantTableService.getInternalTableQv(1L, null);
        assertNotNull(res2);
        assertEquals(Integer.valueOf(400), res2.getCode());
    }

    @Test
    public void testGetTableMissingShopId_Throws400() {
        com.linmour.security.utils.SecurityUtils.clearAll();
        try {
            restaurantTableService.getTable();
            fail("Expected CustomException 400 when shopId is missing");
        } catch (com.linmour.security.exception.CustomException e) {
            assertEquals(400, e.getCode());
            assertTrue(e.getMessage().contains("quán ăn"));
        }
    }
}

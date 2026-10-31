package com.linmour.order.service;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.linmour.order.feign.ProductFeign;
import com.linmour.order.feign.SystemFeign;
import com.linmour.order.pojo.Do.OrderItem;
import com.linmour.order.pojo.Dto.OrderEditReqDto;
import com.linmour.order.pojo.Dto.OrderEditRespDto;
import com.linmour.order.service.impl.OrderEditServiceImpl;
import com.linmour.product.pojo.Dto.PriceQuoteDto;
import com.linmour.product.pojo.Dto.PriceQuoteVo;
import com.linmour.product.pojo.Dto.ReduceInventoryDto;
import com.linmour.security.dtos.Result;
import com.linmour.security.utils.RedisCache;
import com.linmour.security.utils.SecurityUtils;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;

import java.math.BigDecimal;
import java.util.*;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@RunWith(MockitoJUnitRunner.Silent.class)
public class OrderEditServiceTest {

    private static final String INFO_KEY = "orderInfo:1:5";
    private static final String ITEM_KEY = "orderItem:1:5";

    @InjectMocks
    private OrderEditServiceImpl orderEditService;

    @Mock
    private RedisCache redisCache;

    @Mock
    private RedissonClient redissonClient;

    @Mock
    private RLock orderLock;

    @Mock
    private RLock checkoutLock;

    @Mock
    private ProductFeign productFeign;

    @Mock
    private SystemFeign systemFeign;

    @Mock
    private PayosPaymentService payosPaymentService;

    private final Map<String, Object> hash = new HashMap<>();

    @Before
    public void setUp() {
        SecurityUtils.setShopId(1L);
        when(redissonClient.getLock("lock:order:1:5")).thenReturn(orderLock);
        when(redissonClient.getLock("lock:checkout:1:5")).thenReturn(checkoutLock);
        when(orderLock.isHeldByCurrentThread()).thenReturn(true);
        when(checkoutLock.isHeldByCurrentThread()).thenReturn(true);
        hash.put("id", "9001");
        hash.put("tableId", 5);
        hash.put("payAmount", new BigDecimal("155000"));
        hash.put("version", 3);
        when(redisCache.getAllHash(INFO_KEY)).thenReturn(hash);
        when(redisCache.getCacheList(ITEM_KEY)).thenReturn(new ArrayList<>(Arrays.asList(
                item(7L, "Phở Bò", "50000", 2, 0),
                item(8L, "Bún Chả", "55000", 1, 2))));
        when(productFeign.reduceInventories(anyList())).thenReturn(Result.success());
        when(productFeign.restoreInventories(anyList())).thenReturn(Result.success());
    }

    @After
    public void tearDown() {
        SecurityUtils.clearShopId();
    }

    private static Object item(Long productId, String name, String price, int qty, int status) {
        OrderItem it = new OrderItem();
        it.setProductId(productId);
        it.setName(name);
        it.setPrice(new BigDecimal(price));
        it.setQuantity(qty);
        it.setStatus(status);
        return JSON.parseObject(JSON.toJSONString(it));
    }

    private static OrderEditReqDto req(Long version, Integer qty, String reason) {
        OrderEditReqDto r = new OrderEditReqDto();
        r.setVersion(version);
        r.setQuantity(qty);
        r.setReason(reason);
        return r;
    }

    @SuppressWarnings("unchecked")
    private List<OrderItem> savedItems() {
        ArgumentCaptor<List> captor = ArgumentCaptor.forClass(List.class);
        verify(redisCache).setCacheList(eq(ITEM_KEY), captor.capture());
        return (List<OrderItem>) captor.getValue();
    }

    @Test
    public void addItem_UsesServerPrice_RecalculatesTotal_BumpsVersion() {
        PriceQuoteVo quote = PriceQuoteVo.builder().productId(12L).name("Trà Đá").price(new BigDecimal("5000")).propsText("Nhiều đá").build();
        when(productFeign.priceQuote(any(PriceQuoteDto.class))).thenReturn(Result.success(JSON.parseObject(JSON.toJSONString(quote))));
        OrderEditReqDto r = req(3L, 2, null);
        r.setProductId(12L);
        r.setSpecOptionIds(Collections.singletonList(31L));

        Result result = orderEditService.addItem(5L, r);

        assertEquals(200, result.getCode().intValue());
        ArgumentCaptor<PriceQuoteDto> quoteCaptor = ArgumentCaptor.forClass(PriceQuoteDto.class);
        verify(productFeign).priceQuote(quoteCaptor.capture());
        assertEquals(Long.valueOf(1L), quoteCaptor.getValue().getShopId());
        verify(productFeign).reduceInventories(Collections.singletonList(new ReduceInventoryDto(12L, 2)));
        List<OrderItem> saved = savedItems();
        assertEquals(3, saved.size());
        assertEquals("Trà Đá", saved.get(2).getName());
        assertEquals(Integer.valueOf(0), saved.get(2).getStatus());
        verify(redisCache).setHashValue(INFO_KEY, "payAmount", new BigDecimal("165000"));
        verify(redisCache).setHashValue(INFO_KEY, "version", 4L);
        verify(redisCache).convertAndSend(eq("order_edited"), anyString());
        verify(payosPaymentService).cancelPendingLinksForTable(1L, 5L);
        verify(orderLock).unlock();
        verify(checkoutLock).unlock();
    }

    @Test
    public void addItem_OutOfStock_KeepsOrderUnchanged() {
        PriceQuoteVo quote = PriceQuoteVo.builder().productId(12L).name("Trà Đá").price(new BigDecimal("5000")).build();
        when(productFeign.priceQuote(any(PriceQuoteDto.class))).thenReturn(Result.success(quote));
        when(productFeign.reduceInventories(anyList())).thenReturn(Result.error(400, "Món Trà Đá đã hết hàng"));
        OrderEditReqDto r = req(3L, 1, null);
        r.setProductId(12L);

        Result result = orderEditService.addItem(5L, r);

        assertEquals(400, result.getCode().intValue());
        assertEquals("Món Trà Đá đã hết hàng", result.getMsg());
        verify(redisCache, never()).setCacheList(anyString(), anyList());
        verify(redisCache, never()).setHashValue(anyString(), anyString(), any());
    }

    @Test
    public void addItem_PriceQuoteError_IsReturnedAsIs() {
        when(productFeign.priceQuote(any(PriceQuoteDto.class))).thenReturn(Result.error(400, "Vui lòng chọn Cỡ"));
        OrderEditReqDto r = req(3L, 1, null);
        r.setProductId(12L);

        Result result = orderEditService.addItem(5L, r);

        assertEquals("Vui lòng chọn Cỡ", result.getMsg());
        verify(productFeign, never()).reduceInventories(anyList());
    }

    @Test
    public void staleVersion_Returns409_WithoutTouchingStock() {
        Result result = orderEditService.updateItemQuantity(5L, 0, req(2L, 1, null));

        assertEquals(409, result.getCode().intValue());
        verify(productFeign, never()).restoreInventories(anyList());
        verify(redisCache, never()).deleteObject(anyString());
    }

    @Test
    public void missingOrder_Returns404() {
        when(redisCache.getAllHash(INFO_KEY)).thenReturn(new HashMap<>());

        Result result = orderEditService.removeItem(5L, 0, req(3L, null, null));

        assertEquals(404, result.getCode().intValue());
    }

    @Test
    public void decreasePendingItem_RestoresStockWithoutReason() {
        Result result = orderEditService.updateItemQuantity(5L, 0, req(3L, 1, null));

        assertEquals(200, result.getCode().intValue());
        verify(productFeign).restoreInventories(Collections.singletonList(new ReduceInventoryDto(7L, 1)));
        assertEquals(Integer.valueOf(1), savedItems().get(0).getQuantity());
        verify(redisCache).setHashValue(INFO_KEY, "payAmount", new BigDecimal("105000"));
    }

    @Test
    public void increaseItem_DeductsOnlyTheDifference() {
        Result result = orderEditService.updateItemQuantity(5L, 0, req(3L, 5, null));

        assertEquals(200, result.getCode().intValue());
        verify(productFeign).reduceInventories(Collections.singletonList(new ReduceInventoryDto(7L, 3)));
        verify(redisCache).setHashValue(INFO_KEY, "payAmount", new BigDecimal("305000"));
    }

    @Test
    public void decreaseServedItem_RequiresReason() {
        when(redisCache.getCacheList(ITEM_KEY)).thenReturn(new ArrayList<>(Collections.singletonList(item(8L, "Bún Chả", "55000", 2, 2))));

        Result result = orderEditService.updateItemQuantity(5L, 0, req(3L, 1, " "));

        assertEquals(400, result.getCode().intValue());
        assertEquals("Cần chọn lý do", result.getMsg());
        verify(productFeign, never()).restoreInventories(anyList());
    }

    @Test
    public void removeServedItem_WithReason_RestoresWholeLine_AndAuditsReason() {
        Result result = orderEditService.removeItem(5L, 1, req(3L, null, "Khách đổi ý"));

        assertEquals(200, result.getCode().intValue());
        verify(productFeign).restoreInventories(Collections.singletonList(new ReduceInventoryDto(8L, 1)));
        List<OrderItem> saved = savedItems();
        assertEquals(1, saved.size());
        assertEquals("Phở Bò", saved.get(0).getName());
        verify(redisCache).setHashValue(INFO_KEY, "payAmount", new BigDecimal("100000"));
        ArgumentCaptor<String> msg = ArgumentCaptor.forClass(String.class);
        verify(redisCache).convertAndSend(eq("order_edited"), msg.capture());
        JSONObject published = JSON.parseObject(msg.getValue());
        assertEquals("5", published.getString("tableId"));
        assertEquals(4L, published.getLongValue("version"));
    }

    @Test
    public void removeLastItem_LeavesEmptyOpenOrder() {
        when(redisCache.getCacheList(ITEM_KEY)).thenReturn(new ArrayList<>(Collections.singletonList(item(7L, "Phở Bò", "50000", 1, 0))));

        Result result = orderEditService.removeItem(5L, 0, req(3L, null, null));

        assertEquals(200, result.getCode().intValue());
        verify(redisCache).deleteObject(ITEM_KEY);
        verify(redisCache, never()).setCacheList(anyString(), anyList());
        verify(redisCache).setHashValue(INFO_KEY, "payAmount", BigDecimal.ZERO);
    }

    @Test
    public void restoreFailure_AbortsEdit() {
        when(productFeign.restoreInventories(anyList())).thenReturn(Result.error(500, "down"));

        Result result = orderEditService.removeItem(5L, 0, req(3L, null, null));

        assertEquals("Không cập nhật được kho, vui lòng thử lại", result.getMsg());
        verify(redisCache, never()).deleteObject(anyString());
    }

    @Test
    public void invalidIndex_Returns400() {
        Result result = orderEditService.removeItem(5L, 7, req(3L, null, null));

        assertEquals(400, result.getCode().intValue());
        assertEquals("Món không tồn tại trong đơn", result.getMsg());
    }

    @Test
    public void unchangedTotal_DoesNotCancelPayos() {
        // Đổi Phở Bò 2 → 1 và thêm lại không thể cùng tổng trong 1 thao tác; dùng món giá 0 để tổng giữ nguyên
        when(redisCache.getCacheList(ITEM_KEY)).thenReturn(new ArrayList<>(Arrays.asList(
                item(7L, "Phở Bò", "155000", 1, 0), item(9L, "Nước mắm", "0", 1, 0))));

        Result result = orderEditService.removeItem(5L, 1, req(3L, null, null));

        assertEquals(200, result.getCode().intValue());
        verify(payosPaymentService, never()).cancelPendingLinksForTable(anyLong(), anyLong());
    }

    @Test
    public void responseCarriesPayosCancelledFlag() {
        when(payosPaymentService.cancelPendingLinksForTable(1L, 5L)).thenReturn(true);

        Result result = orderEditService.removeItem(5L, 0, req(3L, null, null));

        assertTrue(((OrderEditRespDto) result.getData()).getPayosCancelled());
    }
}

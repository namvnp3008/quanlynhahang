package com.linmour.order.service;

import com.alibaba.fastjson.JSON;
import com.linmour.mq.KafkaProducer;
import com.linmour.order.feign.ProductFeign;
import com.linmour.order.feign.SystemFeign;
import com.linmour.order.mapper.OrderInfoMapper;
import com.linmour.order.pojo.Do.OrderInfo;
import com.linmour.order.pojo.Do.OrderItem;
import com.linmour.order.pojo.Dto.*;
import com.linmour.order.service.impl.TakeawayServiceImpl;
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
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.TimeUnit;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@RunWith(MockitoJUnitRunner.Silent.class)
public class TakeawayServiceTest {

    @InjectMocks
    private TakeawayServiceImpl takeawayService;
    @Mock private RedisCache redisCache;
    @Mock private ProductFeign productFeign;
    @Mock private SystemFeign systemFeign;
    @Mock private OrderInfoMapper orderInfoMapper;
    @Mock private OrderItemService orderItemService;
    @Mock private KafkaProducer kafkaProducer;
    @Mock private TransactionTemplate transactionTemplate;

    @Before
    public void setUp() {
        SecurityUtils.setShopId(1L);
        quote(12L, "Trà Đá", "5000");
        quote(7L, "Phở Bò", "50000");
        when(productFeign.reduceInventories(anyList())).thenReturn(Result.success());
        when(productFeign.restoreInventories(anyList())).thenReturn(Result.success());
        when(redisCache.setIfAbsent(startsWith("TAKEAWAY_REQ:1:"), any(), eq(24L), eq(TimeUnit.HOURS))).thenReturn(true);
        when(redisCache.increment(startsWith("TAKEAWAY_SEQ:1:"))).thenReturn(12L);
        when(transactionTemplate.execute(any())).thenAnswer(inv -> ((TransactionCallback<?>) inv.getArgument(0)).doInTransaction(null));
    }

    @After
    public void tearDown() {
        SecurityUtils.clearShopId();
    }

    private void quote(Long productId, String name, String price) {
        PriceQuoteVo vo = PriceQuoteVo.builder().productId(productId).name(name).price(new BigDecimal(price)).build();
        when(productFeign.priceQuote(argThat(d -> d != null && productId.equals(d.getProductId()))))
                .thenReturn(Result.success(JSON.parseObject(JSON.toJSONString(vo))));
    }

    private static TakeawayReqDto req(String requestId, Integer payType) {
        return new TakeawayReqDto(requestId,
                Arrays.asList(new TakeawayItemDto(12L, null, 2), new TakeawayItemDto(7L, null, 1)),
                payType, "ít cay");
    }

    @Test
    public void quote_UsesServerPrices_SumsTotal() {
        Result r = takeawayService.quote(req("r1", 4).getItems());
        assertEquals(200, r.getCode().intValue());
        TakeawayQuoteVo vo = (TakeawayQuoteVo) r.getData();
        assertEquals(new BigDecimal("60000"), vo.getTotal());
        assertEquals(2, vo.getLines().size());
        assertEquals(new BigDecimal("10000"), vo.getLines().get(0).getLineTotal());
        verify(productFeign, never()).reduceInventories(anyList());
    }

    @Test
    public void quote_DiscontinuedItem_ReturnsProductError() {
        when(productFeign.priceQuote(argThat(d -> d != null && Long.valueOf(7L).equals(d.getProductId()))))
                .thenReturn(Result.error(400, "Món Phở Bò đang ngừng bán"));
        Result r = takeawayService.quote(req("r1", 4).getItems());
        assertEquals(400, r.getCode().intValue());
        assertEquals("Món Phở Bò đang ngừng bán", r.getMsg());
    }

    @Test
    public void create_PersistsPaidOrder_CreatesKitchenCopy_PublishesEdit() {
        Result r = takeawayService.create(req("r1", 4));

        assertEquals(200, r.getCode().intValue());
        TakeawayRespDto resp = (TakeawayRespDto) r.getData();
        assertEquals(Integer.valueOf(12), resp.getTicketNo());
        assertEquals(new BigDecimal("60000"), resp.getPayAmount());
        verify(productFeign).reduceInventories(Arrays.asList(new ReduceInventoryDto(12L, 2), new ReduceInventoryDto(7L, 1)));
        ArgumentCaptor<OrderInfo> info = ArgumentCaptor.forClass(OrderInfo.class);
        verify(orderInfoMapper).insert(info.capture());
        assertNull(info.getValue().getTableId());
        assertEquals(Integer.valueOf(1), info.getValue().getOrderType());
        assertEquals(Integer.valueOf(12), info.getValue().getTicketNo());
        assertEquals(Integer.valueOf(1), info.getValue().getPayStatus());
        assertEquals(Integer.valueOf(4), info.getValue().getPayType());
        assertEquals(new BigDecimal("60000"), info.getValue().getPayAmount());
        verify(orderItemService).saveBatch(anyList());
        verify(kafkaProducer).originalOrder(any(OrderAllDto.class));
        ArgumentCaptor<Map> hash = ArgumentCaptor.forClass(Map.class);
        verify(redisCache).setHashValues(eq("orderInfo:1:-12"), hash.capture());
        assertEquals(-12L, ((Number) hash.getValue().get("tableId")).longValue());
        assertEquals(1, ((Number) hash.getValue().get("orderType")).intValue());
        assertEquals(12, ((Number) hash.getValue().get("ticketNo")).intValue());
        ArgumentCaptor<List> items = ArgumentCaptor.forClass(List.class);
        verify(redisCache).setCacheList(eq("orderItem:1:-12"), items.capture());
        assertEquals(Integer.valueOf(0), ((OrderItem) items.getValue().get(0)).getStatus());
        verify(redisCache).convertAndSend(eq("order_edited"), contains("\"tableId\":\"-12\""));
        verify(redisCache).convertAndSend(eq("order_edited"), contains("\"op\":\"TAKEAWAY\""));
        assertEquals(1, ((Number) hash.getValue().get("paid")).intValue());
    }

    @Test
    public void create_KitchenCopyFails_AfterCommit_StillPaid_NoRestore() {
        doThrow(new RuntimeException("redis down")).when(redisCache).setHashValues(anyString(), anyMap());
        Result r = takeawayService.create(req("r1", 4));
        assertEquals(200, r.getCode().intValue());
        assertEquals(Integer.valueOf(12), ((TakeawayRespDto) r.getData()).getTicketNo());
        verify(productFeign, never()).restoreInventories(anyList());
        verify(redisCache, never()).deleteObject("TAKEAWAY_REQ:1:r1");
        verify(redisCache).setCacheObject(eq("TAKEAWAY_REQ:1:r1"), anyString(), eq(24), eq(TimeUnit.HOURS));
    }

    @Test
    public void create_SkipsTicketNumberStillInUse() {
        when(redisCache.increment(startsWith("TAKEAWAY_SEQ:1:"))).thenReturn(12L, 13L);
        when(redisCache.hasKey("orderInfo:1:-12")).thenReturn(true);
        when(redisCache.hasKey("orderInfo:1:-13")).thenReturn(false);
        Result r = takeawayService.create(req("r1", 4));
        assertEquals(Integer.valueOf(13), ((TakeawayRespDto) r.getData()).getTicketNo());
        verify(redisCache).setHashValues(eq("orderInfo:1:-13"), anyMap());
    }

    @Test
    public void create_DbFails_RestoreRejected_IsLogged_Still500() {
        when(orderInfoMapper.insert(any(OrderInfo.class))).thenThrow(new RuntimeException("db down"));
        when(productFeign.restoreInventories(anyList())).thenReturn(Result.error(500, "x"));
        Result r = takeawayService.create(req("r1", 4));
        assertEquals(500, r.getCode().intValue());
        assertEquals("Không tạo được đơn, chưa thu tiền", r.getMsg());
        verify(redisCache).deleteObject("TAKEAWAY_REQ:1:r1");
    }

    @Test
    public void create_IgnoresAnyClientPrice() {
        Result r = takeawayService.create(req("r1", 1));
        assertEquals(new BigDecimal("60000"), ((TakeawayRespDto) r.getData()).getPayAmount());
        verify(productFeign, times(2)).priceQuote(any(PriceQuoteDto.class));
    }

    @Test
    public void create_SameRequestId_ReturnsSameTicket_ReducesOnce() {
        when(redisCache.setIfAbsent(eq("TAKEAWAY_REQ:1:r1"), any(), eq(24L), eq(TimeUnit.HOURS))).thenReturn(false);
        when(redisCache.getCacheObject("TAKEAWAY_REQ:1:r1"))
                .thenReturn(JSON.toJSONString(new TakeawayRespDto(12, "9001", new BigDecimal("60000"))));

        Result r = takeawayService.create(req("r1", 4));

        assertEquals(200, r.getCode().intValue());
        assertEquals(Integer.valueOf(12), ((TakeawayRespDto) r.getData()).getTicketNo());
        verify(productFeign, never()).reduceInventories(anyList());
        verify(orderInfoMapper, never()).insert(any(OrderInfo.class));
    }

    @Test
    public void create_SameRequestIdStillRunning_Returns409() {
        when(redisCache.setIfAbsent(eq("TAKEAWAY_REQ:1:r1"), any(), eq(24L), eq(TimeUnit.HOURS))).thenReturn(false);
        when(redisCache.getCacheObject("TAKEAWAY_REQ:1:r1")).thenReturn("PENDING");
        Result r = takeawayService.create(req("r1", 4));
        assertEquals(409, r.getCode().intValue());
    }

    @Test
    public void create_OutOfStock_NothingSaved_KeyReleased() {
        when(productFeign.reduceInventories(anyList())).thenReturn(Result.error(400, "Món Trà Đá đã hết hàng"));
        Result r = takeawayService.create(req("r1", 4));
        assertEquals(400, r.getCode().intValue());
        assertEquals("Món Trà Đá đã hết hàng", r.getMsg());
        verify(orderInfoMapper, never()).insert(any(OrderInfo.class));
        verify(redisCache, never()).increment(anyString());
        verify(redisCache).deleteObject("TAKEAWAY_REQ:1:r1");
    }

    @Test
    public void create_DbFails_RestoresInventory_NoRedis() {
        when(orderInfoMapper.insert(any(OrderInfo.class))).thenThrow(new RuntimeException("db down"));
        Result r = takeawayService.create(req("r1", 4));
        assertEquals(500, r.getCode().intValue());
        assertEquals("Không tạo được đơn, chưa thu tiền", r.getMsg());
        verify(productFeign).restoreInventories(Arrays.asList(new ReduceInventoryDto(12L, 2), new ReduceInventoryDto(7L, 1)));
        verify(redisCache, never()).setHashValues(anyString(), anyMap());
        verify(redisCache).deleteObject("TAKEAWAY_REQ:1:r1");
    }

    @Test
    public void create_RejectsBadInput() {
        assertEquals(400, takeawayService.create(req(null, 4)).getCode().intValue());
        assertEquals(400, takeawayService.create(req("r1", 5)).getCode().intValue());
        assertEquals(400, takeawayService.create(new TakeawayReqDto("r1", Collections.emptyList(), 4, null)).getCode().intValue());
        assertEquals(400, takeawayService.create(new TakeawayReqDto("r1",
                Collections.singletonList(new TakeawayItemDto(12L, null, 100)), 4, null)).getCode().intValue());
        TakeawayReqDto longRemark = req("r1", 4);
        longRemark.setRemark(String.join("", Collections.nCopies(101, "a")));
        assertEquals(400, takeawayService.create(longRemark).getCode().intValue());
        verify(productFeign, never()).reduceInventories(anyList());
    }

    @Test
    public void handover_DeletesKitchenCopy_Publishes() {
        Map<String, Object> hash = new HashMap<>();
        hash.put("id", "9001");
        hash.put("orderType", 1);
        when(redisCache.getAllHash("orderInfo:1:-12")).thenReturn(hash);
        Result r = takeawayService.handover(12);
        assertEquals(200, r.getCode().intValue());
        verify(redisCache).deleteObject("orderInfo:1:-12");
        verify(redisCache).deleteObject("orderItem:1:-12");
        verify(redisCache).convertAndSend(eq("order_edited"), contains("\"tableId\":\"-12\""));
        verify(redisCache).convertAndSend(eq("order_edited"), contains("\"op\":\"HANDOVER\""));
    }

    @Test
    public void handover_UnknownTicket_Returns404() {
        when(redisCache.getAllHash("orderInfo:1:-99")).thenReturn(new HashMap<>());
        assertEquals(404, takeawayService.handover(99).getCode().intValue());
        verify(redisCache, never()).deleteObject(anyString());
    }

    @Test
    public void ticketSeqKey_UsesVietnamDate() {
        // 2026-11-11T17:30Z = 00:30 ngày 12/11 giờ Việt Nam
        assertEquals("TAKEAWAY_SEQ:1:20261112", TakeawayServiceImpl.ticketSeqKey(1L, Instant.parse("2026-11-11T17:30:00Z")));
        assertEquals("TAKEAWAY_SEQ:1:20261111", TakeawayServiceImpl.ticketSeqKey(1L, Instant.parse("2026-11-11T16:59:00Z")));
    }
}

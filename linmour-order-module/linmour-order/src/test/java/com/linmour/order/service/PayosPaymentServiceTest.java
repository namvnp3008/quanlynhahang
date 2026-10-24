package com.linmour.order.service;

import com.alibaba.fastjson.JSON;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.linmour.order.constants.OrderConstant;
import com.linmour.order.mapper.PayosTransactionMapper;
import com.linmour.order.pojo.Do.OrderInfo;
import com.linmour.order.pojo.Do.PayosTransaction;
import com.linmour.order.pojo.Dto.CheckoutDto;
import com.linmour.order.pojo.Dto.PayosCreateReqDto;
import com.linmour.order.pojo.Dto.PayosCreateRespDto;
import com.linmour.order.pojo.Dto.PayosWebhookReqDto;
import com.linmour.order.service.impl.PayosPaymentServiceImpl;
import com.linmour.order.utils.PayosSignatureUtil;
import com.linmour.security.dtos.Result;
import com.linmour.security.exception.CustomException;
import com.linmour.security.utils.RedisCache;
import com.linmour.system.pojo.Dto.PayosConfigDto;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@RunWith(MockitoJUnitRunner.class)
public class PayosPaymentServiceTest {

    @Mock
    private RedisCache redisCache;

    @Mock
    private com.linmour.order.feign.SystemFeign systemFeign;

    @Mock
    private PayosTransactionMapper payosTransactionMapper;

    @Mock
    private PayosClient payosClient;

    @Mock
    private OrderInfoService orderInfoService;

    @Mock
    private org.redisson.api.RedissonClient redissonClient;

    @InjectMocks
    private PayosPaymentServiceImpl payosPaymentService;

    @Before
    public void setup() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), PayosTransaction.class);
        ReflectionTestUtils.setField(payosPaymentService, "webBaseUrl", "http://127.0.0.1:5181");
    }

    @Test(expected = CustomException.class)
    public void testMissingShopId() {
        payosPaymentService.createPaymentLink(null, new PayosCreateReqDto(8L));
    }

    @Test(expected = CustomException.class)
    public void testMissingTableId() {
        payosPaymentService.createPaymentLink(1L, new PayosCreateReqDto(null));
    }

    @Test
    public void testShopPayosNotEnabled() {
        PayosConfigDto config = PayosConfigDto.builder().enabled(false).build();
        when(systemFeign.getPayosConfig(1L)).thenReturn(Result.success(config));

        try {
            payosPaymentService.createPaymentLink(1L, new PayosCreateReqDto(8L));
            fail("Phải throw CustomException khi quán chưa bật PayOS");
        } catch (CustomException ce) {
            assertEquals("Quán chưa bật thanh toán PayOS", ce.getMessage());
        }
    }

    @Test
    public void testTableNoOpenOrder() {
        PayosConfigDto config = PayosConfigDto.builder()
                .enabled(true)
                .clientId("cid-1234")
                .apiKey("api-5678")
                .checksumKey("check-9999")
                .build();
        when(systemFeign.getPayosConfig(1L)).thenReturn(Result.success(config));
        when(redisCache.getAllHash(OrderConstant.ORDERINFO + ":1:8")).thenReturn(new HashMap<>());

        try {
            payosPaymentService.createPaymentLink(1L, new PayosCreateReqDto(8L));
            fail("Phải throw CustomException khi bàn chưa có đơn");
        } catch (CustomException ce) {
            assertEquals("Bàn chưa có đơn để thanh toán", ce.getMessage());
        }
    }

    @Test
    public void testSuccessfulPaymentLinkCreation() {
        PayosConfigDto config = PayosConfigDto.builder()
                .enabled(true)
                .clientId("cid-1234")
                .apiKey("api-5678")
                .checksumKey("check-9999")
                .build();
        when(systemFeign.getPayosConfig(1L)).thenReturn(Result.success(config));

        Map<String, Object> orderMap = new HashMap<>();
        orderMap.put("id", 1001L);
        orderMap.put("payAmount", new BigDecimal("65000"));
        when(redisCache.getAllHash(OrderConstant.ORDERINFO + ":1:8")).thenReturn(orderMap);

        PayosCreateRespDto clientResp = PayosCreateRespDto.builder()
                .orderCode(1729601234L)
                .checkoutUrl("https://pay.payos.vn/web/mock-1729601234")
                .qrCode("vietqr-mock-string")
                .amount(65000L)
                .expiredAt(1729602134L)
                .paymentLinkId("mock-link-1729601234")
                .build();
        when(payosClient.createPaymentLink(anyLong(), eq(65000L), anyString(), anyString(), anyString(), anyLong(), eq(config)))
                .thenReturn(clientResp);

        PayosCreateRespDto result = payosPaymentService.createPaymentLink(1L, new PayosCreateReqDto(8L));

        assertNotNull(result);
        assertEquals(Long.valueOf(65000L), result.getAmount());
        assertEquals("https://pay.payos.vn/web/mock-1729601234", result.getCheckoutUrl());
        assertEquals("mock-link-1729601234", result.getPaymentLinkId());

        ArgumentCaptor<PayosTransaction> txCaptor = ArgumentCaptor.forClass(PayosTransaction.class);
        verify(payosTransactionMapper, times(1)).insert(txCaptor.capture());
        PayosTransaction capturedTx = txCaptor.getValue();
        assertEquals("mock-link-1729601234", capturedTx.getPaymentLinkId());
        assertEquals("https://pay.payos.vn/web/mock-1729601234", capturedTx.getCheckoutUrl());
        verify(redisCache, times(1)).setCacheObject(startsWith("payos:order:"), anyString(), eq(24), eq(TimeUnit.HOURS));
        verify(redisCache, times(1)).setCacheObject(eq("payos:table:1:8"), any(), eq(15), eq(TimeUnit.MINUTES));
    }

    @Test
    public void testReuseExistingValidPaymentLink() {
        PayosConfigDto config = PayosConfigDto.builder()
                .enabled(true)
                .clientId("cid-1234")
                .apiKey("api-5678")
                .checksumKey("check-9999")
                .build();
        when(systemFeign.getPayosConfig(1L)).thenReturn(Result.success(config));

        Map<String, Object> orderMap = new HashMap<>();
        orderMap.put("id", 1001L);
        orderMap.put("payAmount", new BigDecimal("65000"));
        when(redisCache.getAllHash(OrderConstant.ORDERINFO + ":1:8")).thenReturn(orderMap);

        // Đã có mã link trong DB cho bàn
        PayosTransaction existingTx = PayosTransaction.builder()
                .orderCode(1729601234L)
                .orderId(1001L)
                .shopId(1L)
                .tableId(8L)
                .amount(new BigDecimal("65000"))
                .status("PENDING")
                .checkoutUrl("https://pay.payos.vn/web/existing-link")
                .qrCode("existing-qr")
                .createTime(LocalDateTime.now().minusMinutes(2)) // mới tạo 2 phút trước, còn hạn
                .build();
        when(payosTransactionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(java.util.Collections.singletonList(existingTx));

        PayosCreateRespDto result = payosPaymentService.createPaymentLink(1L, new PayosCreateReqDto(8L));

        assertNotNull(result);
        assertEquals(Long.valueOf(1729601234L), result.getOrderCode());
        assertEquals("https://pay.payos.vn/web/existing-link", result.getCheckoutUrl());
        assertEquals("existing-qr", result.getQrCode());

        // Không được gọi payosClient để tạo link mới
        verify(payosClient, never()).createPaymentLink(anyLong(), anyLong(), anyString(), anyString(), anyString(), anyLong(), any());
    }

    @Test
    public void testCreatePaymentLink_CancelsOldLink_WhenAmountChanged() {
        PayosConfigDto config = PayosConfigDto.builder()
                .enabled(true)
                .clientId("cid-1234")
                .apiKey("api-5678")
                .checksumKey("check-9999")
                .build();
        when(systemFeign.getPayosConfig(1L)).thenReturn(Result.success(config));

        // Khách gọi thêm món, đơn tăng từ 25k lên 60k
        Map<String, Object> orderMap = new HashMap<>();
        orderMap.put("id", 1001L);
        orderMap.put("payAmount", new BigDecimal("60000"));
        when(redisCache.getAllHash(OrderConstant.ORDERINFO + ":1:8")).thenReturn(orderMap);

        PayosTransaction oldTx = PayosTransaction.builder()
                .orderCode(179268111111L)
                .orderId(1001L)
                .shopId(1L)
                .tableId(8L)
                .amount(new BigDecimal("25000")) // số tiền cũ
                .status("PENDING")
                .createTime(LocalDateTime.now().minusMinutes(2))
                .build();
        when(payosTransactionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(java.util.Collections.singletonList(oldTx));

        com.alibaba.fastjson.JSONObject cancelJson = new com.alibaba.fastjson.JSONObject();
        cancelJson.put("status", "CANCELLED");
        when(payosClient.cancelPaymentLink(eq(179268111111L), anyString(), eq(config))).thenReturn(cancelJson);

        PayosCreateRespDto newResp = PayosCreateRespDto.builder()
                .orderCode(179268222222L)
                .amount(60000L)
                .checkoutUrl("https://pay.payos.vn/web/mock-new")
                .qrCode("mock-qr-new")
                .expiredAt(Instant.now().getEpochSecond() + 900)
                .build();
        when(payosClient.createPaymentLink(anyLong(), eq(60000L), anyString(), anyString(), anyString(), anyLong(), any()))
                .thenReturn(newResp);

        PayosCreateRespDto result = payosPaymentService.createPaymentLink(1L, new PayosCreateReqDto(8L));

        assertNotNull(result);
        assertEquals(Long.valueOf(179268222222L), result.getOrderCode());

        // Kiểm tra đã gọi PayOS hủy link cũ
        verify(payosClient, times(1)).cancelPaymentLink(eq(179268111111L), anyString(), eq(config));
        // Kiểm tra tx cũ được cập nhật thành CANCELLED
        verify(payosTransactionMapper, times(1)).updateById(argThat(t ->
                t.getOrderCode().equals(179268111111L) && "CANCELLED".equals(t.getStatus())
        ));
    }

    @Test
    public void testCreatePaymentLink_CancelsOldLink_WhenOrderIdChanged() {
        PayosConfigDto config = PayosConfigDto.builder()
                .enabled(true)
                .clientId("cid-1234")
                .apiKey("api-5678")
                .checksumKey("check-9999")
                .build();
        when(systemFeign.getPayosConfig(1L)).thenReturn(Result.success(config));

        // Bàn có khách mới với orderId 2002
        Map<String, Object> orderMap = new HashMap<>();
        orderMap.put("id", 2002L);
        orderMap.put("payAmount", new BigDecimal("50000"));
        when(redisCache.getAllHash(OrderConstant.ORDERINFO + ":1:8")).thenReturn(orderMap);

        PayosTransaction oldTx = PayosTransaction.builder()
                .orderCode(179268333333L)
                .orderId(1001L) // đơn của khách cũ
                .shopId(1L)
                .tableId(8L)
                .amount(new BigDecimal("50000"))
                .status("PENDING")
                .createTime(LocalDateTime.now().minusMinutes(2))
                .build();
        when(payosTransactionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(java.util.Collections.singletonList(oldTx));

        com.alibaba.fastjson.JSONObject cancelJson = new com.alibaba.fastjson.JSONObject();
        cancelJson.put("status", "CANCELLED");
        when(payosClient.cancelPaymentLink(eq(179268333333L), anyString(), eq(config))).thenReturn(cancelJson);

        PayosCreateRespDto newResp = PayosCreateRespDto.builder()
                .orderCode(179268444444L)
                .amount(50000L)
                .checkoutUrl("https://pay.payos.vn/web/mock-new-cust")
                .qrCode("mock-qr-new-cust")
                .expiredAt(Instant.now().getEpochSecond() + 900)
                .build();
        when(payosClient.createPaymentLink(anyLong(), eq(50000L), anyString(), anyString(), anyString(), anyLong(), any()))
                .thenReturn(newResp);

        PayosCreateRespDto result = payosPaymentService.createPaymentLink(1L, new PayosCreateReqDto(8L));

        assertNotNull(result);
        assertEquals(Long.valueOf(179268444444L), result.getOrderCode());

        // Kiểm tra đã gọi PayOS hủy link cũ
        verify(payosClient, times(1)).cancelPaymentLink(eq(179268333333L), anyString(), eq(config));
        // Kiểm tra tx cũ được cập nhật thành CANCELLED
        verify(payosTransactionMapper, times(1)).updateById(argThat(t ->
                t.getOrderCode().equals(179268333333L) && "CANCELLED".equals(t.getStatus())
        ));
    }

    @Test
    public void testWebhookPingVerification_OrderCode123() {
        Map<String, Object> data = new HashMap<>();
        data.put("orderCode", 123);

        PayosWebhookReqDto dto = PayosWebhookReqDto.builder()
                .code("00")
                .data(data)
                .signature("any-sig")
                .build();

        Result result = payosPaymentService.handleWebhook(dto);
        assertNotNull(result);
        assertEquals(Integer.valueOf(200), result.getCode());
        verify(orderInfoService, never()).checkout(any());
    }

    @Test
    public void testWebhookInvalidSignature_IgnoredWithoutCheckout() {
        PayosTransaction tx = PayosTransaction.builder()
                .orderCode(1729605555L)
                .shopId(1L)
                .tableId(8L)
                .amount(new BigDecimal("50000"))
                .status("PENDING")
                .build();
        when(payosTransactionMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(tx);

        PayosConfigDto config = PayosConfigDto.builder()
                .checksumKey("test-checksum-key-123")
                .build();
        when(systemFeign.getPayosConfig(1L)).thenReturn(Result.success(config));

        Map<String, Object> data = new HashMap<>();
        data.put("orderCode", 1729605555L);
        data.put("amount", 50000);
        data.put("code", "00");

        PayosWebhookReqDto dto = PayosWebhookReqDto.builder()
                .code("00")
                .data(data)
                .signature("invalid-wrong-signature")
                .build();

        Result result = payosPaymentService.handleWebhook(dto);
        assertNotNull(result);
        assertEquals(Integer.valueOf(200), result.getCode());
        // Không được checkout và không được update status
        verify(orderInfoService, never()).checkout(any());
        verify(payosTransactionMapper, never()).updateById(any());
    }

    @Test
    public void testWebhookIdempotent_AlreadyPaid() {
        PayosTransaction tx = PayosTransaction.builder()
                .orderCode(1729605555L)
                .shopId(1L)
                .tableId(8L)
                .amount(new BigDecimal("50000"))
                .status("PAID")
                .build();
        when(payosTransactionMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(tx);

        Map<String, Object> data = new HashMap<>();
        data.put("orderCode", 1729605555L);

        PayosWebhookReqDto dto = PayosWebhookReqDto.builder()
                .code("00")
                .data(data)
                .signature("any-sig")
                .build();

        Result result = payosPaymentService.handleWebhook(dto);
        assertNotNull(result);
        assertEquals(Integer.valueOf(200), result.getCode());
        verify(orderInfoService, never()).checkout(any());
    }

    @Test
    public void testWebhookSuccessfulPayment_CallsCheckoutAndSetsPaid() {
        String checksumKey = "secret-checksum-key-999";

        PayosTransaction tx = PayosTransaction.builder()
                .id(99L)
                .orderCode(1729607777L)
                .shopId(1L)
                .tableId(8L)
                .orderId(123456L)
                .amount(new BigDecimal("50000"))
                .status("PENDING")
                .build();
        when(payosTransactionMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(tx);

        PayosConfigDto config = PayosConfigDto.builder()
                .checksumKey(checksumKey)
                .build();
        when(systemFeign.getPayosConfig(1L)).thenReturn(Result.success(config));

        // Mock Redis đơn hàng đang mở khớp chính xác
        Map<String, Object> openOrder = new HashMap<>();
        openOrder.put("id", 123456L);
        openOrder.put("payAmount", new BigDecimal("50000"));
        when(redisCache.getAllHash("orderInfo:1:8")).thenReturn(openOrder);

        Map<String, Object> data = new HashMap<>();
        data.put("orderCode", 1729607777L);
        data.put("amount", 50000);
        data.put("code", "00");
        data.put("reference", "BANK_REF_12345");

        // Tính chữ ký hợp lệ
        String validSig = PayosSignatureUtil.hmacSha256(
                "amount=50000&code=00&orderCode=1729607777&reference=BANK_REF_12345",
                checksumKey
        );

        PayosWebhookReqDto dto = PayosWebhookReqDto.builder()
                .code("00")
                .data(data)
                .signature(validSig)
                .build();

        when(orderInfoService.checkout(any(CheckoutDto.class))).thenReturn(Result.success());

        Result result = payosPaymentService.handleWebhook(dto);
        assertNotNull(result);
        assertEquals(Integer.valueOf(200), result.getCode());

        // Kiểm tra checkout được gọi đúng với tableId 8 và payType 5
        ArgumentCaptor<CheckoutDto> captor = ArgumentCaptor.forClass(CheckoutDto.class);
        verify(orderInfoService, times(1)).checkout(captor.capture());
        assertEquals("8", captor.getValue().getTableId());
        assertEquals(Integer.valueOf(5), captor.getValue().getPayType());

        // Kiểm tra tx được cập nhật thành PAID
        verify(payosTransactionMapper, times(1)).updateById(argThat(t ->
                "PAID".equals(t.getStatus()) && "BANK_REF_12345".equals(t.getReference())
        ));
        // Kiểm tra xóa key table ở Redis
        verify(redisCache, times(1)).deleteObject("payos:table:1:8");
    }

    @Test
    public void testWebhook_Mismatch_CustomerAddedItems() {
        String checksumKey = "secret-checksum-key-999";
        PayosTransaction tx = PayosTransaction.builder()
                .id(1L)
                .orderCode(179268908575L)
                .shopId(1L)
                .tableId(8L)
                .orderId(123456L)
                .amount(new BigDecimal("25000"))
                .status("PENDING")
                .build();
        when(payosTransactionMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(tx);

        PayosConfigDto config = PayosConfigDto.builder().checksumKey(checksumKey).build();
        when(systemFeign.getPayosConfig(1L)).thenReturn(Result.success(config));

        // Khách gọi thêm trà đào, đơn tăng lên 60.000 đ
        Map<String, Object> openOrder = new HashMap<>();
        openOrder.put("id", 123456L);
        openOrder.put("payAmount", new BigDecimal("60000"));
        when(redisCache.getAllHash("orderInfo:1:8")).thenReturn(openOrder);

        Map<String, Object> data = new HashMap<>();
        data.put("orderCode", 179268908575L);
        data.put("amount", 25000);
        data.put("code", "00");
        data.put("reference", "REF_OLD_25K");

        String validSig = PayosSignatureUtil.hmacSha256(
                "amount=25000&code=00&orderCode=179268908575&reference=REF_OLD_25K",
                checksumKey
        );
        PayosWebhookReqDto dto = PayosWebhookReqDto.builder().code("00").data(data).signature(validSig).build();

        Result res = payosPaymentService.handleWebhook(dto);
        assertNotNull(res);
        assertEquals(Integer.valueOf(200), res.getCode());

        // KHÔNG được checkout!
        verify(orderInfoService, never()).checkout(any());

        // Giao dịch phải chuyển thành PAID_MISMATCH
        verify(payosTransactionMapper, times(1)).updateById(argThat(t ->
                "PAID_MISMATCH".equals(t.getStatus()) && "REF_OLD_25K".equals(t.getReference())
        ));

        // Đẩy WS admin qua kênh payos_mismatch
        ArgumentCaptor<String> channelCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> msgCaptor = ArgumentCaptor.forClass(String.class);
        verify(redisCache, atLeastOnce()).convertAndSend(channelCaptor.capture(), msgCaptor.capture());
        assertEquals("payos_mismatch", channelCaptor.getValue());
        assertTrue(msgCaptor.getValue().contains("\"msg\":\"payosMismatch\""));
        assertTrue(msgCaptor.getValue().contains("\"paidAmount\":25000"));
        assertTrue(msgCaptor.getValue().contains("\"dueAmount\":60000"));
    }

    @Test
    public void testWebhook_Mismatch_NewCustomerAtTable() {
        String checksumKey = "secret-checksum-key-999";
        PayosTransaction tx = PayosTransaction.builder()
                .id(1L)
                .orderCode(179268908575L)
                .shopId(1L)
                .tableId(8L)
                .orderId(123456L) // Đơn của khách cũ
                .amount(new BigDecimal("25000"))
                .status("PENDING")
                .build();
        when(payosTransactionMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(tx);

        PayosConfigDto config = PayosConfigDto.builder().checksumKey(checksumKey).build();
        when(systemFeign.getPayosConfig(1L)).thenReturn(Result.success(config));

        // Bàn 8 đã có khách mới với orderId khác
        Map<String, Object> openOrder = new HashMap<>();
        openOrder.put("id", 999999L);
        openOrder.put("payAmount", new BigDecimal("25000"));
        when(redisCache.getAllHash("orderInfo:1:8")).thenReturn(openOrder);

        Map<String, Object> data = new HashMap<>();
        data.put("orderCode", 179268908575L);
        data.put("amount", 25000);
        data.put("code", "00");
        data.put("reference", "REF_NEW_CUST");

        String validSig = PayosSignatureUtil.hmacSha256(
                "amount=25000&code=00&orderCode=179268908575&reference=REF_NEW_CUST",
                checksumKey
        );
        PayosWebhookReqDto dto = PayosWebhookReqDto.builder().code("00").data(data).signature(validSig).build();

        Result res = payosPaymentService.handleWebhook(dto);
        assertNotNull(res);

        // KHÔNG checkout vì orderId không khớp!
        verify(orderInfoService, never()).checkout(any());
        verify(payosTransactionMapper, times(1)).updateById(argThat(t ->
                "PAID_MISMATCH".equals(t.getStatus())
        ));
    }

    @Test
    public void testWebhook_Mismatch_CashPaidAlready() {
        String checksumKey = "secret-checksum-key-999";
        PayosTransaction tx = PayosTransaction.builder()
                .id(1L)
                .orderCode(179268908575L)
                .shopId(1L)
                .tableId(8L)
                .orderId(123456L)
                .amount(new BigDecimal("25000"))
                .status("PENDING")
                .build();
        when(payosTransactionMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(tx);

        PayosConfigDto config = PayosConfigDto.builder().checksumKey(checksumKey).build();
        when(systemFeign.getPayosConfig(1L)).thenReturn(Result.success(config));

        // Nhân viên đã thu tiền mặt, Redis không còn đơn mở
        when(redisCache.getAllHash("orderInfo:1:8")).thenReturn(new HashMap<>());

        Map<String, Object> data = new HashMap<>();
        data.put("orderCode", 179268908575L);
        data.put("amount", 25000);
        data.put("code", "00");

        String validSig = PayosSignatureUtil.hmacSha256(
                "amount=25000&code=00&orderCode=179268908575",
                checksumKey
        );
        PayosWebhookReqDto dto = PayosWebhookReqDto.builder().code("00").data(data).signature(validSig).build();

        Result res = payosPaymentService.handleWebhook(dto);
        assertNotNull(res);

        // KHÔNG checkout, chuyển PAID_MISMATCH
        verify(orderInfoService, never()).checkout(any());
        verify(payosTransactionMapper, times(1)).updateById(argThat(t ->
                "PAID_MISMATCH".equals(t.getStatus())
        ));
    }

    @Test
    public void testWebhook_CheckoutFailure_SetsPaidUnmatched() {
        String checksumKey = "secret-checksum-key-999";
        PayosTransaction tx = PayosTransaction.builder()
                .id(1L)
                .orderCode(179268908575L)
                .shopId(1L)
                .tableId(8L)
                .orderId(123456L)
                .amount(new BigDecimal("25000"))
                .status("PENDING")
                .build();
        when(payosTransactionMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(tx);

        PayosConfigDto config = PayosConfigDto.builder().checksumKey(checksumKey).build();
        when(systemFeign.getPayosConfig(1L)).thenReturn(Result.success(config));

        // Đơn hàng khớp điều kiện
        Map<String, Object> openOrder = new HashMap<>();
        openOrder.put("id", 123456L);
        openOrder.put("payAmount", new BigDecimal("25000"));
        when(redisCache.getAllHash("orderInfo:1:8")).thenReturn(openOrder);

        Map<String, Object> data = new HashMap<>();
        data.put("orderCode", 179268908575L);
        data.put("amount", 25000);
        data.put("code", "00");

        String validSig = PayosSignatureUtil.hmacSha256(
                "amount=25000&code=00&orderCode=179268908575",
                checksumKey
        );
        PayosWebhookReqDto dto = PayosWebhookReqDto.builder().code("00").data(data).signature(validSig).build();

        // Checkout trả về lỗi (ví dụ conflict)
        when(orderInfoService.checkout(any(CheckoutDto.class))).thenReturn(Result.error(500, "Lỗi checkout"));

        Result res = payosPaymentService.handleWebhook(dto);
        assertNotNull(res);

        // Đã gọi checkout nhưng thất bại -> chuyển sang PAID_UNMATCHED
        verify(orderInfoService, times(1)).checkout(any());
        verify(payosTransactionMapper, times(1)).updateById(argThat(t ->
                "PAID_UNMATCHED".equals(t.getStatus())
        ));
        // Đẩy WS cho admin
        verify(redisCache, atLeastOnce()).convertAndSend(eq("payos_mismatch"), anyString());
    }

    @Test
    public void testGetTransactions_FilterByShopDateStatus() {
        PayosTransaction tx1 = PayosTransaction.builder()
                .id(1L)
                .orderCode(1001L)
                .shopId(1L)
                .status("PAID")
                .amount(new BigDecimal("50000"))
                .createTime(LocalDateTime.now())
                .build();

        when(payosTransactionMapper.selectList(any(LambdaQueryWrapper.class)))
                .thenReturn(java.util.Collections.singletonList(tx1));

        List<PayosTransaction> list = payosPaymentService.getTransactions(1L, "2026-10-22", "PAID");
        assertNotNull(list);
        assertEquals(1, list.size());
        assertEquals(Long.valueOf(1001L), list.get(0).getOrderCode());
    }

    @Test
    public void testRecheckTransaction_AlreadyPaid() {
        PayosTransaction tx = PayosTransaction.builder()
                .id(1L)
                .orderCode(1001L)
                .shopId(1L)
                .status("PAID")
                .build();
        when(payosTransactionMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(tx);

        Result res = payosPaymentService.recheckTransaction(1L, 1001L);
        assertNotNull(res);
        assertEquals(Integer.valueOf(200), res.getCode());
        verify(payosClient, never()).getPaymentLinkInformation(anyLong(), any());
    }

    @Test(expected = CustomException.class)
    public void testRecheckTransaction_CrossShopForbidden() {
        PayosTransaction tx = PayosTransaction.builder()
                .id(1L)
                .orderCode(1001L)
                .shopId(2L) // Thuộc shop 2
                .status("PENDING")
                .build();
        when(payosTransactionMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(tx);

        payosPaymentService.recheckTransaction(1L, 1001L); // Merchant shop 1 gọi
    }

    @Test
    public void testRecheckTransaction_PendingToPaid() {
        PayosTransaction tx = PayosTransaction.builder()
                .id(1L)
                .orderCode(1001L)
                .shopId(1L)
                .tableId(8L)
                .orderId(123456L)
                .amount(new BigDecimal("50000"))
                .status("PENDING")
                .build();
        when(payosTransactionMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(tx);

        PayosConfigDto config = PayosConfigDto.builder().apiKey("api-123").build();
        when(systemFeign.getPayosConfig(1L)).thenReturn(Result.success(config));

        // Mock đơn hàng mở trên bàn 8
        Map<String, Object> openOrder = new HashMap<>();
        openOrder.put("id", 123456L);
        openOrder.put("payAmount", new BigDecimal("50000"));
        when(redisCache.getAllHash("orderInfo:1:8")).thenReturn(openOrder);

        com.alibaba.fastjson.JSONObject payosData = new com.alibaba.fastjson.JSONObject();
        payosData.put("status", "PAID");
        payosData.put("amount", 50000L);
        payosData.put("reference", "REF_RECHECK_999");
        when(payosClient.getPaymentLinkInformation(1001L, config)).thenReturn(payosData);

        when(orderInfoService.checkout(any(CheckoutDto.class))).thenReturn(Result.success());

        Result res = payosPaymentService.recheckTransaction(1L, 1001L);
        assertNotNull(res);
        assertEquals(Integer.valueOf(200), res.getCode());

        verify(orderInfoService, times(1)).checkout(any(CheckoutDto.class));
        verify(payosTransactionMapper, times(1)).updateById(argThat(t ->
                "PAID".equals(t.getStatus()) && "REF_RECHECK_999".equals(t.getReference())
        ));
    }

    @Test
    public void testCreatePaymentLink_CancelRemoteFails_KeepsOldLinkPending() {
        PayosConfigDto config = PayosConfigDto.builder()
                .enabled(true)
                .clientId("cid-1234")
                .apiKey("api-5678")
                .checksumKey("check-9999")
                .build();
        when(systemFeign.getPayosConfig(1L)).thenReturn(Result.success(config));

        // Khách gọi thêm món, đơn tăng từ 25k lên 60k
        Map<String, Object> orderMap = new HashMap<>();
        orderMap.put("id", 1001L);
        orderMap.put("payAmount", new BigDecimal("60000"));
        when(redisCache.getAllHash(OrderConstant.ORDERINFO + ":1:8")).thenReturn(orderMap);

        PayosTransaction oldTx = PayosTransaction.builder()
                .orderCode(179268555555L)
                .orderId(1001L)
                .shopId(1L)
                .tableId(8L)
                .amount(new BigDecimal("25000"))
                .status("PENDING")
                .createTime(LocalDateTime.now().minusMinutes(2))
                .build();
        when(payosTransactionMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(java.util.Collections.singletonList(oldTx));

        // Hủy link từ PayOS thất bại (trả null)
        when(payosClient.cancelPaymentLink(eq(179268555555L), anyString(), eq(config))).thenReturn(null);

        PayosCreateRespDto newResp = PayosCreateRespDto.builder()
                .orderCode(179268666666L)
                .amount(60000L)
                .checkoutUrl("https://pay.payos.vn/web/mock-new")
                .qrCode("mock-qr-new")
                .expiredAt(Instant.now().getEpochSecond() + 900)
                .build();
        when(payosClient.createPaymentLink(anyLong(), eq(60000L), anyString(), anyString(), anyString(), anyLong(), any()))
                .thenReturn(newResp);

        PayosCreateRespDto result = payosPaymentService.createPaymentLink(1L, new PayosCreateReqDto(8L));

        assertNotNull(result);
        assertEquals(Long.valueOf(179268666666L), result.getOrderCode());

        // Kiểm tra đã gọi PayOS hủy link cũ
        verify(payosClient, times(1)).cancelPaymentLink(eq(179268555555L), anyString(), eq(config));
        // P-6: Do hủy thất bại, tx cũ KHÔNG được update thành CANCELLED (vẫn giữ PENDING)
        verify(payosTransactionMapper, never()).updateById(argThat(t ->
                t != null && t.getOrderCode().equals(179268555555L) && "CANCELLED".equals(t.getStatus())
        ));
    }

    @Test
    public void testWebhook_CancelledTransaction_PaidWithCode00_BecomesPaidMismatch_NoCheckout() {
        PayosConfigDto config = PayosConfigDto.builder()
                .checksumKey("test-checksum-key-123")
                .build();
        when(systemFeign.getPayosConfig(1L)).thenReturn(Result.success(config));

        // Giao dịch đã CANCELLED trước đó bởi P-2
        PayosTransaction tx = PayosTransaction.builder()
                .orderCode(179272121014L)
                .shopId(1L)
                .tableId(8L)
                .orderId(1001L)
                .amount(new BigDecimal("60000"))
                .status("CANCELLED")
                .build();
        when(payosTransactionMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(tx);

        // Bàn 8 đang có đơn mở 85.000 (khách đã gọi thêm món tạo link mới)
        Map<String, Object> openOrder = new HashMap<>();
        openOrder.put("id", 1001L);
        openOrder.put("payAmount", new BigDecimal("85000"));
        when(redisCache.getAllHash("orderInfo:1:8")).thenReturn(openOrder);

        // Webhook code 00 thành công cho link cũ 60.000
        Map<String, Object> data = new HashMap<>();
        data.put("orderCode", 179272121014L);
        data.put("amount", 60000L);
        data.put("code", "00");
        data.put("reference", "REF_OLD_LINK_PAID");

        String signature = PayosSignatureUtil.hmacSha256(
                "amount=60000&code=00&orderCode=179272121014&reference=REF_OLD_LINK_PAID",
                config.getChecksumKey()
        );

        PayosWebhookReqDto webhookDto = PayosWebhookReqDto.builder()
                .code("00")
                .desc("Success")
                .data(data)
                .signature(signature)
                .build();

        Result result = payosPaymentService.handleWebhook(webhookDto);

        assertNotNull(result);
        assertEquals(Integer.valueOf(200), result.getCode());
        // P-6: Giao dịch CANCELLED được trả tiền -> chuyển sang PAID_MISMATCH
        // P-9: Thông điệp in trạng thái cũ CANCELLED
        assertEquals("Transaction was CANCELLED but paid (PAID_MISMATCH)", result.getData());
        verify(payosTransactionMapper, times(1)).updateById(argThat(t ->
                t != null && t.getOrderCode().equals(179272121014L)
                        && "PAID_MISMATCH".equals(t.getStatus())
                        && "REF_OLD_LINK_PAID".equals(t.getReference())
        ));

        // KHÔNG checkout
        verify(orderInfoService, never()).checkout(any(CheckoutDto.class));

        // Bắn sự kiện WS payosMismatch cho admin với dueAmount=85000, paidAmount=60000
        verify(redisCache, atLeastOnce()).convertAndSend(eq("payos_mismatch"), argThat(msg ->
                msg != null && msg.toString().contains("payosMismatch")
                        && msg.toString().contains("\"dueAmount\":85000")
                        && msg.toString().contains("\"paidAmount\":60000")
        ));
    }

    @Test
    public void testWebhook_ExpiredTransaction_PaidWithCode00_BecomesPaidMismatch_NoCheckout() {
        PayosConfigDto config = PayosConfigDto.builder()
                .checksumKey("test-checksum-key-123")
                .build();
        when(systemFeign.getPayosConfig(1L)).thenReturn(Result.success(config));

        // Giao dịch đã EXPIRED
        PayosTransaction tx = PayosTransaction.builder()
                .orderCode(179272121015L)
                .shopId(1L)
                .tableId(8L)
                .orderId(1001L)
                .amount(new BigDecimal("35000"))
                .status("EXPIRED")
                .build();
        when(payosTransactionMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(tx);

        // Bàn 8 đã không còn đơn mở (dueAmount = 0)
        when(redisCache.getAllHash("orderInfo:1:8")).thenReturn(null);

        Map<String, Object> data = new HashMap<>();
        data.put("orderCode", 179272121015L);
        data.put("amount", 35000L);
        data.put("code", "00");
        data.put("reference", "REF_EXPIRED_LINK_PAID");

        String signature = PayosSignatureUtil.hmacSha256(
                "amount=35000&code=00&orderCode=179272121015&reference=REF_EXPIRED_LINK_PAID",
                config.getChecksumKey()
        );

        PayosWebhookReqDto webhookDto = PayosWebhookReqDto.builder()
                .code("00")
                .desc("Success")
                .data(data)
                .signature(signature)
                .build();

        Result result = payosPaymentService.handleWebhook(webhookDto);

        assertNotNull(result);
        assertEquals(Integer.valueOf(200), result.getCode());
        // P-9: Thông điệp in trạng thái cũ EXPIRED
        assertEquals("Transaction was EXPIRED but paid (PAID_MISMATCH)", result.getData());

        // P-6: Chuyển sang PAID_MISMATCH
        verify(payosTransactionMapper, times(1)).updateById(argThat(t ->
                t != null && t.getOrderCode().equals(179272121015L)
                        && "PAID_MISMATCH".equals(t.getStatus())
        ));

        // KHÔNG checkout
        verify(orderInfoService, never()).checkout(any(CheckoutDto.class));

        // Bắn sự kiện WS payosMismatch cho admin với dueAmount=0, paidAmount=35000
        verify(redisCache, atLeastOnce()).convertAndSend(eq("payos_mismatch"), argThat(msg ->
                msg != null && msg.toString().contains("payosMismatch")
                        && msg.toString().contains("\"dueAmount\":0")
                        && msg.toString().contains("\"paidAmount\":35000")
        ));
    }

    @Test
    public void testRecheck_CancelledTransaction_WhenRemotePaid_BecomesPaidMismatch() {
        PayosTransaction tx = PayosTransaction.builder()
                .orderCode(179272121014L)
                .shopId(1L)
                .tableId(8L)
                .orderId(1001L)
                .amount(new BigDecimal("60000"))
                .status("CANCELLED")
                .build();
        when(payosTransactionMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(tx);

        PayosConfigDto config = PayosConfigDto.builder().apiKey("api-123").build();
        when(systemFeign.getPayosConfig(1L)).thenReturn(Result.success(config));

        // Bàn 8 đã đóng đơn -> dueAmount = 0
        when(redisCache.getAllHash("orderInfo:1:8")).thenReturn(null);

        com.alibaba.fastjson.JSONObject payosData = new com.alibaba.fastjson.JSONObject();
        payosData.put("status", "PAID");
        payosData.put("amount", 60000L);
        payosData.put("reference", "REF_RECHECK_CANCELLED");
        when(payosClient.getPaymentLinkInformation(179272121014L, config)).thenReturn(payosData);

        Result res = payosPaymentService.recheckTransaction(1L, 179272121014L);
        assertNotNull(res);
        assertEquals(Integer.valueOf(200), res.getCode());

        // KHÔNG checkout
        verify(orderInfoService, never()).checkout(any(CheckoutDto.class));

        // Chuyển status sang PAID_MISMATCH
        verify(payosTransactionMapper, times(1)).updateById(argThat(t ->
                t != null && t.getOrderCode().equals(179272121014L)
                        && "PAID_MISMATCH".equals(t.getStatus())
                        && "REF_RECHECK_CANCELLED".equals(t.getReference())
        ));

        // Bắn WS cho admin với dueAmount=0, paidAmount=60000
        verify(redisCache, atLeastOnce()).convertAndSend(eq("payos_mismatch"), argThat(msg ->
                msg != null && msg.toString().contains("payosMismatch")
                        && msg.toString().contains("\"dueAmount\":0")
                        && msg.toString().contains("\"paidAmount\":60000")
        ));
    }

    @Test
    public void testConcurrentCreatePaymentLink_OnlyOneLinkCreated() throws Exception {
        PayosConfigDto config = PayosConfigDto.builder()
                .enabled(true)
                .clientId("test-po-a1b2")
                .apiKey("api-key-test")
                .checksumKey("po-checksum-test")
                .build();
        when(systemFeign.getPayosConfig(1L)).thenReturn(Result.success(config));

        Map<String, Object> openOrder = new HashMap<>();
        openOrder.put("id", 2113317300839907328L);
        openOrder.put("payAmount", new BigDecimal("60000"));
        when(redisCache.getAllHash("orderInfo:1:6")).thenReturn(openOrder);

        // Giả lập Redisson lock với ReentrantLock thật
        java.util.concurrent.locks.ReentrantLock realLock = new java.util.concurrent.locks.ReentrantLock();
        org.redisson.api.RLock mockRLock = mock(org.redisson.api.RLock.class);
        doAnswer(inv -> {
            realLock.lock();
            return null;
        }).when(mockRLock).lock();
        doAnswer(inv -> {
            realLock.unlock();
            return null;
        }).when(mockRLock).unlock();
        when(mockRLock.isHeldByCurrentThread()).thenAnswer(inv -> realLock.isHeldByCurrentThread());
        when(redissonClient.getLock("lock:payos:create:1:6")).thenReturn(mockRLock);

        // Giả lập DB lưu transaction và selectList
        List<PayosTransaction> dbTxs = new java.util.concurrent.CopyOnWriteArrayList<>();
        when(payosTransactionMapper.selectList(any())).thenAnswer(inv -> new java.util.ArrayList<>(dbTxs));
        when(payosTransactionMapper.insert(any(PayosTransaction.class))).thenAnswer(inv -> {
            PayosTransaction tx = inv.getArgument(0);
            tx.setCreateTime(LocalDateTime.now());
            dbTxs.add(tx);
            return 1;
        });

        // Giả lập PayosClient.createPaymentLink tạo link với orderCode thực tế được truyền vào
        when(payosClient.createPaymentLink(anyLong(), eq(60000L), anyString(), anyString(), anyString(), anyLong(), eq(config)))
                .thenAnswer(inv -> {
                    Long code = inv.getArgument(0);
                    // Giả lập độ trễ mạng để request thứ 2 tranh chấp lock
                    Thread.sleep(80);
                    return PayosCreateRespDto.builder()
                            .orderCode(code)
                            .amount(60000L)
                            .checkoutUrl("https://payos.vn/web/" + code)
                            .qrCode("00020101021238540010A000000727012600069704220112" + code)
                            .paymentLinkId("mock-link-" + code)
                            .expiredAt(Instant.now().getEpochSecond() + 900)
                            .build();
                });

        // Bắn 2 request đồng thời từ 2 luồng
        java.util.concurrent.CountDownLatch startLatch = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.CountDownLatch doneLatch = new java.util.concurrent.CountDownLatch(2);
        java.util.concurrent.atomic.AtomicReference<PayosCreateRespDto> resp1 = new java.util.concurrent.atomic.AtomicReference<>();
        java.util.concurrent.atomic.AtomicReference<PayosCreateRespDto> resp2 = new java.util.concurrent.atomic.AtomicReference<>();
        java.util.concurrent.atomic.AtomicReference<Throwable> err1 = new java.util.concurrent.atomic.AtomicReference<>();
        java.util.concurrent.atomic.AtomicReference<Throwable> err2 = new java.util.concurrent.atomic.AtomicReference<>();

        Thread t1 = new Thread(() -> {
            try {
                startLatch.await();
                resp1.set(payosPaymentService.createPaymentLink(1L, new PayosCreateReqDto(6L)));
            } catch (Throwable t) {
                err1.set(t);
            } finally {
                doneLatch.countDown();
            }
        });
        Thread t2 = new Thread(() -> {
            try {
                startLatch.await();
                resp2.set(payosPaymentService.createPaymentLink(1L, new PayosCreateReqDto(6L)));
            } catch (Throwable t) {
                err2.set(t);
            } finally {
                doneLatch.countDown();
            }
        });

        t1.start();
        t2.start();
        startLatch.countDown();
        boolean finished = doneLatch.await(5, TimeUnit.SECONDS);
        assertTrue("Cả 2 thread phải hoàn tất trong 5 giây", finished);

        assertNull("Thread 1 không được có lỗi", err1.get());
        assertNull("Thread 2 không được có lỗi", err2.get());
        assertNotNull(resp1.get());
        assertNotNull(resp2.get());

        // Cả 2 request đồng thời đều nhận được link thanh toán
        assertEquals(resp1.get().getOrderCode(), resp2.get().getOrderCode());
        assertEquals(resp1.get().getCheckoutUrl(), resp2.get().getCheckoutUrl());

        // P-8: Nhờ khoá Redisson, PayOS client chỉ được gọi tạo link đúng 1 lần duy nhất!
        verify(payosClient, times(1)).createPaymentLink(anyLong(), anyLong(), anyString(), anyString(), anyString(), anyLong(), any());
        assertEquals(1, dbTxs.size());
    }
}

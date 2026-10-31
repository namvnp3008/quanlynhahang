package com.linmour.order.service.impl;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.linmour.order.constants.OrderConstant;
import com.linmour.order.mapper.PayosTransactionMapper;
import com.linmour.order.pojo.Do.OrderInfo;
import com.linmour.order.pojo.Do.PayosTransaction;
import com.linmour.order.pojo.Dto.CheckoutDto;
import com.linmour.order.pojo.Dto.PayosCreateReqDto;
import com.linmour.order.pojo.Dto.PayosCreateRespDto;
import com.linmour.order.pojo.Dto.PayosWebhookReqDto;
import com.linmour.order.service.OrderInfoService;
import com.linmour.order.service.PayosClient;
import com.linmour.order.service.PayosPaymentService;
import com.linmour.order.utils.PayosSignatureUtil;
import com.linmour.security.dtos.Result;
import com.linmour.security.exception.CustomException;
import com.linmour.security.utils.RedisCache;
import com.linmour.security.utils.SecurityUtils;
import com.linmour.system.pojo.Dto.PayosConfigDto;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import javax.annotation.Resource;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class PayosPaymentServiceImpl implements PayosPaymentService {

    @Resource
    private RedisCache redisCache;

    @Resource
    private com.linmour.order.feign.SystemFeign systemFeign;

    @Resource
    private PayosTransactionMapper payosTransactionMapper;

    @Resource
    private PayosClient payosClient;

    @Resource
    private OrderInfoService orderInfoService;

    @Resource
    private RedissonClient redissonClient;

    @Value("${app.web-base-url:http://127.0.0.1:5181}")
    private String webBaseUrl;

    @Override
    public PayosCreateRespDto createPaymentLink(Long shopId, PayosCreateReqDto reqDto) {
        if (shopId == null || shopId <= 0) {
            throw new CustomException(514, "Thiếu shopId");
        }
        if (reqDto == null || reqDto.getTableId() == null || reqDto.getTableId() <= 0) {
            throw new CustomException(514, "Thiếu tableId");
        }

        Long tableId = reqDto.getTableId();

        // P-8: Khoá Redisson lock:payos:create:<shop>:<table> chống 2 request đồng thời tạo 2 link
        RLock lock = null;
        if (redissonClient != null) {
            lock = redissonClient.getLock("lock:payos:create:" + shopId + ":" + tableId);
            if (lock != null) {
                lock.lock();
            }
        }
        try {
            // 1. Kiểm tra cấu hình PayOS của quán
        Result<PayosConfigDto> configRes = systemFeign.getPayosConfig(shopId);
        PayosConfigDto config = configRes != null ? configRes.getData() : null;
        if (config == null || !Boolean.TRUE.equals(config.getEnabled())
                || StringUtils.isBlank(config.getClientId())
                || StringUtils.isBlank(config.getApiKey())
                || StringUtils.isBlank(config.getChecksumKey())) {
            throw new CustomException(514, "Quán chưa bật thanh toán PayOS");
        }

        // 2. Lấy đơn hàng đang mở trong Redis
        String orderInfoKey = OrderConstant.ORDERINFO + ":" + shopId + ":" + tableId;
        Map<String, Object> orderMap = redisCache.getAllHash(orderInfoKey);
        if (CollectionUtils.isEmpty(orderMap) || orderMap.get("id") == null) {
            throw new CustomException(514, "Bàn chưa có đơn để thanh toán");
        }

        OrderInfo orderInfo = JSON.parseObject(JSON.toJSONString(orderMap), OrderInfo.class);
        if (orderInfo == null || orderInfo.getPayAmount() == null || orderInfo.getPayAmount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new CustomException(514, "Đơn hàng có số tiền không hợp lệ");
        }

        long amount = orderInfo.getPayAmount().longValue();
        Long orderId = null;
        try {
            orderId = Long.valueOf(orderInfo.getId());
        } catch (Exception ignored) {
        }

        // 3. Kiểm tra link PENDING cũ của bàn (P-2)
        String tableKey = "payos:table:" + shopId + ":" + tableId;
        long nowEpoch = Instant.now().getEpochSecond();

        List<PayosTransaction> pendingTxs = payosTransactionMapper.selectList(
                new LambdaQueryWrapper<PayosTransaction>()
                        .eq(PayosTransaction::getShopId, shopId)
                        .eq(PayosTransaction::getTableId, tableId)
                        .eq(PayosTransaction::getStatus, "PENDING")
        );

        PayosTransaction validReusableTx = null;
        for (PayosTransaction existingTx : pendingTxs) {
            boolean sameAmount = existingTx.getAmount() != null && existingTx.getAmount().longValue() == amount;
            boolean sameOrder = existingTx.getOrderId() != null && existingTx.getOrderId().equals(orderId);

            long txCreatedEpoch = existingTx.getCreateTime() != null
                    ? existingTx.getCreateTime().atZone(ZoneId.systemDefault()).toEpochSecond()
                    : nowEpoch;
            long existingExpiredAt = txCreatedEpoch + 15 * 60;
            boolean notExpired = existingExpiredAt > nowEpoch + 60;

            if (sameAmount && sameOrder && notExpired) {
                validReusableTx = existingTx;
            } else {
                // P-2 & P-6: link PENDING cũ của bàn mà số tiền hoặc orderId đã khác hoặc hết hạn
                // Gọi PayOS hủy link cũ
                log.info("Hủy link PayOS PENDING cũ orderCode {} của bàn {} do đơn thay đổi (sameAmount={}, sameOrder={}, notExpired={})",
                        existingTx.getOrderCode(), tableId, sameAmount, sameOrder, notExpired);
                JSONObject cancelResult = null;
                try {
                    cancelResult = payosClient.cancelPaymentLink(existingTx.getOrderCode(), "Đơn hàng đã thay đổi", config);
                } catch (Exception e) {
                    log.warn("Lỗi gọi API hủy link PayOS cho orderCode {}: {}", existingTx.getOrderCode(), e.getMessage());
                }

                // P-6: Hủy link với PayOS thất bại -> GIỮ PENDING (không đánh dấu CANCELLED), log cảnh báo;
                // khi tạo link mới thì link cũ PENDING đó vẫn được xử lý đúng nếu sau này được trả tiền (qua P-1/P-6).
                if (cancelResult != null) {
                    log.info("Đã hủy thành công link PayOS orderCode {} trên cổng thanh toán -> Cập nhật CANCELLED", existingTx.getOrderCode());
                    existingTx.setStatus("CANCELLED");
                    payosTransactionMapper.updateById(existingTx);
                    updateRedisTransactionStatus(existingTx.getOrderCode(), "CANCELLED");
                } else {
                    log.warn("Hủy link PayOS thất bại cho orderCode {} -> GIỮ PENDING để xử lý đối soát an toàn nếu được trả tiền", existingTx.getOrderCode());
                }
            }
        }

        if (validReusableTx != null) {
            long txCreatedEpoch = validReusableTx.getCreateTime() != null
                    ? validReusableTx.getCreateTime().atZone(ZoneId.systemDefault()).toEpochSecond()
                    : nowEpoch;
            long existingExpiredAt = txCreatedEpoch + 15 * 60;
            log.info("Tái sử dụng payment link cũ orderCode: {} cho bàn {}", validReusableTx.getOrderCode(), tableId);
            return PayosCreateRespDto.builder()
                    .orderCode(validReusableTx.getOrderCode())
                    .checkoutUrl(validReusableTx.getCheckoutUrl())
                    .qrCode(validReusableTx.getQrCode())
                    .amount(amount)
                    .expiredAt(existingExpiredAt)
                    .build();
        }

        redisCache.deleteObject(tableKey);

        // 4. Sinh orderCode duy nhất (epochSeconds * 100 + random 2 chữ số)
        long random2 = ThreadLocalRandom.current().nextInt(10, 99);
        long orderCode = nowEpoch * 100 + random2;
        long expiredAt = nowEpoch + 15 * 60;

        String description = String.format("Ban %02d #%04d", tableId, orderCode % 10000);
        if (description.length() > 25) {
            description = description.substring(0, 25);
        }

        String returnUrl = webBaseUrl + "/?shopId=" + shopId + "&tableId=" + tableId + "&payos=return";
        String cancelUrl = webBaseUrl + "/?shopId=" + shopId + "&tableId=" + tableId + "&payos=cancel";

        // 5. Gọi PayOS tạo link thanh toán
        PayosCreateRespDto clientResp = payosClient.createPaymentLink(
                orderCode,
                amount,
                description,
                returnUrl,
                cancelUrl,
                expiredAt,
                config
        );

        // 6. Lưu bảng giao dịch payos_transaction
        PayosTransaction tx = PayosTransaction.builder()
                .orderCode(orderCode)
                .shopId(shopId)
                .tableId(tableId)
                .orderId(orderId)
                .amount(BigDecimal.valueOf(amount))
                .description(description)
                .status("PENDING")
                .paymentLinkId(clientResp.getPaymentLinkId())
                .checkoutUrl(clientResp.getCheckoutUrl())
                .qrCode(clientResp.getQrCode())
                .build();
        payosTransactionMapper.insert(tx);

        // 7. Lưu Redis cache
        String orderKey = "payos:order:" + orderCode;
        Map<String, Object> redisOrderData = new HashMap<>();
        redisOrderData.put("shopId", shopId);
        redisOrderData.put("tableId", tableId);
        redisOrderData.put("orderId", orderId);
        redisOrderData.put("amount", amount);
        redisOrderData.put("status", "PENDING");
        redisOrderData.put("createdAt", nowEpoch);

        redisCache.setCacheObject(orderKey, JSON.toJSONString(redisOrderData), 24, TimeUnit.HOURS);
        redisCache.setCacheObject(tableKey, orderCode, 15, TimeUnit.MINUTES);

        return clientResp;
        } finally {
            if (lock != null && lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }

    @Override
    public Result handleWebhook(PayosWebhookReqDto webhookDto) {
        if (webhookDto == null) {
            log.warn("PayOS webhook nhận payload rỗng");
            return Result.success("Empty payload");
        }

        Map<String, Object> data = webhookDto.getData();
        if (data == null || data.isEmpty()) {
            log.warn("PayOS webhook nhận data rỗng");
            return Result.success("Empty data");
        }

        Object orderCodeObj = data.get("orderCode");
        if (orderCodeObj == null) {
            log.warn("PayOS webhook không có orderCode");
            return Result.success("Missing orderCode");
        }

        Long orderCode = Long.valueOf(orderCodeObj.toString());

        // Trường hợp xác thực webhook ban đầu của PayOS (orderCode = 123)
        if (orderCode.equals(123L)) {
            log.info("PayOS gửi webhook xác minh cấu hình URL (orderCode 123)");
            return Result.success("Webhook URL verified");
        }

        // Tìm giao dịch trong DB
        PayosTransaction tx = payosTransactionMapper.selectOne(
                new LambdaQueryWrapper<PayosTransaction>().eq(PayosTransaction::getOrderCode, orderCode)
        );

        if (tx == null) {
            log.warn("Không tìm thấy giao dịch PayOS trong DB cho orderCode: {}", orderCode);
            return Result.success("Transaction not found");
        }

        Long shopId = tx.getShopId();

        // Lấy cấu hình PayOS của shop để lấy checksumKey
        Result<PayosConfigDto> configRes = systemFeign.getPayosConfig(shopId);
        PayosConfigDto config = configRes != null ? configRes.getData() : null;
        if (config == null || StringUtils.isBlank(config.getChecksumKey())) {
            log.error("Không tìm thấy cấu hình PayOS hoặc checksumKey của shop {}", shopId);
            return Result.success("Shop config not found");
        }

        // Xác thực chữ ký webhook
        boolean isValidSignature = PayosSignatureUtil.verifyWebhookSignature(data, webhookDto.getSignature(), config.getChecksumKey());
        if (!isValidSignature) {
            log.warn("Chữ ký webhook PayOS không hợp lệ cho orderCode: {}, bỏ qua không checkout!", orderCode);
            return Result.success("Invalid signature ignored");
        }

        // Kiểm tra mã kết quả
        Object codeObj = data.get("code");
        String code = codeObj != null ? codeObj.toString() : "";

        // P-6: Webhook code "00" cho giao dịch CANCELLED hoặc EXPIRED -> PAID_MISMATCH + đẩy payosMismatch cho admin (Không checkout)
        if ("00".equals(code) && ("CANCELLED".equalsIgnoreCase(tx.getStatus()) || "EXPIRED".equalsIgnoreCase(tx.getStatus()))) {
            String prevStatus = tx.getStatus();
            Object linkIdObj = data.get("paymentLinkId");
            if (linkIdObj != null && StringUtils.isBlank(tx.getPaymentLinkId())) {
                tx.setPaymentLinkId(linkIdObj.toString());
            }
            Object amountObj = data.get("amount");
            long webhookAmount = amountObj != null ? Long.parseLong(amountObj.toString()) : 0L;
            Object refObj = data.get("reference");
            String ref = refObj != null ? refObj.toString() : null;

            log.warn("Giao dịch orderCode {} đã {} nhưng nhận được webhook thanh toán thành công (amount: {}) -> Chuyển PAID_MISMATCH, không checkout!",
                    orderCode, prevStatus, webhookAmount);

            String tableId = String.valueOf(tx.getTableId());
            String orderInfoKey = "orderInfo:" + shopId + ":" + tableId;
            Map<String, Object> openOrder = redisCache.getAllHash(orderInfoKey);
            BigDecimal currentDueAmount = BigDecimal.ZERO;
            if (openOrder != null && openOrder.get("payAmount") != null) {
                try {
                    currentDueAmount = new BigDecimal(openOrder.get("payAmount").toString());
                } catch (Exception ignored) {}
            }

            tx.setStatus("PAID_MISMATCH");
            if (StringUtils.isNotBlank(ref)) {
                tx.setReference(ref);
            }
            tx.setPaidAt(LocalDateTime.now());
            payosTransactionMapper.updateById(tx);

            updateRedisTransactionStatus(tx.getOrderCode(), "PAID_MISMATCH");
            sendPayosMismatchWebSocket(shopId, tableId, tx.getOrderCode(), BigDecimal.valueOf(webhookAmount), currentDueAmount);

            // P-9: Trả về trạng thái cũ trước khi đổi (CANCELLED / EXPIRED)
            return Result.success("Transaction was " + prevStatus + " but paid (PAID_MISMATCH)");
        }

        // Idempotent: Nếu không ở trạng thái PENDING nữa thì trả 200, không làm lại
        if (!"PENDING".equalsIgnoreCase(tx.getStatus())) {
            log.info("Giao dịch orderCode {} đã được xử lý trước đó với trạng thái: {}", orderCode, tx.getStatus());
            return Result.success("Already processed (" + tx.getStatus() + ")");
        }

        if ("00".equals(code)) {
            // Thanh toán thành công từ phía PayOS!
            Object linkIdObj = data.get("paymentLinkId");
            if (linkIdObj != null && StringUtils.isBlank(tx.getPaymentLinkId())) {
                tx.setPaymentLinkId(linkIdObj.toString());
            }
            Object amountObj = data.get("amount");
            long webhookAmount = amountObj != null ? Long.parseLong(amountObj.toString()) : 0L;
            Object refObj = data.get("reference");
            String ref = refObj != null ? refObj.toString() : null;
            return processPaymentConfirmation(tx, webhookAmount, ref, true);
        } else {
            // Thanh toán thất bại hoặc hủy
            tx.setStatus("CANCELLED");
            payosTransactionMapper.updateById(tx);
            updateRedisTransactionStatus(tx.getOrderCode(), "CANCELLED");
            redisCache.deleteObject("payos:table:" + shopId + ":" + tx.getTableId());
            log.info("PayOS báo thanh toán không thành công cho orderCode {}, code: {}", orderCode, code);
            return Result.success("Cancelled status updated");
        }
    }

    @Override
    public List<PayosTransaction> getTransactions(Long shopId, String date, String status) {
        if (shopId == null || shopId <= 0) {
            throw new CustomException(400, "Thiếu shopId");
        }

        LambdaQueryWrapper<PayosTransaction> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PayosTransaction::getShopId, shopId);

        if (StringUtils.isNotBlank(status)) {
            wrapper.eq(PayosTransaction::getStatus, status.trim().toUpperCase());
        }

        if (StringUtils.isNotBlank(date)) {
            try {
                LocalDate localDate = LocalDate.parse(date.trim(), DateTimeFormatter.ofPattern("yyyy-MM-dd"));
                LocalDateTime startOfDay = localDate.atStartOfDay();
                LocalDateTime endOfDay = localDate.atTime(LocalTime.MAX);
                wrapper.ge(PayosTransaction::getCreateTime, startOfDay);
                wrapper.le(PayosTransaction::getCreateTime, endOfDay);
            } catch (Exception e) {
                throw new CustomException(400, "Định dạng ngày không hợp lệ (cần yyyy-MM-dd)");
            }
        }

        wrapper.orderByDesc(PayosTransaction::getCreateTime);
        return payosTransactionMapper.selectList(wrapper);
    }

    @Override
    public Result recheckTransaction(Long shopId, Long orderCode) {
        if (orderCode == null) {
            throw new CustomException(400, "Thiếu orderCode");
        }

        PayosTransaction tx = payosTransactionMapper.selectOne(
                new LambdaQueryWrapper<PayosTransaction>().eq(PayosTransaction::getOrderCode, orderCode)
        );

        if (tx == null) {
            throw new CustomException(400, "Không tìm thấy giao dịch với orderCode: " + orderCode);
        }

        if (shopId != null && shopId > 0 && !shopId.equals(tx.getShopId())) {
            throw new CustomException(403, "Không có quyền đối soát giao dịch của quán khác");
        }

        Long txShopId = tx.getShopId();

        // Nếu không ở trạng thái PENDING nữa
        if (!"PENDING".equalsIgnoreCase(tx.getStatus())) {
            // P-6: Nếu là CANCELLED hoặc EXPIRED, vẫn có thể recheck xem có bị thanh toán trễ trên PayOS không
            if (!"CANCELLED".equalsIgnoreCase(tx.getStatus()) && !"EXPIRED".equalsIgnoreCase(tx.getStatus())) {
                return Result.success(tx, "Giao dịch đã ở trạng thái " + tx.getStatus());
            }
        }

        // Lấy cấu hình PayOS của shop
        Result<PayosConfigDto> configRes = systemFeign.getPayosConfig(txShopId);
        PayosConfigDto config = configRes != null ? configRes.getData() : null;
        if (config == null || StringUtils.isBlank(config.getApiKey())) {
            throw new CustomException(400, "Quán chưa cấu hình PayOS");
        }

        // Gọi PayOS kiểm tra trạng thái thanh toán
        JSONObject payosData = payosClient.getPaymentLinkInformation(orderCode, config);
        String remoteStatus = payosData != null ? payosData.getString("status") : null;

        if (payosData != null && StringUtils.isBlank(tx.getPaymentLinkId())) {
            String remoteLinkId = payosData.getString("paymentLinkId");
            if (StringUtils.isBlank(remoteLinkId)) {
                remoteLinkId = payosData.getString("id");
            }
            if (StringUtils.isNotBlank(remoteLinkId)) {
                tx.setPaymentLinkId(remoteLinkId);
            }
        }

        if ("PAID".equalsIgnoreCase(remoteStatus)) {
            long paidAmount = payosData.containsKey("amount") ? payosData.getLongValue("amount")
                    : (tx.getAmount() != null ? tx.getAmount().longValue() : 0L);
            String ref = payosData.getString("reference");

            // P-6: Giao dịch đã CANCELLED hoặc EXPIRED nhưng kiểm tra PayOS lại thấy PAID -> Chuyển PAID_MISMATCH, không checkout!
            if ("CANCELLED".equalsIgnoreCase(tx.getStatus()) || "EXPIRED".equalsIgnoreCase(tx.getStatus())) {
                log.warn("Giao dịch orderCode {} đã {} nhưng PayOS báo PAID -> Chuyển PAID_MISMATCH, không checkout!",
                        orderCode, tx.getStatus());
                String tableId = String.valueOf(tx.getTableId());
                String orderInfoKey = "orderInfo:" + txShopId + ":" + tableId;
                Map<String, Object> openOrder = redisCache.getAllHash(orderInfoKey);
                BigDecimal currentDueAmount = BigDecimal.ZERO;
                if (openOrder != null && openOrder.get("payAmount") != null) {
                    try {
                        currentDueAmount = new BigDecimal(openOrder.get("payAmount").toString());
                    } catch (Exception ignored) {}
                }

                tx.setStatus("PAID_MISMATCH");
                if (StringUtils.isNotBlank(ref)) {
                    tx.setReference(ref);
                }
                tx.setPaidAt(LocalDateTime.now());
                payosTransactionMapper.updateById(tx);

                updateRedisTransactionStatus(tx.getOrderCode(), "PAID_MISMATCH");
                sendPayosMismatchWebSocket(txShopId, tableId, tx.getOrderCode(), BigDecimal.valueOf(paidAmount), currentDueAmount);
                return Result.success(tx, "Giao dịch đã bị " + tx.getStatus() + " nhưng được thanh toán thành công (PAID_MISMATCH)");
            }

            return processPaymentConfirmation(tx, paidAmount, ref, false);
        } else if ("CANCELLED".equalsIgnoreCase(remoteStatus) || "EXPIRED".equalsIgnoreCase(remoteStatus)) {
            tx.setStatus(remoteStatus.toUpperCase());
            payosTransactionMapper.updateById(tx);
            updateRedisTransactionStatus(tx.getOrderCode(), remoteStatus.toUpperCase());
            redisCache.deleteObject("payos:table:" + txShopId + ":" + tx.getTableId());
            return Result.success(tx, "Giao dịch đã ở trạng thái " + remoteStatus);
        } else {
            return Result.success(tx, "Giao dịch vẫn đang chờ thanh toán");
        }
    }

    /**
     * P-1: Xử lý xác nhận thanh toán an toàn chống mất tiền (áp dụng cho cả webhook và recheck).
     * Chỉ checkout khi đủ cả 3 điều kiện:
     * 1. Đơn đang mở trong Redis có id == tx.orderId
     * 2. payAmount hiện tại trong Redis == tx.amount
     * 3. amount thanh toán thực tế (webhook / payos) == tx.amount
     */
    private Result processPaymentConfirmation(PayosTransaction tx, long paidAmount, String reference, boolean isWebhook) {
        Long shopId = tx.getShopId();
        String tableId = String.valueOf(tx.getTableId());
        String orderInfoKey = "orderInfo:" + shopId + ":" + tableId;

        Map<String, Object> openOrder = redisCache.getAllHash(orderInfoKey);

        boolean hasOpenOrder = openOrder != null && !openOrder.isEmpty() && openOrder.get("id") != null;
        boolean orderIdMatches = hasOpenOrder && String.valueOf(openOrder.get("id")).equals(String.valueOf(tx.getOrderId()));

        BigDecimal currentDueAmount = BigDecimal.ZERO;
        boolean dueAmountMatches = false;
        if (hasOpenOrder && openOrder.get("payAmount") != null) {
            try {
                currentDueAmount = new BigDecimal(openOrder.get("payAmount").toString());
                dueAmountMatches = (tx.getAmount() != null && currentDueAmount.compareTo(tx.getAmount()) == 0);
            } catch (Exception ignored) {}
        }

        boolean paidAmountMatches = (tx.getAmount() != null && tx.getAmount().longValue() == paidAmount);

        boolean canCheckout = orderIdMatches && dueAmountMatches && paidAmountMatches;

        if (!canCheckout) {
            log.warn("Thanh toán PayOS không khớp đơn cho orderCode {}: orderIdMatches={}, dueAmountMatches={} (tx={}, current={}), paidAmountMatches={} (tx={}, paid={})",
                    tx.getOrderCode(), orderIdMatches, dueAmountMatches, tx.getAmount(), currentDueAmount,
                    paidAmountMatches, tx.getAmount(), paidAmount);

            tx.setStatus("PAID_MISMATCH");
            if (StringUtils.isNotBlank(reference)) {
                tx.setReference(reference);
            }
            tx.setPaidAt(LocalDateTime.now());
            payosTransactionMapper.updateById(tx);

            updateRedisTransactionStatus(tx.getOrderCode(), "PAID_MISMATCH");
            redisCache.deleteObject("payos:table:" + shopId + ":" + tableId);

            // Đẩy WS cho admin: {"msg":"payosMismatch","data":{"tableId","orderCode","paidAmount","dueAmount"}}
            sendPayosMismatchWebSocket(shopId, tableId, tx.getOrderCode(), BigDecimal.valueOf(paidAmount), currentDueAmount);

            if (isWebhook) {
                return Result.success("Payment amount or order mismatch (PAID_MISMATCH)");
            } else {
                return Result.success(tx, "Thanh toán không khớp với đơn hàng hiện tại (PAID_MISMATCH)");
            }
        }

        // Đủ cả 3 điều kiện -> Checkout với payType = 5
        CheckoutDto checkoutDto = new CheckoutDto();
        checkoutDto.setTableId(tableId);
        checkoutDto.setPayType(5);

        SecurityUtils.setShopId(shopId);
        Result checkoutResult;
        try {
            checkoutResult = orderInfoService.checkout(checkoutDto);
            log.info("Kết quả checkout đơn hàng bàn {} shop {} qua PayOS (orderCode {}): {}",
                    tableId, shopId, tx.getOrderCode(), JSON.toJSONString(checkoutResult));
        } catch (Exception e) {
            log.error("Lỗi khi checkout đơn hàng bàn {} shop {} qua PayOS: ", tableId, shopId, e);
            checkoutResult = Result.error("Checkout exception: " + e.getMessage());
        } finally {
            SecurityUtils.clearShopId();
        }

        boolean checkoutSuccess = checkoutResult != null && Integer.valueOf(200).equals(checkoutResult.getCode());

        if (checkoutSuccess) {
            tx.setStatus("PAID");
            if (StringUtils.isNotBlank(reference)) {
                tx.setReference(reference);
            }
            tx.setPaidAt(LocalDateTime.now());
            payosTransactionMapper.updateById(tx);

            updateRedisTransactionStatus(tx.getOrderCode(), "PAID");
            redisCache.deleteObject("payos:table:" + shopId + ":" + tableId);

            if (isWebhook) {
                return Result.success("Checkout successful");
            } else {
                return Result.success(tx, "Đã đối soát và xác nhận thanh toán thành công");
            }
        } else {
            log.error("Checkout thất bại cho orderCode {} bàn {}: {}", tx.getOrderCode(), tableId, JSON.toJSONString(checkoutResult));

            tx.setStatus("PAID_UNMATCHED");
            if (StringUtils.isNotBlank(reference)) {
                tx.setReference(reference);
            }
            tx.setPaidAt(LocalDateTime.now());
            payosTransactionMapper.updateById(tx);

            updateRedisTransactionStatus(tx.getOrderCode(), "PAID_UNMATCHED");
            redisCache.deleteObject("payos:table:" + shopId + ":" + tableId);

            // Đẩy WS cùng loại cho admin
            sendPayosMismatchWebSocket(shopId, tableId, tx.getOrderCode(), BigDecimal.valueOf(paidAmount), BigDecimal.ZERO);

            if (isWebhook) {
                return Result.success("Checkout failed (PAID_UNMATCHED)");
            } else {
                return Result.success(tx, "Checkout thất bại, giao dịch được đánh dấu PAID_UNMATCHED");
            }
        }
    }

    private void sendPayosMismatchWebSocket(Long shopId, String tableId, Long orderCode, BigDecimal paidAmount, BigDecimal dueAmount) {
        try {
            JSONObject mismatchEvent = new JSONObject();
            mismatchEvent.put("shopId", shopId);
            mismatchEvent.put("msg", "payosMismatch");
            JSONObject dataObj = new JSONObject();
            dataObj.put("tableId", tableId);
            dataObj.put("orderCode", orderCode);
            dataObj.put("paidAmount", paidAmount);
            dataObj.put("dueAmount", dueAmount);
            mismatchEvent.put("data", dataObj);

            redisCache.convertAndSend("payos_mismatch", mismatchEvent.toJSONString());
            log.info("Đã publish sự kiện payos_mismatch tới Redis: {}", mismatchEvent.toJSONString());
        } catch (Exception e) {
            log.error("Lỗi khi publish sự kiện payos_mismatch: ", e);
        }
    }

    private void updateRedisTransactionStatus(Long orderCode, String status) {
        try {
            String orderKey = "payos:order:" + orderCode;
            Object redisValObj = redisCache.getCacheObject(orderKey);
            if (redisValObj != null) {
                Map<String, Object> map = JSON.parseObject(redisValObj.toString(), Map.class);
                map.put("status", status);
                redisCache.setCacheObject(orderKey, JSON.toJSONString(map), 24, TimeUnit.HOURS);
            }
        } catch (Exception e) {
            log.warn("Lỗi khi cập nhật trạng thái Redis cho orderCode {}: {}", orderCode, e.getMessage());
        }
    }

    @Override
    public boolean cancelPendingLinksForTable(Long shopId, Long tableId) {
        if (shopId == null || tableId == null) {
            return false;
        }
        RLock lock = redissonClient != null ? redissonClient.getLock("lock:payos:create:" + shopId + ":" + tableId) : null;
        if (lock != null) {
            lock.lock();
        }
        try {
            List<PayosTransaction> pendingTxs = payosTransactionMapper.selectList(
                    new LambdaQueryWrapper<PayosTransaction>()
                            .eq(PayosTransaction::getShopId, shopId)
                            .eq(PayosTransaction::getTableId, tableId)
                            .eq(PayosTransaction::getStatus, "PENDING")
            );
            if (pendingTxs == null || pendingTxs.isEmpty()) {
                return false;
            }
            Result<PayosConfigDto> configRes = systemFeign.getPayosConfig(shopId);
            PayosConfigDto config = configRes != null ? configRes.getData() : null;
            if (config == null) {
                log.warn("Không lấy được cấu hình PayOS của quán {} để huỷ link khi sửa đơn bàn {}", shopId, tableId);
                return false;
            }
            boolean cancelledAny = false;
            for (PayosTransaction tx : pendingTxs) {
                JSONObject cancelResult = null;
                try {
                    cancelResult = payosClient.cancelPaymentLink(tx.getOrderCode(), "Đơn hàng đã thay đổi", config);
                } catch (Exception e) {
                    log.warn("Lỗi gọi API hủy link PayOS cho orderCode {}: {}", tx.getOrderCode(), e.getMessage());
                }
                // Giống P-6: huỷ thất bại thì GIỮ PENDING, nếu khách vẫn trả theo link cũ sẽ thành PAID_MISMATCH
                if (cancelResult != null) {
                    tx.setStatus("CANCELLED");
                    payosTransactionMapper.updateById(tx);
                    updateRedisTransactionStatus(tx.getOrderCode(), "CANCELLED");
                    cancelledAny = true;
                }
            }
            if (cancelledAny) {
                redisCache.deleteObject("payos:table:" + shopId + ":" + tableId);
            }
            return cancelledAny;
        } finally {
            if (lock != null && lock.isHeldByCurrentThread()) {
                lock.unlock();
            }
        }
    }
}

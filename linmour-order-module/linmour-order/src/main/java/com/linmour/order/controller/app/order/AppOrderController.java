package com.linmour.order.controller.app.order;

import com.linmour.security.dtos.Result;
import com.linmour.order.pojo.Dto.CreateOrderDto;
import com.linmour.order.pojo.Dto.PayosCreateReqDto;
import com.linmour.order.pojo.Dto.PayosCreateRespDto;
import com.linmour.order.pojo.Dto.PayosWebhookReqDto;
import com.linmour.order.service.OrderInfoService;
import com.linmour.order.service.PayosPaymentService;
import com.linmour.security.utils.SecurityUtils;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import javax.validation.Valid;

@RestController
@RequestMapping("/app/order/order")
public class AppOrderController {
    @Resource
    private OrderInfoService orderInfoService;

    @Resource
    private PayosPaymentService payosPaymentService;

    @PostMapping("/payos/create")
    public Result payosCreate(
            @RequestHeader(value = "Shopid", required = false) Long shopIdHeader,
            @Valid @RequestBody PayosCreateReqDto reqDto) {
        Long shopId = (SecurityUtils.getShopId() != null && SecurityUtils.getShopId() > 0)
                ? SecurityUtils.getShopId()
                : (shopIdHeader != null ? shopIdHeader : 0L);

        // T-1 Lớp 2: Kiểm tra tableId lấy từ token phiên bàn
        if (SecurityUtils.getTableId() != null) {
            if (reqDto.getTableId() != null && !reqDto.getTableId().equals(SecurityUtils.getTableId())) {
                return Result.error(403, "Không thể thao tác trên bàn khác");
            }
            reqDto.setTableId(SecurityUtils.getTableId());
        }

        PayosCreateRespDto resp = payosPaymentService.createPaymentLink(shopId, reqDto);
        return Result.success(resp);
    }

    @PostMapping("/payos/webhook")
    public Result payosWebhook(@RequestBody PayosWebhookReqDto webhookDto) {
        return payosPaymentService.handleWebhook(webhookDto);
    }

    @PostMapping("/createOrder")
    public Result createOrder(@RequestBody CreateOrderDto createOrderDto) {
        if (SecurityUtils.getTableId() != null) {
            if (createOrderDto.getTableId() != null && !createOrderDto.getTableId().equals(SecurityUtils.getTableId())) {
                return Result.error(403, "Không thể thao tác trên bàn khác");
            }
            createOrderDto.setTableId(SecurityUtils.getTableId());
        }
        return orderInfoService.createOrder(createOrderDto);
    }

    @GetMapping("/GetCurrentOrderInfo/{tableId}")
    public Result getCurrentOrderInfo(@PathVariable Long tableId) {
        if (SecurityUtils.getTableId() != null && !tableId.equals(SecurityUtils.getTableId())) {
            return Result.error(403, "Không thể thao tác trên bàn khác");
        }
        return Result.success(orderInfoService.GetCurrentOrderInfo(tableId));
    }
}

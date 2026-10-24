package com.linmour.order.controller.admin.order;

import com.linmour.order.pojo.Dto.CheckoutDto;
import com.linmour.order.pojo.Dto.OrderInfoPage;
import com.linmour.order.pojo.Dto.OrderInfoDto;
import com.linmour.order.service.OrderInfoService;
import com.linmour.order.service.PayosPaymentService;
import com.linmour.security.dtos.Result;
import com.linmour.security.exception.CustomException;
import com.linmour.security.exception.enums.AppHttpCodeEnum;
import com.linmour.security.utils.SecurityUtils;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import java.util.Map;

@RestController
@RequestMapping("/order/order")
public class OrderController {
    @Resource
    private OrderInfoService orderInfoService;

    @Resource
    private PayosPaymentService payosPaymentService;

    @GetMapping("/openOrders")
    public Result openOrders() {
        return Result.success(orderInfoService.getOpenOrders());
    }

    @PostMapping("/checkout")
    public Result checkout(@RequestBody CheckoutDto checkoutDto) {
        return orderInfoService.checkout(checkoutDto);
    }

    @PostMapping("/updateOrderItemStatus/{tableId}/{index}")
    public Result updateOrderItemStatus(@PathVariable String tableId, @PathVariable Long index) {
        orderInfoService.updateOrderItemStatus(tableId, index);
        return Result.success();
    }

    @PostMapping("/setOrderItemStatus/{tableId}/{index}")
    public Result setOrderItemStatus(@PathVariable String tableId, @PathVariable Long index, @RequestBody(required = false) Map<String, Object> body) {
        Integer status = null;
        if (body != null && body.containsKey("status") && body.get("status") != null) {
            try {
                status = Integer.valueOf(body.get("status").toString().trim());
            } catch (NumberFormatException ignored) {}
        }
        return orderInfoService.setOrderItemStatus(tableId, index, status);
    }

    @GetMapping("/GetCurrentOrderInfo/{tableId}")
    public Result GetCurrentOrderInfo(@PathVariable Long tableId) {
        return Result.success(orderInfoService.GetCurrentOrderInfo(tableId));
    }

    @GetMapping("/GetOrderByShopId")
    public Result GetOrderByShopId() {
        return Result.success(orderInfoService.GetOrderByShopId());
    }

    @GetMapping("/getOrderPayAmount")
    public Result getOrderPayAmount(OrderInfoPage orderInfoPage) {
        return Result.success(orderInfoService.getOrderPayAmount(orderInfoPage));
    }

    @GetMapping("/platformRevenue")
    public Result platformRevenue(
            @RequestParam(value = "startDate", required = false) String startDate,
            @RequestParam(value = "endDate", required = false) String endDate,
            @RequestParam(value = "shopId", required = false) Long shopId) {
        return orderInfoService.getPlatformRevenue(startDate, endDate, shopId);
    }


    @PostMapping("/changeOrder")
    public Result changeOrderStatus(@RequestBody Map<String, OrderInfoDto> map) {
        OrderInfoDto orderInfoDto = map.get("orderInfoDto");
        return orderInfoService.changeOrder(orderInfoDto);
    }

    /**
     * Y5: Lấy danh sách giao dịch PayOS đối soát theo quán, ngày và trạng thái
     */
    @GetMapping("/payos/transactions")
    public Result getPayosTransactions(
            @RequestHeader(value = "Shopid", required = false) Long shopIdHeader,
            @RequestParam(value = "shopId", required = false) Long queryShopId,
            @RequestParam(value = "date", required = false) String date,
            @RequestParam(value = "status", required = false) String status) {
        Integer userType = SecurityUtils.getUserType();
        if (userType == null) {
            throw new CustomException(AppHttpCodeEnum.NEED_LOGIN);
        }
        Long targetShopId;
        if (userType.equals(1)) {
            targetShopId = queryShopId != null ? queryShopId : shopIdHeader;
        } else {
            Long currentShopId = shopIdHeader != null ? shopIdHeader : SecurityUtils.getShopId();
            if (currentShopId == null || currentShopId <= 0) {
                throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
            }
            if (queryShopId != null && !queryShopId.equals(currentShopId)) {
                throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
            }
            targetShopId = currentShopId;
        }
        if (targetShopId == null || targetShopId <= 0) {
            throw new CustomException(AppHttpCodeEnum.PARAM_ERROR);
        }
        return Result.success(payosPaymentService.getTransactions(targetShopId, date, status));
    }

    /**
     * Y5: Đối soát giao dịch với cổng thanh toán PayOS
     */
    @PostMapping("/payos/transactions/{orderCode}/recheck")
    public Result recheckPayosTransaction(
            @PathVariable Long orderCode,
            @RequestHeader(value = "Shopid", required = false) Long shopIdHeader,
            @RequestParam(value = "shopId", required = false) Long queryShopId) {
        Integer userType = SecurityUtils.getUserType();
        if (userType == null) {
            throw new CustomException(AppHttpCodeEnum.NEED_LOGIN);
        }
        Long targetShopId = null;
        if (userType.equals(1)) {
            targetShopId = queryShopId != null ? queryShopId : shopIdHeader;
        } else {
            Long currentShopId = shopIdHeader != null ? shopIdHeader : SecurityUtils.getShopId();
            if (currentShopId == null || currentShopId <= 0) {
                throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
            }
            targetShopId = currentShopId;
        }
        return payosPaymentService.recheckTransaction(targetShopId, orderCode);
    }
}

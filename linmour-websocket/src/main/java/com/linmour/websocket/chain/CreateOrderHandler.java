package com.linmour.websocket.chain;

import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import com.linmour.order.pojo.Do.OrderItem;
import com.linmour.order.pojo.Dto.CreateOrderDto;
import com.linmour.security.dtos.Result;
import com.linmour.websocket.feign.OrderFeign;
import com.linmour.websocket.ws.AppWebSocketServer;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.redisson.api.RLock;
import org.springframework.stereotype.Component;

import javax.websocket.Session;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

import static com.linmour.websocket.ws.AppWebSocketServer.AppSendInfo;
import static com.linmour.websocket.ws.WebSocketServer.sendInfo;

@Slf4j
@Component
//处理前端创建订单
public class CreateOrderHandler extends Handler {

    @Override
    public void handleRequest(ConcurrentHashMap<String, List<AppWebSocketServer>> webSocketMap,
                              JSONObject jsonObject,
                              ConcurrentHashMap<String, List<JSONObject>> recordMap,
                              AppWebSocketServer webSocket, OrderFeign orderFeign, Session session) throws IOException {

        if (jsonObject.containsKey("createOrder")) {
            String shopTableKey = webSocket.getShopTableKey();
            String shopIdStr = webSocket.getShopId();
            Long shopIdLong = StringUtils.isNotBlank(shopIdStr) ? Long.valueOf(shopIdStr) : null;
            String lockKey = "lock:order:" + shopIdStr + ":" + webSocket.getTableId();
            RLock lock = redissonClient != null ? redissonClient.getLock(lockKey) : null;

            List<AppWebSocketServer> serverList = null;
            boolean isOrderInitiator = false;

            if (lock != null) {
                lock.lock();
            }
            try {
                if (StringUtils.isNotBlank(webSocket.getTableId()) && webSocketMap.containsKey(shopTableKey)) {
                    serverList = webSocketMap.get(shopTableKey);
                    // Có một kết nối đang submit đơn
                    if (serverList != null && serverList.stream().anyMatch(m -> m.getCreateOrder().get())) {
                        webSocket.sendMessage("已有人提交订单，请稍后");
                        return;
                    }
                    if (serverList != null) {
                        serverList.forEach(m -> m.getCreateOrder().set(true));
                        isOrderInitiator = true;
                    }
                }
            } finally {
                if (lock != null && lock.isHeldByCurrentThread()) {
                    lock.unlock();
                }
            }

            if (!isOrderInitiator) {
                return;
            }

            try {
                BigDecimal amount = new BigDecimal(jsonObject.get("amount").toString());
                String remark = jsonObject.containsKey("remark") && jsonObject.get("remark") != null ? jsonObject.get("remark").toString() : "";
                // 类型转换:JSONArray转list
                JSONArray orderItem = jsonObject.getJSONArray("orderItem");
                List<OrderItem> list = orderItem != null ? orderItem.toJavaList(OrderItem.class) : new java.util.ArrayList<>();

                OrderFeign currentOrderFeign = orderFeign != null ? orderFeign : Handler.orderFeign;
                Result result = currentOrderFeign != null ? currentOrderFeign.createOrder(new CreateOrderDto(null, Long.parseLong(webSocket.getTableId()), amount, list, remark, shopIdLong)) : null;

                String msgText;
                if (result != null && result.getCode() != null && result.getCode() == 200) {
                    result.setMsg("order");
                    // 发送给餐厅后台 (dùng shopId của webSocket)
                    sendInfo(result, shopIdStr);
                    List<JSONObject> records = recordMap.get(shopTableKey);
                    if (records != null) {
                        records.clear();
                    }
                    msgText = "本桌订单提交成功";
                } else {
                    String errorMsg = (result != null && StringUtils.isNotBlank(result.getMsg()) && !"本桌订单提交失败".equals(result.getMsg()))
                            ? result.getMsg()
                            : "Đặt món thất bại";
                    msgText = errorMsg;
                }
                AppSendInfo(msgText, shopTableKey, null, false);
            } catch (Exception e) {
                log.error("创建订单失败: ", e);
                AppSendInfo("Đặt món thất bại", shopTableKey, null, false);
            } finally {
                // Sau khi xử lý xong (thành công hoặc thất bại), đặt lại createOrder của mọi kết nối cùng bàn về false
                if (serverList != null) {
                    serverList.forEach(m -> m.getCreateOrder().set(false));
                }
            }
        } else {
            // 无法处理，传递给下一个处理器
            if (nextHandler != null) {
                nextHandler.handleRequest(webSocketMap, jsonObject, recordMap, webSocket, orderFeign, session);
            }
        }
    }
}

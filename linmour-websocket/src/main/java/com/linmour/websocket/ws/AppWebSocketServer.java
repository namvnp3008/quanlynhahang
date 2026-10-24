package com.linmour.websocket.ws;

import com.alibaba.fastjson.JSONObject;
import com.linmour.security.utils.SecurityUtils;
import com.linmour.websocket.chain.*;
import com.linmour.websocket.config.WebSocketCustomEncoding;
import com.linmour.websocket.feign.OrderFeign;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;
import javax.websocket.*;
import javax.websocket.server.PathParam;
import javax.websocket.server.ServerEndpoint;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

@Component
@Slf4j
@Data
public class AppWebSocketServer {

    private static OrderFeign orderFeign;
    private static com.linmour.security.utils.RedisCache redisCache;
    public static boolean allowRawTableIdsStatic = false;

    @Resource
    public void setOrderFeign(OrderFeign mq) {
        orderFeign = mq;
        Handler.orderFeign = mq;
    }

    @Resource
    public void setRedisCache(com.linmour.security.utils.RedisCache cache) {
        redisCache = cache;
    }

    public static com.linmour.security.utils.RedisCache getRedisCacheStatic() {
        return redisCache;
    }

    @org.springframework.beans.factory.annotation.Value("${security.allow-raw-table-ids:false}")
    public void setAllowRawTableIds(boolean allow) {
        allowRawTableIdsStatic = allow;
    }

    @Resource
    public void setRedissonClient(org.redisson.api.RedissonClient redissonClient) {
        Handler.redissonClient = redissonClient;
    }

    /**
     * concurrent包的线程安全Set，用来存放每个客户端对应的MyWebSocket对象。
     * 键为 shopId + ":" + tableId
     */
    private static ConcurrentHashMap<String, List<AppWebSocketServer>> webSocketMap = new ConcurrentHashMap<>();
    //购物车的记录，用于第一次扫码的人同步购物车
    private static ConcurrentHashMap<String, List<JSONObject>> recordMap = new ConcurrentHashMap<>();

    /**
     * 与某个客户端的连接会话，需要通过它来给客户端发送数据
     */
    private Session session;

    /**
     * 接收tableId
     */
    private String tableId = "";

    /**
     * 接收shopId
     */
    private String shopId = "";

    public String getShopTableKey() {
        return (this.shopId != null ? this.shopId : "") + ":" + (this.tableId != null ? this.tableId : "");
    }

    public static String getShopTableKey(String shopId, String tableId) {
        return (shopId != null ? shopId : "") + ":" + (tableId != null ? tableId : "");
    }

    /**
     * 用来标识这个用户需要接收同步的购物车信息
     */
    private volatile AtomicBoolean sync = new AtomicBoolean(true);

    private volatile AtomicBoolean createOrder = new AtomicBoolean(false);

    /**
     * Thời điểm gửi yêu cầu gọi nhân viên gần nhất (chống spam 5s)
     */
    private volatile long lastServiceCallTime = 0L;

    /**
     * Khởi tạo kết nối cho session bàn
     */
    public void handleOpen(Session session, String tableId, String shopId) {
        this.session = session;
        this.shopId = shopId;
        this.tableId = tableId;
        String key = getShopTableKey();
        if (webSocketMap.containsKey(key)) {
            List<AppWebSocketServer> serverList = webSocketMap.get(key);
            serverList.add(this);
        } else {
            List<AppWebSocketServer> serverList = new ArrayList<>();
            serverList.add(this);
            webSocketMap.put(key, serverList);
        }
        try {
            sendMessage("1");
        } catch (IOException e) {
            log.error("用户:" + key + ",网络异常!!!!!!");
        }
    }

    /**
     * T-1: Đóng kết nối WebSocket của bàn hoặc quán khi mã QR bị thu hồi/thay mới
     */
    public static void closeTableSessions(Long targetShopId, Long targetTableId, int closeCode, String reason) {
        if (targetShopId == null) return;
        if (targetTableId != null) {
            String key = getShopTableKey(String.valueOf(targetShopId), String.valueOf(targetTableId));
            List<AppWebSocketServer> list = webSocketMap.remove(key);
            if (list != null) {
                for (AppWebSocketServer s : list) {
                    try {
                        s.getSession().close(new CloseReason(() -> closeCode, reason));
                    } catch (Exception ignored) {}
                }
            }
        } else {
            String prefix = targetShopId + ":";
            for (String key : new ArrayList<>(webSocketMap.keySet())) {
                if (key.startsWith(prefix)) {
                    List<AppWebSocketServer> list = webSocketMap.remove(key);
                    if (list != null) {
                        for (AppWebSocketServer s : list) {
                            try {
                                s.getSession().close(new CloseReason(() -> closeCode, reason));
                            } catch (Exception ignored) {}
                        }
                    }
                }
            }
        }
    }

    /**
     * 连接关闭调用的方法
     */
    public void handleClose() {
        String key = getShopTableKey();
        if (webSocketMap.containsKey(key)) {
            List<AppWebSocketServer> serverList = webSocketMap.get(key);
            serverList.remove(this);
            if (serverList.isEmpty()) {
                webSocketMap.remove(key);
            }
        }
    }

    public void onClose() {
        handleClose();
    }

    /**
     * 收到客户端消息后调用的方法
     *
     * @param message 客户端发送过来的消息
     */
    public void handleMessage(String message, Session session) {
        try {
            if (StringUtils.isNotBlank(this.shopId)) {
                SecurityUtils.setShopId(Long.valueOf(this.shopId));
            }
            log.debug("收到信息: {}", message);
            //可以群发消息
            //消息保存到数据库、redis
            if (StringUtils.isNotBlank(message)) {
                //解析发送的报文
                JSONObject jsonObject = JSONObject.parseObject(message);
                //追加发送人(防止串改)
                jsonObject.put("fromtableId", this.tableId);
                jsonObject.put("fromShopId", this.shopId);

                //这里采用责任链模式，每一个处理器对应一个前段发过来的请求，这里还可以用工厂模式来生成对象
                ChangeHandler changeHandler = new ChangeHandler();
                CreateOrderHandler createOrderHandler = new CreateOrderHandler();
                SyncHandler syncHandler = new SyncHandler();
                ClearHandler clearHandler = new ClearHandler();
                ServiceCallHandler serviceCallHandler = new ServiceCallHandler();
                OtherHandler otherHandler = new OtherHandler();
                changeHandler.addNextHandler(syncHandler)
                        .addNextHandler(createOrderHandler)
                        .addNextHandler(clearHandler)
                        .addNextHandler(serviceCallHandler)
                        .addNextHandler(otherHandler);
                changeHandler.handleRequest(webSocketMap, jsonObject, recordMap, this, orderFeign, session);
            }
        } catch (Exception e) {
            log.error("Error processing websocket message: ", e);
        } finally {
            SecurityUtils.clearShopId();
        }
    }

    public void onMessage(String message, Session session) {
        handleMessage(message, session);
    }

    /**
     * 发生错误时候
     *
     * @param session
     * @param error
     */
    public void handleError(Session session, Throwable error) {
        log.error("用户错误:" + getShopTableKey() + ",原因:" + error.getMessage(), error);
    }

    public void onError(Session session, Throwable error) {
        handleError(session, error);
    }

    /**
     * 实现服务器主动推送
     */
    public void sendMessage(Object message) throws IOException {
        //加入线程锁
        synchronized (session) {
            try {
                //同步发送信息
                this.session.getBasicRemote().sendObject(message);
                log.debug("发送消息成功: {}", message);
            } catch (Exception e) {
                log.error("服务器推送失败:" + e.getMessage());
            }
        }
    }

    /**
     * 发送自定义消息
     *
     * @param message 发送的信息
     * @param shopTableKey shopId + ":" + tableId
     * @throws IOException
     */
    public static void AppSendInfo(Object message, String shopTableKey, String sessionId, boolean me) throws IOException {
        if (StringUtils.isEmpty(shopTableKey)) {
            // 向所有用户发送信息
            for (List<AppWebSocketServer> serverList : webSocketMap.values()) {
                for (AppWebSocketServer server : serverList) {
                    server.sendMessage(message);
                }
            }
        } else if (webSocketMap.containsKey(shopTableKey)) {
            List<AppWebSocketServer> serverList = webSocketMap.get(shopTableKey);
            //某一个人
            if (sessionId != null) {
                //为true说明只发给自己
                if (me) {
                    for (AppWebSocketServer server : serverList) {
                        if (server.getSession().getId().equals(sessionId))
                            server.sendMessage(message);
                    }
                } else {
                    for (AppWebSocketServer server : serverList) {
                        if (!(server.getSession().getId().equals(sessionId)))
                            server.sendMessage(message);
                    }
                }
            } else {
                for (AppWebSocketServer server : serverList) {
                    server.sendMessage(message);
                }
            }
        } else {
            log.error("请求的shopTableKey:" + shopTableKey + "不在该服务器上");
        }
    }

    public static void AppSendInfo(Object message, String shopId, String tableId, String sessionId, boolean me) throws IOException {
        AppSendInfo(message, getShopTableKey(shopId, tableId), sessionId, me);
    }

    public static synchronized ConcurrentHashMap<String, List<AppWebSocketServer>> getWebSocketMap() {
        return AppWebSocketServer.webSocketMap;
    }

    public static synchronized ConcurrentHashMap<String, List<JSONObject>> getRecordMap() {
        return AppWebSocketServer.recordMap;
    }
}

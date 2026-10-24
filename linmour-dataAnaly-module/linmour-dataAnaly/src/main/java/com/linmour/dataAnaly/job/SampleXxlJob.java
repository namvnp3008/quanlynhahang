package com.linmour.dataAnaly.job;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONObject;
import com.linmour.dataAnaly.mapper.OrderSummaryTimePeriodMapper;
import com.linmour.dataAnaly.mapper.ProductSummaryDayMapper;
import com.linmour.dataAnaly.pojo.Do.OrderSummaryDay;
import com.linmour.dataAnaly.pojo.Do.OrderSummaryTimePeriod;
import com.linmour.dataAnaly.pojo.Do.ProductSummaryDay;
import com.linmour.dataAnaly.service.OrderSummaryDayService;
import com.linmour.dataAnaly.service.OrderSummaryTimePeriodService;
import com.linmour.dataAnaly.service.ProductSummaryDayService;
import com.linmour.security.utils.RedisCache;
import com.xxl.job.core.biz.model.ReturnT;
import com.xxl.job.core.handler.IJobHandler;
import com.xxl.job.core.handler.annotation.XxlJob;

import lombok.extern.slf4j.Slf4j;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import javax.annotation.PostConstruct;
import javax.annotation.Resource;
import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.DataOutputStream;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.*;
import java.util.concurrent.TimeUnit;

/**
 * XxlJob开发示例（Bean模式）
 * <p>
 * 开发步骤：
 * 1、在Spring Bean实例中，开发Job方法，方式格式要求为 "public ReturnT<String> execute(String param)"
 * 2、为Job方法添加注解 "@XxlJob(value="自定义jobhandler名称", init = "JobHandler初始化方法", destroy = "JobHandler销毁方法")"，注解value值对应的是调度中心新建任务的JobHandler属性的值。
 * 3、执行日志：需要通过 "XxlJobLogger.log" 打印执行日志；
 *
 * @author xuxueli 2019-12-11 21:52:51
 */
@Slf4j
@Component
public class SampleXxlJob {

    @Resource
    private RedisCache a;

    //注入为空
    public static RedisCache redisCache;

    @PostConstruct
    public void b() {
        redisCache = this.a;
    }

    @Resource
    private OrderSummaryDayService orderSummaryDayService;
    @Resource
    private OrderSummaryTimePeriodService orderSummaryTimePeriodService;
    @Resource
    private ProductSummaryDayService productSummaryDayService;

    @Resource
    private com.linmour.dataAnaly.service.DailySummaryService dailySummaryService;


    /**
     * 1、简单任务示例（Bean模式）
     */
    @XxlJob("demoJobHandler")
    public ReturnT<String> demoJobHandler(String param) throws Exception {
        java.time.LocalDate targetDate = java.time.LocalDate.now().minusDays(1);
        if (param != null && !param.trim().isEmpty()) {
            try {
                targetDate = java.time.LocalDate.parse(param.trim());
            } catch (Exception ignored) {}
        }
        dailySummaryService.executeDailySummary(targetDate);
        return ReturnT.SUCCESS;
    }

    public void a(List<String> matchingKeys) {
        if (matchingKeys == null) {
            return;
        }
        matchingKeys.forEach(m -> {
            String[] segments = m.split(":");
            String shopId = "";
            String timePeriod = "";
            if (segments.length >= 3)
                shopId = segments[2];
            if (segments.length >= 4)
                timePeriod = segments[3];

            Map<String, Object> allHash1 = redisCache.getAllHash(m);
            if (allHash1 == null || allHash1.isEmpty()) {
                return;
            }
            String s = JSON.toJSONString(allHash1);
            if (m.contains("productSummaryDay")) {
                ArrayList<ProductSummaryDay> productSummaryDays = new ArrayList<>();
                for (String key : allHash1.keySet()) {
                    Object value = allHash1.get(key);
                    ProductSummaryDay productSummaryDay = new ProductSummaryDay();
                    productSummaryDay.setName(key);
                    productSummaryDay.setNum(value == null ? 0 : ((Number) value).intValue());
                    if (!shopId.isEmpty()) {
                        productSummaryDay.setShopId(Long.valueOf(shopId));
                    }
                    productSummaryDay.setDate(new Date());
                    productSummaryDays.add(productSummaryDay);
                }
                if (!productSummaryDays.isEmpty()) {
                    productSummaryDayService.saveBatch(productSummaryDays);
                }
                redisCache.deleteObject(m);

            } else if (m.contains("orderSummaryDay")) {
                OrderSummaryDay orderSummaryDay = JSON.parseObject(s, OrderSummaryDay.class);
                orderSummaryDay.setDate(new Date());
                if (!shopId.isEmpty()) {
                    orderSummaryDay.setShopId(Long.valueOf(shopId));
                }
                orderSummaryDayService.save(orderSummaryDay);
                redisCache.deleteObject(m);
            } else if (m.contains("orderSummaryTimePeriod")) {
                OrderSummaryTimePeriod orderSummaryTimePeriod = JSON.parseObject(s, OrderSummaryTimePeriod.class);
                if (!shopId.isEmpty()) {
                    orderSummaryTimePeriod.setShopId(Long.valueOf(shopId));
                }
                orderSummaryTimePeriod.setTimePeriod(timePeriod);
                orderSummaryTimePeriodService.save(orderSummaryTimePeriod);
                redisCache.deleteObject(m);
            }
        });
    }


}


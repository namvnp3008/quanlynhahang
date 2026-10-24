package com.linmour.mq;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.linmour.redisPub.RedisPublisher;
import com.linmour.dataAnaly.service.OrderSummaryDayService;
import com.linmour.order.pojo.Do.OrderInfo;
import com.linmour.order.pojo.Do.OrderItem;
import com.linmour.order.pojo.Dto.OrderAllDto;
import com.linmour.security.utils.RedisCache;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.KafkaStreams;
import org.apache.kafka.streams.StreamsBuilder;
import org.apache.kafka.streams.StreamsConfig;
import org.apache.kafka.streams.kstream.Consumed;
import org.apache.kafka.streams.kstream.KStream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.annotation.Resource;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Properties;

@Configuration
public class KafkaStreamsApplication {

    @Value("${spring.kafka.bootstrap-servers:127.0.0.1:9092}")
    private String bootstrapServers;

    @Value("${spring.kafka.streams.application-id:kafka-streams-example-app}")
    private String applicationId;

    @Resource
    private RedisCache redisCache;
    @Resource
    private OrderSummaryDayService orderSummaryDayService;
    @Resource
    private RedisPublisher redisPublisher;
    @Bean
    public KafkaStreams kafkaStreams() {
        Properties props = new Properties();
        props.put(StreamsConfig.APPLICATION_ID_CONFIG, applicationId != null ? applicationId : "kafka-streams-example-app");
        props.put(StreamsConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers != null ? bootstrapServers : "127.0.0.1:9092");
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        props.put(StreamsConfig.DEFAULT_KEY_SERDE_CLASS_CONFIG, Serdes.String().getClass());
        props.put(StreamsConfig.DEFAULT_VALUE_SERDE_CLASS_CONFIG, Serdes.String().getClass());

        // 创建 ObjectMapper 以解析 JSON 消息
        ObjectMapper objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());

        // 构建 Kafka Streams 应用程序
        StreamsBuilder builder = new StreamsBuilder();
        KStream<String, String> source = builder.stream("sb_topic", Consumed.with(Serdes.String(), Serdes.String()));


        // 将 JSON 消息转换为 OrderAllDto 对象
        KStream<String, OrderAllDto> orders = source.mapValues(value -> {

            try {
                OrderAllDto orderAllDto = objectMapper.readValue(value, OrderAllDto.class);
                OrderInfo orderInfo = orderAllDto.getOrderInfo();
                List<OrderItem> orderItems = orderAllDto.getOrderItems();
                if (orderInfo == null || orderInfo.getShopId() == null) {
                    return orderAllDto;
                }

                Long payAmountLong = orderInfo.getPayAmount() != null ? orderInfo.getPayAmount().longValue() : 0L;
                int itemCount = orderItems != null ? orderItems.size() : 0;

                redisCache.incrementHash("dataAnaly:orderSummaryDay:" + orderInfo.getShopId(), "orderNum", 1L);
                redisCache.incrementHash("dataAnaly:orderSummaryDay:" + orderInfo.getShopId(), "productNum", (long) itemCount);
                redisCache.incrementHash("dataAnaly:orderSummaryDay:" + orderInfo.getShopId(), "price", payAmountLong);

                if (orderItems != null) {
                    orderItems.forEach(m -> {
                        if (m != null && m.getName() != null) {
                            long qty = m.getQuantity() != null ? m.getQuantity() : 1L;
                            redisCache.incrementHash("dataAnaly:productSummaryDay:" + orderInfo.getShopId(), m.getName(), qty);
                        }
                    });
                }
                LocalDateTime createTime = orderInfo.getCreateTime();
                String mealPeriod = detectMealTime(createTime);
                redisCache.incrementHash("dataAnaly:orderSummaryTimePeriod:" + orderInfo.getShopId() + ":" + mealPeriod, "orderNum", 1L);
                redisCache.incrementHash("dataAnaly:orderSummaryTimePeriod:" + orderInfo.getShopId() + ":" + mealPeriod, "productNum", (long) itemCount);
                redisCache.incrementHash("dataAnaly:orderSummaryTimePeriod:" + orderInfo.getShopId() + ":" + mealPeriod, "price", payAmountLong);

                //通知webstock推送给前端
                redisPublisher.publishMessage(String.valueOf(orderInfo.getShopId()));
                return orderAllDto;
            } catch (JsonProcessingException e) {
                throw new RuntimeException(e);
            }
        });
        return new KafkaStreams(builder.build(), props);
    }

    //判断是在哪个时间段
    private String detectMealTime(LocalDateTime localDateTime) {
        if (localDateTime == null) {
            localDateTime = LocalDateTime.now();
        }
        LocalTime time = localDateTime.toLocalTime();
        if (!time.isBefore(LocalTime.of(7, 0)) && time.isBefore(LocalTime.of(11, 0))) {
            return "早餐";
        } else if (!time.isBefore(LocalTime.of(11, 0)) && time.isBefore(LocalTime.of(15, 0))) {
            return "午餐";
        } else if (!time.isBefore(LocalTime.of(15, 0)) && time.isBefore(LocalTime.of(23, 0))) {
            return "晚餐";
        } else {
            return "深夜";
        }
    }
}
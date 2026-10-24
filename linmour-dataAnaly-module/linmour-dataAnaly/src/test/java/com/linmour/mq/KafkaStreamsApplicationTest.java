package com.linmour.mq;

import org.junit.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;

import static org.junit.Assert.*;

public class KafkaStreamsApplicationTest {

    @Test
    public void testDetectMealTime() {
        KafkaStreamsApplication app = new KafkaStreamsApplication();

        // 08:30 -> 早餐
        LocalDateTime breakfast = LocalDateTime.of(2026, 10, 22, 8, 30);
        assertEquals("早餐", ReflectionTestUtils.invokeMethod(app, "detectMealTime", breakfast));

        // 12:30 -> 午餐
        LocalDateTime lunch = LocalDateTime.of(2026, 10, 22, 12, 30);
        assertEquals("午餐", ReflectionTestUtils.invokeMethod(app, "detectMealTime", lunch));

        // 18:30 -> 晚餐
        LocalDateTime dinner = LocalDateTime.of(2026, 10, 22, 18, 30);
        assertEquals("晚餐", ReflectionTestUtils.invokeMethod(app, "detectMealTime", dinner));

        // 23:30 -> 深夜
        LocalDateTime lateNight = LocalDateTime.of(2026, 10, 22, 23, 30);
        assertEquals("深夜", ReflectionTestUtils.invokeMethod(app, "detectMealTime", lateNight));
    }

    @Test
    public void testBootstrapServersConfigurationField() {
        KafkaStreamsApplication app = new KafkaStreamsApplication();
        ReflectionTestUtils.setField(app, "bootstrapServers", "127.0.0.1:9092");
        ReflectionTestUtils.setField(app, "applicationId", "my-test-streams");

        String configuredServers = (String) ReflectionTestUtils.getField(app, "bootstrapServers");
        assertEquals("127.0.0.1:9092", configuredServers);
    }
}

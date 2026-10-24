package com.linmour.redisPub;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

@Component
public class RedisPublisher {

    @Autowired(required = false)
    private StringRedisTemplate stringRedisTemplate;

    @Autowired(required = false)
    private RedisTemplate<String, String> redisTemplate;

    public void publishMessage(String message) {
        if (message == null) {
            return;
        }
        if (stringRedisTemplate != null) {
            stringRedisTemplate.convertAndSend("my_channel", message);
        } else if (redisTemplate != null) {
            redisTemplate.convertAndSend("my_channel", message);
        }
    }
}

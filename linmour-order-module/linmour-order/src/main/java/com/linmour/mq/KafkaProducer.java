package com.linmour.mq;

import com.linmour.order.pojo.Dto.OrderAllDto;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
public class KafkaProducer {

    @Autowired
    private KafkaTemplate<String, Object> kafkaTemplate;

    public void originalOrder(OrderAllDto message) {
        kafkaTemplate.send("sb_topic", message);
    }

}

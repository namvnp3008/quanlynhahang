package com.linmour.websocket.config;

import com.linmour.websocket.mq.ItemStatusSubscriber;
import com.linmour.websocket.mq.OrderEditedSubscriber;
import com.linmour.websocket.mq.PayosMismatchSubscriber;
import com.linmour.websocket.mq.RedisSubscriber;
import com.linmour.websocket.mq.TablePaidSubscriber;
import com.linmour.websocket.mq.TableQrRevokedSubscriber;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.listener.adapter.MessageListenerAdapter;


@Configuration
public class redisPSubConfig {

    @Bean
    public RedisMessageListenerContainer redisMessageListenerContainer(
            RedisConnectionFactory redisConnectionFactory,
            TablePaidSubscriber tablePaidSubscriber,
            ItemStatusSubscriber itemStatusSubscriber,
            PayosMismatchSubscriber payosMismatchSubscriber,
            TableQrRevokedSubscriber tableQrRevokedSubscriber,
            OrderEditedSubscriber orderEditedSubscriber) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(redisConnectionFactory);
        container.addMessageListener(new MessageListenerAdapter(new RedisSubscriber()), new ChannelTopic("my_channel"));
        container.addMessageListener(tablePaidSubscriber, new ChannelTopic("table_paid"));
        container.addMessageListener(itemStatusSubscriber, new ChannelTopic("item_status"));
        container.addMessageListener(payosMismatchSubscriber, new ChannelTopic("payos_mismatch"));
        container.addMessageListener(tableQrRevokedSubscriber, new ChannelTopic("table_qr_revoked"));
        container.addMessageListener(orderEditedSubscriber, new ChannelTopic("order_edited"));
        return container;
    }
}

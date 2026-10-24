package com.linmour.dataAnaly.job;

import com.linmour.dataAnaly.service.DailySummaryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import javax.annotation.Resource;
import java.time.LocalDate;

@Slf4j
@Component
public class DailySummaryJob {

    @Resource
    private DailySummaryService dailySummaryService;

    @Scheduled(cron = "0 0 0 * * ?")
    public void scheduledDailySummary() {
        LocalDate yesterday = LocalDate.now().minusDays(1);
        log.info("Scheduled task triggered: summarizing revenue for date: {}", yesterday);
        dailySummaryService.executeDailySummary(yesterday);
        log.info("Scheduled task finished for date: {}", yesterday);
    }
}

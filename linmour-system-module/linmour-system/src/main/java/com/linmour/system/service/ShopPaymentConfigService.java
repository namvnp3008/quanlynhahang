package com.linmour.system.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.linmour.security.dtos.Result;
import com.linmour.system.pojo.Do.ShopPaymentConfig;
import com.linmour.system.pojo.Dto.PayosConfigDto;
import com.linmour.system.pojo.Dto.PayosConfigReqDto;
import com.linmour.system.pojo.Dto.PayosConfigRespDto;
import com.linmour.system.pojo.Dto.SecurityNoticeRespDto;

public interface ShopPaymentConfigService extends IService<ShopPaymentConfig> {

    PayosConfigRespDto getPayosConfig(Long shopId);

    Result saveOrUpdatePayosConfig(Long shopId, PayosConfigReqDto reqDto);

    PayosConfigDto getInternalPayosConfig(Long shopId);

    Boolean isPayosEnabled(Long shopId);

    SecurityNoticeRespDto getSecurityNotice(Long shopId);
}

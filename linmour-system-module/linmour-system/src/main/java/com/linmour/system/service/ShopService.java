package com.linmour.system.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.linmour.security.dtos.Result;
import com.linmour.system.pojo.Do.Shop;
import com.linmour.system.pojo.Dto.AppShopInfoDto;
import com.linmour.system.pojo.Dto.ShopPage;

import java.util.List;

/**
* @author linmour
* @description 针对表【system_shop】的数据库操作Service
* @createDate 2023-07-21 15:23:21
*/
public interface ShopService extends IService<Shop> {

    /**
     * 查询拥有的店铺
     * @param dto
     * @return
     */
    Result shopList(ShopPage dto);

    /**
     * 查询分店
     * @param dto
     * @return
     */
    Result SonShopList(ShopPage dto);

    /**
     * P4: Lấy danh sách chi nhánh theo ID quán cha
     * @param parentId ID quán cha
     * @return danh sách chi nhánh
     */
    Result getSonShopListByParentId(Long parentId);

    /**
     * P5: Admin nền tảng duyệt/từ chối quán và đặt tỷ lệ phí hoa hồng
     * @param dto thông tin duyệt quán
     * @return Result
     */
    Result auditShop(com.linmour.system.pojo.Dto.AuditShopDto dto);


    Long save0rUpdateShop(Shop shop);

    default Long saveOrUpdateShop(Shop shop) {
        return save0rUpdateShop(shop);
    }

    List<Shop> getShopByIds(List<Long> ids);

    List<Long> getShopIdsByMerchantId(Long merchantId);

    AppShopInfoDto getShopInfo(Long shopId);
}

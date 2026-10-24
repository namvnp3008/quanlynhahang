package com.linmour.system.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.util.ObjectUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.github.yulichang.wrapper.MPJLambdaWrapper;
import com.linmour.security.dtos.LoginUser;
import com.linmour.security.dtos.LoginVo;
import com.linmour.security.dtos.PageResult;
import com.linmour.security.dtos.Result;
import com.linmour.security.exception.CustomException;
import com.linmour.security.exception.enums.AppHttpCodeEnum;
import com.linmour.system.mapper.ShopMapper;
import com.linmour.system.pojo.Do.Merchant;
import com.linmour.system.pojo.Do.Shop;
import com.linmour.system.pojo.Dto.AppShopInfoDto;
import com.linmour.system.pojo.Dto.ShopPage;
import com.linmour.system.service.ShopService;
import com.linmour.system.service.AuditService;
import com.linmour.system.pojo.Dto.AuditLogReqDto;
import com.linmour.security.utils.SecurityUtils;
import com.linmour.security.utils.WebUtils;
import com.linmour.system.pojo.Dto.AuditShopDto;
import org.apache.commons.lang3.StringUtils;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import javax.annotation.Resource;
import javax.servlet.http.HttpServletRequest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * @author linmour
 * @description 针对表【system_shop】的数据库操作Service实现
 * @createDate 2023-07-21 15:23:21
 */
@Service
public class ShopServiceImpl extends ServiceImpl<ShopMapper, Shop>
        implements ShopService {
    @Resource
    private ShopMapper shopMapper;

    @Resource
    private com.linmour.security.utils.RedisCache redisCache;

    @Resource
    private com.linmour.system.service.ShopPaymentConfigService shopPaymentConfigService;

    @Resource
    private AuditService auditService;

    private HttpServletRequest getCurrentHttpRequest() {
        RequestAttributes attribs = RequestContextHolder.getRequestAttributes();
        if (attribs instanceof ServletRequestAttributes) {
            return ((ServletRequestAttributes) attribs).getRequest();
        }
        return null;
    }

    @Override
    public Result shopList(ShopPage dto) {
        //从SecurityContextHolder中拿到用户信息
        LoginUser user = (LoginUser) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        LoginVo loginVo = user.getLoginVo();
        Long id = null;
        if (!loginVo.getType().equals(1))
            id = loginVo.getId();

        List<ShopPage> shopPages1 = shopMapper.selectJoinList(ShopPage.class, new MPJLambdaWrapper<Shop>()
                .selectAll(Shop.class)
                .eq(!ObjectUtil.isNull(id), Shop::getMerchantId, id)
                .eq(!ObjectUtil.isNull(dto.getAuditStatus()), Shop::getAuditStatus, dto.getAuditStatus())
                .like(!StringUtils.isBlank(dto.getName()), Shop::getName, dto.getName())
                .eq(!ObjectUtil.isNull(dto.getShopStatus()), Shop::getShopStatus, dto.getShopStatus())
                .leftJoin(Merchant.class, Merchant::getId, Shop::getMerchantId)
                .select(Merchant::getRealName));
        if (ObjectUtil.isNull(shopPages1)) {
            throw new CustomException(AppHttpCodeEnum.SHOP_ERRPR);
        }

        List<ShopPage> shopPages = BeanUtil.copyToList(shopPages1, ShopPage.class);
        if (id != null && redisCache != null) {
            try {
                List<Long> shopIds = new ArrayList<>();
                for (ShopPage sp : shopPages1) {
                    if (sp.getId() != null) {
                        shopIds.add(sp.getId());
                    }
                }
                redisCache.setCacheObject("merchant:shops:" + id, shopIds, 10, java.util.concurrent.TimeUnit.MINUTES);
            } catch (Exception ignored) {}
        }
        return Result.success(new PageResult<>(shopPages, (long) shopPages1.size()));
    }

    @Override
    public Result SonShopList(ShopPage dto) {
        if (dto != null && dto.getId() != null && dto.getId() > 0) {
            Integer userType = SecurityUtils.getUserType();
            Long currentUserId = SecurityUtils.getUserId();
            if (userType == null || !userType.equals(1)) {
                Shop parentShop = this.getById(dto.getId());
                if (parentShop == null || (parentShop.getDeleted() != null && parentShop.getDeleted() == 1)) {
                    throw new CustomException(AppHttpCodeEnum.SHOP_ERRPR);
                }
                if (currentUserId == null || !parentShop.getMerchantId().equals(currentUserId)) {
                    throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
                }
            }
        }

        Page<Shop> ShopListPage = page(new Page<Shop>(dto.getPageNo(), dto.getPageSize()),
                new LambdaQueryWrapper<Shop>().eq(Shop::getParentId, dto.getId())
                        .like(!StringUtils.isBlank(dto.getName()), Shop::getName, dto.getName())
                        .eq(!ObjectUtil.isNull(dto.getShopStatus()), Shop::getShopStatus, dto.getShopStatus()));

        if (ObjectUtil.isNull(ShopListPage.getRecords())) {
            throw new CustomException(AppHttpCodeEnum.SHOP_ERRPR);
        }

        List<ShopPage> shopPages = BeanUtil.copyToList(ShopListPage.getRecords(), ShopPage.class);
        return Result.success(new PageResult<>(shopPages, ShopListPage.getTotal()));
    }

    @Override
    public Result getSonShopListByParentId(Long parentId) {
        if (parentId == null) {
            throw new CustomException(AppHttpCodeEnum.PARAM_ERROR);
        }
        Integer userType = SecurityUtils.getUserType();
        Long currentUserId = SecurityUtils.getUserId();
        if (userType == null || !userType.equals(1)) {
            Shop parentShop = this.getById(parentId);
            if (parentShop == null || (parentShop.getDeleted() != null && parentShop.getDeleted() == 1)) {
                throw new CustomException(AppHttpCodeEnum.SHOP_ERRPR);
            }
            if (currentUserId == null || !parentShop.getMerchantId().equals(currentUserId)) {
                throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
            }
        }
        List<Shop> list = shopMapper.selectList(new LambdaQueryWrapper<Shop>()
                .eq(Shop::getParentId, parentId)
                .eq(Shop::getDeleted, 0));
        return Result.success(list);
    }

    @Override
    public Long save0rUpdateShop(Shop shop) {
        if (shop == null) {
            throw new CustomException(AppHttpCodeEnum.CONTENT_NOT_NULL);
        }

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        Long currentUserId = null;
        Integer userType = null;
        if (auth != null && auth.getPrincipal() instanceof LoginUser) {
            LoginUser loginUser = (LoginUser) auth.getPrincipal();
            if (loginUser.getLoginVo() != null) {
                currentUserId = loginUser.getLoginVo().getId();
                userType = loginUser.getLoginVo().getType();
            }
        }
        if (currentUserId == null) {
            throw new CustomException(AppHttpCodeEnum.NEED_LOGIN);
        }

        // P4: Khi tạo hoặc cập nhật chi nhánh (parent_id > 0), kiểm tra quyền sở hữu quán cha
        if (shop.getParentId() != null && shop.getParentId() > 0) {
            Shop parentShop = this.getById(shop.getParentId());
            if (parentShop == null || (parentShop.getDeleted() != null && parentShop.getDeleted() == 1)) {
                throw new CustomException(AppHttpCodeEnum.SHOP_ERRPR);
            }
            if (userType == null || !userType.equals(1)) {
                if (parentShop.getMerchantId() == null || !parentShop.getMerchantId().equals(currentUserId)) {
                    throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
                }
            }
        }

        // Đồng bộ 2 chiều address <-> position
        if (shop.getPosition() == null && shop.getAddress() != null) {
            shop.setPosition(shop.getAddress());
        } else if (shop.getAddress() == null && shop.getPosition() != null) {
            shop.setAddress(shop.getPosition());
        }
        // Đồng bộ 2 chiều openTime <-> businessHours
        if (shop.getBusinessHours() == null && shop.getOpenTime() != null) {
            shop.setBusinessHours(shop.getOpenTime());
        } else if (shop.getOpenTime() == null && shop.getBusinessHours() != null) {
            shop.setOpenTime(shop.getBusinessHours());
        }

        if (shop.getId() == null) {
            // Tạo quán mới: server ép merchant_id = user hiện tại, audit_status=2 (Chờ duyệt), shop_status=1, bỏ qua fee_rate
            shop.setMerchantId(currentUserId);
            shop.setAuditStatus(2);
            shop.setShopStatus(1);
            shop.setFeeRate(new java.math.BigDecimal("0.00"));
            if (shop.getCertificate() == null) {
                shop.setCertificate("");
            }
            if (shop.getParentId() == null) {
                shop.setParentId(0L);
            }
            if (shop.getBusinessStatus() == null) {
                shop.setBusinessStatus(1);
            }
            this.save(shop);
        } else {
            // Sửa quán hiện có: chỉ sửa quán của chính mình, không đổi audit_status, fee_rate, merchant_id
            Shop existing = this.getById(shop.getId());
            if (existing == null) {
                throw new CustomException(AppHttpCodeEnum.SHOP_ERRPR);
            }

            if (userType == null || !userType.equals(1)) {
                if (existing.getMerchantId() == null || !existing.getMerchantId().equals(currentUserId)) {
                    throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
                }
            }

            if (userType == null || !userType.equals(1)) {
                shop.setMerchantId(existing.getMerchantId());
                shop.setAuditStatus(existing.getAuditStatus());
                shop.setFeeRate(existing.getFeeRate());
            }

            this.updateById(shop);

            // S3: Audit SHOP_UPDATE
            try {
                HttpServletRequest req = getCurrentHttpRequest();
                String clientIp = WebUtils.getClientIp(req);
                String actor = (SecurityUtils.getLoginUser() != null && SecurityUtils.getLoginUser().getLoginVo() != null
                        && StringUtils.isNotBlank(SecurityUtils.getLoginUser().getLoginVo().getPhone()))
                        ? SecurityUtils.getLoginUser().getLoginVo().getPhone() : "User " + currentUserId;
                Integer uType = userType != null ? userType : 2;

                Map<String, Object> detail = new HashMap<>();
                detail.put("name", shop.getName());
                detail.put("status", shop.getShopStatus());

                auditService.recordAudit(AuditLogReqDto.builder()
                        .shopId(shop.getId())
                        .merchantId(currentUserId)
                        .actorName(actor)
                        .actorType(uType)
                        .action("SHOP_UPDATE")
                        .targetType("shop")
                        .targetId(String.valueOf(shop.getId()))
                        .detail(detail)
                        .ip(clientIp)
                        .userAgent(req != null ? req.getHeader("User-Agent") : null)
                        .result("SUCCESS")
                        .build());
            } catch (Exception ignored) {}
        }

        // Q7: Xoá cache danh sách quán của merchant trong Redis khi tạo quán mới hoặc cập nhật quán
        if (currentUserId != null && redisCache != null) {
            try {
                redisCache.deleteObject("merchant:shops:" + currentUserId);
            } catch (Exception ignored) {}
        }

        return shop.getId();
    }

    @Override
    public Result auditShop(AuditShopDto dto) {
        Integer userType = SecurityUtils.getUserType();
        if (userType == null || !userType.equals(1)) {
            throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
        }
        if (dto == null || dto.getId() == null || dto.getAuditStatus() == null) {
            throw new CustomException(AppHttpCodeEnum.PARAM_ERROR);
        }
        if (dto.getAuditStatus() != 0 && dto.getAuditStatus() != 1 && dto.getAuditStatus() != 2) {
            throw new CustomException(AppHttpCodeEnum.PARAM_ERROR);
        }
        Shop shop = this.getById(dto.getId());
        if (shop == null || (shop.getDeleted() != null && shop.getDeleted() == 1)) {
            throw new CustomException(AppHttpCodeEnum.SHOP_ERRPR);
        }
        shop.setAuditStatus(dto.getAuditStatus());
        if (dto.getFeeRate() != null) {
            shop.setFeeRate(dto.getFeeRate());
        }
        this.updateById(shop);

        // S3: Audit SHOP_AUDIT & FEE_RATE_CHANGE
        try {
            HttpServletRequest req = getCurrentHttpRequest();
            String clientIp = WebUtils.getClientIp(req);
            String actor = (SecurityUtils.getLoginUser() != null && SecurityUtils.getLoginUser().getLoginVo() != null
                    && StringUtils.isNotBlank(SecurityUtils.getLoginUser().getLoginVo().getPhone()))
                    ? SecurityUtils.getLoginUser().getLoginVo().getPhone() : "Admin";

            Map<String, Object> auditDetail = new HashMap<>();
            auditDetail.put("auditStatus", dto.getAuditStatus());
            if (dto.getFeeRate() != null) {
                auditDetail.put("feeRate", dto.getFeeRate());
            }

            auditService.recordAudit(AuditLogReqDto.builder()
                    .shopId(dto.getId())
                    .merchantId(shop.getMerchantId())
                    .actorName(actor)
                    .actorType(1)
                    .action("SHOP_AUDIT")
                    .targetType("shop")
                    .targetId(String.valueOf(dto.getId()))
                    .detail(auditDetail)
                    .ip(clientIp)
                    .userAgent(req != null ? req.getHeader("User-Agent") : null)
                    .result("SUCCESS")
                    .build());

            if (dto.getFeeRate() != null) {
                Map<String, Object> feeDetail = new HashMap<>();
                feeDetail.put("feeRateNew", dto.getFeeRate());
                auditService.recordAudit(AuditLogReqDto.builder()
                        .shopId(dto.getId())
                        .merchantId(shop.getMerchantId())
                        .actorName(actor)
                        .actorType(1)
                        .action("FEE_RATE_CHANGE")
                        .targetType("shop")
                        .targetId(String.valueOf(dto.getId()))
                        .detail(feeDetail)
                        .ip(clientIp)
                        .userAgent(req != null ? req.getHeader("User-Agent") : null)
                        .result("SUCCESS")
                        .build());
            }
        } catch (Exception ignored) {}

        // Xoá cache quyền của merchant sở hữu quán này để cập nhật kịp thời
        if (shop.getMerchantId() != null && redisCache != null) {
            try {
                redisCache.deleteObject("merchant:shops:" + shop.getMerchantId());
            } catch (Exception ignored) {}
        }
        return Result.success();
    }

    @Override
    public List<Long> getShopIdsByMerchantId(Long merchantId) {
        if (merchantId == null) {
            return new ArrayList<>();
        }
        // 1. Quán do merchant trực tiếp sở hữu
        List<Shop> directShops = shopMapper.selectList(new LambdaQueryWrapper<Shop>()
                .eq(Shop::getMerchantId, merchantId)
                .eq(Shop::getDeleted, 0));
        Set<Long> allIds = new LinkedHashSet<>();
        if (directShops != null) {
            for (Shop s : directShops) {
                if (s.getId() != null) {
                    allIds.add(s.getId());
                }
            }
        }
        // 2. Các chi nhánh (quán con) có parent_id thuộc quán của merchant
        if (!allIds.isEmpty()) {
            List<Long> currentLevel = new ArrayList<>(allIds);
            while (!currentLevel.isEmpty()) {
                List<Shop> children = shopMapper.selectList(new LambdaQueryWrapper<Shop>()
                        .in(Shop::getParentId, currentLevel)
                        .eq(Shop::getDeleted, 0));
                List<Long> nextLevel = new ArrayList<>();
                if (children != null) {
                    for (Shop c : children) {
                        if (c.getId() != null && allIds.add(c.getId())) {
                            nextLevel.add(c.getId());
                        }
                    }
                }
                currentLevel = nextLevel;
            }
        }
        return new ArrayList<>(allIds);
    }

    @Override
    public List<Shop> getShopByIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return new ArrayList<>();
        }
        return shopMapper.selectBatchIds(ids);
    }

    @Override
    public AppShopInfoDto getShopInfo(Long shopId) {
        if (shopId == null) {
            return null;
        }
        Shop shop = this.getById(shopId);
        if (shop == null || (shop.getDeleted() != null && shop.getDeleted() == 1)) {
            return null;
        }
        String effectiveAddress = shop.getAddress() != null && !shop.getAddress().isEmpty()
                ? shop.getAddress()
                : shop.getPosition();
        String effectiveOpenTime = shop.getOpenTime() != null
                ? shop.getOpenTime().toString()
                : (shop.getBusinessHours() != null ? shop.getBusinessHours().toString() : null);
        String effectiveCloseTime = shop.getCloseTime() != null ? shop.getCloseTime().toString() : null;

        return AppShopInfoDto.builder()
                .id(shop.getId())
                .name(shop.getName())
                .position(shop.getPosition())
                .businessHours(shop.getBusinessHours() != null ? shop.getBusinessHours().toString() : null)
                .address(effectiveAddress)
                .phone(shop.getPhone())
                .openTime(effectiveOpenTime)
                .closeTime(effectiveCloseTime)
                .auditStatus(shop.getAuditStatus())
                .shopStatus(shop.getShopStatus())
                .payosEnabled(shopPaymentConfigService != null && Boolean.TRUE.equals(shopPaymentConfigService.isPayosEnabled(shopId)))
                .build();
    }
}

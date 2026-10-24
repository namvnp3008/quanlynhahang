package com.linmour.system.controller.admin.merchant;

import com.linmour.security.dtos.Result;


import com.linmour.security.exception.CustomException;
import com.linmour.security.exception.enums.AppHttpCodeEnum;
import com.linmour.system.convert.MerchantConvert;
import com.linmour.system.pojo.Do.Merchant;
import com.linmour.system.pojo.Do.Shop;
import com.linmour.system.pojo.Dto.MerchantPage;
import com.linmour.system.pojo.Dto.MerchantRegisterDto;
import com.linmour.system.pojo.Dto.UserInfoDto;
import com.linmour.system.service.MerchantService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import javax.annotation.Resource;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/system/merchant")
public class MerchantController {

    @Resource
    private MerchantService merchantService;

    @Value("${security.internal-token:}")
    private String internalToken;

    @PostMapping("/userInfo")
    public Result userInfo(Long userId) {
        return Result.success(merchantService.getUserInfo(userId));
    }

    @PostMapping("/register")
    public Result register(@RequestBody MerchantRegisterDto registerDto) {
        return merchantService.register(registerDto);
    }

    @PostMapping("/saveOrUpdateMerchant")
    public Result saveOrUpdateMerchant(@RequestBody Merchant merchant) {
        return Result.success(merchantService.saveOrUpdateMerchant(merchant));
    }

    @PostMapping("/ocr")
    public Result ocr(@RequestParam("multipartFile") MultipartFile multipartFile) {
        return merchantService.ocr(multipartFile);
    }

    @GetMapping("/getMerchantPage")
    public Result getMerchantPage( MerchantPage merchantPage) {
        return Result.success(merchantService.getMerchantPage(merchantPage));
    }
    @GetMapping("/internal/getMerchantByIds")
    public List<Merchant> getMerchantByIds(
            @RequestParam("ids") List<Long> ids,
            @RequestHeader(value = "X-Internal-Token", required = false) String reqInternalToken) {
        String configuredToken = internalToken != null ? internalToken.trim() : "";
        if (reqInternalToken == null || !reqInternalToken.trim().equals(configuredToken)) {
            throw new CustomException(AppHttpCodeEnum.NO_OPERATOR_AUTH);
        }
        return merchantService.getMerchantByIds(ids);
    }

    @PostMapping("/save0rUpdateMerchant")
    public Result save0rUpdateMerchant(@RequestBody Merchant merchant) {
        return Result.success(merchantService.save0rUpdateMerchant(merchant));
    }
    @PostMapping("/update")
    public Result update(@RequestBody UserInfoDto userInfoDto) {
        try {
            return Result.success(merchantService.updateMerchantProfile(userInfoDto));
        } catch (Exception e) {
            if (e instanceof CustomException) {
                throw (CustomException) e;
            }
            if (e instanceof DuplicateKeyException) {
                throw new CustomException(AppHttpCodeEnum.PHONENUMBER_EXIST);
            }
            throw new RuntimeException(e);
        }
    }

    @PostMapping("/changeStatus/{id}/{status}")
    public Result changeStatus(@PathVariable("id") Long id, @PathVariable("status") Integer status) {
        return merchantService.changeStatus(id, status);
    }

    @GetMapping("/sessions")
    public Result getSessions() {
        return merchantService.getSessions();
    }

    @PostMapping("/changePassword")
    public Result changePassword(@RequestBody com.linmour.system.pojo.Dto.ChangePasswordDto changePasswordDto) {
        return merchantService.changePassword(changePasswordDto);
    }

    @PostMapping("/otp/setup")
    public Result setupOtp(@RequestBody(required = false) com.linmour.system.pojo.Dto.OtpSetupReqDto reqDto) {
        return merchantService.setupOtp(reqDto);
    }

    @PostMapping("/otp/enable")
    public Result enableOtp(@RequestBody com.linmour.system.pojo.Dto.OtpEnableReqDto reqDto) {
        return merchantService.enableOtp(reqDto);
    }

    @PostMapping("/otp/disable")
    public Result disableOtp(@RequestBody com.linmour.system.pojo.Dto.OtpDisableReqDto reqDto) {
        return merchantService.disableOtp(reqDto);
    }

    @PostMapping("/wsTicket")
    public Result wsTicket(@RequestBody(required = false) Map<String, Object> req) {
        Long shopId = null;
        if (req != null && req.containsKey("shopId") && req.get("shopId") != null) {
            try {
                shopId = Long.valueOf(String.valueOf(req.get("shopId")));
            } catch (NumberFormatException ignored) {}
        }
        return merchantService.createWsTicket(shopId);
    }
}

package com.linmour.system.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.linmour.system.pojo.Do.Merchant;


import com.linmour.system.pojo.Dto.MerchantPage;
import com.linmour.system.pojo.Dto.MerchantRegisterDto;
import com.linmour.system.pojo.Dto.UserInfoDto;
import com.linmour.security.dtos.LoginVo;
import com.linmour.security.dtos.PageResult;
import com.linmour.security.dtos.Result;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
* @author linmour
* @description 针对表【system_merchant】的数据库操作Service
* @createDate 2023-07-17 20:05:36
*/
public interface MerchantService extends IService<Merchant> {

    Result login(LoginVo loginVo);

    Result logout(Long id);

    UserInfoDto getUserInfo(Long userId);

    Result uploadAvatar(MultipartFile multipartFile);

    Result ocr(MultipartFile multipartFile);


    Long saveOrUpdateMerchant(Merchant merchant);


    PageResult<Merchant> getMerchantPage(MerchantPage merchant);

    Long save0rUpdateMerchant(Merchant merchant);

    List<Merchant> getMerchantByIds(List<Long> ids);

    Result register(MerchantRegisterDto registerDto);

    boolean updateMerchantProfile(UserInfoDto userInfoDto);

    /**
     * P5: Khoá (status=0) hoặc mở khoá (status=1) tài khoản merchant
     * @param id ID merchant
     * @param status Trạng thái mới
     * @return Result
     */
    Result changeStatus(Long id, Integer status);

    /**
     * S2: Đăng xuất phiên hiện tại
     */
    Result logoutCurrent();

    /**
     * S2: Đăng xuất tất cả các phiên của tài khoản hiện tại
     */
    Result logoutAll();

    /**
     * S2: Lấy danh sách các phiên đăng nhập đang hoạt động
     */
    Result getSessions();

    /**
     * S2: Đổi mật khẩu tài khoản
     */
    Result changePassword(com.linmour.system.pojo.Dto.ChangePasswordDto changePasswordDto);

    /**
     * S4: Bắt đầu thiết lập xác thực 2 lớp (OTP RFC 6238)
     */
    Result setupOtp(com.linmour.system.pojo.Dto.OtpSetupReqDto reqDto);

    /**
     * S4: Bật xác thực 2 lớp sau khi xác minh mã 6 số
     */
    Result enableOtp(com.linmour.system.pojo.Dto.OtpEnableReqDto reqDto);

    /**
     * S4: Tắt xác thực 2 lớp
     */
    Result disableOtp(com.linmour.system.pojo.Dto.OtpDisableReqDto reqDto);

    /**
     * S4: Bước 2 đăng nhập bằng OTP hoặc mã khôi phục
     */
    Result loginOtp(com.linmour.system.pojo.Dto.OtpLoginReqDto reqDto);

    /**
     * S4 / K1: Kiểm tra mã OTP hoặc mã khôi phục của merchant
     */
    boolean verifyOtp(Merchant merchant, String code);

    /**
     * SEC-WS: Sinh vé dùng một lần kết nối WebSocket admin
     */
    Result createWsTicket(Long shopId);
}

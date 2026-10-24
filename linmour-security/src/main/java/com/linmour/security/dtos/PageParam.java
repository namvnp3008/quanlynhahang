package com.linmour.security.dtos;

import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.Data;

import javax.validation.constraints.Max;
import javax.validation.constraints.Min;
import javax.validation.constraints.NotNull;
import java.io.Serializable;

/**
 * @Classname PageParam
 * @Description 分页请求参数
 * @Date 2023/7/17 11:07
 * @Created by linmour
 */
@Data
public class PageParam implements Serializable {

    private static final Integer PAGE_NO = 1;
    private static final Integer PAGE_SIZE = 10;

    @NotNull(message = "Số trang không được để trống")
    @Min(value = 1, message = "Số trang tối thiểu là 1")
    @JsonIgnore()
    public Integer pageNo = PAGE_NO;

    @NotNull(message = "Số lượng mỗi trang không được để trống")
    @Min(value = 1, message = "Số lượng mỗi trang tối thiểu là 1")
    @Max(value = 100, message = "Số lượng mỗi trang tối đa là 100")
    @JsonIgnore()
    public Integer pageSize = PAGE_SIZE;

}
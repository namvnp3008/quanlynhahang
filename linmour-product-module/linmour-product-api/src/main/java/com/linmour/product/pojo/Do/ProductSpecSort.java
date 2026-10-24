package com.linmour.product.pojo.Do;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.io.Serializable;
import lombok.Data;

/**
 * 
 * @TableName spec_sort
 */
@TableName(value ="product_spec_sort")
@Data
public class ProductSpecSort implements Serializable {
    /**
     * 
     */
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    /**
     * 
     */
    @TableField(value = "name")
    private String name;

    /**
     * 
     */
    @TableField(value = "product_id")
    private Long productId;

    /**
     * 
     */
    @TableField(value = "deleted")
    private Integer deleted;

    /**
     * Quy tắc chọn: single | multi
     */
    @TableField(value = "select_type")
    private String selectType;

    /**
     * Bắt buộc chọn: 0 = không bắt buộc, 1 = bắt buộc
     */
    @TableField(value = "required")
    private Integer required;

    @TableField(exist = false)
    private static final long serialVersionUID = 1L;
}
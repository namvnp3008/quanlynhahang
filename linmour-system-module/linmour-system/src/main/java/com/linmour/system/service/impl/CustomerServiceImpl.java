package com.linmour.system.service.impl;

import cn.hutool.core.util.ObjectUtil;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.linmour.system.mapper.CustomerMapper;
import com.linmour.system.pojo.Do.Customer;
import com.linmour.system.pojo.Dto.CustomerDto;
import com.linmour.system.service.CustomerService;
import org.springframework.stereotype.Service;

import javax.annotation.Resource;

@Service
public class CustomerServiceImpl extends ServiceImpl<CustomerMapper, Customer> implements CustomerService {

    @Resource
    private CustomerMapper customerMapper;

    @Override
    public Customer login(CustomerDto customer) {
        // WeChat mini-program login is removed for Vietnamese web client
        if (customer == null || customer.getCode() == null || customer.getCode().trim().isEmpty()) {
            return null;
        }
        String openid = customer.getCode();
        Customer user = customerMapper.selectOne(new LambdaQueryWrapper<Customer>().eq(Customer::getOpenid, openid));
        if (!ObjectUtil.isEmpty(user)) {
            return user;
        }

        Customer newCustomer = new Customer();
        newCustomer.setOpenid(openid);
        newCustomer.setNickName("Khách " + (openid.length() > 5 ? openid.substring(openid.length() - 5) : openid));
        customerMapper.insert(newCustomer);
        return newCustomer;
    }
}

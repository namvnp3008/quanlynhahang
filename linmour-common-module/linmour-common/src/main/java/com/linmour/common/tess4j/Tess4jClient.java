package com.linmour.common.tess4j;

import lombok.Getter;
import lombok.Setter;
import net.sourceforge.tess4j.ITesseract;
import net.sourceforge.tess4j.Tesseract;
import net.sourceforge.tess4j.TesseractException;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.awt.image.BufferedImage;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "tess4j")
public class Tess4jClient {

    private String dataPath;
    private String language;

    public String doOCR(BufferedImage image) throws TesseractException {
        //创建Tesseract对象
        ITesseract tesseract = new Tesseract();
        //设置字体库路径
        String path = dataPath;
        if (org.apache.commons.lang3.StringUtils.isBlank(path) || !new java.io.File(path).exists()) {
            java.io.File localOcr = new java.io.File(System.getProperty("user.dir"), "ocr");
            if (localOcr.exists()) {
                path = localOcr.getAbsolutePath();
            }
        }
        tesseract.setDatapath(path);
        //中文识别
        String lang = org.apache.commons.lang3.StringUtils.isNotBlank(language) ? language : "chi_sim";
        tesseract.setLanguage(lang);
        //执行ocr识别
        String result = tesseract.doOCR(image);
        //替换回车和tal键  使结果为一行
        result = result.replaceAll("\\r|\\n", "-").replaceAll(" ", "");
        return result;
    }

}
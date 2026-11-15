# syntax=docker/dockerfile:1.6
# Image chạy cho 1 service Java. Jar lấy từ context "builder"
# (image linmour/backend-builder:local, xem docker/backend-builder.Dockerfile).
FROM eclipse-temurin:11-jre-jammy
ARG MODULE_JAR
ARG SERVICE_PORT
# Gói hệ thống thêm cho từng service (vd. system cần libtesseract4 cho OCR Tess4j 4.1.1)
ARG APT_PACKAGES=""
RUN if [ -n "$APT_PACKAGES" ]; then \
      apt-get update && apt-get install -y --no-install-recommends $APT_PACKAGES && rm -rf /var/lib/apt/lists/*; \
    fi
ENV TZ=Asia/Ho_Chi_Minh
WORKDIR /app
COPY --from=builder /src/${MODULE_JAR} /app/app.jar
# Tess4jClient tìm dữ liệu OCR ở ${user.dir}/ocr
COPY --from=builder /src/ocr /app/ocr
COPY docker/java-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
EXPOSE ${SERVICE_PORT}
ENTRYPOINT ["/app/entrypoint.sh"]

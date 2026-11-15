#!/bin/sh
# Chờ Nacos sẵn sàng rồi mới chạy service.
# Lý do: khi Docker Desktop tự khởi động lại container (bật máy), depends_on không được xét;
# nacos-client 1.3.3 đăng ký thất bại một lần là không tự đăng ký lại → gateway trả 502.
NACOS_URL="${NACOS_WAIT_URL:-http://nacos:8848/nacos/v1/console/server/state}"
TIMEOUT="${NACOS_WAIT_TIMEOUT:-300}"
elapsed=0
until curl -sf "$NACOS_URL" >/dev/null 2>&1; do
  if [ "$elapsed" -ge "$TIMEOUT" ]; then
    echo "[entrypoint] Nacos chưa sẵn sàng sau ${TIMEOUT}s, thoát để Docker chạy lại" >&2
    exit 1
  fi
  sleep 3
  elapsed=$((elapsed + 3))
done
echo "[entrypoint] Nacos sẵn sàng sau ${elapsed}s, khởi động service"
exec java $JAVA_OPTS -jar /app/app.jar

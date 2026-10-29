#!/bin/bash
set -e

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$BASE_DIR"

JAVA_BIN="/opt/homebrew/opt/openjdk@11/bin/java"
if [ ! -f "$JAVA_BIN" ]; then
    JAVA_BIN="$(which java)"
fi

mkdir -p logs

echo "=== 1. Starting Infrastructure (MySQL, Nacos, Kafka) ==="
docker-compose -p qr-code-orders---saas-master -f docker-compose-infra.yml up -d || true

echo "Waiting for Nacos to be healthy on port 8848..."
for i in {1..30}; do
    if curl -s http://127.0.0.1:8848/nacos/v1/console/server/state 2>/dev/null | grep -q "standalone"; then
        echo "Nacos is up and running!"
        break
    fi
    sleep 2
done

# Load environment variables from .env if present
if [ -f .env ]; then
    echo "Loading environment variables from .env..."
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
fi

# Set defaults for required environment variables
export MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
export MYSQL_PORT="${MYSQL_PORT:-3306}"
export MYSQL_USERNAME="${MYSQL_USERNAME:-root}"
if [ -z "$MYSQL_PASSWORD" ]; then
    echo "ERROR: MYSQL_PASSWORD is not set. Please set it in .env (see .env.example)." >&2
    exit 1
fi
export MYSQL_PASSWORD="${MYSQL_PASSWORD}"

export REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
export REDIS_PORT="${REDIS_PORT:-6379}"
export REDIS_PASSWORD="${REDIS_PASSWORD:-}"
export REDIS_DATABASE="${REDIS_DATABASE:-2}"

export KAFKA_BOOTSTRAP_SERVERS="${KAFKA_BOOTSTRAP_SERVERS:-127.0.0.1:9092}"
export PAYOS_MOCK="${PAYOS_MOCK:-false}"

# Resolve LAN IP (allow override with LAN_IP environment variable)
LAN_IP="${LAN_IP:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)}"
if [ -z "$LAN_IP" ]; then
    LAN_IP="127.0.0.1"
fi
export LAN_IP

export WEB_BASE_URL="${WEB_BASE_URL:-http://${LAN_IP}:5181}"
export PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-http://${LAN_IP}:12800}"

# Ensure internal secret token exists in .secrets/internal-token
mkdir -p .secrets
if [ -n "$INTERNAL_TOKEN" ]; then
    echo "$INTERNAL_TOKEN" > .secrets/internal-token
elif [ ! -f .secrets/internal-token ] || [ ! -s .secrets/internal-token ]; then
    echo "Generating new internal secret token in .secrets/internal-token..."
    openssl rand -hex 32 > .secrets/internal-token
    INTERNAL_TOKEN=$(tr -d '\r\n ' < .secrets/internal-token)
else
    INTERNAL_TOKEN=$(tr -d '\r\n ' < .secrets/internal-token)
fi
export INTERNAL_TOKEN

# Ensure JWT secret exists in .secrets/jwt-secret
if [ -n "$JWT_SECRET" ]; then
    echo "$JWT_SECRET" > .secrets/jwt-secret
elif [ ! -f .secrets/jwt-secret ] || [ ! -s .secrets/jwt-secret ]; then
    echo "Generating new random JWT secret in .secrets/jwt-secret..."
    openssl rand -hex 32 > .secrets/jwt-secret
    JWT_SECRET=$(tr -d '\r\n ' < .secrets/jwt-secret)
else
    JWT_SECRET=$(tr -d '\r\n ' < .secrets/jwt-secret)
fi
export JWT_SECRET

# Ensure PayOS config secret exists in .secrets/payos-config-secret
if [ -n "$PAYOS_CONFIG_SECRET" ]; then
    echo "$PAYOS_CONFIG_SECRET" > .secrets/payos-config-secret
elif [ ! -f .secrets/payos-config-secret ] || [ ! -s .secrets/payos-config-secret ]; then
    echo "Generating new random PayOS config secret in .secrets/payos-config-secret..."
    openssl rand -hex 32 > .secrets/payos-config-secret
    PAYOS_CONFIG_SECRET=$(tr -d '\r\n ' < .secrets/payos-config-secret)
else
    PAYOS_CONFIG_SECRET=$(tr -d '\r\n ' < .secrets/payos-config-secret)
fi
export PAYOS_CONFIG_SECRET

# Ensure OTP secret exists in .secrets/otp-secret
if [ -n "$OTP_SECRET" ]; then
    echo "$OTP_SECRET" > .secrets/otp-secret
elif [ ! -f .secrets/otp-secret ] || [ ! -s .secrets/otp-secret ]; then
    echo "Generating new random OTP secret in .secrets/otp-secret..."
    openssl rand -hex 32 > .secrets/otp-secret
    OTP_SECRET=$(tr -d '\r\n ' < .secrets/otp-secret)
else
    OTP_SECRET=$(tr -d '\r\n ' < .secrets/otp-secret)
fi
export OTP_SECRET

# Ensure table token secret exists in .secrets/table-token-secret (T-1)
if [ -n "$TABLE_TOKEN_SECRET" ]; then
    echo "$TABLE_TOKEN_SECRET" > .secrets/table-token-secret
elif [ ! -f .secrets/table-token-secret ] || [ ! -s .secrets/table-token-secret ]; then
    echo "Generating new random table token secret in .secrets/table-token-secret..."
    openssl rand -hex 32 > .secrets/table-token-secret
    TABLE_TOKEN_SECRET=$(tr -d '\r\n ' < .secrets/table-token-secret)
else
    TABLE_TOKEN_SECRET=$(tr -d '\r\n ' < .secrets/table-token-secret)
fi
export TABLE_TOKEN_SECRET

# S-FIX-3 & T-1: Security flags
export SECURITY_REQUIRE_OTP_FOR_PLATFORM_ADMIN="${SECURITY_REQUIRE_OTP_FOR_PLATFORM_ADMIN:-${REQUIRE_OTP_FOR_PLATFORM_ADMIN:-true}}"
export SECURITY_FORCE_WEAK_PASSWORD_CHANGE="${SECURITY_FORCE_WEAK_PASSWORD_CHANGE:-${FORCE_WEAK_PASSWORD_CHANGE:-true}}"
export SECURITY_ALLOW_RAW_TABLE_IDS="${SECURITY_ALLOW_RAW_TABLE_IDS:-${ALLOW_RAW_TABLE_IDS:-false}}"

echo "Ensuring Nacos namespace 'linmour'..."
curl -s -X POST "http://127.0.0.1:8848/nacos/v1/console/namespaces" \
    -d "customNamespaceId=linmour&namespaceName=linmour&namespaceDesc=Linmour" >/dev/null 2>&1 || true

echo "Publishing Nacos configurations from config/nacos/*.yml templates..."
for yml_file in config/nacos/*.yml; do
    [ -f "$yml_file" ] || continue
    dataId_with_ext="$(basename "$yml_file")"
    dataId_no_ext="${dataId_with_ext%.yml}"

    substituted_content=$(python3 -c '
import os, sys, re
env = dict(os.environ)
with open(sys.argv[1], "r", encoding="utf-8") as f:
    text = f.read()
text = re.sub(r"\$\{([A-Z0-9_]+):-?([^}]*)\}", lambda m: env.get(m.group(1), m.group(2)), text)
text = re.sub(r"\$\{([A-Z0-9_]+)\}", lambda m: env.get(m.group(1), ""), text)
sys.stdout.write(text)
' "$yml_file")

    # Publish with .yml extension
    curl -s -X POST "http://127.0.0.1:8848/nacos/v1/cs/configs" \
        -d "tenant=linmour" \
        -d "dataId=${dataId_with_ext}" \
        -d "group=DEFAULT_GROUP" \
        -d "type=yaml" \
        --data-urlencode "content=${substituted_content}" >/dev/null 2>&1 || true

    # Also publish without .yml extension for microservice application names
    if [[ "$dataId_no_ext" == linmour-* ]]; then
        curl -s -X POST "http://127.0.0.1:8848/nacos/v1/cs/configs" \
            -d "tenant=linmour" \
            -d "dataId=${dataId_no_ext}" \
            -d "group=DEFAULT_GROUP" \
            -d "type=yaml" \
            --data-urlencode "content=${substituted_content}" >/dev/null 2>&1 || true
    fi
    echo "  [OK] Nacos config published: ${dataId_with_ext}"
done

echo ""
echo "=== 2. Starting Microservices ==="
SERVICES=(
    "linmour-system:linmour-system-module/linmour-system/target/linmour-system.jar"
    "linmour-product:linmour-product-module/linmour-product/target/linmour-product.jar"
    "linmour-restaurant:linmour-restaurant-module/linmour-restaurant/target/linmour-restaurant.jar"
    "linmour-order:linmour-order-module/linmour-order/target/linmour-order.jar"
    "linmour-websocket:linmour-websocket/target/linmour-websocket.jar"
    "linmour-dataAnaly:linmour-dataAnaly-module/linmour-dataAnaly/target/linmour-dataAnaly.jar"
    "linmour-gateway:linmour-gateway/target/linmour-gateway.jar"
)

JVM_OPTS="-Xms128m -Xmx256m -Dspring.cloud.nacos.discovery.ip=127.0.0.1"

touch .service_pids

for item in "${SERVICES[@]}"; do
    NAME="${item%%:*}"
    JAR="${item##*:}"
    
    # Check if already running
    if pgrep -f "$JAR" >/dev/null 2>&1; then
        echo "[$NAME] is already running."
    else
        echo "Starting [$NAME] from $JAR ..."
        EXTRA_OPTS=""
        if [ "$NAME" = "linmour-order" ] && [ "${PAYOS_MOCK:-false}" = "true" ]; then
            EXTRA_OPTS="-Dpayos.mock=true"
        fi
        nohup "$JAVA_BIN" $JVM_OPTS $EXTRA_OPTS -jar "$JAR" > "logs/${NAME}.log" 2>&1 &
        PID=$!
        echo "$PID $NAME" >> .service_pids
        echo "[$NAME] started with PID $PID. Logs: logs/${NAME}.log"
        sleep 3
    fi
done

echo ""
echo "=== Deployment Completed Successfully ==="
echo "Gateway:   http://127.0.0.1:12800"
echo "Nacos:     http://127.0.0.1:8848/nacos"
echo "MySQL:     127.0.0.1:3306"
echo "Kafka:     127.0.0.1:9092"
echo "All service logs are streaming into ./logs/"

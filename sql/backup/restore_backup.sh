#!/usr/bin/env bash
set -e

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$BASE_DIR"

if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
fi

MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USERNAME="${MYSQL_USERNAME:-root}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-cheng128}"
DUMP_FILE="${BASE_DIR}/sql/backup/latest_dump.sql"

if [ ! -f "$DUMP_FILE" ]; then
    echo "LỖI: Không tìm thấy file $DUMP_FILE" >&2
    exit 1
fi

echo "=== Đang phục hồi cơ sở dữ liệu từ $DUMP_FILE ==="
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -q "^linmour-mysql$"; then
    echo "Phục hồi qua container Docker linmour-mysql..."
    docker exec -i linmour-mysql mysql -u"$MYSQL_USERNAME" -p"$MYSQL_PASSWORD" < "$DUMP_FILE"
elif command -v mysql >/dev/null 2>&1; then
    echo "Phục hồi qua mysql client..."
    mysql -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USERNAME" -p"$MYSQL_PASSWORD" < "$DUMP_FILE"
else
    echo "LỖI: Không tìm thấy client mysql hoặc docker container linmour-mysql." >&2
    exit 1
fi

echo "=== Phục hồi CSDL thành công! ==="

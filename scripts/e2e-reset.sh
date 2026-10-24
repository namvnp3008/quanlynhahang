#!/usr/bin/env bash
set -e

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BASE_DIR"

PURGE_ORDERS=0
for arg in "$@"; do
    case "$arg" in
        --purge-orders)
            PURGE_ORDERS=1
            ;;
        -h|--help)
            echo "Usage: ./scripts/e2e-reset.sh [--purge-orders]"
            echo ""
            echo "Options:"
            echo "  --purge-orders    Xoá đơn hàng/món E2E (remark LIKE 'E2E%') của shop 1 bàn 5"
            echo "                    và các giao dịch PayOS bàn 5, sau đó gọi API rebuildTodayStats & triggerDailySummary."
            echo "                    Mặc định tắt (chỉ reset giỏ bàn 5 & merchant E2E mới đăng ký)."
            exit 0
            ;;
        *)
            ;;
    esac
done

# Capture CLI overrides if explicitly provided
CLI_MYSQL_HOST="$MYSQL_HOST"
CLI_REDIS_HOST="$REDIS_HOST"

# 1. Nạp biến môi trường từ .env nếu có
if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
elif [ -f "$BASE_DIR/../.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$BASE_DIR/../.env"
    set +a
fi

[ -n "$CLI_MYSQL_HOST" ] && MYSQL_HOST="$CLI_MYSQL_HOST"
[ -n "$CLI_REDIS_HOST" ] && REDIS_HOST="$CLI_REDIS_HOST"

MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USERNAME="${MYSQL_USERNAME:-root}"
if [ -z "$MYSQL_PASSWORD" ]; then
    echo "LỖI: MYSQL_PASSWORD chưa được thiết lập. Vui lòng thiết lập trong .env (xem .env.example)." >&2
    exit 1
fi
MYSQL_PASSWORD="${MYSQL_PASSWORD}"

REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"
REDIS_DATABASE="${REDIS_DATABASE:-2}"

# 2. Kiểm tra an toàn: CHỈ chạy với DB / Redis local
if [ "$MYSQL_HOST" != "127.0.0.1" ] && [ "$MYSQL_HOST" != "localhost" ]; then
    echo "LỖI: scripts/e2e-reset.sh chỉ chạy với DB local (từ chối vì MYSQL_HOST=$MYSQL_HOST)." >&2
    exit 1
fi
if [ "$REDIS_HOST" != "127.0.0.1" ] && [ "$REDIS_HOST" != "localhost" ]; then
    echo "LỖI: scripts/e2e-reset.sh chỉ chạy với Redis local (từ chối vì REDIS_HOST=$REDIS_HOST)." >&2
    exit 1
fi

echo "=========================================================="
echo "          QUANLYNHAHANG - E2E DATA RESET SCRIPT           "
echo "=========================================================="
echo "Môi trường: local"
echo "MySQL:      $MYSQL_HOST:$MYSQL_PORT (user: $MYSQL_USERNAME)"
echo "Redis:      $REDIS_HOST:$REDIS_PORT (DB: $REDIS_DATABASE)"
echo ""

# Helper gọi MySQL query
run_mysql() {
    local sql="$1"
    if command -v mysql >/dev/null 2>&1; then
        mysql -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USERNAME" -p"$MYSQL_PASSWORD" -s -N -e "$sql" 2>/dev/null
    elif command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -q "^linmour-mysql$"; then
        docker exec linmour-mysql mysql -u"$MYSQL_USERNAME" -p"$MYSQL_PASSWORD" -s -N -e "$sql" 2>/dev/null
    else
        echo "LỖI: Không tìm thấy client mysql hoặc docker container linmour-mysql." >&2
        exit 1
    fi
}

# 3. Dọn dẹp Merchant E2E (real_name LIKE 'E2E %') và các quán của họ
echo "--- 1. Quét & Xoá Merchant E2E (real_name LIKE 'E2E %') ---"
MERCHANTS_RAW=$(run_mysql "SELECT id, real_name, phone FROM lsc_system.system_merchant WHERE real_name LIKE 'E2E %';")

MERCHANT_IDS=()
DELETED_MERCHANT_COUNT=0
DELETED_SHOP_COUNT=0

if [ -n "$MERCHANTS_RAW" ]; then
    while IFS=$'\t' read -r m_id m_name m_phone; do
        [ -z "$m_id" ] && continue
        MERCHANT_IDS+=("$m_id")
        echo "  [FOUND] Merchant E2E: ID=$m_id, Tên='$m_name', SĐT=$m_phone"
        
        # Tìm các quán của merchant này
        SHOPS_RAW=$(run_mysql "SELECT id, name FROM lsc_system.system_shop WHERE merchant_id = $m_id;")
        if [ -n "$SHOPS_RAW" ]; then
            while IFS=$'\t' read -r s_id s_name; do
                [ -z "$s_id" ] && continue
                echo "    -> Quán của merchant: ID=$s_id, Tên='$s_name'"
                run_mysql "DELETE FROM lsc_system.shop_payment_config WHERE shop_id = $s_id;"
                run_mysql "DELETE FROM lsc_system.system_shop WHERE id = $s_id;"
                echo "    -> [DELETED] Đã xoá quán ID=$s_id"
                DELETED_SHOP_COUNT=$((DELETED_SHOP_COUNT + 1))
            done <<< "$SHOPS_RAW"
        fi
        
        # Xoá merchant
        run_mysql "DELETE FROM lsc_system.system_merchant WHERE id = $m_id;"
        echo "  -> [DELETED] Đã xoá merchant ID=$m_id"
        DELETED_MERCHANT_COUNT=$((DELETED_MERCHANT_COUNT + 1))
    done <<< "$MERCHANTS_RAW"
else
    echo "  (Không có merchant E2E nào tồn tại trong MySQL)"
fi

echo ""
echo "--- 2. Dọn dẹp Redis DB $REDIS_DATABASE (Bàn 5 Shop 1 & cache merchant) ---"

# Chạy Python script xử lý dọn dẹp Redis an toàn
python3 - "$REDIS_HOST" "$REDIS_PORT" "$REDIS_PASSWORD" "$REDIS_DATABASE" "${MERCHANT_IDS[@]}" << 'EOF'
import sys

redis_host = sys.argv[1]
redis_port = int(sys.argv[2])
redis_password = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None
redis_db = int(sys.argv[4]) if len(sys.argv) > 4 else 2
merchant_ids = sys.argv[5:]

try:
    import redis
    r = redis.Redis(host=redis_host, port=redis_port, password=redis_password, db=redis_db, decode_responses=True)
    r.ping()
except Exception as e:
    print(f"  [ERROR] Không thể kết nối Redis: {e}")
    sys.exit(1)

deleted_keys = []

# 2.1 Bàn E2E: shop 1, bàn 5
# CHỈ xoá ĐÚNG TÊN KEY (không dùng wildcard tránh ảnh hưởng bàn 50..59 hoặc key khác trong Redis DB chia sẻ)
exact_table_keys = [
    "orderInfo:1:5",
    "orderItem:1:5",
    "payos:table:1:5",
    "lock:payos:create:1:5",
    "lock:checkout:1:5",
    "lock:order:1:5",
    "cart:1:5",
    "cartHistory:1:5",
]

for key in exact_table_keys:
    if r.exists(key) and key not in deleted_keys:
        r.delete(key)
        deleted_keys.append(key)

# 2.2 Cache của merchant E2E: merchant:shops:<id> và login:<id> / login:<id>:*
for mid in merchant_ids:
    for k in [f"merchant:shops:{mid}", f"login:{mid}"]:
        if r.exists(k) and k not in deleted_keys:
            r.delete(k)
            deleted_keys.append(k)
    for k in r.scan_iter(f"login:{mid}:*"):
        if k not in deleted_keys:
            r.delete(k)
            deleted_keys.append(k)

if deleted_keys:
    print(f"  Đã xoá {len(deleted_keys)} key(s) trong Redis DB {redis_db}:")
    for k in sorted(deleted_keys):
        print(f"    - {k}")
else:
    print(f"  (Không có key nào của bàn 5 shop 1 hoặc merchant E2E trong Redis DB {redis_db})")
EOF

# 4. Tuỳ chọn --purge-orders: Xoá đơn E2E shop 1 bàn 5 và đồng bộ lại thống kê
if [ "$PURGE_ORDERS" -eq 1 ]; then
    echo ""
    echo "--- 3. Purge đơn E2E shop 1 bàn 5 (--purge-orders) ---"

    E2E_ORDER_COUNT=$(run_mysql "SELECT COUNT(*) FROM lsc_order.order_info WHERE shop_id = 1 AND table_id = 5 AND remark LIKE 'E2E%';")
    E2E_ITEM_COUNT=$(run_mysql "SELECT COUNT(*) FROM lsc_order.order_item oi JOIN lsc_order.order_info o ON oi.order_id = o.id WHERE o.shop_id = 1 AND o.table_id = 5 AND o.remark LIKE 'E2E%';")
    E2E_TX_COUNT=$(run_mysql "SELECT COUNT(*) FROM lsc_order.payos_transaction WHERE shop_id = 1 AND table_id = 5;")

    echo "  [FOUND] Đơn E2E shop 1 bàn 5:     $E2E_ORDER_COUNT đơn, $E2E_ITEM_COUNT món"
    echo "  [FOUND] Giao dịch PayOS bàn 5:    $E2E_TX_COUNT giao dịch"

    TX_ORDER_CODES_RAW=$(run_mysql "SELECT order_code FROM lsc_order.payos_transaction WHERE shop_id = 1 AND table_id = 5;")

    if [ "${E2E_ITEM_COUNT:-0}" -gt 0 ]; then
        run_mysql "USE lsc_order; DELETE oi FROM order_item oi JOIN order_info o ON oi.order_id = o.id WHERE o.shop_id = 1 AND o.table_id = 5 AND o.remark LIKE 'E2E%';"
        echo "  -> [DELETED] Đã xoá $E2E_ITEM_COUNT order_item E2E"
    fi

    if [ "${E2E_ORDER_COUNT:-0}" -gt 0 ]; then
        run_mysql "USE lsc_order; DELETE FROM order_info WHERE shop_id = 1 AND table_id = 5 AND remark LIKE 'E2E%';"
        echo "  -> [DELETED] Đã xoá $E2E_ORDER_COUNT order_info E2E"
    fi

    if [ "${E2E_TX_COUNT:-0}" -gt 0 ]; then
        run_mysql "USE lsc_order; DELETE FROM payos_transaction WHERE shop_id = 1 AND table_id = 5;"
        echo "  -> [DELETED] Đã xoá $E2E_TX_COUNT payos_transaction bàn 5"
    fi

    if [ -n "$TX_ORDER_CODES_RAW" ]; then
        python3 - "$REDIS_HOST" "$REDIS_PORT" "$REDIS_PASSWORD" "$REDIS_DATABASE" $TX_ORDER_CODES_RAW << 'EOF'
import sys
redis_host = sys.argv[1]
redis_port = int(sys.argv[2])
redis_password = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None
redis_db = int(sys.argv[4]) if len(sys.argv) > 4 else 2
order_codes = sys.argv[5:]

try:
    import redis
    r = redis.Redis(host=redis_host, port=redis_port, password=redis_password, db=redis_db, decode_responses=True)
    deleted = 0
    for code in order_codes:
        k = f"payos:order:{code}"
        if r.exists(k):
            r.delete(k)
            deleted += 1
    if deleted > 0:
        print(f"  -> [DELETED] Đã xoá {deleted} key payos:order:<order_code> trong Redis DB {redis_db}")
except Exception as e:
    print(f"  [WARN] Lỗi khi dọn Redis payos:order keys: {e}")
EOF
    fi

    GATEWAY_URL="${GATEWAY_URL:-http://127.0.0.1:12800}"
    echo "  -> Đăng nhập admin API ($GATEWAY_URL/system/merchant/login)..."
    LOGIN_RESP=$(curl -s -X POST "$GATEWAY_URL/system/merchant/login" \
        -H "Content-Type: application/json" \
        -d '{"phone":"2","password":"123"}' 2>/dev/null || true)

    ADMIN_TOKEN=$(echo "$LOGIN_RESP" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if data.get('code') == 200 and 'data' in data and 'token' in data['data']:
        print(data['data']['token'])
except Exception:
    pass
" 2>/dev/null || true)

    if [ -z "$ADMIN_TOKEN" ]; then
        echo "  [WARN] Không thể lấy admin token từ API. Vui lòng đảm bảo các dịch vụ backend đang chạy."
    else
        echo "  -> Đăng nhập admin thành công."
        echo "  -> Gọi API rebuildTodayStats?shopId=1..."
        curl -s -X POST "$GATEWAY_URL/dataAnaly/analysis/rebuildTodayStats?shopId=1" \
            -H "token: $ADMIN_TOKEN" >/dev/null 2>&1 || true
        echo "  -> Gọi API triggerDailySummary?date=all..."
        curl -s -X POST "$GATEWAY_URL/dataAnaly/analysis/triggerDailySummary?date=all" \
            -H "token: $ADMIN_TOKEN" >/dev/null 2>&1 || true
        echo "  -> [OK] Đã cập nhật lại số liệu thống kê cho shop 1"
    fi
fi

echo ""
echo "=========================================================="
echo "           RESET HOÀN TẤT THÀNH CÔNG                      "
echo "  - Merchant E2E đã xoá: $DELETED_MERCHANT_COUNT"
echo "  - Quán E2E đã xoá:     $DELETED_SHOP_COUNT"
echo "  - Bàn 5 shop 1:        Đã dọn sạch giỏ & link cũ"
if [ "$PURGE_ORDERS" -eq 1 ]; then
    echo "  - Đơn E2E đã xoá:      ${E2E_ORDER_COUNT:-0}"
    echo "  - Món E2E đã xoá:      ${E2E_ITEM_COUNT:-0}"
    echo "  - PayOS tx bàn 5:      ${E2E_TX_COUNT:-0}"
    echo "  - Thống kê shop 1:     Đã đồng bộ lại qua API"
else
    echo "  - Đơn đã thanh toán:   Được giữ nguyên (dùng --purge-orders để dọn đơn E2E)"
fi
echo "=========================================================="

#!/usr/bin/env bash
set -e

ORDER_CODE="${1}"
AMOUNT="${2}"
CHECKSUM_KEY="${3:-check-9999}"
TARGET_URL="${PAYOS_WEBHOOK_URL:-http://127.0.0.1:12800/app/order/order/payos/webhook}"

if [ -z "$ORDER_CODE" ] || [ -z "$AMOUNT" ]; then
    echo "Sử dụng: $0 <orderCode> <amount> [checksumKey]"
    echo "Ví dụ: $0 179268691837 50000 check-9999"
    exit 1
fi

python3 -c '
import sys, json, hmac, hashlib, time, urllib.request

order_code = int(sys.argv[1])
amount = int(sys.argv[2])
checksum_key = sys.argv[3]
target_url = sys.argv[4]

data = {
    "orderCode": order_code,
    "amount": amount,
    "description": f"Thanh toan don hang #{order_code % 10000}",
    "accountNumber": "12345678",
    "reference": f"REF_{int(time.time())}",
    "transactionDateTime": time.strftime("%Y-%m-%d %H:%M:%S"),
    "currency": "VND",
    "paymentLinkId": f"link_{int(time.time())}",
    "code": "00",
    "desc": "Thành công",
    "counterAccountBankId": "",
    "counterAccountBankName": "",
    "counterAccountName": "",
    "counterAccountNumber": "",
    "virtualAccountName": "",
    "virtualAccountNumber": ""
}

# Sắp xếp các trường data theo thứ tự bảng chữ cái để tạo chuỗi ký
sorted_keys = sorted(data.keys())
query_parts = []
for k in sorted_keys:
    val = data[k]
    val_str = "" if val is None else str(val)
    query_parts.append(f"{k}={val_str}")
query_string = "&".join(query_parts)

signature = hmac.new(checksum_key.encode("utf-8"), query_string.encode("utf-8"), hashlib.sha256).hexdigest()

payload = {
    "code": "00",
    "desc": "success",
    "success": True,
    "data": data,
    "signature": signature
}

req_data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
req = urllib.request.Request(target_url, data=req_data, headers={"Content-Type": "application/json"})

print(f"-> Gửi webhook giả lập tới {target_url} cho orderCode={order_code}, amount={amount}đ ...")
try:
    with urllib.request.urlopen(req, timeout=10) as response:
        status_code = response.getcode()
        resp_text = response.read().decode("utf-8")
        print(f"<- Phản hồi HTTP {status_code}: {resp_text}")
except urllib.error.HTTPError as e:
    err_body = e.read().decode("utf-8")
    print(f"<- Lỗi HTTP {e.code}: {err_body}")
    sys.exit(1)
except Exception as e:
    print(f"<- Lỗi kết nối: {e}")
    sys.exit(1)
' "$ORDER_CODE" "$AMOUNT" "$CHECKSUM_KEY" "$TARGET_URL"

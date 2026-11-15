"""Publish config/nacos/*.yml lên Nacos (bản Docker của đoạn tương ứng trong start-all-services.sh).

- Tạo namespace "linmour" (bỏ qua nếu đã có).
- Thay ${VAR} / ${VAR:-default} bằng biến môi trường.
- Publish mỗi file với dataId có ".yml" và, với linmour-*, cả dataId không đuôi.
Chỉ dùng thư viện chuẩn. Không in nội dung config (có secret).
"""
import glob
import os
import re
import sys
import time
import urllib.parse
import urllib.request

NACOS = os.environ.get("NACOS_ADDR", "http://nacos:8848").rstrip("/")
NAMESPACE = os.environ.get("NACOS_NAMESPACE", "linmour")
CONFIG_DIR = os.environ.get("NACOS_CONFIG_DIR", "/config")


def post(path, fields):
    data = urllib.parse.urlencode(fields).encode("utf-8")
    req = urllib.request.Request(NACOS + path, data=data, method="POST")
    with urllib.request.urlopen(req, timeout=10) as resp:
        return resp.read().decode("utf-8", "replace")


def wait_for_nacos():
    for _ in range(90):
        try:
            with urllib.request.urlopen(NACOS + "/nacos/v1/console/server/state", timeout=5) as resp:
                if resp.status == 200:
                    return
        except Exception:
            pass
        time.sleep(2)
    sys.exit("Nacos không sẵn sàng sau 180s")


def substitute(text):
    env = os.environ
    text = re.sub(r"\$\{([A-Z0-9_]+):-?([^}]*)\}", lambda m: env.get(m.group(1), m.group(2)), text)
    text = re.sub(r"\$\{([A-Z0-9_]+)\}", lambda m: env.get(m.group(1), ""), text)
    return text


def main():
    wait_for_nacos()
    try:
        post("/nacos/v1/console/namespaces",
             {"customNamespaceId": NAMESPACE, "namespaceName": NAMESPACE, "namespaceDesc": "Linmour"})
    except Exception as exc:  # namespace đã tồn tại → Nacos có thể trả lỗi, bỏ qua
        print("namespace: %s" % exc.__class__.__name__)

    files = sorted(glob.glob(os.path.join(CONFIG_DIR, "*.yml")))
    if not files:
        sys.exit("Không tìm thấy file config trong %s" % CONFIG_DIR)

    failed = 0
    for path in files:
        name = os.path.basename(path)
        with open(path, "r", encoding="utf-8") as fh:
            content = substitute(fh.read())
        data_ids = [name]
        if name.startswith("linmour-"):
            data_ids.append(name[:-len(".yml")])
        for data_id in data_ids:
            result = post("/nacos/v1/cs/configs", {
                "tenant": NAMESPACE, "dataId": data_id, "group": "DEFAULT_GROUP",
                "type": "yaml", "content": content,
            })
            ok = result.strip() == "true"
            failed += 0 if ok else 1
            print("[%s] %s" % ("OK" if ok else "FAIL", data_id))
    if failed:
        sys.exit("%d config publish thất bại" % failed)


if __name__ == "__main__":
    main()

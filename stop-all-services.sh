#!/bin/bash

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$BASE_DIR"

echo "=== Stopping Microservices ==="
SERVICES=(
    "linmour-system.jar"
    "linmour-product.jar"
    "linmour-restaurant.jar"
    "linmour-order.jar"
    "linmour-websocket.jar"
    "linmour-dataAnaly.jar"
    "linmour-gateway.jar"
)

for JAR in "${SERVICES[@]}"; do
    PIDS=$(pgrep -f "$JAR" || true)
    if [ -n "$PIDS" ]; then
        echo "Killing $JAR (PIDs: $PIDS)..."
        kill -9 $PIDS 2>/dev/null || true
    fi
done

rm -f .service_pids
echo "All microservices stopped."

if [ "$1" == "--infra" ] || [ "$1" == "-a" ] || [ "$1" == "--all" ]; then
    echo "=== Stopping Infrastructure Containers ==="
    docker-compose -f docker-compose-infra.yml down
fi

#!/usr/bin/env bash
# Стенд с выдуманными данными: бэкенд :8100, vite :5180, временная база и UPLOAD_DIR.
# stand.sh [dir]  — поднять (по умолчанию mktemp -d); stand.sh stop [dir] — погасить только свои процессы.
# Ключей моделей Meta стенд не использует: MODEL_* заглушки, SESSION_SECRET случайный.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STATE="${STAND_STATE:-/tmp/mentorium-stand-state}"  # путь к каталогу стенда лежит здесь

if [ "${1:-}" = "stop" ]; then
  D="${2:-$(cat "$STATE" 2>/dev/null || true)}"
  [ -n "$D" ] && [ -d "$D" ] || { echo "стенд не найден"; exit 0; }
  for n in backend vite; do
    if [ -f "$D/$n.pid" ]; then
      pid="$(cat "$D/$n.pid")"
      # группа процессов, запущенная setsid: гасим только её
      kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
      rm -f "$D/$n.pid"
    fi
  done
  echo "стенд погашен: $D"
  exit 0
fi

D="${1:-$(mktemp -d)}"
mkdir -p "$D"
echo "$D" > "$STATE"
export DATABASE_URL="sqlite:///$D/studio.db" UPLOAD_DIR="$D/uploads"
export MODEL_API_KEY=stand MODEL_TEXT=stand MODEL_IMAGE=stand MODEL_SAM=stand MODEL_ASR=stand
export SESSION_SECRET="$(head -c 24 /dev/urandom | base64 | tr -d '/+=\n')$(date +%s%N)"

(cd "$ROOT/backend" && uv run python scripts/seed_demo.py --out "$D/seed.json" > /dev/null)
cd "$ROOT/backend"
setsid uv run uvicorn app.main:app --port 8100 > "$D/backend.log" 2>&1 < /dev/null &
echo $! > "$D/backend.pid"
cd "$ROOT/frontend"
setsid pnpm dev > "$D/vite.log" 2>&1 < /dev/null &
echo $! > "$D/vite.pid"

for _ in $(seq 1 60); do
  curl -sf http://127.0.0.1:8100/api/health >/dev/null 2>&1 && break
  sleep 0.5
done
echo "стенд: http://127.0.0.1:5180  api: :8100  каталог: $D  логины: $D/seed.json"

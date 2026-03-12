#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEB_PID=""
DESKTOP_PID=""

cleanup() {
  if [[ -n "${DESKTOP_PID}" ]]; then
    kill "${DESKTOP_PID}" 2>/dev/null || true
  fi

  if [[ -n "${WEB_PID}" ]]; then
    kill "${WEB_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

cd "${ROOT_DIR}/packages/web"
bun run dev -- --host 127.0.0.1 --port 5173 &
WEB_PID=$!

for _ in $(seq 1 120); do
  if curl --silent --fail http://127.0.0.1:5173 >/dev/null 2>&1; then
    break
  fi

  sleep 0.25
done

curl --silent --fail http://127.0.0.1:5173 >/dev/null 2>&1

cd "${ROOT_DIR}/packages/desktop"
RIMUN_DEV_SERVER_URL="http://127.0.0.1:5173" \
RIMUN_DEV_WORKSPACE_ROOT="${ROOT_DIR}" \
bun run dev &
DESKTOP_PID=$!

wait "${DESKTOP_PID}"


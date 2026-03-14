#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=./common-env.sh
source "${ROOT_DIR}/tools/common-env.sh"
WEB_PID=""
DESKTOP_PID=""
HOST_PID=""
REQUIRED_LINUX_WEBKIT_LIBRARY="libwebkit2gtk-4.1.so.0"
DEV_MODE="$(printf '%s' "${RIMUN_DEV_MODE:-auto}" | tr '[:upper:]' '[:lower:]')"
DEV_HOST_PORT="${RIMUN_DEV_HOST_PORT:-3070}"
CEF_AUTOMATION_ENABLED="${RIMUN_ENABLE_CEF_AUTOMATION:-0}"

cleanup() {
  if [[ -n "${DESKTOP_PID}" ]]; then
    kill "${DESKTOP_PID}" 2>/dev/null || true
  fi

  if [[ -n "${HOST_PID}" ]]; then
    kill "${HOST_PID}" 2>/dev/null || true
  fi

  if [[ -n "${WEB_PID}" ]]; then
    kill "${WEB_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

should_launch_desktop() {
  case "${DEV_MODE}" in
    auto|web|desktop) ;;
    *)
      echo "Unsupported RIMUN_DEV_MODE: ${DEV_MODE}. Expected auto, web, or desktop." >&2
      exit 1
      ;;
  esac

  if [[ "${DEV_MODE}" == "web" ]]; then
    echo "RIMUN_DEV_MODE=web, skipping desktop shell."
    return 1
  fi

  if [[ "$(uname -s)" == "Linux" && "${CEF_AUTOMATION_ENABLED}" == "1" ]]; then
    return 0
  fi

  if [[ "$(uname -s)" != "Linux" ]]; then
    return 0
  fi

  if command -v ldconfig >/dev/null 2>&1 && ldconfig -p 2>/dev/null | grep -q "${REQUIRED_LINUX_WEBKIT_LIBRARY}"; then
    return 0
  fi

  local message="Linux desktop runtime requires ${REQUIRED_LINUX_WEBKIT_LIBRARY}. Install the system package first, or run with RIMUN_DEV_MODE=web."

  if [[ "${DEV_MODE}" == "desktop" ]]; then
    echo "${message}" >&2
    exit 1
  fi

  echo "${message} Falling back to web-only dev mode."
  return 1
}

prepare_cef_automation_env() {
  mkdir -p \
    "${RIMUN_CEF_STATE_ROOT}/home/.config/rimun" \
    "${RIMUN_CEF_STATE_ROOT}/home/.cache" \
    "${RIMUN_CEF_STATE_ROOT}/home/.cache/sh.blackboard.rimun/dev/CEF" \
    "${RIMUN_CEF_STATE_ROOT}/home/.cache/sh.blackboard.rimun/dev/CEF/Partitions/default" \
    "${RIMUN_CEF_STATE_ROOT}/home/.pki/nssdb" \
    "${RIMUN_CEF_STATE_ROOT}/runtime"
  chmod 700 "${RIMUN_CEF_STATE_ROOT}/runtime"
}

cd "${ROOT_DIR}/packages/web"
RIMUN_DEV_HOST_PORT="${DEV_HOST_PORT}" \
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
RIMUN_DEV_HOST_PORT="${DEV_HOST_PORT}" bun run dev:host &
HOST_PID=$!

for _ in $(seq 1 120); do
  if curl --silent --fail "http://127.0.0.1:${DEV_HOST_PORT}/health" >/dev/null 2>&1; then
    break
  fi

  sleep 0.25
done

curl --silent --fail "http://127.0.0.1:${DEV_HOST_PORT}/health" >/dev/null 2>&1

if ! should_launch_desktop; then
  wait "${WEB_PID}"
  exit $?
fi

if [[ "$(uname -s)" == "Linux" && "${CEF_AUTOMATION_ENABLED}" == "1" ]]; then
  prepare_cef_automation_env

  HOME="${RIMUN_CEF_STATE_ROOT}/home" \
  XDG_CONFIG_HOME="${RIMUN_CEF_STATE_ROOT}/home/.config" \
  XDG_CACHE_HOME="${RIMUN_CEF_STATE_ROOT}/home/.cache" \
  XDG_RUNTIME_DIR="${RIMUN_CEF_STATE_ROOT}/runtime" \
  CHROME_CONFIG_HOME="${RIMUN_CEF_STATE_ROOT}/home/.config" \
  CHROME_USER_DATA_DIR="${RIMUN_CEF_STATE_ROOT}/home/.config/rimun" \
  RIMUN_DEV_SERVER_URL="http://127.0.0.1:5173" \
  RIMUN_DEV_WORKSPACE_ROOT="${ROOT_DIR}" \
  bun run dev &
else
  RIMUN_DEV_SERVER_URL="http://127.0.0.1:5173" \
  RIMUN_DEV_WORKSPACE_ROOT="${ROOT_DIR}" \
  bun run dev &
fi

DESKTOP_PID=$!

wait "${DESKTOP_PID}"

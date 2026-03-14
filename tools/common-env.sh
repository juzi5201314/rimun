#!/usr/bin/env bash
set -euo pipefail

RIMUN_TMP_ROOT="${RIMUN_TMP_ROOT:-${BUN_TMPDIR:-/tmp}}"

export BUN_TMPDIR="${BUN_TMPDIR:-${RIMUN_TMP_ROOT}}"
export BUN_INSTALL="${BUN_INSTALL:-${RIMUN_TMP_ROOT}/bun-install}"
export RIMUN_CEF_STATE_ROOT="${RIMUN_CEF_STATE_ROOT:-${RIMUN_TMP_ROOT}/rimun-cef-automation}"
export RIMUN_WEB_PORT="${RIMUN_WEB_PORT:-5173}"
export RIMUN_DEV_SERVER_URL="${RIMUN_DEV_SERVER_URL:-http://127.0.0.1:${RIMUN_WEB_PORT}}"

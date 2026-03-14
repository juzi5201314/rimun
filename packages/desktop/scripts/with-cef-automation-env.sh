#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

# shellcheck source=../../../tools/common-env.sh
source "${ROOT_DIR}/tools/common-env.sh"

CEF_HOME="${RIMUN_CEF_STATE_ROOT}/home"
CEF_RUNTIME_DIR="${RIMUN_CEF_STATE_ROOT}/runtime"

mkdir -p \
  "${CEF_HOME}/.config/rimun" \
  "${CEF_HOME}/.cache/sh.blackboard.rimun/dev/CEF/Partitions/default" \
  "${CEF_HOME}/.pki/nssdb" \
  "${CEF_RUNTIME_DIR}"

chmod 700 "${CEF_RUNTIME_DIR}"

export HOME="${CEF_HOME}"
export XDG_CONFIG_HOME="${CEF_HOME}/.config"
export XDG_CACHE_HOME="${CEF_HOME}/.cache"
export XDG_RUNTIME_DIR="${CEF_RUNTIME_DIR}"
export CHROME_CONFIG_HOME="${CEF_HOME}/.config"
export CHROME_USER_DATA_DIR="${CEF_HOME}/.config/rimun"
export RIMUN_ENABLE_CEF_AUTOMATION=1
export RIMUN_CDP_PORT="${RIMUN_CDP_PORT:-9222}"

exec electrobun "$@"

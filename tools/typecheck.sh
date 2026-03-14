#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=./common-env.sh
source "${ROOT_DIR}/tools/common-env.sh"

cd "${ROOT_DIR}/packages/shared"
bun run check

cd "${ROOT_DIR}/packages/domain"
bun run check

cd "${ROOT_DIR}/packages/desktop"
bun run check

cd "${ROOT_DIR}/packages/web"
bun run check

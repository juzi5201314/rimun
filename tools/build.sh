#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "${ROOT_DIR}/packages/web"
bun run build

cd "${ROOT_DIR}/packages/desktop"
bun run build


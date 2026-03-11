#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== Trinity Deploy ==="

# 1. Next.js
echo "[1/4] Building Next.js..."
rm -rf .next
npx next build > /dev/null 2>&1

# 2. Elixir release
echo "[2/4] Building Elixir release..."
(cd backend && MIX_ENV=prod mix release --overwrite > /dev/null 2>&1)

# 3. Electron
echo "[3/4] Compiling & packaging Electron..."
npx tsc -p electron/tsconfig.json
npx electron-builder --mac 2>&1 | grep -E "^  •" | tail -3

# 4. Install
echo "[4/4] Installing to /Applications..."
rm -rf /Applications/Trinity.app
cp -R dist-electron/mac-arm64/Trinity.app /Applications/

echo ""
echo "=== Done! Trinity.app 已更新 ==="

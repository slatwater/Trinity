#!/bin/bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

echo "=== Building Trinity Desktop ==="

# 1. Build Elixir release
echo "[1/4] Building Elixir release..."
(cd backend && MIX_ENV=prod mix deps.get --only prod && MIX_ENV=prod mix release --overwrite)

# 2. Build Next.js standalone
echo "[2/4] Building Next.js..."
rm -rf .next
npm run build:next

# 3. Compile Electron TypeScript
echo "[3/4] Compiling Electron..."
npx tsc -p electron/tsconfig.json

# 4. Package with electron-builder
echo "[4/4] Packaging macOS app..."
npx electron-builder --mac

echo ""
echo "=== Done! Output in dist-electron/ ==="
ls -lh dist-electron/*.dmg 2>/dev/null || echo "(no dmg found)"

#!/bin/zsh
ROOT="$(cd "$(dirname "$0")" && pwd)"
NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
TSC="$ROOT/node_modules/typescript/bin/tsc"
TSX="$ROOT/node_modules/tsx/dist/cli.mjs"

fetch_esbuild() {
  local VERSION="$1" DEST="$2"
  local TMP="$(mktemp -d)"
  if curl -fsSL "https://registry.npmjs.org/@esbuild/darwin-arm64/-/darwin-arm64-${VERSION}.tgz" -o "$TMP/pkg.tgz"; then
    tar -xzf "$TMP/pkg.tgz" -C "$TMP"
    rm -rf "$DEST"
    mkdir -p "$(dirname "$DEST")"
    mv "$TMP/package" "$DEST"
    chmod +x "$DEST/bin/esbuild" 2>/dev/null
    echo "  OK: @esbuild/darwin-arm64@${VERSION} -> $DEST"
  else
    echo "  下载失败: ${VERSION}"
  fi
  rm -rf "$TMP"
}

echo "[0/4] 修复 esbuild 原生二进制版本 (root=0.25.12, tsx 私有=0.28.2) ..."
fetch_esbuild "0.25.12" "$ROOT/node_modules/@esbuild/darwin-arm64"
fetch_esbuild "0.28.2"  "$ROOT/node_modules/tsx/node_modules/@esbuild/darwin-arm64"

if [ ! -x "$NODE" ]; then
  echo "找不到可用的 Node ($NODE)，无法启动。"
  exit 1
fi

echo "[1/4] 构建 core ..."
(cd "$ROOT/packages/core" && "$NODE" "$TSC") || { echo "core 构建失败"; exit 1; }

echo "[2/4] Web 类型检查 ..."
(cd "$ROOT/packages/desktop" && "$NODE" "$TSC" -p tsconfig.web.json) || { echo "类型检查失败"; exit 1; }

echo "[3/4] 启动开发服务器 ..."
cd "$ROOT"
"$NODE" "$TSX" packages/desktop/web/server.ts --dev

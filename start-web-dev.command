#!/bin/zsh
ROOT="$(cd "$(dirname "$0")" && pwd)"
NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
TSC="$ROOT/node_modules/typescript/bin/tsc"

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

echo "[2/4] 构建本地 web 服务器 (medscience-web) ..."
(cd "$ROOT/packages/web" && "$NODE" "$TSC") || { echo "web 服务器构建失败"; exit 1; }

echo "[3/4] 启动开发服务器 ..."
cd "$ROOT"
"$NODE" packages/web/bin/medscience-web.js --dev

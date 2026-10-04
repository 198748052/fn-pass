#!/bin/bash
# PassVault 源码构建脚本：编译多架构静态二进制、同步前端资源并打包为 .fpk
# 依赖：Go 1.24+（使用标准库 crypto/pbkdf2）、fnpack
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC="$ROOT/passvault-src"
PKG="$ROOT/PassVault"
BIN_DIR="$PKG/app/server"
WWW_DIR="$PKG/app/www"

mkdir -p "$BIN_DIR" "$WWW_DIR"
cd "$SRC"

echo "==> 编译后端（多架构）"
CGO_ENABLED=0 GOOS=linux GOARCH=amd64            go build -trimpath -ldflags "-s -w" -o "$BIN_DIR/passvault-amd64" .
CGO_ENABLED=0 GOOS=linux GOARCH=arm64            go build -trimpath -ldflags "-s -w" -o "$BIN_DIR/passvault-arm64" .
CGO_ENABLED=0 GOOS=linux GOARCH=arm GOARM=7      go build -trimpath -ldflags "-s -w" -o "$BIN_DIR/passvault-armv7" .
CGO_ENABLED=0 GOOS=linux GOARCH=386              go build -trimpath -ldflags "-s -w" -o "$BIN_DIR/passvault-386" .
chmod +x "$BIN_DIR"/*

echo "==> 同步前端资源"
cp -f "$SRC/web/index.html" "$SRC/web/app.js" "$SRC/web/styles.css" "$WWW_DIR/"

echo "==> 打包 .fpk"
( cd "$PKG" && fnpack build )

echo "完成：$PKG/*.fpk"

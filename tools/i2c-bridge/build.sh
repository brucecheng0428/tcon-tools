#!/usr/bin/env bash
# 交叉編譯 I2C Bridge 成 32 位元 Windows exe（machine 0x014c）。
# 需要 zig（用作 C 交叉編譯器）。本專案用的是 pip 套件 ziglang。
#
#   ZIG=/path/to/zig ./build.sh
#
# 產出：i2c-bridge.exe（32 位元、PE32、console、無 .NET 依賴）
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
ZIG="${ZIG:-zig}"
OUT="${1:-$DIR/i2c-bridge.exe}"

"$ZIG" cc -target x86-windows-gnu -O2 \
    "$DIR/i2c_bridge.c" \
    -o "$OUT" \
    -lws2_32 -lkernel32 -lshell32 -ladvapi32 \
    -Wl,--subsystem,console

echo "built: $OUT"

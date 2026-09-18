#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# check_raw_init.sh — raw MPSSE 的通道初始化不得出現晶片不支援的命令，
#                     且時脈換算必須走 dgh_mp_divisor()（三相與除數成對）
# ───────────────────────────────────────────────────────────────────────────
# 🔴 起因（2026-09-19，同一天連錯兩次）：
#   ① v1.11.4 把 dg-measure.html 的 WebUSB init 整份抄進 C，連 `0x9E` 一起抄。
#      `0x9E`（Open Collector / Tristate）在官方命令表上寫明 **FT232H only**，
#      而 Bruce 的治具是 PID 0x6010 ＝ **FT2232H**。未知 opcode 會讓 MPSSE 回
#      `0xFA`，**它後面的兩個參數還會被當成 opcode 繼續解析** ⇒ 整串命令流錯位、
#      資料靜默讀錯。
#   ② 同一版把 `0x8A`（60 MHz base）跟 12 MHz 的除數公式湊在一起 ⇒
#      設 400 kHz 實測量到 80 kHz。**base 與除數公式是成對的，拆開必錯。**
#
# 這兩個錯的共同點：**編得過、跑得動、只有拿示波器量才看得出來**。
# 所以釘在這裡，而不是靠「記得」。
#
# 用法：tools/check_raw_init.sh
# ═══════════════════════════════════════════════════════════════════════════
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/tools/i2c-bridge/i2c_bridge.c"
HDR="$ROOT/tools/i2c-bridge/i2c_bridge_proto.h"
bad=0

[ -f "$SRC" ] || { echo "🔴 找不到 $SRC"; exit 1; }

# ── ① 不得出現 0x9E 的送出（註解裡講它為什麼不能用是可以的）────────────────
#    只看「賦值進命令緩衝區」的形式，例如 `c[n++] = 0x9E;`
if grep -nE '^[^/*]*=[[:space:]]*0x9[eE][[:space:]]*;' "$SRC" | grep -v '^\s*\*' ; then
  echo "🔴 raw init 送了 0x9E —— 那是 FT232H only，FT2232H 收到會失步（PID 0x6010）"
  bad=$((bad+1))
fi

# ── ② 不得自己碰 divide-by-5（0x8A/0x8B）────────────────────────────────────
#    我們刻意維持 MPSSE 重置後的 12 MHz base，除數公式才對得上。
if grep -nE '^[^/*]*=[[:space:]]*0x8[aAbB][[:space:]]*;' "$SRC" | grep -v '^\s*\*' ; then
  echo "🔴 raw init 動了 divide-by-5（0x8A/0x8B）—— base 一變，除數公式就要跟著變"
  echo "   （v1.11.4 正是只改了一邊，設 400k 量到 80k）"
  bad=$((bad+1))
fi

# ── ③ 除數一定要走 dgh_mp_divisor()，不准在 .c 裡自己算 ─────────────────────
if ! grep -q 'dgh_mp_divisor' "$SRC"; then
  echo "🔴 raw init 沒有使用 dgh_mp_divisor() —— 時脈換算不可以散在各處自己算"
  bad=$((bad+1))
fi
if grep -nE '=[[:space:]]*(6000000|30000000|12000000)u?[[:space:]]*/[[:space:]]*(hz|wireHz)' "$SRC" | grep -v 'dgh_mp_divisor'; then
  echo "🔴 .c 裡出現手寫的除數算式 —— 請改用 dgh_mp_divisor()（那裡才有三相補償）"
  bad=$((bad+1))
fi

# ── ④ 換算函式本身要同時處理三相 ────────────────────────────────────────────
if ! grep -q 'threePhase' "$HDR"; then
  echo "🔴 dgh_mp_divisor() 沒有三相參數 —— 2/3 補償會消失"
  bad=$((bad+1))
fi

if [ "$bad" -ne 0 ]; then
  echo ""
  echo "🔴 raw init 檢查未通過：$bad 項"
  exit 1
fi
echo "✅ raw init 檢查通過：無 0x9E、未動 divide-by-5、除數走 dgh_mp_divisor()"

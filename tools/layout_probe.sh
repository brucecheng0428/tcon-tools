#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# layout_probe.sh — 在**真的 Chrome** 裡量版面，並在三種寬度各截一張圖
# ───────────────────────────────────────────────────────────────────────────
# 🔴 為什麼不能用 jsdom：jsdom 不做排版，getBoundingClientRect() 一律回 0。
#    「輸入格高低、位置不一樣」這種問題在 jsdom 裡**永遠是綠的**。
#
# 用法：
#   tools/layout_probe.sh <頁面.html> <輸出目錄> [寬度...]
#   例：tools/layout_probe.sh i2c.html ~/ClaudeData/i2c_layout 1920 1440 1280
#
# 產出：
#   <輸出目錄>/align-<寬度>.json   ← tools/field_align_probe.js 量到的數字
#   <輸出目錄>/shot-<寬度>.png     ← 同一個寬度下的實際畫面
#
# 做法：把頁面複製一份、把探針 <script> 接在最後面（探針會把結果寫進
# document.title），再用 headless Chrome 的 --dump-dom 把 title 取回來。
# 複製的那一份放在 repo 根目錄，否則 common/*.js 的相對路徑會失效。
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PAGE="${1:?usage: layout_probe.sh <page.html> <outdir> [widths...]}"
OUT="${2:?usage: layout_probe.sh <page.html> <outdir> [widths...]}"
shift 2
WIDTHS=("$@")
[ ${#WIDTHS[@]} -eq 0 ] && WIDTHS=(1920 1440 1280)

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || { echo "找不到 Chrome：$CHROME"; exit 2; }

mkdir -p "$OUT"
TMP="$ROOT/_tmp_layout_probe.html"
cat "$ROOT/$PAGE" > "$TMP"
{ echo '<script>'; cat "$ROOT/tools/field_align_probe.js"; echo '</script>'; } >> "$TMP"

for W in "${WIDTHS[@]}"; do
  H=$(( W * 1080 / 1920 ))
  "$CHROME" --headless --disable-gpu --no-first-run --no-default-browser-check \
      --virtual-time-budget=2500 --window-size="${W},${H}" \
      --dump-dom "file://$TMP" 2>/dev/null \
    | sed -n 's/.*<title>ALIGN\(.*\)<\/title>.*/\1/p' \
    | python3 -c 'import sys,html,json;t=sys.stdin.read().strip();print(json.dumps(json.loads(html.unescape(t)),ensure_ascii=False,indent=1) if t else "{}")' \
    > "$OUT/align-$W.json"
  "$CHROME" --headless --disable-gpu --no-first-run --no-default-browser-check \
      --virtual-time-budget=2500 --window-size="${W},${H}" \
      --screenshot="$OUT/shot-$W.png" "file://$TMP" >/dev/null 2>&1
  echo "  $W → $OUT/align-$W.json, $OUT/shot-$W.png"
done
rm -f "$TMP"

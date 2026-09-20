#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# dg_selftest_v130_shots.sh — dgself v1.3.0 的三語版面截圖（真的 Chrome，headless）
# ───────────────────────────────────────────────────────────────────────────
# 🔴 為什麼不能用 jsdom：jsdom 不做排版，也不上色。「選取態看不看得出來」「卡片
#    標題與說明會不會擠爆」只能在真的瀏覽器裡看。做法逐條沿用 dg_selftest_v120_shots.sh。
#
# 用法：tools/dg_selftest_v130_shots.sh <輸出目錄>
# 產出（每一語各一組）：
#   card-off-<lang>.png   「畫面測試」卡：全部未選取（對位鈕是暗的）
#   card-on-<lang>.png    「畫面測試」卡：對位畫面**開啟中**（綠色選取態）
#   card-w-<lang>.png     「畫面測試」卡：白鈕選取態（四顆色鈕的字＝白 255…）
#   card-10bit-<lang>.png 切到 10-bit：四顆鈕變成 1023
#   run-<lang>.png        按下「開始掃描」之後（沒有任何確認視窗擋在前面；MVS 回
#                         OK00,119.98 ⇒ 垂直同步頻率那一列顯示量到的 119.98 Hz）
#   hz-none-<lang>.png    MVS 回 OK08（找不到週期性、回的是我們送進去的設計值）
#                         ⇒ 那一列必須是「未偵測到」，**不得出現 60.00 這種猜測值**
#
# 🔴 一次跑三語會超過呼叫端的逾時，所以可以用 LANGS 挑：
#      LANGS=zh-TW tools/dg_selftest_v130_shots.sh <outdir>
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:?usage: dg_selftest_v130_shots.sh <outdir>}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || { echo "找不到 Chrome：$CHROME"; exit 2; }
mkdir -p "$OUT"

shot () {  # shot <來源 html> <注入的 JS> <輸出檔> <寬> <高>
  local SRC="$1" JS="$2" PNG="$3" W="$4" H="$5"
  local TMP="$ROOT/_tmp_shot_v130.html"
  cat "$ROOT/$SRC" > "$TMP"
  { echo '<script>'; echo "$JS"; echo '</script>'; } >> "$TMP"
  "$CHROME" --headless --disable-gpu --no-first-run --no-default-browser-check \
      --hide-scrollbars --virtual-time-budget=6000 --window-size="${W},${H}" \
      --screenshot="$PNG" "file://$TMP" >/dev/null 2>&1
  rm -f "$TMP"
}

# 假的 I2C Bridge ＋ 假的量測儀：讓頁面進到「已連線、已識別 EM02A1、儀器掛著」。
# 🔴 window.confirm 在這裡是**記數器**，不是補丁 —— v1.3.0 的產品路徑一次都不該
#    呼叫它。萬一有人接回來，截圖上那一行紅字會直接寫在畫面上。
read -r -d '' FAKE <<'JS' || true
function __fakeWs(map){
  var ws={readyState:1,onmessage:null,
    send:function(t){var m=JSON.parse(t),rep;
      if(m.type==='read'){var d=(map[m.addr]||[]).slice();
        if(d.length>m.len)d=d.slice(0,m.len);
        while(d.length<m.len)d.push(0);
        rep={type:'result',id:m.id,cmd:'read',ok:true,status:0,data:d};}
      else if(m.type==='write'){rep={type:'result',id:m.id,cmd:'write',ok:true,status:0};}
      else if(m.type==='ping'){rep={type:'pong',id:m.id,helper:'1.16.0',proto:5};}
      else{rep={type:'result',id:m.id,cmd:m.type,ok:true};}
      setTimeout(function(){if(ws.onmessage)ws.onmessage({data:JSON.stringify(rep)});},0);},
    close:function(){ws.readyState=3;}};
  return ws;
}
window.__confirmCalls=0;
window.confirm=function(){ window.__confirmCalls++;
  var d=document.createElement('div');
  d.style.cssText='position:fixed;top:0;left:0;right:0;z-index:999;background:#dc2626;color:#fff;padding:8px;font:700 16px system-ui';
  d.textContent='!! window.confirm 被呼叫了 '+window.__confirmCalls+' 次 —— v1.3.0 不該有任何確認視窗';
  document.body.appendChild(d); return true; };
/* 🔴 **順序要緊**：__attachFakeMeter 是這裡唯一會呼叫 dstRenderBtns() 的入口，
   所以它必須排在 scanIdentify() **之後** —— 先掛的話那一刻 dstIc 還是 null，
   整排鈕會留在 disabled，後面 click() 就什麼都不會發生（第一版截圖出來
   card-off 與 card-w 位元組完全相同，就是這個原因）。產品路徑沒有這個問題：
   dstConnect() 的 finally 本來就會重畫。 */
function __arm(){
  var P=window.dstProbe;
  P.__attachFakeWs(__fakeWs({0xFF00:[0x02,0xEF,0xA0],0x0000:[0x61,0x41,0xB4],
                             0xFF26:[0x80,0x07],0xFF28:[0x38,0x04]}));
  /* 🔴 MVS 預設回 **OK00,119.98** —— 刻意與送進去的設計值（60／75／…／120）不同，
     這樣截圖上那個數字一眼就看得出是「量到的」而不是「我們猜的」。
     window.__mvs 可以換掉，hz-none 那一張就是把它換成 OK08。 */
  window.__mvs = window.__mvs || function(g){ return g===120 ? 'OK00,119.98' : 'OK08,'+g.toFixed(2); };
  return Promise.resolve(P.commTest()).then(function(){return P.scanIdentify();})
    .then(function(){
      P.setIcForTest('EM02A1',-1);
      P.__attachFakeMeter(function(cmd){       /* 🔴 最後才掛（見上面的說明） */
        if(/^MES/.test(cmd)) return 'OK00,P1,0,0.3127,0.3290,123.456';
        var m=/^MVS,([\d.]+)/.exec(cmd); if(m) return window.__mvs(parseFloat(m[1]));
        return 'OK'; });
      return true;
    });
}
/* 🔴 **不捲動**：headless 的 --screenshot 是從捲動原點開始截的，scrollIntoView
   在虛擬時間下不保證反映到那一張圖上（實測：捲與不捲截出來的 png 位元組完全
   相同）。改成把視窗開得夠高、整頁一次截完 —— 慢一點，但看得到的是實際版面。 */
function __toCard(){ return true; }
JS

for L in ${LANGS:-zh-TW en zh-CN}; do
  # 未選取
  shot dg-selftest.html "
    $FAKE
    setTimeout(function(){ applyLang('$L'); __arm().then(__toCard); }, 400);" \
    "$OUT/card-off-$L.png" 1280 2200

  # 對位畫面開啟中（綠色選取態 ＋ 鈕面文字改變）
  shot dg-selftest.html "
    $FAKE
    setTimeout(function(){ applyLang('$L');
      __arm().then(function(){ return window.dstProbe.alignToggle(); }).then(__toCard); }, 400);" \
    "$OUT/card-on-$L.png" 1280 2200

  # 白鈕選取態
  shot dg-selftest.html "
    $FAKE
    setTimeout(function(){ applyLang('$L');
      __arm().then(function(){ document.getElementById('dst-q-w').click(); })
             .then(__toCard); }, 400);" \
    "$OUT/card-w-$L.png" 1280 2200

  # 10-bit：四顆鈕的數字跟著換
  shot dg-selftest.html "
    $FAKE
    setTimeout(function(){ applyLang('$L');
      __arm().then(function(){ window.dstProbe.setBits(10); }).then(__toCard); }, 400);" \
    "$OUT/card-10bit-$L.png" 1280 2200

  # 按下「開始掃描」之後（沒有任何確認視窗擋在前面 ⇒ 直接跑起來）
  shot dg-selftest.html "
    $FAKE
    setTimeout(function(){ applyLang('$L');
      __arm().then(function(){
        document.getElementById('dst-settle').value='300';
        document.getElementById('dst-run').click();
      }); }, 400);" \
    "$OUT/run-$L.png" 1280 2200

  # 🔴 MVS 回 OK08 ＝ 找不到週期性、回的是我們自己送進去的設計值
  #    ⇒ 那一列必須是「未偵測到」，畫面上不得出現 60.00／120.00 這種猜測值。
  shot dg-selftest.html "
    $FAKE
    window.__mvs=function(g){ return 'OK08,'+g.toFixed(2); };
    setTimeout(function(){ applyLang('$L');
      __arm().then(function(){
        document.getElementById('dst-settle').value='300';
        document.getElementById('dst-run').click();
      }); }, 400);" \
    "$OUT/hz-none-$L.png" 1280 2200
done

echo '產出：'
ls -l "$OUT" | sed 's/^/  /'

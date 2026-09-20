#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# dg_selftest_v120_shots.sh — dgself v1.2.0 的三語版面截圖（真的 Chrome，headless）
# ───────────────────────────────────────────────────────────────────────────
# 🔴 為什麼不能用 jsdom：jsdom 不做排版。「寬度夠不夠寬」「兩顆鈕的顏色份量相不
#    相當」「說明會不會擠爆」只能在真的瀏覽器裡看。做法逐條沿用 dg_fork_shots.sh。
#
# 用法：tools/dg_selftest_v120_shots.sh <輸出目錄>
# 產出（每一語各一組）：
#   pick-<lang>.png      dg.html 的二選一對話框（第 ③ 項：兩顆鈕都有顏色）
#   ident-<lang>.png     dg-selftest 的 I2C／IC 識別卡（第 ①②項）
#   width-<lang>.png     dg-selftest 整頁（第 ④ 項：寬度）
#   fail-<lang>.png      量測失敗的警告視窗（第 ⑦ 項）
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:?usage: dg_selftest_v120_shots.sh <outdir>}"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || { echo "找不到 Chrome：$CHROME"; exit 2; }
mkdir -p "$OUT"

shot () {  # shot <來源 html> <注入的 JS> <輸出檔> <寬> <高>
  local SRC="$1" JS="$2" PNG="$3" W="$4" H="$5"
  local TMP="$ROOT/_tmp_shot_v120.html"
  cat "$ROOT/$SRC" > "$TMP"
  { echo '<script>'; echo "$JS"; echo '</script>'; } >> "$TMP"
  "$CHROME" --headless --disable-gpu --no-first-run --no-default-browser-check \
      --hide-scrollbars --virtual-time-budget=4000 --window-size="${W},${H}" \
      --screenshot="$PNG" "file://$TMP" >/dev/null 2>&1
  rm -f "$TMP"
}

# 假的 I2C Bridge：讓頁面進到「已連線、已識別 EM02A1」的狀態。
# 🔴 0x0000 刻意回 61 41 B4（Bruce 實機看到的那一組，v1.1.0 會對它報 FAIL）——
#    截圖要證明的正是「這一組現在不再是紅字 FAIL」。
read -r -d '' FAKEWS <<'JS' || true
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
function __arm(){
  var P=window.dstProbe;
  P.__attachFakeWs(__fakeWs({0xFF00:[0x02,0xEF,0xA0],0x0000:[0x61,0x41,0xB4],
                             0xFF26:[0x80,0x07],0xFF28:[0x38,0x04]}));
  return Promise.resolve(P.commTest()).then(function(){return P.scanIdentify();});
}
JS

for L in zh-TW en zh-CN; do
  # ③ 二選一對話框（走使用者真正走的那條路：按第 2 部分的「即時量測」）
  shot dg.html "
    setTimeout(function(){
      applyLang('$L');
      document.getElementById('dg-btn-live-gray').click();
    }, 400);" "$OUT/pick-$L.png" 900 760

  # ①② I2C 連線與 IC 識別卡（已連線、已識別、撞號下拉出現）
  shot dg-selftest.html "
    $FAKEWS
    setTimeout(function(){
      applyLang('$L');
      __arm().then(function(){
        document.querySelector('.card .card-header').scrollIntoView({block:'start'});
      });
    }, 400);" "$OUT/ident-$L.png" 1280 1000

  # ④ 整頁寬度（桌機斷點 1280 ⇒ .container 是 1200px）
  shot dg-selftest.html "
    $FAKEWS
    setTimeout(function(){ applyLang('$L'); __arm(); }, 400);" "$OUT/width-$L.png" 1280 2400

  # ⑦ 量測失敗的警告視窗
  shot dg-selftest.html "
    $FAKEWS
    setTimeout(function(){
      applyLang('$L');
      __arm().then(function(){
        var P=window.dstProbe;
        P.setIcForTest('EM02A1',-1);
        P.__attachFakeMeter(function(cmd){
          if(/^MES/.test(cmd)) return 'ER00,1';
          if(/^MVS/.test(cmd)) return 'OK,60.00';
          return 'OK';
        });
        window.confirm=function(){return true;};
        document.getElementById('dst-settle').value='300';
        P.run();
      });
    }, 400);" "$OUT/fail-$L.png" 1000 700
done

echo '產出：'
ls -l "$OUT" | sed 's/^/  /'

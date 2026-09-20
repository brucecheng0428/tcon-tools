#!/usr/bin/env python3
# ═══════════════════════════════════════════════════════════════════════════
# dg_selftest_v140_handoff.py — 用**真的 Chrome（headless）**跑一次完整回填
# ───────────────────────────────────────────────────────────────────────────
# 為什麼要起本機 http server：回填走 postMessage ＋ origin 比對。file:// 的
# origin 是 "null"，比對會走到一條與線上不同的路 —— 那樣驗到的不是使用者
# 實際會遇到的路徑。用 http://127.0.0.1 才和 GitHub Pages 同型。
#
# 🔴 為什麼不用 `--dump-dom` ＋ `--virtual-time-budget`：dump 是在**虛擬時間
#    用完的當下**發生的，256 階還沒跑完就被截斷（實測：只吐到「第 2 部分」
#    那一行）。改成由頁面自己把結果 POST 回來，伺服器收到就收工 —— 這樣
#    等的是「真的跑完了」，不是「等夠久了吧」。
#
# 用法：python3 tools/dg_selftest_v140_handoff.py
# ═══════════════════════════════════════════════════════════════════════════
import http.server, socketserver, threading, subprocess, tempfile, shutil, sys, os, json, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get('PORT', '8791'))
CHROME = os.environ.get('CHROME', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
TIMEOUT = int(os.environ.get('TIMEOUT', '300'))
QS = os.environ.get('QS', '')      # 例：'?only=gray&prog=1'

got = {'body': None}
done = threading.Event()


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, *a):
        pass

    def do_POST(self):
        n = int(self.headers.get('Content-Length', '0'))
        got['body'] = self.rfile.read(n).decode('utf-8', 'replace')
        self.send_response(204)
        self.end_headers()
        done.set()


def main():
    if not os.path.exists(CHROME):
        print('找不到 Chrome：' + CHROME)
        return 2
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(('127.0.0.1', PORT), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    prof = tempfile.mkdtemp()
    url = 'http://127.0.0.1:%d/tools/dg_selftest_v140_handoff.html%s' % (PORT, QS)
    # 🔴 --disable-popup-blocking：產品路徑是 window.open 開量測頁，headless 預設會擋。
    # 🔴 三個 throttling 旗標缺一不可：量測頁是 popup、不是前景分頁，Chrome 會把
    #    背景視窗的 setTimeout 節流到約 1 秒一次 ⇒ 259 階要跑 4 分鐘以上，整輪必逾時。
    #    （實測：沒加這三個旗標時三個目的地跑不完 600 秒。）
    p = subprocess.Popen([CHROME, '--headless=new', '--disable-gpu', '--no-first-run',
                          '--no-default-browser-check', '--disable-popup-blocking',
                          '--disable-background-timer-throttling',
                          '--disable-backgrounding-occluded-windows',
                          '--disable-renderer-backgrounding',
                          '--user-data-dir=' + prof, url],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ok = done.wait(TIMEOUT)
    p.terminate()
    try:
        p.wait(10)
    except Exception:
        p.kill()
    srv.shutdown()
    shutil.rmtree(prof, ignore_errors=True)

    if not ok:
        print('TIMEOUT：頁面在 %d 秒內沒有回報結果' % TIMEOUT)
        return 1
    try:
        r = json.loads(got['body'])
    except Exception:
        print('回報的不是 JSON：' + (got['body'] or '')[:2000])
        return 1
    print(json.dumps(r, ensure_ascii=False, indent=1))
    return 0 if r.get('ok') else 1


if __name__ == '__main__':
    sys.exit(main())

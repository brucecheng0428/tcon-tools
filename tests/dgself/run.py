#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""tests/dgself/run.py — DG 自檢頁（dg-selftest.html）headless 回歸測試。
v2.4.0 起也跑 dg-measure.html（電腦畫面量測頁）與 dg.html（DG 主頁）的情境（SCENARIOS 第 7 欄）。

做法：每個情境把 repo 裡的頁面（預設 dg-selftest.html）複製一份到暫存資料夾，
  · <head> 最前面加 <base href="file://<repo>/">（讓 common/*.js 照常載入）＋ lib/pre.js（錯誤收集、假 DG opener）
  · 頁面最後那個 IIFE 結尾加 lib/fake_hw.js（假 I2C／假量測）＋ 情境腳本
再用自有 profile 的 headless Chrome（CDP）打開，等 <pre id="__out"> 出現後解析結果。
repo 裡的頁面一個位元組都不改；不動使用者的瀏覽器。

用法：
  python3 tests/dgself/run.py              # 全跑
  python3 tests/dgself/run.py H I-on       # 只跑指定情境（名稱見下方 SCENARIOS）
  python3 tests/dgself/run.py --list
  選項：--keep 保留暫存資料夾；--jobs N 同時跑幾個（預設 4）；--tmp DIR 指定暫存位置
環境變數：CHROME＝Chrome 執行檔路徑。
退出碼：0 全過；1 有 FAIL／JS 錯誤／沒產出；2 跑不起來（找不到 Chrome 等）。
"""
import base64, json, os, re, shutil, socket, struct, subprocess, sys, tempfile, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
PAGE = 'dg-selftest.html'
CHROME = os.environ.get('CHROME', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')

# 名稱, 情境檔, 網址查詢字串, 是否假裝由 DG 開啟, 額外的 pre 變數, reduced-motion[, 頁面（預設 dg-selftest.html）]
SCENARIOS = [
    ('A',         'A_dgen_switch_lut.js',     '',                     False, {},                         False),
    ('C',         'C_round1_recommend.js',    '?round=1&job=main',    True,  {},                         False),
    ('E',         'E_identnote_i18n.js',      '',                     False, {},                         False),
    ('F',         'F_dgen_switch_style.js',   '',                     False, {},                         False),
    ('G',         'G_hw_switches.js',         '',                     False, {},                         False),
    ('H',         'H_round2_auto_on.js',      '?round=2',             True,  {},                         False),
    ('I-on',      'I_no_auto_write.js',       '?round=2',             True,  {'__caseI': 'on'},          False),
    ('I-idle',    'I_no_auto_write.js',       '?round=2',             True,  {'__caseI': 'idle'},        False),
    ('I-r1off',   'I_no_auto_write.js',       '?round=1&job=main',    True,  {'__caseI': 'r1off'},       False),
    ('I-r1on',    'I_no_auto_write.js',       '?round=1&job=main',    True,  {'__caseI': 'r1on'},        False),
    ('J-conf',    'J_conf_auto_on.js',        '?round=1&job=conf',    True,  {'__caseJ': 'conf'},        False),
    ('K',         'J_conf_auto_on.js',        '?round=1&job=main',    True,  {'__caseJ': 'main2conf'},   False),
    ('L-A',       'L_back_to_dg_cta.js',      '?round=1&job=main',    True,  {'__ctaCase': 'A'},         False),
    ('L-B',       'L_back_to_dg_cta.js',      '?round=1&job=main',    True,  {'__ctaCase': 'B'},         False),
    ('L-C',       'L_back_to_dg_cta.js',      '?round=1&job=main',    True,  {'__ctaCase': 'C'},         False),
    ('L-RM',      'L_back_to_dg_cta.js',      '?round=1&job=main',    True,  {'__ctaCase': 'RM'},        True),
    ('L-EN',      'L_back_to_dg_cta.js',      '?round=1&job=main',    True,  {'__ctaCase': 'EN'},        False),
    # v2.4.0：量完跳「加入光學資料比較」視窗（假 opener 模擬 DG 回筆數）
    ('M-A',       'M_cmp_popup.js',           '?round=1&job=main',    True,  {'__cmpCase': 'A'},         False),
    ('M-B',       'M_cmp_popup.js',           '?round=1&job=main',    True,  {'__cmpCase': 'B'},         False),
    ('M-C',       'M_cmp_popup.js',           '?round=1&job=main',    True,  {'__cmpCase': 'C'},         False),
    ('M-FULL',    'M_cmp_popup.js',           '?round=2&job=conf',    True,  {'__cmpCase': 'FULL'},      False),
    ('M-SAME',    'M_cmp_popup.js',           '?round=1&job=main',    True,  {'__cmpCase': 'SAME'},      False),
    ('M-EN',      'M_cmp_popup.js',           '?round=1&job=main',    True,  {'__cmpCase': 'EN'},        False),
    ('M-CN',      'M_cmp_popup.js',           '?round=1&job=main',    True,  {'__cmpCase': 'CN'},        False),
    ('M-NODG',    'M_cmp_popup.js',           '',                     False, {'__cmpCase': 'NODG'},      False),
    # dg-measure.html（電腦畫面）：同一個視窗，假序列埠跑完整一輪
    ('DM-A',      'DM_measure_cmp.js',        '?task=7&dest=%E7%AC%AC%202%20%E9%83%A8%E5%88%86', True, {'__cmpCase': 'A'}, False, 'dg-measure.html'),
    ('DM-C',      'DM_measure_cmp.js',        '?task=7',              True,  {'__cmpCase': 'C'},         False, 'dg-measure.html'),
    ('DM-EN',     'DM_measure_cmp.js',        '?task=7',              True,  {'__cmpCase': 'EN'},        False, 'dg-measure.html'),
    ('DM-PRIM',   'DM_measure_cmp.js',        '?task=7&mode=prim',    True,  {'__cmpCase': 'PRIM'},      False, 'dg-measure.html'),
    # dg v2.4.1：視窗裡直接加入 ⇒ 底部不出現鈕；簡中字面
    ('DM-ADD',    'DM_measure_cmp.js',        '?task=7',              True,  {'__cmpCase': 'ADD'},       False, 'dg-measure.html'),
    ('DM-CN',     'DM_measure_cmp.js',        '?task=7',              True,  {'__cmpCase': 'CN'},        False, 'dg-measure.html'),
    # dg.html：收量測結果不自動加、查詢／加入／更新／滿載／舊版量測頁照舊自動加
    ('DG',        'DG_cmp_handler.js',        '',                     False, {},                         False, 'dg.html'),
    ('DG-NR',     'DG_cmp_handler.js',        '',                     False, {'__dgCase': 'NR'},         False, 'dg.html'),
    # v2.5.0／dg v2.3.0：視窗裡的「查看光學資料比較 ↗」與 dg.html?view=cmp 唯讀檢視
    ('V-OPEN',    'V_cmp_view.js',            '?round=1&job=main',    True,  {'__viewCase': 'OPEN'},     False),
    ('V-BLK',     'V_cmp_view.js',            '?round=1&job=main',    True,  {'__viewCase': 'BLK'},      False),
    ('V-NOSTORE', 'V_cmp_view.js',            '?round=1&job=main',    True,  {'__viewCase': 'NOSTORE'},  False),
    ('V-EN',      'V_cmp_view.js',            '?round=1&job=main',    True,  {'__viewCase': 'EN'},       False),
    ('DV-OPEN',   'DV_measure_view.js',       '?task=7',              True,  {'__viewCase': 'OPEN'},     False, 'dg-measure.html'),
    ('DV-BLK',    'DV_measure_view.js',       '?task=7',              True,  {'__viewCase': 'BLK'},      False, 'dg-measure.html'),
    ('DGV',       'DGV_cmp_view.js',          '',                     False, {},                         False, 'dg.html'),
    # v2.6.0：DG LUT（RGB）檢視「匯出 Excel」（格式與 DG 第 3 部分同一份 common/dglut-fmt.js）
    ('X-ON',      'X_lut_export.js',          '?round=2&job=main',    True,  {'__xCase': 'ON'},          False),
    ('X-OFF',     'X_lut_export.js',          '?round=2&job=main',    True,  {'__xCase': 'OFF'},         False),
    ('X-NR',      'X_lut_export.js',          '',                     False, {'__xCase': 'NR'},          False),
    ('X-ALT',     'X_lut_export.js',          '?round=2&job=main',    True,  {'__xCase': 'ALT'},         False),
    ('X-EN',      'X_lut_export.js',          '?round=2&job=main',    True,  {'__xCase': 'EN'},          False),
    # v2.7.0：第 2 輪以後流程精簡（自動讀回＋比對、決策框、④ 改狀態列）；R1＝第 1 輪不變
    ('S-AUTO',    'S_round2_flow.js',         '?round=2&job=main',    True,  {'__sCase': 'AUTO'},        False),
    ('S-BAD',     'S_round2_flow.js',         '?round=2&job=main',    True,  {'__sCase': 'BAD'},         False),
    ('S-EXPORT',  'S_round2_flow.js',         '?round=2&job=conf',    True,  {'__sCase': 'EXPORT'},      False),
    ('S-NEXT',    'S_round2_flow.js',         '?round=2&job=conf',    True,  {'__sCase': 'NEXT'},        False),
    ('S-DECL',    'S_round2_flow.js',         '?round=2&job=conf',    True,  {'__sCase': 'DECL'},        False),
    ('S-R1',      'S_round2_flow.js',         '?round=1&job=main',    True,  {'__sCase': 'R1'},          False),
    ('S-EN',      'S_round2_flow.js',         '?round=2&job=conf',    True,  {'__sCase': 'EN'},          False),
    ('S-CN',      'S_round2_flow.js',         '?round=2&job=conf',    True,  {'__sCase': 'CN'},          False),
    # v2.7.2：條件改成「確認量測」—— Bruce 實測的 DG 第 1 輪 → 寫入 → 自檢量測（round=1、job=conf）；匯出後通知 DG
    ('S-C1',      'S_round2_flow.js',         '?round=1&job=conf',    True,  {'__sCase': 'C1', '__sRound': 1},                       False),
    ('S-C1AUTO',  'S_round2_flow.js',         '?round=1&job=main',    True,  {'__sCase': 'C1AUTO', '__sRound': 1, '__sConf0': False}, False),
    ('S-NOSYNC',  'S_round2_flow.js',         '?round=2&job=conf',    True,  {'__sCase': 'NOSYNC'},                                  False),
    # dg v2.4.2：DG 收到「自檢頁已確認滿意」⇒ 停在「查看目前結果」
    ('Y-OK',      'Y_conf_satisfied.js',      '',                     False, {'__yCase': 'OK'},          False, 'dg.html'),
    ('Y-NOP4',    'Y_conf_satisfied.js',      '',                     False, {'__yCase': 'NOP4'},        False, 'dg.html'),
    # v2.7.3：只看當下這一步（自檢頁）＋ dg v2.4.3 色溫兩顆直接計算
    ('Z-R1',      'Z_focus_steps.js',         '?round=1&job=main',    True,  {'__zCase': 'R1'},          False),
    ('Z-MAN',     'Z_focus_steps.js',         '?round=1&job=main',    True,  {'__zCase': 'MAN'},         False),
    ('Z-R2',      'Z_focus_steps.js',         '?round=2&job=main',    True,  {'__zCase': 'R2'},          False),
    ('Z-CONF',    'Z_focus_steps.js',         '?round=1&job=conf',    True,  {'__zCase': 'CONF'},        False),
    ('Z-EN',      'Z_focus_steps.js',         '?round=1&job=main',    True,  {'__zCase': 'EN'},          False),
    ('Z-NODG',    'Z_focus_steps.js',         '',                     False, {'__zCase': 'NODG'},        False),
    ('T-CCT',     'T_tone_calc.js',           '',                     False, {'__tCase': 'CCT'},         False, 'dg.html'),
    ('T-GAMMA',   'T_tone_calc.js',           '',                     False, {'__tCase': 'GAMMA'},       False, 'dg.html'),
    ('T-MISS',    'T_tone_calc.js',           '',                     False, {'__tCase': 'MISS'},        False, 'dg.html'),
    ('T-EN',      'T_tone_calc.js',           '',                     False, {'__tCase': 'EN'},          False, 'dg.html'),
    ('T-CN',      'T_tone_calc.js',           '',                     False, {'__tCase': 'CN'},          False, 'dg.html'),
    # v2.7.4：整頁照步驟依序出現
    ('P-SEQ',     'P_page_stages.js',         '?round=1&job=main',    True,  {'__pCase': 'SEQ'},         False),
    ('P-DROPLN',  'P_page_stages.js',         '?round=1&job=main',    True,  {'__pCase': 'DROPLN'},      False),
    ('P-DROPCA',  'P_page_stages.js',         '?round=1&job=main',    True,  {'__pCase': 'DROPCA'},      False),
    ('P-RELOAD',  'P_page_stages.js',         '?round=1&job=main',    True,  {'__pCase': 'RELOAD'},      False),
    ('P-R2',      'P_page_stages.js',         '?round=2&job=main',    True,  {'__pCase': 'R2'},          False),
    ('P-EN',      'P_page_stages.js',         '?round=1&job=main',    True,  {'__pCase': 'EN'},          False),
    ('P-NODG',    'P_page_stages.js',         '',                     False, {'__pCase': 'NODG'},        False),
    # dg v2.4.4／dgself v2.7.5：做完的步驟縮成 ✓ 一行（common/done-step.*，三頁共用）
    ('Q-MAIN',    'Q_done_steps.js',          '',                     False, {'__qCase': 'MAIN'},        False, 'dg.html'),
    ('Q-TYPE',    'Q_done_steps.js',          '',                     False, {'__qCase': 'TYPE'},        False, 'dg.html'),
    ('Q-CONV',    'Q_done_steps.js',          '',                     False, {'__qCase': 'CONV'},        False, 'dg.html'),
    ('Q-EN',      'Q_done_steps.js',          '',                     False, {'__qCase': 'EN'},          False, 'dg.html'),
    ('Q-WMODE',   'Q_done_steps.js',          '',                     False, {'__qCase': 'WMODE'},       False, 'dg.html'),
    ('Q-FLOW',    'Q_done_steps.js',          '',                     False, {'__qCase': 'FLOW'},        False, 'dg.html'),
    ('Q-UNLOCK',  'Q_done_steps.js',          '',                     False, {'__qCase': 'UNLOCK'},      False, 'dg.html'),
    ('Q-AUTO',    'Q_done_steps.js',          '',                     False, {'__qCase': 'AUTO'},        False, 'dg.html'),
    # dg v2.4.0：一輪結束並列「查看目前結果／進行第 N+1 輪」，第 2 輪起不再問「要不要確認」
    ('R-PC',      'R_round_decide.js',        '',                     False, {'__rCase': 'PC'},          False, 'dg.html'),
    ('R-TCON',    'R_round_decide.js',        '',                     False, {'__rCase': 'TCON'},        False, 'dg.html'),
    ('R-NOMODE',  'R_round_decide.js',        '',                     False, {'__rCase': 'NOMODE'},      False, 'dg.html'),
    ('R-SHOT-DECIDE', 'R_round_decide.js',    '',                     False, {'__rCase': 'SHOT-DECIDE'}, False, 'dg.html'),
    ('R-SHOT-VIEW',   'R_round_decide.js',    '',                     False, {'__rCase': 'SHOT-VIEW'},   False, 'dg.html'),
    ('R-SHOT-NEXT',   'R_round_decide.js',    '',                     False, {'__rCase': 'SHOT-NEXT'},   False, 'dg.html'),
]
TIMEOUT = 120   # 秒；最長的 H 約 40 秒
SHOTS = os.environ.get('DGSELF_SHOTS')   # 設了就在每個情境跑完時截一張 <名稱>.png 到這個資料夾（停在情境最後的畫面）


def read(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def expect_version(tool='dgself'):
    m = re.search(r"^\s*" + tool + r"\s*:\s*'(v\d+\.\d+\.\d+)'", read(os.path.join(REPO, 'common', 'version.js')), re.M)
    if not m:
        raise SystemExit('cannot read %s version from common/version.js' % tool)
    return m.group(1)


def build(tmp, name, scen, as_dg, extra, ver, page=PAGE):
    src = read(os.path.join(REPO, page))
    pre_vars = {'__expectVer': ver, '__expectDgVer': expect_version('dg'), '__asFromDg': as_dg}
    pre_vars.update(extra)
    pre = ''.join('window.%s=%s;' % (k, json.dumps(v)) for k, v in pre_vars.items())
    head = '<base href="file://%s/"><script>%s\n%s</script>' % (REPO, pre, read(os.path.join(HERE, 'lib', 'pre.js')))
    assert '<head>' in src
    src = src.replace('<head>', '<head>' + head, 1)
    tail = '})();\n</script>\n</body>'
    i = src.rfind(tail)
    if i < 0:
        raise RuntimeError('page structure changed: final IIFE "})();</script></body>" not found')
    body = read(os.path.join(HERE, 'lib', 'fake_hw.js')) + '\n' + read(os.path.join(HERE, 'scenarios', scen))
    src = src[:i] + body + '\n' + src[i:]
    out = os.path.join(tmp, name + '.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(src)
    return out


class CDP:
    """最小的 Chrome DevTools Protocol WebSocket 用戶端（只用標準函式庫）。"""
    def __init__(self, url):
        hp, path = url[len('ws://'):].split('/', 1)
        h, p = hp.split(':')
        self.s = socket.create_connection((h, int(p)), timeout=30)
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall(('GET /%s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
                        'Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n' % (path, hp, key)).encode())
        b = b''
        while b'\r\n\r\n' not in b:
            b += self.s.recv(1)
        self.n = 0

    def _rx(self, n):
        b = b''
        while len(b) < n:
            c = self.s.recv(n - len(b))
            if not c:
                raise ConnectionError('devtools socket closed')
            b += c
        return b

    def _recv(self):
        buf = b''
        while True:
            h = self._rx(2)
            n = h[1] & 0x7f
            if n == 126: n = struct.unpack('>H', self._rx(2))[0]
            elif n == 127: n = struct.unpack('>Q', self._rx(8))[0]
            buf += self._rx(n)
            if h[0] & 0x80:
                return json.loads(buf)

    def call(self, method, **params):
        self.n += 1
        d = json.dumps({'id': self.n, 'method': method, 'params': params}).encode()
        m = os.urandom(4); n = len(d)
        hdr = bytes([0x81]) + (bytes([0x80 | n]) if n < 126 else
                               bytes([0xFE]) + struct.pack('>H', n) if n < 65536 else
                               bytes([0xFF]) + struct.pack('>Q', n))
        self.s.sendall(hdr + m + bytes(c ^ m[i % 4] for i, c in enumerate(d)))
        while True:
            r = self._recv()
            if r.get('id') == self.n:
                return r.get('result', r)

    def eval(self, expr):
        return self.call('Runtime.evaluate', expression=expr, returnByValue=True).get('result', {}).get('value')


def free_port():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p


def run_one(tmp, sc, ver):
    name, scen, query, as_dg, extra, rm = sc[:6]
    page = sc[6] if len(sc) > 6 else PAGE
    t0 = time.time()
    html = build(tmp, name, scen, as_dg, extra, ver, page)
    prof = os.path.join(tmp, 'prof-' + name)
    port = free_port()
    p = subprocess.Popen([CHROME, '--headless=new', '--remote-debugging-port=%d' % port, '--user-data-dir=' + prof,
                          '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
                          '--window-size=1280,900', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    res = {'name': name, 'results': [], 'errs': [], 'error': None}
    try:
        tabs = None
        for _ in range(150):
            try:
                tabs = json.load(urllib.request.urlopen('http://127.0.0.1:%d/json' % port, timeout=2)); break
            except Exception:
                time.sleep(0.2)
        if not tabs:
            raise RuntimeError('Chrome did not open DevTools port')
        ws = CDP([t for t in tabs if t['type'] == 'page'][0]['webSocketDebuggerUrl'])
        ws.call('Page.enable'); ws.call('Runtime.enable')
        ws.call('Emulation.setDeviceMetricsOverride', width=1280, height=900, deviceScaleFactor=1, mobile=False)
        if rm:
            ws.call('Emulation.setEmulatedMedia', features=[{'name': 'prefers-reduced-motion', 'value': 'reduce'}])
        ws.call('Page.navigate', url='file://' + html + query)
        raw = None
        while time.time() - t0 < TIMEOUT:
            time.sleep(0.5)
            raw = ws.eval("(document.getElementById('__out')||{}).textContent||''")
            if raw:
                break
        if not raw:
            res['error'] = 'no result within %ds; JS errors: %s' % (TIMEOUT, ws.eval("(window.__errs||[]).join(' | ')"))
        else:
            if SHOTS:
                os.makedirs(SHOTS, exist_ok=True)
                png = ws.call('Page.captureScreenshot', format='png').get('data')
                if png:
                    with open(os.path.join(SHOTS, name + '.png'), 'wb') as f:
                        f.write(base64.b64decode(png))
            d = json.loads(raw[len('__JSON__'):-len('__END__')])
            res['results'] = d['res']; res['errs'] = d['errs']
            if not d['res']:
                res['error'] = 'scenario produced no assertions'
    except Exception as e:
        res['error'] = 'runner: %r' % (e,)
    finally:
        p.terminate()
        try: p.wait(10)
        except Exception: p.kill()
    res['secs'] = round(time.time() - t0, 1)
    return res


def main(argv):
    keep = '--keep' in argv
    jobs, tmp_arg, names = 4, None, []
    it = iter(argv)
    for a in it:
        if a == '--jobs': jobs = int(next(it))
        elif a == '--tmp': tmp_arg = next(it)
        elif a == '--list':
            for s in SCENARIOS: print('%-8s %-26s %-18s %s' % (s[0], s[1], s[6] if len(s) > 6 else PAGE, s[2]))
            return 0
        elif a != '--keep': names.append(a)
    if not os.path.exists(CHROME):
        print('Chrome not found: %s (set CHROME=...)' % CHROME); return 2
    todo = [s for s in SCENARIOS if not names or s[0] in names]
    unknown = set(names) - {s[0] for s in SCENARIOS}
    if unknown or not todo:
        print('unknown scenario(s): %s' % ', '.join(sorted(unknown)) if unknown else 'nothing to run'); return 2
    ver = expect_version()
    tmp = tmp_arg or tempfile.mkdtemp(prefix='dgself-tests-')
    os.makedirs(tmp, exist_ok=True)
    print('dgself %s / dg %s | %d scenario(s) | tmp %s' % (ver, expect_version('dg'), len(todo), tmp), flush=True)
    with ThreadPoolExecutor(max_workers=jobs) as ex:
        results = list(ex.map(lambda s: run_one(tmp, s, ver), todo))
    npass = nfail = 0; bad = []
    for r in results:
        print('\n== %s (%.1fs)' % (r['name'], r['secs']))
        for x in r['results']:
            ok = x['pass']; npass += ok; nfail += (not ok)
            print('%s %s%s' % ('PASS' if ok else 'FAIL', x['name'], (' | ' + x['info']) if x['info'] else ''))
            if not ok: bad.append('%s: %s' % (r['name'], x['name']))
        if r['errs']:
            nfail += 1; bad.append('%s: JS errors' % r['name']); print('JS ERRORS', r['errs'])
        if r['error']:
            nfail += 1; bad.append('%s: %s' % (r['name'], r['error'])); print('ERROR', r['error'])
    print('\n==== %d passed, %d failed (%d scenarios)' % (npass, nfail, len(results)))
    for b in bad: print('  FAILED  ' + b)
    if not keep and not tmp_arg:
        shutil.rmtree(tmp, ignore_errors=True)
    return 1 if nfail else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

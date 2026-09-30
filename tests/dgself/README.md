# DG 自檢頁（dg-selftest.html）headless 回歸測試

v2.4.0 起也包含 `dg-measure.html`（電腦畫面量測頁）與 `dg.html`（DG 主頁）的情境（`run.py` SCENARIOS 第 7 欄指定頁面，預設自檢頁）。

一鍵全跑：

```
bash tests/dgself/run-all.sh            # 全部情境，約 1 分鐘，退出碼 0＝全過
bash tests/dgself/run-all.sh H I-on     # 只跑指定情境
python3 tests/dgself/run.py --list      # 列出情境與網址參數
```

需要 macOS 的 Google Chrome（或設 `CHROME=<執行檔>`）與 python3（只用標準函式庫）。
使用自有 headless profile（暫存資料夾），不影響平常用的瀏覽器；repo 裡的頁面不會被改動。

## 做法

`run.py` 把 `dg-selftest.html` 複製到暫存資料夾，在副本裡注入：

- `<head>` 最前面：`<base href>` 指回 repo（common/*.js 照常載入）＋ `lib/pre.js`
  （收集 JS 錯誤；`__asFromDg` 時假裝由 DG 開啟：假 `window.opener`、可控的分頁可見度）。
- 頁面最後那個 IIFE 的結尾：`lib/fake_hw.js`（假 I2C Bridge、假量測儀、`__arm()`、斷言工具）＋ 情境腳本。
  放在 IIFE 裡面才碰得到頁面自己的函式與變數。

再用 Chrome DevTools Protocol 打開，等 `<pre id="__out">` 出現後讀結果。任何 FAIL、JS 錯誤、逾時都算失敗。
版號檢查一律跟 `common/version.js` 的 `dgself` 比，不寫死版號。

## 情境

| 名稱 | 檔案 | 驗什麼 |
|---|---|---|
| A | A_dgen_switch_lut.js | DG_EN 開關在摘要列／T-CON 列移動、寫 bit0、OFF 時用等距表、狀態過期時重讀、讀不到時停用（A／B／D） |
| C | C_round1_recommend.js | 第 1 輪 main：步驟卡「關掉 DG_EN／維持現狀」與硬體列開關同步 |
| E | E_identnote_i18n.js | 等距表說明三語、版號 |
| F | F_dgen_switch_style.js | 開關樣式：ON 綠／OFF 灰、切換中…、讀回不符退回、量測中停用、三語 |
| G | G_hw_switches.js | I2C 治具／DG_EN／量測儀三組 ON／OFF 開關、連線失敗、取消選埠、唯一實心藍規則、三語、版號 |
| H | H_round2_auto_on.js | 第 2 輪以後自動開 DG_EN 一次並讀回、提示文字、手動關後不再開、下一輪再開、寫入失敗只試一次 |
| I-on／I-idle／I-r1off／I-r1on | I_no_auto_write.js | 不該自動寫 DG_EN 的情況 |
| J-conf／K | J_conf_auto_on.js | 「確認結果」(conf) 也自動開、不出現「關掉 DG_EN／維持現狀」；同輪 main→conf |
| L-A／L-B／L-C／L-RM／L-EN | L_back_to_dg_cta.js | v2.3.0「已送回 DG」醒目提示：實心藍、↗、捲到可視、呼吸燈、標題輪替、離開／回來／點擊、reduced-motion、三語 |
| M-A／B／C／FULL／SAME／EN／CN／NODG | M_cmp_popup.js | v2.4.0 量完跳「加入光學資料比較」：先送結果再問、筆數／清單／預設名、確定／Esc／重開／改名、DG 不回、已滿、逐值相同、三語、非 DG 開啟不跳（假 opener 回筆數） |
| DM-A／C／EN／PRIM | DM_measure_cmp.js | dg-measure.html 同一個視窗（假序列埠跑完整一輪 `run()`） |
| DG／DG-NR | DG_cmp_handler.js | dg.html：帶 cmpAsk 的結果不自動加、查詢／加入／更新／滿載／備援建組、舊版量測頁照舊自動加；確認結果取消後進下一輪不補記 |

## 新增情境

1. 在 `scenarios/` 寫一支 `(async function () { try { ... } catch (e) { window.__errs.push(...) } __done(); })();`，
   用 `__ok(名稱, 條件, 附註)` 斷言。
2. 在 `run.py` 的 `SCENARIOS` 加一列（網址參數、是否由 DG 開啟、pre 變數、是否 reduced-motion、頁面（可省略＝自檢頁））。
3. 頁面改版後情境要跟著改：斷言寫的是「應有行為」，改規格時同一個 commit 一起更新測試。

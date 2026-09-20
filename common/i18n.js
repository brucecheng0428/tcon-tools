/* ═══════════════════════════════════════════════════════════════
   TCON FAE 工具箱 — i18n 翻譯鍵值（i18n.js）
   完整 I18N 物件（519 鍵值，3 語言：zh-TW / en / zh-CN）
   ═══════════════════════════════════════════════════════════════ */

// 用 var 宣告以相容非 module 環境
var I18N = {
  'home.title':         { 'zh-TW': 'TCON FAE專用工具箱', 'en': 'TCON FAE Toolbox', 'zh-CN': 'TCON FAE专用工具箱' },
  'home.sectionTitle':  { 'zh-TW': '計算工具', 'en': 'Calculation Tools', 'zh-CN': '计算工具' },
  'home.rxtxTitle':     { 'zh-TW': 'Rx/Tx 頻率計算工具', 'en': 'Rx/Tx Frequency Calculator', 'zh-CN': 'Rx/Tx 频率计算工具' },
  'home.rxtxDesc':      { 'zh-TW': 'LVDS / eDP Rx & mLVDS / P2P Tx 頻率與 Bit Rate 計算', 'en': 'LVDS / eDP Rx & mLVDS / P2P Tx frequency and Bit Rate calculation', 'zh-CN': 'LVDS / eDP Rx & mLVDS / P2P Tx 频率与 Bit Rate 计算' },
  'home.calcTitle':     { 'zh-TW': 'mLVDS 分顆(分時) Skew 計算工具', 'en': 'mLVDS Multi-chip (Time-division) Skew Calculator', 'zh-CN': 'mLVDS 分颗(分时) Skew 计算工具' },
  'home.calcDesc':      { 'zh-TW': '示波器設定 & UI cof_cnt 分界值計算', 'en': 'Oscilloscope setup & UI cof_cnt boundary calculation', 'zh-CN': '示波器设定 & UI cof_cnt 分界值计算' },
  'home.placeholder':   { 'zh-TW': '+ 更多工具開發中…', 'en': '+ More tools coming soon…', 'zh-CN': '+ 更多工具开发中…' },
  'home.share':         { 'zh-TW': '分享工具', 'en': 'Share Tool', 'zh-CN': '分享工具' },
  'home.disclaimerTitle': { 'zh-TW': '⚠️ 免責聲明', 'en': '⚠️ Disclaimer', 'zh-CN': '⚠️ 免责声明' },
  'home.disclaimerText': {
    'zh-TW': '本工具旨在輔助日常工作、提升作業效率，歡迎各位使用。惟工具計算結果僅供參考，使用者應自行核對數值之正確性，切勿以本工具結果作為唯一依據。如使用上發現任何問題或異常，歡迎提供反饋以協助改善；惟本工具之提供者對於因使用本工具所導致之任何錯誤或損失，恕不負相關責任。',
    'en': 'This tool is intended to assist daily work and improve efficiency. Calculation results are for reference only; users should verify the values themselves and must not rely solely on this tool. Feedback on any issues is welcome. The provider shall not be liable for any errors or losses arising from the use of this tool.',
    'zh-CN': '本工具旨在辅助日常工作、提升作业效率，欢迎各位使用。惟工具计算结果仅供参考，使用者应自行核对数值之正确性，切勿以本工具结果作为唯一依据。如使用上发现任何问题或异常，欢迎提供反馈以协助改善；惟本工具之提供者对于因使用本工具所导致之任何错误或损失，恕不负相关责任。'
  },

  'common.backToHome':  { 'zh-TW': '‹ 返回主頁', 'en': '‹ Back to Home', 'zh-CN': '‹ 返回主页' },
  'common.calculate':   { 'zh-TW': '▶ 開始計算', 'en': '▶ Calculate', 'zh-CN': '▶ 开始计算' },
  'common.errorPosInt': { 'zh-TW': '請輸入正整數', 'en': 'Please enter a positive integer', 'zh-CN': '请输入正整数' },
  'common.errorNonNeg': { 'zh-TW': '請輸入正整數（或 0）', 'en': 'Please enter a non-negative integer', 'zh-CN': '请输入正整数（或 0）' },
  'common.default':     { 'zh-TW': '預設', 'en': 'Default', 'zh-CN': '默认' },
  /* 頁首「?」按鈕的 tooltip／aria-label（六個分頁共用，走 data-i18n-aria 同時寫 title 與 aria-label） */
  'common.helpBtn':     { 'zh-TW': '使用說明', 'en': 'User Guide', 'zh-CN': '使用说明' },

  'calc.title':         { 'zh-TW': 'mLVDS 分顆(分時) Skew 計算工具', 'en': 'mLVDS Multi-chip (Time-division) Skew Calculator', 'zh-CN': 'mLVDS 分颗(分时) Skew 计算工具' },
  'calc.subtitle':      { 'zh-TW': '示波器設定 & UI cof_cnt 分界值計算', 'en': 'Oscilloscope setup & UI cof_cnt boundary calculation', 'zh-CN': '示波器设定 & UI cof_cnt 分界值计算' },
  'calc.basicParams':   { 'zh-TW': '基本參數', 'en': 'Basic Parameters', 'zh-CN': '基本参数' },
  'calc.egValue3440':   { 'zh-TW': '例：3440', 'en': 'e.g. 3440', 'zh-CN': '例：3440' },
  'calc.egValue510':    { 'zh-TW': '例：510', 'en': 'e.g. 510', 'zh-CN': '例：510' },
  'calc.drvChips':      { 'zh-TW': '單 Port Driver 顆數', 'en': 'Drivers per Port', 'zh-CN': '单 Port Driver 颗数' },
  'calc.drvChipsHint':  { 'zh-TW': '點選顆數後出現各 channel 輸入欄', 'en': 'After selecting, Xn input fields will appear', 'zh-CN': '点选颗数后出现各 channel 输入栏' },
  'calc.oscSetup':      { 'zh-TW': '示波器觸發設定', 'en': 'Oscilloscope Trigger Setup', 'zh-CN': '示波器触发设定' },
  'calc.oscEventLabel': { 'zh-TW': 'XSTB(TP) rising→mLVDS RST falling 之 CLK EVENT 數', 'en': 'CLK EVENTs from XSTB(TP) rising to mLVDS RST falling', 'zh-CN': 'XSTB(TP) rising→mLVDS RST falling 之 CLK EVENT 数' },
  'calc.oscEventHint':  { 'zh-TW': '(Trig=A event B，A=XSTB(TP)正緣，B=mLVDS CLK正負緣)', 'en': '(Trig=A event B, A=XSTB(TP) rising, B=mLVDS CLK both edges)', 'zh-CN': '(Trig=A event B，A=XSTB(TP)正缘，B=mLVDS CLK 正负缘)' },
  'calc.oscClickZoom':  { 'zh-TW': '🔍 點擊放大', 'en': '🔍 Click to zoom', 'zh-CN': '🔍 点击放大' },
  'calc.oscCaption':    { 'zh-TW': 'A Trigger：XSTB(TP) 正緣　·　B Trigger：mLVDS CLK 正負緣　·　計數 A→B 之間的 CLK Events', 'en': 'A Trigger: XSTB(TP) rising  ·  B Trigger: mLVDS CLK both edges  ·  Count CLK Events between A→B', 'zh-CN': 'A Trigger：XSTB(TP) 正缘　·　B Trigger：mLVDS CLK 正负缘　·　计数 A→B 之间的 CLK Events' },
  'calc.oscEventNum':   { 'zh-TW': 'Event 數', 'en': 'Events', 'zh-CN': 'Event 数' },
  'calc.xiChannelTitle':{ 'zh-TW': 'Xn Channel（X1 最靠近 TCON）', 'en': 'Xn Channel (X1 closest to TCON)', 'zh-CN': 'Xn Channel（X1 最靠近 TCON）' },
  'calc.summaryDone':   { 'zh-TW': '計算完成', 'en': 'Calculation done', 'zh-CN': '计算完成' },
  'calc.summaryFmt':    { 'zh-TW': '計算完成 ｜ {N} 顆／Port ｜ Gate={g} ｜ Hactive={h}', 'en': 'Done | {N} per Port | Gate={g} | Hactive={h}', 'zh-CN': '计算完成 ｜ {N} 颗／Port ｜ Gate={g} ｜ Hactive={h}' },
  'calc.oscResultTitle':{ 'zh-TW': '示波器 A Event B 設定', 'en': 'Oscilloscope A Event B Setup', 'zh-CN': '示波器 A Event B 设定' },
  'calc.oscResultBEvent': { 'zh-TW': 'B event 值', 'en': 'B event value', 'zh-CN': 'B event 值' },
  'calc.oscResultFoot': { 'zh-TW': 'A Trigger: TP（正緣） ／ B Trigger: mLVDS CLK（正負緣）', 'en': 'A Trigger: TP (rising)  /  B Trigger: mLVDS CLK (both edges)', 'zh-CN': 'A Trigger: TP（正缘） ／ B Trigger: mLVDS CLK（正负缘）' },
  'calc.cofSetupTitle': { 'zh-TW': 'UI cof_cnt 分界值設定', 'en': 'UI cof_cnt Boundary Setup', 'zh-CN': 'UI cof_cnt 分界值设定' },
  'calc.cofTblItem':    { 'zh-TW': 'cof_cnt 項目', 'en': 'cof_cnt item', 'zh-CN': 'cof_cnt 项目' },
  'calc.cofTblPos':     { 'zh-TW': '交界位置', 'en': 'Boundary position', 'zh-CN': '交界位置' },
  'calc.cofTblVal':     { 'zh-TW': 'cof_cnt 分界值', 'en': 'cof_cnt boundary', 'zh-CN': 'cof_cnt 分界值' },
  'calc.skewRefTitle':  { 'zh-TW': 'Skew 檔位參照表', 'en': 'Skew Reference Table', 'zh-CN': 'Skew 档位参照表' },
  'calc.skewCksk':      { 'zh-TW': '非分顆(時間)調整，只移動CLK', 'en': 'Non-split (non-time) adjustment: shift CLK only', 'zh-CN': '非分颗(时间)调整，只移动CLK' },
  'calc.skewCkskSub':   { 'zh-TW': 'cksk lane 對應', 'en': 'cksk lane mapping', 'zh-CN': 'cksk lane 对应' },
  'calc.skewRough':     { 'zh-TW': '粗調（cksk）', 'en': 'Coarse (cksk)', 'zh-CN': '粗调（cksk）' },
  'calc.skewLaneCode':  { 'zh-TW': '代號', 'en': 'Code', 'zh-CN': '代号' },
  'calc.skewLaneMap':   { 'zh-TW': '對應 lane', 'en': 'Mapping lane', 'zh-CN': '对应 lane' },
  'calc.skewFine':      { 'zh-TW': '分顆(時間)調整', 'en': 'Split (time) adjustment', 'zh-CN': '分颗(时间)调整' },
  'calc.skewFineSub':   { 'zh-TW': '微調（fine）', 'en': 'Fine', 'zh-CN': '微调（fine）' },
  'calc.skewStepLevel': { 'zh-TW': '檔位', 'en': 'Step', 'zh-CN': '档位' },
  'calc.skewOffset':    { 'zh-TW': '位移量', 'en': 'Offset', 'zh-CN': '位移量' },

  'rxtx.title':         { 'zh-TW': 'Rx/Tx 頻率計算工具', 'en': 'Rx/Tx Frequency Calculator', 'zh-CN': 'Rx/Tx 频率计算工具' },
  'rxtx.subtitle':      { 'zh-TW': 'TCON Rx/Tx 頻率、Pixel Rate、eDP/P2P Bit Rate 計算', 'en': 'TCON Rx/Tx Frequency, Pixel Rate, eDP/P2P Bit Rate', 'zh-CN': 'TCON Rx/Tx 频率、Pixel Rate、eDP/P2P Bit Rate 计算' },
  'rxtx.basicParamsShared': { 'zh-TW': '基本參數（所有計算共用）', 'en': 'Basic Parameters (shared by all)', 'zh-CN': '基本参数（所有计算共用）' },
  'rxtx.lvdsTitle':     { 'zh-TW': 'LVDS Rx 頻率計算', 'en': 'LVDS Rx Frequency', 'zh-CN': 'LVDS Rx 频率计算' },
  'rxtx.calcMode':      { 'zh-TW': '計算模式', 'en': 'Mode', 'zh-CN': '计算模式' },
  'rxtx.modeA':         { 'zh-TW': '給定<br>FPGA DCLK', 'en': 'Given<br>FPGA DCLK', 'zh-CN': '给定<br>FPGA DCLK' },
  'rxtx.modeB':         { 'zh-TW': '給定<br>TCON DCLK', 'en': 'Given<br>TCON DCLK', 'zh-CN': '给定<br>TCON DCLK' },
  'rxtx.modeC':         { 'zh-TW': '給定<br>Frame Rate', 'en': 'Given<br>Frame Rate', 'zh-CN': '给定<br>Frame Rate' },
  'rxtx.modeD':         { 'zh-TW': '給定<br>LVDS CLK', 'en': 'Given<br>LVDS CLK', 'zh-CN': '给定<br>LVDS CLK' },
  'rxtx.p2pRxTitle':    { 'zh-TW': 'P2P Rx Bit Rate 計算', 'en': 'P2P Rx Bit Rate', 'zh-CN': 'P2P Rx Bit Rate 计算' },
  'rxtx.ifOther':       { 'zh-TW': '其他', 'en': 'Other', 'zh-CN': '其他' },
  'rxtx.edpSpec':       { 'zh-TW': '需最低 eDP 規格', 'en': 'Minimum eDP Spec', 'zh-CN': '需最低 eDP 规格' },
  'rxtx.edpOutOfSpec':  { 'zh-TW': '超出規格範圍', 'en': 'Out of spec', 'zh-CN': '超出规格范围' },
  'rxtx.mlvdsTitle':    { 'zh-TW': 'mLVDS Tx 頻率計算', 'en': 'mLVDS Tx Frequency', 'zh-CN': 'mLVDS Tx 频率计算' },
  'rxtx.p2pTxTitle':    { 'zh-TW': 'P2P Tx Bit Rate 計算', 'en': 'P2P Tx Bit Rate', 'zh-CN': 'P2P Tx Bit Rate 计算' },
  'rxtx.txFpsSyncLabel':{ 'zh-TW': 'Frame Rate（從 Rx 端同步）', 'en': 'Frame Rate (synced from Rx)', 'zh-CN': 'Frame Rate（从 Rx 端同步）' },
  'rxtx.dclkBoostTitle':{ 'zh-TW': 'DCLK 頻率加乘（最大值估算）', 'en': 'DCLK Frequency Boost (Max Estimate)', 'zh-CN': 'DCLK 频率加乘（最大值估算）' },
  'rxtx.boostRxSSC':    { 'zh-TW': 'RX SSC 展頻', 'en': 'RX SSC Spread', 'zh-CN': 'RX SSC 展频' },
  'rxtx.boostOSC':      { 'zh-TW': 'OSC 頻率製程偏移', 'en': 'OSC Process Deviation', 'zh-CN': 'OSC 频率制程偏移' },
  'rxtx.boostTxSSC':    { 'zh-TW': 'TX SSC 展頻', 'en': 'TX SSC Spread', 'zh-CN': 'TX SSC 展频' },
  'rxtx.boostMaxLabel': { 'zh-TW': '加乘後最大 DCLK：', 'en': 'Boosted Max DCLK:', 'zh-CN': '加乘后最大 DCLK：' },

  'ptr.pull':           { 'zh-TW': '下拉刷新', 'en': 'Pull to refresh', 'zh-CN': '下拉刷新' },
  'ptr.release':        { 'zh-TW': '放開立即刷新', 'en': 'Release to refresh', 'zh-CN': '松开立即刷新' },
  'ptr.refreshing':     { 'zh-TW': '重新整理中…', 'en': 'Refreshing…', 'zh-CN': '刷新中…' },

  'alert.urlCopied':    { 'zh-TW': '網址已複製到剪貼簿！', 'en': 'URL copied to clipboard!', 'zh-CN': '网址已复制到剪贴板！' },
  'alert.promptCopy':   { 'zh-TW': '請複製以下網址：', 'en': 'Please copy the URL:', 'zh-CN': '请复制以下网址：' },
  'alert.selectChips':  { 'zh-TW': '請選擇單 Port Driver 顆數', 'en': 'Please select Drivers per Port', 'zh-CN': '请选择单 Port Driver 颗数' },
  'alert.enterX1First': { 'zh-TW': '請先輸入 X1 值', 'en': 'Please enter X1 value first', 'zh-CN': '请先输入 X1 值' },

  'osc.lbHint':         { 'zh-TW': '雙指縮放 · 單指拖曳 · 雙擊還原', 'en': 'Pinch to zoom · Drag to pan · Double-tap to reset', 'zh-CN': '双指缩放 · 单指拖曳 · 双击还原' },
  'osc.lbClose':        { 'zh-TW': '關閉', 'en': 'Close', 'zh-CN': '关闭' },

  'share.shareTitle':   { 'zh-TW': 'TCON FAE專用工具箱', 'en': 'TCON FAE Toolbox', 'zh-CN': 'TCON FAE专用工具箱' },
  'share.shareText':    { 'zh-TW': 'TCON FAE專用工具箱 — 頻率計算、Skew 設定、iSP 波形', 'en': 'TCON FAE Toolbox — Frequency Calc, Skew Setup, iSP Waveform', 'zh-CN': 'TCON FAE专用工具箱 — 频率计算、Skew 设定、iSP 波形' },

  // ── iSP 波形產生器 ──
  'home.ispTitle':      { 'zh-TW': 'iSP 波形產生器', 'en': 'iSP Waveform Generator', 'zh-CN': 'iSP 波形产生器' },
  'home.ispDesc':       { 'zh-TW': '8B9B 編碼、Control Code 產生 iSP 差動訊號波形', 'en': '8B9B encoding + Control Codes → iSP differential waveform', 'zh-CN': '8B9B 编码、Control Code 产生 iSP 差动讯号波形' },
  'home.auxTitle':      { 'zh-TW': 'eDP AUX / DPCD 查詢工具', 'en': 'eDP AUX / DPCD Lookup Tool', 'zh-CN': 'eDP AUX / DPCD 查询工具' },
  'home.auxDesc':       { 'zh-TW': 'AUX Transaction 解碼 & DPCD 暫存器查詢', 'en': 'AUX Transaction Decoder & DPCD Register Lookup', 'zh-CN': 'AUX Transaction 解码 & DPCD 寄存器查询' },
  // v4.30.1（Bruce 2026-08-27）：工具改名為「面板訊號模擬與取樣」（舊名見 CHANGELOG v4.30.1）。
  // zh-CN 沿用本檔既有的用字慣例：訊號→信号、模擬→仿真（見 home.wfgDesc）。
  'home.wfgTitle':      { 'zh-TW': '面板訊號模擬與取樣', 'en': 'Panel Signal Simulation & Sampling', 'zh-CN': '面板信号仿真与取样' },
  'home.wfgDesc':       { 'zh-TW': 'Phase Counter 引擎驅動 TCON Timing 信號波形模擬', 'en': 'Phase Counter engine driven TCON timing signal waveform simulator', 'zh-CN': 'Phase Counter 引擎驱动 TCON Timing 信号波形仿真' },

  // ── Pattern Generator 畫面產生器 ──
  'home.patTitle':      { 'zh-TW': 'Pattern Generator 畫面產生器', 'en': 'Pattern Generator', 'zh-CN': 'Pattern Generator 画面产生器' },
  'home.patDesc':       { 'zh-TW': 'Sub-pixel 編輯 4×4 px，全畫面 1:1 平鋪測試畫面', 'en': '4×4 px sub-pixel editor, tiled full-screen test pattern at 1:1', 'zh-CN': 'Sub-pixel 编辑 4×4 px，全画面 1:1 平铺测试画面' },

  // ── I2C 讀寫測試 ──
  // 🔴 這張卡片的標題與說明原本是**寫死的中文**（只有它與 dg 兩張是這樣），
  //    所以切語言時整排卡片只有它不動，而且標題只寫「I2C」、與工具本身的
  //    `i2c.title`（I2C 讀寫測試）對不起來。Bruce 2026-09-20：「標題叫做
  //    『I2C 讀寫測試』，那為什麼回到首頁的時候，名稱就只有 I2C 呢？」
  // 🔴 說明裡的 offset 寬度：**0–4**，不是舊文案寫的「0-1-2-4」。
  //    3 byte 自 i2c v1.22.0 起支援（`dgh_awid_ok` 由 0/1/2/4 放寬成 0–4，
  //    依據見 tools/i2c-bridge/i2c_bridge_proto.h §dgh_awid_ok）。
  'home.i2cTitle':      { 'zh-TW': 'I2C 讀寫測試', 'en': 'I2C Read/Write Test', 'zh-CN': 'I2C 读写测试' },
  'home.i2cDesc':       { 'zh-TW': '任意 slave／offset 寬度 0–4 byte 讀寫，16×16 register dump', 'en': 'Any slave, offset width 0–4 bytes, 16×16 register dump', 'zh-CN': '任意 slave／offset 宽度 0–4 byte 读写，16×16 register dump' },

  'pat.title':          { 'zh-TW': 'Pattern Generator 畫面產生器', 'en': 'Pattern Generator', 'zh-CN': 'Pattern Generator 画面产生器' },
  'pat.subtitle':       { 'zh-TW': 'Sub-pixel 編輯 · 全畫面 1:1 平鋪', 'en': 'Sub-pixel editing · Full-screen 1:1 tiling', 'zh-CN': 'Sub-pixel 编辑 · 全画面 1:1 平铺' },

  'pat.screenCard':     { 'zh-TW': '螢幕資訊與縮放偵測', 'en': 'Screen Info & Scaling Detection', 'zh-CN': '屏幕信息与缩放检测' },
  'pat.nowCard':        { 'zh-TW': '現在顯示什麼', 'en': 'What Is Showing', 'zh-CN': '现在显示什么' },
  'pat.paramsCard':     { 'zh-TW': '畫面參數', 'en': 'Pattern Parameters', 'zh-CN': '画面参数' },
  'pat.tabPattern':     { 'zh-TW': '測試畫面', 'en': 'Test Pattern', 'zh-CN': '测试画面' },
  'pat.tabSubpixel':    { 'zh-TW': '手動 4×4', 'en': 'Manual 4×4', 'zh-CN': '手动 4×4' },
  'pat.nowSubpixel':    { 'zh-TW': '手動 4×4 平鋪', 'en': 'Manual 4×4 tiling', 'zh-CN': '手动 4×4 平铺' },
  'pat.tagOn':          { 'zh-TW': '已啟用', 'en': 'On', 'zh-CN': '已启用' },
  'pat.tagOff':         { 'zh-TW': '未啟用', 'en': 'Off', 'zh-CN': '未启用' },
  'pat.scLabel':        { 'zh-TW': '起始樣式（選單捷徑）', 'en': 'Starting Pattern (menu shortcuts)', 'zh-CN': '起始样式（菜单快捷）' },
  'pat.scHint':         { 'zh-TW': '這排是測試畫面選單的捷徑：按下去等於選對應的畫面，格子裡的值直接取自該畫面的實際輸出，不會有兩套。按完仍停在手動模式，可以繼續改格子。', 'en': 'These are shortcuts into the test pattern menu: pressing one is the same as picking that pattern, and the cell values are taken from what that pattern actually draws — there is no second copy. You stay in manual mode afterwards, so you can keep editing the cells.', 'zh-CN': '这排是测试画面菜单的快捷：按下去等于选对应的画面，格子里的值直接取自该画面的实际输出，不会有两套。按完仍停在手动模式，可以继续改格子。' },
  'pat.adopt':          { 'zh-TW': '⇩ 以此為起點手動編輯', 'en': '⇩ Edit manually from here', 'zh-CN': '⇩ 以此为起点手动编辑' },
  'pat.adoptNA':        { 'zh-TW': '這張畫面不是 4×4 週期性圖樣，沒有可以搬進編輯格的重複單元。', 'en': 'This pattern is not periodic within 4×4, so there is no repeating unit to copy into the editor.', 'zh-CN': '这张画面不是 4×4 周期性图样，没有可以搬进编辑格的重复单元。' },
  'pat.outCard':        { 'zh-TW': '輸出與另存', 'en': 'Output & Save', 'zh-CN': '输出与另存' },
  'pat.outRes':         { 'zh-TW': '輸出解析度（裝置像素）', 'en': 'Output resolution (device pixels)', 'zh-CN': '输出分辨率（设备像素）' },
  'pat.outUseScreen':   { 'zh-TW': '用螢幕', 'en': 'Use screen', 'zh-CN': '用屏幕' },
  'pat.outFormat':      { 'zh-TW': '檔案格式', 'en': 'File format', 'zh-CN': '文件格式' },
  'pat.outFmtHint':     { 'zh-TW': '兩種都是無損，像素值完全相同；PNG 有壓縮所以檔案小，BMP 不壓縮。不提供 JPEG 等有損格式 — 硬邊界與精確灰階會被破壞。', 'en': 'Both are lossless with identical pixel values; PNG is compressed so files are smaller, BMP is not. No lossy formats such as JPEG are offered — they would destroy the hard edges and exact gray levels.', 'zh-CN': '两种都是无损，像素值完全相同；PNG 有压缩所以文件小，BMP 不压缩。不提供 JPEG 等有损格式 — 硬边界与精确灰阶会被破坏。' },
  'pat.outBmpSize':     { 'zh-TW': '此尺寸的 BMP 約 {s}。', 'en': 'BMP at this size is about {s}.', 'zh-CN': '此尺寸的 BMP 约 {s}。' },
  'pat.outDepth':       { 'zh-TW': '色彩深度', 'en': 'Color depth', 'zh-CN': '色彩深度' },
  'pat.outDepth8':      { 'zh-TW': '8 bit', 'en': '8 bit', 'zh-CN': '8 bit' },
  'pat.outDepth10':     { 'zh-TW': '10 bit', 'en': '10 bit', 'zh-CN': '10 bit' },
  'pat.outDepthHint':   { 'zh-TW': '10 bit 是給只吃 10-bit 圖、不吃 8-bit 的機台用的。畫面本身仍以 8 bit 產生，存檔時每個通道用 MSB replication 放大成 10 bit（0→0、255→1023，最暗與最亮精準對應）。', 'en': 'Use 10 bit for equipment that only accepts 10-bit images. The pattern itself is still generated at 8 bit; each channel is expanded to 10 bit by MSB replication when saving (0→0, 255→1023, so black and white map exactly).', 'zh-CN': '10 bit 是给只吃 10-bit 图、不吃 8-bit 的机台用的。画面本身仍以 8 bit 产生，存档时每个通道用 MSB replication 放大成 10 bit（0→0、255→1023，最暗与最亮精准对应）。' },
  'pat.outDepthBmp':    { 'zh-TW': 'BMP 走 32bpp BI_BITFIELDS（A2R10G10B10），原生 10 bit。', 'en': 'BMP uses 32bpp BI_BITFIELDS (A2R10G10B10), natively 10-bit.', 'zh-CN': 'BMP 走 32bpp BI_BITFIELDS（A2R10G10B10），原生 10 bit。' },
  'pat.outDepthPng':    { 'zh-TW': 'PNG 規格沒有原生 10 bit，改用 16 bit + sBIT=10 表達：數值放大到滿刻度（1023→65535），不理會 sBIT 的看圖軟體也能正確顯示最亮最暗，理會 sBIT 的可精準還原回 0~1023。', 'en': 'PNG has no native 10-bit mode, so 16-bit + sBIT=10 is used: values are scaled to full range (1023→65535) so viewers that ignore sBIT still show black and white correctly, while sBIT-aware readers can recover 0–1023 exactly.', 'zh-CN': 'PNG 规格没有原生 10 bit，改用 16 bit + sBIT=10 表达：数值放大到满刻度（1023→65535），不理会 sBIT 的看图软件也能正确显示最亮最暗，理会 sBIT 的可精准还原回 0~1023。' },
  'pat.outPng16Size':   { 'zh-TW': '此尺寸未壓縮約 {s}，實際檔案經 deflate 壓縮後會小很多。', 'en': 'Uncompressed this size is about {s}; the actual file is much smaller after deflate.', 'zh-CN': '此尺寸未压缩约 {s}，实际文件经 deflate 压缩后会小很多。' },
  'pat.outName':        { 'zh-TW': '檔名', 'en': 'File name', 'zh-CN': '文件名' },
  'pat.outContents':    { 'zh-TW': '輸出<b>含遮罩層</b>、<b>不含左上角資訊框</b>（資訊框是畫面上的疊層，不屬於 pattern 本身）。輸出一律以目標解析度原生重畫，全程沒有任何縮放或內插。', 'en': 'The output <b>includes the mask layer</b> and <b>excludes the top-left info box</b> (the info box is an on-screen overlay, not part of the pattern). Output is always drawn natively at the target resolution — no scaling or interpolation anywhere.', 'zh-CN': '输出<b>含遮罩层</b>、<b>不含左上角信息框</b>（信息框是画面上的叠层，不属于 pattern 本身）。输出一律以目标分辨率原生重画，全程没有任何缩放或插值。' },
  'pat.outSave':        { 'zh-TW': '💾 另存圖片', 'en': '💾 Save image', 'zh-CN': '💾 另存图片' },
  'pat.outShare':       { 'zh-TW': '📤 分享圖片給其他 App', 'en': '📤 Share image with another app', 'zh-CN': '📤 分享图片给其他 App' },
  'pat.outShareHint':   { 'zh-TW': '分享會把「另存」產生的同一份檔案原封不動交給系統分享面板，不會為了分享重新編碼或縮放。',
                          'en': 'Sharing hands the system share sheet the exact same file bytes as Save — nothing is re-encoded or rescaled for sharing.',
                          'zh-CN': '分享会把「另存」产生的同一份文件原封不动交给系统分享面板，不会为了分享重新编码或缩放。' },
  'pat.shareDone':      { 'zh-TW': '✅ 已交給系統分享面板。', 'en': '✅ Handed to the system share sheet.', 'zh-CN': '✅ 已交给系统分享面板。' },
  'pat.shareCancelled': { 'zh-TW': '已取消分享（或這台裝置沒有可用的分享目標）。檔案沒有下載。',
                          'en': 'Share cancelled (or this device has no share target available). Nothing was downloaded.',
                          'zh-CN': '已取消分享（或这台设备没有可用的分享目标）。文件没有下载。' },
  'pat.shareUnsupported':{ 'zh-TW': '這個瀏覽器不支援分享檔案，改為下載。', 'en': 'This browser cannot share files; downloading instead.', 'zh-CN': '这个浏览器不支持分享文件，改为下载。' },
  'pat.shareFellBack':  { 'zh-TW': '⚠ 這個檔案無法分享（系統拒絕，可能與大小或型別有關），已改為下載。',
                          'en': '⚠ This file cannot be shared (rejected by the system, possibly due to size or type); downloaded instead.',
                          'zh-CN': '⚠ 这个文件无法分享（系统拒绝，可能与大小或类型有关），已改为下载。' },
  'pat.shareFailFallback':{ 'zh-TW': '⚠ 分享失敗（{e}），已改為下載。', 'en': '⚠ Share failed ({e}); downloaded instead.', 'zh-CN': '⚠ 分享失败（{e}），已改为下载。' },
  'pat.outEq':          { 'zh-TW': '與螢幕原生解析度<b>完全相同</b>（{w} × {h}），存出來就是 1:1。', 'en': 'Exactly <b>the same as the screen</b> ({w} × {h}) — the file is 1:1.', 'zh-CN': '与屏幕原生分辨率<b>完全相同</b>（{w} × {h}），存出来就是 1:1。' },
  'pat.outBig':         { 'zh-TW': '<b>比螢幕大</b>：螢幕 {w} × {h}，寬多 {dw}、高多 {dh} px。畫面上看不完整，但存出來是完整的目標解析度。', 'en': '<b>Larger than the screen</b>: screen is {w} × {h}; {dw} px wider and {dh} px taller. It will not fit on screen, but the saved file is the full target resolution.', 'zh-CN': '<b>比屏幕大</b>：屏幕 {w} × {h}，宽多 {dw}、高多 {dh} px。画面上看不完整，但存出来是完整的目标分辨率。' },
  'pat.outSmall':       { 'zh-TW': '<b>比螢幕小</b>：螢幕 {w} × {h}，寬少 {dw}、高少 {dh} px。', 'en': '<b>Smaller than the screen</b>: screen is {w} × {h}; {dw} px narrower and {dh} px shorter.', 'zh-CN': '<b>比屏幕小</b>：屏幕 {w} × {h}，宽少 {dw}、高少 {dh} px。' },
  'pat.outMixed':       { 'zh-TW': '與螢幕（{w} × {h}）一邊大一邊小。', 'en': 'One dimension is larger and the other smaller than the screen ({w} × {h}).', 'zh-CN': '与屏幕（{w} × {h}）一边大一边小。' },
  'pat.outAspect':      { 'zh-TW': '長寬比 {a} 與螢幕 {b} 不同。', 'en': 'Aspect ratio {a} differs from the screen ratio {b}.', 'zh-CN': '长宽比 {a} 与屏幕 {b} 不同。' },
  'pat.outCkEven':      { 'zh-TW': 'Checker {n}×{n} 在此尺寸下格寬<b>均勻</b>。', 'en': 'Checker {n}×{n} has <b>even</b> cell widths at this size.', 'zh-CN': 'Checker {n}×{n} 在此尺寸下格宽<b>均匀</b>。' },
  'pat.outCkOdd':       { 'zh-TW': 'Checker {n}×{n} 在此尺寸下格寬<b>不均勻</b>（尺寸不是 {n} 的整數倍）。', 'en': 'Checker {n}×{n} has <b>uneven</b> cell widths at this size (not an integer multiple of {n}).', 'zh-CN': 'Checker {n}×{n} 在此尺寸下格宽<b>不均匀</b>（尺寸不是 {n} 的整数倍）。' },
  'pat.outMaskInfo':    { 'zh-TW': '遮罩：{n} 等份、外緣 {pad} px → 此輸出的露出區寬 {w} px（{p}%）；螢幕解析度下為 {sp}%。', 'en': 'Mask: {n} segments, edge {pad} px → revealed width {w} px ({p}%) at this output; {sp}% at screen resolution.', 'zh-CN': '遮罩：{n} 等份、外缘 {pad} px → 此输出的露出区宽 {w} px（{p}%）；屏幕分辨率下为 {sp}%。' },
  'pat.outMaskDiff':    { 'zh-TW': '外緣調整是絕對像素，換解析度時佔比會變。', 'en': 'The edge adjustment is in absolute pixels, so the ratio changes with resolution.', 'zh-CN': '外缘调整是绝对像素，换分辨率时占比会变。' },
  'pat.outWorking':     { 'zh-TW': '正在以 {w} × {h} 原生重畫並寫檔…', 'en': 'Drawing natively at {w} × {h} and writing the file…', 'zh-CN': '正在以 {w} × {h} 原生重画并写文件…' },
  'pat.outVerifyOk':    { 'zh-TW': '✅ 已存檔並自動驗證（{f}，{s}）：把檔案解碼回來與來源逐像素比對，共 {n} px，<b>差異 0</b>。', 'en': '✅ Saved and automatically verified ({f}, {s}): the file was decoded back and compared with the source pixel by pixel — {n} px, <b>0 differences</b>.', 'zh-CN': '✅ 已存档并自动验证（{f}，{s}）：把文件解码回来与来源逐像素比对，共 {n} px，<b>差异 0</b>。' },
  'pat.outVerifyBad':   { 'zh-TW': '⚠ 存檔完成（{f}，{s}）但驗證<b>未通過</b>：{n} px 中有 <b>{d}</b> px 不同，解碼尺寸 {w} × {h}。檔案已保留，請回報此訊息。', 'en': '⚠ Saved ({f}, {s}) but verification <b>failed</b>: <b>{d}</b> of {n} px differ; decoded size {w} × {h}. The file was kept — please report this message.', 'zh-CN': '⚠ 存档完成（{f}，{s}）但验证<b>未通过</b>：{n} px 中有 <b>{d}</b> px 不同，解码尺寸 {w} × {h}。文件已保留，请回报此消息。' },
  'pat.outVerifyErr':   { 'zh-TW': '⚠ 檔案已存，但驗證程序發生錯誤：{e}', 'en': '⚠ The file was saved but the verification step failed: {e}', 'zh-CN': '⚠ 文件已存，但验证程序发生错误：{e}' },
  'pat.outFail':        { 'zh-TW': '⚠ 產生檔案失敗，未存檔。', 'en': '⚠ Failed to produce the file; nothing was saved.', 'zh-CN': '⚠ 生成文件失败，未存档。' },
  'pat.viewFit':        { 'zh-TW': '符合視窗', 'en': 'Fit to box', 'zh-CN': '符合窗口' },
  'pat.view11':         { 'zh-TW': '1:1 實際像素', 'en': '1:1 actual pixels', 'zh-CN': '1:1 实际像素' },
  'pat.prevScaled':     { 'zh-TW': '⚠ 此檢視經過縮放（{p}%），紋路僅供構圖參考，非實際輸出。要看真實紋路請切到 1:1。', 'en': '⚠ This view is scaled ({p}%). The texture is for composition reference only, not the actual output. Switch to 1:1 to see it for real.', 'zh-CN': '⚠ 此视图经过缩放（{p}%），纹路仅供构图参考，非实际输出。要看真实纹路请切到 1:1。' },
  'pat.prevBase':       { 'zh-TW': '預覽框 {w} × {h} px。', 'en': 'Preview box {w} × {h} px.', 'zh-CN': '预览框 {w} × {h} px。' },
  'pat.prevNoAffect':   { 'zh-TW': '拖曳只改變看哪一塊，存出去的一律是完整的目標解析度。', 'en': 'Panning only changes which part you look at; the saved file is always the full target resolution.', 'zh-CN': '拖拽只改变看哪一块，存出去的一律是完整的目标分辨率。' },
  'pat.panPos':         { 'zh-TW': '檢視位置 {x}, {y}｜存檔內容不受影響', 'en': 'View at {x}, {y} — saved file unaffected', 'zh-CN': '视图位置 {x}, {y}｜存档内容不受影响' },
  'pat.fsPrev':         { 'zh-TW': '⛶ 用整個螢幕 1:1 檢視', 'en': '⛶ Inspect 1:1 on the whole screen', 'zh-CN': '⛶ 用整个屏幕 1:1 查看' },
  'pat.fsPrevExit':     { 'zh-TW': '✕ 離開', 'en': '✕ Exit', 'zh-CN': '✕ 离开' },
  'pat.fsPrevInfo':     { 'zh-TW': '輸出 <b>{tw} × {th}</b>｜螢幕繪圖區 <b>{sw} × {sh}</b>', 'en': 'Output <b>{tw} × {th}</b> | screen area <b>{sw} × {sh}</b>', 'zh-CN': '输出 <b>{tw} × {th}</b>｜屏幕绘图区 <b>{sw} × {sh}</b>' },
  'pat.fsPrevEq':       { 'zh-TW': '尺寸剛好相同，這就是 1:1 的實際樣子。', 'en': 'Exactly the same size — this is the real 1:1 appearance.', 'zh-CN': '尺寸刚好相同，这就是 1:1 的实际样子。' },
  'pat.fsPrevBig':      { 'zh-TW': '比螢幕大，按住左鍵拖曳可平移（目前 {x}, {y}）。存檔內容不受影響。', 'en': 'Larger than the screen — hold the left button and drag to pan (now at {x}, {y}). The saved file is unaffected.', 'zh-CN': '比屏幕大，按住左键拖拽可平移（当前 {x}, {y}）。存档内容不受影响。' },
  'pat.fsPrevSmall':    { 'zh-TW': '比螢幕小，已置中顯示，四周為黑邊。', 'en': 'Smaller than the screen — centred with black margins.', 'zh-CN': '比屏幕小，已居中显示，四周为黑边。' },
  'pat.outBatch':       { 'zh-TW': '一次匯出多個尺寸', 'en': 'Export several sizes at once', 'zh-CN': '一次导出多个尺寸' },
  'pat.outBatchHint':   { 'zh-TW': '每個尺寸都各自以該解析度原生重畫並各自驗證，不是把同一張圖縮放成好幾份。', 'en': 'Every size is drawn natively at that resolution and verified separately — not one image scaled into several.', 'zh-CN': '每个尺寸都各自以该分辨率原生重画并各自验证，不是把同一张图缩放成好几份。' },
  'pat.outBatchGo':     { 'zh-TW': '⬇ 批次匯出勾選的尺寸', 'en': '⬇ Export the ticked sizes', 'zh-CN': '⬇ 批量导出勾选的尺寸' },
  'pat.outBatchNone':   { 'zh-TW': '請先勾選至少一個尺寸。', 'en': 'Tick at least one size first.', 'zh-CN': '请先勾选至少一个尺寸。' },
  'pat.outBatchWorking':{ 'zh-TW': '正在逐一以各自的解析度重畫並寫檔（共 {n} 個）…', 'en': 'Drawing and writing each size in turn ({n} total)…', 'zh-CN': '正在逐一以各自的分辨率重画并写文件（共 {n} 个）…' },
  'pat.outBatchRow':    { 'zh-TW': '{n} px，差異 {d}，{s}', 'en': '{n} px, {d} differing, {s}', 'zh-CN': '{n} px，差异 {d}，{s}' },
  'pat.outBatchOk':     { 'zh-TW': '✅ {n} 個尺寸全部匯出並通過逐像素驗證：', 'en': '✅ All {n} sizes exported and passed per-pixel verification:', 'zh-CN': '✅ {n} 个尺寸全部导出并通过逐像素验证：' },
  'pat.outBatchBad':    { 'zh-TW': '⚠ 共 {n} 個尺寸，其中 {b} 個驗證未通過：', 'en': '⚠ {n} sizes exported, {b} failed verification:', 'zh-CN': '⚠ 共 {n} 个尺寸，其中 {b} 个验证未通过：' },
  'pat.menuRecent':     { 'zh-TW': '最近使用', 'en': 'Recently used', 'zh-CN': '最近使用' },
  'pat.magOpen':        { 'zh-TW': '🔍 放大鏡（看 sub-pixel 排列）', 'en': '🔍 Magnifier (inspect sub-pixel layout)', 'zh-CN': '🔍 放大镜（看 sub-pixel 排列）' },
  'pat.magExitMode':    { 'zh-TW': '✕ 離開放大鏡模式', 'en': '✕ Leave magnifier mode', 'zh-CN': '✕ 离开放大镜模式' },
  'pat.magBar':         { 'zh-TW': '🔍 放大鏡', 'en': '🔍 Magnifier', 'zh-CN': '🔍 放大镜' },
  'pat.magRange':       { 'zh-TW': '取樣範圍', 'en': 'Sample area', 'zh-CN': '采样范围' },
  'pat.magExit':        { 'zh-TW': '✕ 關閉放大鏡', 'en': '✕ Close magnifier', 'zh-CN': '✕ 关闭放大镜' },
  'pat.magTip':         { 'zh-TW': '方向鍵移動 1 px，Shift+方向鍵 10 px；中心格的值看下方資訊列', 'en': 'Arrow keys move 1 px, Shift+arrows 10 px; read the centre pixel from the info bar below', 'zh-CN': '方向键移动 1 px，Shift+方向键 10 px；中心格的值看下方信息栏' },
  'pat.magOpenShort':   { 'zh-TW': '放大鏡', 'en': 'Magnifier', 'zh-CN': '放大镜' },
  'pat.magOpenBtn':     { 'zh-TW': '🔍 開啟放大鏡（看 sub-pixel 排列）', 'en': '🔍 Open magnifier (inspect sub-pixel layout)', 'zh-CN': '🔍 开启放大镜（看 sub-pixel 排列）' },
  'pat.magHowExit':     { 'zh-TW': '離開：按 Esc、點這裡的 ✕、或再點一次進入時用的那個入口', 'en': 'To leave: press Esc, click the ✕ here, or use the same entry you came in by', 'zh-CN': '离开：按 Esc、点这里的 ✕、或再点一次进入时用的那个入口' },
  'pat.impCard':        { 'zh-TW': '匯入圖片', 'en': 'Import Image', 'zh-CN': '导入图片' },
  'pat.impNone':        { 'zh-TW': '未匯入', 'en': 'None', 'zh-CN': '未导入' },
  'pat.impPick':        { 'zh-TW': '📂 選擇圖片檔…', 'en': '📂 Choose an image file…', 'zh-CN': '📂 选择图片文件…' },
  'pat.impFormats':     { 'zh-TW': 'PNG／BMP／JPG／GIF／WebP 等瀏覽器可解的格式都吃。', 'en': 'PNG, BMP, JPG, GIF, WebP — anything the browser can decode.', 'zh-CN': 'PNG／BMP／JPG／GIF／WebP 等浏览器可解的格式都吃。' },
  'pat.impWorking':     { 'zh-TW': '解碼中…', 'en': 'Decoding…', 'zh-CN': '解码中…' },
  'pat.impFail':        { 'zh-TW': '⚠ 這個檔案無法解碼：{e}', 'en': '⚠ Could not decode this file: {e}', 'zh-CN': '⚠ 这个文件无法解码：{e}' },
  'pat.impMeta':        { 'zh-TW': '已匯入 <b>{n}</b>｜<b>{w} × {h}</b>｜{s}｜解碼：{v}', 'en': 'Imported <b>{n}</b> | <b>{w} × {h}</b> | {s} | decoded by {v}', 'zh-CN': '已导入 <b>{n}</b>｜<b>{w} × {h}</b>｜{s}｜解码：{v}' },
  'pat.impViaBrowser':  { 'zh-TW': '瀏覽器原生', 'en': 'the browser', 'zh-CN': '浏览器原生' },
  'pat.impViaBuiltin':  { 'zh-TW': '內建 BMP 讀取器', 'en': 'the built-in BMP reader', 'zh-CN': '内置 BMP 读取器' },
  'pat.impEq':          { 'zh-TW': '尺寸與螢幕相同，1:1 滿版顯示。', 'en': 'Same size as the screen — shown 1:1, filling it.', 'zh-CN': '尺寸与屏幕相同，1:1 满屏显示。' },
  'pat.impBig':         { 'zh-TW': '比螢幕大：1:1 顯示，超出的部分可拖曳平移，<b>不會縮小</b>。', 'en': 'Larger than the screen: shown 1:1 and pannable; it is <b>not</b> scaled down.', 'zh-CN': '比屏幕大：1:1 显示，超出的部分可拖拽平移，<b>不会缩小</b>。' },
  'pat.impSmall':       { 'zh-TW': '比螢幕小：1:1 置中顯示，四周留黑邊，<b>不會放大</b>。', 'en': 'Smaller than the screen: shown 1:1 and centred with black margins; it is <b>not</b> scaled up.', 'zh-CN': '比屏幕小：1:1 居中显示，四周留黑边，<b>不会放大</b>。' },
  'pat.impNoScale':     { 'zh-TW': '匯入的圖<b>一律以 1:1 原尺寸顯示，不會自動縮放</b>。理由與存圖相同 —— 一縮放，像素級的排列就毀了，而匯入圖片多半就是要看那張圖的像素排列。', 'en': 'Imported images are <b>always shown 1:1 at their original size and never scaled automatically</b>. Same reason as saving: scaling destroys the pixel-level arrangement, and inspecting that arrangement is usually the whole point of importing.', 'zh-CN': '导入的图<b>一律以 1:1 原尺寸显示，不会自动缩放</b>。理由与存图相同 —— 一缩放，像素级的排列就毁了，而导入图片多半就是要看那张图的像素排列。' },
  'pat.impLossy':       { 'zh-TW': '⚠ <b>這是 JPEG，屬於失真壓縮格式。</b>檔案裡的像素值<b>在存成 JPG 的當下就已經被改過了</b>（色度次取樣、DCT 量化），不是原圖的精確數值。本工具不會再更動它，但放大鏡讀到的值反映的是 <b>JPEG 檔案裡的值</b>，不是原始畫面的值。要逐像素比對請改用 PNG 或 BMP，那兩種是無損的。', 'en': '⚠ <b>This is a JPEG — a lossy format.</b> The pixel values in the file <b>were already altered when it was saved as JPG</b> (chroma subsampling, DCT quantisation); they are not the original exact values. This tool will not alter them further, but what the magnifier reads is <b>what is in the JPEG file</b>, not the original picture. For per-pixel comparison use PNG or BMP, which are lossless.', 'zh-CN': '⚠ <b>这是 JPEG，属于有损压缩格式。</b>文件里的像素值<b>在存成 JPG 的当下就已经被改过了</b>（色度次采样、DCT 量化），不是原图的精确数值。本工具不会再更动它，但放大镜读到的值反映的是 <b>JPEG 文件里的值</b>，不是原始画面的值。要逐像素比对请改用 PNG 或 BMP，那两种是无损的。' },
  'pat.impClear':       { 'zh-TW': '✕ 清除匯入的圖，回到測試畫面', 'en': '✕ Clear the imported image', 'zh-CN': '✕ 清除导入的图，回到测试画面' },
  'pat.impCur':         { 'zh-TW': '匯入圖：{n}（{w} × {h}）', 'en': 'Imported: {n} ({w} × {h})', 'zh-CN': '导入图：{n}（{w} × {h}）' },
  'pat.impGridNA':      { 'zh-TW': '目前顯示的是匯入的圖片，4×4 sub-pixel 編輯區不適用。', 'en': 'An imported image is being shown; the 4×4 sub-pixel editor does not apply.', 'zh-CN': '目前显示的是导入的图片，4×4 sub-pixel 编辑区不适用。' },
  'pat.magHint':        { 'zh-TW': '準星中心對到的像素會框起來；每個像素畫成 R／G／B 三條，用該通道的亮度上色。數值範圍 0–255。', 'en': 'The pixel under the crosshair centre is outlined; each pixel is drawn as three R/G/B bars shaded by that channel\'s level. Values run 0–255.', 'zh-CN': '准星中心对到的像素会框起来；每个像素画成 R／G／B 三条，用该通道的亮度上色。数值范围 0–255。' },
  'pat.s2gTitle':       { 'zh-TW': 'Pattern #2（偶數列與奇數列交替）', 'en': 'Pattern #2 (alternating with even/odd rows)', 'zh-CN': 'Pattern #2（偶数行与奇数行交替）' },
  'pat.s2gColor':       { 'zh-TW': 'Pattern #2 Color', 'en': 'Pattern #2 Color', 'zh-CN': 'Pattern #2 Color' },
  'pat.s2gLevel':       { 'zh-TW': 'Pattern #2 Level', 'en': 'Pattern #2 Level', 'zh-CN': 'Pattern #2 Level' },
  'pat.s2gHint':        { 'zh-TW': '上方的顏色與灰階是 Pattern #1；這裡是 Pattern #2。原程式兩者都可調，本站先前漏了這一組。', 'en': 'The colour and level above are Pattern #1; these are Pattern #2. The original program lets you set both — this pair was missing here until now.', 'zh-CN': '上方的颜色与灰阶是 Pattern #1；这里是 Pattern #2。原程序两者都可调，本站先前漏了这一组。' },
  'pat.maskTint':       { 'zh-TW': '把上面的顏色與灰階也套到這張畫面', 'en': 'Apply the colour and level above to this pattern too', 'zh-CN': '把上面的颜色与灰阶也套到这张画面' },
  'pat.maskTintHint':   { 'zh-TW': '預設不套用，讓那張畫面維持它原本該有的樣子。', 'en': 'Off by default, so the pattern keeps the appearance it is supposed to have.', 'zh-CN': '默认不套用，让那张画面维持它原本该有的样子。' },
  'pat.lblCssRes':      { 'zh-TW': 'CSS 邏輯解析度', 'en': 'CSS logical resolution', 'zh-CN': 'CSS 逻辑分辨率' },
  'pat.lblDpr':         { 'zh-TW': 'devicePixelRatio', 'en': 'devicePixelRatio', 'zh-CN': 'devicePixelRatio' },
  'pat.lblDevRes':      { 'zh-TW': '推算裝置像素（非 API 值）', 'en': 'Derived device pixels (not from API)', 'zh-CN': '推算设备像素（非 API 值）' },
  'pat.lblInner':       { 'zh-TW': '視窗內部尺寸', 'en': 'Window inner size', 'zh-CN': '窗口内部尺寸' },
  'pat.lblAvail':       { 'zh-TW': '可用區域', 'en': 'Available area', 'zh-CN': '可用区域' },
  'pat.lblColor':       { 'zh-TW': '色彩深度', 'en': 'Color depth', 'zh-CN': '色彩深度' },
  'pat.lblOrient':      { 'zh-TW': '螢幕方向', 'en': 'Orientation', 'zh-CN': '屏幕方向' },
  'pat.lblExtended':    { 'zh-TW': '多螢幕 (isExtended)', 'en': 'Multi-screen (isExtended)', 'zh-CN': '多屏幕 (isExtended)' },
  'pat.cssPxUnit':      { 'zh-TW': 'CSS px', 'en': 'CSS px', 'zh-CN': 'CSS px' },
  'pat.unknown':        { 'zh-TW': '未知', 'en': 'Unknown', 'zh-CN': '未知' },
  'pat.apiUnsupported': { 'zh-TW': '此瀏覽器不支援', 'en': 'Not supported in this browser', 'zh-CN': '此浏览器不支持' },
  'pat.yes':            { 'zh-TW': '是', 'en': 'Yes', 'zh-CN': '是' },
  'pat.no':             { 'zh-TW': '否', 'en': 'No', 'zh-CN': '否' },

  'pat.dprIntOk': {
    'zh-TW': '<b>devicePixelRatio = {d}（整數）</b><br>全畫面平鋪時每個 pattern 像素可對應 1 個實體像素，不會被重新取樣。',
    'en': '<b>devicePixelRatio = {d} (integer)</b><br>In full-screen tiling each pattern pixel maps to one physical pixel with no resampling.',
    'zh-CN': '<b>devicePixelRatio = {d}（整数）</b><br>全画面平铺时每个 pattern 像素可对应 1 个物理像素，不会被重新采样。'
  },
  'pat.dprNonInt': {
    'zh-TW': '<b>⚠ devicePixelRatio = {d}（非整數）</b><br>畫面會被瀏覽器／系統重新取樣，<b>無法保證 1:1 實體像素對應</b>，sub-pixel pattern 會被糊掉。請把系統顯示縮放與瀏覽器縮放都設回 100%（瀏覽器按 Ctrl/⌘ + 0），讓此值變成整數（1、2 或 3）。',
    'en': '<b>⚠ devicePixelRatio = {d} (non-integer)</b><br>The output will be resampled by the browser/OS, so <b>1:1 physical-pixel mapping cannot be guaranteed</b> and the sub-pixel pattern will be blurred. Set both OS display scaling and browser zoom back to 100% (press Ctrl/⌘ + 0) so this value becomes an integer (1, 2 or 3).',
    'zh-CN': '<b>⚠ devicePixelRatio = {d}（非整数）</b><br>画面会被浏览器／系统重新采样，<b>无法保证 1:1 物理像素对应</b>，sub-pixel pattern 会被糊掉。请把系统显示缩放与浏览器缩放都设回 100%（浏览器按 Ctrl/⌘ + 0），让此值变成整数（1、2 或 3）。'
  },

  'pat.capBlock': {
    'zh-TW': '<b>關於縮放偵測，網頁能做到什麼（誠實說明）</b><ul class="pg-cap-list">' +
      '<li><b>(a) 確定做得到</b>：讀取 screen.width / height（CSS 像素）、devicePixelRatio、可用區域、色彩深度、方向；偵測 devicePixelRatio 是否為整數，藉此判斷能否做 1:1 對應。</li>' +
      '<li><b>(b) 有前提才做得到</b>：Window Management API（getScreenDetails）可列出每台螢幕的 label 與各自的 devicePixelRatio，並可用「window.devicePixelRatio ÷ 該螢幕 devicePixelRatio」<u>推估</u>瀏覽器頁面縮放；但僅 Chromium 系瀏覽器 100 版以上支援，需 HTTPS 與使用者授權，Firefox / Safari / iOS 一律不支援。</li>' +
      '<li><b>(c) 確定做不到</b>：① 無法區分「作業系統顯示縮放 125%/150%」與「瀏覽器頁面縮放」——兩者都只反映在同一個 devicePixelRatio 上，W3C 曾提案的 window.pageZoomFactor 已被否決。② 無法讀取螢幕面板的原生實體解析度（上方「推算裝置像素」只是乘法推算，在部分系統的縮放模式或手機上會與面板原生解析度不符）。③ <b>網頁完全無法修改</b>作業系統顯示縮放或瀏覽器縮放，改瀏覽器縮放只有擴充功能才辦得到，所以本工具只能提醒你手動改成 100%。</li></ul>' +
      '<b>手動確認方式</b>：瀏覽器縮放按 Ctrl/⌘ + 0 重設為 100%；作業系統顯示縮放請到系統的「顯示器 / 縮放與版面配置」設定改為 100%（建議改完重新整理本頁）。改完後上方 devicePixelRatio 應為整數。',
    'en': '<b>What a web page can actually detect (honest summary)</b><ul class="pg-cap-list">' +
      '<li><b>(a) Definitely possible</b>: read screen.width / height (CSS pixels), devicePixelRatio, available area, color depth and orientation; check whether devicePixelRatio is an integer to decide if 1:1 mapping is achievable.</li>' +
      '<li><b>(b) Possible with conditions</b>: the Window Management API (getScreenDetails) lists each screen with its label and its own devicePixelRatio, and browser page zoom can be <u>estimated</u> as window.devicePixelRatio ÷ that screen devicePixelRatio. Chromium-based browsers 100+ only, requires HTTPS and user permission; Firefox / Safari / iOS do not support it at all.</li>' +
      '<li><b>(c) Definitely impossible</b>: (1) OS display scaling (125%/150%) cannot be distinguished from browser page zoom — both appear only in the same devicePixelRatio value, and the proposed W3C window.pageZoomFactor was rejected. (2) The panel native physical resolution cannot be read; the "derived device pixels" above is only a multiplication and will not match the panel on some scaled desktop modes or phones. (3) A web page <b>cannot change</b> OS display scaling or browser zoom at all (only browser extensions can change zoom), so this tool can only ask you to set 100% manually.</li></ul>' +
      '<b>How to verify manually</b>: press Ctrl/⌘ + 0 to reset browser zoom to 100%; set OS display scaling to 100% in the system Display / Scale-and-layout settings, then reload this page. devicePixelRatio above should then be an integer.',
    'zh-CN': '<b>关于缩放检测，网页能做到什么（诚实说明）</b><ul class="pg-cap-list">' +
      '<li><b>(a) 确定做得到</b>：读取 screen.width / height（CSS 像素）、devicePixelRatio、可用区域、色彩深度、方向；检测 devicePixelRatio 是否为整数，藉此判断能否做 1:1 对应。</li>' +
      '<li><b>(b) 有前提才做得到</b>：Window Management API（getScreenDetails）可列出每台屏幕的 label 与各自的 devicePixelRatio，并可用「window.devicePixelRatio ÷ 该屏幕 devicePixelRatio」<u>推估</u>浏览器页面缩放；但仅 Chromium 系浏览器 100 版以上支持，需 HTTPS 与用户授权，Firefox / Safari / iOS 一律不支持。</li>' +
      '<li><b>(c) 确定做不到</b>：① 无法区分「操作系统显示缩放 125%/150%」与「浏览器页面缩放」——两者都只反映在同一个 devicePixelRatio 上，W3C 曾提案的 window.pageZoomFactor 已被否决。② 无法读取屏幕面板的原生物理分辨率（上方「推算设备像素」只是乘法推算，在部分系统的缩放模式或手机上会与面板原生分辨率不符）。③ <b>网页完全无法修改</b>操作系统显示缩放或浏览器缩放，改浏览器缩放只有扩展程序才办得到，所以本工具只能提醒你手动改成 100%。</li></ul>' +
      '<b>手动确认方式</b>：浏览器缩放按 Ctrl/⌘ + 0 重设为 100%；操作系统显示缩放请到系统的「显示器 / 缩放与布局」设置改为 100%（建议改完刷新本页）。改完后上方 devicePixelRatio 应为整数。'
  },

  'pat.wmBtn':          { 'zh-TW': '🔎 取得每台螢幕詳細資訊（需授權）', 'en': '🔎 Get per-screen details (permission required)', 'zh-CN': '🔎 获取每台屏幕详细信息（需授权）' },
  'pat.wmLoading':      { 'zh-TW': '查詢中…', 'en': 'Querying…', 'zh-CN': '查询中…' },
  'pat.wmUnsupported': {
    'zh-TW': '此瀏覽器<b>不支援</b> Window Management API（window.getScreenDetails）。此 API 僅 Chromium 系瀏覽器 100 版以上提供，Firefox 與 Safari（含 iOS）皆不支援，因此無法取得每台螢幕的個別資訊，也無法推估瀏覽器頁面縮放。',
    'en': 'This browser does <b>not support</b> the Window Management API (window.getScreenDetails). It is available only in Chromium-based browsers 100+; Firefox and Safari (including iOS) do not support it, so per-screen details and browser zoom estimation are unavailable here.',
    'zh-CN': '此浏览器<b>不支持</b> Window Management API（window.getScreenDetails）。此 API 仅 Chromium 系浏览器 100 版以上提供，Firefox 与 Safari（含 iOS）皆不支持，因此无法获取每台屏幕的个别信息，也无法推估浏览器页面缩放。'
  },
  'pat.wmScreens':      { 'zh-TW': '偵測到 {n} 台螢幕：', 'en': 'Detected {n} screen(s):', 'zh-CN': '检测到 {n} 台屏幕：' },
  'pat.wmPrimary':      { 'zh-TW': '主螢幕', 'en': 'primary', 'zh-CN': '主屏幕' },
  'pat.wmInternal':     { 'zh-TW': '內建', 'en': 'internal', 'zh-CN': '内建' },
  'pat.wmExternal':     { 'zh-TW': '外接', 'en': 'external', 'zh-CN': '外接' },
  'pat.wmCurrent':      { 'zh-TW': '★目前視窗所在', 'en': '★current window', 'zh-CN': '★当前窗口所在' },
  'pat.wmZoomEst':      { 'zh-TW': '推估瀏覽器頁面縮放：<b>{z}%</b>（= window.devicePixelRatio ÷ 該螢幕 devicePixelRatio，僅為推估值）', 'en': 'Estimated browser page zoom: <b>{z}%</b> (= window.devicePixelRatio ÷ screen devicePixelRatio; estimate only)', 'zh-CN': '推估浏览器页面缩放：<b>{z}%</b>（= window.devicePixelRatio ÷ 该屏幕 devicePixelRatio，仅为推估值）' },
  'pat.wmZoomNot100':   { 'zh-TW': '⚠ 瀏覽器縮放看起來不是 100%，請按 Ctrl/⌘ + 0 重設後再重新整理。', 'en': '⚠ Browser zoom does not look like 100%. Press Ctrl/⌘ + 0 to reset, then reload.', 'zh-CN': '⚠ 浏览器缩放看起来不是 100%，请按 Ctrl/⌘ + 0 重设后再刷新。' },
  'pat.wmDenied':       { 'zh-TW': '無法取得（{e}）。可能是使用者拒絕授權、或頁面非 HTTPS 安全來源。', 'en': 'Unavailable ({e}). Permission may have been denied, or the page is not a secure (HTTPS) context.', 'zh-CN': '无法获取（{e}）。可能是用户拒绝授权、或页面非 HTTPS 安全来源。' },

  // ── 縮放警示（pattern v3.7.0）──────────────────────────────
  'pat.lblBrowserZoom': { 'zh-TW': '瀏覽器頁面縮放', 'en': 'Browser page zoom', 'zh-CN': '浏览器页面缩放' },
  'pat.lblBaseDpr':     { 'zh-TW': '扣除縮放後的 dPR', 'en': 'dPR excluding page zoom', 'zh-CN': '扣除缩放后的 dPR' },
  'pat.zwUnknown':      { 'zh-TW': '無法判定', 'en': 'Undetermined', 'zh-CN': '无法判定' },
  'pat.zwTitle': {
    'zh-TW': '⚠ 這個畫面不是 100%',
    'en': '⚠ This display is not at 100%',
    'zh-CN': '⚠ 这个画面不是 100%'
  },
  'pat.zwMsgZoom': {
    'zh-TW': '偵測到<b>瀏覽器頁面縮放 {z}</b>。',
    'en': 'Detected <b>browser page zoom {z}</b>.',
    'zh-CN': '侦测到<b>浏览器页面缩放 {z}</b>。'
  },
  'pat.zwMsgOs': {
    'zh-TW': '偵測到<b>系統顯示縮放</b>：1 個 CSS 像素對應 <b>{d}</b> 個實體像素，不是整數。',
    'en': 'Detected <b>OS display scaling</b>: one CSS pixel maps to <b>{d}</b> physical pixels, which is not an integer.',
    'zh-CN': '侦测到<b>系统显示缩放</b>：1 个 CSS 像素对应 <b>{d}</b> 个物理像素，不是整数。'
  },
  'pat.zwMsgPinch': {
    'zh-TW': '偵測到<b>頁面被雙指縮放（pinch zoom）{v} 倍</b>。',
    'en': 'Detected <b>pinch zoom at {v}×</b>.',
    'zh-CN': '侦测到<b>页面被双指缩放（pinch zoom）{v} 倍</b>。'
  },
  'pat.zwWhy': {
    'zh-TW': '此時畫面上的每一個 pattern 像素<b>無法保證對應 1 個實體像素</b>，會被重新取樣。本工具是拿來做 sub-pixel（次像素）精確度確認的，<b>任何偏移或失真都不能接受</b>，請先改回實際真實的 100% 再繼續。',
    'en': 'In this state each pattern pixel is <b>not guaranteed to map to exactly one physical pixel</b> and will be resampled. This tool is used for sub-pixel accuracy work, where <b>no offset or distortion is acceptable</b>. Please return to a true 100% before continuing.',
    'zh-CN': '此时画面上的每一个 pattern 像素<b>无法保证对应 1 个物理像素</b>，会被重新采样。本工具是拿来做 sub-pixel（次像素）精确度确认的，<b>任何偏移或失真都不能接受</b>，请先改回实际真实的 100% 再继续。'
  },
  'pat.zwRead': {
    'zh-TW': 'outerWidth ÷ innerWidth = {raw} → 瀏覽器縮放 {z}<br>devicePixelRatio = {dpr} → 扣除瀏覽器縮放後 = {base}',
    'en': 'outerWidth ÷ innerWidth = {raw} → page zoom {z}<br>devicePixelRatio = {dpr} → excluding page zoom = {base}',
    'zh-CN': 'outerWidth ÷ innerWidth = {raw} → 浏览器缩放 {z}<br>devicePixelRatio = {dpr} → 扣除浏览器缩放后 = {base}'
  },
  'pat.zwHow': {
    'zh-TW': '<b>怎麼改回實際真實的 100%</b><ul>' +
      '<li><b>瀏覽器縮放</b>：按 <b>Ctrl / ⌘ + 0</b> 重設為 100%。</li>' +
      '<li><b>系統顯示縮放</b>：Windows →「設定 › 系統 › 顯示器 › 縮放」改為 <b>100%</b>；macOS →「系統設定 › 顯示器」選<b>預設值</b>。改完建議重新整理本頁。</li>' +
      '<li>兩者都要，缺一都不算 100%。改好之後這個提示會自動消失。</li></ul>',
    'en': '<b>How to get back to a true 100%</b><ul>' +
      '<li><b>Browser zoom</b>: press <b>Ctrl / ⌘ + 0</b> to reset to 100%.</li>' +
      '<li><b>OS display scaling</b>: Windows → Settings › System › Display › Scale, set to <b>100%</b>; macOS → System Settings › Displays, choose <b>Default</b>. Reloading this page afterwards is recommended.</li>' +
      '<li>Both are required — neither alone counts as 100%. This warning clears itself once they are correct.</li></ul>',
    'zh-CN': '<b>怎么改回实际真实的 100%</b><ul>' +
      '<li><b>浏览器缩放</b>：按 <b>Ctrl / ⌘ + 0</b> 重设为 100%。</li>' +
      '<li><b>系统显示缩放</b>：Windows →「设置 › 系统 › 显示器 › 缩放」改为 <b>100%</b>；macOS →「系统设置 › 显示器」选<b>默认值</b>。改完建议刷新本页。</li>' +
      '<li>两者都要，缺一都不算 100%。改好之后这个提示会自动消失。</li></ul>'
  },
  'pat.zwClose': {
    'zh-TW': '我知道了，關閉這個視窗',
    'en': 'Got it — close this dialog',
    'zh-CN': '我知道了，关闭这个窗口'
  },
  'pat.zwFoot': {
    'zh-TW': '關閉後畫面邊緣的<b>橘色呼吸燈仍會持續提示</b>，直到倍率回到 100%。若你確定這是誤判，關掉即可繼續使用。',
    'en': 'After closing, the <b>orange breathing border stays</b> until the scale returns to 100%. If you are sure this is a false alarm, just close it and carry on.',
    'zh-CN': '关闭后画面边缘的<b>橙色呼吸灯仍会持续提示</b>，直到倍率回到 100%。若你确定这是误判，关掉即可继续使用。'
  },
  'pat.zwBarZoom': {
    'zh-TW': '⚠ 畫面不是 100%（偵測到瀏覽器縮放 {z}）— 點這裡看怎麼改回來',
    'en': '⚠ Display is not at 100% (browser zoom {z}) — tap here for how to fix it',
    'zh-CN': '⚠ 画面不是 100%（侦测到浏览器缩放 {z}）— 点这里看怎么改回来'
  },
  'pat.zwBarOther': {
    'zh-TW': '⚠ 畫面不是實際真實的 100%（系統顯示縮放）— 點這裡看怎麼改回來',
    'en': '⚠ Display is not at a true 100% (OS display scaling) — tap here for how to fix it',
    'zh-CN': '⚠ 画面不是实际真实的 100%（系统显示缩放）— 点这里看怎么改回来'
  },
  'pat.zwTitlePrefix': {
    'zh-TW': '⚠ 非 100% — ', 'en': '⚠ Not 100% — ', 'zh-CN': '⚠ 非 100% — '
  },

  'pat.editorCard':     { 'zh-TW': 'Sub-pixel 編輯（4 px × 4 列）', 'en': 'Sub-pixel Editor (4 px × 4 rows)', 'zh-CN': 'Sub-pixel 编辑（4 px × 4 列）' },
  'pat.selected':       { 'zh-TW': '已選取', 'en': 'Selected', 'zh-CN': '已选取' },
  'pat.subpxUnit':      { 'zh-TW': '個 sub-pixel', 'en': 'sub-pixel(s)', 'zh-CN': '个 sub-pixel' },
  'pat.applyNone':      { 'zh-TW': '（未選取 → 灰階不會套用到任何格子）', 'en': '(nothing selected → the gray level is not applied to any cell)', 'zh-CN': '（未选取 → 灰阶不会套用到任何格子）' },
  'pat.applySel':       { 'zh-TW': '（只套用到選取的 {n} 個）', 'en': '(applies to the {n} selected ones only)', 'zh-CN': '（只套用到选取的 {n} 个）' },
  'pat.selAll':         { 'zh-TW': '全選', 'en': 'Select all', 'zh-CN': '全选' },
  'pat.selLit':         { 'zh-TW': '選取亮組', 'en': 'Select lit group', 'zh-CN': '选取亮组' },
  'pat.selDark':        { 'zh-TW': '選取暗組', 'en': 'Select dark group', 'zh-CN': '选取暗组' },
  'pat.swapGroups':     { 'zh-TW': '亮暗反轉', 'en': 'Swap lit/dark', 'zh-CN': '亮暗反转' },
  'pat.swapTip':        { 'zh-TW': '把亮組 L{l} 與暗組 L{d} 的灰階值互換；連按兩次回到原狀',
                          'en': 'Swap the gray levels of the lit group (L{l}) and the dark group (L{d}); pressing twice returns to the original',
                          'zh-CN': '把亮组 L{l} 与暗组 L{d} 的灰阶值互换；连按两次回到原状' },
  'pat.selLitTip':      { 'zh-TW': '選取目前較亮的 L{v}（{n} 格）', 'en': 'Select the brighter level L{v} ({n} cells)', 'zh-CN': '选取目前较亮的 L{v}（{n} 格）' },
  /* v3.8.0 欄位互換（顯示階段的整數欄位重排，三種模式一體適用） */
  'pat.csSub':          { 'zh-TW': 'Subpixel 奇偶互換', 'en': 'Subpixel odd/even swap', 'zh-CN': 'Subpixel 奇偶互换' },
  'pat.csPx':           { 'zh-TW': 'Pixel 奇偶互換', 'en': 'Pixel odd/even swap', 'zh-CN': 'Pixel 奇偶互换' },
  'pat.csSubTip':       { 'zh-TW': '相鄰兩個 subpixel 欄兩兩對調：欄 1↔2、3↔4、5↔6…。最右邊湊不成一對的那一欄保持原樣。兩顆都開時的管線順序固定為「先 Pixel、後 Subpixel」，與按下的先後無關',
                          'en': 'Swap adjacent subpixel columns in pairs: 1↔2, 3↔4, 5↔6… A trailing column with no partner is left untouched. With both buttons on, the pipeline order is fixed as Pixel first, then Subpixel, regardless of which was pressed first',
                          'zh-CN': '相邻两个 subpixel 栏两两对调：栏 1↔2、3↔4、5↔6…。最右边凑不成一对的那一栏保持原样。两颗都开时的管线顺序固定为「先 Pixel、后 Subpixel」，与按下的先后无关' },
  'pat.csPxTip':        { 'zh-TW': '相鄰兩個 pixel（各三欄）整組對調：(1,2,3)↔(4,5,6)、(7,8,9)↔(10,11,12)…，組內順序不變。最右邊湊不成一組的那個 pixel 保持原樣',
                          'en': 'Swap adjacent pixels (three columns each) as whole groups: (1,2,3)↔(4,5,6), (7,8,9)↔(10,11,12)… Order inside a group is unchanged. A trailing pixel with no partner is left untouched',
                          'zh-CN': '相邻两个 pixel（各三栏）整组对调：(1,2,3)↔(4,5,6)、(7,8,9)↔(10,11,12)…，组内顺序不变。最右边凑不成一组的那个 pixel 保持原样' },
  'pat.selDarkTip':     { 'zh-TW': '選取目前較暗的 L{v}（{n} 格）', 'en': 'Select the darker level L{v} ({n} cells)', 'zh-CN': '选取目前较暗的 L{v}（{n} 格）' },
  'pat.grpMultiTip':    { 'zh-TW': '目前有 {n} 種亮度，只有恰好兩種時才分得出亮暗組', 'en': 'There are {n} gray levels right now; lit/dark only applies when there are exactly two', 'zh-CN': '目前有 {n} 种亮度，只有恰好两种时才分得出亮暗组' },
  'pat.grpOneTip':      { 'zh-TW': '目前 48 格都是同一個灰階，沒有亮暗之分', 'en': 'All 48 cells are the same gray level right now, so there is no lit/dark', 'zh-CN': '目前 48 格都是同一个灰阶，没有亮暗之分' },
  'pat.grpLegend':      { 'zh-TW': '● ＝ 亮組 L{l}（{nl} 格）／無標記 ＝ 暗組 L{d}（{nd} 格），每次改值即時重算。',
                          'en': '● = lit group L{l} ({nl} cells) / unmarked = dark group L{d} ({nd} cells), recomputed on every edit.',
                          'zh-CN': '● ＝ 亮组 L{l}（{nl} 格）／无标记 ＝ 暗组 L{d}（{nd} 格），每次改值即时重算。' },
  'pat.grpMulti':       { 'zh-TW': '目前有 {n} 種亮度，只有恰好兩種時才分得出亮暗組。',
                          'en': 'There are {n} gray levels right now; lit/dark only applies when there are exactly two.',
                          'zh-CN': '目前有 {n} 种亮度，只有恰好两种时才分得出亮暗组。' },
  'pat.grpOne':         { 'zh-TW': '目前 48 格都是同一個灰階，沒有亮暗之分。',
                          'en': 'All 48 cells are the same gray level right now, so there is no lit/dark.',
                          'zh-CN': '目前 48 格都是同一个灰阶，没有亮暗之分。' },
  'pat.selNone':        { 'zh-TW': '取消選取', 'en': 'Clear', 'zh-CN': '取消选取' },
  'pat.levelLabel':     { 'zh-TW': '灰階 L0 – L255（點 sub-pixel 即套用此值）', 'en': 'Gray level L0 – L255 (tap a sub-pixel to apply this value)', 'zh-CN': '灰阶 L0 – L255（点 sub-pixel 即应用此值）' },
  'pat.levelHint':      { 'zh-TW': '先設好上面的灰階值，再點格子就會直接套用；按住拖曳可連續塗刷。點 L1~L4 / px1~px4 / R、G、B 標題是「選取」整組，選好後改灰階即批次套用。未選取時拉霸只設定筆刷值，不會動到任何格子。', 'en': 'Set the gray level above, then tap a cell to apply it immediately; press and drag to paint continuously. Tapping the L1–L4 / px1–px4 / R, G, B headers selects a whole group instead — change the gray level afterwards to apply it in batch. With nothing selected the slider only sets the brush value and does not touch any cell.', 'zh-CN': '先设好上面的灰阶值，再点格子就会直接应用；按住拖曳可连续涂刷。点 L1~L4 / px1~px4 / R、G、B 标题是「选取」整组，选好后改灰阶即批次应用。未选取时拉霸只设定笔刷值，不会动到任何格子。' },
  'pat.viewCard':       { 'zh-TW': '預覽與全畫面顯示', 'en': 'Preview & Full-screen', 'zh-CN': '预览与全画面显示' },
  'pat.previewHint':    { 'zh-TW': '預覽為放大顯示（3×3 個 pattern 平鋪），非 1:1 比例。', 'en': 'Preview is magnified (3×3 tiles) and is not 1:1.', 'zh-CN': '预览为放大显示（3×3 个 pattern 平铺），非 1:1 比例。' },
  'pat.panelSideLabel': { 'zh-TW': '全畫面時控制面板位置', 'en': 'Control panel side in full-screen', 'zh-CN': '全画面时控制面板位置' },
  'pat.sideLeft':       { 'zh-TW': '靠左', 'en': 'Left', 'zh-CN': '靠左' },
  'pat.sideRight':      { 'zh-TW': '靠右', 'en': 'Right', 'zh-CN': '靠右' },
  'pat.fsEnter':        { 'zh-TW': '⛶ 進入全畫面顯示', 'en': '⛶ Enter full-screen', 'zh-CN': '⛶ 进入全画面显示' },
  'pat.fsHint': {
    'zh-TW': '全畫面時<b>畫面上不會有任何 UI</b>（純 pattern，1 pattern 像素 = 1 實體像素）。<b>滑鼠移到該側最邊緣</b>（約 26 px 內）控制面板才會滑出，滑鼠離開就完全消失；觸控裝置請<b>從該側邊緣往內滑</b>。<br>離開方式：面板中的「✕ 離開全畫面」按鈕、鍵盤 <b>Esc</b>，或按 <b>F</b>。',
    'en': 'In full-screen <b>nothing is drawn over the pattern</b> (1 pattern pixel = 1 physical pixel). <b>Move the mouse to that edge</b> (within ~26 px) to slide the control panel out; it disappears completely once the mouse leaves. On touch devices, <b>swipe in from that edge</b>.<br>To exit: the “✕ Exit full-screen” button in the panel, the <b>Esc</b> key, or <b>F</b>.',
    'zh-CN': '全画面时<b>画面上不会有任何 UI</b>（纯 pattern，1 pattern 像素 = 1 物理像素）。<b>鼠标移到该侧最边缘</b>（约 26 px 内）控制面板才会滑出，鼠标离开就完全消失；触控设备请<b>从该侧边缘往内滑</b>。<br>离开方式：面板中的「✕ 离开全画面」按钮、键盘 <b>Esc</b>，或按 <b>F</b>。'
  },
  'pat.fsPanelTitle':   { 'zh-TW': '畫面產生器', 'en': 'Pattern Generator', 'zh-CN': '画面产生器' },
  'pat.fsSwitchSide':   { 'zh-TW': '⇄ 切換面板左右', 'en': '⇄ Switch panel side', 'zh-CN': '⇄ 切换面板左右' },
  'pat.fsExit':         { 'zh-TW': '✕ 離開全畫面', 'en': '✕ Exit full-screen', 'zh-CN': '✕ 离开全画面' },
  'pat.fsInfo':         { 'zh-TW': '繪製解析度：<b>{w} × {h}</b> 裝置像素 · dPR <b>{d}</b>', 'en': 'Render size: <b>{w} × {h}</b> device px · dPR <b>{d}</b>', 'zh-CN': '绘制分辨率：<b>{w} × {h}</b> 设备像素 · dPR <b>{d}</b>' },
  'pat.fsInfoOk':       { 'zh-TW': '✔ dPR 為整數，1 pattern 像素 = 1 實體像素。', 'en': '✔ dPR is an integer: 1 pattern pixel = 1 physical pixel.', 'zh-CN': '✔ dPR 为整数，1 pattern 像素 = 1 物理像素。' },
  'pat.fsInfoScreen':   { 'zh-TW': '螢幕解析度：<b>{w} × {h}</b> 實體像素', 'en': 'Screen resolution: <b>{w} × {h}</b> physical px', 'zh-CN': '屏幕分辨率：<b>{w} × {h}</b> 物理像素' },
  'pat.fsInfoFull':     { 'zh-TW': '✔ 繪圖區 = 整個螢幕，已是完整 1:1 滿版。', 'en': '✔ Drawing area = whole screen: true 1:1 full-screen.', 'zh-CN': '✔ 绘图区 = 整个屏幕，已是完整 1:1 满版。' },
  'pat.fsInfoShort':    { 'zh-TW': '⚠ 繪圖區比螢幕小 {dx} × {dy} px（被瀏覽器工具列／系統列佔用），這部分網頁拿不到。', 'en': '⚠ Drawing area is {dx} × {dy} px smaller than the screen (taken by browser/system bars); a web page cannot reclaim it.', 'zh-CN': '⚠ 绘图区比屏幕小 {dx} × {dy} px（被浏览器工具栏／系统栏占用），这部分网页拿不到。' },
  'pat.fsInfoWarn':     { 'zh-TW': '⚠ dPR 非整數，畫面會被重新取樣，非 1:1。', 'en': '⚠ dPR is not an integer: the output is resampled and is not 1:1.', 'zh-CN': '⚠ dPR 非整数，画面会被重新采样，非 1:1。' },

  /* ─── 測試畫面選單（選單項目一律英文原文，不進 i18n） ─── */
  'pat.menuLabel':      { 'zh-TW': '測試畫面選單（階層式）', 'en': 'Test Pattern Menu (hierarchical)', 'zh-CN': '测试画面选单（阶层式）' },
  'pat.menuBtn':        { 'zh-TW': '▾ Test Pattern Menu', 'en': '▾ Test Pattern Menu', 'zh-CN': '▾ Test Pattern Menu' },
  'pat.menuHint':       {
    'zh-TW': '選單結構重建自面板廠測試程式的原始選單（21 個頂層項目、24 個子項目），選單文字保留英文原文不翻譯。<b>全畫面時按滑鼠右鍵</b>可叫出同一套選單；選單開著時 Esc 只關選單，選單關著時 Esc 才離開全畫面。',
    'en': 'The menu structure is reconstructed from the original panel-maker test program menu (21 top-level items, 24 sub-items); menu labels keep the original English wording. <b>Right-click in full-screen</b> to bring up the same menu. While the menu is open, Esc closes only the menu; Esc exits full-screen only when the menu is closed.',
    'zh-CN': '选单结构重建自面板厂测试程序的原始选单（21 个顶层项目、24 个子项目），选单文字保留英文原文不翻译。<b>全画面时按鼠标右键</b>可叫出同一套选单；选单开着时 Esc 只关选单，选单关着时 Esc 才离开全画面。'
  },
  'pat.gridOK': {
    'zh-TW': '編輯區顯示的是 <b>{n}</b> 的<b>重複單元</b>（水平 {w} px × 垂直 {h} 列，含目前灰階）。可直接接著手動微調。',
    'en': 'The editor shows the <b>repeating unit</b> of <b>{n}</b> ({w} px wide × {h} rows, at the current gray level). You can fine-tune it by hand from here.',
    'zh-CN': '编辑区显示的是 <b>{n}</b> 的<b>重复单元</b>（水平 {w} px × 垂直 {h} 列，含当前灰阶）。可直接接着手动微调。'
  },
  'pat.gridNA': {
    'zh-TW': '<b>{n}</b> 不是 4 px × 4 列的週期性圖樣，<b>編輯區不適用</b>（已清空，不顯示上一個畫面的殘值）。點任一格即可回到手動編輯。',
    'en': '<b>{n}</b> is not a 4 px × 4 row periodic pattern, so the <b>editor does not apply</b> (cleared, so no leftover values from the previous pattern). Tap any cell to return to manual editing.',
    'zh-CN': '<b>{n}</b> 不是 4 px × 4 列的周期性图样，<b>编辑区不适用</b>（已清空，不显示上一个画面的残值）。点任一格即可回到手动编辑。'
  },
  /* 全畫面鍵盤說明（鍵名本身不翻譯） */
  'pat.keyHelpTitle':   { 'zh-TW': '全畫面鍵盤（依原程式，每張畫面不同）', 'en': 'Full-screen keys (per the original program; differs by pattern)', 'zh-CN': '全画面键盘（依原程序，每张画面不同）' },
  'pat.keyColor':       { 'zh-TW': '選顏色', 'en': 'pick colour', 'zh-CN': '选颜色' },
  'pat.keyColorNo5':    { 'zh-TW': '選顏色（5 = Black 在此畫面無作用）', 'en': 'pick colour (5 = Black has no effect here)', 'zh-CN': '选颜色（5 = Black 在此画面无作用）' },
  'pat.keyBandMode':    { 'zh-TW': '回到 4 帶 W/R/G/B 模式', 'en': 'back to the 4-band W/R/G/B mode', 'zh-CN': '回到 4 带 W/R/G/B 模式' },
  'pat.keyVariant':     { 'zh-TW': '切換變體', 'en': 'switch variant', 'zh-CN': '切换变体' },
  'pat.keyLevel':       { 'zh-TW': '灰階 ±1（按住 Shift 為 ±16）', 'en': 'gray level ±1 (±16 with Shift)', 'zh-CN': '灰阶 ±1（按住 Shift 为 ±16）' },
  'pat.keyLevelHiLo':   { 'zh-TW': '灰階直接設為 255 / 0', 'en': 'set gray level to 255 / 0', 'zh-CN': '灰阶直接设为 255 / 0' },
  'pat.keyInvert':      { 'zh-TW': '反相', 'en': 'invert', 'zh-CN': '反相' },
  'pat.keyInvertNA':    { 'zh-TW': 'Space 在此畫面沒有作用（原程式即如此）', 'en': 'Space has no effect on this pattern (same as the original program)', 'zh-CN': 'Space 在此画面没有作用（原程序即如此）' },
  'pat.keyGradDir':     { 'zh-TW': '漸層方向反轉', 'en': 'reverse the gradient direction', 'zh-CN': '渐层方向反转' },
  'pat.keyLayout':      { 'zh-TW': '切換版面', 'en': 'switch layout', 'zh-CN': '切换版面' },
  'pat.keyOnlySpace':   { 'zh-TW': '此畫面只有 Space 有作用（原程式即如此）', 'en': 'Only Space does anything on this pattern (same as the original program)', 'zh-CN': '此画面只有 Space 有作用（原程序即如此）' },
  'pat.keyCkN':         { 'zh-TW': '格數往上 / 往下一段（2…256）', 'en': 'grid count up / down one step (2…256)', 'zh-CN': '格数往上 / 往下一段（2…256）' },
  'pat.keyCkNo18':      { 'zh-TW': 'Checker 是純黑白，1–8 選色與左右鍵沒有作用（原程式即如此）', 'en': 'Checker is pure black/white: 1–8 and the left/right keys do nothing (same as the original program)', 'zh-CN': 'Checker 是纯黑白，1–8 选色与左右键没有作用（原程序即如此）' },
  'pat.keyXY':          { 'zh-TW': '移動準星 1 px（按住 Shift 為 16 px）', 'en': 'move the crosshair by 1 px (16 px with Shift)', 'zh-CN': '移动准星 1 px（按住 Shift 为 16 px）' },
  'pat.keyCtMode':      { 'zh-TW': '切換要調整的項目', 'en': 'switch which item you are adjusting', 'zh-CN': '切换要调整的项目' },
  'pat.keyCtGrow':      { 'zh-TW': '內框往上 / 往右長（下緣與左緣固定），Shift 為 16 px', 'en': 'grow the inner box upward / rightward (bottom and left stay put), 16 px with Shift', 'zh-CN': '内框往上 / 往右长（下缘与左缘固定），Shift 为 16 px' },
  'pat.keyCtShrink':    { 'zh-TW': '內框縮小，寬高下限 24 px，Shift 為 16 px', 'en': 'shrink the inner box, minimum 24 px, 16 px with Shift', 'zh-CN': '内框缩小，宽高下限 24 px，Shift 为 16 px' },
  'pat.keyCtPos':       { 'zh-TW': '移動內框位置（無邊界限制），Shift 為 16 px', 'en': 'move the inner box (no bounds), 16 px with Shift', 'zh-CN': '移动内框位置（无边界限制），Shift 为 16 px' },
  'pat.keyExt':         { 'zh-TW': '本站擴充，原程式沒有', 'en': 'our addition; not in the original', 'zh-CN': '本站扩充，原程序没有' },
  'pat.keyXYFree':      { 'zh-TW': '準星可以移出畫面，但四邊各最多超出 10 px（本站設計；原程式沒有邊界限制）', 'en': 'The crosshair may go off-screen by at most 10 px on each side (our design; the original program has no bounds at all)', 'zh-CN': '准星可以移出画面，但四边各最多超出 10 px（本站设计；原程序没有边界限制）' },
  'pat.keyCenter5':     { 'zh-TW': 'Center 按 5 沒有作用（原程式即如此）', 'en': 'On Center, 5 does nothing (same as the original program)', 'zh-CN': 'Center 按 5 没有作用（原程序即如此）' },
  'pat.keyNoShift':     { 'zh-TW': '此畫面的按鍵不吃 Shift', 'en': 'Shift has no effect on this pattern', 'zh-CN': '此画面的按键不吃 Shift' },
  'pat.ctW':            { 'zh-TW': 'Inner Width（px）', 'en': 'Inner Width (px)', 'zh-CN': 'Inner Width（px）' },
  'pat.ctH':            { 'zh-TW': 'Inner Height（px）', 'en': 'Inner Height (px)', 'zh-CN': 'Inner Height（px）' },
  'pat.ctLeft':         { 'zh-TW': 'Inner Left（px）', 'en': 'Inner Left (px)', 'zh-CN': 'Inner Left（px）' },
  'pat.ctTop':          { 'zh-TW': 'Inner Top（px）', 'en': 'Inner Top (px)', 'zh-CN': 'Inner Top（px）' },
  'pat.keyCharMode':    { 'zh-TW': '切換文字灰階分佈（全亮 / 上暗下亮 / 上亮下暗）', 'en': 'cycle the text gray distribution (flat / dark-to-bright / bright-to-dark)', 'zh-CN': '切换文字灰阶分布（全亮 / 上暗下亮 / 上亮下暗）' },
  'pat.keySixBit':      { 'zh-TW': '切換 6-bit / 8-bit', 'en': 'toggle 6-bit / 8-bit', 'zh-CN': '切换 6-bit / 8-bit' },
  'pat.keyLumStart':    { 'zh-TW': '起始值 ±1（按住 Shift 為 ±7）', 'en': 'start value ±1 (±7 with Shift)', 'zh-CN': '起始值 ±1（按住 Shift 为 ±7）' },
  'pat.keyLumN':        { 'zh-TW': '欄數 ±1（按住 Shift 為 ±7）', 'en': 'column count ±1 (±7 with Shift)', 'zh-CN': '栏数 ±1（按住 Shift 为 ±7）' },
  'pat.keyNone':        { 'zh-TW': '此畫面沒有任何按鍵操作，只有 Esc 可離開（原程式即如此）', 'en': 'This pattern has no key controls; only Esc exits (same as the original program)', 'zh-CN': '此画面没有任何按键操作，只有 Esc 可离开（原程序即如此）' },

  /* ★ 遮罩：本站設計，原程式沒有這個功能 */
  'pat.maskCard':       { 'zh-TW': '遮罩（只露出指定等份）', 'en': 'Mask (reveal only selected segments)', 'zh-CN': '遮罩（只露出指定等份）' },
  'pat.maskOn':         { 'zh-TW': '啟用遮罩', 'en': 'Enable mask', 'zh-CN': '启用遮罩' },
  'pat.maskHint': {
    'zh-TW': '把畫面左右平分成 N 等份，只露出勾選的等份，其餘蓋掉；也可以再加上垂直等份。<b>此功能為本站設計，原程式沒有。</b>遮罩只疊在畫面上，關掉後畫面與沒有遮罩時完全相同，也不會影響上方的 sub-pixel 編輯區。',
    'en': 'Splits the screen into N equal columns and reveals only the ones you tick, covering the rest; vertical segments can be added too. <b>This is our own feature; the original program does not have it.</b> The mask is only an overlay — turning it off restores the picture exactly, and it never affects the sub-pixel editor above.',
    'zh-CN': '把画面左右平分成 N 等份，只露出勾选的等份，其余盖掉；也可以再加上垂直等份。<b>此功能为本站设计，原程序没有。</b>遮罩只叠在画面上，关掉后画面与没有遮罩时完全相同，也不会影响上方的 sub-pixel 编辑区。'
  },
  'pat.maskHN':         { 'zh-TW': '水平等份數', 'en': 'Horizontal segments', 'zh-CN': '水平等份数' },
  'pat.maskHSel':       { 'zh-TW': '露出哪幾等份（可複選）', 'en': 'Which segments to reveal (multi-select)', 'zh-CN': '露出哪几等份（可复选）' },
  'pat.maskVOn':        { 'zh-TW': '同時使用垂直等份', 'en': 'Also use vertical segments', 'zh-CN': '同时使用垂直等份' },
  'pat.maskVN':         { 'zh-TW': '垂直等份數', 'en': 'Vertical segments', 'zh-CN': '垂直等份数' },
  'pat.maskVSel':       { 'zh-TW': '露出哪幾等份（可複選）', 'en': 'Which segments to reveal (multi-select)', 'zh-CN': '露出哪几等份（可复选）' },
  'pat.maskCombine':    { 'zh-TW': '水平與垂直的組合方式', 'en': 'How horizontal and vertical combine', 'zh-CN': '水平与垂直的组合方式' },
  'pat.maskAnd':        { 'zh-TW': '交集（露出矩形）', 'en': 'Intersection (reveals a rectangle)', 'zh-CN': '交集（露出矩形）' },
  'pat.maskOr':         { 'zh-TW': '聯集（露出十字）', 'en': 'Union (reveals a cross)', 'zh-CN': '联集（露出十字）' },
  'pat.maskPad':        { 'zh-TW': '露出區外緣調整（正 = 外擴、負 = 內縮，px）', 'en': 'Reveal edge adjust (positive = expand, negative = shrink, px)', 'zh-CN': '露出区外缘调整（正 = 外扩、负 = 内缩，px）' },
  'pat.maskPadHint':    { 'zh-TW': '作用在整段連續露出區的外緣，所以露出相鄰的等份（例如 2、3）時中間不會出現接縫。', 'en': 'Applied to the outer edges of each continuous revealed run, so adjacent segments (say 2 and 3) show no seam between them.', 'zh-CN': '作用在整段连续露出区的外缘，所以露出相邻的等份（例如 2、3）时中间不会出现接缝。' },
  'pat.maskFill':       { 'zh-TW': '遮罩內容', 'en': 'Mask content', 'zh-CN': '遮罩内容' },
  'pat.maskFillColor':  { 'zh-TW': '單色', 'en': 'Solid colour', 'zh-CN': '单色' },
  'pat.maskFillPat':    { 'zh-TW': '另一個畫面', 'en': 'Another pattern', 'zh-CN': '另一个画面' },
  'pat.maskColor':      { 'zh-TW': '遮罩顏色', 'en': 'Mask colour', 'zh-CN': '遮罩颜色' },
  'pat.maskLevel':      { 'zh-TW': '遮罩灰階', 'en': 'Mask gray level', 'zh-CN': '遮罩灰阶' },
  'pat.maskPat':        { 'zh-TW': '遮罩用的畫面', 'en': 'Pattern used as the mask', 'zh-CN': '遮罩用的画面' },

  /* 左上角資訊框：內容照原程式格式不翻譯，只有標題與「隱藏」是說明性文字 */
  'pat.infoTitle':      { 'zh-TW': '左上角資訊框（全畫面時顯示）', 'en': 'Top-left info box (shown in full-screen)', 'zh-CN': '左上角信息框（全画面时显示）' },
  'pat.infoHidden':     { 'zh-TW': '此畫面不顯示（原程式即隱藏）', 'en': 'not shown on this pattern (hidden in the original program)', 'zh-CN': '此画面不显示（原程序即隐藏）' },

  'pat.patCur':         { 'zh-TW': '目前畫面', 'en': 'Current pattern', 'zh-CN': '当前画面' },
  'pat.patBack':        { 'zh-TW': '回到 Sub-pixel 編輯', 'en': 'Back to sub-pixel editor', 'zh-CN': '回到 Sub-pixel 编辑' },
  'pat.patColor':       { 'zh-TW': '顏色（對應原程式數字鍵 1–8）', 'en': 'Color (original program number keys 1–8)', 'zh-CN': '颜色（对应原程序数字键 1–8）' },
  'pat.patLevel':       { 'zh-TW': '灰階 Level（L0 – L255）', 'en': 'Gray level (L0 – L255)', 'zh-CN': '灰阶 Level（L0 – L255）' },
  'pat.patInvert':      { 'zh-TW': 'Space 反相', 'en': 'Space: invert', 'zh-CN': 'Space 反相' },
  'pat.patPrev':        { 'zh-TW': '上一個變體', 'en': 'Previous variant', 'zh-CN': '上一个变体' },
  'pat.patNext':        { 'zh-TW': '下一個變體', 'en': 'Next variant', 'zh-CN': '下一个变体' },
  'pat.ckN':            { 'zh-TW': 'Checker 格數（n × n）', 'en': 'Checker grid (n × n)', 'zh-CN': 'Checker 格数（n × n）' },
  'pat.ctTitle':        { 'zh-TW': 'Cross Talk 參數', 'en': 'Cross Talk parameters', 'zh-CN': 'Cross Talk 参数' },
  'pat.ctOuterColor':   { 'zh-TW': 'Outer Color', 'en': 'Outer Color', 'zh-CN': 'Outer Color' },
  'pat.ctOuterLevel':   { 'zh-TW': 'Outer Level', 'en': 'Outer Level', 'zh-CN': 'Outer Level' },
  'pat.ctInnerColor':   { 'zh-TW': 'Inner Color', 'en': 'Inner Color', 'zh-CN': 'Inner Color' },
  'pat.ctInnerLevel':   { 'zh-TW': 'Inner Level', 'en': 'Inner Level', 'zh-CN': 'Inner Level' },
  'pat.ctPos':          { 'zh-TW': 'Inner Position X / Y（%）', 'en': 'Inner Position X / Y (%)', 'zh-CN': 'Inner Position X / Y（%）' },
  'pat.rtTitle':        { 'zh-TW': 'Response Time 參數', 'en': 'Response Time parameters', 'zh-CN': 'Response Time 参数' },
  'pat.xyHint':         { 'zh-TW': '全畫面時用方向鍵移動準星，Space 黑白反相。', 'en': 'In full-screen, move the crosshair with the arrow keys; Space inverts black/white.', 'zh-CN': '全画面时用方向键移动准星，Space 黑白反相。' },
  'pat.fsMenuBtn':      { 'zh-TW': '☰ 測試畫面選單', 'en': '☰ Test Pattern Menu', 'zh-CN': '☰ 测试画面选单' },
  'pat.notePhase':      {
    'zh-TW': '<b>相位說明</b>：反組譯結果為「<b>R 不亮</b>、G 亮、B 不亮…」起頭（原程式偶數位置畫 G）。若需要「<b>R 亮</b>」起頭，按 <b>Space</b>（或上方「Space 反相」）切換相位，兩種相位都拿得到。',
    'en': '<b>Phase note:</b> the disassembly starts with <b>R off</b>, G on, B off… (the original program paints G at even positions). For a sequence starting with <b>R on</b>, press <b>Space</b> (or the invert button above) — both phases are available.',
    'zh-CN': '<b>相位说明</b>：反汇编结果为「<b>R 不亮</b>、G 亮、B 不亮…」起头（原程序偶数位置画 G）。若需要「<b>R 亮</b>」起头，按 <b>Space</b>（或上方「Space 反相」）切换相位，两种相位都拿得到。'
  },
  'pat.note12h':        {
    'zh-TW': '<b>語意待確認</b>：此變體的起始相位與步進已從原程式讀出並照實實作，但讀出的結果與 <b>2V 2H</b> 只差 1 px 水平相位，與名稱暗示的「1+2 混合」對不起來。此處<b>不做臆測</b>，畫面即為原程式參數的忠實還原。',
    'en': '<b>Semantics unconfirmed:</b> the start phase and step of this variant were read from the original program and implemented literally, but the result differs from <b>2V 2H</b> only by a 1 px horizontal phase, which does not match the “1+2 mix” the name suggests. No guess is made here — the output is a faithful reproduction of the original parameters.',
    'zh-CN': '<b>语意待确认</b>：此变体的起始相位与步进已从原程序读出并照实实作，但读出的结果与 <b>2V 2H</b> 只差 1 px 水平相位，与名称暗示的「1+2 混合」对不起来。此处<b>不做臆测</b>，画面即为原程序参数的忠实还原。'
  },
  'pat.noteVert':       {
    'zh-TW': '原程式此畫面硬編碼 480 × 800（只畫左上角）。此處<b>改用實際畫面尺寸</b>繪製整個畫面。',
    'en': 'The original program hard-codes 480 × 800 for this pattern (only the top-left corner is painted). Here it is drawn across the <b>actual screen size</b> instead.',
    'zh-CN': '原程序此画面硬编码 480 × 800（只画左上角）。此处<b>改用实际画面尺寸</b>绘制整个画面。'
  },

  // v4.30.1（Bruce 2026-08-27）：工具名 →「面板訊號模擬與取樣」（與 home.wfgTitle 同步）。
  'wfg.title':        { 'zh-TW': '面板訊號模擬與取樣', 'en': 'Panel Signal Simulation & Sampling', 'zh-CN': '面板信号仿真与取样' },
  'wfg.subtitle':       { 'zh-TW': 'Phase Counter Timing 信號波形模擬', 'en': 'Phase Counter Timing Signal Waveform Simulator', 'zh-CN': 'Phase Counter Timing 信号波形仿真' },
  // 🔴 v4.30.1（Bruce 2026-08-27）：分頁改名為「面板訊號模擬」（舊名見 CHANGELOG v4.30.1）。
  // 🔴 這個**沒有**「與取樣」三個字，與上面的 wfg.title 是兩個不同的名稱，不要弄混。
  'wfg.modeTcon':       { 'zh-TW': '面板訊號模擬', 'en': 'Panel Signal Simulation', 'zh-CN': '面板信号仿真' },
  'wfg.modeLa':         { 'zh-TW': 'LA分析器', 'en': 'LA Analyzer', 'zh-CN': 'LA分析器' },
  'wfg.laGrpPreset':    { 'zh-TW': '預設', 'en': 'Preset', 'zh-CN': '预设' },
  'wfg.laGrpSample':    { 'zh-TW': '取樣', 'en': 'Sample', 'zh-CN': '采样' },
  'wfg.laGrpRun':       { 'zh-TW': '執行', 'en': 'Run', 'zh-CN': '执行' },
  'wfg.laGrpFile':      { 'zh-TW': '檔案', 'en': 'File', 'zh-CN': '文件' },
  /* 🔴 WFG 分頁專用。**不能直接改 wfg.laGrpFile** —— 那個 key 是 WFG 與 LA 共用的，
     改下去 LA 分頁的「檔案」group 會一起被改掉（Bruce 2026-08-22 指定 LA 維持原名）。 */
  'wfg.grpWaveform':    { 'zh-TW': '波形', 'en': 'Waveform', 'zh-CN': '波形' },
  'wfg.laGrpView':      { 'zh-TW': '檢視', 'en': 'View', 'zh-CN': '查看' },
  'wfg.laGrpPwm':       { 'zh-TW': 'PWM', 'en': 'PWM', 'zh-CN': 'PWM' },
  'wfg.laGrpCursor':    { 'zh-TW': '游標', 'en': 'Cursor', 'zh-CN': '光标' },
  'wfg.laLinkBtnTitle': { 'zh-TW': '硬體連線 ON/OFF：按下=向裝置搶回控制權（claim），燈號轉綠 ON；再按=釋放（讓原廠 UI 接手），轉灰 OFF。若被其他程式占用則維持灰 OFF 並顯示訊息。', 'en': 'Hardware link ON/OFF: press to claim the device (take control back, LED turns green ON); press again to release (grey OFF). Stays grey OFF with a message if another app holds the device.', 'zh-CN': '硬件连线 ON/OFF：按下=向设备抢回控制权（claim），灯号转绿 ON；再按=释放（让原厂 UI 接手），转灰 OFF。若被其他程序占用则维持灰 OFF 并显示讯息。' },
  'wfg.laLinkOff':      { 'zh-TW': '連線', 'en': 'Link', 'zh-CN': '连线' },
  'wfg.laLinkOn':       { 'zh-TW': '已連線', 'en': 'Linked', 'zh-CN': '已连线' },
  'wfg.laAcqTitle':     { 'zh-TW': '取樣設定', 'en': 'Acquisition Settings', 'zh-CN': '采样设定' },
  'wfg.laModel':        { 'zh-TW': 'Device Model', 'en': 'Device Model', 'zh-CN': 'Device Model' },
  'wfg.laSampleRate':   { 'zh-TW': 'Sampling Rate', 'en': 'Sampling Rate', 'zh-CN': 'Sampling Rate' },
  'wfg.laDepth':        { 'zh-TW': 'Sampling Depth', 'en': 'Sampling Depth', 'zh-CN': 'Sampling Depth' },
  'wfg.laAcqMode':      { 'zh-TW': 'Acquisition Mode', 'en': 'Acquisition Mode', 'zh-CN': 'Acquisition Mode' },
  'wfg.laSingle':       { 'zh-TW': '單次取樣', 'en': 'Single', 'zh-CN': '单次采样' },
  'wfg.laRepeat':       { 'zh-TW': '循環取樣', 'en': 'Repeat', 'zh-CN': '循环采样' },
  'wfg.laRepeatPolicy': { 'zh-TW': 'Repeat Refresh', 'en': 'Repeat Refresh', 'zh-CN': 'Repeat Refresh' },
  'wfg.laRepeatAlways': { 'zh-TW': '不論是否觸發都刷新', 'en': 'Refresh even without trigger', 'zh-CN': '不论是否触发都刷新' },
  'wfg.laRepeatTriggered': { 'zh-TW': '只有觸發後刷新', 'en': 'Refresh only after trigger', 'zh-CN': '只有触发后刷新' },
  'wfg.laTriggerPosition': { 'zh-TW': '觸發位置 (%)', 'en': 'Trigger Position (%)', 'zh-CN': '触发位置 (%)' },
  'wfg.laThreshold':    { 'zh-TW': 'Threshold', 'en': 'Threshold', 'zh-CN': 'Threshold' },
  'wfg.laTriggerTitle': { 'zh-TW': 'Trigger 設定', 'en': 'Trigger Settings', 'zh-CN': 'Trigger 设定' },
  'wfg.laTriggerChannel': { 'zh-TW': 'Trigger Channel', 'en': 'Trigger Channel', 'zh-CN': 'Trigger Channel' },
  'wfg.laTriggerEdge':  { 'zh-TW': 'Trigger Edge', 'en': 'Trigger Edge', 'zh-CN': 'Trigger Edge' },
  'wfg.laRising':       { 'zh-TW': '正緣', 'en': 'Rising', 'zh-CN': '正缘' },
  'wfg.laFalling':      { 'zh-TW': '負緣', 'en': 'Falling', 'zh-CN': '负缘' },
  'wfg.laChannels':     { 'zh-TW': 'Enabled Channels', 'en': 'Enabled Channels', 'zh-CN': 'Enabled Channels' },
  'wfg.laCheckEnv':     { 'zh-TW': '檢查環境', 'en': 'Check Environment', 'zh-CN': '检查环境' },
  'wfg.laConnect':      { 'zh-TW': '連線測試', 'en': 'Connect Test', 'zh-CN': '连线测试' },
  'wfg.laStart':        { 'zh-TW': '開始擷取', 'en': 'Start Capture', 'zh-CN': '开始采集' },
  'wfg.laStop':         { 'zh-TW': '停止', 'en': 'Stop', 'zh-CN': '停止' },
  'wfg.laCopyLog':      { 'zh-TW': '複製 Log', 'en': 'Copy Log', 'zh-CN': '复制 Log' },
  'wfg.laBrowser':      { 'zh-TW': 'Browser', 'en': 'Browser', 'zh-CN': 'Browser' },
  'wfg.laBridge':       { 'zh-TW': 'USB Interface', 'en': 'USB Interface', 'zh-CN': 'USB Interface' },
  'wfg.laDevice':       { 'zh-TW': 'Device', 'en': 'Device', 'zh-CN': 'Device' },
  'wfg.laSummaryTitle': { 'zh-TW': '擷取請求', 'en': 'Capture Request', 'zh-CN': '采集请求' },
  'wfg.laEventBCount':  { 'zh-TW': 'B Event 數', 'en': 'B Event Count', 'zh-CN': 'B Event 数' },
  'wfg.laAEventB':      { 'zh-TW': 'A Event B', 'en': 'A Event B', 'zh-CN': 'A Event B' },
  'wfg.laAEventBHint':  { 'zh-TW': 'A 先成立，之後第 N 個 B 為 0s', 'en': 'A qualifies first; the Nth B becomes 0s', 'zh-CN': 'A 先成立，之后第 N 个 B 为 0s' },
  'wfg.laPwmSettingsTitle': { 'zh-TW': 'PWM 設定', 'en': 'PWM Settings', 'zh-CN': 'PWM 设定' },
  'wfg.laPwmFreq':      { 'zh-TW': '頻率', 'en': 'Frequency', 'zh-CN': '频率' },
  'wfg.laPwmDuty':      { 'zh-TW': '空佔比', 'en': 'Duty', 'zh-CN': '占空比' },
  'wfg.laPwmCancel':    { 'zh-TW': '取消', 'en': 'Cancel', 'zh-CN': '取消' },
  'wfg.laPwmOk':        { 'zh-TW': '確定', 'en': 'OK', 'zh-CN': '确定' },
  'wfg.laPwmSavedOffline': { 'zh-TW': 'PWM 設定已保存；硬體連線後會自動套用', 'en': 'PWM settings saved; they will apply when hardware is connected', 'zh-CN': 'PWM 设定已保存；硬体连线后会自动套用' },
  'wfg.laPwmApplied':   { 'zh-TW': 'PWM 設定已套用', 'en': 'PWM settings applied', 'zh-CN': 'PWM 设定已套用' },
  'wfg.laPwmPatternTest': { 'zh-TW': '低速任意波形測試', 'en': 'Low-speed pattern test', 'zh-CN': '低速任意波形测试' },
  'wfg.laPwmPatternStop': { 'zh-TW': '停止實驗', 'en': 'Stop test', 'zh-CN': '停止实验' },
  'wfg.laPwmPatternHint': { 'zh-TW': '實驗：用 USB 週期性改寫 PWM duty，只適合低速 pattern，不是高精度 AWG。', 'en': 'Experimental: periodically rewrites PWM duty over USB. Useful only for low-speed patterns, not precision AWG output.', 'zh-CN': '实验：用 USB 周期性改写 PWM duty，只适合低速 pattern，不是高精度 AWG。' },
  'wfg.laIoStandard':   { 'zh-TW': 'I/O電平標準', 'en': 'I/O Standard', 'zh-CN': 'I/O 电平标准' },
  'wfg.laNormalMode':   { 'zh-TW': '正常模式', 'en': 'Normal Mode', 'zh-CN': '正常模式' },
  'wfg.laReady':        { 'zh-TW': 'Ready', 'en': 'Ready', 'zh-CN': 'Ready' },
  'wfg.laNotChecked':   { 'zh-TW': '未檢查', 'en': 'Not checked', 'zh-CN': '未检查' },
  'wfg.laNotConnected': { 'zh-TW': '未連線', 'en': 'Disconnected', 'zh-CN': '未连接' },
  'wfg.laDeviceConnected': { 'zh-TW': '裝置已連接', 'en': 'Device connected', 'zh-CN': '装置已连接' },
  'wfg.laDeviceDisconnected': { 'zh-TW': '裝置未連接', 'en': 'Device disconnected', 'zh-CN': '装置未连接' },
  'wfg.laDeviceError':  { 'zh-TW': '裝置連線錯誤', 'en': 'Device connection error', 'zh-CN': '装置连接错误' },
  'wfg.laOverviewCapture': { 'zh-TW': 'Overview · 點擊跳轉', 'en': 'Overview · Click to jump', 'zh-CN': 'Overview · 点击跳转' },
  'wfg.laTheoreticalTime': { 'zh-TW': '理論取樣時間', 'en': 'Theoretical capture time', 'zh-CN': '理论采样时间' },
  'wfg.laActualLengthHint': { 'zh-TW': '實際長度依硬體壓縮率', 'en': 'actual length depends on hardware compression', 'zh-CN': '实际长度依硬体压缩率' },
  'wfg.laCustomVth':    { 'zh-TW': '自定義 Vth', 'en': 'Custom Vth', 'zh-CN': '自定义 Vth' },
  'wfg.laSettingsTitle': { 'zh-TW': '設定', 'en': 'Settings', 'zh-CN': '设定' },
  'wfg.laSingleSamplingTitle': { 'zh-TW': '單次取樣', 'en': 'Start single sampling', 'zh-CN': '单次采样' },
  'wfg.laRepeatSamplingTitle': { 'zh-TW': '循環取樣', 'en': 'Auto restart sampling', 'zh-CN': '循环采样' },
  'wfg.laStopSamplingTitle': { 'zh-TW': '停止取樣', 'en': 'Stop sampling', 'zh-CN': '停止采样' },
  'wfg.laImportKvdatTitle': { 'zh-TW': '匯入 .kvdat', 'en': 'Import .kvdat', 'zh-CN': '导入 .kvdat' },
  'wfg.laImportKvFileTitle': { 'zh-TW': '匯入 .kvdat / .kvset', 'en': 'Import .kvdat / .kvset', 'zh-CN': '导入 .kvdat / .kvset' },
  'wfg.laExportKvdatTitle': { 'zh-TW': '匯出 .kvdat', 'en': 'Export .kvdat', 'zh-CN': '导出 .kvdat' },
  'wfg.laExportMenuTitle': { 'zh-TW': '匯出 .kvdat / .kvset', 'en': 'Export .kvdat / .kvset', 'zh-CN': '导出 .kvdat / .kvset' },
  'wfg.laExportMenuLabel': { 'zh-TW': '⤓ 匯出', 'en': '⤓ Export', 'zh-CN': '⤓ 导出' },
  'wfg.laExportKvdatOpt': { 'zh-TW': '.kvdat（完整資料）', 'en': '.kvdat (full data)', 'zh-CN': '.kvdat（完整数据）' },
  'wfg.laExportKvsetOpt': { 'zh-TW': '.kvset（僅設定）', 'en': '.kvset (settings only)', 'zh-CN': '.kvset（仅设定）' },
  'wfg.laExportChoose': { 'zh-TW': '選擇匯出格式', 'en': 'Choose export format', 'zh-CN': '选择导出格式' },
  'wfg.laExportKvsetBtn': { 'zh-TW': '設定檔 (.kvset)', 'en': 'Settings file (.kvset)', 'zh-CN': '设定档 (.kvset)' },
  'wfg.laExportKvsetDesc': { 'zh-TW': '僅設定，不含波形', 'en': 'Settings only, no waveform', 'zh-CN': '仅设定，不含波形' },
  'wfg.laExportKvdatBtn': { 'zh-TW': '完整資料 (.kvdat)', 'en': 'Full data (.kvdat)', 'zh-CN': '完整数据 (.kvdat)' },
  'wfg.laExportKvdatDesc': { 'zh-TW': '設定＋波形資料', 'en': 'Settings + waveform', 'zh-CN': '设定＋波形数据' },
  'wfg.laCancel': { 'zh-TW': '取消', 'en': 'Cancel', 'zh-CN': '取消' },
  'wfg.laQuickPresetTitle': { 'zh-TW': '原廠軟體設定快捷', 'en': 'OEM software quick settings', 'zh-CN': '原厂软件快捷设定' },
  'wfg.laQuickPresetDefault': { 'zh-TW': '快捷設定', 'en': 'Quick setup', 'zh-CN': '快捷设定' },
  'wfg.laQuickPresetApplied': { 'zh-TW': '已套用快捷設定：{name}', 'en': 'Applied quick setup: {name}', 'zh-CN': '已套用快捷设定：{name}' },
  'wfg.laPresetE512':    { 'zh-TW': 'E512/EM02(PC)', 'en': 'E512/EM02(PC)', 'zh-CN': 'E512/EM02(PC)' },
  'wfg.laPresetE503':    { 'zh-TW': 'E503', 'en': 'E503', 'zh-CN': 'E503' },
  'wfg.laPresetI2c':     { 'zh-TW': 'I2C量測(異常範例)', 'en': 'I2C Measurement (Anomaly)', 'zh-CN': 'I2C测量(异常范例)' },
  'wfg.laPresetEdpAux':  { 'zh-TW': 'eDP AUX解碼(異常範例)', 'en': 'eDP AUX Decode (Anomaly)', 'zh-CN': 'eDP AUX解码(异常范例)' },
  'wfg.laPresetI2cAux':  { 'zh-TW': 'I2C+AUX(異常範例)', 'en': 'I2C+AUX (Anomaly)', 'zh-CN': 'I2C+AUX(异常范例)' },
  'wfg.laTriggerToZeroTitle': { 'zh-TW': '移到 Trigger / 0s', 'en': 'Move to trigger / 0s', 'zh-CN': '移到 Trigger / 0s' },
  'wfg.laBEventToolbarTitle': { 'zh-TW': 'A 後第 N 個 B Event 才是 Trigger / 0s', 'en': 'Nth B Event after A becomes Trigger / 0s', 'zh-CN': 'A 后第 N 个 B Event 才是 Trigger / 0s' },
  'wfg.laAnalyzer':     { 'zh-TW': '分析器', 'en': 'Analyzer', 'zh-CN': '分析器' },
  'wfg.laAnalyzerEmpty': { 'zh-TW': '點擊 ＋ 新增 analyzer', 'en': 'Click + to add analyzer', 'zh-CN': '点击 ＋ 新增 analyzer' },
  /* v4.51.0: 同一種分析器只能有一個 */
  'wfg.laAnalyzerTypeTaken': { 'zh-TW': '已新增', 'en': 'already added', 'zh-CN': '已新增' },
  'wfg.laAnalyzerAllTaken': { 'zh-TW': '每一種分析器都已新增', 'en': 'Every analyzer type has been added', 'zh-CN': '每一种分析器都已新增' },
  /* I2C-EEPROM 下架（Bruce 2026-09-19）。這兩個 key 只會出現在「從既有設定檔載入進來的
     下架型別分析器」上 —— 新增選單裡看不到。原因見 wfg.html wfgLaDecodeEepromRows() 上方。 */
  'wfg.laAnalyzerTypeRetired': { 'zh-TW': '已停用', 'en': 'retired', 'zh-CN': '已停用' },
  'wfg.laAnalyzerTypeRetiredHint': { 'zh-TW': '此分析器已停用，無法新增，僅保留既有設定檔載入的項目。記憶體位址只支援 1 byte，24C32／24C64 等 2 byte 位址裝置的 Memory 欄位會算錯。', 'en': 'This analyzer is retired and can no longer be added; only entries loaded from an existing settings file are kept. Its memory address is limited to 1 byte, so the Memory column is wrong for 2-byte devices such as 24C32/24C64.', 'zh-CN': '此分析器已停用，无法新增，仅保留既有设置文件载入的项目。内存地址只支持 1 byte，24C32／24C64 等 2 byte 地址设备的 Memory 栏位会算错。' },
  /* v4.51.0: I2C data 序號的 offset 長度設定與來源標示 */
  'wfg.laI2cOffsetLen': { 'zh-TW': 'Offset 長度', 'en': 'Offset length', 'zh-CN': 'Offset 长度' },
  'wfg.laI2cOffsetAuto': { 'zh-TW': '未知（自動推算）', 'en': 'Unknown (auto-detect)', 'zh-CN': '未知（自动推算）' },
  'wfg.laI2cOffsetSrcManual': { 'zh-TW': '指定', 'en': 'manual', 'zh-CN': '指定' },
  'wfg.laI2cOffsetSrcInferred': { 'zh-TW': '推算', 'en': 'inferred', 'zh-CN': '推算' },
  'wfg.laI2cOffsetSrcMixed': { 'zh-TW': '依裝置推算', 'en': 'inferred per device', 'zh-CN': '依装置推算' },
  'wfg.laI2cOffsetSrcUnknown': { 'zh-TW': '未知，併入編號', 'en': 'unknown, counted as data', 'zh-CN': '未知，并入编号' },
  'wfg.laDecodeResults': { 'zh-TW': '解碼結果', 'en': 'Decode Results', 'zh-CN': '解码结果' },
  'wfg.laSearch':       { 'zh-TW': '🔍 搜尋', 'en': '🔍 Search', 'zh-CN': '🔍 搜索' },
  'wfg.laSearchPlaceholder': { 'zh-TW': '🔍 搜尋', 'en': '🔍 Search', 'zh-CN': '🔍 搜索' },
  'wfg.laDecodeExportExcelTitle': { 'zh-TW': '匯出 Excel 報告', 'en': 'Export Excel report', 'zh-CN': '导出 Excel 报告' },
  'wfg.laDecodeExpandTitle': { 'zh-TW': '展開/收合解析結果', 'en': 'Expand/collapse decode results', 'zh-CN': '展开/收合解析结果' },
  'wfg.laDecoderWaiting': { 'zh-TW': '等待 analyzer decode data', 'en': 'Waiting for analyzer decode data', 'zh-CN': '等待 analyzer decode data' },
  'wfg.laAEventRising': { 'zh-TW': 'A 事件正緣', 'en': 'A event rising edge', 'zh-CN': 'A 事件正缘' },
  'wfg.laAEventFalling': { 'zh-TW': 'A 事件負緣', 'en': 'A event falling edge', 'zh-CN': 'A 事件负缘' },
  'wfg.laBEventRising': { 'zh-TW': 'B 事件正緣', 'en': 'B event rising edge', 'zh-CN': 'B 事件正缘' },
  'wfg.laBEventFalling': { 'zh-TW': 'B 事件負緣', 'en': 'B event falling edge', 'zh-CN': 'B 事件负缘' },
  'wfg.laTriggerSettings': { 'zh-TW': '通道與觸發設定', 'en': 'Channel and Trigger Settings', 'zh-CN': '通道与触发设定' },
  'wfg.laTriggerWindow': { 'zh-TW': '觸發窗口', 'en': 'Trigger Window', 'zh-CN': '触发窗口' },
  'wfg.laTriggerWindowHint': { 'zh-TW': '0%=全部在觸發後 · 50%=前後各半 · 100%=全部在觸發前', 'en': '0%=all after trigger · 50%=half before/after · 100%=all before trigger', 'zh-CN': '0%=全部在触发后 · 50%=前后各半 · 100%=全部在触发前' },
  'wfg.laSwitchingCapture': { 'zh-TW': '正在切換為{mode}擷取', 'en': 'Switching to {mode} capture', 'zh-CN': '正在切换为{mode}采集' },
  'wfg.laSingleModeShort': { 'zh-TW': '單次', 'en': 'single', 'zh-CN': '单次' },
  'wfg.laRepeatModeShort': { 'zh-TW': '循環', 'en': 'repeat', 'zh-CN': '循环' },
  'wfg.laSwitchingMode': { 'zh-TW': '切換擷取模式中', 'en': 'Switching capture mode', 'zh-CN': '切换采集模式中' },
  'wfg.laReadingWaveData': { 'zh-TW': '讀取波形資料', 'en': 'Reading waveform data', 'zh-CN': '读取波形数据' },
  'wfg.laStoppedKeepLast': { 'zh-TW': '已停止：保留最後完整擷取', 'en': 'Stopped: kept last complete capture', 'zh-CN': '已停止：保留最后完整采集' },
  'wfg.laImportedKvdat': { 'zh-TW': '已匯入 kvdat：{name}', 'en': 'Imported kvdat: {name}', 'zh-CN': '已导入 kvdat：{name}' },
  'wfg.laImportedKvset': { 'zh-TW': '已匯入 kvset 設定：{name}', 'en': 'Imported kvset settings: {name}', 'zh-CN': '已导入 kvset 设定：{name}' },
  'wfg.kvsetFail': { 'zh-TW': '.kvset 匯入失敗：', 'en': '.kvset import failed: ', 'zh-CN': '.kvset 导入失败：' },
  'wfg.laExportNoData': { 'zh-TW': '目前沒有可匯出的 LA 量測資料', 'en': 'No LA measurement data to export yet', 'zh-CN': '目前没有可导出的 LA 量测数据' },
  'wfg.laSdaSclSameChannel': { 'zh-TW': 'SDA 和 SCL 不能使用相同的通道。', 'en': 'SDA and SCL cannot use the same channel.', 'zh-CN': 'SDA 和 SCL 不能使用相同的通道。' },
  'wfg.laPresetFailed': { 'zh-TW': '快捷設定失敗：{msg}', 'en': 'Quick preset failed: {msg}', 'zh-CN': '快捷设定失败：{msg}' },
  'wfg.laCopied':       { 'zh-TW': '已複製', 'en': 'Copied', 'zh-CN': '已复制' },
  'wfg.laCopyFailed':   { 'zh-TW': '複製失敗', 'en': 'Copy failed', 'zh-CN': '复制失败' },
  'wfg.laFwImportFailed': { 'zh-TW': 'Firmware 匯入失敗：{msg}', 'en': 'Firmware import failed: {msg}', 'zh-CN': 'Firmware 导入失败：{msg}' },
  'wfg.laFwImportStatusFail': { 'zh-TW': 'firmware 匯入失敗', 'en': 'firmware import failed', 'zh-CN': 'firmware 导入失败' },
  'wfg.laGuideTitle':   { 'zh-TW': '需要裝置支援檔案', 'en': 'Device Support Files Required', 'zh-CN': '需要设备支持文件' },
  /* v2.97.472: 檔案包改版為 la-device-support-pack-v4.zip（中性檔名；MCU fw 依 USB PID、bitstream 依 EEPROM magic 自動選檔）
     v4.47.0: 支援包已隨網頁一起發佈，開啟這個引導就會自動取得，步驟改寫為「不用手動拿檔案」 */
  'wfg.laGuideStep1':   { 'zh-TW': '裝置支援包已隨本網頁一起發佈，開啟這個視窗就會自動取得並存進此瀏覽器，不需要另外索取檔案。', 'en': 'The device support pack ships with this page: opening this dialog fetches it automatically and stores it in this browser. No separate file is needed.', 'zh-CN': '设备支持包已随本网页一起发布，开启这个视窗就会自动取得并存进此浏览器，不需要另外索取文件。' },
  'wfg.laGuideStep2':   { 'zh-TW': '若自動取得失敗（例如離線），請按「匯入 zip 檔案包」手動選擇 la-device-support-pack-v4.zip。完成後都會自動接續剛剛的單次/循環流程。', 'en': 'If the automatic fetch fails (offline, for example), use "Import zip Package" and pick la-device-support-pack-v4.zip manually. Either way the previous single/repeat flow resumes automatically.', 'zh-CN': '若自动取得失败（例如离线），请按「导入 zip 文件包」手动选择 la-device-support-pack-v4.zip。完成后都会自动接续刚刚的单次/循环流程。' },
  'wfg.laGuideOpenDownload': { 'zh-TW': '開啟下載頁', 'en': 'Open Download Page', 'zh-CN': '开启下载页' },
  'wfg.laGuideImportZip': { 'zh-TW': '匯入 zip 檔案包', 'en': 'Import zip Package', 'zh-CN': '导入 zip 文件包' },
  'wfg.laGuideLater':   { 'zh-TW': '稍後再說', 'en': 'Later', 'zh-CN': '稍后再说' },
  'wfg.laGuideSecurityNote': { 'zh-TW': '瀏覽器安全限制下，網頁不能直接記住或讀取 Windows 下載路徑；但匯入後會把檔案內容存在此瀏覽器內。', 'en': 'Due to browser security restrictions, the page cannot remember or access your download path; however, imported file contents are stored in this browser.', 'zh-CN': '浏览器安全限制下，网页不能直接记住或读取 Windows 下载路径；但导入后会把文件内容存在此浏览器内。' },
  'wfg.laGuidePackageTitle': { 'zh-TW': 'WebUSB 檔案包準備', 'en': 'WebUSB Package Preparation', 'zh-CN': 'WebUSB 文件包准备' },
  'wfg.laGuideAlreadyImported': { 'zh-TW': '已匯入過檔案包：{name}。若更換電腦或瀏覽器資料被清除，請重新匯入 zip。', 'en': 'Previously imported package: {name}. Re-import the zip if you changed computers or browser data was cleared.', 'zh-CN': '已导入过文件包：{name}。若更换电脑或浏览器数据被清除，请重新导入 zip。' },
  'wfg.laGuideFirstTime': { 'zh-TW': '第一次使用只需要完成一次。取得後檔案會存在這台電腦的瀏覽器內，之後按單次/循環會直接使用，不會再抓一次。', 'en': 'One-time setup. Once fetched, the files stay in this browser; Single/Repeat captures use them directly and never fetch again.', 'zh-CN': '第一次使用只需要完成一次。取得后文件会存在这台电脑的浏览器内，之后按单次/循环会直接使用，不会再抓一次。' },
  /* v4.47.0: 原「聯絡 Bruce」按鈕改為同源自動取得（失敗時按鈕文字換成「重新自動取得」） */
  'wfg.laGuideAutoFetch': { 'zh-TW': '自動取得韌體檔案', 'en': 'Fetch Firmware Automatically', 'zh-CN': '自动取得固件文件' },
  'wfg.laGuideAutoFetchRetry': { 'zh-TW': '重新自動取得', 'en': 'Retry Automatic Fetch', 'zh-CN': '重新自动取得' },
  'wfg.laFetchStart': { 'zh-TW': '正在自動取得裝置支援包（約 1.5 MB）…', 'en': 'Fetching the device support pack (about 1.5 MB)…', 'zh-CN': '正在自动取得设备支持包（约 1.5 MB）…' },
  'wfg.laFetchProgress': { 'zh-TW': '正在自動取得裝置支援包… {done} KB / {total} KB', 'en': 'Fetching the device support pack… {done} KB / {total} KB', 'zh-CN': '正在自动取得设备支持包… {done} KB / {total} KB' },
  'wfg.laFetchVerify': { 'zh-TW': '下載完成，正在驗證並存入此瀏覽器…', 'en': 'Download complete; verifying and storing in this browser…', 'zh-CN': '下载完成，正在验证并存入此浏览器…' },
  'wfg.laFetchDone': { 'zh-TW': '裝置支援包已自動取得並存入此瀏覽器。', 'en': 'The device support pack has been fetched and stored in this browser.', 'zh-CN': '设备支持包已自动取得并存入此浏览器。' },
  'wfg.laFetchAlready': { 'zh-TW': '此瀏覽器內已經有裝置支援包，不重新取得。', 'en': 'This browser already has the device support pack; not fetching again.', 'zh-CN': '此浏览器内已经有设备支持包，不重新取得。' },
  'wfg.laFetchFail': { 'zh-TW': '自動取得失敗（{msg}）。請改按「匯入 zip 檔案包」手動選擇 la-device-support-pack-v4.zip；若手邊沒有這個檔案，請向 Bruce 索取。', 'en': 'Automatic fetch failed ({msg}). Use "Import zip Package" and pick la-device-support-pack-v4.zip manually; if you do not have that file, ask Bruce for it.', 'zh-CN': '自动取得失败（{msg}）。请改按「导入 zip 文件包」手动选择 la-device-support-pack-v4.zip；若手边没有这个文件，请向 Bruce 索取。' },
  'wfg.laFetchStatusFail': { 'zh-TW': '檔案包自動取得失敗；請改用匯入 zip', 'en': 'Automatic package fetch failed; please import the zip instead', 'zh-CN': '文件包自动取得失败；请改用导入 zip' },
  /* v2.97.472: 匯入舊版包時的辨識提示（v1 單 blob／v2 multipack／v3 舊檔名，各自指名 v4 新檔名；文字一律中性） */
  'wfg.laLegacyPackageWarn': { 'zh-TW': '注意：此為舊版檔案包，部分裝置可能無法使用。請改匯入新版「la-device-support-pack-v4.zip」。', 'en': 'Note: this is an older package and may not support all devices. Please import the new "la-device-support-pack-v4.zip" instead.', 'zh-CN': '注意：此为旧版文件包，部分装置可能无法使用。请改导入新版「la-device-support-pack-v4.zip」。' },
  'wfg.laV2PackageWarn': { 'zh-TW': '注意：此為舊版檔案包，部分裝置可能無法使用。請改匯入新版「la-device-support-pack-v4.zip」。', 'en': 'Note: this is an older package and may not support all devices. Please import the new "la-device-support-pack-v4.zip" instead.', 'zh-CN': '注意：此为旧版文件包，部分装置可能无法使用。请改导入新版「la-device-support-pack-v4.zip」。' },
  'wfg.laV3PackageWarn': { 'zh-TW': '注意：此為舊版檔案包，仍可正常使用；建議改用新版「la-device-support-pack-v4.zip」。', 'en': 'Note: this is an older package. It still works, but the new "la-device-support-pack-v4.zip" is recommended.', 'zh-CN': '注意：此为旧版文件包，仍可正常使用；建议改用新版「la-device-support-pack-v4.zip」。' },
  /* v2.97.448 改動2：清除韌體狀態（測試用） */
  'wfg.laClearFwBtn': { 'zh-TW': '清除韌體狀態', 'en': 'Clear Firmware State', 'zh-CN': '清除固件状态' },
  'wfg.laClearFwConfirm': { 'zh-TW': '確定清除已存的 WebUSB 韌體/裝置包快取？清除後會回到「第一次使用」狀態，下次擷取需重新匯入 zip。此操作只清韌體，不影響其他設定或波形。', 'en': 'Clear the stored WebUSB firmware/device package cache? This returns to the first-use state; you will need to re-import the zip before the next capture. It only clears firmware and does not affect other settings or waveforms.', 'zh-CN': '确定清除已存的 WebUSB 固件/设备包缓存？清除后会回到「第一次使用」状态，下次撷取需重新导入 zip。此操作只清固件，不影响其他设定或波形。' },
  'wfg.laClearFwDone': { 'zh-TW': '已清除韌體狀態，已回到第一次使用狀態。', 'en': 'Firmware state cleared; returned to first-use state.', 'zh-CN': '已清除固件状态，已回到第一次使用状态。' },
  'wfg.laClearFwFail': { 'zh-TW': '清除韌體狀態失敗：{msg}', 'en': 'Failed to clear firmware state: {msg}', 'zh-CN': '清除固件状态失败：{msg}' },
  'wfg.laClearFwSection': { 'zh-TW': '韌體 / 測試', 'en': 'Firmware / Testing', 'zh-CN': '固件 / 测试' },
  'wfg.laReconnectTitle': { 'zh-TW': 'WebUSB 自動連接', 'en': 'WebUSB Auto-connect', 'zh-CN': 'WebUSB 自动连接' },
  'wfg.laReconnectCloseHint': { 'zh-TW': '不想等待時可按右上角關閉；之後仍可直接按單次或循環重新連線。', 'en': 'Press × to cancel. You can reconnect later by pressing Single or Repeat.', 'zh-CN': '不想等待时可按右上角关闭；之后仍可直接按单次或循环重新连线。' },
  'wfg.laSecondStageTitle': { 'zh-TW': '等待第二階段 USB 裝置', 'en': 'Waiting for Second-stage USB Device', 'zh-CN': '等待第二阶段 USB 装置' },
  'wfg.laSecondStageNote': { 'zh-TW': '你剛剛選到的是不明裝置，網頁已完成第一階段 FX2 firmware 載入。USB 會重新枚舉成名稱含 Logic Analyzer 的裝置；Chrome 需要你再按一次按鈕選擇這個第二階段裝置。', 'en': 'The device you selected was unrecognized. The page has completed Stage 1 FX2 firmware upload. USB will re-enumerate as a device named "Logic Analyzer"; Chrome needs you to press the button again to select this Stage 2 device.', 'zh-CN': '你刚刚选到的是不明装置，网页已完成第一阶段 FX2 firmware 载入。USB 会重新枚举成名称含 Logic Analyzer 的装置；Chrome 需要你再按一次按钮选择这个第二阶段装置。' },
  'wfg.laSecondStageContinueCapture': { 'zh-TW': '選擇 Logic Analyzer 裝置並繼續擷取', 'en': 'Select the Logic Analyzer device and resume capture', 'zh-CN': '选择 Logic Analyzer 装置并继续采集' },
  'wfg.laSecondStageContinueInit': { 'zh-TW': '選擇 Logic Analyzer 裝置並完成初始化', 'en': 'Select the Logic Analyzer device and complete initialization', 'zh-CN': '选择 Logic Analyzer 装置并完成初始化' },
  'wfg.laReconnectSelectTitle': { 'zh-TW': '重新選擇 USB 裝置', 'en': 'Re-select USB Device', 'zh-CN': '重新选择 USB 装置' },
  'wfg.laReconnectSelectNote': { 'zh-TW': 'Chrome WebUSB 在 USB 拔插後常會失去授權，網頁無法完全自動選取裝置。若清單只有不明裝置 77a1:01a2，請先選它；網頁會載入 firmware，之後若再跳出第二階段視窗，再選名稱含 Logic Analyzer 的裝置。', 'en': 'Chrome WebUSB often loses authorization after USB reconnection and cannot automatically select the device. If only unknown device 77a1:01a2 is listed, select it first; the page will load firmware, then select the device named "Logic Analyzer" if a second-stage dialog appears.', 'zh-CN': 'Chrome WebUSB 在 USB 拔插后常会失去授权，网页无法完全自动选取装置。若列表只有不明装置 77a1:01a2，请先选它；网页会载入 firmware，之后若再跳出第二阶段窗口，再选名称含 Logic Analyzer 的装置。' },
  'wfg.laReconnectSelectResumeCapture': { 'zh-TW': '選擇 USB 裝置並恢復擷取', 'en': 'Select USB device and resume capture', 'zh-CN': '选择 USB 装置并恢复采集' },
  'wfg.laReconnectSelectInit': { 'zh-TW': '選擇 USB 裝置並初始化', 'en': 'Select USB device and initialize', 'zh-CN': '选择 USB 装置并初始化' },
  'wfg.laAnalyzerCancel': { 'zh-TW': '取消', 'en': 'Cancel', 'zh-CN': '取消' },
  'wfg.laAnalyzerConfirm': { 'zh-TW': '確定', 'en': 'OK', 'zh-CN': '确定' },
  'wfg.laAnalyzerDpAuxHint': { 'zh-TW': '以網頁原生 JS 解碼 DisplayPort AUX Manchester II：bit 1 = H→L、bit 0 = L→H，START/STOP = HHLL。', 'en': 'Decodes DisplayPort AUX Manchester II in browser JS: bit 1 = H→L, bit 0 = L→H, START/STOP = HHLL.', 'zh-CN': '以网页原生 JS 解码 DisplayPort AUX Manchester II：bit 1 = H→L、bit 0 = L→H，START/STOP = HHLL。' },
  'wfg.presetTitle':    { 'zh-TW': '📋 載入預設', 'en': '📋 Load Preset', 'zh-CN': '📋 载入预设' },
  /* 🔴 v4.30.0：卡片改名（Bruce 2026-08-27：「Frame 參數這個名詞似乎也不適合這個卡片，
     我看把它換成『系統設定』應該會比較好」）。key 與卡片 id 都不動，只換顯示文字。 */
  /* v4.34.0：標題加上 `(Pattern Gen)`（Bruce 2026-08-27：「上面的系統設定卡片，在
     『系統設定』的右邊多加上（Pattern Gen)」）。`Pattern Gen` 是產品名，三語都不翻。
     key 與卡片 id 都不動，只換顯示文字（同 v4.30.0 那次改名的做法）。 */
  'wfg.frameParams':    { 'zh-TW': '系統設定 (Pattern Gen)', 'en': 'System Settings (Pattern Gen)', 'zh-CN': '系统设定 (Pattern Gen)' },
  'wfg.frameCount':     { 'zh-TW': 'Frame 重複數', 'en': 'Frame Repeat Count', 'zh-CN': 'Frame 重复数' },
  'wfg.gateType':       { 'zh-TW': 'Gate Type', 'en': 'Gate Type', 'zh-CN': 'Gate Type' },
  /* v3.27.0：Frame 參數卡片的兩個分組框標題 */
  'wfg.grpHtotal':      { 'zh-TW': 'H Total', 'en': 'H Total', 'zh-CN': 'H Total' },
  'wfg.grpVtotal':      { 'zh-TW': 'V Total', 'en': 'V Total', 'zh-CN': 'V Total' },
  /* v3.28.1：類比波形延後補算期間的佔位標示 */
  'wfg.analogPending':  { 'zh-TW': '類比波形更新中…', 'en': 'Updating analog waveform…',
                          'zh-CN': '模拟波形更新中…' },
  /* v4.7.0：Bruce 2026-08-23 指定「那個 D-CLOCK 改成 DCLK」 */
  'wfg.grpDclk':        { 'zh-TW': 'DCLK (MHz)', 'en': 'DCLK (MHz)', 'zh-CN': 'DCLK (MHz)' },
  /* v4.7.0：Frame 參數卡片新增的兩個 Group 框名 */
  'wfg.grpFrameRate':   { 'zh-TW': 'Frame Rate (Hz)', 'en': 'Frame Rate (Hz)', 'zh-CN': 'Frame Rate (Hz)' },
  'wfg.grpGateFrame':   { 'zh-TW': 'Gate / Frame', 'en': 'Gate / Frame', 'zh-CN': 'Gate / Frame' },
  /* ══ v4.28.0：兩個大 Group 的框名與 System Simulation 內的子框名 ══════════════
     `System Pixel Rate` 包住 V Total / H Total / Frame Rate 三個子 Group 與 Pixel Rate；
     `System Simulation` 放三條拉霸（Frame Rate / Vblank / RX DCLK）。 */
  'wfg.grpSysPixelRate':{ 'zh-TW': 'System Pixel Rate', 'en': 'System Pixel Rate',
                          'zh-CN': 'System Pixel Rate' },
  /* ⚠ v4.30.0 起 `wfg.grpSysSim` 已無人引用 —— System Simulation 由「Group 框名」
     升級成獨立卡片的標題（`wfg.cardSysSim`）。key 保留不刪：舊的匯出設定檔／
     外部連結不會用到它，但刪 key 對翻譯檔沒有好處，留著也不會被畫出來。 */
  'wfg.grpSysSim':      { 'zh-TW': 'System Behavior Simulation（系統行為模擬）', 'en': 'System Behavior Simulation',
                          'zh-CN': 'System Behavior Simulation（系统行为模拟）' },
  /* ══ 🔴 v4.30.0：四張卡片的標題（Bruce 2026-08-27）══════════════════════════════
     「卡片名稱在繁體中文下，不要有英文」⇒ 繁中一律不含英文字母，
     唯一例外是 Bruce 自己指定的寫法裡就有 `TCON` 三個字母（「TCON頻率設定」、
     「TCON 其他設定」）—— 照抄不改。英文／簡中語系各自照該語言的慣例。 */
  /* 🔴 v4.35.0 改名：「系統模擬」→「系統行為模擬」（Bruce 2026-08-28 指定）。
     簡中沿用站上既有譯法 —— 本檔既有寫的是「系统模拟」不是「系统仿真」，
     所以是「系统行为模拟」；英文依既有的 `System Simulation` 補一個字。
     ⚠ 卡片的 `id` 仍是 `wfg-syssim-card`，**不跟著改**：autosave 的摺疊狀態
     （wfg.html 33813 那份 id 陣列）與橘→綠的 card-scoped CSS 都綁在它上面，
     改 id 會讓使用者既有的摺疊狀態失效、卡片瞬間掉回未套色的樣子。 */
  'wfg.cardSysSim':     { 'zh-TW': '系統行為模擬', 'en': 'System Behavior Simulation', 'zh-CN': '系统行为模拟' },
  'wfg.cardTconFreq':   { 'zh-TW': 'TCON頻率設定', 'en': 'TCON Clock Settings',
                          'zh-CN': 'TCON频率设定' },
  'wfg.cardTconMisc':   { 'zh-TW': 'TCON 其他設定', 'en': 'Other TCON Settings',
                          'zh-CN': 'TCON 其他设定' },
  'wfg.simFrameRate':   { 'zh-TW': 'Frame Rate (Hz)', 'en': 'Frame Rate (Hz)', 'zh-CN': 'Frame Rate (Hz)' },
  'wfg.simVblankHint':  { 'zh-TW': '(Pixel Rate 不變)', 'en': '(Pixel Rate held)',
                          'zh-CN': '(Pixel Rate 不变)' },
  /* v3.29.0：DCLK 應用型態。定頻＝TX DCLK 固定且 ≥ RX DCLK；變頻＝TX DCLK 恆等於 RX DCLK */
  'wfg.dclkModeFixed':  { 'zh-TW': '定頻應用', 'en': 'Fixed Clock', 'zh-CN': '定频应用' },
  'wfg.dclkModeVar':    { 'zh-TW': '變頻應用', 'en': 'Variable Clock', 'zh-CN': '变频应用' },
  /* ══ v4.6.0：DCLK 三大類 ══════════════════════════════════════════════
     ① Pixel Rate ＝ Ht × Vt × FPS（恆定）  ② RX / TX DCLK ＝ 各自 Pixel Rate 的一半
     ③ TCON UI DCLK ＝ TX DCLK × 機種係數（EM01 與所有 NB ×1；EM02 / E512 ×2）
     `Pixel Rate` 與 `TCON UI DCLK` 兩個詞刻意與 rxtx 分頁用字一致，不另創名詞。 */
  'wfg.pixelRate':      { 'zh-TW': 'Pixel Rate', 'en': 'Pixel Rate', 'zh-CN': 'Pixel Rate' },
  'wfg.pixelRateHint':  { 'zh-TW': '(Ht×Vt×FPS)', 'en': '(Ht x Vt x FPS)', 'zh-CN': '(Ht×Vt×FPS)' },
  /* v4.31.0：TCON 側的 Pixel Rate ＝ Vt × TCON Ht × FPS（Bruce 2026-08-27 給的公式）。
     詞彙沿用同一張卡片上已經在用的 `TCON HTOTAL`，不另創名詞；三語同形（皆為技術術語，
     與 `wfg.pixelRate` / `wfg.uiDclk` 的處理一致）。 */
  'wfg.tconPixelRate':     { 'zh-TW': 'TCON Pixel Rate', 'en': 'TCON Pixel Rate', 'zh-CN': 'TCON Pixel Rate' },
  'wfg.tconPixelRateHint': { 'zh-TW': '(Vt×TCON Ht×FPS)', 'en': '(Vt x TCON Ht x FPS)', 'zh-CN': '(Vt×TCON Ht×FPS)' },
  'wfg.rxDclkHint':     { 'zh-TW': '(= Pixel Rate ÷ 2)', 'en': '(= Pixel Rate / 2)',
                          'zh-CN': '(= Pixel Rate ÷ 2)' },
  'wfg.uiDclk':         { 'zh-TW': 'TCON UI DCLK', 'en': 'TCON UI DCLK', 'zh-CN': 'TCON UI DCLK' },
  /* ══ v4.7.0：TX DCLK ／ TCON UI DCLK 的檢核訊息 ════════════════════════════
     兩格共用同一支檢核（`wfgValidateTxDclk`），所以訊息也只有這一組。
     🔴 Bruce 指定「不要靜默夾值」：擋下時一律保留原值，並寫清楚為什麼被擋。 */
  'wfg.errTxDclkNum':   { 'zh-TW': '請填入大於 0 的數值，已保留原本的值。',
                          'en': 'Enter a number greater than 0; the previous value was kept.',
                          'zh-CN': '请填入大于 0 的数值，已保留原本的值。' },
  /* 下限來自 RX DCLK（TX 永遠 ≥ RX）。{t}=RX DCLK */
  /* v4.31.5 補上**出路**：Frame Rate 的上限由 TCON UI DCLK 決定（`errFpsMaxUi`），
     反過來 TCON UI DCLK 的下限就由 Frame Rate 決定 —— 兩條是同一個不等式 `RX ≤ TX`
     的兩半。只講「不可低於」而不講「先把 Frame Rate 降到幾」，使用者會以為卡死。
     {t}=RX DCLK（＝TX 的下限） {fps}=RX 降到 TX 以下所需的 Frame Rate 上限 */
  'wfg.errTxDclkMin':   { 'zh-TW': 'TX DCLK 不可低於 RX DCLK（{t} MHz）。已保留原本的值。要把 TCON 頻率設得更低，請先把 Frame Rate 降到 {fps} Hz 以下。',
                          'en': 'TX DCLK cannot be lower than RX DCLK ({t} MHz). The previous value was kept. To set a lower TCON clock, first bring the Frame Rate down to {fps} Hz or below.',
                          'zh-CN': 'TX DCLK 不可低于 RX DCLK（{t} MHz）。已保留原本的值。要把 TCON 频率设得更低，请先把 Frame Rate 降到 {fps} Hz 以下。' },
  /* 🔴 v4.32.0：取代 `errTxDclkMin` 在「非機種規格」那一半的角色。
     本版起調低 TCON UI DCLK 會把 Frame Rate 一起帶下來（Bruce 2026-08-27 指名的連動），
     所以「請先把 Frame Rate 降下來」不再是出路 —— fps 已經自己降到底了。
     這則講的是**真的到底了**：fps 已經是 {fps} Hz，這組解析度撐不住更低的 TCON 頻率。
     {t}=TX 下限 {ui}=換算成 UI DCLK 的下限 {fps}=fps 的下限
     🔴 v4.33.0 改文案：舊版硬寫「下限 1 Hz」，而 fps 的下限從本版起是 `WFG_FPS_FLOOR`
        （0.001 Hz）——「1 Hz」已經不成立。措辭同時改成「工具下限」，因為這個數字不再是
        物理事實，是工具刻意訂的絕對底線（理由見 `WFG_FPS_FLOOR` 上方的區塊註解）。
        🔴 觸發條件也跟著鬆了：`uiAtFpsFloor` 縮小 1000 倍 ⇒ 這則訊息從「VBLANK 一拉大
        就會撞到」變成幾乎撞不到（需要 `HTOTAL × VTOTAL > 8×10¹⁰`）。文案留著是因為
        `wfgDclkLimits()` 那條下限仍然存在，不是留一句永遠不會出現的話。 */
  'wfg.errTxDclkFpsFloor': { 'zh-TW': 'TCON UI DCLK 最低只能到 {ui} MHz（TX DCLK {t} MHz）—— Frame Rate 已經降到工具下限 {fps} Hz，再低就撐不住這組 HTOTAL／VTOTAL 了。已保留原本的值。要再往下，請先縮小 HTOTAL／VTOTAL。',
                          'en': 'TCON UI DCLK bottoms out at {ui} MHz (TX DCLK {t} MHz) - the Frame Rate is already at the tool floor of {fps} Hz, and anything lower cannot sustain this HTOTAL/VTOTAL. The previous value was kept. To go lower, reduce HTOTAL/VTOTAL first.',
                          'zh-CN': 'TCON UI DCLK 最低只能到 {ui} MHz（TX DCLK {t} MHz）—— Frame Rate 已经降到工具下限 {fps} Hz，再低就撑不住这组 HTOTAL／VTOTAL 了。已保留原本的值。要再往下，请先缩小 HTOTAL／VTOTAL。' },
  /* 🔴 v4.33.0：Frame Rate 打進小於工具絕對下限的值。
     Bruce 2026-08-27：「FPS 不會等於 0，但會是一個大於 0 的數。」⇒ 0 與負數要有人擋，
     而擋下來就要說明白是哪一道在擋 —— 這一道**與機種、與 TCON UI DCLK 都無關**，
     所以刻意不與 `errFpsMin`（變頻機種下限）共用一則：那則的出路是「換機種／改 timing」，
     這則沒有出路，就是工具的底。{min}=WFG_FPS_FLOOR */
  'wfg.errFpsAbsFloor': { 'zh-TW': 'Frame Rate 最低只能到 {min} Hz —— 這是本工具的絕對下限（一個 frame 已經長達 1000 秒），與機種無關。已保留原本的值。',
                          'en': 'The Frame Rate can go down to {min} Hz - that is this tool\'s absolute floor (one frame already lasts 1000 seconds) and is not model-dependent. The previous value was kept.',
                          'zh-CN': 'Frame Rate 最低只能到 {min} Hz —— 这是本工具的绝对下限（一个 frame 已经长达 1000 秒），与机种无关。已保留原本的值。' },
  /* 🔴 v4.32.0：調低 TCON UI DCLK ⇒ Frame Rate 自動跟著降的**告知**（琥珀，不是錯誤）。
     Bruce 2026-08-27 明示不可以靜默改掉使用者的設定。措辭與 `codeFpsAutoFit`（v4.31.1
     匯入自動下調）刻意保持同一個句型 —— 同一件事在站上只有一種說法。
     {from}/{to}=Frame Rate 前後值 {ui}=剛設定的 TCON UI DCLK {tx}=換算成 TX */
  'wfg.uiCapFpsAutoFit': { 'zh-TW': '⚠ Frame Rate 已自動從 {from} Hz 降為 {to} Hz —— TCON UI DCLK 設成 {ui} MHz（TX {tx} MHz）之後，再高的 Frame Rate 就會超出它。',
                          'en': '⚠ Frame Rate was automatically lowered from {from} Hz to {to} Hz - with TCON UI DCLK set to {ui} MHz (TX {tx} MHz), anything higher would exceed it.',
                          'zh-CN': '⚠ Frame Rate 已自动从 {from} Hz 降为 {to} Hz —— TCON UI DCLK 设成 {ui} MHz（TX {tx} MHz）之后，再高的 Frame Rate 就会超出它。' },
  /* 下限／上限來自機種規格。{m}=機種 {lo}/{hi}=該機種的 UI DCLK 規格值 {t}=換算成 TX 的界限 */
  'wfg.errDclkSpecMin': { 'zh-TW': '{m} 的 TCON UI DCLK 規格下限是 {lo} MHz（換算成 TX DCLK ＝ {t} MHz），已保留原本的值。',
                          'en': 'The TCON UI DCLK spec minimum for {m} is {lo} MHz (TX DCLK {t} MHz). The previous value was kept.',
                          'zh-CN': '{m} 的 TCON UI DCLK 规格下限是 {lo} MHz（换算成 TX DCLK ＝ {t} MHz），已保留原本的值。' },
  'wfg.errDclkSpecMax': { 'zh-TW': '{m} 的 TCON UI DCLK 規格上限是 {hi} MHz（換算成 TX DCLK ＝ {t} MHz），已保留原本的值。',
                          'en': 'The TCON UI DCLK spec maximum for {m} is {hi} MHz (TX DCLK {t} MHz). The previous value was kept.',
                          'zh-CN': '{m} 的 TCON UI DCLK 规格上限是 {hi} MHz（换算成 TX DCLK ＝ {t} MHz），已保留原本的值。' },
  /* 下限已經高過上限 —— 這組 Frame 參數與這顆機種不相容，要改的是 Frame 參數不是這一格。 */
  'wfg.errDclkRangeEmpty': { 'zh-TW': '目前的 Frame 參數與 {m} 不相容：RX DCLK 換算後的 TCON UI DCLK 至少要 {need} MHz，已超過 {m} 的規格上限 {hi} MHz（規格範圍 {lo}～{hi} MHz）。請先調整 Frame Rate／HTOTAL／VTOTAL，或改選其他機種。',
                          'en': 'The current frame parameters are incompatible with {m}: RX DCLK implies a TCON UI DCLK of at least {need} MHz, above the {hi} MHz spec limit for {m} (spec range {lo}-{hi} MHz). Adjust Frame Rate / HTOTAL / VTOTAL, or pick another model.',
                          'zh-CN': '目前的 Frame 参数与 {m} 不兼容：RX DCLK 换算后的 TCON UI DCLK 至少要 {need} MHz，已超过 {m} 的规格上限 {hi} MHz（规格范围 {lo}～{hi} MHz）。请先调整 Frame Rate／HTOTAL／VTOTAL，或改选其他机种。' },
  /* 換機種後目前值超出新機種範圍 → 夾到最近的界限，但**寫明前後數字與原因**（不是靜默夾值）。 */
  'wfg.dclkAutoAdjust': { 'zh-TW': '已換成 {m}：TX DCLK 由 {from} 調整為 {to} MHz，因為 {m} 的 TCON UI DCLK 規格範圍是 {lo}～{hi} MHz。',
                          'en': 'Switched to {m}: TX DCLK adjusted from {from} to {to} MHz, because the TCON UI DCLK spec range for {m} is {lo}-{hi} MHz.',
                          'zh-CN': '已换成 {m}：TX DCLK 由 {from} 调整为 {to} MHz，因为 {m} 的 TCON UI DCLK 规格范围是 {lo}～{hi} MHz。' },
  /* 🔴 v4.34.0：換機種時 TCON UI DCLK 被夾**而且** Frame Rate 也跟著被拉下來（琥珀告知）。
     句型刻意與 `uiCapFpsAutoFit`（v4.32.0）／`codeFpsAutoFit`（v4.31.1）一致 ——
     「Frame Rate 已自動由 A 降為 B，因為……」在站上只有一種說法。
     {m}=新機種 {fromUi}/{toUi}=TCON UI DCLK 前後值 {from}/{to}=TX 前後值
     {fpsFrom}/{fpsTo}=Frame Rate 前後值 {hi}=新機種的 UI DCLK 規格上限 */
  'wfg.tconSwitchAutoAdjust': {
    'zh-TW': '⚠ 已換成 {m}：TCON UI DCLK 由 {fromUi} 降為 {toUi} MHz（TX {from} → {to} MHz），Frame Rate 也自動由 {fpsFrom} Hz 降為 {fpsTo} Hz —— {m} 的 TCON UI DCLK 上限是 {hi} MHz，Frame Rate 再高就會讓 RX DCLK 超過它。',
    'en': '⚠ Switched to {m}: TCON UI DCLK lowered from {fromUi} to {toUi} MHz (TX {from} → {to} MHz), and Frame Rate was automatically lowered from {fpsFrom} Hz to {fpsTo} Hz - the TCON UI DCLK limit for {m} is {hi} MHz, and a higher Frame Rate would push RX DCLK past it.',
    'zh-CN': '⚠ 已换成 {m}：TCON UI DCLK 由 {fromUi} 降为 {toUi} MHz（TX {from} → {to} MHz），Frame Rate 也自动由 {fpsFrom} Hz 降为 {fpsTo} Hz —— {m} 的 TCON UI DCLK 上限是 {hi} MHz，Frame Rate 再高就会让 RX DCLK 超过它。' },
  /* 🔴 v4.34.0：換機種時 Line Buffer 被夾到新機種的上限（就地提示，貼在 Line Buffer 那一格）。
     🔴 **NB 與 MNT 分成兩句**：NB 畫面上根本沒有 First Line Read 那一格、MNT 也沒有
     PRE_BLK_RD_NO 這顆 register，共用一句一定有一半的使用者對不上畫面
     （v4.24.1 為 `nbSumOverLimit`／`flrOverLimit` 分家時記過同一個教訓）。
     {m}=新機種 {from}/{to}=Line Buffer 前後值（RX 行）{f}/{t}=換算成 FLR 單位的前後值 */
  'wfg.lbClampedOnTconChangeNb': {
    'zh-TW': '已換成 {m}：Line Buffer 由 {from} 條降為 {to} 條（ST_LINE_RD ＝ {t}、PRE_BLK_RD_NO ＝ 0），因為 {m} 只支援到 {to} 條。',
    'en': 'Switched to {m}: Line Buffer lowered from {from} to {to} lines (ST_LINE_RD = {t}, PRE_BLK_RD_NO = 0), because {m} supports only {to} lines.',
    'zh-CN': '已换成 {m}：Line Buffer 由 {from} 条降为 {to} 条（ST_LINE_RD ＝ {t}、PRE_BLK_RD_NO ＝ 0），因为 {m} 只支持到 {to} 条。' },
  'wfg.lbClampedOnTconChange': {
    'zh-TW': '已換成 {m}：Line Buffer 由 {from} 條降為 {to} 條（First Line Read ＝ {t}），因為 {m} 只支援到 {to} 條。',
    'en': 'Switched to {m}: Line Buffer lowered from {from} to {to} lines (First Line Read = {t}), because {m} supports only {to} lines.',
    'zh-CN': '已换成 {m}：Line Buffer 由 {from} 条降为 {to} 条（First Line Read ＝ {t}），因为 {m} 只支持到 {to} 条。' },
  /* ══ v4.7.1：上游參數（Frame Rate／HTOTAL／VTOTAL）的硬上限 ═════════════════
     上限來自機種的 TCON UI DCLK 上限反推：Pixel Rate ≤ 2 × 機種上限 ÷ ratio。
     {m}=機種 {max}=該參數的上限 {px}=Pixel Rate 上限 {f}=欄位名 */
  'wfg.errFpsMax':      { 'zh-TW': 'Frame Rate 最高只能到 {max} Hz —— 再高的話 {m} 的 TCON UI DCLK 就會超出規格（Pixel Rate 上限 {px} MHz）。要再往上，請先降低 HTOTAL／VTOTAL 或改選其他機種。',
                          'en': 'Frame Rate can go up to {max} Hz - any higher and the TCON UI DCLK for {m} would exceed spec (Pixel Rate limit {px} MHz). Lower HTOTAL / VTOTAL first, or pick another model.',
                          'zh-CN': 'Frame Rate 最高只能到 {max} Hz —— 再高的话 {m} 的 TCON UI DCLK 就会超出规格（Pixel Rate 上限 {px} MHz）。要再往上，请先降低 HTOTAL／VTOTAL 或改选其他机种。' },
  /* ══ v4.31.5：擋下 Frame Rate 的是**使用者當前設定的 TCON UI DCLK**（定頻） ═══════
     與 `errFpsMax`（機種規格）刻意分成兩則：出路不同 —— 這一則的出路是「把 TCON UI DCLK
     調高」，那一則是「降 HTOTAL／VTOTAL 或換機種」。混成一則會把使用者指去錯的地方。
     {max}=目前的 fps 上限 {ui}=目前 UI DCLK {tx}=目前 TX DCLK
     {m}=機種 {hi}=機種 UI DCLK 上限 {smax}=用機種上限算出來的 fps 上限 */
  'wfg.errFpsMaxUi':    { 'zh-TW': 'Frame Rate 最高只能到 {max} Hz —— 這個上限由目前的 TCON UI DCLK {ui} MHz（TX {tx} MHz）決定。TCON 的頻率設定好之後就不會變，系統再往上送會超出它的能力。要再往上，請先把 TCON UI DCLK 調高（{m} 最高 {hi} MHz，對應 {smax} Hz）。',
                          'en': 'Frame Rate can go up to {max} Hz - this ceiling comes from the current TCON UI DCLK of {ui} MHz (TX {tx} MHz). Once the TCON clock is configured it does not change, so anything the system sends above it exceeds what the TCON can handle. To go higher, raise the TCON UI DCLK first ({m} tops out at {hi} MHz, which allows {smax} Hz).',
                          'zh-CN': 'Frame Rate 最高只能到 {max} Hz —— 这个上限由目前的 TCON UI DCLK {ui} MHz（TX {tx} MHz）决定。TCON 的频率设定好之后就不会变，系统再往上送会超出它的能力。要再往上，请先把 TCON UI DCLK 调高（{m} 最高 {hi} MHz，对应 {smax} Hz）。' },
  'wfg.errFpsMin':      { 'zh-TW': '變頻應用下 Frame Rate 最低只能到 {min} Hz —— 再低的話 {m} 的 TCON UI DCLK 會低於規格下限 {lo} MHz。（定頻應用沒有這個限制，因為 TX DCLK 不會跟著降。）',
                          'en': 'In variable-clock mode the Frame Rate can go down to {min} Hz - any lower and the TCON UI DCLK for {m} would fall below its {lo} MHz spec minimum. (Fixed-clock mode has no such limit: TX DCLK does not follow it down.)',
                          'zh-CN': '变频应用下 Frame Rate 最低只能到 {min} Hz —— 再低的话 {m} 的 TCON UI DCLK 会低于规格下限 {lo} MHz。（定频应用没有这个限制，因为 TX DCLK 不会跟着降。）' },
  'wfg.errTotalMax':    { 'zh-TW': '{f} 最高只能到 {max} —— 再高的話 {m} 的 TCON UI DCLK 就會超出規格（Pixel Rate 上限 {px} MHz）。要再往上，請先降低 Frame Rate 或改選其他機種。',
                          'en': '{f} can go up to {max} - any higher and the TCON UI DCLK for {m} would exceed spec (Pixel Rate limit {px} MHz). Lower the Frame Rate first, or pick another model.',
                          'zh-CN': '{f} 最高只能到 {max} —— 再高的话 {m} 的 TCON UI DCLK 就会超出规格（Pixel Rate 上限 {px} MHz）。要再往上，请先降低 Frame Rate 或改选其他机种。' },
  /* ══ v4.28.1：blanking 兩格的**下限**（Bruce 2026-08-26）════════════════════════
     兩層下限的理由不同，文案必須分開：硬底線 10 觸發時扯「UI DCLK 低於規格下限」
     是假話（定頻下機種那一層根本不存在）。{f}=欄位名 {min}=該格下限 {m}=機種 {lo}=規格下限
     🔴 只有 VBLANK／HBLANK 有這兩則 —— Vactive／Hactive 沒有下限保護。 */
  'wfg.errBlankMinHard': { 'zh-TW': '{f} 最低只能到 {min}。已保留原本的值。',
                          'en': '{f} can go down to {min}. The previous value was kept.',
                          'zh-CN': '{f} 最低只能到 {min}。已保留原本的值。' },
  'wfg.errBlankMinSpec': { 'zh-TW': '{f} 最低只能到 {min} —— 再低的話 {m} 的 TCON UI DCLK 會低於規格下限 {lo} MHz。已保留原本的值。',
                          'en': '{f} can go down to {min} - any lower and the TCON UI DCLK for {m} would fall below its {lo} MHz spec minimum. The previous value was kept.',
                          'zh-CN': '{f} 最低只能到 {min} —— 再低的话 {m} 的 TCON UI DCLK 会低于规格下限 {lo} MHz。已保留原本的值。' },
  /* ══ v4.28.1：**狀態型**警示的中性版本 ══════════════════════════════════════════
     🔴 `wfgRefreshRangeWarning()` 原本直接借用 `wfgValidateTxDclk()` 的 `chk.err`，
     而那幾則是為「打字被拒絕」那條路徑寫的、結尾都是「已保留原本的值」——
     當成**現況說明**顯示時那句話是假的（值根本沒被保留，是它自己漂過界的）。
     這兩則只描述現況與該往哪裡調，不談「保留」。{cur}=目前 UI DCLK */
  'wfg.stateUiBelowMin': { 'zh-TW': 'TCON UI DCLK {cur} MHz 低於 {m} 規格下限 {lo} MHz。請提高 Frame Rate 或 HTOTAL／VTOTAL。',
                          'en': 'TCON UI DCLK is {cur} MHz, below the {lo} MHz spec minimum for {m}. Raise the Frame Rate or HTOTAL / VTOTAL.',
                          'zh-CN': 'TCON UI DCLK {cur} MHz 低于 {m} 规格下限 {lo} MHz。请提高 Frame Rate 或 HTOTAL／VTOTAL。' },
  'wfg.stateUiAboveMax': { 'zh-TW': 'TCON UI DCLK {cur} MHz 高於 {m} 規格上限 {hi} MHz。請降低 Frame Rate 或 HTOTAL／VTOTAL。',
                          'en': 'TCON UI DCLK is {cur} MHz, above the {hi} MHz spec maximum for {m}. Lower the Frame Rate or HTOTAL / VTOTAL.',
                          'zh-CN': 'TCON UI DCLK {cur} MHz 高于 {m} 规格上限 {hi} MHz。请降低 Frame Rate 或 HTOTAL／VTOTAL。' },
  /* ══ 🔴 v4.29.0：目前的 Frame 參數已超出這顆機種的能力 ══════════════════════════
     取代舊的 `errDclkRangeEmpty` 當作**現況說明**（那一則仍留著當退路）。
     差別是它講的是使用者該動的那一格與具體數字，而不是「不相容」這個結論：
     {m}=機種、{max}=這組解析度下的 Frame Rate 上限、{cur}=目前的 Frame Rate。
     兩句，不談暫存器、不談內部欄位 —— 這是 Bruce 2026-08-26 對文案的明確要求。 */
  'wfg.stateOverSpecFps': { 'zh-TW': '{m} 這組解析度最高只跑得到 {max} Hz，目前是 {cur} Hz。請先降低 Frame Rate，VBLANK／HBLANK 才調得動。',
                          'en': 'At this resolution {m} tops out at {max} Hz, but it is currently {cur} Hz. Lower the Frame Rate first — VBLANK / HBLANK stay locked until you do.',
                          'zh-CN': '{m} 这组分辨率最高只跑得到 {max} Hz，目前是 {cur} Hz。请先降低 Frame Rate，VBLANK／HBLANK 才调得动。' },
  /* v4.7.0：NB 機種一定是定頻應用（Bruce 2026-08-23） */
  'wfg.varClockNbTitle': { 'zh-TW': 'Notebook TCON 一定是定頻應用，不能選變頻',
                          'en': 'Notebook TCONs are always fixed-clock; variable clock is not available',
                          'zh-CN': 'Notebook TCON 一定是定频应用，不能选变频' },
  /* v3.30.0：TCON Code 匯入／匯出 */
  'wfg.grpCode':        { 'zh-TW': 'Code', 'en': 'Code', 'zh-CN': 'Code' },
  'wfg.codeTconTitle':  { 'zh-TW': '選擇 TCON 型號（* ＝ 尚未支援）',
                          'en': 'Select TCON model (* = not supported yet)',
                          'zh-CN': '选择 TCON 型号（* ＝ 尚未支持）' },
  'wfg.codeImportTitle':{ 'zh-TW': '匯入 TCON code 檔', 'en': 'Import TCON code file', 'zh-CN': '导入 TCON code 档' },
  'wfg.codeExportTitle':{ 'zh-TW': '匯出為 TCON 可載入的檔案', 'en': 'Export a file the TCON tool can load',
                          'zh-CN': '导出为 TCON 可载入的档案' },
  /* v4.6.0：可用型號 {list} 由 wfgCodeSupportedList() 從 WFG_TCON_CODECS 算出來。
     舊文案寫死「目前只實作 EM02」，E512 從 v4.3.0 起支援之後那句話就是錯的。 */
  'wfg.codeNotSupported': { 'zh-TW': '{m} 目前還沒建置，已取消這次操作。\n目前可用的型號：{list}',
                            'en': '{m} is not built yet, so this operation was cancelled.\nAvailable models: {list}',
                            'zh-CN': '{m} 目前还没建置，已取消这次操作。\n目前可用的型号：{list}' },
  /* 🔴 v4.27.3：Bruce 圈出這一段說「寫這麼多沒有人會看」。原本 {d} 帶著檔案大小／
     GPO SLOT 檔案偏移／CKS／GATE 型態／FIRST LINE READ／FRM_NO／EN 幾分之幾／
     三組候選 timing 一整串。全部拿掉，只留一句。檔名本來就另外顯示在上一行。 */
  'wfg.codeImportOk':   { 'zh-TW': '已匯入 {n} 條數位信號',
                          'en': 'Imported {n} digital signals',
                          'zh-CN': '已导入 {n} 条数字信号' },
  'wfg.codeImportFail': { 'zh-TW': '無法解析 {f}：{r}\n未變更任何設定。',
                          'en': 'Cannot parse {f}: {r}\nNothing was changed.',
                          'zh-CN': '无法解析 {f}：{r}\n未变更任何设定。' },
  'wfg.codeErrTooSmall':{ 'zh-TW': '檔案太小，不像完整的 code 映像', 'en': 'file too small to be a full code image',
                          'zh-CN': '档案太小，不像完整的 code 映像' },
  'wfg.codeErrNoMatch': { 'zh-TW': '16 個候選位置都通不過合理性檢查（可能不是 EM02 的 code）',
                          'en': 'none of the 16 candidate offsets passed the sanity check (may not be an EM02 code)',
                          'zh-CN': '16 个候选位置都通不过合理性检查（可能不是 EM02 的 code）' },
  'wfg.codeErrAmbiguous': { 'zh-TW': '有 {n} 個候選位置同時通過，無法確定 GPO 區塊位置',
                            'en': '{n} candidate offsets passed at once; the GPO block cannot be located reliably',
                            'zh-CN': '有 {n} 个候选位置同时通过，无法确定 GPO 区块位置' },
  'wfg.codeErrBit8':    { 'zh-TW': '{s} 的 ACT_TYPE/R_PH/F_PH 超過 255，第 9 位元的寫入位置尚未驗證，拒絕匯出',
                          'en': 'ACT_TYPE/R_PH/F_PH of {s} exceeds 255; the 9th-bit location is unverified, export refused',
                          'zh-CN': '{s} 的 ACT_TYPE/R_PH/F_PH 超过 255，第 9 位元的写入位置尚未验证，拒绝导出' },
  'wfg.codeChunkOff':   { 'zh-TW': '偵測到未下載的區塊', 'en': 'chunks detected as not downloaded',
                          'zh-CN': '侦测到未下载的区块' },
  'wfg.codeOverflow':   { 'zh-TW': '⚠ 這幾條訊號的 ST/SP LINE 超出 frame 範圍，波形畫不出來：{s}',
                          'en': '⚠ these signals have ST/SP LINE beyond the frame, so no waveform is drawn: {s}',
                          'zh-CN': '⚠ 这几条信号的 ST/SP LINE 超出 frame 范围，波形画不出来：{s}' },
  'wfg.frmnoApprox':    { 'zh-TW': '⚠ 顯示近似：{s} 的轉態週期超過目前的 Frame 重複數（{n}），畫面上把那一次轉態擺在最中心的 frame，好讓你看得到、能調 timing。這不是真實位置；匯出的 code 一律寫真實的 FRM_NO。',
                          'en': '⚠ Approximate display: {s} toggles less often than the current frame count ({n}), so the single transition is drawn on the centre frame to keep it visible and adjustable. This is not its real position; the exported code always carries the real FRM_NO.',
                          'zh-CN': '⚠ 显示近似：{s} 的转态周期超过目前的 Frame 重复数（{n}），画面上把那一次转态摆在最中心的 frame，好让你看得到、能调 timing。这不是真实位置；导出的 code 一律写真实的 FRM_NO。' },
  'wfg.codeErrNotThisModel': { 'zh-TW': '這個檔案的內容不符合 {m} 的 GPO 格式，已拒絕匯入（可能不是 {m} 的 code）。',
                          'en': 'This file does not match the {m} GPO layout, so it was rejected (it may not be a {m} code).',
                          'zh-CN': '这个档案的内容不符合 {m} 的 GPO 格式，已拒绝导入（可能不是 {m} 的 code）。' },
  /* ══ v4.11.0：EEPROM／Flash 載體判定（型號無關的通則）══════════════════════
     {n} ＝ **實際內容長度**（hex 會先解碼，不是檔案 byte 數），{e} ＝ 8192，{f} ＝ 131072。 */
  'wfg.codeErrMediumSize': { 'zh-TW': 'code 只有兩種合法大小：EEPROM 版 ≤ {e} bytes（8 KB ＝ 64 Kbit），Flash 版 ≥ {f} bytes（128 KB）。\n這個檔案的實際內容是 {n} bytes，落在兩者中間，不是合法的 code，已取消匯入。',
                          'en': 'A code image has only two valid sizes: EEPROM <= {e} bytes (8 KB = 64 Kbit) or Flash >= {f} bytes (128 KB).\nThis file holds {n} bytes of content, which falls between the two, so it is not a valid code image and the import was cancelled.',
                          'zh-CN': 'code 只有两种合法大小：EEPROM 版 ≤ {e} bytes（8 KB ＝ 64 Kbit），Flash 版 ≥ {f} bytes（128 KB）。\n这个档案的实际内容是 {n} bytes，落在两者中间，不是合法的 code，已取消导入。' },
  'wfg.codeEm01FewEnabled': { 'zh-TW': '⚠ 這份 code 的暫存器映像裡只有 {n}/18 條 GPO 是 enable 的。這是檔案內容本身如此，不是解析失敗；enable 沒打開的訊號在波形區畫不出來。',
                          'en': '⚠ Only {n} of 18 GPO signals are enabled in this code image. That is what the file contains, not a parse failure; signals left disabled are not drawn.',
                          'zh-CN': '⚠ 这份 code 的寄存器映像里只有 {n}/18 条 GPO 是 enable 的。这是档案内容本身如此，不是解析失败；enable 没打开的信号在波形区画不出来。' },
  'wfg.codeDlyOver':    { 'zh-TW': '⚠ 這幾條訊號的 R_DLY/F_DLY 超過 HTOTAL（{h}）：{s}。值已照實匯入，但那多半是 code 裡殘留的樣板值。',
                          'en': '⚠ These signals have R_DLY/F_DLY beyond HTOTAL ({h}): {s}. The values were imported as-is, but they are most likely leftovers from a template.',
                          'zh-CN': '⚠ 这几条信号的 R_DLY/F_DLY 超过 HTOTAL（{h}）：{s}。值已照实导入，但那多半是 code 里残留的样板值。' },
  /* ══ v4.15.0：數位訊號欄位位元寬（型號層級）══════════════════════════════ */
  'wfg.gpoRangeBlocked': { 'zh-TW': '{f} 上限 {max}，{v} 超出範圍 → 已保留原值 {keep}',
                          'en': '{f} max is {max}; {v} is out of range -> kept {keep}',
                          'zh-CN': '{f} 上限 {max}，{v} 超出范围 → 已保留原值 {keep}' },
  /* ══ v4.21.0：數位訊號總表 ══════════════════════════════════════════════ */
  'wfg.ovBtn':          { 'zh-TW': '總表', 'en': 'Overview', 'zh-CN': '总表' },
  'wfg.ovBtnHint':      { 'zh-TW': '18 條數位訊號一次看完，可直接改值',
                          'en': 'All 18 digital signals in one table; values are editable here',
                          'zh-CN': '18 条数字信号一次看完，可直接改值' },
  'wfg.ovTitle':        { 'zh-TW': '數位訊號總表', 'en': 'Digital Signal Overview', 'zh-CN': '数字信号总表' },
  'wfg.ovSignal':       { 'zh-TW': '訊號', 'en': 'Signal', 'zh-CN': '信号' },
  'wfg.ovSub':          { 'zh-TW': '目前機種 {m}（{cls}）；{n} 條訊號。欄位上限與 OAX/COMBO 的型態都跟著機種走，換機種會自動重畫。',
                          'en': 'Model {m} ({cls}); {n} signals. Field limits and the OAX/COMBO cell type follow the model and redraw automatically when it changes.',
                          'zh-CN': '目前机种 {m}（{cls}）；{n} 条信号。字段上限与 OAX/COMBO 的型态都跟着机种走，换机种会自动重画。' },
  /* 🔴 v4.36.0：這一句指名的是**左側那張卡片**，卡片改名就要跟著改，
     否則使用者照這句話去找「數位訊號卡片」會找不到。其餘幾處的「數位訊號」
     （wfg.ovBtnHint 的「18 條數位訊號」、wfg.ovTitle 的「數位訊號總表」、
     wfg.codeImportOk 的「已匯入 {n} 條數位信號」）指的是**訊號本身**不是卡片，
     一律不動 —— 改名改的是一張卡片的名字，不是換掉一個詞。 */
  'wfg.ovFoot':         { 'zh-TW': '點一列可反白；表格內改值會即時連動到左側的 TCON 數位信號卡片與波形。按 Esc、點視窗外或右上 ✕ 關閉。',
                          'en': 'Click a row to highlight it. Edits here update the TCON Digital Signals card and the waveform immediately. Press Esc, click outside, or use ✕ to close.',
                          'zh-CN': '点一列可反白；表格内改值会即时连动到左侧的 TCON 数字信号卡片与波形。按 Esc、点视窗外或右上 ✕ 关闭。' },
  'wfg.ovFixed':        { 'zh-TW': '硬體固定', 'en': 'fixed', 'zh-CN': '硬件固定' },
  'wfg.ovNeedToggle':   { 'zh-TW': 'TG_INI_VAL 只在該訊號勾了 Toggle 時有作用',
                          'en': 'TG_INI_VAL only applies when Toggle is checked for this signal',
                          'zh-CN': 'TG_INI_VAL 只在该信号勾了 Toggle 时有作用' },
  'wfg.ovFphMask':      { 'zh-TW': 'Toggle 模式下 F_PH 是位元遮罩（指定看 R_PH_CNT 的哪個 bit），不是相位起始值',
                          'en': 'In Toggle mode F_PH is a bit mask (which R_PH_CNT bit to watch), not a phase start value',
                          'zh-CN': 'Toggle 模式下 F_PH 是位掩码（指定看 R_PH_CNT 的哪个 bit），不是相位起始值' },
  'wfg.ovFdlyUnused':   { 'zh-TW': 'Toggle 模式不使用 F_DLY（兩個方向的轉態都用 R_DLY）',
                          'en': 'F_DLY is unused in Toggle mode (both edges use R_DLY)',
                          'zh-CN': 'Toggle 模式不使用 F_DLY（两个方向的转态都用 R_DLY）' },
  'wfg.gpoClampedOnTconChange': { 'zh-TW': '已切換到 {m}。\n\n這顆機種有 {n} 個欄位的值超出它的暫存器位元寬，已調整到各自的上限：\n\n{s}\n\n這些欄位現在可以自由往下調；要恢復原本的數值，切回原本的機種即可。',
                          'en': 'Switched to {m}.\n\n{n} field(s) held values wider than this model\'s registers allow, so they were reduced to each field\'s maximum:\n\n{s}\n\nThese fields can be lowered freely from here; switching back to the previous model restores the original values.',
                          'zh-CN': '已切换到 {m}。\n\n这颗机种有 {n} 个字段的值超出它的寄存器位宽，已调整到各自的上限：\n\n{s}\n\n这些字段现在可以自由往下调；要恢复原本的数值，切回原本的机种即可。' },
  /* ══ v4.16.0：匯出的型號確認框 ＋ 跨型號相容性 ══════════════════════════ */
  /* ══ v4.17.1：匯入卡片上兩格的完整名稱與換算關係式 ══════════════════════ */
  'wfg.ackUiLbl':       { 'zh-TW': 'TCON({m}) UI DCLK', 'en': 'TCON({m}) UI DCLK', 'zh-CN': 'TCON({m}) UI DCLK' },
  'wfg.ackRelTitle':    { 'zh-TW': '{m} 的 TCON UI DCLK ＝ TX DCLK × {r}。兩格互相換算就是用這個係數，改任一格另一格都會即時跟著變。',
                          'en': 'On {m}, TCON UI DCLK = TX DCLK x {r}. The two fields convert with this ratio; editing either one updates the other live.',
                          'zh-CN': '{m} 的 TCON UI DCLK ＝ TX DCLK × {r}。两格互相换算就是用这个系数，改任一格另一格都会即时跟着变。' },
  /* ══ v4.17.0：匯入的型號確認框（取代 Code group 的常駐下拉）══════════════ */
  'wfg.impTitle':       { 'zh-TW': '要匯入哪一顆 TCON 的 code？', 'en': 'Which TCON\'s code are you importing?',
                          'zh-CN': '要导入哪一颗 TCON 的 code？' },
  'wfg.impSub':         { 'zh-TW': '目前畫面上的機種是 {m}。先確認型號選對了，再挑檔案 —— 型號決定怎麼解析這份 code，選錯會解出完全不同的東西。',
                          'en': 'The model currently on screen is {m}. Confirm the model before picking a file - it decides how the code is parsed, and the wrong one yields completely different values.',
                          'zh-CN': '目前画面上的机种是 {m}。先确认型号选对了，再挑档案 —— 型号决定怎么解析这份 code，选错会解出完全不同的东西。' },
  'wfg.impPickName':    { 'zh-TW': 'TCON 型號', 'en': 'TCON model', 'zh-CN': 'TCON 型号' },
  'wfg.impOk':          { 'zh-TW': '選好了，選擇檔案', 'en': 'Confirm and pick a file', 'zh-CN': '选好了，选择档案' },
  'wfg.impCancel':      { 'zh-TW': '取消', 'en': 'Cancel', 'zh-CN': '取消' },
  'wfg.impNoParser':    { 'zh-TW': '{m} 的 code 解析尚未建置，無法匯入', 'en': 'Code parsing for {m} is not implemented yet',
                          'zh-CN': '{m} 的 code 解析尚未建置，无法导入' },
  /* v4.19.0：匯入框裡不再講跨型號相容（夾值／COMBO 語意差異）——
     匯入本來就會用新檔案把整組波形換掉，拿匯入前的舊值去比對相容性在語意上不成立。
     這兩則改成中性說明：只講「會換成哪一顆、會整組覆蓋」。 */
  'wfg.impSwitchName':  { 'zh-TW': '會以 {to} 的格式讀取（目前是 {from}）', 'en': 'The file will be read as {to} (currently {from})',
                          'zh-CN': '会以 {to} 的格式读取（目前是 {from}）' },
  'wfg.impSwitchWhere': { 'zh-TW': '匯入會用檔案的內容整組更新波形，目前畫面上的數值會被覆蓋。按「取消」則什麼都不會動。',
                          'en': 'Importing replaces the whole waveform with the contents of the file; the values currently on screen will be overwritten. Cancel leaves everything untouched.',
                          'zh-CN': '导入会用文件的内容整组更新波形，目前画面上的数值会被覆盖。按「取消」则什么都不会动。' },
  'wfg.expTitle':       { 'zh-TW': '要用哪一顆 TCON 的格式匯出？', 'en': 'Which TCON format should this be exported as?',
                          'zh-CN': '要用哪一颗 TCON 的格式导出？' },
  'wfg.expSub':         { 'zh-TW': '目前畫面上的機種是 {m}。可以改用別顆匯出 —— 選定的型號只決定產出格式，不會改動畫面上的任何數值。',
                          'en': 'The model currently on screen is {m}. You may export as a different one - the choice here only decides the output format and changes nothing on screen.',
                          'zh-CN': '目前画面上的机种是 {m}。可以改用别颗导出 —— 选定的型号只决定产出格式，不会改动画面上的任何数值。' },
  'wfg.expPickName':    { 'zh-TW': '匯出格式', 'en': 'Export format', 'zh-CN': '导出格式' },
  'wfg.expCurrentTag':  { 'zh-TW': '← 目前機種', 'en': '<- current', 'zh-CN': '← 目前机种' },
  'wfg.expOk':          { 'zh-TW': '用選定的型號匯出', 'en': 'Export with the selected model', 'zh-CN': '用选定的型号导出' },
  'wfg.expSwitch':      { 'zh-TW': '切換到該型號並自動調整', 'en': 'Switch to that model and adjust', 'zh-CN': '切换到该型号并自动调整' },
  'wfg.expCancel':      { 'zh-TW': '取消', 'en': 'Cancel', 'zh-CN': '取消' },
  /* ══ v4.16.2：超界改夾值（取代 v4.16.0 的「擋下」）══════════════════════════ */
  'wfg.expClampName':   { 'zh-TW': '有 {n} 個欄位超出 {m} 的暫存器，匯出時會夾到上限',
                          'en': '{n} field(s) exceed the {m} registers and will be clamped on export',
                          'zh-CN': '有 {n} 个字段超出 {m} 的寄存器，导出时会夹到上限' },
  'wfg.expClampWhere':  { 'zh-TW': '這些值放不進該型號的位元寬，匯出時一律夾到各自的上限。清單會照實寫出來，匯出後也會再提醒一次。若不想被夾，可按下方按鈕切換到該型號，自己調整後再匯出。',
                          'en': 'These values do not fit that model\'s register width and are clamped to each field\'s maximum on export. The list is shown here and again after the export. To avoid clamping, use the button below to switch to that model and adjust them yourself first.',
                          'zh-CN': '这些值放不进该型号的位宽，导出时一律夹到各自的上限。清单会照实写出来，导出后也会再提醒一次。若不想被夹，可按下方按钮切换到该型号，自己调整后再导出。' },
  'wfg.expSkipName':    { 'zh-TW': '有 {n} 條訊號未啟用（Enable 沒勾），整條不會寫進匯出的清單',
                          'en': '{n} signal(s) are not enabled and are omitted from the export entirely',
                          'zh-CN': '有 {n} 条信号未启用（Enable 没勾），整条不会写进导出的清单' },
  'wfg.codeNbClamped':  { 'zh-TW': '⚠ 以下欄位超出 {m} 的暫存器位元寬，已夾到上限後寫入：\n{s}',
                          'en': '⚠ These fields exceeded the {m} register width and were clamped before writing:\n{s}',
                          'zh-CN': '⚠ 以下字段超出 {m} 的寄存器位宽，已夹到上限后写入：\n{s}' },
  'wfg.codeNbSkipped':  { 'zh-TW': 'ℹ 有 {n} 條訊號未啟用，整條沒有寫進清單：{s}',
                          'en': 'ℹ {n} signal(s) are not enabled and were omitted entirely: {s}',
                          'zh-CN': 'ℹ 有 {n} 条信号未启用，整条没有写进清单：{s}' },
  'wfg.expOverName':    { 'zh-TW': '有 {n} 個欄位放不進 {m} 的暫存器，無法匯出',
                          'en': '{n} field(s) do not fit into the {m} registers - cannot export',
                          'zh-CN': '有 {n} 个字段放不进 {m} 的寄存器，无法导出' },
  'wfg.expOverWhere':   { 'zh-TW': '這些值超過該型號的位元寬。硬寫出去的檔案看起來正常、值卻是錯的，所以不提供「照樣匯出」。請先調整，或按下方按鈕切換到該型號（會自動夾到上限並逐條告訴你改了什麼）。',
                          'en': 'These values exceed that model\'s register width. A file written anyway would look fine but carry wrong values, so there is no "export regardless" option. Adjust them first, or use the button below to switch to that model (values are clamped and every change is listed).',
                          'zh-CN': '这些值超过该型号的位宽。硬写出去的档案看起来正常、值却是错的，所以不提供「照样导出」。请先调整，或按下方按钮切换到该型号（会自动夹到上限并逐条告诉你改了什么）。' },
  'wfg.expMaxIs':       { 'zh-TW': '上限 {v}', 'en': 'max {v}', 'zh-CN': '上限 {v}' },
  'wfg.expNotEnabled':  { 'zh-TW': '（此訊號未啟用）', 'en': '(signal not enabled)', 'zh-CN': '（此信号未启用）' },
  'wfg.expOkBlockedTitle': { 'zh-TW': '有欄位放不進目標型號的暫存器，請先處理上方列出的項目',
                          'en': 'Some fields do not fit the target model; resolve the items listed above first',
                          'zh-CN': '有字段放不进目标型号的寄存器，请先处理上方列出的项目' },
  /* v4.16.2：COMBO 跨型號分方向 —— NB→MNT 是自動轉換、MNT→NB 只警示 */
  'wfg.expComboNbToMnt': { 'zh-TW': '有 COMBO 對象無法帶到 {m}（本工具沒有對應通道）',
                          'en': 'Some COMBO sources cannot be carried over to {m} (no matching channel here)',
                          'zh-CN': '有 COMBO 对象无法带到 {m}（本工具没有对应通道）' },
  'wfg.expComboNbToMntWhere': { 'zh-TW': 'Notebook 的固定 COMBO 對象**會自動寫進 Monitor 的彈性 OAX 設定**，波形因此一致。但下列這幾條的對象在本工具沒有對應通道（例如 EN01 的 GPO2），轉不過去 —— 匯出的檔案在這幾條上不會有相同的 COMBO 行為，請注意。',
                          'en': 'A notebook\'s fixed COMBO source is written into the monitor\'s flexible OAX setting automatically, so the waveform matches. The signals below, however, point at a channel this tool does not have (e.g. GPO2 on EN01) and cannot be carried over - the exported file will not reproduce their COMBO behaviour.',
                          'zh-CN': 'Notebook 的固定 COMBO 对象**会自动写进 Monitor 的弹性 OAX 设定**，波形因此一致。但下列这几条的对象在本工具没有对应通道（例如 EN01 的 GPO2），转不过去 —— 导出的档案在这几条上不会有相同的 COMBO 行为，请注意。' },
  'wfg.expComboCarried': { 'zh-TW': '{n} 條 COMBO 設定會自動帶進 {m} 的 OAX（波形一致）',
                          'en': '{n} COMBO setting(s) are carried into the {m} OAX automatically (waveform matches)',
                          'zh-CN': '{n} 条 COMBO 设定会自动带进 {m} 的 OAX（波形一致）' },
  'wfg.expComboName':   { 'zh-TW': 'COMBO 對象在 {m} 上不一樣（值仍會匯出）',
                          'en': 'COMBO sources differ on {m} (values are still exported)',
                          'zh-CN': 'COMBO 对象在 {m} 上不一样（值仍会导出）' },
  'wfg.expComboWhere':  { 'zh-TW': 'Monitor 機種可以任意指派 COMBO 對象，Notebook 機種只能用硬體固定的那一條。同一個 OR／AND／XOR 設定換到目標型號會作用在不同的訊號上 —— 值本身合法，但語意換了，請確認這是你要的。',
                          'en': 'Monitor models can assign any COMBO source; notebook models can only use the one fixed in hardware. The same OR/AND/XOR setting will act on a different signal on the target model - the value is valid, but its meaning changes. Please confirm this is intended.',
                          'zh-CN': 'Monitor 机种可以任意指派 COMBO 对象，Notebook 机种只能用硬件固定的那一条。同一个 OR／AND／XOR 设定换到目标型号会作用在不同的信号上 —— 值本身合法，但语义换了，请确认这是你要的。' },
  'wfg.expDropName':    { 'zh-TW': '{m} 沒有這幾條訊號，不會寫進匯出的清單', 'en': '{m} has no such signals; they are not written to the export',
                          'zh-CN': '{m} 没有这几条信号，不会写进导出的清单' },
  'wfg.expOkName':      { 'zh-TW': '目前的設定可以完整用 {m} 的格式匯出', 'en': 'The current settings export cleanly as {m}',
                          'zh-CN': '目前的设定可以完整用 {m} 的格式导出' },
  'wfg.expCrossNote':   { 'zh-TW': '⚠ 這一份是用 {tgt} 的格式匯出的，而畫面上的機種是 {cur}。\n畫面上的欄位上下限與 COMBO 對象顯示的仍然是 {cur} 的規格。',
                          'en': '⚠ This file was exported in {tgt} format, while the model on screen is {cur}.\nThe field limits and COMBO sources shown on screen still follow the {cur} spec.',
                          'zh-CN': '⚠ 这一份是用 {tgt} 的格式导出的，而画面上的机种是 {cur}。\n画面上的字段上下限与 COMBO 对象显示的仍然是 {cur} 的规格。' },
  /* v4.16.0：Frame 參數與機種能力不相容時，要指出真正該改的東西 */
  'wfg.errDclkEmptyBelowRx': { 'zh-TW': '這組 Frame 參數 {m} 跑不動：{fps}Hz 下需要 {need} MHz，而 {m} 的 TCON UI DCLK 上限只有 {hi} MHz。\nTX DCLK 不可低於 RX DCLK（{t} MHz）—— 要往下調，請先降低 Frame Rate 或縮小 Htotal／Vtotal。',
                          'en': 'These frame parameters are beyond {m}: {fps}Hz needs {need} MHz, but the {m} TCON UI DCLK tops out at {hi} MHz.\nTX DCLK cannot go below RX DCLK ({t} MHz) - to lower it, reduce the frame rate or shrink Htotal/Vtotal first.',
                          'zh-CN': '这组 Frame 参数 {m} 跑不动：{fps}Hz 下需要 {need} MHz，而 {m} 的 TCON UI DCLK 上限只有 {hi} MHz。\nTX DCLK 不可低于 RX DCLK（{t} MHz）—— 要往下调，请先降低 Frame Rate 或缩小 Htotal／Vtotal。' },
  /* ══ v4.15.0：NB 的 COMBO（對象硬體固定）══════════════════════════════════ */
  'wfg.comboFixedLabel': { 'zh-TW': 'COMBO 對象（固定）', 'en': 'COMBO source (fixed)',
                          'zh-CN': 'COMBO 对象（固定）' },
  'wfg.comboFixedTitle': { 'zh-TW': '{m} 的每一條數位訊號只能與硬體指定的那一條做 COMBO，不能任意指派。\n這一條的對象是 {s}，由 .model 的暫存器註解決定。\n左邊的 OAX_MODE 就是那兩個控制位元（ENG_COMB_MODE）。',
                          'en': 'On {m}, each digital signal can only be combined with the one source fixed in hardware; it cannot be reassigned.\nThe source for this signal is {s}, per the register comments in the .model file.\nOAX_MODE on the left is exactly those two control bits (ENG_COMB_MODE).',
                          'zh-CN': '{m} 的每一条数字信号只能与硬件指定的那一条做 COMBO，不能任意指派。\n这一条的对象是 {s}，由 .model 的寄存器注释决定。\n左边的 OAX_MODE 就是那两个控制位（ENG_COMB_MODE）。' },
  'wfg.comboNoChannelTag': { 'zh-TW': '（本工具無此通道）', 'en': '(no such channel here)',
                          'zh-CN': '（本工具无此通道）' },
  /* ══ v4.49.0：OAX 串接（多訊號）的唯讀提示 ═══════════════════════════════ */
  'wfg.oaxChainLabel': { 'zh-TW': '實際合成：', 'en': 'Combined as:', 'zh-CN': '实际合成：' },
  'wfg.oaxChainCycle': { 'zh-TW': '⚠ OAX_SEL 指向形成環狀，已在最後一節停止串接',
                          'en': '⚠ OAX_SEL forms a loop; chaining stops at the last node',
                          'zh-CN': '⚠ OAX_SEL 指向形成环状，已在最后一节停止串接' },
  'wfg.codeComboNoChannel': { 'zh-TW': 'ℹ 這幾條訊號的 COMBO 對象在本工具沒有對應通道，模式值已照實匯入，但波形不會做這個邏輯運算：{s}',
                          'en': 'ℹ The COMBO source of these signals has no matching channel here. The mode value was imported as-is, but the waveform does not apply the logic operation: {s}',
                          'zh-CN': 'ℹ 这几条信号的 COMBO 对象在本工具没有对应通道，模式值已照实导入，但波形不会做这个逻辑运算：{s}' },
  'wfg.codeBitWidthOver': { 'zh-TW': '🔴 這份 code 有欄位超出本機種的暫存器位元寬，已夾到上限（這代表位元寬判斷可能有誤，請回報）：{s}',
                          'en': '🔴 Some fields in this code exceed the register width of this model and were clamped (this suggests the width table may be wrong - please report): {s}',
                          'zh-CN': '🔴 这份 code 有字段超出本机种的寄存器位宽，已夹到上限（这代表位宽判断可能有误，请回报）：{s}' },
  /* ══ v4.14.0：NB（E501／E503／EN01）codec ══════════════════════════════════ */
  /* v4.44.2：E503 起有 4096／8192 兩種合法大小 ⇒ 原文「只有 {s} bytes 這一種大小」
     與括號裡的「E503 是 4096」都已經不成立，三語一併改成不預設只有一個值的講法。 */
  'wfg.codeErrNbSize':  { 'zh-TW': '{m} 的 code 合法大小是 {s} bytes，這個檔案的實際內容是 {n} bytes。\n多半是型號選錯了（E503 是 4096 或 8192、E501 是 131072），已取消匯入。',
                          'en': 'A {m} code image must be {s} bytes, but this file holds {n} bytes of content.\nThe model is most likely wrong (E503 is 4096 or 8192, E501 is 131072); import cancelled.',
                          'zh-CN': '{m} 的 code 合法大小是 {s} bytes，这个档案的实际内容是 {n} bytes。\n多半是型号选错了（E503 是 4096 或 8192、E501 是 131072），已取消导入。' },
  'wfg.codeErrNbHeader':{ 'zh-TW': '{m} 的 Dynamic Header 解不出來（檔案 0x100 起的 Header 表 checksum 不符，或一個有效區段都沒有）。\n這份檔案可能不是 EEPROM 格式的 {m} code，已取消匯入。',
                          'en': 'Cannot read the {m} dynamic header (the header table at file offset 0x100 fails its checksum, or contains no enabled section).\nThis may not be an EEPROM-format {m} code; import cancelled.',
                          'zh-CN': '{m} 的 Dynamic Header 解不出来（档案 0x100 起的 Header 表 checksum 不符，或一个有效区段都没有）。\n这份档案可能不是 EEPROM 格式的 {m} code，已取消导入。' },
  'wfg.codeErrNbEdid':  { 'zh-TW': '在 {o} 找不到合法的 EDID（開頭識別碼或 checksum 不符）。\nFrame 參數就是從這份 EDID 讀的，讀不到代表位置判斷有誤，已取消匯入（避免把錯的解析度帶進設定）。',
                          'en': 'No valid EDID found at {o} (bad header signature or checksum).\nThe frame parameters come from that EDID, so a failure here means the location is wrong; import cancelled to avoid loading a wrong resolution.',
                          'zh-CN': '在 {o} 找不到合法的 EDID（开头识别码或 checksum 不符）。\nFrame 参数就是从这份 EDID 读的，读不到代表位置判断有误，已取消导入（避免把错的分辨率带进设定）。' },
  'wfg.codeNbRegMiss':  { 'zh-TW': 'ℹ 這幾條訊號的暫存器不在這份 code 檔內（對應區段未啟用），已保留畫面上原本的設定不動：{s}',
                          'en': 'ℹ The registers for these signals are not present in this code image (their section is disabled), so their current settings were left untouched: {s}',
                          'zh-CN': 'ℹ 这几条信号的寄存器不在这份 code 档内（对应区段未启用），已保留画面上原本的设定不动：{s}' },
  'wfg.codeErrNbNoRows':{ 'zh-TW': '沒有任何可匯出的訊號', 'en': 'no exportable signals',
                          'zh-CN': '没有任何可导出的信号' },
  'wfg.codeNbDropped':  { 'zh-TW': '⚠ {m} 這顆晶片沒有以下訊號，即使畫面上勾了 Enable 也不會寫進匯出的清單：{s}',
                          'en': '⚠ The {m} chip has no such signals; they are not written to the exported list even though Enable is ticked on screen: {s}',
                          'zh-CN': '⚠ {m} 这颗芯片没有以下信号，即使画面上勾了 Enable 也不会写进导出的清单：{s}' },
  'wfg.codeNbDroppedNoPath': { 'zh-TW': '⚠ 以下訊號不會寫進匯出的清單：{s}\n它們的暫存器位址在官方工具的處理範圍外（未經查證），寫進去可能被忽略、也可能寫到別的地方，所以一律不寫。畫面上的設定不受影響。',
                          'en': '⚠ These signals are not written to the exported list: {s}\nTheir register addresses fall outside the range the official tool is known to handle (unverified), so writing them could be ignored or land somewhere else. On-screen settings are unaffected.',
                          'zh-CN': '⚠ 以下信号不会写进导出的清单：{s}\n它们的寄存器地址在官方工具的处理范围外（未经查证），写进去可能被忽略、也可能写到别的地方，所以一律不写。画面上的设定不受影响。' },
  'wfg.codeNbXlsxFlow': { 'zh-TW': '已匯出 {n} 列查核清單（.xlsx）。\n\n這是「要改哪些暫存器」的指令清單，不是 code 檔本身。請到官方 RomCodeProcessUI：\n① 開啟原本的 code 檔\n② Code Check 分頁 → Import CheckList 選這份 xlsx\n③ Modify All 套用\n④ Save As 存成新的 code 檔\n\nchecksum 由官方 UI 自動重算，不需要手動處理。',
                          'en': 'Exported a {n}-row check list (.xlsx).\n\nThis is a list of registers to change, not a code image. In the official RomCodeProcessUI:\n1. Open the original code file\n2. Code Check tab -> Import CheckList, pick this xlsx\n3. Modify All to apply\n4. Save As to write the new code file\n\nChecksums are recalculated by the official UI automatically; nothing to do by hand.',
                          'zh-CN': '已导出 {n} 列查核清单（.xlsx）。\n\n这是「要改哪些寄存器」的指令清单，不是 code 档本身。请到官方 RomCodeProcessUI：\n① 开启原本的 code 档\n② Code Check 分页 → Import CheckList 选这份 xlsx\n③ Modify All 套用\n④ Save As 存成新的 code 档\n\nchecksum 由官方 UI 自动重算，不需要手动处理。' },
  'wfg.codeErrHexLine': { 'zh-TW': 'Intel HEX 第 {n} 行格式不正確', 'en': 'malformed Intel HEX record at line {n}',
                          'zh-CN': 'Intel HEX 第 {n} 行格式不正确' },
  'wfg.codeErrHexCks':  { 'zh-TW': 'Intel HEX 第 {n} 行 checksum 不符', 'en': 'Intel HEX checksum mismatch at line {n}',
                          'zh-CN': 'Intel HEX 第 {n} 行 checksum 不符' },
  'wfg.codeErrHexEmpty':{ 'zh-TW': 'Intel HEX 檔裡沒有任何資料記錄', 'en': 'the Intel HEX file contains no data records',
                          'zh-CN': 'Intel HEX 档里没有任何数据记录' },
  /* 🔴 v4.37.2：UTF-16 的 Intel HEX **刻意不支援**（理由見 wfgCodeDecodeIntelHex()）。
     訊息要講清楚是「編碼」而不是「格式」，否則使用者會去查檔案內容，查不出所以然
     —— 這次的 UTF-8 BOM 就讓人繞了一大圈。UTF-8 BOM 已支援，所以順帶指出解法。 */
  'wfg.codeErrHexUtf16':{ 'zh-TW': '這個 Intel HEX 檔是 UTF-16 編碼，本工具只讀 ASCII／UTF-8（含 BOM）。請用文字編輯器另存成 UTF-8 之後再匯入。',
                          'en': 'This Intel HEX file is UTF-16 encoded. This tool only reads ASCII / UTF-8 (BOM is fine). Re-save it as UTF-8 in a text editor and import again.',
                          'zh-CN': '这个 Intel HEX 文件是 UTF-16 编码，本工具只读 ASCII／UTF-8（含 BOM）。请用文本编辑器另存为 UTF-8 之后再导入。' },
  /* 🔴 v4.37.3：位址超出上限。訊息刻意講明是**位址**問題並附上實際數字 ——
     沿用泛用的「格式不正確」會讓人去查檔案內容、查不出所以然（這一輪的 BOM
     就是這樣被誤診了一圈）。{n}＝行號、{a}＝算出來的最高位址、{m}＝上限。 */
  'wfg.codeErrHexAddr': { 'zh-TW': 'Intel HEX 第 {n} 行宣告的位址 {a} 超出本工具支援的範圍（上限 {m} bytes）。這通常代表檔案的位址記錄（type 02／04）不正確，或這不是 TCON 的 code 檔。',
                          'en': 'The address {a} declared on Intel HEX line {n} is outside the range this tool supports (limit {m} bytes). This usually means the file\'s address records (type 02 / 04) are wrong, or that this is not a TCON code file.',
                          'zh-CN': 'Intel HEX 第 {n} 行声明的地址 {a} 超出本工具支持的范围（上限 {m} bytes）。这通常代表文件的地址记录（type 02／04）不正确，或这不是 TCON 的 code 文件。' },
  'wfg.codeErrHexNoEof':{ 'zh-TW': 'Intel HEX 檔缺少結束記錄（:00000001FF），可能被截斷',
                          'en': 'the Intel HEX file has no EOF record (:00000001FF) and may be truncated',
                          'zh-CN': 'Intel HEX 档缺少结束记录（:00000001FF），可能被截断' },
  /* ══ v4.12.0：EM01 Flash 的多模 GPO Timing ═══════════════════════════════════
     {n} ＝ 這份 code 裡有幾組 timing、{s} ＝ 每一組的百分比與 reg_val（箭頭指向採用的那一組）。 */
  'wfg.codeEm01Modes':  { 'zh-TW': '這份 code 除了 CURRENT（實際輸出）之外，還有 {n} 組候選 GPO Timing：{s}（← ＝ 本次匯入採用的那一組）。',
                          'en': 'Besides CURRENT (what the chip actually outputs), this code carries {n} candidate GPO timing sets: {s} (<- = the one imported).',
                          'zh-CN': '这份 code 除了 CURRENT（实际输出）之外，还有 {n} 组候选 GPO Timing：{s}（← ＝ 本次导入采用的那一组）。' },
  'wfg.codeErrTimingSlot': { 'zh-TW': '選定的 GPO Timing（{a}）通不過格式檢查，已取消匯入，未變更任何設定。',
                          'en': 'The selected GPO timing set ({a}) failed the format check; the import was cancelled and nothing was changed.',
                          'zh-CN': '选定的 GPO Timing（{a}）通不过格式检查，已取消导入，未变更任何设定。' },
  /* ══ v4.13.0：GPO Timing 選擇框 ═══════════════════════════════════════════ */
  'wfg.tmgTitle':       { 'zh-TW': '這份 code 有多組 GPO Timing，請選擇要匯入哪一組',
                          'en': 'This code carries several GPO timing sets - choose which one to import',
                          'zh-CN': '这份 code 有多组 GPO Timing，请选择要导入哪一组' },
  'wfg.tmgSub':         { 'zh-TW': 'CURRENT 是這顆 TCON 實際輸出的那一組；另外偵測到 {n} 組候選，TCON 運行時由 MCU 決定把哪一組塞進 CURRENT。',
                          'en': 'CURRENT is what this TCON actually outputs; {n} candidate sets were also found. At run time the MCU decides which candidate goes into CURRENT.',
                          'zh-CN': 'CURRENT 是这颗 TCON 实际输出的那一组；另外侦测到 {n} 组候选，TCON 运行时由 MCU 决定把哪一组塞进 CURRENT。' },
  'wfg.tmgCurrentNote': { 'zh-TW': '目前實際輸出的 GPO Timing',
                          'en': 'the GPO timing actually being output right now',
                          'zh-CN': '目前实际输出的 GPO Timing' },
  'wfg.tmgSlotNote':    { 'zh-TW': '候選 Timing，該模式的有效行數 reg_val = {v}',
                          'en': 'candidate timing set, active lines reg_val = {v}',
                          'zh-CN': '候选 Timing，该模式的有效行数 reg_val = {v}' },
  'wfg.tmgSameAsCurrent': { 'zh-TW': '（內容與 CURRENT 相同）', 'en': '(identical to CURRENT)',
                          'zh-CN': '（内容与 CURRENT 相同）' },
  'wfg.tmgDefaultTag':  { 'zh-TW': '（預設）', 'en': '(default)', 'zh-CN': '（默认）' },
  'wfg.tmgOk':          { 'zh-TW': '用選定的 Timing 匯入', 'en': 'Import with the selected timing',
                          'zh-CN': '用选定的 Timing 导入' },
  'wfg.tmgCancel':      { 'zh-TW': '取消匯入', 'en': 'Cancel import', 'zh-CN': '取消导入' },
  /* ══ v4.22.0：匯出後提醒「第二組 ST/SP LINE 不會被寫回」（只有 EN01）══════════
     ⚠ 這一組取代了 v4.12.1 的 `wfg.codeExportDly2nd` / `…NoBase`（已刪除）：
       那兩則說的是「第二組延遲 WFG 沒有欄位、匯出不寫」，而 v4.22.0 已把
       `r_dly_2` / `f_dly_2` 做成正式欄位、六顆的匯入匯出都寫 ⇒ 該風險不存在了，
       留著等於對使用者說謊。真正還沒補上的是 EN01 的 ST2_LINE / SP2_LINE。
     {m} ＝ 型號、{s} ＝ 這次改過行號的訊號名。兩則差別只在「有沒有匯入基準可比」。 */
  'wfg.codeExportStSp2nd': { 'zh-TW': '⚠ ST_LINE / SP_LINE 已變更：{s}\n\n{m} 的每條訊號另外還有第二組行號（ST2_LINE / SP2_LINE，位在 0x1280 起的另一個 bank），而且原廠的啟用開關 ST_SP_USE_2ND 預設就是「使用第二組」。\n本工具沒有這兩個欄位，匯出的 xlsx **不會寫第二組行號**。寫進 TCON 之後，第二組仍是原本的值，會與你剛改的不一致。若這片面板會用到第二組 timing，請在官方 UI 另外設定。',
                          'en': '⚠ ST_LINE / SP_LINE were changed: {s}\n\nOn {m} every signal also has a second set of line numbers (ST2_LINE / SP2_LINE, in a separate bank starting at 0x1280), and the vendor enable bit ST_SP_USE_2ND defaults to "use the second set".\nThis tool has no field for them, so the exported xlsx does NOT write the second set. After loading, the second set keeps its original values and will no longer match what you just changed. If this panel uses the second timing set, please set it separately in the official UI.',
                          'zh-CN': '⚠ ST_LINE / SP_LINE 已变更：{s}\n\n{m} 的每条讯号另外还有第二组行号（ST2_LINE / SP2_LINE，位在 0x1280 起的另一个 bank），而且原厂的启用开关 ST_SP_USE_2ND 预设就是「使用第二组」。\n本工具没有这两个字段，导出的 xlsx **不会写第二组行号**。写进 TCON 之后，第二组仍是原本的值，会与你刚改的不一致。若这片面板会用到第二组 timing，请在官方 UI 另外设定。' },
  'wfg.codeExportStSp2ndNoBase': { 'zh-TW': '⚠ 這次匯出沒有以任何 code 為基準（沒有先匯入 code，或上一次匯入失敗）。\n\n{m} 的每條訊號另外還有第二組行號（ST2_LINE / SP2_LINE，位在 0x1280 起的另一個 bank），啟用開關 ST_SP_USE_2ND 預設就是「使用第二組」。\n本工具沒有這兩個欄位，匯出的 xlsx **不會寫第二組行號**。目前畫面上的行號與 TCON 內既有的第二組沒有對應關係，寫入後兩者一定不一致。若這片面板會用到第二組 timing，請在官方 UI 另外設定。',
                          'en': '⚠ This export is not based on any imported code (no code was imported, or the last import failed).\n\nOn {m} every signal also has a second set of line numbers (ST2_LINE / SP2_LINE, in a separate bank starting at 0x1280); the enable bit ST_SP_USE_2ND defaults to "use the second set".\nThis tool has no field for them, so the exported xlsx does NOT write the second set. The line numbers on screen bear no relation to the second set already in the TCON, so after loading they will certainly not match. If this panel uses the second timing set, please set it separately in the official UI.',
                          'zh-CN': '⚠ 这次导出没有以任何 code 为基准（没有先导入 code，或上一次导入失败）。\n\n{m} 的每条讯号另外还有第二组行号（ST2_LINE / SP2_LINE，位在 0x1280 起的另一个 bank），启用开关 ST_SP_USE_2ND 预设就是「使用第二组」。\n本工具没有这两个字段，导出的 xlsx **不会写第二组行号**。目前画面上的行号与 TCON 内既有的第二组没有对应关系，写入后两者一定不一致。若这片面板会用到第二组 timing，请在官方 UI 另外设定。' },
  /* ══ v4.22.0：R_DLY2 / F_DLY2 的欄位說明（卡片整列與總表表頭／儲存格共用）══════ */
  'wfg.dly2Note':       { 'zh-TW': 'R_DLY2 / F_DLY2 ＝ 第二組 timing 的延遲（MNT 的 reg_*_dly_*_2nd／NB 的 *_DLY_F40_*）。本工具的波形只模擬第一組，所以改這兩格**不會改變波形**；它們會被匯入讀出、也會被匯出寫回。',
                          'en': 'R_DLY2 / F_DLY2 = the delay of the second timing set (reg_*_dly_*_2nd on MNT, *_DLY_F40_* on NB). This tool only simulates the first set, so changing these two does NOT change the waveform; they are read on import and written on export.',
                          'zh-CN': 'R_DLY2 / F_DLY2 ＝ 第二组 timing 的延迟（MNT 的 reg_*_dly_*_2nd／NB 的 *_DLY_F40_*）。本工具的波形只模拟第一组，所以改这两格**不会改变波形**；它们会被导入读出、也会被导出写回。' },
  /* ══ v4.13.3：位址空間標示 ═══════════════════════════════════════════════════
     🔴 為什麼要有這個 key：EM01 Flash 低位是平坦映像，`fileOff == regAddr`，
     於是 `0x0500` 這個數字**同時**是暫存器位址與檔案偏移。看的人一旦習慣，
     再看到 `0x35000` 就會當成暫存器位址 —— 而暫存器空間根本只到 `0xFFFF`。
     這個誤解實際害我們花了一整輪去評估一個原理上做不到的方案（見
     `docs/em01_export_to_slot_assessment.md`），所以凡是**印給人看**的位址，
     一律用這個前綴標明它是檔案裡的第幾個位元組，不是暫存器編號。 */
  'wfg.codeFileOff':    { 'zh-TW': '檔案偏移', 'en': 'file offset', 'zh-CN': '文件偏移' },
  /* ══ v4.13.3：匯出後說明 script 只寫 CURRENT ═════════════════════════════════
     Bruce 2026-08-23 裁示的工作流程：wfg 匯出 script 寫 CURRENT →
     用官方 UI 把它複製到 Normal／133%／200%。校驗值由官方 UI 自動處理。
     ⚠ 選單名稱取自官方工具的表單資源（未實機執行驗證），所以文案要留餘地。 */
  'wfg.codeExportCurrentOnly': {
    'zh-TW': '匯出的 script 一律寫入 CURRENT，也就是這顆 TCON 實際輸出的那一組 GPO Timing。\n\n若要把這組值放進 Normal／133%／200%，請在 EM01 官方 TCON UI 完成後半段：\n1. 先用本 script 寫入 TCON（進 CURRENT），到 GPO 分頁按「Read」\n2. 切到你要寫入的那個子分頁（Normal／200%／133%）\n3. 點左下角的「File IO」按鈕\n4. 在「--- Copy Data ---」底下選「From Current」，把 CURRENT 的值複製到該分頁\n（選單名稱依工具版本可能略有不同。）\n\n為什麼 script 做不到：三模位於 Flash 檔案偏移 0x35000／0x35300／0x35600，而 script 的 write 指令只能寫暫存器，位址上限 0xFFFF。',
    'en': 'The exported script always writes to CURRENT - the GPO timing set this TCON actually outputs.\n\nTo place these values into Normal / 133% / 200%, finish the job in the official EM01 TCON UI:\n1. Load this script into the TCON (it lands in CURRENT), then press "Read" on the GPO tab\n2. Switch to the sub-tab you want to write (Normal / 200% / 133%)\n3. Click the "File IO" button at the bottom left\n4. Under "--- Copy Data ---" choose "From Current" to copy the CURRENT values into that tab\n(Menu names may differ slightly between tool versions.)\n\nWhy a script cannot do this: the three mode slots live at file offsets 0x35000 / 0x35300 / 0x35600, while a script write command can only address registers, which stop at 0xFFFF.',
    'zh-CN': '导出的 script 一律写入 CURRENT，也就是这颗 TCON 实际输出的那一组 GPO Timing。\n\n若要把这组值放进 Normal／133%／200%，请在 EM01 官方 TCON UI 完成后半段：\n1. 先用本 script 写入 TCON（进 CURRENT），到 GPO 分页按「Read」\n2. 切到你要写入的那个子分页（Normal／200%／133%）\n3. 点左下角的「File IO」按钮\n4. 在「--- Copy Data ---」底下选「From Current」，把 CURRENT 的值复制到该分页\n（菜单名称依工具版本可能略有不同。）\n\n为什么 script 做不到：三模位于 Flash 文件偏移 0x35000／0x35300／0x35600，而 script 的 write 指令只能写寄存器，地址上限 0xFFFF。' },
  /* ══ v4.27.0：MNT 匯出後的提醒視窗 ═══════════════════════════════════════════
     Bruce 2026-08-25 實測踩到的坑：官方 UI 匯入 script 之後**畫面不會自動重讀**，
     GPO 分頁仍顯示舊的 timing ⇒ 他一度判定 wfg 匯出的 script 有 bug。
     端到端往返驗證的結果是 script 逐值正確（18 條數位訊號、16 個欄位零差異），
     缺的只有「按一次 Read」這個動作。所以這則提醒的性質是**流程缺口**，
     不是錯誤警告 —— 文案不要寫成「發生錯誤」。 */
  'wfg.gpoRdTitle': {
    'zh-TW': '匯出完成 — 匯入 TCON UI 後還有一步',
    'en': 'Export done - one more step after loading it into the TCON UI',
    'zh-CN': '导出完成 — 导入 TCON UI 后还有一步' },
  'wfg.gpoRdName': {
    'zh-TW': '匯入 Script 後，記得到 TCON UI 的 GPO 分頁按一次「Read」',
    'en': 'After loading the script, press "Read" once on the GPO tab of the TCON UI',
    'zh-CN': '导入 Script 后，记得到 TCON UI 的 GPO 分页按一次「Read」' },
  'wfg.gpoRdWhere': {
    'zh-TW': '官方 UI 匯入 Script 之後不會自動重新讀取，畫面上仍會顯示舊的 timing。按下 GPO 分頁的 Read，這次匯出的設定才會出現在「Current」子分頁裡。',
    'en': 'The official UI does not re-read after loading a script, so the screen still shows the old timing. Press Read on the GPO tab and the settings you just exported will appear in the "Current" sub-tab.',
    'zh-CN': '官方 UI 导入 Script 之后不会自动重新读取，画面上仍会显示旧的 timing。按下 GPO 分页的 Read，这次导出的设定才会出现在「Current」子分页里。' },
  'wfg.gpoRdOk': { 'zh-TW': '知道了', 'en': 'Got it', 'zh-CN': '知道了' },
  /* ══ 🔴 v4.34.1：匯出提醒視窗的強調用「比對片語」════════════════════════════
     Bruce 2026-08-28：兩個重點不夠明顯，要紅字＋大字＋閃爍。

     🔴 **這三個 key 不是要顯示的新文案**，是給 `wfgGpoRdHl()` 拿去在**既有文案裡
     找位置**用的片語 —— 畫面上一個字都不會多出來。之所以做成 i18n 而不是寫死正則：
     要被強調的那句話三語各不相同，寫死在 JS 裡等於「只有中文會亮」，
     而且日後有人改了上面那幾則文案，這裡對不上就會靜默失去強調（不會報錯）。
     ⚠ 因此：**改動 `gpoRdName` / `gpoRdWhere` / `codeExportCurrentOnly` 時，
     必須回頭確認下面這幾個片語仍是它們的子字串。**
     這件事不靠記得：`tools/check_export_warn_highlight.py` 逐語言比對，
     對不上就 rc=1（與其他三支常設機械檢查同一個用法）。 */
  'wfg.gpoRdHlRead': { 'zh-TW': 'Read', 'en': 'Read', 'zh-CN': 'Read' },
  'wfg.gpoRdHlCur': {
    'zh-TW': '匯出的 script 一律寫入 CURRENT',
    'en': 'The exported script always writes to CURRENT',
    'zh-CN': '导出的 script 一律写入 CURRENT' },
  /* 🔴 v4.23.0 改字：Line Buffer **已經**跟著 code 連動了（由 First Line Read 帶入），
     再說「沒有跟著 Code 連動」就是對使用者說謊。改成「需要你確認」，
     兩項各自的說明由 ackDclkName / ackLbName 分別講清楚是哪一種。 */
  'wfg.ackTitle':       { 'zh-TW': '匯入完成 — 有 2 項需要你確認',
                          'en': 'Import done - 2 settings need your confirmation',
                          'zh-CN': '导入完成 — 有 2 项需要你确认' },
  /* 🔴 v4.35.1：主角由 TX DCLK 換成 TCON UI DCLK（Bruce 2026-08-28：「主要的應該是要用
     『TCON UI DCLK』，那一欄的名稱應該要叫做『TCON UI DCLK』，而下方的輔助說明才是
     『TX DCLK』」）。換算關係一個字未改，只是誰是主角換了。 */
  'wfg.ackDclkName':    { 'zh-TW': 'TCON UI DCLK 必須手動設定', 'en': 'TCON UI DCLK must be set by hand',
                          'zh-CN': 'TCON UI DCLK 必须手动设定' },
  'wfg.ackDclkWhere':   { 'zh-TW': '位置：左側「Frame 參數」卡片 → TCON UI DCLK',
                          'en': 'Where: the Frame parameters card on the left → TCON UI DCLK',
                          'zh-CN': '位置：左侧「Frame 参数」卡片 → TCON UI DCLK' },
  /* v4.23.0：這一項的性質變了 —— 從「code 裡沒有、要自己填」變成「code 裡有、已帶入、請確認」。 */
  'wfg.ackLbName':      { 'zh-TW': 'Line Buffer 已由 code 帶入，請確認',
                          'en': 'Line Buffer came from the code - please confirm',
                          'zh-CN': 'Line Buffer 已由 code 带入，请确认' },
  'wfg.ackLbWhere':     { 'zh-TW': '位置：上方工具列「TCON」group → Line Buffer / First Line Read',
                          'en': 'Where: the TCON group in the toolbar above → Line Buffer / First Line Read',
                          'zh-CN': '位置：上方工具栏「TCON」group → Line Buffer / First Line Read' },
  'wfg.ackNow':         { 'zh-TW': '目前值：{v}', 'en': 'Current: {v}', 'zh-CN': '目前值：{v}' },
  'wfg.ackGoto':        { 'zh-TW': '帶我去 →', 'en': 'Take me there →', 'zh-CN': '带我去 →' },
  'wfg.spotBack':       { 'zh-TW': '知道了', 'en': 'Got it', 'zh-CN': '知道了' },
  /* v4.35.1：綠框改指 TCON UI DCLK（與 ackDclkName 同一輪裁示），文字跟著改。 */
  'wfg.spotDclk':       { 'zh-TW': '這裡就是 TCON UI DCLK，就在框起來的地方',
                          'en': 'This is TCON UI DCLK - highlighted here',
                          'zh-CN': '这里就是 TCON UI DCLK，就在框起来的地方' },
  'wfg.spotLb':         { 'zh-TW': '這裡就是 Line Buffer，就在框起來的地方',
                          'en': 'This is Line Buffer - highlighted here',
                          'zh-CN': '这里就是 Line Buffer，就在框起来的地方' },
  'wfg.ackSet':         { 'zh-TW': '改成', 'en': 'set to', 'zh-CN': '改成' },
  'wfg.ackErrEmpty':    { 'zh-TW': '請填入數值（可直接沿用左邊的目前值）',
                          'en': 'Enter a value (you can keep the current one on the left)',
                          'zh-CN': '请填入数值（可直接沿用左边的目前值）' },
  'wfg.ackErrNum':      { 'zh-TW': '請填入有效的數值', 'en': 'Enter a valid number', 'zh-CN': '请填入有效的数值' },
  'wfg.ackErrDclkMin':  { 'zh-TW': 'TX DCLK 不可低於 RX DCLK（{v} MHz）',
                          'en': 'TX DCLK cannot be lower than RX DCLK ({v} MHz)',
                          'zh-CN': 'TX DCLK 不可低于 RX DCLK（{v} MHz）' },
  /* v4.23.0：上限改成機種決定（{max}），步進在 dual gate 下是 0.5（{step}）。 */
  'wfg.ackErrLb':       { 'zh-TW': 'Line Buffer 必須是 0~{max}、且是 {step} 的倍數',
                          'en': 'Line Buffer must be 0~{max} and a multiple of {step}',
                          'zh-CN': 'Line Buffer 必须是 0~{max}、且是 {step} 的倍数' },
  /* v4.35.1：這一則講的是「變頻下 TX 自動追隨 RX」這個機制本身，主從對調不影響它的正確性；
     只補一句 UI DCLK 也因此不用手填，避免主角換了之後這句話讀起來像在講另一件事。 */
  'wfg.ackDclkVarMode': { 'zh-TW': '變頻應用：TX DCLK 自動等於 RX DCLK，TCON UI DCLK 隨之換算，不需手動設定',
                          'en': 'Variable-rate mode: TX DCLK follows RX DCLK automatically and TCON UI DCLK is derived from it - nothing to set',
                          'zh-CN': '变频应用：TX DCLK 自动等于 RX DCLK，TCON UI DCLK 随之换算，不需手动设定' },
  'wfg.ackHint':        { 'zh-TW': '兩項都填好才能開始編輯', 'en': 'Fill in both to start editing',
                          'zh-CN': '两项都填好才能开始编辑' },
  'wfg.ackHintOk':      { 'zh-TW': '兩項都已設定，可以開始編輯', 'en': 'Both set - you can start editing',
                          'zh-CN': '两项都已设定，可以开始编辑' },
  /* ══ v4.25.0：TCON UI DCLK 已由 code 自動帶入時，卡片只剩 Line Buffer 一項 ══════
     標題／提示語都要跟著變成單數，不然會出現「看不到第 1 項卻寫著有 2 項」。 */
  'wfg.ackTitle1':      { 'zh-TW': '匯入完成 — 有 1 項需要你確認',
                          'en': 'Import done - 1 setting needs your confirmation',
                          'zh-CN': '导入完成 — 有 1 项需要你确认' },
  'wfg.ackHint1':       { 'zh-TW': '這一項填好才能開始編輯', 'en': 'Fill this in to start editing',
                          'zh-CN': '这一项填好才能开始编辑' },
  'wfg.ackHintOk1':     { 'zh-TW': '已確認，可以開始編輯', 'en': 'Confirmed - you can start editing',
                          'zh-CN': '已确认，可以开始编辑' },
  /* ══ v4.25.0：NB 的 AGBSFR DCLK。閘門過不了時**一定要說原因**，不能靜默不填。 ══ */
  'wfg.codeNbDclkNoReg': {
    'zh-TW': '⚠ {m}：這份 code 讀不到 GBPLL 那組 register（bank 沒啟用或檔案截斷），TCON UI DCLK 維持你目前的設定不變。',
    'en': '⚠ {m}: the GBPLL registers could not be read from this code (bank disabled or file truncated); TCON UI DCLK was left as-is.',
    'zh-CN': '⚠ {m}：这份 code 读不到 GBPLL 那组 register（bank 没启用或文件截断），TCON UI DCLK 维持你目前的设定不变。' },
  'wfg.codeNbDclkNotStd': {
    'zh-TW': '⚠ {m}：這份 code 不是走 GBPLL 小數模式那條路（GBPLL_EN_SDM={sdm}、N_PRE={npre}、N_PSDIV1={nps1}），套公式會得到 {v} MHz 這種無意義的值，因此 TCON UI DCLK **沒有自動帶入**，請自己確認。\n（實測 238 份 E501 尺寸的檔：RM81011 系 107 份 EN_SDM 一律是 1，RM81010 系 131 份一律是 0。這兩顆的 DCLK 存放位置不同。）',
    'en': '⚠ {m}: this code does not use the GBPLL fractional path (GBPLL_EN_SDM={sdm}, N_PRE={npre}, N_PSDIV1={nps1}). Applying the formula would give a meaningless {v} MHz, so TCON UI DCLK was NOT filled in - please set it yourself.',
    'zh-CN': '⚠ {m}：这份 code 不是走 GBPLL 小数模式那条路（GBPLL_EN_SDM={sdm}、N_PRE={npre}、N_PSDIV1={nps1}），套公式会得到 {v} MHz 这种无意义的值，因此 TCON UI DCLK **没有自动带入**，请自己确认。' },
  'wfg.codeNbDclkRange': {
    'zh-TW': '⚠ {m}：由 code 算出來的 TCON UI DCLK 是 {v} MHz，超出這顆機種的規格範圍（{lo}～{hi} MHz），因此**沒有自動帶入**，請自己確認。',
    'en': '⚠ {m}: TCON UI DCLK computed from the code is {v} MHz, outside this model spec ({lo}-{hi} MHz), so it was NOT filled in - please set it yourself.',
    'zh-CN': '⚠ {m}：由 code 算出来的 TCON UI DCLK 是 {v} MHz，超出这颗机种的规格范围（{lo}～{hi} MHz），因此**没有自动带入**，请自己确认。' },
  'wfg.codeNbDclkAutoDiff': {
    'zh-TW': '⚠ {m}：GBPLL 算出來的 DCLK 是 {v} MHz，但同一份 code 裡的 DCLK_AUTO_MODE 是 {a}，兩個來源對不上，因此 TCON UI DCLK **沒有自動帶入**，請自己確認。',
    'en': '⚠ {m}: the GBPLL registers give {v} MHz but DCLK_AUTO_MODE in the same code says {a}. The two sources disagree, so TCON UI DCLK was NOT filled in - please set it yourself.',
    'zh-CN': '⚠ {m}：GBPLL 算出来的 DCLK 是 {v} MHz，但同一份 code 里的 DCLK_AUTO_MODE 是 {a}，两个来源对不上，因此 TCON UI DCLK **没有自动带入**，请自己确认。' },
  'wfg.codeNbDclkClamped': {
    'zh-TW': '⚠ code 裡的 TCON UI DCLK 是 {v} MHz，但套用之後變成 {a} MHz（被 RX DCLK 下限或機種規格夾住）。畫面上的值不是 code 裡的值，請自己確認。',
    'en': '⚠ the code says TCON UI DCLK = {v} MHz but after applying it became {a} MHz (clamped by the RX DCLK floor or the model spec). What you see is not what the code says - please check.',
    'zh-CN': '⚠ code 里的 TCON UI DCLK 是 {v} MHz，但套用之后变成 {a} MHz（被 RX DCLK 下限或机种规格夹住）。画面上的值不是 code 里的值，请自己确认。' },
  /* v4.31.1：匯入 code 後自動下調 Frame Rate 的告知（不可靜默改掉使用者的設定）。 */
  'wfg.codeFpsAutoFit': {
    'zh-TW': '⚠ Frame Rate 已自動從 {from} Hz 降為 {to} Hz —— 這組解析度下 {m} 最高只跑得到 {to} Hz。要用別的值請自己改。',
    'en': '⚠ Frame Rate was automatically lowered from {from} Hz to {to} Hz - at this resolution {m} tops out at {to} Hz. Change it yourself if you want another value.',
    'zh-CN': '⚠ Frame Rate 已自动从 {from} Hz 降为 {to} Hz —— 这组分辨率下 {m} 最高只跑得到 {to} Hz。要用别的值请自己改。' },
  'wfg.codeNbDclkWrote': {
    'zh-TW': '本次匯出**有寫回 TCON UI DCLK**（{m}）：{was} → {now} MHz\n\n寫進去的 register：\n・GBPLL_EN_SDM = 1\n・GBPLL_N_PRE = 8、GBPLL_N_PSDIV1 = 6、GBPLL_N_PSDIV2 = 9、N_PRETX = 1\n・GBPLL_P = {p}\n・GBPLL_INI_M = {i}\n・GBPLL_DELTA_M = {d}\n\n這一組是照原廠「AGBSFR 標準化」的寫入序列產生的。原廠標準化另外還會依 EDID 重寫 HBLANK／VBLANK／FR_DET_TH／VBP／PSR VTL —— 本工具沒有 EDID 那一整套輸入，**那些一律不寫**。',
    'en': 'This export DID write TCON UI DCLK back ({m}): {was} → {now} MHz\n\nRegisters written:\n・GBPLL_EN_SDM = 1\n・GBPLL_N_PRE = 8, GBPLL_N_PSDIV1 = 6, GBPLL_N_PSDIV2 = 9, N_PRETX = 1\n・GBPLL_P = {p}\n・GBPLL_INI_M = {i}\n・GBPLL_DELTA_M = {d}\n\nThis follows the official "AGBSFR standardize" write sequence. The official flow also rewrites HBLANK / VBLANK / FR_DET_TH / VBP / PSR VTL from the EDID - this tool has no EDID input, so those are NOT written.',
    'zh-CN': '本次导出**有写回 TCON UI DCLK**（{m}）：{was} → {now} MHz\n\n写进去的 register：\n・GBPLL_EN_SDM = 1\n・GBPLL_N_PRE = 8、GBPLL_N_PSDIV1 = 6、GBPLL_N_PSDIV2 = 9、N_PRETX = 1\n・GBPLL_P = {p}\n・GBPLL_INI_M = {i}\n・GBPLL_DELTA_M = {d}\n\n这一组是照原厂「AGBSFR 标准化」的写入序列产生的。原厂标准化另外还会依 EDID 重写 HBLANK／VBLANK／FR_DET_TH／VBP／PSR VTL —— 本工具没有 EDID 那一整套输入，**那些一律不写**。' },
  'wfg.codeNbDclkNoDelta': {
    'zh-TW': '沒寫（算不出原本的 SSCG%）',
    'en': 'not written (original SSCG% unknown)',
    'zh-CN': '没写（算不出原本的 SSCG%）' },
  /* ══ v4.26.0：E501 拆成 E501A（RM81010）／E501B（RM81011）之後新增的四則 ══════════ */
  'wfg.codeNbModelMismatch': {
    'zh-TW': '⚠ 型號可能選錯了：你選的是 {m}（{ic}），但這份 code 的 {k} ＝ {got}（{m} 應該是 {exp}）。\n這個位元在 238 份實測檔案裡 100% 分離兩顆晶片，零例外 ⇒ 這份 code 看起來是 **{other}（{otherIc}）** 的。\n兩顆的 DCLK 存放位置完全不同，用錯的公式去算會得到看似合理、其實固定不變的垃圾值，因此 TCON UI DCLK **沒有自動帶入**。\n請把 TCON 型號改成 {other} 後重新匯入；訊號區兩顆相同，其餘的值仍是對的。',
    'en': '⚠ The model may be wrong: you picked {m} ({ic}), but this code has {k} = {got} ({m} should be {exp}).\nAcross 238 measured files this bit separates the two chips with zero exceptions, so this code looks like **{other} ({otherIc})**.\nThe two chips store DCLK in completely different places; applying the wrong formula yields a plausible-looking but constant garbage value, so TCON UI DCLK was NOT filled in.\nSwitch the TCON model to {other} and import again. The signal registers are identical on both chips, so everything else is still correct.',
    'zh-CN': '⚠ 型号可能选错了：你选的是 {m}（{ic}），但这份 code 的 {k} ＝ {got}（{m} 应该是 {exp}）。\n这个位元在 238 份实测档案里 100% 分离两颗芯片，零例外 ⇒ 这份 code 看起来是 **{other}（{otherIc}）** 的。\n两颗的 DCLK 存放位置完全不同，用错的公式去算会得到看似合理、其实固定不变的垃圾值，因此 TCON UI DCLK **没有自动带入**。\n请把 TCON 型号改成 {other} 后重新导入；信号区两颗相同，其余的值仍是对的。' },
  'wfg.codeNbDclkNoRegAgbs': {
    'zh-TW': '⚠ {m}：這份 code 讀不到 {k} 那組 register（bank 沒啟用或檔案截斷），TCON UI DCLK 維持你目前的設定不變。',
    'en': '⚠ {m}: the {k} registers could not be read from this code (bank disabled or file truncated); TCON UI DCLK was left as-is.',
    'zh-CN': '⚠ {m}：这份 code 读不到 {k} 那组 register（bank 没启用或档案截断），TCON UI DCLK 维持你目前的设定不变。' },
  'wfg.codeNbDclkFrDiff': {
    'zh-TW': '⚠ {m}：AGBS_DCLK 是 {v} MHz，但同一份 code 裡的 FR_DCLK 是 {a} MHz，兩個來源對不上（原廠標準化會把兩者寫成同一個值，實測 131 份真檔 131/131 相等），因此 TCON UI DCLK **沒有自動帶入**，請自己確認。',
    'en': '⚠ {m}: AGBS_DCLK is {v} MHz but FR_DCLK in the same code says {a} MHz. The official standardize writes both to the same value (131/131 real files agree), so the two sources disagreeing means TCON UI DCLK was NOT filled in - please set it yourself.',
    'zh-CN': '⚠ {m}：AGBS_DCLK 是 {v} MHz，但同一份 code 里的 FR_DCLK 是 {a} MHz，两个来源对不上（原厂标准化会把两者写成同一个值，实测 131 份真档 131/131 相等），因此 TCON UI DCLK **没有自动带入**，请自己确认。',
  },
  'wfg.codeNbDclkWroteAgbs': {
    'zh-TW': '本次匯出**有寫回 TCON UI DCLK**（{m}）：{was} → {now} MHz\n\n寫進去的 register：\n・AGBS_DCLK_INTEGER = {i}\n・AGBS_DCLK_FLOATING POINT = {f}（＝ 小數 × 65536）\n・FR_DCLK_INTEGER = {i}\n・FR_DCLK_FLOATING POINT = {f}\n\n這一組是照原廠「AGBSFR 標準化」的寫入序列產生的（FR 那一組原廠是直接指派成 AGBS 的值）。原廠標準化另外還會依 EDID 重寫 DCLK_ADJ／HBLANK／VBLANK／FR_DET_TH —— 本工具沒有 EDID 那一整套輸入，**那些一律不寫**。',
    'en': 'This export DID write TCON UI DCLK back ({m}): {was} → {now} MHz\n\nRegisters written:\n・AGBS_DCLK_INTEGER = {i}\n・AGBS_DCLK_FLOATING POINT = {f} (= fraction x 65536)\n・FR_DCLK_INTEGER = {i}\n・FR_DCLK_FLOATING POINT = {f}\n\nThis follows the official "AGBSFR standardize" write sequence (the official flow assigns the FR pair directly from the AGBS pair). The official flow also rewrites DCLK_ADJ / HBLANK / VBLANK / FR_DET_TH from the EDID - this tool has no EDID input, so those are NOT written.',
    'zh-CN': '本次导出**有写回 TCON UI DCLK**（{m}）：{was} → {now} MHz\n\n写进去的 register：\n・AGBS_DCLK_INTEGER = {i}\n・AGBS_DCLK_FLOATING POINT = {f}（＝ 小数 × 65536）\n・FR_DCLK_INTEGER = {i}\n・FR_DCLK_FLOATING POINT = {f}\n\n这一组是照原厂「AGBSFR 标准化」的写入序列产生的（FR 那一组原厂是直接指派成 AGBS 的值）。原厂标准化另外还会依 EDID 重写 DCLK_ADJ／HBLANK／VBLANK／FR_DET_TH —— 本工具没有 EDID 那一整套输入，**那些一律不写**。' },
  'wfg.ackClose':       { 'zh-TW': '開始編輯', 'en': 'Start editing', 'zh-CN': '开始编辑' },
  'wfg.codeCksTitle':   { 'zh-TW': '這份 code 的 checksum（全檔位元組總和）＝ {v}，與 EM02 工具顯示的 Orig CKS 相同',
                          'en': 'Checksum of this code (sum of all file bytes) = {v}; same value the EM02 tool shows as Orig CKS',
                          'zh-CN': '这份 code 的 checksum（全档字节总和）＝ {v}，与 EM02 工具显示的 Orig CKS 相同' },
  'wfg.codeTriGate':    { 'zh-TW': '⚠ 這份 code 的 reg_rd_mode = {v}（tri-gate），WFG 沒有對應的 GATE TYPE，已維持目前設定不變；行號超出 frame 的訊號會畫不出來。',
                          'en': '⚠ this code has reg_rd_mode = {v} (tri-gate); WFG has no matching GATE TYPE, so it was left unchanged. Signals whose line numbers exceed the frame will not be drawn.',
                          'zh-CN': '⚠ 这份 code 的 reg_rd_mode = {v}（tri-gate），WFG 没有对应的 GATE TYPE，已维持目前设定不变；行号超出 frame 的信号会画不出来。' },
  /* 🔴 v4.36.0：卡片名加 `TCON` 前綴（Bruce 2026-08-28：「數位信號也改名叫做
     TCON 數位信號，這樣才會跟藍色的這個風格全面一致。」）。
     🔴 **key 不改**（`wfg.gpioSources`）：改 key 要同步改 HTML 的 `data-i18n` 與
     所有 `t('wfg.gpioSources')` 呼叫端，漏一處就會在畫面上印出 key 本身
     （`t()` 查不到會回傳 key，靜默失敗）—— 改的是文案不是識別碼。
     🔴 簡中用「TCON 数字信号」：本檔既有譯法一律是「数字信号」（見 wfg.ovTitle、
     wfg.groupDigital），不自創第二種寫法。英文同理沿用既有的 "Digital Signals"。 */
  'wfg.gpioSources':    { 'zh-TW': 'TCON 數位信號', 'en': 'TCON Digital Signals', 'zh-CN': 'TCON 数字信号' },
  'wfg.analogSources':  { 'zh-TW': 'IC 類比信號', 'en': 'IC Analog Signals', 'zh-CN': 'IC 模拟信号' },
  'wfg.outputChannels': { 'zh-TW': '輸出通道', 'en': 'Output Channels', 'zh-CN': '输出通道' },
  /* 🔴 v4.42.0：輸出通道卡片上方的三大類顯示切換。
     用字刻意**逐字沿用它們對應的卡片標題**（`wfg.gpioSources`／`wfg.analogSources`／
     `wfg.panelSignals`）—— 按鈕與卡片講的是同一批訊號，兩處字面不同只會讓人以為
     是兩件事。（站上既有用字是「信號」不是「訊號」，這裡跟著站上走，不另起一套。） */
  'wfg.chCatDig':       { 'zh-TW': 'TCON 數位信號', 'en': 'TCON Digital', 'zh-CN': 'TCON 数字信号' },
  'wfg.chCatIc':        { 'zh-TW': 'IC 類比信號', 'en': 'IC Analog', 'zh-CN': 'IC 模拟信号' },
  'wfg.chCatPanel':     { 'zh-TW': '面板類比信號', 'en': 'Panel Analog', 'zh-CN': '面板模拟信号' },
  'wfg.chCatDigTitle':  { 'zh-TW': '按一下全部顯示、再按一下全部隱藏。只含這份 code 有勾選 ENABLE 的數位信號。',
                          'en': 'Click to show all, click again to hide all. Only digital signals with ENABLE checked in this code.',
                          'zh-CN': '按一下全部显示、再按一下全部隐藏。只含这份 code 有勾选 ENABLE 的数字信号。' },
  'wfg.chCatIcTitle':   { 'zh-TW': '按一下全部顯示、再按一下全部隱藏。CKO 的條數由 GOA Phase 決定（例：8 phase 只有 CKO1～CKO8）。',
                          'en': 'Click to show all, click again to hide all. The number of CKOs follows GOA Phase (e.g. 8 phase gives CKO1–CKO8 only).',
                          'zh-CN': '按一下全部显示、再按一下全部隐藏。CKO 的条数由 GOA Phase 决定（例：8 phase 只有 CKO1～CKO8）。' },
  'wfg.chCatPanelTitle':{ 'zh-TW': '按一下全部顯示、再按一下全部隱藏（Gate Line、Subpixel 電壓）。',
                          'en': 'Click to show all, click again to hide all (Gate Line, Subpixel voltage).',
                          'zh-CN': '按一下全部显示、再按一下全部隐藏（Gate Line、Subpixel 电压）。' },
  'wfg.loadPreset':     { 'zh-TW': '載入預設…', 'en': 'Load Preset…', 'zh-CN': '载入预设…' },
  'wfg.fitAll':         { 'zh-TW': '📏 全覽', 'en': '📏 Fit All', 'zh-CN': '📏 全览' },
  'wfg.fitAllPlain':    { 'zh-TW': '全覽', 'en': 'Fit All', 'zh-CN': '全览' },
  'wfg.reset':          { 'zh-TW': '重置', 'en': 'Reset', 'zh-CN': '重置' },
  'wfg.emptyHint':      { 'zh-TW': '請載入預設或新增信號以開始', 'en': 'Load a preset or add signals to begin', 'zh-CN': '请载入预设或新增信号以开始' },
  'wfg.delete':         { 'zh-TW': '刪除', 'en': 'Delete', 'zh-CN': '删除' },
  'wfg.measTitle':      { 'zh-TW': '即時測量', 'en': 'Live Measure', 'zh-CN': '即时测量' },
  'wfg.measPulseWidth': { 'zh-TW': '脈寬', 'en': 'Pulse Width', 'zh-CN': '脉宽' },
  // v3.26.0: 即時測量改成 5 欄，與「＋」小卡片同欄位同順序
  'wfg.measPosWidth':   { 'zh-TW': '正脈寬', 'en': 'High Width', 'zh-CN': '正脉宽' },
  'wfg.measNegWidth':   { 'zh-TW': '負脈寬', 'en': 'Low Width', 'zh-CN': '负脉宽' },
  'wfg.measPeriod':     { 'zh-TW': '週期', 'en': 'Period', 'zh-CN': '周期' },
  'wfg.measDuty':       { 'zh-TW': '佔空比', 'en': 'Duty Cycle', 'zh-CN': '占空比' },
  'wfg.measFreq':       { 'zh-TW': '頻率', 'en': 'Frequency', 'zh-CN': '频率' },
  // ─── WFG: HTML static labels ───
  'wfg.frameRate':      { 'zh-TW': 'Frame Rate (Hz)', 'en': 'Frame Rate (Hz)', 'zh-CN': 'Frame Rate (Hz)' },
  'wfg.tconInternal':   { 'zh-TW': 'TCON 內部運算', 'en': 'TCON Internal', 'zh-CN': 'TCON 内部运算' },
  'wfg.lineBuffer':     { 'zh-TW': 'Line Buffer:', 'en': 'Line Buffer:', 'zh-CN': 'Line Buffer:' },
  /* ── v4.38.0：TX DE Offset（行內平移，單位＝ TX DCLK；UI 上刻意不寫單位，Bruce 指定）── */
  'wfg.txDeOffset':     { 'zh-TW': 'TX DE Offset:', 'en': 'TX DE Offset:', 'zh-CN': 'TX DE Offset:' },
  /* 🔴 v4.39.0：預設值由 32 改為 0（Bruce 2026-09-02），三語的說明文字一併更新 ——
     tooltip 寫著舊預設值等於文件說謊，比沒寫還糟。舉例仍用 32 這個數字（它是一個
     具體的位移量，用來解釋「起訖同時 +32、脈寬不變」最直觀）。 */
  'wfg.txDeOffsetTitle':{ 'zh-TW': 'TX DE Offset（單位：TX DCLK，0～511，預設 0）＝ TX DE 在每一條 Line 內的平移量。\n設 32 ⇒ 起始位置由 DCLK 0 移到 DCLK 32，結束位置同樣 ＋32 ⇒ **脈寬不變**。\n只影響 TX DE 這一條波形，不影響資料索引（D0/D1…）與 SD 取樣。',
                          'en': 'TX DE Offset (unit: TX DCLK, 0-511, default 0) = intra-line shift of TX DE.\nSet 32 => start moves from DCLK 0 to DCLK 32, end also +32 => pulse width unchanged.\nAffects only the TX DE waveform; data indices (D0/D1...) and SD sampling are untouched.',
                          'zh-CN': 'TX DE Offset（单位：TX DCLK，0～511，预设 0）＝ TX DE 在每一条 Line 内的平移量。\n设 32 ⇒ 起始位置由 DCLK 0 移到 DCLK 32，结束位置同样 ＋32 ⇒ **脉宽不变**。\n只影响 TX DE 这一条波形，不影响数据索引（D0/D1…）与 SD 取样。' },
  /* ── 🔴 v4.39.0：TX DE Offset 建議值對照表（Bruce 2026-09-02）──────────────────
     表格內的 TCON 型號／解析度／介面名稱都是識別字，三語一致、不翻譯；
     只有欄位標題、gate type 標註與說明文字有語言差異。 */
  'wfg.txDeRefBtnTitle':{ 'zh-TW': 'TX DE Offset 建議值對照表（依 TCON／H resolution／Tx I/F／Gate Type）',
                          'en': 'TX DE Offset reference table (by TCON / H resolution / Tx I/F / Gate Type)',
                          'zh-CN': 'TX DE Offset 建议值对照表（依 TCON／H resolution／Tx I/F／Gate Type）' },
  'wfg.txDeRefTitle':   { 'zh-TW': 'TX DE Offset 建議值對照表', 'en': 'TX DE Offset reference table', 'zh-CN': 'TX DE Offset 建议值对照表' },
  'wfg.txDeRefSub':     { 'zh-TW': '點任一個數值即可直接帶入上方的 TX DE Offset 欄位。',
                          'en': 'Click any value to load it straight into the TX DE Offset field above.',
                          'zh-CN': '点任一个数值即可直接带入上方的 TX DE Offset 字段。' },
  'wfg.txDeRefWarnName':{ 'zh-TW': '這些只是粗略的測試值', 'en': 'These are rough test values only', 'zh-CN': '这些只是粗略的测试值' },
  'wfg.txDeRefWarnBody':{ 'zh-TW': '實際上仍要以實際波形為主。表中的數字僅供起手參考，不能取代量測。',
                          'en': 'The actual waveform always takes precedence. Treat these numbers as a starting point, not a substitute for measurement.',
                          'zh-CN': '实际上仍要以实际波形为主。表中的数字仅供起手参考，不能取代量测。' },
  'wfg.txDeRefColTcon': { 'zh-TW': 'TCON', 'en': 'TCON', 'zh-CN': 'TCON' },
  'wfg.txDeRefColH':    { 'zh-TW': 'H resolution', 'en': 'H resolution', 'zh-CN': 'H resolution' },
  'wfg.txDeRefColItf':  { 'zh-TW': 'Tx I/F', 'en': 'Tx I/F', 'zh-CN': 'Tx I/F' },
  'wfg.txDeRefColVal':  { 'zh-TW': 'TX DE Offset', 'en': 'TX DE Offset', 'zh-CN': 'TX DE Offset' },
  'wfg.txDeRefBoth':    { 'zh-TW': 'single／dual 同值', 'en': 'single / dual (same)', 'zh-CN': 'single／dual 同值' },
  'wfg.txDeRefSingle':  { 'zh-TW': 'single', 'en': 'single', 'zh-CN': 'single' },
  'wfg.txDeRefDual':    { 'zh-TW': 'dual', 'en': 'dual', 'zh-CN': 'dual' },
  'wfg.txDeRefNote':    { 'zh-TW': '除 E503 之外，Single Gate 與 Dual Gate 同值，故合併為一格；E503 的兩種 Gate Type 分開列出。',
                          'en': 'Except for E503, single gate and dual gate share the same value, so they are merged into one cell; E503 lists both gate types separately.',
                          'zh-CN': '除 E503 之外，Single Gate 与 Dual Gate 同值，故合并为一格；E503 的两种 Gate Type 分开列出。' },
  'wfg.txDeRefCur':     { 'zh-TW': '目前值：', 'en': 'Current: ', 'zh-CN': '当前值：' },
  'wfg.txDeRefClose':   { 'zh-TW': '關閉', 'en': 'Close', 'zh-CN': '关闭' },
  /* ── v4.23.0：First Line Read（MNT）／ ST_LINE_RD ＋ PRE_BLK_RD_NO（NB）── */
  'wfg.firstLineRead':  { 'zh-TW': 'First Line Read:', 'en': 'First Line Read:', 'zh-CN': 'First Line Read:' },
  'wfg.flrTitle':       { 'zh-TW': 'First Line Read（reg_st_line_rd）＝ 波形位移的輸出行數。\nSingle Gate：＝ Line Buffer；Dual Gate：＝ Line Buffer × 2（可為奇數 ⇒ Line Buffer 出現 .5）',
                          'en': 'First Line Read (reg_st_line_rd) = waveform shift in output lines.\nSingle gate: = Line Buffer; dual gate: = Line Buffer x 2 (odd values make Line Buffer show .5)',
                          'zh-CN': 'First Line Read（reg_st_line_rd）＝ 波形位移的输出行数。\nSingle Gate：＝ Line Buffer；Dual Gate：＝ Line Buffer × 2（可为奇数 ⇒ Line Buffer 出现 .5）' },
  'wfg.nbStLineRdTitle':{ 'zh-TW': 'ST_LINE_RD（EN01 的區塊名是 START_LINE_RD）。\nNB 沒有單一的 First Line Read：First Line Read ＝ ST_LINE_RD ＋ PRE_BLK_RD_NO\n上限 ＝ min（本 register 的位元寬上限, Line Buffer 上限×gate 倍率 − PRE_BLK_RD_NO 的當下值）',
                          'en': 'ST_LINE_RD (named START_LINE_RD on EN01).\nNB has no single First Line Read: First Line Read = ST_LINE_RD + PRE_BLK_RD_NO\nMax = min(this register bit-width limit, Line Buffer max x gate multiplier - current PRE_BLK_RD_NO)',
                          'zh-CN': 'ST_LINE_RD（EN01 的区块名是 START_LINE_RD）。\nNB 没有单一的 First Line Read：First Line Read ＝ ST_LINE_RD ＋ PRE_BLK_RD_NO\n上限 ＝ min（本 register 的位宽上限, Line Buffer 上限×gate 倍率 − PRE_BLK_RD_NO 的当下值）' },
  'wfg.nbPreBlkRdTitle':{ 'zh-TW': 'PRE_BLK_RD_NO（EN01 的區塊名是 PRE_BLK_DATA）＝ 第一筆有效資料前的 dummy 行數。\n可自由輸入（Single Gate 下也不是固定值）。First Line Read ＝ PRE_BLK_RD_NO ＋ ST_LINE_RD\n上限 ＝ min（本 register 的位元寬上限, Line Buffer 上限×gate 倍率 − ST_LINE_RD 的當下值）',
                          'en': 'PRE_BLK_RD_NO (named PRE_BLK_DATA on EN01) = pre-dummy lines before the first valid data.\nFreely editable (it is not fixed even in single gate). First Line Read = PRE_BLK_RD_NO + ST_LINE_RD\nMax = min(this register bit-width limit, Line Buffer max x gate multiplier - current ST_LINE_RD)',
                          'zh-CN': 'PRE_BLK_RD_NO（EN01 的区块名是 PRE_BLK_DATA）＝ 第一笔有效数据前的 dummy 行数。\n可自由输入（Single Gate 下也不是固定值）。First Line Read ＝ PRE_BLK_RD_NO ＋ ST_LINE_RD\n上限 ＝ min（本 register 的位宽上限, Line Buffer 上限×gate 倍率 − ST_LINE_RD 的当下值）' },
  /* ══ v4.24.0：NB 改成方案 C（Line Buffer 唯讀）══════════════════════════════ */
  'wfg.lbNbReadOnly':   { 'zh-TW': 'NB TCON 的真值是 PRE_BLK_RD_NO 與 ST_LINE_RD 兩個 register。\nLine Buffer ＝（兩者相加）÷（Dual Gate 2／Single Gate 1），為唯讀衍生值。',
                          'en': 'On NB TCONs the truth is the two registers PRE_BLK_RD_NO and ST_LINE_RD.\nLine Buffer = (their sum) / (2 for dual gate, 1 for single gate) and is read-only.',
                          'zh-CN': 'NB TCON 的真值是 PRE_BLK_RD_NO 与 ST_LINE_RD 两个 register。\nLine Buffer ＝（两者相加）÷（Dual Gate 2／Single Gate 1），为只读衍生值。' },
  'wfg.nbRegClamped':   { 'zh-TW': '⚠ {f} {from} 超過該 register 的位元寬上限 {to}，已夾到 {to}',
                          'en': '⚠ {f} {from} exceeds the register bit-width limit {to}; clamped to {to}',
                          'zh-CN': '⚠ {f} {from} 超过该 register 的位宽上限 {to}，已夹到 {to}' },
  /* ══ v4.24.1：ST＋PRE 的**總和**夾值（Bruce 2026-08-25：「總數最高上限是由 Line Buffer 決定」）══
     {f} 被編輯的那一格／{o} 另一格／{ov} 另一格的當下值／{sum} 總和上限／{lb} Line Buffer 上限／{mult} gate 倍率 */
  'wfg.nbSumClamped':   { 'zh-TW': '⚠ {f} ＋ {o} 相加不可超過 {sum}（{m} 的 Line Buffer 上限 {lb} × {mult}）。{o} 目前是 {ov}，所以 {f} 最多只能到 {to}；{from} 已夾到 {to}',
                          'en': '⚠ {f} + {o} must not exceed {sum} ({m} Line Buffer max {lb} x {mult}). {o} is currently {ov}, so {f} can only reach {to}; {from} was clamped to {to}',
                          'zh-CN': '⚠ {f} ＋ {o} 相加不可超过 {sum}（{m} 的 Line Buffer 上限 {lb} × {mult}）。{o} 目前是 {ov}，所以 {f} 最多只能到 {to}；{from} 已夹到 {to}' },
  /* 退化情形：另一格自己就已經超過總和上限（匯入的超界真檔）⇒ 加不上去、保留原值。
     🔴 這時**不可以**講「最多只能到 {to}」—— {to} 就是目前值，它本身已經超界了。 */
  'wfg.nbSumNoRoom':    { 'zh-TW': '⚠ {f} 加不上去：{o} 目前是 {ov}，兩格相加已經超過上限 {sum}（{m} 的 Line Buffer 上限 {lb} × {mult}）。{f} 已保留原值 {to}（沒有替你改動）；要往上加請先把 {o} 調小',
                          'en': '⚠ {f} cannot be increased: {o} is currently {ov}, and the two already exceed the limit of {sum} ({m} Line Buffer max {lb} x {mult}). {f} was kept at {to} (nothing was changed for you); lower {o} first if you need to raise it',
                          'zh-CN': '⚠ {f} 加不上去：{o} 目前是 {ov}，两格相加已经超过上限 {sum}（{m} 的 Line Buffer 上限 {lb} × {mult}）。{f} 已保留原值 {to}（没有替你改动）；要往上加请先把 {o} 调小' },
  'wfg.nbSumOverLimit': { 'zh-TW': '⚠ 目前 ST_LINE_RD {s} ＋ PRE_BLK_RD_NO {p} ＝ {v}，超過 {m} 的上限 {max}（Line Buffer 上限 {lb} × {mult}）。這組值來自匯入的檔案或換機種／換 Gate Type，屬硬體真值，已保留未更動；只要開始編輯任一格，該格就會夾在上限內',
                          'en': '⚠ Current ST_LINE_RD {s} + PRE_BLK_RD_NO {p} = {v} exceeds the {m} limit of {max} (Line Buffer max {lb} x {mult}). These values came from an imported file or from switching model / gate type - they are hardware truth and were kept unchanged; editing either field will clamp that field within the limit',
                          'zh-CN': '⚠ 目前 ST_LINE_RD {s} ＋ PRE_BLK_RD_NO {p} ＝ {v}，超过 {m} 的上限 {max}（Line Buffer 上限 {lb} × {mult}）。这组值来自导入的档案或换机种／换 Gate Type，属硬件真值，已保留未更动；只要开始编辑任一格，该格就会夹在上限内' },
  'wfg.ackLbNbAuto':    { 'zh-TW': 'NB TCON：Line Buffer 由 PRE_BLK_RD_NO ＋ ST_LINE_RD 換算，唯讀',
                          'en': 'NB TCON: Line Buffer is derived from PRE_BLK_RD_NO + ST_LINE_RD and is read-only',
                          'zh-CN': 'NB TCON：Line Buffer 由 PRE_BLK_RD_NO ＋ ST_LINE_RD 换算，只读' },
  'wfg.codeNbPmMismatch':{ 'zh-TW': '⚠ 這份 {m} code 的 PANEL_MODE={pm}（{pmn}）與 RD_MODE={rd}（{gate}）不一致。值已原樣保留未更動，匯出時會照原值寫回；請自行確認哪一個才對',
                          'en': '⚠ In this {m} code PANEL_MODE={pm} ({pmn}) does not match RD_MODE={rd} ({gate}). The value was kept unchanged and will be written back as-is on export - please check which one is correct',
                          'zh-CN': '⚠ 这份 {m} code 的 PANEL_MODE={pm}（{pmn}）与 RD_MODE={rd}（{gate}）不一致。值已原样保留未更动，导出时会照原值写回；请自行确认哪一个才对' },
  'wfg.codeNbPmSkipped':{ 'zh-TW': '⚠ 本次 {m} 匯出**不寫** PANEL_MODE。\nSingle Gate 的 PANEL_MODE 有兩個合法值（0 Normal Data Mapping／1 ZigZag(ZINV)），\n手上沒有可沿用的原值時，寫任何一個都會改掉面板的 Data Mapping 型態。\n（實測 188 份 E501 真檔：Single Gate 有 103 份用 0、56 份用 1）\n⇒ 請在官方 UI 的 Others → Data Mapping 自行確認 PANEL_MODE。',
                          'en': '⚠ This {m} export does NOT write PANEL_MODE.\nSingle gate has two valid PANEL_MODE values (0 Normal Data Mapping / 1 ZigZag/ZINV);\nwith no imported value to reuse, writing either one would change the panel data mapping type.\n(Measured on 188 real E501 files: 103 single-gate files use 0, 56 use 1.)\n=> Please confirm PANEL_MODE in Others -> Data Mapping of the official UI.',
                          'zh-CN': '⚠ 本次 {m} 导出**不写** PANEL_MODE。\nSingle Gate 的 PANEL_MODE 有两个合法值（0 Normal Data Mapping／1 ZigZag(ZINV)），\n手上没有可沿用的原值时，写任何一个都会改掉面板的 Data Mapping 型态。\n（实测 188 份 E501 真档：Single Gate 有 103 份用 0、56 份用 1）\n⇒ 请在官方 UI 的 Others → Data Mapping 自行确认 PANEL_MODE。' },
  'wfg.flrClamped':     { 'zh-TW': '⚠ First Line Read {v} 超過 {m} 的上限 {max}（Line Buffer 上限 {lb} 條），已夾到 {max}',
                          'en': '⚠ First Line Read {v} exceeds the {m} limit of {max} (Line Buffer max {lb}); clamped to {max}',
                          'zh-CN': '⚠ First Line Read {v} 超过 {m} 的上限 {max}（Line Buffer 上限 {lb} 条），已夹到 {max}' },
  'wfg.flrOverLimit':   { 'zh-TW': '⚠ 目前 First Line Read {v} 超過 {m} 的上限 {max}（Line Buffer 上限 {lb} 條）。值已保留未更動，請自行確認',
                          'en': '⚠ Current First Line Read {v} exceeds the {m} limit of {max} (Line Buffer max {lb}). The value was kept unchanged - please check it',
                          'zh-CN': '⚠ 目前 First Line Read {v} 超过 {m} 的上限 {max}（Line Buffer 上限 {lb} 条）。值已保留未更动，请自行确认' },
  'wfg.flrPbClamped':   { 'zh-TW': '⚠ {pb} 由 {from} 一併調整為 {to}（它不可以大於 First Line Read，否則 ST_LINE_RD 會變成負值）',
                          'en': '⚠ {pb} was also changed from {from} to {to} (it cannot exceed First Line Read, or ST_LINE_RD would go negative)',
                          'zh-CN': '⚠ {pb} 由 {from} 一并调整为 {to}（它不可以大于 First Line Read，否则 ST_LINE_RD 会变成负值）' },
  'wfg.codeFlrMiss':    { 'zh-TW': '⚠ 這份 {m} code 讀不到 ST_LINE_RD / PRE_BLK_RD_NO（該 bank 未啟用），First Line Read 維持目前設定不變',
                          'en': '⚠ ST_LINE_RD / PRE_BLK_RD_NO are not present in this {m} code (bank disabled); First Line Read left unchanged',
                          'zh-CN': '⚠ 这份 {m} code 读不到 ST_LINE_RD / PRE_BLK_RD_NO（该 bank 未启用），First Line Read 维持目前设定不变' },
  'wfg.frmnoTitle':     { 'zh-TW': 'Toggle FRM_NO（全域共用）', 'en': 'Toggle FRM_NO (Global)', 'zh-CN': 'Toggle FRM_NO（全局共用）' },
  'wfg.frmnoDesc':      { 'zh-TW': '所有 GPIO 的 Toggle 模式共用此 FRM_NO 設定', 'en': 'All GPIO Toggle modes share this FRM_NO setting', 'zh-CN': '所有 GPIO 的 Toggle 模式共用此 FRM_NO 设定' },
  'wfg.xpolPresetLabel':{ 'zh-TW': 'XPOL 模式快速設定（自動填入 ACT_TYPE / R_PH / F_PH）', 'en': 'XPOL mode presets (auto-fill ACT_TYPE / R_PH / F_PH)', 'zh-CN': 'XPOL 模式快速设定（自动填入 ACT_TYPE / R_PH / F_PH）' },
  /* v4.7.0：`wfg.tconTypeLabel` 已移除 —— 數位信號卡片的 MNT/NB radio 拿掉了，
     型態改由機種查表（見 wfg.html 的 WFG_TCON_CLASS_SPEC）。 */
  // ─── WFG: Toolbar buttons ───
  'wfg.zoomInTitle':    { 'zh-TW': '放大', 'en': 'Zoom In', 'zh-CN': '放大' },
  'wfg.zoomOutTitle':   { 'zh-TW': '縮小', 'en': 'Zoom Out', 'zh-CN': '缩小' },
  'wfg.fitAllTitle':    { 'zh-TW': '全覽', 'en': 'Fit All', 'zh-CN': '全览' },
  'wfg.resetTitle':     { 'zh-TW': '重置', 'en': 'Reset', 'zh-CN': '重置' },
  // v4.45.0: 滾輪微調切換（面板訊號模擬 / LA 兩個分頁共用同一個狀態）
  'wfg.wheelFineTitle': { 'zh-TW': '滾輪微調檔位：點一下循環 1/1 → 1/3 → 1/10', 'en': 'Wheel zoom step: click to cycle 1/1 -> 1/3 -> 1/10', 'zh-CN': '滚轮微调档位：点一下循环 1/1 → 1/3 → 1/10' },
  // v3.21.0: 檢視 group — 中心 / 倍率 直接輸入
  'wfg.viewCenter':     { 'zh-TW': '中心', 'en': 'Center', 'zh-CN': '中心' },
  'wfg.viewCenterTitle':{ 'zh-TW': '波形區中心位置（絕對時間，秒；與上方時間軸同一個讀數）', 'en': 'Waveform view center position (absolute time in seconds, same reading as the time axis above)', 'zh-CN': '波形区中心位置（绝对时间，秒；与上方时间轴同一个读数）' },
  'wfg.viewZoom':       { 'zh-TW': '倍率', 'en': 'Zoom', 'zh-CN': '倍率' },
  'wfg.viewZoomTitle':  { 'zh-TW': '波形區放大倍率（1 = 全覽）', 'en': 'Waveform view zoom factor (1 = fit all)', 'zh-CN': '波形区放大倍率（1 = 全览）' },
  'wfg.export':         { 'zh-TW': '📤 匯出', 'en': '📤 Export', 'zh-CN': '📤 导出' },
  'wfg.exportTitle':    { 'zh-TW': '下載設定檔 (.txt)', 'en': 'Download config (.txt)', 'zh-CN': '下载设定档 (.txt)' },
  'wfg.import':         { 'zh-TW': '📥 匯入', 'en': '📥 Import', 'zh-CN': '📥 导入' },
  'wfg.importTitle':    { 'zh-TW': '從 .txt 檔載入設定', 'en': 'Load config from .txt file', 'zh-CN': '从 .txt 文件载入设定' },
  'wfg.copyWave':       { 'zh-TW': ' 複製波形', 'en': ' Copy', 'zh-CN': ' 复制波形' },
  'wfg.copyTitle':      { 'zh-TW': '複製波形設定到剪貼簿', 'en': 'Copy waveform config to clipboard', 'zh-CN': '复制波形设定到剪贴板' },
  'wfg.pasteWave':      { 'zh-TW': ' 貼上波形', 'en': ' Paste', 'zh-CN': ' 粘贴波形' },
  'wfg.pasteTitle':     { 'zh-TW': '從剪貼簿貼上波形設定', 'en': 'Paste waveform config from clipboard', 'zh-CN': '从剪贴板粘贴波形设定' },
  'wfg.screenshot':     { 'zh-TW': '📷 截圖', 'en': '📷 Screenshot', 'zh-CN': '📷 截图' },
  'wfg.screenshotTitle':{ 'zh-TW': '截圖分享', 'en': 'Screenshot & Share', 'zh-CN': '截图分享' },
  // v2.97.360: plain text (no emoji) for toolbar buttons with SVG icons
  'wfg.exportPlain':    { 'zh-TW': '匯出', 'en': 'Export', 'zh-CN': '导出' },
  'wfg.importPlain':    { 'zh-TW': '匯入', 'en': 'Import', 'zh-CN': '导入' },
  'wfg.copyPlain':      { 'zh-TW': '複製', 'en': 'Copy', 'zh-CN': '复制' },
  'wfg.pastePlain':     { 'zh-TW': '貼上', 'en': 'Paste', 'zh-CN': '粘贴' },
  'wfg.screenshotPlain':{ 'zh-TW': '截圖', 'en': 'Screenshot', 'zh-CN': '截图' },
  /* ══ 🔴 v4.35.0：波形 group 的第 6 顆按鈕「清除」與它的確認視窗 ═══════════════
     Bruce 2026-08-28：「在上方的波形 group 裡面再多一個按鈕，就是清除按鈕『Clear』。」
     它與「預設下拉選回快捷設定」是**同一支實作**（`wfgResetToDefault()`），
     差別只在這顆按鈕會先跳確認 —— 因為它會連 autosave 一起改寫掉，救不回來。
     🔴 文案刻意壓到兩句：依 Bruce v4.27.3 裁示「注意事項如果寫這麼多，
        那就失去了要人家注意的目的了」。要講的只有兩件 ——
        會變成什麼、什麼救不回來；「檢視保留」是唯一的例外所以附在後面。 */
  'wfg.clearPlain':     { 'zh-TW': '清除', 'en': 'Clear', 'zh-CN': '清除' },
  'wfg.clearTitle':     { 'zh-TW': '清除全部設定，回到預設值',
                          'en': 'Clear everything and return to defaults',
                          'zh-CN': '清除全部设定，回到预设值' },
  'wfg.clrTitle':       { 'zh-TW': '要清除全部設定嗎？', 'en': 'Clear everything?',
                          'zh-CN': '要清除全部设定吗？' },
  /* 🔴 v4.35.1（原本誤寫成 v4.36.0，v4.36.0 更正 —— 與 wfg.html 那 8 處同一個筆誤，
     那批已在 v4.35.2 改完，這一處漏在 common/i18n.js 裡）：
     第二行由「檢視的中心與倍率保留」改為「波形區會變成空白、檢視回預設」。
     這行字是使用者按下不可復原的動作之前唯一看得到的說明，內容與行為不符比沒有更糟。 */
  'wfg.clrBody':        { 'zh-TW': '波形、游標、量測與匯入紀錄全部清空，回到 FHD／E503／60Hz／Single Gate。自動存檔一併清除，無法復原。\n波形區會變成空白（所有通道與內部訊號都不顯示），檢視的中心與倍率回到預設。',
                          'en': 'Waveforms, cursors, measurements and import records are all cleared, back to FHD / E503 / 60Hz / Single Gate. The autosave record goes with them and cannot be recovered.\nThe waveform area becomes empty (no channels and no internal signals are shown) and the view centre and zoom return to their defaults.',
                          'zh-CN': '波形、游标、测量与导入记录全部清空，回到 FHD／E503／60Hz／Single Gate。自动存档一并清除，无法复原。\n波形区会变成空白（所有通道与内部信号都不显示），检视的中心与倍率回到预设。' },
  'wfg.clrOk':          { 'zh-TW': '清除', 'en': 'Clear', 'zh-CN': '清除' },
  'wfg.clrCancel':      { 'zh-TW': '取消', 'en': 'Cancel', 'zh-CN': '取消' },
  /* ══ 🔴 LA 分頁的「清空波形」（Bruce 2026-09-19）═════════════════════════════
     「LA 那個網頁，它要仿照 WFG 網頁一樣，要有一個清空波形的按鈕。」
     🔴 **另外一組 key**，不共用上面那組：語意不同。上面那顆是「清除全部設定
        回到預設值」，這顆只清**波形與波形帶出來的東西**，設定一律保留。
        共用 key 會讓按鈕文字承諾一件它不會做的事。
     🔴 內文要把「保留什麼」明寫出來 —— 使用者按下不可復原的動作之前，
        唯一看得到的說明就是這段字，內容與行為不符比沒有更糟（同 wfg.clrBody 的教訓）。 */
  'wfg.laClearPlain':   { 'zh-TW': '清空', 'en': 'Clear', 'zh-CN': '清空' },
  'wfg.laClearTitle':   { 'zh-TW': '清空波形與量測結果',
                          'en': 'Clear the waveform and measurement results',
                          'zh-CN': '清空波形与测量结果' },
  'wfg.laClrTitle':     { 'zh-TW': '要清空波形嗎？', 'en': 'Clear the waveform?',
                          'zh-CN': '要清空波形吗？' },
  'wfg.laClrBody':      { 'zh-TW': '清空擷取到的波形、游標、時基尺標、釘住的量測、脈衝計數、解碼結果與匯入檔名，檢視回到全覽。無法復原。\n保留不動：取樣深度／速率／門檻、觸發設定、通道名稱與順序、快捷設定、analyzer 清單。這些是設定不是波形，存在瀏覽器裡，清空不會動到。\n波形區會變成空白，直到下一次擷取或匯入。',
                          'en': 'Clears the captured waveform, cursors, the time-base scale card, pinned measurements, pulse counts, decode results and the imported file name; the view returns to full span. This cannot be undone.\nKept as they are: sample depth / rate / threshold, trigger settings, channel names and order, the quick preset and the analyzer list. Those are settings rather than waveform data, they live in the browser and clearing does not touch them.\nThe waveform area becomes empty until the next capture or import.',
                          'zh-CN': '清空撷取到的波形、游标、时基尺标、钉住的测量、脉冲计数、解码结果与导入档名，检视回到全览。无法复原。\n保留不动：取样深度／速率／门槛、触发设定、通道名称与顺序、快捷设定、analyzer 清单。这些是设定不是波形，存在浏览器里，清空不会动到。\n波形区会变成空白，直到下一次撷取或导入。' },
  'wfg.laClrOk':        { 'zh-TW': '清空', 'en': 'Clear', 'zh-CN': '清空' },
  /* ══ 🔴 v4.53.0：LA 下拉切回「快捷設定」placeholder 的確認視窗（Bruce 2026-09-19）══
     「只要切回來，就是把所有波形和檔案清空…然後通道名稱也要清空。其他相關設定也是清空」
     🔴 **又一組 key，不共用上面那組**：這個入口清的東西比「清空」按鈕多
        （通道名稱與描述、通道順序、analyzer 清單、解碼展開狀態、可見通道都回預設），
        而 `wfg.laClrBody` 明寫著「保留不動：…通道名稱與順序…analyzer 清單」——
        照抄過來就是讓視窗承諾一件它不做的事。留下來的只有取樣與觸發設定。 */
  'wfg.laPreClrTitle':  { 'zh-TW': '要清空波形並把設定回到預設嗎？',
                          'en': 'Clear the waveform and reset the settings?',
                          'zh-CN': '要清空波形并把设定回到预设吗？' },
  'wfg.laPreClrBody':   { 'zh-TW': '清空擷取到的波形與已載入的檔案，連同游標、時基尺標、釘住的量測、脈衝計數、解碼結果與匯入檔名，檢視回到全覽。無法復原。\n通道名稱與描述、通道順序、analyzer 清單一併回到預設，解碼區收起，16 條通道全部顯示。\n保留不動：取樣深度／速率／門檻與觸發設定。\n波形區會變成空白，直到下一次擷取或匯入。',
                          'en': 'Clears the captured waveform and the loaded file, together with cursors, the time-base scale card, pinned measurements, pulse counts, decode results and the imported file name; the view returns to full span. This cannot be undone.\nChannel names and descriptions, channel order and the analyzer list also return to their defaults, the decode area collapses and all 16 channels are shown.\nKept as they are: sample depth / rate / threshold and the trigger settings.\nThe waveform area becomes empty until the next capture or import.',
                          'zh-CN': '清空撷取到的波形与已载入的档案，连同游标、时基尺标、钉住的测量、脉冲计数、解码结果与导入档名，检视回到全览。无法复原。\n通道名称与描述、通道顺序、analyzer 清单一并回到预设，解码区收起，16 条通道全部显示。\n保留不动：取样深度／速率／门槛与触发设定。\n波形区会变成空白，直到下一次撷取或导入。' },
  /* ══ 🔴 v4.36.0：匯入類別選擇視窗 ═══════════════════════════════════════════
     Bruce 2026-08-28：「使用者可自由選擇全部匯入、只匯入某一部分或特定幾個部分，
     包含：(a) 左側系統卡片 (b) 左側 TCON 卡片 (c) 左側顯示卡片 (d) 右側量測卡片
     (e) 中間波形區。」⇒ 五個分類的名稱**逐字採用他的用詞**，不改寫成別的說法。
     每一項底下那一行只列「這一類包含哪幾張卡片」，不寫任何提醒或注意事項
     （v4.27.3 裁示：「注意事項如果寫這麼多，就失去要人家注意的目的了」）。 */
  'wfg.impsTitle':      { 'zh-TW': '要匯入哪幾類設定？', 'en': 'Which categories to import?',
                          'zh-CN': '要导入哪几类设定？' },
  'wfg.impsSub':        { 'zh-TW': '沒有勾的類別維持目前畫面上的設定。',
                          'en': 'Unchecked categories keep whatever is on screen now.',
                          'zh-CN': '没有勾的类别维持目前画面上的设定。' },
  'wfg.impsAll':        { 'zh-TW': '全選', 'en': 'Select all', 'zh-CN': '全选' },
  'wfg.impsNone':       { 'zh-TW': '取消全選', 'en': 'Clear all', 'zh-CN': '取消全选' },
  'wfg.impsSys':        { 'zh-TW': '左側系統卡片', 'en': 'System cards (left)',
                          'zh-CN': '左侧系统卡片' },
  'wfg.impsSysD':       { 'zh-TW': '系統設定 (Pattern Gen)、系統行為模擬',
                          'en': 'System Settings (Pattern Gen), System Behavior Simulation',
                          'zh-CN': '系统设定 (Pattern Gen)、系统行为模拟' },
  'wfg.impsTcon':       { 'zh-TW': '左側 TCON 卡片', 'en': 'TCON cards (left)',
                          'zh-CN': '左侧 TCON 卡片' },
  'wfg.impsTconD':      { 'zh-TW': 'TCON頻率設定、TCON 其他設定、TCON 數位信號，以及工具列 TCON group',
                          'en': 'TCON Clock Settings, Other TCON Settings, TCON Digital Signals, and the TCON toolbar group',
                          'zh-CN': 'TCON频率设定、TCON 其他设定、TCON 数字信号，以及工具栏 TCON group' },
  /* 🔴 v4.42.0：原本的單一類別 `wfg.impsDisp`（「左側顯示卡片」）拆成下面兩條。
     Bruce 2026-09-02：「左側要再細分拆開成兩張卡…匯入分類的選項要跟著這個新的拆法走。」
     舊的 impsDisp／impsDispD 已無任何引用，本版一併移除，避免留下兩套說法。 */
  'wfg.impsAnlg':       { 'zh-TW': '左側類比訊號卡片', 'en': 'Analog signal cards (left)',
                          'zh-CN': '左侧模拟信号卡片' },
  'wfg.impsAnlgD':      { 'zh-TW': 'IC 類比信號、面板類比信號',
                          'en': 'IC Analog Signals, Panel Analog Signals',
                          'zh-CN': 'IC 模拟信号、面板模拟信号' },
  'wfg.impsChan':       { 'zh-TW': '左側輸出通道卡片', 'en': 'Output channel card (left)',
                          'zh-CN': '左侧输出通道卡片' },
  'wfg.impsChanD':      { 'zh-TW': '輸出通道、類比疊合群組',
                          'en': 'Output Channels, analog overlay groups',
                          'zh-CN': '输出通道、模拟叠合群组' },
  'wfg.impsMeas':       { 'zh-TW': '右側量測卡片', 'en': 'Measurement cards (right)',
                          'zh-CN': '右侧量测卡片' },
  'wfg.impsMeasD':      { 'zh-TW': '時基標尺、類比垂直設定、脈衝計數',
                          'en': 'Time Cursors, Analog Vertical Settings, Pulse Count',
                          'zh-CN': '时基标尺、模拟垂直设定、脉冲计数' },
  'wfg.impsWave':       { 'zh-TW': '中間波形區', 'en': 'Waveform area (centre)',
                          'zh-CN': '中间波形区' },
  'wfg.impsWaveD':      { 'zh-TW': '檢視的中心位置與放大倍率',
                          'en': 'View centre position and zoom factor',
                          'zh-CN': '检视的中心位置与放大倍率' },
  'wfg.impsOk':         { 'zh-TW': '匯入', 'en': 'Import', 'zh-CN': '导入' },
  'wfg.impsCancel':     { 'zh-TW': '取消', 'en': 'Cancel', 'zh-CN': '取消' },
  'wfg.impsMergeFail':  { 'zh-TW': '無法依所選類別合併設定，已中止匯入（目前設定未被更動）。',
                          'en': 'Could not merge the selected categories; the import was cancelled and nothing changed.',
                          'zh-CN': '无法依所选类别合并设定，已中止导入（目前设定未被更动）。' },
  /* ══ 🔴 v4.35.0：左側「全部收折」按鈕 ═══════════════════════════════════════
     Bruce 2026-08-28（含他自己的兩次更正，以最後一次為準）：
     「『全部收折』按鈕只保留在左側，右側不用。但是左側按下去以後，連右側欄位
       也會一起全部收折。」
     「不要再有『全部展開』的按鈕。……至於收折，只有一個按鈕就是『全部收折』。」
     ⇒ **單向動作，不是切換**：按鈕文字恆為「全部收折」，全收折狀態下再按一次
       什麼都不會發生。要展開就自己去點那張卡片。 */
  'wfg.collapseAll':      { 'zh-TW': '全部收折', 'en': 'Collapse all', 'zh-CN': '全部收折' },
  'wfg.collapseAllTitle': { 'zh-TW': '收折左右兩側所有卡片',
                            'en': 'Collapse every card on both sides',
                            'zh-CN': '收折左右两侧所有卡片' },
  // ─── WFG: Cursor panel ───
  'wfg.cursorTitle':    { 'zh-TW': '時基標尺', 'en': 'Time Base Cursors', 'zh-CN': '时基标尺' },
  /* 類比波形疊合（v3.9.0）。UI 一律用「游標」不是「遊標」（站上既有用字）。 */
  'wfg.ovlCardTitle':   { 'zh-TW': '類比垂直設定', 'en': 'Analog Vertical Settings', 'zh-CN': '模拟垂直设置' },
  'wfg.ovlScale':       { 'zh-TW': '垂直刻度', 'en': 'V Scale', 'zh-CN': '垂直刻度' },
  'wfg.ovlFixed':       { 'zh-TW': '固定（最大範圍）', 'en': 'Fixed (full range)', 'zh-CN': '固定（最大范围）' },
  'wfg.ovlAuto':        { 'zh-TW': '自動（隨視窗）', 'en': 'Auto (follow view)', 'zh-CN': '自动（随视窗）' },
  'wfg.ovlCenter':      { 'zh-TW': '中心電壓', 'en': 'Center', 'zh-CN': '中心电压' },
  'wfg.ovlSpan':        { 'zh-TW': '範圍', 'en': 'Range', 'zh-CN': '范围' },
  'wfg.ovlToggle':      { 'zh-TW': '開關這條游標', 'en': 'Toggle this cursor', 'zh-CN': '开关这条游标' },
  'wfg.ovlStack':       { 'zh-TW': '疊合 {n}/{max}', 'en': 'Overlay {n}/{max}', 'zh-CN': '叠合 {n}/{max}' },
  'wfg.ovlFull':        { 'zh-TW': '已達上限 {n} 條', 'en': 'Limit {n} reached', 'zh-CN': '已达上限 {n} 条' },
  'wfg.cursorMoving':   { 'zh-TW': '移動中', 'en': 'moving', 'zh-CN': '移动中' },
  'wfg.cursorClose':    { 'zh-TW': '關閉', 'en': 'Close', 'zh-CN': '关闭' },
  'wfg.cursorShortcut': { 'zh-TW': '快捷鍵', 'en': 'Shortcut', 'zh-CN': '快捷键' },
  /* v3.5.0: 卡片空狀態提示 —— 原本沒有游標時是一片空白，無法區分「沒有游標」與「功能壞了」。
     術語沿用既有 i18n 的寫法（laCursorDtHint 內文一律用英文 cursor，不譯）。 */
  'wfg.cursorEmpty':    { 'zh-TW': '尚未建立 cursor（按 1～0 建立）', 'en': 'No cursors yet (press 1–0 to add)', 'zh-CN': '尚未建立 cursor（按 1～0 建立）' },
  'wfg.laCursorDtHint':  { 'zh-TW': '輸入數值後按 Enter：編號 1 的 cursor 固定不動，編號 2 的 cursor 移動到間隔等於此值處（依目前顯示單位）。編號 2 沿著它目前所在的那一側移動 —— 改大就離編號 1 更遠，改小就更靠近', 'en': 'Type a number and press Enter: cursor 1 stays put, cursor 2 moves so the gap equals this value (in the unit shown). Cursor 2 moves along the side it is currently on — a larger value takes it further from cursor 1, a smaller one brings it closer', 'zh-CN': '输入数值后按 Enter：编号 1 的 cursor 固定不动，编号 2 的 cursor 移动到间隔等于此值处（依当前显示单位）。编号 2 沿着它当前所在的那一侧移动 —— 改大就离编号 1 更远，改小就更靠近' },
  // ─── WFG: Pulse counter ───
  'wfg.pulseTitle':     { 'zh-TW': '脈衝計數', 'en': 'Pulse Counter', 'zh-CN': '脉冲计数' },
  'wfg.pulseAdd':       { 'zh-TW': '新增計數項目', 'en': 'Add counter', 'zh-CN': '新增计数项目' },
  'wfg.pulseEmpty':     { 'zh-TW': '點擊 ＋ 新增計數', 'en': 'Click ＋ to add counter', 'zh-CN': '点击 ＋ 新增计数' },
  'wfg.pulseDel':       { 'zh-TW': '刪除', 'en': 'Delete', 'zh-CN': '删除' },
  'wfg.pulseChannel':   { 'zh-TW': '通道', 'en': 'Channel', 'zh-CN': '通道' },
  'wfg.pulseRange':     { 'zh-TW': '範圍', 'en': 'Range', 'zh-CN': '范围' },
  'wfg.pulseMode':      { 'zh-TW': '計數形式', 'en': 'Count Mode', 'zh-CN': '计数形式' },
  'wfg.pulseRangeAll':  { 'zh-TW': '全部（可見範圍）', 'en': 'All (visible range)', 'zh-CN': '全部（可见范围）' },
  'wfg.pulseRangeAllShort': { 'zh-TW': '全部', 'en': 'All', 'zh-CN': '全部' },
  'wfg.pulseRising':    { 'zh-TW': '↑ 正緣 (Rising Edge)', 'en': '↑ Rising Edge', 'zh-CN': '↑ 上升沿 (Rising Edge)' },
  'wfg.pulseFalling':   { 'zh-TW': '↓ 負緣 (Falling Edge)', 'en': '↓ Falling Edge', 'zh-CN': '↓ 下降沿 (Falling Edge)' },
  'wfg.pulsePos':       { 'zh-TW': '⬛ 正脈衝 (Positive Pulse)', 'en': '⬛ Positive Pulse', 'zh-CN': '⬛ 正脉冲 (Positive Pulse)' },
  'wfg.pulseNeg':       { 'zh-TW': '⬜ 負脈衝 (Negative Pulse)', 'en': '⬜ Negative Pulse', 'zh-CN': '⬜ 负脉冲 (Negative Pulse)' },
  'wfg.pulseRisingShort':  { 'zh-TW': '↑正緣', 'en': '↑Rising', 'zh-CN': '↑上升沿' },
  'wfg.pulseFallingShort': { 'zh-TW': '↓負緣', 'en': '↓Falling', 'zh-CN': '↓下降沿' },
  'wfg.pulsePosShort':     { 'zh-TW': '⬛正脈衝', 'en': '⬛Pos Pulse', 'zh-CN': '⬛正脉冲' },
  'wfg.pulseNegShort':     { 'zh-TW': '⬜負脈衝', 'en': '⬜Neg Pulse', 'zh-CN': '⬜负脉冲' },
  // ─── WFG: Channel list ───
  'wfg.channelPrefix':  { 'zh-TW': '通道', 'en': 'CH', 'zh-CN': '通道' },
  'wfg.dragSort':       { 'zh-TW': '拖曳排序', 'en': 'Drag to reorder', 'zh-CN': '拖拽排序' },
  // ─── WFG: Channel colour picker (v3.10.0) ───
  'wfg.colorPickTitle': { 'zh-TW': '點選更改通道顏色', 'en': 'Click to change channel colour', 'zh-CN': '点选更改通道颜色' },
  'wfg.colorCustom':    { 'zh-TW': '其他顏色', 'en': 'Custom', 'zh-CN': '其他颜色' },
  'wfg.colorReset':     { 'zh-TW': '恢復原本顏色', 'en': 'Restore original colour', 'zh-CN': '恢复原本颜色' },
  'wfg.ovlCursorLimit': { 'zh-TW': '游標範圍（本視窗）', 'en': 'Cursor range (this view)', 'zh-CN': '游标范围（本视窗）' },
  'wfg.noSignal':       { 'zh-TW': '無', 'en': 'None', 'zh-CN': '无' },
  'wfg.unassigned':     { 'zh-TW': '未選擇信號', 'en': 'No signal assigned', 'zh-CN': '未选择信号' },
  'wfg.hideChannel':    { 'zh-TW': '隱藏', 'en': 'Hide', 'zh-CN': '隐藏' },
  'wfg.showChannel':    { 'zh-TW': '顯示', 'en': 'Show', 'zh-CN': '显示' },
  // ─── WFG: Add / remove channel row (v4.20.0) ───
  'wfg.chAdd':          { 'zh-TW': '＋ 新增通道', 'en': '+ Add Channel', 'zh-CN': '＋ 新增通道' },
  'wfg.chDel':          { 'zh-TW': '－ 移除通道', 'en': '− Remove Channel', 'zh-CN': '－ 移除通道' },
  'wfg.chAddTitle':     { 'zh-TW': '在清單最後新增一列通道（預設「無信號」，選了訊號源才會畫）',
                          'en': 'Append one channel row (starts with no signal; assign one to draw it)',
                          'zh-CN': '在列表最后新增一列通道（默认「无信号」，选了信号源才会画）' },
  'wfg.chDelTitle':     { 'zh-TW': '移除清單最後一列通道（綁著訊號源時會先確認；要移除中間某一列，先用左邊的把手把它拖到最後）',
                          'en': 'Remove the last row in the list (asks first if it is bound to a signal; to remove a row in the middle, drag it to the bottom first)',
                          'zh-CN': '移除列表最后一列通道（绑着信号源时会先确认；要移除中间某一列，先用左边的把手把它拖到最后）' },
  'wfg.chCount':        { 'zh-TW': '{n} / {max} 列', 'en': '{n} / {max} rows', 'zh-CN': '{n} / {max} 列' },
  'wfg.chMaxReached':   { 'zh-TW': '通道列數已達上限 {max} 列，無法再新增。',
                          'en': 'Channel rows have reached the limit of {max}; cannot add more.',
                          'zh-CN': '通道列数已达上限 {max} 列，无法再新增。' },
  'wfg.chMinReached':   { 'zh-TW': '至少要保留一列通道。',
                          'en': 'At least one channel row must remain.',
                          'zh-CN': '至少要保留一列通道。' },
  'wfg.chDelConfirm':   { 'zh-TW': '要移除「{name}」這一列嗎？\n它綁著訊號源 {sig}，移除後這條訊號在通道清單上就沒有位置了（訊號本身的設定不會被刪，之後新增一列再選回來即可）。',
                          'en': 'Remove the row "{name}"?\nIt is bound to signal {sig}. After removal that signal has no row in the channel list (the signal\'s own settings are kept — add a row and pick it again to bring it back).',
                          'zh-CN': '要移除「{name}」这一列吗？\n它绑着信号源 {sig}，移除后这条信号在通道列表上就没有位置了（信号本身的设置不会被删，之后新增一列再选回来即可）。' },
  // ─── WFG: Analog waveform (Source Driver / Level Shifter) ───
  'wfg.waveformType':       { 'zh-TW': '波形類型', 'en': 'Waveform', 'zh-CN': '波形类型' },
  'wfg.wfTypeDigital':      { 'zh-TW': '數位', 'en': 'Digital', 'zh-CN': '数字' },
  'wfg.wfTypeSourceDriver': { 'zh-TW': 'Source Driver', 'en': 'Source Driver', 'zh-CN': 'Source Driver' },
  'wfg.wfTypeLevelShifter': { 'zh-TW': 'Level Shifter', 'en': 'Level Shifter', 'zh-CN': 'Level Shifter' },
  'wfg.bitDepth':           { 'zh-TW': '位元深度', 'en': 'Bit Depth', 'zh-CN': '位元深度' },
  'wfg.voltageMin':         { 'zh-TW': '電壓下限', 'en': 'Voltage Min', 'zh-CN': '电压下限' },
  'wfg.voltageMax':         { 'zh-TW': '電壓上限', 'en': 'Voltage Max', 'zh-CN': '电压上限' },
  'wfg.vgl':                { 'zh-TW': 'VGL', 'en': 'VGL', 'zh-CN': 'VGL' },
  'wfg.vgh':                { 'zh-TW': 'VGH', 'en': 'VGH', 'zh-CN': 'VGH' },
  'wfg.posGammaHeader':     { 'zh-TW': '正極性 Gamma（VGMA1~VGMA7，靠近 AVDD）', 'en': '+ Gamma (VGMA1~VGMA7, near AVDD)', 'zh-CN': '正极性 Gamma（VGMA1~VGMA7，靠近 AVDD）' },
  'wfg.negGammaHeader':     { 'zh-TW': '負極性 Gamma（VGMA8~VGMA14，靠近 AGND）', 'en': '− Gamma (VGMA8~VGMA14, near AGND)', 'zh-CN': '负极性 Gamma（VGMA8~VGMA14，靠近 AGND）' },
  'wfg.posGammaMax':        { 'zh-TW': 'VGMA1（白，最高）', 'en': 'VGMA1 (white, peak)', 'zh-CN': 'VGMA1（白，最高）' },
  'wfg.posGammaMin':        { 'zh-TW': 'VGMA7（黑，近中位）', 'en': 'VGMA7 (black, near mid)', 'zh-CN': 'VGMA7（黑，近中位）' },
  'wfg.negGammaMax':        { 'zh-TW': 'VGMA8（黑，近中位）', 'en': 'VGMA8 (black, near mid)', 'zh-CN': 'VGMA8（黑，近中位）' },
  'wfg.negGammaMin':        { 'zh-TW': 'VGMA14（白，最低）', 'en': 'VGMA14 (white, peak)', 'zh-CN': 'VGMA14（白，最低）' },
  'wfg.xstbSource':         { 'zh-TW': 'XSTB 訊號來源', 'en': 'XSTB signal source', 'zh-CN': 'XSTB 信号来源' },
  'wfg.xpolSource':         { 'zh-TW': 'XPOL 訊號來源', 'en': 'XPOL signal source', 'zh-CN': 'XPOL 信号来源' },
  'wfg.xpolHint':           { 'zh-TW': 'XPOL=1 → 充正極 Gamma；XPOL=0 → 充負極 Gamma', 'en': 'XPOL=1 → charge to + gamma; XPOL=0 → charge to − gamma', 'zh-CN': 'XPOL=1 → 充正极 Gamma；XPOL=0 → 充负极 Gamma' },
  'wfg.sdGamma':            { 'zh-TW': 'Gamma 曲線 (γ)', 'en': 'Gamma curve (γ)', 'zh-CN': 'Gamma 曲线 (γ)' },
  'wfg.sdGammaHint':        { 'zh-TW': 'γ=2.2 標準顯示 Gamma（S 型曲線：低灰階與高灰階電壓變化大，中間灰階平緩）；γ=1.0 為線性', 'en': 'γ=2.2 standard S-curve (steep at black/white, flat at mid-gray); γ=1.0 = linear', 'zh-CN': 'γ=2.2 标准 S 型曲线（暗部与亮部电压变化大，中间灰阶平缓）；γ=1.0 为线性' },
  'wfg.curvatureRise':      { 'zh-TW': '上升充電時間', 'en': 'Rise charge time', 'zh-CN': '上升充电时间' },
  'wfg.curvatureFall':      { 'zh-TW': '下降放電時間', 'en': 'Fall discharge time', 'zh-CN': '下降放电时间' },
  'wfg.grayMode':           { 'zh-TW': '灰階模式', 'en': 'Gray Mode', 'zh-CN': '灰阶模式' },
  'wfg.grayInc':            { 'zh-TW': '遞增', 'en': 'Incrementing', 'zh-CN': '递增' },
  'wfg.grayDec':            { 'zh-TW': '遞減', 'en': 'Decrementing', 'zh-CN': '递减' },
  'wfg.grayH1Line':         { 'zh-TW': 'H1 Line 交替', 'en': 'H1 Line alternate', 'zh-CN': 'H1 Line 交替' },
  'wfg.grayFixed':          { 'zh-TW': '固定灰階', 'en': 'Fixed gray', 'zh-CN': '固定灰阶' },
  'wfg.grayFixedLevel':     { 'zh-TW': '固定灰階值', 'en': 'Fixed gray level', 'zh-CN': '固定灰阶值' },
  'wfg.ckSource':           { 'zh-TW': 'CK 來源', 'en': 'CK source', 'zh-CN': 'CK 来源' },
  'wfg.ckNone':             { 'zh-TW': '未選', 'en': 'None', 'zh-CN': '未选' },
  // ─── WFG: Panel Signals (面板信號) ───
  'wfg.panelSignals':       { 'zh-TW': '面板類比信號', 'en': 'Panel Analog Signals', 'zh-CN': '面板模拟信号' },
  'wfg.gateLineLabel':      { 'zh-TW': 'Gate 條數 (G)', 'en': 'Gate line (G)', 'zh-CN': 'Gate 条数 (G)' },
  'wfg.gateRangeHint':      { 'zh-TW': '可選範圍', 'en': 'Range', 'zh-CN': '可选范围' },
  // v3.24.0: 「可選範圍：1 ~ N（…）」括號裡的上限來源。三語同字（Vactive 是暫存器名，
  // 不翻譯），但仍走 t() 而非寫死，之後要改措辭時三語才在同一處。
  'wfg.gateRangeSrc':       { 'zh-TW': 'Vactive', 'en': 'Vactive', 'zh-CN': 'Vactive' },
  'wfg.gateRangeSrcX2':     { 'zh-TW': 'Vactive × 2', 'en': 'Vactive × 2', 'zh-CN': 'Vactive × 2' },
  'wfg.gateLineX2':         { 'zh-TW': 'Max. 2倍 Gate Line', 'en': 'Max. 2× gate line', 'zh-CN': 'Max. 2倍 Gate Line' },
  'wfg.gatePulseNth':       { 'zh-TW': '第 {n} 個 pulse', 'en': 'pulse #{n}', 'zh-CN': '第 {n} 个 pulse' },
  'wfg.gateShow':           { 'zh-TW': '在波形區顯示 Gate 波形', 'en': 'Show gate waveform', 'zh-CN': '在波形区显示 Gate 波形' },
  'wfg.gateRcMult':         { 'zh-TW': '充放電時間倍率', 'en': 'Charge/discharge time multiplier', 'zh-CN': '充放电时间倍率' },
  'wfg.gateRcRange':        { 'zh-TW': '可調範圍', 'en': 'Range', 'zh-CN': '可调范围' },
  'wfg.gateRcNoRoom':       { 'zh-TW': 'Gate 充放電時間已達上限 300，倍率無可調空間', 'en': 'Gate charge time is already at the 300 cap — no room to multiply', 'zh-CN': 'Gate 充放电时间已达上限 300，倍率无可调空间' },
  'wfg.gateRcReadoutRise':  { 'zh-TW': '上升充電時間', 'en': 'Rise', 'zh-CN': '上升充电时间' },
  'wfg.gateRcReadoutFall':  { 'zh-TW': '下降充電時間', 'en': 'Fall', 'zh-CN': '下降充电时间' },
  // ─── TFT 導通／關閉電壓（v3.7.0）— TFT 元件參數，不參與 Gate 波形繪製 ───
  'wfg.tftVoltages':        { 'zh-TW': 'TFT 導通／關閉電壓', 'en': 'TFT on / off voltage', 'zh-CN': 'TFT 导通／关闭电压' },
  'wfg.tftVon':             { 'zh-TW': 'TFT 導通電壓 (V)', 'en': 'TFT on voltage (V)', 'zh-CN': 'TFT 导通电压 (V)' },
  'wfg.tftVoff':            { 'zh-TW': 'TFT 關閉電壓 (V)', 'en': 'TFT off voltage (V)', 'zh-CN': 'TFT 关闭电压 (V)' },
  'wfg.tftVonShort':        { 'zh-TW': '導通', 'en': 'On', 'zh-CN': '导通' },
  'wfg.tftVoffShort':       { 'zh-TW': '關閉', 'en': 'Off', 'zh-CN': '关闭' },
  'wfg.tftRange':           { 'zh-TW': '可輸入範圍', 'en': 'Input range', 'zh-CN': '可输入范围' },
  'wfg.tftCharge':          { 'zh-TW': '充電', 'en': 'Charge', 'zh-CN': '充电' },
  'wfg.tftDischarge':       { 'zh-TW': '放電', 'en': 'Discharge', 'zh-CN': '放电' },
  'wfg.tftNoCharge':        { 'zh-TW': 'Subpixel 無法充電', 'en': 'Subpixel cannot charge', 'zh-CN': 'Subpixel 无法充电' },
  'wfg.tftNoDischarge':     { 'zh-TW': 'Subpixel 無法放電', 'en': 'Subpixel cannot discharge', 'zh-CN': 'Subpixel 无法放电' },
  'wfg.tftConflict':        { 'zh-TW': '參數矛盾：關閉電壓高於導通電壓', 'en': 'Conflict: off voltage is higher than on voltage', 'zh-CN': '参数矛盾：关闭电压高于导通电压' },
  // v3.8.0: 「Subpixel 電荷」更名為「Subpixel 電壓」（舊 key wfg.subpixelCharge 已無引用）
  'wfg.subpixelVoltage':    { 'zh-TW': 'Subpixel 電壓', 'en': 'Subpixel voltage', 'zh-CN': 'Subpixel 电压' },
  'wfg.spxDesc':            { 'zh-TW': '跟隨 Gate Line 卡片選定的那一條 G。Gate 電壓超過 TFT 導通電壓後朝 SD1 充電，掉到 TFT 關閉電壓以下就保持在自己當下的電壓。',
                              'en': 'Follows the gate line selected in the Gate Line card. Charges toward SD1 once the gate voltage rises above the TFT on voltage, and holds its own current voltage once it falls below the TFT off voltage.',
                              'zh-CN': '跟随 Gate Line 卡片选定的那一条 G。Gate 电压超过 TFT 导通电压后朝 SD1 充电，掉到 TFT 关闭电压以下就保持在自己当下的电压。' },
  'wfg.spxRc':              { 'zh-TW': 'Subpixel 充電時間', 'en': 'Subpixel charge time', 'zh-CN': 'Subpixel 充电时间' },
  'wfg.spxShow':            { 'zh-TW': '在波形區顯示 Subpixel 波形', 'en': 'Show Subpixel waveform', 'zh-CN': '在波形区显示 Subpixel 波形' },
  'wfg.spxRcRange':         { 'zh-TW': '可調範圍', 'en': 'Range', 'zh-CN': '可调范围' },
  'wfg.spxRcScaleNote':     { 'zh-TW': '0~255 只表示程度，對應的絕對時間不隨 line 長度改變',
                              'en': '0-255 is a relative scale; the absolute time constant does not change with line length',
                              'zh-CN': '0~255 只表示程度，对应的绝对时间不随 line 长度改变' },
  'wfg.spxTau':             { 'zh-TW': '時間常數 τ', 'en': 'Time constant τ', 'zh-CN': '时间常数 τ' },
  'wfg.spxFull':            { 'zh-TW': '充到 99%（5τ）', 'en': 'To 99% (5τ)', 'zh-CN': '充到 99%（5τ）' },
  'wfg.spxLineNow':         { 'zh-TW': '目前 1 line', 'en': 'Current 1 line', 'zh-CN': '当前 1 line' },
  'wfg.spxNoSd':            { 'zh-TW': '找不到啟用中的 SD1，Subpixel 沒有充電來源', 'en': 'No enabled SD1 — Subpixel has no charging source', 'zh-CN': '找不到启用中的 SD1，Subpixel 没有充电来源' },
  'wfg.spxCfgHint':         { 'zh-TW': '參數請在「面板類比信號 → Subpixel 電壓」卡片調整', 'en': 'Settings live in Panel Analog Signals → Subpixel voltage', 'zh-CN': '参数请在「面板模拟信号 → Subpixel 电压」卡片调整' },
  // ─── Feedthrough Voltage（v3.12.0）— Gate 關閉瞬間 Subpixel 電壓的階梯式下掉 ───
  'wfg.ftEnable':           { 'zh-TW': '啟用 Feedthrough Voltage', 'en': 'Enable feedthrough voltage', 'zh-CN': '启用 Feedthrough Voltage' },
  'wfg.ftDesc':            { 'zh-TW': 'Gate 電壓掉到 TFT 關閉電壓的那一瞬間，Subpixel 電壓會再往下掉一階（正電壓往 0 靠、負電壓更負，方向與 Gate 下降相同）。下掉幅度依當下灰階，在 L0／L127／L255 三個錨點之間做分段線性內插。',
                              'en': 'At the instant the gate voltage falls below the TFT off voltage, the subpixel voltage steps further down (positive voltages toward 0, negative voltages more negative — the same direction as the gate falling edge). The drop is piecewise-linearly interpolated between the L0 / L127 / L255 anchors according to the current gray level.',
                              'zh-CN': 'Gate 电压掉到 TFT 关闭电压的那一瞬间，Subpixel 电压会再往下掉一阶（正电压往 0 靠、负电压更负，方向与 Gate 下降相同）。下掉幅度依当下灰阶，在 L0／L127／L255 三个锚点之间做分段线性内插。' },
  'wfg.ftDrops':            { 'zh-TW': 'Feedthrough Drop 電壓', 'en': 'Feedthrough drop voltage', 'zh-CN': 'Feedthrough Drop 电压' },
  'wfg.ftD0':               { 'zh-TW': 'L0 Drop (V)', 'en': 'L0 drop (V)', 'zh-CN': 'L0 Drop (V)' },
  'wfg.ftD127':             { 'zh-TW': 'L127 Drop (V)', 'en': 'L127 drop (V)', 'zh-CN': 'L127 Drop (V)' },
  'wfg.ftD255':             { 'zh-TW': 'L255 Drop (V)', 'en': 'L255 drop (V)', 'zh-CN': 'L255 Drop (V)' },
  'wfg.ftRange':            { 'zh-TW': '可輸入範圍', 'en': 'Input range', 'zh-CN': '可输入范围' },
  'wfg.ftAnchorV':          { 'zh-TW': '錨點對應的 SD1 電壓（離中軌距離）', 'en': 'SD1 voltage at each anchor (distance from mid-rail)', 'zh-CN': '锚点对应的 SD1 电压（离中轨距离）' },
  'wfg.ftMidRail':          { 'zh-TW': '中軌 Vmid', 'en': 'Mid-rail Vmid', 'zh-CN': '中轨 Vmid' },
  'wfg.ftInterpNote':       { 'zh-TW': '內插在「離中軌距離」的電壓空間進行，正負極性共用同一組錨點',
                              'en': 'Interpolation runs in the voltage domain on distance-from-mid-rail; both polarities share one set of anchors',
                              'zh-CN': '内插在「离中轨距离」的电压空间进行，正负极性共用同一组锚点' },
  'wfg.ftOff':              { 'zh-TW': '未啟用 —— Gate 關閉後 Subpixel 保持關閉前的電壓', 'en': 'Disabled — the subpixel holds its pre-off voltage', 'zh-CN': '未启用 —— Gate 关闭后 Subpixel 保持关闭前的电压' },
  'wfg.ftYAxisNote':        { 'zh-TW': 'Y 軸下緣已延伸到', 'en': 'Y axis lower bound extended to', 'zh-CN': 'Y 轴下缘已延伸到' },
  // ─── WFG: VCOM 電壓（v3.13.0）───
  'wfg.vcomVoltage':        { 'zh-TW': 'VCOM 電壓', 'en': 'VCOM voltage', 'zh-CN': 'VCOM 电压' },
  'wfg.vcomEnable':         { 'zh-TW': '啟用 VCOM 電壓', 'en': 'Enable VCOM voltage', 'zh-CN': '启用 VCOM 电压' },
  'wfg.vcomDesc':           { 'zh-TW': 'VCOM 是面板共通電極的直流準位，畫成一條白色水平虛線，疊在 Vpix（Subpixel）波形的同一格裡當比較基準。它會參與計算：VCOM 與 Vpix 波形之間的正、負極性面積比會換算成兩側的灰階底色，兩側面積不相等時該底色還會閃爍。它不改變的是 Vpix 波形本身 —— 波形的電壓數值不受 VCOM 影響。這條線可以直接拖曳，抓線本身或左端的 VCOM 標籤都可以。',
                              'en': 'VCOM is the DC level of the panel common electrode. It is drawn as a white dashed horizontal line overlaid on the Vpix (subpixel) trace as a reference. It does take part in the computation: the positive/negative polarity areas between VCOM and the Vpix trace are turned into the gray shading on each side, and that shading flickers when the two areas are unequal. What it does not change is the Vpix trace itself — the waveform voltage values are unaffected by VCOM. The line can be dragged directly; grab either the line or the VCOM label at its left end.',
                              'zh-CN': 'VCOM 是面板共通电极的直流准位，画成一条白色水平虚线，叠在 Vpix（Subpixel）波形的同一格里当比较基准。它会参与计算：VCOM 与 Vpix 波形之间的正、负极性面积比会换算成两侧的灰阶底色，两侧面积不相等时该底色还会闪烁。它不改变的是 Vpix 波形本身 —— 波形的电压数值不受 VCOM 影响。这条线可以直接拖曳，抓线本身或左端的 VCOM 标签都可以。' },
  'wfg.vcomValue':          { 'zh-TW': 'VCOM 電壓 (V)', 'en': 'VCOM voltage (V)', 'zh-CN': 'VCOM 电压 (V)' },
  'wfg.vcomRange':          { 'zh-TW': '可輸入範圍（VGMA14 ~ VGMA1）', 'en': 'Input range (VGMA14 – VGMA1)', 'zh-CN': '可输入范围（VGMA14 ~ VGMA1）' },
  'wfg.vcomOff':            { 'zh-TW': '未啟用 —— 不畫 VCOM 參考線', 'en': 'Disabled — the VCOM reference line is not drawn', 'zh-CN': '未启用 —— 不画 VCOM 参考线' },
  'wfg.vcomEffective':      { 'zh-TW': '實際生效', 'en': 'Effective value', 'zh-CN': '实际生效' },
  'wfg.vcomClamped':        { 'zh-TW': '輸入值已超出 VGMA14 ~ VGMA1，畫線時取夾制後的值', 'en': 'The entered value is outside VGMA14 – VGMA1; the clamped value is used when drawing', 'zh-CN': '输入值已超出 VGMA14 ~ VGMA1，画线时取夹制后的值' },
  'wfg.vcomDefaultNote':    { 'zh-TW': '預設值＝VGMA1 與 VGMA14 的中點（由 gamma 設定即時算出，改 gamma 會跟著變；手動改過就固定在使用者的值）',
                              'en': 'Default = midpoint of VGMA1 and VGMA14, derived live from the gamma settings; once edited by hand it stays at the entered value',
                              'zh-CN': '预设值＝VGMA1 与 VGMA14 的中点（由 gamma 设定即时算出，改 gamma 会跟着变；手动改过就固定在使用者的值）' },
  'wfg.vcomHiddenNote':     { 'zh-TW': 'Vpix 目前未顯示 —— 參考線畫在 Vpix 那一格內，該格不在畫面上時不會畫', 'en': 'Vpix is currently hidden — the reference line lives inside the Vpix row and is not drawn when that row is off screen', 'zh-CN': 'Vpix 目前未显示 —— 参考线画在 Vpix 那一格内，该格不在画面上时不会画' },
  'wfg.vcomNoSd':           { 'zh-TW': '找不到啟用中的 SD1 —— 無法取得 VGMA1／VGMA14', 'en': 'No enabled SD1 found — VGMA1 / VGMA14 unavailable', 'zh-CN': '找不到启用中的 SD1 —— 无法取得 VGMA1／VGMA14' },
  'wfg.wip':                { 'zh-TW': '開發中', 'en': 'WIP', 'zh-CN': '开发中' },
  // ─── WFG: LS Global Config ───
  'wfg.lsGlobalTitle':      { 'zh-TW': 'Level Shifter 全域設定', 'en': 'Level Shifter Global Config', 'zh-CN': 'Level Shifter 全局设定' },
  'wfg.lsMode':             { 'zh-TW': '驅動模式', 'en': 'Driving Mode', 'zh-CN': '驱动模式' },
  'wfg.lsModeIndividual':   { 'zh-TW': '一進一出 (Multi-CPV)', 'en': 'Multi-CPV', 'zh-CN': '一进一出 (Multi-CPV)' },
  'wfg.lsModeCondensed':    { 'zh-TW': '一進多出 (Single-CPV)', 'en': 'Single-CPV', 'zh-CN': '一进多出 (Single-CPV)' },
  'wfg.lsModeDualCPV':      { 'zh-TW': '二進多出 (Dual-CPV)', 'en': 'Dual-CPV', 'zh-CN': '二进多出 (Dual-CPV)' },
  'wfg.lsModeQuadCPV':      { 'zh-TW': '四進多出 (Quad-CPV)', 'en': 'Quad-CPV', 'zh-CN': '四进多出 (Quad-CPV)' },
  'wfg.lsGoaPhase':         { 'zh-TW': 'GOA Phase', 'en': 'GOA Phase', 'zh-CN': 'GOA Phase' },
  'wfg.lsGoaPhaseHint':     { 'zh-TW': '決定 CKO 輸出通道數量', 'en': 'Determines the number of CKO output channels', 'zh-CN': '决定 CKO 输出通道数量' },
  'wfg.lsVceCkSource':      { 'zh-TW': 'VCE Clock 來源', 'en': 'VCE Clock Source', 'zh-CN': 'VCE Clock 来源' },
  'wfg.lsCpv1Source':       { 'zh-TW': 'CPV1 來源', 'en': 'CPV1 Source', 'zh-CN': 'CPV1 来源' },
  'wfg.lsCpv2Source':       { 'zh-TW': 'CPV2 來源', 'en': 'CPV2 Source', 'zh-CN': 'CPV2 来源' },
  'wfg.lsCpv3Source':       { 'zh-TW': 'CPV3 來源', 'en': 'CPV3 Source', 'zh-CN': 'CPV3 来源' },
  'wfg.lsCpv4Source':       { 'zh-TW': 'CPV4 來源', 'en': 'CPV4 Source', 'zh-CN': 'CPV4 来源' },
  'wfg.lsQuadOddGroup':     { 'zh-TW': '奇數輸出 (CKO1/3/5…)', 'en': 'Odd outputs (CKO1/3/5…)', 'zh-CN': '奇数输出 (CKO1/3/5…)' },
  'wfg.lsQuadEvenGroup':    { 'zh-TW': '偶數輸出 (CKO2/4/6…)', 'en': 'Even outputs (CKO2/4/6…)', 'zh-CN': '偶数输出 (CKO2/4/6…)' },
  'wfg.lsIndivCkHint':      { 'zh-TW': '每個 CKO 各自對應一個 CK 來源', 'en': 'Each CKO maps to its own CK source', 'zh-CN': '每个 CKO 各自对应一个 CK 来源' },
  'wfg.lsCkPerCko':          { 'zh-TW': '各 CKO 對應 CK 來源', 'en': 'CK Source per CKO', 'zh-CN': '各 CKO 对应 CK 来源' },
  'wfg.lsOutputChannels':    { 'zh-TW': '輸出通道', 'en': 'Output Channels', 'zh-CN': '输出通道' },
  'wfg.lsCondensedHint':    { 'zh-TW': 'CKO 寬度由 face 數決定：High／Low 各 phase/2 個 VCE 週期', 'en': 'CKO width follows the face count: High/Low each span phase/2 VCE periods', 'zh-CN': 'CKO 宽度由 face 数决定：High／Low 各 phase/2 个 VCE 周期' },
  'wfg.lsCondPhase':        { 'zh-TW': 'Condensed Phase 數', 'en': 'Condensed Phase Count', 'zh-CN': 'Condensed Phase 数' },
  'wfg.lsCondPhaseHint':    { 'zh-TW': '輪流驅動的 CKH 數量（4/6/8）', 'en': 'Number of CKH outputs in round-robin (4/6/8)', 'zh-CN': '轮流驱动的 CKH 数量（4/6/8）' },
  'wfg.lsCondInterval':     { 'zh-TW': 'Clocks Interval', 'en': 'Clocks Interval', 'zh-CN': 'Clocks Interval' },
  'wfg.lsCondIntervalNone': { 'zh-TW': 'No Time Interval（背靠背）', 'en': 'No Time Interval (back-to-back)', 'zh-CN': 'No Time Interval（背靠背）' },
  'wfg.lsCondIntervalSome': { 'zh-TW': 'Some Time Interval（有間隔）', 'en': 'Some Time Interval (with gap)', 'zh-CN': 'Some Time Interval（有间隔）' },
  'wfg.lsTermSignal':       { 'zh-TW': 'Terminate 訊號', 'en': 'Terminate Signal', 'zh-CN': 'Terminate 信号' },
  'wfg.lsTermNone':         { 'zh-TW': '不使用', 'en': 'Not used', 'zh-CN': '不使用' },
  'wfg.lsTermHint':         { 'zh-TW': '只看 Rising Edge：拉高後把殘存的 High 壓成 Low，直到下一個 frame 的 STV Rising 才恢復', 'en': 'Rising edge only: once it asserts, any leftover High is pulled Low until the next frame STV rising releases it', 'zh-CN': '只看 Rising Edge：拉高后把残存的 High 压成 Low，直到下一个 frame 的 STV Rising 才恢复' },
  'wfg.lsStvSignal':        { 'zh-TW': 'STV 訊號', 'en': 'STV Signal', 'zh-CN': 'STV 信号' },
  'wfg.lsStvHint':          { 'zh-TW': '定義「下一個 frame」的起點；只看 Rising Edge，用來解除 Terminate 的壓低狀態', 'en': 'Defines the start of the next frame; rising edge only, releases the Terminate hold', 'zh-CN': '定义「下一个 frame」的起点；只看 Rising Edge，用来解除 Terminate 的压低状态' },
  'wfg.lsDualCpvHint':      { 'zh-TW': 'CPV1 充電、CPV2 放電，各自循環全部 CKO', 'en': 'CPV1 charges, CPV2 discharges, each cycling through all CKOs', 'zh-CN': 'CPV1 充电、CPV2 放电，各自循环全部 CKO' },
  'wfg.lsQuadCpvHint':      { 'zh-TW': '奇數 CKO 由 CPV1／CPV2 控制，偶數 CKO 由 CPV3／CPV4 控制，兩組各自循環', 'en': 'Odd CKOs driven by CPV1/CPV2, even CKOs by CPV3/CPV4; each group cycles independently', 'zh-CN': '奇数 CKO 由 CPV1／CPV2 控制，偶数 CKO 由 CPV3／CPV4 控制，两组各自循环' },
  /* v4.50.0：觸發沿拆成上升／下降兩個設定。舊的三個 key（lsCpvTrigEdge／
     lsCpvTrigFalling／lsCpvTrigRising）已無任何引用，一併移除，避免下一個人
     以為畫面上還有「單一觸發沿」那個控制項。
     標籤用「CKO 上升／CKO 下降」：使用者在畫面上看得到 CKO 這幾條波形。 */
  'wfg.lsCpvTrigEdgeRise':  { 'zh-TW': 'CKO 上升的觸發沿', 'en': 'CKO Rise Triggered By', 'zh-CN': 'CKO 上升的触发沿' },
  'wfg.lsCpvTrigEdgeFall':  { 'zh-TW': 'CKO 下降的觸發沿', 'en': 'CKO Fall Triggered By', 'zh-CN': 'CKO 下降的触发沿' },
  /* v4.50.1：選項文字改成**自己帶來源名稱**。舊的兩個 key（lsCpvEdgeFall／
     lsCpvEdgeRise，只寫「上升沿／下降沿」）已無任何引用，一併移除 ——
     與 v4.50.0 移除那三個舊 key 同一個慣例。
     🔴 為什麼改：v4.50.0 的註解寫「刻意不用 CPV1／CPV2 命名」，那是錯的。
        Bruce 2026-09-19：「你那個 CKO 上升沿（上升的觸發沿），下面選擇應該是
        CPV1 上升沿，或是 CPV1 下降沿。而 CKO 下降的觸發沿，應該是 CPV2 的
        下降沿或上升沿。」同一張卡片上面本來就有「CPV1 來源」「CPV2 來源」
        兩個欄位，選項不寫來源名稱，反而看不出來選的是誰的沿。
     `{src}` 由 `_wfgLsTrigEdgeHtml()` 依模式填入（二進 CPV1／CPV2、
     四進 CPV1/CPV3／CPV2/CPV4），不是翻譯內容，三語共用同一組代號。 */
  'wfg.lsCpvEdgeFallOf':    { 'zh-TW': '{src} 下降沿', 'en': '{src} Falling Edge', 'zh-CN': '{src} 下降沿' },
  'wfg.lsCpvEdgeRiseOf':    { 'zh-TW': '{src} 上升沿', 'en': '{src} Rising Edge', 'zh-CN': '{src} 上升沿' },
  'wfg.groupDigital':       { 'zh-TW': '數位信號', 'en': 'Digital', 'zh-CN': '数字信号' },
  'wfg.groupAnalog':        { 'zh-TW': '類比信號', 'en': 'Analog', 'zh-CN': '模拟信号' },
  // ─── WFG: Minimap ───
  'wfg.minimapLabel':   { 'zh-TW': 'Overview · 點擊跳轉', 'en': 'Overview · Click to jump', 'zh-CN': 'Overview · 点击跳转' },
  // ─── WFG: Progress / kvdat ───
  'wfg.progressRead':   { 'zh-TW': '讀取檔案…', 'en': 'Reading file…', 'zh-CN': '读取文件…' },
  'wfg.progressXml':    { 'zh-TW': '解析 XML 設定…', 'en': 'Parsing XML config…', 'zh-CN': '解析 XML 设定…' },
  'wfg.progressWave':   { 'zh-TW': '解析波形資料…', 'en': 'Parsing waveform data…', 'zh-CN': '解析波形数据…' },
  'wfg.progressWaveCh': { 'zh-TW': '解析波形資料… ({n} 通道)', 'en': 'Parsing waveform data… ({n} channels)', 'zh-CN': '解析波形数据… ({n} 通道)' },
  'wfg.progressRender': { 'zh-TW': '渲染波形…', 'en': 'Rendering waveform…', 'zh-CN': '渲染波形…' },
  'wfg.progressDone':   { 'zh-TW': '完成！', 'en': 'Done!', 'zh-CN': '完成！' },
  'wfg.progressPrecomp':{ 'zh-TW': '預計算類比波形… ({n}/{total})', 'en': 'Precomputing analog… ({n}/{total})', 'zh-CN': '预计算模拟波形… ({n}/{total})' },
  'wfg.progressRestore':{ 'zh-TW': '還原上次的工作狀態…', 'en': 'Restoring your last session…', 'zh-CN': '还原上次的工作状态…' },
  'wfg.kvdatMagicErr':  { 'zh-TW': '二進位區塊 magic 不符', 'en': 'Binary block magic mismatch', 'zh-CN': '二进制区块 magic 不符' },
  'wfg.kvdatNoSettings':{ 'zh-TW': '找不到 </settings> 標記', 'en': 'Cannot find </settings> marker', 'zh-CN': '找不到 </settings> 标记' },
  'wfg.kvdatFail':      { 'zh-TW': 'kvdat 解析失敗: ', 'en': 'kvdat parse failed: ', 'zh-CN': 'kvdat 解析失败: ' },
  'wfg.kvdatConfirmBig':{ 'zh-TW': '此檔案大小為 {size} MB，載入可能需要較長時間。是否繼續？', 'en': 'This file is {size} MB, loading may take a while. Continue?', 'zh-CN': '此文件大小为 {size} MB，加载可能需要较长时间。是否继续？' },
  'wfg.kvdatInfoFile':  { 'zh-TW': '檔案：', 'en': 'File: ', 'zh-CN': '文件：' },
  'wfg.kvdatInfoSample':{ 'zh-TW': '取樣率：', 'en': 'Sample Rate: ', 'zh-CN': '采样率：' },
  'wfg.kvdatInfoCh':    { 'zh-TW': '通道數：', 'en': 'Channels: ', 'zh-CN': '通道数：' },
  // ─── WFG: Export / Import feedback ───
  'wfg.copied':         { 'zh-TW': '✓ 已複製', 'en': '✓ Copied', 'zh-CN': '✓ 已复制' },
  'wfg.pasted':         { 'zh-TW': '✓ 已貼上', 'en': '✓ Pasted', 'zh-CN': '✓ 已粘贴' },
  'wfg.jsonError':      { 'zh-TW': 'JSON 格式錯誤：', 'en': 'JSON format error: ', 'zh-CN': 'JSON 格式错误：' },
  'wfg.invalidConfig':  { 'zh-TW': '不是有效的 WFG 設定檔', 'en': 'Not a valid WFG config file', 'zh-CN': '不是有效的 WFG 设定档' },
  'wfg.clipboardEmpty': { 'zh-TW': '剪貼簿是空的', 'en': 'Clipboard is empty', 'zh-CN': '剪贴板是空的' },
  'wfg.clipboardFail':  { 'zh-TW': '瀏覽器不允許自動讀取剪貼簿（{msg}）', 'en': 'The browser blocked automatic clipboard access ({msg})', 'zh-CN': '浏览器不允许自动读取剪贴板（{msg}）' },
  'wfg.clipboardUnsupported': { 'zh-TW': '此瀏覽器不支援自動讀取剪貼簿', 'en': 'This browser does not support reading the clipboard automatically', 'zh-CN': '此浏览器不支持自动读取剪贴板' },
  // v2.99.0: 手動貼上視窗（iOS Safari 不允許網頁靜默讀剪貼簿時的通用備援路徑）
  'wfg.pasteModalTitle':   { 'zh-TW': '手動貼上設定', 'en': 'Paste Configuration', 'zh-CN': '手动粘贴设置' },
  'wfg.pasteModalHint':    { 'zh-TW': '請在下方欄位長按選「貼上」（電腦可按 Ctrl/⌘ + V），再按「確定」。', 'en': 'Long-press the box below and choose "Paste" (or press Ctrl/⌘ + V on a computer), then tap "OK".', 'zh-CN': '请在下方栏位长按选「粘贴」（电脑可按 Ctrl/⌘ + V），再按「确定」。' },
  'wfg.pasteModalPlaceholder': { 'zh-TW': '在這裡貼上波形設定內容', 'en': 'Paste the waveform configuration here', 'zh-CN': '在这里粘贴波形设置内容' },
  'wfg.pasteModalOk':      { 'zh-TW': '確定', 'en': 'OK', 'zh-CN': '确定' },
  'wfg.pasteModalCancel':  { 'zh-TW': '取消', 'en': 'Cancel', 'zh-CN': '取消' },
  'wfg.pasteModalEmpty':   { 'zh-TW': '請先貼上設定內容', 'en': 'Please paste the configuration first', 'zh-CN': '请先粘贴设置内容' },
  'wfg.shareTitle':     { 'zh-TW': 'WFG 波形截圖', 'en': 'WFG Waveform Screenshot', 'zh-CN': 'WFG 波形截图' },
  'aux.title':          { 'zh-TW': 'eDP AUX / DPCD 查詢工具', 'en': 'eDP AUX / DPCD Lookup Tool', 'zh-CN': 'eDP AUX / DPCD 查询工具' },
  'aux.subtitle':       { 'zh-TW': 'AUX 解碼 & DPCD 暫存器查詢', 'en': 'AUX Decoder & DPCD Register Lookup', 'zh-CN': 'AUX 解码 & DPCD 寄存器查询' },
  'aux.tabDpcd':        { 'zh-TW': 'DPCD 查詢', 'en': 'DPCD Lookup', 'zh-CN': 'DPCD 查询' },
  'aux.tabDecode':      { 'zh-TW': 'AUX 解碼', 'en': 'AUX Decode', 'zh-CN': 'AUX 解码' },
  'aux.dpcdInputTitle': { 'zh-TW': 'DPCD 地址查詢', 'en': 'DPCD Address Lookup', 'zh-CN': 'DPCD 地址查询' },
  'aux.dpcdAddrLabel':  { 'zh-TW': 'DPCD 地址 (HEX)', 'en': 'DPCD Address (HEX)', 'zh-CN': 'DPCD 地址 (HEX)' },
  'aux.dpcdAddrHint':   { 'zh-TW': '輸入 5 位 hex 地址（如 00000），即時查詢', 'en': 'Enter 5-digit hex address (e.g. 00000), instant lookup', 'zh-CN': '输入 5 位 hex 地址（如 00000），即时查询' },
  'aux.dpcdValLabel':   { 'zh-TW': '暫存器值 (HEX)（選填）', 'en': 'Register Value (HEX) (optional)', 'zh-CN': '寄存器值 (HEX)（选填）' },
  'aux.dpcdValHint':    { 'zh-TW': '輸入後自動解析各 bit 的狀態', 'en': 'Auto-parse each bit field after input', 'zh-CN': '输入后自动解析各 bit 的状态' },
  'aux.decodeInputTitle': { 'zh-TW': 'AUX Transaction 解碼', 'en': 'AUX Transaction Decode', 'zh-CN': 'AUX Transaction 解码' },
  'aux.decodeReqLabel': { 'zh-TW': 'AUX Request（HEX bytes）', 'en': 'AUX Request (HEX bytes)', 'zh-CN': 'AUX Request（HEX bytes）' },
  'aux.decodeReqHint':  { 'zh-TW': '空格分隔的 hex bytes，如 90 00 00 00（Read）或 80 01 00 00 14（Write）', 'en': 'Space-separated hex bytes, e.g. 90 00 00 00 (Read) or 80 01 00 00 14 (Write)', 'zh-CN': '空格分隔的 hex bytes，如 90 00 00 00（Read）或 80 01 00 00 14（Write）' },
  'aux.decodeRepLabel': { 'zh-TW': 'AUX Reply（HEX bytes）（選填）', 'en': 'AUX Reply (HEX bytes) (optional)', 'zh-CN': 'AUX Reply（HEX bytes）（选填）' },
  'aux.decodeRepHint':  { 'zh-TW': 'Reply 封包（選填），含狀態 + 數據', 'en': 'Reply packet (optional), with status + data', 'zh-CN': 'Reply 封包（选填），含状态 + 数据' },
  'aux.decodeBtn':      { 'zh-TW': '▶ 解碼', 'en': '▶ Decode', 'zh-CN': '▶ 解码' },
  'aux.decodeResultTitle': { 'zh-TW': '解碼結果', 'en': 'Decode Result', 'zh-CN': '解码结果' },
  'aux.cmd9':           { 'zh-TW': '9 — DPCD 讀取 (Native Read)', 'en': '9 — Native Read (DPCD)', 'zh-CN': '9 — DPCD 读取 (Native Read)' },
  'aux.cmd8':           { 'zh-TW': '8 — DPCD 寫入 (Native Write)', 'en': '8 — Native Write (DPCD)', 'zh-CN': '8 — DPCD 写入 (Native Write)' },
  'aux.addrHint':       { 'zh-TW': '20-bit 位址（5 位 hex），轉動滾輪選擇', 'en': '20-bit address (5-digit hex), scroll to select', 'zh-CN': '20-bit 地址（5 位 hex），滚动选择' },
  'aux.lenHint':        { 'zh-TW': '資料長度欄位（實際 byte 數 = Length + 1）', 'en': 'Length field (actual bytes = Length + 1)', 'zh-CN': '数据长度字段（实际 byte 数 = Length + 1）' },
  'aux.writeDataHint':  { 'zh-TW': 'Write 資料（hex），每格 1 byte', 'en': 'Write data (hex), 1 byte per field', 'zh-CN': 'Write 数据（hex），每格 1 byte' },
  'aux.reqPreview':     { 'zh-TW': '組合封包預覽', 'en': 'Request Packet Preview', 'zh-CN': '组合封包预览' },
  'aux.repSection':     { 'zh-TW': '📥 AUX Reply（選填）', 'en': '📥 AUX Reply (optional)', 'zh-CN': '📥 AUX Reply（选填）' },
  'aux.repStatusHint':  { 'zh-TW': '選擇已知回覆狀態，或自訂輸入任意 hex byte', 'en': 'Select a known reply status, or enter any hex byte as custom', 'zh-CN': '选择已知回复状态，或自定义输入任意 hex byte' },
  'aux.readDataHint':   { 'zh-TW': 'Read 回傳資料（hex），每格 1 byte', 'en': 'Read reply data (hex), 1 byte per field', 'zh-CN': 'Read 回传数据（hex），每格 1 byte' },
  'aux.repPreview':     { 'zh-TW': 'Reply 封包預覽', 'en': 'Reply Packet Preview', 'zh-CN': 'Reply 封包预览' },
  'aux.backToList':     { 'zh-TW': '↩ 選單', 'en': '↩ List', 'zh-CN': '↩ 列表' },
  'aux.waveTitle':      { 'zh-TW': 'AUX 波形（Manchester II）', 'en': 'AUX Waveform (Manchester II)', 'zh-CN': 'AUX 波形（Manchester II）' },
  'aux.fullscreen':     { 'zh-TW': '全螢幕', 'en': 'Fullscreen', 'zh-CN': '全屏' },
  'aux.overviewClick':  { 'zh-TW': 'Overview · 點擊跳轉', 'en': 'Overview · Click to Jump', 'zh-CN': 'Overview · 点击跳转' },
  'aux.waveHint':       { 'zh-TW': 'Manchester II 編碼：bit 1 = H→L 跳變（中間點），bit 0 = L→H 跳變（中間點）· 1 bit = 1μs · Preamble = Pre-charge + SYNC zeros（規範值依 eDP 版本不同）', 'en': 'Manchester II: bit 1 = H→L transition (mid-point), bit 0 = L→H transition (mid-point) · 1 bit = 1μs', 'zh-CN': 'Manchester II 编码：bit 1 = H→L 跳变（中间点），bit 0 = L→H 跳变（中间点）· 1 bit = 1μs' },
  'aux.dpcdValPh':      { 'zh-TW': '輸入 hex 值', 'en': 'Enter hex value', 'zh-CN': '输入 hex 值' },
  'aux.dpcdSearchTitle':{ 'zh-TW': 'DPCD 反向搜尋', 'en': 'DPCD Reverse Search', 'zh-CN': 'DPCD 反向搜索' },
  'aux.dpcdSearchPh':   { 'zh-TW': '搜尋 DPCD（如 LANE_COUNT、頻寬、HBR...）', 'en': 'Search DPCD (e.g. LANE_COUNT, bandwidth, HBR...)', 'zh-CN': '搜索 DPCD（如 LANE_COUNT、带宽、HBR...）' },
  'aux.dpcdSearchHint': { 'zh-TW': '搜尋暫存器名稱、說明或值標籤，點擊結果地址自動查詢', 'en': 'Search by name, description or value labels. Click an address to jump.', 'zh-CN': '搜索寄存器名称、说明或值标签，点击地址自动查询' },
  'aux.preambleSection': { 'zh-TW': '⚙️ Preamble 設定', 'en': '⚙️ Preamble Settings', 'zh-CN': '⚙️ Preamble 设定' },
  'aux.sysPreamble':    { 'zh-TW': '系統 Preamble', 'en': 'System Preamble', 'zh-CN': '系统 Preamble' },
  'aux.sysPreambleHint': { 'zh-TW': '系統（Source）發送的 Preamble pulse 總數', 'en': 'Total Preamble pulses sent by the system (Source)', 'zh-CN': '系统（Source）发送的 Preamble pulse 总数' },
  'aux.sinkPreamble':   { 'zh-TW': 'TCON Reply', 'en': 'TCON Reply', 'zh-CN': 'TCON Reply' },
  'aux.sinkPreambleHint': { 'zh-TW': 'TCON（Sink）回覆的 Preamble pulse 總數', 'en': 'Total Preamble pulses in the TCON (Sink) reply', 'zh-CN': 'TCON（Sink）回复的 Preamble pulse 总数' },
  'aux.tabVerdiff':      { 'zh-TW': '版本差異', 'en': 'Version Diff', 'zh-CN': '版本差异' },
  'aux.verdiffTitle':    { 'zh-TW': 'DPCD 暫存器版本差異總覽', 'en': 'DPCD Register Version Differences', 'zh-CN': 'DPCD 寄存器版本差异总览' },
  'aux.verdiffDesc':     { 'zh-TW': '列出所有跨版本有差異的 DPCD 暫存器與 bit-level 變更。資料來源（版本發佈順序）：DP v1.2 / eDP v1.2 / eDP v1.3 / eDP v1.4 / DP v1.3 / eDP v1.4a / eDP v1.4b / DP v1.4a / DP v2.0 / eDP v1.5', 'en': 'Lists all DPCD registers with cross-version differences and bit-level changes. Data sources (version release order): DP v1.2 / eDP v1.2 / eDP v1.3 / eDP v1.4 / DP v1.3 / eDP v1.4a / eDP v1.4b / DP v1.4a / DP v2.0 / eDP v1.5', 'zh-CN': '列出所有跨版本有差异的 DPCD 寄存器与 bit-level 变更。数据来源（版本发布顺序）：DP v1.2 / eDP v1.2 / eDP v1.3 / eDP v1.4 / DP v1.3 / eDP v1.4a / eDP v1.4b / DP v1.4a / DP v2.0 / eDP v1.5' },
  'isp.title':          { 'zh-TW': 'iSP 波形產生器', 'en': 'iSP Waveform Generator', 'zh-CN': 'iSP 波形产生器' },
  'isp.subtitle':       { 'zh-TW': 'iSP 8B9B 編碼差動訊號波形模擬', 'en': 'iSP 8B9B encoded differential waveform simulator', 'zh-CN': 'iSP 8B9B 编码差动讯号波形模拟' },
  'isp.modeHeader':     { 'zh-TW': '模式設定', 'en': 'Mode Settings', 'zh-CN': '模式设定' },
  'isp.driverBits':     { 'zh-TW': 'Source Driver Bits', 'en': 'Source Driver Bits', 'zh-CN': 'Source Driver Bits' },
  'isp.pairs':          { 'zh-TW': 'Pair 數', 'en': 'Pair Count', 'zh-CN': 'Pair 数' },
  'isp.encDataZone':    { 'zh-TW': 'Data Zone 編碼', 'en': 'Data Zone Encoding', 'zh-CN': 'Data Zone 编码' },
  'isp.encBkZone':      { 'zh-TW': 'BK Zone 編碼', 'en': 'BK Zone Encoding', 'zh-CN': 'BK Zone 编码' },
  'isp.scramble':       { 'zh-TW': 'Scrambler', 'en': 'Scrambler', 'zh-CN': 'Scrambler' },
  'isp.scrOff':         { 'zh-TW': 'Off', 'en': 'Off', 'zh-CN': 'Off' },
  'isp.scrOnPixel':     { 'zh-TW': 'On', 'en': 'On', 'zh-CN': 'On' },
  'isp.scrKey':         { 'zh-TW': '初始 Key (16-bit hex)', 'en': 'Initial Key (16-bit hex)', 'zh-CN': '初始 Key (16-bit hex)' },
  'isp.bkpol':          { 'zh-TW': 'BKPOL', 'en': 'BKPOL', 'zh-CN': 'BKPOL' },
  'isp.bkpolOn':        { 'zh-TW': 'ON', 'en': 'ON', 'zh-CN': 'ON' },
  'isp.bkpolOff':       { 'zh-TW': 'OFF', 'en': 'OFF', 'zh-CN': 'OFF' },
  'isp.bkpolHint':      { 'zh-TW': '開啟後於 frame 末端加入 VBK 段：BK · BAC · BKPOL± · BK（依 datasheet §8.3.2，BAC+BKPOL 接在 EOL 之後，本身不帶 EOL）。點波形上的 BKPOL 色塊可切換正／負。', 'en': 'When ON, appends a VBK segment at the end of the frame: BK · BAC · BKPOL± · BK (per datasheet §8.3.2, BAC+BKPOL follows the EOL code and carries no EOL of its own). Click the BKPOL block on the waveform to flip polarity.', 'zh-CN': '开启后于 frame 末端加入 VBK 段：BK · BAC · BKPOL± · BK（依 datasheet §8.3.2，BAC+BKPOL 接在 EOL 之后，本身不带 EOL）。点波形上的 BKPOL 色块可切换正／负。' },
  'isp.legBKPOL':       { 'zh-TW': 'BKPOL+', 'en': 'BKPOL+', 'zh-CN': 'BKPOL+' },
  'isp.modeHint':       {
    'zh-TW': '<strong>目前支援：</strong>1-pair &amp; 2-pair / 6-bit &amp; 8-bit / DLL &amp; PLL / Scrambler On/Off。',
    'en':    '<strong>Currently supports:</strong> 1-pair &amp; 2-pair / 6-bit &amp; 8-bit / DLL &amp; PLL / Scrambler On/Off.',
    'zh-CN': '<strong>目前支持：</strong>1-pair &amp; 2-pair / 6-bit &amp; 8-bit / DLL &amp; PLL / Scrambler On/Off。'
  },
  'isp.pixelHeader':    { 'zh-TW': '像素設定', 'en': 'Pixel Settings', 'zh-CN': '像素设定' },
  'isp.pxMode':         { 'zh-TW': '像素模式', 'en': 'Pixel Mode', 'zh-CN': '像素模式' },
  'isp.pxModeA':        { 'zh-TW': '純色畫面', 'en': 'Solid Color', 'zh-CN': '纯色画面' },
  'isp.pxModeB':        { 'zh-TW': '遞增', 'en': 'Increment', 'zh-CN': '递增' },
  'isp.pxModeC':        { 'zh-TW': '遞減', 'en': 'Decrement', 'zh-CN': '递减' },
  'isp.startGray':      { 'zh-TW': '起始灰階', 'en': 'Start Gray Level', 'zh-CN': '起始灰阶' },
  'isp.stepGray':       { 'zh-TW': 'Step（每次變化量）', 'en': 'Step (increment)', 'zh-CN': 'Step（每次变化量）' },
  'isp.repeatSubPx':    { 'zh-TW': '重複 sub-pixel 數', 'en': 'Repeat sub-pixel count', 'zh-CN': '重复 sub-pixel 数' },
  'isp.incHint':        { 'zh-TW': '重複=3：R=G=B，每個 pixel 灰階遞增一次，達最大值後保持不變。', 'en': 'Repeat=3: R=G=B, gray increments once per pixel from start. Stays at max once reached.', 'zh-CN': '重复=3：R=G=B，每个 pixel 灰阶递增一次，达最大值后保持不变。' },
  'isp.decHint':        { 'zh-TW': '重複=3：R=G=B，每個 pixel 灰階遞減一次，達 0 後保持不變。', 'en': 'Repeat=3: R=G=B, gray decrements once per pixel from start. Stays at 0 once reached.', 'zh-CN': '重复=3：R=G=B，每个 pixel 灰阶递减一次，达 0 后保持不变。' },
  'isp.grayR':          { 'zh-TW': 'R Gray Level', 'en': 'R Gray Level', 'zh-CN': 'R Gray Level' },
  'isp.grayG':          { 'zh-TW': 'G Gray Level', 'en': 'G Gray Level', 'zh-CN': 'G Gray Level' },
  'isp.grayB':          { 'zh-TW': 'B Gray Level', 'en': 'B Gray Level', 'zh-CN': 'B Gray Level' },
  'isp.grayHint':       { 'zh-TW': '每個 pixel 的 R / G / B 各自獨立設定（0 ~ 255，8-bit）', 'en': 'R / G / B per pixel set independently (0 ~ 255, 8-bit)', 'zh-CN': '每个 pixel 的 R / G / B 各自独立设定（0 ~ 255，8-bit）' },
  'isp.grayHint6':      { 'zh-TW': '每個 pixel 的 R / G / B 各自獨立設定（0 ~ 63，6-bit）', 'en': 'R / G / B per pixel set independently (0 ~ 63, 6-bit)', 'zh-CN': '每个 pixel 的 R / G / B 各自独立设定（0 ~ 63，6-bit）' },
  'isp.grayHint8':      { 'zh-TW': '每個 pixel 的 R / G / B 各自獨立設定（0 ~ 255，8-bit）', 'en': 'R / G / B per pixel set independently (0 ~ 255, 8-bit)', 'zh-CN': '每个 pixel 的 R / G / B 各自独立设定（0 ~ 255，8-bit）' },
  'isp.pixelCount':     { 'zh-TW': 'Pixel 數量', 'en': 'Pixel Count', 'zh-CN': 'Pixel 数量' },
  'isp.pixelHint':      { 'zh-TW': '1 ~ 255', 'en': '1 ~ 255', 'zh-CN': '1 ~ 255' },
  'isp.frameHeader':    { 'zh-TW': 'Frame 結構', 'en': 'Frame Structure', 'zh-CN': 'Frame 结构' },
  'isp.bkBeforeBac':    { 'zh-TW': 'BAC 前 BK 數量', 'en': 'BK count before BAC', 'zh-CN': 'BAC 前 BK 数量' },
  'isp.bkBeforeHint':   { 'zh-TW': 'BAC 前插入的 BK 控制碼數量（0 ~ 20）', 'en': 'Number of BK control codes inserted before BAC (0 ~ 50)', 'zh-CN': 'BAC 前插入的 BK 控制码数量（0 ~ 20）' },
  'isp.bkAfterEol':     { 'zh-TW': 'EOL 後 BK 數量', 'en': 'BK count after EOL', 'zh-CN': 'EOL 后 BK 数量' },
  'isp.bkAfterHint':    { 'zh-TW': 'EOL 後插入的 BK 控制碼數量（0 ~ 20）', 'en': 'Number of BK control codes inserted after EOL (0 ~ 50)', 'zh-CN': 'EOL 后插入的 BK 控制码数量（0 ~ 20）' },
  'isp.regHeader':      { 'zh-TW': 'iSP REG Setting', 'en': 'iSP REG Setting', 'zh-CN': 'iSP REG Setting' },
  'isp.regEnable':      { 'zh-TW': '加入 Setting line', 'en': 'Add Setting line', 'zh-CN': '加入 Setting line' },
  'isp.regNo':          { 'zh-TW': '不加入', 'en': 'Disabled', 'zh-CN': '不加入' },
  'isp.regYes':         { 'zh-TW': '加入', 'en': 'Enable', 'zh-CN': '加入' },
  'isp.regEnableHint':  { 'zh-TW': '啟用後在 Data line 後接一條獨立 Setting line：BK · BAC · Setting · REG0 ~ REGn · EOL（依 datasheet 格式）', 'en': 'When enabled, append a separate Setting line after the data line: BK · BAC · Setting · REG0 ~ REGn · EOL (per datasheet)', 'zh-CN': '启用后在 Data line 后接一条独立 Setting line：BK · BAC · Setting · REG0 ~ REGn · EOL（依 datasheet 格式）' },
  'isp.regCount':       { 'zh-TW': 'REG 數量', 'en': 'REG Count', 'zh-CN': 'REG 数量' },
  'isp.regCountHint':   { 'zh-TW': 'REG 數量（8 ~ 56）', 'en': 'REG count (8 ~ 56)', 'zh-CN': 'REG 数量（8 ~ 56）' },
  'isp.regHexHint':     { 'zh-TW': '格式：2 位 16 進位（00 ~ FF，不需輸入 0x，可大小寫）', 'en': 'Format: 2 hex digits (00 ~ FF, no 0x prefix, case-insensitive)', 'zh-CN': '格式：2 位 16 进位（00 ~ FF，不需输入 0x，可大小写）' },
  'isp.copyAll':        { 'zh-TW': '複製至全部', 'en': 'Copy to All', 'zh-CN': '复制至全部' },
  'isp.polTogglePlus':  { 'zh-TW': '點擊切換 POL 極性（目前 POL+）', 'en': 'Click to toggle POL polarity (now POL+)', 'zh-CN': '点击切换 POL 极性（目前 POL+）' },
  'isp.polToggleMinus': { 'zh-TW': '點擊切換 POL 極性（目前 POL−）', 'en': 'Click to toggle POL polarity (now POL−)', 'zh-CN': '点击切换 POL 极性（目前 POL−）' },
  'isp.waveHeader':     { 'zh-TW': '差動訊號波形', 'en': 'Differential Waveform', 'zh-CN': '差动讯号波形' },
  'isp.infoFrame':      { 'zh-TW': 'Frame:', 'en': 'Frame:', 'zh-CN': 'Frame:' },
  'isp.infoBits':       { 'zh-TW': 'Bits:', 'en': 'Bits:', 'zh-CN': 'Bits:' },
  'isp.zoomH':          { 'zh-TW': 'H-Zoom', 'en': 'H-Zoom', 'zh-CN': 'H-Zoom' },
  'isp.btnFit':         { 'zh-TW': '還原', 'en': 'Reset', 'zh-CN': '还原' },
  'isp.btnFullscreen':  { 'zh-TW': '全螢幕', 'en': 'Fullscreen', 'zh-CN': '全屏' },
  'isp.waveHint':       { 'zh-TW': '黑底 0 / 綠線 1（D+ 高電位）· 控制碼段以不同顏色區塊標示 · 資料段以 RGB 原色標示 · 左右滑動平移 · 兩指縮放 · 點 POL 標籤可切換極性', 'en': 'Black = 0, Green = 1 (D+ high) · Control codes colored · Data in RGB · Swipe to pan · Pinch to zoom · Tap POL label to toggle polarity', 'zh-CN': '黑底 0 / 绿线 1（D+ 高电位）· 控制码段以不同颜色区块标示 · 资料段以 RGB 原色标示 · 左右滑动平移 · 两指缩放 · 点 POL 标签可切换极性' },
  'isp.legBK':          { 'zh-TW': 'BK', 'en': 'BK', 'zh-CN': 'BK' },
  'isp.legBAC':         { 'zh-TW': 'BAC', 'en': 'BAC', 'zh-CN': 'BAC' },
  'isp.legPOL':         { 'zh-TW': 'POL+', 'en': 'POL+', 'zh-CN': 'POL+' },
  'isp.legEOL':         { 'zh-TW': 'EOL', 'en': 'EOL', 'zh-CN': 'EOL' },
  'isp.legSET':         { 'zh-TW': 'Setting', 'en': 'Setting', 'zh-CN': 'Setting' },
  'isp.fsHint':         { 'zh-TW': '兩指橫向縮放（V 固定） / 左右滑動捲動 / 雙擊還原 / 右上關閉', 'en': 'Pinch to zoom H (V fixed) · Swipe to pan · Double-tap to reset · × to close', 'zh-CN': '两指横向缩放（V 固定） / 左右滑动滚动 / 双击还原 / 右上关闭' },
  'isp.overview':       { 'zh-TW': 'Overview · 點縮圖跳轉', 'en': 'Overview · Tap to jump', 'zh-CN': 'Overview · 点缩图跳转' },
  'isp.revHeader':      { 'zh-TW': '波形反推（8-bit）', 'en': 'Waveform Reverse Lookup (8-bit)', 'zh-CN': '波形反推（8-bit）' },
  'isp.revHint':        { 'zh-TW': '輸入示波器上看到的 9-bit 波形，即時反推可能的 Command 或 Data Level', 'en': 'Enter the 9-bit waveform observed on oscilloscope to reverse-lookup Command or Data Level', 'zh-CN': '输入示波器上看到的 9-bit 波形，即时反推可能的 Command 或 Data Level' },
  'isp.revSearchPh':    { 'zh-TW': '搜尋波形名稱：BK、BAC、BKPOL+、L0、L255…', 'en': 'Search waveform name: BK, BAC, BKPOL+, L0, L255…', 'zh-CN': '搜索波形名称：BK、BAC、BKPOL+、L0、L255…' },
  'isp.revSearchHint':  { 'zh-TW': '控制碼可輸入 BK / BAC / POL± / SET / EOL / BKPOL±；灰階資料以 L0～L255 輸入，DLL 與 PLL 兩種編碼分別列出。', 'en': 'Control codes: BK / BAC / POL± / SET / EOL / BKPOL±. Gray levels: enter L0–L255; DLL and PLL encodings are listed separately.', 'zh-CN': '控制码可输入 BK / BAC / POL± / SET / EOL / BKPOL±；灰阶数据以 L0～L255 输入，DLL 与 PLL 两种编码分别列出。' },
  'isp.revSearchClear': { 'zh-TW': '清除搜尋', 'en': 'Clear search', 'zh-CN': '清除搜索' },
  'isp.revSearchNone':  { 'zh-TW': '找不到符合的波形名稱', 'en': 'No matching waveform name', 'zh-CN': '找不到符合的波形名称' },
  'isp.revSearchMore':  { 'zh-TW': '另有 {n} 筆，請再輸入以縮小範圍', 'en': '{n} more — keep typing to narrow down', 'zh-CN': '另有 {n} 笔，请再输入以缩小范围' },
  'isp.revNote':        { 'zh-TW': 'Bit 順序為 LSB-first（b0 在最左，b8 在最右），與示波器上實際傳輸順序一致。Command 同時比對 DLL-BK 與 PLL-BK。', 'en': 'Bit order is LSB-first (b0 leftmost, b8 rightmost), matching actual transmission order on oscilloscope. Command matches both DLL-BK and PLL-BK.', 'zh-CN': 'Bit 顺序为 LSB-first（b0 在最左，b8 在最右），与示波器上实际传输顺序一致。Command 同时比对 DLL-BK 与 PLL-BK。' },

  /* ═══════════════════════════════════════════════════════════════════════
     i2c.* — I2C 讀寫測試（i2c.html），v1.24.0 新增
     ─────────────────────────────────────────────────────────────────────
     🔴 這一組的規矩（與 i2c.html 檔頭那三條是同一份）：
       · 句子**整句一個 key**，變數用 {name} 佔位。不准把句子切碎再用 + 接 ——
         三種語言語序不同，碎片拼接在英文與簡中一定排錯，而且不會有任何檢查叫。
       · 連**標點**也在這裡（pColon／pSemi／pComma／pParen／pWideSpace／pPeriod）：
         中文用全形，英文要用半形加空格。少了這一層，英文介面會出現
         「Read 256 byte（1.2 s）」這種半中半英的句子。
       · zh-CN **不是繁轉簡**：檔案／程式／資料／預設 → 文件／程序／数据／默认。
     ═══════════════════════════════════════════════════════════════════════ */

  /* ── 標點與黏著劑 ───────────────────────────────────────────────────── */
  'i2c.pColon':         { 'zh-TW': '：', 'en': ': ', 'zh-CN': '：' },
  'i2c.pSemi':          { 'zh-TW': '；', 'en': '; ', 'zh-CN': '；' },
  'i2c.pComma':         { 'zh-TW': '、', 'en': ', ', 'zh-CN': '、' },
  'i2c.pPeriod':        { 'zh-TW': '。', 'en': '.', 'zh-CN': '。' },
  'i2c.pParen':         { 'zh-TW': '（{x}）', 'en': ' ({x})', 'zh-CN': '（{x}）' },
  'i2c.pWideSpace':     { 'zh-TW': '　', 'en': '   ', 'zh-CN': '　' },

  /* ── 頁首 ──────────────────────────────────────────────────────────── */
  'i2c.title':          { 'zh-TW': 'I2C 讀寫測試', 'en': 'I2C Read / Write Test', 'zh-CN': 'I2C 读写测试' },
  'i2c.subtitle':       { 'zh-TW': '透過本機 I2C Bridge 讀寫任意 slave 與 offset，以 16×16 表格檢視與比對', 'en': 'Read and write any slave and offset through the local I2C Bridge; view and compare in a 16×16 table', 'zh-CN': '通过本机 I2C Bridge 读写任意 slave 与 offset，以 16×16 表格查看与比对' },

  /* ── 連線卡 ────────────────────────────────────────────────────────── */
  'i2c.hdConn':         { 'zh-TW': '本機 I2C Bridge 連線', 'en': 'Local I2C Bridge connection', 'zh-CN': '本机 I2C Bridge 连接' },
  'i2c.connect':        { 'zh-TW': '連線', 'en': 'Connect', 'zh-CN': '连接' },
  'i2c.stNotLinked':    { 'zh-TW': '未連線', 'en': 'Not connected', 'zh-CN': '未连接' },
  'i2c.stLinked':       { 'zh-TW': '已連線', 'en': 'Connected', 'zh-CN': '已连接' },
  'i2c.stConnecting':   { 'zh-TW': '連線中…', 'en': 'Connecting…', 'zh-CN': '连接中…' },
  'i2c.stNoWs':         { 'zh-TW': '無法建立 WebSocket', 'en': 'Cannot open WebSocket', 'zh-CN': '无法建立 WebSocket' },
  'i2c.stDropped':      { 'zh-TW': 'I2C Bridge 連線中斷', 'en': 'I2C Bridge connection lost', 'zh-CN': 'I2C Bridge 连接中断' },
  'i2c.stNoBridge':     { 'zh-TW': '連不到 I2C Bridge', 'en': 'Cannot reach I2C Bridge', 'zh-CN': '连不到 I2C Bridge' },
  'i2c.stDgMeasuring':  { 'zh-TW': 'DG 正在量測中', 'en': 'DG measurement in progress', 'zh-CN': 'DG 正在测量中' },
  'i2c.stOtherPage':    { 'zh-TW': 'I2C 在另一個頁面', 'en': 'I2C is held by another page', 'zh-CN': 'I2C 在另一个页面' },
  'i2c.stLinkedOwn':    { 'zh-TW': '已連線（本頁持有 I2C）', 'en': 'Connected (this page holds I2C)', 'zh-CN': '已连接（本页持有 I2C）' },
  'i2c.stConnFail':     { 'zh-TW': '連線失敗', 'en': 'Connection failed', 'zh-CN': '连接失败' },
  'i2c.stDisconnected': { 'zh-TW': '已中斷（其他程式現在可以使用治具）', 'en': 'Disconnected (other programs can use the adapter now)', 'zh-CN': '已断开（其他程序现在可以使用工装）' },
  'i2c.stReleased':     { 'zh-TW': '已釋放 I2C（連線仍在）', 'en': 'I2C released (connection still open)', 'zh-CN': '已释放 I2C（连接仍在）' },
  'i2c.tipLinkOn':      { 'zh-TW': '按一下連線到本機 I2C Bridge', 'en': 'Click to connect to the local I2C Bridge', 'zh-CN': '点一下连接到本机 I2C Bridge' },
  'i2c.tipLinkOff':     { 'zh-TW': '按一下中斷：關閉與 I2C Bridge 的整條連線（同時也會釋放 I2C，其他程式就能使用治具）', 'en': 'Click to disconnect: closes the whole I2C Bridge connection (also releases I2C so other programs can use the adapter)', 'zh-CN': '点一下断开：关闭与 I2C Bridge 的整条连接（同时也会释放 I2C，其他程序就能使用工装）' },
  'i2c.btnRelease':     { 'zh-TW': '釋放 I2C', 'en': 'Release I2C', 'zh-CN': '释放 I2C' },
  'i2c.tipRelease':     { 'zh-TW': '把 I2C 治具交回去，但保持與 I2C Bridge 的連線（要回去用別的工具時按這個）', 'en': 'Hand the I2C adapter back but keep the I2C Bridge connection (use this when switching to another tool)', 'zh-CN': '把 I2C 工装交回去，但保持与 I2C Bridge 的连接（要回去用别的工具时按这个）' },
  'i2c.btnTakeover':    { 'zh-TW': '接手 I2C', 'en': 'Take over I2C', 'zh-CN': '接管 I2C' },
  'i2c.tipTakeover':    { 'zh-TW': '把 I2C 治具從另一個頁面搶過來（那一頁會被斷線）', 'en': 'Take the I2C adapter from the other page (that page will be disconnected)', 'zh-CN': '把 I2C 工装从另一个页面抢过来（那一页会被断开）' },
  'i2c.btnSelfTest':    { 'zh-TW': '自檢（黃金向量）', 'en': 'Self-test (golden vector)', 'zh-CN': '自检（黄金向量）' },
  'i2c.tipSelfTest':    { 'zh-TW': 'slave 0x68 / offset 寬度 2 / 0x0000 讀 3 byte，期望 A1 D8 FB', 'en': 'slave 0x68 / offset width 2 / read 3 bytes at 0x0000, expecting A1 D8 FB', 'zh-CN': 'slave 0x68 / offset 宽度 2 / 0x0000 读 3 byte，期望 A1 D8 FB' },
  'i2c.chkFastRead':    { 'zh-TW': 'fast read（實驗，預設關）', 'en': 'fast read (experimental, off by default)', 'zh-CN': 'fast read（实验，默认关）' },
  'i2c.chkRawMpsse':    { 'zh-TW': '快速模式（自建，對照用）', 'en': 'Fast mode (self-built, for comparison)', 'zh-CN': '快速模式（自建，对照用）' },
  'i2c.chk3Phase':      { 'zh-TW': '三相時脈', 'en': '3-phase clocking', 'zh-CN': '三相时钟' },
  'i2c.ckDelay':        { 'zh-TW': '間隔', 'en': 'Delay', 'zh-CN': '间隔' },
  'i2c.btnCmpPath':     { 'zh-TW': '快慢路徑比對', 'en': 'Compare fast vs. normal path', 'zh-CN': '快慢路径比对' },
  'i2c.lblClock':       { 'zh-TW': 'I2C 時脈（kHz）', 'en': 'I2C clock (kHz)', 'zh-CN': 'I2C 时钟（kHz）' },
  'i2c.ariaClockPreset':{ 'zh-TW': '常用時脈', 'en': 'Common clock rates', 'zh-CN': '常用时钟' },
  'i2c.optCustom':      { 'zh-TW': '自訂', 'en': 'Custom', 'zh-CN': '自定义' },
  'i2c.lnaAsk':         { 'zh-TW': '瀏覽器要你允許存取本機網路，請按「允許」。', 'en': 'The browser is asking for permission to reach the local network — please click "Allow".', 'zh-CN': '浏览器要你允许访问本地网络，请点“允许”。' },
  'i2c.btnRetry':       { 'zh-TW': '重試', 'en': 'Retry', 'zh-CN': '重试' },
  'i2c.noBridge':       { 'zh-TW': '連不到 I2C Bridge', 'en': 'Cannot reach I2C Bridge', 'zh-CN': '连不到 I2C Bridge' },
  /* v1.24.2：同一支程式／搶用權（行為本身沒有改，只是寫出來） */
  'i2c.dlShared':       { 'zh-TW': '「TCON 自檢畫面量測」用的是<b>同一支程式</b>，兩邊只要下載一次。',
                          'en': 'The TCON self-test measurement page uses <b>the same program</b> — one download covers both.',
                          'zh-CN': '「TCON 自检画面量测」用的是<b>同一支程序</b>，两边只要下载一次。' },
  'i2c.ownerNote':      { 'zh-TW': 'I2C Bridge 一次只給一個分頁用：切到哪一頁就由哪一頁接手，被接手的那一頁會顯示未連線；<b>正在量測的那一頁不會被接手</b>。',
                          'en': 'Only one tab holds the I2C Bridge at a time: whichever tab you switch to takes it over, and the one that loses it shows as disconnected. <b>A tab that is measuring will not be taken over.</b>',
                          'zh-CN': 'I2C Bridge 一次只给一个分页用：切到哪一页就由哪一页接手，被接手的那一页会显示未连线；<b>正在量测的那一页不会被接手</b>。' },
  'i2c.dbgNeedOpen':    { 'zh-TW': '（需 ≥ ', 'en': ' (needs ≥ ', 'zh-CN': '（需 ≥ ' },
  'i2c.dbgNeedClose':   { 'zh-TW': '） · 包 ', 'en': ') · package ', 'zh-CN': '） · 包 ' },

  /* ── 讀／寫參數卡 ──────────────────────────────────────────────────── */
  'i2c.hdRw':           { 'zh-TW': '讀 / 寫（共用同一組參數）', 'en': 'Read / Write (shared parameters)', 'zh-CN': '读 / 写（共用同一组参数）' },
  'i2c.grpSlave':       { 'zh-TW': '① Slave 位址', 'en': '① Slave address', 'zh-CN': '① Slave 地址' },
  'i2c.lbl7bit':        { 'zh-TW': '7-bit（實際送出）', 'en': '7-bit (actually sent)', 'zh-CN': '7-bit（实际发出）' },
  'i2c.lbl8bitW':       { 'zh-TW': '8-bit write', 'en': '8-bit write', 'zh-CN': '8-bit write' },
  'i2c.lbl8bitR':       { 'zh-TW': '8-bit read', 'en': '8-bit read', 'zh-CN': '8-bit read' },
  'i2c.ariaSlavePreset':{ 'zh-TW': '常用 slave 位址', 'en': 'Common slave addresses', 'zh-CN': '常用 slave 地址' },
  'i2c.grpOffset':      { 'zh-TW': '② Offset', 'en': '② Offset', 'zh-CN': '② Offset' },
  'i2c.lblAwid':        { 'zh-TW': '寬度（byte）', 'en': 'Width (bytes)', 'zh-CN': '宽度（byte）' },
  'i2c.ariaAwidPreset': { 'zh-TW': '常用 offset 寬度', 'en': 'Common offset widths', 'zh-CN': '常用 offset 宽度' },
  'i2c.lblOffset':      { 'zh-TW': '起始 offset', 'en': 'Start offset', 'zh-CN': '起始 offset' },
  'i2c.lblOffsetVal':   { 'zh-TW': '寫入值（1 byte）', 'en': 'Value to write (1 byte)', 'zh-CN': '写入值（1 byte）' },
  'i2c.grpLen':         { 'zh-TW': '③ 總 byte 數', 'en': '③ Total bytes', 'zh-CN': '③ 总 byte 数' },
  'i2c.ariaLenPreset':  { 'zh-TW': '常用長度', 'en': 'Common lengths', 'zh-CN': '常用长度' },
  'i2c.lblWrData':      { 'zh-TW': '寫入資料', 'en': 'Data to write', 'zh-CN': '写入数据' },
  'i2c.lblPage':        { 'zh-TW': 'Page 大小', 'en': 'Page size', 'zh-CN': 'Page 大小' },
  'i2c.pageNone':       { 'zh-TW': '不分段', 'en': 'No paging', 'zh-CN': '不分段' },
  'i2c.lblGap':         { 'zh-TW': '目標段間距', 'en': 'Target segment gap', 'zh-CN': '目标段间距' },
  'i2c.btnLoad':        { 'zh-TW': '載入檔案', 'en': 'Load file', 'zh-CN': '载入文件' },
  'i2c.grpDevice':      { 'zh-TW': '④ 對裝置', 'en': '④ To device', 'zh-CN': '④ 对设备' },
  'i2c.btnRead':        { 'zh-TW': '讀取', 'en': 'Read', 'zh-CN': '读取' },
  'i2c.btnWrite':       { 'zh-TW': '寫入', 'en': 'Write', 'zh-CN': '写入' },
  'i2c.tipAbSel':       { 'zh-TW': '要寫入／顯示哪一份', 'en': 'Which copy to write / show', 'zh-CN': '要写入／显示哪一份' },
  'i2c.btnWriteSel':    { 'zh-TW': '寫入 選取的 {n} byte', 'en': 'Write {n} selected bytes', 'zh-CN': '写入 选取的 {n} byte' },
  'i2c.btnWriteSelSegs':{ 'zh-TW': '寫入 選取的 {n} byte · {segs} 段', 'en': 'Write {n} selected bytes · {segs} segments', 'zh-CN': '写入 选取的 {n} byte · {segs} 段' },
  'i2c.btnWriteSide':   { 'zh-TW': '寫入 {side} · {n} byte', 'en': 'Write {side} · {n} bytes', 'zh-CN': '写入 {side} · {n} byte' },
  'i2c.sideCurrent':    { 'zh-TW': '目前內容', 'en': 'current contents', 'zh-CN': '当前内容' },
  'i2c.sideRef':        { 'zh-TW': '基準', 'en': 'reference', 'zh-CN': '基准' },

  /* ── dump 卡與側欄 ─────────────────────────────────────────────────── */
  'i2c.btnSnap':        { 'zh-TW': '快照 A', 'en': 'Snapshot A', 'zh-CN': '快照 A' },
  'i2c.tipSnap':        { 'zh-TW': '把目前內容存成 A 當比較基準；B 會被清空、差異清單歸零', 'en': 'Store the current contents as A for comparison; B is cleared and the diff list is reset', 'zh-CN': '把当前内容存成 A 当比较基准；B 会被清空、差异列表归零' },
  'i2c.btnSave':        { 'zh-TW': '另存新檔', 'en': 'Save as', 'zh-CN': '另存为' },
  'i2c.btnClear':       { 'zh-TW': '清空', 'en': 'Clear', 'zh-CN': '清空' },
  'i2c.btnClearList':   { 'zh-TW': '清除', 'en': 'Clear', 'zh-CN': '清除' },
  'i2c.btnCopy':        { 'zh-TW': '複製', 'en': 'Copy', 'zh-CN': '复制' },
  'i2c.btnAbort':       { 'zh-TW': '中止', 'en': 'Abort', 'zh-CN': '中止' },
  'i2c.spSel':          { 'zh-TW': '選取', 'en': 'Selection', 'zh-CN': '选取' },
  'i2c.selHelpCtrl':    { 'zh-TW': '按下 Ctrl ＋ 滑鼠：可跳著選擇要寫入的儲存格', 'en': 'Ctrl + click: pick non-adjacent cells to write', 'zh-CN': '按下 Ctrl ＋ 鼠标：可跳着选择要写入的单元格' },
  'i2c.selHelpShift':   { 'zh-TW': '按下 Shift ＋ 滑鼠，或 Shift ＋ 上下左右方向鍵：可連續選取並寫入儲存格', 'en': 'Shift + click, or Shift + arrow keys: select a continuous range of cells to write', 'zh-CN': '按下 Shift ＋ 鼠标，或 Shift ＋ 上下左右方向键：可连续选取并写入单元格' },
  'i2c.spFind':         { 'zh-TW': '搜尋', 'en': 'Search', 'zh-CN': '搜索' },
  'i2c.findAll':        { 'zh-TW': '全部範圍', 'en': 'Whole range', 'zh-CN': '全部范围' },
  'i2c.findPage':       { 'zh-TW': '本頁', 'en': 'This page', 'zh-CN': '本页' },
  'i2c.findNone':       { 'zh-TW': '找不到', 'en': 'Not found', 'zh-CN': '找不到' },
  'i2c.findBad':        { 'zh-TW': '看不懂：{why}', 'en': 'Cannot parse: {why}', 'zh-CN': '看不懂：{why}' },
  'i2c.spBits':         { 'zh-TW': '位元', 'en': 'Bits', 'zh-CN': '位' },
  'i2c.bitNone':        { 'zh-TW': '（點任一格後顯示）', 'en': '(shown after you click a cell)', 'zh-CN': '（点任一格后显示）' },
  'i2c.spLegend':       { 'zh-TW': '顏色說明', 'en': 'Colour legend', 'zh-CN': '颜色说明' },
  'i2c.lgNone':         { 'zh-TW': '未讀取', 'en': 'Not read', 'zh-CN': '未读取' },
  'i2c.lgHas':          { 'zh-TW': '已讀到的值', 'en': 'Value read back', 'zh-CN': '已读到的值' },
  'i2c.lgDiff':         { 'zh-TW': '與快照不同', 'en': 'Differs from snapshot', 'zh-CN': '与快照不同' },
  'i2c.lgWrFail':       { 'zh-TW': '寫入與回讀不一致', 'en': 'Write and read-back differ', 'zh-CN': '写入与回读不一致' },
  'i2c.lgWrOk':         { 'zh-TW': '回讀相符', 'en': 'Read-back matches', 'zh-CN': '回读相符' },
  'i2c.lgSel':          { 'zh-TW': '選取範圍', 'en': 'Selected range', 'zh-CN': '选取范围' },
  'i2c.lgXh':           { 'zh-TW': '十字同列同欄', 'en': 'Crosshair row / column', 'zh-CN': '十字同行同列' },
  'i2c.lgXc':           { 'zh-TW': '十字中心', 'en': 'Crosshair centre', 'zh-CN': '十字中心' },
  'i2c.lgEdit':         { 'zh-TW': '編輯中', 'en': 'Being edited', 'zh-CN': '编辑中' },
  'i2c.jumpPh':         { 'zh-TW': '跳到', 'en': 'Go to', 'zh-CN': '跳到' },
  'i2c.jumpTip':        { 'zh-TW': '位址：純數字當十六進位；十進位加 d（如 80d）或 # 前綴（如 #80）', 'en': 'Address: plain digits are hex; add d (e.g. 80d) or prefix # (e.g. #80) for decimal', 'zh-CN': '地址：纯数字当十六进制；十进制加 d（如 80d）或 # 前缀（如 #80）' },
  'i2c.tipSlotA':       { 'zh-TW': '快照值 A（點一下換成主值）', 'en': 'Snapshot value A (click to make it the main value)', 'zh-CN': '快照值 A（点一下换成主值）' },
  'i2c.tipSlotB':       { 'zh-TW': '改變後的值 B（點一下換回來）', 'en': 'Changed value B (click to switch back)', 'zh-CN': '改变后的值 B（点一下换回来）' },
  'i2c.hdTiming':       { 'zh-TW': '耗時紀錄', 'en': 'Timing log', 'zh-CN': '耗时记录' },
  'i2c.timeNone':       { 'zh-TW': '（還沒有讀寫紀錄）', 'en': '(no read/write records yet)', 'zh-CN': '（还没有读写记录）' },
  'i2c.hdDiff':         { 'zh-TW': '差異', 'en': 'Differences', 'zh-CN': '差异' },
  'i2c.btnRecmp':       { 'zh-TW': '重新比較', 'en': 'Compare again', 'zh-CN': '重新比较' },
  'i2c.colAddr':        { 'zh-TW': '位址', 'en': 'Address', 'zh-CN': '地址' },
  'i2c.diffHint':       { 'zh-TW': '點一列 → 跳到 dump 的對應位址（同時畫十字、左上角顯示該位址）。改值請在 dump 上做。', 'en': 'Click a row to jump to that address in the dump (draws the crosshair and shows the address top-left). Edit values in the dump itself.', 'zh-CN': '点一行 → 跳到 dump 的对应地址（同时画十字、左上角显示该地址）。改值请在 dump 上做。' },

  /* ── I2C Bridge 卡與說明視窗 ───────────────────────────────────────── */
  'i2c.hdHelperCard':   { 'zh-TW': 'I2C Bridge 資訊與疑難排解', 'en': 'I2C Bridge info & troubleshooting', 'zh-CN': 'I2C Bridge 信息与疑难排解' },
  'i2c.btnShowDl':      { 'zh-TW': '顯示下載鈕', 'en': 'Show download button', 'zh-CN': '显示下载按钮' },
  'i2c.installLine':    { 'zh-TW': '下載 → 整包解壓到一個資料夾 → 雙擊 <code class="mono">i2c-bridge.exe</code>。', 'en': 'Download, unzip everything into one folder, then double-click <code class="mono">i2c-bridge.exe</code>.', 'zh-CN': '下载 → 整包解压到一个文件夹 → 双击 <code class="mono">i2c-bridge.exe</code>。' },
  'i2c.tsTitle':        { 'zh-TW': '跑不起來 / 連不上？', 'en': 'Will not start / cannot connect?', 'zh-CN': '跑不起来 / 连不上？' },
  'i2c.tsBody': {
    'zh-TW': 'I2C Bridge 黑視窗最後一行是一個大寫字母，<b>G</b> ＝ 正常。不是 G 就把整份 <code class="mono">i2c-bridge.log</code> 給我，字母的意思我這邊查。<br>四個檔要在同一個資料夾：<code class="mono">i2c-bridge.exe</code>、<code class="mono">libMPSSE.dll</code>、<code class="mono">ftd2xx.dll</code>、<code class="mono">DLL_I2C_BCB.dll</code>。<br>exe 內容一變 SHA 就變，Windows 會再擋一次。<br>同一時間只有一個頁面握著 I2C：切到哪一頁哪一頁就自動接手，不必按任何東西；對方正在量測時不會被搶走。要把治具交回去給別的工具就按「釋放 I2C」。<br>瀏覽器沒有別條路可以碰 FTDI 治具（驅動層綁定，不是誰先佔用），所以一定要這支 exe。',
    'en': 'The last line in the I2C Bridge console window is a single capital letter; <b>G</b> means everything is fine. If it is not G, send me the whole <code class="mono">i2c-bridge.log</code> and I will look up what the letter means.<br>All four files must sit in the same folder: <code class="mono">i2c-bridge.exe</code>, <code class="mono">libMPSSE.dll</code>, <code class="mono">ftd2xx.dll</code>, <code class="mono">DLL_I2C_BCB.dll</code>.<br>Any change to the exe changes its SHA, so Windows will block it once again.<br>Only one page holds I2C at a time: whichever page you switch to takes over automatically, no button needed, except while the other page is measuring, when it will not be taken away. To hand the adapter back to another tool, press "Release I2C".<br>The browser has no other way to reach the FTDI adapter (it is bound at the driver level, not first-come-first-served), so this exe is required.',
    'zh-CN': 'I2C Bridge 黑窗口最后一行是一个大写字母，<b>G</b> ＝ 正常。不是 G 就把整份 <code class="mono">i2c-bridge.log</code> 给我，字母的意思我这边查。<br>四个文件要在同一个文件夹：<code class="mono">i2c-bridge.exe</code>、<code class="mono">libMPSSE.dll</code>、<code class="mono">ftd2xx.dll</code>、<code class="mono">DLL_I2C_BCB.dll</code>。<br>exe 内容一变 SHA 就变，Windows 会再拦一次。<br>同一时间只有一个页面握着 I2C：切到哪一页哪一页就自动接管，不必按任何东西；对方正在测量时不会被抢走。要把工装交回去给别的工具就按“释放 I2C”。<br>浏览器没有别的路可以碰 FTDI 工装（驱动层绑定，不是谁先占用），所以一定要这支 exe。'
  },
  'i2c.hdLog':          { 'zh-TW': '操作紀錄', 'en': 'Activity log', 'zh-CN': '操作记录' },
  'i2c.logHint':        { 'zh-TW': '每一筆讀寫都完整記錄（slave／offset 寬度／位址／byte）。寫入同時也寫進 I2C Bridge 的 <span class="mono">i2c-bridge.log</span>。', 'en': 'Every read and write is logged in full (slave / offset width / address / bytes). Writes are also recorded in the I2C Bridge log file <span class="mono">i2c-bridge.log</span>.', 'zh-CN': '每一笔读写都完整记录（slave／offset 宽度／地址／byte）。写入同时也写进 I2C Bridge 的 <span class="mono">i2c-bridge.log</span>。' },
  'i2c.eeTitle':        { 'zh-TW': '要寫入 EEPROM，先確認型號', 'en': 'Confirm the EEPROM part before writing', 'zh-CN': '要写入 EEPROM，先确认型号' },
  'i2c.eeOk':           { 'zh-TW': '確認寫入', 'en': 'Confirm write', 'zh-CN': '确认写入' },
  'i2c.btnCancel':      { 'zh-TW': '取消', 'en': 'Cancel', 'zh-CN': '取消' },
  'i2c.eeTooSmall':     { 'zh-TW': '　容量不足', 'en': '   too small', 'zh-CN': '　容量不足' },
  'i2c.abPickTitle':    { 'zh-TW': 'A 與 B 都有內容，這個檔案要放哪一邊？', 'en': 'A and B are both in use — which side should this file go to?', 'zh-CN': 'A 与 B 都有内容，这个文件要放哪一边？' },
  'i2c.abReplaceB':     { 'zh-TW': '取代 B', 'en': 'Replace B', 'zh-CN': '替换 B' },
  'i2c.abReplaceAKeepB':{ 'zh-TW': '取代 A，保留 B', 'en': 'Replace A, keep B', 'zh-CN': '替换 A，保留 B' },
  'i2c.abReplaceAClearB':{ 'zh-TW': '取代 A，清空 B', 'en': 'Replace A, clear B', 'zh-CN': '替换 A，清空 B' },
  'i2c.abWhyNoB':       { 'zh-TW': '「取代 B」停用：長度與 A（{n} byte）不同，兩邊無法逐 byte 比對。<br>', 'en': '"Replace B" is disabled: the length differs from A ({n} bytes), so the two cannot be compared byte by byte.<br>', 'zh-CN': '“替换 B”停用：长度与 A（{n} byte）不同，两边无法逐 byte 比对。<br>' },
  'i2c.abWhyNoKeep':    { 'zh-TW': '「取代 A，保留 B」停用：長度與 B（{n} byte）不同，留著也比不了。', 'en': '"Replace A, keep B" is disabled: the length differs from B ({n} bytes), so keeping it would not allow a comparison.', 'zh-CN': '“替换 A，保留 B”停用：长度与 B（{n} byte）不同，留着也比不了。' },
  'i2c.howtoTitle':     { 'zh-TW': '下載好了，接著這樣做', 'en': 'Downloaded — here is what to do next', 'zh-CN': '下载好了，接着这样做' },
  'i2c.howto1':         { 'zh-TW': '把整包<b>解壓縮</b>到一個資料夾', 'en': '<b>Unzip</b> the whole package into one folder', 'zh-CN': '把整包<b>解压</b>到一个文件夹' },
  'i2c.howto2':         { 'zh-TW': '雙擊 <code class="mono">i2c-bridge.exe</code>', 'en': 'Double-click <code class="mono">i2c-bridge.exe</code>', 'zh-CN': '双击 <code class="mono">i2c-bridge.exe</code>' },
  'i2c.howto3':         { 'zh-TW': '回到這一頁按<b>「連線」</b>', 'en': 'Come back to this page and press <b>"Connect"</b>', 'zh-CN': '回到这一页按<b>“连接”</b>' },
  'i2c.gotIt':          { 'zh-TW': '知道了', 'en': 'Got it', 'zh-CN': '知道了' },

  /* ── 單位、共用片語、來源標籤 ──────────────────────────────────────── */
  'i2c.unitSec':        { 'zh-TW': '秒', 'en': 's', 'zh-CN': '秒' },
  'i2c.decNote':        { 'zh-TW': '十進位 +d', 'en': 'dec: add d', 'zh-CN': '十进制 +d' },
  /* 🔴 en 用縮寫：這一行印在 `#lenhint` 那個 168px 的固定寬欄位裡，
     完整拼字在實測截圖上會被切掉（「1 transfer」只剩「1 transfer…」）。 */
  'i2c.decOnly':        { 'zh-TW': '十進位', 'en': 'dec', 'zh-CN': '十进制' },
  'i2c.noAddr':         { 'zh-TW': '無位址', 'en': 'no address', 'zh-CN': '无地址' },
  'i2c.noAddrParen':    { 'zh-TW': '(無位址)', 'en': '(no address)', 'zh-CN': '(无地址)' },
  'i2c.emptyParen':     { 'zh-TW': '(空)', 'en': '(empty)', 'zh-CN': '(空)' },
  'i2c.parseEmpty':     { 'zh-TW': '空', 'en': 'empty', 'zh-CN': '空' },
  'i2c.parseBad':       { 'zh-TW': '看不懂', 'en': 'cannot parse', 'zh-CN': '看不懂' },
  'i2c.hexEg':          { 'zh-TW': '例：{eg}', 'en': 'e.g. {eg}', 'zh-CN': '例：{eg}' },
  'i2c.egSep':          { 'zh-TW': ' ／ ', 'en': ' / ', 'zh-CN': ' ／ ' },
  'i2c.on':             { 'zh-TW': '開', 'en': 'on', 'zh-CN': '开' },
  'i2c.offDefault':     { 'zh-TW': '關（預設）', 'en': 'off (default)', 'zh-CN': '关（默认）' },
  'i2c.offDefaultVendor':{ 'zh-TW': '關（預設走 DLL_I2C_BCB.dll）', 'en': 'off (defaults to DLL_I2C_BCB.dll)', 'zh-CN': '关（默认走 DLL_I2C_BCB.dll）' },
  'i2c.onExperimental': { 'zh-TW': '開（實驗，實機上曾讀錯）', 'en': 'on (experimental; has read wrong data on real hardware)', 'zh-CN': '开（实验，实机上曾读错）' },
  'i2c.needReconnect':  { 'zh-TW': '　※ 要重新連線才生效', 'en': '   (takes effect after reconnecting)', 'zh-CN': '　※ 要重新连接才生效' },
  'i2c.dbgOn':          { 'zh-TW': 'ON（診斷控制項已顯示）', 'en': 'ON (diagnostic controls shown)', 'zh-CN': 'ON（诊断控件已显示）' },

  'i2c.setNone':        { 'zh-TW': '（尚未建立）', 'en': '(not created yet)', 'zh-CN': '（尚未建立）' },
  'i2c.setFile':        { 'zh-TW': '檔案 {name} · {n} byte', 'en': 'File {name} · {n} bytes', 'zh-CN': '文件 {name} · {n} byte' },
  'i2c.setDev':         { 'zh-TW': 'slave 0x{slave} · {off} · {n} byte', 'en': 'slave 0x{slave} · {off} · {n} bytes', 'zh-CN': 'slave 0x{slave} · {off} · {n} byte' },
  'i2c.srcRead':        { 'zh-TW': '讀取', 'en': 'Read', 'zh-CN': '读取' },
  'i2c.srcReadFull':    { 'zh-TW': '讀取 slave 0x{slave} · {at}{w}', 'en': 'Read slave 0x{slave} · {at}{w}', 'zh-CN': '读取 slave 0x{slave} · {at}{w}' },
  'i2c.srcFromAddr':    { 'zh-TW': '{addr} 起', 'en': 'from {addr}', 'zh-CN': '{addr} 起' },
  'i2c.srcWidth':       { 'zh-TW': ' · 寬度 {w}B', 'en': ' · width {w}B', 'zh-CN': ' · 宽度 {w}B' },
  'i2c.srcAMod':        { 'zh-TW': 'A 的修改', 'en': 'Edited copy of A', 'zh-CN': 'A 的修改' },
  'i2c.srcEdited':      { 'zh-TW': '{base}（已修改）', 'en': '{base} (edited)', 'zh-CN': '{base}（已修改）' },
  'i2c.srcOneByte':     { 'zh-TW': '③ 的 1 byte（無位址相位）', 'en': 'the single byte in ③ (no address phase)', 'zh-CN': '③ 的 1 byte（无地址相位）' },
  'i2c.srcTyped':       { 'zh-TW': '手動輸入', 'en': 'Typed in', 'zh-CN': '手动输入' },
  'i2c.srcSide':        { 'zh-TW': '{side}：{what}', 'en': '{side}: {what}', 'zh-CN': '{side}：{what}' },
  'i2c.srcSel':         { 'zh-TW': '選取的 {n} byte', 'en': '{n} selected bytes', 'zh-CN': '选取的 {n} byte' },
  'i2c.srcSelSegs':     { 'zh-TW': '選取的 {n} byte（{segs} 段）', 'en': '{n} selected bytes ({segs} segments)', 'zh-CN': '选取的 {n} byte（{segs} 段）' },
  'i2c.opRead':         { 'zh-TW': '讀取', 'en': 'Read', 'zh-CN': '读取' },
  'i2c.opWrite':        { 'zh-TW': '寫入', 'en': 'Write', 'zh-CN': '写入' },
  'i2c.kindRead':       { 'zh-TW': '讀', 'en': 'R', 'zh-CN': '读' },
  'i2c.kindWrite':      { 'zh-TW': '寫', 'en': 'W', 'zh-CN': '写' },
  'i2c.kindCmp':        { 'zh-TW': '比對', 'en': 'Cmp', 'zh-CN': '比对' },
  'i2c.pathFast':       { 'zh-TW': '快速模式', 'en': 'Fast mode', 'zh-CN': '快速模式' },
  'i2c.pathNormal':     { 'zh-TW': '一般模式', 'en': 'Normal mode', 'zh-CN': '普通模式' },
  'i2c.detailVendor':   { 'zh-TW': 'DLL_I2C_BCB', 'en': 'DLL_I2C_BCB', 'zh-CN': 'DLL_I2C_BCB' },
  'i2c.detailBuilt':    { 'zh-TW': '自建', 'en': 'self-built', 'zh-CN': '自建' },
  'i2c.detailOfficial': { 'zh-TW': '官方快速', 'en': 'vendor fast', 'zh-CN': '官方快速' },
  'i2c.detailPerByte':  { 'zh-TW': '逐 byte', 'en': 'byte by byte', 'zh-CN': '逐 byte' },
  'i2c.detailUnknown':  { 'zh-TW': '未知', 'en': 'unknown', 'zh-CN': '未知' },
  'i2c.spdFast':        { 'zh-TW': '快速', 'en': 'Fast', 'zh-CN': '快速' },
  'i2c.spdMid':         { 'zh-TW': '中速', 'en': 'Medium', 'zh-CN': '中速' },
  'i2c.spdNormal':      { 'zh-TW': '一般', 'en': 'Normal', 'zh-CN': '普通' },

  /* ── 時脈、分段、提示小字 ──────────────────────────────────────────── */
  'i2c.errClkInt':      { 'zh-TW': '時脈要是 1 kHz 以上的整數', 'en': 'The clock must be an integer of at least 1 kHz', 'zh-CN': '时钟要是 1 kHz 以上的整数' },
  'i2c.errClkDiv':      { 'zh-TW': '分頻值算出來是 {div}，超出 0–65535（{khz} kHz 這個值在 12 MHz / 2(div+1) 的公式下不存在）', 'en': 'The divisor works out to {div}, outside 0–65535 ({khz} kHz does not exist under the 12 MHz / 2(div+1) formula)', 'zh-CN': '分频值算出来是 {div}，超出 0–65535（{khz} kHz 这个值在 12 MHz / 2(div+1) 的公式下不存在）' },
  'i2c.clkActual':      { 'zh-TW': '實際 {khz} kHz · div {div}', 'en': 'actual {khz} kHz · div {div}', 'zh-CN': '实际 {khz} kHz · div {div}' },
  'i2c.clkActualOff':   { 'zh-TW': '🔴 實際 {khz} kHz（div {div}）', 'en': '🔴 actual {khz} kHz (div {div})', 'zh-CN': '🔴 实际 {khz} kHz（div {div}）' },
  /* 🔴 en 縮短：這一行印在「目標段間距」那個 118px 的欄位下面。 */
  'i2c.gapUnit':        { 'zh-TW': 'ms · 匯流排上的段間距', 'en': 'ms · bus gap', 'zh-CN': 'ms · 总线上的段间距' },
  'i2c.gapTooSmall':    { 'zh-TW': '🔴 低於 24C32/64 的 tWR 規格（5 ms）：那一頁可能靜默寫不進去', 'en': '🔴 below the tWR spec of 24C32/64 (5 ms): that page may silently fail to program', 'zh-CN': '🔴 低于 24C32/64 的 tWR 规格（5 ms）：那一页可能静默写不进去' },
  'i2c.gapOkNote':      { 'zh-TW': '24C32/64（5 ms）夠；舊款 AT24C32 要 10 ms', 'en': 'enough for 24C32/64 (5 ms); older AT24C32 needs 10 ms', 'zh-CN': '24C32/64（5 ms）够；旧款 AT24C32 要 10 ms' },
  'i2c.whySlow':        { 'zh-TW': '一般模式每個 byte 都要一次往返，切小才有進度與中止', 'en': 'in normal mode every byte costs one round trip, so small chunks are needed for progress and abort', 'zh-CN': '普通模式每个 byte 都要一次往返，切小才有进度与中止' },
  'i2c.whyRaw':         { 'zh-TW': '自建路徑的命令緩衝區是固定大小的', 'en': 'the self-built path has a fixed-size command buffer', 'zh-CN': '自建路径的命令缓冲区是固定大小的' },
  'i2c.whyVendor':      { 'zh-TW': 'DLL_I2C_BCB.dll 回報「讀到幾個 byte」只用 16 位元，超過 65535 無法驗證完整性', 'en': 'DLL_I2C_BCB.dll reports the byte count in only 16 bits, so completeness cannot be verified beyond 65535', 'zh-CN': 'DLL_I2C_BCB.dll 回报“读到几个 byte”只用 16 位，超过 65535 无法验证完整性' },
  'i2c.whyNone':        { 'zh-TW': '這條路徑沒有長度限制', 'en': 'this path has no length limit', 'zh-CN': '这条路径没有长度限制' },
  'i2c.hintPaged':      { 'zh-TW': '分段 {n}B', 'en': 'paged {n}B', 'zh-CN': '分段 {n}B' },
  'i2c.hintBurst':      { 'zh-TW': '連續', 'en': 'continuous', 'zh-CN': '连续' },
  'i2c.hintManual':     { 'zh-TW': '（手動）', 'en': ' (manual)', 'zh-CN': '（手动）' },
  'i2c.hintAuto':       { 'zh-TW': '（自動）', 'en': ' (auto)', 'zh-CN': '（自动）' },
  'i2c.hintAwidOnly':   { 'zh-TW': '只能 0–{max}', 'en': 'only 0–{max}', 'zh-CN': '只能 0–{max}' },
  'i2c.hintNoAddrPhase':{ 'zh-TW': '無位址相位', 'en': 'no address phase', 'zh-CN': '无地址相位' },
  'i2c.hintAwidMsbFirst':{ 'zh-TW': '{w} byte，高位在前', 'en': '{w} bytes, MSB first', 'zh-CN': '{w} byte，高位在前' },
  'i2c.hintAwid24':     { 'zh-TW': '·24 位元', 'en': ' · 24-bit', 'zh-CN': '·24 位' },
  'i2c.hintAwid3TooOld':{ 'zh-TW': '　🔴 這支 I2C Bridge 太舊，不吃寬度 3（要 proto {proto}）', 'en': '   🔴 this I2C Bridge is too old to accept width 3 (needs proto {proto})', 'zh-CN': '　🔴 这支 I2C Bridge 太旧，不吃宽度 3（要 proto {proto}）' },
  'i2c.hintMax':        { 'zh-TW': '上限 0x{max}', 'en': 'max 0x{max}', 'zh-CN': '上限 0x{max}' },
  'i2c.hintPagesXfers': { 'zh-TW': '{pages} 頁 · 分 {xfers} 則傳送', 'en': '{pages} pg · {xfers} xfer', 'zh-CN': '{pages} 页 · 分 {xfers} 则传送' },
  'i2c.hintAwid0Data':  { 'zh-TW': '寬度 0：只寫 ③ 的那 1 byte', 'en': 'width 0: writes only the single byte in ③', 'zh-CN': '宽度 0：只写 ③ 的那 1 byte' },
  'i2c.hintLoadedFile': { 'zh-TW': '載入的檔案 · {n} byte', 'en': 'loaded file · {n} bytes', 'zh-CN': '载入的文件 · {n} byte' },
  'i2c.hintDataBad':    { 'zh-TW': '🔴 看不懂「{s}」', 'en': '🔴 cannot parse "{s}"', 'zh-CN': '🔴 看不懂“{s}”' },
  'i2c.hintDataPreview':{ 'zh-TW': '{n} byte：{eg}', 'en': '{n} bytes: {eg}', 'zh-CN': '{n} byte：{eg}' },
  'i2c.hintFixed':      { 'zh-TW': '已修正 {from} → {to}', 'en': 'corrected {from} → {to}', 'zh-CN': '已修正 {from} → {to}' },

  /* ── 輸入驗證 ──────────────────────────────────────────────────────── */
  'i2c.errSlaveRange':  { 'zh-TW': 'slave 位址要是 0x00–0x7F 的 7-bit 值', 'en': 'The slave address must be a 7-bit value in 0x00–0x7F', 'zh-CN': 'slave 地址要是 0x00–0x7F 的 7-bit 值' },
  'i2c.errSlaveBad':    { 'zh-TW': 'slave 位址無效', 'en': 'Invalid slave address', 'zh-CN': 'slave 地址无效' },
  'i2c.errAwidRange':   { 'zh-TW': 'offset 寬度只能是 0–{max}：位址相位是從一個 4 byte 的緩衝區依寬度取出來送的，填 5 以上會送出不相干的 byte 當位址，而且不會報錯', 'en': 'The offset width can only be 0–{max}: the address phase is taken from a 4-byte buffer according to the width, so 5 or more would send unrelated bytes as the address — silently', 'zh-CN': 'offset 宽度只能是 0–{max}：地址相位是从一个 4 byte 的缓冲区按宽度取出来发送的，填 5 以上会发出不相干的 byte 当地址，而且不会报错' },
  'i2c.errVal1Byte':    { 'zh-TW': '這個模式下的值要是 0x00–0xFF 的 1 byte', 'en': 'In this mode the value must be a single byte in 0x00–0xFF', 'zh-CN': '这个模式下的值要是 0x00–0xFF 的 1 byte' },
  'i2c.errOffRange':    { 'zh-TW': '起始 offset 超出 {w} byte 能表示的範圍（0–0x{max}）', 'en': 'The start offset exceeds what {w} bytes can represent (0–0x{max})', 'zh-CN': '起始 offset 超出 {w} byte 能表示的范围（0–0x{max}）' },
  'i2c.errLenRange':    { 'zh-TW': '總 byte 數要在 1–{max} 之間', 'en': 'The total byte count must be between 1 and {max}', 'zh-CN': '总 byte 数要在 1–{max} 之间' },
  'i2c.errAwid0Val':    { 'zh-TW': '寬度 0：③ 要是 0x00–0xFF 的 1 byte', 'en': 'Width 0: ③ must be a single byte in 0x00–0xFF', 'zh-CN': '宽度 0：③ 要是 0x00–0xFF 的 1 byte' },
  'i2c.errDataParse':   { 'zh-TW': '寫入資料解析不出來（每個 byte 要兩碼）', 'en': 'Cannot parse the data to write (each byte needs two hex digits)', 'zh-CN': '写入数据解析不出来（每个 byte 要两位）' },
  'i2c.errNoData':      { 'zh-TW': '沒有要寫的資料：打字或按「載入檔案」', 'en': 'Nothing to write: type something or press "Load file"', 'zh-CN': '没有要写的数据：输入内容或按“载入文件”' },
  'i2c.errNothingToWrite':{ 'zh-TW': '沒有資料可寫', 'en': 'No data to write', 'zh-CN': '没有数据可写' },
  'i2c.errNothingToSave':{ 'zh-TW': '還沒有資料可以存。', 'en': 'There is no data to save yet.', 'zh-CN': '还没有数据可以保存。' },
  'i2c.errNoDataForRef':{ 'zh-TW': '還沒有資料可以當基準', 'en': 'There is no data to use as a reference yet', 'zh-CN': '还没有数据可以当基准' },
  'i2c.errNoRefOrData': { 'zh-TW': '沒有基準或沒有資料', 'en': 'No reference or no data', 'zh-CN': '没有基准或没有数据' },
  'i2c.errNotComparable':{ 'zh-TW': '這一份與基準不可比（長度／slave／offset 不同）', 'en': 'This copy cannot be compared with the reference (different length / slave / offset)', 'zh-CN': '这一份与基准不可比（长度／slave／offset 不同）' },
  'i2c.errNeedLink':    { 'zh-TW': '要先連線才能比對', 'en': 'Connect first before comparing', 'zh-CN': '要先连接才能比对' },
  'i2c.errModeSwitch':  { 'zh-TW': '切換模式失敗：{msg}', 'en': 'Failed to switch mode: {msg}', 'zh-CN': '切换模式失败：{msg}' },
  'i2c.errFileRead':    { 'zh-TW': '檔案讀不起來', 'en': 'Cannot read the file', 'zh-CN': '文件读不起来' },
  'i2c.confirmDirty':   { 'zh-TW': '有 {n} byte 是本地改過、還沒寫進裝置的。\n{what}會覆蓋掉它們。要繼續嗎？', 'en': '{n} bytes have been edited locally and not yet written to the device.\n{what} will overwrite them. Continue?', 'zh-CN': '有 {n} byte 是本地改过、还没写进设备的。\n{what}会覆盖掉它们。要继续吗？' },
  'i2c.actReread':      { 'zh-TW': '重新讀取', 'en': 'Re-reading', 'zh-CN': '重新读取' },
  'i2c.actLoadFile':    { 'zh-TW': '載入檔案', 'en': 'Loading a file', 'zh-CN': '载入文件' },
  'i2c.actClear':       { 'zh-TW': '清空', 'en': 'Clearing', 'zh-CN': '清空' },
  'i2c.roShowingA':     { 'zh-TW': '目前顯示的是 A（基準），唯讀 —— 要改值請點下面那一行切回 B。', 'en': 'You are viewing A (the reference), which is read-only — click the row below to switch back to B to edit values.', 'zh-CN': '当前显示的是 A（基准），只读 —— 要改值请点下面那一行切回 B。' },
  'i2c.bnNoCellWrite':  { 'zh-TW': 'offset 寬度為 0 byte（無位址）時無法逐格寫入 —— 請改用上方「寫入資料」欄。', 'en': 'Per-cell writing is not possible when the offset width is 0 bytes (no address) — use the "Data to write" field above instead.', 'zh-CN': 'offset 宽度为 0 byte（无地址）时无法逐格写入 —— 请改用上方“写入数据”栏。' },

  /* ── 檔案解析 ──────────────────────────────────────────────────────── */
  'i2c.hexNeedColon':   { 'zh-TW': 'Intel HEX 的每一行都要以 : 開頭', 'en': 'Every line of Intel HEX must start with :', 'zh-CN': 'Intel HEX 的每一行都要以 : 开头' },
  'i2c.hexBadRec':      { 'zh-TW': '不是合法的 Intel HEX 記錄（長度或字元不對）', 'en': 'Not a valid Intel HEX record (wrong length or characters)', 'zh-CN': '不是合法的 Intel HEX 记录（长度或字符不对）' },
  'i2c.hexLenMismatch': { 'zh-TW': '長度欄說有 {say} 個 data byte，實際是 {got} 個', 'en': 'The length field says {say} data bytes but there are {got}', 'zh-CN': '长度字段说有 {say} 个 data byte，实际是 {got} 个' },
  'i2c.hexBadCks':      { 'zh-TW': 'checksum 不符（算出 0x{want}，檔案寫 0x{got}）', 'en': 'Checksum mismatch (computed 0x{want}, file says 0x{got})', 'zh-CN': 'checksum 不符（算出 0x{want}，文件写 0x{got}）' },
  'i2c.hexBadType':     { 'zh-TW': '不支援的 record type 0x{type}', 'en': 'Unsupported record type 0x{type}', 'zh-CN': '不支持的 record type 0x{type}' },
  'i2c.hexNoData':      { 'zh-TW': 'Intel HEX 裡沒有任何資料記錄', 'en': 'The Intel HEX file contains no data records', 'zh-CN': 'Intel HEX 里没有任何数据记录' },
  'i2c.fileEmpty':      { 'zh-TW': '檔案裡沒有任何內容', 'en': 'The file is empty', 'zh-CN': '文件里没有任何内容' },
  'i2c.badHexByte':     { 'zh-TW': '「{s}」不是合法的 16 進位 byte', 'en': '"{s}" is not a valid hex byte', 'zh-CN': '“{s}”不是合法的十六进制 byte' },
  'i2c.parsedZero':     { 'zh-TW': '解析出 0 個 byte', 'en': 'Parsed 0 bytes', 'zh-CN': '解析出 0 个 byte' },
  'i2c.errParsedZeroFile':{ 'zh-TW': '{name} 解析出 0 個 byte', 'en': '{name} parsed to 0 bytes', 'zh-CN': '{name} 解析出 0 个 byte' },
  'i2c.errLineParse':   { 'zh-TW': '第 {line} 行解析不出來：{why}', 'en': 'Line {line} cannot be parsed: {why}', 'zh-CN': '第 {line} 行解析不出来：{why}' },
  'i2c.fmtHexDumpAddr': { 'zh-TW': '帶位址的 hex dump', 'en': 'hex dump with addresses', 'zh-CN': '带地址的 hex dump' },
  'i2c.fmtHexText':     { 'zh-TW': 'hex 文字', 'en': 'hex text', 'zh-CN': 'hex 文本' },
  'i2c.fmtPerRow':      { 'zh-TW': '（每行 {n} byte）', 'en': ' ({n} bytes per line)', 'zh-CN': '（每行 {n} byte）' },
  'i2c.fmtBlank':       { 'zh-TW': '空白檔', 'en': 'empty file', 'zh-CN': '空白文件' },
  'i2c.fmtIhex':        { 'zh-TW': 'Intel HEX，每列 16 byte', 'en': 'Intel HEX, 16 bytes per line', 'zh-CN': 'Intel HEX，每行 16 byte' },
  'i2c.fmtOnePerLine':  { 'zh-TW': '逐列一個 byte', 'en': 'one byte per line', 'zh-CN': '逐行一个 byte' },
  'i2c.fmtRawBinary':   { 'zh-TW': 'raw binary（依{why}）', 'en': 'raw binary (by {why})', 'zh-CN': 'raw binary（依{why}）' },
  'i2c.whyExt':         { 'zh-TW': '副檔名 .bin', 'en': 'the .bin extension', 'zh-CN': '扩展名 .bin' },
  'i2c.whySniff':       { 'zh-TW': '內容判定', 'en': 'content sniffing', 'zh-CN': '内容判定' },
  'i2c.fmtHoles':       { 'zh-TW': '　⚠ 位址跳躍處補了 {n} 個 0xFF', 'en': '   ⚠ {n} bytes of 0xFF were inserted at address gaps', 'zh-CN': '　⚠ 地址跳跃处补了 {n} 个 0xFF' },
  'i2c.fmtStartAddr':   { 'zh-TW': '　起始位址 0x{a}', 'en': '   start address 0x{a}', 'zh-CN': '　起始地址 0x{a}' },

  /* ── 連線流程的 log 與橫幅 ─────────────────────────────────────────── */
  'i2c.errNotLinked':   { 'zh-TW': 'I2C Bridge 尚未連線', 'en': 'I2C Bridge is not connected', 'zh-CN': 'I2C Bridge 尚未连接' },
  'i2c.errTimeout':     { 'zh-TW': 'I2C Bridge 逾時未回覆（{type}）', 'en': 'I2C Bridge did not reply in time ({type})', 'zh-CN': 'I2C Bridge 超时未回复（{type}）' },
  'i2c.errIdle':        { 'zh-TW': 'I2C Bridge {s} 秒沒有任何動靜（{type}）—— 進度訊息也停了', 'en': 'I2C Bridge has been silent for {s} s ({type}) — progress messages stopped too', 'zh-CN': 'I2C Bridge {s} 秒没有任何动静（{type}）—— 进度消息也停了' },
  'i2c.errWsClosed':    { 'zh-TW': 'I2C Bridge 連線關閉', 'en': 'I2C Bridge connection closed', 'zh-CN': 'I2C Bridge 连接关闭' },
  'i2c.logWsClosed':    { 'zh-TW': '✕ I2C Bridge 連線關閉', 'en': '✕ I2C Bridge connection closed', 'zh-CN': '✕ I2C Bridge 连接关闭' },
  'i2c.logLostChannel': { 'zh-TW': '⚠ I2C 治具被另一個頁面接手，本頁已失去控制權', 'en': '⚠ Another page took over the I2C adapter; this page has lost control', 'zh-CN': '⚠ I2C 工装被另一个页面接管，本页已失去控制权' },
  'i2c.bnLostChannel':  { 'zh-TW': 'I2C 治具被<b>另一個頁面接手</b>了。要拿回來請按上方的「接手 I2C」。', 'en': 'The I2C adapter has been <b>taken over by another page</b>. Press "Take over I2C" above to get it back.', 'zh-CN': 'I2C 工装被<b>另一个页面接管</b>了。要拿回来请按上方的“接管 I2C”。' },
  'i2c.logConnecting':  { 'zh-TW': '連線 {url}', 'en': 'Connecting to {url}', 'zh-CN': '连接 {url}' },
  'i2c.logAskTakeover': { 'zh-TW': '（要求接手 I2C）', 'en': ' (requesting I2C takeover)', 'zh-CN': '（要求接管 I2C）' },
  'i2c.logRetryIn':     { 'zh-TW': '　 {s} 秒後自動重試第 {i}/{max} 次…', 'en': '   retrying automatically in {s} s, attempt {i}/{max}…', 'zh-CN': '　 {s} 秒后自动重试第 {i}/{max} 次…' },
  'i2c.bnRetryIn':      { 'zh-TW': '與 I2C Bridge 的連線中斷了，{s} 秒後自動重試（第 {i}/{max} 次）。也可以直接按上方的「連線」。', 'en': 'The connection to I2C Bridge dropped; retrying automatically in {s} s (attempt {i}/{max}). You can also press "Connect" above.', 'zh-CN': '与 I2C Bridge 的连接中断了，{s} 秒后自动重试（第 {i}/{max} 次）。也可以直接按上方的“连接”。' },
  'i2c.whyGone':        { 'zh-TW': 'I2C Bridge 不見了（自動重試 {max} 次都沒接上）', 'en': 'I2C Bridge is gone ({max} automatic retries all failed)', 'zh-CN': 'I2C Bridge 不见了（自动重试 {max} 次都没接上）' },
  'i2c.whyBridgeOld':   { 'zh-TW': 'I2C Bridge 太舊（你手上是 {have}）', 'en': 'I2C Bridge is too old (you have {have})', 'zh-CN': 'I2C Bridge 太旧（你手上是 {have}）' },
  'i2c.whyOnlineNeedsBridge':{ 'zh-TW': '這一頁要通 I2C 得先有本機 I2C Bridge', 'en': 'This page needs a local I2C Bridge before it can talk I2C', 'zh-CN': '这一页要通 I2C 得先有本机 I2C Bridge' },
  'i2c.whyManualDl':    { 'zh-TW': '手動叫出來的下載入口', 'en': 'Download entry opened manually', 'zh-CN': '手动叫出来的下载入口' },
  'i2c.logNoBridge':    { 'zh-TW': '✕ 連不到本機 I2C Bridge（{url}），耗時 {ms} ms', 'en': '✕ Cannot reach the local I2C Bridge ({url}) after {ms} ms', 'zh-CN': '✕ 连不到本机 I2C Bridge（{url}），耗时 {ms} ms' },
  'i2c.logLnaBlocked':  { 'zh-TW': '　 耗時 {ms} ms（≥ {th} ms）⇒ 判為瀏覽器的本機網路權限被拒或未回應，不是 I2C Bridge 沒開。Chrome 147 起公開來源連 loopback 會先問一次。', 'en': '   took {ms} ms (≥ {th} ms) ⇒ judged to be the browser local-network permission being denied or unanswered, not the I2C Bridge being closed. Since Chrome 147 a public origin reaching loopback is asked once.', 'zh-CN': '　 耗时 {ms} ms（≥ {th} ms）⇒ 判为浏览器的本地网络权限被拒或未响应，不是 I2C Bridge 没开。Chrome 147 起公开来源连 loopback 会先问一次。' },
  'i2c.logHeldElsewhere':{ 'zh-TW': '（I2C 目前被另一個頁面握著）', 'en': ' (I2C is currently held by another page)', 'zh-CN': '（I2C 当前被另一个页面握着）' },
  'i2c.logStaleTab':    { 'zh-TW': '🔴 分頁過舊：本頁預期 I2C Bridge {want}，實際連到的是更新的 {got} ⇒ 這份 i2c.html 不是最新的', 'en': '🔴 Stale tab: this page expects I2C Bridge {want} but connected to the newer {got} ⇒ this copy of i2c.html is not the latest', 'zh-CN': '🔴 标签页过旧：本页预期 I2C Bridge {want}，实际连到的是更新的 {got} ⇒ 这份 i2c.html 不是最新的' },
  'i2c.bnStaleTab':     { 'zh-TW': '這個分頁是舊的，請按 Ctrl+F5 重新整理。', 'en': 'This tab is stale — press Ctrl+F5 to reload.', 'zh-CN': '这个标签页是旧的，请按 Ctrl+F5 刷新。' },
  'i2c.logBridgeOld':   { 'zh-TW': 'I2C Bridge 太舊：手上 {have}（proto {proto}），本頁需要 proto {need} 以上；離線頁的下載連結是打包當時那一包，新版在 {url}', 'en': 'I2C Bridge is too old: you have {have} (proto {proto}) but this page needs proto {need} or above. The offline page links to the package it was bundled with; the latest is at {url}', 'zh-CN': 'I2C Bridge 太旧：手上 {have}（proto {proto}），本页需要 proto {need} 以上；离线页的下载链接是打包当时那一包，新版在 {url}' },
  'i2c.errBridgeOld':   { 'zh-TW': 'I2C Bridge 太舊（proto {proto}，本頁需要 {need}）', 'en': 'I2C Bridge is too old (proto {proto}; this page needs {need})', 'zh-CN': 'I2C Bridge 太旧（proto {proto}，本页需要 {need}）' },
  'i2c.logChannelOpen': { 'zh-TW': '已開通道（第 {i} 次）· channels={ch}', 'en': 'Channel opened (attempt {i}) · channels={ch}', 'zh-CN': '已开通道（第 {i} 次）· channels={ch}' },
  'i2c.logTakeoverLocked':{ 'zh-TW': '⚠ 接手被拒：另一頁正在量測（I2C Bridge 回 locked）', 'en': '⚠ Takeover refused: the other page is measuring (I2C Bridge replied locked)', 'zh-CN': '⚠ 接管被拒：另一页正在测量（I2C Bridge 回 locked）' },
  'i2c.bnDgMeasuring':  { 'zh-TW': 'DG 正在量測中，等它跑完就能用。', 'en': 'A DG measurement is running; it will be available once that finishes.', 'zh-CN': 'DG 正在测量中，等它跑完就能用。' },
  'i2c.logChannelBusy': { 'zh-TW': '⚠ I2C 由另一個頁面持有（I2C Bridge 回 busy）', 'en': '⚠ I2C is held by another page (I2C Bridge replied busy)', 'zh-CN': '⚠ I2C 由另一个页面持有（I2C Bridge 回 busy）' },
  'i2c.bnOtherPage':    { 'zh-TW': 'I2C 在另一個頁面。按「接手 I2C」拿回來。', 'en': 'I2C is on another page. Press "Take over I2C" to get it back.', 'zh-CN': 'I2C 在另一个页面。按“接管 I2C”拿回来。' },
  'i2c.logChannelFail': { 'zh-TW': '開通道第 {i}/{max} 次失敗（channels={ch}）', 'en': 'Opening the channel failed on attempt {i}/{max} (channels={ch})', 'zh-CN': '开通道第 {i}/{max} 次失败（channels={ch}）' },
  'i2c.errChannelAllFail':{ 'zh-TW': '開通道連試 {max} 次都失敗（治具插好了嗎？是不是有別的程式正開著佔住治具？）', 'en': 'Opening the channel failed all {max} times (is the adapter plugged in? is another program holding it?)', 'zh-CN': '开通道连试 {max} 次都失败（工装插好了吗？是不是有别的程序正开着占住工装？）' },
  'i2c.logDisconnected':{ 'zh-TW': '已中斷 I2C Bridge 連線', 'en': 'Disconnected from I2C Bridge', 'zh-CN': '已断开 I2C Bridge 连接' },
  'i2c.logReleased':    { 'zh-TW': '已釋放 I2C 治具（連線保持著；其他程式現在可以使用）', 'en': 'I2C adapter released (connection kept open; other programs can use it now)', 'zh-CN': '已释放 I2C 工装（连接保持着；其他程序现在可以使用）' },
  'i2c.bnReleased':     { 'zh-TW': '已<b>釋放 I2C 治具</b>，與 I2C Bridge 的連線仍在。要再用請按「連線」重開通道，或直接按「接手 I2C」。', 'en': 'The <b>I2C adapter has been released</b>; the I2C Bridge connection is still open. Press "Connect" to reopen the channel, or "Take over I2C".', 'zh-CN': '已<b>释放 I2C 工装</b>，与 I2C Bridge 的连接仍在。要再用请按“连接”重开通道，或直接按“接管 I2C”。' },
  'i2c.logReleaseFail': { 'zh-TW': '✕ 釋放失敗：{msg}', 'en': '✕ Release failed: {msg}', 'zh-CN': '✕ 释放失败：{msg}' },
  'i2c.logTakeoverAsk': { 'zh-TW': '要求接手 I2C 治具…', 'en': 'Requesting the I2C adapter…', 'zh-CN': '要求接管 I2C 工装…' },
  'i2c.logReady':       { 'zh-TW': 'I2C 讀寫測試工具就緒。讀寫皆不限位址；每一筆讀寫都記在這裡。', 'en': 'I2C read/write test tool ready. No address restrictions; every read and write is logged here.', 'zh-CN': 'I2C 读写测试工具就绪。读写皆不限地址；每一笔读写都记在这里。' },
  'i2c.logAutoTakeover':{ 'zh-TW': '分頁變成可見 → 自動接手 I2C', 'en': 'Tab became visible → taking over I2C automatically', 'zh-CN': '标签页变成可见 → 自动接管 I2C' },
  'i2c.logDebugMode':   { 'zh-TW': 'debug 模式 {s}', 'en': 'debug mode {s}', 'zh-CN': 'debug 模式 {s}' },

  /* ── 讀取 ──────────────────────────────────────────────────────────── */
  'i2c.logSegOne':      { 'zh-TW': '分段：{n} byte 一次讀完，不分段', 'en': 'Chunking: {n} bytes read in one go, no chunking', 'zh-CN': '分段：{n} byte 一次读完，不分段' },
  'i2c.logSegMany':     { 'zh-TW': '分段：{n} byte ⇒ {segs} 則（每則最多 {max} byte，最後一則 {last}）　原因：{why}', 'en': 'Chunking: {n} bytes ⇒ {segs} transfers (at most {max} bytes each, last one {last}) — reason: {why}', 'zh-CN': '分段：{n} byte ⇒ {segs} 则（每则最多 {max} byte，最后一则 {last}）　原因：{why}' },
  'i2c.logAbortRead':   { 'zh-TW': '■ 使用者中止：已讀 {got}/{want} byte', 'en': '■ Aborted by user: {got}/{want} bytes read', 'zh-CN': '■ 用户中止：已读 {got}/{want} byte' },
  'i2c.errAbortedRead': { 'zh-TW': '已中止（讀到 {got}/{want} byte）', 'en': 'Aborted ({got}/{want} bytes read)', 'zh-CN': '已中止（读到 {got}/{want} byte）' },
  'i2c.logReadFail':    { 'zh-TW': '✕ 讀失敗（status {status}）{detail}', 'en': '✕ Read failed (status {status}){detail}', 'zh-CN': '✕ 读失败（status {status}）{detail}' },
  'i2c.bnFellBackSlow': { 'zh-TW': '這次用的是比較慢的讀取方式（快的方式在這台電腦上用不了）。', 'en': 'This read used the slower path (the fast one does not work on this machine).', 'zh-CN': '这次用的是比较慢的读取方式（快的方式在这台电脑上用不了）。' },
  'i2c.logFellBackSlow':{ 'zh-TW': '🔴 要求快速模式但 bridge 回報走的是一般模式 ⇒ 看 i2c-bridge.log 的「SLOW path because …」那一行，它會指出是哪一個前置條件不成立', 'en': '🔴 Fast mode was requested but the bridge reports it used the normal path ⇒ check the "SLOW path because …" line in i2c-bridge.log; it names the precondition that failed', 'zh-CN': '🔴 要求快速模式但 bridge 回报走的是普通模式 ⇒ 看 i2c-bridge.log 的“SLOW path because …”那一行，它会指出是哪一个前置条件不成立' },
  'i2c.logGotOnly':     { 'zh-TW': '  🔴 只收到 {got}/{want}', 'en': '  🔴 only received {got}/{want}', 'zh-CN': '  🔴 只收到 {got}/{want}' },
  'i2c.gotOnlyN':       { 'zh-TW': '只收到 {n} byte', 'en': 'only {n} bytes received', 'zh-CN': '只收到 {n} byte' },
  'i2c.errSegShort':    { 'zh-TW': '第 {seg} 段只收到 {got}/{want} byte', 'en': 'Segment {seg} received only {got}/{want} bytes', 'zh-CN': '第 {seg} 段只收到 {got}/{want} byte' },
  'i2c.devMs':          { 'zh-TW': '，dev {ms} ms', 'en': ', dev {ms} ms', 'zh-CN': '，dev {ms} ms' },
  'i2c.timeLine':       { 'zh-TW': '{tag} {n} byte · 共 {tot}（{ms} ms{split}，平均 {avg} ms/byte）', 'en': '{tag} {n} bytes · total {tot} ({ms} ms{split}, average {avg} ms/byte)', 'zh-CN': '{tag} {n} byte · 共 {tot}（{ms} ms{split}，平均 {avg} ms/byte）' },
  'i2c.timeSplit':      { 'zh-TW': '，其中裝置 {dev} ms、傳輸 {xfer} ms', 'en': ', of which device {dev} ms and transport {xfer} ms', 'zh-CN': '，其中设备 {dev} ms、传输 {xfer} ms' },
  'i2c.inNSegs':        { 'zh-TW': ' · 分 {n} 段', 'en': ' · in {n} segments', 'zh-CN': ' · 分 {n} 段' },
  'i2c.inNPicks':       { 'zh-TW': '（{n} 個不連續區段）', 'en': ' ({n} non-adjacent runs)', 'zh-CN': '（{n} 个不连续区段）' },
  'i2c.progElapsed':    { 'zh-TW': '　已 {t}', 'en': '   {t} elapsed', 'zh-CN': '　已 {t}' },
  'i2c.logUserAbort':   { 'zh-TW': '使用者按下中止', 'en': 'User pressed Abort', 'zh-CN': '用户按下中止' },
  'i2c.logAbortSendFail':{ 'zh-TW': '✕ 中止訊息送不出去：{msg}', 'en': '✕ Could not send the abort message: {msg}', 'zh-CN': '✕ 中止消息发不出去：{msg}' },
  'i2c.logAbortSent':   { 'zh-TW': '　已把中止送給 I2C Bridge，它會在下一個分頁邊界停下來', 'en': '   Abort sent to I2C Bridge; it will stop at the next page boundary', 'zh-CN': '　已把中止发给 I2C Bridge，它会在下一个分页边界停下来' },
  'i2c.logCancelRead':  { 'zh-TW': '取消讀取（保留未寫入的本地修改）', 'en': 'Read cancelled (unwritten local edits kept)', 'zh-CN': '取消读取（保留未写入的本地修改）' },
  'i2c.bnReading':      { 'zh-TW': '讀取中…', 'en': 'Reading…', 'zh-CN': '读取中…' },
  'i2c.logWrap':        { 'zh-TW': '⚠ 讀回的資料每 {n} byte 完整重複一次 ⇒ 可能已超過裝置容量，位址回捲到 0（sequential read 不會報錯，只會重複）', 'en': '⚠ The data read back repeats exactly every {n} bytes ⇒ the device capacity may have been exceeded and the address wrapped to 0 (a sequential read does not error, it just repeats)', 'zh-CN': '⚠ 读回的数据每 {n} byte 完整重复一次 ⇒ 可能已超过设备容量，地址回卷到 0（sequential read 不会报错，只会重复）' },
  'i2c.logIncomplete':  { 'zh-TW': '讀取不完整 ⇒ 不當基準、不參與比較', 'en': 'Incomplete read ⇒ not used as a reference and excluded from comparison', 'zh-CN': '读取不完整 ⇒ 不当基准、不参与比较' },
  'i2c.logDirtyCleared':{ 'zh-TW': '讀取已覆蓋整片資料 ⇒ 清掉 {n} byte 的「已修改未寫入」標記', 'en': 'The read covered the whole buffer ⇒ cleared the "edited, not written" flag on {n} bytes', 'zh-CN': '读取已覆盖整片数据 ⇒ 清掉 {n} byte 的“已修改未写入”标记' },
  'i2c.logFileDropped': { 'zh-TW': '讀取已覆蓋 dump（B）⇒ 放掉載入的檔案 {name}', 'en': 'The read overwrote the dump (B) ⇒ dropped the loaded file {name}', 'zh-CN': '读取已覆盖 dump（B）⇒ 放掉载入的文件 {name}' },
  'i2c.logFileIsA':     { 'zh-TW': '（它已經是 A，檔名保留在 A 那一行）', 'en': ' (it is already A; the file name stays on the A row)', 'zh-CN': '（它已经是 A，文件名保留在 A 那一行）' },
  'i2c.bnReadFail':     { 'zh-TW': '讀取失敗：{err}（已收到的 {n} byte 仍顯示在表格上）', 'en': 'Read failed: {err} (the {n} bytes already received are still shown in the table)', 'zh-CN': '读取失败：{err}（已收到的 {n} byte 仍显示在表格上）' },
  'i2c.logAllFF':       { 'zh-TW': '⚠ 全 FF ＝ 總線閒置／無回應（不是有效資料）· slave 0x{slave}、檢查接線與電源', 'en': '⚠ All FF = idle bus / no response (not valid data) · slave 0x{slave}; check wiring and power', 'zh-CN': '⚠ 全 FF ＝ 总线空闲／无响应（不是有效数据）· slave 0x{slave}、检查接线与电源' },
  'i2c.bnReadOk':       { 'zh-TW': '讀到 {n} byte{t}，{range}，共 {pages} 頁。', 'en': 'Read {n} bytes{t}, {range}, {pages} pages in total.', 'zh-CN': '读到 {n} byte{t}，{range}，共 {pages} 页。' },
  'i2c.rangeNoAddr':    { 'zh-TW': '無位址模式（索引 0–{last}）', 'en': 'no-address mode (index 0–{last})', 'zh-CN': '无地址模式（索引 0–{last}）' },
  'i2c.bnDiffCount':    { 'zh-TW': '　🔴 {n} 處與基準不同', 'en': '   🔴 {n} places differ from the reference', 'zh-CN': '　🔴 {n} 处与基准不同' },
  'i2c.bnWrap':         { 'zh-TW': '　⚠ 每 {n} byte 就完整重複一次 ⇒ 可能已超過裝置容量、位址回捲', 'en': '   ⚠ repeats exactly every {n} bytes ⇒ the device capacity may have been exceeded and the address wrapped', 'zh-CN': '　⚠ 每 {n} byte 就完整重复一次 ⇒ 可能已超过设备容量、地址回卷' },
  'i2c.pageIdxRange':   { 'zh-TW': '索引 {a}–{b}', 'en': 'index {a}–{b}', 'zh-CN': '索引 {a}–{b}' },
  'i2c.pageNofM':       { 'zh-TW': '　第 {i} / {n} 頁', 'en': '   page {i} / {n}', 'zh-CN': '　第 {i} / {n} 页' },

  /* ── 資料集、快照、差異 ────────────────────────────────────────────── */
  'i2c.logShapeChanged':{ 'zh-TW': '與前一份的長度／位址對不起來 ⇒ 差異比對停用，改用這一份當新的 A', 'en': 'Length / address do not match the previous copy ⇒ diffing disabled; this copy becomes the new A', 'zh-CN': '与前一份的长度／地址对不上 ⇒ 差异比对停用，改用这一份当新的 A' },
  'i2c.logAutoRef':     { 'zh-TW': '建立比較基準（自動）：{label}', 'en': 'Comparison reference created (automatic): {label}', 'zh-CN': '建立比较基准（自动）：{label}' },
  'i2c.logCmpRef':      { 'zh-TW': '與基準比對（{label}）：{n} 處不同', 'en': 'Compared against the reference ({label}): {n} differences', 'zh-CN': '与基准比对（{label}）：{n} 处不同' },
  'i2c.logSnapshot':    { 'zh-TW': '手動快照：A ＝ {label}（來源：{src}，B 清空、diff 清零）', 'en': 'Manual snapshot: A = {label} (source: {src}; B cleared, diff reset)', 'zh-CN': '手动快照：A ＝ {label}（来源：{src}，B 清空、diff 清零）' },
  'i2c.flashSnapped':   { 'zh-TW': '✔ 已快照 {n} byte', 'en': '✔ Snapshotted {n} bytes', 'zh-CN': '✔ 已快照 {n} byte' },
  'i2c.flashRecmp':     { 'zh-TW': '✔ 已重新比較：{n} 處不同', 'en': '✔ Compared again: {n} differences', 'zh-CN': '✔ 已重新比较：{n} 处不同' },
  'i2c.flashDiffCleared':{ 'zh-TW': '✔ 已清除差異清單', 'en': '✔ Diff list cleared', 'zh-CN': '✔ 已清除差异列表' },
  'i2c.flashTimeCleared':{ 'zh-TW': '✔ 已清除耗時紀錄', 'en': '✔ Timing log cleared', 'zh-CN': '✔ 已清除耗时记录' },
  'i2c.flashCleared':   { 'zh-TW': '✔ 已清空', 'en': '✔ Cleared', 'zh-CN': '✔ 已清空' },
  'i2c.logCleared':     { 'zh-TW': '清空：回到沒有任何資料的狀態（連線與參數保留）', 'en': 'Cleared: back to the no-data state (connection and parameters kept)', 'zh-CN': '清空：回到没有任何数据的状态（连接与参数保留）' },
  'i2c.logCancelClear': { 'zh-TW': '取消清空（保留未寫入的本地修改）', 'en': 'Clear cancelled (unwritten local edits kept)', 'zh-CN': '取消清空（保留未写入的本地修改）' },
  'i2c.selNone':        { 'zh-TW': '（未選取）', 'en': '(nothing selected)', 'zh-CN': '（未选取）' },
  'i2c.selTotal':       { 'zh-TW': '共 {n} byte', 'en': '{n} bytes total', 'zh-CN': '共 {n} byte' },
  'i2c.selSegs':        { 'zh-TW': '　{n} 段', 'en': '   {n} segments', 'zh-CN': '　{n} 段' },
  'i2c.dirtyLine':      { 'zh-TW': '已修改 {n} byte 未寫入', 'en': '{n} bytes edited but not written', 'zh-CN': '已修改 {n} byte 未写入' },
  'i2c.flashSaved':     { 'zh-TW': '✔ 已存出 {name}', 'en': '✔ Saved {name}', 'zh-CN': '✔ 已保存 {name}' },
  'i2c.logSaved':       { 'zh-TW': '另存新檔：{name}（{n} byte，{fmt}）', 'en': 'Saved as: {name} ({n} bytes, {fmt})', 'zh-CN': '另存为：{name}（{n} byte，{fmt}）' },
  'i2c.logLocalEdit':   { 'zh-TW': '本地修改（未連線）：0x{at} ← 0x{v}（尚未寫入裝置）', 'en': 'Local edit (not connected): 0x{at} ← 0x{v} (not written to the device yet)', 'zh-CN': '本地修改（未连接）：0x{at} ← 0x{v}（尚未写入设备）' },
  'i2c.logRevertLocal': { 'zh-TW': '本地還原（未連線）：{at} ← 0x{v}', 'en': 'Local revert (not connected): {at} ← 0x{v}', 'zh-CN': '本地还原（未连接）：{at} ← 0x{v}' },
  'i2c.logRevertLocalLinked':{ 'zh-TW': '還原（本地改動尚未寫入，不需要送出）：{at} ← 0x{v}', 'en': 'Revert (the local edit was never sent, so nothing to send): {at} ← 0x{v}', 'zh-CN': '还原（本地改动尚未写入，不需要发送）：{at} ← 0x{v}' },

  /* ── 寫入、整批寫入、回讀驗證 ──────────────────────────────────────── */
  'i2c.logEeOverCap':   { 'zh-TW': '這次要寫到 0x{top}（共 {n} byte 範圍），超出已確認的 {id} 容量 ⇒ 重新確認型號', 'en': 'This write reaches 0x{top} ({n} bytes of range), beyond the capacity of the confirmed {id} ⇒ asking for the part again', 'zh-CN': '这次要写到 0x{top}（共 {n} byte 范围），超出已确认的 {id} 容量 ⇒ 重新确认型号' },
  'i2c.logEePicked':    { 'zh-TW': 'EEPROM 型號：{id}（{kbit}／{cap}）⇒ 分段 {page} byte', 'en': 'EEPROM part: {id} ({kbit} / {cap}) ⇒ paging at {page} bytes', 'zh-CN': 'EEPROM 型号：{id}（{kbit}／{cap}）⇒ 分段 {page} byte' },
  'i2c.logEeCancel':    { 'zh-TW': '取消寫入（EEPROM 型號確認）', 'en': 'Write cancelled (EEPROM part confirmation)', 'zh-CN': '取消写入（EEPROM 型号确认）' },
  'i2c.segTag':         { 'zh-TW': '［區段 {i}/{n} @ {at}］', 'en': '[run {i}/{n} @ {at}] ', 'zh-CN': '［区段 {i}/{n} @ {at}］' },
  'i2c.segName':        { 'zh-TW': '{at}（{n} byte）', 'en': '{at} ({n} bytes)', 'zh-CN': '{at}（{n} byte）' },
  'i2c.logWritePlan':   { 'zh-TW': '寫入計畫：{n} byte ⇒ {segs} 段{how}', 'en': 'Write plan: {n} bytes ⇒ {segs} segments{how}', 'zh-CN': '写入计划：{n} byte ⇒ {segs} 段{how}' },
  'i2c.planPaged':      { 'zh-TW': '（page {page} byte，目標段間距 {gap} ms）', 'en': ' (page {page} bytes, target gap {gap} ms)', 'zh-CN': '（page {page} byte，目标段间距 {gap} ms）' },
  'i2c.planBurst':      { 'zh-TW': '（不分段 ＝ burst）', 'en': ' (no paging = burst)', 'zh-CN': '（不分段 ＝ burst）' },
  'i2c.planBatch':      { 'zh-TW': '⚡ 整批模式：**1 次**請求交給 I2C Bridge，由它分頁（舊做法是 {old} 次）', 'en': '⚡ Batch mode: **one** request handed to I2C Bridge, which does the paging (the old way took {old})', 'zh-CN': '⚡ 整批模式：**1 次**请求交给 I2C Bridge，由它分页（旧做法是 {old} 次）' },
  'i2c.planPerSeg':     { 'zh-TW': '逐段模式：{n} 次請求', 'en': 'Per-segment mode: {n} requests', 'zh-CN': '逐段模式：{n} 次请求' },
  'i2c.planBatchNeeds': { 'zh-TW': '（I2C Bridge proto {have} < {need}：整批模式要 I2C Bridge {ver} 以上）', 'en': ' (I2C Bridge proto {have} < {need}: batch mode needs I2C Bridge {ver} or newer)', 'zh-CN': '（I2C Bridge proto {have} < {need}：整批模式要 I2C Bridge {ver} 以上）' },
  'i2c.planNoAddrPhase':{ 'zh-TW': '（無位址相位，不能由 bridge 分頁）', 'en': ' (no address phase, so the bridge cannot page it)', 'zh-CN': '（无地址相位，不能由 bridge 分页）' },
  'i2c.planOneSeg':     { 'zh-TW': '單段', 'en': 'single segment', 'zh-CN': '单段' },
  'i2c.logBatchNote':   { 'zh-TW': '（整批，{segs} 段由 I2C Bridge 分）', 'en': ' (batch; {segs} segments split by I2C Bridge)', 'zh-CN': '（整批，{segs} 段由 I2C Bridge 分）' },
  'i2c.logBridgeStats': { 'zh-TW': '⏱ I2C Bridge 回報：{done}/{segs} 段、{ms} ms 總計{dev}{twr}）　進度訊息 {prog} 則　⇒ 網頁↔bridge 往返：**1 次**（舊做法 {old} 次）', 'en': '⏱ I2C Bridge reports: {done}/{segs} segments, {ms} ms total{dev}{twr})   progress messages: {prog}   ⇒ page↔bridge round trips: **1** (the old way took {old})', 'zh-CN': '⏱ I2C Bridge 回报：{done}/{segs} 段、{ms} ms 总计{dev}{twr}）　进度消息 {prog} 则　⇒ 网页↔bridge 往返：**1 次**（旧做法 {old} 次）' },
  'i2c.statDev':        { 'zh-TW': '（裝置側 {ms} ms', 'en': ' (device side {ms} ms', 'zh-CN': '（设备侧 {ms} ms' },
  'i2c.statTwr':        { 'zh-TW': '，段間等待 {ms} ms', 'en': ', inter-segment wait {ms} ms', 'zh-CN': '，段间等待 {ms} ms' },
  'i2c.logGapStats':    { 'zh-TW': '⏱ 段間距：目標 {want} ms　實測開銷 {ovh} ms　實際睡 {slept} ms　⇒ 實際段間距（估）{got} ms', 'en': '⏱ Segment gap: target {want} ms   measured overhead {ovh} ms   actually slept {slept} ms   ⇒ actual gap (estimated) {got} ms', 'zh-CN': '⏱ 段间距：目标 {want} ms　实测开销 {ovh} ms　实际睡 {slept} ms　⇒ 实际段间距（估）{got} ms' },
  'i2c.logGapZero':     { 'zh-TW': '　其中 {n} 次的目標已被固定開銷吃滿 ⇒ **未額外等待**（要更長的間距就把目標調大）', 'en': '   in {n} of them the fixed overhead already used up the target ⇒ **no extra wait** (raise the target for a longer gap)', 'zh-CN': '　其中 {n} 次的目标已被固定开销吃满 ⇒ **未额外等待**（要更长的间距就把目标调大）' },
  'i2c.logGapOldBridge':{ 'zh-TW': '　（這支 I2C Bridge 是 proto {proto}，還不懂目標段間距 ⇒ 它睡滿 {twr} ms，實際間距會比目標長。換新版 I2C Bridge 才會自動扣掉開銷。）', 'en': '   (this I2C Bridge is proto {proto} and does not understand the target gap yet ⇒ it sleeps the full {twr} ms, so the real gap is longer than the target. A newer I2C Bridge subtracts the overhead automatically.)', 'zh-CN': '　（这支 I2C Bridge 是 proto {proto}，还不懂目标段间距 ⇒ 它睡满 {twr} ms，实际间距会比目标长。换新版 I2C Bridge 才会自动扣掉开销。）' },
  'i2c.errAborted':     { 'zh-TW': '已中止', 'en': 'Aborted', 'zh-CN': '已中止' },
  'i2c.errBatchFail':   { 'zh-TW': '整批寫入失敗', 'en': 'Batch write failed', 'zh-CN': '整批写入失败' },
  'i2c.errAbortBetweenSegs':{ 'zh-TW': '已中止（在區段之間停下）', 'en': 'Aborted (stopped between runs)', 'zh-CN': '已中止（在区段之间停下）' },
  'i2c.logHalfWritten': { 'zh-TW': '　裝置現在的狀態：0x{a}–0x{b} 已寫入，0x{c} 之後的 {n} byte **沒有寫入** ⇒ 這是一份半更新的內容', 'en': '   Device state now: 0x{a}–0x{b} written; the {n} bytes from 0x{c} onwards were **not written** ⇒ the contents are half-updated', 'zh-CN': '　设备现在的状态：0x{a}–0x{b} 已写入，0x{c} 之后的 {n} byte **没有写入** ⇒ 这是一份半更新的内容' },
  'i2c.logBatchDone':   { 'zh-TW': '   ✔ 整批寫入完成（{n} byte）', 'en': '   ✔ Batch write finished ({n} bytes)', 'zh-CN': '   ✔ 整批写入完成（{n} byte）' },
  'i2c.logSegLine':     { 'zh-TW': '   段 {i}/{n} · {bytes} byte', 'en': '   segment {i}/{n} · {bytes} bytes', 'zh-CN': '   段 {i}/{n} · {bytes} byte' },
  'i2c.logWriteFail':   { 'zh-TW': '✕ 寫失敗（status {status}）{detail}', 'en': '✕ Write failed (status {status}){detail}', 'zh-CN': '✕ 写失败（status {status}）{detail}' },
  'i2c.logWroteOk':     { 'zh-TW': '   ✔ 已寫入（transferred {n}）', 'en': '   ✔ Written (transferred {n})', 'zh-CN': '   ✔ 已写入（transferred {n}）' },
  'i2c.logPickedSegs':  { 'zh-TW': '跳躍選取：{segs} 個不連續區段、共 {n} byte ⇒ **每一段各自重下一次 slave address ＋ offset**（斷開處不能靠位址自動遞增）　{list}', 'en': 'Non-adjacent selection: {segs} separate runs, {n} bytes in total ⇒ **each run re-issues the slave address and offset** (address auto-increment cannot cross a break)   {list}', 'zh-CN': '跳跃选取：{segs} 个不连续区段、共 {n} byte ⇒ **每一段各自重下一次 slave address ＋ offset**（断开处不能靠地址自动递增）　{list}' },
  'i2c.logLayers':      { 'zh-TW': '⏱ 分層：ws 最小 {min} / 平均 {avg} / 最大 {max} ms{dev}　⇒ 差額就是網頁端吃掉的', 'en': '⏱ Layers: ws min {min} / avg {avg} / max {max} ms{dev}   ⇒ the difference is what the page side costs', 'zh-CN': '⏱ 分层：ws 最小 {min} / 平均 {avg} / 最大 {max} ms{dev}　⇒ 差额就是网页端吃掉的' },
  'i2c.logLayersDev':   { 'zh-TW': '　裝置側平均 {ms} ms', 'en': '   device side avg {ms} ms', 'zh-CN': '　设备侧平均 {ms} ms' },
  'i2c.logReissue':     { 'zh-TW': '  ［區段 {i}/{n}］重下 slave 0x{slave} · offset {off} ⇒ 回讀 {bytes} byte', 'en': '  [run {i}/{n}] re-issuing slave 0x{slave} · offset {off} ⇒ reading back {bytes} bytes', 'zh-CN': '  ［区段 {i}/{n}］重下 slave 0x{slave} · offset {off} ⇒ 回读 {bytes} byte' },
  'i2c.cmpWroteRead':   { 'zh-TW': '{at}：寫 0x{w}、讀回 0x{r}', 'en': '{at}: wrote 0x{w}, read back 0x{r}', 'zh-CN': '{at}：写 0x{w}、读回 0x{r}' },
  'i2c.logVerifyStart': { 'zh-TW': '── 驗證：{how} 並逐 byte 比對 ──', 'en': '── Verify: {how}, comparing byte by byte ──', 'zh-CN': '── 验证：{how} 并逐 byte 比对 ──' },
  'i2c.verifyPerSeg':   { 'zh-TW': '逐區段回讀（{segs} 段、共 {n} byte），每段各自重下位址', 'en': 'reading back run by run ({segs} runs, {n} bytes total), each re-issuing its address', 'zh-CN': '逐区段回读（{segs} 段、共 {n} byte），每段各自重下地址' },
  'i2c.verifyWhole':    { 'zh-TW': '回讀剛寫的 {n} byte', 'en': 'reading back the {n} bytes just written', 'zh-CN': '回读刚写的 {n} byte' },
  'i2c.vdReadBack':     { 'zh-TW': '🔴 <b>驗證比對錯誤，需要再重新檢查</b>：{which}{n} byte <b>讀不回來</b>（{why}）⇒ 無法確認有沒有燒進去。', 'en': '🔴 <b>Verification failed and needs another look</b>: {which}{n} bytes <b>could not be read back</b> ({why}) ⇒ cannot confirm whether they were programmed.', 'zh-CN': '🔴 <b>验证比对错误，需要再重新检查</b>：{which}{n} byte <b>读不回来</b>（{why}）⇒ 无法确认有没有烧进去。' },
  'i2c.vdSegNth':       { 'zh-TW': '第 {i} 段 {at} 的 ', 'en': 'run {i} at {at}: ', 'zh-CN': '第 {i} 段 {at} 的 ' },
  'i2c.vdWritten':      { 'zh-TW': '寫入的 ', 'en': 'the written ', 'zh-CN': '写入的 ' },
  'i2c.logVerifyReadFail':{ 'zh-TW': '✕ 驗證失敗：讀不回來（{raw}）', 'en': '✕ Verification failed: could not read back ({raw})', 'zh-CN': '✕ 验证失败：读不回来（{raw}）' },
  'i2c.vdAllMatch':     { 'zh-TW': '✔ <b>寫入與回讀完全一致</b>：驗證 {n} byte，全部相同。', 'en': '✔ <b>Write and read-back match exactly</b>: {n} bytes verified, all identical.', 'zh-CN': '✔ <b>写入与回读完全一致</b>：验证 {n} byte，全部相同。' },
  'i2c.vdAllMatchSegs': { 'zh-TW': '（分 {segs} 段各自重下位址回讀）', 'en': ' (read back in {segs} runs, each re-issuing its address)', 'zh-CN': '（分 {segs} 段各自重下地址回读）' },
  'i2c.logVerifyOk':    { 'zh-TW': '✔ 驗證比對正確（{n} byte 全部相同{segs}）', 'en': '✔ Verification passed ({n} bytes all identical{segs})', 'zh-CN': '✔ 验证比对正确（{n} byte 全部相同{segs}）' },
  'i2c.logVerifyOkSegs':{ 'zh-TW': '，{segs} 段', 'en': ', {segs} runs', 'zh-CN': '，{segs} 段' },
  'i2c.vdMismatch':     { 'zh-TW': '🔴 <b>寫入與回讀不一致</b>：{n} byte 中有 <b>{bad} byte</b> 不同（已在表格上標紅）。<br>', 'en': '🔴 <b>Write and read-back differ</b>: <b>{bad} of {n} bytes</b> are different (marked red in the table).<br>', 'zh-CN': '🔴 <b>写入与回读不一致</b>：{n} byte 中有 <b>{bad} byte</b> 不同（已在表格上标红）。<br>' },
  'i2c.vdMoreInLog':    { 'zh-TW': '　…其餘 {n} 筆見下方 log', 'en': '   …{n} more in the log below', 'zh-CN': '　…其余 {n} 条见下方 log' },
  'i2c.logVerifyBad':   { 'zh-TW': '✕ 驗證比對錯誤：{bad}/{n} byte 不符', 'en': '✕ Verification failed: {bad}/{n} bytes do not match', 'zh-CN': '✕ 验证比对错误：{bad}/{n} byte 不符' },
  'i2c.logOnlyFirst20': { 'zh-TW': '（上面只列前 20 筆）', 'en': ' (only the first 20 are listed above)', 'zh-CN': '（上面只列前 20 条）' },
  'i2c.headWrote':      { 'zh-TW': '已寫入 {n} byte（{t}，來源：{src}）', 'en': 'Wrote {n} bytes ({t}, source: {src})', 'zh-CN': '已写入 {n} byte（{t}，来源：{src}）' },
  'i2c.headLeft':       { 'zh-TW': '。🔴 <b>還有 {n} byte 改過但沒寫到</b>（不在這次的範圍內）', 'en': '. 🔴 <b>{n} more bytes were edited but not written</b> (outside this range)', 'zh-CN': '。🔴 <b>还有 {n} byte 改过但没写到</b>（不在这次的范围内）' },
  'i2c.headParen':      { 'zh-TW': '　<span style="opacity:.75">（{head}）</span>', 'en': '   <span style="opacity:.75">({head})</span>', 'zh-CN': '　<span style="opacity:.75">（{head}）</span>' },
  'i2c.headNoVerify':   { 'zh-TW': '。表格顯示的是<b>剛送出的值</b>，不是回讀值 —— 要確認請按「讀取」。', 'en': '. The table shows <b>the values just sent</b>, not values read back — press "Read" to confirm.', 'zh-CN': '。表格显示的是<b>刚发出的值</b>，不是回读值 —— 要确认请按“读取”。' },
  'i2c.flashVerifyOk':  { 'zh-TW': '✔ 驗證比對正確', 'en': '✔ Verification passed', 'zh-CN': '✔ 验证比对正确' },
  'i2c.flashVerifyBad': { 'zh-TW': '🔴 驗證比對錯誤', 'en': '🔴 Verification failed', 'zh-CN': '🔴 验证比对错误' },
  'i2c.rangeHalf':      { 'zh-TW': '⇒ <b>0x{a}–0x{b} 已經寫進去</b>，<b>0x{c} 之後的 {n} byte 沒有寫入</b>（裝置上現在是一份半更新的內容）', 'en': '⇒ <b>0x{a}–0x{b} were written</b>, <b>the {n} bytes from 0x{c} onwards were not</b> (the device now holds half-updated contents)', 'zh-CN': '⇒ <b>0x{a}–0x{b} 已经写进去</b>，<b>0x{c} 之后的 {n} byte 没有写入</b>（设备上现在是一份半更新的内容）' },
  'i2c.rangeNone':      { 'zh-TW': '⇒ <b>一個 byte 都沒有寫入</b>，裝置維持原本的內容', 'en': '⇒ <b>not a single byte was written</b>; the device still holds its original contents', 'zh-CN': '⇒ <b>一个 byte 都没有写入</b>，设备维持原本的内容' },
  'i2c.rangeAll':       { 'zh-TW': '⇒ 全部 {n} byte 都已寫入', 'en': '⇒ all {n} bytes were written', 'zh-CN': '⇒ 全部 {n} byte 都已写入' },
  'i2c.segsDone':       { 'zh-TW': '<b>前 {n} 段已經完整寫入</b>（{list}）', 'en': '<b>the first {n} runs were written in full</b> ({list})', 'zh-CN': '<b>前 {n} 段已经完整写入</b>（{list}）' },
  'i2c.segsNone':       { 'zh-TW': '<b>沒有任何一段完整寫入</b>', 'en': '<b>no run was written in full</b>', 'zh-CN': '<b>没有任何一段完整写入</b>' },
  'i2c.segPartial':     { 'zh-TW': '第 {i} 段 {at} <b>只寫了 {done} / {all} byte</b>', 'en': 'run {i} at {at} <b>wrote only {done} / {all} bytes</b>', 'zh-CN': '第 {i} 段 {at} <b>只写了 {done} / {all} byte</b>' },
  'i2c.segsRest':       { 'zh-TW': '其後 <b>{n} 段一個 byte 都沒送出</b>', 'en': 'the remaining <b>{n} runs sent nothing at all</b>', 'zh-CN': '其后 <b>{n} 段一个 byte 都没发出</b>' },
  'i2c.deviceHalf':     { 'zh-TW': '（裝置上現在是一份半更新的內容）', 'en': ' (the device now holds half-updated contents)', 'zh-CN': '（设备上现在是一份半更新的内容）' },
  'i2c.bnAborted':      { 'zh-TW': '■ <b>已中止整批寫入</b>（{done} / {total} byte）', 'en': '■ <b>Batch write aborted</b> ({done} / {total} bytes)', 'zh-CN': '■ <b>已中止整批写入</b>（{done} / {total} byte）' },
  'i2c.bnLeftLocal':    { 'zh-TW': '。本地仍有 {n} byte 改過沒寫', 'en': '. {n} bytes are still edited locally and unwritten', 'zh-CN': '。本地仍有 {n} byte 改过没写' },
  'i2c.bnLeftLocal2':   { 'zh-TW': '，本地仍有 {n} byte 改過沒寫', 'en': ', and {n} bytes are still edited locally and unwritten', 'zh-CN': '，本地仍有 {n} byte 改过没写' },
  'i2c.bnAbortedHow':   { 'zh-TW': '。要完成請重新按一次寫入（會從頭寫），或按「讀取」看裝置現在的內容。', 'en': '. To finish, press Write again (it starts from the beginning), or press Read to see what the device holds now.', 'zh-CN': '。要完成请重新按一次写入（会从头写），或按“读取”看设备现在的内容。' },
  'i2c.logAbortedAt':   { 'zh-TW': '■ 整批寫入已中止於第 {n} byte：{err}', 'en': '■ Batch write aborted at byte {n}: {err}', 'zh-CN': '■ 整批写入已中止于第 {n} byte：{err}' },
  'i2c.bnWriteFailAt':  { 'zh-TW': '寫到第 {n} byte 時失敗（{err}）', 'en': 'Failed while writing byte {n} ({err})', 'zh-CN': '写到第 {n} byte 时失败（{err}）' },
  'i2c.logWriteFailAt': { 'zh-TW': '✕ 整批寫入失敗於第 {n} byte：{err}', 'en': '✕ Batch write failed at byte {n}: {err}', 'zh-CN': '✕ 整批写入失败于第 {n} byte：{err}' },
  'i2c.bnCellWriteFail':{ 'zh-TW': '0x{at} 沒有寫進去（{err}）⇒ 已還原成 0x{old}', 'en': '0x{at} was not written ({err}) ⇒ restored to 0x{old}', 'zh-CN': '0x{at} 没有写进去（{err}）⇒ 已还原成 0x{old}' },
  'i2c.logCellWriteFail':{ 'zh-TW': '✕ 寫入失敗 ⇒ 還原：0x{at} 維持 0x{old}', 'en': '✕ Write failed ⇒ reverted: 0x{at} stays 0x{old}', 'zh-CN': '✕ 写入失败 ⇒ 还原：0x{at} 维持 0x{old}' },
  'i2c.bnCellReadBackFail':{ 'zh-TW': '0x{at} 寫入後回讀失敗（{err}）⇒ 無法確認有沒有寫進去', 'en': '0x{at} was written but could not be read back ({err}) ⇒ cannot confirm it went in', 'zh-CN': '0x{at} 写入后回读失败（{err}）⇒ 无法确认有没有写进去' },
  'i2c.bnCellMismatch': { 'zh-TW': '🔴 <b>寫入與回讀不一致</b>（1 byte 中有 <b>1 byte</b> 不同）：0x{at} 寫入 <b>0x{w}</b>、讀回 <b>0x{r}</b>。表格顯示的是裝置上的實際值。', 'en': '🔴 <b>Write and read-back differ</b> (<b>1</b> of 1 byte): 0x{at} was written as <b>0x{w}</b> but read back as <b>0x{r}</b>. The table shows the actual value on the device.', 'zh-CN': '🔴 <b>写入与回读不一致</b>（1 byte 中有 <b>1 byte</b> 不同）：0x{at} 写入 <b>0x{w}</b>、读回 <b>0x{r}</b>。表格显示的是设备上的实际值。' },
  'i2c.logCellMismatch':{ 'zh-TW': '✕ 回讀不符：{at}：寫 0x{w}、讀回 0x{r}', 'en': '✕ Read-back mismatch: {at}: wrote 0x{w}, read back 0x{r}', 'zh-CN': '✕ 回读不符：{at}：写 0x{w}、读回 0x{r}' },
  'i2c.bnCellOk':       { 'zh-TW': '✔ <b>寫入與回讀完全一致</b>：0x{at} ＝ 0x{v}（驗證 1 byte）', 'en': '✔ <b>Write and read-back match exactly</b>: 0x{at} = 0x{v} (1 byte verified)', 'zh-CN': '✔ <b>写入与回读完全一致</b>：0x{at} ＝ 0x{v}（验证 1 byte）' },
  'i2c.logCellOk':      { 'zh-TW': '✔ 回讀相符：0x{at} ＝ 0x{v}', 'en': '✔ Read-back matches: 0x{at} = 0x{v}', 'zh-CN': '✔ 回读相符：0x{at} ＝ 0x{v}' },

  /* ── 載入檔案 ──────────────────────────────────────────────────────── */
  'i2c.logCancelLoad':  { 'zh-TW': '取消載入（保留未寫入的本地修改）', 'en': 'Load cancelled (unwritten local edits kept)', 'zh-CN': '取消载入（保留未写入的本地修改）' },
  'i2c.logCancelLoadAB':{ 'zh-TW': '取消載入（A、B 都保持原樣）', 'en': 'Load cancelled (A and B both unchanged)', 'zh-CN': '取消载入（A、B 都保持原样）' },
  'i2c.logLoadFail':    { 'zh-TW': '✕ 載入 {name} 失敗：{err}', 'en': '✕ Failed to load {name}: {err}', 'zh-CN': '✕ 载入 {name} 失败：{err}' },
  'i2c.logLoaded':      { 'zh-TW': '載入 {name}：{fmt} · {n} byte', 'en': 'Loaded {name}: {fmt} · {n} bytes', 'zh-CN': '载入 {name}：{fmt} · {n} byte' },
  'i2c.logOverMax':     { 'zh-TW': '　⚠ 超過一次上限 {max}，總 byte 數已設為上限', 'en': '   ⚠ exceeds the per-operation limit of {max}; the total byte count was set to the limit', 'zh-CN': '　⚠ 超过一次上限 {max}，总 byte 数已设为上限' },
  'i2c.bnLoaded':       { 'zh-TW': '已載入：{fmt} · {n} byte，確認後按「寫入」', 'en': 'Loaded: {fmt} · {n} bytes — check it, then press "Write"', 'zh-CN': '已载入：{fmt} · {n} byte，确认后按“写入”' },
  'i2c.logLoadReplaceB':{ 'zh-TW': '載入 {name} ⇒ 取代 B（A 不動、不重新快照）', 'en': 'Loaded {name} ⇒ replaces B (A untouched, no new snapshot)', 'zh-CN': '载入 {name} ⇒ 替换 B（A 不动、不重新快照）' },
  'i2c.logLoadReplaceAKeepB':{ 'zh-TW': '載入 {name} ⇒ 取代 A（重新快照），B 保留並與新的 A 比較', 'en': 'Loaded {name} ⇒ replaces A (new snapshot); B is kept and compared against the new A', 'zh-CN': '载入 {name} ⇒ 替换 A（重新快照），B 保留并与新的 A 比较' },
  'i2c.logLoadReplaceAClearB':{ 'zh-TW': '載入 {name} ⇒ 取代 A（重新快照），B 清空', 'en': 'Loaded {name} ⇒ replaces A (new snapshot); B cleared', 'zh-CN': '载入 {name} ⇒ 替换 A（重新快照），B 清空' },
  'i2c.logSwitchToTyped':{ 'zh-TW': '改用手動輸入（已放掉載入的檔案）', 'en': 'Switched to typed input (the loaded file was dropped)', 'zh-CN': '改用手动输入（已放掉载入的文件）' },

  /* ── 自檢 ──────────────────────────────────────────────────────────── */
  'i2c.logSelfStart':   { 'zh-TW': '── 自檢：黃金向量 slave 0x68 / offset 2B / 0x0000 ×3，期望 {expect} ──', 'en': '── Self-test: golden vector slave 0x68 / offset 2B / 0x0000 ×3, expecting {expect} ──', 'zh-CN': '── 自检：黄金向量 slave 0x68 / offset 2B / 0x0000 ×3，期望 {expect} ──' },
  'i2c.selfIdVec':      { 'zh-TW': '　0xFF00 → {got}{note}', 'en': '   0xFF00 → {got}{note}', 'zh-CN': '　0xFF00 → {got}{note}' },
  'i2c.selfIdSame':     { 'zh-TW': '（與已知的 01 EF A1 相同）', 'en': ' (same as the known 01 EF A1)', 'zh-CN': '（与已知的 01 EF A1 相同）' },
  'i2c.selfIdKnown':    { 'zh-TW': '（已知樣本是 01 EF A1）', 'en': ' (the known sample is 01 EF A1)', 'zh-CN': '（已知样本是 01 EF A1）' },
  'i2c.selfAllFF':      { 'zh-TW': ' ⚠ 全 FF ＝ 無回應', 'en': ' ⚠ all FF = no response', 'zh-CN': ' ⚠ 全 FF ＝ 无响应' },
  'i2c.bnSelfOk':       { 'zh-TW': '✔ 自檢通過：0x0000 讀回 {got}，與黃金向量一致。', 'en': '✔ Self-test passed: 0x0000 read back {got}, matching the golden vector.', 'zh-CN': '✔ 自检通过：0x0000 读回 {got}，与黄金向量一致。' },
  'i2c.logSelfOk':      { 'zh-TW': '✔ 自檢通過：{got}', 'en': '✔ Self-test passed: {got}', 'zh-CN': '✔ 自检通过：{got}' },
  'i2c.selfAuto':       { 'zh-TW': '（連線後自動跑）', 'en': ' (ran automatically after connecting)', 'zh-CN': '（连接后自动跑）' },
  'i2c.selfWhyAllFF':   { 'zh-TW': '讀回 {got} ＝ 全 FF ＝ 總線閒置／無裝置回應', 'en': 'read back {got} = all FF = idle bus / no device response', 'zh-CN': '读回 {got} ＝ 全 FF ＝ 总线空闲／无设备响应' },
  'i2c.selfWhyDiff':    { 'zh-TW': '讀回 {got}，與期望的 {want} 不同', 'en': 'read back {got}, which differs from the expected {want}', 'zh-CN': '读回 {got}，与期望的 {want} 不同' },
  'i2c.bnSelfFail':     { 'zh-TW': '自檢未通過（{why}）', 'en': 'Self-test failed ({why})', 'zh-CN': '自检未通过（{why}）' },
  'i2c.logSelfFail':    { 'zh-TW': '✕ 自檢未通過：{why}', 'en': '✕ Self-test failed: {why}', 'zh-CN': '✕ 自检未通过：{why}' },

  /* ── 快慢路徑比對 ─────────────────────────────────────────────────── */
  'i2c.logCmpStart':    { 'zh-TW': '── 快慢路徑比對：同一段 {n} byte 各讀一次 ──', 'en': '── Fast vs. normal path: reading the same {n} bytes once on each ──', 'zh-CN': '── 快慢路径比对：同一段 {n} byte 各读一次 ──' },
  'i2c.bnCmpIncomplete':{ 'zh-TW': '🔴 比對沒完成：{why}{tail}', 'en': '🔴 Comparison did not finish: {why}{tail}', 'zh-CN': '🔴 比对没完成：{why}{tail}' },
  'i2c.cmpFastFail':    { 'zh-TW': '快速模式讀失敗（{err}）⇒ <b>不要開快速模式</b>', 'en': 'the fast path failed to read ({err}) ⇒ <b>do not turn fast mode on</b>', 'zh-CN': '快速模式读失败（{err}）⇒ <b>不要开快速模式</b>' },
  'i2c.cmpSlowFail':    { 'zh-TW': '一般模式讀失敗（{err}）', 'en': 'the normal path failed to read ({err})', 'zh-CN': '普通模式读失败（{err}）' },
  'i2c.cmpRevertedTail':{ 'zh-TW': '，已自動改回預設的讀取方式。', 'en': '; the default read path has been restored automatically.', 'zh-CN': '，已自动改回默认的读取方式。' },
  'i2c.bnCmpSame':      { 'zh-TW': '✔ <b>快速模式與一般模式讀到的 {n} byte 完全相同</b>：快速 {fast}、一般 {slow}　⇒ <b>快 {x} 倍，可以放心用快速模式</b>。', 'en': '✔ <b>Fast and normal modes read the same {n} bytes exactly</b>: fast {fast}, normal {slow}   ⇒ <b>{x}× faster — fast mode is safe to use</b>.', 'zh-CN': '✔ <b>快速模式与普通模式读到的 {n} byte 完全相同</b>：快速 {fast}、普通 {slow}　⇒ <b>快 {x} 倍，可以放心用快速模式</b>。' },
  'i2c.logCmpSame':     { 'zh-TW': '✔ 路徑比對：{n} byte 全部相同（快 {fast} ms vs 一般 {slow} ms）', 'en': '✔ Path comparison: all {n} bytes identical (fast {fast} ms vs normal {slow} ms)', 'zh-CN': '✔ 路径比对：{n} byte 全部相同（快 {fast} ms vs 普通 {slow} ms）' },
  'i2c.bnCmpDiff':      { 'zh-TW': '🔴 <b>快速模式讀到的值不一樣</b>：{n} byte 中有 {bad} byte 不符（第一個在 +{first}）⇒ <b>不要用快速模式</b>', 'en': '🔴 <b>Fast mode read different values</b>: {bad} of {n} bytes do not match (first at +{first}) ⇒ <b>do not use fast mode</b>', 'zh-CN': '🔴 <b>快速模式读到的值不一样</b>：{n} byte 中有 {bad} byte 不符（第一个在 +{first}）⇒ <b>不要用快速模式</b>' },
  'i2c.logCmpDiff':     { 'zh-TW': '✕ 路徑比對：{bad}/{n} byte 不符，第一個在 +{first}', 'en': '✕ Path comparison: {bad}/{n} bytes do not match, first at +{first}', 'zh-CN': '✕ 路径比对：{bad}/{n} byte 不符，第一个在 +{first}' },
  'i2c.logMidFail':     { 'zh-TW': '· 中速模式讀失敗：{err}', 'en': '· Medium mode failed to read: {err}', 'zh-CN': '· 中速模式读失败：{err}' },
  'i2c.noResult':       { 'zh-TW': '沒有結果', 'en': 'no result', 'zh-CN': '没有结果' },
  'i2c.logMidResult':   { 'zh-TW': '· 中速模式：{ms} ms，{what}', 'en': '· Medium mode: {ms} ms, {what}', 'zh-CN': '· 中速模式：{ms} ms，{what}' },
  'i2c.nBadBytes':      { 'zh-TW': '{n} byte 不符', 'en': '{n} bytes do not match', 'zh-CN': '{n} byte 不符' },
  'i2c.dataSame':       { 'zh-TW': '資料相同', 'en': 'data identical', 'zh-CN': '数据相同' },
  'i2c.vdReadFail':     { 'zh-TW': '讀失敗', 'en': 'read failed', 'zh-CN': '读失败' },
  'i2c.vdBadN':         { 'zh-TW': '不符 {n}', 'en': '{n} mismatched', 'zh-CN': '不符 {n}' },
  'i2c.vdSame':         { 'zh-TW': '相同', 'en': 'identical', 'zh-CN': '相同' },
  'i2c.vdSameX':        { 'zh-TW': '相同 · 快 {x}×', 'en': 'identical · {x}× faster', 'zh-CN': '相同 · 快 {x}×' },
  'i2c.vdBaseline':     { 'zh-TW': '基準', 'en': 'baseline', 'zh-CN': '基准' },

  /* ── bridge 錯誤字串的翻譯（原文只進 log）───────────────────────────── */
  'i2c.emNotOpen':      { 'zh-TW': '和治具的連線不在了，請重新連線', 'en': 'The connection to the adapter is gone — please reconnect', 'zh-CN': '和工装的连接不在了，请重新连接' },
  'i2c.emBadAwid':      { 'zh-TW': 'offset 寬度只能是 0／1／2／4 byte', 'en': 'The offset width can only be 0, 1, 2 or 4 bytes', 'zh-CN': 'offset 宽度只能是 0／1／2／4 byte' },
  'i2c.emBadData':      { 'zh-TW': '這次要寫的資料長度超過單則上限', 'en': 'The data length for this write exceeds the per-transfer limit', 'zh-CN': '这次要写的数据长度超过单则上限' },
  'i2c.emAddrBlocked':  { 'zh-TW': '這個位址不在允許寫入的範圍內', 'en': 'This address is outside the range allowed for writing', 'zh-CN': '这个地址不在允许写入的范围内' },
  'i2c.emBusy':         { 'zh-TW': '治具正被別的分頁使用中', 'en': 'The adapter is in use by another tab', 'zh-CN': '工装正被别的标签页使用中' },
  'i2c.emTimeout':      { 'zh-TW': '治具沒有在時間內回應', 'en': 'The adapter did not respond in time', 'zh-CN': '工装没有在时间内响应' },
  'i2c.emBadAck':       { 'zh-TW': '讀回來的資料沒有通過檢查，整批已丟棄（沒有交出可能是錯的值）。請重試一次；一直發生就重插治具、放慢速度，或一次少讀一點', 'en': 'The data read back failed its check, so the whole batch was discarded rather than handing over possibly wrong values. Try again; if it keeps happening, re-plug the adapter, slow the clock down, or read less at a time', 'zh-CN': '读回来的数据没有通过检查，整批已丢弃（没有交出可能是错的值）。请重试一次；一直发生就重插工装、放慢速度，或一次少读一点' },
  'i2c.emNack':         { 'zh-TW': '裝置沒有回應。確認 slave 位址對不對、板子有沒有供電、治具有沒有接好', 'en': 'The device did not respond. Check the slave address, whether the board is powered, and whether the adapter is properly connected', 'zh-CN': '设备没有响应。确认 slave 地址对不对、板子有没有供电、工装有没有接好' },
  'i2c.emNoWrite':      { 'zh-TW': '這條路徑目前不支援寫入', 'en': 'This path does not support writing yet', 'zh-CN': '这条路径目前不支持写入' },
  'i2c.emNoReply':      { 'zh-TW': '沒有回應', 'en': 'No response', 'zh-CN': '没有响应' },
  'i2c.emGeneric':      { 'zh-TW': '沒有完成（詳細原因已記在下方 log）', 'en': 'Did not complete (the detailed reason is in the log below)', 'zh-CN': '没有完成（详细原因已记在下方 log）' },
  'i2c.logBridgeRaw':   { 'zh-TW': 'bridge err（原文，僅供診斷）：{s}', 'en': 'bridge err (raw text, for diagnosis only): {s}', 'zh-CN': 'bridge err（原文，仅供诊断）：{s}' },
  'i2c.logSlaveFixed':  { 'zh-TW': 'slave {which} 自動修正：0x{from} → 0x{to}', 'en': 'slave {which} auto-corrected: 0x{from} → 0x{to}', 'zh-CN': 'slave {which} 自动修正：0x{from} → 0x{to}' },

  /* ── 下載卡、版本比對 ─────────────────────────────────────────────── */
  'i2c.dlBtn':          { 'zh-TW': '⬇ 下載 I2C Bridge {ver}', 'en': '⬇ Download I2C Bridge {ver}', 'zh-CN': '⬇ 下载 I2C Bridge {ver}' },
  'i2c.dlMissing':      { 'zh-TW': '⬇ 下載連結缺失（HELPER_PKG 沒載到）', 'en': '⬇ Download link missing (HELPER_PKG did not load)', 'zh-CN': '⬇ 下载链接缺失（HELPER_PKG 没载到）' },
  'i2c.dlMeta':         { 'zh-TW': ' · 內含 exe {exe}（proto {proto}）', 'en': ' · contains exe {exe} (proto {proto})', 'zh-CN': ' · 内含 exe {exe}（proto {proto}）' },
  'i2c.offlineNotice':  { 'zh-TW': '離線打包版 {ver} · 更新到 <a href="{url}" target="_blank" rel="noopener">線上版</a>', 'en': 'Offline bundled copy {ver} · update at the <a href="{url}" target="_blank" rel="noopener">online version</a>', 'zh-CN': '离线打包版 {ver} · 更新到 <a href="{url}" target="_blank" rel="noopener">在线版</a>' },
  'i2c.sumOffline':     { 'zh-TW': '（離線版 {ver}）', 'en': ' (offline copy {ver})', 'zh-CN': '（离线版 {ver}）' },
  'i2c.sumOnline':      { 'zh-TW': '（線上版 · {ver}）', 'en': ' (online · {ver})', 'zh-CN': '（在线版 · {ver}）' },
  'i2c.logVerCheck':    { 'zh-TW': '自動版本比對：本機 {local}，線上 {online}', 'en': 'Automatic version check: local {local}, online {online}', 'zh-CN': '自动版本比对：本机 {local}，在线 {online}' },
  'i2c.bnNewVersion':   { 'zh-TW': 'I2C Bridge 有新版 <b>{ver}</b>：<a href="{href}" download>下載</a>', 'en': 'A newer I2C Bridge <b>{ver}</b> is available: <a href="{href}" download>download</a>', 'zh-CN': 'I2C Bridge 有新版 <b>{ver}</b>：<a href="{href}" download>下载</a>' },
  'i2c.logVerCheckFail':{ 'zh-TW': '自動版本比對失敗（靜默，不影響使用）：{msg}', 'en': 'Automatic version check failed (silently; does not affect use): {msg}', 'zh-CN': '自动版本比对失败（静默，不影响使用）：{msg}' },
  'i2c.logCopied':      { 'zh-TW': '（log 已複製到剪貼簿）', 'en': '(log copied to the clipboard)', 'zh-CN': '（log 已复制到剪贴板）' },
  'i2c.logCopyFail':    { 'zh-TW': '複製失敗：{msg}', 'en': 'Copy failed: {msg}', 'zh-CN': '复制失败：{msg}' },
  'i2c.logRawMpsse':    { 'zh-TW': '快速模式（自建）⇒ {s}', 'en': 'Fast mode (self-built) ⇒ {s}', 'zh-CN': '快速模式（自建）⇒ {s}' },
  'i2c.logCkDelay':     { 'zh-TW': '讀取間隔 ⇒ {v}', 'en': 'Read setup delay ⇒ {v}', 'zh-CN': '读取间隔 ⇒ {v}' },
  'i2c.log3Phase':      { 'zh-TW': '三相時脈 ⇒ {s}', 'en': '3-phase clocking ⇒ {s}', 'zh-CN': '三相时钟 ⇒ {s}' },
  'i2c.logFastRead':    { 'zh-TW': 'fast read ⇒ {s}', 'en': 'fast read ⇒ {s}', 'zh-CN': 'fast read ⇒ {s}' },

  /* ═══════════════════════════════════════════════════════════════════════
     dst.* — TCON 自檢畫面量測（dg-selftest.html）
     🔴 這一頁從第一版就三語齊備，不是事後補的。
        交易層的 log 行（`R 0xFF00 x3 -> 01 EF A1` 那種）刻意**不翻譯** ——
        它是給維護者與現場對照用的，翻了兩邊反而對不起來。
        使用者要看的判斷、狀態、錯誤一律走這裡。
     ═══════════════════════════════════════════════════════════════════════ */
  /* ── 頁首 ─────────────────────────────────────────────────────────── */
  'dst.title':          { 'zh-TW': 'TCON 自檢畫面量測', 'en': 'TCON Self-Test Pattern Measurement', 'zh-CN': 'TCON 自检画面量测' },
  'dst.subtitle':       { 'zh-TW': '由 TCON 自己出圖，逐階取 x / y / Y', 'en': 'The TCON paints the pattern itself; x / y / Y are read step by step', 'zh-CN': '由 TCON 自己出图，逐阶取 x / y / Y' },
  'dst.unverified':     {
    'zh-TW': '⚠ 這一頁會寫入 TCON 的暫存器。全部七顆 IC 的寫入序列都是逐行照抄上游工具 V1.5.0 的反組譯，但沒有任何一顆在真機上跑過。第一次用請先確認手上的板子是可以重刷的。',
    'en': '⚠ This page writes to the TCON registers. Every write sequence for all seven ICs is copied line by line from the upstream tool V1.5.0 decompile, but not one of them has ever been run on real hardware. Before the first use, make sure the board in your hand can be re-flashed.',
    'zh-CN': '⚠ 这一页会写入 TCON 的暂存器。全部七颗 IC 的写入序列都是逐行照抄上游工具 V1.5.0 的反编译，但没有任何一颗在真机上跑过。第一次用请先确认手上的板子是可以重刷的。' },

  /* ── 卡片標題 ─────────────────────────────────────────────────────── */
  'dst.hdLink':         { 'zh-TW': 'I2C 連線與 IC 識別', 'en': 'I2C link and IC identification', 'zh-CN': 'I2C 连线与 IC 识别' },
  'dst.hdPattern':      { 'zh-TW': '出圖', 'en': 'Pattern', 'zh-CN': '出图' },
  'dst.hdMeasure':      { 'zh-TW': '量測', 'en': 'Measurement', 'zh-CN': '量测' },
  'dst.hdLog':          { 'zh-TW': '紀錄', 'en': 'Log', 'zh-CN': '纪录' },

  /* ── 狀態 ─────────────────────────────────────────────────────────── */
  'dst.stOff':          { 'zh-TW': '未連線', 'en': 'Not linked', 'zh-CN': '未连线' },
  'dst.stOn':           { 'zh-TW': '已連線', 'en': 'Linked', 'zh-CN': '已连线' },
  'dst.stBusy':         { 'zh-TW': '處理中…', 'en': 'Working…', 'zh-CN': '处理中…' },
  'dst.stCaOff':        { 'zh-TW': '儀器未連線', 'en': 'Meter not linked', 'zh-CN': '仪器未连线' },
  'dst.stCaOn':         { 'zh-TW': '儀器已連線', 'en': 'Meter linked', 'zh-CN': '仪器已连线' },

  /* ── 按鈕 ─────────────────────────────────────────────────────────── */
  'dst.btnProbe':       { 'zh-TW': '重新識別', 'en': 'Identify again', 'zh-CN': '重新识别' },
  'dst.btnQw':          { 'zh-TW': '白', 'en': 'White', 'zh-CN': '白' },
  'dst.btnQr':          { 'zh-TW': '紅', 'en': 'Red', 'zh-CN': '红' },
  'dst.btnQg':          { 'zh-TW': '綠', 'en': 'Green', 'zh-CN': '绿' },
  'dst.btnQb':          { 'zh-TW': '藍', 'en': 'Blue', 'zh-CN': '蓝' },
  'dst.btnAlign':       { 'zh-TW': '對位畫面（L127 ＋ 中心十字）', 'en': 'Alignment pattern (L127 + centre cross)', 'zh-CN': '对位画面（L127 ＋ 中心十字）' },
  'dst.btnCrossOn':     { 'zh-TW': '十字 ON', 'en': 'Cross ON', 'zh-CN': '十字 ON' },
  'dst.btnCrossOff':    { 'zh-TW': '十字 OFF', 'en': 'Cross OFF', 'zh-CN': '十字 OFF' },
  'dst.btnLeave':       { 'zh-TW': '離開出圖模式', 'en': 'Leave pattern mode', 'zh-CN': '离开出图模式' },
  'dst.btnRun':         { 'zh-TW': '開始掃描', 'en': 'Start scan', 'zh-CN': '开始扫描' },
  'dst.btnStop':        { 'zh-TW': '■ 停止', 'en': '■ Stop', 'zh-CN': '■ 停止' },
  'dst.btnCsv':         { 'zh-TW': '匯出 CSV', 'en': 'Export CSV', 'zh-CN': '汇出 CSV' },
  'dst.btnCopyLog':     { 'zh-TW': '複製紀錄', 'en': 'Copy log', 'zh-CN': '复制纪录' },
  'dst.btnClearLog':    { 'zh-TW': '清除', 'en': 'Clear', 'zh-CN': '清除' },

  /* ── 觀測列 ───────────────────────────────────────────────────────── */
  'dst.kvBridge':       { 'zh-TW': 'I2C Bridge', 'en': 'I2C Bridge', 'zh-CN': 'I2C Bridge' },
  'dst.kvComm':         { 'zh-TW': '匯流排讀回測試', 'en': 'Bus read-back', 'zh-CN': '总线读回测试' },
  'dst.kvId':           { 'zh-TW': '0xFF00（IC ID）', 'en': '0xFF00 (IC ID)', 'zh-CN': '0xFF00（IC ID）' },
  'dst.kvIc':           { 'zh-TW': 'IC 型號', 'en': 'IC model', 'zh-CN': 'IC 型号' },
  'dst.kvRes':          { 'zh-TW': '解析度', 'en': 'Resolution', 'zh-CN': '分辨率' },
  'dst.kvWr':           { 'zh-TW': '可寫入位址', 'en': 'Writable addresses', 'zh-CN': '可写入地址' },
  'dst.kvSend':         { 'zh-TW': '送進 IC 的 12-bit 值', 'en': '12-bit values sent to the IC', 'zh-CN': '送进 IC 的 12-bit 值' },
  'dst.kvHz':           { 'zh-TW': '畫面更新率', 'en': 'Refresh rate', 'zh-CN': '画面更新率' },

  /* ── 設定與說明 ───────────────────────────────────────────────────── */
  'dst.lbBits':         { 'zh-TW': '灰階位元深度', 'en': 'Grey-level bit depth', 'zh-CN': '灰阶位深度' },
  'dst.lbSettle':       { 'zh-TW': '換階等待', 'en': 'Settle time between steps', 'zh-CN': '换阶等待' },
  'dst.settleNote':     { 'zh-TW': '出圖之後、叫儀器量之前等這麼久。上游工具的預設值就是 700 ms。', 'en': 'How long to wait after painting a step and before asking the meter to measure. 700 ms is the upstream tool default.', 'zh-CN': '出图之后、叫仪器量之前等这么久。上游工具的默认值就是 700 ms。' },
  /* 🔴 `end` 是使用者刻度的最後一階（255／1020／4080），`end12` 是它送進 IC 的
     12-bit 值 —— 三種深度換算完**都是 4080**。兩個數字都要講，只講一個會被誤讀。 */
  'dst.bitsNote':       { 'zh-TW': '送進 IC ＝ 你填的值 × {mul}；掃描 0…{end}，最亮那一階送出去是 {end12}', 'en': 'Sent to the IC = your value × {mul}; the scan runs 0…{end} and the brightest step goes out as {end12}', 'zh-CN': '送进 IC ＝ 你填的值 × {mul}；扫描 0…{end}，最亮那一阶送出去是 {end12}' },
  'dst.crossNote':      { 'zh-TW': '十字是紅色的一條細線，位置固定在畫面正中心；線寬不可調（暫存器裡沒有這個欄位）。', 'en': 'The cross is a thin red line fixed at the centre of the screen. Its width cannot be set — there is no such register field.', 'zh-CN': '十字是红色的一条细线，位置固定在画面正中心；线宽不可调（暂存器里没有这个字段）。' },
  /* 🔴 v1.2.0：帶上**實際讀到的 ID** 與**共用這個 ID 的是哪幾顆** ——
     不說是哪個 ID、哪兩顆，讀的人沒辦法自己確認。 */
  'dst.altWhy':         { 'zh-TW': '自動識別讀到的 ID 是 {id}，而 {names} 這幾顆的 ID 完全相同，上游工具自己也分不出來。板子上是哪一顆只有你知道，請指定 —— 選錯只影響十字線與寫入順序，不會寫壞 IC。',
                          'en': 'The auto-detected ID is {id}, and {names} return exactly the same ID — the upstream tool cannot tell them apart either. Only you know which one is on the board, so please pick it. Picking the wrong one only affects the cross and the write order; it cannot damage the IC.',
                          'zh-CN': '自动识别读到的 ID 是 {id}，而 {names} 这几颗的 ID 完全相同，上游工具自己也分不出来。板子上是哪一颗只有你知道，请指定 —— 选错只影响十字线与写入顺序，不会写坏 IC。' },
  'dst.altPick':        { 'zh-TW': '實際板子上是哪一顆', 'en': 'Which one is actually on the board', 'zh-CN': '实际板子上是哪一颗' },
  /* 🔴 v1.2.0：Bruce 2026-09-20：「它是會自動識別嗎？為什麼我看到的可選擇的只有
     EM02A1 跟 V512S1、S2 這兩個呢？」—— 因為那個下拉只在**撞號**時出現，
     畫面上卻沒有一個字說「型號是自動判的」。顆數與清單由 DST_ICS 算出來。 */
  'dst.autoNote':       { 'zh-TW': '型號是自動識別的：連線時依序掃 slave {slaves}，讀 0xFF00 的三個 byte 比對 ID 表，不需要手動選。本頁認得的 {n} 顆：{list}。',
                          'en': 'The model is detected automatically: on connect the page scans slaves {slaves}, reads the three bytes at 0xFF00 and matches them against the ID table — nothing to pick by hand. The {n} chips this page knows: {list}.',
                          'zh-CN': '型号是自动识别的：连线时依序扫 slave {slaves}，读 0xFF00 的三个 byte 比对 ID 表，不需要手动选。本页认得的 {n} 颗：{list}。' },
  'dst.icAuto':         { 'zh-TW': '自動識別：{name}（ID {id}）', 'en': 'Auto-detected: {name} (ID {id})', 'zh-CN': '自动识别：{name}（ID {id}）' },
  'dst.fixedLine':      { 'zh-TW': 'slave 掃描順序（7-bit）{slaves} · 時脈 {khz} kHz · 寫入一律經位址白名單', 'en': 'slave scan order (7-bit) {slaves} · clock {khz} kHz · every write goes through the address whitelist', 'zh-CN': 'slave 扫描顺序（7-bit）{slaves} · 时钟 {khz} kHz · 写入一律经地址白名单' },
  'dst.thStep':         { 'zh-TW': '階', 'en': 'Step', 'zh-CN': '阶' },
  'dst.cellFail':       { 'zh-TW': '量測失敗', 'en': 'measurement failed', 'zh-CN': '量测失败' },
  'dst.resFromReg':     { 'zh-TW': '讀自 IC', 'en': 'read from the IC', 'zh-CN': '读自 IC' },
  'dst.resDefault':     { 'zh-TW': '預設值', 'en': 'default', 'zh-CN': '默认值' },

  /* ── 識別結果 ─────────────────────────────────────────────────────── */
  'dst.idNone':         { 'zh-TW': '四個 slave 全無有效回應', 'en': 'no valid response from any of the four slaves', 'zh-CN': '四个 slave 全无有效回应' },
  'dst.icNone':         { 'zh-TW': '—（讀不到 ID）', 'en': '— (cannot read the ID)', 'zh-CN': '—（读不到 ID）' },
  'dst.icUnknown':      { 'zh-TW': '讀到了，但不在已知 ID 表內 ⇒ 只允許讀', 'en': 'ID read, but it is not in the known table ⇒ read-only', 'zh-CN': '读到了，但不在已知 ID 表内 ⇒ 只允许读' },
  'dst.sayIcUnknown':   { 'zh-TW': '0xFF00 讀到 {id}，不在已知 ID 表內 ⇒ 出圖與寫入全部停用。請把這三個 byte 回報。', 'en': '0xFF00 returned {id}, which is not in the known ID table ⇒ pattern output and all writes are disabled. Please report these three bytes.', 'zh-CN': '0xFF00 读到 {id}，不在已知 ID 表内 ⇒ 出图与写入全部停用。请把这三个 byte 回报。' },
  'dst.alsoE512':       { 'zh-TW': '也可能是 E512A2 —— 同一組 ID，上游工具也分不出來', 'en': 'may also be an E512A2 — same ID; the upstream tool cannot tell them apart either', 'zh-CN': '也可能是 E512A2 —— 同一组 ID，上游工具也分不出来' },
  'dst.wrNone':         { 'zh-TW': '無（沒認出 IC ⇒ 一個位址都不寫）', 'en': 'none (IC not identified ⇒ not a single address is written)', 'zh-CN': '无（没认出 IC ⇒ 一个地址都不写）' },

  /* ── 白名單 ───────────────────────────────────────────────────────── */
  'dst.denyNoIc':       { 'zh-TW': '位址白名單擋下 {addr}：還沒認出 IC，本頁一個位址都不寫', 'en': 'The address whitelist blocked {addr}: the IC has not been identified, so this page writes nothing at all', 'zh-CN': '地址白名单挡下 {addr}：还没认出 IC，本页一个地址都不写' },
  'dst.denyRange':      { 'zh-TW': '位址白名單擋下 {addr} ×{len}（{ic} 只允許 {ranges}）', 'en': 'The address whitelist blocked {addr} ×{len} ({ic} only allows {ranges})', 'zh-CN': '地址白名单挡下 {addr} ×{len}（{ic} 只允许 {ranges}）' },

  /* ── ACK 判讀（純函式，目前由自檢夾具使用）──────────────────────── */
  'dst.ackOk':          { 'zh-TW': 'ACK', 'en': 'ACK', 'zh-CN': 'ACK' },
  'dst.ackOkResidue':   { 'zh-TW': 'ACK（中間位元是殘留，不影響判讀）', 'en': 'ACK (the middle bits are residue and do not affect the verdict)', 'zh-CN': 'ACK（中间位元是残留，不影响判读）' },
  'dst.ackNakLeft':     { 'zh-TW': 'NACK（位元靠左對齊）', 'en': 'NACK (bit is left-aligned)', 'zh-CN': 'NACK（位元靠左对齐）' },
  'dst.ackNakRight':    { 'zh-TW': 'NACK（位元靠右對齊）', 'en': 'NACK (bit is right-aligned)', 'zh-CN': 'NACK（位元靠右对齐）' },
  'dst.ackNakOdd':      { 'zh-TW': 'NACK，但這個值不在預期範圍內 —— 位元對齊的假設可能有問題，請把這個原始 byte 一起回報', 'en': 'NACK, but this value is outside the expected range — the bit-alignment assumption may be wrong. Please report this raw byte as well.', 'zh-CN': 'NACK，但这个值不在预期范围内 —— 位元对齐的假设可能有问题，请把这个原始 byte 一起回报' },

  /* ── 通訊自檢 ─────────────────────────────────────────────────────── */
  /* 🔴 v1.2.0：這一項**不再判對錯**。舊的 dst.commPass／dst.commMismatch 已刪除 ——
     那兩條的前提是「讀回 A1 D8 FB 才正常」，而那三個 byte 是某一份 code 的內容，
     不是硬體身分（Bruce 2026-09-20 實機：「只要是有不同的 code，這邊的設定就會不一樣」）。 */
  'dst.commRead':       { 'zh-TW': '讀回 {got}', 'en': 'Read back {got}', 'zh-CN': '读回 {got}' },
  'dst.commNoRead':     { 'zh-TW': '讀不到（只收到 {n} byte）', 'en': 'Nothing to read (only {n} bytes received)', 'zh-CN': '读不到（只收到 {n} byte）' },
  'dst.commNote':       { 'zh-TW': '「匯流排讀回測試」只證明 I2C 讀得到東西；<b>讀回的值會隨 code 不同而不同，不能用來判斷是哪一顆 T-CON</b>，本頁也不拿它做任何判定。型號一律看下面的 0xFF00 ID。',
                          'en': 'The bus read-back only proves that I2C can read something. <b>The value it returns changes with the code loaded, so it cannot tell you which T-CON this is</b> — this page makes no judgement from it. The model always comes from the 0xFF00 ID below.',
                          'zh-CN': '「总线读回测试」只证明 I2C 读得到东西；<b>读回的值会随 code 不同而不同，不能用来判断是哪一颗 T-CON</b>，本页也不拿它做任何判定。型号一律看下面的 0xFF00 ID。' },

  /* ── 出圖不可用的理由 ─────────────────────────────────────────────── */
  'dst.noIcNoWrite':    { 'zh-TW': '還沒認出 IC，本頁一個位址都不寫', 'en': 'The IC has not been identified, so this page writes nothing at all', 'zh-CN': '还没认出 IC，本页一个地址都不写' },
  'dst.noSeq':          { 'zh-TW': '反組譯裡沒有這一顆的序列，本頁只認得出來、不出圖', 'en': 'the decompile contains no sequence for this chip, so this page can only identify it, not paint with it', 'zh-CN': '反编译里没有这一颗的序列，本页只认得出来、不出图' },
  'dst.noPattern':      { 'zh-TW': '{ic}：本版不支援出圖', 'en': '{ic}: pattern output is not supported in this version', 'zh-CN': '{ic}：本版不支持出图' },
  'dst.noCursorSeq':    { 'zh-TW': '{ic}：反組譯裡沒有這一顆的十字序列', 'en': '{ic}: the decompile contains no cross sequence for this chip', 'zh-CN': '{ic}：反编译里没有这一颗的十字序列' },

  /* ── 錯誤 ─────────────────────────────────────────────────────────── */
  'dst.errNotLinked':   { 'zh-TW': 'I2C 尚未連線', 'en': 'I2C is not linked yet', 'zh-CN': 'I2C 尚未连线' },
  'dst.errTimeout':     { 'zh-TW': 'I2C Bridge 逾時未回覆（{type}）', 'en': 'The I2C Bridge did not reply in time ({type})', 'zh-CN': 'I2C Bridge 逾时未回复（{type}）' },
  'dst.errReadFail':    { 'zh-TW': '讀 {addr} 失敗（狀態 {status}）', 'en': 'Reading {addr} failed (status {status})', 'zh-CN': '读 {addr} 失败（状态 {status}）' },
  'dst.errWriteFail':   { 'zh-TW': '寫 {addr} 失敗（狀態 {status}）', 'en': 'Writing {addr} failed (status {status})', 'zh-CN': '写 {addr} 失败（状态 {status}）' },
  'dst.errWsClosed':    { 'zh-TW': 'I2C Bridge 連線關閉', 'en': 'The I2C Bridge connection closed', 'zh-CN': 'I2C Bridge 连线关闭' },
  'dst.errBridgeOld':   { 'zh-TW': 'I2C Bridge 版本太舊（它是 proto {proto}，本頁需要 proto {need}）', 'en': 'The I2C Bridge is too old (it reports proto {proto}, this page needs proto {need})', 'zh-CN': 'I2C Bridge 版本太旧（它是 proto {proto}，本页需要 proto {need}）' },
  'dst.errLocked':      { 'zh-TW': '另一個頁面正在量測中，暫時不能接手。等它跑完，或到那一頁按停止。', 'en': 'Another page is measuring right now, so the fixture cannot be taken over. Wait for it to finish, or press stop on that page.', 'zh-CN': '另一个页面正在量测中，暂时不能接手。等它跑完，或到那一页按停止。' },
  'dst.errOpenAllFail': { 'zh-TW': '連試 {n} 次都開不了治具通道 —— 治具有沒有插好？是不是有別的程式正佔著它？', 'en': 'The fixture channel could not be opened after {n} attempts — is the fixture plugged in? Is another program holding it?', 'zh-CN': '连试 {n} 次都开不了治具通道 —— 治具有没有插好？是不是有别的程序正占着它？' },
  'dst.errFfReadback':  { 'zh-TW': '回讀 {addr} 是 0xFF ⇒ 這顆 IC 的回應不符預期，已中止（不對著空氣改寫暫存器）', 'en': 'Reading {addr} back gave 0xFF ⇒ this IC is not responding as expected, so the operation was stopped (a register is never rewritten into thin air)', 'zh-CN': '回读 {addr} 是 0xFF ⇒ 这颗 IC 的回应不符预期，已中止（不对着空气改写暂存器）' },
  'dst.errNoSerial':    { 'zh-TW': '這個瀏覽器沒有序列埠功能（請用桌面版 Chrome／Edge）', 'en': 'This browser has no serial port support (use desktop Chrome or Edge)', 'zh-CN': '这个浏览器没有串口功能（请用桌面版 Chrome／Edge）' },
  'dst.errSerialOpen':  { 'zh-TW': '開啟量測儀失敗：{m}', 'en': 'Opening the meter failed: {m}', 'zh-CN': '开启量测仪失败：{m}' },
  'dst.errNeedI2c':     { 'zh-TW': '請先連上 I2C', 'en': 'Link the I2C side first', 'zh-CN': '请先连上 I2C' },
  'dst.errNeedCa':      { 'zh-TW': '請先連上量測儀', 'en': 'Link the meter first', 'zh-CN': '请先连上量测仪' },
  'dst.errCaStuck':     { 'zh-TW': '量測儀沒有回應，卡在 {cmd}', 'en': 'The meter did not respond; stuck at {cmd}', 'zh-CN': '量测仪没有回应，卡在 {cmd}' },
  'dst.errCaErr':       { 'zh-TW': '量測儀回錯誤 {r}（{cmd}）', 'en': 'The meter returned an error {r} ({cmd})', 'zh-CN': '量测仪回错误 {r}（{cmd}）' },
  'dst.errZero':        { 'zh-TW': '零校正失敗（{r}）—— 蓋好遮光蓋再按一次', 'en': 'Zero calibration failed ({r}) — put the cap back on and try again', 'zh-CN': '零校正失败（{r}）—— 盖好遮光盖再按一次' },

  /* ── 確認 ─────────────────────────────────────────────────────────── */
  'dst.confirmRun':     {
    'zh-TW': '接下來會寫入 TCON（{ic}），共 {n} 階。\n\n只會寫這些位址：{ranges}\n\n要開始嗎？',
    'en': 'This will write to the TCON ({ic}) for {n} steps.\n\nOnly these addresses are written: {ranges}\n\nStart?',
    'zh-CN': '接下来会写入 TCON（{ic}），共 {n} 阶。\n\n只会写这些地址：{ranges}\n\n要开始吗？' },
  'dst.confirmAligned': {
    'zh-TW': '畫面上現在是 L127 灰階＋正中心紅十字。\n\n把探頭對準十字之後按「確定」開始掃描（掃描前十字會自動關掉）。',
    'en': 'The screen now shows an L127 grey field with a red cross at the centre.\n\nAim the probe at the cross, then press OK to start the scan (the cross is turned off automatically before scanning).',
    'zh-CN': '画面上现在是 L127 灰阶＋正中心红十字。\n\n把探头对准十字之后按「确定」开始扫描（扫描前十字会自动关掉）。' },

  /* ── 進度 ─────────────────────────────────────────────────────────── */
  'dst.pgEnter':        { 'zh-TW': '進入出圖模式…', 'en': 'Entering pattern mode…', 'zh-CN': '进入出图模式…' },
  'dst.pgAlign':        { 'zh-TW': '打出對位畫面…', 'en': 'Painting the alignment pattern…', 'zh-CN': '打出对位画面…' },
  'dst.pgInit':         { 'zh-TW': '設定量測儀 {i}/{n}：{what}', 'en': 'Setting up the meter {i}/{n}: {what}', 'zh-CN': '设定量测仪 {i}/{n}：{what}' },
  'dst.pgZero':         { 'zh-TW': '零校正中 —— 蓋上遮光蓋，十秒別動', 'en': 'Zero calibration — put the cap on and hold still for ten seconds', 'zh-CN': '零校正中 —— 盖上遮光盖，十秒别动' },
  'dst.pgDone':         { 'zh-TW': '掃描完成', 'en': 'Scan complete', 'zh-CN': '扫描完成' },

  /* ── 中止時「面板現在是什麼」──────────────────────────────────────── */
  'dst.paintNormal':    { 'zh-TW': '已離開出圖模式，面板回到正常畫面', 'en': 'pattern mode has been left and the panel is back to its normal image', 'zh-CN': '已离开出图模式，面板回到正常画面' },
  'dst.paintEntered':   { 'zh-TW': '已進入出圖模式但還沒打出任何顏色', 'en': 'pattern mode was entered but no colour has been painted yet', 'zh-CN': '已进入出图模式但还没打出任何颜色' },
  'dst.paintRgb':       { 'zh-TW': '停在 R={r} G={g} B={b}（12-bit）這一張畫面', 'en': 'it is stopped on the R={r} G={g} B={b} (12-bit) image', 'zh-CN': '停在 R={r} G={g} B={b}（12-bit）这一张画面' },
  'dst.abortedAt':      { 'zh-TW': '已停止。TCON 現在{what}。要回到正常畫面請按「離開出圖模式」。', 'en': 'Stopped. The TCON right now: {what}. Press “Leave pattern mode” to return to the normal image.', 'zh-CN': '已停止。TCON 现在{what}。要回到正常画面请按「离开出图模式」。' },

  /* ── 連線說明 ─────────────────────────────────────────────────────── */
  'dst.sayNoBridge':    { 'zh-TW': '連不到本機的 I2C Bridge。它要先在這台電腦上跑起來 —— 取得與安裝在「I2C 讀寫測試」那一頁。', 'en': 'The local I2C Bridge cannot be reached. It has to be running on this computer first — get it and install it from the “I2C read/write test” page.', 'zh-CN': '连不到本机的 I2C Bridge。它要先在这台电脑上跑起来 —— 取得与安装在「I2C 读写测试」那一页。' },
  'dst.sayDropped':     { 'zh-TW': '與 I2C Bridge 的連線中斷了。正在進行的掃描已停止。', 'en': 'The connection to the I2C Bridge dropped. Any scan in progress has been stopped.', 'zh-CN': '与 I2C Bridge 的连线中断了。正在进行的扫描已停止。' },

  /* ── 量測儀初始化各步驟 ───────────────────────────────────────────── */
  'dst.caCom':          { 'zh-TW': '建立通訊', 'en': 'establish communication', 'zh-CN': '建立通讯' },
  'dst.caScs':          { 'zh-TW': '同步 UNIVERSAL', 'en': 'sync UNIVERSAL', 'zh-CN': '同步 UNIVERSAL' },
  'dst.caFsc':          { 'zh-TW': '量測速度 LTD.AUTO', 'en': 'measuring speed LTD.AUTO', 'zh-CN': '量测速度 LTD.AUTO' },
  'dst.caOpr':          { 'zh-TW': '選探頭 P1', 'en': 'select probe P1', 'zh-CN': '选探头 P1' },
  'dst.caMms':          { 'zh-TW': '色彩＋閃爍', 'en': 'colour + flicker', 'zh-CN': '色彩＋闪烁' },
  'dst.caFms':          { 'zh-TW': 'FMA 法', 'en': 'FMA method', 'zh-CN': 'FMA 法' },
  'dst.caMds':          { 'zh-TW': 'x, y, Lv 模式', 'en': 'x, y, Lv mode', 'zh-CN': 'x, y, Lv 模式' },
  'dst.caMch':          { 'zh-TW': '校正通道 0', 'en': 'calibration channel 0', 'zh-CN': '校正通道 0' },
  'dst.caLus':          { 'zh-TW': '單位 cd/m²', 'en': 'unit cd/m²', 'zh-CN': '单位 cd/m²' },

  /* ═══ dg v1.68.0：即時量測的二選一 ════════════════════════════════════════
     🔴 `dg.html` 其餘部分是繁中單語，這個視窗是新加的 ⇒ 照全站慣例走 i18n。 */
  'dg.pickTitle':       { 'zh-TW': '這一次要用哪一種畫面量測？', 'en': 'Which picture do you want to measure?', 'zh-CN': '这一次要用哪一种画面量测？' },
  'dg.pickCancel':      { 'zh-TW': '取消', 'en': 'Cancel', 'zh-CN': '取消' },
  'dg.pickPc':          { 'zh-TW': '電腦畫面量測', 'en': 'Measure the computer’s picture', 'zh-CN': '电脑画面量测' },
  'dg.pickPcSub':       { 'zh-TW': '畫面由這台電腦出，任何面板都適用。這就是原本按下「即時量測」會開的那一頁。',
                          'en': 'The picture comes from this computer; works with any panel. This is the page “Live measurement” used to open.',
                          'zh-CN': '画面由这台电脑出，任何面板都适用。这就是原本按下「即时量测」会开的那一页。' },
  'dg.pickTcon':        { 'zh-TW': 'T-CON 自檢畫面量測', 'en': 'Measure the T-CON self-test picture', 'zh-CN': 'T-CON 自检画面量测' },
  'dg.pickTconSub':     { 'zh-TW': '畫面由 TCON 自己出，不經過顯示卡。需要 I2C 治具接上板子。',
                          'en': 'The TCON paints the picture itself, bypassing the graphics card. Needs the I2C rig connected to the board.',
                          'zh-CN': '画面由 TCON 自己出，不经过显示卡。需要 I2C 治具接上板子。' },
  'dg.pickDl':          { 'zh-TW': '下載 I2C Bridge', 'en': 'Download I2C Bridge', 'zh-CN': '下载 I2C Bridge' },
  'dg.pickShared':      { 'zh-TW': '　與「I2C 讀寫測試」是<b>同一支程式</b>，已經下載過就不用再載。',
                          'en': '　The I2C Read/Write Test page uses <b>the same program</b> — if you already have it, there is nothing to download.',
                          'zh-CN': '　与「I2C 读写测试」是<b>同一支程序</b>，已经下载过就不用再载。' },

  /* ═══ dg-selftest v1.1.0：與 DG 的連動、I2C Bridge 下載、搶用權 ═══════════ */
  'dst.dgStep':         { 'zh-TW': '這一次量給', 'en': 'Measuring for', 'zh-CN': '这一次量给' },
  'dst.dgWhat':         { 'zh-TW': '量什麼', 'en': 'What to measure', 'zh-CN': '量什么' },
  'dst.dgNote':         { 'zh-TW': '掃描跑完會自動回到 DG 那一頁，不用手動搬。中止或出錯則不回傳。',
                          'en': 'When the scan finishes the data goes back to the DG page on its own. Nothing is sent back if you stop it or it fails.',
                          'zh-CN': '扫描跑完会自动回到 DG 那一页，不用手动搬。中止或出错则不回传。' },
  'dst.dgLabel':        { 'zh-TW': '即時量測（TCON 自檢畫面）', 'en': 'Live measurement (TCON self-test pattern)', 'zh-CN': '即时量测（TCON 自检画面）' },
  'dst.dgSent':         { 'zh-TW': '✔ {n} 筆已回到 DG 的{dest}。', 'en': '✔ {n} rows are back in DG ({dest}).', 'zh-CN': '✔ {n} 笔已回到 DG 的{dest}。' },
  'dst.dgTooFew':       { 'zh-TW': '只量到 {n} 筆（需要 {need} 筆），沒有回傳給 DG。',
                          'en': 'Only {n} rows measured ({need} needed) — nothing was sent back to DG.',
                          'zh-CN': '只量到 {n} 笔（需要 {need} 笔），没有回传给 DG。' },
  'dst.dgSwitched':     { 'zh-TW': '已切到{dest}。按「開始掃描」量這一次。', 'en': 'Switched to {dest}. Press “Start scan” for this round.', 'zh-CN': '已切到{dest}。按「开始扫描」量这一次。' },
  'dst.dlBtn':          { 'zh-TW': '下載 I2C Bridge', 'en': 'Download I2C Bridge', 'zh-CN': '下载 I2C Bridge' },
  'dst.dlShared':       { 'zh-TW': '「I2C 讀寫測試」那一頁用的是<b>同一支程式</b>：已經下載過就不必再載一次，執行起來這一頁就連得上。',
                          'en': 'The I2C Read/Write Test page uses <b>the same program</b>. If you already downloaded it, just run it — no need to download again.',
                          'zh-CN': '「I2C 读写测试」那一页用的是<b>同一支程序</b>：已经下载过就不必再载一次，执行起来这一页就连得上。' },
  /* ═══ v1.2.0：匯出（版面逐欄照上游工具）═════════════════════ */
  'dst.btnXlsx':        { 'zh-TW': '匯出 XLSX', 'en': 'Export XLSX', 'zh-CN': '导出 XLSX' },
  'dst.expNoData':      { 'zh-TW': '還沒有任何量測結果可以匯出。',
                          'en': 'There are no measurement results to export yet.',
                          'zh-CN': '还没有任何量测结果可以导出。' },
  /* 🔴 Bruce 2026-09-20：「只要有量測失敗的，是不能匯出 CSV 的。」 */
  'dst.expVoid':        { 'zh-TW': '這一輪沒有完整跑完（中止或量測失敗），已作廢 —— 不得匯出，也不會回傳 DG。請先排除量測儀器的問題，再重新掃一次。',
                          'en': 'This round did not finish cleanly (stopped, or a measurement failed), so it is void — it cannot be exported and nothing was sent back to DG. Fix the meter first, then run the scan again.',
                          'zh-CN': '这一轮没有完整跑完（中止或量测失败），已作废 —— 不得导出，也不会回传 DG。请先排除量测仪器的问题，再重新扫一次。' },
  'dst.expNoLib':       { 'zh-TW': 'common/xlsx.js 沒有載入 —— 無法產生 Excel 檔。請重新整理這一頁。',
                          'en': 'common/xlsx.js did not load — the Excel file cannot be produced. Please reload this page.',
                          'zh-CN': 'common/xlsx.js 没有载入 —— 无法生成 Excel 文件。请重新刷新这一页。' },

  /* ═══ v1.2.0：量測失敗不准跳過 ════════════════════════════ */
  'dst.pgRetry':        { 'zh-TW': '{key}（重試 {k}/{n}）', 'en': '{key} (retry {k}/{n})', 'zh-CN': '{key}（重试 {k}/{n}）' },
  'dst.failTitle':      { 'zh-TW': '⚠ 量測失敗，這一階沒有拿到數據', 'en': '⚠ Measurement failed — no data for this step', 'zh-CN': '⚠ 量测失败，这一阶没有拿到数据' },
  'dst.failWhere':      { 'zh-TW': '失敗的是第 {i}/{n} 階（{key}），送進 IC 的是 R={r} G={g} B={b}（12-bit）。',
                          'en': 'Step {i}/{n} ({key}) failed. The values sent to the IC were R={r} G={g} B={b} (12-bit).',
                          'zh-CN': '失败的是第 {i}/{n} 阶（{key}），送进 IC 的是 R={r} G={g} B={b}（12-bit）。' },
  'dst.failGot':        { 'zh-TW': '量測儀器的回應：{raw}（已經自動試了 {tries} 次）。',
                          'en': 'The meter replied: {raw} (already retried automatically {tries} times).',
                          'zh-CN': '量测仪器的回应：{raw}（已经自动试了 {tries} 次）。' },
  'dst.failTimeout':    { 'zh-TW': '（逾時，完全沒有回應）', 'en': '(timed out — no reply at all)', 'zh-CN': '（超时，完全没有回应）' },
  'dst.failCheck':      { 'zh-TW': '請檢查量測儀器：USB 線有沒有鬆、探頭有沒有貼緊面板、遮光蓋是不是還蓋著、機身有沒有跳錯誤訊息，以及面板是不是還停在出圖畫面上。',
                          'en': 'Check the meter: is the USB cable loose, is the probe flush against the panel, is the light cap still on, is there an error on the meter itself, and is the panel still showing the test pattern?',
                          'zh-CN': '请检查量测仪器：USB 线有没有松、探头有没有贴紧面板、遮光盖是不是还盖着、机身有没有跳错误信息，以及面板是不是还停在出图画面上。' },
  'dst.failVoidWarn':   { 'zh-TW': '這一階不會被跳過。選「中止整輪」的話，這一輪作廢 —— 不匯出、也不回傳 DG。',
                          'en': 'This step will not be skipped. If you abort, the whole round is void — nothing is exported and nothing goes back to DG.',
                          'zh-CN': '这一阶不会被跳过。选「中止整轮」的话，这一轮作废 —— 不导出、也不回传 DG。' },
  'dst.failRetry':      { 'zh-TW': '再試一次這一階', 'en': 'Retry this step', 'zh-CN': '再试一次这一阶' },
  'dst.failAbort':      { 'zh-TW': '中止整輪（作廢）', 'en': 'Abort the round (void)', 'zh-CN': '中止整轮（作废）' },
  'dst.voidRun':        { 'zh-TW': '⚠ 這一輪已作廢：只量到 {n}/{total} 階。下面的表格只是給你看停在哪裡，不會匯出、也沒有回傳 DG。排除問題後請重新掃一次。',
                          'en': '⚠ This round is void: only {n} of {total} steps were measured. The table below is only there to show where it stopped — it will not be exported and nothing was sent back to DG. Fix the problem and run the scan again.',
                          'zh-CN': '⚠ 这一轮已作废：只量到 {n}/{total} 阶。下面的表格只是给你看停在哪里，不会导出、也没有回传 DG。排除问题后请重新扫一次。' },
  'dst.dgVoidNoSend':   { 'zh-TW': '這一輪沒有完整跑完，一筆都沒有回傳 DG。半套的灰階曲線灌進去會錯得很安靜。',
                          'en': 'This round did not finish cleanly, so nothing at all was sent back to DG. A half-finished grey ramp would go wrong very quietly.',
                          'zh-CN': '这一轮没有完整跑完，一笔都没有回传 DG。半套的灰阶曲线灌进去会错得很安静。' },
  /* 🔴 v1.2.0：已知缺陷的事前揭露（不是修它）—— 見 dstRenderDgBits。 */
  'dst.dgBitsWarn':     { 'zh-TW': '⚠ 這一輪是 {bits}-bit：DG 的第 2 部分目前只收得下 8-bit（L0…L255 逐階不跳號）的灰階，{bits}-bit 量完會被 DG 擋下。要回填 DG 請改選 8-bit；只是要拿匯出檔的話不受影響。',
                          'en': '⚠ This round is {bits}-bit. DG part 2 currently only accepts an 8-bit ramp (L0…L255 with no gaps), so a {bits}-bit round will be rejected by DG. Switch to 8-bit if you need it fed back into DG; the exported file is unaffected.',
                          'zh-CN': '⚠ 这一轮是 {bits}-bit：DG 的第 2 部分目前只收得下 8-bit（L0…L255 逐阶不跳号）的灰阶，{bits}-bit 量完会被 DG 挡下。要回填 DG 请改选 8-bit；只是要拿导出文件的话不受影响。' },

  'dst.ownerNote':      { 'zh-TW': 'I2C Bridge 一次只給一個分頁用 —— 切到哪一頁就由哪一頁接手，被接手的那一頁會顯示未連線；<b>正在量測的那一頁不會被接手</b>。',
                          'en': 'Only one tab holds the I2C Bridge at a time — whichever tab you switch to takes it over, and the one that loses it shows as disconnected. <b>A tab that is measuring will not be taken over.</b>',
                          'zh-CN': 'I2C Bridge 一次只给一个分页用 —— 切到哪一页就由哪一页接手，被接手的那一页会显示未连线；<b>正在量测的那一页不会被接手</b>。' },

};

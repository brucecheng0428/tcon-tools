// ═══════════ DPCD 資料庫（Lazy Load）═══════════
// 此檔案由 aux.html 在使用者切到 DPCD tab 時載入

// ─── DPCD 資料庫（196 個地址）───
var DPCD_DB = Object.assign({},
{
// ===== Capability (00000h–000FFh) =====
// ===== 基礎連結能力 (00000h–0000Fh) =====

  "00000": {
    n: "DPCD_REV",
    c: "DPCD 版本號",
    rw: 0,
    vv: [{v:0x10,l:"10h — DPCD r1.0"},{v:0x11,l:"11h — DPCD r1.1"},{v:0x12,l:"12h — DPCD r1.2"},{v:0x13,l:"13h — DPCD r1.3"},{v:0x14,l:"14h — DPCD r1.4"}],
    d: "此暫存器告訴你 Sink 裝置支援的 DPCD 規格版本。版本越高，支援的功能越多。除錯時先讀此地址確認面板的 DPCD 版本，才能知道哪些功能可用。例如讀到 0x14 代表 DPCD r1.4，支援 DSC/FEC/HDR 等進階功能。",
    b: [
      { r: "7:4", n: "Major", c: "主版號", v: { "1": "DPCD 1.x 系列（目前所有版本都是 1）" } },
      { r: "3:0", n: "Minor", c: "次版號", v: {
        "0": "DPCD r1.0（最基礎版本）",
        "1": "r1.1（加入 Enhanced Framing）",
        "2": "r1.2（加入 MST 多螢幕串接、HBR2 5.4Gbps）",
        "3": "r1.3（加入 HBR3 8.1Gbps，eDP v1.3）",
        "4": "r1.4（加入 DSC 壓縮、FEC 糾錯、HDR）"
      }}
    ]
  },

  "00001": {
    n: "MAX_LINK_RATE",
    c: "最大連結速率",
    rw: 0,
    vv: [{v:0x06,l:"06h — RBR 1.62Gbps"},{v:0x0A,l:"0Ah — HBR 2.7Gbps"},{v:0x14,l:"14h — HBR2 5.4Gbps"},{v:0x1E,l:"1Eh — HBR3 8.1Gbps"},{v:0x01,l:"01h — UHBR10 10Gbps"},{v:0x02,l:"02h — UHBR13.5"},{v:0x04,l:"04h — UHBR20 20Gbps"}],
    d: "Sink 支援的最高每 Lane 傳輸速率。這是決定頻寬上限的關鍵暫存器。除錯時若畫面解析度不夠或有閃爍，先檢查此值確認面板支援的最高速率。注意：此值乘以 Lane 數 × 8/10（8b/10b 編碼效率）才是實際有效頻寬。",
    b: [
      { r: "7:0", n: "MAX_LINK_RATE", c: "最大速率碼", v: {
        "0x06": "RBR 1.62Gbps/Lane（Reduced Bit Rate，最基礎）",
        "0x0A": "HBR 2.7Gbps/Lane（High Bit Rate，最常見）",
        "0x14": "HBR2 5.4Gbps/Lane（4K@60 常需要此速率）",
        "0x1E": "HBR3 8.1Gbps/Lane（DP 1.3/1.4，高階面板）",
        "0x01": "UHBR10 10Gbps/Lane（DP 2.0，128b/132b 編碼）",
        "0x02": "UHBR13.5 13.5Gbps/Lane（DP 2.0）",
        "0x04": "UHBR20 20Gbps/Lane（DP 2.0 最高速）"
      }}
    ]
  },

  "00002": {
    n: "MAX_LANE_COUNT",
    c: "最大 Lane 數與功能旗標",
    rw: 0,
    d: "告訴你 Sink 最多能用幾條 Lane（資料通道），以及是否支援 Enhanced Framing 和 TPS3。Lane 數越多頻寬越大：1 Lane 適合低解析度/eDP，2 Lane 中階，4 Lane 高解析度。eDP 面板常見 1 或 2 Lane，外接螢幕常見 4 Lane。",
    b: [
      { r: "7", n: "ENHANCED_FRAME_CAP", c: "增強幀模式", v: {
        "0": "不支援 Enhanced Framing",
        "1": "支援 Enhanced Framing（DPCD≥1.1 必須支援，訓練時必開）"
      }},
      { r: "6", n: "TPS3_SUPPORTED", c: "TPS3 訓練模式", v: {
        "0": "不支援 Training Pattern 3",
        "1": "支援 TPS3（HBR2 以上必須使用 TPS3 做 EQ 訓練）"
      }},
      { r: "5", n: "POST_LT_ADJ_REQ_SUPPORTED", c: "訓練後微調", v: {
        "0": "不支援訓練後調整",
        "1": "支援 Post Link Training 調整請求（可在訓練完成後微調參數）"
      }},
      { r: "4:0", n: "MAX_LANE_COUNT", c: "最大 Lane 數", v: {
        "1": "1 Lane（eDP 低解析度面板常見）",
        "2": "2 Lanes（eDP 中解析度面板常見）",
        "4": "4 Lanes（外接 DP 螢幕標準配置）"
      }}
    ]
  },

  "00003": {
    n: "MAX_DOWNSPREAD",
    c: "展頻與訓練模式能力",
    rw: 0,
    d: "展頻（SSC/Downspread）是為了降低 EMI 電磁干擾而故意讓時脈頻率微幅抖動 ±0.5%。eDP 面板幾乎都支援且必須開啟。此暫存器也包含免訓練模式和 TPS4 支援等重要旗標。除錯 Link Training 失敗時，檢查 TPS3/TPS4 支援狀態很重要。",
    b: [
      { r: "7", n: "TPS4_SUPPORTED", c: "TPS4 訓練模式", v: {
        "0": "不支援 Training Pattern 4",
        "1": "支援 TPS4（DP 1.4 新增，HBR3 的 EQ 訓練用）"
      }},
      { r: "6", n: "NO_AUX_HANDSHAKE_LINK_TRAINING", c: "免 AUX 握手訓練", v: {
        "0": "需要 AUX 握手（標準流程）",
        "1": "支援免 AUX 握手快速訓練（eDP 常用，省去 AUX 來回時間加速開機）"
      }},
      { r: "5:1", n: "RESERVED", c: "保留位元", v: {} },
      { r: "0", n: "MAX_DOWNSPREAD", c: "最大展頻幅度", v: {
        "0": "不支援展頻",
        "1": "支援 ≤0.5% 展頻（eDP 面板幾乎都是 1）"
      }}
    ]
  },

  "00004": {
    n: "NORP",
    c: "接收端口數與供電能力",
    rw: 0,
    d: "NORP = Number Of Receiver Ports。告訴你 Sink 有幾個接收端口（通常是 1）。也包含 DP_PWR 腳位的供電能力資訊，對 USB-C/DP 轉接器除錯有幫助。",
    b: [
      { r: "7:5", n: "RESERVED", c: "保留位元", v: {} },
      { r: "4:2", n: "DP_PWR_VOLTAGE_CAP", c: "DP_PWR 電壓能力", v: {
        "0b000": "不支援 DP_PWR",
        "0b001": "支援 5V",
        "0b010": "支援 12V",
        "0b011": "支援 18V"
      }},
      { r: "1", n: "RESERVED", c: "保留", v: {} },
      { r: "0", n: "NORP", c: "接收端口數", v: {
        "0": "1 個接收端口",
        "1": "2 個接收端口"
      }}
    ]
  },

  "00005": {
    n: "DOWNSTREAMPORT_PRESENT",
    c: "下游端口資訊",
    rw: 0,
    d: "告訴你 Sink 是否有下游端口（例如 DP→HDMI 轉接器就有下游 HDMI 端口）。對於單純的面板（Monitor/eDP Panel），通常沒有下游端口。這在 MST Hub 或 DP→VGA/HDMI 轉接器的除錯中很重要。",
    b: [
      { r: "7:4", n: "RESERVED", c: "保留位元", v: {} },
      { r: "3", n: "DETAILED_CAP_INFO_AVAILABLE", c: "詳細能力資訊", v: {
        "0": "無詳細下游端口能力資訊",
        "1": "地址 00080h 有詳細的下游端口能力描述"
      }},
      { r: "2:1", n: "DWN_STRM_PORT_TYPE", c: "下游端口類型", v: {
        "0b00": "DisplayPort（直接穿透）",
        "0b01": "VGA 或 analog（DP→VGA 轉接器）",
        "0b10": "DVI / HDMI / DP++（DP→HDMI 轉接器常見）",
        "0b11": "其他（非 DP 端口）"
      }},
      { r: "0", n: "DWN_STRM_PORT_PRESENT", c: "有無下游端口", v: {
        "0": "無下游端口（純面板/Monitor）",
        "1": "有下游端口（轉接器/Hub/Repeater）"
      }}
    ]
  },

  "00006": {
    n: "MAIN_LINK_CHANNEL_CODING",
    c: "主連結通道編碼",
    rw: 0,
    d: "告訴你 Sink 支援哪種通道編碼。傳統 DP 1.0~1.4 都用 8b/10b 編碼（每 10 bit 傳 8 bit 有效資料，效率 80%）。DP 2.0 新增 128b/132b 編碼（效率約 97%），大幅提升有效頻寬。除錯時注意：Source 和 Sink 必須使用相同編碼才能通訊。",
    b: [
      { r: "7:2", n: "RESERVED", c: "保留位元", v: {} },
      { r: "1", n: "128B_132B_SUPPORTED", c: "128b/132b 編碼", v: {
        "0": "不支援（傳統 DP 裝置）",
        "1": "支援 128b/132b（DP 2.0 裝置）"
      }},
      { r: "0", n: "ANSI_8B10B", c: "8b/10b 編碼", v: {
        "0": "不支援 8b/10b（幾乎不會出現）",
        "1": "支援 8b/10b（所有 DP 1.x 裝置都支援）"
      }}
    ]
  },

  "00007": {
    n: "DOWN_STREAM_PORT_COUNT",
    c: "下游端口數與 OUI/MSA 支援",
    rw: 0,
    d: "具體的下游端口數量，加上是否支援 IEEE OUI（廠商識別碼）和 MSA timing 格式。對轉接器和 MST Hub 除錯有用。一般面板的下游端口數為 0。",
    b: [
      { r: "7", n: "IEEE_OUI_SUPPORT", c: "OUI 支援", v: {
        "0": "不提供 OUI（地址 00400h~00402h 無效）",
        "1": "有 OUI 可讀（地址 00400h~00402h 是廠商識別碼）"
      }},
      { r: "6", n: "MSA_TIMING_PAR_IGNORED", c: "MSA Timing 忽略", v: {
        "0": "Sink 使用 MSA timing 資訊來顯示",
        "1": "Sink 忽略 MSA timing（自己決定 timing）"
      }},
      { r: "5:4", n: "RESERVED", c: "保留位元", v: {} },
      { r: "3:0", n: "DWN_STRM_PORT_COUNT", c: "下游端口數", v: {
        "0": "無下游端口（純面板）",
        "1": "1 個下游端口（單輸出轉接器）",
        "2": "2 個下游端口",
        "3": "3 個（以此類推，最多 15）"
      }}
    ]
  },

  "00008": {
    n: "RECEIVE_PORT0_CAP_0",
    c: "接收端口 0 能力（第 0 byte）",
    rw: 0,
    d: "接收端口 0 的基礎能力。包含本地 EDID 是否存在、關聯的 Stream 類型等。大部分面板在此暫存器會顯示有本地 EDID 且關聯到 Stream 0。",
    b: [
      { r: "7:3", n: "RESERVED", c: "保留位元", v: {} },
      { r: "2", n: "ASSOCIATED_TO_PRECEDING_PORT", c: "關聯到前一端口", v: {
        "0": "未關聯",
        "1": "此端口關聯到前一個端口"
      }},
      { r: "1", n: "LOCAL_EDID_PRESENT", c: "本地 EDID", v: {
        "0": "無本地 EDID（需透過 I2C-over-AUX 讀 EDID）",
        "1": "有本地 EDID（地址 02200h 開始可直接讀取 EDID）"
      }},
      { r: "0", n: "RESERVED", c: "保留", v: {} }
    ]
  },

  "00009": {
    n: "RECEIVE_PORT0_CAP_1",
    c: "接收端口 0 Buffer 大小",
    rw: 0,
    d: "接收端口 0 的內部緩衝區大小。Buffer 越大，容忍的時脈偏差越大，穩定性越好。此值以 pixel 為單位，計算公式：(值 + 1) × 32 pixels。對於 eDP 面板，此值通常不大；對於外接螢幕，較大的 buffer 有助於穩定傳輸。",
    b: [
      { r: "7:0", n: "BUFFER_SIZE", c: "Buffer 大小", v: {
        "0x00": "32 pixels（最小值）",
        "0xFF": "8192 pixels（最大值，(255+1)×32）"
      }}
    ]
  },

  "0000A": {
    n: "RECEIVE_PORT1_CAP_0",
    c: "接收端口 1 能力（第 0 byte）",
    rw: 0,
    d: "接收端口 1 的基礎能力，結構與端口 0 相同。只有當 NORP 表示有 2 個接收端口時此暫存器才有意義。一般單螢幕面板只有端口 0，此暫存器內容可忽略。",
    b: [
      { r: "7:3", n: "RESERVED", c: "保留位元", v: {} },
      { r: "2", n: "ASSOCIATED_TO_PRECEDING_PORT", c: "關聯到前一端口", v: {
        "0": "未關聯", "1": "關聯到前一端口"
      }},
      { r: "1", n: "LOCAL_EDID_PRESENT", c: "本地 EDID", v: {
        "0": "無", "1": "有本地 EDID"
      }},
      { r: "0", n: "RESERVED", c: "保留", v: {} }
    ]
  },

  "0000B": {
    n: "RECEIVE_PORT1_CAP_1",
    c: "接收端口 1 Buffer 大小",
    rw: 0,
    d: "接收端口 1 的緩衝區大小，結構與端口 0 相同。公式：(值+1)×32 pixels。只在有第二接收端口時有意義。",
    b: [
      { r: "7:0", n: "BUFFER_SIZE", c: "Buffer 大小", v: {
        "0x00": "32 pixels", "0xFF": "8192 pixels"
      }}
    ]
  },

  "0000C": {
    n: "I2C_SPEED_CAP",
    c: "I2C 速率能力",
    rw: 0,
    d: "Sink 的 I2C-over-AUX 通道支援的最高 I2C 速率。AUX 通道可以模擬 I2C 來讀取 EDID 或控制 MCCS（DDC/CI）。速率越高，讀 EDID 越快。大部分面板至少支援 1Kbps。如果讀 EDID 失敗或逾時，可降低 I2C 速率重試。",
    b: [
      { r: "7:5", n: "RESERVED", c: "保留位元", v: {} },
      { r: "4", n: "I2C_1MBPS", c: "1Mbps 支援", v: { "0": "不支援", "1": "支援 1Mbps" } },
      { r: "3", n: "I2C_400KBPS", c: "400Kbps 支援", v: { "0": "不支援", "1": "支援 400Kbps" } },
      { r: "2", n: "I2C_100KBPS", c: "100Kbps 支援", v: { "0": "不支援", "1": "支援 100Kbps" } },
      { r: "1", n: "I2C_10KBPS", c: "10Kbps 支援", v: { "0": "不支援", "1": "支援 10Kbps" } },
      { r: "0", n: "I2C_1KBPS", c: "1Kbps 支援", v: { "0": "不支援", "1": "支援 1Kbps" } }
    ]
  },

  "0000D": {
    n: "eDP_CONFIGURATION_CAP",
    c: "eDP 設定能力",
    rw: 0,
    d: "eDP（嵌入式 DisplayPort）專用暫存器。告訴你面板是否支援 ASSR（Alternate Scrambler Seed Reset）和 Framing Change。ASSR 是 eDP 面板的專屬加擾模式，幾乎所有 eDP 面板都支援且必須啟用。如果 eDP 面板無畫面或花屏，先確認 ASSR 是否正確開啟。",
    b: [
      { r: "7:2", n: "RESERVED", c: "保留位元", v: {} },
      { r: "1", n: "FRAMING_CHANGE_CAP", c: "Framing 切換", v: {
        "0": "不支援動態切換 Enhanced Framing",
        "1": "支援在不重新訓練的情況下切換 Enhanced Framing"
      }},
      { r: "0", n: "ALTERNATE_SCRAMBLER_RESET_CAP", c: "ASSR 能力", v: {
        "0": "不支援 ASSR（外接 DP 螢幕）",
        "1": "支援 ASSR（eDP 面板必備，加擾種子用 FFFFh 而非 FFFEh）"
      }}
    ]
  },

  "0000E": {
    n: "TRAINING_AUX_RD_INTERVAL",
    c: "訓練 AUX 讀取間隔與 Extended Cap 旗標",
    rw: 0,
    d: "Link Training 過程中，Source 發送訓練 Pattern 後，需等待一段時間再讀取 Sink 的狀態。此暫存器指定等待間隔。另外 bit 7 的 EXTENDED_RECEIVER_CAPABILITY 旗標非常重要：若為 1，表示地址 02200h 開始有擴展能力暫存器（DP 1.3+ 裝置常見），Source 必須讀那邊的值而非 00000h~0000Fh。除錯時務必檢查此 bit。",
    b: [
      { r: "7", n: "EXTENDED_RECEIVER_CAPABILITY_FIELD_PRESENT", c: "擴展能力旗標", v: {
        "0": "無擴展能力（只看 00000h~000FFh 即可）",
        "1": "有擴展能力區（必須也讀 02200h 開始的暫存器，DP 1.3+ 常見）"
      }},
      { r: "6:0", n: "TRAINING_AUX_RD_INTERVAL", c: "AUX 讀取等待時間", v: {
        "0x00": "CR 階段 100µs / EQ 階段 400µs（預設最快，DP 標準值）",
        "0x01": "4ms",
        "0x02": "8ms",
        "0x03": "12ms",
        "0x04": "16ms（某些 eDP 面板需要較長等待）"
      }}
    ]
  },

  "0000F": {
    n: "ADAPTER_CAP",
    c: "轉接器能力",
    rw: 0,
    d: "描述 DP 轉接器（Adapter）的能力，僅對 Branch Device（如 Hub、轉接器）有意義。對於直連面板，此暫存器通常為 0。如果 Sink 是 DP→HDMI 轉接器，此處可能會標示支援的 HDMI 功能。",
    b: [
      { r: "7:1", n: "RESERVED", c: "保留位元", v: {} },
      { r: "0", n: "FORCE_LOAD_SENSE_CAP", c: "強制負載感應", v: {
        "0": "不支援",
        "1": "支援 Force Load Sense（用於偵測是否有裝置連接）"
      }}
    ]
  },

  // ===== eDP Link Rate Table (00010h–0001Fh) =====

  "00010": { n: "SUPPORTED_LINK_RATES0[7:0]", c: "支援 Link Rate 表 Entry 0 低位元組", rw: 0, d: "eDP v1.4+ 支援 Link Rate 表。此 16-byte 區域包含 8 組 16-bit 的每 Lane 連結速率條目。每組以 little-endian 儲存：低位元組在低地址，高位元組在高地址。速率 = 條目值 × 200 kHz。有效條目必須唯一且由低到高排列，第一個條目必須非零。0000h 表示此條目及以上無效。標準值範例：RBR=1FA4h、HBR=34BCh、HBR2=6978h、HBR3=9E34h。", b: [{ r: "7:0", n: "SUPPORTED_LINK_RATES0[7:0]", d: "Entry 0 低位元組。與 DPCD 00011h 組合為 little-endian 16-bit 值，乘以 200 kHz 即得每 Lane 連結速率。" }] },
  "00011": { n: "SUPPORTED_LINK_RATES0[15:8]", c: "支援 Link Rate 表 Entry 0 高位元組", rw: 0, d: "eDP v1.4+ 支援 Link Rate 表。此 16-byte 區域包含 8 組 16-bit 的每 Lane 連結速率條目。每組以 little-endian 儲存：低位元組在低地址，高位元組在高地址。速率 = 條目值 × 200 kHz。有效條目必須唯一且由低到高排列，第一個條目必須非零。0000h 表示此條目及以上無效。標準值範例：RBR=1FA4h、HBR=34BCh、HBR2=6978h、HBR3=9E34h。", b: [{ r: "7:0", n: "SUPPORTED_LINK_RATES0[15:8]", d: "Entry 0 高位元組。與 DPCD 00010h 組合為 little-endian 16-bit 值，乘以 200 kHz 即得每 Lane 連結速率。" }] },
  "00012": { n: "SUPPORTED_LINK_RATES1[7:0]", c: "支援 Link Rate 表 Entry 1 低位元組", rw: 0, d: "eDP v1.4+ 支援 Link Rate 表。此 16-byte 區域包含 8 組 16-bit 的每 Lane 連結速率條目。每組以 little-endian 儲存：低位元組在低地址，高位元組在高地址。速率 = 條目值 × 200 kHz。有效條目必須唯一且由低到高排列，第一個條目必須非零。0000h 表示此條目及以上無效。標準值範例：RBR=1FA4h、HBR=34BCh、HBR2=6978h、HBR3=9E34h。", b: [{ r: "7:0", n: "SUPPORTED_LINK_RATES1[7:0]", d: "Entry 1 低位元組。與 DPCD 00013h 組合為 little-endian 16-bit 值，乘以 200 kHz 即得每 Lane 連結速率。" }] },
  "00013": { n: "SUPPORTED_LINK_RATES1[15:8]", c: "支援 Link Rate 表 Entry 1 高位元組", rw: 0, d: "eDP v1.4+ 支援 Link Rate 表。此 16-byte 區域包含 8 組 16-bit 的每 Lane 連結速率條目。每組以 little-endian 儲存：低位元組在低地址，高位元組在高地址。速率 = 條目值 × 200 kHz。有效條目必須唯一且由低到高排列，第一個條目必須非零。0000h 表示此條目及以上無效。標準值範例：RBR=1FA4h、HBR=34BCh、HBR2=6978h、HBR3=9E34h。", b: [{ r: "7:0", n: "SUPPORTED_LINK_RATES1[15:8]", d: "Entry 1 高位元組。與 DPCD 00012h 組合為 little-endian 16-bit 值，乘以 200 kHz 即得每 Lane 連結速率。" }] },
  "00014": { n: "SUPPORTED_LINK_RATES2[7:0]", c: "支援 Link Rate 表 Entry 2 低位元組", rw: 0, d: "eDP v1.4+ 支援 Link Rate 表。此 16-byte 區域包含 8 組 16-bit 的每 Lane 連結速率條目。每組以 little-endian 儲存：低位元組在低地址，高位元組在高地址。速率 = 條目值 × 200 kHz。有效條目必須唯一且由低到高排列，第一個條目必須非零。0000h 表示此條目及以上無效。標準值範例：RBR=1FA4h、HBR=34BCh、HBR2=6978h、HBR3=9E34h。", b: [{ r: "7:0", n: "SUPPORTED_LINK_RATES2[7:0]", d: "Entry 2 低位元組。與 DPCD 00015h 組合為 little-endian 16-bit 值，乘以 200 kHz 即得每 Lane 連結速率。" }] },
  "00015": { n: "SUPPORTED_LINK_RATES2[15:8]", c: "支援 Link Rate 表 Entry 2 高位元組", rw: 0, d: "eDP v1.4+ 支援 Link Rate 表。此 16-byte 區域包含 8 組 16-bit 的每 Lane 連結速率條目。每組以 little-endian 儲存：低位元組在低地址，高位元組在高地址。速率 = 條目值 × 200 kHz。有效條目必須唯一且由低到高排列，第一個條目必須非零。0000h 表示此條目及以上無效。標準值範例：RBR=1FA4h、HBR=34BCh、HBR2=6978h、HBR3=9E34h。", b: [{ r: "7:0", n: "SUPPORTED_LINK_RATES2[15:8]", d: "Entry 2 高位元組。與 DPCD 00014h 組合為 little-endian 16-bit 值，乘以 200 kHz 即得每 Lane 連結速率。" }] },
  "00016": { n: "SUPPORTED_LINK_RATES3[7:0]", c: "支援 Link Rate 表 Entry 3 低位元組", rw: 0, d: "eDP v1.4+ 支援 Link Rate 表。此 16-byte 區域包含 8 組 16-bit 的每 Lane 連結速率條目。每組以 little-endian 儲存：低位元組在低地址，高位元組在高地址。速率 = 條目值 × 200 kHz。有效條目必須唯一且由低到高排列，第一個條目必須非零。0000h 表示此條目及以上無效。標準值範例：RBR=1FA4h、HBR=34BCh、HBR2=6978h、HBR3=9E34h。", b: [{ r: "7:0", n: "SUPPORTED_LINK_RATES3[7:0]", d: "Entry 3 低位元組。與 DPCD 00017h 組合為 little-endian 16-bit 值，乘以 200 kHz 即得每 Lane 連結速率。" }] },
  "00017": { n: "SUPPORTED_LINK_RATES3[15:8]", c: "支援 Link Rate 表 Entry 3 高位元組", rw: 0, d: "eDP v1.4+ 支援 Link Rate 表。此 16-byte 區域包含 8 組 16-bit 的每 Lane 連結速率條目。每組以 little-endian 儲存：低位元組在低地址，高位元組在高地址。速率 = 條目值 × 200 kHz。有效條目必須唯一且由低到高排列，第一個條目必須非零。0000h 表示此條目及以上無效。標準值範例：RBR=1FA4h、HBR=34BCh、HBR2=6978h、HBR3=9E34h。", b: [{ r: "7:0", n: "SUPPORTED_LINK_RATES3[15:8]", d: "Entry 3 高位元組。與 DPCD 00016h 組合為 little-endian 16-bit 值，乘以 200 kHz 即得每 Lane 連結速率。" }] },
  "00018": { n: "SUPPORTED_LINK_RATES4[7:0]", c: "支援 Link Rate 表 Entry 4 低位元組", rw: 0, d: "eDP v1.4+ 支援 Link Rate 表。此 16-byte 區域包含 8 組 16-bit 的每 Lane 連結速率條目。每組以 little-endian 儲存：低位元組在低地址，高位元組在高地址。速率 = 條目值 × 200 kHz。有效條目必須唯一且由低到高排列，第一個條目必須非零。0000h 表示此條目及以上無效。標準值範例：RBR=1FA4h、HBR=34BCh、HBR2=6978h、HBR3=9E34h。", b: [{ r: "7:0", n: "SUPPORTED_LINK_RATES4[7:0]", d: "Entry 4 低位元組。與 DPCD 00019h 組合為 little-endian 16-bit 值，乘以 200 kHz 即得每 Lane 連結速率。" }] },
  "00019": { n: "SUPPORTED_LINK_RATES4[15:8]", c: "支援 Link Rate 表 Entry 4 高位元組", rw: 0, d: "eDP v1.4+ 支援 Link Rate 表。此 16-byte 區域包含 8 組 16-bit 的每 Lane 連結速率條目。每組以 little-endian 儲存：低位元組在低地址，高位元組在高地址。速率 = 條目值 × 200 kHz。有效條目必須唯一且由低到高排列，第一個條目必須非零。0000h 表示此條目及以上無效。標準值範例：RBR=1FA4h、HBR=34BCh、HBR2=6978h、HBR3=9E34h。", b: [{ r: "7:0", n: "SUPPORTED_LINK_RATES4[15:8]", d: "Entry 4 高位元組。與 DPCD 00018h 組合為 little-endian 16-bit 值，乘以 200 kHz 即得每 Lane 連結速率。" }] },
  "0001A": { n: "SUPPORTED_LINK_RATES5[7:0]", c: "支援 Link Rate 表 Entry 5 低位元組", rw: 0, d: "eDP v1.4+ 支援 Link Rate 表。此 16-byte 區域包含 8 組 16-bit 的每 Lane 連結速率條目。每組以 little-endian 儲存：低位元組在低地址，高位元組在高地址。速率 = 條目值 × 200 kHz。有效條目必須唯一且由低到高排列，第一個條目必須非零。0000h 表示此條目及以上無效。標準值範例：RBR=1FA4h、HBR=34BCh、HBR2=6978h、HBR3=9E34h。", b: [{ r: "7:0", n: "SUPPORTED_LINK_RATES5[7:0]", d: "Entry 5 低位元組。與 DPCD 0001Bh 組合為 little-endian 16-bit 值，乘以 200 kHz 即得每 Lane 連結速率。" }] },
  "0001B": { n: "SUPPORTED_LINK_RATES5[15:8]", c: "支援 Link Rate 表 Entry 5 高位元組", rw: 0, d: "eDP v1.4+ 支援 Link Rate 表。此 16-byte 區域包含 8 組 16-bit 的每 Lane 連結速率條目。每組以 little-endian 儲存：低位元組在低地址，高位元組在高地址。速率 = 條目值 × 200 kHz。有效條目必須唯一且由低到高排列，第一個條目必須非零。0000h 表示此條目及以上無效。標準值範例：RBR=1FA4h、HBR=34BCh、HBR2=6978h、HBR3=9E34h。", b: [{ r: "7:0", n: "SUPPORTED_LINK_RATES5[15:8]", d: "Entry 5 高位元組。與 DPCD 0001Ah 組合為 little-endian 16-bit 值，乘以 200 kHz 即得每 Lane 連結速率。" }] },
  "0001C": { n: "SUPPORTED_LINK_RATES6[7:0]", c: "支援 Link Rate 表 Entry 6 低位元組", rw: 0, d: "eDP v1.4+ 支援 Link Rate 表。此 16-byte 區域包含 8 組 16-bit 的每 Lane 連結速率條目。每組以 little-endian 儲存：低位元組在低地址，高位元組在高地址。速率 = 條目值 × 200 kHz。有效條目必須唯一且由低到高排列，第一個條目必須非零。0000h 表示此條目及以上無效。標準值範例：RBR=1FA4h、HBR=34BCh、HBR2=6978h、HBR3=9E34h。", b: [{ r: "7:0", n: "SUPPORTED_LINK_RATES6[7:0]", d: "Entry 6 低位元組。與 DPCD 0001Dh 組合為 little-endian 16-bit 值，乘以 200 kHz 即得每 Lane 連結速率。" }] },
  "0001D": { n: "SUPPORTED_LINK_RATES6[15:8]", c: "支援 Link Rate 表 Entry 6 高位元組", rw: 0, d: "eDP v1.4+ 支援 Link Rate 表。此 16-byte 區域包含 8 組 16-bit 的每 Lane 連結速率條目。每組以 little-endian 儲存：低位元組在低地址，高位元組在高地址。速率 = 條目值 × 200 kHz。有效條目必須唯一且由低到高排列，第一個條目必須非零。0000h 表示此條目及以上無效。標準值範例：RBR=1FA4h、HBR=34BCh、HBR2=6978h、HBR3=9E34h。", b: [{ r: "7:0", n: "SUPPORTED_LINK_RATES6[15:8]", d: "Entry 6 高位元組。與 DPCD 0001Ch 組合為 little-endian 16-bit 值，乘以 200 kHz 即得每 Lane 連結速率。" }] },
  "0001E": { n: "SUPPORTED_LINK_RATES7[7:0]", c: "支援 Link Rate 表 Entry 7 低位元組", rw: 0, d: "eDP v1.4+ 支援 Link Rate 表。此 16-byte 區域包含 8 組 16-bit 的每 Lane 連結速率條目。每組以 little-endian 儲存：低位元組在低地址，高位元組在高地址。速率 = 條目值 × 200 kHz。有效條目必須唯一且由低到高排列，第一個條目必須非零。0000h 表示此條目及以上無效。標準值範例：RBR=1FA4h、HBR=34BCh、HBR2=6978h、HBR3=9E34h。", b: [{ r: "7:0", n: "SUPPORTED_LINK_RATES7[7:0]", d: "Entry 7 低位元組。與 DPCD 0001Fh 組合為 little-endian 16-bit 值，乘以 200 kHz 即得每 Lane 連結速率。" }] },
  "0001F": { n: "SUPPORTED_LINK_RATES7[15:8]", c: "支援 Link Rate 表 Entry 7 高位元組", rw: 0, d: "eDP v1.4+ 支援 Link Rate 表。此 16-byte 區域包含 8 組 16-bit 的每 Lane 連結速率條目。每組以 little-endian 儲存：低位元組在低地址，高位元組在高地址。速率 = 條目值 × 200 kHz。有效條目必須唯一且由低到高排列，第一個條目必須非零。0000h 表示此條目及以上無效。標準值範例：RBR=1FA4h、HBR=34BCh、HBR2=6978h、HBR3=9E34h。", b: [{ r: "7:0", n: "SUPPORTED_LINK_RATES7[15:8]", d: "Entry 7 高位元組。與 DPCD 0001Eh 組合為 little-endian 16-bit 值，乘以 200 kHz 即得每 Lane 連結速率。" }] },

  // ===== FAUX / MST / Audio (00020h–00022h) =====

  "00020": {
    n: "FAUX_CAP",
    c: "Fast AUX 能力",
    rw: 0,
    d: "Fast AUX（FAUX）是 DP 1.2 新增的高速 AUX 通道。傳統 AUX 通道速率僅 1Mbps，FAUX 可透過 Main Link 的額外通道提供 720Mbps 雙向通訊，適合 USB 等高速資料傳輸。實務上很少面板支援此功能，通常讀到 0。",
    b: [
      { r: "7:2", n: "RESERVED", c: "保留位元", v: {} },
      { r: "1", n: "FAUX_CAP_1", c: "FAUX Inter-link 支援", v: {
        "0": "不支援 FAUX Inter-link",
        "1": "支援 FAUX Inter-link"
      }},
      { r: "0", n: "FAUX_CAP_0", c: "FAUX 能力", v: {
        "0": "不支援 Fast AUX",
        "1": "支援 Fast AUX"
      }}
    ]
  },

  "00021": {
    n: "MSTM_CAP",
    c: "MST 多螢幕串接能力",
    rw: 0,
    d: "MST = Multi-Stream Transport（多串流傳輸）。允許一條 DP 線串接多台螢幕（Daisy Chain）或透過 MST Hub 分接多台螢幕。讀到 1 表示 Sink 支援 MST，可以做菊鍊串接。eDP 面板通常不支援 MST。如果你的 MST Hub 無法正常分接，先確認此 bit 是否為 1。",
    b: [
      { r: "7:1", n: "RESERVED", c: "保留位元", v: {} },
      { r: "0", n: "MST_CAP", c: "MST 支援", v: {
        "0": "不支援 MST（SST only，只能一對一）",
        "1": "支援 MST（可串接或分接多螢幕）"
      }}
    ]
  },

  "00022": {
    n: "NUMBER_OF_AUDIO_ENDPOINTS",
    c: "音訊端點數量",
    rw: 0,
    d: "Sink 裝置上音訊輸出端點的數量。DisplayPort 可同時傳輸影像和音訊。此值表示有幾個獨立的音訊輸出（例如螢幕內建喇叭 = 1，螢幕有耳機孔 + 喇叭 = 2）。eDP 面板通常為 0（筆電音訊走獨立 codec），外接螢幕可能為 1 或更多。",
    b: [
      { r: "7:0", n: "NUMBER_OF_AUDIO_ENDPOINTS", c: "音訊端點數", v: {
        "0": "無音訊端點",
        "1": "1 個音訊端點（最常見，螢幕內建喇叭）"
      }}
    ]
  },

  // ===== 保留區域 00023h–0005Fh =====

  "00023": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址 00023h~0002Fh，規格未定義。", b: [] },
  "00024": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址。", b: [] },
  "00025": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址。", b: [] },
  "00026": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址。", b: [] },
  "00027": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址。", b: [] },
  "00028": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址。", b: [] },
  "00029": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址。", b: [] },
  "0002A": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址。", b: [] },
  "0002B": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址。", b: [] },
  "0002C": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址。", b: [] },
  "0002D": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址。", b: [] },
  "0002E": {
    n: "RECEIVER_ADVANCED_LINK_POWER_MANAGEMENT_CAPABILITIES",
    c: "接收端進階低功耗管理能力",
    rw: 0,
    d: "此暫存器報告 Sink 是否支援 ALPM（Advanced Link Power Management，進階連結電源管理）。ALPM 可在靜態畫面時降低主連結功耗，是 eDP 面板省電的關鍵功能之一。",
    b: [
      { r: "0", n: "ALPM_CAP", d: "0 = 不支援 ALPM。1 = 支援 ALPM。" }
    ]
  },
  "0002F": {
    n: "AUX_FRAME_SYNC",
    c: "AUX Frame Sync 能力",
    rw: 0,
    d: "此暫存器報告 Sink 是否支援 AUX Frame Sync。AUX Frame Sync 允許 Source 透過 AUX 通道同步 Sink 端的更新時序。",
    b: [
      { r: "0", n: "AUX_FRAME_SYNC_CAP", d: "0 = 不支援 AUX Frame Sync。1 = 支援 AUX Frame Sync。" }
    ]
  },
  "00030": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址 00030h~0005Fh，規格未定義。部分廠商可能在此放私有功能，但非標準。", b: [] },

  // ===== DSC 壓縮能力 (00060h–0006Ch) — DP v1.4 新增 =====

  "00060": {
    n: "DSC_SUPPORT",
    c: "DSC 壓縮支援",
    rw: 0,
    d: "DSC = Display Stream Compression（顯示串流壓縮），是 VESA 定義的視覺無損壓縮標準。DP 1.4 新增此功能，可在頻寬不足時壓縮影像資料（通常壓縮比 3:1），讓較低速率的連結也能傳輸高解析度畫面。例如 4K@120Hz HDR 的頻寬需求超過 HBR3×4Lane，此時必須開啟 DSC。除錯時若解析度跑不上去，先確認 DSC 是否可用。",
    b: [
      { r: "7:2", n: "RESERVED", c: "保留位元", v: {} },
      { r: "1", n: "DSC_PASSTHROUGH_SUPPORT", c: "DSC 穿透", v: {
        "0": "不支援 DSC 穿透",
        "1": "支援 DSC 穿透（Branch Device 可將壓縮資料直接轉發給下游）"
      }},
      { r: "0", n: "DSC_SUPPORT", c: "DSC 解碼支援", v: {
        "0": "不支援 DSC（DPCD < 1.4 或低階面板）",
        "1": "支援 DSC 解碼（面板內建 DSC 解碼器）"
      }}
    ]
  },

  "00061": {
    n: "DSC_ALGORITHM_REVISION",
    c: "DSC 演算法版本",
    rw: 0,
    d: "DSC 壓縮演算法的版本號。目前主流是 DSC 1.1 和 1.2。版本越高支援的色彩格式和壓縮效率越好。Source 和 Sink 必須使用相容的 DSC 版本。",
    b: [
      { r: "7:4", n: "DSC_MAJOR_REV", c: "DSC 主版號", v: {
        "1": "DSC 1.x"
      }},
      { r: "3:0", n: "DSC_MINOR_REV", c: "DSC 次版號", v: {
        "1": "DSC 1.1（基礎版本）",
        "2": "DSC 1.2（加入 YCbCr Native 420/422 支援）"
      }}
    ]
  },

  "00062": {
    n: "DSC_RC_BUFFER_BLOCK_SIZE",
    c: "DSC RC Buffer 區塊大小",
    rw: 0,
    d: "DSC 壓縮的 Rate Control Buffer 區塊大小。RC Buffer 用於控制壓縮率的穩定性。此值決定 buffer 的基本單位大小。",
    b: [
      { r: "7:2", n: "RESERVED", c: "保留位元", v: {} },
      { r: "1:0", n: "RC_BLOCK_SIZE", c: "RC Buffer 區塊大小", v: {
        "0b00": "1 KB",
        "0b01": "4 KB",
        "0b10": "16 KB",
        "0b11": "64 KB"
      }}
    ]
  },

  "00063": {
    n: "DSC_RC_BUFFER_SIZE",
    c: "DSC RC Buffer 總大小",
    rw: 0,
    d: "DSC RC Buffer 的總大小，單位由 00062h 的 Block Size 決定。總容量 = (此值+1) × Block Size。RC Buffer 越大，壓縮品質越穩定，但面板成本越高。",
    b: [
      { r: "7:0", n: "RC_BUFFER_SIZE", c: "RC Buffer 大小", v: {
        "0x00": "1 個 block",
        "0xFF": "256 個 block"
      }}
    ]
  },

  "00064": {
    n: "DSC_SLICE_CAPABILITIES_1",
    c: "DSC Slice 能力（第 1 組）",
    rw: 0,
    d: "DSC 壓縮時，畫面會被切成多個水平 Slice 分別壓縮。此暫存器告訴你面板支援多少 Slice。Slice 數越多，壓縮延遲越低，但面板硬體複雜度越高。4K 面板常見 8~12 Slice，8K 需要更多。",
    b: [
      { r: "7", n: "RESERVED", c: "保留", v: {} },
      { r: "6", n: "12_SLICES_PER_SINK", c: "12 Slice", v: { "0": "不支援", "1": "支援每畫面 12 Slice" } },
      { r: "5", n: "10_SLICES_PER_SINK", c: "10 Slice", v: { "0": "不支援", "1": "支援每畫面 10 Slice" } },
      { r: "4", n: "8_SLICES_PER_SINK", c: "8 Slice", v: { "0": "不支援", "1": "支援每畫面 8 Slice" } },
      { r: "3", n: "6_SLICES_PER_SINK", c: "6 Slice", v: { "0": "不支援", "1": "支援每畫面 6 Slice" } },
      { r: "2", n: "4_SLICES_PER_SINK", c: "4 Slice", v: { "0": "不支援", "1": "支援每畫面 4 Slice" } },
      { r: "1", n: "2_SLICES_PER_SINK", c: "2 Slice", v: { "0": "不支援", "1": "支援每畫面 2 Slice" } },
      { r: "0", n: "1_SLICE_PER_SINK", c: "1 Slice", v: { "0": "不支援", "1": "支援每畫面 1 Slice" } }
    ]
  },

  "00065": {
    n: "DSC_LINE_BUFFER_BIT_DEPTH",
    c: "DSC Line Buffer 位元深度",
    rw: 0,
    d: "DSC 解碼器內部 Line Buffer 的位元深度。此值決定解碼器能處理的最大色彩精度。較高的位元深度支援更精細的色彩（如 HDR 10-bit、12-bit），但需要更多的面板記憶體。",
    b: [
      { r: "7:4", n: "RESERVED", c: "保留位元", v: {} },
      { r: "3:0", n: "LINE_BUFFER_BIT_DEPTH", c: "Line Buffer 深度", v: {
        "0x0": "9 bits",
        "0x1": "10 bits",
        "0x2": "11 bits",
        "0x3": "12 bits",
        "0x4": "13 bits",
        "0x5": "14 bits",
        "0x6": "15 bits",
        "0x7": "16 bits",
        "0x8": "8 bits"
      }}
    ]
  },

  "00066": {
    n: "DSC_BLOCK_PREDICTION",
    c: "DSC 區塊預測支援",
    rw: 0,
    d: "DSC 的 Block Prediction 功能可以在壓縮時利用相鄰區塊的相關性來提升壓縮效率。開啟後通常能在相同壓縮率下獲得更好的畫質，或在相同畫質下獲得更高的壓縮率。建議在 Sink 支援時一律開啟。",
    b: [
      { r: "7:1", n: "RESERVED", c: "保留位元", v: {} },
      { r: "0", n: "BLOCK_PREDICTION_SUPPORT", c: "區塊預測", v: {
        "0": "不支援 Block Prediction",
        "1": "支援 Block Prediction（建議開啟以提升壓縮品質）"
      }}
    ]
  },

  "00067": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址 00067h。", b: [] },
  "00068": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址 00068h。", b: [] },

  "00069": {
    n: "DSC_COLOR_FORMAT_CAPABILITIES",
    c: "DSC 色彩格式能力",
    rw: 0,
    d: "告訴你 DSC 解碼器支援哪些色彩格式。RGB 是最基本的，YCbCr 4:4:4 和 4:2:2 用於視頻優化（色度取樣減少頻寬），Simple 4:2:2 是簡化版本。除錯 DSC 時，若指定的色彩格式面板不支援，會導致畫面異常。",
    b: [
      { r: "7:4", n: "RESERVED", c: "保留位元", v: {} },
      { r: "3", n: "DSC_NATIVE_420_SUPPORT", c: "原生 4:2:0 支援", v: {
        "0": "不支援 DSC Native YCbCr 4:2:0",
        "1": "支援（DSC 1.2 新增，適合超高解析度視訊）"
      }},
      { r: "2", n: "DSC_SIMPLE_422_SUPPORT", c: "簡易 4:2:2 支援", v: {
        "0": "不支援 DSC Simple YCbCr 4:2:2",
        "1": "支援"
      }},
      { r: "1", n: "DSC_YCBCR444_SUPPORT", c: "YCbCr 4:4:4 支援", v: {
        "0": "不支援 DSC YCbCr 4:4:4",
        "1": "支援（完整色度取樣）"
      }},
      { r: "0", n: "DSC_RGB_SUPPORT", c: "RGB 支援", v: {
        "0": "不支援 DSC RGB（幾乎不可能）",
        "1": "支援 DSC RGB（所有 DSC 面板都支援）"
      }}
    ]
  },

  "0006A": {
    n: "DSC_COLOR_DEPTH_CAPABILITIES",
    c: "DSC 色彩深度能力",
    rw: 0,
    d: "DSC 解碼器支援的輸入色彩深度。bpc = bits per component（每色彩分量位元數）。8bpc 是 SDR 標準，10bpc 是 HDR 常用，12bpc 是專業級。面板支援的最大 bpc 決定了 DSC 能處理的最大色深。",
    b: [
      { r: "7:4", n: "RESERVED", c: "保留位元", v: {} },
      { r: "3", n: "DSC_16BPC_SUPPORT", c: "16bpc 支援", v: { "0": "不支援", "1": "支援 16bpc（極少見）" } },
      { r: "2", n: "DSC_12BPC_SUPPORT", c: "12bpc 支援", v: { "0": "不支援", "1": "支援 12bpc（專業面板）" } },
      { r: "1", n: "DSC_10BPC_SUPPORT", c: "10bpc 支援", v: { "0": "不支援", "1": "支援 10bpc（HDR 標配）" } },
      { r: "0", n: "DSC_8BPC_SUPPORT", c: "8bpc 支援", v: { "0": "不支援", "1": "支援 8bpc（SDR 標配）" } }
    ]
  },

  "0006B": {
    n: "PEAK_DSC_THROUGHPUT",
    c: "DSC 峰值吞吐量",
    rw: 0,
    d: "DSC 解碼器的峰值處理速度，分成 Mode 0 和 Mode 1 兩種模式。此值決定 DSC 能支援的最大像素時脈（Pixel Clock）。如果面板解析度×更新率的像素時脈超過此上限，就無法使用 DSC。",
    b: [
      { r: "7:4", n: "DSC_THROUGHPUT_MODE_1", c: "Mode 1 吞吐量", v: {
        "0x0": "不支援",
        "0x1": "340 MP/s（百萬像素/秒）",
        "0x2": "400 MP/s",
        "0x3": "450 MP/s",
        "0x4": "500 MP/s",
        "0x5": "550 MP/s",
        "0x6": "600 MP/s",
        "0x7": "650 MP/s",
        "0x8": "700 MP/s",
        "0x9": "750 MP/s",
        "0xA": "800 MP/s",
        "0xB": "850 MP/s",
        "0xC": "900 MP/s",
        "0xD": "950 MP/s",
        "0xE": "1000 MP/s"
      }},
      { r: "3:0", n: "DSC_THROUGHPUT_MODE_0", c: "Mode 0 吞吐量", v: {
        "0x0": "不支援",
        "0x1": "340 MP/s",
        "0x2": "400 MP/s",
        "0x3": "450 MP/s",
        "0x4": "500 MP/s",
        "0x5": "550 MP/s",
        "0x6": "600 MP/s",
        "0x7": "650 MP/s",
        "0x8": "700 MP/s",
        "0x9": "750 MP/s",
        "0xA": "800 MP/s",
        "0xB": "850 MP/s",
        "0xC": "900 MP/s",
        "0xD": "950 MP/s",
        "0xE": "1000 MP/s"
      }}
    ]
  },

  "0006C": {
    n: "DSC_MAXIMUM_SLICE_WIDTH",
    c: "DSC 最大 Slice 寬度",
    rw: 0,
    d: "每個 DSC Slice 的最大像素寬度。此值 × 支援的 Slice 數 = 面板能處理的最大水平解析度。例如最大 Slice 寬度 2560 pixel × 4 Slice = 10240 pixel。計算公式：此暫存器值 × 320 pixels。除錯時若 DSC 啟用但畫面異常，檢查 Slice 寬度是否超出此上限。",
    b: [
      { r: "7:0", n: "DSC_MAX_SLICE_WIDTH", c: "最大 Slice 寬度", v: {
        "0x00": "不支援（0 × 320 = 0）",
        "0x08": "2560 pixels（8 × 320，4K 面板常見）",
        "0x0C": "3840 pixels（12 × 320）",
        "0x10": "5120 pixels（16 × 320，8K 面板需要）"
      }}
    ]
  },

  // ===== 保留區域 0006Dh–0006Fh =====

  "0006D": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址 0006Dh~0006Fh。", b: [] },
  "0006E": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址。", b: [] },
  "0006F": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址。", b: [] },

  // ===== PSR 能力 (00070h–00071h) — eDP v1.2 新增 =====

  "00070": {
    n: "PSR_SUPPORT",
    c: "PSR 支援與版本",
    rw: 0,
    d: "PSR = Panel Self-Refresh（面板自刷新），是 eDP 省電的核心技術。開啟 PSR 後，當畫面靜止不變時，Source（GPU）可停止送資料，面板用自己的記憶體持續顯示上一幀。可大幅降低筆電功耗。PSR1 是基礎版本，PSR2（也叫 Selective Update）更省電，只更新畫面有變化的區域。除錯 eDP 省電問題時必看此暫存器。",
    b: [
      { r: "7:3", n: "RESERVED", c: "保留位元", v: {} },
      { r: "2", n: "Y_COORDINATE_REQUIRED", c: "Y 座標需求", v: {
        "0": "不需要（PSR1 或 PSR2 不需 Y 座標）",
        "1": "PSR2 需要 Source 提供 Y 座標資訊"
      }},
      { r: "1", n: "PSR2_SUPPORTED", c: "PSR2 支援", v: {
        "0": "不支援 PSR2（僅 PSR1 或不支援 PSR）",
        "1": "支援 PSR2/Selective Update（eDP 1.4+ 高階面板）"
      }},
      { r: "0", n: "PSR_SUPPORT", c: "PSR1 支援", v: {
        "0": "不支援 PSR（外接 DP 螢幕或低階面板）",
        "1": "支援 PSR1（eDP 面板省電標配）"
      }}
    ]
  },

  "00071": {
    n: "PSR_CAPABILITIES",
    c: "PSR 詳細能力",
    rw: 0,
    d: "PSR 的進階能力旗標。包含面板是否支援 PSR2 的局部更新、SU 粒度、以及 Link Training 是否需要在 PSR 退出時重做等。這些細節影響 PSR 的實際省電效果和退出延遲。",
    b: [
      { r: "7:5", n: "RESERVED", c: "保留位元", v: {} },
      { r: "4", n: "PSR_SETUP_TIME", c: "PSR 建立時間（高位）", v: {} },
      { r: "3", n: "SU_GRANULARITY_REQUIRED", c: "SU 粒度要求", v: {
        "0": "不需要特定 SU 粒度",
        "1": "需要特定 Selective Update 粒度（見 00072h）"
      }},
      { r: "2:1", n: "PSR_SETUP_TIME_LOW", c: "PSR 建立時間（低位）", v: {
        "0b000": "330µs（與 bit4 組合，三位元）",
        "0b001": "275µs",
        "0b010": "220µs",
        "0b011": "165µs",
        "0b100": "110µs",
        "0b101": "55µs",
        "0b110": "0µs（即時進入 PSR）"
      }},
      { r: "0", n: "LINK_TRAINING_ON_EXIT", c: "PSR 退出重訓練", v: {
        "0": "PSR 退出不需要重新 Link Training（快速恢復）",
        "1": "PSR 退出需要重新 Link Training（恢復較慢）"
      }}
    ]
  },

  // ===== 保留區域 00072h–0008Fh =====

  "00072": { n: "PSR2_SU_X_GRANULARITY_H", c: "PSR2 SU X 粒度高位元組", rw: 0, d: "PSR2 Selective Update 的水平粒度高位元組。與 00073h 組合為 16-bit 值，表示 SU 區域的最小水平像素單位。", b: [] },
  "00073": { n: "PSR2_SU_X_GRANULARITY_L", c: "PSR2 SU X 粒度低位元組", rw: 0, d: "PSR2 Selective Update 的水平粒度低位元組。", b: [] },
  "00074": { n: "PSR2_SU_Y_GRANULARITY", c: "PSR2 SU Y 粒度", rw: 0, d: "PSR2 Selective Update 的垂直粒度，表示 SU 區域的最小垂直像素行數。值為 0 表示不限制。", b: [] },
  "00075": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址 00075h~0008Fh。", b: [] },

  // ===== 下游端口能力 (00080h–00087h) =====

  "00080": {
    n: "DOWNSTREAM_PORT_0_CAP_0",
    c: "下游端口 0 能力（byte 0）",
    rw: 0,
    d: "下游端口 0 的詳細能力。僅在 00005h bit3=1 時有效。對 DP→HDMI 轉接器除錯很有用：可以知道下游端口類型（HDMI/VGA/DVI）和支援的格式。",
    b: [
      { r: "7", n: "NON_EDID_DWN_STRM_PORT", c: "非 EDID 端口", v: {
        "0": "有 EDID 的下游端口",
        "1": "無 EDID 的下游端口（例如某些 VGA 轉接）"
      }},
      { r: "6:4", n: "RESERVED", c: "保留位元", v: {} },
      { r: "3", n: "HPD_AWARE", c: "HPD 感知", v: {
        "0": "下游端口無 HPD 偵測",
        "1": "下游端口有 HPD（Hot Plug Detect）偵測能力"
      }},
      { r: "2:0", n: "DWN_STRM_PORT_TYPE", c: "下游端口類型", v: {
        "0b000": "DP",
        "0b001": "VGA / Analog",
        "0b010": "DVI",
        "0b011": "HDMI",
        "0b100": "其他（非標準端口）"
      }}
    ]
  },

  "00081": {
    n: "DOWNSTREAM_PORT_0_CAP_1",
    c: "下游端口 0 能力（byte 1）",
    rw: 0,
    d: "下游端口 0 的進階能力，包含支援的最大 TMDS 時脈（HDMI/DVI 用）和色彩深度等。對確認轉接器輸出能力很有用。",
    b: [
      { r: "7:0", n: "MAX_TMDS_CLOCK", c: "最大 TMDS 時脈", v: {
        "0x00": "25MHz（最低）",
        "0x3C": "165MHz（DVI 單路上限）",
        "0x5A": "300MHz（HDMI 2.0 上限）"
      }}
    ]
  },

  // ===== 保留區域 00082h–0008Fh =====

  "00082": { n: "DOWNSTREAM_PORT_0_CAP_2", c: "下游端口 0 能力（byte 2）", rw: 0, d: "下游端口 0 的額外能力位元組。具體定義隨端口類型和 DPCD 版本而異。", b: [] },
  "00083": { n: "DOWNSTREAM_PORT_0_CAP_3", c: "下游端口 0 能力（byte 3）", rw: 0, d: "下游端口 0 的額外能力位元組。", b: [] },
  "00084": { n: "DOWNSTREAM_PORT_1_CAP_0", c: "下游端口 1 能力（byte 0）", rw: 0, d: "下游端口 1 的能力，結構同 00080h。僅在有多個下游端口時有意義。", b: [] },
  "00085": { n: "DOWNSTREAM_PORT_1_CAP_1", c: "下游端口 1 能力（byte 1）", rw: 0, d: "下游端口 1 的進階能力。", b: [] },
  "00086": { n: "DOWNSTREAM_PORT_1_CAP_2", c: "下游端口 1 能力（byte 2）", rw: 0, d: "下游端口 1 的額外能力位元組。", b: [] },
  "00087": { n: "DOWNSTREAM_PORT_1_CAP_3", c: "下游端口 1 能力（byte 3）", rw: 0, d: "下游端口 1 的額外能力位元組。", b: [] },

  // ===== 保留區域 00088h–0008Fh =====

  "00088": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址 00088h~0008Fh。", b: [] },
  "00089": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址。", b: [] },
  "0008A": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址。", b: [] },
  "0008B": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址。", b: [] },
  "0008C": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址。", b: [] },
  "0008D": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址。", b: [] },
  "0008E": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址。", b: [] },
  "0008F": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址。", b: [] },

  // ===== FEC 能力 (00090h) — DP v1.4 新增 =====

  "00090": {
    n: "FEC_CAPABILITY",
    c: "FEC 前向糾錯能力",
    rw: 0,
    d: "FEC = Forward Error Correction（前向糾錯）。DP 1.4 新增的功能，在資料中加入冗餘的糾錯碼，讓接收端可以自動修正傳輸過程中的位元錯誤。當開啟 DSC 壓縮時，FEC 是強制必須開啟的（因為壓縮資料對錯誤非常敏感）。FEC 會佔用約 2.4% 的頻寬作為糾錯開銷。除錯 DSC 失敗時，先確認 FEC 是否正確啟用。",
    b: [
      { r: "7:4", n: "RESERVED", c: "保留位元", v: {} },
      { r: "3", n: "FEC_CAPABLE_FOR_COMPRESSED", c: "FEC 壓縮路徑", v: {
        "0": "不支援壓縮資料的 FEC",
        "1": "支援 DSC 壓縮資料路徑的 FEC（DSC 必備條件）"
      }},
      { r: "2", n: "FEC_CAPABLE_FOR_UNCOMPRESSED", c: "FEC 非壓縮路徑", v: {
        "0": "不支援非壓縮資料的 FEC",
        "1": "支援非壓縮資料的 FEC（可選，提升連結可靠性）"
      }},
      { r: "1", n: "FEC_CORR_BLK_ERR_COUNT_CAP", c: "FEC 糾錯計數", v: {
        "0": "不支援 FEC 糾錯區塊計數",
        "1": "支援讀取 FEC 糾正的區塊數（除錯用，可監控連結品質）"
      }},
      { r: "0", n: "FEC_CAPABLE", c: "FEC 支援", v: {
        "0": "不支援 FEC",
        "1": "支援 FEC（DP 1.4 裝置通常支援）"
      }}
    ]
  },

  // ===== 保留區域 00091h–000AFh =====

  "00091": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址 00091h~000AFh。", b: [] },
  "00092": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址。", b: [] },

  // ===== Panel Replay 能力 (000B0h) — eDP v1.5 新增 =====

  "000B0": {
    n: "PANEL_REPLAY_CAPABILITY",
    c: "Panel Replay 面板重播能力",
    rw: 0,
    d: "Panel Replay 是 eDP 1.5 新增的省電技術，可視為 PSR 的進化版。與 PSR 不同，Panel Replay 在 Link 層面保持活躍，只是停止傳送影像幀。退出延遲更低、與 PSR2 Selective Update 相容性更好。適合需要極低延遲恢復的應用（如觸控筆、遊戲筆電）。",
    b: [
      { r: "7:2", n: "RESERVED", c: "保留位元", v: {} },
      { r: "1", n: "PANEL_REPLAY_SU_SUPPORT", c: "Selective Update 支援", v: {
        "0": "Panel Replay 不支援局部更新",
        "1": "Panel Replay 支援 Selective Update（最佳省電模式）"
      }},
      { r: "0", n: "PANEL_REPLAY_SUPPORT", c: "Panel Replay 支援", v: {
        "0": "不支援 Panel Replay",
        "1": "支援 Panel Replay（eDP 1.5+ 高階面板）"
      }}
    ]
  },

  // ===== 保留區域 000B1h–000FFh =====

  "000B1": { n: "RESERVED", c: "保留", rw: 0, d: "保留位址 000B1h~000FFh，為未來 DPCD 版本擴充預留。部分位址在 DP 2.0 或更新規格中可能已有定義。", b: [] }
},
{
// ===== Link Configuration & Status (00100h–002FFh) =====
// =====================================================
//  Link Configuration  00100h – 001FFh
// =====================================================

"00100": {
  n: "LINK_BW_SET",
  c: "連結頻寬設定",
  rw: 1,
  vv: [{v:0x06,l:"06h — RBR 1.62Gbps"},{v:0x0A,l:"0Ah — HBR 2.7Gbps"},{v:0x14,l:"14h — HBR2 5.4Gbps"},{v:0x1E,l:"1Eh — HBR3 8.1Gbps"}],
  d: "Source 端寫入此暫存器來設定 Main Link 每條 Lane 的資料速率。必須在 Link Training 開始之前先寫好。除錯時讀回這個值，可確認目前協商到的速率是否正確；若讀回 0x00 代表尚未設定或被清除。",
  b: [
    { r:"7:0", n:"LINK_BW_SET", c:"連結頻寬值", v:{
      "0x06":"RBR 1.62 Gbps（Reduced Bit Rate，最低速，適合短距離或低解析度）",
      "0x0A":"HBR 2.7 Gbps（High Bit Rate，DP 1.1 起支援）",
      "0x14":"HBR2 5.4 Gbps（DP 1.2 起，eDP 面板常用此速率）",
      "0x1E":"HBR3 8.1 Gbps（DP 1.3+ / eDP 1.4a+，高解析度必備）"
    }}
  ]
},

"00101": {
  n: "LANE_COUNT_SET",
  c: "Lane 數量設定",
  rw: 1,
  d: "設定要使用幾條 Lane 來傳輸資料，以及是否啟用 Enhanced Framing。Lane 數量乘上每 Lane 速率 = 總頻寬。除錯時注意：若 Sink 只支援 2 Lane 但 Source 寫了 4，Link Training 一定會失敗。",
  b: [
    { r:"7", n:"ENHANCED_FRAME_EN", c:"Enhanced Framing 啟用", v:{
      "0":"停用（僅 DP 1.0 裝置可能如此）",
      "1":"啟用 Enhanced Framing（DP 1.1+ 必須啟用，改善 Blanking Start/End 偵測）"
    }},
    { r:"6", n:"POST_LT_ADJ_REQ_GRANTED", c:"訓練後微調授權（DP 1.3+）", v:{
      "0":"不允許 Link Training 完成後再微調",
      "1":"允許 Sink 在 Training 完成後持續要求調整 VS/PE"
    }},
    { r:"4:0", n:"LANE_COUNT_SET", c:"Lane 數量", v:{
      "0x01":"1 Lane",
      "0x02":"2 Lanes",
      "0x04":"4 Lanes"
    }}
  ]
},

"00102": {
  n: "TRAINING_PATTERN_SET",
  c: "訓練模式設定",
  rw: 1,
  d: "Link Training 的核心控制暫存器。Source 依序寫入 TPS1→TPS2（或 TPS3/TPS4）來完成 Clock Recovery 與 Channel EQ。Scrambling 控制也在這裡。除錯時最常看：Training 卡在 TPS1 表示 CR 失敗（電壓不夠），卡在 TPS2/3 表示 EQ 失敗（訊號品質差）。",
  b: [
    { r:"1:0", n:"TRAINING_PATTERN_SELECT", c:"訓練模式選擇", v:{
      "0x0":"Training 關閉（正常傳輸模式）",
      "0x1":"TPS1（Training Pattern Sequence 1）— 用於 Clock Recovery",
      "0x2":"TPS2 — 用於 Channel Equalization（DP 1.1）",
      "0x3":"TPS3 — 用於 HBR2 的 Channel EQ（DP 1.2+，比 TPS2 更長的序列）"
    }},
    { r:"3:2", n:"LINK_QUAL_PATTERN_EN", c:"Link Quality 測試模式", v:{
      "0x0":"未啟用",
      "0x1":"D10.2 測試模式",
      "0x2":"Symbol Error Rate 測量模式",
      "0x3":"PRBS7 測試模式"
    }},
    { r:"4", n:"RECOVERED_CLOCK_OUT_EN", c:"恢復時脈輸出", v:{
      "0":"停用",
      "1":"啟用（僅用於測試）"
    }},
    { r:"5", n:"SCRAMBLING_DISABLE", c:"取消 Scrambling", v:{
      "0":"啟用 Scrambling（正常運作時必須啟用）",
      "1":"停用 Scrambling（僅在 Training 或測試時使用；eDP ASSR 模式下此位元行為不同）"
    }},
    { r:"7:6", n:"SYMBOL_ERROR_COUNT_SEL", c:"Symbol Error 計數模式", v:{
      "0x0":"Disparity + 非法 Symbol 都計數",
      "0x1":"只計 Disparity 錯誤",
      "0x2":"只計非法 Symbol 錯誤",
      "0x3":"保留"
    }}
  ]
},

"00103": {
  n: "TRAINING_LANE0_SET",
  c: "Lane 0 訓練參數設定",
  rw: 1,
  d: "設定 Lane 0 的 Voltage Swing（驅動電壓）和 Pre-emphasis（預加重）等級。Link Training 時 Source 根據 Sink 的 ADJUST_REQUEST 回饋來調整這些值。MAX_SWING / MAX_PE 旗標表示已到硬體極限，無法再加大。除錯重點：若 VS 已到 Level 3 仍然 CR 失敗，通常代表 PCB 走線太長或阻抗不匹配。",
  b: [
    { r:"1:0", n:"VOLTAGE_SWING_SET", c:"電壓擺幅等級", v:{
      "0x0":"Level 0（400mV，最低）",
      "0x1":"Level 1（600mV）",
      "0x2":"Level 2（800mV）",
      "0x3":"Level 3（1200mV，最高）"
    }},
    { r:"2", n:"MAX_SWING_REACHED", c:"已達最大擺幅", v:{
      "0":"尚未達到硬體 VS 上限",
      "1":"已達最大 VS，無法再提高"
    }},
    { r:"4:3", n:"PRE_EMPHASIS_SET", c:"預加重等級", v:{
      "0x0":"Level 0（0 dB，無預加重）",
      "0x1":"Level 1（3.5 dB）",
      "0x2":"Level 2（6.0 dB）",
      "0x3":"Level 3（9.5 dB，最高）"
    }},
    { r:"5", n:"MAX_PRE_EMPHASIS_REACHED", c:"已達最大預加重", v:{
      "0":"尚未達到硬體 PE 上限",
      "1":"已達最大 PE，無法再提高"
    }},
    { r:"7:6", n:"RESERVED", c:"保留", v:{}}
  ]
},

"00104": {
  n: "TRAINING_LANE1_SET",
  c: "Lane 1 訓練參數設定",
  rw: 1,
  d: "與 00103h 格式完全相同，控制 Lane 1 的 Voltage Swing 和 Pre-emphasis。在 2-Lane 或 4-Lane 配置下才有意義。",
  b: [
    { r:"1:0", n:"VOLTAGE_SWING_SET", c:"電壓擺幅等級", v:{
      "0x0":"Level 0（400mV）", "0x1":"Level 1（600mV）",
      "0x2":"Level 2（800mV）", "0x3":"Level 3（1200mV）"
    }},
    { r:"2", n:"MAX_SWING_REACHED", c:"已達最大擺幅", v:{"0":"否","1":"是"}},
    { r:"4:3", n:"PRE_EMPHASIS_SET", c:"預加重等級", v:{
      "0x0":"Level 0", "0x1":"Level 1",
      "0x2":"Level 2", "0x3":"Level 3"
    }},
    { r:"5", n:"MAX_PRE_EMPHASIS_REACHED", c:"已達最大預加重", v:{"0":"否","1":"是"}},
    { r:"7:6", n:"RESERVED", c:"保留", v:{}}
  ]
},

"00105": {
  n: "TRAINING_LANE2_SET",
  c: "Lane 2 訓練參數設定",
  rw: 1,
  d: "與 00103h 格式完全相同，控制 Lane 2。僅在 4-Lane 配置下使用。",
  b: [
    { r:"1:0", n:"VOLTAGE_SWING_SET", c:"電壓擺幅等級", v:{
      "0x0":"Level 0（400mV）", "0x1":"Level 1（600mV）",
      "0x2":"Level 2（800mV）", "0x3":"Level 3（1200mV）"
    }},
    { r:"2", n:"MAX_SWING_REACHED", c:"已達最大擺幅", v:{"0":"否","1":"是"}},
    { r:"4:3", n:"PRE_EMPHASIS_SET", c:"預加重等級", v:{
      "0x0":"Level 0", "0x1":"Level 1",
      "0x2":"Level 2", "0x3":"Level 3"
    }},
    { r:"5", n:"MAX_PRE_EMPHASIS_REACHED", c:"已達最大預加重", v:{"0":"否","1":"是"}},
    { r:"7:6", n:"RESERVED", c:"保留", v:{}}
  ]
},

"00106": {
  n: "TRAINING_LANE3_SET",
  c: "Lane 3 訓練參數設定",
  rw: 1,
  d: "與 00103h 格式完全相同，控制 Lane 3。僅在 4-Lane 配置下使用。",
  b: [
    { r:"1:0", n:"VOLTAGE_SWING_SET", c:"電壓擺幅等級", v:{
      "0x0":"Level 0（400mV）", "0x1":"Level 1（600mV）",
      "0x2":"Level 2（800mV）", "0x3":"Level 3（1200mV）"
    }},
    { r:"2", n:"MAX_SWING_REACHED", c:"已達最大擺幅", v:{"0":"否","1":"是"}},
    { r:"4:3", n:"PRE_EMPHASIS_SET", c:"預加重等級", v:{
      "0x0":"Level 0", "0x1":"Level 1",
      "0x2":"Level 2", "0x3":"Level 3"
    }},
    { r:"5", n:"MAX_PRE_EMPHASIS_REACHED", c:"已達最大預加重", v:{"0":"否","1":"是"}},
    { r:"7:6", n:"RESERVED", c:"保留", v:{}}
  ]
},

"00107": {
  n: "DOWNSPREAD_CTRL",
  c: "展頻與 MSA 控制",
  rw: 1,
  d: "控制 SSC（Spread Spectrum Clocking）展頻功能與 MSA Timing 忽略。SSC 是 EMI 降低技術，eDP 面板幾乎都會用到。MSA_TIMING_PAR_IGNORE 在 eDP 面板自帶 timing 時很有用，讓 Source 不需要精確匹配 MSA 參數。",
  b: [
    { r:"3:0", n:"SPREAD_AMP", c:"展頻控制", v:{
      "0x0":"無展頻（SSC 停用）",
      "0x1":"啟用最高 0.5% 下展頻（SSC on）"
    }},
    { r:"4", n:"RESERVED", c:"保留", v:{}},
    { r:"5", n:"MSA_TIMING_PAR_IGNORE_EN", c:"忽略 MSA Timing 參數", v:{
      "0":"Source 端 MSA timing 參數有效，Sink 須照做",
      "1":"Sink 可忽略 MSA timing（常用於 eDP，面板用自己的內部 timing）"
    }},
    { r:"7:6", n:"RESERVED", c:"保留", v:{}}
  ]
},

"00108": {
  n: "MAIN_LINK_CHANNEL_CODING_SET",
  c: "主連結通道編碼設定",
  rw: 1,
  d: "設定 Main Link 使用的通道編碼方式。DP 1.x 使用 8b/10b 編碼，DP 2.0 引入 128b/132b。目前 eDP TCON 幾乎都是 8b/10b。除錯時若此值不正確，Link 會完全不通。",
  b: [
    { r:"0", n:"SET_ANSI_8B10B", c:"ANSI 8B/10B 編碼", v:{
      "0":"不使用 8b/10b",
      "1":"使用 ANSI 8B/10B 編碼（DP 1.x 標準編碼方式）"
    }},
    { r:"1", n:"SET_128B132B", c:"128b/132b 編碼（DP 2.0+）", v:{
      "0":"不使用 128b/132b",
      "1":"使用 128b/132b 編碼（UHBR 速率專用）"
    }},
    { r:"7:2", n:"RESERVED", c:"保留", v:{}}
  ]
},

"00109": {
  n: "I2C_SPEED_CTRL_STATUS",
  c: "I2C 速度控制狀態",
  rw: 1,
  d: "控制透過 AUX 通道轉發的 I2C 交易速度。當 Source 需要透過 AUX CH 去讀 Sink 的 EDID（走 I2C-over-AUX），此暫存器決定 I2C 時脈速度。常見設定為 100kbps 或 400kbps。",
  b: [
    { r:"2:0", n:"I2C_SPEED_SET", c:"I2C 速度設定", v:{
      "0x0":"1 Kbps",
      "0x1":"5 Kbps",
      "0x2":"10 Kbps",
      "0x3":"100 Kbps（最常見）",
      "0x4":"400 Kbps（快速模式）",
      "0x5":"1 Mbps（快速模式+）"
    }},
    { r:"7:3", n:"RESERVED", c:"保留", v:{}}
  ]
},

"0010A": {
  n: "eDP_CONFIGURATION_SET",
  c: "eDP 設定",
  rw: 1,
  d: "eDP 專用的關鍵設定暫存器，外接 DP 裝置不使用。ASSR（Alternate Scrambler Seed Reset）是 eDP 面板必須啟用的功能，否則 Link Training 可能成功但畫面亂掉。Framing Change 讓 eDP 可以強制使用 Enhanced Framing。除錯重點：eDP 畫面花屏時，第一件事就是檢查 ASSR 有沒有啟用。",
  b: [
    { r:"0", n:"ALTERNATE_SCRAMBLER_RESET_ENABLE", c:"ASSR 啟用", v:{
      "0":"使用標準 DP Scrambler Reset（FFFFh）— 外接 DP 用這個",
      "1":"使用 eDP 替代 Scrambler Reset（FFFEh）— eDP 面板必須設 1"
    }},
    { r:"1", n:"FRAMING_CHANGE_ENABLE", c:"Framing 變更啟用", v:{
      "0":"依照 00101h bit 7 的 Enhanced Frame 設定",
      "1":"強制使用 Enhanced Framing（eDP 裝置常用，不管 Source 怎麼設都用 Enhanced Frame）"
    }},
    { r:"2", n:"RESERVED", c:"保留", v:{}},
    { r:"3", n:"PANEL_SELF_TEST_ENABLE", c:"面板自測模式", v:{
      "0":"正常模式",
      "1":"啟用面板自測（PST）— 面板自行產生測試圖形，不需要 Source 輸入"
    }},
    { r:"7:4", n:"RESERVED", c:"保留", v:{}}
  ]
},

"0010B": {
  n: "LINK_QUAL_LANE0_SET",
  c: "Lane 0 連結品質測試模式設定",
  rw: 1,
  d: "設定 Lane 0 的連結品質測試模式。用於 Compliance Test 或工廠端 debug，正常使用時不需要動。設定後 Sink 會在該 Lane 上產生特定測試 pattern。",
  b: [
    { r:"2:0", n:"LINK_QUAL_PATTERN_SEL", c:"測試模式選擇", v:{
      "0x0":"未啟用（正常運作）",
      "0x1":"D10.2 測試模式（固定 pattern，測連通性）",
      "0x2":"Symbol Error Rate 測量",
      "0x3":"PRBS7（偽隨機碼，測訊號品質）",
      "0x4":"自訂 80-bit 測試 Pattern",
      "0x5":"CP2520 Pattern 2（HBR2 合規測試用）",
      "0x6":"CP2520 Pattern 3（TPS3 用）"
    }},
    { r:"7:3", n:"RESERVED", c:"保留", v:{}}
  ]
},

"0010C": {
  n: "LINK_QUAL_LANE1_SET",
  c: "Lane 1 連結品質測試模式設定",
  rw: 1,
  d: "與 0010Bh 格式相同，控制 Lane 1 的測試模式。",
  b: [
    { r:"2:0", n:"LINK_QUAL_PATTERN_SEL", c:"測試模式選擇", v:{
      "0x0":"未啟用", "0x1":"D10.2", "0x2":"Symbol Error Rate",
      "0x3":"PRBS7", "0x4":"自訂 80-bit", "0x5":"CP2520 Pat2", "0x6":"CP2520 Pat3"
    }},
    { r:"7:3", n:"RESERVED", c:"保留", v:{}}
  ]
},

"0010D": {
  n: "LINK_QUAL_LANE2_SET",
  c: "Lane 2 連結品質測試模式設定",
  rw: 1,
  d: "與 0010Bh 格式相同，控制 Lane 2 的測試模式。僅 4-Lane 時有意義。",
  b: [
    { r:"2:0", n:"LINK_QUAL_PATTERN_SEL", c:"測試模式選擇", v:{
      "0x0":"未啟用", "0x1":"D10.2", "0x2":"Symbol Error Rate",
      "0x3":"PRBS7", "0x4":"自訂 80-bit", "0x5":"CP2520 Pat2", "0x6":"CP2520 Pat3"
    }},
    { r:"7:3", n:"RESERVED", c:"保留", v:{}}
  ]
},

"0010E": {
  n: "LINK_QUAL_LANE3_SET",
  c: "Lane 3 連結品質測試模式設定",
  rw: 1,
  d: "與 0010Bh 格式相同，控制 Lane 3 的測試模式。僅 4-Lane 時有意義。",
  b: [
    { r:"2:0", n:"LINK_QUAL_PATTERN_SEL", c:"測試模式選擇", v:{
      "0x0":"未啟用", "0x1":"D10.2", "0x2":"Symbol Error Rate",
      "0x3":"PRBS7", "0x4":"自訂 80-bit", "0x5":"CP2520 Pat2", "0x6":"CP2520 Pat3"
    }},
    { r:"7:3", n:"RESERVED", c:"保留", v:{}}
  ]
},

"0010F": {
  n: "TRAINING_LANE0_1_SET2",
  c: "Lane 0/1 Post Cursor2 設定",
  rw: 1,
  d: "DP 1.2+ 新增的 Post Cursor2 控制（又稱第二級預加重）。在 HBR2/HBR3 高速傳輸時，單靠 Pre-emphasis 可能不夠補償通道衰減，Post Cursor2 提供額外的高頻補償。除錯時若 EQ 在 TPS3 一直失敗，可能需要調整此值。",
  b: [
    { r:"1:0", n:"POST_CURSOR2_LANE0", c:"Lane 0 Post Cursor2 等級", v:{
      "0x0":"Level 0（無）", "0x1":"Level 1",
      "0x2":"Level 2", "0x3":"Level 3"
    }},
    { r:"2", n:"MAX_POST_CURSOR2_REACHED_LANE0", c:"Lane 0 已達最大 Post Cursor2", v:{
      "0":"否", "1":"是"
    }},
    { r:"3", n:"RESERVED", c:"保留", v:{}},
    { r:"5:4", n:"POST_CURSOR2_LANE1", c:"Lane 1 Post Cursor2 等級", v:{
      "0x0":"Level 0", "0x1":"Level 1",
      "0x2":"Level 2", "0x3":"Level 3"
    }},
    { r:"6", n:"MAX_POST_CURSOR2_REACHED_LANE1", c:"Lane 1 已達最大 Post Cursor2", v:{
      "0":"否", "1":"是"
    }},
    { r:"7", n:"RESERVED", c:"保留", v:{}}
  ]
},

"00110": {
  n: "TRAINING_LANE2_3_SET2",
  c: "Lane 2/3 Post Cursor2 設定",
  rw: 1,
  d: "與 0010Fh 格式相同，控制 Lane 2 和 Lane 3 的 Post Cursor2。僅在 4-Lane 配置下使用。",
  b: [
    { r:"1:0", n:"POST_CURSOR2_LANE2", c:"Lane 2 Post Cursor2 等級", v:{
      "0x0":"Level 0", "0x1":"Level 1",
      "0x2":"Level 2", "0x3":"Level 3"
    }},
    { r:"2", n:"MAX_POST_CURSOR2_REACHED_LANE2", c:"Lane 2 已達最大 Post Cursor2", v:{
      "0":"否", "1":"是"
    }},
    { r:"3", n:"RESERVED", c:"保留", v:{}},
    { r:"5:4", n:"POST_CURSOR2_LANE3", c:"Lane 3 Post Cursor2 等級", v:{
      "0x0":"Level 0", "0x1":"Level 1",
      "0x2":"Level 2", "0x3":"Level 3"
    }},
    { r:"6", n:"MAX_POST_CURSOR2_REACHED_LANE3", c:"Lane 3 已達最大 Post Cursor2", v:{
      "0":"否", "1":"是"
    }},
    { r:"7", n:"RESERVED", c:"保留", v:{}}
  ]
},

"00111": {
  n: "MSTM_CTRL",
  c: "MST 模式控制",
  rw: 1,
  d: "啟用或停用 Multi-Stream Transport（MST）模式。MST 讓一條 DP 線同時傳輸多個獨立螢幕畫面（如 Daisy Chain 串接螢幕）。eDP 面板幾乎不用 MST。除錯時若外接螢幕串接出問題，先確認此位元是否正確設定。",
  b: [
    { r:"0", n:"MST_EN", c:"MST 啟用", v:{
      "0":"SST 模式（單螢幕輸出，預設）",
      "1":"MST 模式（多螢幕串接）"
    }},
    { r:"1", n:"UPSTREAM_IS_SRC", c:"上游為 Source 裝置", v:{
      "0":"上游是 Branch Device（中繼器）",
      "1":"上游是 Source Device（GPU 端）"
    }},
    { r:"7:2", n:"RESERVED", c:"保留", v:{}}
  ]
},

"00115": {
  n: "LINK_RATE_SET",
  c: "eDP Link Rate 表索引（eDP 1.3+）",
  rw: 1,
  d: "eDP 1.3+ 引入的 Link Rate Table 機制。與 00100h LINK_BW_SET 二擇一使用。當 Sink 在 DPCD 00010h-0001Fh 提供自訂速率表時，Source 寫入此暫存器的索引值來選擇對應速率，而非直接寫速率值到 00100h。除錯時若 eDP 面板支援非標準速率（如 2.16G、3.24G），應該用這個暫存器。",
  b: [
    { r:"2:0", n:"LINK_RATE_INDEX", c:"Link Rate Table 索引", v:{
      "0x0":"使用 Table Entry 0（對應 00010h-00011h 的速率）",
      "0x1":"使用 Table Entry 1（對應 00012h-00013h 的速率）",
      "0x2":"使用 Table Entry 2",
      "0x3":"使用 Table Entry 3",
      "0x4":"使用 Table Entry 4",
      "0x5":"使用 Table Entry 5",
      "0x6":"使用 Table Entry 6",
      "0x7":"使用 Table Entry 7"
    }},
    { r:"7:3", n:"RESERVED", c:"保留", v:{}}
  ]
},

"00116": {
  n: "RECEIVER_ALPM_CONFIGURATION",
  c: "接收端 ALPM 設定（eDP 1.3+）",
  rw: 1,
  d: "ALPM（Active Link Power Management）是 eDP 省電技術，在 Blanking 期間讓 Link 進入低功耗狀態。筆電面板常用此功能來延長電池續航。除錯時若面板閃爍或喚醒延遲過大，可能與 ALPM 設定有關。",
  b: [
    { r:"0", n:"ALPM_ENABLE", c:"ALPM 啟用", v:{
      "0":"停用 ALPM（Link 持續全功率）",
      "1":"啟用 ALPM（Blanking 期間自動省電）"
    }},
    { r:"1", n:"ALPM_LOCK_ERROR_IRQ_HPD_ENABLE", c:"ALPM Lock Error 中斷啟用", v:{
      "0":"ALPM 鎖定錯誤不產生 HPD 中斷",
      "1":"ALPM 鎖定錯誤時產生 HPD 中斷（方便 Source 偵測問題）"
    }},
    { r:"2", n:"AUX_LESS_ALPM_ENABLE", c:"無 AUX 的 ALPM（eDP 1.5+）", v:{
      "0":"ALPM 需要 AUX 通道參與喚醒",
      "1":"ALPM 不透過 AUX 喚醒（更省電，更快速）"
    }},
    { r:"7:3", n:"RESERVED", c:"保留", v:{}}
  ]
},

"00160": {
  n: "DSC_ENABLE",
  c: "DSC 壓縮啟用（DP 1.4+）",
  rw: 1,
  d: "Display Stream Compression（DSC）是 VESA 定義的視覺無損壓縮標準。在頻寬不足以傳輸原始像素時（例如 4K 120Hz 用 HBR3 4Lane），可啟用 DSC 來壓縮資料流。壓縮比通常為 2:1 或 3:1。除錯時注意：DSC 啟用後若畫面出現色塊或條紋，可能是壓縮參數設定錯誤。",
  b: [
    { r:"0", n:"DECOMPRESSION_ENABLE", c:"解壓縮啟用", v:{
      "0":"停用 DSC 解壓縮（Sink 接收原始資料）",
      "1":"啟用 DSC 解壓縮（Sink 解壓縮由 Source 壓縮的資料流）"
    }},
    { r:"1", n:"DSC_PASSTHROUGH_ENABLE", c:"DSC 直通啟用（Branch Device 用）", v:{
      "0":"停用直通",
      "1":"Branch Device 不解壓，直接轉發壓縮資料給下游 Sink"
    }},
    { r:"7:2", n:"RESERVED", c:"保留", v:{}}
  ]
},

"00170": {
  n: "PSR_ENABLE_AND_CONFIGURATION",
  c: "PSR 啟用與設定（eDP 1.2+）",
  rw: 1,
  d: "Panel Self Refresh（PSR）是 eDP 最重要的省電功能之一。當畫面靜止不動時，Source 停止傳輸，面板用自己的 Frame Buffer 持續顯示。筆電靜態畫面下可省下大量功耗。PSR2（Selective Update）更進一步，只更新畫面變動的區域。除錯重點：PSR 啟用後畫面殘影、不更新、閃爍，都是常見問題。",
  b: [
    { r:"0", n:"PSR_ENABLE", c:"PSR 啟用", v:{
      "0":"停用 PSR",
      "1":"啟用 PSR（面板進入自刷新模式）"
    }},
    { r:"1", n:"PSR2_ENABLE", c:"PSR2 Selective Update 啟用", v:{
      "0":"停用 PSR2（使用 PSR1 全畫面刷新模式）",
      "1":"啟用 PSR2（只更新變動區域，更省電）"
    }},
    { r:"2", n:"PSR_CRC_VERIFICATION_ENABLE", c:"PSR CRC 驗證", v:{
      "0":"停用 CRC 驗證",
      "1":"啟用（Source/Sink 比對 CRC 確保畫面一致，除錯用）"
    }},
    { r:"3", n:"PSR_FRAME_CAPTURE_ENABLE", c:"Frame Capture 啟用", v:{
      "0":"停用",
      "1":"啟用 Frame Capture（eDP 1.4+ 用於 PSR2 Selective Update 的幀捕捉）"
    }},
    { r:"4", n:"PSR_SELECTIVE_UPDATE_ON_SU_REGION_GRANULARITY", c:"SU Region 精細度", v:{
      "0":"使用預設 SU 區域精細度",
      "1":"使用進階 SU Region Granularity"
    }},
    { r:"5", n:"PSR_IRQ_HPD_WITH_CRC_ERRORS", c:"CRC 錯誤產生中斷", v:{
      "0":"CRC 錯誤不產生中斷",
      "1":"CRC 錯誤時 Sink 發 IRQ HPD 通知 Source"
    }},
    { r:"6", n:"PSR_ENABLE_PSR2_SU_REGION_Y_GRANULARITY", c:"SU Y 方向精細度啟用", v:{
      "0":"停用", "1":"啟用（允許非整行的 SU 區域）"
    }},
    { r:"7", n:"RESERVED", c:"保留", v:{}}
  ]
},

"001B0": {
  n: "PANEL_REPLAY_CONFIGURATION",
  c: "Panel Replay 設定（eDP 1.5+ / DP 2.1+）",
  rw: 1,
  d: "Panel Replay 是 PSR 的進化版，由 Intel 與面板廠共同推動。與 PSR 不同的是，Panel Replay 由 Sink 端主動管理刷新，Source 端負擔更少。支援 Selective Update 時可進一步降低功耗。除錯時若 Panel Replay 啟用後出現畫面凍結或閃爍，需要先確認面板韌體是否正確支援。",
  b: [
    { r:"0", n:"PANEL_REPLAY_ENABLE", c:"Panel Replay 啟用", v:{
      "0":"停用 Panel Replay",
      "1":"啟用 Panel Replay"
    }},
    { r:"1", n:"PANEL_REPLAY_SU_ENABLE", c:"Panel Replay Selective Update 啟用", v:{
      "0":"停用（全幀刷新）",
      "1":"啟用 Selective Update（只刷新變動區域）"
    }},
    { r:"2", n:"PANEL_REPLAY_ENABLE_SU_Y_GRANULARITY", c:"SU Y 精細度", v:{
      "0":"停用", "1":"啟用 Y 方向精細度控制"
    }},
    { r:"7:3", n:"RESERVED", c:"保留", v:{}}
  ]
},

// =====================================================
//  Link / Sink Status  00200h – 002FFh
// =====================================================

"00200": {
  n: "SINK_COUNT",
  c: "Sink 裝置數量",
  rw: 0,
  d: "報告目前連接的 Sink 裝置數量。在 SST 模式下通常為 1，MST 模式下可能有多個。CP_READY 旗標用於 HDCP 內容保護。除錯時若讀到 0，代表 Sink 未偵測到或 HPD 尚未觸發。",
  b: [
    { r:"5:0", n:"SINK_COUNT", c:"Sink 數量", v:{
      "0":"無 Sink 連接",
      "1":"1 個 Sink（SST 正常值）"
    }},
    { r:"6", n:"CP_READY", c:"內容保護就緒（HDCP）", v:{
      "0":"HDCP 尚未就緒或不支援",
      "1":"HDCP R0' 已可讀取，可進行認證"
    }},
    { r:"7", n:"RESERVED", c:"保留", v:{}}
  ]
},

"00201": {
  n: "DEVICE_SERVICE_IRQ_VECTOR",
  c: "裝置服務中斷向量",
  rw: 2,
  d: "當 Sink 透過 HPD IRQ（短脈衝）通知 Source 時，Source 讀取此暫存器來判斷中斷原因。這是除錯最常看的暫存器之一。每個位元代表不同中斷來源，寫 1 可清除對應旗標。除錯流程：收到 HPD IRQ → 讀 00201h → 看哪些位元被設為 1 → 處理對應事件。",
  b: [
    { r:"0", n:"REMOTE_CONTROL_COMMAND_PENDING", c:"遠端控制命令待處理", v:{
      "0":"無", "1":"有遠端控制命令等待讀取"
    }},
    { r:"1", n:"AUTOMATED_TEST_REQUEST", c:"自動化測試請求", v:{
      "0":"無", "1":"Sink 要求執行自動化測試（需讀 00218h TEST_REQUEST）"
    }},
    { r:"2", n:"CP_IRQ", c:"內容保護中斷", v:{
      "0":"無", "1":"HDCP 相關事件（如 Link Integrity Failure）"
    }},
    { r:"3", n:"MCCS_IRQ", c:"MCCS 中斷", v:{
      "0":"無", "1":"Monitor Control Command Set 事件（OSD 調整相關）"
    }},
    { r:"4", n:"DOWN_REP_MSG_RDY", c:"下游回覆訊息就緒（MST）", v:{
      "0":"無", "1":"MST 下游回覆已備妥"
    }},
    { r:"5", n:"UP_REQ_MSG_RDY", c:"上游請求訊息就緒（MST）", v:{
      "0":"無", "1":"MST 上游請求已備妥"
    }},
    { r:"6", n:"SINK_SPECIFIC_IRQ", c:"Sink 專屬中斷", v:{
      "0":"無", "1":"Sink 有專屬事件（需讀 Sink 特定暫存器了解詳情）"
    }},
    { r:"7", n:"RESERVED", c:"保留", v:{}}
  ]
},

"00202": {
  n: "LANE0_1_STATUS",
  c: "Lane 0 / Lane 1 狀態",
  rw: 0,
  d: "Link Training 最重要的狀態暫存器。每條 Lane 有三個關鍵旗標：CR_DONE（Clock Recovery 完成）、CHANNEL_EQ_DONE（等化完成）、SYMBOL_LOCKED（符號鎖定）。除錯時必讀！如果 CR_DONE=0 表示第一階段就失敗了（電壓不夠或時脈不穩）；如果 CR=1 但 EQ=0 表示訊號品質不足。",
  b: [
    { r:"0", n:"LANE0_CR_DONE", c:"Lane 0 Clock Recovery 完成", v:{
      "0":"CR 未完成（時脈恢復失敗）",
      "1":"CR 完成（Sink 已鎖定 Lane 0 時脈）"
    }},
    { r:"1", n:"LANE0_CHANNEL_EQ_DONE", c:"Lane 0 Channel EQ 完成", v:{
      "0":"EQ 未完成（通道等化失敗）",
      "1":"EQ 完成（Lane 0 訊號品質達標）"
    }},
    { r:"2", n:"LANE0_SYMBOL_LOCKED", c:"Lane 0 Symbol 鎖定", v:{
      "0":"未鎖定", "1":"已鎖定（10b Symbol 邊界已對齊）"
    }},
    { r:"3", n:"RESERVED", c:"保留", v:{}},
    { r:"4", n:"LANE1_CR_DONE", c:"Lane 1 Clock Recovery 完成", v:{
      "0":"CR 未完成", "1":"CR 完成"
    }},
    { r:"5", n:"LANE1_CHANNEL_EQ_DONE", c:"Lane 1 Channel EQ 完成", v:{
      "0":"EQ 未完成", "1":"EQ 完成"
    }},
    { r:"6", n:"LANE1_SYMBOL_LOCKED", c:"Lane 1 Symbol 鎖定", v:{
      "0":"未鎖定", "1":"已鎖定"
    }},
    { r:"7", n:"RESERVED", c:"保留", v:{}}
  ]
},

"00203": {
  n: "LANE2_3_STATUS",
  c: "Lane 2 / Lane 3 狀態",
  rw: 0,
  d: "與 00202h 格式相同，報告 Lane 2 和 Lane 3 的 Training 狀態。僅在 4-Lane 配置下有意義。若使用 1 或 2 Lane，此暫存器的值無意義。",
  b: [
    { r:"0", n:"LANE2_CR_DONE", c:"Lane 2 CR 完成", v:{"0":"未完成","1":"完成"}},
    { r:"1", n:"LANE2_CHANNEL_EQ_DONE", c:"Lane 2 EQ 完成", v:{"0":"未完成","1":"完成"}},
    { r:"2", n:"LANE2_SYMBOL_LOCKED", c:"Lane 2 Symbol 鎖定", v:{"0":"未鎖定","1":"已鎖定"}},
    { r:"3", n:"RESERVED", c:"保留", v:{}},
    { r:"4", n:"LANE3_CR_DONE", c:"Lane 3 CR 完成", v:{"0":"未完成","1":"完成"}},
    { r:"5", n:"LANE3_CHANNEL_EQ_DONE", c:"Lane 3 EQ 完成", v:{"0":"未完成","1":"完成"}},
    { r:"6", n:"LANE3_SYMBOL_LOCKED", c:"Lane 3 Symbol 鎖定", v:{"0":"未鎖定","1":"已鎖定"}},
    { r:"7", n:"RESERVED", c:"保留", v:{}}
  ]
},

"00204": {
  n: "LANE_ALIGN_STATUS_UPDATED",
  c: "Lane 對齊狀態與更新旗標",
  rw: 0,
  d: "此暫存器包含兩大資訊：(1) 所有 Lane 之間的 Interlock Alignment 是否完成——這是 Link Training 最後的確認；(2) 狀態更新旗標——告訴 Source 是否有新的狀態資訊需要讀取。除錯時看到所有 Lane CR/EQ 都 Done 但螢幕不亮，很可能是 INTERLANE_ALIGN_DONE=0。",
  b: [
    { r:"0", n:"INTERLANE_ALIGN_DONE", c:"Lane 間對齊完成", v:{
      "0":"Lane 之間的延遲補償/對齊未完成",
      "1":"對齊完成（所有 Lane 的資料已同步，Link Training 真正成功）"
    }},
    { r:"5:1", n:"RESERVED", c:"保留", v:{}},
    { r:"6", n:"DOWNSTREAM_PORT_STATUS_CHANGED", c:"下游埠狀態變更", v:{
      "0":"無變更",
      "1":"下游埠（如 Branch 接的螢幕）有狀態變化（例如拔插螢幕）"
    }},
    { r:"7", n:"LINK_STATUS_UPDATED", c:"Link 狀態已更新", v:{
      "0":"Link 狀態未更新（之前讀的值仍然有效）",
      "1":"Link 狀態已更新（00202h-00207h 有新資料，需要重新讀取）"
    }}
  ]
},

"00205": {
  n: "SINK_STATUS",
  c: "接收端口狀態",
  rw: 0,
  d: "報告 Sink 的接收端口（Receiver Port）目前是否正在同步接收資料。Port 0 是主影像流，Port 1 通常是音訊或第二路影像。除錯時若 RECEIVE_PORT_0_STATUS=0，代表 Sink 端尚未成功接收到影像資料。",
  b: [
    { r:"0", n:"RECEIVE_PORT_0_STATUS", c:"接收端口 0 狀態", v:{
      "0":"未同步（Sink 未接收到有效資料流）",
      "1":"同步中（Sink 正在接收並處理 Port 0 的資料流）"
    }},
    { r:"1", n:"RECEIVE_PORT_1_STATUS", c:"接收端口 1 狀態", v:{
      "0":"未同步",
      "1":"同步中"
    }},
    { r:"7:2", n:"RESERVED", c:"保留", v:{}}
  ]
},

"00206": {
  n: "ADJUST_REQUEST_LANE0_1",
  c: "Lane 0/1 調整請求",
  rw: 0,
  d: "Link Training 期間，Sink 透過此暫存器告訴 Source：『請把 Voltage Swing 和 Pre-emphasis 調整到這個等級』。Source 讀取後，將建議的值寫入 00103h/00104h。這是 Training 回饋迴路的核心。除錯時對比此暫存器（Sink 建議）與 00103h/00104h（Source 設定），可以看出是否有不合理的調整。",
  b: [
    { r:"1:0", n:"VOLTAGE_SWING_LANE0", c:"Lane 0 建議的 VS 等級", v:{
      "0x0":"Level 0（400mV）", "0x1":"Level 1（600mV）",
      "0x2":"Level 2（800mV）", "0x3":"Level 3（1200mV）"
    }},
    { r:"3:2", n:"PRE_EMPHASIS_LANE0", c:"Lane 0 建議的 PE 等級", v:{
      "0x0":"Level 0", "0x1":"Level 1",
      "0x2":"Level 2", "0x3":"Level 3"
    }},
    { r:"5:4", n:"VOLTAGE_SWING_LANE1", c:"Lane 1 建議的 VS 等級", v:{
      "0x0":"Level 0", "0x1":"Level 1",
      "0x2":"Level 2", "0x3":"Level 3"
    }},
    { r:"7:6", n:"PRE_EMPHASIS_LANE1", c:"Lane 1 建議的 PE 等級", v:{
      "0x0":"Level 0", "0x1":"Level 1",
      "0x2":"Level 2", "0x3":"Level 3"
    }}
  ]
},

"00207": {
  n: "ADJUST_REQUEST_LANE2_3",
  c: "Lane 2/3 調整請求",
  rw: 0,
  d: "與 00206h 格式相同，報告 Sink 對 Lane 2 和 Lane 3 建議的 VS/PE 調整值。僅在 4-Lane 配置下有意義。",
  b: [
    { r:"1:0", n:"VOLTAGE_SWING_LANE2", c:"Lane 2 建議的 VS 等級", v:{
      "0x0":"Level 0", "0x1":"Level 1",
      "0x2":"Level 2", "0x3":"Level 3"
    }},
    { r:"3:2", n:"PRE_EMPHASIS_LANE2", c:"Lane 2 建議的 PE 等級", v:{
      "0x0":"Level 0", "0x1":"Level 1",
      "0x2":"Level 2", "0x3":"Level 3"
    }},
    { r:"5:4", n:"VOLTAGE_SWING_LANE3", c:"Lane 3 建議的 VS 等級", v:{
      "0x0":"Level 0", "0x1":"Level 1",
      "0x2":"Level 2", "0x3":"Level 3"
    }},
    { r:"7:6", n:"PRE_EMPHASIS_LANE3", c:"Lane 3 建議的 PE 等級", v:{
      "0x0":"Level 0", "0x1":"Level 1",
      "0x2":"Level 2", "0x3":"Level 3"
    }}
  ]
},

"00210": {
  n: "SYMBOL_ERROR_COUNT_LANE0_LOW",
  c: "Lane 0 符號錯誤計數（低位元組）",
  rw: 0,
  d: "Lane 0 的 Symbol Error 計數器低 8 位元。與 00211h（高位元組）合併成 15-bit 計數器。這是判斷連結品質的關鍵指標。正常運作時應該為 0 或極小值；若持續累積，代表訊號品質有問題（走線過長、阻抗不匹配、EMI 干擾等）。除錯時先讀高位元組再讀低位元組，兩者一起看。",
  b: [
    { r:"7:0", n:"SYM_ERR_COUNT_LANE0_7_0", c:"Lane 0 錯誤計數 [7:0]", v:{}}
  ]
},

"00211": {
  n: "SYMBOL_ERROR_COUNT_LANE0_HIGH",
  c: "Lane 0 符號錯誤計數（高位元組）",
  rw: 0,
  d: "Lane 0 的 Symbol Error 計數器高位元。Bit 7 為溢位旗標，若為 1 表示計數器已溢位（錯誤太多）。Bit 6:0 為計數高位元。完整值 = [6:0] << 8 | 低位元組。",
  b: [
    { r:"6:0", n:"SYM_ERR_COUNT_LANE0_14_8", c:"Lane 0 錯誤計數 [14:8]", v:{}},
    { r:"7", n:"SYM_ERR_COUNT_OVERFLOW", c:"計數器溢位", v:{
      "0":"未溢位", "1":"已溢位（錯誤數超過 32767，訊號品質非常差）"
    }}
  ]
},

"00212": {
  n: "SYMBOL_ERROR_COUNT_LANE1_LOW",
  c: "Lane 1 符號錯誤計數（低位元組）",
  rw: 0,
  d: "Lane 1 的 Symbol Error 計數器低 8 位元，格式同 00210h。",
  b: [
    { r:"7:0", n:"SYM_ERR_COUNT_LANE1_7_0", c:"Lane 1 錯誤計數 [7:0]", v:{}}
  ]
},

"00213": {
  n: "SYMBOL_ERROR_COUNT_LANE1_HIGH",
  c: "Lane 1 符號錯誤計數（高位元組）",
  rw: 0,
  d: "Lane 1 的 Symbol Error 計數器高位元，格式同 00211h。",
  b: [
    { r:"6:0", n:"SYM_ERR_COUNT_LANE1_14_8", c:"Lane 1 錯誤計數 [14:8]", v:{}},
    { r:"7", n:"SYM_ERR_COUNT_OVERFLOW", c:"計數器溢位", v:{"0":"未溢位","1":"已溢位"}}
  ]
},

"00214": {
  n: "SYMBOL_ERROR_COUNT_LANE2_LOW",
  c: "Lane 2 符號錯誤計數（低位元組）",
  rw: 0,
  d: "Lane 2 的 Symbol Error 計數器低 8 位元，僅 4-Lane 配置下有效。",
  b: [
    { r:"7:0", n:"SYM_ERR_COUNT_LANE2_7_0", c:"Lane 2 錯誤計數 [7:0]", v:{}}
  ]
},

"00215": {
  n: "SYMBOL_ERROR_COUNT_LANE2_HIGH",
  c: "Lane 2 符號錯誤計數（高位元組）",
  rw: 0,
  d: "Lane 2 的 Symbol Error 計數器高位元。",
  b: [
    { r:"6:0", n:"SYM_ERR_COUNT_LANE2_14_8", c:"Lane 2 錯誤計數 [14:8]", v:{}},
    { r:"7", n:"SYM_ERR_COUNT_OVERFLOW", c:"計數器溢位", v:{"0":"未溢位","1":"已溢位"}}
  ]
},

"00216": {
  n: "SYMBOL_ERROR_COUNT_LANE3_LOW",
  c: "Lane 3 符號錯誤計數（低位元組）",
  rw: 0,
  d: "Lane 3 的 Symbol Error 計數器低 8 位元，僅 4-Lane 配置下有效。",
  b: [
    { r:"7:0", n:"SYM_ERR_COUNT_LANE3_7_0", c:"Lane 3 錯誤計數 [7:0]", v:{}}
  ]
},

"00217": {
  n: "SYMBOL_ERROR_COUNT_LANE3_HIGH",
  c: "Lane 3 符號錯誤計數（高位元組）",
  rw: 0,
  d: "Lane 3 的 Symbol Error 計數器高位元。",
  b: [
    { r:"6:0", n:"SYM_ERR_COUNT_LANE3_14_8", c:"Lane 3 錯誤計數 [14:8]", v:{}},
    { r:"7", n:"SYM_ERR_COUNT_OVERFLOW", c:"計數器溢位", v:{"0":"未溢位","1":"已溢位"}}
  ]
},

"00218": {
  n: "TEST_REQUEST",
  c: "自動化測試請求",
  rw: 0,
  d: "當 DEVICE_SERVICE_IRQ_VECTOR（00201h）的 bit 1 被設為 1 時，Source 讀取此暫存器來得知 Sink 要求什麼類型的測試。這是 DP Compliance Test（CTS）自動化測試的核心機制。除錯時若遇到合規測試失敗，先確認此暫存器的值是否被正確讀取與回應。",
  b: [
    { r:"0", n:"TEST_LINK_TRAINING", c:"要求 Link Training 測試", v:{
      "0":"無", "1":"Sink 要求重新執行 Link Training（需讀 00219h 取得測試速率、00220h 取得測試 Lane 數）"
    }},
    { r:"1", n:"TEST_PATTERN", c:"要求測試 Pattern", v:{
      "0":"無", "1":"Sink 要求 Source 輸出指定測試 Pattern"
    }},
    { r:"2", n:"TEST_EDID_READ", c:"要求 EDID 讀取測試", v:{
      "0":"無", "1":"Sink 要求 Source 讀取 EDID 並回報校驗和"
    }},
    { r:"3", n:"PHY_TEST_PATTERN", c:"要求 PHY 層測試 Pattern", v:{
      "0":"無", "1":"Sink 要求 Source 輸出 PHY 層測試 Pattern（用於眼圖等物理層測試）"
    }},
    { r:"4", n:"FAUX_TEST_PATTERN", c:"FAUX 測試 Pattern（DP 1.3+）", v:{
      "0":"無", "1":"要求 FAUX 測試"
    }},
    { r:"6:5", n:"RESERVED", c:"保留", v:{}},
    { r:"7", n:"TEST_AUDIO_PATTERN", c:"要求音訊測試 Pattern", v:{
      "0":"無", "1":"Sink 要求 Source 輸出音訊測試 Pattern"
    }}
  ]
},

"00219": {
  n: "TEST_LINK_RATE",
  c: "測試用 Link Rate",
  rw: 0,
  d: "當 TEST_REQUEST bit 0 = 1 時，此暫存器指定自動化測試要使用的 Link Rate。Source 須用此速率重新做 Link Training。值的意義與 00100h LINK_BW_SET 相同。",
  b: [
    { r:"7:0", n:"TEST_LINK_RATE", c:"測試連結速率", v:{
      "0x06":"RBR 1.62 Gbps",
      "0x0A":"HBR 2.7 Gbps",
      "0x14":"HBR2 5.4 Gbps",
      "0x1E":"HBR3 8.1 Gbps"
    }}
  ]
},

"00220": {
  n: "TEST_LANE_COUNT",
  c: "測試用 Lane 數量",
  rw: 0,
  d: "當 TEST_REQUEST bit 0 = 1 時，此暫存器指定自動化測試要使用的 Lane 數量。Source 須用此 Lane 數重新做 Link Training。",
  b: [
    { r:"4:0", n:"TEST_LANE_COUNT", c:"測試 Lane 數", v:{
      "0x01":"1 Lane",
      "0x02":"2 Lanes",
      "0x04":"4 Lanes"
    }},
    { r:"7:5", n:"RESERVED", c:"保留", v:{}}
  ]
},

"00260": {
  n: "TEST_RESPONSE",
  c: "自動化測試回應",
  rw: 1,
  d: "Source 處理完 TEST_REQUEST 後，寫入此暫存器來回報結果。TEST_ACK 告訴 Sink 測試請求已被處理。若 Source 無法處理，設定 TEST_NACK。這個寫入動作同時會清除 00201h 的 AUTOMATED_TEST_REQUEST 中斷旗標。",
  b: [
    { r:"0", n:"TEST_ACK", c:"測試確認", v:{
      "0":"未回應或 NACK",
      "1":"Source 已確認並處理測試請求"
    }},
    { r:"1", n:"TEST_NACK", c:"測試拒絕", v:{
      "0":"未拒絕",
      "1":"Source 拒絕處理此測試請求（不支援該測試類型）"
    }},
    { r:"2", n:"TEST_EDID_CHECKSUM_WRITE", c:"EDID 校驗和回寫", v:{
      "0":"無",
      "1":"Source 已將 EDID 校驗和寫入 TEST_EDID_CHECKSUM（00261h）"
    }},
    { r:"7:3", n:"RESERVED", c:"保留", v:{}}
  ]
},

"00270": {
  n: "TEST_SINK",
  c: "Sink 端測試控制",
  rw: 1,
  d: "用於控制 Sink 端的測試行為。最常用的是 TEST_SINK_START，寫 1 啟動 Sink 端的 CRC 計數（Sink 對收到的影像資料做 CRC 校驗），用於確認傳輸的影像資料是否正確。在 Compliance Test 中非常重要。",
  b: [
    { r:"0", n:"TEST_SINK_START", c:"啟動 Sink 測試 CRC", v:{
      "0":"停止 CRC 計算",
      "1":"啟動 CRC 計算（Sink 開始對接收到的像素資料做 CRC，結果存在 TEST_CRC_R/G/B）"
    }},
    { r:"1", n:"TEST_PHY_TEST_PATTERN_SEL_POST_CURSOR2", c:"PHY 測試 Post Cursor2 選擇", v:{
      "0":"不含 Post Cursor2 調整",
      "1":"PHY 測試時包含 Post Cursor2 調整"
    }},
    { r:"7:2", n:"RESERVED", c:"保留", v:{}}
  ]
},

"002C0": {
  n: "PAYLOAD_TABLE_UPDATE_STATUS",
  c: "MST Payload Table 更新狀態",
  rw: 1,
  d: "MST 模式專用。MST 透過 Payload Allocation Table 來分配頻寬給每個串流。Source 寫入 PAYLOAD_TABLE_UPDATED=1 來通知 Sink 更新 Payload Table；Sink 處理完畢後設定 PAYLOAD_ACT_HANDLED=1。除錯 MST 問題時常需要檢查此暫存器，看 Payload 分配是否卡住。",
  b: [
    { r:"0", n:"PAYLOAD_TABLE_UPDATED", c:"Payload Table 已更新", v:{
      "0":"無更新",
      "1":"Source 已更新 Payload Table，通知 Sink 套用新的分配（Source 寫 1 觸發）"
    }},
    { r:"1", n:"PAYLOAD_ACT_HANDLED", c:"Payload ACT 已處理", v:{
      "0":"Sink 尚未處理 ACT（Allocation Change Trigger）",
      "1":"Sink 已成功處理 Payload 配置變更"
    }},
    { r:"7:2", n:"RESERVED", c:"保留", v:{}}
  ]
}
},
{
// ===== Extended (00300h+) =====
// ============================================================
  //  Source Device Specific Field (00300h - 003FFh)
  // ============================================================

  "00300": {
    n: "SOURCE_IEEE_OUI_7_0",
    c: "Source 端 IEEE OUI Byte 0（最低位元組）",
    rw: 1,
    d: "Source 裝置的 IEEE OUI（Organizationally Unique Identifier，組織唯一識別碼）的最低位元組。OUI 共 3 bytes（00300h-00302h），用來識別 Source 端的製造商，例如 Intel 為 00-1B-21、NVIDIA 為 00-04-4B。除錯時讀取這三個 byte 可快速確認 Source 端是哪家晶片。",
    b: []
  },
  "00301": {
    n: "SOURCE_IEEE_OUI_15_8",
    c: "Source 端 IEEE OUI Byte 1（中間位元組）",
    rw: 1,
    d: "Source 裝置 IEEE OUI 的第二個位元組。與 00300h、00302h 合併組成完整的 24-bit OUI。",
    b: []
  },
  "00302": {
    n: "SOURCE_IEEE_OUI_23_16",
    c: "Source 端 IEEE OUI Byte 2（最高位元組）",
    rw: 1,
    d: "Source 裝置 IEEE OUI 的第三個位元組（最高 8 bits）。三個 byte 組合順序為 [00302h:00301h:00300h]，即 MSB 在高位址。",
    b: []
  },
  "00303": {
    n: "SOURCE_DEVICE_IDENTIFICATION_STRING_0",
    c: "Source 裝置識別字串 Byte 0",
    rw: 1,
    d: "Source 裝置的識別字串，共 6 bytes（00303h-00308h），為 ASCII 編碼。這串字串通常是晶片型號或平台名稱，例如 GPU 型號代碼。FAE 除錯時可讀取此欄位確認 Source 端回報的裝置名稱。",
    b: []
  },
  "00304": {
    n: "SOURCE_DEVICE_IDENTIFICATION_STRING_1",
    c: "Source 裝置識別字串 Byte 1",
    rw: 1,
    d: "Source 裝置識別字串的第 2 個位元組（ASCII）。",
    b: []
  },
  "00305": {
    n: "SOURCE_DEVICE_IDENTIFICATION_STRING_2",
    c: "Source 裝置識別字串 Byte 2",
    rw: 1,
    d: "Source 裝置識別字串的第 3 個位元組（ASCII）。",
    b: []
  },
  "00306": {
    n: "SOURCE_DEVICE_IDENTIFICATION_STRING_3",
    c: "Source 裝置識別字串 Byte 3",
    rw: 1,
    d: "Source 裝置識別字串的第 4 個位元組（ASCII）。",
    b: []
  },
  "00307": {
    n: "SOURCE_DEVICE_IDENTIFICATION_STRING_4",
    c: "Source 裝置識別字串 Byte 4",
    rw: 1,
    d: "Source 裝置識別字串的第 5 個位元組（ASCII）。",
    b: []
  },
  "00308": {
    n: "SOURCE_DEVICE_IDENTIFICATION_STRING_5",
    c: "Source 裝置識別字串 Byte 5",
    rw: 1,
    d: "Source 裝置識別字串的第 6 個位元組（ASCII）。6 bytes 合併即為完整的裝置識別字串。",
    b: []
  },
  "00309": {
    n: "SOURCE_HARDWARE_REVISION",
    c: "Source 端硬體版本號",
    rw: 1,
    d: "Source 裝置的硬體修訂版本（Hardware Revision）。8-bit 數值，由 Source 端自行定義。例如某張顯示卡的 PCB 版本為 Rev.B，可能填入 02h。搭配 OUI 和 Device ID 可完整識別 Source 硬體。",
    b: []
  },
  "0030A": {
    n: "SOURCE_FIRMWARE_REVISION_MAJOR",
    c: "Source 端韌體版本號（主版本）",
    rw: 1,
    d: "Source 裝置韌體的主版本號（Major）。與 0030Bh 的次版本號合併為完整韌體版本，例如 Major=01h、Minor=05h 代表韌體版本 1.5。除錯時確認 Source 韌體版本非常重要，不同版本可能有不同的 Link Training 行為。",
    b: []
  },
  "0030B": {
    n: "SOURCE_FIRMWARE_REVISION_MINOR",
    c: "Source 端韌體版本號（次版本）",
    rw: 1,
    d: "Source 裝置韌體的次版本號（Minor）。與 0030Ah 合併為完整版本號。",
    b: []
  },

  // ============================================================
  //  Sink Device Specific Field (00400h - 004FFh)
  // ============================================================

  "00400": {
    n: "SINK_IEEE_OUI_7_0",
    c: "Sink 端 IEEE OUI Byte 0（最低位元組）",
    rw: 1,
    d: "Sink 裝置的 IEEE OUI 最低位元組。OUI 共 3 bytes（00400h-00402h），用來識別 Sink 端（面板/螢幕）的製造商。例如瑞鼎 Raydium 有自己的 OUI。除錯時這是確認 TCON 廠商最快的方式。",
    b: []
  },
  "00401": {
    n: "SINK_IEEE_OUI_15_8",
    c: "Sink 端 IEEE OUI Byte 1（中間位元組）",
    rw: 1,
    d: "Sink 裝置 IEEE OUI 的第二個位元組。",
    b: []
  },
  "00402": {
    n: "SINK_IEEE_OUI_23_16",
    c: "Sink 端 IEEE OUI Byte 2（最高位元組）",
    rw: 1,
    d: "Sink 裝置 IEEE OUI 的第三個位元組。三個 byte 合併 [00402h:00401h:00400h] 即為完整 OUI。可上 IEEE 官網用 OUI 反查製造商名稱。",
    b: []
  },
  "00403": {
    n: "SINK_DEVICE_IDENTIFICATION_STRING_0",
    c: "Sink 裝置識別字串 Byte 0",
    rw: 1,
    d: "Sink 裝置的識別字串，共 6 bytes（00403h-00408h），ASCII 編碼。通常是 TCON 型號，例如 Raydium 的 RM692xx 系列。讀取此欄位可確認面板端 TCON 的型號資訊。",
    b: []
  },
  "00404": {
    n: "SINK_DEVICE_IDENTIFICATION_STRING_1",
    c: "Sink 裝置識別字串 Byte 1",
    rw: 1,
    d: "Sink 裝置識別字串的第 2 個位元組（ASCII）。",
    b: []
  },
  "00405": {
    n: "SINK_DEVICE_IDENTIFICATION_STRING_2",
    c: "Sink 裝置識別字串 Byte 2",
    rw: 1,
    d: "Sink 裝置識別字串的第 3 個位元組（ASCII）。",
    b: []
  },
  "00406": {
    n: "SINK_DEVICE_IDENTIFICATION_STRING_3",
    c: "Sink 裝置識別字串 Byte 3",
    rw: 1,
    d: "Sink 裝置識別字串的第 4 個位元組（ASCII）。",
    b: []
  },
  "00407": {
    n: "SINK_DEVICE_IDENTIFICATION_STRING_4",
    c: "Sink 裝置識別字串 Byte 4",
    rw: 1,
    d: "Sink 裝置識別字串的第 5 個位元組（ASCII）。",
    b: []
  },
  "00408": {
    n: "SINK_DEVICE_IDENTIFICATION_STRING_5",
    c: "Sink 裝置識別字串 Byte 5",
    rw: 1,
    d: "Sink 裝置識別字串的第 6 個位元組（ASCII）。",
    b: []
  },
  "00409": {
    n: "SINK_HARDWARE_REVISION",
    c: "Sink 端硬體版本號",
    rw: 1,
    d: "Sink 裝置的硬體修訂版本。8-bit 數值，由 Sink 端（TCON）自行定義。例如某個 TCON 的晶片改版（die revision）會反映在此欄位。搭配 OUI 可區分同廠商不同世代的 TCON。",
    b: []
  },
  "0040A": {
    n: "SINK_FIRMWARE_REVISION_MAJOR",
    c: "Sink 端韌體版本號（主版本）",
    rw: 1,
    d: "Sink 裝置韌體的主版本號（Major）。對於有內建 MCU 的 TCON，此欄位反映韌體版本。FAE 現場除錯時，確認 Sink FW 版本是最基本的第一步，確保面板端跑的是正確的韌體。",
    b: []
  },
  "0040B": {
    n: "SINK_FIRMWARE_REVISION_MINOR",
    c: "Sink 端韌體版本號（次版本）",
    rw: 1,
    d: "Sink 裝置韌體的次版本號（Minor）。與 0040Ah 合併為完整版本號，例如 02h:0Ah = 韌體 v2.10。",
    b: []
  },

  // ============================================================
  //  Branch Device Specific Field (00500h - 005FFh)
  // ============================================================

  "00500": {
    n: "BRANCH_IEEE_OUI_7_0",
    c: "Branch 裝置 IEEE OUI Byte 0（最低位元組）",
    rw: 1,
    d: "Branch 裝置（例如 DP Hub、DP-to-HDMI 轉接器、MST Hub）的 IEEE OUI 最低位元組。OUI 共 3 bytes（00500h-00502h）。Branch 是 DP 拓撲中介於 Source 和 Sink 之間的中繼裝置。讀取 OUI 可確認 Branch 晶片廠商。",
    b: []
  },
  "00501": {
    n: "BRANCH_IEEE_OUI_15_8",
    c: "Branch 裝置 IEEE OUI Byte 1（中間位元組）",
    rw: 1,
    d: "Branch 裝置 IEEE OUI 的第二個位元組。",
    b: []
  },
  "00502": {
    n: "BRANCH_IEEE_OUI_23_16",
    c: "Branch 裝置 IEEE OUI Byte 2（最高位元組）",
    rw: 1,
    d: "Branch 裝置 IEEE OUI 的第三個位元組。合併 [00502h:00501h:00500h] 為完整 OUI。",
    b: []
  },
  "00503": {
    n: "BRANCH_DEVICE_IDENTIFICATION_STRING_0",
    c: "Branch 裝置識別字串 Byte 0",
    rw: 1,
    d: "Branch 裝置的識別字串，共 6 bytes（00503h-00508h），ASCII 編碼。通常是 Hub 晶片的型號。",
    b: []
  },
  "00504": {
    n: "BRANCH_DEVICE_IDENTIFICATION_STRING_1",
    c: "Branch 裝置識別字串 Byte 1",
    rw: 1,
    d: "Branch 裝置識別字串的第 2 個位元組（ASCII）。",
    b: []
  },
  "00505": {
    n: "BRANCH_DEVICE_IDENTIFICATION_STRING_2",
    c: "Branch 裝置識別字串 Byte 2",
    rw: 1,
    d: "Branch 裝置識別字串的第 3 個位元組（ASCII）。",
    b: []
  },
  "00506": {
    n: "BRANCH_DEVICE_IDENTIFICATION_STRING_3",
    c: "Branch 裝置識別字串 Byte 3",
    rw: 1,
    d: "Branch 裝置識別字串的第 4 個位元組（ASCII）。",
    b: []
  },
  "00507": {
    n: "BRANCH_DEVICE_IDENTIFICATION_STRING_4",
    c: "Branch 裝置識別字串 Byte 4",
    rw: 1,
    d: "Branch 裝置識別字串的第 5 個位元組（ASCII）。",
    b: []
  },
  "00508": {
    n: "BRANCH_DEVICE_IDENTIFICATION_STRING_5",
    c: "Branch 裝置識別字串 Byte 5",
    rw: 1,
    d: "Branch 裝置識別字串的第 6 個位元組（ASCII）。",
    b: []
  },
  "00509": {
    n: "BRANCH_HARDWARE_REVISION",
    c: "Branch 端硬體版本號",
    rw: 1,
    d: "Branch 裝置的硬體修訂版本。8-bit 數值。Hub 或轉接器晶片的硬體版本。",
    b: []
  },
  "0050A": {
    n: "BRANCH_FIRMWARE_REVISION_MAJOR",
    c: "Branch 端韌體版本號（主版本）",
    rw: 1,
    d: "Branch 裝置韌體的主版本號（Major）。Hub 類產品通常有可更新韌體，此欄位可確認版本。",
    b: []
  },
  "0050B": {
    n: "BRANCH_FIRMWARE_REVISION_MINOR",
    c: "Branch 端韌體版本號（次版本）",
    rw: 1,
    d: "Branch 裝置韌體的次版本號（Minor）。與 0050Ah 合併為完整版本號。",
    b: []
  },

  // ============================================================
  //  Power Control (00600h - 006FFh)
  // ============================================================

  "00600": {
    n: "SET_POWER",
    c: "電源狀態控制（D0 正常 / D3 省電）",
    rw: 2,
    vv: [{v:0x01,l:"01h — D0 正常運作"},{v:0x02,l:"02h — D3 省電（Link 關閉）"},{v:0x05,l:"05h — D3 + AUX 關閉"},{v:0x21,l:"21h — D0 + 維持 5V"},{v:0x22,l:"22h — D3 + 維持 5V"}],
    d: "【重要！除錯必看】控制 Sink/Branch 裝置的電源狀態。這是 DP 連結建立與省電最關鍵的暫存器之一。Source 透過寫入此暫存器來通知 Sink 進入或離開省電模式。常見問題：螢幕喚醒失敗、黑屏、Link Training 後無畫面，都應該先檢查此暫存器的值。注意：寫入 D3 後 Sink 的 AUX 通道仍須保持回應（至少能處理 DPCD 讀寫），但主要的 Link 功能會關閉。",
    b: [
      { m: 0x07, s: 0, n: "SET_POWER_STATE", d: "電源狀態設定。01h = D0（正常運作，全功能啟用）；02h = D3（省電模式，Link 關閉但 AUX 仍可用）；05h = D3 且同時關閉 AUX（DP 1.5+）。Source 要建立連結前必須先寫 01h（D0），Link Training 才會成功。螢幕休眠時 Source 會寫 02h 讓 Sink 進入低功耗。" },
      { m: 0x20, s: 5, n: "SET_DP_PWR5V", d: "DP 5V 電源控制（DP 1.2+）。1 = 請求 Source 維持 DP_PWR 5V 供電；0 = 允許 Source 關閉 5V 供電。某些 Sink 在省電時仍需要 5V 供電維持 AUX 回應。" }
    ]
  },

  // ============================================================
  //  eDP Display Control (00700h - 007FFh)
  // ============================================================

  "00700": {
    n: "EDP_DPCD_REV",
    c: "eDP DPCD 版本號",
    rw: 1,
    d: "eDP 專屬的 DPCD 版本號，用來識別面板支援的 eDP 規格版本。此欄位僅在 eDP 面板中有意義（外接 DP 螢幕此欄位通常為 00h）。版本對應：01h = eDP v1.1、02h = eDP v1.2、03h = eDP v1.3、04h = eDP v1.4、05h = eDP v1.4b、06h = eDP v1.5。不同版本支援的功能差異大，例如 PSR 從 v1.3 開始、PSR2 從 v1.4 開始。FAE 除錯 eDP 面板時，第一步就是讀這個暫存器確認面板的 eDP 版本。",
    b: []
  },
  "00701": {
    n: "EDP_GENERAL_CAPABILITY_1",
    c: "eDP 通用能力 1",
    rw: 1,
    d: "eDP 面板的通用功能宣告暫存器（第一組）。每個 bit 代表面板是否支援某項 eDP 功能。這是了解面板能力的關鍵暫存器。",
    b: [
      { m: 0x01, s: 0, n: "TCON_BACKLIGHT_ADJUSTMENT_CAP", d: "1 = TCON 支援透過 AUX 調整背光亮度。如果此 bit 為 0，表示背光只能透過 PWM 硬體線控制，無法用 DPCD 軟體控制。" },
      { m: 0x02, s: 1, n: "BACKLIGHT_AUX_ENABLE_CAP", d: "1 = 支援透過 AUX 通道啟用/關閉背光。配合 00720h bit 0 使用。" },
      { m: 0x04, s: 2, n: "PANEL_LUMINANCE_CONTROL_CAP", d: "1 = 支援面板亮度控制功能（eDP 1.4+）。" },
      { m: 0x08, s: 3, n: "PANEL_SELF_TEST_CAP", d: "1 = 支援面板自我測試功能。面板可產生內部測試圖案（如灰階條、彩條），不需要 Source 送影像。工廠產線測試時很有用。" },
      { m: 0x10, s: 4, n: "DYNAMIC_BACKLIGHT_CONTROL_CAP", d: "1 = 支援動態背光控制（Regional Backlight Control），即局部調光（Local Dimming）。高階 HDR 面板會用到。" },
      { m: 0x20, s: 5, n: "EDP_OVERDRIVE_ENGINE_ENABLED", d: "1 = eDP Overdrive Engine 可透過 AUX 控制。Overdrive 是面板加速液晶響應速度的技術。" },
      { m: 0x40, s: 6, n: "PANEL_IDLE_ACTIVE_FRAME_LOCK_CAP", d: "1 = 支援面板閒置時的 Active Frame Lock 功能（eDP 1.5+）。用於省電場景下鎖定更新頻率。" }
    ]
  },
  "00702": {
    n: "EDP_BACKLIGHT_ADJUSTMENT_CAP",
    c: "eDP 背光調整能力",
    rw: 1,
    d: "詳細描述 eDP 面板的背光控制能力。只有當 00701h bit 0 為 1 時，此暫存器才有意義。",
    b: [
      { m: 0x03, s: 0, n: "BACKLIGHT_BRIGHTNESS_BYTE_COUNT", d: "背光亮度資料的位元組數。00 = 1 byte（8-bit 解析度，256 階）；01 = 2 bytes（16-bit 解析度，65536 階）；10 = 3 bytes（24-bit）。大多數面板用 2 bytes，提供更細緻的亮度控制。" },
      { m: 0x04, s: 2, n: "AUX_BACKLIGHT_BRIGHTNESS_CAP", d: "1 = 支援透過 AUX 通道設定背光亮度值。這是 DPCD 軟體控背光的核心能力。" },
      { m: 0x08, s: 3, n: "BACKLIGHT_PWM_FREQ_AUX_SET_CAP", d: "1 = 支援透過 AUX 設定背光 PWM 頻率。可用於調整 PWM 頻率以減少閃爍（Anti-Flicker）。" },
      { m: 0x10, s: 4, n: "BACKLIGHT_ENABLE_CAP", d: "1 = 支援透過 AUX 啟用/關閉背光。" },
      { m: 0x20, s: 5, n: "BACKLIGHT_DISABLE_CAP", d: "1 = 支援透過 AUX 關閉背光。配合 bit 4 使用。" },
      { m: 0x40, s: 6, n: "DYNAMIC_BACKLIGHT_LEVEL_CAP", d: "1 = 支援動態背光等級控制（配合 Regional Backlight Control）。" },
      { m: 0x80, s: 7, n: "REGIONAL_BACKLIGHT_CONTROL_CAP", d: "1 = 支援區域背光控制（Local Dimming）。高階面板的分區背光功能。" }
    ]
  },
  "00703": {
    n: "EDP_GENERAL_CAPABILITY_2",
    c: "eDP 通用能力 2",
    rw: 1,
    d: "eDP 面板的通用功能宣告暫存器（第二組）。提供更多 eDP 進階功能的支援資訊。",
    b: [
      { m: 0x01, s: 0, n: "PANEL_LUMINANCE_CONTROL_GRANULARITY", d: "面板亮度控制的精細度。0 = 粗調；1 = 細調。" },
      { m: 0x02, s: 1, n: "PANEL_BACKLIGHT_FREQUENCY_CONTROL_MODE", d: "背光頻率控制模式。0 = 固定頻率；1 = 可變頻率。" },
      { m: 0x04, s: 2, n: "DYNAMIC_BACKLIGHT_MIN_SET_CAP", d: "1 = 支援設定動態背光的最低亮度閾值。" },
      { m: 0x08, s: 3, n: "EDP_REGIONAL_BACKLIGHT_CONTROL_VER", d: "區域背光控制版本。0 = v1；1 = v2（更精細的分區控制）。" },
      { m: 0x10, s: 4, n: "PANEL_SELF_REFRESH_CAP_2", d: "PSR2 能力擴充（eDP 1.4+）。1 = 支援 PSR2 Selective Update。" },
      { m: 0x20, s: 5, n: "SINK_ADAPTIVE_SYNC_CAP", d: "1 = 支援 Adaptive Sync（可變更新率）。eDP 版的 VRR/FreeSync。" }
    ]
  },
  "00720": {
    n: "EDP_DISPLAY_CONTROL",
    c: "eDP 顯示控制（背光啟用 + 黑畫面）",
    rw: 2,
    d: "eDP 面板的即時顯示控制暫存器。Source 透過寫入此暫存器來控制背光開關和畫面顯示。這是 eDP 除錯的關鍵暫存器——如果面板有收到影像但背光沒開，畫面就是全黑的。",
    b: [
      { m: 0x01, s: 0, n: "BACKLIGHT_ENABLE", d: "背光啟用開關。1 = 開啟背光；0 = 關閉背光。Source 在 Link Training 成功並開始送影像後，必須設此 bit 為 1 才能看到畫面。如果 Link Training OK 但畫面全黑，先檢查這個 bit。" },
      { m: 0x02, s: 1, n: "BLACK_FRAME_INSERT", d: "黑畫面插入。1 = 插入黑畫面（畫面消隱但背光可保持）；0 = 正常顯示。用於閃爍減少（BFI）技術或模式切換時的暫時消隱。" },
      { m: 0x04, s: 2, n: "PANEL_SELF_TEST_ENABLE", d: "面板自我測試啟用。1 = 啟用面板內部測試圖案；0 = 正常顯示 Source 送來的影像。除錯時可開啟此功能確認面板本身是否正常。" },
      { m: 0x08, s: 3, n: "OVERDRIVE_ENABLE", d: "Overdrive 加速啟用。1 = 啟用液晶 Overdrive 加速；0 = 關閉。Overdrive 可減少液晶響應時間造成的拖影。" },
      { m: 0x10, s: 4, n: "DYNAMIC_BACKLIGHT_ENABLE", d: "動態背光啟用。1 = 啟用動態背光（Local Dimming）；0 = 使用靜態背光。" }
    ]
  },
  "00721": {
    n: "EDP_BACKLIGHT_MODE_SET",
    c: "eDP 背光模式設定",
    rw: 2,
    d: "設定 eDP 背光控制的工作模式。決定背光亮度的控制來源和行為。",
    b: [
      { m: 0x03, s: 0, n: "BACKLIGHT_CONTROL_MODE", d: "背光控制模式選擇。00 = 由面板韌體自行控制亮度；01 = 由 AUX 通道設定（DPCD 軟體控制）；10 = 由外部 PWM 訊號控制；11 = 保留。大多數筆電設計使用模式 01（AUX 控制），方便 OS 層級的亮度調整。" },
      { m: 0x04, s: 2, n: "AMBIENT_LIGHT_SENSOR_ENABLE", d: "環境光感測器啟用。1 = 面板內建的環境光感測器啟用，可自動調整亮度；0 = 關閉。" },
      { m: 0x08, s: 3, n: "BACKLIGHT_PWM_FREQ_PRESET_SELECT", d: "背光 PWM 頻率預設選擇。配合 00702h bit 3 使用。" },
      { m: 0x30, s: 4, n: "DYNAMIC_BACKLIGHT_FINER_CONTROL", d: "動態背光精細控制模式。" },
      { m: 0x40, s: 6, n: "REGIONAL_BACKLIGHT_ENABLE", d: "區域背光啟用。1 = 啟用分區背光控制。" }
    ]
  },
  "00722": {
    n: "EDP_BACKLIGHT_BRIGHTNESS_LSB",
    c: "eDP 背光亮度值（低位元組）",
    rw: 2,
    d: "eDP 背光亮度的低位元組（LSB）。與 00723h 合併為完整的背光亮度值。亮度值的有效位數由 00702h bits[1:0] 決定。例如 2-byte 模式下，00722h 為 LSB、00723h 為 MSB，合併為 16-bit 亮度值（0x0000 = 最暗，0xFFFF = 最亮）。FAE 除錯背光問題時，可直接寫入此暫存器測試亮度控制是否正常。",
    b: []
  },
  "00723": {
    n: "EDP_BACKLIGHT_BRIGHTNESS_MSB",
    c: "eDP 背光亮度值（高位元組）",
    rw: 2,
    d: "eDP 背光亮度的高位元組（MSB）。與 00722h 合併為完整的 16-bit 背光亮度值。例如要設定 50% 亮度，寫入 00722h=00h、00723h=80h（即 0x8000 ≈ 50%）。注意必須先確認背光控制模式（00721h）設為 AUX 控制模式，寫入才會生效。",
    b: []
  },

  // ============================================================
  //  ESI — Event Status Indicator (02000h - 020FFh)
  // ============================================================

  "02002": {
    n: "SINK_COUNT_ESI",
    c: "Sink 數量（ESI 鏡像）",
    rw: 1,
    d: "Sink 裝置數量的 ESI（Event Status Indicator）版本，功能等同 00200h 的 SINK_COUNT，但位於 ESI 區域。ESI 區域的優點是支援 IRQ_HPD + ClearOnRead 機制，Source 讀取後自動清除中斷。DP 1.2+ 建議 Source 改用 ESI 區域讀取狀態。",
    b: [
      { m: 0x3F, s: 0, n: "SINK_COUNT", d: "目前連接的 Sink 數量（0-63）。對於 SST（單串流）模式，通常為 1。MST 模式下可能大於 1。值為 0 表示無 Sink 連接。" },
      { m: 0x40, s: 6, n: "CP_READY", d: "內容保護就緒。1 = HDCP 認證已準備好。" },
      { m: 0x80, s: 7, n: "RESERVED", d: "保留位元。" }
    ]
  },
  "02003": {
    n: "DEVICE_SERVICE_IRQ_VECTOR_ESI0",
    c: "裝置服務中斷向量（ESI 鏡像）",
    rw: 1,
    d: "裝置服務中斷的 ESI 版本，功能等同 00201h。當 Sink 有事件需要通知 Source 時，對應的 bit 會被設為 1。Source 收到 IRQ_HPD 短脈衝後，應讀取此暫存器判斷中斷原因。",
    b: [
      { m: 0x01, s: 0, n: "REMOTE_CONTROL_COMMAND_PENDING", d: "1 = 有遙控器指令待處理（用於 CEC 轉 DP 的場景）。" },
      { m: 0x02, s: 1, n: "AUTOMATED_TEST_REQUEST", d: "1 = Sink 請求執行自動化測試（Compliance Testing 用）。Source 必須讀取 00218h 的測試請求暫存器來回應。" },
      { m: 0x04, s: 2, n: "CP_IRQ", d: "1 = 內容保護（HDCP）事件。可能是 HDCP 認證失敗、需要重新認證等。除錯 HDCP 問題時要關注此 bit。" },
      { m: 0x08, s: 3, n: "MCCS_IRQ", d: "1 = MCCS（Monitor Control Command Set）中斷。用於 DDC/CI 控制場景。" },
      { m: 0x10, s: 4, n: "DOWN_REP_MSG_RDY", d: "1 = 下行回覆訊息已備妥。MST 模式下，Source 的 Sideband MSG 回覆已準備好可讀取。" },
      { m: 0x20, s: 5, n: "UP_REQ_MSG_RDY", d: "1 = 上行請求訊息已備妥。MST 模式下，Branch/Sink 有 Sideband MSG 請求待處理。" },
      { m: 0x40, s: 6, n: "SINK_SPECIFIC_IRQ", d: "1 = Sink 特定中斷（廠商自定義的事件）。" },
      { m: 0x80, s: 7, n: "RESERVED", d: "保留。" }
    ]
  },
  "02005": {
    n: "LINK_SERVICE_IRQ_VECTOR_ESI0",
    c: "連結服務中斷向量（ESI）",
    rw: 1,
    d: "連結層級的中斷向量，用於通知 Source 連結狀態發生變化。這是 DP 1.2+ 新增的 ESI 區域暫存器，提供更細緻的連結狀態變化通知。",
    b: [
      { m: 0x01, s: 0, n: "RX_CAP_CHANGED", d: "1 = Sink 的接收能力已變更。可能是因為熱插拔後 EDID 改變，或 Sink 韌體更新後能力宣告改變。Source 應重新讀取 DPCD Capability 區域。" },
      { m: 0x02, s: 1, n: "LINK_STATUS_CHANGED", d: "1 = 連結狀態已變更。可能是 Lane 失鎖、CR/EQ 失敗等。Source 應讀取 0200Ch-0200Fh 的 Lane Status 確認狀況，必要時重新做 Link Training。" },
      { m: 0x04, s: 2, n: "STREAM_STATUS_CHANGED", d: "1 = 串流狀態已變更。MST 模式下某個串流的狀態改變。" },
      { m: 0x08, s: 3, n: "HDMI_LINK_STATUS_CHANGED", d: "1 = HDMI 連結狀態已變更（用於 DP-to-HDMI 的 Branch 裝置）。" },
      { m: 0x10, s: 4, n: "CONNECTED_OFF_ENTRY_REQUESTED", d: "1 = Sink 請求進入 Connected-OFF 狀態（深度省電）。" }
    ]
  },
  "02006": {
    n: "PSR_ERROR_STATUS",
    c: "PSR 錯誤狀態",
    rw: 1,
    d: "Panel Self-Refresh（面板自我刷新）的錯誤狀態暫存器。PSR 是 eDP 的重要省電技術——當畫面靜止時，Source 停止送影像，由 TCON 的 Frame Buffer 自行刷新面板。此暫存器記錄 PSR 運作中發生的錯誤。除錯 PSR 問題時必看。",
    b: [
      { m: 0x01, s: 0, n: "LINK_CRC_ERROR", d: "1 = PSR 期間偵測到 Link CRC 錯誤。表示從 Frame Buffer 刷新面板時資料有誤。可能是 TCON 內部記憶體問題。" },
      { m: 0x02, s: 1, n: "RFB_STORAGE_ERROR", d: "1 = Remote Frame Buffer 儲存錯誤。TCON 的 Frame Buffer 寫入失敗或資料損毀。嚴重錯誤，通常表示 TCON 硬體問題。" },
      { m: 0x04, s: 2, n: "VSC_SDP_UNCORRECTABLE_ERROR", d: "1 = VSC（Video Stream Configuration）SDP 封包無法修正的錯誤。PSR 進入/退出時使用 VSC SDP 通知 Sink，如果封包損毀會導致 PSR 狀態機異常。" }
    ]
  },
  "02007": {
    n: "PSR_EVENT_STATUS",
    c: "PSR 事件狀態",
    rw: 1,
    d: "PSR 事件狀態暫存器。記錄 PSR 狀態的轉換事件。Source 透過 IRQ_HPD + 讀取此暫存器來追蹤 PSR 的狀態變化。",
    b: [
      { m: 0x01, s: 0, n: "PSR_CAP_CHANGE", d: "1 = PSR 能力已變更。Sink 的 PSR 支援能力發生改變（罕見情況）。" },
      { m: 0x02, s: 1, n: "PSR_STATE_CHANGE", d: "1 = PSR 狀態已變更。Sink 的 PSR 狀態機從一個狀態轉換到另一個狀態（例如從 Active 進入 PSR、或從 PSR 退出到 Active）。配合 02008h 讀取目前狀態。" },
      { m: 0x04, s: 2, n: "PSR_SELF_UPDATE", d: "1 = Sink 自行觸發了 PSR 更新（Self Update）。表示 TCON 主動刷新了 Frame Buffer 的內容。" },
      { m: 0x08, s: 3, n: "PSR2_SU_CRC_ERROR_EVENT", d: "1 = PSR2 Selective Update CRC 錯誤事件。PSR2 的局部更新資料 CRC 校驗失敗。" }
    ]
  },
  "02008": {
    n: "PSR_STATUS",
    c: "PSR 狀態機（當前狀態）",
    rw: 1,
    d: "【關鍵暫存器】PSR 狀態機的當前狀態。這是除錯 PSR 最重要的暫存器——直接告訴你面板目前處於 PSR 流程的哪個階段。除錯 PSR 閃爍、殘影、喚醒延遲等問題時，持續輪詢此暫存器可追蹤狀態機的行為。",
    b: [
      { m: 0x07, s: 0, n: "PSR_STATE", d: "PSR 狀態機。000 = Inactive（PSR 未啟用）；001 = Transition to PSR Active（正在進入 PSR）；010 = PSR Active, Display from RFB（PSR 啟用中，面板從 Frame Buffer 自行刷新）；011 = Transition to PSR Active, Capture & Display（正在擷取最後一幀並顯示）；100 = PSR Active, Sink Self Refresh（PSR 啟用，Sink 自我刷新中）；101 = Transition to Inactive（正在退出 PSR）；110 = PSR2 Selective Update Active（PSR2 局部更新模式啟用）；111 = Reserved。正常的 PSR 循環為：0→1→2→(畫面變動)→5→0。" },
      { m: 0x08, s: 3, n: "PSR_CRC_VERIFICATION", d: "1 = PSR CRC 驗證功能啟用中。用於確認 Frame Buffer 資料完整性。" },
      { m: 0x10, s: 4, n: "PSR_FRAME_CAPTURE_INDICATION", d: "1 = Sink 正在擷取畫面到 Frame Buffer。" }
    ]
  },
  "0200C": {
    n: "LANE0_1_STATUS_ESI",
    c: "Lane 0-1 狀態（ESI 鏡像）",
    rw: 1,
    d: "Lane 0 和 Lane 1 的連結狀態，ESI 版本（鏡像 00202h）。DP 1.2+ 建議改用 ESI 區域讀取。功能與 00202h 完全相同。連結是否穩定，看這個暫存器就知道。",
    b: [
      { m: 0x01, s: 0, n: "LANE0_CR_DONE", d: "Lane 0 Clock Recovery 完成。1 = Lane 0 的時脈恢復成功。Link Training 第一階段的目標。" },
      { m: 0x02, s: 1, n: "LANE0_CHANNEL_EQ_DONE", d: "Lane 0 Channel EQ 完成。1 = Lane 0 的等化訓練成功。Link Training 第二階段的目標。" },
      { m: 0x04, s: 2, n: "LANE0_SYMBOL_LOCKED", d: "Lane 0 Symbol Lock。1 = Lane 0 的符號同步鎖定。表示資料流穩定解碼中。" },
      { m: 0x08, s: 3, n: "RESERVED_L0", d: "保留。" },
      { m: 0x10, s: 4, n: "LANE1_CR_DONE", d: "Lane 1 Clock Recovery 完成。" },
      { m: 0x20, s: 5, n: "LANE1_CHANNEL_EQ_DONE", d: "Lane 1 Channel EQ 完成。" },
      { m: 0x40, s: 6, n: "LANE1_SYMBOL_LOCKED", d: "Lane 1 Symbol Lock。" },
      { m: 0x80, s: 7, n: "RESERVED_L1", d: "保留。" }
    ]
  },
  "0200D": {
    n: "LANE2_3_STATUS_ESI",
    c: "Lane 2-3 狀態（ESI 鏡像）",
    rw: 1,
    d: "Lane 2 和 Lane 3 的連結狀態，ESI 版本（鏡像 00203h）。只有在 4-Lane 配置時才有意義。如果只用 1 Lane 或 2 Lane，此暫存器可忽略。",
    b: [
      { m: 0x01, s: 0, n: "LANE2_CR_DONE", d: "Lane 2 Clock Recovery 完成。" },
      { m: 0x02, s: 1, n: "LANE2_CHANNEL_EQ_DONE", d: "Lane 2 Channel EQ 完成。" },
      { m: 0x04, s: 2, n: "LANE2_SYMBOL_LOCKED", d: "Lane 2 Symbol Lock。" },
      { m: 0x08, s: 3, n: "RESERVED_L2", d: "保留。" },
      { m: 0x10, s: 4, n: "LANE3_CR_DONE", d: "Lane 3 Clock Recovery 完成。" },
      { m: 0x20, s: 5, n: "LANE3_CHANNEL_EQ_DONE", d: "Lane 3 Channel EQ 完成。" },
      { m: 0x40, s: 6, n: "LANE3_SYMBOL_LOCKED", d: "Lane 3 Symbol Lock。" },
      { m: 0x80, s: 7, n: "RESERVED_L3", d: "保留。" }
    ]
  },
  "0200E": {
    n: "LANE_ALIGN_STATUS_UPDATED_ESI",
    c: "Lane 對齊狀態更新（ESI 鏡像）",
    rw: 1,
    d: "所有 Lane 的對齊狀態與更新旗標，ESI 版本（鏡像 00204h）。",
    b: [
      { m: 0x01, s: 0, n: "INTERLANE_ALIGN_DONE", d: "Lane 間對齊完成。1 = 所有使用中的 Lane 之間的 skew 對齊已完成。多 Lane 配置下，各 Lane 的資料到達時間可能有微小差異（skew），此 bit 確認已補償完畢。" },
      { m: 0x02, s: 1, n: "POST_LT_ADJ_REQ_IN_PROGRESS", d: "1 = Link Training 後的調整請求進行中。Sink 認為目前的訓練參數可以微調。" },
      { m: 0x40, s: 6, n: "DOWNSTREAM_PORT_STATUS_CHANGED", d: "1 = 下游埠狀態已變更。Branch 裝置的下游連接狀態改變（例如下游 Sink 被拔除）。" },
      { m: 0x80, s: 7, n: "LINK_STATUS_UPDATED", d: "1 = 連結狀態已更新。此為旗標位元，表示 0200Ch-0200Dh 的 Lane Status 有新的更新。Source 讀取後此 bit 會被清除。" }
    ]
  },
  "0200F": {
    n: "SINK_STATUS_ESI",
    c: "Sink 狀態（ESI 鏡像）",
    rw: 1,
    d: "Sink 裝置的狀態資訊，ESI 版本（鏡像 00205h）。",
    b: [
      { m: 0x01, s: 0, n: "RECEIVE_PORT_0_STATUS", d: "接收埠 0 狀態。1 = 接收埠 0 正在同步（有接收到有效的影像串流）；0 = 未同步。這是確認 Sink 是否收到影像的最直接指標。" },
      { m: 0x02, s: 1, n: "RECEIVE_PORT_1_STATUS", d: "接收埠 1 狀態。1 = 接收埠 1 正在同步。僅多埠 Sink 才有意義。" }
    ]
  },

  // ============================================================
  //  Extended Receiver Capability (02200h - 022FFh)
  // ============================================================

  "02200": {
    n: "DPCD_REV_EXTENDED",
    c: "DPCD 版本號（擴展能力區）",
    rw: 1,
    vv: [{v:0x10,l:"10h — DPCD r1.0"},{v:0x11,l:"11h — DPCD r1.1"},{v:0x12,l:"12h — DPCD r1.2"},{v:0x13,l:"13h — DPCD r1.3"},{v:0x14,l:"14h — DPCD r1.4"},{v:0x20,l:"20h — DPCD r2.0"}],
    d: "擴展接收能力區域的 DPCD 版本號。此欄位是 00000h（DPCD_REV）的擴展版本。DP 1.4+ 規範規定：如果 Sink 支援擴展能力（00000h bit 表示），Source 應該優先從 02200h 讀取版本號，而非 00000h。原因是某些 Sink 為了向下相容舊 Source，會在 00000h 回報較低的版本（例如 1.2），但在 02200h 回報真正的版本（例如 1.4）。版本值：11h=DP1.1、12h=DP1.2、14h=DP1.4、20h=DP2.0。FAE 除錯 DP 1.4 裝置時，務必同時檢查 00000h 和 02200h，以確認 Sink 真正支援的版本。",
    b: []
  },
  "02201": {
    n: "MAX_LINK_RATE_EXTENDED",
    c: "最大連結速率（擴展能力區）",
    rw: 1,
    vv: [{v:0x06,l:"06h — RBR 1.62Gbps"},{v:0x0A,l:"0Ah — HBR 2.7Gbps"},{v:0x14,l:"14h — HBR2 5.4Gbps"},{v:0x1E,l:"1Eh — HBR3 8.1Gbps"},{v:0x01,l:"01h — UHBR10 10Gbps"},{v:0x02,l:"02h — UHBR13.5"},{v:0x04,l:"04h — UHBR20 20Gbps"}],
    d: "擴展接收能力區域的最大連結速率。此欄位是 00001h（MAX_LINK_RATE）的擴展版本。與 02200h 同理，某些 Sink 在 00001h 回報較保守的速率，但在 02201h 回報真正支援的最高速率。值：06h=RBR(1.62G)、0Ah=HBR(2.7G)、14h=HBR2(5.4G)、1Eh=HBR3(8.1G)。例如一個支援 HBR3 的 Sink 可能在 00001h 只回報 HBR2（為了相容不支援 HBR3 的舊 Source），但在 02201h 回報 1Eh（HBR3）。FAE 除錯高速率連結失敗時，一定要確認這個暫存器。",
    b: []
  },
  "02210": {
    n: "DPRX_FEATURE_ENUMERATION_LIST",
    c: "DPRX 功能列舉清單",
    rw: 1,
    d: "Sink（DPRX）支援的進階功能列舉。DP 1.4+ 新增的暫存器，集中列出 Sink 支援的各項新功能。這是了解 Sink 能力的重要參考。",
    b: [
      { m: 0x01, s: 0, n: "GTC_CAP", d: "1 = 支援 Global Time Code。GTC 用於音視頻同步，確保多個裝置之間的時間基準一致。" },
      { m: 0x02, s: 1, n: "SST_SPLIT_SDP_CAP", d: "1 = 支援 SST Split SDP（Secondary Data Packet 分割）。允許將 SDP 封包分割到多個 blanking 區間傳送。" },
      { m: 0x04, s: 2, n: "AV_SYNC_CAP", d: "1 = 支援 AV（Audio/Video）同步功能。Sink 可處理 Source 的 AV 同步資訊。" },
      { m: 0x08, s: 3, n: "VSC_SDP_EXT_FOR_COLORIMETRY_SUPPORTED", d: "1 = 支援 VSC SDP 擴展色彩資訊。這是 DP 1.4 傳遞 HDR Metadata 和廣色域資訊（如 BT.2020）的關鍵能力。如果此 bit 為 0，表示 Sink 不支援透過 VSC SDP 接收色彩格式資訊，HDR 可能無法正常運作。" },
      { m: 0x10, s: 4, n: "VSC_EXT_VESA_SDP_SUPPORTED", d: "1 = 支援 VESA 定義的 VSC 擴展 SDP。" },
      { m: 0x20, s: 5, n: "VSC_EXT_VESA_SDP_CHAINING_SUPPORTED", d: "1 = 支援 VSC 擴展 SDP 鏈接（多個 SDP 串接傳送）。" },
      { m: 0x40, s: 6, n: "VSC_EXT_CEA_SDP_SUPPORTED", d: "1 = 支援 CEA 定義的 VSC 擴展 SDP（如 HDR10 Metadata）。" },
      { m: 0x80, s: 7, n: "VSC_EXT_CEA_SDP_CHAINING_SUPPORTED", d: "1 = 支援 CEA VSC 擴展 SDP 鏈接。" }
    ]
  },

  // ============================================================
  //  Supplemental DPCD definitions imported from Excel tables
  // ============================================================

  "000B2": {
    n: "SU_X_GRANULARITY[7:0]",
    c: "SU X 粒度低位元組",
    rw: 1,
    d: "設定 Selective Update 網格在水平方向的粒度（低 8-bit）。0000h = 無額外 X 粒度要求，僅受標準限制（起始 X 需能被 16 整除、矩形寬度需能被 4 整除）。eDP v1.5 新增。",
    b: []
  },
  "000B3": {
    n: "SU_X_GRANULARITY[15:8]",
    c: "SU X 粒度高位元組",
    rw: 1,
    d: "設定 Selective Update 網格在水平方向的粒度（高 8-bit），與 000B2h 組合為 16-bit 值。eDP v1.5 新增。",
    b: []
  },
  "000B4": {
    n: "SU_Y_GRANULARITY",
    c: "SU Y 粒度",
    rw: 1,
    d: "設定 Selective Update 網格在垂直方向的粒度。00h/01h = 1 行、02h = 2 行、04h = 4 行、08h = 8 行、10h = 16 行。eDP v1.5 新增。",
    b: []
  },
  "00120": {
    n: "DPCD_00120",
    c: "FEC 配置暫存器",
    rw: 1,
    d: "Forward Error Correction（前向糾錯）配置暫存器。DP v1.4 新增。控制 FEC 的啟用、錯誤計數選擇、Lane 選擇等。FEC 在啟用 DSC 壓縮時必須開啟。",
    b: [
      {r:"7", n:"PRECODING_DISABLE", d:"0 = Pre-coding 已啟用（預設）。1 = Pre-coding 已停用。DP v1.4 新增。", v:{"00":"Pre-coding 已啟用（預設）", "01":"Pre-coding 已停用"}},
      {r:"6", n:"AGGREGATED_ENABLED_LANES_ERRORS", d:"0 = 未啟用。LANE_DEC_SELECT 欄位（bit 5:4）指定回報的 Lane。1 = 已啟用。FEC_ERROR_COUNT 暫存器（DPCD 00281h/00282h）回報的錯誤類型由 FEC_ERROR_COUNT_SEL 欄位（bit 3:1）選定，數值為所有啟用 Lane 的總和。LANE_DEC_SELECT 欄位被忽略。DP v1.4 新增。", v:{"00":"未啟用，LANE_DEC_SELECT 指定回報 Lane", "01":"已啟用，錯誤數為所有啟用 Lane 總和"}},
      {r:"5:4", n:"FEC_ERROR_LANE_SEL", d:"00 = Lane 0。01 = Lane 1。10 = Lane 2。11 = Lane 3。DP v1.4 新增。", v:{"00":"Lane 0", "01":"Lane 1", "10":"Lane 2", "11":"Lane 3"}},
      {r:"3:1", n:"FEC_ERROR_COUNT_SEL", d:"000 = FEC_ERROR_COUNT_DIS（停用）。001 = 未校正區塊錯誤計數。010 = 已校正區塊錯誤計數。011 = 位元錯誤計數。DP v1.4 新增。"},
      {r:"0", n:"FEC_READY", d:"0 = 未就緒。Source 須先設定此 bit 為 1 並啟動 Link Training 後才能開始 FEC 編碼。1 = 已就緒。Source 可直接開始 FEC 編碼而無需重新 Link Training。DP v1.4 新增。", v:{"00":"未就緒，須先啟動 Link Training", "01":"已就緒，可直接開始 FEC 編碼"}}
    ]
  },
  "00280": {
    n: "DPCD_00280",
    c: "FEC 狀態暫存器",
    rw: 1,
    d: "Forward Error Correction 狀態暫存器。DP v1.4 新增。回報 FEC 是否正在運行，以及是否偵測到 FEC 解碼啟用/停用。",
    b: [
      {r:"2", n:"FEC_RUNNING_INDICATOR", d:"0 = FEC 未運行。1 = FEC 正在運行。DP v1.4 新增。", v:{"00":"FEC 未運行", "01":"FEC 正在運行"}},
      {r:"1", n:"FEC_DECODE_DIS_DETECTED", d:"0 = 未偵測到 FEC 解碼停用。1 = 已偵測到 FEC 解碼停用事件。DP v1.4 新增。", v:{"00":"未偵測到 FEC 解碼停用", "01":"已偵測到 FEC 解碼停用"}},
      {r:"0", n:"FEC_DECODE_EN_DETECTED", d:"0 = 未偵測到 FEC 解碼啟用。1 = 已偵測到 FEC 解碼啟用事件。DP v1.4 新增。", v:{"00":"未偵測到 FEC 解碼啟用", "01":"已偵測到 FEC 解碼啟用"}}
    ]
  },
  "00310": {
    n: "intel_adaptive_sync[7:0]",
    c: "Intel Adaptive Sync 最大 VBlank 縮減（byte 0）",
    rw: 1,
    d: "Intel Adaptive Sync 垂直消隱（VBlank）最大縮減量（以行數為單位）的最低位元組。與 00311h-00313h 組合為 32-bit 值。Adaptive Sync 允許面板動態調整更新率以配合內容幀率，減少撕裂和卡頓。",
    b: []
  },
  "00311": {
    n: "intel_adaptive_sync[15:8]",
    c: "Intel Adaptive Sync 最大 VBlank 縮減（byte 1）",
    rw: 1,
    d: "Intel Adaptive Sync 最大 VBlank 縮減量的第 2 位元組。",
    b: []
  },
  "00312": {
    n: "intel_adaptive_sync[23:16]",
    c: "Intel Adaptive Sync 最大 VBlank 縮減（byte 2）",
    rw: 1,
    d: "Intel Adaptive Sync 最大 VBlank 縮減量的第 3 位元組。",
    b: []
  },
  "00313": {
    n: "intel_adaptive_sync[31:24]",
    c: "Intel Adaptive Sync 最大 VBlank 縮減（byte 3）",
    rw: 1,
    d: "Intel Adaptive Sync 最大 VBlank 縮減量的最高位元組。",
    b: []
  },
  "00314": {
    n: "DPCD_00314",
    c: "Intel PSR/LRR 能力暫存器",
    rw: 1,
    d: "Intel 自定義 DPCD 暫存器，回報 PSR VTotal 控制、低更新率切換（LRR）、UBRR 等進階省電功能的支援狀態。具體設定需依面板型號調整。",
    b: [
      {r:"5", n:"ALRR_SUPPORTED", d:"0 = 不支援。1 = 支援 Intel ALRR（Autonomous Low Refresh Rate）。", v:{"00":"不支援", "01":"支援 ALRR"}},
      {r:"4", n:"UBRR-LR support", d:"1 = 支援 UBRR-LR。0 = 不支援。", v:{"00":"不支援 UBRR-LR", "01":"支援 UBRR-LR"}},
      {r:"3", n:"UBRR-ZR support", d:"1 = 支援 UBRR-ZR。0 = 不支援。", v:{"00":"不支援 UBRR-ZR", "01":"支援 UBRR-ZR"}},
      {r:"2", n:"VTOTAL_CHANGED", d:"0 = 不支援 PSR 進入/離開時 VTotal 變更。1 = 支援。", v:{"00":"不支援 VTotal 變更", "01":"支援 VTotal 變更"}},
      {r:"1", n:"LOW_RR_SWITCHING", d:"0 = 不支援面板內部低更新率切換。1 = 支援 PSR 閒置時低更新率切換。", v:{"00":"不支援低更新率切換", "01":"支援低更新率切換"}},
      {r:"0", n:"PIXEL_CLK_BASED_RR_CHANGED", d:"0 = 不支援基於 pixel clock 的更新率變更。1 = 支援。", v:{"00":"不支援", "01":"支援"}}
    ]
  },
  "00316": {
    n: "DPCD_00316",
    c: "Intel LRR 啟用控制",
    rw: 1,
    d: "Intel 自定義 DPCD 暫存器，控制 Intel LRR（Low Refresh Rate）功能的啟用狀態。",
    b: [
      {r:"2", n:"Enable Intel ALRR", d:"0 = Intel LRR 未啟用。1 = Intel LRR 已啟用。", v:{"00":"Intel LRR 未啟用", "01":"Intel LRR 已啟用"}}
    ]
  },
  "00317": {
    n: "SinkCapability",
    c: "Sink 背光／顯示能力",
    rw: 1,
    d: "eDP Sink 裝置的背光與顯示能力宣告暫存器。描述 Sink 支援的背光調整方式（PWM / AUX）、漸進背光調整、DisplayHDR、OLED、DSC passthrough、miniLED 等能力。",
    e: "eDP Sink device backlight and display capability register. Declares backlight adjustment method (PWM/AUX), gradual ramping, DisplayHDR, OLED, DSC passthrough, and miniLED support.",
    b: [
      {r:"0", n:"sinkSDRBacklightSupportMethod", d:"SDR 模式下背光調整方式：0=PWM 調整，1=AUX 調整。", de:"SDR mode backlight adjustment method: 0=PWM, 1=AUX.", v:{"00":"PWM 調整（SDR）", "01":"AUX 調整（SDR）"}},
      {r:"1", n:"sinkHDRBacklightSupportMethod", d:"HDR 模式下背光調整方式：0=PWM 調整，1=AUX 調整。", de:"HDR mode backlight adjustment method: 0=PWM, 1=AUX.", v:{"00":"PWM 調整（HDR）", "01":"AUX 調整（HDR）"}},
      {r:"2", n:"sinkSupportGradualBacklightRamping", d:"是否支援漸進式背光調整（gradual ramping）：0=不支援，1=支援。", de:"Gradual backlight ramping support: 0=not supported, 1=supported.", v:{"00":"不支援漸進背光", "01":"支援漸進背光"}},
      {r:"3", n:"sinkSupportDisplayHDR", d:"是否支援 DisplayHDR 及 tunnel test pattern 自動調光：0=不支援，1=支援。", de:"DisplayHDR and tunnel test pattern auto-dimming: 0=not supported, 1=supported.", v:{"00":"不支援 DisplayHDR", "01":"支援 DisplayHDR"}},
      {r:"4", n:"sinkOLED", d:"是否使用 OLED 顯示技術：0=非 OLED，1=OLED。", de:"OLED display technology: 0=not OLED, 1=OLED.", v:{"00":"非 OLED", "01":"OLED"}},
      {r:"5", n:"Sink_DSC_Passthrough_Support", d:"是否支援 PSR/PSR-SU 模式下的 DSC passthrough：0=不支援，1=支援並啟用。", de:"DSC passthrough for PSR/PSR-SU: 0=not supported, 1=supported and enabled.", v:{"00":"不支援 DSC passthrough", "01":"支援 DSC passthrough"}},
      {r:"6", n:"sinkMiniLED", d:"是否使用 miniLED 顯示技術：0=非 miniLED，1=miniLED。", de:"miniLED display technology: 0=not miniLED, 1=miniLED.", v:{"00":"非 miniLED", "01":"miniLED"}},
      {r:"7", n:"RESERVED", d:"保留位元。", de:"Reserved bit.", v:{}}
    ]
  },
  "00320": {
    n: "dp_dpcd_00320",
    c: "MBO 應用暫存器",
    rw: 1,
    d: "用於 MBO（Multi Beam Operation）應用的自定義 DPCD 暫存器。",
    b: []
  },
  "00330": {
    n: "ALPM Sink Device Power Management State",
    c: "ALPM Sink 電源管理狀態",
    rw: 1,
    d: "ALPM（Advanced Link Power Management）Sink 端裝置電源管理狀態暫存器。回報 Sink 目前所處的電源狀態：0=未知、1=ACTIVE（正常運作）、2=ACTIVE_NOSTREAM（無串流但仍活躍）、3=STANDBY（待機）、4=FW_STANDBY（韌體待機）、5=SLEEP（睡眠）、6=FW_SLEEP（韌體睡眠）、7=OFF（關閉）。除錯 PSR/ALPM 省電問題時可讀取此暫存器確認面板電源狀態。",
    b: []
  },
  "00340": {
    n: "INTEL_EDPHDR_CAPS_0",
    c: "Intel eDP HDR 功能 0",
    rw: 1,
    d: "Intel HDR 功能暫存器（第 0 組），保留供未來擴充。",
    e: "Intel HDR capability register (group 0), reserved for future expansion.",
    b: []
  },
  "00341": {
    n: "DPCD_INTEL_EDPHDR_CAPS",
    c: "Intel eDP HDR 功能回報",
    rw: 1,
    e: "Intel custom DPCD register reporting TCON HDR capabilities: 2084 decode, panel tone mapping, segmented backlight, nits brightness control, brightness optimization, colorimetry/metadata SDP, sRGB-to-panel gamut conversion.",
    d: "Intel 自訂 DPCD 暫存器，回報 TCON 的 HDR 相關能力：PQ 2084 解碼、BT.2020 色域、面板 tone mapping、分段背光、nits 亮度控制、亮度最佳化、色度 SDP、sRGB 色域轉換。",
    b: [
      {r:"0", n:"HDR_2084_DECODE", d:"是否支援 PQ (SMPTE 2084) 解碼：0=不支援，1=支援。", de:"PQ (SMPTE 2084) decode support: 0=not supported, 1=supported.", v:{"00":"不支援 2084 解碼", "01":"支援 2084 解碼"}},
      {r:"1", n:"BT2020_GAMUT", d:"是否支援 BT.2020 色域：0=不支援，1=支援。", de:"BT.2020 gamut support: 0=not supported, 1=supported.", v:{"00":"不支援 BT.2020", "01":"支援 BT.2020"}},
      {r:"2", n:"PANEL_TONE_MAPPING", d:"是否支援面板 tone mapping：0=不支援，1=支援。", de:"Panel tone mapping support: 0=not supported, 1=supported.", v:{"00":"不支援 tone mapping", "01":"支援 tone mapping"}},
      {r:"3", n:"SEGMENTED_BKLT_CAPABILITY", d:"是否支援分段背光（segmented backlight），OLED 面板不適用：0=不支援，1=支援。", de:"Segmented backlight capability (N/A for OLED): 0=not supported, 1=supported.", v:{"00":"不支援分段背光", "01":"支援分段背光"}},
      {r:"4", n:"NITS_BRIGHTNESS_CONTROL", d:"是否支援透過 AUX 以 nits 為單位控制亮度：0=不支援，1=支援。", de:"Nits-level brightness control via AUX: 0=not supported, 1=supported.", v:{"00":"不支援 nits 亮度控制", "01":"支援 nits 亮度控制"}},
      {r:"5", n:"BRIGHTNESS_OPTIMIZATION", d:"是否支援亮度最佳化（brightness optimization）：0=不支援，1=支援。", de:"Brightness optimization support: 0=not supported, 1=supported.", v:{"00":"不支援亮度最佳化", "01":"支援亮度最佳化"}},
      {r:"6", n:"SDP_FOR_COLORIMETRY/METADATA", d:"是否支援透過 SDP 傳送色度／metadata 資訊：0=不支援，1=支援。", de:"SDP for colorimetry/metadata support: 0=not supported, 1=supported.", v:{"00":"不支援色度 SDP", "01":"支援色度 SDP"}},
      {r:"7", n:"SRGB_TO_PANEL_GAMUT_MAPPING", d:"是否支援 sRGB 到面板色域的轉換（適用於廣色域面板顯示 SDR 桌面）：0=不支援，1=支援。", de:"sRGB to panel gamut mapping (for wide gamut panels with SDR desktop): 0=not supported, 1=supported.", v:{"00":"不支援色域轉換", "01":"支援色域轉換"}}
    ]
  },
  "00342": {
    n: "TCON_CAPABILITY",
    c: "TCON 功能",
    rw: 1,
    d: "TCON 功能宣告暫存器。Bit 0 表示 TCON 是否支援透過 AUX 控制 SDR 及 HDR 模式的亮度。",
    e: "TCON capability register. Bit 0 indicates whether TCON accepts AUX-based brightness control in both SDR and HDR modes.",
    b: [
      {r:"0", n:"AUX_BRIGHTNESS_CONTROL", d:"TCON 是否接受透過 AUX 進行 SDR 與 HDR 模式的亮度控制：0=不接受，1=接受。", de:"TCON accepts AUX for brightness control in both SDR and HDR mode: 0=no, 1=yes.", v:{"00":"不接受 AUX 亮度控制", "01":"接受 AUX 亮度控制"}},
      {r:"7:1", n:"RESERVED", d:"保留位元，讀值皆為 0。", de:"Reserved, read all 0s."}
    ]
  },
  "00343": {
    n: "INTEL_EDPHDR_CAPS_3",
    c: "Intel eDP HDR 功能 3",
    rw: 1,
    d: "Intel HDR 功能暫存器（第 3 組），保留供未來擴充。",
    e: "Intel HDR capability register (group 3), reserved for future expansion.",
    b: []
  },
  "00344": {
    n: "DPCD_00344",
    c: "Intel HDR 控制補充定義",
    rw: 1,
    d: "Intel 自訂 DPCD 補充定義，包含 HDR 2084/2020、分段背光控制、nits 亮度控制、面板 tone mapping、色度 SDP、sRGB 色域轉換等控制位元。",
    e: "Intel custom supplemental DPCD definition with HDR 2084/2020, segmented backlight control, nits brightness control, panel tone mapping, colorimetry SDP, and sRGB gamut mapping control bits.",
    b: [
      {r:"0", n:"HDR_2084_CONTROL", d:"HDR PQ 2084 控制位元：與 341h[0] 對應，控制 2084 解碼啟用。", de:"HDR PQ 2084 control bit, corresponds to 341h[0]."},
      {r:"1", n:"BT2020_CONTROL", d:"BT.2020 色域控制位元：與 341h[1] 對應。", de:"BT.2020 gamut control bit, corresponds to 341h[1]."},
      {r:"2", n:"PANEL_TONE_MAPPING", d:"面板 tone mapping 控制位元：與 341h[2] 對應。", de:"Panel tone mapping control bit, corresponds to 341h[2]."},
      {r:"3", n:"SEGMENTED_BKLT_CONTROL", d:"分段背光控制位元，控制區域背光開關。", de:"Segmented backlight control bit."},
      {r:"4", n:"NITS_BRIGHTNESS_CONTROL", d:"nits 亮度控制位元，實際亮度值寫入 354-356h（單位：cd/m²）。", de:"Nits brightness control bit; actual value written to 354-356h (cd/m²)."},
      {r:"5", n:"SRGB_TO_PANEL_GAMUT_MAPPING", d:"sRGB 到面板色域轉換控制位元：與 341h[7] 對應。", de:"sRGB to panel gamut mapping control bit, corresponds to 341h[7]."},
      {r:"7", n:"SDP_FOR_COLORIMETRY/METADATA", d:"色度／metadata SDP 控制位元：與 341h[6] 對應。", de:"Colorimetry/metadata SDP control bit, corresponds to 341h[6]."}
    ]
  },
  "00346": {
    n: "CONTENT_LUMINANCE",
    c: "內容亮度",
    rw: 1,
    d: "內容亮度值（Intel 自訂），346-349h 共 4 bytes。",
    e: "Content luminance value (Intel custom), 346-349h, 4 bytes total.",
    b: []
  },
  "00347": {
    n: "CONTENT_LUMINANCE",
    c: "內容亮度（Intel 自定義, byte 1）",
    rw: 1,
    d: "內容亮度值。Intel 自定義 DPCD 映射，出自 Intel HDR/backlight 參考文件。地址 346h-349h 共 4 bytes 組合為內容亮度資訊，供 HDR 背光控制使用。",
    b: []
  },
  "00348": {
    n: "CONTENT_LUMINANCE",
    c: "內容亮度（Intel 自定義, byte 2）",
    rw: 1,
    d: "內容亮度值。Intel 自定義 DPCD 映射，出自 Intel HDR/backlight 參考文件。地址 346h-349h 共 4 bytes 組合為內容亮度資訊，供 HDR 背光控制使用。",
    b: []
  },
  "00349": {
    n: "CONTENT_LUMINANCE",
    c: "內容亮度（Intel 自定義, byte 3）",
    rw: 1,
    d: "內容亮度值。Intel 自定義 DPCD 映射，出自 Intel HDR/backlight 參考文件。地址 346h-349h 共 4 bytes 組合為內容亮度資訊，供 HDR 背光控制使用。",
    b: []
  },
  "0034A": {
    n: "PANEL_EDID_LUMINANCE_OVERRIDE",
    c: "面板 EDID 亮度覆寫（Intel, byte 0）",
    rw: 1,
    d: "面板 EDID 亮度覆寫值。Intel 自定義 DPCD 映射，地址 34Ah-351h 共 8 bytes。允許 Source 端覆寫面板 EDID 中的亮度參數，用於 HDR 背光控制場景。",
    b: []
  },
  "0034B": {
    n: "PANEL_EDID_LUMINANCE_OVERRIDE",
    c: "面板 EDID 亮度覆寫（Intel, byte 1）",
    rw: 1,
    d: "面板 EDID 亮度覆寫值（第 2 位元組）。Intel 自定義 DPCD 映射，地址 34Ah-351h。",
    b: []
  },
  "0034C": {
    n: "PANEL_EDID_LUMINANCE_OVERRIDE",
    c: "面板 EDID 亮度覆寫（Intel, byte 2）",
    rw: 1,
    d: "面板 EDID 亮度覆寫值（第 3 位元組）。Intel 自定義 DPCD 映射，地址 34Ah-351h。",
    b: []
  },
  "0034D": {
    n: "PANEL_EDID_LUMINANCE_OVERRIDE",
    c: "面板 EDID 亮度覆寫（Intel, byte 3）",
    rw: 1,
    d: "面板 EDID 亮度覆寫值（第 4 位元組）。Intel 自定義 DPCD 映射，地址 34Ah-351h。",
    b: []
  },
  "0034E": {
    n: "PANEL_EDID_LUMINANCE_OVERRIDE",
    c: "面板 EDID 亮度覆寫（Intel, byte 4）",
    rw: 1,
    d: "面板 EDID 亮度覆寫值（第 5 位元組）。Intel 自定義 DPCD 映射，地址 34Ah-351h。",
    b: []
  },
  "0034F": {
    n: "PANEL_EDID_LUMINANCE_OVERRIDE",
    c: "面板 EDID 亮度覆寫（Intel, byte 5）",
    rw: 1,
    d: "面板 EDID 亮度覆寫值（第 6 位元組）。Intel 自定義 DPCD 映射，地址 34Ah-351h。",
    b: []
  },
  "00350": {
    n: "PANEL_EDID_LUMINANCE_OVERRIDE",
    c: "面板 EDID 亮度覆寫（Intel, byte 6）",
    rw: 1,
    d: "面板 EDID 亮度覆寫值（第 7 位元組）。Intel 自定義 DPCD 映射，地址 34Ah-351h。",
    b: []
  },
  "00351": {
    n: "PANEL_EDID_LUMINANCE_OVERRIDE",
    c: "面板 EDID 亮度覆寫（Intel, byte 7）",
    rw: 1,
    d: "面板 EDID 亮度覆寫值（第 8 位元組）。Intel 自定義 DPCD 映射，地址 34Ah-351h。",
    b: []
  },
  "00352": {
    n: "SDR_LUMINANCE_LEVEL",
    c: "SDR 亮度等級（Intel, 低位元組）",
    rw: 1,
    d: "SDR 亮度等級值。Intel 自定義 DPCD 映射，地址 352h-353h 共 2 bytes。定義 SDR 內容的亮度等級。",
    b: []
  },
  "00353": {
    n: "SDR_LUMINANCE_LEVEL",
    c: "SDR 亮度等級（Intel, 高位元組）",
    rw: 1,
    d: "SDR 亮度等級值（高位元組）。Intel 自定義 DPCD 映射，地址 352h-353h。",
    b: []
  },
  "00354": {
    n: "NITS_BRIGHTNESS_CONTROL",
    c: "Nits 亮度控制（Intel, byte 0）",
    rw: 1,
    d: "Nits 亮度控制值。Intel 自定義 DPCD 映射，地址 354h-356h 共 3 bytes，單位 cd/m²。配合 344h[4] 使用。",
    b: []
  },
  "00355": {
    n: "NITS_BRIGHTNESS_CONTROL",
    c: "Nits 亮度控制（Intel, byte 1）",
    rw: 1,
    d: "Nits 亮度控制值（第 2 位元組）。Intel 自定義 DPCD 映射。",
    b: []
  },
  "00356": {
    n: "NITS_BRIGHTNESS_CONTROL",
    c: "Nits 亮度控制（Intel, byte 2）",
    rw: 1,
    d: "平滑亮度控制。Intel 自定義 DPCD 映射，356h 為幀數、357h 為每幀步進值。",
    b: []
  },
  "00357": {
    n: "SMOOTH_BRIGHTNESS_CONTROL",
    c: "平滑亮度控制（Intel）",
    rw: 1,
    d: "平滑亮度控制。Intel 自定義 DPCD 映射，356h 為幀數、357h 為每幀步進值。用於亮度漸變過渡效果。",
    b: []
  },
  "00358": {
    n: "DPCD_00358",
    c: "亮度優化控制（Intel）",
    rw: 1,
    d: "亮度優化控制暫存器。Intel 自定義 DPCD 映射，控制亮度優化模式和系統使用狀態。",
    b: [
      {r:"7:5", n:"BRIGHTNESS_OPTIMIZATION_CONTROL", d:"亮度優化控制。Intel 自定義 DPCD 映射，出自 Intel HDR/backlight 參考文件 358[7:5]。"},
      {r:"3:0", n:"BRIGHTNESS_OPTIMIZATION_SYSTEM_USAGE", d:"亮度優化系統使用狀態。Intel 自定義 DPCD 映射，出自 Intel HDR/backlight 參考文件 358[3:0]。"},
      {r:"4", n:"BRIGHTNESS_OPTIMIZATION_AC/DC_STATE", d:"亮度優化 AC/DC 狀態。Intel 自定義 DPCD 映射，出自 Intel HDR/backlight 參考文件 358[4]。"}
    ]
  },
  "00370": {
    n: "DPCD_00370",
    c: "AMD PSR-SU 速率控制能力",
    rw: 1,
    d: "AMD 自定義 DPCD 暫存器，回報 Sink 是否支援 PSR 活躍期間的 VTotal 控制（用於動態更新率調整）。",
    b: [
      {r:"0", n:"AMD PSR-SU Rate Control Capability", d:"0 = Sink 不支援 PSR 活躍期間的 VTotal 控制。1 = Sink 支援 PSR 活躍期間的 VTotal 控制。", v:{"00":"不支援", "01":"支援"}}
    ]
  },
  "00373": {
    n: "SinkPsrActiveVTotalInUse[7:0]",
    c: "Sink PSR 活躍 VTotal 使用中（低位元組）",
    rw: 1,
    d: "此暫存器由 Source 讀取。Sink 回傳 2-byte 值，指示目前輸出畫面使用的 VTotal（垂直總行數）。用於 PSR 期間監控面板實際更新率。",
    b: []
  },
  "00374": {
    n: "SinkPsrActiveVTotalInUse[15:8]",
    c: "Sink PSR 活躍 VTotal 使用中（高位元組）",
    rw: 1,
    d: "Sink PSR 活躍 VTotal 的高位元組。與 00373h 組合為 16-bit 值。",
    b: []
  },
  "00378": {
    n: "DPCD_00378",
    c: "PSR 相關補充暫存器",
    rw: 1,
    d: "PSR 相關補充 DPCD 暫存器。",
    b: [
      {r:"6:5", n:"Sink Frame Locked", d:"00 = Sink 裝置幀已鎖定至 Source 裝置。01 = Sink 裝置維持 coasting VTotal。10 = Sink 裝置使用低更新率。11 = 保留。", v:{"00":"幀已鎖定至 Source", "01":"維持 coasting VTotal", "10":"使用低更新率", "11":"保留"}},
      {r:"4:2", n:"Sink Device Replay Status", d:"000 = Sink 裝置在 Live 模式。001 = Live + Capture 模式。010 = Sink 在 Replay 模式。011 = Replay + Capture 模式。100 = 保留。", v:{"000":"Live 模式", "001":"Live + Capture", "010":"Replay 模式", "011":"Replay + Capture"}},
      {r:"1", n:"Timing Desync Error Status", d:"0 = 未偵測到時序不同步錯誤。1 = 已偵測到時序不同步錯誤。", v:{"00":"未偵測到", "01":"已偵測到"}}
    ]
  },
  "00379": {
    n: "Pixel Deviation Per Line",
    c: "每行像素偏差量",
    rw: 1,
    d: "若 Sink 支援 Replay 功能，Sink 必須回報最大 link off time 期間每行的像素偏差量。用於確保 Replay 模式下畫面品質。",
    b: []
  },
  "0037A": {
    n: "Max Number Of Deviation Line",
    c: "最大偏差行數",
    rw: 1,
    d: "Sink 回報在 Replay 期間可維持顯示品質的最大偏差行數。",
    b: []
  },
  "0037B": {
    n: "DPCD_0037B",
    c: "補充 DPCD 暫存器",
    rw: 1,
    d: "補充 DPCD 暫存器。",
    b: [
      {r:"2", n:"Replay State Transition error detection", d:"0 = Sink device disables Replay state Transition error detection. Sink shall disable Replay state Transition error detection.\n1 = Sink device performs Replay state Transition error detection. Sink shall set the Replay State Transition error status bit and inform Source with a HPD irq when Replay State Transition error r occurs", v:{"00":"Sink device disables Replay state Transition error detection. Sink shall disable Replay state Transition error detection", "01":"Sink device performs Replay state Transition error detection. Sink shall set the Replay State Transition error status bit and inform Source with a HPD irq when Replay State Transition error r occurs"}},
      {r:"1", n:"Timing desync error verification", d:"0 = Sink device disables Timing desync error verification. Sink shall disable Timing desync error detection\n1 = Sink device performs Timing desync error verification Sink shall set the RFB Timing desynbc error status bit and inform Source with a HPD irq when Timing desync error occurs.", v:{"00":"Sink device disables Timing desync error verification. Sink shall disable Timing desync error detection", "01":"Sink device performs Timing desync error verification Sink shall set the RFB Timing desynbc error status bit and inform Source with a HPD irq when Timing desync error occurs"}},
      {r:"0", n:"Source enable Freesync Panel Replay Mode", d:""}
    ]
  },
  "003F0": {
    n: "Early Scanline SDP for PSR2",
    c: "PSR2 Early Scanline SDP 支援",
    rw: 1,
    d: "PSR2 早期掃描線 SDP 功能支援暫存器。0 = 預設，不支援 PSR2 Early Scanline，若 Hblank < 100ns 則停用 PSR2 改用 PSR1。1 = 支援 PSR2 Early Scanline SDP，若 Hblank < 100ns 則啟用 PSR2 搭配 Early Scanline SDP。2 = 不支援 Early Scanline SDP 但 VSC SDP 設定時間要求小於 100ns，若 Hblank < 100ns 則不使用 Early Scanline 功能直接啟用 PSR2。",
    b: []
  },
  "0040F": {
    n: "Specific Tcon setting for AMD",
    c: "AMD 專用 TCON 設定",
    rw: 1,
    d: "AMD 專用的 TCON 設定暫存器。用於 AMD 平台特定的 TCON 配置。",
    b: []
  },
  "00410": {
    n: "AMD AUPI-LSB: panel Manufacture ID",
    c: "AMD AUPI 面板製造商 ID（低位元組）",
    rw: 1,
    d: "AMD AUPI（Advanced Unified Panel Interface）面板製造商識別碼的低位元組。",
    b: []
  },
  "00411": {
    n: "AMD AUPI-MSB: panel Manufacture ID",
    c: "AMD AUPI 面板製造商 ID（高位元組）",
    rw: 1,
    d: "AMD AUPI 面板製造商識別碼的高位元組。",
    b: []
  },
  "00412": {
    n: "AMD AUPI-LSB: Panel ID",
    c: "AMD AUPI 面板 ID（低位元組）",
    rw: 1,
    d: "AMD AUPI 面板產品識別碼的低位元組。",
    b: []
  },
  "00413": {
    n: "AMD AUPI-MSB: Panel ID",
    c: "AMD AUPI 面板 ID（高位元組）",
    rw: 1,
    d: "AMD AUPI 面板產品識別碼的高位元組。",
    b: []
  },
  "00414": {
    n: "AMD AUPI-LSB: Tcon FW checksum",
    c: "AMD AUPI TCON 韌體校驗和（低位元組）",
    rw: 1,
    d: "AMD AUPI TCON 韌體校驗和（checksum）的低位元組。用於驗證 TCON 韌體完整性。",
    b: []
  },
  "00415": {
    n: "AMD AUPI-MSB: Tcon FW checksum",
    c: "AMD AUPI TCON 韌體校驗和（高位元組）",
    rw: 1,
    d: "AMD AUPI TCON 韌體校驗和的高位元組。",
    b: []
  },
  "00416": {
    n: "AMD AUPI-LSB: Tcon FW Device ID",
    c: "AMD AUPI TCON 韌體裝置 ID（低位元組）",
    rw: 1,
    d: "AMD AUPI TCON 韌體裝置識別碼的低位元組。用於識別 TCON 韌體版本。",
    b: []
  },
  "00417": {
    n: "AMD AUPI-MSB: Tcon FW Device ID",
    c: "AMD AUPI TCON 韌體裝置 ID（高位元組）",
    rw: 1,
    d: "AMD AUPI TCON 韌體裝置識別碼的高位元組。",
    b: []
  },
  "00704": {
    n: "DPCD_00704",
    c: "eDP 背光區域能力",
    rw: 1,
    d: "eDP 背光區域控制能力暫存器。定義面板支援的獨立可控 1D 背光區域數量（水平和垂直方向）。用於區域調光（Local Dimming）功能。",
    b: [
      {r:"7:4", n:"Y_REGION_CAP", d:"定義面板在垂直方向支援的獨立可控 1D 背光區域數量。"},
      {r:"3:0", n:"X_REGION_CAP", d:"定義面板在水平方向支援的獨立可控 1D 背光區域數量。"}
    ]
  },
  "00705": {
    n: "DPCD_00705",
    c: "分段背光能力",
    rw: 1,
    d: "分段背光（Segmented Backlight）能力暫存器。VESA DPCD 映射，出自 Intel HDR/backlight 參考文件。",
    b: [
      {r:"0", n:"SEGMENTED_BKLT_CAPABILITY", d:"分段背光能力。VESA DPCD 映射，出自 Intel HDR/backlight 參考文件 705[0]。"}
    ]
  },
  "00724": {
    n: "DPCD_00724",
    c: "eDP PWM 位元數設定",
    rw: 1,
    d: "Source 用於設定 DPCD 00722h/00723h 背光亮度控制的有效位元數。",
    b: [
      {r:"7:0", n:"EDP_BACKLIGHT_BRIGHTNESS_BIT_COUNT", d:"Source 用於設定 DPCD 0x00722 及 0x00723 的有效控制位元數。"}
    ]
  },
  "00725": {
    n: "DPCD_00725",
    c: "eDP PWM 位元數下限",
    rw: 1,
    d: "Sink 設定的 PWM 位元數最小值，必須大於等於 1。",
    b: [
      {r:"7:0", n:"MIN_EDP_BACKLIGHT_BRIGHTNESS_BIT_COUNT", d:"此值由 Sink 設定，必須大於等於 1。"}
    ]
  },
  "00726": {
    n: "DPCD_00726",
    c: "eDP PWM 位元數上限",
    rw: 1,
    d: "Sink 設定的 PWM 位元數最大值，必須大於等於 DPCD 00725h 的值。",
    b: [
      {r:"7:0", n:"MAX_EDP_BACKLIGHT_BRIGHTNESS_BIT_COUNT", d:"此值由 Sink 設定，必須大於等於 DPCD 0x00725 的值。"}
    ]
  },
  "00727": {
    n: "DPCD_00727",
    c: "eDP 背光控制狀態",
    rw: 1,
    d: "eDP 背光控制狀態暫存器。回報背光運作狀態和平滑亮度控制狀態。",
    b: [
      {r:"1", n:"EDP_BACKLIGHT_CONTROL_STATUS", d:"0 = 正常運作。1 = 背光故障，無法正常運作。", v:{"00":"正常運作", "01":"背光故障"}},
      {r:"2", n:"SMOOTH_BRIGHTNESS_CONTROL", d:"平滑亮度控制狀態。VESA DPCD 映射，搭配 730[0]、737h/738h（毫秒）、739h-73Bh（目前即時值）使用。"}
    ]
  },
  "00728": {
    n: "EDP_BACKLIGHT_FREQ_SET",
    c: "eDP 背光 PWM 頻率設定",
    rw: 1,
    d: "顯示器背光 PWM 頻率控制值。Source 寫入此暫存器來設定背光 PWM 的驅動頻率。",
    b: []
  },
  "0072A": {
    n: "EDP_BACKLIGHT_FREQ_CAP_MIN[17:10]",
    c: "eDP 背光頻率下限（高位元組）",
    rw: 1,
    d: "eDP 背光 PWM 頻率最小值的高位元組（bit 17:10）。與 0072Bh、0072Ch 組合為 18-bit 值。",
    b: []
  },
  "0072B": {
    n: "EDP_BACKLIGHT_FREQ_CAP_MIN[9:2]",
    c: "eDP 背光頻率下限（中位元組）",
    rw: 1,
    d: "eDP 背光 PWM 頻率最小值的中間位元組（bit 9:2）。",
    b: []
  },
  "0072C": {
    n: "DPCD_0072C",
    c: "eDP 背光頻率下限（低 2-bit）",
    rw: 1,
    d: "eDP 背光 PWM 頻率最小值的最低 2 bit。",
    b: [
      {r:"7:6", n:"EDP_BACKLIGHT_FREQ_MIN_LOW_2BIT", d:"eDP 背光 PWM 頻率最小值的最低 2 bit。"}
    ]
  },
  "0072D": {
    n: "EDP_BACKLIGHT_FREQ_CAP_MAX[17:10]",
    c: "eDP 背光頻率上限（高位元組）",
    rw: 1,
    d: "eDP 背光 PWM 頻率最大值的高位元組（bit 17:10）。",
    b: []
  },
  "0072E": {
    n: "EDP_BACKLIGHT_FREQ_CAP_MAX[9:2]",
    c: "eDP 背光頻率上限（中位元組）",
    rw: 1,
    d: "eDP 背光 PWM 頻率最大值的中間位元組（bit 9:2）。",
    b: []
  },
  "0072F": {
    n: "DPCD_0072F",
    c: "eDP 背光頻率上限（低 2-bit）",
    rw: 1,
    d: "eDP 背光 PWM 頻率最大值的最低 2 bit。",
    b: [
      {r:"7:6", n:"EDP_BACKLIGHT_FREQ_MAX_LOW_2BIT", d:"eDP 背光 PWM 頻率最大值的最低 2 bit。"}
    ]
  },
  "00730": {
    n: "DPCD_00730",
    c: "亮度優化與平滑控制（VESA）",
    rw: 1,
    d: "亮度優化控制與平滑亮度控制暫存器。VESA DPCD 映射，出自 Intel HDR/backlight 參考文件。",
    b: [
      {r:"2:1", n:"BRIGHTNESS_OPTIMIZATION_CONTROL", d:"亮度優化控制。VESA DPCD 映射 730[2:1]。"},
      {r:"0", n:"SMOOTH_BRIGHTNESS_CONTROL", d:"平滑亮度控制啟用。VESA DPCD 映射，搭配 737h/738h（毫秒）、739h-73Bh（即時值）、727[2]（狀態）使用。"}
    ]
  },
  "00731": {
    n: "DPCD_00731",
    c: "分段背光控制（VESA）",
    rw: 1,
    d: "分段背光控制暫存器。VESA DPCD 映射，720[6] 必須為 1 才有效。",
    b: [
      {r:"0", n:"SEGMENTED_BACKLIGHT_CONTROL", d:"分段背光控制。VESA DPCD 映射，720[6] 必須為 1 才有效。"}
    ]
  },
  "00734": {
    n: "NITS_BRIGHTNESS_CONTROL",
    c: "Nits 亮度控制（VESA, byte 0）",
    rw: 1,
    d: "Nits 亮度控制值。VESA DPCD 映射，搭配 721[7] 使用，地址 734h-736h 共 3 bytes，單位 cd/m²。",
    b: []
  },
  "00735": {
    n: "NITS_BRIGHTNESS_CONTROL",
    c: "Nits 亮度控制（VESA, byte 1）",
    rw: 1,
    d: "Nits 亮度控制值。VESA DPCD 映射，搭配 721[7] 使用，地址 734h-736h 共 3 bytes，單位 cd/m²。",
    b: []
  },
  "00736": {
    n: "NITS_BRIGHTNESS_CONTROL",
    c: "Nits 亮度控制（VESA, byte 2）",
    rw: 1,
    d: "Nits 亮度控制值。VESA DPCD 映射，搭配 721[7] 使用，地址 734h-736h 共 3 bytes，單位 cd/m²。",
    b: []
  },
  "00737": {
    n: "SMOOTH_BRIGHTNESS_CONTROL",
    c: "平滑亮度控制（VESA, byte 0）",
    rw: 1,
    d: "平滑亮度控制。VESA DPCD 映射，搭配 730[0] 啟用、737h/738h 設定過渡時間（毫秒）、739h-73Bh 回報即時值、727[2] 回報狀態。",
    b: []
  },
  "00738": {
    n: "SMOOTH_BRIGHTNESS_CONTROL",
    c: "平滑亮度控制（VESA, byte 1）",
    rw: 1,
    d: "平滑亮度控制。VESA DPCD 映射，搭配 730[0] 啟用、737h/738h 設定過渡時間（毫秒）、739h-73Bh 回報即時值、727[2] 回報狀態。",
    b: []
  },
  "00739": {
    n: "SMOOTH_BRIGHTNESS_CONTROL",
    c: "平滑亮度控制即時值（VESA, byte 0）",
    rw: 1,
    d: "平滑亮度控制目前即時值。VESA DPCD 映射 739h-73Bh。",
    b: []
  },
  "0073A": {
    n: "SMOOTH_BRIGHTNESS_CONTROL",
    c: "平滑亮度控制即時值（VESA, byte 1）",
    rw: 1,
    d: "平滑亮度控制目前即時值。VESA DPCD 映射 739h-73Bh。",
    b: []
  },
  "0073B": {
    n: "SMOOTH_BRIGHTNESS_CONTROL",
    c: "平滑亮度控制即時值（VESA, byte 2）",
    rw: 1,
    d: "平滑亮度控制目前即時值。VESA DPCD 映射 739h-73Bh。",
    b: []
  },
  "00DEF": {
    n: "HDR_2084/2020_CAPABILITY",
    c: "HDR 2084/2020 能力（VESA）",
    rw: 1,
    d: "HDR PQ（SMPTE ST 2084）和 BT.2020 色域能力暫存器。VESA DPCD 映射。TCON/面板應透過 EDID/DisplayID 定義此能力：DID 2.x Display Parameters 區塊用於色域、DID 2.x Display Features 區塊用於 EOTF 支援。",
    b: []
  },
  "00FEA": {
    n: "HDR_2084/2020_CAPABILITY",
    c: "HDR 2084/2020 能力（VESA, 備用地址）",
    rw: 1,
    d: "HDR PQ（SMPTE ST 2084）和 BT.2020 色域能力暫存器。VESA DPCD 映射。TCON/面板應透過 EDID/DisplayID 定義此能力：DID 2.x Display Parameters 區塊用於色域、DID 2.x Display Features 區塊用於 EOTF 支援。",
    b: []
  },
  "02009": {
    n: "DPCD_02009",
    c: "PSR 同步延遲狀態",
    rw: 1,
    d: "PSR 退出後的同步延遲狀態暫存器。eDP v1.4b 新增。回報 Sink 上次 PSR 退出後需要幾個 frame 才能完成同步，以及重新進入 PSR 的最小 frame 數。",
    b: [
      {r:"3:0", n:"LAST_ACTUAL_SYNCHRONIZATION_LATENCY_IN_SINK", d:"0h = PSR 退出後第 1 個 frame 即完成同步。1h = 第 2 個 frame。2h = 第 3 個。3h = 第 4 個。7h = 第 8 個。8h = 超過 8 個 frame。eDP v1.4b 新增。"},
      {r:"7:4", n:"Minimum Frame Count for PSR Reentry", d:"0h = 已在第 1 個 frame 完成同步。1h = 第 2 個。2h = 第 3 個。3h = 第 4 個。7h = 第 8 個。8h = 超過 8 個 frame。eDP v1.4b 新增。"}
    ]
  },
  "02202": {
    n: "DPCD_02202",
    c: "延伸接收端最大 Lane 數與功能旗標",
    rw: 1,
    d: "延伸接收端能力欄位（02200h+）中的最大 Lane 數暫存器。結構同 00002h，但當 0000Eh[7]=1 時，Source 應讀取此處而非 00002h。",
    b: [
      {r:"7", n:"ENHANCED_FRAME_CAP", d:"0 = 不支援 Enhanced Framing。1 = 支援 Enhanced Framing。", v:{"00":"不支援", "01":"支援"}},
      {r:"6", n:"TPS3_SUPPORTED", d:"0 = 不支援 TPS3。1 = 支援 TPS3。", v:{"00":"不支援", "01":"支援"}},
      {r:"5", n:"POST_LT_ADJ_REQ_SUPPORTED", d:"0 = 不支援訓練後調整。1 = 支援 Post Link Training 調整請求。", v:{"00":"不支援", "01":"支援"}},
      {r:"4:0", n:"MAX_LANE_COUNT", d:"01h = 1 Lane。02h = 2 Lane。04h = 4 Lane。", v:{"01":"1 Lane", "02":"2 Lane", "04":"4 Lane"}}
    ]
  },
  "02203": {
    n: "DPCD_02203",
    c: "延伸展頻與訓練模式能力",
    rw: 1,
    d: "延伸接收端能力欄位中的展頻和訓練模式暫存器。結構同 00003h。",
    b: [
      {r:"6", n:"TPS4_SUPPORTED", d:"0 = 不支援 TPS4。1 = 支援 TPS4。", v:{"00":"不支援", "01":"支援"}},
      {r:"5", n:"NO_AUX_HANDSHAKE_LINK_TRAINING", d:"0 = 需要 AUX 交互同步。1 = 已知連結配置時不需要 AUX 交互。", v:{"00":"需要 AUX 交互", "01":"不需要 AUX 交互"}},
      {r:"4", n:"STREAM_REGENERATION_STATUS_CAPABILITY", d:"0 = 不支援。1 = 支援。DP v2.0 功能。", v:{"00":"不支援", "01":"支援"}},
      {r:"0", n:"MAX_DOWNSPREAD", d:"0 = 無展頻。1 = 最多 0.5% 向下展頻。", v:{"00":"無展頻", "01":"最多 0.5% 向下展頻"}}
    ]
  },
  "02207": {
    n: "DPCD_02207",
    c: "延伸下游端口資訊",
    rw: 1,
    d: "延伸接收端能力欄位中的下游端口數量和 OUI/MSA 支援暫存器。結構同 00007h。",
    b: [
      {r:"7", n:"OUI_support", d:"0 = 不支援 OUI。1 = 支援 OUI。eDP v1.5 新增。", v:{"00":"不支援", "01":"支援"}},
      {r:"6", n:"MSA_TIMING_PAR_IGNORED", d:"0 = Sink 需要 MSA 時序參數。1 = Sink 可不靠 MSA 時序參數渲染影像。eDP v1.5 新增。", v:{"00":"需要 MSA", "01":"可忽略 MSA"}},
      {r:"3:0", n:"DWN_STRM_PORT_COUNT", d:"下游端口數量。0h = 無下游端口。"}
    ]
  },
  "02208": {
    n: "DPCD_02208",
    c: "延伸接收端口 0 能力",
    rw: 1,
    d: "延伸接收端能力欄位中的接收端口 0 基本能力暫存器。結構同 00008h。",
    b: [
      {r:"5", n:"BUFFER_SIZE_PER_PORT_0", d:"0 = 緩衝區大小為每 Lane。1 = 緩衝區大小為每 Port，與 Lane 數無關。DP v1.4 更新。", v:{"00":"每 Lane", "01":"每 Port"}},
      {r:"4", n:"BUFFER_SIZE_UNIT_0", d:"0 = 單位為像素數。1 = 單位為位元組數。DP v1.4 更新。", v:{"00":"像素數", "01":"位元組數"}},
      {r:"3", n:"HBLANK_EXPANSION_CAPABLE_0", d:"0 = 不支援水平消隱擴展。1 = 支援水平消隱擴展。", v:{"00":"不支援", "01":"支援"}},
      {r:"2", n:"ASSOCIATED_TO_PRECEDING_PORT_0", d:"0 = 此端口用於主同步串流（Port 0 必須為 0）。1 = 此端口用於前一端口主串流的次要同步串流。", v:{"00":"主同步串流", "01":"次要同步串流"}},
      {r:"1", n:"LOCAL_EDID_PRESENT_0", d:"0 = 此接收端口無本地 EDID。1 = 此接收端口有本地 EDID。", v:{"00":"無 EDID", "01":"有 EDID"}}
    ]
  },
  "02209": {
    n: "BUFFER_SIZE_0",
    c: "延伸接收端口 0 緩衝區大小",
    rw: 1,
    d: "接收端口 0 緩衝區大小 = (值+1) × 32 bytes/Lane，最大 8 KB/Lane。",
    b: []
  },
  "0220A": {
    n: "DPCD_0220A",
    c: "延伸接收端口 1 能力",
    rw: 1,
    d: "延伸接收端能力欄位中的接收端口 1 基本能力暫存器。結構同 0000Ah。",
    b: [
      {r:"5", n:"BUFFER_SIZE_PER_PORT_1", d:"0 = 緩衝區大小為每 Lane。1 = 緩衝區大小為每 Port。DP v1.4 更新。", v:{"00":"每 Lane", "01":"每 Port"}},
      {r:"4", n:"BUFFER_SIZE_UNIT_1", d:"0 = 單位為像素數。1 = 單位為位元組數。DP v1.4 更新。", v:{"00":"像素數", "01":"位元組數"}},
      {r:"3", n:"HBLANK_EXPANSION_CAPABLE_1", d:"0 = 不支援水平消隱擴展。1 = 支援水平消隱擴展。", v:{"00":"不支援", "01":"支援"}},
      {r:"2", n:"ASSOCIATED_TO_PRECEDING_PORT_1", d:"0 = 主同步串流。1 = 次要同步串流。", v:{"00":"主同步串流", "01":"次要同步串流"}},
      {r:"1", n:"LOCAL_EDID_PRESENT_1", d:"0 = 無本地 EDID。1 = 有本地 EDID。", v:{"00":"無 EDID", "01":"有 EDID"}}
    ]
  },
  "0220B": {
    n: "BUFFER_SIZE_1",
    c: "延伸接收端口 1 緩衝區大小",
    rw: 1,
    d: "接收端口 1 緩衝區大小 = (值+1) × 32 bytes/Lane，最大 8 KB/Lane。",
    b: []
  },
  "0220D": {
    n: "DPCD_0220D",
    c: "延伸 eDP 能力暫存器",
    rw: 1,
    d: "延伸接收端能力欄位中的 eDP 特殊能力暫存器。結構同 0000Dh。回報 ASSR 和 Display Control 支援狀態。",
    b: [
      {r:"3", n:"DPCD_DISPLAY_CONTROL_CAPABLE", d:"1 = DPCD 00700h-007FFh 的 Display Control 暫存器已啟用。", v:{"00":"未啟用", "01":"已啟用"}},
      {r:"1", n:"FRAMING_CHANGE_CAPABLE", d:"eDP 的 FRAMING_CHANGE 選項已棄用。DP 2.0/eDP v1.5 後保留。", v:{"00":"不支援", "01":"支援（已棄用）"}},
      {r:"0", n:"ALTERNATE_SCRAMBLER_RESET_CAPABLE", d:"1 = 此 eDP 裝置可使用 eDP 替代 scrambler 重置值 FFFEh（ASSR）。", v:{"00":"不支援 ASSR", "01":"支援 ASSR"}}
    ]
  },
  "0220E": {
    n: "DPCD_0220E",
    c: "延伸訓練間隔與延伸能力旗標",
    rw: 1,
    d: "延伸接收端能力欄位中的訓練間隔暫存器。結構同 0000Eh。bit 7 的 EXTENDED_RECEIVER_CAPABILITY_FIELD_PRESENT 非常重要。",
    b: [
      {r:"7", n:"EXTENDED_RECEIVER_CAPABILITY_FIELD_PRESENT", d:"0 = 不存在。1 = 延伸能力欄位存在於 DPCD 02200h-022FFh。DP v1.4 更新。", v:{"00":"不存在", "01":"存在"}},
      {r:"6:0", n:"TRAINING_AUX_RD_INTERVAL", d:"00h = CR 階段 100us / EQ 階段 400us。01h = 兩階段皆 4ms。02h = 8ms。03h = 12ms。04h = 16ms。DP v1.4 更新。"}
    ]
  },
  "0220F": {
    n: "DPCD_0220F",
    c: "延伸轉接器能力",
    rw: 1,
    d: "延伸接收端能力欄位中的轉接器能力暫存器。結構同 0000Fh。",
    b: [
      {r:"1", n:"ALTERNATE_I2C_PATTERN_CAP", d:"0 = 不支援替代 I2C pattern。1 = 支援。", v:{"00":"不支援", "01":"支援"}},
      {r:"5", n:"FORCE_LOAD_SENSE_CAP", d:"0 = 不支援 VGA 強制負載偵測。1 = 支援。", v:{"00":"不支援", "01":"支援"}}
    ]
  },
  "02214": {
    n: "DPCD_02214",
    c: "Adaptive Sync SDP 支援",
    rw: 1,
    d: "Adaptive Sync SDP（Secondary Data Packet）支援暫存器。eDP v1.5 新增。回報 Sink 是否支援 Adaptive Sync SDP。",
    b: [
      {r:"0", n:"ADAPTIVE_SYNC_SDP_SUPPORTED", d:"0 = 不支援。1 = 支援 Adaptive Sync SDP。eDP v1.5 新增。", v:{"00":"不支援", "01":"支援"}}
    ]
  },


  // ============================================================
  //  Vendor Specific (F0000h - FFFFFh)
  // ============================================================

  "F0000": {
    n: "VENDOR_SPECIFIC_FIELD_START",
    c: "廠商自定義空間起始位址",
    rw: 2,
    d: "此範圍（F0000h-FFFFFh）為晶片廠商（如 Raydium 瑞鼎）自定義的 DPCD 空間，用於 TCON 內部暫存器的讀寫。不同廠商定義不同，需參考各廠商的 datasheet。例如瑞鼎的 TCON 會在此空間映射內部暫存器，FAE 可透過 AUX 通道直接讀寫 TCON 的配置、狀態、除錯資訊等。此空間的定義完全由廠商決定，VESA 規範不做任何限制。",
    b: []
  }
}
);

// ─── DPCD_DB 英文描述補丁（e / de 欄位）───
(function() {
  var EN = {
    "00000": { e: "Indicates the DPCD revision supported by the Sink. Read this first to determine which DP features are available. Higher revision = more features. E.g. 0x14 = DPCD r1.4, supporting DSC/FEC/HDR." },
    "00001": { e: "Maximum per-lane link rate supported by the Sink. Key bandwidth register. Multiply by lane count × 0.8 (8b/10b efficiency) for actual throughput. E.g. 0x14 = HBR2 5.4 Gbps/lane." },
    "00002": { e: "Reports the Sink's maximum lane count and key feature flags (Enhanced Framing, TPS3). More lanes = higher bandwidth. eDP panels commonly use 1–2 lanes; external displays typically use 4 lanes." },
    "00003": { e: "Spread Spectrum Clock (SSC/Downspread) and advanced training mode capabilities. SSC dithers clock frequency ±0.5% to reduce EMI — nearly all eDP panels require it. Also reports TPS4 and no-AUX-handshake Link Training support." },
    "00004": { e: "Number of Receiver Ports (NORP) and DP_PWR supply capability. Most panels report 1 receiver port. DP_PWR info is useful for USB-C/DP adapter debugging." },
    "00005": { e: "Indicates whether the Sink has downstream ports (e.g. DP→HDMI adapters). Pure panels/monitors typically have no downstream ports. Important for MST hub and DP adapter debugging." },
    "00006": { e: "Supported main link channel coding schemes. Legacy DP 1.x uses 8b/10b (80% efficiency). DP 2.0 adds 128b/132b (~97% efficiency). Source and Sink must use the same coding." },
    "00007": { e: "Number of downstream ports and IEEE OUI/MSA timing support flags. Pure panels report 0 downstream ports. OUI registers at 00400h are valid only when IEEE_OUI_SUPPORT=1." },
    "00008": { e: "Receiver Port 0 base capabilities including local EDID presence and stream association. Most panels report local EDID present at 02200h." },
    "00009": { e: "Internal buffer size for Receiver Port 0, in units of (value+1) × 32 pixels. Larger buffer improves tolerance to clock skew and improves transmission stability." },
    "0000A": { e: "Receiver Port 1 base capabilities. Only meaningful when NORP reports 2 receiver ports. Single-screen panels can ignore this register." },
    "0000B": { e: "Receiver Port 1 buffer size. Same format as 00009h. Only valid for dual receiver port devices." },
    "0000C": { e: "Maximum I2C clock speed supported over the I2C-over-AUX channel. Used when reading EDID or controlling MCCS (DDC/CI). If EDID reads time out, try reducing I2C speed." },
    "0000D": { e: "eDP-specific register reporting ASSR (Alternate Scrambler Seed Reset) and Enhanced Framing Change capabilities. ASSR is mandatory for virtually all eDP panels — incorrect ASSR setting causes garbled display even after successful Link Training." },
    "0000E": { e: "Specifies the polling interval between sending a Training Pattern and reading Sink status during Link Training. Bit 7 (EXTENDED_RECEIVER_CAPABILITY_FIELD_PRESENT) is critical: if set, Source must read capabilities from 02200h rather than 00000h." },
    "0000F": { e: "Adapter capability register, only meaningful for Branch Devices (hubs, adapters). Pure panels return 0." },
    "00010": { e: "SUPPORTED_LINK_RATES entry 0 low byte. Combine with 00011h as little-endian 16-bit value; link rate = value x 200 kHz. Standard values include RBR=1FA4h, HBR=34BCh, HBR2=6978h, HBR3=9E34h.",
      b: [
        { de: "Entry 0 low byte. Combined with DPCD 00011h as little-endian 16-bit value; multiply by 200 kHz to get per-lane link rate." }
      ]
    },
    "00011": { e: "SUPPORTED_LINK_RATES entry 0 high byte. Combine with 00010h as little-endian 16-bit value; link rate = value x 200 kHz. 0000h marks this and higher entries invalid.",
      b: [
        { de: "Entry 0 high byte. Combined with DPCD 00010h as little-endian 16-bit value; multiply by 200 kHz to get per-lane link rate." }
      ]
    },
    "00012": { e: "SUPPORTED_LINK_RATES entry 1 low byte. Combine with 00013h as little-endian 16-bit value; link rate = value x 200 kHz. Standard values include RBR=1FA4h, HBR=34BCh, HBR2=6978h, HBR3=9E34h.",
      b: [
        { de: "Entry 1 low byte. Combined with DPCD 00013h as little-endian 16-bit value; multiply by 200 kHz to get per-lane link rate." }
      ]
    },
    "00013": { e: "SUPPORTED_LINK_RATES entry 1 high byte. Combine with 00012h as little-endian 16-bit value; link rate = value x 200 kHz. 0000h marks this and higher entries invalid.",
      b: [
        { de: "Entry 1 high byte. Combined with DPCD 00012h as little-endian 16-bit value; multiply by 200 kHz to get per-lane link rate." }
      ]
    },
    "00014": { e: "SUPPORTED_LINK_RATES entry 2 low byte. Combine with 00015h as little-endian 16-bit value; link rate = value x 200 kHz. Standard values include RBR=1FA4h, HBR=34BCh, HBR2=6978h, HBR3=9E34h.",
      b: [
        { de: "Entry 2 low byte. Combined with DPCD 00015h as little-endian 16-bit value; multiply by 200 kHz to get per-lane link rate." }
      ]
    },
    "00015": { e: "SUPPORTED_LINK_RATES entry 2 high byte. Combine with 00014h as little-endian 16-bit value; link rate = value x 200 kHz. 0000h marks this and higher entries invalid.",
      b: [
        { de: "Entry 2 high byte. Combined with DPCD 00014h as little-endian 16-bit value; multiply by 200 kHz to get per-lane link rate." }
      ]
    },
    "00016": { e: "SUPPORTED_LINK_RATES entry 3 low byte. Combine with 00017h as little-endian 16-bit value; link rate = value x 200 kHz. Standard values include RBR=1FA4h, HBR=34BCh, HBR2=6978h, HBR3=9E34h.",
      b: [
        { de: "Entry 3 low byte. Combined with DPCD 00017h as little-endian 16-bit value; multiply by 200 kHz to get per-lane link rate." }
      ]
    },
    "00017": { e: "SUPPORTED_LINK_RATES entry 3 high byte. Combine with 00016h as little-endian 16-bit value; link rate = value x 200 kHz. 0000h marks this and higher entries invalid.",
      b: [
        { de: "Entry 3 high byte. Combined with DPCD 00016h as little-endian 16-bit value; multiply by 200 kHz to get per-lane link rate." }
      ]
    },
    "00018": { e: "SUPPORTED_LINK_RATES entry 4 low byte. Combine with 00019h as little-endian 16-bit value; link rate = value x 200 kHz. Standard values include RBR=1FA4h, HBR=34BCh, HBR2=6978h, HBR3=9E34h.",
      b: [
        { de: "Entry 4 low byte. Combined with DPCD 00019h as little-endian 16-bit value; multiply by 200 kHz to get per-lane link rate." }
      ]
    },
    "00019": { e: "SUPPORTED_LINK_RATES entry 4 high byte. Combine with 00018h as little-endian 16-bit value; link rate = value x 200 kHz. 0000h marks this and higher entries invalid.",
      b: [
        { de: "Entry 4 high byte. Combined with DPCD 00018h as little-endian 16-bit value; multiply by 200 kHz to get per-lane link rate." }
      ]
    },
    "0001A": { e: "SUPPORTED_LINK_RATES entry 5 low byte. Combine with 0001Bh as little-endian 16-bit value; link rate = value x 200 kHz. Standard values include RBR=1FA4h, HBR=34BCh, HBR2=6978h, HBR3=9E34h.",
      b: [
        { de: "Entry 5 low byte. Combined with DPCD 0001Bh as little-endian 16-bit value; multiply by 200 kHz to get per-lane link rate." }
      ]
    },
    "0001B": { e: "SUPPORTED_LINK_RATES entry 5 high byte. Combine with 0001Ah as little-endian 16-bit value; link rate = value x 200 kHz. 0000h marks this and higher entries invalid.",
      b: [
        { de: "Entry 5 high byte. Combined with DPCD 0001Ah as little-endian 16-bit value; multiply by 200 kHz to get per-lane link rate." }
      ]
    },
    "0001C": { e: "SUPPORTED_LINK_RATES entry 6 low byte. Combine with 0001Dh as little-endian 16-bit value; link rate = value x 200 kHz. Standard values include RBR=1FA4h, HBR=34BCh, HBR2=6978h, HBR3=9E34h.",
      b: [
        { de: "Entry 6 low byte. Combined with DPCD 0001Dh as little-endian 16-bit value; multiply by 200 kHz to get per-lane link rate." }
      ]
    },
    "0001D": { e: "SUPPORTED_LINK_RATES entry 6 high byte. Combine with 0001Ch as little-endian 16-bit value; link rate = value x 200 kHz. 0000h marks this and higher entries invalid.",
      b: [
        { de: "Entry 6 high byte. Combined with DPCD 0001Ch as little-endian 16-bit value; multiply by 200 kHz to get per-lane link rate." }
      ]
    },
    "0001E": { e: "SUPPORTED_LINK_RATES entry 7 low byte. Combine with 0001Fh as little-endian 16-bit value; link rate = value x 200 kHz. Standard values include RBR=1FA4h, HBR=34BCh, HBR2=6978h, HBR3=9E34h.",
      b: [
        { de: "Entry 7 low byte. Combined with DPCD 0001Fh as little-endian 16-bit value; multiply by 200 kHz to get per-lane link rate." }
      ]
    },
    "0001F": { e: "SUPPORTED_LINK_RATES entry 7 high byte. Combine with 0001Eh as little-endian 16-bit value; link rate = value x 200 kHz. 0000h marks this and higher entries invalid.",
      b: [
        { de: "Entry 7 high byte. Combined with DPCD 0001Eh as little-endian 16-bit value; multiply by 200 kHz to get per-lane link rate." }
      ]
    },
    "00020": { e: "Fast AUX (FAUX) capability. FAUX uses main link side-channels for high-speed (720 Mbps) bidirectional communication. Very rarely supported in practice; most panels read 0x00 here." },
    "00021": { e: "Multi-Stream Transport (MST) capability. MST enables daisy-chaining or hub-splitting multiple independent displays over one DP cable. eDP panels typically do not support MST." },
    "00022": { e: "Number of audio output endpoints on the Sink. 0 = no audio (common for eDP); 1 = built-in speakers; 2+ = speakers + headphone jack, etc." },
    "00023": { e: "Reserved address (00023h–0002Fh). Not defined by DP specification." },
    "00024": { e: "Reserved address. Not defined by DP specification." },
    "00025": { e: "Reserved address. Not defined by DP specification." },
    "00026": { e: "Reserved address. Not defined by DP specification." },
    "00027": { e: "Reserved address. Not defined by DP specification." },
    "00028": { e: "Reserved address. Not defined by DP specification." },
    "00029": { e: "Reserved address. Not defined by DP specification." },
    "0002A": { e: "Reserved address. Not defined by DP specification." },
    "0002B": { e: "Reserved address. Not defined by DP specification." },
    "0002C": { e: "Reserved address. Not defined by DP specification." },
    "0002D": { e: "Reserved address. Not defined by DP specification." },
    "0002E": { e: "Receiver Advanced Link Power Management capability. Bit0 ALPM_CAP indicates whether the receiver supports ALPM.",
      b: [
        { de: "0 = ALPM not supported. 1 = ALPM supported." }
      ]
    },
    "0002F": { e: "AUX Frame Sync capability. Bit0 AUX_FRAME_SYNC_CAP indicates whether AUX_FRAME_SYNC is supported.",
      b: [
        { de: "0 = AUX Frame Sync not supported. 1 = AUX Frame Sync supported." }
      ]
    },
    "00030": { e: "Reserved address range (00030h–0005Fh). Not defined by DP specification. Some vendors may use this range for proprietary features, but it is non-standard." },
    "00060": { e: "DSC (Display Stream Compression) support. VESA visually-lossless compression standard added in DP 1.4. Enables high-resolution modes (e.g. 4K@120Hz HDR) on links without sufficient raw bandwidth. Required when peak bandwidth exceeds link capacity." },
    "00061": { e: "DSC compression algorithm revision. DSC 1.2 adds YCbCr 4:2:0/4:2:2 Native support for higher-resolution video. Source and Sink must use compatible DSC versions." },
    "00062": { e: "DSC Rate Control Buffer block size. Determines the base unit for RC buffer capacity calculations." },
    "00063": { e: "DSC RC Buffer total size = (value+1) × block size. Larger RC buffer improves compression stability and quality." },
    "00064": { e: "Supported number of horizontal DSC slices per frame. More slices = lower decode latency but higher panel hardware complexity. 4K panels commonly use 8–12 slices." },
    "00065": { e: "DSC decoder internal line buffer bit depth. Higher depth supports finer color precision (HDR 10-bit/12-bit) but requires more panel memory." },
    "00066": { e: "DSC Block Prediction support. Exploits inter-block correlation to improve compression efficiency at the same quality level. Enable whenever the Sink supports it." },
    "00067": { e: "Reserved address (00067h). Not defined by DP specification." },
    "00068": { e: "Reserved address (00068h). Not defined by DP specification." },
    "00069": { e: "DSC-supported color formats. Ensure the configured color format is supported by the Sink; a mismatch causes display corruption. RGB is the baseline; YCbCr formats reduce chroma bandwidth for video content." },
    "0006A": { e: "DSC-supported input color depths (bits-per-component). 8bpc = SDR standard, 10bpc = common for HDR, 12bpc = professional/high-end panels." },
    "0006B": { e: "Peak DSC decoder throughput in megapixels/second (Mode 0 and Mode 1). The target pixel clock for the desired resolution × frame rate must not exceed this limit when DSC is active." },
    "0006C": { e: "Maximum DSC slice width in pixels = register value × 320. Maximum supported horizontal resolution = max slice width × number of supported slices. Check this when DSC is enabled but the image is corrupted." },
    "0006D": { e: "Reserved address (0006Dh). Not defined by DP specification." },
    "0006E": { e: "Reserved address (0006Eh). Not defined by DP specification." },
    "0006F": { e: "Reserved address (0006Fh). Not defined by DP specification." },
    "00070": { e: "Panel Self-Refresh (PSR) version support. Core eDP power-saving feature: when the image is static, the Source stops transmitting and the panel refreshes from its own frame buffer. PSR2 (Selective Update) only refreshes changed regions for even greater power savings." },
    "00071": { e: "PSR advanced capability flags: setup time, Selective Update granularity requirements, and whether Link Training is needed on PSR exit. These details affect actual power savings and exit latency." },
    "00072": { e: "PSR2 Selective Update horizontal granularity high byte. Combined with 00073h as a 16-bit value indicating the minimum horizontal pixel unit for SU regions." },
    "00073": { e: "PSR2 Selective Update horizontal granularity low byte." },
    "00074": { e: "PSR2 Selective Update vertical granularity (minimum row count per SU region). 0 = no restriction." },
    "00075": { e: "Reserved address (00075h–0008Fh). Not defined by DP specification." },
    "00080": { e: "Detailed Downstream Port 0 capabilities. Only valid when 00005h bit3=1. Useful for DP→HDMI adapter debugging: identifies downstream port type (HDMI/VGA/DVI) and HPD detection capability." },
    "00081": { e: "Downstream Port 0 advanced capabilities, including maximum TMDS clock rate for HDMI/DVI output." },
    "00082": { e: "Downstream Port 0 capability byte 2. Definitions vary by port type and DPCD revision." },
    "00083": { e: "Downstream Port 0 capability byte 3. Additional capability bits." },
    "00084": { e: "Downstream Port 1 capability byte 0. Same structure as 00080h. Only meaningful with multiple downstream ports." },
    "00085": { e: "Downstream Port 1 capability byte 1. Advanced capabilities for Port 1." },
    "00086": { e: "Downstream Port 1 capability byte 2." },
    "00087": { e: "Downstream Port 1 capability byte 3." },
    "00088": { e: "Reserved address (00088h–0008Fh). Not defined by DP specification." },
    "00089": { e: "Reserved address. Not defined by DP specification." },
    "0008A": { e: "Reserved address. Not defined by DP specification." },
    "0008B": { e: "Reserved address. Not defined by DP specification." },
    "0008C": { e: "Reserved address. Not defined by DP specification." },
    "0008D": { e: "Reserved address. Not defined by DP specification." },
    "0008E": { e: "Reserved address. Not defined by DP specification." },
    "0008F": { e: "Reserved address. Not defined by DP specification." },
    "00090": { e: "FEC (Forward Error Correction) capability. DP 1.4 feature that adds redundant error-correction codes to automatically fix bit errors in transit. Mandatory when DSC is enabled (compressed data is extremely sensitive to errors). FEC consumes approximately 2.4% of link bandwidth as overhead." },
    "00091": { e: "Reserved address (00091h–000AFh). Not defined by DP specification." },
    "00092": { e: "Reserved address. Not defined by DP specification." },
    "000B0": { e: "Panel Replay capability. eDP 1.5 successor to PSR with lower exit latency. Unlike PSR, Panel Replay is primarily managed by the Sink side. Supports Selective Update for region-based refresh with maximum power savings." },
    "000B1": { e: "Reserved address (000B1h–000FFh). Reserved for future DPCD versions. Some addresses may be defined in DP 2.0 or later specifications." },
    "000B2": { e: "Selective Update horizontal granularity low byte. 0000h = no additional X granularity requirement, subject only to standard constraints (start X divisible by 16, rectangle width divisible by 4). Added in eDP v1.5." },
    "000B3": { e: "Selective Update horizontal granularity high byte. Combined with 000B2h to form a 16-bit value. Added in eDP v1.5." },
    "000B4": { e: "Selective Update vertical granularity. 00h/01h = 1 line, 02h = 2 lines, 04h = 4 lines, 08h = 8 lines, 10h = 16 lines. Added in eDP v1.5." },
    "00100": { e: "Set the per-lane Main Link data rate. Must be written before Link Training. Read back to confirm the negotiated rate. 0x00 = not configured or cleared." },
    "00101": { e: "Configure the number of active lanes and enable Enhanced Framing. Lane count × per-lane rate = total bandwidth. A mismatch between Source and Sink lane counts will always cause Link Training failure." },
    "00102": { e: "Core Link Training control register. Source sequences TPS1→TPS2 (or TPS3/TPS4) to complete Clock Recovery and Channel EQ. TPS1 failure = CR problem (insufficient drive voltage); TPS2/3 failure = EQ problem (poor signal quality or trace impedance)." },
    "00103": { e: "Lane 0 Voltage Swing (VS) and Pre-emphasis (PE) settings. Adjusted based on Sink's ADJUST_REQUEST feedback. MAX_SWING/MAX_PE flags indicate hardware limits reached. VS at Level 3 with persistent CR failure usually indicates excessive PCB trace length or impedance mismatch." },
    "00104": { e: "Lane 1 VS and PE settings. Same format as 00103h. Relevant for 2-lane or 4-lane configurations." },
    "00105": { e: "Lane 2 VS and PE settings. Same format as 00103h. Only used in 4-lane configurations." },
    "00106": { e: "Lane 3 VS and PE settings. Same format as 00103h. Only used in 4-lane configurations." },
    "00107": { e: "Spread Spectrum Clocking (SSC) and MSA Timing Ignore control. SSC reduces EMI by ±0.5% clock dithering. MSA_TIMING_PAR_IGNORE is commonly used by eDP panels that manage their own timing internally." },
    "00108": { e: "Set the main link channel coding. 8b/10b for DP 1.x; 128b/132b for DP 2.0 UHBR rates. Both Source and Sink must use the same coding — mismatch prevents link communication entirely." },
    "00109": { e: "I2C-over-AUX transaction speed control. Sets the I2C clock rate for EDID reads and MCCS commands. 100 kbps or 400 kbps are most common." },
    "0010A": { e: "Key eDP-specific configuration register. ASSR (Alternate Scrambler Seed Reset) must be enabled for eDP panels — using the wrong scrambler seed causes garbled display even after successful Link Training. Framing Change forces Enhanced Framing mode on the Sink side." },
    "0010B": { e: "Lane 0 link quality test pattern selection. Used for compliance testing or factory debug. Disabled (0x00) in normal operation." },
    "0010C": { e: "Lane 1 link quality test pattern selection. Same format as 0010Bh." },
    "0010D": { e: "Lane 2 link quality test pattern selection. Same format as 0010Bh. Only relevant in 4-lane configurations." },
    "0010E": { e: "Lane 3 link quality test pattern selection. Same format as 0010Bh. Only relevant in 4-lane configurations." },
    "0010F": { e: "Post Cursor2 (second-level pre-emphasis) for Lanes 0 and 1. Added in DP 1.2+ for HBR2/HBR3 where standard Pre-emphasis alone may be insufficient to compensate channel attenuation. Adjust if EQ training fails on TPS3." },
    "00110": { e: "Post Cursor2 for Lanes 2 and 3. Same format as 0010Fh. Only used in 4-lane configurations." },
    "00111": { e: "MST (Multi-Stream Transport) mode control. Enable for daisy-chain or hub multi-display configurations. eDP panels always keep this in SST mode (disabled)." },
    "00115": { e: "eDP 1.3+ Link Rate Table index. Alternative to LINK_BW_SET (00100h) for non-standard link rates (e.g. 2.16 Gbps, 3.24 Gbps) provided by the Sink in a custom rate table at 00010h–0001Fh." },
    "00116": { e: "ALPM (Active Link Power Management) configuration. eDP power-saving during blanking periods by putting the link into low-power state. Panel flickering or excessive wake latency may be related to ALPM settings." },
    "00120": { e: "Forward Error Correction (FEC) configuration register. Added in DP v1.4. Controls FEC enable, error count selection, lane selection, etc. FEC must be enabled when DSC compression is active.",
      b: [
        { de: "0 = Pre-coding enabled (default). 1 = Pre-coding disabled. Added in DP v1.4." },
        { de: "0 = Not enabled; LANE_DEC_SELECT field (bits 5:4) specifies the lane to report. 1 = Enabled; FEC_ERROR_COUNT register (DPCD 00281h/00282h) reports the error type selected by FEC_ERROR_COUNT_SEL (bits 3:1), aggregated across all enabled lanes." },
        { de: "00 = Lane 0. 01 = Lane 1. 10 = Lane 2. 11 = Lane 3. Added in DP v1.4." },
        { de: "000 = FEC_ERROR_COUNT_DIS (disabled). 001 = Uncorrected block error count. 010 = Corrected block error count. 011 = Bit error count. Added in DP v1.4." },
        { de: "0 = Not ready. Source must set this bit to 1 and initiate Link Training before FEC encoding can begin. 1 = Ready. Source can start FEC encoding without re-running Link Training. Added in DP v1.4." }
      ]
    },
    "00160": { e: "Enable/disable DSC (Display Stream Compression) decompression in the Sink. When enabled, Source transmits DSC-compressed data and the Sink's internal decoder reconstructs the original image." },
    "00170": { e: "PSR enable and mode configuration. PSR1 = full-frame refresh from Sink frame buffer when image is static. PSR2 = Selective Update (only changed regions). Common issues: ghosting, stuck frames, or flickering when entering/exiting PSR." },
    "001B0": { e: "Panel Replay enable and mode configuration. eDP 1.5+ successor to PSR, primarily managed by the Sink for lower exit latency. Selective Update mode refreshes only changed regions for maximum power savings." },
    "00200": { e: "Reports the number of currently connected Sink devices. SST mode = 1. MST mode may report multiple Sinks. Value 0 = no Sink detected or HPD not yet triggered. CP_READY flag indicates HDCP readiness." },
    "00201": { e: "Device service interrupt vector. Read after receiving an HPD IRQ (short pulse) to identify the interrupt source. Each bit represents a different event type. Write 1 to clear. Debug flow: HPD IRQ → read 00201h → check bits → handle events." },
    "00202": { e: "Link Training status for Lanes 0 and 1. Three flags per lane: CR_DONE (Clock Recovery), CHANNEL_EQ_DONE (equalization), SYMBOL_LOCKED (symbol boundary). Critical debug register: CR_DONE=0 means Phase 1 failed; CR=1 but EQ=0 means signal quality is insufficient." },
    "00203": { e: "Link Training status for Lanes 2 and 3. Same format as 00202h. Only meaningful in 4-lane configurations." },
    "00204": { e: "Inter-lane alignment status and state-update flags. INTERLANE_ALIGN_DONE must be 1 for Link Training to truly complete. If all CR/EQ done but screen is blank, check this bit first." },
    "00205": { e: "Receiver Port synchronization status. RECEIVE_PORT_0_STATUS=1 confirms the Sink is actively receiving a valid video stream on Port 0." },
    "00206": { e: "Sink's ADJUST_REQUEST for Lanes 0 and 1. During Link Training, the Sink requests specific VS/PE levels. Source reads these values and writes them to 00103h/00104h. Comparing this register (Sink request) vs. 00103h (Source setting) helps diagnose training loops." },
    "00207": { e: "Sink's ADJUST_REQUEST for Lanes 2 and 3. Same format as 00206h. Only meaningful in 4-lane configurations." },
    "00210": { e: "Lane 0 Symbol Error counter low byte. Combined with 00211h to form a 15-bit error counter. Should be 0 or near 0 during normal operation. Continuous accumulation indicates signal integrity problems: excessive trace length, impedance mismatch, or EMI." },
    "00211": { e: "Lane 0 Symbol Error counter high byte. Bit 7 = overflow flag (counter exceeded 32767). Full value = [6:0] << 8 | low byte." },
    "00212": { e: "Lane 1 Symbol Error counter low byte. Same format as 00210h." },
    "00213": { e: "Lane 1 Symbol Error counter high byte. Same format as 00211h." },
    "00214": { e: "Lane 2 Symbol Error counter low byte. Valid only in 4-lane configurations." },
    "00215": { e: "Lane 2 Symbol Error counter high byte." },
    "00216": { e: "Lane 3 Symbol Error counter low byte. Valid only in 4-lane configurations." },
    "00217": { e: "Lane 3 Symbol Error counter high byte." },
    "00218": { e: "Automated test request type. Read when DEVICE_SERVICE_IRQ_VECTOR bit1 is set. Part of the DP Compliance Test (CTS) mechanism. Source must identify the test type and respond appropriately." },
    "00219": { e: "Link rate for automated testing. Valid when TEST_REQUEST bit0=1. Source must perform Link Training at this specified rate. Same encoding as LINK_BW_SET (00100h)." },
    "00220": { e: "Lane count for automated testing. Valid when TEST_REQUEST bit0=1. Source must use this lane count during the compliance test." },
    "00260": { e: "Source's response to the automated test request. Write TEST_ACK=1 to confirm the request was handled. Write TEST_NACK=1 if the test type is not supported. Writing this register also clears the AUTOMATED_TEST_REQUEST interrupt flag in 00201h." },
    "00270": { e: "Sink-side test control. TEST_SINK_START=1 activates CRC calculation on received pixel data. Used in Compliance Testing to verify image data integrity end-to-end." },
    "00280": { e: "Forward Error Correction status register. Added in DP v1.4. Reports whether FEC is running and whether FEC decode enable/disable events have been detected.",
      b: [
        { de: "0 = FEC not running. 1 = FEC is running. Added in DP v1.4." },
        { de: "0 = FEC decode disable not detected. 1 = FEC decode disable event detected. Added in DP v1.4." },
        { de: "0 = FEC decode enable not detected. 1 = FEC decode enable event detected. Added in DP v1.4." }
      ]
    },
    "002C0": { e: "MST Payload Table update handshake. Source writes PAYLOAD_TABLE_UPDATED=1 to notify the Sink to apply a new bandwidth allocation. Sink sets PAYLOAD_ACT_HANDLED=1 when the update is processed. Check this register if MST Payload allocation stalls." },
    "00300": { e: "Source device IEEE OUI (Organizationally Unique Identifier) byte 0 (LSB). Three bytes 00300h–00302h form the 24-bit OUI identifying the Source manufacturer (e.g. Intel: 00-1B-21, NVIDIA: 00-04-4B)." },
    "00301": { e: "Source device IEEE OUI byte 1 (middle byte). Combined with 00300h and 00302h for the full 24-bit OUI." },
    "00302": { e: "Source device IEEE OUI byte 2 (MSB). Three bytes [00302h:00301h:00300h] form the complete OUI." },
    "00303": { e: "Source device identification string byte 0. Six ASCII bytes 00303h–00308h form the device model name/code string." },
    "00304": { e: "Source device identification string byte 1 (ASCII)." },
    "00305": { e: "Source device identification string byte 2 (ASCII)." },
    "00306": { e: "Source device identification string byte 3 (ASCII)." },
    "00307": { e: "Source device identification string byte 4 (ASCII)." },
    "00308": { e: "Source device identification string byte 5 (ASCII). Combined bytes 0–5 form the complete device ID string." },
    "00309": { e: "Source device hardware revision. 8-bit manufacturer-defined value (e.g. PCB revision)." },
    "0030A": { e: "Source firmware major version. Combined with 0030Bh for the full version string (e.g. Major=01h, Minor=05h = firmware v1.5). Confirming firmware version is critical when debugging link behavior differences." },
    "0030B": { e: "Source firmware minor version. Combined with 0030Ah for the complete firmware version." },
    "00310": { e: "Intel Adaptive Sync maximum VBlank reduction (in lines), least significant byte. Combined with 00311h-00313h to form a 32-bit value. Adaptive Sync allows the panel to dynamically adjust refresh rate to match content frame rate, reducing tearing and stutter." },
    "00311": { e: "Intel Adaptive Sync maximum VBlank reduction, byte 1." },
    "00312": { e: "Intel Adaptive Sync maximum VBlank reduction, byte 2." },
    "00313": { e: "Intel Adaptive Sync maximum VBlank reduction, most significant byte." },
    "00314": { e: "Intel custom DPCD register reporting PSR VTotal control, Low Refresh Rate switching (LRR), UBRR, and other advanced power-saving feature support.",
      b: [
        { de: "0 = Not supported. 1 = Intel ALRR (Autonomous Low Refresh Rate) supported." },
        { de: "1 = UBRR-LR supported. 0 = Not supported." },
        { de: "1 = UBRR-ZR supported. 0 = Not supported." },
        { de: "0 = VTotal change on PSR entry/exit not supported. 1 = Supported." },
        { de: "0 = Panel internal low refresh rate switching not supported. 1 = Low refresh rate switching during PSR idle supported." },
        { de: "0 = Pixel clock based refresh rate change not supported. 1 = Supported." }
      ]
    },
    "00316": { e: "Intel custom DPCD register controlling Intel LRR (Low Refresh Rate) feature enable state.",
      b: [
        { de: "0 = Intel LRR not enabled. 1 = Intel LRR enabled." }
      ]
    },
    "00317": { e: "eDP Sink device backlight and display capability register. Declares backlight adjustment method (PWM/AUX), gradual ramping, DisplayHDR, OLED, DSC passthrough, and miniLED support.",
      b: [
        { de: "SDR mode backlight adjustment method: 0=PWM, 1=AUX." },
        { de: "HDR mode backlight adjustment method: 0=PWM, 1=AUX." },
        { de: "Gradual backlight ramping support: 0=not supported, 1=supported." },
        { de: "DisplayHDR and tunnel test pattern auto-dimming: 0=not supported, 1=supported." },
        { de: "OLED display technology: 0=not OLED, 1=OLED." },
        { de: "DSC passthrough for PSR/PSR-SU: 0=not supported, 1=supported and enabled." },
        { de: "miniLED display technology: 0=not miniLED, 1=miniLED." },
        { de: "Reserved bit." }
      ]
    },
    "00320": { e: "Custom DPCD register for MBO (Multi Beam Operation) applications." },
    "00330": { e: "ALPM (Advanced Link Power Management) Sink device power management state register. Reports the current power state: 0=unknown, 1=ACTIVE, 2=ACTIVE_NOSTREAM, 3=ALPM_STANDBY, etc." },
    "00340": { e: "Intel HDR capability register (group 0), reserved for future expansion." },
    "00341": { e: "Intel custom DPCD register reporting TCON HDR capabilities: PQ 2084 decode, BT.2020 gamut, panel tone mapping, segmented backlight, nits brightness control, brightness optimization, colorimetry/metadata SDP, sRGB-to-panel gamut conversion.",
      b: [
        { de: "PQ (SMPTE 2084) decode support: 0=not supported, 1=supported." },
        { de: "BT.2020 gamut support: 0=not supported, 1=supported." },
        { de: "Panel tone mapping support: 0=not supported, 1=supported." },
        { de: "Segmented backlight capability (N/A for OLED): 0=not supported, 1=supported." },
        { de: "Nits-level brightness control via AUX: 0=not supported, 1=supported." },
        { de: "Brightness optimization support: 0=not supported, 1=supported." },
        { de: "SDP for colorimetry/metadata support: 0=not supported, 1=supported." },
        { de: "sRGB to panel gamut mapping (for wide gamut panels with SDR desktop): 0=not supported, 1=supported." }
      ]
    },
    "00342": { e: "TCON capability register. Bit 0 indicates whether TCON accepts AUX-based brightness control in both SDR and HDR modes.",
      b: [
        { de: "TCON accepts AUX for brightness control in both SDR and HDR mode: 0=no, 1=yes." },
        { de: "Reserved, read all 0s." }
      ]
    },
    "00343": { e: "Intel HDR capability register (group 3), reserved for future expansion." },
    "00344": { e: "Intel custom supplemental DPCD definition with HDR 2084/2020, segmented backlight control, nits brightness control, panel tone mapping, colorimetry SDP, and sRGB gamut mapping control bits.",
      b: [
        { de: "HDR PQ 2084 control bit, corresponds to 341h[0]." },
        { de: "BT.2020 gamut control bit, corresponds to 341h[1]." },
        { de: "Panel tone mapping control bit, corresponds to 341h[2]." },
        { de: "Segmented backlight control bit, toggles regional backlight on/off." },
        { de: "Nits brightness control bit; actual brightness value written to 354-356h (cd/m²)." },
        { de: "sRGB to panel gamut mapping control bit, corresponds to 341h[7]." },
        { de: "Colorimetry/metadata SDP control bit, corresponds to 341h[6]." }
      ]
    },
    "00346": { e: "Content luminance value (Intel custom), 346-349h total 4 bytes." },
    "00347": { e: "Content luminance value. Intel custom DPCD mapping from Intel HDR/backlight reference. Addresses 346h-349h combine into 4-byte content luminance information for HDR backlight control." },
    "00348": { e: "Content luminance value (Intel custom), byte 2 of 346h-349h." },
    "00349": { e: "Content luminance value (Intel custom), byte 3 of 346h-349h." },
    "0034A": { e: "Panel EDID luminance override value. Intel custom DPCD mapping, addresses 34Ah-351h total 8 bytes. Allows the Source to override panel EDID luminance parameters." },
    "0034B": { e: "Panel EDID luminance override value (byte 1). Intel custom DPCD mapping, 34Ah-351h." },
    "0034C": { e: "Panel EDID luminance override value (byte 2). Intel custom DPCD mapping, 34Ah-351h." },
    "0034D": { e: "Panel EDID luminance override value (byte 3). Intel custom DPCD mapping, 34Ah-351h." },
    "0034E": { e: "Panel EDID luminance override value (byte 4). Intel custom DPCD mapping, 34Ah-351h." },
    "0034F": { e: "Panel EDID luminance override value (byte 5). Intel custom DPCD mapping, 34Ah-351h." },
    "00350": { e: "Panel EDID luminance override value (byte 6). Intel custom DPCD mapping, 34Ah-351h." },
    "00351": { e: "Panel EDID luminance override value (byte 7). Intel custom DPCD mapping, 34Ah-351h." },
    "00352": { e: "SDR luminance level value. Intel custom DPCD mapping, addresses 352h-353h total 2 bytes. Defines the luminance level for SDR content." },
    "00353": { e: "SDR luminance level value (high byte). Intel custom DPCD mapping, 352h-353h." },
    "00354": { e: "Nits brightness control value. Intel custom DPCD mapping, addresses 354h-356h total 3 bytes, unit: cd/m²." },
    "00355": { e: "Nits brightness control value (byte 1). Intel custom DPCD mapping." },
    "00356": { e: "Smooth brightness control. Intel custom DPCD mapping; 356h = frame count, 357h = per-frame step value." },
    "00357": { e: "Smooth brightness control. Intel custom DPCD mapping; 356h = frame count, 357h = per-frame step value. Used for gradual brightness transition effects." },
    "00358": { e: "Brightness optimization control register. Intel custom DPCD mapping, controls brightness optimization mode and system usage state.",
      b: [
        { de: "Brightness optimization control. Intel custom DPCD mapping 358[7:5]." },
        { de: "Brightness optimization system usage state. Intel custom DPCD mapping 358[3:0]." },
        { de: "Brightness optimization AC/DC state. Intel custom DPCD mapping 358[4]." }
      ]
    },
    "00370": { e: "AMD custom DPCD register reporting whether the Sink supports VTotal control during PSR active state.",
      b: [
        { de: "0 = Sink does not support VTotal control during PSR active state. 1 = Supported." }
      ]
    },
    "00373": { e: "Sink reports a 2-byte VTotal value indicating the VTotal (vertical total lines) currently used for the output frame." },
    "00374": { e: "High byte. Combined with 00373h to form a 16-bit value." },
    "00378": { e: "PSR supplemental DPCD register.",
      b: [
        { de: "00 = Sink device frame-locked to Source. 01 = Maintaining coasting VTotal. 10 = Using low refresh rate. 11 = Reserved." },
        { de: "000 = Live mode. 001 = Live + Capture. 010 = Replay mode. 011 = Replay + Capture. 100 = Reserved." },
        { de: "0 = Timing desync error not detected. 1 = Detected." }
      ]
    },
    "00379": { e: "Sink reports the maximum pixel deviation per line during the maximum link off time." },
    "0037A": { e: "Sink reports the maximum number of deviation lines that can maintain display quality during Replay." },
    "0037B": { e: "Supplemental DPCD register." },
    "003F0": { e: "PSR2 Early Scanline SDP support register. 0=PSR2 Early Scanline not supported, 1=supported." },
    "00400": { e: "Sink device IEEE OUI byte 0 (LSB). Three bytes 00400h–00402h identify the Sink (TCON) manufacturer. The fastest way to confirm which TCON vendor is on the panel side." },
    "00401": { e: "Sink device IEEE OUI byte 1 (middle byte)." },
    "00402": { e: "Sink device IEEE OUI byte 2 (MSB). Combined [00402h:00401h:00400h] = complete 24-bit OUI. Look up on IEEE registry to identify the manufacturer." },
    "00403": { e: "Sink device identification string byte 0. Six ASCII bytes 00403h–00408h typically reflect the TCON model number." },
    "00404": { e: "Sink device identification string byte 1 (ASCII)." },
    "00405": { e: "Sink device identification string byte 2 (ASCII)." },
    "00406": { e: "Sink device identification string byte 3 (ASCII)." },
    "00407": { e: "Sink device identification string byte 4 (ASCII)." },
    "00408": { e: "Sink device identification string byte 5 (ASCII)." },
    "00409": { e: "Sink device hardware revision. 8-bit TCON-defined value reflecting die or board revision." },
    "0040A": { e: "Sink firmware major version. First step in field debugging is confirming the Sink firmware version to ensure the correct firmware is running." },
    "0040B": { e: "Sink firmware minor version. Combined with 0040Ah (e.g. 02h:0Ah = firmware v2.10)." },
    "0040F": { e: "AMD-specific TCON setting register. Used for AMD platform-specific TCON configuration." },
    "00410": { e: "AMD AUPI (Advanced Unified Panel Interface) panel manufacturer ID, low byte." },
    "00411": { e: "AMD AUPI panel manufacturer ID, high byte." },
    "00412": { e: "AMD AUPI panel product ID, low byte." },
    "00413": { e: "AMD AUPI panel product ID, high byte." },
    "00414": { e: "AMD AUPI TCON firmware checksum, low byte." },
    "00415": { e: "AMD AUPI TCON firmware checksum, high byte." },
    "00416": { e: "AMD AUPI TCON firmware device ID, low byte." },
    "00417": { e: "AMD AUPI TCON firmware device ID, high byte." },
    "00500": { e: "Branch device IEEE OUI byte 0 (LSB). Three bytes 00500h–00502h identify the Branch device (hub, adapter) manufacturer." },
    "00501": { e: "Branch device IEEE OUI byte 1 (middle byte)." },
    "00502": { e: "Branch device IEEE OUI byte 2 (MSB). Combined [00502h:00501h:00500h] = complete OUI." },
    "00503": { e: "Branch device identification string byte 0. Six ASCII bytes 00503h–00508h form the Branch device model string." },
    "00504": { e: "Branch device identification string byte 1 (ASCII)." },
    "00505": { e: "Branch device identification string byte 2 (ASCII)." },
    "00506": { e: "Branch device identification string byte 3 (ASCII)." },
    "00507": { e: "Branch device identification string byte 4 (ASCII)." },
    "00508": { e: "Branch device identification string byte 5 (ASCII)." },
    "00509": { e: "Branch device hardware revision. 8-bit manufacturer-defined value." },
    "0050A": { e: "Branch firmware major version. Hub-class products usually have updatable firmware." },
    "0050B": { e: "Branch firmware minor version. Combined with 0050Ah for the complete version." },
    "00600": { e: "CRITICAL — Power state control. Source writes to bring Sink into or out of power-saving mode. Must write D0 (0x01) before Link Training. Blank screen or failed wake-up: check this register first. AUX channel remains responsive in D3 (sleep) mode.",
      b: [
        { de: "Power state setting: 0x01=D0 normal operation (full functions); 0x02=D3 sleep mode (Link disabled, AUX still responds); 0x05=D3 with AUX also disabled (DP 1.5+). Source MUST write 0x01 before starting Link Training." },
        { de: "DP 5V supply request (DP 1.2+). 1=request Source to maintain DP_PWR 5V during low-power state. Some Sinks need 5V to keep AUX circuitry alive in sleep mode." }
      ]
    },
    "00700": { e: "eDP-specific DPCD revision. Only meaningful for eDP panels (external DP monitors return 0x00). Versions: 01h=eDP1.1, 02h=eDP1.2, 03h=eDP1.3, 04h=eDP1.4, 05h=eDP1.4b, 06h=eDP1.5. Always read this first when debugging eDP panels to confirm feature availability." },
    "00701": { e: "eDP general capability register 1. Each bit declares whether a specific eDP feature is supported: TCON backlight via AUX, Panel Self-Test, Dynamic/Regional Backlight (local dimming), Overdrive, etc.",
      b: [
        { de: "1=TCON supports AUX-based backlight brightness adjustment. 0=backlight requires hardware PWM only, not controllable via DPCD." },
        { de: "1=backlight on/off controllable via AUX channel. Used together with 00720h bit0 (BACKLIGHT_ENABLE)." },
        { de: "1=panel luminance control supported (eDP 1.4+)." },
        { de: "1=Panel Self-Test (PST) supported — panel can generate internal test patterns (gray scale, color bars) without Source input. Useful for factory testing." },
        { de: "1=Dynamic/Regional backlight control (local dimming) supported. Required capability for HDR panels with zone dimming." },
        { de: "1=eDP Overdrive Engine controllable via AUX to accelerate LCD response time and reduce motion blur." },
        { de: "1=Active Frame Lock during panel idle state supported (eDP 1.5+) for controlled refresh rate in power-saving scenarios." }
      ]
    },
    "00702": { e: "eDP backlight adjustment capability details. Only valid when 00701h bit0=1. Covers brightness byte count, AUX brightness control, PWM frequency adjustment, and enable/disable capability.",
      b: [
        { de: "Backlight brightness data byte count: 0b00=1 byte (8-bit, 256 levels); 0b01=2 bytes (16-bit, 65536 levels); 0b10=3 bytes (24-bit). Most panels use 2 bytes for finer brightness control." },
        { de: "1=AUX channel backlight brightness value setting supported. This is the core capability for DPCD software backlight control." },
        { de: "1=PWM frequency settable via AUX. Allows anti-flicker frequency adjustment to eliminate display flicker at certain brightness levels." },
        { de: "1=backlight enable controllable via AUX." },
        { de: "1=backlight disable controllable via AUX." },
        { de: "1=dynamic backlight level control supported (for regional/local dimming)." },
        { de: "1=regional backlight control (local dimming) supported — zone-based independent backlight management." }
      ]
    },
    "00703": { e: "eDP general capability register 2. Additional advanced eDP feature support: backlight frequency mode, regional backlight version, PSR2 extension, Adaptive Sync (VRR).",
      b: [
        { de: "Panel luminance control granularity: 0=coarse; 1=fine." },
        { de: "Backlight PWM frequency control mode: 0=fixed frequency; 1=variable (adjustable) frequency." },
        { de: "1=minimum dynamic backlight threshold value is settable." },
        { de: "Regional backlight control version: 0=v1; 1=v2 (finer zone control)." },
        { de: "PSR2 capability extension (eDP 1.4+). 1=PSR2 Selective Update supported." },
        { de: "1=Adaptive Sync (variable refresh rate) supported — eDP equivalent of VRR/FreeSync." }
      ]
    },
    "00704": { e: "eDP backlight region control capability register. Defines the number of independently controllable 1D backlight regions supported by the panel.",
      b: [
        { de: "Number of controllable 1D backlight regions in the vertical direction." },
        { de: "Number of controllable 1D backlight regions in the horizontal direction." }
      ]
    },
    "00705": { e: "Segmented backlight capability register. VESA DPCD mapping.",
      b: [
        { de: "Segmented backlight capability. VESA DPCD mapping." }
      ]
    },
    "00720": { e: "eDP display control register for real-time backlight and display mode control. BACKLIGHT_ENABLE must be set to 1 after Link Training for the screen to be visible. If Link Training succeeds but screen is black, check this register first.",
      b: [
        { de: "Backlight enable switch. 1=backlight ON; 0=backlight OFF. Must be written to 1 after Link Training succeeds and video transmission begins. If Link Training is OK but screen is black, check this bit first." },
        { de: "Black Frame Insertion. 1=insert black frames (backlight may remain on); 0=normal display. Used for BFI technology or transient blanking during display mode transitions." },
        { de: "Panel Self-Test enable. 1=panel generates internal test pattern; 0=display Source video input. Use during debugging to verify panel operation independent of Source." },
        { de: "LCD Overdrive enable. 1=enable liquid crystal overdrive to reduce response-time smearing; 0=disabled." },
        { de: "Dynamic backlight (local dimming) enable. 1=enable zone-based dynamic backlight control; 0=use static uniform backlight." }
      ]
    },
    "00721": { e: "eDP backlight control mode selection. Determines whether brightness is managed by panel firmware, AUX/DPCD, or external PWM signal. Most laptops use AUX control (mode 01) for OS-level brightness adjustment.",
      b: [
        { de: "Backlight control mode: 0b00=panel firmware autonomously controls brightness; 0b01=AUX/DPCD control (most common for laptop OS brightness); 0b10=external PWM hardware signal; 0b11=reserved." },
        { de: "Ambient light sensor enable. 1=activate built-in ambient light sensor for automatic brightness adjustment." },
        { de: "PWM frequency preset selection. Used in conjunction with 00702h bit3." },
        { de: "Dynamic backlight fine control mode selection." },
        { de: "Regional (zone) backlight enable. 1=enable zone-based independent backlight control." }
      ]
    },
    "00722": { e: "eDP backlight brightness low byte (LSB). Combined with 00723h for the full brightness value. In 2-byte mode: 0x0000=minimum brightness, 0xFFFF=maximum brightness. Write to this register to test AUX backlight control functionality." },
    "00723": { e: "eDP backlight brightness high byte (MSB). Combined with 00722h for the full 16-bit value. E.g. 50% brightness: write 00722h=0x00, 00723h=0x80. Ensure backlight control mode (00721h) is set to AUX before writing." },
    "00724": { e: "Number of effective bits used by the Source for backlight brightness control in DPCD 00722h/00723h.",
      b: [
        { de: "Number of effective control bits used by the Source for DPCD 00722h and 00723h." }
      ]
    },
    "00725": { e: "Minimum PWM bit count set by the Sink.",
      b: [
        { de: "Minimum PWM bit count set by the Sink; must be >= 1." }
      ]
    },
    "00726": { e: "Maximum PWM bit count set by the Sink.",
      b: [
        { de: "Maximum PWM bit count set by the Sink; must be >= DPCD 00725h value." }
      ]
    },
    "00727": { e: "eDP backlight control status register.",
      b: [
        { de: "0 = Normal operation. 1 = Backlight fault." },
        { de: "Smooth brightness control status." }
      ]
    },
    "00728": { e: "Display backlight PWM frequency control value." },
    "0072A": { e: "eDP backlight PWM minimum frequency, high byte (bits 17:10). Combined with 0072Bh and 0072Ch to form an 18-bit value." },
    "0072B": { e: "eDP backlight PWM minimum frequency, middle byte (bits 9:2)." },
    "0072C": { e: "eDP backlight PWM minimum frequency, low 2 bits.",
      b: [
        { de: "eDP backlight PWM minimum frequency, low 2 bits." }
      ]
    },
    "0072D": { e: "eDP backlight PWM maximum frequency, high byte (bits 17:10)." },
    "0072E": { e: "eDP backlight PWM maximum frequency, middle byte (bits 9:2)." },
    "0072F": { e: "eDP backlight PWM maximum frequency, low 2 bits.",
      b: [
        { de: "eDP backlight PWM maximum frequency, low 2 bits." }
      ]
    },
    "00730": { e: "Brightness optimization control and smooth brightness control register. VESA DPCD mapping.",
      b: [
        { de: "Brightness optimization control." },
        { de: "Smooth brightness control enable." }
      ]
    },
    "00731": { e: "Segmented backlight control register. VESA DPCD mapping.",
      b: [
        { de: "Segmented backlight control. VESA DPCD mapping; 720[6] must be 1 for this to be effective." }
      ]
    },
    "00734": { e: "Nits brightness control value (VESA), byte 0 of 734h-736h, unit: cd/m²." },
    "00735": { e: "Nits brightness control value (VESA), byte 1 of 734h-736h, unit: cd/m²." },
    "00736": { e: "Nits brightness control value (VESA), byte 2 of 734h-736h, unit: cd/m²." },
    "00737": { e: "Smooth brightness control (VESA), transition time in milliseconds. Used with 730[0] enable, 739h-73Bh real-time value, and 727[2] status." },
    "00738": { e: "Smooth brightness control (VESA), transition time high byte in milliseconds." },
    "00739": { e: "Smooth brightness control real-time value (VESA), byte 0 of 739h-73Bh." },
    "0073A": { e: "Smooth brightness control real-time value (VESA), byte 1 of 739h-73Bh." },
    "0073B": { e: "Smooth brightness control real-time value (VESA), byte 2 of 739h-73Bh." },
    "00DEF": { e: "HDR PQ (SMPTE ST 2084) and BT.2020 gamut capability register. VESA DPCD mapping." },
    "00FEA": { e: "HDR PQ (SMPTE ST 2084) and BT.2020 gamut capability register. VESA DPCD mapping (alternate address)." },
    "02002": { e: "Sink count in ESI (Event Status Indicator) area. Mirrors 00200h but supports auto-clear-on-read. DP 1.2+ recommends using ESI registers for status polling.",
      b: [
        { de: "Current number of connected Sink devices (0–63). SST mode = 1; MST mode may be >1; 0 = no Sink connected." },
        { de: "Content Protection ready. 1=HDCP authentication is prepared and R0' can be read." },
        { de: "Reserved bit." }
      ]
    },
    "02003": { e: "Device service IRQ vector in ESI area. Mirrors 00201h. Read after HPD IRQ to identify interrupt source. Auto-clears on read in ESI mode.",
      b: [
        { de: "1=remote control command pending (used in CEC-over-DP scenarios)." },
        { de: "1=Sink requests automated compliance testing. Source must read 00218h (TEST_REQUEST) and respond appropriately." },
        { de: "1=content protection (HDCP) event, e.g. authentication failure or re-authentication needed." },
        { de: "1=MCCS (Monitor Control Command Set) interrupt for DDC/CI control scenarios." },
        { de: "1=MST downstream reply message ready for Source to read (Sideband MSG response)." },
        { de: "1=MST upstream request message ready for Source to process." },
        { de: "1=Sink-specific interrupt (vendor-defined event)." },
        { de: "Reserved bit." }
      ]
    },
    "02005": { e: "Link service IRQ vector in ESI area. Notifies Source of link-layer state changes: capability change, link status change, stream status change, HDMI link change.",
      b: [
        { de: "1=Sink receiver capabilities changed (e.g. EDID change after hot-plug, firmware update). Source should re-read the DPCD capability area." },
        { de: "1=link status changed (lane lock failure, CR/EQ failed). Source should read 0200Ch–0200Dh and re-run Link Training if necessary." },
        { de: "1=MST stream status changed (a stream's state was modified)." },
        { de: "1=HDMI link status changed (for DP-to-HDMI Branch devices)." },
        { de: "1=Sink requests entry into Connected-OFF (deep power-saving) state." }
      ]
    },
    "02006": { e: "PSR error status. Records errors that occurred during Panel Self-Refresh operation. Read when debugging PSR issues such as corrupted frame buffer data or VSC packet errors.",
      b: [
        { de: "1=Link CRC error detected during PSR. Data error when panel refreshes from its frame buffer — may indicate TCON memory problem." },
        { de: "1=Remote Frame Buffer storage error. Frame buffer write failure or data corruption in TCON. Indicates a hardware fault." },
        { de: "1=uncorrectable error in VSC (Video Stream Configuration) SDP packet used for PSR entry/exit signaling. Corrupted VSC SDP causes PSR state machine malfunction." }
      ]
    },
    "02007": { e: "PSR event status. Records PSR state machine transitions. Read after a PSR-related IRQ to determine what changed.",
      b: [
        { de: "1=PSR capability changed (rare condition — Sink PSR support declaration changed)." },
        { de: "1=PSR state machine transitioned. Read 02008h for the current state." },
        { de: "1=Sink self-triggered a PSR frame buffer update (Self Update)." },
        { de: "1=PSR2 Selective Update CRC error event — partial update data failed CRC verification." }
      ]
    },
    "02008": { e: "CRITICAL — Current PSR state machine state. Poll this register when debugging PSR flickering, ghosting, or wake latency. Normal PSR cycle: 0→1→2→(image changes)→5→0.",
      b: [
        { de: "PSR state: 0=Inactive; 1=Transitioning to PSR Active; 2=PSR Active (display from frame buffer); 3=Capture & Display transition; 4=Sink Self-Refresh Active; 5=Transitioning to Inactive; 6=PSR2 Selective Update Active; 7=Reserved." },
        { de: "1=PSR CRC verification active — checking frame buffer data integrity." },
        { de: "1=Sink is currently capturing the current frame to its frame buffer." }
      ]
    },
    "02009": { e: "PSR exit synchronization latency status register. Added in eDP v1.4b.",
      b: [
        { de: "0h = Sync completed on 1st frame after PSR exit. 1h = 2nd frame. ... 7h = 8th frame. 8h = More than 8 frames." },
        { de: "Minimum frame count for PSR re-entry. Same encoding as bits [3:0]." }
      ]
    },
    "0200C": { e: "Lane 0/1 link status in ESI area. Mirrors 00202h. Use this for CR/EQ/Symbol-lock checking in DP 1.2+ designs.",
      b: [
        { de: "Lane 0 Clock Recovery complete. 1=Lane 0 clock locked. This is the goal of Link Training Phase 1 (CR phase)." },
        { de: "Lane 0 Channel Equalization complete. 1=Lane 0 EQ training passed. Goal of Link Training Phase 2 (EQ phase)." },
        { de: "Lane 0 Symbol Lock. 1=Lane 0 symbol boundary aligned; data stream decoding is stable." },
        { de: "Reserved bit." },
        { de: "Lane 1 Clock Recovery complete." },
        { de: "Lane 1 Channel Equalization complete." },
        { de: "Lane 1 Symbol Lock." },
        { de: "Reserved bit." }
      ]
    },
    "0200D": { e: "Lane 2/3 link status in ESI area. Mirrors 00203h. Only relevant in 4-lane configurations.",
      b: [
        { de: "Lane 2 Clock Recovery complete." },
        { de: "Lane 2 Channel Equalization complete." },
        { de: "Lane 2 Symbol Lock." },
        { de: "Reserved bit." },
        { de: "Lane 3 Clock Recovery complete." },
        { de: "Lane 3 Channel Equalization complete." },
        { de: "Lane 3 Symbol Lock." },
        { de: "Reserved bit." }
      ]
    },
    "0200E": { e: "Lane alignment status in ESI area. Mirrors 00204h. INTERLANE_ALIGN_DONE is the final confirmation that Link Training truly succeeded.",
      b: [
        { de: "Inter-lane alignment complete. 1=skew compensation between all active lanes is done. Multi-lane links have slight arrival-time differences between lanes; this bit confirms all lanes are synchronized." },
        { de: "1=post-Link-Training fine-tuning adjustment request in progress. Sink believes current parameters can be further optimized." },
        { de: "1=downstream port status changed (e.g. a display connected to a Branch device was plugged/unplugged)." },
        { de: "1=link status registers updated. Flag indicating 0200Ch–0200Dh have new data. Cleared after Source reads." }
      ]
    },
    "0200F": { e: "Sink status in ESI area. Mirrors 00205h. RECEIVE_PORT_0_STATUS=1 is the most direct confirmation that the Sink is receiving valid video data.",
      b: [
        { de: "Receive Port 0 sync status. 1=actively receiving valid video stream on Port 0; 0=not synchronized. Most direct indicator of whether Sink is receiving video." },
        { de: "Receive Port 1 status. 1=synchronized. Only relevant for multi-port Sinks." }
      ]
    },
    "02200": { e: "Extended receiver capability area DPCD revision — the authoritative version register for DP 1.4+ devices. Some Sinks report a lower version in 00000h for backward compatibility with older Sources, but report the true version here. Always check both registers when debugging DP 1.4 devices." },
    "02201": { e: "Extended receiver capability area max link rate — authoritative for DP 1.4+ devices. A Sink may conservatively report a lower rate in 00001h but its true maximum rate here. Critical to check when debugging high-speed link failures." },
    "02202": { e: "Extended receiver capability field: maximum lane count register. Same structure as 00002h.",
      b: [
        { de: "0 = Enhanced Framing not supported. 1 = Supported." },
        { de: "0 = TPS3 not supported. 1 = Supported." },
        { de: "0 = Post Link Training adjustment not supported. 1 = Supported." }
      ]
    },
    "02203": { e: "Extended receiver capability field: spread spectrum and training mode register. Same structure as 00003h.",
      b: [
        { de: "0 = TPS4 not supported. 1 = Supported." },
        { de: "0 = AUX handshake required. 1 = AUX handshake not required for known link configuration." },
        { de: "0 = Not supported. 1 = Supported. DP v2.0 feature." },
        { de: "0 = No downspread. 1 = Up to 0.5% downspread." }
      ]
    },
    "02207": { e: "Extended receiver capability field: downstream port count and OUI/MSA support register.",
      b: [
        { de: "0 = OUI not supported. 1 = Supported." },
        { de: "0 = Sink requires MSA timing parameters. 1 = Sink does not require MSA timing parameters." },
        { de: "Downstream port count. 0h = None." }
      ]
    },
    "02208": { e: "Extended receiver capability field: Receiver Port 0 base capability register.",
      b: [
        { de: "0 = Buffer size per lane. 1 = Buffer size per port." },
        { de: "0 = Unit is pixel count. 1 = Unit is byte count." },
        { de: "0 = HBlank expansion not supported. 1 = Supported." },
        { de: "0 = Primary sync stream. 1 = Secondary sync stream associated to preceding port." },
        { de: "0 = No local EDID. 1 = Local EDID present." }
      ]
    },
    "02209": { e: "Receiver Port 0 buffer size = (value + 1) x 32 bytes/lane." },
    "0220A": { e: "Extended receiver capability field: Receiver Port 1 base capability register.",
      b: [
        { de: "0 = Buffer size per lane. 1 = Buffer size per port." },
        { de: "0 = Unit is pixel count. 1 = Unit is byte count." },
        { de: "0 = HBlank expansion not supported. 1 = Supported." },
        { de: "0 = Primary sync stream. 1 = Secondary sync stream." },
        { de: "0 = No local EDID. 1 = Local EDID present." }
      ]
    },
    "0220B": { e: "Receiver Port 1 buffer size = (value + 1) x 32 bytes/lane." },
    "0220D": { e: "Extended receiver capability field: eDP-specific capability register.",
      b: [
        { de: "1 = Display Control registers (00700h-007FFh) are enabled." },
        { de: "eDP FRAMING_CHANGE option is deprecated." },
        { de: "1 = This eDP device supports Alternate Scrambler Seed Reset (ASSR) value FFFEh." }
      ]
    },
    "0220E": { e: "Extended receiver capability field: training interval register.",
      b: [
        { de: "0 = Not present. 1 = Extended capability field present at DPCD 02200h-022FFh." },
        { de: "00h = CR phase 100us / EQ phase 400us. 01h = 4ms. 02h = 8ms. 03h = 12ms. 04h = 16ms." }
      ]
    },
    "0220F": { e: "Extended receiver capability field: adapter capability register.",
      b: [
        { de: "0 = Alternate I2C pattern not supported. 1 = Supported." },
        { de: "0 = VGA force load sense not supported. 1 = Supported." }
      ]
    },
    "02210": { e: "DPRX feature enumeration list. DP 1.4+ register listing advanced Sink capabilities. VSC_SDP_EXT_FOR_COLORIMETRY_SUPPORTED is key for HDR: if 0, Sink cannot receive HDR Metadata/BT.2020 colorimetry via VSC SDP.",
      b: [
        { de: "1=Global Time Code (GTC) supported. Provides a common time reference for audio/video synchronization across devices." },
        { de: "1=SST Split SDP (Secondary Data Packet splitting) supported. Allows SDP packets to span multiple blanking intervals." },
        { de: "1=AV (Audio/Video) synchronization capability. Sink can process Source AV sync information." },
        { de: "1=extended VSC SDP for colorimetry/HDR metadata supported. CRITICAL for HDR: if 0, Sink cannot receive BT.2020 or HDR Metadata via VSC SDP — HDR will not work." },
        { de: "1=VESA-defined VSC Extended SDP supported." },
        { de: "1=VESA VSC Extended SDP chaining supported (multiple SDPs sent in sequence)." },
        { de: "1=CEA-defined VSC Extended SDP supported (e.g. HDR10 Static Metadata)." },
        { de: "1=CEA VSC Extended SDP chaining supported." }
      ]
    },
    "02214": { e: "Adaptive Sync SDP (Secondary Data Packet) support register. Added in eDP v1.5.",
      b: [
        { de: "0 = Not supported. 1 = Adaptive Sync SDP supported. Added in eDP v1.5." }
      ]
    },
    "F0000": { e: "Start of vendor-specific DPCD address space (F0000h–FFFFFh). Used by chip vendors (e.g. Raydium) for proprietary internal register access via AUX. Contents are entirely vendor-defined and require the vendor's datasheet. Not covered by VESA DP specification." }
  };
  Object.keys(EN).forEach(function(addr) {
    if (!DPCD_DB[addr]) return;
    var en = EN[addr];
    if (en.e) DPCD_DB[addr].e = en.e;
    if (en.b && DPCD_DB[addr].b) {
      en.b.forEach(function(enBit, i) {
        if (DPCD_DB[addr].b[i] && enBit.de) DPCD_DB[addr].b[i].de = enBit.de;
      });
    }
  });
})();

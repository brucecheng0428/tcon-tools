#ifndef I2C_BRIDGE_PROTO_H
#define I2C_BRIDGE_PROTO_H
/* 可攜（無 Windows 依賴）的協定小工具：SHA1／Base64（WebSocket 握手）、
 * 極簡 JSON 擷取、I2C 寫入位址白名單判斷。
 * i2c_bridge.c 與 test_proto.c 都 include 這一份 —— 測到的就是出貨的那份程式碼。 */
#include <stdint.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

/* ---- I2C 寫入位址白名單 ----
 * 🔴 只管 `write`（dg-measure 的量測流程）。`rawwrite`（I2C 測試工具）**不套**
 *    這條 —— 測試工具的性質就是要能任意讀寫，防護改用「如實寫進 log」達成。
 *
 * 🔴 v1.6.0：從單一區間 0x1200–0x12FF 改成**幾個區間的聯集**，理由是事實層面的：
 *    七顆 TCON 的 ptg bank base **不是同一個**（PQ Tool 反組譯覆核）——
 *      EM01A1 / VM01S1          → 0x1200
 *      EM02A1 / V512S2 / VM02S1 → 0x0C00
 *      E512A1 / V512S1          → 0x0200
 *    再加上 cursor（十字）要碰的 sys clock-enable 0x0001–0x0004 與 tm 0xFF20–0xFF25。
 *
 * 🔴 **helper 這一份必然是粗的：它不知道對面是哪一顆 IC**（IC 識別在網頁端）。
 *    精確的那一份在 dg-measure.html 的 `dgmI2cWrRangesOf()`，依識別出來的 IC
 *    逐顆查表，而且認不出來就一個位址都不寫。兩份的分工是刻意的：
 *      · 網頁端：精確、會因為 IC 而變、擋得住「寫到別顆的 bank」
 *      · helper：粗、永遠不變、擋得住「網頁端整個壞掉亂寫」
 *    把 helper 這份也做成 per-IC 等於讓它相信網頁傳來的 IC 判斷，
 *    那就不是第二道防線，只是把第一道抄了一份。 */
typedef struct { uint32_t lo, hi; } DghRange;
#define DGH_WR_RANGES_N 5
static const DghRange DGH_WR_RANGES[DGH_WR_RANGES_N] = {
    { 0x0001u, 0x0004u },   /* sys：cursor clock enable（per-IC 落在其中一個 byte） */
    { 0x0200u, 0x02FFu },   /* ptg：E512A1 / V512S1 */
    { 0x0C00u, 0x0CFFu },   /* ptg：EM02A1 / V512S2 / VM02S1 */
    { 0x1200u, 0x12FFu },   /* ptg：EM01A1 / VM01S1 */
    { 0xFF20u, 0xFF25u }    /* tm ：cursor enable／模式／顏色與 x,y 座標 */
};
/* 相容用（舊名字仍被 README 與測試引用）：ptg 那一段的代表值 */
#define DGH_WR_ADDR_MIN 0x1200u
#define DGH_WR_ADDR_MAX 0x12FFu
static inline int dgh_write_allowed(uint32_t addr, int len){
    if(len<=0) return 0;
    uint32_t end = addr + (uint32_t)len - 1u;
    if(end < addr) return 0;                 /* 溢位：一律擋 */
    for(int i=0;i<DGH_WR_RANGES_N;i++)
        if(addr>=DGH_WR_RANGES[i].lo && end<=DGH_WR_RANGES[i].hi) return 1;
    return 0;
}

/* ---- offset（sub-address）寬度組包，proto 2 ----
 * 合法寬度只有 0／1／2／4。**MSB first**（與 proto 1 的兩 byte 版一致：
 * 高位在前），awid==0 代表完全不送位址＝I2C current address read。
 * 🔴 awid 預設 2 ⇒ proto 1 的呼叫端（dg-measure）走的 wire byte 一個都沒變。
 * 回傳組出的 byte 數；寬度不合法回 -1（呼叫端必須當成錯誤，不可當 0 處理）。 */
static inline int dgh_awid_ok(uint32_t awid){
    return awid==0u||awid==1u||awid==2u||awid==4u;
}
static inline int dgh_build_offset(uint8_t* ab, uint32_t addr, uint32_t awid){
    switch(awid){
        case 0u: return 0;
        case 1u: ab[0]=(uint8_t)(addr&0xFF); return 1;
        case 2u: ab[0]=(uint8_t)((addr>>8)&0xFF);  ab[1]=(uint8_t)(addr&0xFF); return 2;
        case 4u: ab[0]=(uint8_t)((addr>>24)&0xFF); ab[1]=(uint8_t)((addr>>16)&0xFF);
                 ab[2]=(uint8_t)((addr>>8)&0xFF);  ab[3]=(uint8_t)(addr&0xFF); return 4;
        default: return -1;
    }
}

/* ---- 寫入 frame 組包（offset bytes ＋ data，一次送出） ----
 * libMPSSE 的 I2C_DeviceWrite 收的是「位址 ＋ 資料」連在一起的一段 buffer
 * （PQ Tool 的 Write_Reg 就是這樣送）。組錯了不會報錯，只會寫到別的位址去 ——
 * 所以把它獨立成純函式讓 test_proto.c 逐 byte 釘住。
 * 回傳 frame 總長度；awid 不合法、dlen 為負、或 cap 不夠都回 -1。 */
static inline int dgh_build_write_frame(uint8_t* buf, int cap, uint32_t addr, uint32_t awid,
                                        const uint8_t* data, int dlen){
    uint8_t ab[4];
    int n=dgh_build_offset(ab,addr,awid);
    if(n<0||dlen<0||!buf) return -1;
    if(n+dlen>cap) return -1;
    if(n) memcpy(buf,ab,(size_t)n);
    if(dlen) memcpy(buf+n,data,(size_t)dlen);
    return n+dlen;
}

/* ---- Content-Type（proto 2 的靜態檔服務） ----
 * 回 NULL＝這個副檔名一律不端出去，exe 旁的資料夾因此不會變成任意檔案的出口。 */
static inline const char* dgh_mime_for(const char* name){
    const char* d = name ? strrchr(name,'.') : 0;
    if(!d) return 0;
    if(!strcmp(d,".html")||!strcmp(d,".htm")) return "text/html; charset=utf-8";
    if(!strcmp(d,".js"))   return "text/javascript; charset=utf-8";
    if(!strcmp(d,".css"))  return "text/css; charset=utf-8";
    if(!strcmp(d,".json")) return "application/json; charset=utf-8";
    if(!strcmp(d,".svg"))  return "image/svg+xml";
    if(!strcmp(d,".png"))  return "image/png";
    if(!strcmp(d,".ico"))  return "image/x-icon";
    if(!strcmp(d,".txt"))  return "text/plain; charset=utf-8";
    return 0;
}

/* ---- HTTP 請求目標的檔名擷取（proto 2 的靜態檔服務） ----
 * helper 原本不管什麼路徑都回同一份 dg-measure.html，第二個頁面因此無法被端出來。
 * 這裡把「路徑 → exe 旁的單一檔名」這段獨立成純函式，好讓 test_proto.c 驗它。
 * 規則（全部從嚴，不做 percent-decode，也不支援子目錄）：
 *   "/"           -> out 為空字串（＝**根路徑**，交給呼叫端端出內建入口頁）
 *   "/i2c.html"   -> "i2c.html"
 *   含 / \ : % 或 ".." 或以 '.' 開頭 -> 0（拒絕）
 * 回傳 1＝out 有效（可能是空字串＝根），0＝拒絕。
 *
 * 🔴 v1.5.0 變更：`/` 原本直接對應 dg-measure.html。那是「helper 只端一頁」
 *    時代的假設，而它造成了實際故障 —— helper 啟動就把 dg 那一頁開起來，
 *    那頁一載入就搶走 I2C channel，使用者要測 i2c.html 時搶不到。
 *    現在 `/` 是一個誰都不佔用的入口頁，由使用者自己點要用哪一個。 */
static inline int dgh_req_filename(const char* req, char* out, int cap){
    if(!req||!out||cap<2) return 0;
    if(strncmp(req,"GET ",4)!=0) return 0;
    const char* p=req+4; while(*p==' ') p++;
    if(*p!='/') return 0;
    p++;
    const char* e=p;
    while(*e && *e!=' ' && *e!='?' && *e!='#' && *e!='\r' && *e!='\n') e++;
    int n=(int)(e-p);
    if(n==0){ out[0]=0; return 1; }          /* 根路徑：交給呼叫端端內建入口頁 */
    if(n>=cap) return 0;
    for(int i=0;i<n;i++){
        char c=p[i];
        if(c=='/'||c=='\\'||c==':'||c=='%') return 0;
        if(c=='.'&&i+1<n&&p[i+1]=='.') return 0;
    }
    if(p[0]=='.') return 0;
    memcpy(out,p,(size_t)n); out[n]=0;
    return 1;
}

/* ---- SHA1 ---- */
typedef struct { uint32_t h[5]; uint64_t len; uint8_t buf[64]; int idx; } DGH_SHA1;
static inline uint32_t dgh_rol(uint32_t v, int b){ return (v<<b)|(v>>(32-b)); }
static inline void dgh_sha1_block(DGH_SHA1* s, const uint8_t* p){
    uint32_t w[80], a,b,c,d,e,f,k,t; int i;
    for(i=0;i<16;i++) w[i]=(p[i*4]<<24)|(p[i*4+1]<<16)|(p[i*4+2]<<8)|p[i*4+3];
    for(i=16;i<80;i++) w[i]=dgh_rol(w[i-3]^w[i-8]^w[i-14]^w[i-16],1);
    a=s->h[0];b=s->h[1];c=s->h[2];d=s->h[3];e=s->h[4];
    for(i=0;i<80;i++){
        if(i<20){f=(b&c)|((~b)&d);k=0x5A827999;}
        else if(i<40){f=b^c^d;k=0x6ED9EBA1;}
        else if(i<60){f=(b&c)|(b&d)|(c&d);k=0x8F1BBCDC;}
        else{f=b^c^d;k=0xCA62C1D6;}
        t=dgh_rol(a,5)+f+e+k+w[i]; e=d;d=c;c=dgh_rol(b,30);b=a;a=t;
    }
    s->h[0]+=a;s->h[1]+=b;s->h[2]+=c;s->h[3]+=d;s->h[4]+=e;
}
static inline void dgh_sha1_init(DGH_SHA1* s){ s->h[0]=0x67452301;s->h[1]=0xEFCDAB89;s->h[2]=0x98BADCFE;s->h[3]=0x10325476;s->h[4]=0xC3D2E1F0;s->len=0;s->idx=0; }
static inline void dgh_sha1_update(DGH_SHA1* s, const uint8_t* p, size_t n){
    s->len+=n;
    while(n--){ s->buf[s->idx++]=*p++; if(s->idx==64){ dgh_sha1_block(s,s->buf); s->idx=0; } }
}
static inline void dgh_sha1_final(DGH_SHA1* s, uint8_t out[20]){
    uint64_t bits=s->len*8; uint8_t pad=0x80; int i;
    dgh_sha1_update(s,&pad,1);
    uint8_t z=0; while(s->idx!=56) dgh_sha1_update(s,&z,1);
    uint8_t lb[8]; for(i=0;i<8;i++) lb[i]=(uint8_t)(bits>>(56-i*8)); dgh_sha1_update(s,lb,8);
    for(i=0;i<5;i++){ out[i*4]=(uint8_t)(s->h[i]>>24);out[i*4+1]=(uint8_t)(s->h[i]>>16);out[i*4+2]=(uint8_t)(s->h[i]>>8);out[i*4+3]=(uint8_t)s->h[i]; }
}

/* ---- Base64 encode ---- */
static const char DGH_B64[]="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
static inline void dgh_b64enc(const uint8_t* in, int n, char* out){
    int i,o=0; for(i=0;i<n;i+=3){
        uint32_t v=in[i]<<16; if(i+1<n)v|=in[i+1]<<8; if(i+2<n)v|=in[i+2];
        out[o++]=DGH_B64[(v>>18)&63]; out[o++]=DGH_B64[(v>>12)&63];
        out[o++]=(i+1<n)?DGH_B64[(v>>6)&63]:'='; out[o++]=(i+2<n)?DGH_B64[v&63]:'=';
    } out[o]=0;
}
/* WebSocket accept：base64( sha1( key + magic ) ) */
static inline void dgh_ws_accept(const char* key, char* out){
    static const char* MAGIC="258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    char cat[256]; snprintf(cat,sizeof(cat),"%s%s",key,MAGIC);
    DGH_SHA1 s; dgh_sha1_init(&s); dgh_sha1_update(&s,(const uint8_t*)cat,strlen(cat));
    uint8_t dig[20]; dgh_sha1_final(&s,dig); dgh_b64enc(dig,20,out);
}

/* ---- JSON 極簡擷取（受控兩端） ---- */
static inline long dgh_json_int(const char* s, const char* key, long def){
    char pat[64]; snprintf(pat,sizeof(pat),"\"%s\"",key);
    const char* p=strstr(s,pat); if(!p) return def;
    p+=strlen(pat); while(*p&&(*p==' '||*p==':')) p++;
    if(!*p) return def; return strtol(p,NULL,10);
}
static inline int dgh_json_type(const char* s, char* out, int cap){
    const char* p=strstr(s,"\"type\""); if(!p) return 0;
    p+=6; while(*p&&(*p==' '||*p==':')) p++;
    if(*p!='"') return 0; p++; int i=0;
    while(*p&&*p!='"'&&i<cap-1) out[i++]=*p++; out[i]=0; return 1;
}
/* 🔴 取字串欄位（目前只用在 open 的 `page` ＝ 網頁版本，寫進 log）。
   回傳 1 ＝ 有這個欄位；0 ＝ 沒有（呼叫端據此分辨「舊網頁不會送」與「送了空字串」）。
   不處理跳脫序列：版本字串是 `v1.13.3` 這種形狀，沒有跳脫的可能；
   真的來了跳脫字元也只是照抄進 log，不會影響判斷。 */
static inline int dgh_json_str(const char* s, const char* key, char* out, int cap){
    char pat[64]; const char* p; int i=0;
    if(cap>0) out[0]=0;
    snprintf(pat,sizeof(pat),"\"%s\"",key);
    p=strstr(s,pat); if(!p) return 0;
    p+=strlen(pat); while(*p&&(*p==' '||*p==':')) p++;
    if(*p!='"') return 0; p++;
    while(*p&&*p!='"'&&i<cap-1) out[i++]=*p++;
    out[i]=0; return 1;
}
static inline int dgh_json_int_array(const char* s, const char* key, uint8_t* buf, int cap){
    char pat[64]; snprintf(pat,sizeof(pat),"\"%s\"",key);
    const char* p=strstr(s,pat); if(!p) return -1;
    p=strchr(p,'['); if(!p) return -1; p++;
    int n=0; while(*p&&*p!=']'){
        while(*p==' '||*p==',') p++;
        if(*p==']') break;
        if(n>=cap) return -1;
        buf[n++]=(uint8_t)strtol(p,NULL,10);
        while(*p&&*p!=','&&*p!=']') p++;
    }
    return n;
}

/* ---- Origin 白名單 ----
 * 🔴 必須做「前綴 ＋ 終止字元」比對，不能只比前綴：
 *    只比前綴的話 https://brucecheng0428.github.io.evil.com 會被放行。
 *    Origin 的格式是 scheme://host[:port]，host 之後合法的字元只有
 *    ':'（接 port）或 header 行結束（空白／CR／LF／字串結尾）；
 *    出現 '.' 或其他字元代表 host 還沒結束＝不同網域，一律拒絕。 */
static inline int dgh_host_terminator(char c){
    return c=='\0'||c=='\r'||c=='\n'||c==' '||c=='\t'||c==':'||c=='/';
}
static inline int dgh_origin_match(const char* o, const char* prefix){
    size_t n=strlen(prefix);
    if(strncmp(o,prefix,n)!=0) return 0;
    return dgh_host_terminator(o[n]);
}
static inline int dgh_origin_allowed(const char* hdr){
    const char* o=strstr(hdr,"Origin:"); if(!o) o=strstr(hdr,"origin:");
    if(!o) return 0;
    o+=7; while(*o==' ') o++;
    if(dgh_origin_match(o,"https://brucecheng0428.github.io")) return 1;
    if(dgh_origin_match(o,"http://127.0.0.1")) return 1;
    if(dgh_origin_match(o,"http://localhost")) return 1;
    return 0;
}


/* ═══════════════════════════════════════════════════════════════════════════
   🔴 直接組 MPSSE 命令（繞開 libMPSSE 的逐 byte 迴圈）
   ───────────────────────────────────────────────────────────────────────────
   為什麼要這一條路（2026-09-19，Bruce「讀的還是太慢了」）：
     libMPSSE 的 I2C_DeviceRead 在**非 fast 路徑**對每一個 byte 做
     「送 ~17 byte 命令 → INFRA_SLEEP(1) → 讀 1 byte」⇒ 每個 byte 一次 USB 來回。

   🔴 更正（2026-09-19）：這裡原本寫「4096 ms 純睡眠」，把主因算在 `INFRA_SLEEP(1)`
     頭上。**實測推翻**：Bruce 用邏輯分析儀量到 byte 間隔 **10~15 ms**，而 sleep 確實
     只有 1 ms。主因是 FTDI 官方 I2C recipe 在**每個資料 byte 的 ACK 之後都送一次
     `0x87`（Send Immediate）**＝ 強制一次 USB flush，不等 latency timer。
     每一次 flush 都要等主機收完、組好下一個 byte 的命令再送出去。
     ⇒ 本檔這條路的重點**不是「省掉 sleep」，是「整段只留最後一個 `0x87`」**：
       資料 byte 的 ACK 是主機自己發的，不需要跟從機來回，所以 N 個 byte 可以
       整段組完、一次送出、一次收回。由 test_proto.c 的「整段只有一個 0x87」釘住。

   🔴 為什麼不照抄原廠：**原廠沒有這個需求，所以原廠沒有答案。**
     反組譯實查（`I2C_tool/xCtrl_I2C_App.cs:73` options=11u ⇒ 0x0B，資料相位
     **沒有** FAST_TRANSFER）—— PQ Tool 的讀取也是逐 byte，它不慢只是因為
     `RaydiumEM02A1.cs:220` `new byte[48]`：**它一次只讀 48 byte**（全庫最大 228）。
     48 byte 逐 byte 讀約 0.1 秒（瞬間），4096 byte 就是 10~20 秒。

   ⇒ 這裡自己組整段 MPSSE 命令：**一次 FT_Write ＋ 一次 FT_Read**。
     I2C 線上的行為與 PQ Tool 等價（START／位址／repeated start／每 byte ACK／
     最後一個 byte NACK／STOP），差別只在「命令怎麼送到晶片」。

   🔴 這一份是 `dg-measure.html` 的 WebUSB 路徑（`dgmI2cBuildRead`／`dgmI2cBuildWrite`）
     的 C 移植，**位元組序列必須逐位元組相同** —— 兩邊互為對照，這是無硬體時
     最強的交叉驗證（test_proto.c 與 dg_i2c_selftest.js 各釘一份同樣的向量）。

   MPSSE opcode：
     0x80 = set data bits low byte（value, dir）
     0x11 = clock data bytes out, MSB first, falling edge（長度欄 n-1）
     0x13 = clock data bits out, MSB first, falling edge（長度欄 bits-1）
     0x20 = clock data bytes in,  MSB first, rising edge
     0x22 = clock data bits in,   MSB first, rising edge
     0x87 = send immediate
   腳位：bit0 = SCL、bit1 = SDA_out、bit2 = SDA_in（1 與 2 外部相接）
   ═══════════════════════════════════════════════════════════════════════════ */
/* ═══ 🔴 方向位元：我們的 0x03/0x01 vs FTDI 範例的 0x0B/0x09 ═══════════════════
   位元定義：bit0=SCK、bit1=SDA out、bit2=SDA in、**bit3=AD3**。
     · 我們：WR=0x03（SCK+SDA 輸出）、RD=0x01（只有 SCK 輸出，放開 SDA）
     · FTDI 官方 I2C 範例：WR=0x0B、RD=0x09 —— 多的就是 **bit3，把 AD3 也設成輸出**
   AD3 在 FTDI 的 I2C 範例接線裡通常被拉來當輸出以免浮接；但**我們不知道 Bruce 的
   治具上 AD3 接了什麼**，貿然驅動它有風險，所以預設維持 0x03/0x01（＝既有行為）。

   🔴 這個差異我在幾輪前就標出來過但一直沒處理。現在做成**可切換**，
   等 log 指向方向／浮接問題時可以直接 A/B 對比，不必再改一次程式重編：
       `--ad3-out`（或 open 帶 `"ad3":1`）⇒ 改用 0x0B/0x09。
   🔴 預設不變 ＝ 不在沒有證據時改變既有行為。 */
extern int dgh_ad3_out;         /* 0 ＝ 0x03/0x01（預設）；1 ＝ 0x0B/0x09（FTDI 範例） */

/* ═══ 🔴 時脈換算：想要的**線上**頻率 → 0x86 的 divisor ═══════════════════════
   把這件事做成函式而不是散在註解裡，因為它有兩個**必須成對**的變數，
   拆開就會出錯 —— v1.11.4 正是「送 0x8A(60MHz base) 卻用 12MHz 的公式」，
   實測 400k 設定量到 80 kHz。

     base 一律 12 MHz（我們**不碰** divide-by-5，維持 MPSSE 重置後的預設）
     程式化頻率 SK = 12e6 / ((1 + divisor) * 2)
     🔴 三相開啟時，實際線上 SCL ＝ 程式化值的 **2/3**（多一個 phase）
        ⇒ 要量到 f，就要照 f * 3/2 去程式化

   400 kHz、三相開：prog = 600,000 ⇒ div = 6e6/600000 - 1 = **9**
                    驗算 12e6/((1+9)*2) = 600,000 程式化 ⇒ 線上 400,000 ✅
   400 kHz、三相關：prog = 400,000 ⇒ div = 6e6/400000 - 1 = **14**
                    驗算 12e6/((1+14)*2) = 400,000 ✅（與 libMPSSE 程式化的一致） */
static inline unsigned short dgh_mp_divisor(unsigned int wireHz, int threePhase){
    unsigned int prog, div;
    if(!wireHz) wireHz = 400000u;
    prog = threePhase ? (wireHz * 3u) / 2u : wireHz;
    if(!prog) prog = 1u;
    div = 6000000u / prog;
    if(div == 0u) div = 1u;
    div -= 1u;
    if(div > 0xFFFFu) div = 0xFFFFu;
    return (unsigned short)div;
}
/* 反算，給 log 與測試用：divisor ＋ 三相 → 線上頻率 */
static inline unsigned int dgh_mp_wire_hz(unsigned short div, int threePhase){
    unsigned int prog = 12000000u / (((unsigned int)div + 1u) * 2u);
    return threePhase ? (prog * 2u) / 3u : prog;
}
/* ═══ 🔴🔴 I2C 是開汲極：「高」＝放開，不是驅動高 ═══════════════════════════
   Bruce 2026-09-19：「I2C 的機制本來就是下拉的時候由 slave 或 master 去拉它，
   而為 high 的時候其實是 **open drain** 的形式，也就是**只是把它放開變 High-Z**
   而已。因為有上拉電阻，會自動把它拉回 High 準位。SCL 跟 SDA 都是這樣。」

   ⇒ **凡是要讓線變高，一律改方向（放開），不可以輸出高值。**
   主動推高會跟正在拉低的從機打架；而且「延遲期間還在驅動低」等於延遲白做 ——
   **那正是 bit7 一直讀成 0 的機制**。

   pyftdi 的 `_clk_lo_data_hi`（`0x80 0x02 0x03`＝輸出且值為高）是它在
   FT2232 沒有開汲極時的 `_fake_tristate` 折衷，**不是 I2C 的正解**，我們不照抄。

   pin bit：SCL=0x01(AD0)、SDA_O=0x02(AD1)、SDA_I=0x04(AD2)。
   SCL 維持輸出 —— MPSSE 得自己產生時脈，把它設成輸入就沒有時脈了；
   開汲極由 `0x9E 07 00` 在硬體層做掉（它做的就是「只驅動 0、其餘放開」，
   與上面那段話是同一件事）。 */
#define DGH_MP_DIR_WR (dgh_ad3_out ? 0x0B : 0x03)   /* SCL out, SDA out（要拉低時才用） */
#define DGH_MP_DIR_RD (dgh_ad3_out ? 0x09 : 0x01)   /* SCL out, **SDA 放開 ＝ High-Z** */
/* 四種匯流排狀態，命名直接講「放開」還是「拉低」，不要再用會誤導的 HI/LO */
#define DGH_MP_V_SCLLO 0x00     /* value: SCL=0 */
#define DGH_MP_V_SCLHI 0x01     /* value: SCL=1 */
/* 🔴 `DGH_MP_HI`(0x03) 與 `DGH_MP_SDALO`(0x01) 已移除 —— 它們的語意是「值為高」，
   在開汲極的 I2C 上是誤導：要高就改方向放開，不是把值設成 1。
   留著遲早有人再拿去用，所以直接刪掉。`DGH_MP_LO` 保留（值 0 是真的要拉低）。 */
#define DGH_MP_LO     0x00

/* ═══ 🔴 讀完一個 byte 之後的建立時間（pyftdi 的 `_ck_delay`）════════════════
   Bruce：「這個間隔應該是可以調整吧？**你是不是把它用到最小？**」—— 他是對的，
   我們原本是 **0**。

   pyftdi 的算法（`I2cController.configure` / `_compute_delay_cycles`）：
       I2C_400K.t_buf = 1.3 µs
       ck_delay = max(1, int((t_buf + bit_delay) / bit_delay))
   以 MPSSE 一個位元週期 bit_delay ≈ 0.5 µs 代入 ⇒ `int(1.8/0.5)` ＝ **3**。

   🔴 但延遲那幾拍**必須維持在「放開」狀態**（`0x80 0x00 0x01`），
   不是 pyftdi 的 `0x80 0x00 0x03`（那是驅動低）——
   延遲的目的就是給上拉電阻時間把線拉回高，還壓著就完全白做。
   ⇒ 預設 3，並做成**可調**，讓 Bruce 用 LA 掃出最小可用值。 */
extern int dgh_ck_delay;        /* 預設 3；0 ＝ 完全不延遲（＝ v1.11.5 以前的行為） */
#define DGH_CK_DELAY_MAX 16

/* ═══ 🔴 讀完一個 byte 之後的建立時間（pyftdi 的 `_ck_delay`）════════════════
   Bruce：「這個間隔應該是可以調整吧？**你是不是把它用到最小？**」—— 他是對的，
   我們原本是 **0**。pyftdi 在每個 byte 的 ACK 之後會重複送
   `_clk_lo_data_lo`（`0x80 0x00 0x03`）共 `_ck_delay` 次當延遲。

   pyftdi 的算法（`I2cController.configure` / `_compute_delay_cycles`）：
       I2C_400K.t_buf = 1.3 µs
       ck_delay = max(1, int((t_buf + bit_delay) / bit_delay))
   以 MPSSE 一個位元週期 bit_delay ≈ 0.5 µs 代入 ⇒ `int(1.8/0.5)` ＝ **3**。
   ⇒ 預設 3，並做成**可調**，讓 Bruce 用 LA 掃出最小可用值。 */
extern int dgh_ck_delay;        /* 預設 3；0 ＝ 完全不延遲（＝ v1.11.5 以前的行為） */
#define DGH_CK_DELAY_MAX 16
/* libMPSSE 用「同一道指令重複數次」湊 START/STOP 的建立與保持時間
   （USB 送出的速度不受 0x86 除數控制）。沿用同一個做法與量級。 */
#define DGH_MP_START_REP  10
#define DGH_MP_START_REP2 20
#define DGH_MP_STOP_REP   10

/* 極小的 append 輔助：超過容量就把 ok 清 0，呼叫端統一檢查。 */
typedef struct { unsigned char* p; int cap; int n; int ok; } dgh_buf;
static inline void dgh_put(dgh_buf* b, int v){
    if(b->n >= b->cap){ b->ok = 0; return; }
    b->p[b->n++] = (unsigned char)(v & 0xFF);
}
static inline void dgh_pins(dgh_buf* b, int val, int dir, int times){
    for(int i=0;i<times;i++){ dgh_put(b,0x80); dgh_put(b,val); dgh_put(b,dir); }
}
/* 🔴 START：閒置（兩條線都放開＝被上拉到高）→ SDA 拉低（SCL 仍高）→ SCL 拉低。
   「SDA 高」用**放開**（DIR_RD），不是輸出高值。 */
static inline void dgh_mp_start(dgh_buf* b){
    dgh_pins(b, DGH_MP_V_SCLHI, DGH_MP_DIR_RD, DGH_MP_START_REP);   /* 閒置：SDA 放開、SCL 高 */
    dgh_pins(b, DGH_MP_V_SCLHI, DGH_MP_DIR_WR, DGH_MP_START_REP2);  /* SDA↓（SCL 仍高）＝ START */
    dgh_pins(b, DGH_MP_V_SCLLO, DGH_MP_DIR_WR, DGH_MP_START_REP);   /* SCL↓ */
}
/* 🔴 STOP：SCL 低、SDA 拉低 → SCL 放高 → **SDA 放開**（上拉把它帶高）＝ STOP。
   最後一道維持 SDA 放開、SCL 輸出高 ＝ 匯流排回到閒置。 */
static inline void dgh_mp_stop(dgh_buf* b){
    dgh_pins(b, DGH_MP_V_SCLLO, DGH_MP_DIR_WR, DGH_MP_STOP_REP);    /* SCL低、SDA 拉低 */
    dgh_pins(b, DGH_MP_V_SCLHI, DGH_MP_DIR_WR, DGH_MP_STOP_REP);    /* SCL↑（SDA 仍拉低） */
    dgh_pins(b, DGH_MP_V_SCLHI, DGH_MP_DIR_RD, DGH_MP_STOP_REP);    /* SDA 放開 ＝ STOP */
}
/* 寫一個 byte ＋ 收一個 ACK 位元 ⇒ 會多回 1 個 input byte。 */
static inline int dgh_mp_wr_byte(dgh_buf* b, int v){
    dgh_put(b,0x11); dgh_put(b,0x00); dgh_put(b,0x00); dgh_put(b,v);
    dgh_put(b,0x80); dgh_put(b,DGH_MP_LO); dgh_put(b,DGH_MP_DIR_RD);  /* 放開 SDA 收 ACK */
    dgh_put(b,0x22); dgh_put(b,0x00);                                  /* 讀 1 bit */
    dgh_put(b,0x80); dgh_put(b,DGH_MP_LO); dgh_put(b,DGH_MP_DIR_WR);  /* 拿回 SDA */
    return 1;
}
/* ═══ 讀一個 byte ＋ 主端送 ACK／NACK ══════════════════════════════════════
   🔴 2026-09-19 改成照 **pyftdi** 的形狀（`pyftdi/i2c.py`，`I2cController._do_read`
   的 `_fake_tristate` 路徑）。pyftdi 是最廣泛使用、驗證最久的 FTDI I2C 實作。

   pyftdi：
       read_byte      = _clk_lo_data_input + _read_byte + _clk_lo_data_hi
       read_not_last  = read_byte + _ack  + _clk_lo_data_lo * _ck_delay
       read_last      = read_byte + _nack + _clk_lo_data_hi * _ck_delay
   常數：_clk_lo_data_input = 80 00 01、_clk_lo_data_hi = 80 02 03、
         _clk_lo_data_lo    = 80 00 03、_ack = 13 00 00、_nack = 13 00 FF

   🔴 我們原本少了**兩段**，而這兩段正好解釋 bit7 那個零反例指紋：
     ① 讀完之後 pyftdi 是 `80 02 03`（SDA 輸出**高**），我們是 `80 00 03`
        （輸出**低**）⇒ **我們在讀完的瞬間就把 SDA 壓低了**，比 ACK 該拉低的時間更早。
     ② ACK 之後 pyftdi 有 `_ck_delay` 次的延遲，我們**完全沒有**（＝0）。
        Bruce：「這個間隔應該是可以調整吧？你是不是把它用到最小？」—— 正是。
   兩者相加 ⇒ 下一個 byte 的 bit7 取樣時 SDA 還被我們壓在低電位 ⇒ 讀成 0，
   而且**反向從不發生** —— 與實測指紋、與「80 kHz 時錯得較少」全部吻合。

   NACK 值照抄 pyftdi 的 `0xFF`（MSB 模式下只有最高位元有效，與 0x80 等效）。 */
static inline int dgh_mp_rd_byte(dgh_buf* b, int nack){
    int i, d = dgh_ck_delay;
    if(d < 0) d = 0;
    if(d > DGH_CK_DELAY_MAX) d = DGH_CK_DELAY_MAX;
    /* ① SDA 放開（High-Z），SCL 仍為輸出低 —— 讓從機驅動資料 */
    dgh_put(b,0x80); dgh_put(b,DGH_MP_V_SCLLO); dgh_put(b,DGH_MP_DIR_RD);
    /* ② 讀 1 byte */
    dgh_put(b,0x20); dgh_put(b,0x00);           dgh_put(b,0x00);
    if(nack){
        /* 🔴 ③ NACK ＝ 讓 SDA **維持高** ＝ **放開不要驅動**。
           不可以用 `0x13 ... 0xFF` 去「輸出高」—— 那是主動推高，違反開汲極。
           所以這裡維持 High-Z，只補一個時脈脈衝：
             `0x8E len` ＝ Clock For n x 1 bits, no data transfer（len ＝ 次數-1）。
           （依據：I2C 的開汲極特性＋Bruce 2026-09-19 的裁示。） */
        dgh_put(b,0x80); dgh_put(b,DGH_MP_V_SCLLO); dgh_put(b,DGH_MP_DIR_RD);
        dgh_put(b,0x8E); dgh_put(b,0x00);                    /* 1 個時脈，不動資料線 */
    } else {
        /* ③ ACK ＝ 主動把 SDA 拉低一個時脈 */
        dgh_put(b,0x80); dgh_put(b,DGH_MP_V_SCLLO); dgh_put(b,DGH_MP_DIR_WR);
        dgh_put(b,0x13); dgh_put(b,0x00);           dgh_put(b,0x00);
    }
    /* 🔴 ④ 立刻放開回 High-Z，並在這個狀態下等 ckDelay 拍。
       延遲的目的是給上拉電阻時間把 SDA 拉回高；**延遲期間還驅動低就完全白做**，
       那正是先前 bit7 讀成 0 的機制。 */
    dgh_put(b,0x80); dgh_put(b,DGH_MP_V_SCLLO); dgh_put(b,DGH_MP_DIR_RD);
    for(i = 0; i < d; i++){
        dgh_put(b,0x80); dgh_put(b,DGH_MP_V_SCLLO); dgh_put(b,DGH_MP_DIR_RD);
    }
    return 1;
}
/* 讀：START ＋ slave(W) ＋ offset… ＋ repeated START ＋ slave(R) ＋ data… ＋ STOP
   awid==0 ⇒ 沒有位址相位，直接 START ＋ slave(R)（current address read）。
   回傳命令長度；*acks ＝ 會回傳幾個 ACK byte，*din ＝ 會回傳幾個資料 byte。
   容量不足回 -1。 */
static inline int dgh_mp_build_read(unsigned char* out, int cap, unsigned slave,
                                    unsigned addr, int awid, int len, int* acks, int* din){
    dgh_buf b = { out, cap, 0, 1 };
    int a = 0, i;
    unsigned char ab[4]; int n = dgh_build_offset(ab, addr, (unsigned)awid);
    if(n < 0 || len < 1) return -1;
    if(n > 0){
        dgh_mp_start(&b);
        a += dgh_mp_wr_byte(&b, (int)((slave << 1) | 0));
        for(i=0;i<n;i++) a += dgh_mp_wr_byte(&b, ab[i]);
    }
    dgh_mp_start(&b);                                   /* repeated start（中間不下 STOP） */
    a += dgh_mp_wr_byte(&b, (int)((slave << 1) | 1));
    for(i=0;i<len;i++) dgh_mp_rd_byte(&b, i == len-1);  /* 最後一個 NACK */
    dgh_mp_stop(&b);
    dgh_put(&b, 0x87);                                  /* send immediate */
    if(!b.ok) return -1;
    if(acks) *acks = a;
    if(din)  *din  = len;
    return b.n;
}
/* 寫：START ＋ slave(W) ＋ offset… ＋ data… ＋ STOP */
static inline int dgh_mp_build_write(unsigned char* out, int cap, unsigned slave,
                                     unsigned addr, int awid, const unsigned char* data,
                                     int dlen, int* acks, int* din){
    dgh_buf b = { out, cap, 0, 1 };
    int a = 0, i;
    unsigned char ab[4]; int n = dgh_build_offset(ab, addr, (unsigned)awid);
    if(n < 0 || dlen < 0) return -1;
    dgh_mp_start(&b);
    a += dgh_mp_wr_byte(&b, (int)((slave << 1) | 0));
    for(i=0;i<n;i++)    a += dgh_mp_wr_byte(&b, ab[i]);
    for(i=0;i<dlen;i++) a += dgh_mp_wr_byte(&b, data[i]);
    dgh_mp_stop(&b);
    dgh_put(&b, 0x87);
    if(!b.ok) return -1;
    if(acks) *acks = a;
    if(din)  *din  = 0;
    return b.n;
}
/* ACK 位元怎麼判：MPSSE 回的那個 byte，位元可能靠右(bit0)或靠左(bit7)對齊。
   兩種對齊下 ACK 都是「bit0 與 bit7 皆為 0」⇒ 用 0x81 遮罩，
   **只可能多報 NACK、不可能少報**（漏報才是危險的那一邊）。 */
static inline int dgh_mp_ack_ok(unsigned char v){ return (v & 0x81) == 0; }

#endif

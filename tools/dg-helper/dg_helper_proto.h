#ifndef DG_HELPER_PROTO_H
#define DG_HELPER_PROTO_H
/* 可攜（無 Windows 依賴）的協定小工具：SHA1／Base64（WebSocket 握手）、
 * 極簡 JSON 擷取、I2C 寫入位址白名單判斷。
 * dg_helper.c 與 test_proto.c 都 include 這一份 —— 測到的就是出貨的那份程式碼。 */
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

#endif

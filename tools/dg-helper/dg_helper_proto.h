#ifndef DG_HELPER_PROTO_H
#define DG_HELPER_PROTO_H
/* 可攜（無 Windows 依賴）的協定小工具：SHA1／Base64（WebSocket 握手）、
 * 極簡 JSON 擷取、I2C 寫入位址白名單判斷。
 * dg_helper.c 與 test_proto.c 都 include 這一份 —— 測到的就是出貨的那份程式碼。 */
#include <stdint.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

/* ---- I2C 寫入位址白名單（ptg bank） ---- */
#define DGH_WR_ADDR_MIN 0x1200u
#define DGH_WR_ADDR_MAX 0x12FFu
static inline int dgh_write_allowed(uint32_t addr, int len){
    if(len<=0) return 0;
    if(addr<DGH_WR_ADDR_MIN) return 0;
    return (addr + (uint32_t)len - 1) <= DGH_WR_ADDR_MAX;
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

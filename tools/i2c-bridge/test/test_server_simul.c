/* ═══════════════════════════════════════════════════════════════════════════
   test_server_simul.c — 1.19.0：I2C 治具與 DP AUX **同時使用**。把出貨的 i2c_bridge.c 真的跑起來，
   用兩條（以上）真 WebSocket 驗：兩條路各自持有、交錯讀寫不重疊、T-CON lock 排隊、一邊斷線另一邊不受影響。
   Bruce 2026-10-23「I2C 跟 AUX 還是要改成可以同時使用。不要因為怕麻煩就不做」。
   假 DLL_AUX_VC.dll 在 test/shim.c（一顆假 T-CON：DPCD 視窗、7D/7E、EEPROM 打到就記數）。
   🔴 驗不到：真顯示卡驅動、真 AUX、Intel 系統管理員與 PSR 的真實行為（Windows 實機才有）。
   ═══════════════════════════════════════════════════════════════════════════ */
#include "shim/winsock2.h"
#include "shim/windows.h"
#include <pthread.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <time.h>

int dgh_main(int argc, char** argv);
extern int dgh_fake_open_calls, dgh_fake_close_calls, dgh_fake_live, dgh_fake_writes, dgh_fake_reads;
extern int dgh_serve_files;   /* v1.7.0：靜態檔服務的開關（預設 0） */
extern int dgh_fast_read;     /* v1.8.0：讀取走不走 fast 路徑 */
extern unsigned dgh_fake_last_read_opts, dgh_fake_last_write_opts;
extern unsigned dgh_fake_read_status, dgh_fake_write_status;
extern unsigned char dgh_fake_last_write[64];
extern int dgh_fake_last_write_len;
extern int dgh_mode, dgh_fast_read, dgh_raw_mpsse;
extern char dgh_fake_trace[]; extern int dgh_fake_overlaps, dgh_fake_xact_us;
extern void dgh_fake_trace_reset(void);

static int fails=0, total=0;
static void CHECK(int cond, const char* name){
    total++;
    if(!cond){ fails++; printf("   FAIL  %s\n", name); }
}
static void CHECKS(const char* got, const char* want, const char* name){
    total++;
    if(!got || !strstr(got,want)){ fails++; printf("   FAIL  %s\n        want substring: %s\n        got: %.300s\n", name, want, got?got:"(null)"); }
}
/* 數值不符時要印出實際值 —— 只說 FAIL 沒辦法拿去跟 log／量測數字對照。 */
static void EQ_I(long got, long want, const char* name){
    total++;
    if(got!=want){ fails++; printf("   FAIL  %s\n        got=%ld want=%ld\n", name, got, want); }
}
static void G(const char* n){ printf("\n-- %s %s\n", n, "------------------------------------"); }

#define PORT 18898
static void msleep(int ms){ struct timespec t={ms/1000,(long)(ms%1000)*1000000L}; nanosleep(&t,NULL); }

static void* server_thread(void* arg){
    (void)arg;
    char portarg[64]; snprintf(portarg,sizeof(portarg),"--port=%d",PORT);
    char* argv[]={(char*)"i2c-bridge", portarg, NULL};
    dgh_main(2, argv);
    return NULL;
}

/* ── 最小 WebSocket client（只做我們自己 helper 會遇到的情況）───────────── */
static int tcp_connect(void){
    int s=socket(AF_INET,SOCK_STREAM,0);
    struct sockaddr_in a; memset(&a,0,sizeof(a));
    a.sin_family=AF_INET; a.sin_port=htons(PORT); a.sin_addr.s_addr=inet_addr("127.0.0.1");
    if(connect(s,(struct sockaddr*)&a,sizeof(a))!=0){ close(s); return -1; }
    struct timeval tv={3,0}; setsockopt(s,SOL_SOCKET,SO_RCVTIMEO,&tv,sizeof(tv));
    return s;
}
static int send_str(int s, const char* p){ size_t n=strlen(p); return send(s,p,n,0)==(ssize_t)n; }

/* 送一個 masked text frame（瀏覽器一律 mask，helper 也只處理 mask 過的）
   🔴 1.15.0：補上 **127 ＋ 八個 byte 長度**那一條分支。batchwrite 一則就是整段
   payload（8192 byte 的 JSON 陣列約 40 KB，測「太大要被明確拒絕」時更超過
   64 KB），沒有這條分支測試連請求都送不出去。 */
static void ws_send_n(int s, const char* text, size_t n){
    unsigned char h[14]; int hl=0, i;
    h[hl++]=0x81;
    if(n<126) h[hl++]=(unsigned char)(0x80|n);
    else if(n<65536){ h[hl++]=0x80|126; h[hl++]=(unsigned char)(n>>8); h[hl++]=(unsigned char)(n&0xFF); }
    else { h[hl++]=0x80|127; for(i=0;i<8;i++) h[hl++]=(unsigned char)((unsigned long long)n>>(56-i*8)); }
    unsigned char mask[4]={0x11,0x22,0x33,0x44};
    memcpy(h+hl,mask,4); hl+=4;
    send(s,h,(size_t)hl,0);
    {   unsigned char* b=(unsigned char*)malloc(n?n:1);
        size_t k; for(k=0;k<n;k++) b[k]=(unsigned char)(text[k]^mask[k&3]);
        {   size_t sent=0; while(sent<n){ ssize_t w=send(s,b+sent,n-sent,0); if(w<=0) break; sent+=(size_t)w; } }
        free(b); }
}
static void ws_send(int s, const char* text){ ws_send_n(s,text,strlen(text)); }
/* 收一個 text frame（helper 送的不 mask）。回傳 1＝有收到
   🔴 1.15.0：同樣補上 127 那一條 —— 讀取長度上限拿掉之後（1.14.0），
      回覆本來就可能超過 64 KB，而**送端當時沒有這條分支**（那正是 §10 在釘的 bug）。 */
static int ws_recv(int s, char* out, int cap){
    unsigned char h2[2];
    ssize_t r=recv(s,h2,2,MSG_WAITALL); if(r!=2) return 0;
    size_t len=h2[1]&0x7F;
    if(len==126){ unsigned char e[2]; if(recv(s,e,2,MSG_WAITALL)!=2) return 0; len=(size_t)((e[0]<<8)|e[1]); }
    else if(len==127){ unsigned char e[8]; int i; unsigned long long v=0;
        if(recv(s,e,8,MSG_WAITALL)!=8) return 0;
        for(i=0;i<8;i++) v=(v<<8)|e[i]; len=(size_t)v; }
    if((int)len>=cap) return 0;
    if(len && recv(s,out,len,MSG_WAITALL)!=(ssize_t)len) return 0;
    out[len]=0; return 1;
}
/* 建立連線並完成 WS 握手；回傳 socket（-1 失敗）。hello 放進 hello_out。 */
static int ws_open(char* hello_out, int cap){
    int s=tcp_connect(); if(s<0) return -1;
    const char* req=
        "GET /ws HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: http://127.0.0.1:18898\r\n"
        "Upgrade: websocket\r\nConnection: Upgrade\r\n"
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n";
    send_str(s,req);
    /* 🔴 握手回應與緊接著的 hello frame 常常黏在同一個 TCP 段裡。用 MSG_PEEK
       先看，**只消耗掉 HTTP header 那幾個 byte**，frame 留在 socket 裡交給
       ws_recv 正常解 —— 自己在緩衝區裡手切 frame 很容易切錯（第一版就切錯了，
       之後每一個回覆都晚一拍，看起來像 helper 回錯東西）。 */
    char buf[4096];
    for(;;){
        ssize_t n=recv(s,buf,sizeof(buf)-1,MSG_PEEK);
        if(n<=0){ close(s); return -1; }
        buf[n]=0;
        char* sep=strstr(buf,"\r\n\r\n");
        if(sep){
            size_t hdr=(size_t)(sep-buf)+4;
            if(!strstr(buf,"101 Switching Protocols")){ close(s); return -1; }
            char drain[4096]; recv(s,drain,hdr,MSG_WAITALL);   /* 只吃掉 header */
            break;
        }
        if(n>=(ssize_t)sizeof(buf)-1){ close(s); return -1; }
    }
    if(!ws_recv(s,hello_out,cap)) hello_out[0]=0;
    return s;
}
/* 送一個命令並收它的回覆 */
static int ws_cmd(int s, const char* json, char* out, int cap){
    ws_send(s,json);
    return ws_recv(s,out,cap);
}
/* 一般 HTTP GET，回整個回應 */
static int http_get(const char* path, char* out, int cap){
    int s=tcp_connect(); if(s<0) return 0;
    char req[512]; snprintf(req,sizeof(req),"GET %s HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",path);
    send_str(s,req);
    int got=0;
    for(;;){ ssize_t n=recv(s,out+got,(size_t)(cap-1-got),0); if(n<=0) break; got+=(int)n; if(got>=cap-1) break; }
    out[got]=0; close(s);
    return got>0;
}


static void jcmd(int s, const char* j, char* out, int cap){ if(!ws_cmd(s,j,out,cap)) snprintf(out,cap,"(no reply)"); }
static void set_rcv(int s, int ms){ struct timeval tv={ms/1000,(ms%1000)*1000}; setsockopt(s,SOL_SOCKET,SO_RCVTIMEO,&tv,sizeof(tv)); }
static double ms_now(void){ struct timespec t; clock_gettime(CLOCK_MONOTONIC,&t); return t.tv_sec*1000.0+t.tv_nsec/1e6; }
/* 收到下一個「不是 progress」的回覆 */
static int recv_result(int s, char* b, int cap){
    for(;;){ if(!ws_recv(s,b,cap)) return 0; if(!strstr(b,"\"type\":\"progress\"")) return 1; }
}
static int count_ch(const char* s, char c){ int n=0; for(;*s;s++) if(*s==c) n++; return n; }
int main(void){
    setvbuf(stdout,NULL,_IONBF,0);
    printf("== i2c_bridge.c 1.19.0：I2C 治具＋DP AUX 同時使用（模擬，未在 Windows 實機驗證）==\n");
    char dir[256], p[512];
    snprintf(dir,sizeof(dir),"/tmp/dgh_simul_%d_%ld/",(int)getpid(),(long)time(NULL));
    if(mkdir(dir,0755)!=0 && access(dir,W_OK)!=0){ printf("   FATAL  無法建立 %s\n",dir); return 2; }
    #define MKFILE(name,body) do{ snprintf(p,sizeof(p),"%s%s",dir,name); FILE* f=fopen(p,"wb"); \
        if(!f){ printf("   FATAL  無法寫入 %s\n",p); return 2; } fputs(body,f); fclose(f); }while(0)
    MKFILE("libMPSSE.dll","fake"); MKFILE("DLL_AUX_VC.dll","fake");
    dgh_shim_set_exe_dir(dir);
    dgh_fake_aux_reset(); dgh_fake_aux_r3e[0]=0x65; dgh_fake_aux_r3e[1]=0x07;   /* 1.22.0：原廠 Detect 要 3E:0000 checksum 不是 0000/FFFF */
    pthread_t th; pthread_create(&th,NULL,server_thread,NULL);
    msleep(400);
    char b[16384], hello[1024];
    int i;

    G("1. hello：proto 8、simul:true、兩條路各自的狀態");
    int J=ws_open(hello,sizeof(hello));
    CHECK(J>=0,"治具分頁 WebSocket 連得上"); if(J<0){ printf("%d/%d\n",total-fails,total); return 1; }
    CHECKS(hello,"\"proto\":9","proto 9（1.20.0）");
    CHECKS(hello,"\"simul\":true","simul:true（新網頁靠它判斷可以同時用）");
    CHECKS(hello,"\"jigBusy\":false","jigBusy:false"); CHECKS(hello,"\"auxBusy\":false","auxBusy:false");
    int A=ws_open(hello,sizeof(hello));
    CHECK(A>=0,"AUX 分頁 WebSocket 連得上");

    G("2. 🔴 兩個分頁各接一種：都成功，誰都不讓出");
    jcmd(J,"{\"type\":\"open\",\"id\":1,\"mode\":1,\"clockHz\":100000}",b,sizeof(b));
    CHECKS(b,"\"ok\":true","治具 open（mode 1）");
    EQ_I(dgh_fake_live,1,"治具 channel 開著");
    EQ_I(dgh_fast_read,1,"治具的 fastread＝1（mode 1）");
    { int rel=dgh_fake_aux_release_calls;
      jcmd(A,"{\"type\":\"open\",\"id\":2,\"mode\":4,\"fastread\":0,\"rawmpsse\":1,\"ckdelay\":7}",b,sizeof(b));
      CHECKS(b,"\"ok\":true","AUX open 成功（治具持有中也不回 busy）");
      CHECK(!strstr(b,"\"busy\":true"),"AUX open 沒有 busy");
      EQ_I(dgh_fake_live,1,"🔴 AUX 開啟後治具仍開著（1.18 會讓出 ⇒ 0）");
      CHECK(dgh_fake_aux_release_calls-rel<=1,"AUX 沒被 Release（1.21.0：開啟時逐台探測螢幕的那一次 Release 除外，同原廠 AutoDetect）"); }
    EQ_I(dgh_mode,1,"🔴 AUX 那頁的 open 沒改到治具的模式（仍是 1）");
    EQ_I(dgh_fast_read,1,"🔴 AUX 那頁送 fastread:0 沒改到治具（仍 1）");
    EQ_I(dgh_raw_mpsse,0,"🔴 AUX 那頁送 rawmpsse:1 沒改到治具（仍 0）");
    jcmd(J,"{\"type\":\"ping\",\"id\":3}",b,sizeof(b));
    CHECKS(b,"\"path\":\"jig\"","治具分頁 ping：path jig"); CHECKS(b,"\"owner\":true","治具分頁是治具的持有者");
    CHECKS(b,"\"jigBusy\":true","jigBusy:true"); CHECKS(b,"\"auxBusy\":true","auxBusy:true");
    jcmd(A,"{\"type\":\"ping\",\"id\":4}",b,sizeof(b));
    CHECKS(b,"\"path\":\"aux\"","AUX 分頁 ping：path aux"); CHECKS(b,"\"owner\":true","AUX 分頁是 AUX 的持有者");
    CHECKS(b,"\"auxOpen\":true","auxOpen:true");

    G("3. 交錯讀寫：兩條路輪流打，結果各自正確、交易從不重疊");
    dgh_fake_trace_reset(); dgh_fake_xact_us=2000;     /* 每筆寫入故意拖 2 ms，撐大交錯窗口 */
    { int okJ=0, okA=0, rdA=0;
      for(i=0;i<12;i++){
        char m[256];
        snprintf(m,sizeof(m),"{\"type\":\"rawwrite\",\"id\":%d,\"slave\":104,\"addr\":%d,\"awid\":2,\"data\":[%d,%d]}",100+i,0x100+i,i,i+1);
        ws_send(J,m);
        snprintf(m,sizeof(m),"{\"type\":\"rawwrite\",\"id\":%d,\"slave\":125,\"addr\":%d,\"awid\":2,\"data\":[%d]}",200+i,0x300+i,0x40+i);
        ws_send(A,m);
        snprintf(m,sizeof(m),"{\"type\":\"read\",\"id\":%d,\"slave\":125,\"addr\":%d,\"awid\":2,\"len\":1}",300+i,0x300+i);
        ws_send(A,m);
        if(recv_result(J,b,sizeof(b)) && strstr(b,"\"ok\":true")) okJ++;
        if(recv_result(A,b,sizeof(b)) && strstr(b,"\"ok\":true")) okA++;
        if(recv_result(A,b,sizeof(b))){ char want[32]; snprintf(want,sizeof(want),"\"data\":[%d]",0x40+i); if(strstr(b,want)) rdA++; }
      }
      EQ_I(okJ,12,"治具 12 筆寫入全部 ok");
      EQ_I(okA,12,"AUX 12 筆寫入全部 ok");
      EQ_I(rdA,12,"AUX 12 筆讀回都是自己剛寫的值（沒被治具那邊干擾）"); }
    EQ_I(dgh_fake_aux_r7d[0x30B],0x4B,"假 T-CON 7D:030B＝4B");
    CHECK(count_ch(dgh_fake_trace,'J')>=12,"紀錄裡有治具的交易");
    CHECK(count_ch(dgh_fake_trace,'A')>=12,"紀錄裡有 AUX 的交易");
    { const char* t=dgh_fake_trace; int sw=0; for(;t[0]&&t[1];t++) if(t[0]!=t[1]) sw++;
      CHECK(sw>=4,"兩條路真的交錯進行（不是一條做完才換另一條）");
      printf("        trace(前 60)＝%.60s  切換 %d 次\n", dgh_fake_trace, sw); }
    EQ_I(dgh_fake_overlaps,0,"🔴 兩筆交易從不重疊（一筆完成才換下一筆）");
    dgh_fake_xact_us=0;

    G("4. 🔴 T-CON lock：治具在跑一串時，AUX 的寫入排隊、順序不亂");
    jcmd(J,"{\"type\":\"lock\",\"id\":10,\"on\":1}",b,sizeof(b));
    CHECKS(b,"\"locked\":true","治具宣告 lock");
    dgh_fake_trace_reset(); dgh_fake_aux_r7e[0xAB]=0;
    ws_send(A,"{\"type\":\"rawwrite\",\"id\":11,\"slave\":126,\"addr\":171,\"awid\":1,\"data\":[205]}");
    ws_send(A,"{\"type\":\"ping\",\"id\":12}");
    set_rcv(A,300);
    CHECK(!ws_recv(A,b,sizeof(b)),"lock 期間 AUX 的寫入沒有回覆（在排隊）");
    EQ_I(dgh_fake_aux_r7e[0xAB],0,"lock 期間 7E:AB 沒被寫");
    for(i=0;i<3;i++){ char m[200]; snprintf(m,sizeof(m),"{\"type\":\"rawwrite\",\"id\":%d,\"slave\":104,\"addr\":%d,\"awid\":2,\"data\":[1]}",13+i,i);
        jcmd(J,m,b,sizeof(b)); CHECKS(b,"\"ok\":true","lock 期間治具自己的一串照常做"); }
    { double t0=ms_now();
      jcmd(J,"{\"type\":\"lock\",\"id\":16,\"on\":0}",b,sizeof(b));
      CHECKS(b,"\"locked\":false","治具解除 lock");
      set_rcv(A,3000);
      CHECK(ws_recv(A,b,sizeof(b)),"解除後 AUX 收到回覆");
      CHECKS(b,"\"id\":11","先回的是排隊的那一則寫入（順序沒亂）"); CHECKS(b,"\"ok\":true","寫入成功");
      CHECK(ms_now()-t0 < 1000,"解除後 1 秒內就做（不是等逾時）");
      CHECK(ws_recv(A,b,sizeof(b)),"後面那則 ping 也收到");
      CHECKS(b,"\"id\":12","ping 在寫入之後"); }
    EQ_I(dgh_fake_aux_r7e[0xAB],0xCD,"7E:AB 現在才是 CD");
    CHECK(strncmp(dgh_fake_trace,"JJJ",3)==0,"紀錄：治具那一串（JJJ）完整在前，AUX 沒插進中間");
    printf("        trace＝%.40s\n", dgh_fake_trace);

    G("5. 反過來：AUX 在跑一串時，治具的寫入排隊");
    jcmd(A,"{\"type\":\"lock\",\"id\":20,\"on\":1}",b,sizeof(b));
    CHECKS(b,"\"locked\":true","AUX 宣告 lock");
    dgh_fake_trace_reset();
    ws_send(J,"{\"type\":\"rawwrite\",\"id\":21,\"slave\":104,\"addr\":0,\"awid\":2,\"data\":[9]}");
    set_rcv(J,300);
    CHECK(!ws_recv(J,b,sizeof(b)),"AUX lock 期間治具的寫入在排隊");
    jcmd(A,"{\"type\":\"rawwrite\",\"id\":22,\"slave\":126,\"addr\":171,\"awid\":1,\"data\":[0]}",b,sizeof(b));
    CHECKS(b,"\"ok\":true","AUX 自己的寫入照常");
    jcmd(A,"{\"type\":\"lock\",\"id\":23,\"on\":0}",b,sizeof(b));
    set_rcv(J,3000);
    CHECK(ws_recv(J,b,sizeof(b)),"解除後治具收到回覆"); CHECKS(b,"\"id\":21","是排隊的那一則"); CHECKS(b,"\"ok\":true","寫入成功");
    CHECK(dgh_fake_trace[0]=='A' && strchr(dgh_fake_trace,'J')>strchr(dgh_fake_trace,'A'),"紀錄：AUX 先、治具後");

    G("6. 非持有者照舊直接回 busy（不排隊）；同一條路還是只能一個持有者");
    { int N=ws_open(hello,sizeof(hello));
      CHECKS(hello,"\"jigBusy\":true","新分頁 hello：jigBusy:true");
      CHECKS(hello,"\"auxBusy\":true","新分頁 hello：auxBusy:true");
      jcmd(J,"{\"type\":\"lock\",\"id\":30,\"on\":1}",b,sizeof(b));
      jcmd(N,"{\"type\":\"read\",\"id\":31,\"slave\":104,\"addr\":0,\"len\":1}",b,sizeof(b));
      CHECKS(b,"\"busy\":true","沒 open 的分頁讀取 ⇒ busy（立即，不排隊）");
      jcmd(N,"{\"type\":\"open\",\"id\":32,\"mode\":4}",b,sizeof(b));
      CHECKS(b,"\"busy\":true","第三個分頁開 AUX ⇒ busy（AUX 已有人持有）");
      jcmd(J,"{\"type\":\"lock\",\"id\":33,\"on\":0}",b,sizeof(b));
      close(N); msleep(150); }

    G("7. 排太久 ⇒ 明確錯誤 tconBusy、什麼都沒寫（約 6 秒）");
    jcmd(J,"{\"type\":\"lock\",\"id\":40,\"on\":1}",b,sizeof(b));
    dgh_fake_aux_r7e[0xAB]=0x11;
    { double t0=ms_now(), dt;
      ws_send(A,"{\"type\":\"rawwrite\",\"id\":41,\"slave\":126,\"addr\":171,\"awid\":1,\"data\":[205]}");
      set_rcv(A,9000);
      CHECK(ws_recv(A,b,sizeof(b)),"逾時後收到回覆");
      dt=ms_now()-t0;
      CHECKS(b,"\"tconBusy\":true","tconBusy:true"); CHECKS(b,"\"ok\":false","ok:false"); CHECKS(b,"Nothing was sent","講明什麼都沒送");
      CHECK(dt>5500 && dt<7900,"約 6 秒（小於網頁的 8 秒逾時）");
      printf("        等了 %.0f ms\n", dt); }
    EQ_I(dgh_fake_aux_r7e[0xAB],0x11,"7E:AB 沒被寫");
    jcmd(J,"{\"type\":\"lock\",\"id\":42,\"on\":0}",b,sizeof(b));
    set_rcv(A,3000);

    G("8. 🔴 一邊斷線，另一邊不受影響");
    { int rel=dgh_fake_aux_release_calls;
      close(J); msleep(300);
      EQ_I(dgh_fake_live,0,"治具分頁斷線 ⇒ 治具放掉");
      EQ_I(dgh_fake_aux_release_calls,rel,"🔴 AUX 沒被 Release（1.18 斷線會一起關）");
      jcmd(A,"{\"type\":\"rawwrite\",\"id\":50,\"slave\":126,\"addr\":171,\"awid\":1,\"data\":[205]}",b,sizeof(b));
      CHECKS(b,"\"ok\":true","AUX 照常寫"); }
    int J2=ws_open(hello,sizeof(hello));
    CHECKS(hello,"\"jigBusy\":false","治具空出來了"); CHECKS(hello,"\"auxBusy\":true","AUX 還被持有");
    jcmd(J2,"{\"type\":\"open\",\"id\":51,\"mode\":2,\"clockHz\":100000}",b,sizeof(b));
    CHECKS(b,"\"ok\":true","新的治具分頁開得起來（AUX 持有中）");
    { int rel=dgh_fake_aux_release_calls;
      close(A); msleep(300);
      EQ_I(dgh_fake_aux_release_calls,rel+1,"AUX 分頁斷線 ⇒ AUX Release()");
      EQ_I(dgh_fake_live,1,"🔴 治具仍開著");
      jcmd(J2,"{\"type\":\"read\",\"id\":52,\"slave\":104,\"addr\":0,\"len\":2}",b,sizeof(b));
      CHECKS(b,"\"ok\":true","治具照常讀"); }

    G("9. 持有 lock 的分頁斷線 ⇒ lock 跟著消失，排隊的馬上做");
    int A2=ws_open(hello,sizeof(hello));
    jcmd(A2,"{\"type\":\"open\",\"id\":60,\"mode\":4}",b,sizeof(b));
    CHECKS(b,"\"ok\":true","新的 AUX 分頁 open");
    jcmd(J2,"{\"type\":\"lock\",\"id\":61,\"on\":1}",b,sizeof(b));
    ws_send(A2,"{\"type\":\"rawwrite\",\"id\":62,\"slave\":126,\"addr\":171,\"awid\":1,\"data\":[1]}");
    msleep(200);
    { double t0=ms_now(); close(J2);
      set_rcv(A2,3000);
      CHECK(ws_recv(A2,b,sizeof(b)),"排隊的寫入有回覆"); CHECKS(b,"\"ok\":true","而且成功");
      CHECK(ms_now()-t0<1500,"lock 持有者斷線後很快就放行"); }

    G("10. 同一條路的接手只影響那一條路");
    { int J3=ws_open(hello,sizeof(hello)), A3=ws_open(hello,sizeof(hello));
      jcmd(J3,"{\"type\":\"open\",\"id\":70,\"mode\":2,\"clockHz\":100000}",b,sizeof(b));
      CHECKS(b,"\"ok\":true","治具 open");
      jcmd(A3,"{\"type\":\"open\",\"id\":71,\"mode\":4,\"takeover\":1}",b,sizeof(b));
      CHECKS(b,"\"ok\":true","AUX takeover 成功");
      msleep(200);
      jcmd(J3,"{\"type\":\"read\",\"id\":72,\"slave\":104,\"addr\":0,\"len\":1}",b,sizeof(b));
      CHECKS(b,"\"ok\":true","🔴 AUX 被接手，治具分頁不受影響");
      EQ_I(dgh_fake_live,1,"治具仍開著");
      jcmd(A3,"{\"type\":\"read\",\"id\":73,\"slave\":126,\"addr\":171,\"len\":1,\"awid\":1}",b,sizeof(b));
      CHECKS(b,"\"ok\":true","接手的 AUX 分頁讀得到");
      close(J3); close(A3); msleep(200); }
    close(A2);

    G("11. 🔴 第二個分頁被拒絕的 open 不可以改掉持有者的治具模式（1.18 以前就有的洞）");
    { int P=ws_open(hello,sizeof(hello)), Q=ws_open(hello,sizeof(hello));
      jcmd(P,"{\"type\":\"open\",\"id\":80,\"mode\":2,\"clockHz\":100000}",b,sizeof(b));
      CHECKS(b,"\"ok\":true","持有者 open mode 2（libMPSSE 逐 byte）");
      EQ_I(dgh_mode,2,"治具模式＝2");
      jcmd(Q,"{\"type\":\"open\",\"id\":81,\"mode\":0,\"fastread\":1,\"rawmpsse\":1}",b,sizeof(b));
      CHECKS(b,"\"busy\":true","第二個分頁的治具 open ⇒ busy");
      EQ_I(dgh_mode,2,"🔴 被拒的 open 沒有把模式改成 0（vendor）");
      EQ_I(dgh_fast_read,0,"🔴 fastread 沒被改"); EQ_I(dgh_raw_mpsse,0,"🔴 rawmpsse 沒被改");
      jcmd(P,"{\"type\":\"read\",\"id\":82,\"slave\":104,\"addr\":0,\"len\":2}",b,sizeof(b));
      CHECKS(b,"\"ok\":true","持有者照常讀（1.18 這裡會回 not open）");
      close(P); close(Q); msleep(200); }

    printf("\n🔴 驗不到：真 FTDI 治具與真顯示卡 AUX 同時打到同一片面板時的電氣／時序行為、Windows winsock（Windows 實機才有）。\n");
    printf("\n================================================================\n");
    printf("%s %d / %d\n", fails?"🔴 未通過":"✅ 全部通過", total-fails, total);
    return fails?1:0;
}

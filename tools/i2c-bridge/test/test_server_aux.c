/* ═══════════════════════════════════════════════════════════════════════════
   test_server_aux.c — 1.18.0 DP AUX：把出貨的 i2c_bridge.c 真的跑起來（同 test_server.c 的做法），
   用真 WebSocket 驗「同一支 bridge、同一套轉發」與「AUX 只到得了 T-CON，不能直寫 EEPROM」。
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
extern int dgh_fake_aux_edid_on; extern unsigned char dgh_fake_aux_edid[20][128];
extern int dgh_fake_wd_n; extern unsigned dgh_fake_wd_tech[8]; extern unsigned short dgh_fake_wd_mfg[8], dgh_fake_wd_prod[8]; extern char dgh_fake_wd_name[8][32];
static void mk_edid(unsigned char* e, const char* mfg, unsigned prod, const char* nm){
    unsigned m=((unsigned)(mfg[0]-'@')<<10)|((unsigned)(mfg[1]-'@')<<5)|(unsigned)(mfg[2]-'@'); int i;
    memset(e,0,128); e[1]=e[2]=e[3]=e[4]=e[5]=e[6]=0xFF; e[8]=(unsigned char)(m>>8); e[9]=(unsigned char)m; e[10]=(unsigned char)prod; e[11]=(unsigned char)(prod>>8);
    e[72+3]=0xFC; for(i=0;nm[i]&&i<13;i++) e[72+5+i]=(unsigned char)nm[i]; if(i<13) e[72+5+i]=0x0A; }
extern int dgh_fake_open_calls, dgh_fake_close_calls, dgh_fake_live, dgh_fake_writes, dgh_fake_reads;
extern int dgh_serve_files;   /* v1.7.0：靜態檔服務的開關（預設 0） */
extern int dgh_fast_read;     /* v1.8.0：讀取走不走 fast 路徑 */
extern unsigned dgh_fake_last_read_opts, dgh_fake_last_write_opts;
extern unsigned dgh_fake_read_status, dgh_fake_write_status;
extern unsigned char dgh_fake_last_write[64];
extern int dgh_fake_last_write_len;

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

#define PORT 18897
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
        "GET /ws HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: http://127.0.0.1:18897\r\n"
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
int main(void){
    setvbuf(stdout,NULL,_IONBF,0);
    printf("== i2c_bridge.c DP AUX 伺服器測試 ==\n");
    char dir[256], p[512];
    snprintf(dir,sizeof(dir),"/tmp/dgh_aux_%d_%ld/",(int)getpid(),(long)time(NULL));
    if(mkdir(dir,0755)!=0 && access(dir,W_OK)!=0){ printf("   FATAL  無法建立 %s\n",dir); return 2; }
    #define MKFILE(name,body) do{ snprintf(p,sizeof(p),"%s%s",dir,name); FILE* f=fopen(p,"wb"); \
        if(!f){ printf("   FATAL  無法寫入 %s\n",p); return 2; } fputs(body,f); fclose(f); }while(0)
    MKFILE("libMPSSE.dll","fake");
    dgh_shim_set_exe_dir(dir);
    dgh_fake_aux_reset();
    pthread_t th; pthread_create(&th,NULL,server_thread,NULL);
    msleep(400);
    char b[16384], hello[1024];
    int s=ws_open(hello,sizeof(hello));
    CHECK(s>=0,"WebSocket 連得上"); if(s<0){ printf("%d/%d\n",total-fails,total); return 1; }
    CHECKS(hello,"\"proto\":10","hello 回報 proto 10（1.23.0 起）");

    G("1. DLL 不在：清楚的錯誤，治具功能不受影響");
    jcmd(s,"{\"type\":\"open\",\"id\":1,\"mode\":4}",b,sizeof(b));
    CHECKS(b,"\"ok\":false","沒有 DLL_AUX_VC.dll ⇒ open 失敗");
    CHECKS(b,"DLL_AUX_VC.dll not found","錯誤訊息講出缺哪個檔、放哪裡");
    CHECKS(b,"\"auxDll\":false","auxDll:false");
    jcmd(s,"{\"type\":\"open\",\"id\":2,\"mode\":2,\"clockHz\":100000}",b,sizeof(b));
    CHECKS(b,"\"ok\":true","改回治具模式照常開得起來");
    jcmd(s,"{\"type\":\"read\",\"id\":3,\"slave\":104,\"addr\":0,\"len\":2}",b,sizeof(b));
    CHECKS(b,"\"ok\":true","治具讀取照常");
    EQ_I(dgh_fake_live,1,"治具 channel 開著（1）");

    G("2. 放好 DLL ⇒ AUX 開啟照原廠 EN01 UI：Detect 掃描（① 初始化＋3E:0000 checksum＋④ End）→ Initial＋① → Tcon_End ④");
    MKFILE("DLL_AUX_VC.dll","fake");
    dgh_fake_aux_r3e[0x0000]=0x65; dgh_fake_aux_r3e[0x0001]=0x07;   /* E503A3 實測的 3E:0000 開頭 */
    { int ps0=dgh_fake_aux_psr_sets;
    jcmd(s,"{\"type\":\"open\",\"id\":4,\"mode\":4}",b,sizeof(b));
    CHECKS(b,"\"ok\":true","AUX open 成功");
    CHECKS(b,"\"card\":\"INTEL\"","依介面卡名稱判成 INTEL");
    CHECKS(b,"\"monitor\":2","候選＝通過 checksum 的最後一台（假驅動只有 monitor 2）");
    CHECKS(b,"\"admin\":true","回報系統管理員");
    CHECKS(b,"\"psrTurnedOff\":false","1.22.0：不動 PSR（EN01 UI 沒有呼叫 GraphicsPsrEnable）");
    CHECKS(b,"\"rom\":\"eeprom\"","ROM 類型預設 EEPROM（ICDefine.cs:49）");
    CHECKS(b,"\"vendorSeq\":true","回報照原廠序列");
    EQ_I(dgh_fake_aux_psr_sets,ps0,"Set_PSR_State 一次都沒呼叫"); }
    EQ_I(dgh_fake_aux_last_proj,1,"projectIc 預設 1（EN01＝RAD81008 的 ProjectId）");
    EQ_I(dgh_fake_live,0,"切到 AUX 時治具已讓出");
    EQ_I(dgh_fake_aux_r3e[0x0065],0x1E,"① EEPROM 初始化寫了 3E:0065←1E（GPIO WP，Tcon81008.cs:333–355）");
    EQ_I(dgh_fake_aux_dpcd[0x482],0xC0,"④ End 之後 EEPROM 寫保護上鎖 482=C0");
    EQ_I(dgh_fake_aux_dpcd[0x4D1],0x00,"④ End：4D1=00");
    EQ_I(dgh_fake_aux_dpcd[0x480],0x00,"④ End：480=00");
    EQ_I(dgh_fake_aux_dpcd[0x439],0x04,"④ End：439=04");
    EQ_I(dgh_fake_aux_7e_cd,0,"開啟時不送 7E:AB←CD");
    {   char t[16384];
        jcmd(s,"{\"type\":\"auxtx\",\"id\":40,\"from\":0}",t,sizeof(t));
        CHECKS(t,"Detect scan","auxtx：有 Detect 掃描");
        CHECKS(t,"DPCD W 4D2=AD ok\",\"DPCD W 4D1=DA ok\",\"DPCD W 430=00 ok\",\"DPCD W 431=C3 ok\",\"DPCD W 436=A2 ok\",\"DPCD W 480=FF ok\",\"DPCD W 431=00 ok\",\"DPCD W 439=08 ok\",\"DPCD W 431=03 ok\",\"DPCD W 439=C0 ok\",\"DPCD W 430=00 65 ok\",\"DPCD W 435=1E ok\",\"DPCD W 482=80 ok\"",
               "auxtx：① 初始化 13 筆逐筆＝Tcon81008.cs:16–32");
        CHECKS(t,"DPCD W 430=00 00 ok\",\"DPCD R 435 -> 65 ok\",\"DPCD W 430=00 01 ok\",\"DPCD R 435 -> 07 ok\"","auxtx：checksum 讀 3E:0000、0001");
        CHECKS(t,"DPCD W 431=C3 ok\",\"DPCD W 436=A0 ok\",\"DPCD W 431=00 ok\",\"DPCD W 439=04 ok\",\"DPCD W 430=00 ok\",\"DPCD W 431=00 ok\",\"DPCD W 482=C0 ok\",\"DPCD W 4D1=00 ok\",\"DPCD W 480=00 ok\"",
               "auxtx：④ End 9 筆逐筆＝Tcon81008.cs:86–105");
        CHECKS(t,"Tcon_End (AuxChannelModuleBase.cs:107-110)","auxtx：連線最後做 Tcon_End");
    }

    G("2b. 多台螢幕：照原廠每台都初始化＋checksum，取最後一台通過的；別台第一筆寫失敗就跳過");
    {   int oldOk = dgh_fake_aux_ok_monitor;
        jcmd(s,"{\"type\":\"close\",\"id\":901}",b,sizeof(b));
        dgh_fake_aux_ok_mask = 0x3; dgh_fake_aux_tcon_monitor = 1;
        jcmd(s,"{\"type\":\"open\",\"id\":902,\"mode\":4}",b,sizeof(b));
        CHECKS(b,"\"ok\":true","兩台螢幕都 Initial OK ⇒ 開啟成功");
        CHECKS(b,"\"monitor\":1","選到 T-CON 那台（monitor 1）");
        CHECKS(b,"\"tconSeen\":true","回覆 tconSeen:true");
        dgh_fake_aux_r3e[0x207E]=0x11;
        jcmd(s,"{\"type\":\"read\",\"id\":903,\"slave\":62,\"addr\":8318,\"awid\":2,\"len\":1}",b,sizeof(b));
        CHECKS(b,"\"data\":[17]","在選到的那台讀 3E:207E＝11");
        jcmd(s,"{\"type\":\"close\",\"id\":904}",b,sizeof(b));
        dgh_fake_aux_tcon_monitor = 5;   /* 沒有一台是 T-CON */
        jcmd(s,"{\"type\":\"open\",\"id\":905,\"mode\":4}",b,sizeof(b));
        CHECKS(b,"\"ok\":false","沒有一台通過 checksum ⇒ 開啟失敗（原廠 Aux Open Fail）");
        CHECKS(b,"register checksum","錯誤訊息講原因");
        jcmd(s,"{\"type\":\"open\",\"id\":907,\"mode\":4,\"monitor\":0}",b,sizeof(b));
        CHECKS(b,"\"ok\":false","網頁指定別台螢幕 ⇒ ① 初始化寫不進去 ⇒ 開啟失敗");
        dgh_fake_aux_ok_mask = 0; dgh_fake_aux_tcon_monitor = -1; dgh_fake_aux_ok_monitor = oldOk;
        jcmd(s,"{\"type\":\"open\",\"id\":909,\"mode\":4}",b,sizeof(b));
        CHECKS(b,"\"ok\":true","還原單台設定後重新開啟（後面的測試照舊）");
    }
    G("3. 讀取照原廠 Tcon_Read_Register：3E 只走 DPCD 視窗；7C／7D 每個 byte ①＋MbusConnect＋讀＋④");
    {   char t[16384]; unsigned long n0; const char* q;
        jcmd(s,"{\"type\":\"auxtx\",\"id\":41,\"from\":0}",t,sizeof(t));
        q=strstr(t,"\"total\":"); n0 = q ? strtoul(q+8,NULL,10) : 0;
        dgh_fake_aux_r3e[0x207E]=0x11;
        jcmd(s,"{\"type\":\"read\",\"id\":7,\"slave\":62,\"addr\":8318,\"awid\":2,\"len\":1}",b,sizeof(b));
        CHECKS(b,"\"data\":[17]","3E:207E 讀回 0x11");
        { char j[96]; snprintf(j,sizeof(j),"{\"type\":\"auxtx\",\"id\":42,\"from\":%lu}",n0); jcmd(s,j,t,sizeof(t)); }
        CHECKS(t,"\"lines\":[\"== read 3E:207E (AuxApi.cs:420)\",\"DPCD W 430=20 7E ok\",\"DPCD R 435 -> 11 ok\"]","3E 讀：只有 430／435 兩筆，不初始化、不 End");
        q=strstr(t,"\"total\":"); n0 = q ? strtoul(q+8,NULL,10) : 0;
        dgh_fake_aux_r7c[0x95]=0x24; dgh_fake_aux_r7c[0x98]=0x00; dgh_fake_aux_r7c[0x0F]=0x00; dgh_fake_aux_r7e[0xAB]=0x00;
        { int cd0=dgh_fake_aux_7e_cd;
          jcmd(s,"{\"type\":\"read\",\"id\":8,\"slave\":124,\"addr\":149,\"awid\":1,\"len\":1}",b,sizeof(b));
          CHECKS(b,"\"data\":[36]","7C:95 讀回 24");
          EQ_I(dgh_fake_aux_7e_cd,cd0+1,"7C 讀一個 byte ⇒ 7E:AB←CD 送 1 次");
          EQ_I(dgh_fake_aux_r7c[0x0F],0x80,"MbusConnect 寫了 7C:0F←80"); }
        { char j[96]; snprintf(j,sizeof(j),"{\"type\":\"auxtx\",\"id\":43,\"from\":%lu}",n0); jcmd(s,j,t,sizeof(t)); }
        CHECKS(t,"\"== read 7C:95 (AuxApi.cs:420)\",\"-- init (eeprom, Tcon81008.cs:16-32)\",\"DPCD W 4D2=AD ok\"","7C 讀：先 ① 初始化");
        CHECKS(t,"\"DPCD W 482=80 ok\",\"-- MbusConnect (Tcon81008.cs:687-714)\",\"IOA W 7E:AB=CD ok\",\"DPCD W 431=0F ok\",\"DPCD W 434=80 ok\",\"DPCD W 431=95 ok\",\"DPCD R 434 -> 24 ok\",\"-- end (eeprom, Tcon81008.cs:86-105)\"","7C 讀：① → ③ → 431／434 → ④");
        CHECKS(t,"\"DPCD W 480=00 ok\"]","7C 讀：最後一筆是 ④ 的 480=00");
        { int cd0=dgh_fake_aux_7e_cd;
          jcmd(s,"{\"type\":\"read\",\"id\":81,\"slave\":124,\"addr\":149,\"awid\":1,\"len\":4}",b,sizeof(b));
          CHECKS(b,"\"ok\":true","7C:95..98 讀 4 byte");
          EQ_I(dgh_fake_aux_7e_cd,cd0+4,"4 個 byte ⇒ 7E:AB←CD 送 4 次（原廠每個 byte 都送）"); }
        dgh_fake_aux_7d_needs_mbus=1; dgh_fake_aux_r7d[0x7D]=0x04;
        { int cd0=dgh_fake_aux_7e_cd;
          jcmd(s,"{\"type\":\"read\",\"id\":9,\"slave\":125,\"addr\":125,\"awid\":2,\"len\":1}",b,sizeof(b));
          CHECKS(b,"\"data\":[4]","7D:007D＝04（E503A3）——要 M-Bus 導通的假板子也讀得到");
          EQ_I(dgh_fake_aux_7e_cd,cd0+1,"7D 讀一個 byte ⇒ 7E:AB←CD 送 1 次"); }
        dgh_fake_aux_7d_needs_mbus=0;
    }
    G("3b. 寫入照原廠 Tcon_Write_Register：3E 直接寫；7E 是 ①＋CheckAndWriteRegisterRomWP＋寫＋④，不補 7C:0F");
    {   int cd0=dgh_fake_aux_7e_cd;
        dgh_fake_aux_r7c[0x0F]=0x00;
        jcmd(s,"{\"type\":\"rawwrite\",\"id\":5,\"slave\":126,\"addr\":171,\"awid\":1,\"data\":[205]}",b,sizeof(b));
        CHECKS(b,"\"ok\":true","7E:AB←CD 寫入");
        EQ_I(dgh_fake_aux_r7e[0xAB],0xCD,"7E:AB 真的是 CD");
        EQ_I(dgh_fake_aux_7e_cd,cd0+1,"只送 1 次");
        EQ_I(dgh_fake_aux_r7c[0x0F],0x00,"不再自己補 7C:0F（原廠寫入不做 MbusConnect）");
        jcmd(s,"{\"type\":\"rawwrite\",\"id\":6,\"slave\":62,\"addr\":89,\"awid\":2,\"data\":[30,34]}",b,sizeof(b));
        CHECKS(b,"\"ok\":true","3E:0059 寫 2 byte");
        EQ_I(dgh_fake_aux_r3e[0x59],0x1E,"3E:0059=1E"); EQ_I(dgh_fake_aux_r3e[0x5A],0x22,"3E:005A=22");
    }

    G("3c. 7C 寫入照原廠 Tcon_Write_Register：① → 讀 3E:0000×2（RomWP 檢查）→ 431／434 → ④，0 筆 IOA、0 筆 7E");
    {   char t[16384]; unsigned long n0; const char* q; int cd0 = dgh_fake_aux_7e_cd, io0 = dgh_fake_aux_ioa_writes + dgh_fake_aux_ioa_reads;
        jcmd(s,"{\"type\":\"auxtx\",\"id\":44,\"from\":0}",t,sizeof(t));
        q=strstr(t,"\"total\":"); n0 = q ? strtoul(q+8,NULL,10) : 0;
        dgh_fake_aux_r7c[0x98]=0x00;
        jcmd(s,"{\"type\":\"rawwrite\",\"id\":45,\"slave\":124,\"addr\":152,\"awid\":1,\"data\":[0]}",b,sizeof(b));
        CHECKS(b,"\"ok\":true","寫 7C:98←00（同值）");
        EQ_I(dgh_fake_aux_r7c[0x98],0x00,"7C:98 仍是 00");
        EQ_I(dgh_fake_aux_7e_cd,cd0,"沒有送 7E:AB←CD（原廠寫入不 MbusConnect）");
        EQ_I(dgh_fake_aux_ioa_writes + dgh_fake_aux_ioa_reads,io0,"0 筆 IOA");
        { char j[96]; snprintf(j,sizeof(j),"{\"type\":\"auxtx\",\"id\":46,\"from\":%lu}",n0); jcmd(s,j,t,sizeof(t)); }
        CHECKS(t,"\"== write 7C:98=00 (AuxApi.cs:464)\",\"-- init (eeprom, Tcon81008.cs:16-32)\"","7C 寫：先 ① 初始化");
        CHECKS(t,"\"DPCD W 482=80 ok\",\"DPCD W 430=00 00 ok\",\"DPCD R 435 -> 65 ok\",\"DPCD W 430=00 01 ok\",\"DPCD R 435 -> 07 ok\",\"DPCD W 431=98 ok\",\"DPCD W 434=00 ok\",\"-- end (eeprom, Tcon81008.cs:86-105)\"","7C 寫：① → RomWP 讀 3E:0000×2（65 07 ⇒ 不寫 0065）→ 431＝98、434＝00 → ④");
        CHECKS(t,"\"DPCD W 480=00 ok\"]","7C 寫：最後一筆是 ④ 的 480=00");
        CHECK(strstr(t,"IOA")==NULL,"auxtx 這一段沒有任何 IOA");
    }

    G("4. 🔴 不能直接寫 EEPROM（Bruce 2026-10-23）");
    jcmd(s,"{\"type\":\"rawwrite\",\"id\":10,\"slave\":80,\"addr\":0,\"awid\":2,\"data\":[1,2,3]}",b,sizeof(b));
    CHECKS(b,"\"ok\":false","rawwrite 0x50 被擋"); CHECKS(b,"EEPROM","錯誤訊息講明是 EEPROM");
    dgh_fake_aux_ee_hits=0;
    jcmd(s,"{\"type\":\"read\",\"id\":11,\"slave\":80,\"addr\":0,\"awid\":2,\"len\":8}",b,sizeof(b));
    CHECKS(b,"\"ok\":true","read 0x50 照原廠 Tcon_Read_Rom（只讀）"); CHECKS(b,"238,238","讀回假 EEPROM 的資料");
    EQ_I(dgh_fake_aux_ee_hits,2,"8 byte ＝ 一個 8 byte 區塊（Intel：offset＋讀）"); dgh_fake_aux_ee_hits=0;
    jcmd(s,"{\"type\":\"batchwrite\",\"id\":12,\"slave\":80,\"addr\":0,\"awid\":2,\"page\":16,\"twr\":5,\"len\":32,\"data\":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]}",b,sizeof(b));
    while(strstr(b,"\"type\":\"progress\"")) { if(!ws_recv(s,b,sizeof(b))) break; }
    CHECKS(b,"\"ok\":false","batchwrite 0x50 被擋"); CHECKS(b,"\"done\":0","一個 byte 都沒寫");
    jcmd(s,"{\"type\":\"rawwrite\",\"id\":13,\"slave\":87,\"addr\":0,\"awid\":1,\"data\":[9]}",b,sizeof(b));
    CHECKS(b,"\"ok\":false","0x57（EEPROM 區最後一個）也擋");
    jcmd(s,"{\"type\":\"write\",\"id\":14,\"slave\":80,\"addr\":4608,\"data\":[1]}",b,sizeof(b));
    CHECKS(b,"\"ok\":false","dg 的 write（白名單位址）打 0x50 也擋");
    jcmd(s,"{\"type\":\"rawwrite\",\"id\":15,\"slave\":104,\"addr\":0,\"awid\":2,\"data\":[1]}",b,sizeof(b));
    CHECKS(b,"not a T-CON","0x68 不在 AUX 白名單");
    EQ_I(dgh_fake_aux_ee_hits,0,"寫入：假 EEPROM 一次都沒被碰到");
    jcmd(s,"{\"type\":\"dpcdwrite\",\"id\":16,\"addr\":1154,\"data\":[128]}",b,sizeof(b));
    CHECKS(b,"\"blocked\":true","dpcdwrite 0x482（EEPROM 寫保護）擋");
    EQ_I(dgh_fake_aux_dpcd[0x482],0xC0,"0x482 沒被網頁改（仍是 End 後的 C0）");
    jcmd(s,"{\"type\":\"dpcdwrite\",\"id\":17,\"addr\":1150,\"data\":[1,2,3]}",b,sizeof(b));
    CHECKS(b,"\"blocked\":true","跨進 0x480 的也擋");

    G("5. dpcdread／dpcdwrite／psr");
    jcmd(s,"{\"type\":\"dpcdread\",\"id\":18,\"addr\":1213,\"len\":1}",b,sizeof(b));
    CHECKS(b,"\"ok\":true","dpcdread 0x4BD");
    jcmd(s,"{\"type\":\"dpcdwrite\",\"id\":19,\"addr\":256,\"data\":[10]}",b,sizeof(b));
    CHECKS(b,"\"ok\":true","dpcdwrite 0x100 放行"); EQ_I(dgh_fake_aux_dpcd[0x100],10,"真的寫進去");
    jcmd(s,"{\"type\":\"psr\",\"id\":20}",b,sizeof(b));
    CHECKS(b,"\"supported\":true","psr 讀：supported");
    { char h2[1024]; int s2=ws_open(h2,sizeof(h2));
      jcmd(s2,"{\"type\":\"dpcdread\",\"id\":21,\"addr\":0,\"len\":1}",b,sizeof(b));
      CHECKS(b,"\"busy\":true","非持有者不能用 dpcdread");
      jcmd(s2,"{\"type\":\"rawwrite\",\"id\":22,\"slave\":62,\"addr\":89,\"awid\":2,\"data\":[0]}",b,sizeof(b));
      CHECKS(b,"\"busy\":true","非持有者不能寫 T-CON");
      close(s2); msleep(150); }
    jcmd(s,"{\"type\":\"chandiag\",\"id\":23}",b,sizeof(b));
    CHECKS(b,"not available in DP AUX mode","chandiag 在 AUX 模式明確拒絕");

    G("6. 關閉：照原廠 AuxApi.Release，只 Release，不另外做 End／還原");
    { int rel=dgh_fake_aux_release_calls, dw=dgh_fake_aux_dpcd_writes;
      jcmd(s,"{\"type\":\"close\",\"id\":24}",b,sizeof(b));
      CHECKS(b,"\"ok\":true","close");
      EQ_I(dgh_fake_aux_release_calls,rel+1,"Release() 被呼叫");
      EQ_I(dgh_fake_aux_dpcd_writes,dw,"關閉時一筆 DPCD 寫入都沒有"); }

    G("7. 非系統管理員＋寫入失敗 ⇒ 錯誤訊息教他怎麼做");
    dgh_shim_is_admin=0;
    jcmd(s,"{\"type\":\"open\",\"id\":25,\"mode\":4,\"tconinit\":0}",b,sizeof(b));
    CHECKS(b,"\"admin\":false","admin:false 回報給網頁");
    dgh_fake_aux_fail_writes=1;
    jcmd(s,"{\"type\":\"rawwrite\",\"id\":26,\"slave\":62,\"addr\":89,\"awid\":2,\"data\":[0]}",b,sizeof(b));
    CHECKS(b,"\"ok\":false","寫入失敗如實回報"); CHECKS(b,"administrator","訊息講到要用系統管理員執行");
    dgh_fake_aux_fail_writes=0; dgh_shim_is_admin=1;

    G("8. 切回治具：AUX 被放掉");
    { int rel=dgh_fake_aux_release_calls;
      jcmd(s,"{\"type\":\"open\",\"id\":27,\"mode\":2,\"clockHz\":100000}",b,sizeof(b));
      CHECKS(b,"\"ok\":true","治具 open");
      EQ_I(dgh_fake_aux_release_calls,rel+1,"切模式時 AUX Release()");
      EQ_I(dgh_fake_live,1,"治具重新拿到"); }
    jcmd(s,"{\"type\":\"dpcdread\",\"id\":28,\"addr\":0,\"len\":1}",b,sizeof(b));
    CHECKS(b,"DP AUX is not open","治具模式下 dpcdread 明確拒絕");

    G("9. 斷線也要放掉 AUX");
    jcmd(s,"{\"type\":\"open\",\"id\":29,\"mode\":4}",b,sizeof(b));
    { int rel=dgh_fake_aux_release_calls; close(s); msleep(300);
      EQ_I(dgh_fake_aux_release_calls,rel+1,"分頁斷線 ⇒ Release()"); }

    G("10. 1.23.0 raw（DPCD／IOA 工具）：auxlist 只 Initial／Release；raw open 不初始化；i2craw／ioaread");
    {   char h3[1024]; int s3=ws_open(h3,sizeof(h3)), s4, dw0, ini0, rel0;
        CHECK(s3>=0,"新連線");
        dgh_fake_aux_ok_mask = 0x5;   /* monitor 0、2 Initial OK */
        /* monitor 0 ＝ 筆電內建 BOE（Windows：internal）；monitor 2 ＝ 外接 DEL（Windows：DisplayPort external） */
        dgh_fake_aux_edid_on=1; mk_edid(dgh_fake_aux_edid[0],"BOE",0x09E5,"NE160QDM"); mk_edid(dgh_fake_aux_edid[2],"DEL",0xA0F4,"DELL U2720Q");
        dgh_fake_wd_n=2; dgh_fake_wd_tech[0]=0x80000000u; dgh_fake_wd_mfg[0]=(unsigned short)((dgh_fake_aux_edid[0][8]<<8)|dgh_fake_aux_edid[0][9]); dgh_fake_wd_prod[0]=0x09E5; snprintf(dgh_fake_wd_name[0],32,"%s","");
        dgh_fake_wd_tech[1]=10u; dgh_fake_wd_mfg[1]=(unsigned short)((dgh_fake_aux_edid[2][9]<<8)|dgh_fake_aux_edid[2][8]); dgh_fake_wd_prod[1]=0xA0F4; snprintf(dgh_fake_wd_name[1],32,"%s","DELL U2720Q");
        dw0=dgh_fake_aux_dpcd_writes; ini0=dgh_fake_aux_init_calls; rel0=dgh_fake_aux_release_calls;
        jcmd(s3,"{\"type\":\"auxlist\",\"id\":1001}",b,sizeof(b));
        CHECKS(b,"\"ok\":true","auxlist ok");
        CHECKS(b,"{\"card\":0,\"cardName\":\"INTEL\",\"monitor\":0,","auxlist 列出 monitor 0（GPU INTEL）");
        CHECKS(b,"{\"card\":0,\"cardName\":\"INTEL\",\"monitor\":2,","auxlist 列出 monitor 2");
        CHECKS(b,"\"edid\":{\"mfg\":\"BOE\",\"prod\":\"09E5\",\"name\":\"NE160QDM\"},\"tcon43c\":null,\"win\":{\"gdi\":\"\\\\\\\\.\\\\DISPLAY1\",\"name\":\"\",\"tech\":\"INTERNAL\",\"techId\":2147483648}","monitor 0：EDID BOE，Windows 原話 INTERNAL、\\\\.\\DISPLAY1");
        CHECK(strstr(b,"\"conn\"")==NULL && strstr(b,"internal\"")==NULL && strstr(b,"external\"")==NULL,"不下內建／外接結論（沒有 conn 欄、沒有 internal／external 字樣）");
        CHECKS(b,"\"name\":\"DELL U2720Q\",\"tech\":\"DISPLAYPORT_EXTERNAL\",\"techId\":10}","monitor 2：Windows 名稱＋DISPLAYPORT_EXTERNAL（EDID 廠商碼兩種位元組順序都對得到）");
        CHECKS(b,"\"windows\":[{\"gdi\":\"\\\\\\\\.\\\\DISPLAY1\",\"name\":\"\",\"tech\":\"INTERNAL\"","回覆附上 Windows 的輸出清單");
        CHECKS(b,"\"tcon43c\":null","沒帶 tcon:1 ⇒ 不讀 0x43C");
        EQ_I(dgh_fake_aux_dpcd_writes,dw0,"auxlist：0 筆 DPCD 寫入");
        EQ_I(dgh_fake_aux_init_calls-ini0,20,"auxlist：20 台各試一次 Initial");
        EQ_I(dgh_fake_aux_release_calls-rel0,2,"Initial OK 的兩台各 Release 一次");
        dgh_fake_aux_dpcd[0x43C]=0xE5; dgh_fake_aux_dpcd[0x43D]=0x03;
        jcmd(s3,"{\"type\":\"auxlist\",\"id\":1030,\"tcon\":1}",b,sizeof(b));
        CHECKS(b,"\"tcon43c\":[229,3]","tcon:1 ⇒ 讀 0x43C（唯讀）＝ E5 03");
        EQ_I(dgh_fake_aux_dpcd_writes,dw0,"Check 我家 TCON：0 筆 DPCD 寫入");
        dgh_fake_wd_n=0;
        jcmd(s3,"{\"type\":\"auxlist\",\"id\":1031}",b,sizeof(b));
        CHECKS(b,"\"win\":null,\"winWhy\":\"no Windows display info\"","Windows API 沒資料 ⇒ win:null（網頁不顯示那一欄）");
        dgh_fake_aux_edid_on=0;
        jcmd(s3,"{\"type\":\"auxlist\",\"id\":1032}",b,sizeof(b));
        CHECKS(b,"\"edid\":null","EDID 讀不到 ⇒ edid:null");
        CHECKS(b,"\"win\":null","EDID 讀不到 ⇒ 不附 Windows 資訊");
        jcmd(s3,"{\"type\":\"open\",\"id\":1002,\"mode\":4,\"raw\":1}",b,sizeof(b));
        CHECKS(b,"\"ok\":false","raw open 沒帶 card／monitor ⇒ 拒絕");
        dw0=dgh_fake_aux_dpcd_writes;
        jcmd(s3,"{\"type\":\"open\",\"id\":1003,\"mode\":4,\"raw\":1,\"card\":0,\"monitor\":0}",b,sizeof(b));
        CHECKS(b,"\"ok\":true","raw open monitor 0（不是 T-CON 那台也開得起來）");
        CHECKS(b,"\"raw\":true","回覆 raw:true"); CHECKS(b,"\"vendorSeq\":false","回覆 vendorSeq:false"); CHECKS(b,"\"monitor\":0","monitor 0");
        EQ_I(dgh_fake_aux_dpcd_writes,dw0,"raw open：0 筆 DPCD 寫入（不初始化、不 End）");
        jcmd(s3,"{\"type\":\"read\",\"id\":1004,\"slave\":62,\"addr\":0,\"awid\":2,\"len\":1}",b,sizeof(b));
        CHECKS(b,"\"raw\":true","raw 連線下 T-CON 序列讀取被拒"); EQ_I(dgh_fake_aux_dpcd_writes,dw0,"被拒：0 筆寫入");
        jcmd(s3,"{\"type\":\"rawwrite\",\"id\":1005,\"slave\":62,\"addr\":0,\"awid\":2,\"data\":[1]}",b,sizeof(b));
        CHECKS(b,"\"raw\":true","raw 連線下 rawwrite 被拒");
        dgh_fake_aux_dpcd[0]=0x14;
        jcmd(s3,"{\"type\":\"dpcdread\",\"id\":1006,\"addr\":0,\"len\":1}",b,sizeof(b));
        CHECKS(b,"\"data\":[20]","dpcdread 0x000 ＝ 0x14（DPCD 1.4）");
        jcmd(s3,"{\"type\":\"dpcdwrite\",\"id\":1007,\"addr\":257,\"data\":[7]}",b,sizeof(b));
        CHECKS(b,"\"ok\":true","dpcdwrite 0x101"); EQ_I(dgh_fake_aux_dpcd[0x101],7,"寫進去");
        dgh_fake_aux_r7e[0xAB]=0x5A;
        jcmd(s3,"{\"type\":\"i2craw\",\"id\":1008,\"dir\":\"w\",\"addr\":126,\"data\":[171],\"mot\":1}",b,sizeof(b));
        CHECKS(b,"\"ok\":true","i2craw 寫 0x7E offset AB（MOT=1）");
        jcmd(s3,"{\"type\":\"i2craw\",\"id\":1009,\"dir\":\"r\",\"addr\":126,\"len\":1,\"mot\":0}",b,sizeof(b));
        CHECKS(b,"\"data\":[90]","i2craw 讀 0x7E ＝ 5A");
        { int ee=dgh_fake_aux_ee_hits;
          jcmd(s3,"{\"type\":\"i2craw\",\"id\":1010,\"dir\":\"w\",\"addr\":80,\"data\":[0,0]}",b,sizeof(b));
          CHECKS(b,"\"blocked\":true","i2craw 寫 0x50（EEPROM）擋"); EQ_I(dgh_fake_aux_ee_hits,ee,"假 EEPROM 沒被碰"); }
        jcmd(s3,"{\"type\":\"i2craw\",\"id\":1011,\"dir\":\"r\",\"addr\":80,\"len\":8}",b,sizeof(b));
        CHECKS(b,"238,238","i2craw 讀 0x50 放行（只讀）");
        jcmd(s3,"{\"type\":\"ioaread\",\"id\":1012,\"slave\":126,\"obytes\":1,\"start\":171,\"len\":1}",b,sizeof(b));
        CHECKS(b,"\"data\":[90]","ioaread 7E:AB ＝ 5A");
        jcmd(s3,"{\"type\":\"i2craw\",\"id\":1013,\"dir\":\"x\",\"addr\":126,\"len\":1}",b,sizeof(b));
        CHECKS(b,"\"ok\":false","dir 不合法 ⇒ 拒絕");
        s4=ws_open(h3,sizeof(h3));
        jcmd(s4,"{\"type\":\"auxlist\",\"id\":1014}",b,sizeof(b));
        CHECKS(b,"\"busy\":true","別的連線持有 AUX ⇒ auxlist 不碰");
        jcmd(s4,"{\"type\":\"i2craw\",\"id\":1015,\"dir\":\"r\",\"addr\":126,\"len\":1}",b,sizeof(b));
        CHECKS(b,"\"busy\":true","非持有者不能 i2craw");
        close(s4); msleep(150);
        dw0=dgh_fake_aux_dpcd_writes;
        jcmd(s3,"{\"type\":\"auxlist\",\"id\":1016}",b,sizeof(b));
        CHECKS(b,"\"monitor\":2","持有者 auxlist：照樣列出");
        jcmd(s3,"{\"type\":\"dpcdread\",\"id\":1017,\"addr\":0,\"len\":1}",b,sizeof(b));
        CHECKS(b,"\"data\":[20]","auxlist 之後原本那台重新 Initial，照常讀得到");
        EQ_I(dgh_fake_aux_dpcd_writes,dw0,"持有者 auxlist：0 筆 DPCD 寫入");
        snprintf(dgh_shim_adapter,sizeof(dgh_shim_adapter),"%s","AMD Radeon(TM) Graphics");
        jcmd(s3,"{\"type\":\"open\",\"id\":1018,\"mode\":4,\"raw\":1,\"card\":1,\"monitor\":2}",b,sizeof(b));
        jcmd(s3,"{\"type\":\"close\",\"id\":1019}",b,sizeof(b));
        jcmd(s3,"{\"type\":\"open\",\"id\":1020,\"mode\":4,\"raw\":1,\"card\":1,\"monitor\":2}",b,sizeof(b));
        CHECKS(b,"\"card\":\"AMD\"","raw open AMD monitor 2");
        jcmd(s3,"{\"type\":\"i2craw\",\"id\":1021,\"dir\":\"r\",\"addr\":126,\"len\":1}",b,sizeof(b));
        CHECKS(b,"\"amd\":true","AMD：i2craw 讀拒絕（I2C_Read 是空函式），指向 ioaread");
        jcmd(s3,"{\"type\":\"ioaread\",\"id\":1022,\"slave\":126,\"obytes\":1,\"start\":171,\"len\":1}",b,sizeof(b));
        CHECKS(b,"\"data\":[90]","AMD：ioaread 照常");
        dw0=dgh_fake_aux_dpcd_writes;
        jcmd(s3,"{\"type\":\"open\",\"id\":1023,\"mode\":4}",b,sizeof(b));
        CHECKS(b,"\"raw\":false","同一連線改回一般 AUX ⇒ 照原廠序列重開（raw:false）");
        CHECK(dgh_fake_aux_dpcd_writes>dw0,"一般 AUX 重開才有初始化寫入");
        snprintf(dgh_shim_adapter,sizeof(dgh_shim_adapter),"%s","Intel(R) Iris(R) Xe Graphics");
        dgh_fake_aux_ok_mask = 0;
        close(s3); msleep(200);
    }

    printf("\n================================================================\n");
    printf("%s %d / %d\n", fails?"🔴 未通過":"✅ 全部通過", total-fails, total);
    return fails?1:0;
}

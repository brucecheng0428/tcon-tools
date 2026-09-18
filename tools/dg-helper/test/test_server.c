/* ═══════════════════════════════════════════════════════════════════════════
   test_server.c — 把**出貨的那份 dg_helper.c**真的跑起來，用真的 TCP 連線驗它
   ───────────────────────────────────────────────────────────────────────────
   🔴 為什麼非要這一支不可：v1.4.x 的「一個頁面把另一個頁面鎖死」是編得過、
      純函式測試全綠、code review 也看不出來的錯 —— accept 迴圈阻塞在
      serve_ws 裡，只有**真的開兩條連線**才看得到。Bruce 2026-09-18 實測踩到，
      這支就是把那個情境變成可重跑的測試。

   做法：用 shim/ 讓 dg_helper.c 一個字不改地在 Linux 上編起來（`-Dmain=dgh_main`
   只改進入點名稱），在背景執行緒跑它的 main，然後用真的 socket 當 client。

   驗得到（下面每一條都有斷言）：
     · 兩條連線同時存在時，HTTP 還端得出檔案（v1.4.x 的致命傷）
     · WebSocket 握手、hello、ping/open/read/rawwrite/close 的回覆
     · I2C channel 擁有權：被佔時回 busy=true、非持有者不能讀寫
     · 接手（takeover）：舊持有者收到 taken 並被斷線，新的成為持有者
     · **斷線釋放**：正常關閉／異常斷線（RST）／client 逾時，三種都要把
       channel 放掉（用假 libMPSSE 的 open/close 計數與 live 數驗）
     · 入口頁只列出真的存在的工具頁，且自己不碰 I2C
     · 🔴 §8 **helper 只開一次**：兩頁來回接手，server 全程不重啟（Bruce 2026-09-18）
     · 🔴 §9 **忙碌中拒絕接手**（lock，proto 3）：量測進行中不可以被切分頁打斷；
       非持有者不能改 lock；持有者斷線時 lock 必須跟著消失

   🔴 驗不到（沒有 Windows、沒有 FTDI 治具，不做假探針）：
     · 真正的 D2XX／libMPSSE．dll 載入與呼叫（這裡是假的）
     · 真正的 I2C 波形與真 TCON 的回應
     · Windows 上 select()／winsock 的實際行為（這裡跑的是 POSIX socket）
       —— shim 只翻譯了 nfds 與 SO_RCVTIMEO 兩處已知語意差異
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
static void G(const char* n){ printf("\n-- %s %s\n", n, "------------------------------------"); }

#define PORT 18899
static void msleep(int ms){ struct timespec t={ms/1000,(long)(ms%1000)*1000000L}; nanosleep(&t,NULL); }

static void* server_thread(void* arg){
    (void)arg;
    char portarg[64]; snprintf(portarg,sizeof(portarg),"--port=%d",PORT);
    char* argv[]={(char*)"dg-helper", portarg, NULL};
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

/* 送一個 masked text frame（瀏覽器一律 mask，helper 也只處理 mask 過的） */
static void ws_send(int s, const char* text){
    size_t n=strlen(text);
    unsigned char h[8]; int hl=0;
    h[hl++]=0x81;
    if(n<126) h[hl++]=(unsigned char)(0x80|n);
    else { h[hl++]=0x80|126; h[hl++]=(unsigned char)(n>>8); h[hl++]=(unsigned char)(n&0xFF); }
    unsigned char mask[4]={0x11,0x22,0x33,0x44};
    memcpy(h+hl,mask,4); hl+=4;
    send(s,h,(size_t)hl,0);
    unsigned char* b=(unsigned char*)malloc(n?n:1);
    for(size_t i=0;i<n;i++) b[i]=(unsigned char)(text[i]^mask[i&3]);
    send(s,b,n,0); free(b);
}
/* 收一個 text frame（helper 送的不 mask）。回傳 1＝有收到 */
static int ws_recv(int s, char* out, int cap){
    unsigned char h2[2];
    ssize_t r=recv(s,h2,2,MSG_WAITALL); if(r!=2) return 0;
    size_t len=h2[1]&0x7F;
    if(len==126){ unsigned char e[2]; if(recv(s,e,2,MSG_WAITALL)!=2) return 0; len=(size_t)((e[0]<<8)|e[1]); }
    if((int)len>=cap) return 0;
    if(len && recv(s,out,len,MSG_WAITALL)!=(ssize_t)len) return 0;
    out[len]=0; return 1;
}
/* 建立連線並完成 WS 握手；回傳 socket（-1 失敗）。hello 放進 hello_out。 */
static int ws_open(char* hello_out, int cap){
    int s=tcp_connect(); if(s<0) return -1;
    const char* req=
        "GET /ws HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: http://127.0.0.1:18899\r\n"
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

int main(void){
    setvbuf(stdout,NULL,_IONBF,0);   /* 卡住時也要看得到已經跑到哪 */
    printf("== dg_helper.c 真實伺服器測試（shim 讓出貨原始碼原封在 Linux 上跑）==\n");

    /* exe 旁的資料夾：放一顆假的 libMPSSE.dll 與兩個工具頁 */
    char dir[256]; snprintf(dir,sizeof(dir),"/tmp/dgh_test_%d/",(int)getpid());
    mkdir(dir,0755);
    char p[512];
    snprintf(p,sizeof(p),"%slibMPSSE.dll",dir); { FILE* f=fopen(p,"wb"); fputs("fake",f); fclose(f); }
    snprintf(p,sizeof(p),"%sdg-measure.html",dir); { FILE* f=fopen(p,"wb"); fputs("<html>DGMEASURE-MARKER</html>",f); fclose(f); }
    snprintf(p,sizeof(p),"%si2c.html",dir); { FILE* f=fopen(p,"wb"); fputs("<html>I2CPAGE-MARKER</html>",f); fclose(f); }
    dgh_shim_set_exe_dir(dir);

    pthread_t th; pthread_create(&th,NULL,server_thread,NULL);
    msleep(400);

    char buf[8192], hello[1024];

    G("0. 啟動");
    CHECK(dgh_shim_browser_opened==1, "啟動時開了一次瀏覽器");
    CHECKS(dgh_shim_browser_url, "http://127.0.0.1:18899/", "瀏覽器開的是入口頁 /（不是 dg-measure.html）");
    CHECK(strstr(dgh_shim_browser_url,"dg-measure")==NULL, "🔴 啟動不再直接開 dg-measure.html（這正是搶 channel 的來源）");

    G("1. 入口頁");
    CHECK(http_get("/",buf,sizeof(buf)), "GET / 有回應");
    CHECKS(buf,"200 OK","入口頁回 200");
    CHECKS(buf,"/dg-measure.html","入口頁列出 DG 量測頁");
    CHECKS(buf,"/i2c.html","入口頁列出 I2C 測試頁");
    /* 🔴 啟動時的 diag_ftdi() 會探一次 open/close 來分辨 J（沒治具）與 U（被佔），
       所以 open 呼叫數本來就不是 0。真正要釘的是「沒有人持有 channel」。 */
    CHECK(dgh_fake_live==0, "🔴 入口頁自己不碰 I2C（沒有任何 channel 開著）");
    CHECK(http_get("/i2c.html",buf,sizeof(buf)) && strstr(buf,"I2CPAGE-MARKER")!=NULL, "GET /i2c.html 拿到 i2c 頁");
    CHECK(http_get("/dg-measure.html",buf,sizeof(buf)) && strstr(buf,"DGMEASURE-MARKER")!=NULL, "GET /dg-measure.html 拿到 dg 頁");
    CHECK(http_get("/dg_helper.c",buf,sizeof(buf)) && strstr(buf,"404")!=NULL, "副檔名白名單外的檔案回 404");

    G("2. 🔴 兩條連線並存時 HTTP 還端得出檔案（v1.4.x 的致命傷）");
    int A=ws_open(hello,sizeof(hello));
    CHECK(A>=0, "client A 握手成功");
    CHECKS(hello,"\"type\":\"hello\"","A 收到 hello");
    CHECKS(hello,"\"proto\":3","hello 回報 proto 3");
    /* 🔴 就是這一條。v1.4.x 在 A 的 WS 開著時卡在 serve_ws 的 recv 迴圈裡，
       這個 GET 會一直躺在 backlog、永遠不回 —— 使用者看到的就是「打不開」。 */
    CHECK(http_get("/i2c.html",buf,sizeof(buf)) && strstr(buf,"I2CPAGE-MARKER")!=NULL,
          "🔴 A 的 WebSocket 開著時，/i2c.html 仍然載得進來");
    int B=ws_open(hello,sizeof(hello));
    CHECK(B>=0, "🔴 A 還連著時，client B 也能建立 WebSocket");

    G("3. I2C channel 擁有權");
    CHECK(ws_cmd(A,"{\"type\":\"open\",\"id\":1,\"clockHz\":150000}",buf,sizeof(buf)), "A open 有回覆");
    CHECKS(buf,"\"ok\":true","A open 成功");
    CHECK(dgh_fake_live==1, "channel 實際開著（live=1）");
    CHECK(ws_cmd(B,"{\"type\":\"open\",\"id\":1}",buf,sizeof(buf)), "B open 有回覆");
    CHECKS(buf,"\"ok\":false","B open 失敗（已被 A 持有）");
    CHECKS(buf,"\"busy\":true","🔴 B 拿到可判別的 busy 旗標，不是靜默失敗");
    CHECK(dgh_fake_live==1, "被拒絕不會影響 A 的 channel");
    /* 非持有者不得讀寫 */
    CHECK(ws_cmd(B,"{\"type\":\"read\",\"id\":2,\"slave\":104,\"addr\":0,\"len\":3}",buf,sizeof(buf)), "B read 有回覆");
    CHECKS(buf,"\"busy\":true","非持有者的 read 被擋且標明 busy");
    CHECK(ws_cmd(B,"{\"type\":\"rawwrite\",\"id\":3,\"slave\":104,\"addr\":0,\"data\":[1]}",buf,sizeof(buf)), "B rawwrite 有回覆");
    CHECKS(buf,"\"busy\":true","非持有者的 rawwrite 被擋");

    G("4. 持有者可以正常讀寫");
    int rd0=dgh_fake_reads;
    CHECK(ws_cmd(A,"{\"type\":\"read\",\"id\":9,\"slave\":104,\"addr\":0,\"len\":3,\"awid\":2}",buf,sizeof(buf)), "A read 有回覆");
    CHECKS(buf,"\"ok\":true","A read 成功");
    CHECKS(buf,"\"data\":[160,161,162]","A read 拿到假 libMPSSE 的資料");
    CHECK(dgh_fake_reads==rd0+1, "真的打到 I2C_DeviceRead 一次");
    CHECK(ws_cmd(A,"{\"type\":\"rawwrite\",\"id\":10,\"slave\":80,\"addr\":4660,\"data\":[222,173,190],\"awid\":2}",buf,sizeof(buf)), "A rawwrite 有回覆");
    CHECKS(buf,"\"ok\":true","A rawwrite 成功");
    CHECK(dgh_fake_last_write_len==5
          && dgh_fake_last_write[0]==0x12 && dgh_fake_last_write[1]==0x34
          && dgh_fake_last_write[2]==0xDE && dgh_fake_last_write[3]==0xAD && dgh_fake_last_write[4]==0xBE,
          "🔴 送到 libMPSSE 的 frame 逐 byte 正確：12 34 DE AD BE");

    G("5. 接手（takeover）—— 佔用一定要有出口");
    CHECK(ws_cmd(B,"{\"type\":\"open\",\"id\":4,\"takeover\":1}",buf,sizeof(buf)), "B 帶 takeover 的 open 有回覆");
    CHECKS(buf,"\"ok\":true","B 接手成功");
    /* A 應該先收到 taken，然後連線被關掉 */
    char tk[512]; int gotTaken=ws_recv(A,tk,sizeof(tk));
    CHECK(gotTaken && strstr(tk,"\"type\":\"taken\"")!=NULL, "A 收到 taken 通知");
    { char junk[64]; ssize_t n=recv(A,junk,sizeof(junk),0);
      CHECK(n<=0, "🔴 A 的連線被 helper 關掉（既有頁面靠 onclose 就會正確收尾）"); }
    close(A);
    CHECK(dgh_fake_live==1, "接手後仍然只有一個 channel 開著");
    CHECK(ws_cmd(B,"{\"type\":\"read\",\"id\":5,\"slave\":104,\"addr\":0,\"len\":1}",buf,sizeof(buf))
          && strstr(buf,"\"ok\":true")!=NULL, "B 現在讀得動了");

    G("6. 🔴 斷線釋放 channel —— 三種情況都要");
    /* (a) 正常關閉：close() socket */
    int before=dgh_fake_close_calls;
    close(B); msleep(300);
    CHECK(dgh_fake_close_calls>before, "(a) 正常關閉 socket → I2C_CloseChannel 被呼叫");
    CHECK(dgh_fake_live==0, "(a) channel 已釋放（live=0）");

    /* (b) 異常斷線：SO_LINGER 0 → 送 RST，模擬瀏覽器崩潰／拔線 */
    int C=ws_open(hello,sizeof(hello));
    CHECK(C>=0, "client C 連上");
    CHECK(ws_cmd(C,"{\"type\":\"open\",\"id\":1}",buf,sizeof(buf)) && strstr(buf,"\"ok\":true")!=NULL, "C 取得 channel");
    CHECK(dgh_fake_live==1, "C 持有 channel");
    before=dgh_fake_close_calls;
    { struct linger lg={1,0}; setsockopt(C,SOL_SOCKET,SO_LINGER,&lg,sizeof(lg)); close(C); }
    msleep(300);
    CHECK(dgh_fake_close_calls>before, "(b) 異常斷線（RST）→ I2C_CloseChannel 被呼叫");
    CHECK(dgh_fake_live==0, "(b) channel 已釋放");

    /* (c) client 逾時無回應：連上、取得 channel、然後什麼都不送就放著。
       helper 對 client socket 設了 SO_RCVTIMEO=5s，但只有在讀到「半個 frame」
       時才會觸發；完全不送資料的 client 在 select 上不會就緒，因此**不會**被
       踢掉。這是刻意的：瀏覽器分頁開著不動是正常狀態，不該被沒收 channel。
       真正保證釋放的是 TCP 斷線（(a)(b) 兩條）。這裡把這個事實釘住，
       免得日後有人以為「逾時會自動回收」而少寫斷線處理。 */
    int D=ws_open(hello,sizeof(hello));
    CHECK(D>=0, "client D 連上");
    CHECK(ws_cmd(D,"{\"type\":\"open\",\"id\":1}",buf,sizeof(buf)) && strstr(buf,"\"ok\":true")!=NULL, "D 取得 channel");
    msleep(300);
    CHECK(dgh_fake_live==1, "(c) 閒置的 client 不會被沒收 channel（分頁開著不動是正常狀態）");
    CHECK(http_get("/i2c.html",buf,sizeof(buf)) && strstr(buf,"I2CPAGE-MARKER")!=NULL,
          "(c) 有人閒置持有 channel 時，helper 照樣服務 HTTP");
    /* 半個 frame：送 header 說有 20 byte 卻只送 2 byte → 5 秒 recv timeout 後收掉 */
    { unsigned char h[8]={0x81,0x80|20,0x11,0x22,0x33,0x44}; send(D,h,6,0); send(D,"ab",2,0); }
    before=dgh_fake_close_calls;
    msleep(6000);
    CHECK(dgh_fake_close_calls>before, "(c) 送到一半就不動的 client → 5s 逾時後被收掉並釋放 channel");
    CHECK(dgh_fake_live==0, "(c) channel 已釋放");
    close(D);

    G("7. 釋放之後別人拿得到");
    int E=ws_open(hello,sizeof(hello));
    CHECK(E>=0, "client E 連上");
    CHECKS(hello,"\"busy\":false","hello 回報目前沒人持有 channel");
    CHECK(ws_cmd(E,"{\"type\":\"open\",\"id\":1}",buf,sizeof(buf)) && strstr(buf,"\"ok\":true")!=NULL,
          "🔴 前一個 client 走了之後，新的 client 直接就拿得到 channel");
    CHECK(ws_cmd(E,"{\"type\":\"close\",\"id\":2}",buf,sizeof(buf)) && strstr(buf,"\"ok\":true")!=NULL, "E 主動 close");
    CHECK(dgh_fake_live==0, "主動 close 也會釋放");
    close(E);

    /* ═══════════════════════════════════════════════════════════════════════
       8. 🔴 helper 只開一次就好：兩頁來回互搶，server 全程不重啟
       ───────────────────────────────────────────────────────────────────────
       Bruce 2026-09-18：「可不可以做到我只要開一次就好？用 i2c 網頁或者用 DG 的
       i2c 都可以共用，不用再把它關掉重開。」這一節就是把那句話變成斷言。
       注意：接手會把舊持有者的連線關掉，所以「切回去」＝新開一條連線再 takeover，
       這正是網頁 visibilitychange 自動接手時實際做的事。 */
    G("8. 🔴 兩頁來回接手，helper 全程不重啟（Bruce：只要開一次就好）");
    int P1=ws_open(hello,sizeof(hello));
    CHECK(P1>=0, "第一頁連上（helper 還是最初那一個行程）");
    CHECK(ws_cmd(P1,"{\"type\":\"open\",\"id\":1}",buf,sizeof(buf)) && strstr(buf,"\"ok\":true")!=NULL, "第一頁取得 channel");
    int P2=ws_open(hello,sizeof(hello));
    CHECKS(hello,"\"busy\":true","第二頁的 hello 就看得出 channel 已被佔");
    CHECK(ws_cmd(P2,"{\"type\":\"open\",\"id\":1,\"takeover\":1}",buf,sizeof(buf))
          && strstr(buf,"\"ok\":true")!=NULL, "第二頁自動接手成功");
    { char tk[512]; ws_recv(P1,tk,sizeof(tk)); }
    close(P1);
    CHECK(dgh_fake_live==1, "接手後仍然只有一個 channel");
    /* 切回第一頁 */
    int P1b=ws_open(hello,sizeof(hello));
    CHECK(ws_cmd(P1b,"{\"type\":\"open\",\"id\":1,\"takeover\":1}",buf,sizeof(buf))
          && strstr(buf,"\"ok\":true")!=NULL, "🔴 切回第一頁又接手回來（不必重開 helper）");
    { char tk[512]; ws_recv(P2,tk,sizeof(tk)); }
    close(P2);
    CHECK(dgh_fake_live==1, "來回兩次之後 channel 數仍然是 1");
    CHECK(ws_cmd(P1b,"{\"type\":\"read\",\"id\":2,\"slave\":104,\"addr\":0,\"len\":1}",buf,sizeof(buf))
          && strstr(buf,"\"ok\":true")!=NULL, "接手回來的那頁讀得動");
    CHECK(dgh_shim_browser_opened==1, "🔴 全程只開過一次瀏覽器 ＝ helper 沒有被重啟過");

    /* ═══════════════════════════════════════════════════════════════════════
       9. 🔴 量測進行中不准被搶走（lock，proto 3）
       ───────────────────────────────────────────────────────────────────────
       自動接手不可以把正在跑的 Gray 0~255 量測打斷。這比「無腦」優先。 */
    G("9. 🔴 忙碌中拒絕接手（lock）");
    CHECK(ws_cmd(P1b,"{\"type\":\"lock\",\"id\":3,\"on\":1}",buf,sizeof(buf)), "持有者 lock 有回覆");
    CHECKS(buf,"\"ok\":true","持有者 lock 成功");
    CHECKS(buf,"\"locked\":true","helper 回報現在是忙碌中");
    int Q=ws_open(hello,sizeof(hello));
    CHECK(Q>=0, "另一頁連上");
    CHECKS(hello,"\"locked\":true","🔴 hello 就告訴新頁面「對方忙碌中」");
    CHECK(ws_cmd(Q,"{\"type\":\"open\",\"id\":1,\"takeover\":1}",buf,sizeof(buf)), "忙碌中的 takeover 有回覆");
    CHECKS(buf,"\"ok\":false","🔴 忙碌中的 takeover 被拒絕");
    CHECKS(buf,"\"locked\":true","🔴 拒絕的理由可判別（locked，不是單純 busy）");
    CHECK(dgh_fake_live==1, "被拒絕不會動到持有者的 channel");
    CHECK(ws_cmd(P1b,"{\"type\":\"read\",\"id\":4,\"slave\":104,\"addr\":0,\"len\":1}",buf,sizeof(buf))
          && strstr(buf,"\"ok\":true")!=NULL, "🔴 被拒絕期間，持有者的量測照常進行");
    /* 非持有者不能 lock（否則任何一頁都能把 channel 凍住） */
    CHECK(ws_cmd(Q,"{\"type\":\"lock\",\"id\":5,\"on\":0}",buf,sizeof(buf)), "非持有者 lock 有回覆");
    CHECKS(buf,"\"ok\":false","🔴 非持有者不能改 lock");
    CHECKS(buf,"\"locked\":true","非持有者的 lock 沒有把鎖解掉");
    /* 量測結束 → 解鎖 → 接手放行 */
    CHECK(ws_cmd(P1b,"{\"type\":\"lock\",\"id\":6,\"on\":0}",buf,sizeof(buf)) && strstr(buf,"\"locked\":false")!=NULL,
          "量測結束後持有者解鎖");
    CHECK(ws_cmd(Q,"{\"type\":\"open\",\"id\":7,\"takeover\":1}",buf,sizeof(buf)) && strstr(buf,"\"ok\":true")!=NULL,
          "🔴 解鎖之後接手就通了");
    { char tk[512]; ws_recv(P1b,tk,sizeof(tk)); }
    close(P1b);
    CHECK(dgh_fake_live==1, "解鎖接手後仍然只有一個 channel");
    /* 🔴 鎖著的持有者直接斷線 → 鎖必須跟著消失，否則只能重開 helper */
    CHECK(ws_cmd(Q,"{\"type\":\"lock\",\"id\":8,\"on\":1}",buf,sizeof(buf)) && strstr(buf,"\"locked\":true")!=NULL,
          "新持有者也鎖起來");
    { struct linger lg={1,0}; setsockopt(Q,SOL_SOCKET,SO_LINGER,&lg,sizeof(lg)); close(Q); }
    msleep(300);
    CHECK(dgh_fake_live==0, "鎖著的持有者斷線 → channel 釋放");
    int R=ws_open(hello,sizeof(hello));
    CHECKS(hello,"\"locked\":false","🔴 持有者斷線後鎖也消失（不會卡死到只能重開 helper）");
    CHECK(ws_cmd(R,"{\"type\":\"open\",\"id\":1}",buf,sizeof(buf)) && strstr(buf,"\"ok\":true")!=NULL,
          "🔴 後來的頁面直接拿得到 channel");
    close(R); msleep(200);

    printf("\n================================================================\n");
    if(fails){ printf("🔴 %d / %d 項未通過\n", fails, total); return 1; }
    printf("✅ 全部通過：%d 項\n", total);
    printf("🔴 未驗（沒有 Windows／沒有 FTDI 治具，不做假探針）：\n");
    printf("   · 真正的 D2XX／libMPSSE.dll（這裡是假的，只驗到呼叫邊界）\n");
    printf("   · 真正的 I2C 波形與真 TCON 的回應\n");
    printf("   · Windows winsock 的實際行為（這裡跑 POSIX socket，shim 只翻譯了\n");
    printf("     select 的 nfds 與 SO_RCVTIMEO 兩處已知語意差異）\n");
    return 0;
}

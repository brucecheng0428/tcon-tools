/* ═══════════════════════════════════════════════════════════════════════════
   test_server.c — 把**出貨的那份 i2c_bridge.c**真的跑起來，用真的 TCP 連線驗它
   ───────────────────────────────────────────────────────────────────────────
   🔴 為什麼非要這一支不可：v1.4.x 的「一個頁面把另一個頁面鎖死」是編得過、
      純函式測試全綠、code review 也看不出來的錯 —— accept 迴圈阻塞在
      serve_ws 裡，只有**真的開兩條連線**才看得到。Bruce 2026-09-18 實測踩到，
      這支就是把那個情境變成可重跑的測試。

   做法：用 shim/ 讓 i2c_bridge.c 一個字不改地在 Linux 上編起來（`-Dmain=dgh_main`
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

#define PORT 18899
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
    printf("== i2c_bridge.c 真實伺服器測試（shim 讓出貨原始碼原封在 Linux 上跑）==\n");

    /* exe 旁的資料夾：放一顆假的 libMPSSE.dll 與兩個工具頁
       🔴 2026-09-19：目錄名原本只有 `getpid()`。容器裡 pid 從個位數開始且**會重複**，
          撞到**前一次（甚至上一個 session）留下**的同名目錄時，那些檔案的 owner
          可能已經不是現在的 uid ⇒ `fopen(...,"wb")` 回 NULL ⇒ 下一行 `fputs(NULL)`
          直接 SIGSEGV，而畫面上只有標題那一行，看起來像「新改動把 bridge 弄壞了」。
          實測：同一份 HEAD 連跑 10 次，pid 撞到舊目錄的那 3 次全部 segfault。
          ⇒ 名字加時間、而且**每個 fopen 都檢查**：測試夾具自己壞掉要講出來，
            不可以偽裝成受測程式壞掉。 */
    char dir[256];
    snprintf(dir,sizeof(dir),"/tmp/dgh_test_%d_%ld/",(int)getpid(),(long)time(NULL));
    if(mkdir(dir,0755)!=0 && access(dir,W_OK)!=0){
        printf("   FATAL  測試夾具無法建立目錄 %s（測試沒有跑，不是受測程式的問題）\n",dir);
        return 2;
    }
    char p[512];
    #define MKFILE(name,body) do{ snprintf(p,sizeof(p),"%s%s",dir,name); \
        FILE* f=fopen(p,"wb"); \
        if(!f){ printf("   FATAL  測試夾具無法寫入 %s（測試沒有跑，不是受測程式的問題）\n",p); return 2; } \
        fputs(body,f); fclose(f); }while(0)
    MKFILE("libMPSSE.dll",   "fake");
    MKFILE("dg-measure.html","<html>DGMEASURE-MARKER</html>");
    MKFILE("i2c.html",       "<html>I2CPAGE-MARKER</html>");
    dgh_shim_set_exe_dir(dir);

    pthread_t th; pthread_create(&th,NULL,server_thread,NULL);
    msleep(400);

    char buf[8192], hello[1024];

    G("0. 啟動（v1.7.0：不開瀏覽器、不端檔案）");
    /* 🔴 Bruce 2026-09-18：「那個 local 的網頁不是已經叫你不要再用了嗎？」
       ⇒ helper 是純背景服務，啟動**不開任何網頁**。 */
    CHECK(dgh_shim_browser_opened==0, "🔴 啟動完全不開瀏覽器");
    CHECK(dgh_serve_files==0, "🔴 靜態檔服務預設關閉");

    G("1. 預設狀態：任何 HTTP 請求都指向線上工具，不端本機檔案");
    CHECK(http_get("/",buf,sizeof(buf)), "GET / 有回應");
    CHECKS(buf,"200 OK","回 200（不是 404，讓人知道 helper 活著）");
    CHECKS(buf,"brucecheng0428.github.io","🔴 指向線上的 tcon-tools");
    CHECKS(buf,"Allow","一句話提醒 Chrome 會問一次權限");
    CHECK(strstr(buf,"DGMEASURE-MARKER")==NULL, "🔴 即使檔案就在 exe 旁邊也不端出去");
    CHECK(http_get("/i2c.html",buf,sizeof(buf)) && strstr(buf,"I2CPAGE-MARKER")==NULL,
          "🔴 /i2c.html 也不端（預設關閉）");
    CHECK(dgh_fake_live==0, "🔴 啟動後沒有任何 channel 開著");

    G("1a2. 🔴 讀取走 fast 路徑（效能根因：libMPSSE 非 fast 路徑是逐 byte）");
    {
        /* 🔴 libMPSSE 的 I2C_DeviceRead 在沒有 FAST_TRANSFER 位元時，對每一個 byte
           做「送 ~17 byte 命令 → INFRA_SLEEP(1) → 讀 1 byte」。4096 byte 光 sleep
           就 4 秒，加上 8192 次 USB 往返 ⇒ Bruce 實測的 20~60 秒。
           我們原本**只有讀取沒帶 fast 位元**（位址相位與寫入都有）——
           所以慢的一直只有讀取，和他抱怨的完全一致。 */
        int s0 = ws_open(hello, sizeof(hello));
        CHECK(s0 >= 0, "連上");
        ws_cmd(s0, "{\"type\":\"open\",\"id\":1}", buf, sizeof(buf));
        ws_cmd(s0, "{\"type\":\"read\",\"id\":2,\"slave\":80,\"addr\":0,\"awid\":2,\"len\":64}", buf, sizeof(buf));
        CHECK((dgh_fake_last_read_opts & 0x10) != 0, "🔴 預設讀取帶 FAST_TRANSFER_BYTES(0x10)");
        CHECK((dgh_fake_last_read_opts & 0x03) == 0x03, "仍然有 START|STOP（線上行為不變）");
        CHECK((dgh_fake_last_read_opts & 0x08) == 0x08, "仍然有 NACK_LAST_BYTE（最後一個 byte 回 NACK）");
        CHECK((dgh_fake_last_write_opts & 0x10) != 0, "位址相位本來就是 fast（沒有被改掉）");
        CHECKS(buf, "\"fast\":true", "回覆帶 fast 旗標，網頁看得到用了哪一種");
        CHECKS(buf, "\"us\":", "🔴 回覆帶 libMPSSE 呼叫耗時（us）");

        /* 退路：open 帶 fastread:0 ⇒ 退回 PQ Tool 原本的逐 byte 讀法 */
        ws_cmd(s0, "{\"type\":\"open\",\"id\":3,\"fastread\":0}", buf, sizeof(buf));
        ws_cmd(s0, "{\"type\":\"read\",\"id\":4,\"slave\":80,\"addr\":0,\"awid\":2,\"len\":64}", buf, sizeof(buf));
        CHECK((dgh_fake_last_read_opts & 0x10) == 0, "🔴 fastread:0 ⇒ 退回舊路徑（不帶 0x10）");
        CHECKS(buf, "\"fast\":false", "回覆如實反映用了舊路徑");
        ws_cmd(s0, "{\"type\":\"open\",\"id\":5,\"fastread\":1}", buf, sizeof(buf));
        CHECK(dgh_fast_read == 1, "切得回來");

        /* 🔴 ACK／錯誤不可以被靜默吞掉 */
        dgh_fake_read_status = 4;              /* 非 0 ＝ FT 錯誤（含 NACK 造成的失敗） */
        ws_cmd(s0, "{\"type\":\"read\",\"id\":6,\"slave\":80,\"addr\":0,\"awid\":2,\"len\":8}", buf, sizeof(buf));
        CHECKS(buf, "\"ok\":false", "🔴 讀取失敗如實回報 ok:false（不靜默吞掉）");
        CHECKS(buf, "\"status\":4", "並帶回 FT status");
        dgh_fake_read_status = 0;
        dgh_fake_write_status = 4;
        ws_cmd(s0, "{\"type\":\"rawwrite\",\"id\":7,\"slave\":80,\"addr\":0,\"awid\":2,\"data\":[1,2,3]}", buf, sizeof(buf));
        CHECKS(buf, "\"ok\":false", "🔴 寫入失敗（NACK）如實回報");
        dgh_fake_write_status = 0;
        close(s0);
        msleep(60);
    }

    G("1b. --serve 這條退路仍然可用（保留但預設不走）");
    dgh_serve_files = 1;
    CHECK(http_get("/i2c.html",buf,sizeof(buf)) && strstr(buf,"I2CPAGE-MARKER")!=NULL, "打開後 /i2c.html 端得出來");
    CHECK(http_get("/dg-measure.html",buf,sizeof(buf)) && strstr(buf,"DGMEASURE-MARKER")!=NULL, "打開後 /dg-measure.html 端得出來");
    CHECK(http_get("/i2c_bridge.c",buf,sizeof(buf)) && strstr(buf,"404")!=NULL, "副檔名白名單外的檔案回 404");
    CHECK(http_get("/",buf,sizeof(buf)) && strstr(buf,"/i2c.html")!=NULL, "打開後 / 是入口頁");
    dgh_serve_files = 0;   /* 驗完關回去：預設就是關的 */
    CHECK(http_get("/",buf,sizeof(buf)) && strstr(buf,"brucecheng0428.github.io")!=NULL, "關回去之後又指向線上");

    G("2. 🔴 兩條連線並存時 HTTP 還端得出檔案（v1.4.x 的致命傷）");
    int A=ws_open(hello,sizeof(hello));
    CHECK(A>=0, "client A 握手成功");
    CHECKS(hello,"\"type\":\"hello\"","A 收到 hello");
    /* 🔴 1.15.0 起 proto 是 4（多了 batchwrite／abortwrite 兩個命令與 progress
       這個主動推送的訊息型別）。這一條刻意寫死數字而不是讀巨集：**協定版本是
       對外承諾**，跟著巨集走的斷言等於永遠不會失敗，那就不是斷言。
       改這個數字時請同時確認網頁端的 `I2CT_PROTO_BATCH`。 */
    CHECKS(hello,"\"proto\":4","hello 回報 proto 4（1.15.0 起）");
    /* 🔴 就是這一條。v1.4.x 在 A 的 WS 開著時卡在 serve_ws 的 recv 迴圈裡，
       這個 GET 會一直躺在 backlog、永遠不回 —— 使用者看到的就是「打不開」。 */
    /* 🔴 v1.4.x 的致命傷：A 的 WS 開著時第二個 HTTP 請求永遠不會被處理。
       v1.7.0 不端檔案了，但「還 accept 得到、還回得了應」這件事照樣要成立。 */
    CHECK(http_get("/",buf,sizeof(buf)) && strstr(buf,"200 OK")!=NULL,
          "🔴 A 的 WebSocket 開著時，HTTP 請求仍然處理得到");
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
    CHECK(http_get("/",buf,sizeof(buf)) && strstr(buf,"200 OK")!=NULL,
          "(c) 有人閒置持有 channel 時，helper 照樣回得了 HTTP");
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
    CHECK(dgh_shim_browser_opened==0, "🔴 全程一次瀏覽器都沒開（v1.7.0 起就不開）");

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

    /* ═══════════════════════════════════════════════════════════════════════
       §10 🔴 回覆 ≥ 64 KB 的 WebSocket frame（1.15.0 修掉的既有 bug）
       ───────────────────────────────────────────────────────────────────────
       舊的 ws_send_text 只有兩條分支：< 126 用 7 位元長度，其餘一律 `126` ＋
       **兩個 byte**。兩個 byte 只到 65535 ⇒ 回覆 ≥ 65536 時長度欄溢位成
       `n & 0xFFFF`，但後面照樣送 n 個 byte ⇒ frame 邊界從此錯位。
       這條路自 1.14.0 拿掉讀取長度上限起就存在（讀 20000 byte 的回覆是一個
       約 80 KB 的 JSON），而且**完全安靜**。RFC 6455 §5.2：≥ 65536 要用
       `127` ＋ 八個 byte。
       判準寫成「收得回來、而且 JSON 完整（結尾是 ]} ）」—— frame 錯位的話
       收到的長度會少 65536 的整數倍，JSON 一定不完整。 */
    G("10. 🔴 回覆 ≥ 64 KB 的 frame 長度（RFC 6455 的 127 形式）");
    {
        int S=ws_open(hello,sizeof(hello));
        char* big=(char*)malloc(400000);
        CHECK(S>=0 && big!=NULL, "連線並配置大緩衝區");
        if(S>=0 && big){
            CHECK(ws_cmd(S,"{\"type\":\"open\",\"id\":1}",buf,sizeof(buf)) && strstr(buf,"\"ok\":true")!=NULL,
                  "取得 channel");
            /* 20000 byte ⇒ 回覆約 20000×4 ＝ 80 KB（> 65535）⇒ 必須走 127 那條 */
            ws_send(S,"{\"type\":\"read\",\"id\":2,\"slave\":104,\"addr\":0,\"len\":20000}");
            CHECK(ws_recv(S,big,400000), "🔴 80 KB 的回覆收得回來（舊碼在這裡送出壞 frame）");
            {   size_t bl=strlen(big);
                CHECK(bl>65536, "回覆真的超過 64 KB（不是被誰夾短了）");
                CHECK(bl>2 && big[bl-1]=='}' && big[bl-2]==']',
                      "🔴 JSON 完整收到（結尾是 ]}）＝ frame 長度欄沒有溢位");
                CHECK(strstr(big,"\"got\":20000")!=NULL, "回覆說讀到 20000 byte");
            }
            free(big); close(S); msleep(150);
        } else if(big) free(big);
    }

    /* ═══════════════════════════════════════════════════════════════════════
       §11 🔴🔴 batchwrite（1.15.0）
       ───────────────────────────────────────────────────────────────────────
       這一節要回答的問題，一條一條都是 Dispatch 指名的驗證項目：
         (1) 8192 byte 需要幾次**網頁↔bridge 往返**？改動前 256+，改動後應為 1
         (2) 寫入結果正確性：回讀比對逐 byte 相同（假 EEPROM 夾具）
         (3) 分頁邊界：0x1F0F 起寫 64 byte，第一段只能寫到頁邊界
             —— 而且要有**反面**：夾具必須抓得到「沒切段」那個壞行為
         (4) 進度訊息會出現；中止能停，且回報寫到哪個位址為止
         (5) 非法輸入明確回錯誤
       ══════════════════════════════════════════════════════════════════════ */
    G("11. 🔴 batchwrite：一次請求寫完整段（往返 256+ → 1）");
    {
        int B=ws_open(hello,sizeof(hello));
        size_t cap=8192*6+4096;
        char* req=(char*)malloc(cap);
        char* rbuf=(char*)malloc(200000);
        unsigned char* want=(unsigned char*)malloc(8192);
        CHECK(B>=0 && req && rbuf && want, "連線並配置緩衝區");
        if(B>=0 && req && rbuf && want){
            int i, progs=0, results=0, clientFrames=0;
            size_t o;
            CHECK(ws_cmd(B,"{\"type\":\"open\",\"id\":1}",buf,sizeof(buf)) && strstr(buf,"\"ok\":true")!=NULL,
                  "取得 channel");
            /* 可預測但不單調的內容：0xFF 填充下看得出「有沒有真的寫到」 */
            for(i=0;i<8192;i++) want[i]=(unsigned char)((i*7+(i>>8)*13+1)&0xFF);
            dgh_fake_eeprom_reset(32,2,0xFF);
            dgh_fake_writes=0;

            o=(size_t)snprintf(req,cap,"{\"type\":\"batchwrite\",\"id\":42,\"slave\":80,\"addr\":0,"
                                       "\"awid\":2,\"page\":32,\"twr\":0,\"len\":8192,\"progms\":20,\"data\":[");
            for(i=0;i<8192;i++) o+=(size_t)snprintf(req+o,cap-o,"%s%u",i?",":"",want[i]);
            o+=(size_t)snprintf(req+o,cap-o,"]}");
            CHECK(o<cap, "請求組得進緩衝區");
            /* 🔴 **這就是往返次數的量測**：整段 8192 byte 只送出這一則。 */
            ws_send_n(B,req,o); clientFrames++;
            for(;;){
                char t[32]={0};
                if(!ws_recv(B,rbuf,200000)) break;
                if(strstr(rbuf,"\"type\":\"progress\"")){ progs++; continue; }
                if(strstr(rbuf,"\"type\":\"result\"")){ results++; snprintf(buf,sizeof(buf),"%s",rbuf); break; }
                (void)t;
            }
            printf("      [量測] 8192 byte / page 32：網頁→bridge 的請求 frame ＝ %d 則"
                   "（舊路徑 ＝ 256 則 rawwrite）；bridge→網頁 ＝ %d 則進度 ＋ %d 則結果\n",
                   clientFrames, progs, results);
            printf("      [量測] 裝置側寫入次數 ＝ %d（分頁沒有被合併掉，仍然是每頁一次）\n",
                   dgh_fake_writes);
            EQ_I(clientFrames, 1, "🔴 網頁→bridge 的請求 ＝ **1 則**（舊路徑 256 則）");
            EQ_I(results, 1, "結果訊息剛好 1 則");
            CHECK(progs>=2, "🔴 進度訊息真的有送出來（不是一片空白乾等）");
            CHECKS(buf,"\"ok\":true","整批寫入成功");
            CHECKS(buf,"\"segs\":256","分成 256 段（8192 / page 32）");
            CHECKS(buf,"\"segsDone\":256","256 段全部寫完");
            CHECKS(buf,"\"done\":8192","8192 byte 全部寫完");
            CHECKS(buf,"\"aborted\":false","不是中止");
            EQ_I(dgh_fake_writes, 256, "🔴 裝置側寫入 256 次（每頁一次，一段都沒漏）");
            EQ_I(dgh_fake_wraps, 0, "🔴 假 EEPROM 一次頁內回捲都沒發生");
            /* (2) 回讀比對：先直接比記憶體（逐 byte，8192 個都比） */
            {   int bad=-1;
                for(i=0;i<8192;i++) if(dgh_fake_mem[i]!=want[i]){ bad=i; break; }
                EQ_I(bad, -1, "🔴 假 EEPROM 的內容與送出去的 payload **逐 byte 相同**");
            }
            /* 再走**真的讀取路徑**回讀一次（證明不是只有記憶體對，wire 上也對） */
            {   int okrb=1, n2;
                ws_send(B,"{\"type\":\"read\",\"id\":43,\"slave\":80,\"addr\":0,\"len\":8192}");
                if(ws_recv(B,rbuf,200000)){
                    char* p=strstr(rbuf,"\"data\":[");
                    if(!p) okrb=0;
                    else { p+=8;
                        for(i=0;i<8192;i++){
                            n2=(int)strtol(p,&p,10);
                            if(n2!=(int)want[i]){ okrb=0; break; }
                            if(*p==',') p++;
                        }
                    }
                } else okrb=0;
                CHECK(okrb, "🔴 用 read 命令回讀 8192 byte，逐 byte 與寫入值相同");
            }

            /* ── (3) 分頁邊界：0x1F0F 起 64 byte ─────────────────────────── */
            G("11b. 🔴 分頁邊界：起始位址不對齊 page（0x1F0F 起寫 64 byte）");
            dgh_fake_eeprom_reset(32,2,0xFF);
            dgh_fake_writes=0;
            o=(size_t)snprintf(req,cap,"{\"type\":\"batchwrite\",\"id\":44,\"slave\":80,\"addr\":7951,"
                                       "\"awid\":2,\"page\":32,\"twr\":0,\"len\":64,\"data\":[");
            for(i=0;i<64;i++) o+=(size_t)snprintf(req+o,cap-o,"%s%u",i?",":"",(unsigned)(i+1));
            o+=(size_t)snprintf(req+o,cap-o,"]}");
            ws_send_n(B,req,o);
            for(;;){ if(!ws_recv(B,rbuf,200000)) break;
                     if(strstr(rbuf,"\"type\":\"progress\"")) continue;
                     snprintf(buf,sizeof(buf),"%s",rbuf); break; }
            CHECKS(buf,"\"ok\":true","0x1F0F 起 64 byte 寫入成功");
            CHECKS(buf,"\"segs\":3","🔴 切成 3 段（17 ＋ 32 ＋ 15）");
            EQ_I(dgh_fake_writes, 3, "裝置側寫入 3 次");
            EQ_I(dgh_fake_wraps, 0, "🔴 沒有任何一段跨過 page 邊界");
            {   int bad=-1;
                for(i=0;i<64;i++) if(dgh_fake_mem[0x1F0F+i]!=(unsigned char)(i+1)){ bad=i; break; }
                EQ_I(bad, -1, "🔴 0x1F0F..0x1F4E 的 64 個 byte 全部正確");
                bad=-1;
                for(i=0x1F00;i<0x1F0F;i++) if(dgh_fake_mem[i]!=0xFF){ bad=i; break; }
                EQ_I(bad, -1, "🔴 同一頁前面的 0x1F00..0x1F0E **沒有被蓋掉**");
            }
            /* 🔴🔴 **反面**：夾具必須抓得到「沒切段」那個壞行為。
               只驗「好的做法通不通」是 CLAUDE.md 記過三次的破口 ——
               這裡用 rawwrite 故意一次送 64 byte（不切段），夾具**必須**
               報出回捲並且資料真的被蓋掉。抓不到就代表上面那幾條是空的。 */
            dgh_fake_eeprom_reset(32,2,0xFF);
            o=(size_t)snprintf(req,cap,"{\"type\":\"rawwrite\",\"id\":45,\"slave\":80,\"addr\":7951,"
                                       "\"awid\":2,\"data\":[");
            for(i=0;i<64;i++) o+=(size_t)snprintf(req+o,cap-o,"%s%u",i?",":"",(unsigned)(i+1));
            o+=(size_t)snprintf(req+o,cap-o,"]}");
            ws_send_n(B,req,o);
            CHECK(ws_recv(B,rbuf,200000), "不切段的 rawwrite 有回覆");
            CHECK(dgh_fake_wraps>0, "🔴 反面：不切段就會頁內回捲 ⇒ 夾具抓得到（否則上面的 0 沒有意義）");
            CHECK(dgh_fake_mem[0x1F00]!=0xFF, "🔴 反面：回捲真的蓋掉了同一頁前面的資料");

            /* ── 進度訊息的節流：真實 tWR 下一則都不能少、也不能每段都送 ──── */
            G("11b2. 🔴 進度訊息的節流（時間節流，不是每段一則）");
            dgh_fake_eeprom_reset(32,2,0xFF);
            dgh_fake_writes=0;
            o=(size_t)snprintf(req,cap,"{\"type\":\"batchwrite\",\"id\":48,\"slave\":80,\"addr\":0,"
                                       "\"awid\":2,\"page\":32,\"twr\":5,\"len\":8192,\"progms\":100,\"data\":[");
            for(i=0;i<8192;i++) o+=(size_t)snprintf(req+o,cap-o,"%s%u",i?",":"",want[i]);
            o+=(size_t)snprintf(req+o,cap-o,"]}");
            {   int pg=0;
                long t0ms=(long)(time(NULL));
                ws_send_n(B,req,o);
                for(;;){ if(!ws_recv(B,rbuf,200000)) break;
                         if(strstr(rbuf,"\"type\":\"progress\"")){ pg++; continue; }
                         snprintf(buf,sizeof(buf),"%s",rbuf); break; }
                (void)t0ms;
                printf("      [量測] 8192 byte、tWR 5 ms、progms 100：進度訊息 %d 則"
                       "（每段一則會是 256 則 —— 那等於把省下來的往返又加回去）\n", pg);
                CHECKS(buf,"\"ok\":true","tWR 5 ms 的整批寫入成功");
                CHECK(pg>=3, "🔴 進度訊息不只一則（進度條會動）");
                CHECK(pg<=60, "🔴 進度訊息遠少於段數 256（節流有生效）");
                CHECKS(buf,"\"twrms\":","回覆帶 tWR 實際總等待時間");
                {   char* p=strstr(buf,"\"twrms\":");
                    long tw=p?strtol(p+8,NULL,10):-1;
                    printf("      [量測] tWR 實際總等待 ＝ %ld ms（255 段 × 5 ms ＝ 1275 ms 為下限）\n", tw);
                    CHECK(tw>=1275, "🔴 tWR 一段都沒有被偷偷跳過（實際等待 ≥ 255×5 ms）");
                }
            }

            /* ── ACK polling：探針測不出忙碌時**必須**退回固定 tWR ─────────── */
            G("11b3. 🔴 ACK polling 的自我校準（探針測不出忙碌就退回固定 tWR）");
            dgh_fake_eeprom_reset(32,2,0xFF);
            o=(size_t)snprintf(req,cap,"{\"type\":\"batchwrite\",\"id\":49,\"slave\":80,\"addr\":0,"
                                       "\"awid\":2,\"page\":32,\"twr\":5,\"len\":320,\"progms\":50,"
                                       "\"ackpoll\":1,\"data\":[");
            for(i=0;i<320;i++) o+=(size_t)snprintf(req+o,cap-o,"%s%u",i?",":"",want[i]);
            o+=(size_t)snprintf(req+o,cap-o,"]}");
            ws_send_n(B,req,o);
            for(;;){ if(!ws_recv(B,rbuf,200000)) break;
                     if(strstr(rbuf,"\"type\":\"progress\"")) continue;
                     snprintf(buf,sizeof(buf),"%s",rbuf); break; }
            CHECKS(buf,"\"ok\":true","ackpoll 開著也寫得完");
            CHECKS(buf,"\"ackpoll\":true","回覆說 ackpoll 是開的");
            {   char* p=strstr(buf,"\"ackfallback\":");
                long fb=p?strtol(p+14,NULL,10):-1;
                p=strstr(buf,"\"twrms\":");
                {   long tw=p?strtol(p+8,NULL,10):-1;
                    printf("      [量測] ackpoll：退回固定 tWR 的頁數 ＝ %ld / 9，實際總等待 ＝ %ld ms\n", fb, tw);
                    /* 🔴 假 EEPROM 的 1-byte 讀永遠成功 ＝ 探針測不出忙碌。
                       這正是**真硬體上也可能發生**的情況，而它的後果最嚴重
                       （提早寫下一頁 ⇒ 靜默寫不進去）。守衛必須把它抓下來。 */
                    /* 320 byte / page 32 ＝ 10 段 ⇒ 段間等待 9 次（最後一段之後不等）。 */
                    EQ_I(fb, 9, "🔴 探針一次就成功 ⇒ 9 次段間等待**每一次**都退回固定 tWR");
                    CHECK(tw>=45, "🔴 退回之後等待時間沒有變短（9 × 5 ms ＝ 45 ms 為下限）");
                }
            }

            /* ── (4) 中止：要停得下來，而且要講清楚裝置狀態 ───────────────── */
            G("11c. 🔴 中止：停在分頁邊界，並回報寫到哪個位址為止");
            dgh_fake_eeprom_reset(32,2,0xFF);
            dgh_fake_writes=0;
            /* twr=5 ⇒ 255 段 × 5 ms ≈ 1.3 秒，中間來得及送中止 */
            o=(size_t)snprintf(req,cap,"{\"type\":\"batchwrite\",\"id\":46,\"slave\":80,\"addr\":0,"
                                       "\"awid\":2,\"page\":32,\"twr\":5,\"len\":8192,\"progms\":20,\"data\":[");
            for(i=0;i<8192;i++) o+=(size_t)snprintf(req+o,cap-o,"%s%u",i?",":"",want[i]);
            o+=(size_t)snprintf(req+o,cap-o,"]}");
            ws_send_n(B,req,o);
            msleep(150);
            /* 🔴 要中止的那一次寫入放在 `batch`，不是 `id`（見 batch_poll_abort 的註解：
               沿用 id 會讓中止的回覆被網頁當成整批寫入的結果）。 */
            ws_send(B,"{\"type\":\"abortwrite\",\"batch\":46}");
            {   int gotResult=0, aborted=0, segsDone=-1, donePos=-1;
                for(;;){ if(!ws_recv(B,rbuf,200000)) break;
                         if(strstr(rbuf,"\"type\":\"progress\"")) continue;
                         gotResult=1; snprintf(buf,sizeof(buf),"%s",rbuf); break; }
                CHECK(gotResult, "中止之後收到結果訊息");
                aborted = strstr(buf,"\"aborted\":true")!=NULL;
                CHECK(aborted, "🔴 回報 aborted:true");
                CHECKS(buf,"\"ok\":false","中止不算成功");
                {   char* p=strstr(buf,"\"segsDone\":"); if(p) segsDone=(int)strtol(p+11,NULL,10);
                    p=strstr(buf,"\"done\":");          if(p) donePos=(int)strtol(p+7,NULL,10); }
                printf("      [量測] 中止時已寫 %d / 256 段（%d / 8192 byte）\n", segsDone, donePos);
                CHECK(segsDone>0 && segsDone<256, "🔴 真的停在中途（不是 0 也不是全部寫完）");
                CHECK(donePos==segsDone*32, "已寫 byte 數 ＝ 段數 × page");
                CHECKS(buf,"\"nextAddr\":","回覆帶 nextAddr（後面沒寫的第一個位址）");
                CHECKS(buf,"WERE written","🔴 err 明講哪一段位址寫進去了");
                CHECKS(buf,"were NOT","🔴 err 明講哪一段位址沒有寫");
                CHECKS(buf,"partly updated","🔴 err 明講裝置現在是半寫完的狀態");
                EQ_I(dgh_fake_writes, segsDone, "裝置側寫入次數 ＝ 回報的段數（沒有多寫一段）");
                if(segsDone>0 && donePos>0 && donePos<8192){
                    int bad=-1, j;
                    for(j=0;j<donePos;j++) if(dgh_fake_mem[j]!=want[j]){ bad=j; break; }
                    EQ_I(bad, -1, "🔴 中止之前寫的那一段內容正確");
                    EQ_I(dgh_fake_mem[donePos], 0xFF, "🔴 中止位置之後**一個 byte 都沒寫**（仍是 0xFF）");
                }
            }
            /* 中止之後連線還活著、還能繼續用 —— 中止不等於斷線 */
            CHECK(ws_cmd(B,"{\"type\":\"ping\",\"id\":47}",rbuf,200000) && strstr(rbuf,"\"type\":\"pong\"")!=NULL,
                  "🔴 中止之後連線還活著（可以繼續操作）");

            /* ── (5) 非法輸入：一律明確回錯誤，不靜默處理 ─────────────────── */
            G("11d. 🔴 非法輸入：明確回錯誤（不夾取、不靜默改值）");
            #define BADREQ(js, wantsub, name) do{ \
                CHECK(ws_cmd(B,(js),rbuf,200000), name " 有回覆"); \
                CHECKS(rbuf,"\"ok\":false", name " 回失敗"); \
                CHECKS(rbuf,(wantsub), name " 的錯誤訊息講得出原因"); }while(0)
            dgh_fake_writes=0;
            BADREQ("{\"type\":\"batchwrite\",\"id\":50,\"slave\":80,\"addr\":0,\"awid\":2,\"page\":32,\"twr\":5,\"data\":[1,2]}",
                   "len must be given", "len 缺");
            BADREQ("{\"type\":\"batchwrite\",\"id\":51,\"slave\":80,\"addr\":0,\"awid\":2,\"page\":32,\"twr\":5,\"len\":0,\"data\":[]}",
                   "at least 1", "len 為 0");
            BADREQ("{\"type\":\"batchwrite\",\"id\":52,\"slave\":80,\"addr\":0,\"awid\":2,\"page\":32,\"twr\":5,\"len\":4,\"data\":[1,2]}",
                   "must match exactly", "🔴 payload 長度與宣告不符");
            BADREQ("{\"type\":\"batchwrite\",\"id\":53,\"slave\":80,\"addr\":0,\"awid\":2,\"page\":32,\"twr\":5,\"len\":2,\"data\":[1,2,3,4]}",
                   "must match exactly", "🔴 payload 比宣告長（不准截斷）");
            BADREQ("{\"type\":\"batchwrite\",\"id\":54,\"slave\":80,\"addr\":0,\"awid\":2,\"page\":0,\"twr\":5,\"len\":2,\"data\":[1,2]}",
                   "page must be at least 1", "🔴 page 為 0");
            BADREQ("{\"type\":\"batchwrite\",\"id\":55,\"slave\":80,\"addr\":0,\"awid\":2,\"page\":300,\"twr\":5,\"len\":2,\"data\":[1,2]}",
                   "larger than", "page 超過一段能寫的上限");
            BADREQ("{\"type\":\"batchwrite\",\"id\":56,\"slave\":80,\"addr\":0,\"awid\":3,\"page\":32,\"twr\":5,\"len\":2,\"data\":[1,2]}",
                   "bad awid", "awid 不合法");
            BADREQ("{\"type\":\"batchwrite\",\"id\":57,\"slave\":80,\"addr\":0,\"awid\":0,\"page\":32,\"twr\":5,\"len\":2,\"data\":[1,2]}",
                   "no address phase", "awid 0（沒有位址相位就談不上分頁）");
            BADREQ("{\"type\":\"batchwrite\",\"id\":58,\"slave\":80,\"addr\":0,\"awid\":2,\"page\":32,\"len\":2,\"data\":[1,2]}",
                   "twr", "twr 缺");
            BADREQ("{\"type\":\"batchwrite\",\"id\":59,\"slave\":80,\"addr\":0,\"awid\":2,\"page\":32,\"twr\":99999,\"len\":2,\"data\":[1,2]}",
                   "ceiling", "twr 超過上限");
            BADREQ("{\"type\":\"batchwrite\",\"id\":60,\"slave\":80,\"addr\":0,\"awid\":2,\"page\":32,\"twr\":5,\"len\":2,\"data\":[1,300]}",
                   "0..255", "🔴 資料值 300（不准安靜變成 44）");
            BADREQ("{\"type\":\"batchwrite\",\"id\":61,\"slave\":80,\"addr\":0,\"awid\":2,\"page\":32,\"twr\":5,\"len\":2,\"data\":[1,-1]}",
                   "0..255", "🔴 資料值 -1（不准安靜變成 255）");
            BADREQ("{\"type\":\"batchwrite\",\"id\":62,\"slave\":80,\"addr\":0,\"awid\":2,\"page\":32,\"twr\":5,\"len\":2}",
                   "no `data`", "完全沒有 data 欄位");
            BADREQ("{\"type\":\"batchwrite\",\"id\":63,\"slave\":80,\"addr\":0,\"awid\":2,\"page\":32,\"twr\":5,\"len\":999999,\"data\":[1,2]}",
                   "at most", "len 超過整體上限");
            EQ_I(dgh_fake_writes, 0, "🔴 上面每一種非法輸入都**一個 byte 都沒寫出去**");
            #undef BADREQ

            /* ── 非持有者不得 batchwrite（別開後門）───────────────────────── */
            {   int NB=ws_open(hello,sizeof(hello));
                CHECK(NB>=0, "第二條連線（不持有 channel）");
                if(NB>=0){
                    CHECK(ws_cmd(NB,"{\"type\":\"batchwrite\",\"id\":70,\"slave\":80,\"addr\":0,\"awid\":2,"
                                    "\"page\":32,\"twr\":0,\"len\":2,\"data\":[1,2]}",rbuf,200000),
                          "非持有者的 batchwrite 有回覆");
                    CHECKS(rbuf,"\"busy\":true","🔴 非持有者不能 batchwrite（不是只有 read/write 要擋）");
                    close(NB); msleep(120);
                }
            }

            /* ── 超大 frame：明確回錯誤，而且**不斷線** ───────────────────── */
            G("11e. 🔴 超過收訊上限的 frame：明確回錯誤，連線留著");
            {   size_t huge=1200000;      /* > DGH_WS_MSG_MAX（262144×4＋4096 ≈ 1.05 MB） */
                char* hb=(char*)malloc(huge+1);
                if(hb){
                    memset(hb,'x',huge); hb[huge]=0;
                    memcpy(hb,"{\"type\":\"note\",\"msg\":\"",21);
                    ws_send_n(B,hb,huge);
                    CHECK(ws_recv(B,rbuf,200000), "超大 frame 有回覆（不是直接斷線）");
                    CHECKS(rbuf,"\"ok\":false","超大 frame 回失敗");
                    CHECKS(rbuf,"larger than","🔴 錯誤訊息講出「超過 bridge 接受的大小」");
                    CHECK(ws_cmd(B,"{\"type\":\"ping\",\"id\":71}",rbuf,200000) && strstr(rbuf,"\"type\":\"pong\"")!=NULL,
                          "🔴 超大 frame 之後連線還活著");
                    free(hb);
                }
            }
            dgh_fake_eeprom=0;            /* 還原，不影響後面（目前沒有後面，但不留地雷） */
            free(req); free(rbuf); free(want);
            close(B); msleep(200);
        } else { if(req)free(req); if(rbuf)free(rbuf); if(want)free(want); }
    }

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

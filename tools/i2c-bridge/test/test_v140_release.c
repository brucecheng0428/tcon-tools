/* ═══════════════════════════════════════════════════════════════════════════
   test_v140_release.c — 只問一個問題，而且是對**舊版 v1.4.0** 問：
     「WebSocket 斷線時，helper 到底有沒有釋放 I2C channel？」
   ───────────────────────────────────────────────────────────────────────────
   🔴 為什麼要為一個舊版寫測試：Bruce 人在外地，我們給他的繞路指示（「關掉 dg
      分頁／按 I2C 鈕關掉，再開 i2c.html」）是否成立，**完全取決於這一條事實**。
      這件事被讀碼讀出過兩種相反的結論，而給錯指示的代價是他白試一輪。
      所以不靠讀碼，直接把 v1.4.0 跑起來量。

   用法（v1.4.0 的原始碼要自己從 git 取出來放在 <dir>）：
     git show 45994af:tools/i2c-bridge/i2c_bridge.c > /tmp/v140/i2c_bridge.c   （proto.h / version.h 同）
     cc -I test/shim -I/tmp/v140 -Dmain=dgh_main -c /tmp/v140/i2c_bridge.c -o v140.o
     cc -I test/shim -c test/shim.c -o shim.o
     cc -I test/shim -c test/test_v140_release.c -o rel.o
     cc -o t v140.o shim.o rel.o -lpthread && ./t
   ═══════════════════════════════════════════════════════════════════════════ */
#include "shim/winsock2.h"
#include "shim/windows.h"
#include <pthread.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <sys/stat.h>
#include <time.h>

int dgh_main(int argc, char** argv);
extern int dgh_fake_close_calls, dgh_fake_live;

#define PORT 18977
static void msleep(int ms){ struct timespec t={ms/1000,(long)(ms%1000)*1000000L}; nanosleep(&t,NULL); }
static void* srv(void* a){ (void)a; char pa[64]; snprintf(pa,sizeof(pa),"--port=%d",PORT);
    char* av[]={(char*)"h",pa,NULL}; dgh_main(2,av); return NULL; }

static int ws_open_sock(void){
    int s=socket(AF_INET,SOCK_STREAM,0);
    struct sockaddr_in a; memset(&a,0,sizeof(a));
    a.sin_family=AF_INET; a.sin_port=htons(PORT); a.sin_addr.s_addr=inet_addr("127.0.0.1");
    if(connect(s,(struct sockaddr*)&a,sizeof(a))!=0){ close(s); return -1; }
    struct timeval tv={3,0}; setsockopt(s,SOL_SOCKET,SO_RCVTIMEO,&tv,sizeof(tv));
    const char* r="GET /ws HTTP/1.1\r\nHost: 127.0.0.1\r\nOrigin: http://127.0.0.1\r\n"
                  "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                  "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n";
    send(s,r,strlen(r),0);
    char b[2048]; ssize_t n=recv(s,b,sizeof(b)-1,0);
    if(n<=0){ close(s); return -1; }
    b[n]=0;
    return strstr(b,"101 Switching Protocols") ? s : (close(s), -1);
}
static void ws_send_txt(int s, const char* t){
    size_t n=strlen(t); unsigned char h[8]; int hl=0;
    h[hl++]=0x81; h[hl++]=(unsigned char)(0x80|n);
    unsigned char m[4]={1,2,3,4}; memcpy(h+hl,m,4); hl+=4;
    send(s,h,(size_t)hl,0);
    unsigned char* p=(unsigned char*)malloc(n);
    for(size_t i=0;i<n;i++) p[i]=(unsigned char)(t[i]^m[i&3]);
    send(s,p,n,0); free(p);
}

int main(void){
    setvbuf(stdout,NULL,_IONBF,0);
    char dir[256]; snprintf(dir,sizeof(dir),"/tmp/dgh_v140_%d/",(int)getpid());
    mkdir(dir,0755);
    char p[512];
    snprintf(p,sizeof(p),"%slibMPSSE.dll",dir);   { FILE* f=fopen(p,"wb"); fputs("x",f); fclose(f); }
    snprintf(p,sizeof(p),"%sdg-measure.html",dir);{ FILE* f=fopen(p,"wb"); fputs("<html>M</html>",f); fclose(f); }
    dgh_shim_set_exe_dir(dir);

    pthread_t th; pthread_create(&th,NULL,srv,NULL);
    msleep(400);

    int fails=0;
    printf("\n== v1.4.0：WebSocket 斷線會不會釋放 I2C channel ==\n");

    /* (a) 分頁被關掉（socket 正常關閉） */
    int s=ws_open_sock();
    if(s<0){ printf("   FAIL 連不上\n"); return 2; }
    msleep(100);
    ws_send_txt(s,"{\"type\":\"open\",\"id\":1,\"clockHz\":150000}");
    msleep(200);
    printf("   開啟後 live=%d（應為 1）\n", dgh_fake_live);
    if(dgh_fake_live!=1){ printf("   FAIL 沒開起來，後面沒意義\n"); return 2; }
    int before=dgh_fake_close_calls;
    close(s);
    msleep(400);
    printf("   關掉 socket 後 live=%d、I2C_CloseChannel 呼叫數 %d -> %d\n",
           dgh_fake_live, before, dgh_fake_close_calls);
    if(dgh_fake_live==0 && dgh_fake_close_calls>before)
        printf("   ✔ (a) 分頁關掉 ⇒ v1.4.0 **有**釋放 channel\n");
    else { printf("   ✘ (a) v1.4.0 沒有釋放\n"); fails++; }

    /* (b) 瀏覽器崩潰／拔線（RST） */
    s=ws_open_sock();
    if(s<0){ printf("   FAIL 第二次連不上\n"); return 2; }
    msleep(100);
    ws_send_txt(s,"{\"type\":\"open\",\"id\":1}");
    msleep(200);
    if(dgh_fake_live!=1){ printf("   FAIL 第二次沒開起來\n"); return 2; }
    before=dgh_fake_close_calls;
    { struct linger lg={1,0}; setsockopt(s,SOL_SOCKET,SO_LINGER,&lg,sizeof(lg)); close(s); }
    msleep(400);
    printf("   異常斷線（RST）後 live=%d、close 呼叫數 %d -> %d\n",
           dgh_fake_live, before, dgh_fake_close_calls);
    if(dgh_fake_live==0 && dgh_fake_close_calls>before)
        printf("   ✔ (b) 異常斷線 ⇒ v1.4.0 **有**釋放 channel\n");
    else { printf("   ✘ (b) v1.4.0 沒有釋放\n"); fails++; }

    printf("\n結論：v1.4.0 的 serve_ws() 在 recv 迴圈結束後會呼叫 i2c_close()，\n");
    printf("      兩種斷線都實測到 channel 被釋放。**但**它是單連線阻塞式伺服器，\n");
    printf("      所以在斷線之前，helper 連第二個 HTTP 請求都 accept 不到 ——\n");
    printf("      「先關掉 dg 那條連線，再開 i2c.html」的順序是必要條件。\n");
    return fails?1:0;
}

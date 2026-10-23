/* ═══════════════════════════════════════════════════════════════════════════
   sim_server.c — 1.19.0：把出貨的 i2c_bridge.c 原封跑成一支「模擬 bridge」，給網頁的
   Playwright 測試（tools/check_i2c_simul.mjs）用真 WebSocket 連。
   假 libMPSSE（治具）＋假 DLL_AUX_VC（顯示卡 AUX，一顆假 T-CON）都在 test/shim.c。
   🔴 模擬：沒有真治具、沒有真顯示卡；只證明「網頁 ↔ 這份 bridge 原始碼」的行為。
   用法：sim_server <port>（預設 8899）
   編譯：cc -O2 -w -I test/shim -Dmain=dgh_main -c i2c_bridge.c -o bo.o
         cc -O2 -w -I test/shim -c test/shim.c -o sh.o
         cc -O2 -w -I test -c test/sim_server.c -o ss.o && cc ss.o bo.o sh.o -o sim_server -lpthread
   ═══════════════════════════════════════════════════════════════════════════ */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/stat.h>
#include <time.h>
int dgh_main(int argc, char** argv);
void dgh_shim_set_exe_dir(const char* dir);
void dgh_fake_aux_reset(void);
extern unsigned char dgh_fake_aux_r3e[65536], dgh_fake_aux_r7c[256], dgh_fake_aux_r7d[65536];
int main(int argc, char** argv){
    char dir[256], p[512], portarg[64];
    int port = argc > 1 ? atoi(argv[1]) : 8899;
    const char* files[] = { "libMPSSE.dll", "DLL_AUX_VC.dll", NULL };
    int i;
    snprintf(dir, sizeof(dir), "/tmp/dgh_simsrv_%d_%ld/", (int)getpid(), (long)time(NULL));
    mkdir(dir, 0755);
    for (i = 0; files[i]; i++) { FILE* f; snprintf(p, sizeof(p), "%s%s", dir, files[i]); f = fopen(p, "wb"); if (!f) return 2; fputs("fake", f); fclose(f); }
    dgh_shim_set_exe_dir(dir);
    dgh_fake_aux_reset();
    /* EN01 板的辨認位（與 tools/check_i2c_aux.mjs 的假 bridge 同一組） */
    dgh_fake_aux_r7c[0x95] = 0x22; dgh_fake_aux_r7d[0x7D] = 0x0A; dgh_fake_aux_r3e[0x207E] = 0x10; dgh_fake_aux_r3e[0x59] = 0x1E;
    snprintf(portarg, sizeof(portarg), "--port=%d", port);
    { char* av[] = { (char*)"i2c-aux-bridge", portarg, NULL };
      setvbuf(stdout, NULL, _IONBF, 0);
      return dgh_main(2, av); }
}

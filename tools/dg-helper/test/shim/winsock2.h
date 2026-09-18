/* Win32 socket shim → POSIX。見 windows.h 開頭的說明。 */
#ifndef DGH_SHIM_WINSOCK2_H
#define DGH_SHIM_WINSOCK2_H

#include <sys/types.h>
#include <sys/socket.h>
#include <sys/select.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <errno.h>

typedef int SOCKET;
#define INVALID_SOCKET (-1)
#define SOCKET_ERROR   (-1)
#define closesocket(s) close(s)

typedef struct { int dummy; } WSADATA;
#define MAKEWORD(a,b) (((a)&0xFF) | (((b)&0xFF)<<8))
static inline int WSAStartup(int v, WSADATA* d){ (void)v; (void)d; return 0; }
static inline int WSACleanup(void){ return 0; }

/* 🔴 Windows 的 select() **忽略**第一個參數（nfds），POSIX 不是 —— 直接照搬
   `select(0,...)` 在 POSIX 上等於什麼都不監看、立刻回 0，會變成忙迴圈。
   這是平台語意差異，不是 dg_helper.c 的錯，所以由 shim 這一層翻譯：
   自己算出 max(fd)+1 再呼叫真正的 select。 */
int dgh_shim_select(fd_set* r, fd_set* w, fd_set* e, struct timeval* t);
#define select(n, r, w, e, t) dgh_shim_select((r), (w), (e), (t))

/* SO_RCVTIMEO 在 Windows 收 DWORD 毫秒，POSIX 收 struct timeval */
int dgh_shim_setsockopt(int s, int lvl, int opt, const char* val, int len);
#define setsockopt(s, lvl, opt, val, len) dgh_shim_setsockopt((s), (lvl), (opt), (const char*)(val), (int)(len))

#endif

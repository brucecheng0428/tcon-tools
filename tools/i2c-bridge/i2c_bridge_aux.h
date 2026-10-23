#ifndef I2C_BRIDGE_AUX_H
#define I2C_BRIDGE_AUX_H
/* ===========================================================================
 * i2c_bridge_aux.h -- DP AUX backend for the I2C Bridge (pure part, no Windows)
 * ---------------------------------------------------------------------------
 * Bruce 2026-10-23 (06:44, AUX evaluation report):
 *   "AUX bridge 可以的話跟 i2c bridge 做在一起，用一套轉發就好"
 *   "先用 I2C 網頁加入 AUX 控制（但一定要透過 tcon 來控制 i2c，不能直接對 eeprom 也寫入）"
 *
 * Shape:  browser --same WebSocket--> i2c-bridge.exe --DLL_AUX_VC.dll--> graphics
 *         driver (Intel IGCL / AMD ADL / NVIDIA) --DP AUX--> T-CON
 *
 * The page keeps sending the SAME read / rawwrite / write / batchwrite messages
 * (slave, addr, awid). When the page opened the channel with mode 4 (AUX) the
 * bridge routes each register access the way the vendor AUX tool does it
 * (RAD_AUX_DLL source, App/ICs/TconBase.cs):
 *
 *   slave 0x3E (2-byte offset): DPCD_Write(2, 0x430, [hi, lo]) then
 *                               DPCD_Read/Write(1, 0x435)         -- per byte
 *                               (TconBase.cs AuxReadRegister3E / AuxWriteRegister3E)
 *   slave 0x7C (1-byte offset): DPCD_Write(1, 0x431, [off]) then
 *                               DPCD_Read/Write(1, 0x434)         -- per byte
 *                               (TconBase.cs AuxReadRegister7C / AuxWriteRegister7C)
 *   slave 0x7D / 0x7E         : I2C-over-AUX (I2C_Write offset, then I2C_Read;
 *                               write = one I2C_Write of offset+data), MOT off
 *                               (RaydiumAuxWrapper.cs AuxIoaRead Intel/NVIDIA branch)
 *
 * 🔴 SAFETY (Bruce): only T-CON slaves are reachable in AUX mode. The whitelist is
 *    {0x3E, 0x7C, 0x7D, 0x7E}; everything else -- above all the EEPROM block
 *    0x50..0x57 -- is refused for read AND write, before anything goes on the wire.
 *    Raw DPCD writes into 0x480..0x48F (the T-CON's own EEPROM read/write-init and
 *    EEPROM write-protect window, RaydiumAuxWrapper.cs AuxEepromReadWriteInit /
 *    AuxEepromWriteProtect) are refused too.
 *
 * Calling convention of DLL_AUX_VC.dll is cdecl (AuxNativeApi.cs:20-109,
 * [UnmanagedFunctionPointer(CallingConvention.Cdecl)]). Functions the C# side
 * declares as `bool` are read as the LOW BYTE of the return register: correct
 * whether the DLL returns a C++ bool (AL only) or a Win32 BOOL (EAX).
 *
 * 🔴 NOT verified on real hardware (no Windows box with an eDP T-CON here).
 *    Verified: routing, whitelist and error paths against a mock DLL
 *    (test/test_aux.c, test/test_server_aux.c).
 * =========================================================================== */
#include <stdint.h>
#include <string.h>
#include <stdio.h>

#ifndef __cdecl
#  if defined(_WIN32) && (defined(__i386__) || defined(_M_IX86))
#    define __cdecl __attribute__((cdecl))
#  else
#    define __cdecl
#  endif
#endif

#define DGH_AUX_DLL      "DLL_AUX_VC.dll"
#define DGH_AUX_CHUNK    16u        /* DP AUX: at most 16 data bytes per transaction */
#define DGH_AUX_DPCD_MAX 16u        /* raw dpcd_read / dpcd_write per request */

/* Models.cs ST_POWER_PSR (LayoutKind.Sequential): int, int, byte, byte, short, IntPtr */
typedef struct {
    int           iResult;     /* 0 = OK (E_STATE.OK), -1 = not filled */
    int           iVersion;
    unsigned char u8Supported;
    unsigned char u8Enabled;
    short         padding;
    char*         strMsg;      /* allocated by the DLL; release with FreeString */
} DGH_AUX_PSR;

typedef unsigned char (__cdecl *PFN_AUX_Initial)(unsigned char* card, unsigned char* mon, unsigned char* proj);
typedef void          (__cdecl *PFN_AUX_Release)(void);
typedef int           (__cdecl *PFN_AUX_GetInitialState)(void);
typedef unsigned char (__cdecl *PFN_AUX_GetGraphCard)(void);
typedef unsigned char (__cdecl *PFN_AUX_Psr)(DGH_AUX_PSR* st);
typedef int           (__cdecl *PFN_AUX_Dpcd)(int bytes, int addr, unsigned char* data);
typedef int           (__cdecl *PFN_AUX_I2c)(int bytes, int addr, unsigned char* data, int mot);
typedef void          (__cdecl *PFN_AUX_FreeString)(void* p);

typedef struct {
    PFN_AUX_Initial         Initial;
    PFN_AUX_Release         Release;
    PFN_AUX_GetInitialState GetInitialState;
    PFN_AUX_GetGraphCard    GetGraphCard;
    PFN_AUX_Psr             GetPsr;
    PFN_AUX_Psr             SetPsr;
    PFN_AUX_Dpcd            DpcdRead;
    PFN_AUX_Dpcd            DpcdWrite;
    PFN_AUX_I2c             I2cRead;
    PFN_AUX_I2c             I2cWrite;
    PFN_AUX_FreeString      FreeString;
    void (*sleep_ms)(unsigned ms);   /* bridge: Sleep; tests: counter */
    unsigned delayMs;                /* per-access settle time (vendor tool: u16I2cSleepTime=1) */
} DGH_AUX_API;

/* E_GRAPH_CARD (Enums.cs) */
#define DGH_AUX_CARD_INTEL  0u
#define DGH_AUX_CARD_AMD    1u
#define DGH_AUX_CARD_NVIDIA 2u
#define DGH_AUX_CARD_QCOM   3u
static inline const char* dgh_aux_card_name(unsigned c){
    return c==DGH_AUX_CARD_INTEL?"INTEL":c==DGH_AUX_CARD_AMD?"AMD":c==DGH_AUX_CARD_NVIDIA?"NVIDIA":
           c==DGH_AUX_CARD_QCOM?"QCOM":"UNKNOWN";
}
/* Adapter description -> E_GRAPH_CARD, same rule as Common.cs AutoDetectGetGraphicsCardName
   (upper-cased name contains the enum description). "RADEON" added: AMD adapters are often
   named "Radeon(TM) Graphics" without the word AMD. Returns -1 when nothing matches. */
static inline int dgh_aux_card_from_name(const char* s){
    char u[256]; size_t i;
    if(!s) return -1;
    for(i=0;i<sizeof(u)-1 && s[i];i++){ char c=s[i]; u[i]=(c>='a'&&c<='z')?(char)(c-32):c; }
    u[i]=0;
    if(strstr(u,"INTEL"))  return (int)DGH_AUX_CARD_INTEL;
    if(strstr(u,"NVIDIA")) return (int)DGH_AUX_CARD_NVIDIA;
    if(strstr(u,"AMD") || strstr(u,"RADEON")) return (int)DGH_AUX_CARD_AMD;
    if(strstr(u,"QUALCOMM") || strstr(u,"QCOM") || strstr(u,"ADRENO")) return (int)DGH_AUX_CARD_QCOM;
    return -1;
}

/* ---- policy (pure) ---------------------------------------------------- */
static inline int dgh_aux_slave_ok(uint32_t slave){
    return slave==0x3Eu || slave==0x7Cu || slave==0x7Du || slave==0x7Eu;
}
static inline int dgh_aux_is_eeprom(uint32_t slave){ return slave>=0x50u && slave<=0x57u; }
/* Required offset width per slave (window format is fixed for 3E / 7C). 0 = any 1..4. */
static inline uint32_t dgh_aux_awid_for(uint32_t slave){
    return slave==0x3Eu ? 2u : slave==0x7Cu ? 1u : 0u;
}
#define DGH_AUX_EE_LO 0x480u
#define DGH_AUX_EE_HI 0x48Fu
static inline int dgh_aux_dpcd_write_ok(uint32_t addr, uint32_t n){
    uint32_t end;
    if(n==0u || n>DGH_AUX_DPCD_MAX) return 0;
    end = addr + n - 1u;
    if(end < addr || end > 0xFFFFFu) return 0;          /* DPCD is 20-bit */
    return (end < DGH_AUX_EE_LO || addr > DGH_AUX_EE_HI);
}
/* Fills `err` with the reason an access is refused; returns 1 when it is allowed. */
static inline int dgh_aux_check(uint32_t slave, uint32_t awid, int isWrite, char* err, size_t ecap){
    uint32_t want;
    if(dgh_aux_is_eeprom(slave)){
        snprintf(err,ecap,"DP AUX mode: slave 0x%02X is an EEPROM address. Direct EEPROM %s is blocked "
                 "in AUX mode -- the EEPROM may only be reached through the T-CON. Nothing was %s.",
                 slave, isWrite?"writes are":"access is", isWrite?"written":"read");
        return 0;
    }
    if(!dgh_aux_slave_ok(slave)){
        snprintf(err,ecap,"DP AUX mode: slave 0x%02X is not a T-CON register slave. AUX mode only "
                 "reaches the T-CON (0x3E, 0x7C, 0x7D, 0x7E). Nothing was %s.",
                 slave, isWrite?"written":"read");
        return 0;
    }
    want = dgh_aux_awid_for(slave);
    if(want && awid!=want){
        snprintf(err,ecap,"DP AUX mode: slave 0x%02X uses a %u-byte offset (got awid %u). Nothing was %s.",
                 slave, want, awid, isWrite?"written":"read");
        return 0;
    }
    if(!want && (awid<1u || awid>4u)){
        snprintf(err,ecap,"DP AUX mode: offset width %u is not usable on slave 0x%02X (1..4). Nothing was %s.",
                 awid, slave, isWrite?"written":"read");
        return 0;
    }
    return 1;
}

static inline int dgh_aux_b(int r){ return (r & 0xFF) != 0; }   /* bool = low byte */
static inline void dgh_aux_wait(const DGH_AUX_API* a){ if(a->delayMs && a->sleep_ms) a->sleep_ms(a->delayMs); }

/* ---- routing ---------------------------------------------------------- */
static inline int dgh_aux_reg_read(const DGH_AUX_API* a, uint32_t slave, uint32_t addr, uint32_t awid,
                                   uint32_t len, uint8_t* out, uint32_t* got, char* err, size_t ecap){
    uint32_t i;
    *got = 0;
    if(!dgh_aux_check(slave, awid, 0, err, ecap)) return 0;
    if(slave==0x3Eu){
        for(i=0;i<len;i++){
            uint32_t r = (addr + i) & 0xFFFFu;
            unsigned char ab[2] = { (unsigned char)(r>>8), (unsigned char)(r&0xFF) };
            if(!dgh_aux_b(a->DpcdWrite(2, 0x430, ab))){ snprintf(err,ecap,"AUX DPCD_Write 0x430 failed (3E:%04X)", r); return 0; }
            if(!dgh_aux_b(a->DpcdRead(1, 0x435, &out[i]))){ snprintf(err,ecap,"AUX DPCD_Read 0x435 failed (3E:%04X)", r); return 0; }
            dgh_aux_wait(a); (*got)++;
        }
        return 1;
    }
    if(slave==0x7Cu){
        for(i=0;i<len;i++){
            unsigned char o = (unsigned char)((addr + i) & 0xFF);
            if(!dgh_aux_b(a->DpcdWrite(1, 0x431, &o))){ snprintf(err,ecap,"AUX DPCD_Write 0x431 failed (7C:%02X)", o); return 0; }
            if(!dgh_aux_b(a->DpcdRead(1, 0x434, &out[i]))){ snprintf(err,ecap,"AUX DPCD_Read 0x434 failed (7C:%02X)", o); return 0; }
            dgh_aux_wait(a); (*got)++;
        }
        return 1;
    }
    /* 0x7D / 0x7E : I2C-over-AUX, 16-byte chunks, offset re-sent per chunk */
    for(i=0;i<len;){
        uint32_t n = len - i; unsigned char ob[4]; uint32_t k, off = addr + i;
        if(n > DGH_AUX_CHUNK) n = DGH_AUX_CHUNK;
        for(k=0;k<awid;k++) ob[k] = (unsigned char)(off >> (8u*(awid-1u-k)));
        if(!dgh_aux_b(a->I2cWrite((int)awid, (int)slave, ob, 0))){ snprintf(err,ecap,"AUX I2C_Write (offset) failed (%02X:%X) -- no ACK over AUX", slave, off); return 0; }
        dgh_aux_wait(a);
        if(!dgh_aux_b(a->I2cRead((int)n, (int)slave, out + i, 0))){ snprintf(err,ecap,"AUX I2C_Read failed (%02X:%X x%u)", slave, off, n); return 0; }
        dgh_aux_wait(a);
        i += n; *got = i;
    }
    return 1;
}
static inline int dgh_aux_reg_write(const DGH_AUX_API* a, uint32_t slave, uint32_t addr, uint32_t awid,
                                    const uint8_t* data, uint32_t len, uint32_t* done, char* err, size_t ecap){
    uint32_t i;
    *done = 0;
    if(!dgh_aux_check(slave, awid, 1, err, ecap)) return 0;
    if(slave==0x3Eu){
        for(i=0;i<len;i++){
            uint32_t r = (addr + i) & 0xFFFFu;
            unsigned char ab[2] = { (unsigned char)(r>>8), (unsigned char)(r&0xFF) };
            unsigned char d = data[i];
            if(!dgh_aux_b(a->DpcdWrite(2, 0x430, ab))){ snprintf(err,ecap,"AUX DPCD_Write 0x430 failed (3E:%04X)", r); return 0; }
            if(!dgh_aux_b(a->DpcdWrite(1, 0x435, &d))){ snprintf(err,ecap,"AUX DPCD_Write 0x435 failed (3E:%04X)", r); return 0; }
            dgh_aux_wait(a); (*done)++;
        }
        return 1;
    }
    if(slave==0x7Cu){
        for(i=0;i<len;i++){
            unsigned char o = (unsigned char)((addr + i) & 0xFF), d = data[i];
            if(!dgh_aux_b(a->DpcdWrite(1, 0x431, &o))){ snprintf(err,ecap,"AUX DPCD_Write 0x431 failed (7C:%02X)", o); return 0; }
            if(!dgh_aux_b(a->DpcdWrite(1, 0x434, &d))){ snprintf(err,ecap,"AUX DPCD_Write 0x434 failed (7C:%02X)", o); return 0; }
            dgh_aux_wait(a); (*done)++;
        }
        return 1;
    }
    for(i=0;i<len;){
        uint32_t n = len - i, k, off = addr + i; unsigned char fr[DGH_AUX_CHUNK];
        if(n > DGH_AUX_CHUNK - awid) n = DGH_AUX_CHUNK - awid;
        for(k=0;k<awid;k++) fr[k] = (unsigned char)(off >> (8u*(awid-1u-k)));
        memcpy(fr + awid, data + i, n);
        if(!dgh_aux_b(a->I2cWrite((int)(awid + n), (int)slave, fr, 0))){ snprintf(err,ecap,"AUX I2C_Write failed (%02X:%X x%u) -- no ACK over AUX", slave, off, n); return 0; }
        dgh_aux_wait(a);
        i += n; *done = i;
    }
    return 1;
}
/* After the M-Bus -> C-Bus command (7E:AB <- CD) the vendor AUX tool also sets
   7C:0F bit7 (MbusConnect in Tcon81008.cs:687-708 / Tcon8100x.cs:174-196 write 0x80;
   Tcon6111 / 81010 / 81011 read 7C:0F and set bit7 only when it is 0). We do the
   read-modify-write form: same result on EN01/E503 when the byte was 0, other bits kept. */
static inline int dgh_aux_is_mbus_cmd(uint32_t slave, uint32_t addr, const uint8_t* d, uint32_t n){
    return slave==0x7Eu && addr==0xABu && n==1u && d[0]==0xCDu;
}
static inline int dgh_aux_mbus_follow(const DGH_AUX_API* a, uint8_t* before, uint8_t* after, char* err, size_t ecap){
    uint8_t v=0, w; uint32_t g=0;
    if(!dgh_aux_reg_read(a, 0x7C, 0x0F, 1, 1, &v, &g, err, ecap)) return 0;
    *before = v;
    if(v & 0x80u){ *after = v; return 1; }
    w = (uint8_t)(v | 0x80u);
    if(!dgh_aux_reg_write(a, 0x7C, 0x0F, 1, &w, 1, &g, err, ecap)) return 0;
    *after = w; return 1;
}
#endif

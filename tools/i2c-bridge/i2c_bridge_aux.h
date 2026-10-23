#ifndef I2C_BRIDGE_AUX_H
#define I2C_BRIDGE_AUX_H
/* ===========================================================================
 * i2c_bridge_aux.h -- DP AUX backend for the I2C and AUX Bridge (pure part, no Windows)
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
 * 1.20.0: 0x3E / 0x7C READS go I2C-over-AUX to the same 7-bit slave first (DPCD window only as
 *         fallback, regPath); EEPROM 0x50..0x57 READ over I2C-over-AUX is allowed, writes blocked.
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

/* 1.20.1: ST_IOA (RAD_AUX_DLL Models.cs, LayoutKind.Sequential, x86) as DLL_AUX_VC.dll IOA_Read reads it.
   Disassembly of IOA_Read (RVA 0x36070, x86 package of 1.19.0/1.20.0): it reads only +0 slave (7-bit),
   +1 offset bytes, +2 u16 start address, +0x0F bytes per read, and passes the caller's data pointer through
   to the per-card routine. The AMD routine (RVA 0x38930) sends [slave<<1, offset...] and reads `bytes per
   read` through ADL2_Display_DDCBlockAccess_Get, 10 retries.
   🔴 Measured 2026-10-23 (AMD, Windows test box): I2C_Read on AMD is a stub (RVA 0x38810 = `mov al,1; ret`):
      it returns TRUE and leaves the buffer untouched -> 1.20.0 read stale memory ("7.26.20.1616", ".COM").
      The vendor AUX tool uses IOA_Read on AMD (RaydiumAuxWrapper.cs AuxIoaRead default branch). */
typedef struct {
    unsigned char  u8SlaveAddr;      /* +0  7-bit */
    unsigned char  u8OffsetBytes;    /* +1  1 or 2 */
    unsigned short u16StartAddr;     /* +2 */
    unsigned int   u32StartAddr;     /* +4 */
    int            iSize;            /* +8 */
    unsigned short u16I2cSleepTime;  /* +0x0C */
    unsigned char  u8BytePerWrite;   /* +0x0E */
    unsigned char  u8BytePerRead;    /* +0x0F */
    unsigned char  u8ReadData;       /* +0x10 */
    void*          au8Data;          /* +0x14 on x86 (managed byte[] field, pointer-sized) */
    int            bMOT;             /* C# bool field -> 4-byte BOOL */
} DGH_AUX_IOA;
typedef unsigned char (__cdecl *PFN_AUX_Ioa)(DGH_AUX_IOA* st, unsigned char* data);

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
    PFN_AUX_Ioa             IoaRead;     /* 1.20.1: DLL IOA_Read (used on AMD) */
    PFN_AUX_Ioa             IoaWrite;    /* 1.22.0: DLL IOA_Write (vendor MbusConnect 7E:AB<-CD) */
    int                     rom;         /* 1.22.0: DGH_AUX_ROM_EEPROM (default, vendor ICDefine.cs:49) / _FLASH */
    void (*tx)(const char* line);    /* 1.22.0: per-transaction trace (NULL = off) */
    int                     card;        /* 1.20.1: E_GRAPH_CARD of the open session (-1 = unknown) */
    void (*sleep_ms)(unsigned ms);   /* bridge: Sleep; tests: counter */
    unsigned delayMs;                /* per-access settle time (vendor tool: u16I2cSleepTime=1) */
    /* 1.20.0: how 0x3E / 0x7C register READS travel (Bruce 2026-10-23: "AUX 應該也可以去讀 3E 的位置，
       這樣子就可以用同樣方式去辨別是哪一種 Tcon"). DGH_AUX_PATH_AUTO (default) = I2C-over-AUX to the
       same 7-bit slave first (offset write, then read; no DPCD write needed), DPCD window only if
       that gets no ACK. */
    int regPath;
    int lastPath;                    /* path the last 3E/7C read actually used (DGH_AUX_PATH_IOA / _DPCD) */
} DGH_AUX_API;

#define DGH_AUX_PATH_AUTO 0
#define DGH_AUX_PATH_IOA  1
#define DGH_AUX_PATH_DPCD 2
static inline const char* dgh_aux_path_name(int p){ return p==DGH_AUX_PATH_IOA?"ioa":p==DGH_AUX_PATH_DPCD?"dpcd":"auto"; }

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
    /* 1.20.0 (Bruce 2026-10-23「靠 AUX 應該也要可以讀取 EEPROM 的資料，也就是靠 I2C over AUX 的方式去讀 0x50」):
       EEPROM 0x50..0x57 READ over I2C-over-AUX is allowed; WRITES stay blocked (Bruce 10-23
       「不能直接對 eeprom 也寫入」). */
    if(dgh_aux_is_eeprom(slave)){
        if(!isWrite){
            if(awid<1u || awid>2u){
                snprintf(err,ecap,"DP AUX mode: EEPROM 0x%02X read needs a 1- or 2-byte offset (got awid %u). Nothing was read.", slave, awid);
                return 0;
            }
            return 1;
        }
        snprintf(err,ecap,"DP AUX mode: slave 0x%02X is an EEPROM address. Direct EEPROM writes are blocked "
                 "in AUX mode -- the EEPROM may only be written through the T-CON. Nothing was written.", slave);
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
/* I2C-over-AUX read of any 7-bit slave: write the offset (awid bytes, MSB first), then read,
   16-byte chunks, offset re-sent per chunk, MOT off (RaydiumAuxWrapper.cs AuxIoaRead Intel/NVIDIA
   branch). The slave is passed as the 7-bit address, the same number the I2C jig uses. */
static inline int dgh_aux_ioa_read(const DGH_AUX_API* a, uint32_t slave, uint32_t addr, uint32_t awid,
                                   uint32_t len, uint8_t* out, uint32_t* got, char* err, size_t ecap){
    uint32_t i;
    *got = 0;
    /* 1.20.1: AMD -> IOA_Read (I2C_Read is a stub there, see DGH_AUX_IOA). Same 7-bit slave, same offset. */
    if(a->card == (int)DGH_AUX_CARD_AMD){
        if(!a->IoaRead){ snprintf(err,ecap,"AUX: AMD graphics need IOA_Read in DLL_AUX_VC.dll (not found)"); return 0; }
        if(awid<1u || awid>2u){ snprintf(err,ecap,"AUX (AMD): offset width %u not supported by IOA_Read (1 or 2)", awid); return 0; }
        for(i=0;i<len;){
            uint32_t n = len - i, off = addr + i; DGH_AUX_IOA st;
            if(n > DGH_AUX_CHUNK) n = DGH_AUX_CHUNK;
            memset(&st, 0, sizeof(st));
            st.u8SlaveAddr = (unsigned char)slave; st.u8OffsetBytes = (unsigned char)awid;
            st.u16StartAddr = (unsigned short)(off & 0xFFFFu); st.u32StartAddr = off;
            st.iSize = (int)n; st.u16I2cSleepTime = 1; st.u8BytePerRead = (unsigned char)n;
            st.au8Data = out + i; st.bMOT = 1;
            if(!dgh_aux_b(a->IoaRead(&st, out + i))){ snprintf(err,ecap,"AUX IOA_Read failed (%02X:%X x%u) -- no ACK over AUX", slave, off, n); return 0; }
            dgh_aux_wait(a);
            i += n; *got = i;
        }
        return 1;
    }
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

static inline int dgh_aux_reg_read(const DGH_AUX_API* a, uint32_t slave, uint32_t addr, uint32_t awid,
                                   uint32_t len, uint8_t* out, uint32_t* got, char* err, size_t ecap){
    uint32_t i;
    *got = 0;
    if(!dgh_aux_check(slave, awid, 0, err, ecap)) return 0;
    /* 1.21.0: like the vendor AUX tool (RAD_AUX_DLL AuxApi.cs:420 Tcon_Read_Register -> TconBase.cs AuxReadRegister3E /
       AuxReadRegister7C): 3E / 7C reads use the DPCD window by default (AUTO == DPCD). I2C-over-AUX only when the page
       asks for it (regpath=1). Measured 2026-10-23 on AMD: IOA to 3E returns "success" with 00 when the T-CON does not
       answer, so trying IOA first gave fake 00 and a wrong T-CON id. */
    if((slave==0x3Eu || slave==0x7Cu) && a->regPath == DGH_AUX_PATH_IOA){
        char e1[200] = "";
        ((DGH_AUX_API*)a)->lastPath = DGH_AUX_PATH_IOA;
        if(dgh_aux_ioa_read(a, slave, addr, awid, len, out, got, e1, sizeof(e1))) return 1;
        if(a->regPath == DGH_AUX_PATH_IOA){ snprintf(err,ecap,"%s", e1); return 0; }
        *got = 0;   /* AUTO: fall back to the vendor DPCD window below */
        if(len){ /* keep the IOA reason in front of a DPCD failure */ }
        ((DGH_AUX_API*)a)->lastPath = DGH_AUX_PATH_DPCD;
        {   int ok = 0;
            char e2[200] = "";
            /* run the window path; on failure report both */
            if(slave==0x3Eu){
                for(i=0;i<len;i++){
                    uint32_t r = (addr + i) & 0xFFFFu;
                    unsigned char ab[2] = { (unsigned char)(r>>8), (unsigned char)(r&0xFF) };
                    if(!dgh_aux_b(a->DpcdWrite(2, 0x430, ab))){ snprintf(e2,sizeof(e2),"DPCD window: DPCD_Write 0x430 failed (3E:%04X)", r); break; }
                    if(!dgh_aux_b(a->DpcdRead(1, 0x435, &out[i]))){ snprintf(e2,sizeof(e2),"DPCD window: DPCD_Read 0x435 failed (3E:%04X)", r); break; }
                    dgh_aux_wait(a); (*got)++;
                }
            } else {
                for(i=0;i<len;i++){
                    unsigned char o = (unsigned char)((addr + i) & 0xFF);
                    if(!dgh_aux_b(a->DpcdWrite(1, 0x431, &o))){ snprintf(e2,sizeof(e2),"DPCD window: DPCD_Write 0x431 failed (7C:%02X)", o); break; }
                    if(!dgh_aux_b(a->DpcdRead(1, 0x434, &out[i]))){ snprintf(e2,sizeof(e2),"DPCD window: DPCD_Read 0x434 failed (7C:%02X)", o); break; }
                    dgh_aux_wait(a); (*got)++;
                }
            }
            ok = (*got == len);
            if(!ok) snprintf(err,ecap,"I2C over AUX: %s; %s", e1, e2);
            return ok;
        }
    }
    if(slave==0x3Eu){
        ((DGH_AUX_API*)a)->lastPath = DGH_AUX_PATH_DPCD;
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
        ((DGH_AUX_API*)a)->lastPath = DGH_AUX_PATH_DPCD;
        for(i=0;i<len;i++){
            unsigned char o = (unsigned char)((addr + i) & 0xFF);
            if(!dgh_aux_b(a->DpcdWrite(1, 0x431, &o))){ snprintf(err,ecap,"AUX DPCD_Write 0x431 failed (7C:%02X)", o); return 0; }
            if(!dgh_aux_b(a->DpcdRead(1, 0x434, &out[i]))){ snprintf(err,ecap,"AUX DPCD_Read 0x434 failed (7C:%02X)", o); return 0; }
            dgh_aux_wait(a); (*got)++;
        }
        return 1;
    }
    /* 0x7D / 0x7E / EEPROM 0x50..0x57 (read only): I2C-over-AUX */
    return dgh_aux_ioa_read(a, slave, addr, awid, len, out, got, err, ecap);
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
/* ═══ 1.22.0：DP AUX 照原廠 EN01 UI（Wpf.RomCodeProcessUI → RAD_AUX_DLL，RM81008／Tcon81008）逐步一致 ═══════════
   Bruce 2026-10-23「那就依照原廠 UI 的行為吧」「原廠 UI 有做還原的動作嗎？」：原廠做什麼就做什麼，沒做的一律不加。
   出處（~/ClaudeData/Projects/WPF_RomCodeProcessUI/DLL_RAD_TCON_IC/RAD_AUX_DLL）：
     ① 初始化 EEPROM  Tcon81008.cs:16–32（＋:333–355 3E:0065←1E；RaydiumAuxWrapper.cs:165–186 482=80）
     ① 初始化 Flash   Tcon81008.cs:34–63（TconBase.cs:273–327）
     ③ MbusConnect     Tcon81008.cs:687–714（7E:AB←CD 走 IOA_Write，sleep 7；7C:0F←80 走 DPCD 431/434，sleep 7）
     ④ End EEPROM      Tcon81008.cs:86–105      ④ End Flash  Tcon81008.cs:107–119
     讀 3E             TconBase.cs:373–391（430=[MSB,LSB]、讀 435、Delay(sleep)）
     讀 7C             TconBase.cs:413–426（431=低位址、讀 434、Delay(sleep)）
     其他 slave        RaydiumAuxWrapper.cs:103–142 AuxIoaRead（AMD：IOA_Read，bMOT=1；Intel／NVIDIA：I2C_Write 位址、Delay、I2C_Read）
     每個 byte 的包法  AuxApi.cs:420–462 Tcon_Read_Register（3E 不初始化不 End；7C／7D 初始化＋MbusConnect＋讀＋End；其他 初始化＋讀＋End）
     EEPROM 0x50 讀    AuxApi.cs:304–332 Tcon_Read_Rom＋Tcon81008.cs:192–245 ReadEeprom（每 8 byte 先 480=FF，sleep 10）
     寫暫存器         AuxApi.cs:464–497 Tcon_Write_Register（3E 直接寫；其他 初始化＋CheckAndWriteRegisterRomWP＋寫＋End，不做 MbusConnect）
   原廠 AuxDpcdWrite／AuxDpcdRead 失敗就丟例外（RaydiumAuxWrapper.cs:73–85）⇒ 序列在第一筆失敗處中止，後面（含 End）不送；這裡照做。
   每一筆實際送出的 DPCD／IOA／I2C 交易都經 a->tx 記錄（bridge：i2c-aux-bridge.log＋auxtx 指令），供逐筆對照步驟表。 */
#include <stdarg.h>
#define DGH_AUX_ROM_EEPROM 0
#define DGH_AUX_ROM_FLASH  1
#define DGH_AUX_V_SLEEP    10u   /* AuxApi(…, iDelayMs = 10)：RM81008 建構子預設，stIoaTcon.u16I2cSleepTime */
#define DGH_AUX_V_EECHUNK  8u    /* RM81008.cs:67 PerSize.u8EepromReadSize = 8 */

static inline void dgh_v_tx(const DGH_AUX_API* a, const char* fmt, ...){
    char b[160]; va_list ap;
    if(!a->tx) return;
    va_start(ap, fmt); vsnprintf(b, sizeof(b), fmt, ap); va_end(ap);
    a->tx(b);
}
static inline void dgh_v_sleep(const DGH_AUX_API* a, unsigned ms){ if(ms && a->sleep_ms) a->sleep_ms(ms); }
static inline int dgh_v_dw(const DGH_AUX_API* a, int n, int addr, unsigned char* d, char* err, size_t ecap){
    int ok = dgh_aux_b(a->DpcdWrite(n, addr, d));
    if(n==2) dgh_v_tx(a, "DPCD W %03X=%02X %02X %s", addr, d[0], d[1], ok?"ok":"FAIL");
    else     dgh_v_tx(a, "DPCD W %03X=%02X %s", addr, d[0], ok?"ok":"FAIL");
    if(!ok) snprintf(err, ecap, "AUX DPCD Write Fail! Addr: %X Data: %X", addr, d[0]);
    return ok;
}
static inline int dgh_v_dw1(const DGH_AUX_API* a, int addr, unsigned char v, char* err, size_t ecap){ return dgh_v_dw(a, 1, addr, &v, err, ecap); }
static inline int dgh_v_dr(const DGH_AUX_API* a, int addr, unsigned char* d, char* err, size_t ecap){
    int ok = dgh_aux_b(a->DpcdRead(1, addr, d));
    dgh_v_tx(a, "DPCD R %03X -> %02X %s", addr, *d, ok?"ok":"FAIL");
    if(!ok) snprintf(err, ecap, "AUX DPCD Read Fail! Addr: %X", addr);
    return ok;
}
/* AuxIoaRead（RaydiumAuxWrapper.cs:103–142），一次 n byte（u8BytePerRead = n） */
static inline int dgh_v_ioa_read(const DGH_AUX_API* a, uint32_t slave, uint32_t off, uint32_t awid, uint32_t n,
                                 uint8_t* out, unsigned sleepMs, char* err, size_t ecap){
    int ok; uint32_t k;
    if(a->card == (int)DGH_AUX_CARD_AMD || a->card == (int)DGH_AUX_CARD_QCOM){
        DGH_AUX_IOA st;
        if(!a->IoaRead){ snprintf(err, ecap, "AUX: IOA_Read not found in DLL_AUX_VC.dll"); return 0; }
        memset(&st, 0, sizeof(st));
        st.u8SlaveAddr = (unsigned char)slave; st.u8OffsetBytes = (unsigned char)awid;
        st.u16StartAddr = (unsigned short)(off & 0xFFFFu); st.u32StartAddr = off; st.iSize = (int)n;
        st.u16I2cSleepTime = (unsigned short)sleepMs; st.u8BytePerRead = (unsigned char)n; st.u8BytePerWrite = 1;
        st.au8Data = out; st.bMOT = 1;   /* :128 bMOT = !RAD6111 */
        ok = dgh_aux_b(a->IoaRead(&st, out));
        dgh_v_sleep(a, sleepMs);
    } else {
        unsigned char ob[2];
        if(awid==2u){ ob[0]=(unsigned char)(off>>8); ob[1]=(unsigned char)off; } else ob[0]=(unsigned char)off;
        ok = dgh_aux_b(a->I2cWrite((int)awid, (int)slave, ob, 0));
        if(ok){ dgh_v_sleep(a, sleepMs); ok = dgh_aux_b(a->I2cRead((int)n, (int)slave, out, 0)); }
    }
    {   char hx[3*16+1]; size_t p=0; hx[0]=0;
        for(k=0;k<n && k<16u && ok;k++) p += (size_t)snprintf(hx+p, sizeof(hx)-p, "%s%02X", k?" ":"", out[k]);
        dgh_v_tx(a, "IOA R %02X:%0*X x%u -> %s %s", slave, (int)(awid*2u), off, n, ok?hx:"", ok?"ok":"FAIL"); }
    if(!ok) snprintf(err, ecap, "AUX IOA Read Fail! SlaveAddr: %X, Addr: %X, Size: %X", slave, off, n);
    return ok;
}
/* AuxIoaWrite（RaydiumAuxWrapper.cs:91–101）：IOA_Write、Delay(sleep)；失敗在 AMD 不算錯（:96） */
static inline int dgh_v_ioa_write1(const DGH_AUX_API* a, uint32_t slave, uint32_t off, uint32_t awid, unsigned char v,
                                   unsigned sleepMs, char* err, size_t ecap){
    DGH_AUX_IOA st; int ok;
    if(!a->IoaWrite){ snprintf(err, ecap, "AUX: IOA_Write not found in DLL_AUX_VC.dll"); return 0; }
    memset(&st, 0, sizeof(st));
    st.u8SlaveAddr = (unsigned char)slave; st.u8OffsetBytes = (unsigned char)awid;
    st.u16StartAddr = (unsigned short)(off & 0xFFFFu); st.u32StartAddr = off; st.iSize = 1;
    st.u16I2cSleepTime = (unsigned short)sleepMs; st.u8BytePerWrite = 1; st.u8BytePerRead = 1; st.bMOT = 0;
    ok = dgh_aux_b(a->IoaWrite(&st, &v));
    dgh_v_sleep(a, sleepMs);
    dgh_v_tx(a, "IOA W %02X:%0*X=%02X %s", slave, (int)(awid*2u), off, v, ok?"ok":"FAIL");
    if(!ok && a->card != (int)DGH_AUX_CARD_AMD){ snprintf(err, ecap, "AUX IOA Write Fail! SlaveAddr: %X, Addr: %X", slave, off); return 0; }
    return 1;
}
/* 3E 讀／寫（TconBase.cs:373–411） */
static inline int dgh_v_read3e(const DGH_AUX_API* a, uint32_t addr, uint32_t n, uint8_t* out, unsigned sleepMs, char* err, size_t ecap){
    uint32_t i;
    for(i=0;i<n;i++){
        uint32_t r = (addr + i) & 0xFFFFu; unsigned char ab[2] = { (unsigned char)(r>>8), (unsigned char)(r&0xFF) };
        if(!dgh_v_dw(a, 2, 0x430, ab, err, ecap)) return 0;
        if(!dgh_v_dr(a, 0x435, &out[i], err, ecap)) return 0;
        dgh_v_sleep(a, sleepMs);
    }
    return 1;
}
static inline int dgh_v_write3e(const DGH_AUX_API* a, uint32_t addr, unsigned char v, unsigned sleepMs, char* err, size_t ecap){
    unsigned char ab[2] = { (unsigned char)(addr>>8), (unsigned char)(addr&0xFF) };
    if(!dgh_v_dw(a, 2, 0x430, ab, err, ecap)) return 0;
    if(!dgh_v_dw1(a, 0x435, v, err, ecap)) return 0;
    dgh_v_sleep(a, sleepMs);
    return 1;
}
/* ① 初始化 */
static inline int dgh_v_init(const DGH_AUX_API* a, char* err, size_t ecap){
    if(a->rom == DGH_AUX_ROM_FLASH){
        unsigned char v=0xAA, m=0, ab[2]; int is1435; unsigned short mem;
        dgh_v_tx(a, "-- init (flash, Tcon81008.cs:34-63)");
        if(!dgh_v_dw1(a,0x4D2,0xAD,err,ecap)) return 0; dgh_v_sleep(a,1);
        if(!dgh_v_dw1(a,0x4D1,0xDA,err,ecap)) return 0; dgh_v_sleep(a,1);
        if(!dgh_v_dr(a,0x43B,&v,err,ecap)){ snprintf(err,ecap,"TCON 81011 Initialize DPCD Read Addr 0x43B Fail!"); return 0; }
        is1435 = (v==0x00); mem = is1435?0x9C:0xC3; ab[0]=(unsigned char)(mem>>8); ab[1]=(unsigned char)(mem&0xFF);
        if(!dgh_v_dw(a,2,0x430,ab,err,ecap)) return 0; dgh_v_sleep(a,1);           /* McuMemRead */
        if(!dgh_v_dr(a,0x436,&m,err,ecap)) return 0; dgh_v_sleep(a,1);
        m = (unsigned char)(m | (is1435?0x40:0x02));
        if(!dgh_v_dw(a,2,0x430,ab,err,ecap)) return 0; dgh_v_sleep(a,1);           /* McuMemWrite */
        if(!dgh_v_dw1(a,0x436,m,err,ecap)) return 0; dgh_v_sleep(a,1);
        if(!dgh_v_dw1(a,0x431,0x00,err,ecap)) return 0; dgh_v_sleep(a,1);          /* McuCtrlClk(true) */
        if(!dgh_v_dw1(a,0x439,0x08,err,ecap)) return 0; dgh_v_sleep(a,1);
        if(!dgh_v_dw1(a,0x431,0x03,err,ecap)) return 0; dgh_v_sleep(a,1);          /* CbusMbusSelect */
        if(!dgh_v_dw1(a,0x439,0x80,err,ecap)) return 0; dgh_v_sleep(a,1);
        if(!dgh_v_dw1(a,0x480,0xFF,err,ecap)) return 0; dgh_v_sleep(a,1);
        return 1;
    } else {
        static const unsigned short ad[10] = {0x4D2,0x4D1,0x430,0x431,0x436,0x480,0x431,0x439,0x431,0x439};
        static const unsigned char  dv[10] = {0xAD, 0xDA, 0x00, 0xC3, 0xA2, 0xFF, 0x00, 0x08, 0x03, 0xC0};
        int i;
        dgh_v_tx(a, "-- init (eeprom, Tcon81008.cs:16-32)");
        for(i=0;i<10;i++){ if(!dgh_v_dw1(a, ad[i], dv[i], err, ecap)) return 0; dgh_v_sleep(a,1); }
        if(!dgh_v_write3e(a, 0x0065, 0x1E, 7, err, ecap)) return 0;              /* AuxEepromGpioWriteProtect */
        if(!dgh_v_dw1(a, 0x482, 0x80, err, ecap)) return 0;                       /* AuxEepromWriteProtect(LOW) */
        return 1;
    }
}
/* ④ End */
static inline int dgh_v_end(const DGH_AUX_API* a, char* err, size_t ecap){
    if(a->rom == DGH_AUX_ROM_FLASH){
        dgh_v_tx(a, "-- end (flash, Tcon81008.cs:107-119)");
        if(!dgh_v_dw1(a,0x431,0x03,err,ecap)) return 0; dgh_v_sleep(a,1);
        if(!dgh_v_dw1(a,0x439,0x80,err,ecap)) return 0; dgh_v_sleep(a,1);
        if(!dgh_v_dw1(a,0x431,0x00,err,ecap)) return 0; dgh_v_sleep(a,1);
        if(!dgh_v_dw1(a,0x439,0x04,err,ecap)) return 0; dgh_v_sleep(a,1);
        if(!dgh_v_dw1(a,0x4D2,0xAD,err,ecap)) return 0; dgh_v_sleep(a,1);
        return 1;
    } else {
        static const unsigned short ad[9] = {0x431,0x436,0x431,0x439,0x430,0x431,0x482,0x4D1,0x480};
        static const unsigned char  dv[9] = {0xC3, 0xA0, 0x00, 0x04, 0x00, 0x00, 0xC0, 0x00, 0x00};
        int i;
        dgh_v_tx(a, "-- end (eeprom, Tcon81008.cs:86-105)");
        for(i=0;i<9;i++){ if(!dgh_v_dw1(a, ad[i], dv[i], err, ecap)) return 0; dgh_v_sleep(a,1); }
        return 1;
    }
}
/* ③ MbusConnect */
static inline int dgh_v_mbus(const DGH_AUX_API* a, char* err, size_t ecap){
    dgh_v_tx(a, "-- MbusConnect (Tcon81008.cs:687-714)");
    if(!dgh_v_ioa_write1(a, 0x7E, 0xAB, 1, 0xCD, 7, err, ecap)) return 0;
    if(!dgh_v_dw1(a, 0x431, 0x0F, err, ecap)) return 0;
    if(!dgh_v_dw1(a, 0x434, 0x80, err, ecap)) return 0;
    dgh_v_sleep(a, 7);
    return 1;
}
/* CheckRegisterChecksum（Tcon81008.cs:144–171）：3E:0000 兩個 byte，sleep 1；00 00／FF FF ⇒ 不是 */
static inline int dgh_v_checksum(const DGH_AUX_API* a, uint8_t out2[2], char* err, size_t ecap){
    if(!dgh_v_read3e(a, 0x0000, 2, out2, 1, err, ecap)) return 0;
    {   int v = (out2[0]<<8) | out2[1];
        return !(v==0x0000 || v==0xFFFF); }
}
/* Tcon_Read_Register（AuxApi.cs:420–462）逐 byte；EEPROM 0x50–0x57 走 Tcon_Read_Rom（整段一次 ①／④） */
static inline int dgh_aux_v_read(const DGH_AUX_API* a, uint32_t slave, uint32_t addr, uint32_t awid,
                                 uint32_t len, uint8_t* out, uint32_t* got, char* err, size_t ecap){
    uint32_t i;
    *got = 0;
    if(!dgh_aux_check(slave, awid, 0, err, ecap)) return 0;
    ((DGH_AUX_API*)a)->lastPath = DGH_AUX_PATH_DPCD;
    if(dgh_aux_is_eeprom(slave)){
        dgh_v_tx(a, "== read EEPROM %02X:%0*X x%u (AuxApi.cs:304-332)", slave, (int)(awid*2u), addr, len);
        if(!dgh_v_init(a, err, ecap)) return 0;
        if(a->card == (int)DGH_AUX_CARD_INTEL && (slave==0x50u || slave==0x10u)){
            /* ReplaceIntelSlaveAddress（Tcon81008.cs:300–319）：Intel 改走 slave 0x10，MCU mem 0x98 = 0x80|0x10 */
            unsigned char ab[2] = {0x00, 0x98};
            if(!dgh_v_dw(a, 2, 0x430, ab, err, ecap)) return 0; dgh_v_sleep(a, 1);
            if(!dgh_v_dw1(a, 0x436, 0x90, err, ecap)) return 0; dgh_v_sleep(a, 1);
            slave = 0x10u;
        }
        for(i=0;i<len;){
            uint32_t n = len - i; if(n > DGH_AUX_V_EECHUNK) n = DGH_AUX_V_EECHUNK;
            if(len < DGH_AUX_V_EECHUNK) n = 1;                 /* ReadEeprom：iTotalSize < iReadSize ⇒ 1 byte 一次 */
            if(!dgh_v_dw1(a, 0x480, 0xFF, err, ecap)) return 0; dgh_v_sleep(a, 1);   /* EepromVerA1First */
            if(!dgh_v_ioa_read(a, slave, addr + i, awid, n, out + i, DGH_AUX_V_SLEEP, err, ecap)) return 0;
            i += n; *got = i;
        }
        return dgh_v_end(a, err, ecap);
    }
    for(i=0;i<len;i++){
        uint32_t off = addr + i;
        dgh_v_tx(a, "== read %02X:%0*X (AuxApi.cs:420)", slave, (int)(awid*2u), off);
        if(slave==0x3Eu){
            if(!dgh_v_read3e(a, off, 1, &out[i], DGH_AUX_V_SLEEP, err, ecap)) return 0;
        } else {
            if(!dgh_v_init(a, err, ecap)) return 0;
            if(slave==0x7Cu || slave==0x7Du){ if(!dgh_v_mbus(a, err, ecap)) return 0; }
            if(slave==0x7Cu){
                unsigned char o = (unsigned char)(off & 0xFF);
                if(!dgh_v_dw1(a, 0x431, o, err, ecap)) return 0;
                if(!dgh_v_dr(a, 0x434, &out[i], err, ecap)) return 0;
                dgh_v_sleep(a, DGH_AUX_V_SLEEP);
            } else {
                if(!dgh_v_ioa_read(a, slave, off, awid, 1, &out[i], DGH_AUX_V_SLEEP, err, ecap)) return 0;
            }
            if(!dgh_v_end(a, err, ecap)) return 0;
        }
        *got = i + 1;
    }
    return 1;
}
/* Tcon_Write_Register（AuxApi.cs:464–497）逐 byte。EEPROM 直寫照舊擋（dgh_aux_check）。 */
static inline int dgh_aux_v_write(const DGH_AUX_API* a, uint32_t slave, uint32_t addr, uint32_t awid,
                                  const uint8_t* data, uint32_t len, uint32_t* done, char* err, size_t ecap){
    uint32_t i;
    *done = 0;
    if(!dgh_aux_check(slave, awid, 1, err, ecap)) return 0;
    for(i=0;i<len;i++){
        uint32_t off = addr + i;
        dgh_v_tx(a, "== write %02X:%0*X=%02X (AuxApi.cs:464)", slave, (int)(awid*2u), off, data[i]);
        if(slave==0x3Eu){
            if(!dgh_v_write3e(a, off, data[i], DGH_AUX_V_SLEEP, err, ecap)) return 0;
        } else {
            uint8_t ck[2] = {0,0};
            if(!dgh_v_init(a, err, ecap)) return 0;
            /* CheckAndWriteRegisterRomWP（Tcon81008.cs:806–839）：3E:0000＝01 23 ⇒ 3E:0065←1E */
            if(!dgh_v_read3e(a, 0x0000, 2, ck, 1, err, ecap)) return 0;
            if(ck[0]==0x01 && ck[1]==0x23){ if(!dgh_v_write3e(a, 0x0065, 0x1E, 1, err, ecap)) return 0; }
            if(slave==0x7Cu){
                if(!dgh_v_dw1(a, 0x431, (unsigned char)(off & 0xFF), err, ecap)) return 0;
                if(!dgh_v_dw1(a, 0x434, data[i], err, ecap)) return 0;
                dgh_v_sleep(a, DGH_AUX_V_SLEEP);
            } else {
                if(!dgh_v_ioa_write1(a, slave, off, awid, data[i], DGH_AUX_V_SLEEP, err, ecap)) return 0;
            }
            if(!dgh_v_end(a, err, ecap)) return 0;
        }
        *done = i + 1;
    }
    return 1;
}
#endif

/* ═══════════════════════════════════════════════════════════════════════════
   test_aux.c — i2c_bridge_aux.h（DP AUX 路由＋只到得了 T-CON 的白名單）純函式測試
   Bruce 2026-10-23：「一定要透過 tcon 來控制 i2c，不能直接對 eeprom 也寫入」
   做法：一個計數用的 mock API；每個被擋的存取都要求「DLL 一次都沒被呼叫」。
   cc -O2 -I . test/test_aux.c -o test_aux && ./test_aux
   🔴 驗不到：真顯示卡驅動、真 AUX 波形、真 T-CON 對 DPCD 0x430/0x435 的回應。
   ═══════════════════════════════════════════════════════════════════════════ */
#include <stdio.h>
#include <string.h>
#include <stddef.h>
#include "i2c_bridge_aux.h"

static int fails=0, total=0;
static void CHECK(int c, const char* n){ total++; if(!c){ fails++; printf("   FAIL  %s\n", n); } }

static int calls=0, ee=0, eeW=0, ioaTcon=0;   /* ioaTcon: mock T-CON answers 3E/7C over I2C-over-AUX */
static unsigned p3e=0, p7cI=0, pEE=0; static unsigned char rEE[65536];
static unsigned char dpcd[0x1000], r3e[65536], r7c[256], r7d[65536], r7e[256];
static unsigned p7d=0, p7e=0;
static unsigned ptr(void){ return ((unsigned)dpcd[0x430]<<8)|dpcd[0x431]; }
static int mDR(int n,int a,unsigned char* d){ int i; calls++; for(i=0;i<n;i++){ int x=a+i;
    d[i]= x==0x435?r3e[ptr()]: x==0x434?r7c[dpcd[0x431]]: dpcd[x]; } return 0x100|1; /* 高位垃圾：只看低位 */ }
static int mDW(int n,int a,unsigned char* d){ int i; calls++; for(i=0;i<n;i++){ int x=a+i;
    if(x==0x435) r3e[ptr()]=d[i]; else if(x==0x434) r7c[dpcd[0x431]]=d[i]; else dpcd[x]=d[i]; } return 1; }
static int mIW(int n,int s,unsigned char* d,int mot){ int i; (void)mot; calls++;
    if(s>=0x50&&s<=0x57){ ee++; if(n>2) eeW++; pEE = n>=2 ? (((unsigned)d[0]<<8)|d[1]) : d[0]; return 1; }
    if(s==0x3E){ if(!ioaTcon) return 0; p3e=((unsigned)d[0]<<8)|d[1]; return n==2; }
    if(s==0x7C){ if(!ioaTcon) return 0; p7cI=d[0]; return n==1; }
    if(s==0x7D){ p7d=((unsigned)d[0]<<8)|d[1]; for(i=2;i<n;i++) r7d[(p7d+i-2)&0xFFFF]=d[i]; return 1; }
    if(s==0x7E){ p7e=d[0]; for(i=1;i<n;i++) r7e[(p7e+i-1)&0xFF]=d[i]; return 1; }
    return 0; }
static int maxRead=0;
static int mIR(int n,int s,unsigned char* d,int mot){ int i; (void)mot; calls++; if(n>maxRead) maxRead=n;
    if(s>=0x50&&s<=0x57){ ee++; for(i=0;i<n;i++) d[i]=rEE[(pEE+i)&0xFFFF]; return 1; }
    if(s==0x3E){ if(!ioaTcon) return 0; for(i=0;i<n;i++) d[i]=r3e[(p3e+i)&0xFFFF]; return 1; }
    if(s==0x7C){ if(!ioaTcon) return 0; for(i=0;i<n;i++) d[i]=r7c[(p7cI+i)&0xFF]; return 1; }
    if(s==0x7D){ for(i=0;i<n;i++) d[i]=r7d[(p7d+i)&0xFFFF]; return 1; }
    if(s==0x7E){ for(i=0;i<n;i++) d[i]=r7e[(p7e+i)&0xFF]; return 1; }
    return 0; }
static int ioaCalls=0; static DGH_AUX_IOA lastIoa;
static unsigned char mIoa(DGH_AUX_IOA* st, unsigned char* d){ int i; ioaCalls++; lastIoa=*st;
    unsigned off=st->u16StartAddr;
    if(st->u8SlaveAddr>=0x50&&st->u8SlaveAddr<=0x57){ for(i=0;i<st->u8BytePerRead;i++) d[i]=rEE[(off+i)&0xFFFF]; return 1; }
    if(st->u8SlaveAddr==0x3E){ for(i=0;i<st->u8BytePerRead;i++) d[i]=r3e[(off+i)&0xFFFF]; return 1; }
    if(st->u8SlaveAddr==0x7C){ for(i=0;i<st->u8BytePerRead;i++) d[i]=r7c[(off+i)&0xFF]; return 1; }
    if(st->u8SlaveAddr==0x7D){ for(i=0;i<st->u8BytePerRead;i++) d[i]=r7d[(off+i)&0xFFFF]; return 1; }
    return 0; }
static int mIRstub(int n,int s,unsigned char* d,int mot){ (void)n;(void)s;(void)d;(void)mot; calls++; return 1; /* AMD I2C_Read：空函式 */ }
static int mFalse(int n,int a,unsigned char* d){ (void)n;(void)a;(void)d; calls++; return 0x100; /* 低位 0 ＝ false */ }

int main(void){
    DGH_AUX_API A; memset(&A,0,sizeof(A));
    A.DpcdRead=mDR; A.DpcdWrite=mDW; A.I2cRead=mIR; A.I2cWrite=mIW;
    char e[300]; uint8_t buf[64]; uint32_t g; int s, ok;

    printf("== 1. 白名單：0x00–0x7F 只有 3E／7C／7D／7E 放行 ==\n");
    { int allowed=0; for(s=0;s<128;s++) allowed+=dgh_aux_slave_ok((uint32_t)s); CHECK(allowed==4,"恰好 4 個 slave 放行"); }
    for(s=0x50;s<=0x57;s++){
        uint8_t d=0x5A; calls=0;
        ok=dgh_aux_reg_write(&A,(uint32_t)s,0,2,&d,1,&g,e,sizeof(e));
        CHECK(!ok && strstr(e,"EEPROM") && calls==0, "EEPROM 寫入在送出前擋下（DLL 0 次呼叫）");
    }
    CHECK(ee==0 && eeW==0,"EEPROM 寫入：一筆都沒被碰到");
    /* 1.20.0：EEPROM 讀取經 I2C over AUX 放行（Bruce 10-23「靠 I2C over AUX 的方式去讀 0x50」），寫入照舊擋 */
    { int i; for(i=0;i<256;i++) rEE[i]=(unsigned char)(i^0xA5);
      rEE[0]=0x00; rEE[1]=0xFF; rEE[7]=0x00;
      calls=0; ok=dgh_aux_reg_read(&A,0x50,0,2,32,buf,&g,e,sizeof(e));
      CHECK(ok && g==32 && buf[0]==0x00 && buf[1]==0xFF && buf[7]==0x00 && buf[31]==(31^0xA5),"EEPROM 0x50 讀 32 byte（2-byte offset，IOA）");
      CHECK(eeW==0,"EEPROM 讀取時只送 offset，沒有資料寫入");
      ok=dgh_aux_reg_read(&A,0x57,0x10,1,4,buf,&g,e,sizeof(e));
      CHECK(ok && g==4 && buf[0]==(0x10^0xA5),"EEPROM 0x57 讀（1-byte offset）");
      calls=0; ok=dgh_aux_reg_read(&A,0x50,0,3,1,buf,&g,e,sizeof(e));
      CHECK(!ok && calls==0,"EEPROM 讀 offset 3 byte 擋（只收 1／2）");
      ee=0; }
    { uint8_t d=1; calls=0; ok=dgh_aux_reg_write(&A,0x68,0x1200,2,&d,1,&g,e,sizeof(e));
      CHECK(!ok && strstr(e,"not a T-CON") && calls==0,"0x68（MNT T-CON／非本路徑）擋下"); }
    CHECK(ee==0,"非 T-CON slave 也沒碰到 EEPROM");

    printf("== 2. offset 寬度 ==\n");
    { uint8_t d=1; calls=0; CHECK(!dgh_aux_reg_write(&A,0x3E,0x59,1,&d,1,&g,e,sizeof(e)) && calls==0,"3E 要 2-byte offset");
      calls=0; CHECK(!dgh_aux_reg_read(&A,0x7C,0x98,2,1,buf,&g,e,sizeof(e)) && calls==0,"7C 要 1-byte offset");
      calls=0; CHECK(!dgh_aux_reg_read(&A,0x7D,0x7D,0,1,buf,&g,e,sizeof(e)) && calls==0,"7D 不收 awid 0"); }

    A.regPath = DGH_AUX_PATH_DPCD;
    printf("== 3. 3E 走 DPCD 0x430/0x435（TconBase.cs AuxRead/WriteRegister3E）==\n");
    { uint8_t d[3]={0x1E,0x22,0x33}; ok=dgh_aux_reg_write(&A,0x3E,0x0059,2,d,3,&g,e,sizeof(e));
      CHECK(ok && g==3 && r3e[0x59]==0x1E && r3e[0x5A]==0x22 && r3e[0x5B]==0x33,"3E 寫 3 byte 逐 byte 落在對的暫存器");
      r3e[0x207E]=0x11; ok=dgh_aux_reg_read(&A,0x3E,0x207E,2,1,buf,&g,e,sizeof(e));
      CHECK(ok && buf[0]==0x11 && dpcd[0x430]==0x20 && dpcd[0x431]==0x7E,"3E 讀 0x207E（位址 MSB 先、寫進 0x430/0x431）"); }

    printf("== 4. 7C 走 DPCD 0x431/0x434 ==\n");
    { r7c[0x98]=0x22; r7c[0x95]=0x10; ok=dgh_aux_reg_read(&A,0x7C,0x95,1,4,buf,&g,e,sizeof(e));
      CHECK(ok && g==4 && buf[0]==0x10 && buf[3]==0x22,"7C 連讀 4 byte（每 byte 重設位址）");
      { uint8_t d=0x80; ok=dgh_aux_reg_write(&A,0x7C,0x0F,1,&d,1,&g,e,sizeof(e)); CHECK(ok && r7c[0x0F]==0x80,"7C 寫"); } }

    printf("== 5. 7D／7E 走 I2C-over-AUX，16 byte 一段 ==\n");
    { int i; for(i=0;i<40;i++) r7d[0x100+i]=(unsigned char)(i+1);
      maxRead=0; ok=dgh_aux_reg_read(&A,0x7D,0x100,2,40,buf,&g,e,sizeof(e));
      CHECK(ok && g==40 && buf[0]==1 && buf[39]==40,"7D 讀 40 byte 正確");
      CHECK(maxRead<=16,"每次 I2C_Read 不超過 16 byte（AUX 上限）");
      { uint8_t d=0xCD; ok=dgh_aux_reg_write(&A,0x7E,0xAB,1,&d,1,&g,e,sizeof(e)); CHECK(ok && r7e[0xAB]==0xCD,"7E:AB←CD（M-Bus 導通 C-Bus）"); }
      { uint8_t d[20]; for(i=0;i<20;i++) d[i]=(uint8_t)(0x40+i);
        ok=dgh_aux_reg_write(&A,0x7D,0x200,2,d,20,&g,e,sizeof(e));
        CHECK(ok && g==20 && r7d[0x200]==0x40 && r7d[0x213]==0x53,"7D 寫 20 byte 分段（offset 2＋資料 ≤16）"); } }

    printf("== 6. M-Bus 後續：7C:0F bit7（原廠 MbusConnect）==\n");
    { uint8_t b0,b1; r7c[0x0F]=0x05; CHECK(dgh_aux_is_mbus_cmd(0x7E,0xAB,(const uint8_t*)"\xCD",1),"認得 7E:AB←CD");
      CHECK(!dgh_aux_is_mbus_cmd(0x7E,0xAB,(const uint8_t*)"\xCC",1),"別的值不算");
      ok=dgh_aux_mbus_follow(&A,&b0,&b1,e,sizeof(e)); CHECK(ok && b0==0x05 && b1==0x85 && r7c[0x0F]==0x85,"讀改寫：只設 bit7、保留其他位元");
      calls=0; ok=dgh_aux_mbus_follow(&A,&b0,&b1,e,sizeof(e)); CHECK(ok && b1==0x85 && calls==2,"已設好就不再寫（只讀）"); }

    printf("== 7. bool 回傳只看低位 byte ==\n");
    { DGH_AUX_API B=A; B.DpcdRead=mFalse; ok=dgh_aux_reg_read(&B,0x3E,0,2,1,buf,&g,e,sizeof(e));
      CHECK(!ok && strstr(e,"0x435"),"回 0x100（低位 0）＝失敗，錯誤訊息講出哪一步"); }

    printf("== 8. DPCD 寫入擋 0x480–0x48F（T-CON 的 EEPROM 控制窗）==\n");
    CHECK(!dgh_aux_dpcd_write_ok(0x482,1),"0x482（EEPROM 寫保護）擋");
    CHECK(!dgh_aux_dpcd_write_ok(0x480,1) && !dgh_aux_dpcd_write_ok(0x48F,1),"兩端點擋");
    CHECK(!dgh_aux_dpcd_write_ok(0x47E,4),"跨進來的也擋");
    CHECK(dgh_aux_dpcd_write_ok(0x47F,1) && dgh_aux_dpcd_write_ok(0x490,1) && dgh_aux_dpcd_write_ok(0x100,1),"相鄰位址放行");
    CHECK(!dgh_aux_dpcd_write_ok(0x100,0) && !dgh_aux_dpcd_write_ok(0x100,17) && !dgh_aux_dpcd_write_ok(0xFFFFF,2),"長度 1..16、20-bit 位址");

    printf("== 9. 顯示卡名稱 → card（同原廠 Common.cs）==\n");
    CHECK(dgh_aux_card_from_name("Intel(R) Iris(R) Xe Graphics")==0,"Intel");
    CHECK(dgh_aux_card_from_name("AMD Radeon(TM) Graphics")==1 && dgh_aux_card_from_name("Radeon RX 6600")==1,"AMD／Radeon");
    CHECK(dgh_aux_card_from_name("NVIDIA GeForce RTX 3050 Laptop GPU")==2,"NVIDIA");
    CHECK(dgh_aux_card_from_name("Microsoft Basic Display Adapter")==-1,"其他回 -1");
    CHECK(sizeof(DGH_AUX_PSR)==(sizeof(void*)==4?16u:24u),"ST_POWER_PSR 佈局（x86 16 byte）");

    printf("== 10. 1.21.0：3E／7C 讀取預設走 DPCD 視窗（同原廠 AUX 工具）；regpath=ioa 才走 I2C over AUX ==\n");
    { DGH_AUX_API C; memset(&C,0,sizeof(C)); C.DpcdRead=mDR; C.DpcdWrite=mDW; C.I2cRead=mIR; C.I2cWrite=mIW;
      C.regPath = DGH_AUX_PATH_AUTO; ioaTcon=1; r3e[0x207E]=0x11; dpcd[0x430]=0; dpcd[0x431]=0; calls=0;
      ok=dgh_aux_reg_read(&C,0x3E,0x207E,2,1,buf,&g,e,sizeof(e));
      CHECK(ok && buf[0]==0x11 && C.lastPath==DGH_AUX_PATH_DPCD && dpcd[0x430]==0x20 && dpcd[0x431]==0x7E,"auto：3E:207E 走 DPCD 0x430/0x431→0x435（原廠順序）");
      CHECK(calls==2,"auto：每 byte 一次 DPCD_Write(0x430,2) ＋ 一次 DPCD_Read(0x435)，沒碰 IOA");
      r7c[0x95]=0x24; ok=dgh_aux_reg_read(&C,0x7C,0x95,1,1,buf,&g,e,sizeof(e));
      CHECK(ok && buf[0]==0x24 && C.lastPath==DGH_AUX_PATH_DPCD && dpcd[0x431]==0x95,"auto：7C:95 走 DPCD 0x431→0x434");
      { DGH_AUX_API D=C; D.DpcdWrite=mFalse; calls=0; ok=dgh_aux_reg_read(&D,0x3E,0x207E,2,1,buf,&g,e,sizeof(e));
        CHECK(!ok && strstr(e,"0x430") && calls==1,"DPCD 寫入失敗 ⇒ 回錯誤（講 0x430），不退去 IOA 拿假資料"); }
      C.regPath = DGH_AUX_PATH_IOA; ioaTcon=1; r3e[0x207E]=0x10;
      ok=dgh_aux_reg_read(&C,0x3E,0x207E,2,1,buf,&g,e,sizeof(e));
      CHECK(ok && buf[0]==0x10 && C.lastPath==DGH_AUX_PATH_IOA,"regpath=ioa：走 I2C over AUX");
      ioaTcon=0; ok=dgh_aux_reg_read(&C,0x3E,0x207E,2,1,buf,&g,e,sizeof(e));
      CHECK(!ok && strstr(e,"no ACK"),"regpath=ioa：沒 ACK 就回錯誤（不退 DPCD）");
      { uint8_t d=0x5A; dpcd[0x430]=0; dpcd[0x431]=0; C.regPath=DGH_AUX_PATH_AUTO; ok=dgh_aux_reg_write(&C,0x3E,0x0123,2,&d,1,&g,e,sizeof(e));
        CHECK(ok && dpcd[0x430]==0x01 && dpcd[0x431]==0x23 && r3e[0x0123]==0x5A,"3E 寫入走 DPCD 視窗（未改）"); }
    }

    printf("== 11. 1.20.1：AMD 走 IOA_Read（I2C_Read 在 AMD 是空函式）==\n");
    CHECK(offsetof(DGH_AUX_IOA,u8SlaveAddr)==0 && offsetof(DGH_AUX_IOA,u8OffsetBytes)==1 && offsetof(DGH_AUX_IOA,u16StartAddr)==2 &&
          offsetof(DGH_AUX_IOA,u8BytePerRead)==0x0F && offsetof(DGH_AUX_IOA,u8ReadData)==0x10,"ST_IOA 欄位位移（反組譯 IOA_Read 讀的那幾格）");
    if(sizeof(void*)==4) CHECK(sizeof(DGH_AUX_IOA)==28 && offsetof(DGH_AUX_IOA,au8Data)==0x14,"x86：ST_IOA 28 byte、au8Data 在 0x14");
    { DGH_AUX_API M; memset(&M,0,sizeof(M)); M.DpcdRead=mDR; M.DpcdWrite=mFalse; M.I2cRead=mIRstub; M.I2cWrite=mIW; M.IoaRead=mIoa;
      M.card=(int)DGH_AUX_CARD_AMD; M.regPath=DGH_AUX_PATH_IOA;
      r3e[0x207E]=0x11; calls=0; ioaCalls=0;
      ok=dgh_aux_reg_read(&M,0x3E,0x207E,2,1,buf,&g,e,sizeof(e));
      CHECK(ok && buf[0]==0x11 && ioaCalls==1 && calls==0,"AMD：3E:207E 經 IOA_Read 讀到 11，沒呼叫 I2C_Read／I2C_Write");
      CHECK(lastIoa.u8SlaveAddr==0x3E && lastIoa.u8OffsetBytes==2 && lastIoa.u16StartAddr==0x207E && lastIoa.u8BytePerRead==1,"AMD：ST_IOA 填 7-bit 3E、offset 2、位址 207E、讀 1");
      r7c[0x95]=0x22; ok=dgh_aux_reg_read(&M,0x7C,0x95,1,1,buf,&g,e,sizeof(e));
      CHECK(ok && buf[0]==0x22 && lastIoa.u8OffsetBytes==1,"AMD：7C:95（offset 1）");
      { int i; for(i=0;i<40;i++) rEE[i]=(unsigned char)(0x30+i); }
      ioaCalls=0; ok=dgh_aux_reg_read(&M,0x50,0,2,40,buf,&g,e,sizeof(e));
      CHECK(ok && g==40 && buf[0]==0x30 && buf[39]==0x30+39 && ioaCalls==3 && lastIoa.u8BytePerRead==8,"AMD：0x50 讀 40 byte＝16＋16＋8 三次 IOA_Read");
      { int i; for(i=0;i<4;i++) r7d[0x7D+i]=(unsigned char)(0xA0+i); }
      ok=dgh_aux_reg_read(&M,0x7D,0x7D,2,4,buf,&g,e,sizeof(e)); CHECK(ok && buf[3]==0xA3,"AMD：7D:007D");
      ok=dgh_aux_reg_read(&M,0x7D,0x7D,3,1,buf,&g,e,sizeof(e)); CHECK(!ok && strstr(e,"IOA_Read"),"AMD：offset 3 byte 不支援，講明原因");
      { DGH_AUX_API N=M; N.IoaRead=0; ok=dgh_aux_reg_read(&N,0x3E,0x207E,2,1,buf,&g,e,sizeof(e)); CHECK(!ok && strstr(e,"IOA_Read"),"AMD：DLL 沒有 IOA_Read ⇒ 失敗並講明"); }
      M.card=(int)DGH_AUX_CARD_INTEL; ioaCalls=0; ioaTcon=1; r3e[0x207E]=0x10;
      ok=dgh_aux_reg_read(&M,0x3E,0x207E,2,1,buf,&g,e,sizeof(e)); CHECK(ioaCalls==0,"Intel：不走 IOA_Read（照舊 I2C_Write＋I2C_Read）"); ioaTcon=0; }

    printf("\n%d/%d checks passed\n", total-fails, total);
    return fails?1:0;
}

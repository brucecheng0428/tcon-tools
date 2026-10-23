/* ═══════════════════════════════════════════════════════════════════════════
   test_aux.c — i2c_bridge_aux.h（DP AUX 路由＋只到得了 T-CON 的白名單）純函式測試
   Bruce 2026-10-23：「一定要透過 tcon 來控制 i2c，不能直接對 eeprom 也寫入」
   做法：一個計數用的 mock API；每個被擋的存取都要求「DLL 一次都沒被呼叫」。
   cc -O2 -I . test/test_aux.c -o test_aux && ./test_aux
   🔴 驗不到：真顯示卡驅動、真 AUX 波形、真 T-CON 對 DPCD 0x430/0x435 的回應。
   ═══════════════════════════════════════════════════════════════════════════ */
#include <stdio.h>
#include <string.h>
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

    printf("== 10. 1.20.0：3E／7C 讀取先走 I2C over AUX（同 7-bit slave），沒 ACK 才退回 DPCD 視窗 ==\n");
    { DGH_AUX_API C; memset(&C,0,sizeof(C)); C.DpcdRead=mDR; C.DpcdWrite=mDW; C.I2cRead=mIR; C.I2cWrite=mIW;
      C.regPath = DGH_AUX_PATH_AUTO;
      ioaTcon=1; r3e[0x207E]=0x11; r7c[0x95]=0x00; r7c[0x98]=0x00; dpcd[0x430]=0; dpcd[0x431]=0;
      ok=dgh_aux_reg_read(&C,0x3E,0x207E,2,1,buf,&g,e,sizeof(e));
      CHECK(ok && buf[0]==0x11 && C.lastPath==DGH_AUX_PATH_IOA && dpcd[0x430]==0 && dpcd[0x431]==0,"auto：3E:207E 經 IOA 讀到 11，DPCD 視窗沒被寫");
      { int i; for(i=0;i<40;i++) r3e[0x1000+i]=(unsigned char)(0x80+i); }
      maxRead=0; ok=dgh_aux_reg_read(&C,0x3E,0x1000,2,40,buf,&g,e,sizeof(e));
      CHECK(ok && g==40 && buf[0]==0x80 && buf[39]==0x80+39 && maxRead<=16,"auto：3E 連讀 40 byte、每段 ≤16");
      ok=dgh_aux_reg_read(&C,0x7C,0x95,1,1,buf,&g,e,sizeof(e));
      CHECK(ok && buf[0]==0x00 && C.lastPath==DGH_AUX_PATH_IOA,"auto：7C:95 經 IOA");
      /* T-CON 不回 IOA ⇒ 退回 DPCD 視窗 */
      ioaTcon=0; r3e[0x207E]=0x10;
      ok=dgh_aux_reg_read(&C,0x3E,0x207E,2,1,buf,&g,e,sizeof(e));
      CHECK(ok && buf[0]==0x10 && C.lastPath==DGH_AUX_PATH_DPCD,"auto：IOA 沒 ACK ⇒ DPCD 視窗讀到 10");
      /* 兩條都不通：錯誤訊息兩個原因都講 */
      { DGH_AUX_API D=C; D.DpcdWrite=mFalse; ok=dgh_aux_reg_read(&D,0x3E,0x207E,2,1,buf,&g,e,sizeof(e));
        CHECK(!ok && strstr(e,"I2C over AUX") && strstr(e,"0x430"),"兩條都失敗：訊息含 IOA 與 DPCD 0x430"); }
      /* 只走 IOA */
      C.regPath = DGH_AUX_PATH_IOA; calls=0;
      ok=dgh_aux_reg_read(&C,0x3E,0x207E,2,1,buf,&g,e,sizeof(e));
      CHECK(!ok && calls==1,"regpath=ioa：IOA 沒 ACK 就停，不碰 DPCD");
      ioaTcon=1; ok=dgh_aux_reg_read(&C,0x3E,0x207E,2,1,buf,&g,e,sizeof(e));
      CHECK(ok && buf[0]==0x10,"regpath=ioa：讀得到");
      /* 寫入路徑不變（仍走 DPCD 視窗） */
      { uint8_t d=0x5A; dpcd[0x430]=0; dpcd[0x431]=0; ok=dgh_aux_reg_write(&C,0x3E,0x0123,2,&d,1,&g,e,sizeof(e));
        CHECK(ok && dpcd[0x430]==0x01 && dpcd[0x431]==0x23 && r3e[0x0123]==0x5A,"3E 寫入仍走 DPCD 視窗"); }
      ioaTcon=0; }

    printf("\n%d/%d checks passed\n", total-fails, total);
    return fails?1:0;
}

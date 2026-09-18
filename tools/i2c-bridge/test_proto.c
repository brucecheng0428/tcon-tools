/* i2c_bridge_proto.h 的單元測試（可攜，在 Linux/macOS 上編來跑）。
 * 測到的就是 helper 出貨的那份協定程式碼。
 *   cc test_proto.c -o test_proto && ./test_proto
 */
#include "i2c_bridge_proto.h"
#include <stdio.h>

static int fails=0, total=0;
#define CHECK(cond, name) do{ total++; if(cond){ printf("  ok   %s\n",name);} else { printf("  FAIL %s\n",name); fails++; } }while(0)

int main(void){
    printf("== i2c_bridge_proto self-test ==\n");

    /* 1. WebSocket accept（RFC 6455 §1.3 的標準向量） */
    {
        char acc[64]; dgh_ws_accept("dGhlIHNhbXBsZSBub25jZQ==", acc);
        CHECK(strcmp(acc,"s3pPLMBiTxaQ9kYGzzhZRbK+xOo=")==0, "ws accept = RFC6455 canonical vector");
    }

    /* 2. Base64 / SHA1 邊界 */
    {
        DGH_SHA1 s; dgh_sha1_init(&s); dgh_sha1_update(&s,(const uint8_t*)"abc",3);
        uint8_t d[20]; dgh_sha1_final(&s,d);
        /* SHA1("abc") = a9993e364706816aba3e25717850c26c9cd0d89d */
        char hex[41]; for(int i=0;i<20;i++) sprintf(hex+i*2,"%02x",d[i]);
        CHECK(strcmp(hex,"a9993e364706816aba3e25717850c26c9cd0d89d")==0, "sha1(abc)");
        char b[8]; dgh_b64enc((const uint8_t*)"M",1,b); CHECK(strcmp(b,"TQ==")==0,"b64(M)");
        dgh_b64enc((const uint8_t*)"Ma",2,b); CHECK(strcmp(b,"TWE=")==0,"b64(Ma)");
        dgh_b64enc((const uint8_t*)"Man",3,b); CHECK(strcmp(b,"TWFu")==0,"b64(Man)");
    }

    /* 3. JSON 擷取 */
    {
        const char* m="{\"type\":\"read\",\"id\":42,\"slave\":96,\"addr\":65280,\"len\":3}";
        char t[24]; dgh_json_type(m,t,sizeof(t));
        CHECK(strcmp(t,"read")==0,"json type=read");
        CHECK(dgh_json_int(m,"id",-1)==42,"json id=42");
        CHECK(dgh_json_int(m,"slave",-1)==96,"json slave=96");
        CHECK(dgh_json_int(m,"addr",-1)==65280,"json addr=65280");
        CHECK(dgh_json_int(m,"len",-1)==3,"json len=3");
        CHECK(dgh_json_int(m,"nope",-1)==-1,"json missing key -> default");
    }
    {
        const char* w="{\"type\":\"write\",\"addr\":4608,\"data\":[255,128,0,15]}";
        uint8_t b[16]; int n=dgh_json_int_array(w,"data",b,sizeof(b));
        CHECK(n==4 && b[0]==255 && b[1]==128 && b[2]==0 && b[3]==15,"json data array");
        char t[24]; dgh_json_type(w,t,sizeof(t)); CHECK(strcmp(t,"write")==0,"json type=write");
        CHECK(dgh_json_int(w,"addr",-1)==4608,"json addr=4608(0x1200)");
    }

    /* 4. 位址白名單（v1.6.0 起是幾個區間的聯集，不再是單一段）
       🔴 正面那一半是這一節存在的理由：check_nb_code_import / check_em01_code_import
          那兩次破口都是「只驗壞的會被擋、沒驗好的會被放行」。所以**七顆 IC 實際
          會寫到的每一個位址**都要在這裡被點名放行，一顆都不能漏。 */
    {
        /* --- 正面：EM01A1 / VM01S1（ptg base 0x1200） --- */
        CHECK(dgh_write_allowed(0x1200,1)==1,"allow EM01 soft 0x1200 x1");
        CHECK(dgh_write_allowed(0x1201,1)==1,"allow EM01 pat 0x1201 x1");
        CHECK(dgh_write_allowed(0x1238,2)==1,"allow EM01 xpos 0x1238 x2");
        CHECK(dgh_write_allowed(0x123A,2)==1,"allow EM01 ypos 0x123A x2");
        CHECK(dgh_write_allowed(0x1240,5)==1,"allow EM01 inside 0x1240 x5");
        CHECK(dgh_write_allowed(0x1268,1)==1,"allow 0x1268 x1");
        CHECK(dgh_write_allowed(0x12FF,1)==1,"allow 0x12FF x1");
        CHECK(dgh_write_allowed(0x12FE,2)==1,"allow 0x12FE x2 (ends 0x12FF)");
        /* --- 正面：EM02A1 / V512S2 / VM02S1（ptg base 0x0C00） --- */
        CHECK(dgh_write_allowed(0x0C00,1)==1,"allow EM02 soft 0x0C00 x1");
        CHECK(dgh_write_allowed(0x0C01,1)==1,"allow EM02 pat 0x0C01 x1");
        CHECK(dgh_write_allowed(0x0C5C,2)==1,"allow EM02 xpos 0x0C5C x2");
        CHECK(dgh_write_allowed(0x0C36,2)==1,"allow EM02 ypos 0x0C36 x2");
        CHECK(dgh_write_allowed(0x0C39,5)==1,"allow EM02 inside 0x0C39 x5");
        CHECK(dgh_write_allowed(0x0C38,2)==1,"allow VM02S1 xpos 0x0C38 x2");
        CHECK(dgh_write_allowed(0x0C3A,2)==1,"allow VM02S1 ypos 0x0C3A x2");
        CHECK(dgh_write_allowed(0x0C40,5)==1,"allow VM02S1 inside 0x0C40 x5");
        /* --- 正面：E512A1 / V512S1（ptg base 0x0200） --- */
        CHECK(dgh_write_allowed(0x0200,1)==1,"allow E512 soft 0x0200 x1");
        CHECK(dgh_write_allowed(0x0201,1)==1,"allow E512 pat 0x0201 x1");
        CHECK(dgh_write_allowed(0x0203,5)==1,"allow E512 inside 0x0203 x5");
        CHECK(dgh_write_allowed(0x0236,2)==1,"allow E512 ypos 0x0236 x2");
        CHECK(dgh_write_allowed(0x025B,2)==1,"allow E512 xpos 0x025B x2");
        CHECK(dgh_write_allowed(0x0239,5)==1,"allow V512S1 inside 0x0239 x5");
        CHECK(dgh_write_allowed(0x0255,1)==1,"allow E512 aging_en byte 0x0255 x1");
        /* --- 正面：cursor（十字）--- */
        CHECK(dgh_write_allowed(0x0001,1)==1,"allow cursor clk 0x0001 (E512A1)");
        CHECK(dgh_write_allowed(0x0002,1)==1,"allow cursor clk 0x0002 (EM01A1)");
        CHECK(dgh_write_allowed(0x0003,1)==1,"allow cursor clk 0x0003 (EM02/VM01/V512S1)");
        CHECK(dgh_write_allowed(0x0004,1)==1,"allow cursor clk 0x0004 (V512S2/VM02S1)");
        CHECK(dgh_write_allowed(0xFF20,1)==1,"allow cursor ctl 0xFF20 x1");
        CHECK(dgh_write_allowed(0xFF22,4)==1,"allow cursor xy 0xFF22 x4");
        /* --- 反面 --- */
        CHECK(dgh_write_allowed(0x12FF,2)==0,"block 0x12FF x2 (overruns)");
        CHECK(dgh_write_allowed(0x11FF,1)==0,"block 0x11FF (below ptg)");
        CHECK(dgh_write_allowed(0x1300,1)==0,"block 0x1300 (above ptg)");
        CHECK(dgh_write_allowed(0x0BFF,1)==0,"block 0x0BFF (below EM02 ptg)");
        CHECK(dgh_write_allowed(0x0D00,1)==0,"block 0x0D00 (dmc bank)");
        CHECK(dgh_write_allowed(0x01FF,1)==0,"block 0x01FF (below E512 ptg)");
        CHECK(dgh_write_allowed(0x0300,1)==0,"block 0x0300 (dither bank)");
        CHECK(dgh_write_allowed(0x02ED,1)==1,"allow 0x02ED (inside E512 ptg range, page-side per-IC table is the fine gate)");
        CHECK(dgh_write_allowed(0x1200,0)==0,"block zero length");
        CHECK(dgh_write_allowed(0x0000,1)==0,"block 0x0000 (below cursor clk)");
        CHECK(dgh_write_allowed(0x0005,1)==0,"block 0x0005 (above cursor clk)");
        CHECK(dgh_write_allowed(0x0004,2)==0,"block 0x0004 x2 (overruns cursor clk)");
        CHECK(dgh_write_allowed(0xFF00,1)==0,"block IC-ID reg 0xFF00 write");
        CHECK(dgh_write_allowed(0xFF25,2)==0,"block 0xFF25 x2 (overruns cursor block)");
        CHECK(dgh_write_allowed(0xFF26,2)==0,"block 0xFF26 (reg_tmg_hres is read-only to us)");
        CHECK(dgh_write_allowed(0xE801,1)==0,"block 0xE801 (read-only observation point)");
    }

    /* 5. Origin 白名單 */
    {
        CHECK(dgh_origin_allowed("GET /ws\r\nOrigin: https://brucecheng0428.github.io\r\n\r\n")==1,"allow github.io origin");
        CHECK(dgh_origin_allowed("GET /ws\r\nOrigin: http://127.0.0.1:8899\r\n\r\n")==1,"allow loopback origin");
        CHECK(dgh_origin_allowed("GET /ws\r\nOrigin: http://localhost:8899\r\n\r\n")==1,"allow localhost origin");
        CHECK(dgh_origin_allowed("GET /ws\r\nOrigin: https://evil.example.com\r\n\r\n")==0,"block evil origin");
        CHECK(dgh_origin_allowed("GET /ws\r\nOrigin: https://brucecheng0428.github.io.evil.com\r\n\r\n")==0,
              "block spoof suffix github.io.evil.com");
        CHECK(dgh_origin_allowed("GET /ws\r\nOrigin: http://127.0.0.1.evil.com\r\n\r\n")==0,
              "block spoof suffix 127.0.0.1.evil.com");
        CHECK(dgh_origin_allowed("GET /ws\r\nOrigin: https://brucecheng0428.github.io\r\n\r\n")==1,"allow exact github.io again");
        CHECK(dgh_origin_allowed("GET /ws\r\n\r\n")==0,"block missing origin");
    }

    /* 6. offset 寬度組包（proto 2）
       🔴 正面與反面都驗。反面＝不合法寬度必須回 -1（而不是被當成 0 靜默地
          「不送位址」—— 那會變成 current address read，讀到完全不相干的資料）。 */
    {
        uint8_t ab[4];
        CHECK(dgh_build_offset(ab,0x1234,0)==0,"awid 0 -> 0 byte (current address read)");
        CHECK(dgh_build_offset(ab,0x1234,1)==1 && ab[0]==0x34,"awid 1 -> 34");
        CHECK(dgh_build_offset(ab,0x1234,2)==2 && ab[0]==0x12 && ab[1]==0x34,"awid 2 -> 12 34 (MSB first)");
        CHECK(dgh_build_offset(ab,0x89ABCDEF,4)==4 && ab[0]==0x89 && ab[1]==0xAB && ab[2]==0xCD && ab[3]==0xEF,"awid 4 -> 89 AB CD EF");
        /* 🔴 相容性釘死：proto 1 的兩 byte 版就是 addr>>8, addr&0xFF。
           黃金向量 slave 0x68 / 0x0000 讀 3 byte 送的位址是 00 00。 */
        CHECK(dgh_build_offset(ab,0x0000,2)==2 && ab[0]==0x00 && ab[1]==0x00,"proto1 compat: 0x0000 -> 00 00");
        CHECK(dgh_build_offset(ab,0xFF00,2)==2 && ab[0]==0xFF && ab[1]==0x00,"proto1 compat: 0xFF00 -> FF 00");
        CHECK(dgh_build_offset(ab,0x1200,2)==2 && ab[0]==0x12 && ab[1]==0x00,"proto1 compat: 0x1200 -> 12 00");
        CHECK(dgh_build_offset(ab,0x1234,3)==-1,"awid 3 rejected");
        CHECK(dgh_build_offset(ab,0x1234,5)==-1,"awid 5 rejected");
        CHECK(dgh_build_offset(ab,0x1234,8)==-1,"awid 8 rejected");
        CHECK(dgh_awid_ok(0)&&dgh_awid_ok(1)&&dgh_awid_ok(2)&&dgh_awid_ok(4),"awid_ok accepts 0/1/2/4");
        CHECK(!dgh_awid_ok(3)&&!dgh_awid_ok(5)&&!dgh_awid_ok(0xFFFFFFFFu),"awid_ok rejects the rest");
        /* awid 缺席時的預設：讀不到 key 就要拿到 2（＝proto 1 行為） */
        CHECK(dgh_json_int("{\"type\":\"read\",\"slave\":104,\"addr\":0,\"len\":3}","awid",2)==2,
              "missing awid -> default 2 (proto 1 behaviour)");
        CHECK(dgh_json_int("{\"type\":\"read\",\"slave\":104,\"addr\":0,\"len\":3,\"awid\":4}","awid",2)==4,
              "awid parsed when present");
        /* 🔴 "awid" 不可被 "id" 的樸素 strstr 誤判成同一個 key */
        CHECK(dgh_json_int("{\"type\":\"read\",\"awid\":4,\"id\":7}","id",-1)==7,"\"id\" not confused by \"awid\"");
    }

    /* 6b. 寫入 frame 逐 byte（這是「錯了很安靜」的典型：位址組錯只會寫到別處） */
    {
        uint8_t f[300]; const uint8_t d3[3]={0xA1,0xD8,0xFB};
        int n;
        n=dgh_build_write_frame(f,sizeof(f),0x1234,2,d3,3);
        CHECK(n==5 && f[0]==0x12 && f[1]==0x34 && f[2]==0xA1 && f[3]==0xD8 && f[4]==0xFB,"frame awid2: 12 34 A1 D8 FB");
        n=dgh_build_write_frame(f,sizeof(f),0x1234,1,d3,3);
        CHECK(n==4 && f[0]==0x34 && f[1]==0xA1 && f[2]==0xD8 && f[3]==0xFB,"frame awid1: 34 A1 D8 FB");
        n=dgh_build_write_frame(f,sizeof(f),0x1234,0,d3,3);
        CHECK(n==3 && f[0]==0xA1 && f[1]==0xD8 && f[2]==0xFB,"frame awid0: data only");
        n=dgh_build_write_frame(f,sizeof(f),0x00001234,4,d3,3);
        CHECK(n==7 && f[0]==0x00 && f[1]==0x00 && f[2]==0x12 && f[3]==0x34 && f[4]==0xA1,"frame awid4: 00 00 12 34 + data");
        /* 🔴 proto 1 相容：dg-measure 寫 ptg bank 的 frame 一個 byte 都不能變 */
        { const uint8_t one[1]={0x0F};
          n=dgh_build_write_frame(f,sizeof(f),0x1200,2,one,1);
          CHECK(n==3 && f[0]==0x12 && f[1]==0x00 && f[2]==0x0F,"proto1 compat frame: 12 00 0F"); }
        CHECK(dgh_build_write_frame(f,sizeof(f),0x1234,3,d3,3)==-1,"frame rejects awid 3");
        CHECK(dgh_build_write_frame(f,4,0x1234,2,d3,3)==-1,"frame rejects cap overflow");
        CHECK(dgh_build_write_frame(f,sizeof(f),0x1234,2,0,0)==2,"frame with zero data = offset only");
    }

    /* 6c. Content-Type 白名單 */
    {
        CHECK(dgh_mime_for("i2c.html")&&strstr(dgh_mime_for("i2c.html"),"text/html")!=0,".html served as text/html");
        CHECK(dgh_mime_for("x.js")&&strstr(dgh_mime_for("x.js"),"javascript")!=0,".js served");
        CHECK(dgh_mime_for("x.png")!=0,".png served");
        CHECK(dgh_mime_for("i2c_bridge.c")==0,".c NOT served");
        CHECK(dgh_mime_for("i2c-bridge.exe")==0,".exe NOT served");
        CHECK(dgh_mime_for("libMPSSE.dll")==0,".dll NOT served");
        CHECK(dgh_mime_for("i2c-bridge.log")==0,".log NOT served");
        CHECK(dgh_mime_for("noext")==0,"no extension NOT served");
    }

    /* 7. HTTP 請求目標 → exe 旁的檔名（proto 2 的靜態檔服務）
       🔴 同樣正反都驗：真的頁面要端得出來（反面驗過頭會回到「只端一頁」的老問題），
          而目錄跳脫一律拒絕。 */
    {
        char f[160];
        /* 🔴 v1.5.0 起 "/" 回空字串＝根路徑，由呼叫端端出內建入口頁。
           原本是直接對應 dg-measure.html，而那正是 helper 一啟動就把 I2C
           channel 搶走的來源（Bruce 2026-09-18 因此測不了 i2c 頁）。 */
        CHECK(dgh_req_filename("GET / HTTP/1.1\r\n\r\n",f,sizeof(f))==1 && f[0]==0,"\"/\" -> 根路徑（空字串，交給內建入口頁）");
        CHECK(dgh_req_filename("GET /?x=1 HTTP/1.1\r\n\r\n",f,sizeof(f))==1 && f[0]==0,"\"/?x=1\" 也是根路徑");
        CHECK(dgh_req_filename("GET /i2c.html HTTP/1.1\r\n\r\n",f,sizeof(f))==1 && strcmp(f,"i2c.html")==0,"/i2c.html served");
        CHECK(dgh_req_filename("GET /dg-measure.html HTTP/1.1\r\n\r\n",f,sizeof(f))==1 && strcmp(f,"dg-measure.html")==0,"explicit dg-measure.html served");
        CHECK(dgh_req_filename("GET /i2c.html?v=1 HTTP/1.1\r\n\r\n",f,sizeof(f))==1 && strcmp(f,"i2c.html")==0,"query string stripped");
        CHECK(dgh_req_filename("GET /i2c.html#top HTTP/1.1\r\n\r\n",f,sizeof(f))==1 && strcmp(f,"i2c.html")==0,"fragment stripped");
        CHECK(dgh_req_filename("GET /../i2c_bridge.c HTTP/1.1\r\n\r\n",f,sizeof(f))==0,"reject ..");
        CHECK(dgh_req_filename("GET /sub/x.html HTTP/1.1\r\n\r\n",f,sizeof(f))==0,"reject sub-folder");
        CHECK(dgh_req_filename("GET /..%2Fx HTTP/1.1\r\n\r\n",f,sizeof(f))==0,"reject percent-encoding");
        CHECK(dgh_req_filename("GET /C:\\windows\\x HTTP/1.1\r\n\r\n",f,sizeof(f))==0,"reject drive/backslash");
        CHECK(dgh_req_filename("GET /.env HTTP/1.1\r\n\r\n",f,sizeof(f))==0,"reject dotfile");
        CHECK(dgh_req_filename("POST / HTTP/1.1\r\n\r\n",f,sizeof(f))==0,"reject non-GET");
        CHECK(dgh_req_filename("GET i2c.html HTTP/1.1\r\n\r\n",f,sizeof(f))==0,"reject target without leading /");
    }

    printf("\n%d/%d checks passed\n", total-fails, total);
    return fails?1:0;
}

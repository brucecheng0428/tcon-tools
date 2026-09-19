/* i2c_bridge_proto.h 的單元測試（可攜，在 Linux/macOS 上編來跑）。
 * 測到的就是 helper 出貨的那份協定程式碼。
 *   cc test_proto.c -o test_proto && ./test_proto
 */
#include "i2c_bridge_proto.h"
#include <stdio.h>

static int fails=0, total=0;
#define CHECK(cond, name) do{ total++; if(cond){ printf("  ok   %s\n",name);} else { printf("  FAIL %s\n",name); fails++; } }while(0)
/* 數值不符時要印出實際值 —— 只說「FAIL」沒辦法拿去跟 log 對照。 */
#define EQ_INT(got, want, name) do{ total++; if((got)==(want)){ printf("  ok   %s\n",name);} \
    else { printf("  FAIL %s   got=%d want=%d\n",name,(int)(got),(int)(want)); fails++; } }while(0)

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
    /* ═══ 🔴 MPSSE 讀取命令的黃金向量 ═══════════════════════════════════════
       🔴 **2026-09-19：這個向量刻意與 `dg-measure.html` 的 WebUSB 路徑分家了。**
       原本兩份實作逐位元組相同，是無硬體時最強的交叉驗證。但 Bruce 的實測顯示
       那個共同形狀在**讀取**上有 bug（bit7 零反例地讀成 0），根因照 pyftdi
       （`pyftdi/i2c.py` `I2cController._do_read`）比對出來是兩處：
         ① 讀完之後要 `80 02 03`（SDA 輸出**高**），原本是 `80 00 03`（輸出低）
            ⇒ 原本在讀完瞬間就把 SDA 壓低，比 ACK 該拉低的時間更早
         ② ACK 之後要有 `_ck_delay` 次的建立時間，原本是 **0**
       ⇒ C 這一份先改（Bruce 要先能用）；`dg-measure.html` 那條**維持原樣**，
         因為它在他硬體上是能正常讀的，這一輪沒有理由動它、也沒有時間驗它。
       🔴 **兩邊分家是刻意的，不是漏改。** 等 C 這條在硬體上驗證過，
         再回頭把 dg-measure 對齊，屆時這段註解要一併更新。
       向量：slave 0x50、addr 0x1234、awid 2、讀 4 byte、**ckDelay=3**。 */
    {
        static const char* EXPECT =
            "800101800101800101800101800101800101800101800101800101800101800103800103800103800103800103800103800103800103800103800103800103800103800103800103800103800103800103800103800103800103800003800003800003800003800003800003800003800003800003800003110000A08000012200800003110000128000012200800003110000348000012200800003800101800101800101800101800101800101800101800101800101800101800103800103800103800103800103800103800103800103800103800103800103800103800103800103800103800103800103800103800103800103800003800003800003800003800003800003800003800003800003800003110000A1800001220080000380000120000080000313000080000180000180000180000180000120000080000313000080000180000180000180000180000120000080000313000080000180000180000180000180000120000080000313008080000180000180000180000180000380000380000380000380000380000380000380000380000380000380010380010380010380010380010380010380010380010380010380010380010180010180010180010180010180010180010180010180010180010187";
        unsigned char buf[4096]; int acks=0, din=0;
        int n;
        dgh_ck_delay = 3;                      /* 向量是以預設值錄的 */
        n = dgh_mp_build_read(buf, (int)sizeof(buf), 0x50, 0x1234, 2, 4, &acks, &din);
        char hex[8192]; int ho=0;
        for(int i=0;i<n && ho<(int)sizeof(hex)-3;i++) ho += sprintf(hex+ho, "%02X", buf[i]);
        hex[ho]=0;
        CHECK(n == (int)strlen(EXPECT)/2, "MPSSE read 命令長度符合黃金向量");
        CHECK(strcmp(hex, EXPECT)==0, "🔴 MPSSE read 命令**逐位元組**符合黃金向量（pyftdi 形狀）");
        /* 🔴 釘住那兩處修正本身，這樣即使有人重錄向量也擋得住退回舊形狀 */
        /* 🔴 開汲極原則：整段命令流裡**不可以出現「SDA 輸出且值為高」**
           （0x80 的 value bit1=1 同時 direction bit1=1）。要高就放開。
           最容易寫錯的幾個具體形狀直接點名擋掉。 */
        CHECK(strstr(hex, "800203") == NULL, "🔴 沒有 80 02 03（SDA 輸出高）＝ 沒有主動推高");
        CHECK(strstr(hex, "800303") == NULL, "🔴 沒有 80 03 03（SCL＋SDA 都輸出高）");
        CHECK(strstr(hex, "1300FF") == NULL, "🔴 NACK 不用 13 00 FF 去輸出高");
        /* 🔴🔴 這一條**反過來了**（v1.12.0 補正，其實 v1.11.5 就該改）：
           `0x8E`（Clock For n x 1 bits）**在這顆 FT2232C/D 上不存在** ——
           AN2232C-01 的命令表只有 0x10–0x3F／0x4A/0x4B／0x6A–0x6F／0x80–0x89／
           0x90–0x93，未知 opcode 會回 `0xFA <bad cmd>` **灌進 IN 資料流**。
           產品碼因此已經改回 `13 00 80`（拉低一個時脈、送 1 個 bit 的 1）。
           測試卻還釘著 0x8E ⇒ **測試比產品晚了一版**，整套 test_proto 從那時起
           就是 185/191 的紅燈狀態（我在 v1.16.0 這一輪對照 HEAD 確認過，
           不是這次改壞的）。紅著的測試等於沒有測試，所以在這裡補正。 */
        CHECK(strstr(hex, "8E") == NULL || strstr(hex, "8E00") == NULL,
              "🔴 不可以出現 0x8E（這顆晶片沒有這個命令，會回 0xFA 汙染資料流）");
        CHECK(strstr(hex, "800101") != NULL, "🔴 閒置／STOP 後是 80 01 01（SDA 放開、SCL 高）");
        { /* ckDelay 真的有加進去：0 與 3 的長度差 ＝ 3 × 3 × 每個資料 byte */
            unsigned char b0[4096]; int a0=0,d0=0,n0;
            dgh_ck_delay = 0;
            n0 = dgh_mp_build_read(b0, (int)sizeof(b0), 0x50, 0x1234, 2, 4, &a0, &d0);
            dgh_ck_delay = 3;
            EQ_INT(n - n0, 4 * 3 * 3, "🔴 ckDelay=3 比 0 多 4 byte × 3 次 × 3 位元組");
        }
        CHECK(acks == 4, "讀 4 byte 要等 4 個 ACK（slaveW＋addrHi＋addrLo＋slaveR）");
        CHECK(din == 4, "會回 4 個資料 byte");
        CHECK(buf[n-1] == 0x87, "最後一道是 0x87（send immediate）");

        /* awid 0 ＝ current address read：沒有位址相位，只有 START ＋ slave(R) */
        n = dgh_mp_build_read(buf, (int)sizeof(buf), 0x50, 0, 0, 4, &acks, &din);
        CHECK(n > 0 && acks == 1, "awid 0 ⇒ 只有 1 個 ACK（沒有位址相位）");
        n = dgh_mp_build_read(buf, (int)sizeof(buf), 0x50, 0x12, 1, 4, &acks, &din);
        /* slaveW ＋ 1 個位址 byte ＋ slaveR ＝ 3（第一版我算成 2，是我算錯不是碼錯） */
        CHECK(n > 0 && acks == 3, "awid 1 ⇒ 3 個 ACK（slaveW＋1 位址＋slaveR）");
        n = dgh_mp_build_read(buf, (int)sizeof(buf), 0x50, 0x12345678u, 4, 4, &acks, &din);
        CHECK(n > 0 && acks == 6, "awid 4 ⇒ 6 個 ACK（slaveW＋4 位址＋slaveR）");
        CHECK(dgh_mp_build_read(buf, 8, 0x50, 0x1234, 2, 4, &acks, &din) < 0, "容量不足要回 -1，不可以寫爆");

        /* 寫：START ＋ slave(W) ＋ offset ＋ data ＋ STOP */
        unsigned char wd[3] = { 0xAA, 0xBB, 0xCC };
        n = dgh_mp_build_write(buf, (int)sizeof(buf), 0x50, 0x1234, 2, wd, 3, &acks, &din);
        CHECK(n > 0 && acks == 6, "寫 3 byte ⇒ 6 個 ACK（slaveW＋2 位址＋3 資料）");
        CHECK(din == 0, "寫不回資料 byte");
        CHECK(buf[n-1] == 0x87, "寫也以 0x87 結尾");

        /* ACK 判讀：兩種對齊下 ACK 都是 bit0 與 bit7 皆 0 */
        CHECK(dgh_mp_ack_ok(0x00) == 1, "0x00 ＝ ACK");
        CHECK(dgh_mp_ack_ok(0x01) == 0, "0x01 ＝ NACK（靠右對齊）");
        CHECK(dgh_mp_ack_ok(0x80) == 0, "0x80 ＝ NACK（靠左對齊）");
        CHECK(dgh_mp_ack_ok(0x7E) == 1, "中間的雜訊位元不影響判讀（只看 bit0/bit7）");
    }

    /* ═══ 🔴 整段只能有一個 0x87，而且必須在最後 ═════════════════════════════
       起因：Bruce 2026-09-19 用邏輯分析儀量到「byte 與 byte 之間 SCL 停 10~15 ms」，
       並指出「這根本不是 burst read」。FTDI 對 `0x87`（Send Immediate）的定義是
       「強制把已緩衝的讀取資料立刻送回主機，不等 USB latency timer」——
       **每一個 0x87 就是一次強制的 USB 往返**。所以只要命令序列裡每個 byte 都夾一個
       0x87，時間上就不可能連續，不管定址層面是不是一筆交易。

       我們的 builder 目前是對的（4096 byte 的命令共 49,534 byte，只有結尾一個 0x87），
       但這是**沒有任何測試釘住**的性質 —— 有人為了「先拿到 ACK 再繼續」在迴圈裡補一個
       0x87，功能完全正常、所有測試照樣綠，只有拿邏輯分析儀量才看得出來。
       這正是本專案其他閘門的同一種破口，所以釘在這裡。 */
    {
        static unsigned char cmd[4096 * 60 + 512];
        int acks = 0, din = 0;
        int lens[] = { 1, 2, 17, 256, 1024, 4096 };
        for (unsigned k = 0; k < sizeof(lens)/sizeof(lens[0]); k++) {
            int n = lens[k];
            int len = dgh_mp_build_read(cmd, (int)sizeof(cmd), 0x50, 0x1234, 2, n, &acks, &din);
            int c87 = 0;
            CHECK(len > 0, "build_read 成功");
            for (int i = 0; i < len; i++) if (cmd[i] == 0x87) c87++;
            CHECK(c87 == 1, "讀取命令整段只有一個 0x87（每多一個就是多一次 USB 往返）");
            CHECK(len > 0 && cmd[len - 1] == 0x87, "唯一的 0x87 在最後一個位元組");
            CHECK(din == n, "資料 byte 數等於要求的長度");
        }
        /* 寫入路徑同理：資料 byte 不需要中途 flush */
        {
            unsigned char data[64];
            int len, c87 = 0;
            for (int i = 0; i < 64; i++) data[i] = (unsigned char)i;
            len = dgh_mp_build_write(cmd, (int)sizeof(cmd), 0x50, 0x1234, 2, data, 64, &acks, &din);
            CHECK(len > 0, "build_write 成功");
            for (int i = 0; i < len; i++) if (cmd[i] == 0x87) c87++;
            CHECK(c87 == 1, "寫入命令整段也只有一個 0x87");
            CHECK(cmd[len - 1] == 0x87, "寫入的 0x87 也在最後");
        }
    }


    /* ═══ 🔴 raw 讀取命令序列的結構自檢（2026-09-19）═════════════════════════
       情境：Bridge 已經不當掉了（__stdcall 修好），但自動驗證每次都判快慢兩路資料
       不一致 ⇒ raw 路徑讀出來的值是錯的（就是當初 0F 那個東西）。
       在 Bruce 的 log 到達之前，先把**不需要硬體就能驗的每一條**釘住，
       這樣 log 一到就只剩「硬體時序」這一類可能，不必再從頭排除。

       🔴 特別是回傳位元組的**記帳**：一次 FT_Read 收 acks+din 個 byte，
       raw_read 用 in[acks + i] 取資料。只要 ACK 不是全部排在最前面，
       整段資料就會偏移 —— 這是最可能的一種錯法，所以這裡直接解析命令流來確認。 */
    {
        static unsigned char c[4096 * 60 + 512];
        int acks = 0, din = 0, n, i;
        int nRead20 = 0, nRead22 = 0, nAck13 = 0, lastAckVal = -1, firstAfterAddr = -1, nClk8E = 0;
        int seen20 = 0, bad13 = 0;
        n = dgh_mp_build_read(c, (int)sizeof(c), 0x50, 0x1234, 2, 8, &acks, &din);
        CHECK(n > 0, "build_read(8 byte) 成功");
        /* 走一遍命令流，依 opcode 的長度前進 */
        for (i = 0; i < n; ) {
            unsigned char op = c[i];
            if (op == 0x80 || op == 0x82) { i += 3; }
            else if (op == 0x11 || op == 0x13) {     /* 寫 byte / 寫 bit */
                if (op == 0x11) i += 3 + (c[i+1] | (c[i+2] << 8)) + 1;
                else {                                /* 0x13：長度欄 1 byte ＋ 1 個資料 byte */
                    if (seen20) { nAck13++; lastAckVal = c[i+2];
                                  /* 前 N-1 個必須是 0x00（ACK），最後一個 0x80（NACK） */
                                  if (nAck13 < 8 && c[i+2] != 0x00) bad13++; }
                    i += 3;
                }
            }
            else if (op == 0x20) { nRead20++; seen20 = 1;
                                   if (firstAfterAddr < 0) firstAfterAddr = nRead22;
                                   i += 3; }
            else if (op == 0x22) { nRead22++; i += 2; }
            /* 🔴 0x8E ＝ Clock For n x 1 bits, no data transfer（長度欄 1 byte）。
               NACK 改用「放開 ＋ 一個時脈」之後會出現，走訪器要認得它，
               否則 `0x8E 0x00` 會被當成兩個 opcode 解析（這次剛好不出錯，
               但下一個人改到就會踩到）。 */
            else if (op == 0x8E) { nClk8E++; i += 2; }
            else if (op == 0x87) { i += 1; }
            else { i += 1; }
        }
        EQ_INT(nRead20, 8, "資料讀取命令 0x20 的數量 ＝ 要讀的 byte 數");
        EQ_INT(nRead22, acks, "位元讀取命令 0x22 的數量 ＝ acks（位址相位的 ACK）");
        /* 🔴🔴 v1.12.0 補正（同上）：`0x8E` 在 FT2232C/D 上不存在，產品碼早就
           改回「8 個資料 byte 各發一個 bit：前 7 個 ACK（0x00）、最後一個 NACK
           （0x80 ＝ 送 1）」，全部用 `0x13`。測試還停在 0x8E 那一版。
           NACK 的語意仍然是「不要把 SDA 拉低」—— `13 00 80` 送的是 bit 1，
           由上拉電阻拉高，不是主動推高（`13 00 FF` 那種才是，上面另有一條擋它）。 */
        EQ_INT(nAck13, 8, "8 個資料 byte 各用一次 0x13 發 ACK／NACK");
        /* 走訪器只檢查**前 7 個**的值（`nAck13 < 8` 是在遞增之後判的），
           第 8 個那一個 NACK 由下面的 lastAckVal 單獨釘 ⇒ 這裡恆為 0。 */
        EQ_INT(bad13, 0, "前 7 個 ACK 都是 0x00");
        EQ_INT(lastAckVal, 0x80, "🔴 最後一個是 NACK（0x80 ＝ 送出 bit 1，靠上拉變高）");
        EQ_INT(nClk8E, 0, "🔴 整段命令流裡一個 0x8E 都沒有");
        /* 🔴 記帳：所有 0x22（ACK）都必須排在第一個 0x20（資料）之前，
           否則 in[acks + i] 取資料就會偏移。firstAfterAddr ＝ 遇到第一個 0x20 時
           已經數到的 0x22 個數；它必須等於 acks。 */
        EQ_INT(firstAfterAddr, acks,
               "🔴 位址相位的 ACK 全部排在資料之前 ⇒ in[acks+i] 取資料不會偏移");
        EQ_INT(acks + din, acks + 8, "預期收回的 byte 數 ＝ acks + 資料長度");
        EQ_INT(din, 8, "din ＝ 資料長度");
    }

    /* 方向位元可切換（--ad3-out），且**預設不變**。 */
    {
        static unsigned char a[2048], b[2048];
        int ak = 0, dn = 0, na, nb;
        na = dgh_mp_build_read(a, (int)sizeof(a), 0x50, 0x1234, 2, 4, &ak, &dn);
        dgh_ad3_out = 1;
        nb = dgh_mp_build_read(b, (int)sizeof(b), 0x50, 0x1234, 2, 4, &ak, &dn);
        dgh_ad3_out = 0;
        EQ_INT(na, nb, "切換 AD3 只改方向位元的值，不改命令長度");
        CHECK(memcmp(a, b, na) != 0, "🔴 --ad3-out 真的改變了送出的位元組");
        {   /* 差異只能出現在 0x80 命令的第 3 個 byte（方向欄），不能動到別處 */
            int i2, diffs = 0, offDir = 0;
            for (i2 = 0; i2 < na; i2++) if (a[i2] != b[i2]) {
                diffs++;
                if ((a[i2] == 0x03 && b[i2] == 0x0B) || (a[i2] == 0x01 && b[i2] == 0x09)) offDir++;
            }
            EQ_INT(diffs, offDir, "🔴 差異全部是方向欄 0x03→0x0B / 0x01→0x09，沒有波及其他位元組");
        }
        {   /* 預設值必須是既有行為 */
            static unsigned char d[2048]; int k = 0, m = 0;
            int nd = dgh_mp_build_read(d, (int)sizeof(d), 0x50, 0x1234, 2, 4, &k, &m);
            EQ_INT(nd, na, "預設長度不變");
            CHECK(memcmp(a, d, na) == 0, "🔴 預設（不帶 --ad3-out）與本版之前逐位元組相同");
        }
    }

    /* ═══ 🔴 時脈換算：三相與除數必須成對（v1.11.5）════════════════════════════
       v1.11.4 送 0x8A（60 MHz base）卻用 12 MHz 的公式，實測 400k 設定量到 80 kHz。
       把換算做成函式之後，這裡直接釘住「設定 f ⇒ 線上就是 f」這個往返關係。 */
    {
        EQ_INT(dgh_mp_divisor(400000, 1), 9,  "400 kHz + 三相 ⇒ divisor 9");
        EQ_INT(dgh_mp_wire_hz(9, 1), 400000,  "🔴 divisor 9 + 三相 ⇒ 線上 400 kHz");
        EQ_INT(12000000u / ((9 + 1) * 2), 600000, "驗算：divisor 9 程式化 600 kHz（線上是它的 2/3）");
        EQ_INT(dgh_mp_divisor(400000, 0), 14, "400 kHz 不開三相 ⇒ divisor 14");
        EQ_INT(dgh_mp_wire_hz(14, 0), 400000, "divisor 14 無三相 ⇒ 線上 400 kHz（與 libMPSSE 一致）");
        /* 🔴 往返一致性。divisor 是整數，所以不是每個頻率都剛好表示得出來 ——
           例如 150 kHz 開三相要 prog=225,000，6e6/225000 整數除法得 26 ⇒ div 25
           ⇒ 線上 153,846（差 2.6%）。那是硬體本來的量化，不是我們算錯。
           所以這裡用 5% 容差，**但 400 kHz 必須精確**（那是 Bruce 的驗收條件，
           上面已單獨用 EQ_INT 釘死）。 */
        {
            unsigned int f[] = { 100000, 150000, 200000, 400000 };
            unsigned i3, tp;
            for (tp = 0; tp <= 1; tp++)
                for (i3 = 0; i3 < sizeof(f)/sizeof(f[0]); i3++) {
                    unsigned short d = dgh_mp_divisor(f[i3], (int)tp);
                    unsigned int got = dgh_mp_wire_hz(d, (int)tp);
                    unsigned int lo = f[i3] - f[i3]/20, hi = f[i3] + f[i3]/20;
                    CHECK(got >= lo && got <= hi,
                          tp ? "往返一致（三相開，±5% 量化容差）"
                             : "往返一致（三相關，±5% 量化容差）");
                }
        }
        /* 🔴 反面：三相開與關**必須**得到不同的 divisor，否則就是補償沒生效 */
        CHECK(dgh_mp_divisor(400000, 1) != dgh_mp_divisor(400000, 0),
              "🔴 三相開/關的 divisor 不同 ＝ 2/3 補償真的有算進去");
        EQ_INT(dgh_mp_divisor(400000, 0) - dgh_mp_divisor(400000, 1), 5,
              "14 - 9 = 5（補償幅度符合 3/2）");
    }

    /* ═══ 🔴 FT2232H 不得送 0x9E（Open Collector，FT232H only）═════════════════
       v1.11.4 抄 dg-measure 的 WebUSB init 時連 0x9E 一起抄了，但他的治具
       PID=0x6010 ＝ FT2232H。未知 opcode 會讓 MPSSE 回 0xFA，而它後面的兩個
       參數會被當成 opcode 繼續解析 ⇒ 整串命令流錯位。
       raw init 的位元組序列是在 i2c_bridge.c 裡組的，這裡驗的是**產生命令的那一段
       不會把 0x9E 放進讀寫命令流**（builder 層），i2c_bridge.c 那一份由
       tools/check_raw_init.sh 以原始碼比對把關。 */
    {
        static unsigned char c9[4096 * 60 + 512];
        int ak = 0, dn = 0, nn, i9, found9E = 0;
        nn = dgh_mp_build_read(c9, (int)sizeof(c9), 0x68, 0, 2, 64, &ak, &dn);
        for (i9 = 0; i9 < nn; ) {
            unsigned char op = c9[i9];
            if (op == 0x9E) { found9E = 1; break; }
            if (op == 0x80 || op == 0x82) i9 += 3;
            else if (op == 0x11) i9 += 3 + (c9[i9+1] | (c9[i9+2] << 8)) + 1;
            else if (op == 0x13) i9 += 3;
            else if (op == 0x20) i9 += 3;
            else if (op == 0x22) i9 += 2;
            else i9 += 1;
        }
        /* 🔴 0x9E 屬於**通道初始化**（raw_set_mode），不在讀取命令流裡 ——
           這一條驗的是「讀寫命令流本身不該混進 init 命令」。
           「init 必須送 0x9E」由 tools/check_raw_init.sh 以原始碼比對把關
           （那條規則 2026-09-19 反轉過：文件說 FT232H only，但實測拿掉會整片讀到 0）。 */
        EQ_INT(found9E, 0, "讀寫命令流裡不混入 init 命令（0x9E 屬於 init）");
    }

    printf("\n%d/%d checks passed\n", total-fails, total);
    return fails?1:0;
}

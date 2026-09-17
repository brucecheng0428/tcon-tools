/* dg_helper_proto.h 的單元測試（可攜，在 Linux/macOS 上編來跑）。
 * 測到的就是 helper 出貨的那份協定程式碼。
 *   cc test_proto.c -o test_proto && ./test_proto
 */
#include "dg_helper_proto.h"
#include <stdio.h>

static int fails=0, total=0;
#define CHECK(cond, name) do{ total++; if(cond){ printf("  ok   %s\n",name);} else { printf("  FAIL %s\n",name); fails++; } }while(0)

int main(void){
    printf("== dg_helper_proto self-test ==\n");

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

    /* 4. 位址白名單（0x1200–0x12FF） */
    {
        CHECK(dgh_write_allowed(0x1200,1)==1,"allow 0x1200 x1");
        CHECK(dgh_write_allowed(0x1268,1)==1,"allow 0x1268 x1");
        CHECK(dgh_write_allowed(0x12FF,1)==1,"allow 0x12FF x1");
        CHECK(dgh_write_allowed(0x12FE,2)==1,"allow 0x12FE x2 (ends 0x12FF)");
        CHECK(dgh_write_allowed(0x12FF,2)==0,"block 0x12FF x2 (overruns)");
        CHECK(dgh_write_allowed(0x11FF,1)==0,"block 0x11FF (below)");
        CHECK(dgh_write_allowed(0x1300,1)==0,"block 0x1300 (above)");
        CHECK(dgh_write_allowed(0x1200,0)==0,"block zero length");
        CHECK(dgh_write_allowed(0x0000,1)==0,"block 0x0000");
        CHECK(dgh_write_allowed(0xFF00,1)==0,"block IC-ID reg 0xFF00 write");
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

    printf("\n%d/%d checks passed\n", total-fails, total);
    return fails?1:0;
}

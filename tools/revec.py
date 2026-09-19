#!/usr/bin/env python3
"""重錄 test_proto.c 的黃金向量。

🔴 為什麼要有這支：這個向量是「讀取命令流長什麼樣」的單一事實來源，
   每次刻意改形狀（open-drain、ckDelay…）都要重錄一次。
   手改那一長串十六進位必錯，所以讓它由 builder 自己產生。

   用法：node/cc 先把 tools/i2c-bridge/_vecgen 編好，再
         python3 tools/revec.py <十六進位字串>
"""
import re
import sys
import pathlib

if len(sys.argv) != 2 or not re.fullmatch(r'[0-9A-F]+', sys.argv[1]):
    sys.exit('用法：revec.py <十六進位字串>')

vec = sys.argv[1]
p = pathlib.Path(__file__).resolve().parent / 'i2c-bridge' / 'test_proto.c'
src = p.read_text(encoding='utf-8')
new, n = re.subn(r'(static const char\* EXPECT =\s*\n\s*")[0-9A-F]+(";)',
                 lambda m: m.group(1) + vec + m.group(2), src, count=1)
if n != 1:
    sys.exit('🔴 找不到 EXPECT 向量，沒有改動任何東西')
p.write_text(new, encoding='utf-8')
print(f'向量已更新：{len(vec)//2} 個位元組')

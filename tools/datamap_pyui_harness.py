#!/usr/bin/env python3
"""datamap_pyui_harness.py — 用 Python UI 自己的程式算 Data Mapping，給 tools/check_datamap.js 對拍。

不是重寫：直接 import ~/TCON/.../SourceCode_V5.0.4/RomCodeProcessUI.py（與 FileProcess.py），
只把 PyQt5／DLL 換成空殼，再呼叫它真正的方法：
  read_dm_info_from_code、set_dm_info_to_rgb_table、dm_label_update、dm_checksum_update、
  get_object_to_dm_info（改 Gate Type）、set_rgb_table_to_dm_info ＋ write_dm_info_to_code（改表格）。
Controller.__init__ 會建視窗，不能跑；它在 __init__ 裡設的字典改成從原始碼逐字取出（ast.literal_eval），
所以字典內容就是 Python UI 原檔裡的那一份。

用法：python3 datamap_pyui_harness.py <SourceCode 目錄> <PY tcon 名稱> <code 檔> [編輯 JSON]
  編輯 JSON：{"rgb":[24 個名稱]} 或 {"gate":"Dual-Gate"}
輸出 JSON：hand、panel、rd、gate（comboBox_49 文字）、rgb（24 格）、cks（label_219 文字）、labels、diff（編輯後 3E 影像的差異）
"""
import ast, importlib, json, os, re, sys, types

class _Any:
    def __init__(self, *a, **k): pass
    def __call__(self, *a, **k): return _Any()
    def __getattr__(self, n): return _Any()
    def __or__(self, o): return self
def _mod(name):
    m = types.ModuleType(name); m.__getattr__ = lambda n: _Any; return m
for n in ['PyQt5', 'PyQt5.QtCore', 'PyQt5.QtWidgets', 'PyQt5.QtGui', 'RadDll64', 'DpStatus', 'chardet',
          'openpyxl', 'openpyxl.styles', 'BruceMainWindow']:
    sys.modules[n] = _mod(n)
class QMainWindow: pass
class Ui_MainWindow: pass
sys.modules['PyQt5.QtWidgets'].QMainWindow = QMainWindow
sys.modules['BruceMainWindow'].Ui_MainWindow = Ui_MainWindow

src_dir, tcon, code = sys.argv[1:4]
sys.path.insert(0, src_dir)
R = importlib.import_module('RomCodeProcessUI')
o = R.Controller.__new__(R.Controller)

SRC = open(os.path.join(src_dir, 'RomCodeProcessUI.py'), encoding='utf-8').read()
NAMES = ['map_datamapping_addr_3e_dict', 'dm_handmode_en_addr_3e_dict', 'dm_panel_mode_addr_3e_dict',
         'dm_line_type_sel_addr_3e_dict', 'dm_hand_datan_type0_addr_3e_dict', 'dm_hand_datan_type1_addr_3e_dict',
         'dm_hand_datan_type2_addr_3e_dict', 'dm_hand_datan_type3_addr_3e_dict', 'dm_e50x_daz613x_gn_1_rgb_dict',
         'dm_e50x_daz613x_gn_2_rgb_dict', 'dm_daz6111_gn_rgb_dict', 'dm_daz7353_gn_rgb_dict', 'dm_rgb_cks_dict',
         'dm_cks_dual_gate_weights_tuple', 'dm_cks_single_gate_weights_tuple', 'map_setting_addr_rom_3e_dict']
for name in NAMES:
    m = re.search(r'^\s*self\.' + name + r'\s*=\s*', SRC, re.M)
    i = m.end(); op = SRC[i]; cl = {'{': '}', '(': ')', '[': ']'}[op]; depth = 0; j = i
    while True:
        c = SRC[j]
        if c == '#': j = SRC.index('\n', j); continue
        if c == op: depth += 1
        elif c == cl:
            depth -= 1
            if depth == 0: break
        j += 1
    setattr(o, name, ast.literal_eval(SRC[i:j + 1]))

class Box:
    def __init__(self): self.c = None; self.t = ''
    def setChecked(self, v): self.c = v
    def isChecked(self): return self.c
    def setCurrentText(self, t): self.t = t
    def currentText(self): return self.t
    def setText(self, t): self.t = t
    def text(self): return self.t
o.groupBox_41 = Box(); o.comboBox_49 = Box(); o.label_219 = Box()
o.label_223 = Box(); o.label_224 = Box(); o.label_225 = Box()
o.list_dm_gate = ['Non-Hand Mode', 'Single-Gate', 'Dual-Gate', 'Tri-Gate']        # RomCodeProcessUI.py:4074
o.tcon_a_name = tcon; o.tcon_b_name = 'TCON Name'
o.open_file_a_finish = True; o.open_file_b_finish = False; o.data_sel = 'Data A'
o.list_code_a_datamapping_line0_7_type = []; o.list_rgbstr_a_datamapping_data0_5_type0_3 = []
o.list_code_a_datamapping_data0_5_type0_3 = []
o.list_dp = R.FP.DataProcess()                                                    # :34
rom = R.FP.FileInput(code).openauto()                                             # FileProcess.py:485
rs, re_, s3, e3 = o.map_setting_addr_rom_3e_dict[tcon]
img = [0] * 0x2100
img[s3:e3 + 1] = rom[rs:re_ + 1]                                                  # set_rom_to_3e :26353（setting 區）
o.list_3e_table_a_data = img

o.read_dm_info_from_code(); o.set_dm_info_to_rgb_table(); o.dm_label_update(); o.dm_checksum_update()
out = {'tcon': tcon, 'hand': o.dm_a_handmode_data_en, 'panel': o.dm_a_panel_mode, 'rd': getattr(o, 'dm_a_rd_mode', None),
       'gate': o.comboBox_49.t, 'rgb': list(o.list_rgbstr_a_datamapping_data0_5_type0_3), 'cks': o.label_219.t,
       'labels': [o.label_223.t, o.label_224.t, o.label_225.t],
       'dmcode': o.list_3e_table_a_data[o.map_datamapping_addr_3e_dict[tcon][0]:o.map_datamapping_addr_3e_dict[tcon][1] + 1]}   # tableWidget_31 Data A（:28912）
if len(sys.argv) > 4:
    ed = json.loads(sys.argv[4])
    before = list(o.list_3e_table_a_data)
    o.set_3e_to_rom = lambda: None          # 只比 3E 影像
    o.check_sum_modify = lambda: None; o.check_sum_display = lambda: None
    if 'gate' in ed:
        o.comboBox_49.t = ed['gate']; o.groupBox_41.c = True
        o.open_file_flag = False; o.change_tab_flag = False; o.change_color_flag = False; o.back_to_snapshot_all_flag = False
        o.dm_main = lambda: None; o.i2c_mode = False
        o.get_object_to_dm_info()
    if 'rgb' in ed:
        o.list_rgbstr_a_datamapping_data0_5_type0_3 = ed['rgb']
        o.set_rgb_table_to_dm_info(); o.write_dm_info_to_code()
    out['diff'] = [[a, before[a], o.list_3e_table_a_data[a]] for a in range(len(before)) if before[a] != o.list_3e_table_a_data[a]]
print(json.dumps(out))

const fs = require('fs');

// Load DPCD_DB
eval(fs.readFileSync('data/dpcd-db.js', 'utf8'));

// Parse DPCD_VER_META
const auxContent = fs.readFileSync('aux.html', 'utf8');
const metaMatch = auxContent.match(/var DPCD_VER_META = \{([\s\S]*?)\n\};/);
eval('var DPCD_VER_META = {' + metaMatch[1] + '};');

const result = {};
const addrs = Object.keys(DPCD_DB).sort();

// Version mapping for VER_META entries
function getVerFromMeta(addr) {
  const meta = DPCD_VER_META[addr];
  if (meta && meta.v) return { ver: meta.v, label: meta.l };
  return null;
}

// Manual version assignments for registers NOT in VER_META
// Based on analysis of DP/eDP specifications
const manualVersions = {
  // === Receiver Capability 00000h-000FFh ===
  // Basic registers: DP 1.2 baseline (existed since DP 1.0/1.1, dp12 as baseline)
  "00000": { ver: "dp12", evidence: "DP 1.0 spec Table 2-46, baseline register" },
  "00001": { ver: "dp12", evidence: "DP 1.0 spec, baseline register" },
  "00002": { ver: "dp12", evidence: "DP 1.0 spec, baseline register" },
  "00003": { ver: "dp12", evidence: "DP 1.0 spec, baseline register (bit7 TPS4 is dp13 bit-level)" },
  "00006": { ver: "dp12", evidence: "DP 1.0 spec, 8b/10b baseline (128b/132b bit is DP 2.0 bit-level)" },
  "00007": { ver: "dp12", evidence: "DP 1.0 spec, baseline register (bit6 MSA_TIMING is edp12 bit-level)" },
  "00008": { ver: "dp12", evidence: "DP 1.0 spec, Receiver Port 0 Capability" },
  "00009": { ver: "dp12", evidence: "DP 1.0 spec, Receiver Port 0 Buffer Size" },
  "0000A": { ver: "dp12", evidence: "DP 1.0 spec, Receiver Port 1 Capability" },
  "0000B": { ver: "dp12", evidence: "DP 1.0 spec, Receiver Port 1 Buffer Size" },
  "0000C": { ver: "dp12", evidence: "DP 1.0 spec, I2C Speed Capability" },
  "0000E": { ver: "dp12", evidence: "DP 1.0 spec, Training AUX RD Interval (bit7 EXT_CAP is dp13 bit-level)" },
  "0000F": { ver: "dp12", evidence: "DP 1.0 spec, Adapter Capability" },
  // FAUX, MST, Audio: DP 1.2 new features
  "00020": { ver: "dp12", evidence: "DP 1.2 spec, Fast AUX capability (new in DP 1.2)" },
  "00021": { ver: "dp12", evidence: "DP 1.2 spec, MST capability (new in DP 1.2)" },
  "00022": { ver: "dp12", evidence: "DP 1.2 spec, Audio Endpoints (new in DP 1.2)" },
  // Reserved block 00030h-0005Fh
  "00030": { ver: "dp12", evidence: "DP 1.2 spec, reserved address space" },
  // Reserved in DSC area (00060-0006F block is dp14a)
  "0006D": { ver: "dp14a", evidence: "Reserved within DSC block (00060-006Fh), DSC introduced in DP 1.4a" },
  "0006E": { ver: "dp14a", evidence: "Reserved within DSC block" },
  "0006F": { ver: "dp14a", evidence: "Reserved within DSC block" },
  // Reserved after PSR (00075h)
  "00075": { ver: "dp12", evidence: "DP 1.2 spec, reserved address (existed before PSR was defined at 00070h)" },
  // Downstream Port Caps: DP 1.2 (existed since DP 1.0)
  "00080": { ver: "dp12", evidence: "DP 1.0 spec, Downstream Port 0 Capability" },
  "00081": { ver: "dp12", evidence: "DP 1.0 spec, Downstream Port 0 Cap byte 1" },
  "00082": { ver: "dp12", evidence: "DP 1.0 spec, Downstream Port 0 Cap byte 2" },
  "00083": { ver: "dp12", evidence: "DP 1.0 spec, Downstream Port 0 Cap byte 3" },
  "00084": { ver: "dp12", evidence: "DP 1.0 spec, Downstream Port 1 Cap byte 0" },
  "00085": { ver: "dp12", evidence: "DP 1.0 spec, Downstream Port 1 Cap byte 1" },
  "00086": { ver: "dp12", evidence: "DP 1.0 spec, Downstream Port 1 Cap byte 2" },
  "00087": { ver: "dp12", evidence: "DP 1.0 spec, Downstream Port 1 Cap byte 3" },
  "00088": { ver: "dp12", evidence: "DP 1.2 spec, reserved in downstream port area" },
  "00089": { ver: "dp12", evidence: "DP 1.2 spec, reserved" },
  "0008A": { ver: "dp12", evidence: "DP 1.2 spec, reserved" },
  "0008B": { ver: "dp12", evidence: "DP 1.2 spec, reserved" },
  "0008C": { ver: "dp12", evidence: "DP 1.2 spec, reserved" },
  "0008D": { ver: "dp12", evidence: "DP 1.2 spec, reserved" },
  "0008E": { ver: "dp12", evidence: "DP 1.2 spec, reserved" },
  "0008F": { ver: "dp12", evidence: "DP 1.2 spec, reserved" },
  // FEC area reserved
  "00091": { ver: "dp12", evidence: "DP 1.2 spec, reserved address space (before FEC defined)" },
  "00092": { ver: "dp12", evidence: "DP 1.2 spec, reserved address space" },

  // === Link Configuration 00100h-001FFh ===
  "00100": { ver: "dp12", evidence: "DP 1.0 spec, LINK_BW_SET" },
  "00101": { ver: "dp12", evidence: "DP 1.0 spec, LANE_COUNT_SET" },
  "00102": { ver: "dp12", evidence: "DP 1.0 spec, TRAINING_PATTERN_SET" },
  "00103": { ver: "dp12", evidence: "DP 1.0 spec, TRAINING_LANE0_SET" },
  "00104": { ver: "dp12", evidence: "DP 1.0 spec, TRAINING_LANE1_SET" },
  "00105": { ver: "dp12", evidence: "DP 1.0 spec, TRAINING_LANE2_SET" },
  "00106": { ver: "dp12", evidence: "DP 1.0 spec, TRAINING_LANE3_SET" },
  "00107": { ver: "dp12", evidence: "DP 1.0 spec, DOWNSPREAD_CTRL (bit6 is edp15 bit-level)" },
  "00108": { ver: "dp12", evidence: "DP 1.0 spec, MAIN_LINK_CHANNEL_CODING_SET" },
  "00109": { ver: "dp12", evidence: "DP 1.0 spec, I2C_SPEED_CTRL_STATUS" },
  "0010B": { ver: "dp12", evidence: "DP 1.2 spec, LINK_QUAL test pattern" },
  "0010C": { ver: "dp12", evidence: "DP 1.2 spec, LINK_QUAL Lane 1" },
  "0010D": { ver: "dp12", evidence: "DP 1.2 spec, LINK_QUAL Lane 2" },
  "0010E": { ver: "dp12", evidence: "DP 1.2 spec, LINK_QUAL Lane 3" },
  "0010F": { ver: "dp12", evidence: "DP 1.2 spec, Post Cursor2 Lane0/1 (new in DP 1.2)" },
  "00110": { ver: "dp12", evidence: "DP 1.2 spec, Post Cursor2 Lane2/3 (new in DP 1.2)" },
  "00111": { ver: "dp12", evidence: "DP 1.2 spec, MST Mode Control (new in DP 1.2)" },

  // === Link/Sink Status 00200h-002FFh ===
  "00200": { ver: "dp12", evidence: "DP 1.0 spec, SINK_COUNT" },
  "00201": { ver: "dp12", evidence: "DP 1.0 spec, DEVICE_SERVICE_IRQ_VECTOR" },
  "00202": { ver: "dp12", evidence: "DP 1.0 spec, LANE0_1_STATUS" },
  "00203": { ver: "dp12", evidence: "DP 1.0 spec, LANE2_3_STATUS" },
  "00204": { ver: "dp12", evidence: "DP 1.0 spec, LANE_ALIGN_STATUS_UPDATED" },
  "00205": { ver: "dp12", evidence: "DP 1.0 spec, SINK_STATUS" },
  "00206": { ver: "dp12", evidence: "DP 1.0 spec, ADJUST_REQUEST_LANE0_1" },
  "00207": { ver: "dp12", evidence: "DP 1.0 spec, ADJUST_REQUEST_LANE2_3" },
  "00210": { ver: "dp12", evidence: "DP 1.0 spec, Symbol Error Count Lane 0 Low" },
  "00211": { ver: "dp12", evidence: "DP 1.0 spec, Symbol Error Count Lane 0 High" },
  "00212": { ver: "dp12", evidence: "DP 1.0 spec, Symbol Error Count Lane 1 Low" },
  "00213": { ver: "dp12", evidence: "DP 1.0 spec, Symbol Error Count Lane 1 High" },
  "00214": { ver: "dp12", evidence: "DP 1.0 spec, Symbol Error Count Lane 2 Low" },
  "00215": { ver: "dp12", evidence: "DP 1.0 spec, Symbol Error Count Lane 2 High" },
  "00216": { ver: "dp12", evidence: "DP 1.0 spec, Symbol Error Count Lane 3 Low" },
  "00217": { ver: "dp12", evidence: "DP 1.0 spec, Symbol Error Count Lane 3 High" },
  "00218": { ver: "dp12", evidence: "DP 1.2 spec, TEST_REQUEST (compliance test)" },
  "00219": { ver: "dp12", evidence: "DP 1.2 spec, TEST_LINK_RATE" },
  "00220": { ver: "dp12", evidence: "DP 1.2 spec, TEST_LANE_COUNT" },
  "00260": { ver: "dp12", evidence: "DP 1.2 spec, TEST_RESPONSE" },
  "00270": { ver: "dp12", evidence: "DP 1.2 spec, TEST_SINK" },
  "002C0": { ver: "dp12", evidence: "DP 1.2 spec, PAYLOAD_TABLE_UPDATE_STATUS (MST, new in DP 1.2)" },

  // === Source/Sink/Branch IEEE OUI ===
  "00300": { ver: "dp12", evidence: "DP 1.2 spec, Source IEEE OUI" },
  "00301": { ver: "dp12", evidence: "DP 1.2 spec, Source IEEE OUI byte 1" },
  "00302": { ver: "dp12", evidence: "DP 1.2 spec, Source IEEE OUI byte 2" },
  "00303": { ver: "dp12", evidence: "DP 1.2 spec, Source Device ID String" },
  "00304": { ver: "dp12", evidence: "DP 1.2 spec, Source Device ID String byte 1" },
  "00305": { ver: "dp12", evidence: "DP 1.2 spec, Source Device ID String byte 2" },
  "00306": { ver: "dp12", evidence: "DP 1.2 spec, Source Device ID String byte 3" },
  "00307": { ver: "dp12", evidence: "DP 1.2 spec, Source Device ID String byte 4" },
  "00308": { ver: "dp12", evidence: "DP 1.2 spec, Source Device ID String byte 5" },
  "00309": { ver: "dp12", evidence: "DP 1.2 spec, Source HW Revision" },
  "0030A": { ver: "dp12", evidence: "DP 1.2 spec, Source FW Revision Major" },
  "0030B": { ver: "dp12", evidence: "DP 1.2 spec, Source FW Revision Minor" },
  // Intel vendor-specific (Source OUI area extensions)
  "00310": { ver: "vendor_intel", evidence: "Intel Adaptive Sync, vendor-specific extension in Source OUI area" },
  "00311": { ver: "vendor_intel", evidence: "Intel Adaptive Sync byte 1" },
  "00312": { ver: "vendor_intel", evidence: "Intel Adaptive Sync byte 2" },
  "00313": { ver: "vendor_intel", evidence: "Intel Adaptive Sync byte 3" },
  "00314": { ver: "vendor_intel", evidence: "Intel vendor-specific, PSR VTotal/LRR/UBRR capabilities" },
  "00316": { ver: "vendor_intel", evidence: "Intel vendor-specific, LRR control" },
  "00317": { ver: "vendor_intel", evidence: "Intel vendor-specific, Sink capability declaration" },
  "00320": { ver: "vendor_intel", evidence: "Intel vendor-specific, MBO application" },
  "00330": { ver: "vendor_intel", evidence: "Intel/AMD vendor-specific, ALPM power management state" },
  "00340": { ver: "vendor_intel", evidence: "Intel eDP HDR caps 0" },
  "00341": { ver: "vendor_intel", evidence: "Intel eDP HDR caps (TCON HDR ability)" },
  "00342": { ver: "vendor_intel", evidence: "Intel vendor-specific, TCON capability" },
  "00343": { ver: "vendor_intel", evidence: "Intel eDP HDR caps 3" },
  "00344": { ver: "vendor_intel", evidence: "Intel vendor-specific, HDR/backlight/nits control bits" },
  "00346": { ver: "vendor_intel", evidence: "Intel vendor-specific, Content Luminance" },
  "00347": { ver: "vendor_intel", evidence: "Intel vendor-specific, Content Luminance byte 1" },
  "00348": { ver: "vendor_intel", evidence: "Intel vendor-specific, Content Luminance byte 2" },
  "00349": { ver: "vendor_intel", evidence: "Intel vendor-specific, Content Luminance byte 3" },
  "0034A": { ver: "vendor_intel", evidence: "Intel vendor-specific, Panel EDID Luminance Override" },
  "0034B": { ver: "vendor_intel", evidence: "Intel vendor-specific, Panel EDID Luminance Override byte 1" },
  "0034C": { ver: "vendor_intel", evidence: "Intel vendor-specific, Panel EDID Luminance Override byte 2" },
  "0034D": { ver: "vendor_intel", evidence: "Intel vendor-specific, Panel EDID Luminance Override byte 3" },
  "0034E": { ver: "vendor_intel", evidence: "Intel vendor-specific, Panel EDID Luminance Override byte 4" },
  "0034F": { ver: "vendor_intel", evidence: "Intel vendor-specific, Panel EDID Luminance Override byte 5" },
  "00350": { ver: "vendor_intel", evidence: "Intel vendor-specific, Panel EDID Luminance Override byte 6" },
  "00351": { ver: "vendor_intel", evidence: "Intel vendor-specific, Panel EDID Luminance Override byte 7" },
  "00352": { ver: "vendor_intel", evidence: "Intel vendor-specific, SDR Luminance Level" },
  "00353": { ver: "vendor_intel", evidence: "Intel vendor-specific, SDR Luminance Level byte 1" },
  "00354": { ver: "vendor_intel", evidence: "Intel vendor-specific, Nits Brightness Control" },
  "00355": { ver: "vendor_intel", evidence: "Intel vendor-specific, Nits Brightness Control byte 1" },
  "00356": { ver: "vendor_intel", evidence: "Intel vendor-specific, Smooth Brightness frames" },
  "00357": { ver: "vendor_intel", evidence: "Intel vendor-specific, Smooth Brightness step" },
  "00358": { ver: "vendor_intel", evidence: "Intel vendor-specific, brightness optimization control" },
  // AMD vendor-specific
  "00370": { ver: "vendor_amd", evidence: "AMD vendor-specific, PSR VTotal control support" },
  "00373": { ver: "vendor_amd", evidence: "AMD vendor-specific, SinkPsrActiveVTotalInUse low byte" },
  "00374": { ver: "vendor_amd", evidence: "AMD vendor-specific, SinkPsrActiveVTotalInUse high byte" },
  "00378": { ver: "vendor_amd", evidence: "AMD vendor-specific, PSR supplemental" },
  "00379": { ver: "vendor_amd", evidence: "AMD/vendor-specific, Pixel Deviation Per Line (Replay)" },
  "0037A": { ver: "vendor_amd", evidence: "AMD/vendor-specific, Max Deviation Lines (Replay)" },
  "0037B": { ver: "vendor_amd", evidence: "AMD/vendor-specific, supplemental" },
  "003F0": { ver: "vendor_amd", evidence: "AMD/vendor-specific, Early Scanline SDP for PSR2" },
  // Sink IEEE OUI
  "00400": { ver: "dp12", evidence: "DP 1.2 spec, Sink IEEE OUI byte 0" },
  "00401": { ver: "dp12", evidence: "DP 1.2 spec, Sink IEEE OUI byte 1" },
  "00402": { ver: "dp12", evidence: "DP 1.2 spec, Sink IEEE OUI byte 2" },
  "00403": { ver: "dp12", evidence: "DP 1.2 spec, Sink Device ID String" },
  "00404": { ver: "dp12", evidence: "DP 1.2 spec, Sink Device ID String byte 1" },
  "00405": { ver: "dp12", evidence: "DP 1.2 spec, Sink Device ID String byte 2" },
  "00406": { ver: "dp12", evidence: "DP 1.2 spec, Sink Device ID String byte 3" },
  "00407": { ver: "dp12", evidence: "DP 1.2 spec, Sink Device ID String byte 4" },
  "00408": { ver: "dp12", evidence: "DP 1.2 spec, Sink Device ID String byte 5" },
  "00409": { ver: "dp12", evidence: "DP 1.2 spec, Sink HW Revision" },
  "0040A": { ver: "dp12", evidence: "DP 1.2 spec, Sink FW Revision Major" },
  "0040B": { ver: "dp12", evidence: "DP 1.2 spec, Sink FW Revision Minor" },
  // AMD AUPI (Sink OUI area vendor extensions)
  "0040F": { ver: "vendor_amd", evidence: "AMD vendor-specific, TCON setting in Sink OUI area" },
  "00410": { ver: "vendor_amd", evidence: "AMD AUPI, panel Manufacture ID low" },
  "00411": { ver: "vendor_amd", evidence: "AMD AUPI, panel Manufacture ID high" },
  "00412": { ver: "vendor_amd", evidence: "AMD AUPI, Panel ID low" },
  "00413": { ver: "vendor_amd", evidence: "AMD AUPI, Panel ID high" },
  "00414": { ver: "vendor_amd", evidence: "AMD AUPI, TCON FW checksum low" },
  "00415": { ver: "vendor_amd", evidence: "AMD AUPI, TCON FW checksum high" },
  "00416": { ver: "vendor_amd", evidence: "AMD AUPI, TCON FW Device ID low" },
  "00417": { ver: "vendor_amd", evidence: "AMD AUPI, TCON FW Device ID high" },
  // Branch IEEE OUI
  "00500": { ver: "dp12", evidence: "DP 1.2 spec, Branch IEEE OUI byte 0" },
  "00501": { ver: "dp12", evidence: "DP 1.2 spec, Branch IEEE OUI byte 1" },
  "00502": { ver: "dp12", evidence: "DP 1.2 spec, Branch IEEE OUI byte 2" },
  "00503": { ver: "dp12", evidence: "DP 1.2 spec, Branch Device ID String" },
  "00504": { ver: "dp12", evidence: "DP 1.2 spec, Branch Device ID String byte 1" },
  "00505": { ver: "dp12", evidence: "DP 1.2 spec, Branch Device ID String byte 2" },
  "00506": { ver: "dp12", evidence: "DP 1.2 spec, Branch Device ID String byte 3" },
  "00507": { ver: "dp12", evidence: "DP 1.2 spec, Branch Device ID String byte 4" },
  "00508": { ver: "dp12", evidence: "DP 1.2 spec, Branch Device ID String byte 5" },
  "00509": { ver: "dp12", evidence: "DP 1.2 spec, Branch HW Revision" },
  "0050A": { ver: "dp12", evidence: "DP 1.2 spec, Branch FW Revision Major" },
  "0050B": { ver: "dp12", evidence: "DP 1.2 spec, Branch FW Revision Minor" },
  // SET_POWER
  "00600": { ver: "dp12", evidence: "DP 1.0 spec, SET_POWER / power management" },
  // eDP backlight extensions (VESA DPCD, eDP 1.5)
  "00730": { ver: "edp15", evidence: "eDP 1.5 VESA DPCD mapping, brightness optimization control", uncertain: true },
  "00731": { ver: "edp15", evidence: "eDP 1.5 VESA DPCD mapping, segmented backlight control", uncertain: true },
  "00734": { ver: "edp15", evidence: "eDP 1.5 VESA DPCD mapping, Nits brightness control", uncertain: true },
  "00735": { ver: "edp15", evidence: "eDP 1.5 VESA DPCD mapping, Nits brightness control byte 1", uncertain: true },
  "00736": { ver: "edp15", evidence: "eDP 1.5 VESA DPCD mapping, Nits brightness control byte 2", uncertain: true },
  "00737": { ver: "edp15", evidence: "eDP 1.5 VESA DPCD mapping, Smooth brightness control", uncertain: true },
  "00738": { ver: "edp15", evidence: "eDP 1.5 VESA DPCD mapping, Smooth brightness transition time", uncertain: true },
  "00739": { ver: "edp15", evidence: "eDP 1.5 VESA DPCD mapping, Smooth brightness current value", uncertain: true },
  "0073A": { ver: "edp15", evidence: "eDP 1.5 VESA DPCD mapping, Smooth brightness current value byte 1", uncertain: true },
  "0073B": { ver: "edp15", evidence: "eDP 1.5 VESA DPCD mapping, Smooth brightness current value byte 2", uncertain: true },
  // Non-standard HDR DPCD addresses
  "00DEF": { ver: "vendor", evidence: "Non-standard DPCD address, VESA HDR 2084/2020 mapping (not in standard DPCD map)", uncertain: true },
  "00FEA": { ver: "vendor", evidence: "Non-standard DPCD address, VESA HDR 2084/2020 mapping (not in standard DPCD map)", uncertain: true },
  // ESI area (DP 1.2)
  "0200C": { ver: "dp12", evidence: "DP 1.2 spec, Lane0_1 Status ESI (mirror of 00202h)" },
  "0200D": { ver: "dp12", evidence: "DP 1.2 spec, Lane2_3 Status ESI (mirror of 00203h)" },
  "0200E": { ver: "dp12", evidence: "DP 1.2 spec, Lane Align Status ESI (mirror of 00204h)" },
  // Extended Receiver Cap (dp13 area)
  "02203": { ver: "dp13", evidence: "DP 1.3 spec, Extended Receiver Cap area, mirror of 00003h" },
  "02208": { ver: "dp13", evidence: "DP 1.3 spec, Extended Receiver Cap, mirror of 00008h" },
  "02209": { ver: "dp13", evidence: "DP 1.3 spec, Extended Receiver Cap, Buffer Size 0" },
  "0220A": { ver: "dp13", evidence: "DP 1.3 spec, Extended Receiver Cap, mirror of 0000Ah" },
  "0220B": { ver: "dp13", evidence: "DP 1.3 spec, Extended Receiver Cap, Buffer Size 1" },
  "0220E": { ver: "dp13", evidence: "DP 1.3 spec, Extended Receiver Cap, mirror of 0000Eh" },
  "0220F": { ver: "dp13", evidence: "DP 1.3 spec, Extended Receiver Cap, mirror of 0000Fh" },
  // Vendor-specific
  "F0000": { ver: "vendor", evidence: "Vendor-specific DPCD space (F0000h-FFFFFh), chip-vendor defined" },
};

// Build final result
addrs.forEach(addr => {
  const entry = DPCD_DB[addr];
  const name = entry.n || 'UNKNOWN';
  
  // First check VER_META
  const meta = getVerFromMeta(addr);
  if (meta) {
    result['0x' + addr] = {
      name: name,
      first_ver: meta.ver,
      evidence: "DPCD_VER_META: " + meta.label
    };
    return;
  }
  
  // Then check manual assignments
  const manual = manualVersions[addr];
  if (manual) {
    const obj = {
      name: name,
      first_ver: manual.ver,
      evidence: manual.evidence
    };
    if (manual.uncertain) obj.uncertain = true;
    result['0x' + addr] = obj;
    return;
  }
  
  // Should not reach here - log any missed
  console.error('MISSED ADDRESS: ' + addr + ' | ' + name);
  result['0x' + addr] = {
    name: name,
    first_ver: "dp12",
    evidence: "DEFAULT: not found in VER_META or manual, defaulting to dp12 baseline",
    uncertain: true
  };
});

// Write output
const outputPath = 'dpcd_version_taskA.json';
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');

// Summary
const vers = {};
Object.values(result).forEach(r => {
  vers[r.first_ver] = (vers[r.first_ver] || 0) + 1;
});
console.log('\n=== Task A 輸出摘要 ===');
console.log('總暫存器數:', Object.keys(result).length);
console.log('\n各版本分佈:');
Object.keys(vers).sort().forEach(v => console.log('  ' + v + ': ' + vers[v]));
const uncertainCount = Object.values(result).filter(r => r.uncertain).length;
console.log('\n不確定標記數:', uncertainCount);
console.log('\n檔案已寫入:', outputPath);

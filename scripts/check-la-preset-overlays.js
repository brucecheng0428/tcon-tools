#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
const presetDir = path.join(repoRoot, 'data', 'la-presets');
const files = fs.readdirSync(presetDir)
  .filter((name) => name.endsWith('.snapshot.js'))
  .map((name) => path.join(presetDir, name));

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function loadSnapshotFile(file) {
  const code = fs.readFileSync(file, 'utf8');
  const context = { window: {} };
  context.window.WFG_LA_PRESET_SNAPSHOTS = {};
  vm.createContext(context);
  vm.runInContext(code, context, { filename: file });
  return context.window.WFG_LA_PRESET_SNAPSHOTS || {};
}

function rowRange(row) {
  const start = finiteNumber(row && row.time);
  const end = finiteNumber(row && row.endTime);
  return { start, end };
}

function segmentHasRange(seg) {
  const start = finiteNumber(seg && seg.overlayStartTime);
  const end = finiteNumber(seg && seg.overlayEndTime);
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

const failures = [];
let checkedDpAuxGroups = 0;
let checkedErrRows = 0;

for (const file of files) {
  const snapshots = loadSnapshotFile(file);
  for (const [presetId, snapshot] of Object.entries(snapshots)) {
    const groups = Array.isArray(snapshot.decodeResults) ? snapshot.decodeResults : [];
    for (const group of groups) {
      if (!group || group.analyzerType !== 'dp_aux') continue;
      checkedDpAuxGroups += 1;
      const rows = Array.isArray(group.rows) ? group.rows : [];
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        if (!row || row.type !== 'ERR') continue;
        checkedErrRows += 1;
        const where = `${path.relative(repoRoot, file)}:${presetId}:row[${i}]`;
        const range = rowRange(row);
        if (!Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end <= range.start) {
          failures.push(`${where} has invalid ERR time range`);
        }
        if (row.auxAnomaly !== true) {
          failures.push(`${where} is ERR but missing auxAnomaly=true`);
        }
        if (!Array.isArray(row.auxSegments) || row.auxSegments.length === 0) {
          failures.push(`${where} is ERR but missing auxSegments`);
        } else if (!row.auxSegments.some(segmentHasRange)) {
          failures.push(`${where} has auxSegments but no valid overlayStartTime/overlayEndTime`);
        }
        for (let j = 0; j < rows.length; j += 1) {
          if (i === j) continue;
          const other = rows[j];
          if (!other || other.type === 'ERR') continue;
          const otherRange = rowRange(other);
          if (!Number.isFinite(otherRange.start) || !Number.isFinite(otherRange.end) || otherRange.end <= otherRange.start) continue;
          if (range.start < otherRange.end && range.end > otherRange.start) {
            failures.push(`${where} overlaps non-ERR row[${j}] (${other.type || 'unknown'})`);
          }
        }
      }
    }
  }
}

if (failures.length) {
  console.error('LA preset overlay check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`LA preset overlay check passed: ${checkedDpAuxGroups} DP AUX group(s), ${checkedErrRows} ERR row(s).`);

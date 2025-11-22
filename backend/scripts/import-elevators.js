#!/usr/bin/env node
/**
 * Script: import-elevators.js
 * Purpose: Parse unstructured text file containing elevator address blocks and import into MongoDB.
 * Usage:
 *   node scripts/import-elevators.js --file=path/to/adrese.txt [--dry-run] [--range-expand] [--wipe]
 *   node scripts/import-elevators.js --file=adrese.txt --api-base=https://host/api --api-email=user --api-password=pass [--range-expand] [--wipe]
 *
 * Flags:
 *   --dry-run        Parse and report without DB writes
 *   --range-expand   Expand numeric ranges (X ... Y) into full sequence
 *   --wipe           Delete ALL existing elevators before import (dangerous)
 *
 * Assumptions based on user specification:
 * 1. Blocks separated by blank lines. Each block may define: broj ugovora, upravitelj, adresa, broj dizala (one or many), predstavnik, mobitel, telefon, ulaz na zgradu, razno, gps adresa, fotografija.
 * 2. If "broj ugovora" missing leave blank.
 * 3. "broj dizala" section may be:
 *    - single on same line
 *    - blank then multiple lines (each code)
 *    - codes on same line separated by spaces / commas
 *    - ranges in form START ... END (expand if --range-expand)
 *    - lines with suffix letters separated by space (e.g. F-6575 A) -> join -> F-6575A
 * 4. Parenthetical descriptors like (mali) (veliki) are removed.
 * 5. Representative: first meaningful line after 'predstavnik:' becomes imePrezime; any extra lines appended to notes.
 * 6. Ulaz na zgradu: single code stored in kontaktOsoba.ulaznaKoda; multiple / complex lines appended to notes.
 * 7. mobitel: first value stored in kontaktOsoba.mobitel; additional numbers appended to notes.
 * 8. GPS data ignored (placed into notes only if textual description without coordinates). Coordinates lines with two decimals are ignored per user request.
 * 9. status left unspecified -> relies on model default (aktivan). intervalServisa left default (1).
 * 10. Duplicate (existing brojDizala) logged and skipped.
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const Elevator = require('../models/Elevator');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { file: null, dryRun: false, rangeExpand: false, wipe: false, apiBase: null, apiEmail: null, apiPassword: null };
  args.forEach(a => {
    if (a.startsWith('--file=')) opts.file = a.split('=')[1];
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--range-expand') opts.rangeExpand = true;
    else if (a === '--wipe') opts.wipe = true;
    else if (a.startsWith('--api-base=')) opts.apiBase = a.split('=')[1];
    else if (a.startsWith('--api-email=')) opts.apiEmail = a.split('=')[1];
    else if (a.startsWith('--api-password=')) opts.apiPassword = a.split('=')[1];
  });
  if (!opts.file) {
    console.error('❌ Missing --file argument');
    process.exit(1);
  }
  return opts;
}

const KEYWORDS = [
  'broj ugovora:',
  'upravitelj:',
  'adresa:',
  'broj dizala:',
  'predstavnik:',
  'mobitel:',
  'telefon:',
  'ulaz na zgradu:',
  'razno:',
  'gps adresa:',
  'fotografija:'
];

function isKeywordLine(line) {
  const lower = line.toLowerCase();
  return KEYWORDS.some(k => lower.startsWith(k));
}

function cleanValue(v) {
  return v.replace(/\r/g, '').trim();
}

function stripParens(v) {
  return v.replace(/\([^)]*\)/g, '').trim();
}

function extractCodesFromLine(line) {
  const codes = [];
  let work = stripParens(line);
  // Range pattern e.g. 40-8196 ... 40-8201
  const rangeMatch = work.match(/^(\S+)\s*\.\.\.\s*(\S+)$/);
  if (rangeMatch) {
    codes.push({ range: [rangeMatch[1], rangeMatch[2]] });
    return codes;
  }
  // Replace commas with space
  work = work.replace(/,/g, ' ');
  const tokens = work.split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    let t = tokens[i];
    // Merge trailing letter separated by space (e.g. F-6575 A)
    if (/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(t) && i + 1 < tokens.length && /^[A-Za-z]$/.test(tokens[i + 1])) {
      t = t + tokens[i + 1];
      i++;
    }
    if (/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*[A-Za-z0-9]$/.test(t)) {
      codes.push({ code: t });
    }
  }
  return codes;
}

function expandRange(start, end) {
  // Find common prefix up to first digit sequence
  const prefixMatchStart = start.match(/^(.*?)(\d+)$/);
  const prefixMatchEnd = end.match(/^(.*?)(\d+)$/);
  if (!prefixMatchStart || !prefixMatchEnd) return [start, end];
  if (prefixMatchStart[1] !== prefixMatchEnd[1]) return [start, end];
  const prefix = prefixMatchStart[1];
  const a = parseInt(prefixMatchStart[2], 10);
  const b = parseInt(prefixMatchEnd[2], 10);
  if (isNaN(a) || isNaN(b) || b < a) return [start, end];
  const width = prefixMatchStart[2].length; // preserve zero padding
  const out = [];
  for (let n = a; n <= b; n++) {
    const num = String(n).padStart(width, '0');
    out.push(prefix + num);
  }
  return out;
}

async function run() {
  const { file, dryRun, rangeExpand, wipe, apiBase, apiEmail, apiPassword } = parseArgs();
  const raw = fs.readFileSync(path.resolve(file), 'utf8');
  const lines = raw.split(/\n/);

  let current = resetBlock();
  const blocks = [];
  let inElevatorSection = false;
  let afterPredstavnik = false;

  function resetBlock() {
    return {
      brojUgovora: null,
      nazivStranke: null,
      adresa: null,
      mjesto: null,
      elevators: [],
      predstavnik: null,
      mobitel: null,
      ulaznaKoda: null,
      notes: []
    };
  }

  function finalizeElevators() {
    inElevatorSection = false;
  }

  function flushBlock() {
    if (current.nazivStranke || current.adresa || current.elevators.length) {
      // Derive mjesto
      if (current.adresa && current.adresa.includes(',')) {
        const parts = current.adresa.split(',').map(p => p.trim()).filter(Boolean);
        current.mjesto = parts[parts.length - 1];
        // ulica without last part if >1
        if (parts.length > 1) {
          current.ulicaOnly = parts.slice(0, -1).join(', ');
        }
      }
      blocks.push(current);
    }
    current = resetBlock();
    inElevatorSection = false;
    afterPredstavnik = false;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = cleanValue(lines[i]);
    if (!line) {
      // blank line ends elevator collection but may be inside block
      if (inElevatorSection) finalizeElevators();
      continue;
    }
    const lower = line.toLowerCase();

    if (lower.startsWith('broj ugovora:')) {
      flushBlock(); // new block
      current.brojUgovora = cleanValue(line.split(':').slice(1).join(':')) || null;
      continue;
    }
    if (lower.startsWith('upravitelj:')) {
      // New block if already had something substantial
      if (current.nazivStranke || current.adresa || current.elevators.length) flushBlock();
      current.nazivStranke = cleanValue(line.split(':').slice(1).join(':')) || null;
      continue;
    }
    if (lower.startsWith('adresa:')) {
      current.adresa = cleanValue(line.split(':').slice(1).join(':')) || null;
      continue;
    }
    if (lower.startsWith('broj dizala:')) {
      inElevatorSection = true;
      const rest = cleanValue(line.split(':').slice(1).join(':'));
      if (rest) {
        const extracted = extractCodesFromLine(rest);
        extracted.forEach(obj => {
          if (obj.code) current.elevators.push(obj.code);
          else if (obj.range && rangeExpand) {
            expandRange(obj.range[1], obj.range[2]).forEach(c => current.elevators.push(c));
          } else if (obj.range) {
            current.elevators.push(obj.range[0], obj.range[1]);
          }
        });
      }
      continue;
    }
    if (inElevatorSection) {
      // until next keyword or blank line collect codes
      if (isKeywordLine(line)) {
        finalizeElevators();
        // process keyword normally
      } else {
        const extracted = extractCodesFromLine(line);
        extracted.forEach(obj => {
          if (obj.code) current.elevators.push(obj.code);
          else if (obj.range && rangeExpand) {
            expandRange(obj.range[0], obj.range[1]).forEach(c => current.elevators.push(c));
          } else if (obj.range) {
            current.elevators.push(obj.range[0], obj.range[1]);
          }
        });
        continue; // processed line as code
      }
    }

    if (lower.startsWith('predstavnik:')) {
      afterPredstavnik = true;
      const rest = cleanValue(line.split(':').slice(1).join(':'));
      if (rest) {
        current.predstavnik = rest;
        afterPredstavnik = false; // value present
      }
      continue;
    }
    if (afterPredstavnik) {
      if (isKeywordLine(line)) {
        afterPredstavnik = false;
      } else {
        if (!current.predstavnik) current.predstavnik = line; else current.notes.push(line);
        continue;
      }
    }

    if (lower.startsWith('mobitel:')) {
      const phones = cleanValue(line.split(':').slice(1).join(':')).split(/[,\/]/).map(p => p.trim()).filter(Boolean);
      if (phones.length) {
        if (!current.mobitel) current.mobitel = phones[0];
        if (phones.length > 1) current.notes.push('Dodatni telefoni: ' + phones.slice(1).join(', '));
      }
      continue;
    }
    if (lower.startsWith('telefon:')) {
      const tel = cleanValue(line.split(':').slice(1).join(':'));
      if (tel) current.notes.push('Telefon: ' + tel);
      continue;
    }
    if (lower.startsWith('ulaz na zgradu:')) {
      const value = cleanValue(line.split(':').slice(1).join(':'));
      if (value && !value.includes('\n') && value.split(/\s+/).length === 1 && !current.ulaznaKoda) {
        current.ulaznaKoda = value;
      } else if (value) {
        current.notes.push('Ulazi: ' + value);
      }
      continue;
    }
    if (lower.startsWith('razno:')) {
      const rest = cleanValue(line.split(':').slice(1).join(':'));
      if (rest) current.notes.push(rest);
      continue;
    }
    if (lower.startsWith('gps adresa:')) {
      const gps = cleanValue(line.split(':').slice(1).join(':'));
      if (gps) current.notes.push('GPS: ' + gps);
      continue;
    }
    if (lower.startsWith('fotografija:')) {
      const photo = cleanValue(line.split(':').slice(1).join(':'));
      if (photo) current.notes.push('Foto: ' + photo);
      continue;
    }

    // Any other line inside block -> note
    current.notes.push(line);
  }
  // Flush last block
  flushBlock();

  // Post-process ranges if not expanded earlier (defensive)
  blocks.forEach(b => {
    b.elevators = b.elevators.filter(Boolean);
  });

  console.log(`📦 Parsed blocks: ${blocks.length}`);

  let mode = 'mongo';
  let token = null;
  if (apiBase) {
    mode = 'api';
    console.log(`🌐 API mode active -> ${apiBase}`);
    if (!apiEmail || !apiPassword) {
      console.error('❌ API mode requires --api-email and --api-password');
      process.exit(1);
    }
    // Login
    try {
      const resp = await fetch(apiBase + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: apiEmail, lozinka: apiPassword })
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.message || 'Login failed');
      }
      token = data.token;
      console.log('✅ Logged in (API mode)');
    } catch (e) {
      console.error('❌ API login failed:', e.message);
      process.exit(1);
    }

    if (wipe) {
      console.log('🗑️  Wiping existing elevators via API...');
      try {
        const listResp = await fetch(apiBase + '/elevators', { headers: { Authorization: 'Bearer ' + token } });
        const listData = await listResp.json();
        if (listResp.ok && Array.isArray(listData.data)) {
          let deleted = 0;
          for (const el of listData.data) {
            // Attempt delete
            const delResp = await fetch(apiBase + '/elevators/' + el._id, {
              method: 'DELETE',
              headers: { Authorization: 'Bearer ' + token }
            });
            if (delResp.ok) deleted++; else {
              const delData = await delResp.json().catch(()=>({}));
              console.warn('⚠️  Cannot delete', el._id, delData.message || delResp.status);
            }
          }
          console.log(`✅ Deleted ${deleted}/${listData.data.length} elevators via API.`);
        } else {
          console.warn('⚠️  Could not list elevators for wipe.');
        }
      } catch (e) {
        console.error('❌ API wipe failed:', e.message);
      }
    }
  } else {
    // Mongo mode
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!uri) {
      console.error('❌ Missing MONGO_URI env variable and no --api-base provided');
      process.exit(1);
    }
    await mongoose.connect(uri);
    console.log('✅ MongoDB connected');
    if (wipe) {
      if (dryRun) {
        const count = await Elevator.countDocuments();
        console.log(`⚠️  --wipe specified (dry-run) would delete ${count} existing elevators.`);
      } else {
        const del = await Elevator.deleteMany({});
        console.log(`🗑️  Deleted ${del.deletedCount} existing elevators (wipe).`);
      }
    }
  }

  let inserted = 0, skipped = 0, errors = 0, duplicates = [];

  for (const block of blocks) {
    if (!block.elevators.length) continue;
    // Fallback brojUgovora: use declared value or first elevator code of block
    const fallbackBrojUgovora = block.brojUgovora || (block.elevators.length ? block.elevators[0] : 'UNKNOWN');
    for (const code of block.elevators) {
      if (mode === 'api') {
        try {
          if (dryRun) { inserted++; continue; }
          const resp = await fetch(apiBase + '/elevators', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({
              brojUgovora: fallbackBrojUgovora,
              nazivStranke: block.nazivStranke || undefined,
              ulica: block.adresa || undefined,
              mjesto: block.mjesto || undefined,
              brojDizala: code,
              kontaktOsoba: {
                imePrezime: block.predstavnik || undefined,
                mobitel: block.mobitel || undefined,
                ulaznaKoda: block.ulaznaKoda || undefined
              },
              napomene: block.notes.length ? block.notes.join('\n') : undefined,
              status: 'aktivan',
              intervalServisa: 1
            })
          });
          if (!resp.ok) {
            let errorText = '';
            try {
              errorText = await resp.text();
            } catch (e) {
              errorText = 'No body';
            }
            errors++;
            console.error('❌ API insert failed', code, `Status: ${resp.status} Body: ${errorText.substring(0,300)}`);
          } else {
            inserted++;
          }
        } catch (e) {
          errors++;
          console.error('❌ API error', code, e.message);
        }
      } else {
        try {
          const existing = await Elevator.findOne({ brojDizala: code }).lean();
          if (existing) {
            skipped++;
            duplicates.push(code);
            continue;
          }
          const doc = new Elevator({
            brojUgovora: fallbackBrojUgovora,
            nazivStranke: block.nazivStranke || undefined,
            ulica: block.adresa || undefined,
            mjesto: block.mjesto || undefined,
            brojDizala: code,
            kontaktOsoba: {
              imePrezime: block.predstavnik || undefined,
              mobitel: block.mobitel || undefined,
              ulaznaKoda: block.ulaznaKoda || undefined,
            },
            napomene: block.notes.length ? block.notes.join('\n') : undefined,
            status: 'aktivan',
            intervalServisa: 1,
          });
          if (dryRun) {
            inserted++;
          } else {
            await doc.save();
            inserted++;
          }
        } catch (e) {
          errors++;
          console.error('❌ Error inserting', code, e.message);
        }
      }
    }
  }

  console.log('==== Import Summary ====');
  console.log('Inserted:', inserted);
  console.log('Skipped (duplicates):', skipped);
  console.log('Errors:', errors);
  if (duplicates.length) console.log('Duplicate codes:', duplicates.join(', '));
  if (dryRun) console.log('Dry run: no documents saved.');

  if (mode === 'mongo') {
    await mongoose.disconnect();
  }
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});

require('dotenv').config();
const mongoose = require('mongoose');

const TARGETS = [
  { name: 'Service', collection: 'services' },
  { name: 'Repair', collection: 'repairs' },
  { name: 'Elevator', collection: 'elevators' },
];

function toObjectId(v) {
  if (!v) return null;
  try { return new mongoose.Types.ObjectId(String(v)); } catch { return null; }
}

function ym(d) {
  if (!d) return 'unknown';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return 'unknown';
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function main() {
  const conn = await mongoose.createConnection(process.env.PROD_MONGODB_URI).asPromise();
  const db = conn.db;
  const audits = db.collection('auditlogs');

  for (const t of TARGETS) {
    const live = db.collection(t.collection);
    const createLogs = await audits.find(
      { entitet: t.name, akcija: 'CREATE' },
      { projection: { entitetId: 1, noveVrijednosti: 1, kreiranDatum: 1 } }
    ).toArray();

    const idToLog = new Map();
    for (const a of createLogs) {
      const id = toObjectId(a.entitetId || a.noveVrijednosti?._id || a.noveVrijednosti?.id);
      if (!id) continue;
      const k = String(id);
      if (!idToLog.has(k)) idToLog.set(k, a);
    }

    const ids = [...idToLog.keys()].map((k) => new mongoose.Types.ObjectId(k));
    const existing = await live.find({ _id: { $in: ids } }, { projection: { _id: 1 } }).toArray();
    const existingSet = new Set(existing.map((d) => String(d._id)));

    const byMonth = new Map();
    for (const [k, a] of idToLog.entries()) {
      if (existingSet.has(k)) continue;
      const m = ym(a.kreiranDatum);
      byMonth.set(m, (byMonth.get(m) || 0) + 1);
    }

    console.log(`\n=== ${t.name} missing from audit by create month ===`);
    [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([m, c]) => {
      console.log(`${m}: ${c}`);
    });
  }

  await conn.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

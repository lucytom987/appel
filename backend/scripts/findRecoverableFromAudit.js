require('dotenv').config();
const mongoose = require('mongoose');

const TARGETS = [
  { name: 'Service', collection: 'services' },
  { name: 'Repair', collection: 'repairs' },
  { name: 'Elevator', collection: 'elevators' },
];

function toObjectId(v) {
  if (!v) return null;
  try {
    return new mongoose.Types.ObjectId(String(v));
  } catch {
    return null;
  }
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

    const createdIds = createLogs
      .map((a) => toObjectId(a.entitetId || a.noveVrijednosti?._id || a.noveVrijednosti?.id))
      .filter(Boolean);

    const unique = new Map();
    createdIds.forEach((id) => unique.set(String(id), id));
    const uniqueIds = [...unique.values()];

    const existingCount = await live.countDocuments({ _id: { $in: uniqueIds } });
    const missingCount = uniqueIds.length - existingCount;

    console.log(`\n=== ${t.name} ===`);
    console.log(`CREATE logs: ${createLogs.length}`);
    console.log(`Unique created IDs from audit: ${uniqueIds.length}`);
    console.log(`Still present in collection: ${existingCount}`);
    console.log(`Missing (potentially recoverable): ${missingCount}`);

    if (missingCount > 0) {
      const existingIds = await live.find({ _id: { $in: uniqueIds } }, { projection: { _id: 1 } }).toArray();
      const existingSet = new Set(existingIds.map((d) => String(d._id)));

      const examples = [];
      for (const a of createLogs) {
        const id = toObjectId(a.entitetId || a.noveVrijednosti?._id || a.noveVrijednosti?.id);
        if (!id) continue;
        if (!existingSet.has(String(id))) {
          examples.push({
            id: String(id),
            createdAt: a.kreiranDatum,
            hasPayload: !!a.noveVrijednosti,
            payloadKeys: a.noveVrijednosti ? Object.keys(a.noveVrijednosti).slice(0, 12) : [],
          });
        }
        if (examples.length >= 5) break;
      }

      console.log('Sample missing IDs from audit:');
      examples.forEach((e) => console.log(JSON.stringify(e)));
    }
  }

  await conn.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

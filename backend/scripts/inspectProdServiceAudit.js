require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const conn = await mongoose.createConnection(process.env.PROD_MONGODB_URI).asPromise();
  const col = conn.db.collection('auditlogs');

  const sample = await col.find({}).sort({ timestamp: -1 }).limit(5).toArray();
  console.log('Sample audit fields:');
  sample.forEach((d, i) => {
    console.log(`--- ${i + 1} ---`);
    console.log(Object.keys(d));
  });

  const serviceRelated = await col.find({
    $or: [
      { entityType: /service/i },
      { targetModel: /service/i },
      { action: /service/i },
      { description: /servis/i },
    ],
  }).sort({ timestamp: -1 }).limit(20).toArray();

  console.log(`\nRecent service-related audit rows: ${serviceRelated.length}`);
  for (const d of serviceRelated) {
    console.log({
      timestamp: d.timestamp || d.createdAt || d.kreiranDatum,
      action: d.action,
      entityType: d.entityType,
      targetModel: d.targetModel,
      description: d.description,
      entityId: d.entityId || d.targetId,
      companyId: d.companyId,
    });
  }

  await conn.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

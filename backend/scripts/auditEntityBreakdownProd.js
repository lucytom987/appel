require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const conn = await mongoose.createConnection(process.env.PROD_MONGODB_URI).asPromise();
  const col = conn.db.collection('auditlogs');

  const topEntities = await col.aggregate([
    { $group: { _id: '$entitet', count: { $sum: 1 }, last: { $max: '$kreiranDatum' } } },
    { $sort: { count: -1 } },
    { $limit: 20 },
  ]).toArray();

  console.log('Top entitet values in prod auditlogs:');
  for (const e of topEntities) {
    console.log(`${e._id}: ${e.count} (last: ${e.last})`);
  }

  const serviceAudits = await col.aggregate([
    { $match: { entitet: { $in: ['servis', 'service', 'services'] } } },
    {
      $group: {
        _id: {
          year: { $year: '$kreiranDatum' },
          month: { $month: '$kreiranDatum' },
          akcija: '$akcija',
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.akcija': 1 } },
  ]).toArray();

  console.log('\nService audit by month/action:');
  for (const r of serviceAudits) {
    console.log(`${r._id.year}-${String(r._id.month).padStart(2, '0')} | ${r._id.akcija} | ${r.count}`);
  }

  await conn.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

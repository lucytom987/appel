require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const conn = await mongoose.createConnection(process.env.PROD_MONGODB_URI).asPromise();
  const col = conn.db.collection('auditlogs');

  const rows = await col.aggregate([
    { $match: { entitet: { $regex: '^service$', $options: 'i' } } },
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

  console.log('Service audit by month/action (prod):');
  for (const r of rows) {
    console.log(`${r._id.year}-${String(r._id.month).padStart(2, '0')} | ${r._id.akcija} | ${r.count}`);
  }

  await conn.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

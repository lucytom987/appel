require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const conn = await mongoose.createConnection(process.env.PROD_MONGODB_URI).asPromise();
  const services = conn.db.collection('services');
  const companyId = new mongoose.Types.ObjectId('69ac8fb55ce0a38500613432');

  const rows = await services.aggregate([
    {
      $match: {
        companyId,
        is_deleted: { $ne: true },
        sljedeciServis: { $type: 'date' },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: '$sljedeciServis' },
          month: { $month: '$sljedeciServis' },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]).toArray();

  console.log('Planned next services by month (from sljedeciServis):');
  for (const r of rows) {
    console.log(`${r._id.year}-${String(r._id.month).padStart(2, '0')}: ${r.count}`);
  }

  await conn.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

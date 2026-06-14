require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function getMonthCounts(conn) {
  return conn.db.collection('services').aggregate([
    {
      $group: {
        _id: {
          year: { $year: '$datum' },
          month: { $month: '$datum' },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]).toArray();
}

function print(label, rows) {
  console.log(`\n${label}`);
  console.log('YYYY-MM | Count');
  console.log('--------|------');
  for (const r of rows) {
    const y = r._id?.year ?? 'null';
    const m = r._id?.month == null ? 'null' : String(r._id.month).padStart(2, '0');
    console.log(`${y}-${m} | ${r.count}`);
  }
  const total = rows.reduce((a, r) => a + r.count, 0);
  console.log(`Total: ${total}`);
}

async function main() {
  const prod = await mongoose.createConnection(process.env.PROD_MONGODB_URI).asPromise();
  const staging = await mongoose.createConnection(process.env.STAGING_MONGODB_URI).asPromise();

  const [prodRows, stagingRows] = await Promise.all([
    getMonthCounts(prod),
    getMonthCounts(staging),
  ]);

  print('Production services by month', prodRows);
  print('Staging services by month', stagingRows);

  await prod.close();
  await staging.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

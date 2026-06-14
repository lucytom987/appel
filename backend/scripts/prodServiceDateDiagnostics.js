require('dotenv').config();
const mongoose = require('mongoose');

async function aggregateByMonth(col, dateExpr, match = {}) {
  return col.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          year: { $year: dateExpr },
          month: { $month: dateExpr },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]).toArray();
}

function print(title, rows) {
  console.log(`\n${title}`);
  for (const r of rows) {
    console.log(`${r._id.year}-${String(r._id.month).padStart(2, '0')}: ${r.count}`);
  }
}

async function main() {
  const conn = await mongoose.createConnection(process.env.PROD_MONGODB_URI).asPromise();
  const services = conn.db.collection('services');
  const companyId = new mongoose.Types.ObjectId('69ac8fb55ce0a38500613432');

  const baseMatch = { companyId, is_deleted: { $ne: true } };

  const byDatum = await aggregateByMonth(services, '$datum', baseMatch);
  const byCreated = await aggregateByMonth(services, '$kreiranDatum', baseMatch);
  const byUpdated = await aggregateByMonth(services, '$updated_at', baseMatch);

  print('By datum', byDatum);
  print('By kreiranDatum', byCreated);
  print('By updated_at', byUpdated);

  await conn.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

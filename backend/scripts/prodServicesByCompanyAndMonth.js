require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  const conn = await mongoose.createConnection(process.env.PROD_MONGODB_URI).asPromise();
  const services = conn.db.collection('services');
  const companies = conn.db.collection('companies');

  const companyMap = new Map();
  const allCompanies = await companies.find({}, { projection: { _id: 1, naziv: 1 } }).toArray();
  allCompanies.forEach((c) => companyMap.set(String(c._id), c.naziv));

  const byCompany = await services.aggregate([
    {
      $group: {
        _id: '$companyId',
        total: { $sum: 1 },
        active: { $sum: { $cond: [{ $eq: ['$is_deleted', true] }, 0, 1] } },
        deleted: { $sum: { $cond: [{ $eq: ['$is_deleted', true] }, 1, 0] } },
      },
    },
    { $sort: { total: -1 } },
  ]).toArray();

  console.log('Services by companyId (production):');
  for (const row of byCompany) {
    const id = row._id ? String(row._id) : 'null/none';
    console.log(`${id} | ${companyMap.get(id) || '(unknown)'} | total=${row.total} active=${row.active} deleted=${row.deleted}`);
  }

  const byMonth = await services.aggregate([
    {
      $group: {
        _id: {
          companyId: '$companyId',
          year: { $year: '$datum' },
          month: { $month: '$datum' },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.companyId': 1, '_id.year': 1, '_id.month': 1 } },
  ]).toArray();

  console.log('\nServices by companyId and month:');
  for (const row of byMonth) {
    const id = row._id.companyId ? String(row._id.companyId) : 'null/none';
    const name = companyMap.get(id) || '(unknown)';
    console.log(`${id} | ${name} | ${row._id.year}-${String(row._id.month).padStart(2, '0')} | ${row.count}`);
  }

  await conn.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

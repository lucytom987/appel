require('dotenv').config();
const mongoose = require('mongoose');
const Service = require('../models/Service');

const companyId = new mongoose.Types.ObjectId('69ac8fb55ce0a38500613432');
const target = (process.argv[2] || 'prod').toLowerCase();
const uri = target === 'staging' ? process.env.STAGING_MONGODB_URI : process.env.PROD_MONGODB_URI;

async function main() {
  await mongoose.connect(uri);

  const rows = await Service.aggregate([
    {
      $match: {
        companyId,
        is_deleted: { $ne: true },
      },
    },
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
  ]);

  console.log(`Aktivni servisi po mjesecu (${target}):`);
  for (const r of rows) {
    console.log(`${r._id.year}-${String(r._id.month).padStart(2, '0')}: ${r.count}`);
  }

  const total = await Service.countDocuments({ companyId, is_deleted: { $ne: true } });
  const deleted = await Service.countDocuments({ companyId, is_deleted: true });
  console.log(`Ukupno aktivnih: ${total}`);
  console.log(`Ukupno obrisanih: ${deleted}`);

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});

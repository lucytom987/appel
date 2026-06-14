require('dotenv').config();
const mongoose = require('mongoose');
const Service = require('../models/Service');

const companyId = new mongoose.Types.ObjectId('69ac8fb55ce0a38500613432');
const mayStart = new Date('2026-05-01T00:00:00.000Z');
const junStart = new Date('2026-06-01T00:00:00.000Z');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const filterMay = { datum: { $gte: mayStart, $lt: junStart } };

  const totals = {
    all: await Service.countDocuments(filterMay),
    company: await Service.countDocuments({ ...filterMay, companyId }),
    companyActive: await Service.countDocuments({ ...filterMay, companyId, is_deleted: { $ne: true } }),
    companyDeleted: await Service.countDocuments({ ...filterMay, companyId, is_deleted: true }),
    noCompanyField: await Service.countDocuments({ ...filterMay, companyId: { $exists: false } }),
    nullCompany: await Service.countDocuments({ ...filterMay, companyId: null }),
  };

  console.log('May service counts:', totals);

  const sample = await Service.find(filterMay)
    .select('_id datum companyId is_deleted elevatorId updated_at')
    .sort({ datum: -1 })
    .limit(10)
    .lean();

  console.log('\nSample May services:');
  for (const s of sample) {
    console.log({
      id: String(s._id),
      datum: s.datum,
      companyId: s.companyId ? String(s.companyId) : null,
      is_deleted: !!s.is_deleted,
      elevatorId: s.elevatorId ? String(s.elevatorId) : null,
      updated_at: s.updated_at,
    });
  }

  const juneCount = await Service.countDocuments({ datum: { $gte: junStart } });
  console.log(`\nJune+ services: ${juneCount}`);

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});

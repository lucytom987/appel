require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const COLLECTIONS = [
  'users',
  'elevators',
  'repairs',
  'services',
  'events',
  'workorders',
  'workordercounters',
  'simcards',
  'chatrooms',
  'messages',
  'auditlogs',
];

async function verify(uri, label) {
  const conn = await mongoose.createConnection(uri).asPromise();
  console.log(`\n=== ${label} ===`);
  const companies = await conn.db.collection('companies').find({}).toArray();
  const companyId = companies[0]?._id;
  for (const coll of COLLECTIONS) {
    const total = await conn.db.collection(coll).countDocuments({});
    if (total === 0) {
      console.log(`  ${coll}: empty`);
      continue;
    }
    const withCompany = await conn.db.collection(coll).countDocuments({ companyId: { $exists: true, $ne: null } });
    const missing = total - withCompany;
    if (missing > 0) {
      console.log(`  ${coll}: ${total} total, ${withCompany} with companyId, ⚠️ ${missing} missing!`);
    } else {
      console.log(`  ${coll}: ${total} total, all have companyId ✓`);
    }
  }
  await conn.close();
}

async function main() {
  await verify(process.env.PROD_MONGODB_URI, 'PRODUCTION');
  await verify(process.env.STAGING_MONGODB_URI, 'STAGING');
  console.log('\n✅ Verification done!');
}

main().catch(e => { console.error(e); process.exit(1); });

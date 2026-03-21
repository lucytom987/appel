require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function fixCounters(uri, label) {
  const conn = await mongoose.createConnection(uri).asPromise();
  console.log(`\n=== ${label} ===`);
  const companies = await conn.db.collection('companies').find({}).toArray();
  if (companies.length !== 1) {
    console.log(`  WARNING: Expected 1 company, found ${companies.length}`);
    await conn.close();
    return;
  }
  const companyId = companies[0]._id;
  const counters = await conn.db.collection('workordercounters').find({}).toArray();
  let updated = 0;
  for (const c of counters) {
    if (!c.companyId) {
      await conn.db.collection('workordercounters').updateOne({ _id: c._id }, { $set: { companyId } });
      updated++;
    }
  }
  console.log(`  workordercounters: ${counters.length} total, ${updated} updated`);
  await conn.close();
}

async function main() {
  await fixCounters(process.env.PROD_MONGODB_URI, 'PRODUCTION');
  await fixCounters(process.env.STAGING_MONGODB_URI, 'STAGING');
  console.log('\n✅ Done!');
}

main().catch(e => { console.error(e); process.exit(1); });

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function fixMissingCompanyId(uri, label) {
  const conn = await mongoose.createConnection(uri).asPromise();
  console.log(`\n=== ${label} ===`);

  // Find the only company
  const companies = await conn.db.collection('companies').find({}).toArray();
  if (companies.length !== 1) {
    console.log(`  WARNING: Expected 1 company, found ${companies.length}`);
    await conn.close();
    return;
  }
  const companyId = companies[0]._id;
  console.log(`  Company: ${companies[0].naziv} (${companyId})`);

  // Collections to fix
  const collections = ['services', 'repairs', 'elevators', 'events', 'workorders', 'simcards'];

  for (const coll of collections) {
    const collection = conn.db.collection(coll);
    
    // Count records missing companyId
    const missingCount = await collection.countDocuments({ 
      $or: [
        { companyId: { $exists: false } },
        { companyId: null }
      ]
    });

    if (missingCount > 0) {
      const result = await collection.updateMany(
        { $or: [{ companyId: { $exists: false } }, { companyId: null }] },
        { $set: { companyId: companyId, updated_at: new Date() } }
      );
      console.log(`  ${coll}: fixed ${result.modifiedCount}/${missingCount} records`);
    } else {
      console.log(`  ${coll}: OK (all have companyId)`);
    }
  }

  // Verify
  console.log(`\n  Verification:`);
  for (const coll of collections) {
    const total = await conn.db.collection(coll).countDocuments({});
    const withCompany = await conn.db.collection(coll).countDocuments({ companyId });
    const missing = total - withCompany;
    console.log(`    ${coll}: ${total} total, ${withCompany} with companyId${missing > 0 ? `, ${missing} STILL MISSING!` : ' ✓'}`);
  }

  await conn.close();
}

async function main() {
  const prodUri = process.env.PROD_MONGODB_URI;
  const stagingUri = process.env.STAGING_MONGODB_URI;

  await fixMissingCompanyId(prodUri, 'PRODUCTION');
  await fixMissingCompanyId(stagingUri, 'STAGING');

  console.log('\n✅ Done!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

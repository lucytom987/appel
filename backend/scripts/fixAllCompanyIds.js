require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function auditAndFix(uri, label) {
  const conn = await mongoose.createConnection(uri).asPromise();
  console.log(`\n=== ${label} ===`);

  const companies = await conn.db.collection('companies').find({}).toArray();
  if (companies.length !== 1) {
    console.log(`  WARNING: Expected 1 company, found ${companies.length}`);
    await conn.close();
    return;
  }
  const companyId = companies[0]._id;
  console.log(`  Company: ${companies[0].naziv} (${companyId})`);

  // ALL collections that could have companyId
  const allCollections = await conn.db.listCollections().toArray();
  const collNames = allCollections.map(c => c.name).filter(n => n !== 'companies' && n !== 'db_version');
  
  console.log(`\n  Collections found: ${collNames.join(', ')}`);

  for (const coll of collNames) {
    const collection = conn.db.collection(coll);
    const total = await collection.countDocuments({});
    if (total === 0) {
      console.log(`  ${coll}: empty`);
      continue;
    }

    // Check sample for companyId field
    const sample = await collection.findOne({});
    const hasCompanyIdField = sample && 'companyId' in sample;

    const withCompany = hasCompanyIdField 
      ? await collection.countDocuments({ companyId: { $ne: null, $exists: true } })
      : 0;
    const missing = total - withCompany;

    if (!hasCompanyIdField) {
      console.log(`  ${coll}: ${total} docs (no companyId field in schema)`);
      continue;
    }

    if (missing > 0) {
      const result = await collection.updateMany(
        { $or: [{ companyId: { $exists: false } }, { companyId: null }] },
        { $set: { companyId: companyId, updated_at: new Date() } }
      );
      console.log(`  ${coll}: ${total} total, FIXED ${result.modifiedCount}/${missing} missing companyId`);
    } else {
      console.log(`  ${coll}: ${total} total, all have companyId ✓`);
    }
  }

  // Final verification
  console.log(`\n  Final counts:`);
  for (const coll of collNames) {
    const total = await conn.db.collection(coll).countDocuments({});
    if (total === 0) continue;
    const sample = await conn.db.collection(coll).findOne({});
    if (!('companyId' in sample)) continue;
    const withCompany = await conn.db.collection(coll).countDocuments({ companyId });
    const without = total - withCompany;
    console.log(`    ${coll}: ${total} total, ${withCompany} with companyId${without > 0 ? `, ⚠️ ${without} MISSING` : ' ✓'}`);
  }

  await conn.close();
}

async function main() {
  await auditAndFix(process.env.PROD_MONGODB_URI, 'PRODUCTION');
  await auditAndFix(process.env.STAGING_MONGODB_URI, 'STAGING');
  console.log('\n✅ Done!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

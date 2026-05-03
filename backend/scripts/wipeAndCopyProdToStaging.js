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

async function main() {
  const prod = await mongoose.createConnection(process.env.PROD_MONGODB_URI).asPromise();
  const staging = await mongoose.createConnection(process.env.STAGING_MONGODB_URI).asPromise();

  // Get companyId from staging (should be only one company)
  const companies = await staging.db.collection('companies').find({}).toArray();
  if (companies.length !== 1) throw new Error('Staging must have exactly one company!');
  const companyId = companies[0]._id;
  console.log('Using companyId:', companyId);

  // 1. Wipe all data in staging (except companies)
  for (const coll of COLLECTIONS) {
    await staging.db.collection(coll).deleteMany({});
    console.log(`Wiped staging collection: ${coll}`);
  }

  // 2. Copy all data from prod to staging, set companyId
  for (const coll of COLLECTIONS) {
    const docs = await prod.db.collection(coll).find({}).toArray();
    if (!docs.length) {
      console.log(`No docs to copy for ${coll}`);
      continue;
    }
    // Patch companyId
    const patched = docs.map(doc => {
      // Always set companyId if field exists or should exist
      if ('companyId' in doc || ['users','elevators','repairs','services','events','workorders','simcards'].includes(coll)) {
        doc.companyId = companyId;
      }
      // Remove _id to let Mongo assign new one, except for users/elevators/repairs/services/workorders
      if (!['users','elevators','repairs','services','workorders'].includes(coll)) {
        delete doc._id;
      }
      return doc;
    });
    if (patched.length) {
      await staging.db.collection(coll).insertMany(patched);
      console.log(`Copied ${patched.length} docs to staging.${coll}`);
    }
  }

  await prod.close();
  await staging.close();
  console.log('\n✅ Staging wiped and copied from production!');
}

main().catch(e => { console.error(e); process.exit(1); });

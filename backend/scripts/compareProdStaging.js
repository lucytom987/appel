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

  console.log('Collection         | Production | Staging');
  console.log('-------------------|------------|--------');
  for (const coll of COLLECTIONS) {
    const prodCount = await prod.db.collection(coll).countDocuments({});
    const stagingCount = await staging.db.collection(coll).countDocuments({});
    console.log(`${coll.padEnd(19)}| ${String(prodCount).padStart(10)} | ${String(stagingCount).padStart(7)}`);
  }

  await prod.close();
  await staging.close();
  console.log('\n✅ Comparison done!');
}

main().catch(e => { console.error(e); process.exit(1); });

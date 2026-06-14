require('dotenv').config();
const mongoose = require('mongoose');

const TARGET_COMPANY_ID = new mongoose.Types.ObjectId('69ac8fb55ce0a38500613432');

async function fixCollection(db, name) {
  const col = db.collection(name);
  const filter = { $or: [{ companyId: null }, { companyId: { $exists: false } }] };

  const before = await col.countDocuments(filter);
  const result = await col.updateMany(filter, { $set: { companyId: TARGET_COMPANY_ID } });
  const after = await col.countDocuments(filter);

  return {
    collection: name,
    before,
    matched: result.matchedCount,
    modified: result.modifiedCount,
    after,
  };
}

async function main() {
  const conn = await mongoose.createConnection(process.env.PROD_MONGODB_URI).asPromise();
  const db = conn.db;

  const collections = ['elevators', 'repairs', 'services', 'workorders', 'users', 'events', 'simcards', 'chatrooms', 'messages'];

  console.log('Fixing null/missing companyId in PRODUCTION...');
  for (const name of collections) {
    const r = await fixCollection(db, name);
    console.log(`${r.collection}: before=${r.before}, matched=${r.matched}, modified=${r.modified}, after=${r.after}`);
  }

  await conn.close();
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

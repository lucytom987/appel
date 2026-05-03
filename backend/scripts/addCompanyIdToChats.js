require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function addCompanyIdToChats(uri, label) {
  const conn = await mongoose.createConnection(uri).asPromise();
  console.log(`\n=== ${label} ===`);

  // Get companyId
  const companies = await conn.db.collection('companies').find({}).toArray();
  if (companies.length !== 1) {
    console.log(`  WARNING: Expected 1 company, found ${companies.length}`);
    await conn.close();
    return;
  }
  const companyId = companies[0]._id;
  console.log(`  Company: ${companies[0].naziv} (${companyId})`);

  // chatrooms
  const chatrooms = await conn.db.collection('chatrooms').find({}).toArray();
  let updatedRooms = 0;
  for (const room of chatrooms) {
    if (!room.companyId) {
      await conn.db.collection('chatrooms').updateOne({ _id: room._id }, { $set: { companyId } });
      updatedRooms++;
    }
  }
  console.log(`  chatrooms: ${chatrooms.length} total, ${updatedRooms} updated`);

  // messages
  const messages = await conn.db.collection('messages').find({}).toArray();
  let updatedMsgs = 0;
  for (const msg of messages) {
    if (!msg.companyId) {
      await conn.db.collection('messages').updateOne({ _id: msg._id }, { $set: { companyId } });
      updatedMsgs++;
    }
  }
  console.log(`  messages: ${messages.length} total, ${updatedMsgs} updated`);

  await conn.close();
}

async function main() {
  await addCompanyIdToChats(process.env.PROD_MONGODB_URI, 'PRODUCTION');
  await addCompanyIdToChats(process.env.STAGING_MONGODB_URI, 'STAGING');
  console.log('\n✅ Done!');
}

main().catch(e => { console.error(e); process.exit(1); });

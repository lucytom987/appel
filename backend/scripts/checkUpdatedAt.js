require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const col = mongoose.connection.collection('services');

  // Provjeri updated_at za april
  const aprilSample = await col.find(
    { datum: { $gte: new Date('2026-04-01'), $lte: new Date('2026-04-30') } },
    { projection: { datum: 1, updated_at: 1, azuriranDatum: 1, kreiranDatum: 1 } }
  ).limit(3).toArray();

  console.log('April uzorak:');
  aprilSample.forEach(s => console.log(JSON.stringify(s)));

  // Provjeri najnoviji updated_at u bazi
  const newest = await col.find({}, { projection: { updated_at: 1, datum: 1 } })
    .sort({ updated_at: -1 }).limit(3).toArray();
  console.log('\nNajnoviji po updated_at:');
  newest.forEach(s => console.log(JSON.stringify(s)));

  mongoose.disconnect();
});

require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const col = mongoose.connection.collection('services');

  const noUpdatedAt = await col.countDocuments({ updated_at: { $exists: false } });
  const withUpdatedAt = await col.countDocuments({ updated_at: { $exists: true } });
  const april = await col.countDocuments({ datum: { $gte: new Date('2026-04-01'), $lte: new Date('2026-04-30') } });
  const aprilNoUpdate = await col.countDocuments({ datum: { $gte: new Date('2026-04-01'), $lte: new Date('2026-04-30') }, updated_at: { $exists: false } });
  const may = await col.countDocuments({ datum: { $gte: new Date('2026-05-01') } });

  console.log('Bez updated_at:', noUpdatedAt);
  console.log('Sa updated_at:', withUpdatedAt);
  console.log('April ukupno:', april);
  console.log('April bez updated_at:', aprilNoUpdate);
  console.log('Svibanj:', may);

  mongoose.disconnect();
});

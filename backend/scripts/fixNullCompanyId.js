require('dotenv').config();
const mongoose = require('mongoose');
const Service = require('../models/Service');
const Repair = require('../models/Repair');
const companyId = new mongoose.Types.ObjectId('69ac8fb55ce0a38500613432');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const sTotal = await Service.countDocuments();
  const sWithId = await Service.countDocuments({ companyId: { $exists: true, $ne: null } });
  const sNull = await Service.countDocuments({ companyId: null });
  const sNoField = await Service.countDocuments({ companyId: { $exists: false } });

  console.log('=== SERVISI ===');
  console.log('Ukupno:', sTotal);
  console.log('Sa companyId:', sWithId);
  console.log('companyId = null:', sNull);
  console.log('companyId ne postoji:', sNoField);

  // Popravi null vrijednosti
  if (sNull > 0) {
    const fix = await Service.updateMany({ companyId: null }, { $set: { companyId } });
    console.log('Popravljeno null →', fix.modifiedCount);
  }

  const rNull = await Repair.countDocuments({ companyId: null });
  if (rNull > 0) {
    const fix = await Repair.updateMany({ companyId: null }, { $set: { companyId } });
    console.log('Repairs popravljeno null →', fix.modifiedCount);
  }

  console.log('✅ Gotovo');
  mongoose.disconnect();
});

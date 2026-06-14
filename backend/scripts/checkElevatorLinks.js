require('dotenv').config();
const mongoose = require('mongoose');
const companyId = new mongoose.Types.ObjectId('69ac8fb55ce0a38500613432');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const col = mongoose.connection.collection('services');
  const elevCol = mongoose.connection.collection('elevators');

  const totalElevators = await elevCol.countDocuments({ companyId });
  const deletedElevators = await elevCol.countDocuments({ companyId, is_deleted: true });

  // Uzmi uzorak servisa iz travnja s elevatorId
  const aprilSample = await col.find(
    { datum: { $gte: new Date('2026-04-01'), $lte: new Date('2026-04-30') } },
    { projection: { elevatorId: 1, datum: 1 } }
  ).limit(3).toArray();

  console.log('Ukupno liftova:', totalElevators);
  console.log('Obrisanih liftova:', deletedElevators);
  console.log('April uzorak (elevatorId):', aprilSample.map(s => ({ elevatorId: s.elevatorId, datum: s.datum })));

  // Provjeri postoji li taj elevator
  if (aprilSample.length > 0) {
    const elev = await elevCol.findOne({ _id: aprilSample[0].elevatorId });
    console.log('Elevator postoji:', !!elev, '| companyId:', elev?.companyId?.toString());
  }

  mongoose.disconnect();
});

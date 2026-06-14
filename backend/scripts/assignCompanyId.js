require('dotenv').config();
const mongoose = require('mongoose');
const Elevator = require('../models/Elevator');
const Repair = require('../models/Repair');
const Service = require('../models/Service');
const WorkOrder = require('../models/WorkOrder');
const User = require('../models/User');

const companyId = new mongoose.Types.ObjectId('69ac8fb55ce0a38500613432');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  console.log('✅ Spojeno na bazu');

  const e = await Elevator.updateMany({ companyId: { $exists: false } }, { $set: { companyId } });
  const r = await Repair.updateMany({ companyId: { $exists: false } }, { $set: { companyId } });
  const s = await Service.updateMany({ companyId: { $exists: false } }, { $set: { companyId } });
  const w = await WorkOrder.updateMany({ companyId: { $exists: false } }, { $set: { companyId } });
  const u = await User.updateMany({ companyId: { $exists: false } }, { $set: { companyId } });

  console.log('Elevators:', e.modifiedCount);
  console.log('Repairs:  ', r.modifiedCount);
  console.log('Services: ', s.modifiedCount);
  console.log('WorkOrders:', w.modifiedCount);
  console.log('Users:    ', u.modifiedCount);
  console.log('✅ Migracija završena');
  mongoose.disconnect();
});

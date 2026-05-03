require('dotenv').config();
const mongoose = require('mongoose');
const Company = require('../models/Company');
const Elevator = require('../models/Elevator');
const Service = require('../models/Service');
const User = require('../models/User');

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const companyName = 'LiftCore Solutions';
  const company = await Company.findOne({ naziv: companyName });
  if (!company) {
    console.error(`Company with naziv "${companyName}" not found. Aborting.`);
    process.exit(1);
  }

  // Find elevators created by the demo script (they use Demo Street X)
  const demoElevators = await Elevator.find({ companyId: company._id, ulica: { $regex: '^Demo Street' } }).select('_id');
  const elevatorIds = demoElevators.map(e => e._id);

  if (elevatorIds.length === 0) {
    console.log('No demo elevators found to delete.');
  } else {
    // Delete services for those elevators
    const delServices = await Service.deleteMany({ companyId: company._id, elevatorId: { $in: elevatorIds } });
    console.log(`Deleted ${delServices.deletedCount || delServices.n || 0} services linked to demo elevators.`);

    // Delete the elevators
    const delElev = await Elevator.deleteMany({ _id: { $in: elevatorIds } });
    console.log(`Deleted ${delElev.deletedCount || delElev.n || 0} demo elevators.`);
  }

  // Remove demo user if exists
  const demoUser = await User.findOne({ companyId: company._id, email: /demo\.serviser\+liftcore/ });
  if (demoUser) {
    await User.deleteOne({ _id: demoUser._id });
    console.log(`Deleted demo user ${demoUser.email}`);
  } else {
    console.log('No demo user found to delete.');
  }

  await mongoose.disconnect();
  console.log('Rollback complete.');
  process.exit(0);
}

main().catch(err => {
  console.error('Rollback error:', err);
  process.exit(1);
});

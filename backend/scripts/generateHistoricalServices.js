require('dotenv').config();
const mongoose = require('mongoose');
const Company = require('../models/Company');
const Elevator = require('../models/Elevator');
const Service = require('../models/Service');
const User = require('../models/User');

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

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

  // Ensure three serviser users exist
  const serviserEmails = [
    `serviser1+liftcore@local.example`,
    `serviser2+liftcore@local.example`,
    `serviser3+liftcore@local.example`
  ];

  const serviserNames = [
    { ime: 'Ivan', prezime: 'Horvat' },
    { ime: 'Marija', prezime: 'Kovač' },
    { ime: 'Petar', prezime: 'Babić' }
  ];

  const servisers = [];
  for (let i = 0; i < serviserEmails.length; i++) {
    let u = await User.findOne({ companyId: company._id, email: serviserEmails[i] });
    if (!u) {
      u = new User({
        companyId: company._id,
        ime: serviserNames[i].ime,
        prezime: serviserNames[i].prezime,
        email: serviserEmails[i],
        lozinka: 'Passw0rd!',
        uloga: 'serviser'
      });
      await u.save();
      console.log(`Created serviser ${u.email}`);
    } else {
      console.log(`Found existing serviser ${u.email}`);
    }
    servisers.push(u);
  }

  // Fetch elevators for company
  const elevators = await Elevator.find({ companyId: company._id }).select('_id nazivStranke ulica mjesto brojDizala');
  if (!elevators.length) {
    console.error('No elevators found for company. Aborting.');
    process.exit(1);
  }

  const today = new Date();
  let createdCount = 0;

  for (const elev of elevators) {
    // For last 6 months (including current month as month 0? Use last 6 full months: 1..6 months ago)
    for (let m = 0; m < 6; m++) {
      const date = new Date(today.getFullYear(), today.getMonth() - m, 1);
      const year = date.getFullYear();
      const month = date.getMonth();
      // days in month
      const days = new Date(year, month + 1, 0).getDate();
      const day = randInt(1, days);
      const hour = randInt(8, 16);
      const minute = randInt(0, 59);
      const serviceDate = new Date(year, month, day, hour, minute);

      // Pick random serviser
      const serviser = servisers[randInt(0, servisers.length - 1)];

      const checklistPool = ['lubrication','ups_check','voice_comm','shaft_cleaning','drive_check','brake_check','cable_inspection'];
      const checklist = checklistPool.map((stavka) => ({ stavka, provjereno: Math.random() > 0.2 ? 1 : 0 }));

      const service = new Service({
        companyId: company._id,
        elevatorId: elev._id,
        serviserID: serviser._id,
        datum: serviceDate,
        checklist,
        imaNedostataka: false,
        napomene: `Historijski servis za ${elev.nazivStranke} (${elev.brojDizala}) - generirano.`
      });

      await service.save();
      createdCount++;
    }
  }

  console.log(`Created ${createdCount} historical service records for ${elevators.length} elevators.`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Error generating historical services:', err);
  process.exit(1);
});

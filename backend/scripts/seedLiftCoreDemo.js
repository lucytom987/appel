/*
  Seed script: create 5 locations with 2 elevators each and one service per elevator
  Usage: node backend/scripts/seedLiftCoreDemo.js
  Make sure MONGODB_URI is set in your environment (or .env in backend/)
*/

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

  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB');

  const companyName = 'LiftCore Solutions';
  const company = await Company.findOne({ naziv: companyName });
  if (!company) {
    console.error(`Company with naziv "${companyName}" not found. Aborting.`);
    process.exit(1);
  }

  // Find a serviser in the company to assign services to. If none, create one.
  let serviser = await User.findOne({ companyId: company._id });
  if (!serviser) {
    console.log('No users found for company — creating demo serviser user');
    serviser = new User({
      companyId: company._id,
      ime: 'Demo',
      prezime: 'Serviser',
      email: `demo.serviser+liftcore@local.example`,
      lozinka: 'Passw0rd!'
    });
    await serviser.save();
  }

  const locations = ['Lokacija 1', 'Lokacija 2', 'Lokacija 3', 'Lokacija 4', 'Lokacija 5'];

  const createdElevators = [];
  for (let i = 0; i < locations.length; i++) {
    const mjesto = locations[i];
    for (let j = 1; j <= 2; j++) {
      const elevatorData = {
        companyId: company._id,
        nazivStranke: `${company.naziv} - ${mjesto}`,
        ulica: `Demo Street ${i + 1}`,
        mjesto,
        brojDizala: String(j),
        tip: 'stambeno',
        kontaktOsoba: {
          imePrezime: 'Kontakt Osoba',
          mobitel: '+38591234567'
        },
        kreiranOd: serviser._id,
        intervalServisa: 3
      };

      const elev = new Elevator(elevatorData);
      await elev.save();
      createdElevators.push(elev);
      console.log(`Created elevator ${elev._id} at ${mjesto} (#${j})`);

      // Create a service record for the new elevator
      const checklistItems = ['lubrication','ups_check','voice_comm','shaft_cleaning','drive_check','brake_check','cable_inspection'];
      const checklist = checklistItems.map(item => ({ stavka: item, provjereno: 1 }));

      const service = new Service({
        companyId: company._id,
        elevatorId: elev._id,
        serviserID: serviser._id,
        datum: new Date(),
        checklist,
        imaNedostataka: false,
        napomene: 'Automatski generirani servis za demo podataka.'
      });
      await service.save();
      console.log(`  Created service ${service._id} for elevator ${elev._id}`);
    }
  }

  console.log(`
  Seed complete: created ${createdElevators.length} elevators and ${createdElevators.length} services for company "${companyName}".`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Error seeding demo data:', err);
  process.exit(1);
});

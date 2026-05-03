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

  let serviser = await User.findOne({ companyId: company._id });
  if (!serviser) {
    serviser = new User({
      companyId: company._id,
      ime: 'Demo',
      prezime: 'Serviser',
      email: `demo.serviser+liftcore@local.example`,
      lozinka: 'Passw0rd!'
    });
    await serviser.save();
  }

  const sites = [
    {
      mjesto: 'Zagreb',
      ulica: 'Ulica grada Vukovara 271',
      naziv: 'Zgrada Centar Vukovar',
      postanski: '10000'
    },
    {
      mjesto: 'Zagreb',
      ulica: 'Ilica 235',
      naziv: 'Ilica Business Tower',
      postanski: '10000'
    },
    {
      mjesto: 'Split',
      ulica: 'Ulica kralja Zvonimira 10',
      naziv: 'Split Plaza',
      postanski: '21000'
    },
    {
      mjesto: 'Rijeka',
      ulica: 'Obala Hrvatskog narodnog preporoda 1',
      naziv: 'Rijeka Waterfront',
      postanski: '51000'
    },
    {
      mjesto: 'Osijek',
      ulica: 'Trg slobode 5',
      naziv: 'Osijek Central',
      postanski: '31000'
    }
  ];

  const created = [];

  for (let s of sites) {
    for (let i = 1; i <= 2; i++) {
      const kontaktIme = ['Marko','Ana','Ivana','Petar','Marija','Luka','Maja','Tomislav'][Math.floor(Math.random()*8)];
      const kontaktPrez = ['Horvat','Kovač','Babić','Marić','Jurić','Novak'][Math.floor(Math.random()*6)];
      const kontakt = `${kontaktIme} ${kontaktPrez}`;

      const elevator = new Elevator({
        companyId: company._id,
        brojUgovora: `UG-${Math.floor(1000 + Math.random()*9000)}`,
        nazivStranke: `${s.naziv} - Lokacija ${i}`,
        ulica: s.ulica,
        mjesto: `${s.mjesto} ${s.postanski}`,
        brojDizala: String(i),
        tip: i % 2 === 0 ? 'privreda' : 'stambeno',
        kontaktOsoba: {
          imePrezime: kontakt,
          mobitel: `+3859${Math.floor(10000000 + Math.random()*89999999)}`,
          email: `${kontaktIme.toLowerCase()}.${kontaktPrez.toLowerCase()}@example.hr`,
          ulaznaKoda: `${Math.floor(1000 + Math.random()*8999)}`
        },
        koordinate: {
          latitude: 45 + Math.random(),
          longitude: 15 + Math.random()
        },
        status: 'aktivan',
        intervalServisa: 6,
        zadnjiServis: new Date(new Date().setMonth(new Date().getMonth() - Math.floor(Math.random()*12))),
        napomene: 'Demo zapis s hrvatskom adresom i kontaktom.'
      });

      await elevator.save();

      const checklistItems = ['lubrication','ups_check','voice_comm','shaft_cleaning','drive_check','brake_check','cable_inspection'];
      const checklist = checklistItems.map((stavka, idx) => ({ stavka, provjereno: idx % 2 === 0 ? 1 : 0 }));

      const service = new Service({
        companyId: company._id,
        elevatorId: elevator._id,
        serviserID: serviser._id,
        datum: new Date(),
        checklist,
        imaNedostataka: false,
        napomene: 'Automatski generiran servis (HR demo).'
      });

      await service.save();

      created.push({ elevator: elevator._id, service: service._id, mjesto: s.mjesto });
      console.log(`Created elevator ${elevator._id} (${s.mjesto}) and service ${service._id}`);
    }
  }

  console.log(`Seed complete: created ${created.length} elevators/services with Croatian details.`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

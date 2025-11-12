// Skripta za kreiranje admin korisnika
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

async function createAdminUser() {
  try {
    // Spoji se na MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB povezan');

    // Provjeri postoji li već admin
    const existingAdmin = await User.findOne({ email: 'admin@appel.com' });
    if (existingAdmin) {
      console.log('⚠️ Admin korisnik već postoji');
      process.exit(0);
    }

    // Hash lozinke
    const hashedPassword = await bcrypt.hash('admin123', 10);

    // Kreiraj admin korisnika
    const admin = new User({
      ime: 'Admin',
      prezime: 'Appel',
      email: 'admin@appel.com',
      lozinka: hashedPassword,
      uloga: 'admin',
      telefon: '+385 91 234 5678',
      aktivan: true,
    });

    await admin.save();
    console.log('✅ Admin korisnik kreiran');
    console.log('   Email: admin@appel.com');
    console.log('   Lozinka: admin123');

    // Kreiraj i test tehničara
    const hashedTechPassword = await bcrypt.hash('tech123', 10);
    const technician = new User({
      ime: 'Marko',
      prezime: 'Horvat',
      email: 'marko@appel.com',
      lozinka: hashedTechPassword,
      uloga: 'technician',
      telefon: '+385 91 111 2222',
      aktivan: true,
    });

    await technician.save();
    console.log('✅ Tehničar kreiran');
    console.log('   Email: marko@appel.com');
    console.log('   Lozinka: tech123');

    process.exit(0);
  } catch (error) {
    console.error('❌ Greška:', error);
    process.exit(1);
  }
}

createAdminUser();

const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

async function testLogin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB povezan');

    const User = require('../models/User');

    // Pronađi admin korisnika
    const user = await User.findOne({ email: 'vidacek@appel.com' });
    
    if (!user) {
      console.log('❌ Korisnik ne postoji!');
      process.exit(1);
    }

    console.log('✅ Korisnik pronađen:', {
      _id: user._id,
      email: user.email,
      aktivan: user.aktivan,
      uloga: user.uloga
    });

    // Testiraj različite varijante lozinke
    const testPasswords = [
      'vidacek123',
      'vidacek123 ',
      ' vidacek123',
      'Vidacek123',
    ];

    for (const pwd of testPasswords) {
      const valid = await user.provjeriLozinku(pwd);
      console.log(`Lozinka "${pwd}" (length: ${pwd.length}):`, valid ? '✅ VALID' : '❌ INVALID');
    }

    // Debug: Provjeri exact tip podataka koje backend prima
    console.log('\n📥 Simuliram login request:');
    const loginData = {
      email: 'vidacek@appel.com',
      lozinka: 'vidacek123'
    };
    console.log('Request body:', loginData);
    console.log('Email type:', typeof loginData.email);
    console.log('Lozinka type:', typeof loginData.lozinka);
    console.log('Lozinka length:', loginData.lozinka.length);

    const isValid = await user.provjeriLozinku(loginData.lozinka);
    console.log('Result:', isValid ? '✅ SUCCESS' : '❌ FAILED');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Greška:', error);
    process.exit(1);
  }
}

testLogin();

// Skripta za kreiranje test korisnika
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

async function createTestUser() {
  try {
    // Spoji se na MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB povezan');

    // Izlistaj sve korisnike
    const users = await User.find({});
    console.log('\n📋 Trenutni korisnici u bazi:');
    users.forEach(user => {
      console.log(`   - ${user.email} (${user.uloga}) - aktivan: ${user.aktivan}`);
    });

    // Kreiraj test korisnika
    const testEmail = 'test@appel.com';
    const existingTest = await User.findOne({ email: testEmail });
    
    if (existingTest) {
      console.log(`\n⚠️ Korisnik ${testEmail} već postoji - brisem i kreiram novog`);
      await User.deleteOne({ email: testEmail });
    }

    const hashedPassword = await bcrypt.hash('test123', 10);
    const testUser = new User({
      ime: 'Test',
      prezime: 'User',
      email: testEmail,
      lozinka: hashedPassword,
      uloga: 'admin',
      telefon: '+385 99 999 9999',
      aktivan: true,
    });

    await testUser.save();
    console.log(`\n✅ Test korisnik kreiran:`);
    console.log(`   Email: ${testEmail}`);
    console.log(`   Lozinka: test123`);
    console.log(`   Uloga: admin`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Greška:', error);
    process.exit(1);
  }
}

createTestUser();

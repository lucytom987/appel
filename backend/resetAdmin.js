// Skripta za reset admin lozinke
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

async function resetAdminPassword() {
  try {
    // Spoji se na MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB povezan');

    // Pronađi admin korisnika
    const admin = await User.findOne({ email: 'admin@appel.com' });
    
    if (!admin) {
      console.log('⚠️ Admin korisnik ne postoji - kreiram novog');
      
      // Hash lozinke
      const hashedPassword = await bcrypt.hash('admin123', 10);

      // Kreiraj admin korisnika
      const newAdmin = new User({
        ime: 'Admin',
        prezime: 'Appel',
        email: 'admin@appel.com',
        lozinka: hashedPassword,
        uloga: 'admin',
        telefon: '+385 91 234 5678',
        aktivan: true,
      });

      await newAdmin.save();
      console.log('✅ Admin korisnik kreiran');
      console.log('   Email: admin@appel.com');
      console.log('   Lozinka: admin123');
    } else {
      console.log('📝 Admin korisnik pronađen - resetiram lozinku');
      
      // Postavi novu lozinku - pre('save') hook će je automatski hash-irati
      admin.lozinka = 'admin123'; // NE hash-iraj ručno!
      admin.aktivan = true;
      await admin.save();
      
      console.log('✅ Lozinka resetirana');
      console.log('   Email: admin@appel.com');
      console.log('   Nova lozinka: admin123');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Greška:', error);
    process.exit(1);
  }
}

resetAdminPassword();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config();

async function resetAdminPassword() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB povezan');

    // Import User model NAKON konektovanja
    const User = require('../models/User');

    // Pronađi admin korisnika
    const admin = await User.findOne({ email: 'vidacek@appel.com' });
    
    if (!admin) {
      console.log('❌ Admin korisnik NE POSTOJI. Kreiram novog...');
      const newAdmin = new User({
        ime: 'Tomislav',
        prezime: 'Vidacek',
        email: 'vidacek@appel.com',
        lozinka: 'vidacek123',
        uloga: 'admin',
        telefon: '0987654321',
        aktivan: true
      });
      await newAdmin.save();
      console.log('✅ Novi admin kreiran sa lozinkom: vidacek123');
    } else {
      console.log('✅ Admin korisnik pronađen:', {
        _id: admin._id,
        email: admin.email,
        ime: admin.ime,
        prezime: admin.prezime,
        uloga: admin.uloga,
        aktivan: admin.aktivan
      });

      // Testiraj trenutnu lozinku
      console.log('\n🔍 Testiram trenutnu lozinku...');
      const currentPasswordValid = await admin.provjeriLozinku('vidacek123');
      console.log('Trenutna lozinka "vidacek123" validna:', currentPasswordValid);

      if (!currentPasswordValid) {
        console.log('\n🔄 Resetiram lozinku na "vidacek123"...');
        admin.lozinka = 'vidacek123';
        await admin.save(); // pre('save') hook će hashirati
        console.log('✅ Lozinka resetirana!');

        // Testiraj ponovo
        const updatedAdmin = await User.findById(admin._id);
        const newPasswordValid = await updatedAdmin.provjeriLozinku('vidacek123');
        console.log('Nova lozinka "vidacek123" validna:', newPasswordValid);
      } else {
        console.log('✅ Lozinka je već ispravna - NE TREBA reset');
      }
    }

    await mongoose.disconnect();
    console.log('\n✅ Gotovo!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Greška:', error);
    process.exit(1);
  }
}

resetAdminPassword();

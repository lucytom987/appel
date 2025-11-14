require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

/**
 * Obriši sve stare korisnike iz baze (pokreni samo jednom)
 */
async function deleteOldUsers() {
  try {
    console.log('🔄 Povezujem se na MongoDB Atlas...');
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Konekcija uspostavljena');

    // Obriši sve korisnike
    const result = await User.deleteMany({});
    console.log(`🗑️  Obrisano ${result.deletedCount} korisnika`);

    // Kreiraj novog admina
    const admin = new User({
      ime: 'Tomislav',
      prezime: 'Vidacek',
      email: 'vidacek@appel.com',
      lozinka: 'vidacek123',
      uloga: 'admin',
      telefon: '0987654321',
      aktivan: true
    });

    await admin.save();
    console.log('✅ Novi admin je kreiran: vidacek@appel.com / vidacek123');

    process.exit(0);
  } catch (error) {
    console.error('❌ Greška:', error.message);
    process.exit(1);
  }
}

deleteOldUsers();

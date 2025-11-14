require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

/**
 * Obriši sve korisnike iz baze
 */
async function cleanDatabase() {
  try {
    console.log('🔄 Povezujem se na MongoDB...');
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Konekcija sa MongoDB-om uspostavljena');

    const deletedCount = await User.deleteMany({});
    console.log(`🗑️  Obrisano ${deletedCount.deletedCount} korisnika`);

    console.log('✅ Baza je očišćena');
    process.exit(0);
  } catch (error) {
    console.error('❌ Greška:', error.message);
    process.exit(1);
  }
}

cleanDatabase();

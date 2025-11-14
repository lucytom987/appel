const User = require('../models/User');

/**
 * Inicijaliziraj default admin korisnika ako ne postoji
 */
async function seedDefaultUsers() {
  try {
    // Obriši sve stare korisnike
    await User.deleteMany({});
    console.log('🗑️  Stari korisnici obrisani');

    // Kreiraj novi admin
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
    console.log('✅ Admin korisnik je kreiran (vidacek@appel.com / vidacek123)');
  } catch (error) {
    console.error('❌ Greška pri seeding-u korisnika:', error.message);
  }
}

module.exports = seedDefaultUsers;

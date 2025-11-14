const User = require('./models/User');

/**
 * Inicijaliziraj default admin korisnika ako ne postoji
 */
async function seedDefaultUsers() {
  try {
    // Provjeri da li admin postoji
    const existingAdmin = await User.findOne({ email: 'admin@appel.com' });
    if (existingAdmin) {
      console.log('✅ Default admin korisnik već postoji');
      return;
    }

    // Kreiraj default admin
    const admin = new User({
      ime: 'Administrator',
      prezime: 'Aplikacije',
      email: 'admin@appel.com',
      lozinka: 'admin123',
      uloga: 'admin',
      telefon: '+385 1 0000 0000',
      aktivan: true
    });

    await admin.save();
    console.log('✅ Default admin korisnik je kreiran (admin@appel.com / admin123)');

    // Kreiraj demo menadžer
    const menadzer = new User({
      ime: 'Marko',
      prezime: 'Menadžer',
      email: 'menadzer@appel.com',
      lozinka: 'menadzer123',
      uloga: 'menadzer',
      telefon: '+385 1 1111 1111',
      aktivan: true
    });

    await menadzer.save();
    console.log('✅ Demo menadžer je kreiran (menadzer@appel.com / menadzer123)');

    // Kreiraj demo serviser
    const serviser = new User({
      ime: 'Ivan',
      prezime: 'Serviser',
      email: 'serviser@appel.com',
      lozinka: 'serviser123',
      uloga: 'serviser',
      telefon: '+385 1 2222 2222',
      aktivan: true
    });

    await serviser.save();
    console.log('✅ Demo serviser je kreiran (serviser@appel.com / serviser123)');
  } catch (error) {
    console.error('❌ Greška pri seeding-u korisnika:', error.message);
  }
}

module.exports = seedDefaultUsers;

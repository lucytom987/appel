const User = require('../models/User');
const Company = require('../models/Company');

/**
 * Inicijaliziraj default company i admin korisnika ako ne postoje
 */
async function seedDefaultUsers() {
  try {
    // Kreiraj default company ako ne postoji
    let defaultCompany = await Company.findOne({ naziv: 'APPEL SERVICE d.o.o.' });
    if (!defaultCompany) {
      defaultCompany = new Company({
        naziv: 'APPEL SERVICE d.o.o.',
        adresa: 'Varaždin, Hrvatska',
        oib: '12345678901',
        telefon: '+385 91 000 0000',
        email: 'info@appel.hr',
      });
      await defaultCompany.save();
      console.log('✅ Default company je kreiran');
    }

    // Provjeri da li admin već postoji
    const existingAdmin = await User.findOne({ email: 'vidacek@appel.com' });
    if (existingAdmin) {
      console.log('✅ Admin korisnik već postoji');
      return;
    }

    // Kreiraj novi admin samo ako ne postoji
    const admin = new User({
      ime: 'Tomislav',
      prezime: 'Vidacek',
      email: 'vidacek@appel.com',
      lozinka: 'vidacek123',
      uloga: 'admin',
      telefon: '0987654321',
      aktivan: true,
      companyId: defaultCompany._id,
    });

    await admin.save();
    console.log('✅ Admin korisnik je kreiran (vidacek@appel.com / vidacek123)');
  } catch (error) {
    console.error('❌ Greška pri seeding-u korisnika:', error.message);
  }
}

module.exports = seedDefaultUsers;

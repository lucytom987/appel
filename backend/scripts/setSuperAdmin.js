/**
 * Skripta za postavljanje superAdmin flaga na korisnika.
 * 
 * Korištenje:
 *   node scripts/setSuperAdmin.js <email>
 * 
 * Primjer:
 *   node scripts/setSuperAdmin.js admin@example.com
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const User = require('../models/User');

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Korištenje: node scripts/setSuperAdmin.js <email>');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Spojeno na MongoDB');

  const user = await User.findOne({ email });
  if (!user) {
    console.error(`❌ Korisnik s emailom "${email}" nije pronađen`);
    process.exit(1);
  }

  user.superAdmin = true;
  await user.save();

  console.log(`✅ Korisnik ${user.ime} ${user.prezime} (${email}) je sada superAdmin`);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Greška:', err);
  process.exit(1);
});

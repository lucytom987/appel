require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function check() {
  const prod = await mongoose.createConnection(process.env.PROD_MONGODB_URI).asPromise();
  const staging = await mongoose.createConnection(process.env.STAGING_MONGODB_URI).asPromise();

  const start = new Date('2026-03-01T00:00:00.000Z');
  const end = new Date('2026-04-01T00:00:00.000Z');

  const prodMarch = await prod.db.collection('services').countDocuments({ datum: { $gte: start, $lt: end } });
  const stagMarch = await staging.db.collection('services').countDocuments({ datum: { $gte: start, $lt: end } });

  console.log('Servisi u ozujku 2026 (svi):');
  console.log('  Produkcija:', prodMarch);
  console.log('  Staging:   ', stagMarch);

  const prodMarchActive = await prod.db.collection('services').countDocuments({ datum: { $gte: start, $lt: end }, is_deleted: { $ne: true } });
  const stagMarchActive = await staging.db.collection('services').countDocuments({ datum: { $gte: start, $lt: end }, is_deleted: { $ne: true } });

  console.log('\nServisi u ozujku 2026 (aktivni, bez obrisanih):');
  console.log('  Produkcija:', prodMarchActive);
  console.log('  Staging:   ', stagMarchActive);

  // Provjeri produkciju ukupno sada vs u trenutku migracije
  const prodTotal = await prod.db.collection('services').countDocuments();
  const stagTotal = await staging.db.collection('services').countDocuments();
  console.log('\nUkupno servisa:');
  console.log('  Produkcija:', prodTotal);
  console.log('  Staging:   ', stagTotal);

  // Razlika - mozda su novi servisi dodani u produkciji nakon migracije
  if (prodTotal > stagTotal) {
    console.log('\n⚠️  Produkcija ima ' + (prodTotal - stagTotal) + ' vise servisa nego staging!');
    console.log('   To znaci da su novi servisi dodani u produkciji NAKON sto smo kopirali.');

    // Nadji najnoviji servis u stagingu
    const lastStaging = await staging.db.collection('services').find({}).sort({ kreiranDatum: -1 }).limit(1).toArray();
    if (lastStaging.length > 0) {
      console.log('   Zadnji servis u stagingu: ' + (lastStaging[0].kreiranDatum || lastStaging[0].datum));
    }

    // Nadji servise u produkciji novije od toga
    if (lastStaging.length > 0 && lastStaging[0].kreiranDatum) {
      const newerCount = await prod.db.collection('services').countDocuments({ kreiranDatum: { $gt: lastStaging[0].kreiranDatum } });
      console.log('   Servisa u produkciji novijih od zadnjeg u stagingu: ' + newerCount);
    }
  }

  await prod.close();
  await staging.close();
  process.exit(0);
}
check();

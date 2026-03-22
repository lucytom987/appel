/**
 * Kopira SVE podatke iz produkcijske baze u staging bazu.
 * Produkcija se NE DIRA (samo čitanje).
 * 
 * Korištenje:
 *   node scripts/copyProdToStaging.js
 * 
 * Potrebne env varijable (ili ih postavi u .env):
 *   PROD_MONGODB_URI  - connection string za produkcijsku bazu
 *   STAGING_MONGODB_URI - connection string za staging bazu
 * 
 * Ako STAGING_MONGODB_URI nije postavljeno, koristi se MONGODB_URI iz .env
 * kao staging (jer lokalni .env obično pokazuje na dev/staging bazu).
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

// URI-ji za obje baze
const PROD_URI = process.env.PROD_MONGODB_URI;
const STAGING_URI = process.env.STAGING_MONGODB_URI || process.env.MONGODB_URI;

if (!PROD_URI || !STAGING_URI) {
  console.error('❌ Potrebni su PROD_MONGODB_URI i STAGING_MONGODB_URI (ili MONGODB_URI)');
  console.error('   Postavi ih u .env ili kao environment varijable');
  process.exit(1);
}

if (PROD_URI === STAGING_URI) {
  console.error('❌ PROD_MONGODB_URI i STAGING_MONGODB_URI su isti! To bi obrisalo produkciju!');
  process.exit(1);
}

// Kolekcije za kopiranje (redom zbog zavisnosti)
const COLLECTIONS = [
  'companies',
  'users',
  'elevators',
  'repairs',
  'services',
  'events',
  'workorders',
  'workordercounters',
  'simcards',
  'chatrooms',
  'messages',
  // Audit logove ne kopiramo - kreću ispočetka
];

async function copyProdToStaging() {
  let prodConn, stagingConn;

  try {
    console.log('🔗 Spajam se na PRODUKCIJU (samo čitanje)...');
    prodConn = await mongoose.createConnection(PROD_URI).asPromise();
    console.log('✅ Spojeno na produkciju');

    console.log('🔗 Spajam se na STAGING...');
    stagingConn = await mongoose.createConnection(STAGING_URI).asPromise();
    console.log('✅ Spojeno na staging');

    // Ispis baza za potvrdu
    console.log(`\n📦 Produkcija: ${prodConn.db.databaseName}`);
    console.log(`📦 Staging:    ${stagingConn.db.databaseName}\n`);

    let totalCopied = 0;

    for (const collName of COLLECTIONS) {
      const prodColl = prodConn.db.collection(collName);
      const stagingColl = stagingConn.db.collection(collName);

      // Dohvati sve dokumente iz produkcije
      const docs = await prodColl.find({}).toArray();
      
      if (docs.length === 0) {
        console.log(`⏭️  ${collName}: prazna kolekcija, preskačem`);
        continue;
      }

      // Obriši postojeće u stagingu (da ne bude duplikata)
      const deleteResult = await stagingColl.deleteMany({});
      if (deleteResult.deletedCount > 0) {
        console.log(`🗑️  ${collName}: obrisano ${deleteResult.deletedCount} starih dokumenata iz staginga`);
      }

      // Ubaci sve iz produkcije u staging
      const insertResult = await stagingColl.insertMany(docs, { ordered: false });
      console.log(`✅ ${collName}: kopirano ${insertResult.insertedCount} dokumenata`);
      totalCopied += insertResult.insertedCount;
    }

    // Kopiraj i indekse za ključne kolekcije
    console.log('\n📋 Kopiram indekse...');
    for (const collName of COLLECTIONS) {
      try {
        const prodColl = prodConn.db.collection(collName);
        const indexes = await prodColl.indexes();
        const stagingColl = stagingConn.db.collection(collName);
        
        for (const idx of indexes) {
          if (idx.name === '_id_') continue; // _id index je automatski
          try {
            const { key, ...options } = idx;
            delete options.v;
            delete options.ns;
            await stagingColl.createIndex(key, options);
          } catch (idxErr) {
            // Index možda već postoji - OK
          }
        }
      } catch (err) {
        // Neke kolekcije možda nemaju indekse
      }
    }

    console.log(`\n🎉 GOTOVO! Ukupno kopirano: ${totalCopied} dokumenata`);
    console.log('📌 Produkcija je NETAKNUTA (samo čitanje)');
    console.log('📌 Staging sada ima iste podatke kao produkcija\n');

    // Provjeri postoji li Company s postavkama
    const companyColl = stagingConn.db.collection('companies');
    const companies = await companyColl.find({}).toArray();
    console.log(`📊 Firme u stagingu: ${companies.length}`);
    for (const c of companies) {
      const userColl = stagingConn.db.collection('users');
      const elevColl = stagingConn.db.collection('elevators');
      const [userCount, elevCount] = await Promise.all([
        userColl.countDocuments({ companyId: c._id }),
        elevColl.countDocuments({ companyId: c._id }),
      ]);
      console.log(`   📁 "${c.naziv}" — ${userCount} korisnika, ${elevCount} dizala`);
      
      if (!c.adresa && !c.oib) {
        console.log(`   ⚠️  Firma "${c.naziv}" nema popunjene postavke (adresa, OIB) - popuni ih u aplikaciji`);
      }
    }

  } catch (error) {
    console.error('❌ Greška pri migraciji:', error.message);
  } finally {
    if (prodConn) await prodConn.close();
    if (stagingConn) await stagingConn.close();
    process.exit(0);
  }
}

copyProdToStaging();

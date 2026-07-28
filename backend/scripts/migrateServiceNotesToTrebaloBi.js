require('dotenv').config();
const mongoose = require('mongoose');
const Service = require('../models/Service');
const Repair = require('../models/Repair');

const args = process.argv.slice(2);
const applyMode = args.includes('--apply');
const useProd = args.includes('--prod');
const companyArg = args.find((a) => a.startsWith('--companyId='));
const companyId = companyArg ? companyArg.split('=')[1] : null;

const MIGRATION_SOURCE = 'service_notes_to_trebalo_bi_v1';

const normalizeText = (value) => String(value || '').trim();

async function run() {
  const mongoUri = useProd ? process.env.PROD_MONGODB_URI : process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error(useProd ? 'PROD_MONGODB_URI nije postavljen.' : 'MONGODB_URI nije postavljen.');
  }

  await mongoose.connect(mongoUri);
  try {
    const parsed = new URL(mongoUri);
    const dbName = (parsed.pathname || '').replace(/^\//, '') || '<unknown>';
    console.log(`🎯 Ciljana baza: ${useProd ? 'PRODUCTION' : 'DEFAULT'} (${dbName})`);
  } catch (_) {
    console.log(`🎯 Ciljana baza: ${useProd ? 'PRODUCTION' : 'DEFAULT'}`);
  }
  console.log('✅ Spojeno na bazu');
  console.log(applyMode
    ? '⚠️ APPLY MODE: migracija će upisivati promjene.'
    : '🧪 DRY RUN MODE: bez upisa u bazu (dodaj --apply za stvarne promjene).');

  const query = {
    is_deleted: { $ne: true },
    napomene: { $exists: true, $nin: [null, ''] },
  };

  if (companyId) {
    query.companyId = new mongoose.Types.ObjectId(companyId);
  }

  const services = await Service.find(query)
    .select('_id companyId elevatorId serviserID datum napomene')
    .lean();

  let scanned = 0;
  let skippedEmpty = 0;
  let skippedInvalid = 0;
  let skippedExists = 0;
  let created = 0;
  let cleared = 0;

  for (const svc of services) {
    scanned += 1;
    const note = normalizeText(svc.napomene);
    if (!note) {
      skippedEmpty += 1;
      continue;
    }

    if (!svc.companyId || !svc.elevatorId || !svc.serviserID) {
      skippedInvalid += 1;
      continue;
    }

    const existing = await Repair.findOne({
      sourceServiceId: svc._id,
      migrationSource: MIGRATION_SOURCE,
      is_deleted: { $ne: true },
    })
      .select('_id')
      .lean();

    const shouldCreateRepair = !existing;
    if (!shouldCreateRepair) {
      skippedExists += 1;
    }

    if (applyMode) {
      if (shouldCreateRepair) {
        await Repair.create({
          companyId: svc.companyId,
          elevatorId: svc.elevatorId,
          serviserID: svc.serviserID,
          datumPrijave: svc.datum || new Date(),
          datumPopravka: null,
          opisKvara: note,
          opisPopravka: '',
          status: 'pending',
          trebaloBi: true,
          radniNalogPotpisan: false,
          popravkaUPotpunosti: false,
          napomene: '',
          sourceServiceId: svc._id,
          migrationSource: MIGRATION_SOURCE,
          kreiranDatum: new Date(),
          azuriranDatum: new Date(),
          updated_at: new Date(),
        });
        created += 1;
      }

      await Service.updateOne(
        { _id: svc._id },
        {
          $set: {
            napomene: '',
            azuriranDatum: new Date(),
            updated_at: new Date(),
          },
        }
      );
      cleared += 1;
    } else {
      if (shouldCreateRepair) created += 1;
      cleared += 1;
    }
  }

  console.log('');
  console.log('=== SAŽETAK MIGRACIJE ===');
  console.log('Ukupno kandidata (services):', services.length);
  console.log('Skenirano:', scanned);
  console.log('Prazna napomena (skip):', skippedEmpty);
  console.log('Neispravan servis (skip):', skippedInvalid);
  console.log('Već migrirano (skip create):', skippedExists);
  console.log(applyMode ? 'Kreirano TrebaloBi zapisa:' : 'Kreiralo bi TrebaloBi zapisa:', created);
  console.log(applyMode ? 'Očišćeno napomena u servisima:' : 'Očistilo bi napomena u servisima:', cleared);

  if (!applyMode) {
    console.log('');
    console.log('Pokreni sa --apply za stvarnu migraciju.');
    if (!companyId) {
      console.log('Opcionalno: --companyId=<ObjectId> za migraciju samo jedne firme.');
    }
  }
}

run()
  .catch((err) => {
    console.error('❌ Greška migracije:', err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
      console.log('🔌 MongoDB disconnect');
    } catch (_) {
      // no-op
    }
  });

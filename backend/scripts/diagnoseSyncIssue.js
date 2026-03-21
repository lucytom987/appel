require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Service = require('../models/Service');
const Elevator = require('../models/Elevator');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to:', process.env.MONGODB_URI.replace(/\/\/.*@/, '//***@'));

  // Company check
  const companies = await mongoose.connection.db.collection('companies').find({}).toArray();
  console.log('\n=== COMPANIES ===');
  companies.forEach(c => console.log(`  ${c._id} - ${c.naziv}`));
  const companyId = companies[0]?._id;

  // Total counts
  const totalServices = await Service.countDocuments({});
  const activeServices = await Service.countDocuments({ is_deleted: { $ne: true } });
  const companyServices = await Service.countDocuments({ companyId });
  const companyActiveServices = await Service.countDocuments({ companyId, is_deleted: { $ne: true } });
  
  console.log('\n=== SERVICES ===');
  console.log(`Total (all):        ${totalServices}`);
  console.log(`Active (all):       ${activeServices}`);
  console.log(`Total (company):    ${companyServices}`);
  console.log(`Active (company):   ${companyActiveServices}`);

  // March 2026 services
  const marchStart = new Date(2026, 2, 1);
  const marchEnd = new Date(2026, 3, 0, 23, 59, 59);
  const marchAll = await Service.countDocuments({ companyId, datum: { $gte: marchStart, $lte: marchEnd } });
  const marchActive = await Service.countDocuments({ companyId, is_deleted: { $ne: true }, datum: { $gte: marchStart, $lte: marchEnd } });
  
  console.log(`\nMarch 2026 (all):   ${marchAll}`);
  console.log(`March 2026 (active): ${marchActive}`);

  // Unique elevators serviced in March
  const marchElevatorIds = await Service.distinct('elevatorId', { 
    companyId, 
    is_deleted: { $ne: true }, 
    datum: { $gte: marchStart, $lte: marchEnd } 
  });
  console.log(`March unique elevators: ${marchElevatorIds.length}`);

  // Active elevators
  const activeElevators = await Elevator.countDocuments({ companyId, status: 'aktivan', is_deleted: { $ne: true } });
  console.log(`Active elevators: ${activeElevators}`);

  // Check updated_at coverage
  const withUpdatedAt = await Service.countDocuments({ companyId, updated_at: { $exists: true } });
  const withoutUpdatedAt = await Service.countDocuments({ companyId, updated_at: { $exists: false } });
  console.log(`\n=== updated_at field ===`);
  console.log(`Has updated_at:     ${withUpdatedAt}`);
  console.log(`Missing updated_at: ${withoutUpdatedAt}`);

  // Simulate what the backend returns for full sync (no updatedAfter, includeDeleted=true)
  const filter = { companyId };
  let page = 0;
  let fetched = 0;
  const limit = 200;
  let totalReported = 0;
  
  console.log(`\n=== PAGINATION SIMULATION ===`);
  do {
    const skip = page * limit;
    const docs = await Service.find(filter).sort({ datum: -1 }).skip(skip).limit(limit).lean();
    const total = await Service.countDocuments(filter);
    totalReported = total;
    console.log(`  Page ${page}: skip=${skip}, got=${docs.length}, total=${total}`);
    fetched += docs.length;
    page++;
    if (docs.length === 0) break;
  } while (fetched < totalReported);
  
  console.log(`  Total fetched: ${fetched}`);

  // Check if any services have null/missing companyId
  const noCompany = await Service.countDocuments({ companyId: { $exists: false } });
  const nullCompany = await Service.countDocuments({ companyId: null });
  console.log(`\n=== companyId issues ===`);
  console.log(`Missing companyId:  ${noCompany}`);
  console.log(`Null companyId:     ${nullCompany}`);

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });

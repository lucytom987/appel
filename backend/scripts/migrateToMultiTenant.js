require('dotenv').config();
const mongoose = require('mongoose');
const Company = require('../models/Company');
const User = require('../models/User');
const Elevator = require('../models/Elevator');
const Repair = require('../models/Repair');
const Service = require('../models/Service');
const WorkOrder = require('../models/WorkOrder');

async function migrate() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // 1. Kreirati default Company
    console.log('\n📦 Creating default company...');
    let defaultCompany = await Company.findOne({ naziv: 'Default Company' });
    
    if (!defaultCompany) {
      defaultCompany = await Company.create({
        naziv: 'Default Company',
        adresa: '',
        oib: '',
        email: '',
        mobitel: '',
        web: '',
      });
      console.log(`✅ Created default company: ${defaultCompany._id}`);
    } else {
      console.log(`✅ Default company already exists: ${defaultCompany._id}`);
    }

    const companyId = defaultCompany._id;

    // 2. Dodaj companyId svim userima koji ga nemaju
    console.log('\n👥 Updating Users...');
    const usersResult = await User.updateMany(
      { companyId: { $exists: false } },
      { $set: { companyId } }
    );
    console.log(`✅ Updated ${usersResult.modifiedCount} users`);

    // 3. Dodaj companyId svim liftovima
    console.log('\n🏢 Updating Elevators...');
    const elevatorsResult = await Elevator.updateMany(
      { companyId: { $exists: false } },
      { $set: { companyId } }
    );
    console.log(`✅ Updated ${elevatorsResult.modifiedCount} elevators`);

    // 4. Dodaj companyId svim popravcima
    console.log('\n🔧 Updating Repairs...');
    const repairsResult = await Repair.updateMany(
      { companyId: { $exists: false } },
      { $set: { companyId } }
    );
    console.log(`✅ Updated ${repairsResult.modifiedCount} repairs`);

    // 5. Dodaj companyId svim servisima
    console.log('\n🛠️  Updating Services...');
    const servicesResult = await Service.updateMany(
      { companyId: { $exists: false } },
      { $set: { companyId } }
    );
    console.log(`✅ Updated ${servicesResult.modifiedCount} services`);

    // 6. Dodaj companyId svim radnim nalozima
    console.log('\n📄 Updating Work Orders...');
    const workOrdersResult = await WorkOrder.updateMany(
      { companyId: { $exists: false } },
      { $set: { companyId } }
    );
    console.log(`✅ Updated ${workOrdersResult.modifiedCount} work orders`);

    // 7. Drop old unique index na User.email ako postoji
    console.log('\n🗑️  Dropping old User.email unique index...');
    try {
      await User.collection.dropIndex('email_1');
      console.log('✅ Dropped old email_1 index');
    } catch (err) {
      if (err.code === 27) {
        console.log('ℹ️  Index email_1 does not exist (already dropped)');
      } else {
        console.log('⚠️  Could not drop index:', err.message);
      }
    }

    console.log('\n✅✅✅ Migration completed successfully!');
    console.log(`\nDefault Company ID: ${companyId}`);
    console.log(`\nYou can now update company settings through the API.`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

migrate();

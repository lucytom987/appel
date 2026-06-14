require('dotenv').config();
const mongoose = require('mongoose');
const Service = require('../models/Service');
const companyId = new mongoose.Types.ObjectId('69ac8fb55ce0a38500613432');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const result = await Service.aggregate([
    { $match: { companyId } },
    {
      $group: {
        _id: {
          year: { $year: '$datum' },
          month: { $month: '$datum' }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);

  result.forEach(r => {
    console.log(`${r._id.year}-${String(r._id.month).padStart(2,'0')}: ${r.count} servisa`);
  });

  console.log('\nUkupno:', result.reduce((a, r) => a + r.count, 0));
  mongoose.disconnect();
});

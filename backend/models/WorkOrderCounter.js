const mongoose = require('mongoose');

const workOrderCounterSchema = new mongoose.Schema({
  dayKey: { type: String, required: true, unique: true }, // DDMMYY
  sequence: { type: Number, default: 0 },
  updated_at: { type: Date, default: Date.now }
}, {
  strict: true,
  timestamps: false,
});

module.exports = mongoose.model('WorkOrderCounter', workOrderCounterSchema);

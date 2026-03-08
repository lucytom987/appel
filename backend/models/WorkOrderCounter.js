const mongoose = require('mongoose');

const workOrderCounterSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  dayKey: { type: String, required: true }, // DDMMYY
  sequence: { type: Number, default: 0 },
  updated_at: { type: Date, default: Date.now }
}, {
  strict: true,
  timestamps: false,
});

workOrderCounterSchema.index({ companyId: 1, dayKey: 1 }, { unique: true });

module.exports = mongoose.model('WorkOrderCounter', workOrderCounterSchema);

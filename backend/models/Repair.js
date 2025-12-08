const mongoose = require('mongoose');

const repairSchema = new mongoose.Schema({
  elevatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Elevator', required: true },
  serviserID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  datumPrijave: { type: Date, default: Date.now },
  datumPopravka: { type: Date, default: Date.now },

  opisKvara: { type: String, required: true },
  opisPopravka: String,

  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed'],
    default: 'pending'
  },

  radniNalogPotpisan: { type: Boolean, default: false },
  popravkaUPotpunosti: { type: Boolean, default: false },
  napomene: String,

  // Audit
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updated_at: { type: Date, default: Date.now },
  is_deleted: { type: Boolean, default: false },
  deleted_at: { type: Date },

  kreiranDatum: { type: Date, default: Date.now },
  azuriranDatum: { type: Date, default: Date.now }
}, {
  strict: false,
  timestamps: false
});

repairSchema.pre('save', function (next) {
  const now = Date.now();
  this.azuriranDatum = now;
  this.updated_at = now;
  next();
});

repairSchema.index({ elevatorId: 1, status: 1 });
repairSchema.index({ serviserID: 1 });
repairSchema.index({ datumPopravka: -1 });
repairSchema.index({ azuriranDatum: -1 });
repairSchema.index({ updated_at: -1 });
repairSchema.index({ is_deleted: 1 });

module.exports = mongoose.model('Repair', repairSchema);

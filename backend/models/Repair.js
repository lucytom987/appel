const mongoose = require('mongoose');

const repairSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  elevatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Elevator', required: true },
  serviserID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  datumPrijave: { type: Date, default: Date.now },
  datumPopravka: { type: Date, default: Date.now },

  opisKvara: { type: String, required: true },
  opisPopravka: String,
  dodatniServiseri: [{ type: String }],
  radniSati: {
    glavni: { type: Number, min: 0 },
    kolega: { type: Number, min: 0 },
    dodatni: [{ type: Number, min: 0 }],
  },
  utroseniMaterijal: String,

  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed'],
    default: 'pending'
  },

  // Tko je zaključio popravak kao završen
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  completedByName: String,
  completedAt: Date,

  // Oznaka za "trebalo bi" stavke (ne hitni kvar)
  trebaloBi: { type: Boolean, default: false },

  radniNalogPotpisan: { type: Boolean, default: false },
  popravkaUPotpunosti: { type: Boolean, default: false },
  napomene: String,
  
  // Fotografije (Cloudinary URLs)
  photos: [{
    url: String,
    size: Number,
    mime: String,
    createdAt: { type: Date, default: Date.now }
  }],

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
repairSchema.index({ completedBy: 1 });

module.exports = mongoose.model('Repair', repairSchema);

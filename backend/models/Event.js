const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  elevatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Elevator', required: true },
  
  // Tip događaja
  eventType: {
    type: String,
    enum: ['repair', 'service_note', 'activity'],
    required: true
  },
  
  // Popravak
  repair: {
    serviserID: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    opisKvara: String,
    opisPopravka: String,
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed'],
      default: 'pending'
    },
    trebaloBi: { type: Boolean, default: false },
    radniNalogPotpisan: { type: Boolean, default: false },
    popravkaUPotpunosti: { type: Boolean, default: false }
  },
  
  // Napomena sa servisa
  serviceNote: {
    serviserID: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    tekst: String,
    fotografija: String // Base64
  },
  
  // Opcenita aktivnost
  activity: {
    serviserID: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    opis: String,
    tip: {
      type: String,
      enum: ['posjeta', 'pregledavanje', 'kalibracija', 'cistenje', 'ostalo'],
      default: 'ostalo'
    }
  },
  
  // Zajednicka polja
  napomene: String,
  datum: { type: Date, default: Date.now, required: true },
  
  // Audit
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updated_at: { type: Date, default: Date.now },
  is_deleted: { type: Boolean, default: false },
  deleted_at: { type: Date },
  
  kreiranDatum: { type: Date, default: Date.now },
  azuriranDatum: { type: Date, default: Date.now },
  
  // Za migraciju - link na stari repair/service
  migratedFromRepairId: mongoose.Schema.Types.ObjectId,
  migratedFromServiceId: mongoose.Schema.Types.ObjectId
}, {
  strict: false,
  timestamps: false
});

eventSchema.pre('save', function (next) {
  const now = Date.now();
  this.azuriranDatum = now;
  this.updated_at = now;
  next();
});

eventSchema.index({ companyId: 1, elevatorId: 1, datum: -1 });
eventSchema.index({ companyId: 1, elevatorId: 1, eventType: 1 });
eventSchema.index({ companyId: 1, eventType: 1, datum: -1 });
eventSchema.index({ 'repair.status': 1 });
eventSchema.index({ companyId: 1, azuriranDatum: -1 });
eventSchema.index({ companyId: 1, updated_at: -1 });

module.exports = mongoose.model('Event', eventSchema);

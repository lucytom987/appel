const mongoose = require('mongoose');

const simCardSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  elevatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Elevator' },
  serijaSimKartice: { type: String, required: true },
  brojTelefona: String,
  vrstaUredaja: String,
  datumIsteka: Date,
  aktivna: { type: Boolean, default: true },
  
  napomene: String,
  
  kreiranDatum: { type: Date, default: Date.now },
  azuriranDatum: { type: Date, default: Date.now }
}, { 
  strict: false,
  timestamps: false 
});

simCardSchema.index({ companyId: 1, datumIsteka: 1 });
simCardSchema.index({ companyId: 1, elevatorId: 1 });
simCardSchema.index({ companyId: 1, serijaSimKartice: 1 }, { unique: true });

module.exports = mongoose.model('SimCard', simCardSchema);

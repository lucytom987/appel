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
    enum: ['čekanje', 'u tijeku', 'završen'],
    default: 'čekanje'
  },
  
  radniNalogPotpisan: { type: Boolean, default: false },
  popravkaUPotpunosti: { type: Boolean, default: false },
  napomene: String,
  
  kreiranDatum: { type: Date, default: Date.now },
  azuriranDatum: { type: Date, default: Date.now }
});

repairSchema.pre('save', function (next) {
  this.azuriranDatum = Date.now();
  next();
});

repairSchema.index({ elevatorId: 1, status: 1 });
repairSchema.index({ serviserID: 1 });
repairSchema.index({ datumPopravka: -1 });

module.exports = mongoose.model('Repair', repairSchema);

const mongoose = require('mongoose');

const simCardSchema = new mongoose.Schema({
  elevatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Elevator' },
  serijaSimKartice: { type: String, required: true, unique: true },
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

simCardSchema.index({ datumIsteka: 1 });
simCardSchema.index({ elevatorId: 1 });

module.exports = mongoose.model('SimCard', simCardSchema);

const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  elevatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Elevator', required: true },
  serviserID: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  datum: { type: Date, default: Date.now, required: true },
  
  // Checklist
  checklist: [{
    stavka: {
      type: String,
      enum: [
        'engine_check',
        'cable_inspection',
        'door_system',
        'emergency_brake',
        'control_panel',
        'safety_devices',
        'lubrication',
        'lighting'
      ],
      required: true
    },
    provjereno: { type: Number, enum: [0, 1], default: 0 }, // 0 = ne, 1 = da
    napomena: String
  }],
  
  // Nedostaci
  imaNedostataka: { type: Boolean, default: false },
  nedostaci: [{
    opis: String,
    fotografija: String, // Base64
    datumPrijave: { type: Date, default: Date.now },
    repairId: mongoose.Schema.Types.ObjectId
  }],
  
  napomene: String,
  sljedeciServis: Date,
  
  kreiranDatum: { type: Date, default: Date.now },
  azuriranDatum: { type: Date, default: Date.now }
}, { 
  strict: false,
  timestamps: false 
});

serviceSchema.pre('save', function (next) {
  this.azuriranDatum = Date.now();
  next();
});

serviceSchema.index({ elevatorId: 1, datum: -1 });
serviceSchema.index({ serviserID: 1 });

module.exports = mongoose.model('Service', serviceSchema);

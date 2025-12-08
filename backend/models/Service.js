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
        'lubrication',
        'ups_check',
        'voice_comm',
        'shaft_cleaning',
        'drive_check',
        'brake_check',
        'cable_inspection'
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

serviceSchema.pre('save', function (next) {
  const now = Date.now();
  this.azuriranDatum = now;
  this.updated_at = now;
  next();
});

serviceSchema.index({ elevatorId: 1, datum: -1 });
serviceSchema.index({ serviserID: 1 });
serviceSchema.index({ updated_at: -1 });
serviceSchema.index({ is_deleted: 1 });

module.exports = mongoose.model('Service', serviceSchema);

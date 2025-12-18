const mongoose = require('mongoose');

const elevatorSchema = new mongoose.Schema({
  // Osnovno
  brojUgovora: { type: String }, // Opcionalno
  nazivStranke: { type: String, required: true },
  ulica: { type: String, required: true },
  mjesto: { type: String, required: true },
  brojDizala: { type: String, required: true },

  // Tip objekta: stambeno ili privreda
  tip: {
    type: String,
    enum: ['stambeno', 'privreda'],
    default: 'stambeno'
  },
  
  // Kontakt osoba
  kontaktOsoba: {
    imePrezime: String,
    mobitel: String,
    email: String,
    ulaznaKoda: String
  },
  
  // GPS koordinate (opcionalno za mapu)
  koordinate: {
    latitude: Number,
    longitude: Number
  },
  
  // Status
  status: {
    type: String,
    enum: ['aktivan', 'neaktivan'],
    default: 'aktivan'
  },
  
  // Servisiranje
  intervalServisa: { type: Number, default: 1 }, // mjeseci
  godisnjiPregled: { type: Date },
  zadnjiServis: Date,
  sljedeciServis: Date,
  
  // Napomene
  napomene: String,
  
  // Metadata
  kreiranOd: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updated_at: { type: Date, default: Date.now },
  is_deleted: { type: Boolean, default: false },
  deleted_at: { type: Date },
  kreiranDatum: { type: Date, default: Date.now },
  azuriranDatum: { type: Date, default: Date.now }
}, { 
  strict: false, // Dozvoli dodatna polja ako dolaze
  timestamps: false 
});

// Ažuriraj azuriranDatum pri spremanju
elevatorSchema.pre('save', function (next) {
  const now = Date.now();
  this.azuriranDatum = now;
  this.updated_at = now;
  
  // Automatski izračunaj sljedeći servis ako je postavljen zadnji servis
  if (this.zadnjiServis && this.intervalServisa) {
    const nextDate = new Date(this.zadnjiServis);
    nextDate.setMonth(nextDate.getMonth() + this.intervalServisa);
    this.sljedeciServis = nextDate;
  }
  
  next();
});

// Index za brže pretraživanje
elevatorSchema.index({ brojUgovora: 1 });
elevatorSchema.index({ nazivStranke: 1 });
elevatorSchema.index({ ulica: 1 });
elevatorSchema.index({ mjesto: 1 });
elevatorSchema.index({ brojDizala: 1 });
elevatorSchema.index({ status: 1 });
elevatorSchema.index({ azuriranDatum: -1 });
elevatorSchema.index({ updated_at: -1 });
elevatorSchema.index({ is_deleted: 1 });

module.exports = mongoose.model('Elevator', elevatorSchema);

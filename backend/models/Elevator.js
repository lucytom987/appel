const mongoose = require('mongoose');

const elevatorSchema = new mongoose.Schema({
  // Osnovno
  brojUgovora: { type: String, required: true },
  nazivStranke: { type: String, required: true },
  ulica: { type: String, required: true },
  mjesto: { type: String, required: true },
  brojDizala: { type: String, required: true },
  
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
    enum: ['aktivan', 'neaktivan', 'u kvaru', 'u servisu'],
    default: 'aktivan'
  },
  
  // Servisiranje
  intervalServisa: { type: Number, default: 1 }, // mjeseci
  zadnjiServis: Date,
  sljedeciServis: Date,
  
  // Napomene
  napomene: String,
  
  // Metadata
  kreiranOd: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  kreiranDatum: { type: Date, default: Date.now },
  azuriranDatum: { type: Date, default: Date.now }
}, { 
  strict: false, // Dozvoli dodatna polja ako dolaze
  timestamps: false 
});

// Ažuriraj azuriranDatum pri spremanju
elevatorSchema.pre('save', function (next) {
  this.azuriranDatum = Date.now();
  
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

module.exports = mongoose.model('Elevator', elevatorSchema);

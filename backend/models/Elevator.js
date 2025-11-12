const mongoose = require('mongoose');

const elevatorSchema = new mongoose.Schema({
  nazivDizala: { type: String, required: true },
  brojUgovora: String,

  // Niz individualnih dizala na istoj lokaciji
  dizala: [{
    _id: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
    brojDizala: { type: String, required: true },
    status: {
      type: String,
      enum: ['aktivan', 'neaktivan', 'van pogona', 'u remontu'],
      default: 'aktivan'
    },
    napomena: String,
    specifikacije: {
      proizvodac: String,
      model: String,
      godinaProizvodnje: Number,
      nosivost: Number,
      brojKatova: Number,
      tipDizala: {
        type: String,
        enum: ['putnička', 'teretna', 'panoramska', 'bolnička', 'ostalo'],
        default: 'putnička'
      }
    }
  }],

  // SIM kartice
  simKartice: [{
    _id: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
    serijaSimKartice: String,
    brojTelefona: String,
    vrstaUredaja: String,
    datumIsteka: Date,
    aktivna: { type: Boolean, default: true }
  }],

  // Lokacija
  lokacija: {
    adresa: { type: String, required: true },
    grad: { type: String, required: true },
    postanskiBroj: String,
    drzava: { type: String, default: 'Hrvatska' },
    ulaznaKoda: String,
    koordinate: {
      latitude: Number,
      longitude: Number
    }
  },

  // Klijent
  klijent: {
    naziv: { type: String, required: true },
    kontaktOsoba: String,
    telefon: String,
    email: String
  },

  // Servisiranje
  servisiranje: {
    zadnjiServis: Date,
    sljedeciServis: Date,
    intervalServisa: { type: Number, default: 30 }
  },

  napomene: String,
  kreiranDatum: { type: Date, default: Date.now },
  azuriranDatum: { type: Date, default: Date.now }
});

// Ažuriraj azuriranDatum pri spremi
elevatorSchema.pre('save', function (next) {
  this.azuriranDatum = Date.now();
  next();
});

// Index za brže pretraživanje
elevatorSchema.index({ 'lokacija.grad': 1 });
elevatorSchema.index({ 'lokacija.adresa': 1 });
elevatorSchema.index({ 'dizala.status': 1 });

module.exports = mongoose.model('Elevator', elevatorSchema);

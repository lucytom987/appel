const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  ime: { type: String, required: true },
  prezime: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  lozinka: { type: String, required: true },
  privremenaLozinka: { type: String }, // Za admin reset - prikazuje se samo jednom
  uloga: {
    type: String,
    enum: ['serviser', 'menadzer', 'admin'],
    default: 'serviser'
  },
  telefon: String,
  aktivan: { type: Boolean, default: true },
  kreiranDatum: { type: Date, default: Date.now },
  azuriranDatum: { type: Date, default: Date.now }
});

// Hash lozinku prije spremanja
userSchema.pre('save', async function (next) {
  if (!this.isModified('lozinka')) return next();
  const salt = await bcrypt.genSalt(10);
  this.lozinka = await bcrypt.hash(this.lozinka, salt);
  next();
});

// Metoda za provjeru lozinke
userSchema.methods.provjeriLozinku = async function (unesenaLozinka) {
  return await bcrypt.compare(unesenaLozinka, this.lozinka);
};

// Makni lozinku iz responsa
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.lozinka; // Nikad ne vraćaj hashiranu lozinku
  // privtemenaLozinka SE vraća jer je za prikaz admin-u samo jednom
  return obj;
};

module.exports = mongoose.model('User', userSchema);

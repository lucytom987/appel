const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  naziv: {
    type: String,
    required: true,
    trim: true,
  },
  adresa: {
    type: String,
    trim: true,
  },
  oib: {
    type: String,
    trim: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
  },
  mobitel: {
    type: String,
    trim: true,
  },
  telefon: {
    type: String,
    trim: true,
  },
  web: {
    type: String,
    trim: true,
  },
  logo: {
    type: String, // URL ili base64
    default: null,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

companySchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

module.exports = mongoose.model('Company', companySchema);

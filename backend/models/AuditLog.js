const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  korisnikId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  akcija: {
    type: String,
    enum: ['CREATE', 'UPDATE', 'DELETE'],
    required: true
  },
  entitet: {
    type: String,
    enum: ['Service', 'Repair', 'ChatRoom', 'Message', 'SimCard', 'Elevator', 'User'],
    required: true
  },
  entitetId: mongoose.Schema.Types.ObjectId,
  entitetNaziv: String,
  
  stareVrijednosti: mongoose.Schema.Types.Mixed,
  noveVrijednosti: mongoose.Schema.Types.Mixed,
  
  ipAdresa: String,
  opis: String,
  
  kreiranDatum: { type: Date, default: Date.now }
});

auditLogSchema.index({ korisnikId: 1, kreiranDatum: -1 });
auditLogSchema.index({ entitet: 1, akcija: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);

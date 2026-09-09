const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  chatRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom', required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Idempotency kljuc da retry (npr. otvaranje chata dok ranija poruka jos nije potvrdena) ne stvori duplikat
  clientRequestId: { type: String },

  tekst: String,
  slika: String, // URL ili Base64

  accentKey: { type: String },
  
  isRead: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  kreiranDatum: { type: Date, default: Date.now }
}, { 
  strict: false,
  timestamps: false 
});

messageSchema.index({ companyId: 1, chatRoomId: 1, kreiranDatum: -1 });
messageSchema.index({ companyId: 1, senderId: 1 });
messageSchema.index({ companyId: 1, clientRequestId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Message', messageSchema);

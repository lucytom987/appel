const mongoose = require('mongoose');

const chatRoomSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  naziv: { type: String, required: true },
  opis: String,
  tip: {
    type: String,
    enum: ['general', 'custom'],
    default: 'custom'
  },
  kreiraoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  clanovi: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  kreiranDatum: { type: Date, default: Date.now },
  azuriranDatum: { type: Date, default: Date.now }
}, { 
  strict: false,
  timestamps: false 
});

chatRoomSchema.index({ companyId: 1, tip: 1 });
chatRoomSchema.index({ companyId: 1, azuriranDatum: -1 });

module.exports = mongoose.model('ChatRoom', chatRoomSchema);

const mongoose = require('mongoose');

const chatRoomSchema = new mongoose.Schema({
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
});

chatRoomSchema.index({ tip: 1 });

module.exports = mongoose.model('ChatRoom', chatRoomSchema);

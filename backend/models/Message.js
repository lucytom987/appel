const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  chatRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom', required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  tekst: String,
  slika: String, // URL ili Base64
  
  isRead: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  kreiranDatum: { type: Date, default: Date.now }
});

messageSchema.index({ chatRoomId: 1, kreiranDatum: -1 });
messageSchema.index({ senderId: 1 });

module.exports = mongoose.model('Message', messageSchema);

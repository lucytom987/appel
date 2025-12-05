const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const ChatRoom = require('../models/ChatRoom');
const { authenticate } = require('../middleware/auth');

// GET /api/messages/room/:roomId - poruke iz sobe
router.get('/room/:roomId', authenticate, async (req, res) => {
  try {
    const { limit = 50, skip = 0 } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 0, 1), 200);
    const parsedSkip = Math.max(parseInt(skip, 10) || 0, 0);

    const messages = await Message.find({ chatRoomId: req.params.roomId })
      .populate('senderId', 'ime prezime email uloga')
      .sort({ kreiranDatum: -1 })
      .limit(parsedLimit)
      .skip(parsedSkip)
      .lean();

    const total = await Message.countDocuments({ chatRoomId: req.params.roomId });

    res.json({
      success: true,
      count: messages.length,
      total,
      data: messages.reverse() // od najstarije prema najnovijoj
    });
  } catch (error) {
    console.error('Greška pri dohvaćanju poruka:', error);
    res.status(500).json({ success: false, message: 'Greška pri dohvaćanju poruka' });
  }
});

// POST /api/messages - pošalji poruku
router.post('/', authenticate, async (req, res) => {
  try {
    const chatRoomId = req.body.chatRoomId || req.body.chatRoom;
    const tekst = req.body.tekst || req.body.content || '';
    const slika = req.body.slika || req.body.imageUrl;

    const room = await ChatRoom.findById(chatRoomId);
    if (!room) {
      return res.status(404).json({ success: false, message: 'Chat soba nije pronađena' });
    }

    if (!room.clanovi.map(String).includes(String(req.user._id))) {
      return res.status(403).json({ success: false, message: 'Niste član ove chat sobe' });
    }

    const message = new Message({
      chatRoomId,
      senderId: req.user._id,
      tekst,
      slika,
    });

    await message.save();
    await message.populate('senderId', 'ime prezime email uloga');

    res.status(201).json({ success: true, message: 'Poruka poslana', data: message });
  } catch (error) {
    console.error('Greška pri slanju poruke:', error);
    res.status(500).json({ success: false, message: 'Greška pri slanju poruke', error: error.message });
  }
});

// PUT /api/messages/:id/read - označi pročitano
router.put('/:id/read', authenticate, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Poruka nije pronađena' });
    }

    if (!message.isRead.map(String).includes(String(req.user._id))) {
      message.isRead.push(req.user._id);
      await message.save();
    }

    res.json({ success: true, message: 'Poruka označena kao pročitana', data: message });
  } catch (error) {
    console.error('Greška pri označavanju poruke:', error);
    res.status(500).json({ success: false, message: 'Greška pri označavanju poruke' });
  }
});

// DELETE /api/messages/:id - briši poruku (pošiljatelj ili admin)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Poruka nije pronađena' });
    }

    if (String(message.senderId) !== String(req.user._id) && req.user.uloga !== 'admin') {
      return res.status(403).json({ success: false, message: 'Nemate dozvolu za brisanje ove poruke' });
    }

    await message.deleteOne();
    res.json({ success: true, message: 'Poruka obrisana' });
  } catch (error) {
    console.error('Greška pri brisanju poruke:', error);
    res.status(500).json({ success: false, message: 'Greška pri brisanju poruke' });
  }
});

module.exports = router;

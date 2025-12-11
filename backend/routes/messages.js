const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const ChatRoom = require('../models/ChatRoom');
const { authenticate } = require('../middleware/auth');

// GET /api/messages/unread/count - broj neprocitanih poruka za prijavljenog korisnika (svi vide sve sobe)
router.get('/unread/count', authenticate, async (req, res) => {
  try {
    // Svi vide sve sobe, ali brojimo samo poruke iz postojećih soba
    const rooms = await ChatRoom.find({}, { _id: 1 }).lean();
    if (!rooms.length) {
      return res.json({ success: true, count: 0, data: 0 });
    }

    const roomIds = rooms.map((r) => r._id);

    // Broji tuđe poruke koje korisnik nije označio kao pročitane
    const unreadCount = await Message.countDocuments({
      chatRoomId: { $in: roomIds },
      senderId: { $ne: req.user._id },
      isRead: { $ne: req.user._id },
    });

    res.json({ success: true, count: unreadCount, data: unreadCount });
  } catch (error) {
    console.error('Greska pri dohvacanju neprocitanih poruka:', error);
    res.status(500).json({ success: false, message: 'Greska pri dohvacanju neprocitanih poruka' });
  }
});

// GET /api/messages/room/:roomId - poruke iz sobe
router.get('/room/:roomId', authenticate, async (req, res) => {
  try {
    const { limit = 50, skip = 0 } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 0, 1), 200);
    const parsedSkip = Math.max(parseInt(skip, 10) || 0, 0);

    const room = await ChatRoom.findById(req.params.roomId);
    if (!room) {
      return res.status(404).json({ success: false, message: 'Chat soba nije pronadena' });
    }

    const messages = await Message.find({ chatRoomId: room._id })
      .populate('senderId', 'ime prezime email uloga')
      .sort({ kreiranDatum: -1 })
      .limit(parsedLimit)
      .skip(parsedSkip)
      .lean();

    const total = await Message.countDocuments({ chatRoomId: room._id });

    res.json({
      success: true,
      count: messages.length,
      total,
      data: messages.reverse() // od najstarije prema najnovijoj
    });
  } catch (error) {
    console.error('Greska pri dohvacanju poruka:', error);
    res.status(500).json({ success: false, message: 'Greska pri dohvacanju poruka' });
  }
});

// POST /api/messages - posalji poruku (dozvoljeno svim prijavljenim ulogama)
router.post('/', authenticate, async (req, res) => {
  try {
    const chatRoomId = req.body.chatRoomId || req.body.chatRoom;
    const tekst = req.body.tekst || req.body.content || '';
    const slika = req.body.slika || req.body.imageUrl;
    const accentKey = req.body.accentKey || req.body.colorKey;

    const room = await ChatRoom.findById(chatRoomId);
    if (!room) {
      return res.status(404).json({ success: false, message: 'Chat soba nije pronadena' });
    }

    const message = new Message({
      chatRoomId: room._id,
      senderId: req.user._id,
      tekst,
      slika,
      accentKey,
    });

    await message.save();
    await message.populate('senderId', 'ime prezime email uloga');

    res.status(201).json({ success: true, message: 'Poruka poslana', data: message });
  } catch (error) {
    console.error('Greska pri slanju poruke:', error);
    res.status(500).json({ success: false, message: 'Greska pri slanju poruke', error: error.message });
  }
});

// PUT /api/messages/:id/read - oznaci procitano
router.put('/:id/read', authenticate, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Poruka nije pronadena' });
    }

    if (!message.isRead.map(String).includes(String(req.user._id))) {
      message.isRead.push(req.user._id);
      await message.save();
    }

    res.json({ success: true, message: 'Poruka oznacena kao procitana', data: message });
  } catch (error) {
    console.error('Greska pri oznacavanju poruke:', error);
    res.status(500).json({ success: false, message: 'Greska pri oznacavanju poruke' });
  }
});

// DELETE /api/messages/:id - brisi poruku (posaljatelj ili admin)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ success: false, message: 'Poruka nije pronadena' });
    }

    if (String(message.senderId) !== String(req.user._id) && req.user.uloga !== 'admin') {
      return res.status(403).json({ success: false, message: 'Nemate dozvolu za brisanje ove poruke' });
    }

    await message.deleteOne();
    res.json({ success: true, message: 'Poruka obrisana' });
  } catch (error) {
    console.error('Greska pri brisanju poruke:', error);
    res.status(500).json({ success: false, message: 'Greska pri brisanju poruke' });
  }
});

module.exports = router;

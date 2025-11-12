const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const ChatRoom = require('../models/ChatRoom');
const { authenticate } = require('../middleware/auth');

// @route   GET /api/messages/room/:roomId
// @desc    Dohvati sve poruke za određenu chat sobu
// @access  Private
router.get('/room/:roomId', authenticate, async (req, res) => {
  try {
    const { limit = 50, skip = 0 } = req.query;

    const messages = await Message.find({ chatRoom: req.params.roomId })
      .populate('sender', 'name email role')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const total = await Message.countDocuments({ chatRoom: req.params.roomId });

    res.json({
      success: true,
      count: messages.length,
      total,
      data: messages.reverse() // Obrnuto da budu od najstarije prema najnovijoj
    });
  } catch (error) {
    console.error('❌ Greška pri dohvaćanju poruka:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri dohvaćanju poruka'
    });
  }
});

// @route   POST /api/messages
// @desc    Pošalji novu poruku (preko REST API-ja, Socket.io se koristi za real-time)
// @access  Private
router.post('/', authenticate, async (req, res) => {
  try {
    const { chatRoom, content, imageUrl } = req.body;

    // Provjeri da li chat soba postoji
    const room = await ChatRoom.findById(chatRoom);
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Chat soba nije pronađena'
      });
    }

    // Provjeri da li je korisnik član sobe
    if (!room.members.includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Niste član ove chat sobe'
      });
    }

    const message = new Message({
      chatRoom,
      sender: req.user.id,
      content,
      imageUrl
    });

    await message.save();
    await message.populate('sender', 'name email role');

    // Ovdje bi normalno emitovali Socket.io event, ali to radimo u Socket.io handleru
    // io.to(`room-${chatRoom}`).emit('new-message', message);

    res.status(201).json({
      success: true,
      message: 'Poruka uspješno poslana',
      data: message
    });
  } catch (error) {
    console.error('❌ Greška pri slanju poruke:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri slanju poruke',
      error: error.message
    });
  }
});

// @route   PUT /api/messages/:id/read
// @desc    Označi poruku kao pročitanu
// @access  Private
router.put('/:id/read', authenticate, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Poruka nije pronađena'
      });
    }

    // Dodaj korisnika u readBy ako već nije tamo
    if (!message.readBy.includes(req.user.id)) {
      message.readBy.push(req.user.id);
      await message.save();
    }

    res.json({
      success: true,
      message: 'Poruka označena kao pročitana',
      data: message
    });
  } catch (error) {
    console.error('❌ Greška pri označavanju poruke:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri označavanju poruke'
    });
  }
});

// @route   DELETE /api/messages/:id
// @desc    Obriši poruku
// @access  Private (samo pošiljatelj ili admin)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Poruka nije pronađena'
      });
    }

    // Samo pošiljatelj ili admin može obrisati poruku
    if (message.sender.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Nemate dozvolu za brisanje ove poruke'
      });
    }

    await message.deleteOne();

    res.json({
      success: true,
      message: 'Poruka uspješno obrisana'
    });
  } catch (error) {
    console.error('❌ Greška pri brisanju poruke:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri brisanju poruke'
    });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const ChatRoom = require('../models/ChatRoom');
const { authenticate, checkRole } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

// @route   GET /api/chatrooms
// @desc    Dohvati sve chat sobe
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    const chatrooms = await ChatRoom.find()
      .populate('createdBy', 'name email')
      .populate('members', 'name email role')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      count: chatrooms.length,
      data: chatrooms
    });
  } catch (error) {
    console.error('❌ Greška pri dohvaćanju chat soba:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri dohvaćanju chat soba'
    });
  }
});

// @route   GET /api/chatrooms/:id
// @desc    Dohvati jednu chat sobu
// @access  Private
router.get('/:id', authenticate, async (req, res) => {
  try {
    const chatroom = await ChatRoom.findById(req.params.id)
      .populate('createdBy', 'name email role')
      .populate('members', 'name email role')
      .lean();

    if (!chatroom) {
      return res.status(404).json({
        success: false,
        message: 'Chat soba nije pronađena'
      });
    }

    res.json({
      success: true,
      data: chatroom
    });
  } catch (error) {
    console.error('❌ Greška pri dohvaćanju chat sobe:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri dohvaćanju chat sobe'
    });
  }
});

// @route   POST /api/chatrooms
// @desc    Kreiraj novu chat sobu
// @access  Private (Manager, Admin)
router.post('/', authenticate, checkRole(['admin', 'menadzer']), async (req, res) => {
  try {
    const { name, description, members } = req.body;

    // Dodaj kreatora u članove ako nije već dodan
    const memberIds = members || [];
    if (!memberIds.includes(req.user.id)) {
      memberIds.push(req.user.id);
    }

    const chatroom = new ChatRoom({
      name,
      description,
      members: memberIds,
      createdBy: req.user.id
    });

    await chatroom.save();

    // Audit log
    await logAction(req.user.id, 'CREATE', 'ChatRoom', chatroom._id, {
      name: chatroom.name
    });

    // Populate prije slanja
    await chatroom.populate('createdBy', 'name email');
    await chatroom.populate('members', 'name email role');

    res.status(201).json({
      success: true,
      message: 'Chat soba uspješno kreirana',
      data: chatroom
    });
  } catch (error) {
    console.error('❌ Greška pri kreiranju chat sobe:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri kreiranju chat sobe',
      error: error.message
    });
  }
});

// @route   PUT /api/chatrooms/:id
// @desc    Ažuriraj chat sobu (ime, članove)
// @access  Private (Manager, Admin)
router.put('/:id', authenticate, checkRole(['admin', 'menadzer']), async (req, res) => {
  try {
    const existingRoom = await ChatRoom.findById(req.params.id);

    if (!existingRoom) {
      return res.status(404).json({
        success: false,
        message: 'Chat soba nije pronađena'
      });
    }

    const chatroom = await ChatRoom.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('createdBy', 'name email')
      .populate('members', 'name email role');

    // Audit log
    await logAction(req.user.id, 'UPDATE', 'ChatRoom', chatroom._id, {
      name: chatroom.name
    });

    res.json({
      success: true,
      message: 'Chat soba uspješno ažurirana',
      data: chatroom
    });
  } catch (error) {
    console.error('❌ Greška pri ažuriranju chat sobe:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri ažuriranju chat sobe',
      error: error.message
    });
  }
});

// @route   DELETE /api/chatrooms/:id
// @desc    Obriši chat sobu
// @access  Private (Admin only)
router.delete('/:id', authenticate, checkRole(['admin']), async (req, res) => {
  try {
    const chatroom = await ChatRoom.findById(req.params.id);

    if (!chatroom) {
      return res.status(404).json({
        success: false,
        message: 'Chat soba nije pronađena'
      });
    }

    await chatroom.deleteOne();

    // Audit log
    await logAction(req.user.id, 'DELETE', 'ChatRoom', req.params.id, {
      name: chatroom.name
    });

    res.json({
      success: true,
      message: 'Chat soba uspješno obrisana'
    });
  } catch (error) {
    console.error('❌ Greška pri brisanju chat sobe:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri brisanju chat sobe'
    });
  }
});

// @route   POST /api/chatrooms/:id/members
// @desc    Dodaj člana u chat sobu
// @access  Private (Manager, Admin)
router.post('/:id/members', authenticate, checkRole(['admin', 'menadzer']), async (req, res) => {
  try {
    const { userId } = req.body;

    const chatroom = await ChatRoom.findById(req.params.id);
    
    if (!chatroom) {
      return res.status(404).json({
        success: false,
        message: 'Chat soba nije pronađena'
      });
    }

    // Provjeri da li korisnik već postoji u sobi
    if (chatroom.members.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Korisnik je već član ove sobe'
      });
    }

    chatroom.members.push(userId);
    await chatroom.save();

    await chatroom.populate('members', 'name email role');

    res.json({
      success: true,
      message: 'Član uspješno dodan',
      data: chatroom
    });
  } catch (error) {
    console.error('❌ Greška pri dodavanju člana:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri dodavanju člana'
    });
  }
});

// @route   DELETE /api/chatrooms/:id/members/:userId
// @desc    Ukloni člana iz chat sobe
// @access  Private (Manager, Admin)
router.delete('/:id/members/:userId', authenticate, checkRole(['admin', 'menadzer']), async (req, res) => {
  try {
    const chatroom = await ChatRoom.findById(req.params.id);
    
    if (!chatroom) {
      return res.status(404).json({
        success: false,
        message: 'Chat soba nije pronađena'
      });
    }

    chatroom.members = chatroom.members.filter(
      memberId => memberId.toString() !== req.params.userId
    );
    
    await chatroom.save();
    await chatroom.populate('members', 'name email role');

    res.json({
      success: true,
      message: 'Član uspješno uklonjen',
      data: chatroom
    });
  } catch (error) {
    console.error('❌ Greška pri uklanjanju člana:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri uklanjanju člana'
    });
  }
});

module.exports = router;

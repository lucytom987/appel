const express = require('express');
const router = express.Router();
const ChatRoom = require('../models/ChatRoom');
const User = require('../models/User');
const Message = require('../models/Message');
const { authenticate, checkRole } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

// GET /api/chatrooms - sve sobe
router.get('/', authenticate, async (req, res) => {
  try {
    const { limit = 100, skip = 0 } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 0, 1), 200);
    const parsedSkip = Math.max(parseInt(skip, 10) || 0, 0);

    const chatrooms = await ChatRoom.find()
      .populate('kreiraoId', 'ime prezime email uloga')
      .populate('clanovi', 'ime prezime email uloga')
      // Sortiraj po zadnjem ažuriranju radi relevantnosti liste
      .sort({ azuriranDatum: -1, kreiranDatum: -1 })
      .skip(parsedSkip)
      .limit(parsedLimit)
      .lean();

    // Izvuci zadnju poruku za svaku sobu (jednostavan upit po sobi radi točnosti)
    const latestList = await Promise.all(
      chatrooms.map((room) =>
        Message.findOne({ chatRoomId: room._id })
          .sort({ kreiranDatum: -1, createdAt: -1, azuriranDatum: -1, _id: -1 })
          .select('kreiranDatum createdAt azuriranDatum tekst senderId')
          .lean()
      )
    );
    const latestMap = new Map(
      chatrooms.map((room, idx) => [String(room._id), latestList[idx] || null])
    );

    const totalUsers = await User.countDocuments();
    const unreadCounts = await Promise.all(
      chatrooms.map((room) =>
        Message.countDocuments({
          chatRoomId: room._id,
          senderId: { $ne: req.user._id },
          isRead: { $ne: req.user._id },
        })
      )
    );

    const chatroomsWithCount = chatrooms.map((room, idx) => {
      const latest = latestMap.get(String(room._id));
      const lastAt = latest?.kreiranDatum || latest?.createdAt || latest?.azuriranDatum || null;
      return {
        ...room,
        membersCount: totalUsers,
        lastMessageAt: lastAt,
        lastMessageText: latest?.tekst || null,
        lastSenderId: latest?.senderId || null,
        unreadCount: unreadCounts[idx] || 0,
      };
    });

    const total = await ChatRoom.countDocuments();

    res.json({ success: true, count: chatrooms.length, total, data: chatroomsWithCount });
  } catch (error) {
    console.error('Greška pri dohvaćanju chat soba:', error);
    res.status(500).json({ success: false, message: 'Greška pri dohvaćanju chat soba' });
  }
});

// GET /api/chatrooms/:id - jedna soba
router.get('/:id', authenticate, async (req, res) => {
  try {
    const chatroom = await ChatRoom.findById(req.params.id)
      .populate('kreiraoId', 'ime prezime email uloga')
      .populate('clanovi', 'ime prezime email uloga')
      .lean();

    if (!chatroom) {
      return res.status(404).json({ success: false, message: 'Chat soba nije pronađena' });
    }

    const totalUsers = await User.countDocuments();
    const latestMessage = await Message.findOne({ chatRoomId: chatroom._id })
      .sort({ kreiranDatum: -1, createdAt: -1, azuriranDatum: -1, _id: -1 })
      .select('kreiranDatum createdAt azuriranDatum tekst senderId')
      .lean();

    const unreadCount = await Message.countDocuments({
      chatRoomId: chatroom._id,
      senderId: { $ne: req.user._id },
      isRead: { $ne: req.user._id },
    });

    res.json({
      success: true,
      data: {
        ...chatroom,
        membersCount: totalUsers,
        lastMessageAt: latestMessage?.kreiranDatum || latestMessage?.createdAt || latestMessage?.azuriranDatum || chatroom.azuriranDatum || chatroom.kreiranDatum,
        lastMessageText: latestMessage?.tekst || null,
        lastSenderId: latestMessage?.senderId || null,
        unreadCount,
      },
    });
  } catch (error) {
    console.error('Greška pri dohvaćanju chat sobe:', error);
    res.status(500).json({ success: false, message: 'Greška pri dohvaćanju chat sobe' });
  }
});

// POST /api/chatrooms - kreiraj novu sobu
router.post('/', authenticate, checkRole(['admin', 'menadzer']), async (req, res) => {
  try {
    const naziv = req.body.naziv || req.body.name;
    const opis = req.body.opis || req.body.description;
    const clanovi = req.body.clanovi || req.body.members || [];

    // Dodaj kreatora ako nije već u listi
    const memberIds = [...clanovi.map(String)];
    if (!memberIds.includes(String(req.user._id))) {
      memberIds.push(String(req.user._id));
    }

    const chatroom = new ChatRoom({
      naziv,
      opis,
      clanovi: memberIds,
      kreiraoId: req.user._id
    });

    await chatroom.save();
    await chatroom.populate('kreiraoId', 'ime prezime email uloga');
    await chatroom.populate('clanovi', 'ime prezime email uloga');

    await logAction({
      korisnikId: req.user._id,
      akcija: 'CREATE',
      entitet: 'ChatRoom',
      entitetId: chatroom._id,
      entitetNaziv: chatroom.naziv,
      noveVrijednosti: chatroom.toObject(),
      ipAdresa: req.ip,
      opis: 'Kreirana chat soba'
    });

    res.status(201).json({ success: true, message: 'Chat soba uspješno kreirana', data: chatroom });
  } catch (error) {
    console.error('Greška pri kreiranju chat sobe:', error);
    res.status(500).json({ success: false, message: 'Greška pri kreiranju chat sobe', error: error.message });
  }
});

// PUT /api/chatrooms/:id - ažuriranje
router.put('/:id', authenticate, checkRole(['admin', 'menadzer']), async (req, res) => {
  try {
    const chatroom = await ChatRoom.findById(req.params.id);
    if (!chatroom) {
      return res.status(404).json({ success: false, message: 'Chat soba nije pronađena' });
    }

    if (req.body.naziv || req.body.name) chatroom.naziv = req.body.naziv || req.body.name;
    if (req.body.opis || req.body.description) chatroom.opis = req.body.opis || req.body.description;
    if (req.body.clanovi || req.body.members) chatroom.clanovi = req.body.clanovi || req.body.members;
    chatroom.azuriranDatum = new Date();
    await chatroom.save();

    await chatroom.populate('kreiraoId', 'ime prezime email uloga');
    await chatroom.populate('clanovi', 'ime prezime email uloga');

    await logAction({
      korisnikId: req.user._id,
      akcija: 'UPDATE',
      entitet: 'ChatRoom',
      entitetId: chatroom._id,
      entitetNaziv: chatroom.naziv,
      noveVrijednosti: chatroom.toObject(),
      ipAdresa: req.ip,
      opis: 'Ažurirana chat soba'
    });

    res.json({ success: true, message: 'Chat soba ažurirana', data: chatroom });
  } catch (error) {
    console.error('Greška pri ažuriranju chat sobe:', error);
    res.status(500).json({ success: false, message: 'Greška pri ažuriranju chat sobe', error: error.message });
  }
});

// DELETE /api/chatrooms/:id - brisanje
router.delete('/:id', authenticate, checkRole(['admin']), async (req, res) => {
  try {
    const chatroom = await ChatRoom.findById(req.params.id);
    if (!chatroom) {
      return res.status(404).json({ success: false, message: 'Chat soba nije pronađena' });
    }

    // Obrisi sve poruke vezane uz ovu sobu
    await Message.deleteMany({ chatRoomId: chatroom._id });

    await chatroom.deleteOne();

    await logAction({
      korisnikId: req.user._id,
      akcija: 'DELETE',
      entitet: 'ChatRoom',
      entitetId: req.params.id,
      entitetNaziv: chatroom.naziv,
      stareVrijednosti: chatroom.toObject(),
      ipAdresa: req.ip,
      opis: 'Obrisana chat soba'
    });

    res.json({ success: true, message: 'Chat soba obrisana' });
  } catch (error) {
    console.error('Greška pri brisanju chat sobe:', error);
    res.status(500).json({ success: false, message: 'Greška pri brisanju chat sobe' });
  }
});

// POST /api/chatrooms/:id/members - dodaj člana
router.post('/:id/members', authenticate, checkRole(['admin', 'menadzer']), async (req, res) => {
  try {
    const { userId } = req.body;
    const chatroom = await ChatRoom.findById(req.params.id);
    if (!chatroom) {
      return res.status(404).json({ success: false, message: 'Chat soba nije pronađena' });
    }

    if (chatroom.clanovi.map(String).includes(String(userId))) {
      return res.status(400).json({ success: false, message: 'Korisnik je već član ove sobe' });
    }

    chatroom.clanovi.push(userId);
    await chatroom.save();
    await chatroom.populate('clanovi', 'ime prezime email uloga');

    res.json({ success: true, message: 'Član dodan', data: chatroom });
  } catch (error) {
    console.error('Greška pri dodavanju člana:', error);
    res.status(500).json({ success: false, message: 'Greška pri dodavanju člana' });
  }
});

// DELETE /api/chatrooms/:id/members/:userId - ukloni člana
router.delete('/:id/members/:userId', authenticate, checkRole(['admin', 'menadzer']), async (req, res) => {
  try {
    const chatroom = await ChatRoom.findById(req.params.id);
    if (!chatroom) {
      return res.status(404).json({ success: false, message: 'Chat soba nije pronađena' });
    }

    chatroom.clanovi = chatroom.clanovi.filter(
      memberId => String(memberId) !== String(req.params.userId)
    );
    await chatroom.save();
    await chatroom.populate('clanovi', 'ime prezime email uloga');

    res.json({ success: true, message: 'Član uklonjen', data: chatroom });
  } catch (error) {
    console.error('Greška pri uklanjanju člana:', error);
    res.status(500).json({ success: false, message: 'Greška pri uklanjanju člana' });
  }
});

module.exports = router;

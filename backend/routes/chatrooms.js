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

    const chatrooms = await ChatRoom.find({ companyId: req.companyId })
      .populate('kreiraoId', 'ime prezime email uloga')
      .populate({ path: 'clanovi', select: 'ime prezime email uloga', match: { companyId: req.companyId } })
      // Sortiraj po zadnjem ažuriranju radi relevantnosti liste
      .sort({ azuriranDatum: -1, kreiranDatum: -1 })
      .skip(parsedSkip)
      .limit(parsedLimit)
      .lean();

    // Izvuci zadnju poruku za svaku sobu (jednostavan upit po sobi radi točnosti)
    const latestList = await Promise.all(
      chatrooms.map((room) =>
        Message.findOne({ chatRoomId: room._id, companyId: req.companyId })
          .sort({ kreiranDatum: -1, createdAt: -1, azuriranDatum: -1, _id: -1 })
          .select('kreiranDatum createdAt azuriranDatum tekst senderId')
          .lean()
      )
    );
    const latestMap = new Map(
      chatrooms.map((room, idx) => [String(room._id), latestList[idx] || null])
    );

    const totalUsers = await User.countDocuments({ companyId: req.companyId });
    const unreadCounts = await Promise.all(
      chatrooms.map((room) =>
        Message.countDocuments({
          companyId: req.companyId,
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

    const total = await ChatRoom.countDocuments({ companyId: req.companyId });

    res.json({ success: true, count: chatrooms.length, total, data: chatroomsWithCount });
  } catch (error) {
    console.error('Greška pri dohvaćanju chat soba:', error);
    res.status(500).json({ success: false, message: 'Greška pri dohvaćanju chat soba' });
  }
});

// GET /api/chatrooms/:id - jedna soba
router.get('/:id', authenticate, async (req, res) => {
  try {
    const chatroom = await ChatRoom.findOne({ _id: req.params.id, companyId: req.companyId })
      .populate('kreiraoId', 'ime prezime email uloga')
      .populate({ path: 'clanovi', select: 'ime prezime email uloga', match: { companyId: req.companyId } })
      .lean();

    if (!chatroom) {
      return res.status(404).json({ success: false, message: 'Chat soba nije pronađena' });
    }

    const totalUsers = await User.countDocuments({ companyId: req.companyId });
    const latestMessage = await Message.findOne({ chatRoomId: chatroom._id, companyId: req.companyId })
      .sort({ kreiranDatum: -1, createdAt: -1, azuriranDatum: -1, _id: -1 })
      .select('kreiranDatum createdAt azuriranDatum tekst senderId')
      .lean();

    const unreadCount = await Message.countDocuments({
      companyId: req.companyId,
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

// POST /api/chatrooms - kreiraj novu sobu (dostupno svim prijavljenim korisnicima)
router.post('/', authenticate, async (req, res) => {
  try {
    const naziv = req.body.naziv || req.body.name;
    const opis = req.body.opis || req.body.description;
    const clanovi = req.body.clanovi || req.body.members || [];

    // Dodaj kreatora ako nije već u listi
    const memberIds = [...new Set(clanovi.map(String))];
    if (!memberIds.includes(String(req.user._id))) {
      memberIds.push(String(req.user._id));
    }

    const validMembers = await User.find({
      _id: { $in: memberIds },
      companyId: req.companyId,
      aktivan: true,
    }).select('_id');
    const validMemberIds = validMembers.map((member) => member._id);

    const chatroom = new ChatRoom({
      companyId: req.companyId,
      naziv,
      opis,
      clanovi: validMemberIds,
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

// PUT /api/chatrooms/:id - ažuriranje (dostupno svim prijavljenim korisnicima)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const chatroom = await ChatRoom.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!chatroom) {
      return res.status(404).json({ success: false, message: 'Chat soba nije pronađena' });
    }

    if (req.body.naziv || req.body.name) chatroom.naziv = req.body.naziv || req.body.name;
    if (req.body.opis || req.body.description) chatroom.opis = req.body.opis || req.body.description;
    if (req.body.clanovi || req.body.members) {
      const nextMembers = [...new Set((req.body.clanovi || req.body.members).map(String))];
      if (!nextMembers.includes(String(req.user._id))) {
        nextMembers.push(String(req.user._id));
      }
      const validMembers = await User.find({
        _id: { $in: nextMembers },
        companyId: req.companyId,
        aktivan: true,
      }).select('_id');
      chatroom.clanovi = validMembers.map((member) => member._id);
    }
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
router.delete('/:id', authenticate, checkRole(['admin', 'menadzer']), async (req, res) => {
  try {
    const chatroom = await ChatRoom.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!chatroom) {
      return res.status(404).json({ success: false, message: 'Chat soba nije pronađena' });
    }

    // Obrisi sve poruke vezane uz ovu sobu
    await Message.deleteMany({ chatRoomId: chatroom._id, companyId: req.companyId });

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
router.post('/:id/members', authenticate, async (req, res) => {
  try {
    const { userId } = req.body;
    const chatroom = await ChatRoom.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!chatroom) {
      return res.status(404).json({ success: false, message: 'Chat soba nije pronađena' });
    }

    const targetUser = await User.findOne({ _id: userId, companyId: req.companyId, aktivan: true }).select('_id');
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'Korisnik nije pronađen u vašoj firmi' });
    }

    if (chatroom.clanovi.map(String).includes(String(targetUser._id))) {
      return res.status(400).json({ success: false, message: 'Korisnik je već član ove sobe' });
    }

    chatroom.clanovi.push(targetUser._id);
    await chatroom.save();
    await chatroom.populate('clanovi', 'ime prezime email uloga');

    res.json({ success: true, message: 'Član dodan', data: chatroom });
  } catch (error) {
    console.error('Greška pri dodavanju člana:', error);
    res.status(500).json({ success: false, message: 'Greška pri dodavanju člana' });
  }
});

// DELETE /api/chatrooms/:id/members/:userId - ukloni člana
router.delete('/:id/members/:userId', authenticate, async (req, res) => {
  try {
    const chatroom = await ChatRoom.findOne({ _id: req.params.id, companyId: req.companyId });
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

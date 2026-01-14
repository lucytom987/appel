const express = require('express');
const router = express.Router();
const SimCard = require('../models/SimCard');
const Elevator = require('../models/Elevator');
const { authenticate, checkRole } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

// GET /api/simcards - lista kartica (filtri)
router.get('/', authenticate, async (req, res) => {
  try {
    const { aktivna, elevatorId, limit = 100, skip = 0 } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 0, 1), 200);
    const parsedSkip = Math.max(parseInt(skip, 10) || 0, 0);
    const filter = {};
    if (typeof aktivna !== 'undefined') filter.aktivna = aktivna === 'true' || aktivna === true;
    if (elevatorId) filter.elevatorId = elevatorId;

    const simcards = await SimCard.find(filter)
      .populate('elevatorId', 'nazivStranke ulica brojDizala')
      .sort({ datumIsteka: 1 })
      .skip(parsedSkip)
      .limit(parsedLimit)
      .lean();

    const total = await SimCard.countDocuments(filter);

    res.json({ success: true, count: simcards.length, total, data: simcards });
  } catch (error) {
    console.error('Greška pri dohvaćanju SIM kartica:', error);
    res.status(500).json({ success: false, message: 'Greška pri dohvaćanju SIM kartica' });
  }
});

// GET /api/simcards/expiring/soon - istječu uskoro
router.get('/expiring/soon', authenticate, async (req, res) => {
  try {
    const daysAhead = parseInt(req.query.days, 10) || 7;
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + daysAhead);

    const simcards = await SimCard.find({
      datumIsteka: { $gte: today, $lte: futureDate },
      aktivna: true
    })
      .populate('elevatorId', 'nazivStranke ulica brojDizala')
      .sort({ datumIsteka: 1 })
      .lean();

    res.json({ success: true, count: simcards.length, data: simcards });
  } catch (error) {
    console.error('Greška pri dohvaćanju SIM kartica koje istječu:', error);
    res.status(500).json({ success: false, message: 'Greška pri dohvaćanju SIM kartica koje istječu' });
  }
});

// GET /api/simcards/stats/overview - statistika
router.get('/stats/overview', authenticate, async (req, res) => {
  try {
    const total = await SimCard.countDocuments();
    const active = await SimCard.countDocuments({ aktivna: true });
    const inactive = await SimCard.countDocuments({ aktivna: false });

    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + 7);

    const expiringSoon = await SimCard.countDocuments({
      datumIsteka: { $gte: today, $lte: futureDate },
      aktivna: true
    });

    res.json({ success: true, data: { total, active, inactive, expiringSoon } });
  } catch (error) {
    console.error('Greška pri dohvaćanju statistike SIM kartica:', error);
    res.status(500).json({ success: false, message: 'Greška pri dohvaćanju statistike' });
  }
});

// GET /api/simcards/:id - detalj
router.get('/:id', authenticate, async (req, res) => {
  try {
    const simcard = await SimCard.findById(req.params.id)
      .populate('elevatorId', 'nazivStranke ulica mjesto brojDizala')
      .lean();

    if (!simcard) {
      return res.status(404).json({ success: false, message: 'SIM kartica nije pronađena' });
    }

    res.json({ success: true, data: simcard });
  } catch (error) {
    console.error('Greška pri dohvaćanju SIM kartice:', error);
    res.status(500).json({ success: false, message: 'Greška pri dohvaćanju SIM kartice' });
  }
});

// POST /api/simcards - kreiraj
router.post('/', authenticate, async (req, res) => {
  try {
    const simcard = new SimCard(req.body);
    await simcard.save();

    if (simcard.elevatorId) {
      await Elevator.findByIdAndUpdate(simcard.elevatorId, { simCard: simcard._id });
    }

    await logAction({
      korisnikId: req.user._id,
      akcija: 'CREATE',
      entitet: 'SimCard',
      entitetId: simcard._id,
      entitetNaziv: simcard.serijaSimKartice,
      noveVrijednosti: simcard.toObject(),
      ipAdresa: req.ip,
      opis: 'Kreirana SIM kartica'
    });

    await simcard.populate('elevatorId', 'nazivStranke ulica brojDizala');

    res.status(201).json({ success: true, message: 'SIM kartica kreirana', data: simcard });
  } catch (error) {
    console.error('Greška pri kreiranju SIM kartice:', error);
    res.status(500).json({ success: false, message: 'Greška pri kreiranju SIM kartice', error: error.message });
  }
});

// PUT /api/simcards/:id - ažuriraj
router.put('/:id', authenticate, async (req, res) => {
  try {
    const oldSimCard = await SimCard.findById(req.params.id).lean();
    if (!oldSimCard) {
      return res.status(404).json({ success: false, message: 'SIM kartica nije pronađena' });
    }

    const simcard = await SimCard.findByIdAndUpdate(
      req.params.id,
      { ...req.body, azuriranDatum: new Date() },
      { new: true, runValidators: true }
    ).populate('elevatorId', 'nazivStranke ulica brojDizala');

    if (oldSimCard.elevatorId && String(oldSimCard.elevatorId) !== String(simcard.elevatorId || '')) {
      await Elevator.findByIdAndUpdate(oldSimCard.elevatorId, { $unset: { simCard: 1 } });
    }
    if (simcard.elevatorId) {
      await Elevator.findByIdAndUpdate(simcard.elevatorId, { simCard: simcard._id });
    }

    await logAction({
      korisnikId: req.user._id,
      akcija: 'UPDATE',
      entitet: 'SimCard',
      entitetId: simcard._id,
      entitetNaziv: simcard.serijaSimKartice,
      noveVrijednosti: simcard.toObject(),
      ipAdresa: req.ip,
      opis: 'Ažurirana SIM kartica'
    });

    res.json({ success: true, message: 'SIM kartica ažurirana', data: simcard });
  } catch (error) {
    console.error('Greška pri ažuriranju SIM kartice:', error);
    res.status(500).json({ success: false, message: 'Greška pri ažuriranju SIM kartice', error: error.message });
  }
});

// DELETE /api/simcards/:id - brisanje
router.delete('/:id', authenticate, checkRole(['menadzer', 'admin']), async (req, res) => {
  try {
    const simcard = await SimCard.findById(req.params.id);
    if (!simcard) {
      return res.status(404).json({ success: false, message: 'SIM kartica nije pronađena' });
    }

    if (simcard.elevatorId) {
      await Elevator.findByIdAndUpdate(simcard.elevatorId, { $unset: { simCard: 1 } });
    }

    await simcard.deleteOne();

    await logAction({
      korisnikId: req.user._id,
      akcija: 'DELETE',
      entitet: 'SimCard',
      entitetId: req.params.id,
      entitetNaziv: simcard.serijaSimKartice,
      stareVrijednosti: simcard.toObject(),
      ipAdresa: req.ip,
      opis: 'Obrisana SIM kartica'
    });

    res.json({ success: true, message: 'SIM kartica obrisana' });
  } catch (error) {
    console.error('Greška pri brisanju SIM kartice:', error);
    res.status(500).json({ success: false, message: 'Greška pri brisanju SIM kartice' });
  }
});

module.exports = router;

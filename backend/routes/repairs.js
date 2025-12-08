const express = require('express');
const router = express.Router();
const Repair = require('../models/Repair');
const Elevator = require('../models/Elevator');
const { authenticate, checkRole } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

// GET /api/repairs - popis popravaka (filtri)
router.get('/', authenticate, async (req, res) => {
  try {
    const { elevatorId, status, startDate, endDate, serviserId, updatedAfter, limit = 100, skip = 0 } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 0, 1), 200);
    const parsedSkip = Math.max(parseInt(skip, 10) || 0, 0);
    const filter = {};

    if (elevatorId) filter.elevatorId = elevatorId;
    if (status) filter.status = status;
    if (serviserId) filter.serviserID = serviserId;
    if (updatedAfter) {
      const afterDate = new Date(updatedAfter);
      filter.azuriranDatum = { $gte: afterDate };
      console.log('Delta sync repairs, updatedAfter:', afterDate.toISOString());
    }
    if (startDate || endDate) {
      filter.datumPrijave = {};
      if (startDate) filter.datumPrijave.$gte = new Date(startDate);
      if (endDate) filter.datumPrijave.$lte = new Date(endDate);
    }

    const repairs = await Repair.find(filter)
      .populate('elevatorId', 'nazivStranke ulica mjesto brojDizala')
      .populate('serviserID', 'ime prezime email')
      .sort({ datumPrijave: -1 })
      .skip(parsedSkip)
      .limit(parsedLimit)
      .lean();

    const total = await Repair.countDocuments(filter);

    res.json({ success: true, count: repairs.length, total, data: repairs });
  } catch (error) {
    console.error('Greška pri dohvaćanju popravaka:', error);
    res.status(500).json({ success: false, message: 'Greška pri dohvaćanju popravaka' });
  }
});

// GET /api/repairs/stats/overview - osnovna statistika
router.get('/stats/overview', authenticate, async (req, res) => {
  try {
    const total = await Repair.countDocuments();
    const pending = await Repair.countDocuments({ status: 'pending' });
    const inProgress = await Repair.countDocuments({ status: 'in_progress' });
    const completed = await Repair.countDocuments({ status: 'completed' });

    res.json({ success: true, data: { total, pending, inProgress, completed } });
  } catch (error) {
    console.error('Greška pri dohvaćanju statistike:', error);
    res.status(500).json({ success: false, message: 'Greška pri dohvaćanju statistike' });
  }
});

// GET /api/repairs/stats/monthly - statistika po mjesecu
router.get('/stats/monthly', authenticate, async (req, res) => {
  try {
    const { year, month } = req.query;
    const currentYear = year ? parseInt(year, 10) : new Date().getFullYear();
    const currentMonth = month ? parseInt(month, 10) : new Date().getMonth() + 1;
    const startDate = new Date(currentYear, currentMonth - 1, 1);
    const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59);

    const prijavljeni = await Repair.countDocuments({
      datumPrijave: { $gte: startDate, $lte: endDate }
    });

    const zavrseni = await Repair.countDocuments({
      datumPopravka: { $gte: startDate, $lte: endDate },
      status: 'completed'
    });

    const otvoreni = await Repair.countDocuments({
      datumPrijave: { $gte: startDate, $lte: endDate },
      status: { $in: ['pending', 'in_progress'] }
    });

    res.json({
      success: true,
      data: {
        year: currentYear,
        month: currentMonth,
        prijavljeni,
        zavrseni,
        otvoreni
      }
    });
  } catch (error) {
    console.error('Greška pri dohvaćanju statistike:', error);
    res.status(500).json({ success: false, message: 'Greška pri dohvaćanju statistike' });
  }
});

// GET /api/repairs/:id - detalj popravka
router.get('/:id', authenticate, async (req, res) => {
  try {
    const repair = await Repair.findById(req.params.id)
      .populate('elevatorId', 'nazivStranke ulica mjesto brojDizala')
      .populate('serviserID', 'ime prezime email uloga')
      .lean();

    if (!repair) {
      return res.status(404).json({ success: false, message: 'Popravak nije pronađen' });
    }

    res.json({ success: true, data: repair });
  } catch (error) {
    console.error('Greška pri dohvaćanju popravka:', error);
    res.status(500).json({ success: false, message: 'Greška pri dohvaćanju popravka' });
  }
});

// POST /api/repairs - kreiraj popravak
router.post('/', authenticate, async (req, res) => {
  try {
    const elevator = await Elevator.findById(req.body.elevatorId || req.body.elevator);
    if (!elevator) {
      return res.status(404).json({ success: false, message: 'Dizalo nije pronađeno' });
    }

    const repair = new Repair({
      ...req.body,
      elevatorId: req.body.elevatorId || req.body.elevator,
      serviserID: req.user._id,
      status: req.body.status || 'pending',
      datumPrijave: req.body.datumPrijave || new Date(),
    });

    await repair.save();

    await logAction({
      korisnikId: req.user._id,
      akcija: 'CREATE',
      entitet: 'Repair',
      entitetId: repair._id,
      entitetNaziv: elevator.nazivStranke,
      noveVrijednosti: repair.toObject(),
      ipAdresa: req.ip,
      opis: 'Kreiran novi popravak'
    });

    await repair.populate('elevatorId', 'nazivStranke ulica mjesto brojDizala');
    await repair.populate('serviserID', 'ime prezime email');

    res.status(201).json({ success: true, message: 'Popravak kreiran', data: repair });
  } catch (error) {
    console.error('Greška pri kreiranju popravka:', error);
    res.status(500).json({ success: false, message: 'Greška pri kreiranju popravka', error: error.message });
  }
});

// PUT /api/repairs/:id - ažuriraj popravak (serviser može ažurirati svoj rad)
router.put('/:id', authenticate, checkRole(['serviser', 'menadzer', 'admin']), async (req, res) => {
  try {
    const existing = await Repair.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Popravak nije pronađen' });
    }

    // ako se zaključuje popravak
    if (req.body.status === 'completed' && existing.status !== 'completed') {
      req.body.datumPopravka = req.body.datumPopravka || new Date();
    }

    const repair = await Repair.findByIdAndUpdate(
      req.params.id,
      { ...req.body, azuriranDatum: new Date() },
      { new: true, runValidators: true }
    )
      .populate('elevatorId', 'nazivStranke ulica mjesto brojDizala')
      .populate('serviserID', 'ime prezime email');

    await logAction({
      korisnikId: req.user._id,
      akcija: 'UPDATE',
      entitet: 'Repair',
      entitetId: repair._id,
      entitetNaziv: repair.elevatorId ? `${repair.elevatorId.nazivStranke} - ${repair.elevatorId.brojDizala}` : 'Nepoznato dizalo',
      noveVrijednosti: repair.toObject(),
      ipAdresa: req.ip,
      opis: 'Ažuriran popravak'
    });

    res.json({ success: true, message: 'Popravak ažuriran', data: repair });
  } catch (error) {
    console.error('Greška pri ažuriranju popravka:', error);
    res.status(500).json({ success: false, message: 'Greška pri ažuriranju popravka', error: error.message });
  }
});

// DELETE /api/repairs/:id - brisanje
router.delete('/:id', authenticate, checkRole(['serviser', 'menadzer', 'admin']), async (req, res) => {
  try {
    const repair = await Repair.findById(req.params.id);
    if (!repair) {
      return res.status(404).json({ success: false, message: 'Popravak nije pronađen' });
    }

    await repair.deleteOne();

    await logAction({
      korisnikId: req.user._id,
      akcija: 'DELETE',
      entitet: 'Repair',
      entitetId: req.params.id,
      entitetNaziv: repair.opisKvara || 'Popravak',
      stareVrijednosti: repair.toObject(),
      ipAdresa: req.ip,
      opis: 'Obrisan popravak'
    });

    res.json({ success: true, message: 'Popravak obrisan' });
  } catch (error) {
    console.error('Greška pri brisanju popravka:', error);
    res.status(500).json({ success: false, message: 'Greška pri brisanju popravka' });
  }
});

module.exports = router;

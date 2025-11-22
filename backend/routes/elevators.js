const express = require('express');
const router = express.Router();
const Elevator = require('../models/Elevator');
const { authenticate, checkRole } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

// @route   GET /api/elevators
// @desc    Dohvati sva dizala (za offline sync)
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    const elevators = await Elevator.find()
      .sort({ nazivStranke: 1 })
      .lean();

    res.json({
      success: true,
      count: elevators.length,
      data: elevators
    });
  } catch (error) {
    console.error('❌ Greška pri dohvaćanju dizala:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri dohvaćanju dizala'
    });
  }
});

// @route   GET /api/elevators/stats/overview
// @desc    Statistika - pregled stanja dizala
// @access  Private
router.get('/stats/overview', authenticate, async (req, res) => {
  try {
    const total = await Elevator.countDocuments();
    const active = await Elevator.countDocuments({ status: 'aktivan' });
    const outOfOrder = await Elevator.countDocuments({ status: 'u kvaru' });
    const maintenance = await Elevator.countDocuments({ status: 'u servisu' });

    res.json({
      success: true,
      data: {
        total,
        active,
        outOfOrder,
        maintenance
      }
    });
  } catch (error) {
    console.error('❌ Greška pri dohvaćanju statistike:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri dohvaćanju statistike'
    });
  }
});

// @route   GET /api/elevators/:id
// @desc    Dohvati jedno dizalo sa svim detaljima
// @access  Private
router.get('/:id', authenticate, async (req, res) => {
  try {
    const elevator = await Elevator.findById(req.params.id)
      .lean();

    if (!elevator) {
      return res.status(404).json({
        success: false,
        message: 'Dizalo nije pronađeno'
      });
    }

    res.json({
      success: true,
      data: elevator
    });
  } catch (error) {
    console.error('❌ Greška pri dohvaćanju dizala:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri dohvaćanju dizala'
    });
  }
});

// @route   POST /api/elevators
// @desc    Kreiraj novo dizalo
// @access  Private
router.post('/', authenticate, async (req, res) => {
  try {
    const elevator = new Elevator({
      ...req.body,
      kreiranOd: req.user._id
    });

    await elevator.save();

    // Audit log
    await logAction({
      korisnikId: req.user._id,
      akcija: 'CREATE',
      entitet: 'Elevator',
      entitetId: elevator._id,
      entitetNaziv: `${elevator.nazivStranke} - ${elevator.brojDizala}`,
      noveVrijednosti: elevator.toObject(),
      ipAdresa: req.ip,
      opis: 'Kreirano novo dizalo'
    });

    res.status(201).json({
      success: true,
      message: 'Dizalo uspješno kreirano',
      data: elevator
    });
  } catch (error) {
    console.error('❌ Greška pri kreiranju dizala:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri kreiranju dizala',
      error: error.message
    });
  }
});

// @route   PUT /api/elevators/:id
// @route   PUT /api/elevators/:id
// @desc    Ažuriraj dizalo
// @access  Private (Menadžer or Admin)
router.put('/:id', authenticate, checkRole(['menadzer', 'admin']), async (req, res) => {
  try {
    const oldElevator = await Elevator.findById(req.params.id).lean();
    
    if (!oldElevator) {
      return res.status(404).json({
        success: false,
        message: 'Dizalo nije pronađeno'
      });
    }

    const updateData = { ...req.body };
    // Ako je zadnjiServis i/ili intervalServisa zadano, izračunaj sljedeći servis
    const zadnjiServis = updateData.zadnjiServis ?? oldElevator.zadnjiServis;
    const intervalServisa = updateData.intervalServisa ?? oldElevator.intervalServisa ?? 1;
    if (zadnjiServis) {
      const nextDate = new Date(zadnjiServis);
      nextDate.setMonth(nextDate.getMonth() + Number(intervalServisa || 1));
      updateData.sljedeciServis = nextDate;
    }
    updateData.azuriranDatum = new Date();

    const elevator = await Elevator.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    // Audit log
    await logAction({
      korisnikId: req.user._id,
      akcija: 'UPDATE',
      entitet: 'Elevator',
      entitetId: elevator._id,
      entitetNaziv: `${elevator.nazivStranke} - ${elevator.brojDizala}`,
      stareVrijednosti: { nazivStranke: oldElevator.nazivStranke, status: oldElevator.status },
      noveVrijednosti: { nazivStranke: elevator.nazivStranke, status: elevator.status },
      ipAdresa: req.ip,
      opis: 'Ažurirano dizalo'
    });

    res.json({
      success: true,
      message: 'Dizalo uspješno ažurirano',
      data: elevator
    });
  } catch (error) {
    console.error('❌ Greška pri ažuriranju dizala:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri ažuriranju dizala',
      error: error.message
    });
  }
});

// @route   DELETE /api/elevators/:id
// @desc    Obriši dizalo
// @access  Private (Menadžer or Admin)
router.delete('/:id', authenticate, checkRole(['menadzer', 'admin']), async (req, res) => {
  try {
    const elevator = await Elevator.findById(req.params.id);

    if (!elevator) {
      return res.status(404).json({
        success: false,
        message: 'Dizalo nije pronađeno'
      });
    }

    await elevator.deleteOne();

    // Audit log
    await logAction({
      korisnikId: req.user._id,
      akcija: 'DELETE',
      entitet: 'Elevator',
      entitetId: req.params.id,
      entitetNaziv: `${elevator.nazivStranke} - ${elevator.brojDizala}`,
      stareVrijednosti: elevator.toObject(),
      ipAdresa: req.ip,
      opis: 'Obrisano dizalo'
    });

    res.json({
      success: true,
      message: 'Dizalo uspješno obrisano'
    });
  } catch (error) {
    console.error('❌ Greška pri brisanju dizala:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri brisanju dizala'
    });
  }
});

module.exports = router;

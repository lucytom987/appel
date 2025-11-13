const express = require('express');
const router = express.Router();
const SimCard = require('../models/SimCard');
const Elevator = require('../models/Elevator');
const { authenticate, checkRole } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

// @route   GET /api/simcards
// @desc    Dohvati sve SIM kartice
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, provider } = req.query;
    
    let filter = {};
    if (status) filter.status = status;
    if (provider) filter.provider = provider;

    const simcards = await SimCard.find(filter)
      .populate('assignedTo', 'address buildingCode')
      .sort({ expiryDate: 1 })
      .lean();

    res.json({
      success: true,
      count: simcards.length,
      data: simcards
    });
  } catch (error) {
    console.error('❌ Greška pri dohvaćanju SIM kartica:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri dohvaćanju SIM kartica'
    });
  }
});

// @route   GET /api/simcards/expiring/soon
// @desc    SIM kartice koje ističu uskoro (7 dana)
// @access  Private
router.get('/expiring/soon', authenticate, async (req, res) => {
  try {
    const daysAhead = parseInt(req.query.days) || 7;
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + daysAhead);

    const simcards = await SimCard.find({
      expiryDate: { $gte: today, $lte: futureDate },
      status: 'active'
    })
      .populate('assignedTo', 'address buildingCode')
      .sort({ expiryDate: 1 })
      .lean();

    res.json({
      success: true,
      count: simcards.length,
      data: simcards
    });
  } catch (error) {
    console.error('❌ Greška pri dohvaćanju SIM kartica koje ističu:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri dohvaćanju SIM kartica koje ističu'
    });
  }
});

// @route   GET /api/simcards/stats/overview
// @desc    Statistika SIM kartica
// @access  Private
router.get('/stats/overview', authenticate, async (req, res) => {
  try {
    const total = await SimCard.countDocuments();
    const active = await SimCard.countDocuments({ status: 'active' });
    const expired = await SimCard.countDocuments({ status: 'expired' });
    const inactive = await SimCard.countDocuments({ status: 'inactive' });

    // Kartice koje ističu u sljedećih 7 dana
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(today.getDate() + 7);

    const expiringSoon = await SimCard.countDocuments({
      expiryDate: { $gte: today, $lte: futureDate },
      status: 'active'
    });

    res.json({
      success: true,
      data: {
        total,
        active,
        expired,
        inactive,
        expiringSoon
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

// @route   GET /api/simcards/:id
// @desc    Dohvati jednu SIM karticu
// @access  Private
router.get('/:id', authenticate, async (req, res) => {
  try {
    const simcard = await SimCard.findById(req.params.id)
      .populate('assignedTo', 'address buildingCode location')
      .lean();

    if (!simcard) {
      return res.status(404).json({
        success: false,
        message: 'SIM kartica nije pronađena'
      });
    }

    res.json({
      success: true,
      data: simcard
    });
  } catch (error) {
    console.error('❌ Greška pri dohvaćanju SIM kartice:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri dohvaćanju SIM kartice'
    });
  }
});

// @route   POST /api/simcards
// @desc    Kreiraj novu SIM karticu
// @access  Private (Admin, Manager)
router.post('/', authenticate, checkRole(['admin', 'menadzer']), async (req, res) => {
  try {
    const simcard = new SimCard(req.body);
    await simcard.save();

    // Ako je kartica dodijeljena dizalu, ažuriraj dizalo
    if (simcard.assignedTo) {
      await Elevator.findByIdAndUpdate(simcard.assignedTo, {
        simCard: simcard._id
      });
    }

    // Audit log
    await logAction(req.user.id, 'CREATE', 'SimCard', simcard._id, {
      phoneNumber: simcard.phoneNumber,
      provider: simcard.provider
    });

    await simcard.populate('assignedTo', 'address buildingCode');

    res.status(201).json({
      success: true,
      message: 'SIM kartica uspješno kreirana',
      data: simcard
    });
  } catch (error) {
    console.error('❌ Greška pri kreiranju SIM kartice:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri kreiranju SIM kartice',
      error: error.message
    });
  }
});

// @route   PUT /api/simcards/:id
// @desc    Ažuriraj SIM karticu
// @access  Private (Admin, Manager)
router.put('/:id', authenticate, checkRole(['admin', 'menadzer']), async (req, res) => {
  try {
    const oldSimCard = await SimCard.findById(req.params.id).lean();

    if (!oldSimCard) {
      return res.status(404).json({
        success: false,
        message: 'SIM kartica nije pronađena'
      });
    }

    const simcard = await SimCard.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('assignedTo', 'address buildingCode');

    // Ako se promijenilo dizalo, ažuriraj oba dizala
    if (oldSimCard.assignedTo && oldSimCard.assignedTo.toString() !== simcard.assignedTo?.toString()) {
      // Ukloni iz starog dizala
      await Elevator.findByIdAndUpdate(oldSimCard.assignedTo, {
        $unset: { simCard: 1 }
      });
    }

    if (simcard.assignedTo) {
      // Dodaj na novo dizalo
      await Elevator.findByIdAndUpdate(simcard.assignedTo, {
        simCard: simcard._id
      });
    }

    // Audit log
    await logAction(req.user.id, 'UPDATE', 'SimCard', simcard._id, {
      phoneNumber: simcard.phoneNumber
    });

    res.json({
      success: true,
      message: 'SIM kartica uspješno ažurirana',
      data: simcard
    });
  } catch (error) {
    console.error('❌ Greška pri ažuriranju SIM kartice:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri ažuriranju SIM kartice',
      error: error.message
    });
  }
});

// @route   DELETE /api/simcards/:id
// @desc    Obriši SIM karticu
// @access  Private (Admin only)
router.delete('/:id', authenticate, checkRole(['admin']), async (req, res) => {
  try {
    const simcard = await SimCard.findById(req.params.id);

    if (!simcard) {
      return res.status(404).json({
        success: false,
        message: 'SIM kartica nije pronađena'
      });
    }

    // Ukloni referencu iz dizala ako postoji
    if (simcard.assignedTo) {
      await Elevator.findByIdAndUpdate(simcard.assignedTo, {
        $unset: { simCard: 1 }
      });
    }

    await simcard.deleteOne();

    // Audit log
    await logAction(req.user.id, 'DELETE', 'SimCard', req.params.id, {
      phoneNumber: simcard.phoneNumber
    });

    res.json({
      success: true,
      message: 'SIM kartica uspješno obrisana'
    });
  } catch (error) {
    console.error('❌ Greška pri brisanju SIM kartice:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri brisanju SIM kartice'
    });
  }
});

module.exports = router;

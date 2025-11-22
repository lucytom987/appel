const express = require('express');
const router = express.Router();
const Service = require('../models/Service');
const Elevator = require('../models/Elevator');
const { authenticate, checkRole } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

// @route   GET /api/services
// @desc    Dohvati sve servise (sa filterima)
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    const { elevatorId, status, startDate, endDate, technician } = req.query;
    
    let filter = {};
    
    if (elevatorId) filter.elevator = elevatorId;
    if (status) filter.status = status;
    if (technician) filter.performedBy = technician;
    
    if (startDate || endDate) {
      filter.datum = {};
      if (startDate) filter.datum.$gte = new Date(startDate);
      if (endDate) filter.datum.$lte = new Date(endDate);
    }

    const services = await Service.find(filter)
      .populate('elevatorId', 'brojUgovora nazivStranke ulica mjesto brojDizala')
      .populate('serviserID', 'ime prezime email')
      .sort({ datum: -1 })
      .lean();

    res.json({
      success: true,
      count: services.length,
      data: services
    });
  } catch (error) {
    console.error('❌ Greška pri dohvaćanju servisa:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri dohvaćanju servisa'
    });
  }
});

// @route   GET /api/services/stats/monthly
// @desc    Statistika servisa po mjesecu
// @access  Private
router.get('/stats/monthly', authenticate, async (req, res) => {
  try {
    const { year, month } = req.query;
    
    const currentYear = year ? parseInt(year) : new Date().getFullYear();
    const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;

    const startDate = new Date(currentYear, currentMonth - 1, 1);
    const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59);

    const total = await Service.countDocuments({
      datum: { $gte: startDate, $lte: endDate }
    });

    // Koliko dizala još treba servisirat ovaj mjesec
    const totalElevators = await Elevator.countDocuments();
    const servicedElevatorIds = await Service.distinct('elevatorId', {
      datum: { $gte: startDate, $lte: endDate }
    });
    const completed = total;
    const pending = 0;
    const needsService = totalElevators - servicedElevatorIds.length;

    res.json({
      success: true,
      data: {
        year: currentYear,
        month: currentMonth,
        completed,
        pending,
        total,
        needsService
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

// @route   GET /api/services/:id
// @desc    Dohvati jedan servis
// @access  Private
router.get('/:id', authenticate, async (req, res) => {
  try {
    const service = await Service.findById(req.params.id)
      .populate('elevatorId', 'brojUgovora nazivStranke ulica mjesto brojDizala')
      .populate('serviserID', 'ime prezime email uloga')
      .lean();

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Servis nije pronađen'
      });
    }

    res.json({
      success: true,
      data: service
    });
  } catch (error) {
    console.error('❌ Greška pri dohvaćanju servisa:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri dohvaćanju servisa'
    });
  }
});

// @route   POST /api/services
// @desc    Kreiraj novi servis
// @access  Private (Technician, Manager, Admin)
router.post('/', authenticate, async (req, res) => {
  try {
    // Provjeri da li dizalo postoji
    const elevatorId = req.body.elevatorId || req.body.elevator;
    const elevator = await Elevator.findById(elevatorId);
    if (!elevator) {
      return res.status(404).json({
        success: false,
        message: 'Dizalo nije pronađeno'
      });
    }

    const service = new Service({
      ...req.body,
      elevatorId: elevatorId,
      serviserID: req.user._id
    });

    await service.save();

    // Ažuriraj zadnji servis na dizalu
    elevator.zadnjiServis = service.datum;
    if (service.sljedeciServis) {
      elevator.sljedeciServis = service.sljedeciServis;
    }
    await elevator.save();

    // Audit log
    await logAction({
      korisnikId: req.user._id,
      akcija: 'CREATE',
      entitet: 'Service',
      entitetId: service._id,
      entitetNaziv: `${elevator.nazivStranke} - ${elevator.brojDizala}`,
      noveVrijednosti: service.toObject(),
      ipAdresa: req.ip,
      opis: 'Kreiran novi servis'
    });

    // Populate prije slanja
    await service.populate('elevatorId', 'brojUgovora nazivStranke ulica mjesto brojDizala');
    await service.populate('serviserID', 'ime prezime email');

    res.status(201).json({
      success: true,
      message: 'Servis uspješno kreiran',
      data: service
    });
  } catch (error) {
    console.error('❌ Greška pri kreiranju servisa:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri kreiranju servisa',
      error: error.message
    });
  }
});

// @route   PUT /api/services/:id
// @desc    Ažuriraj servis
// @access  Private (Menadžer or Admin)
router.put('/:id', authenticate, checkRole(['menadzer', 'admin']), async (req, res) => {
  try {
    const existingService = await Service.findById(req.params.id);

    if (!existingService) {
      return res.status(404).json({
        success: false,
        message: 'Servis nije pronađen'
      });
    }

    const service = await Service.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('elevatorId', 'brojUgovora nazivStranke brojDizala')
      .populate('serviserID', 'ime prezime email');

    // Audit log
    await logAction({
      korisnikId: req.user._id,
      akcija: 'UPDATE',
      entitet: 'Service',
      entitetId: service._id,
      entitetNaziv: service.elevatorId ? `${service.elevatorId.nazivStranke} - ${service.elevatorId.brojDizala}` : 'Nepoznato dizalo',
      noveVrijednosti: service.toObject(),
      ipAdresa: req.ip,
      opis: 'Ažuriran servis'
    });

    res.json({
      success: true,
      message: 'Servis uspješno ažuriran',
      data: service
    });
  } catch (error) {
    console.error('❌ Greška pri ažuriranju servisa:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri ažuriranju servisa',
      error: error.message
    });
  }
});

// @route   DELETE /api/services/:id
// @desc    Obriši servis
// @access  Private (Serviser, Menadžer or Admin)
router.delete('/:id', authenticate, checkRole(['serviser', 'menadzer', 'admin']), async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Servis nije pronađen'
      });
    }

    await service.deleteOne();

    // Audit log
    await logAction({
      korisnikId: req.user._id,
      akcija: 'DELETE',
      entitet: 'Service',
      entitetId: req.params.id,
      stareVrijednosti: service.toObject(),
      ipAdresa: req.ip,
      opis: 'Obrisan servis'
    });

    res.json({
      success: true,
      message: 'Servis uspješno obrisan'
    });
  } catch (error) {
    console.error('❌ Greška pri brisanju servisa:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri brisanju servisa'
    });
  }
});

module.exports = router;

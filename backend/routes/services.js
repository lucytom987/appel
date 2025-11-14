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
      filter.serviceDate = {};
      if (startDate) filter.serviceDate.$gte = new Date(startDate);
      if (endDate) filter.serviceDate.$lte = new Date(endDate);
    }

    const services = await Service.find(filter)
      .populate('elevator', 'address buildingCode location')
      .populate('performedBy', 'name email')
      .sort({ serviceDate: -1 })
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

    const completed = await Service.countDocuments({
      serviceDate: { $gte: startDate, $lte: endDate },
      status: 'completed'
    });

    const total = await Service.countDocuments({
      serviceDate: { $gte: startDate, $lte: endDate }
    });

    const pending = total - completed;

    // Koliko dizala još treba servisirat ovaj mjesec
    const totalElevators = await Elevator.countDocuments();
    const servicedElevatorIds = await Service.distinct('elevator', {
      serviceDate: { $gte: startDate, $lte: endDate }
    });
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
      .populate('elevator', 'address buildingCode location manufacturer model')
      .populate('performedBy', 'name email role')
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
    const elevator = await Elevator.findById(req.body.elevator);
    if (!elevator) {
      return res.status(404).json({
        success: false,
        message: 'Dizalo nije pronađeno'
      });
    }

    const service = new Service({
      ...req.body,
      performedBy: req.user.id
    });

    await service.save();

    // Ažuriraj zadnji servis na dizalu
    elevator.lastServiceDate = service.serviceDate;
    await elevator.save();

    // Audit log
    await logAction(req.user.id, 'CREATE', 'Service', service._id, {
      elevator: elevator.address,
      serviceDate: service.serviceDate
    });

    // Populate prije slanja
    await service.populate('elevator', 'address buildingCode');
    await service.populate('performedBy', 'name email');

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
      .populate('elevator', 'address buildingCode')
      .populate('performedBy', 'name email');

    // Audit log
    await logAction(req.user.id, 'UPDATE', 'Service', service._id, {
      elevator: service.elevator.address
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
    await logAction(req.user.id, 'DELETE', 'Service', req.params.id);

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

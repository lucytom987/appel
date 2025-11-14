const express = require('express');
const router = express.Router();
const Repair = require('../models/Repair');
const Elevator = require('../models/Elevator');
const { authenticate, checkRole } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

// @route   GET /api/repairs
// @desc    Dohvati sve popravke (sa filterima)
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    const { elevatorId, status, startDate, endDate, priority, technician } = req.query;
    
    let filter = {};
    
    if (elevatorId) filter.elevator = elevatorId;
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (technician) filter.reportedBy = technician;
    
    if (startDate || endDate) {
      filter.reportedDate = {};
      if (startDate) filter.reportedDate.$gte = new Date(startDate);
      if (endDate) filter.reportedDate.$lte = new Date(endDate);
    }

    const repairs = await Repair.find(filter)
      .populate('elevator', 'address buildingCode location')
      .populate('reportedBy', 'name email')
      .populate('repairedBy', 'name email')
      .sort({ reportedDate: -1 })
      .lean();

    res.json({
      success: true,
      count: repairs.length,
      data: repairs
    });
  } catch (error) {
    console.error('❌ Greška pri dohvaćanju popravaka:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri dohvaćanju popravaka'
    });
  }
});

// @route   GET /api/repairs/stats/overview
// @desc    Statistika popravaka - pregled
// @access  Private
router.get('/stats/overview', authenticate, async (req, res) => {
  try {
    const total = await Repair.countDocuments();
    const pending = await Repair.countDocuments({ status: 'pending' });
    const inProgress = await Repair.countDocuments({ status: 'in_progress' });
    const completed = await Repair.countDocuments({ status: 'completed' });
    const urgent = await Repair.countDocuments({ priority: 'urgent', status: { $ne: 'completed' } });

    res.json({
      success: true,
      data: {
        total,
        pending,
        inProgress,
        completed,
        urgent
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

// @route   GET /api/repairs/stats/monthly
// @desc    Statistika popravaka po mjesecu
// @access  Private
router.get('/stats/monthly', authenticate, async (req, res) => {
  try {
    const { year, month } = req.query;
    
    const currentYear = year ? parseInt(year) : new Date().getFullYear();
    const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;

    const startDate = new Date(currentYear, currentMonth - 1, 1);
    const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59);

    const reported = await Repair.countDocuments({
      reportedDate: { $gte: startDate, $lte: endDate }
    });

    const completed = await Repair.countDocuments({
      repairedDate: { $gte: startDate, $lte: endDate },
      status: 'completed'
    });

    const pending = await Repair.countDocuments({
      reportedDate: { $gte: startDate, $lte: endDate },
      status: { $in: ['pending', 'in_progress'] }
    });

    res.json({
      success: true,
      data: {
        year: currentYear,
        month: currentMonth,
        reported,
        completed,
        pending
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

// @route   GET /api/repairs/:id
// @desc    Dohvati jednu popravku
// @access  Private
router.get('/:id', authenticate, async (req, res) => {
  try {
    const repair = await Repair.findById(req.params.id)
      .populate('elevator', 'address buildingCode location manufacturer model')
      .populate('reportedBy', 'name email role')
      .populate('repairedBy', 'name email role')
      .lean();

    if (!repair) {
      return res.status(404).json({
        success: false,
        message: 'Popravak nije pronađen'
      });
    }

    res.json({
      success: true,
      data: repair
    });
  } catch (error) {
    console.error('❌ Greška pri dohvaćanju popravka:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri dohvaćanju popravka'
    });
  }
});

// @route   POST /api/repairs
// @desc    Kreiraj novu popravku / prijavi kvar
// @access  Private
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

    const repair = new Repair({
      ...req.body,
      reportedBy: req.user.id,
      reportedDate: req.body.reportedDate || new Date()
    });

    await repair.save();

    // Ako je prioritet 'urgent', možda postaviti dizalo na status 'out_of_order'
    if (repair.priority === 'urgent' && elevator.status !== 'out_of_order') {
      elevator.status = 'out_of_order';
      await elevator.save();
    }

    // Audit log
    await logAction(req.user.id, 'CREATE', 'Repair', repair._id, {
      elevator: elevator.address,
      description: repair.faultDescription,
      priority: repair.priority
    });

    // Populate prije slanja
    await repair.populate('elevator', 'address buildingCode');
    await repair.populate('reportedBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'Popravak uspješno prijavljen',
      data: repair
    });
  } catch (error) {
    console.error('❌ Greška pri kreiranju popravka:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri kreiranju popravka',
      error: error.message
    });
  }
});

// @route   PUT /api/repairs/:id
// @desc    Ažuriraj popravku (status, opis popravka, itd.)
// @access  Private (Menadžer or Admin)
router.put('/:id', authenticate, checkRole(['menadzer', 'admin']), async (req, res) => {
  try {
    const existingRepair = await Repair.findById(req.params.id);

    if (!existingRepair) {
      return res.status(404).json({
        success: false,
        message: 'Popravak nije pronađen'
      });
    }

    // Ako se postavlja status 'completed', postavi repairedBy i repairedDate
    if (req.body.status === 'completed' && existingRepair.status !== 'completed') {
      req.body.repairedBy = req.user.id;
      req.body.repairedDate = req.body.repairedDate || new Date();
    }

    const repair = await Repair.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('elevator', 'address buildingCode')
      .populate('reportedBy', 'name email')
      .populate('repairedBy', 'name email');

    // Audit log
    await logAction(req.user.id, 'UPDATE', 'Repair', repair._id, {
      elevator: repair.elevator.address,
      status: repair.status
    });

    res.json({
      success: true,
      message: 'Popravak uspješno ažuriran',
      data: repair
    });
  } catch (error) {
    console.error('❌ Greška pri ažuriranju popravka:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri ažuriranju popravka',
      error: error.message
    });
  }
});

// @route   DELETE /api/repairs/:id
// @desc    Obriši popravku
// @access  Private (Serviser, Menadžer or Admin)
router.delete('/:id', authenticate, checkRole(['serviser', 'menadzer', 'admin']), async (req, res) => {
  try {
    const repair = await Repair.findById(req.params.id);

    if (!repair) {
      return res.status(404).json({
        success: false,
        message: 'Popravak nije pronađen'
      });
    }

    await repair.deleteOne();

    // Audit log
    await logAction(req.user.id, 'DELETE', 'Repair', req.params.id);

    res.json({
      success: true,
      message: 'Popravak uspješno obrisan'
    });
  } catch (error) {
    console.error('❌ Greška pri brisanju popravka:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri brisanju popravka'
    });
  }
});

module.exports = router;

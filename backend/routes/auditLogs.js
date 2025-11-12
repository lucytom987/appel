const express = require('express');
const router = express.Router();
const AuditLog = require('../models/AuditLog');
const { authenticate, checkRole } = require('../middleware/auth');

// @route   GET /api/audit-logs
// @desc    Dohvati sve audit logove (sa filterima)
// @access  Private (Admin, Manager)
router.get('/', authenticate, checkRole(['admin', 'manager']), async (req, res) => {
  try {
    const { userId, action, entityType, startDate, endDate, limit = 100, skip = 0 } = req.query;
    
    let filter = {};
    
    if (userId) filter.user = userId;
    if (action) filter.action = action;
    if (entityType) filter.entityType = entityType;
    
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }

    const logs = await AuditLog.find(filter)
      .populate('user', 'name email role')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const total = await AuditLog.countDocuments(filter);

    res.json({
      success: true,
      count: logs.length,
      total,
      data: logs
    });
  } catch (error) {
    console.error('❌ Greška pri dohvaćanju audit logova:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri dohvaćanju audit logova'
    });
  }
});

// @route   GET /api/audit-logs/user/:userId
// @desc    Dohvati sve aktivnosti jednog korisnika
// @access  Private (Admin, Manager)
router.get('/user/:userId', authenticate, checkRole(['admin', 'manager']), async (req, res) => {
  try {
    const { limit = 50, skip = 0 } = req.query;

    const logs = await AuditLog.find({ user: req.params.userId })
      .populate('user', 'name email role')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const total = await AuditLog.countDocuments({ user: req.params.userId });

    res.json({
      success: true,
      count: logs.length,
      total,
      data: logs
    });
  } catch (error) {
    console.error('❌ Greška pri dohvaćanju korisničkih logova:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri dohvaćanju korisničkih logova'
    });
  }
});

// @route   GET /api/audit-logs/entity/:entityType/:entityId
// @desc    Dohvati sve aktivnosti na određenom entitetu
// @access  Private (Admin, Manager)
router.get('/entity/:entityType/:entityId', authenticate, checkRole(['admin', 'manager']), async (req, res) => {
  try {
    const logs = await AuditLog.find({
      entityType: req.params.entityType,
      entityId: req.params.entityId
    })
      .populate('user', 'name email role')
      .sort({ timestamp: -1 })
      .lean();

    res.json({
      success: true,
      count: logs.length,
      data: logs
    });
  } catch (error) {
    console.error('❌ Greška pri dohvaćanju entity logova:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri dohvaćanju entity logova'
    });
  }
});

// @route   DELETE /api/audit-logs/cleanup
// @desc    Očisti stare audit logove (starije od 90 dana)
// @access  Private (Admin only)
router.delete('/cleanup', authenticate, checkRole(['admin']), async (req, res) => {
  try {
    const daysToKeep = parseInt(req.query.days) || 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await AuditLog.deleteMany({
      timestamp: { $lt: cutoffDate }
    });

    res.json({
      success: true,
      message: `Obrisano ${result.deletedCount} starih audit logova`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('❌ Greška pri čišćenju audit logova:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri čišćenju audit logova'
    });
  }
});

// @route   GET /api/audit-logs/stats/activity
// @desc    Statistika aktivnosti po tipu akcije
// @access  Private (Admin, Manager)
router.get('/stats/activity', authenticate, checkRole(['admin', 'manager']), async (req, res) => {
  try {
    const stats = await AuditLog.aggregate([
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ Greška pri dohvaćanju statistike aktivnosti:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri dohvaćanju statistike aktivnosti'
    });
  }
});

// @route   GET /api/audit-logs/:id
// @desc    Dohvati jedan audit log
// @access  Private (Admin, Manager)
router.get('/:id', authenticate, checkRole(['admin', 'manager']), async (req, res) => {
  try {
    const log = await AuditLog.findById(req.params.id)
      .populate('user', 'name email role')
      .lean();

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Audit log nije pronađen'
      });
    }

    res.json({
      success: true,
      data: log
    });
  } catch (error) {
    console.error('❌ Greška pri dohvaćanju audit loga:', error);
    res.status(500).json({
      success: false,
      message: 'Greška pri dohvaćanju audit loga'
    });
  }
});

module.exports = router;

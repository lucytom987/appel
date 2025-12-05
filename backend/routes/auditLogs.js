const express = require('express');
const router = express.Router();
const AuditLog = require('../models/AuditLog');
const { authenticate, checkRole } = require('../middleware/auth');

// GET /api/audit-logs - dohvat svih logova s filtrima
router.get('/', authenticate, checkRole(['admin', 'menadzer']), async (req, res) => {
  try {
    const { userId, action, entityType, startDate, endDate, limit = 100, skip = 0 } = req.query;

    const filter = {};
    if (userId) filter.korisnikId = userId;
    if (action) filter.akcija = action;
    if (entityType) filter.entitet = entityType;
    if (startDate || endDate) {
      filter.kreiranDatum = {};
      if (startDate) filter.kreiranDatum.$gte = new Date(startDate);
      if (endDate) filter.kreiranDatum.$lte = new Date(endDate);
    }

    const logs = await AuditLog.find(filter)
      .populate('korisnikId', 'ime prezime email uloga')
      .sort({ kreiranDatum: -1 })
      .limit(parseInt(limit, 10))
      .skip(parseInt(skip, 10))
      .lean();

    const total = await AuditLog.countDocuments(filter);

    res.json({ success: true, count: logs.length, total, data: logs });
  } catch (error) {
    console.error('Greška pri dohvaćanju audit logova:', error);
    res.status(500).json({ success: false, message: 'Greška pri dohvaćanju audit logova' });
  }
});

// GET /api/audit-logs/user/:userId - aktivnosti korisnika
router.get('/user/:userId', authenticate, checkRole(['admin', 'menadzer']), async (req, res) => {
  try {
    const { limit = 50, skip = 0 } = req.query;
    const filter = { korisnikId: req.params.userId };

    const logs = await AuditLog.find(filter)
      .populate('korisnikId', 'ime prezime email uloga')
      .sort({ kreiranDatum: -1 })
      .limit(parseInt(limit, 10))
      .skip(parseInt(skip, 10))
      .lean();

    const total = await AuditLog.countDocuments(filter);

    res.json({ success: true, count: logs.length, total, data: logs });
  } catch (error) {
    console.error('Greška pri dohvaćanju korisničkih logova:', error);
    res.status(500).json({ success: false, message: 'Greška pri dohvaćanju korisničkih logova' });
  }
});

// GET /api/audit-logs/entity/:entityType/:entityId - aktivnosti po entitetu
router.get('/entity/:entityType/:entityId', authenticate, checkRole(['admin', 'menadzer']), async (req, res) => {
  try {
    const logs = await AuditLog.find({
      entitet: req.params.entityType,
      entitetId: req.params.entityId
    })
      .populate('korisnikId', 'ime prezime email uloga')
      .sort({ kreiranDatum: -1 })
      .lean();

    res.json({ success: true, count: logs.length, data: logs });
  } catch (error) {
    console.error('Greška pri dohvaćanju logova entiteta:', error);
    res.status(500).json({ success: false, message: 'Greška pri dohvaćanju logova entiteta' });
  }
});

// DELETE /api/audit-logs/cleanup - briše stare logove (default 90 dana)
router.delete('/cleanup', authenticate, checkRole(['admin']), async (req, res) => {
  try {
    const daysToKeep = parseInt(req.query.days, 10) || 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await AuditLog.deleteMany({ kreiranDatum: { $lt: cutoffDate } });

    res.json({
      success: true,
      message: `Obrisano ${result.deletedCount} starih audit logova`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Greška pri čišćenju audit logova:', error);
    res.status(500).json({ success: false, message: 'Greška pri čišćenju audit logova' });
  }
});

// GET /api/audit-logs/stats/activity - broj akcija po tipu
router.get('/stats/activity', authenticate, checkRole(['admin', 'menadzer']), async (req, res) => {
  try {
    const stats = await AuditLog.aggregate([
      { $group: { _id: '$akcija', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Greška pri statistici aktivnosti:', error);
    res.status(500).json({ success: false, message: 'Greška pri statistici aktivnosti' });
  }
});

// GET /api/audit-logs/:id - jedan log
router.get('/:id', authenticate, checkRole(['admin', 'menadzer']), async (req, res) => {
  try {
    const log = await AuditLog.findById(req.params.id)
      .populate('korisnikId', 'ime prezime email uloga')
      .lean();

    if (!log) {
      return res.status(404).json({ success: false, message: 'Audit log nije pronađen' });
    }

    res.json({ success: true, data: log });
  } catch (error) {
    console.error('Greška pri dohvaćanju audit loga:', error);
    res.status(500).json({ success: false, message: 'Greška pri dohvaćanju audit loga' });
  }
});

module.exports = router;

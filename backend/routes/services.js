const express = require('express');
const router = express.Router();
const Service = require('../models/Service');
const Elevator = require('../models/Elevator');
const { authenticate } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

const ALLOWED_CHECKLIST = [
  'lubrication',
  'ups_check',
  'voice_comm',
  'shaft_cleaning',
  'drive_check',
  'brake_check',
  'cable_inspection'
];

// GET /api/services - lista servisa (filtri + delta)
router.get('/', authenticate, async (req, res) => {
  try {
    const { elevatorId, startDate, endDate, technician, updatedAfter, limit = 100, skip = 0, includeDeleted } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 0, 1), 200);
    const parsedSkip = Math.max(parseInt(skip, 10) || 0, 0);
    const includeDeletedBool = includeDeleted === 'true' || includeDeleted === true;
    const filter = {};
    if (!includeDeletedBool) filter.is_deleted = { $ne: true };

    if (elevatorId) filter.elevatorId = elevatorId;
    if (technician) filter.serviserID = technician;
    if (updatedAfter) {
      const afterDate = new Date(updatedAfter);
      filter.updated_at = { $gte: afterDate };
    }
    if (startDate || endDate) {
      filter.datum = {};
      if (startDate) filter.datum.$gte = new Date(startDate);
      if (endDate) filter.datum.$lte = new Date(endDate);
    }

    const services = await Service.find(filter)
      .populate('elevatorId', 'brojUgovora nazivStranke ulica mjesto brojDizala')
      .populate('serviserID', 'ime prezime email')
      .sort({ datum: -1 })
      .skip(parsedSkip)
      .limit(parsedLimit)
      .lean();

    const total = await Service.countDocuments(filter);

    res.json({ success: true, count: services.length, total, data: services });
  } catch (error) {
    console.error('Greška pri dohvaćanju servisa:', error);
    res.status(500).json({ success: false, message: 'Greška pri dohvaćanju servisa' });
  }
});

// GET /api/services/stats/monthly
router.get('/stats/monthly', authenticate, async (req, res) => {
  try {
    const { year, month } = req.query;
    const currentYear = year ? parseInt(year, 10) : new Date().getFullYear();
    const currentMonth = month ? parseInt(month, 10) : new Date().getMonth() + 1;

    const startDate = new Date(currentYear, currentMonth - 1, 1);
    const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59);

    const baseFilter = { is_deleted: { $ne: true } };
    const total = await Service.countDocuments({ ...baseFilter, datum: { $gte: startDate, $lte: endDate } });
    const totalElevators = await Elevator.countDocuments({ is_deleted: { $ne: true } });
    const servicedElevatorIds = await Service.distinct('elevatorId', { ...baseFilter, datum: { $gte: startDate, $lte: endDate } });
    const needsService = totalElevators - servicedElevatorIds.length;

    res.json({
      success: true,
      data: {
        year: currentYear,
        month: currentMonth,
        completed: total,
        pending: 0,
        total,
        needsService
      }
    });
  } catch (error) {
    console.error('Greška pri dohvaćanju statistike:', error);
    res.status(500).json({ success: false, message: 'Greška pri dohvaćanju statistike' });
  }
});

// GET /api/services/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const service = await Service.findOne({ _id: req.params.id, is_deleted: { $ne: true } })
      .populate('elevatorId', 'brojUgovora nazivStranke ulica mjesto brojDizala')
      .populate('serviserID', 'ime prezime email uloga')
      .lean();

    if (!service) {
      return res.status(404).json({ success: false, message: 'Servis nije pronađen' });
    }

    res.json({ success: true, data: service });
  } catch (error) {
    console.error('Greška pri dohvaćanju servisa:', error);
    res.status(500).json({ success: false, message: 'Greška pri dohvaćanju servisa' });
  }
});

// POST /api/services
router.post('/', authenticate, async (req, res) => {
  try {
    const elevatorId = req.body.elevatorId || req.body.elevator;
    if (!elevatorId) {
      return res.status(400).json({ success: false, message: 'elevatorId je obavezan' });
    }

    const elevator = await Elevator.findById(elevatorId);
    if (!elevator) {
      return res.status(404).json({ success: false, message: 'Dizalo nije pronađeno', elevatorId });
    }

    const now = new Date();
    const service = new Service({
      ...req.body,
      elevatorId,
      serviserID: req.user._id,
      updated_at: now,
      updated_by: req.user._id,
      is_deleted: false,
    });

    await service.save();

    // update dizalo
    elevator.zadnjiServis = service.datum;
    if (service.sljedeciServis) elevator.sljedeciServis = service.sljedeciServis;
    await elevator.save();

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

    await service.populate('elevatorId', 'brojUgovora nazivStranke ulica mjesto brojDizala');
    await service.populate('serviserID', 'ime prezime email');

    res.status(201).json({ success: true, message: 'Servis kreiran', data: service });
  } catch (error) {
    console.error('Greška pri kreiranju servisa:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.keys(error.errors).map(key => `${key}: ${error.errors[key].message}`).join('; ');
      return res.status(400).json({
        success: false,
        message: 'Validacijska greška pri kreiranju servisa',
        errors: error.errors,
        errorMessages: messages
      });
    }

    res.status(500).json({ success: false, message: 'Greška pri kreiranju servisa', error: error.message });
  }
});

// PUT /api/services/:id
router.put('/:id', authenticate, async (req, res) => {
  try {
    const existingService = await Service.findById(req.params.id);
    if (!existingService) {
      return res.status(404).json({ success: false, message: 'Servis nije pronađen' });
    }

    if (existingService.is_deleted) {
      return res.status(404).json({ success: false, message: 'Servis je obrisan' });
    }

    const role = req.user.normalizedRole || req.user.uloga;
    const isOwnerServiser = role === 'serviser' && String(existingService.serviserID) === String(req.user._id);
    const canManage = ['menadzer', 'admin'].includes(role);
    if (!isOwnerServiser && !canManage) {
      return res.status(403).json({ success: false, message: 'Nedovoljna prava za ažuriranje ovog servisa' });
    }

    let checklist = Array.isArray(req.body.checklist) ? req.body.checklist : undefined;
    if (checklist) {
      checklist = checklist
        .filter((item) => ALLOWED_CHECKLIST.includes(item?.stavka))
        .map((item) => ({
          stavka: item.stavka,
          provjereno: typeof item.provjereno === 'number' ? item.provjereno : 0,
          napomena: item.napomena,
        }));
    }

    const now = new Date();
    const updateData = {
      ...req.body,
      checklist,
      // ne dozvoli promjenu vlasništva kroz body
      serviserID: existingService.serviserID,
      elevatorId: existingService.elevatorId,
      azuriranDatum: now,
      updated_at: now,
      updated_by: req.user._id,
    };

    const service = await Service.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('elevatorId', 'brojUgovora nazivStranke brojDizala')
      .populate('serviserID', 'ime prezime email');

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

    res.json({ success: true, message: 'Servis ažuriran', data: service });
  } catch (error) {
    console.error('Greška pri ažuriranju servisa:', {
      message: error.message,
      name: error.name,
      errors: error.errors,
      body: req.body,
      params: req.params,
    });

    if (error.name === 'ValidationError') {
      const messages = Object.keys(error.errors).map(key => `${key}: ${error.errors[key].message}`).join('; ');
      return res.status(400).json({
        success: false,
        message: 'Validacijska greška pri ažuriranju servisa',
        errors: error.errors,
        errorMessages: messages
      });
    }

    res.status(500).json({ success: false, message: error.message || 'Greška pri ažuriranju servisa', error: error.message });
  }
});

// DELETE /api/services/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Servis nije pronađen' });
    }

    const role = req.user.normalizedRole || req.user.uloga;
    const isOwnerServiser = role === 'serviser' && String(service.serviserID) === String(req.user._id);
    const canManage = ['menadzer', 'admin'].includes(role);
    if (!isOwnerServiser && !canManage) {
      return res.status(403).json({ success: false, message: 'Nedovoljna prava za brisanje ovog servisa' });
    }

    const now = new Date();
    service.is_deleted = true;
    service.deleted_at = now;
    service.updated_at = now;
    service.updated_by = req.user._id;
    service.azuriranDatum = now;
    await service.save();

    await logAction({
      korisnikId: req.user._id,
      akcija: 'DELETE',
      entitet: 'Service',
      entitetId: req.params.id,
      stareVrijednosti: service.toObject(),
      ipAdresa: req.ip,
      opis: 'Obrisan servis'
    });

    res.json({ success: true, message: 'Servis obrisan', data: service });
  } catch (error) {
    console.error('Greška pri brisanju servisa:', error);
    res.status(500).json({ success: false, message: 'Greška pri brisanju servisa' });
  }
});

module.exports = router;

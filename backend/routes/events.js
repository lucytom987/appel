const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const Elevator = require('../models/Elevator');
const { authenticate, checkRole } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

// GET /api/events - lista događaja (filtri + delta)
router.get('/', authenticate, async (req, res) => {
  try {
    const { elevatorId, eventType, status, startDate, endDate, serviserId, updatedAfter, limit = 200, skip = 0, includeDeleted } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 0, 1), 500);
    const parsedSkip = Math.max(parseInt(skip, 10) || 0, 0);
    const filter = { companyId: req.companyId };
    
    if (!includeDeleted) filter.is_deleted = { $ne: true };

    if (elevatorId) filter.elevatorId = elevatorId;
    if (eventType) filter.eventType = eventType;
    if (status) {
      // Status se primjenjuje samo na 'repair' događaje
      filter.$or = [
        { eventType: 'repair', 'repair.status': status },
        { eventType: { $ne: 'repair' } }
      ];
    }
    if (serviserId) {
      filter.$or = [
        { 'repair.serviserID': serviserId },
        { 'serviceNote.serviserID': serviserId },
        { 'activity.serviserID': serviserId }
      ];
    }
    if (updatedAfter) {
      const afterDate = new Date(updatedAfter);
      filter.updated_at = { $gte: afterDate };
      console.log('Delta sync events, updatedAfter:', afterDate.toISOString());
    }
    if (startDate || endDate) {
      filter.datum = {};
      if (startDate) filter.datum.$gte = new Date(startDate);
      if (endDate) filter.datum.$lte = new Date(endDate);
    }

    const events = await Event.find(filter)
      .populate('elevatorId', 'brojUgovora nazivStranke ulica mjesto brojDizala')
      .populate('repair.serviserID', 'ime prezime email')
      .populate('serviceNote.serviserID', 'ime prezime email')
      .populate('activity.serviserID', 'ime prezime email')
      .populate('updated_by', 'ime prezime email')
      .sort({ datum: -1 })
      .skip(parsedSkip)
      .limit(parsedLimit)
      .lean();

    const total = await Event.countDocuments(filter);

    res.json({ success: true, count: events.length, total, data: events });
  } catch (error) {
    console.error('Greška pri dohvaćanju događaja:', error);
    res.status(500).json({ success: false, message: 'Greška pri dohvaćanju događaja' });
  }
});

// GET /api/events/:id - detalji događaja
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const event = await Event.findOne({ _id: id, companyId: req.companyId })
      .populate('elevatorId', 'brojUgovora nazivStranke ulica mjesto brojDizala')
      .populate('repair.serviserID', 'ime prezime email')
      .populate('serviceNote.serviserID', 'ime prezime email')
      .populate('activity.serviserID', 'ime prezime email')
      .populate('updated_by', 'ime prezime email');

    if (!event) {
      return res.status(404).json({ success: false, message: 'Događaj nije pronađen' });
    }

    res.json({ success: true, data: event });
  } catch (error) {
    console.error('Greška pri dohvaćanju događaja:', error);
    res.status(500).json({ success: false, message: 'Greška pri dohvaćanju događaja' });
  }
});

// POST /api/events - kreiraj novi događaj
router.post('/', authenticate, async (req, res) => {
  try {
    const { user } = req;
    const { elevatorId, eventType, repair, serviceNote, activity, napomene, datum } = req.body;

    if (!elevatorId || !eventType) {
      return res.status(400).json({ success: false, message: 'elevatorId i eventType su obavezni' });
    }

    const elevator = await Elevator.findOne({ _id: elevatorId, companyId: req.companyId, is_deleted: { $ne: true } });
    if (!elevator) {
      return res.status(404).json({ success: false, message: 'Dizalo nije pronađeno ili ne pripada vašoj firmi' });
    }

    const eventData = {
      companyId: req.companyId,
      elevatorId,
      eventType,
      napomene,
      datum: datum ? new Date(datum) : new Date(),
      updated_by: user._id
    };

    // Validiraj eventType i popuni odgovarajuća polja
    switch (eventType) {
      case 'repair':
        if (!repair || !repair.opisKvara) {
          return res.status(400).json({ success: false, message: 'Repair polje je obavezno s opisomKvara' });
        }
        eventData.repair = {
          serviserID: repair.serviserID || user._id,
          opisKvara: repair.opisKvara,
          opisPopravka: repair.opisPopravka || '',
          status: repair.status || 'pending',
          trebaloBi: repair.trebaloBi || false,
          radniNalogPotpisan: repair.radniNalogPotpisan || false,
          popravkaUPotpunosti: repair.popravkaUPotpunosti || false
        };
        break;

      case 'service_note':
        if (!serviceNote || !serviceNote.tekst) {
          return res.status(400).json({ success: false, message: 'ServiceNote polje je obavezno s tekstom' });
        }
        eventData.serviceNote = {
          serviserID: serviceNote.serviserID || user._id,
          tekst: serviceNote.tekst,
          fotografija: serviceNote.fotografija || null
        };
        break;

      case 'activity':
        if (!activity || !activity.opis) {
          return res.status(400).json({ success: false, message: 'Activity polje je obavezno s opisom' });
        }
        eventData.activity = {
          serviserID: activity.serviserID || user._id,
          opis: activity.opis,
          tip: activity.tip || 'ostalo'
        };
        break;

      default:
        return res.status(400).json({ success: false, message: 'Nevaljani eventType' });
    }

    const event = new Event(eventData);
    await event.save();
    await logAction(user._id, 'CREATE', 'Event', event._id);

    const populated = await Event.findOne({ _id: event._id, companyId: req.companyId })
      .populate('elevatorId', 'brojUgovora nazivStranke ulica mjesto brojDizala')
      .populate('repair.serviserID', 'ime prezime email')
      .populate('serviceNote.serviserID', 'ime prezime email')
      .populate('activity.serviserID', 'ime prezime email')
      .populate('updated_by', 'ime prezime email');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    console.error('Greška pri kreiranju događaja:', error);
    res.status(500).json({ success: false, message: 'Greška pri kreiranju događaja' });
  }
});

// PUT /api/events/:id - ažuriraj događaj
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req;
    const { repair, serviceNote, activity, napomene, datum } = req.body;

    const event = await Event.findOne({ _id: id, companyId: req.companyId });
    if (!event) {
      return res.status(404).json({ success: false, message: 'Događaj nije pronađen' });
    }

    // Ažuriraj zajednicka polja
    if (napomene !== undefined) event.napomene = napomene;
    if (datum !== undefined) event.datum = new Date(datum);
    event.updated_by = user._id;

    // Ažuriraj tip-specifična polja ovisno o eventType
    if (event.eventType === 'repair' && repair) {
      event.repair = {
        ...event.repair,
        ...repair,
        serviserID: repair.serviserID || (event.repair?.serviserID || user._id)
      };
    } else if (event.eventType === 'service_note' && serviceNote) {
      event.serviceNote = {
        ...event.serviceNote,
        ...serviceNote,
        serviserID: serviceNote.serviserID || (event.serviceNote?.serviserID || user._id)
      };
    } else if (event.eventType === 'activity' && activity) {
      event.activity = {
        ...event.activity,
        ...activity,
        serviserID: activity.serviserID || (event.activity?.serviserID || user._id)
      };
    }

    await event.save();
    await logAction(user._id, 'UPDATE', 'Event', event._id);

    const updated = await Event.findOne({ _id: event._id, companyId: req.companyId })
      .populate('elevatorId', 'brojUgovora nazivStranke ulica mjesto brojDizala')
      .populate('repair.serviserID', 'ime prezime email')
      .populate('serviceNote.serviserID', 'ime prezime email')
      .populate('activity.serviserID', 'ime prezime email')
      .populate('updated_by', 'ime prezime email');

    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Greška pri ažuriranju događaja:', error);
    res.status(500).json({ success: false, message: 'Greška pri ažuriranju događaja' });
  }
});

// DELETE /api/events/:id - soft delete događaja
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { user } = req;

    const event = await Event.findOne({ _id: id, companyId: req.companyId });
    if (!event) {
      return res.status(404).json({ success: false, message: 'Događaj nije pronađen' });
    }

    event.is_deleted = true;
    event.deleted_at = new Date();
    event.updated_by = user._id;
    await event.save();
    await logAction(user._id, 'DELETE', 'Event', event._id);

    res.json({ success: true, message: 'Događaj je obrisan' });
  } catch (error) {
    console.error('Greška pri brisanju događaja:', error);
    res.status(500).json({ success: false, message: 'Greška pri brisanju događaja' });
  }
});

// GET /api/events/elevator/:elevatorId - svi događaji za jedno dizalo
router.get('/elevator/:elevatorId', authenticate, async (req, res) => {
  try {
    const { elevatorId } = req.params;
    const { eventType, status, limit = 200, skip = 0 } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 0, 1), 500);
    const parsedSkip = Math.max(parseInt(skip, 10) || 0, 0);

    const filter = {
      companyId: req.companyId,
      elevatorId,
      is_deleted: { $ne: true }
    };

    if (eventType) filter.eventType = eventType;
    if (status) {
      filter.$or = [
        { eventType: 'repair', 'repair.status': status },
        { eventType: { $ne: 'repair' } }
      ];
    }

    const events = await Event.find(filter)
      .populate('elevatorId', 'brojUgovora nazivStranke ulica mjesto brojDizala')
      .populate('repair.serviserID', 'ime prezime email')
      .populate('serviceNote.serviserID', 'ime prezime email')
      .populate('activity.serviserID', 'ime prezime email')
      .sort({ datum: -1 })
      .skip(parsedSkip)
      .limit(parsedLimit)
      .lean();

    const total = await Event.countDocuments(filter);

    res.json({ success: true, count: events.length, total, data: events });
  } catch (error) {
    console.error('Greška pri dohvaćanju događaja:', error);
    res.status(500).json({ success: false, message: 'Greška pri dohvaćanju događaja' });
  }
});

module.exports = router;

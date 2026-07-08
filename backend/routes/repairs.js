const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const fs = require('fs');
const Repair = require('../models/Repair');
const WorkOrder = require('../models/WorkOrder');
const Elevator = require('../models/Elevator');
const User = require('../models/User');
const { authenticate, checkRole } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

const normalizeAdditionalTechnicians = async (value, companyId) => {
  const raw = Array.isArray(value) ? value : [];
  const ids = raw
    .map((entry) => (typeof entry === 'object' ? entry?._id || entry?.id : entry))
    .filter((entry) => typeof entry === 'string' && mongoose.Types.ObjectId.isValid(entry));

  if (!ids.length) return [];

  const users = await User.find({ _id: { $in: ids }, companyId, aktivan: { $ne: false } })
    .select('_id')
    .lean();
  return users.map((user) => String(user._id));
};

const normalizeWorkHours = (value) => {
  const input = value && typeof value === 'object' ? value : {};
  const parse = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const number = Number(v);
    return Number.isFinite(number) && number >= 0 ? number : null;
  };

  const additionalHours = Array.isArray(input.dodatni)
    ? input.dodatni.map(parse)
    : [];

  const legacyColleagueHours = parse(input.kolega);

  return {
    glavni: parse(input.glavni),
    kolega: legacyColleagueHours ?? additionalHours[0] ?? null,
    dodatni: additionalHours,
  };
};

const normalizeWorkOrderSignatureType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'paper' || normalized === 'digital') return normalized;
  return null;
};

const normalizeAssignedTechnician = async ({ poslanMajstorId, poslanMajstorIme }, companyId) => {
  const fallbackName = typeof poslanMajstorIme === 'string' ? poslanMajstorIme.trim() : '';

  if (!poslanMajstorId || !mongoose.Types.ObjectId.isValid(String(poslanMajstorId))) {
    return {
      poslanMajstorId: null,
      poslanMajstorIme: fallbackName,
    };
  }

  const user = await User.findOne({
    _id: poslanMajstorId,
    companyId,
    aktivan: { $ne: false },
  })
    .select('_id ime prezime email')
    .lean();

  if (!user) {
    return {
      poslanMajstorId: null,
      poslanMajstorIme: fallbackName,
    };
  }

  const resolvedName = `${user.ime || ''} ${user.prezime || ''}`.trim() || user.email || fallbackName;
  return {
    poslanMajstorId: user._id,
    poslanMajstorIme: resolvedName,
  };
};

// GET /api/repairs - popis popravaka (filtri)
router.get('/', authenticate, async (req, res) => {
  try {
    const { elevatorId, status, startDate, endDate, serviserId, updatedAfter, limit = 100, skip = 0, includeDeleted } = req.query;
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 0, 1), 200);
    const parsedSkip = Math.max(parseInt(skip, 10) || 0, 0);
    const filter = { companyId: req.companyId };
    if (!includeDeleted) filter.is_deleted = { $ne: true };

    if (elevatorId) filter.elevatorId = elevatorId;
    if (status) filter.status = status;
    if (serviserId) filter.serviserID = serviserId;
    if (updatedAfter) {
      const afterDate = new Date(updatedAfter);
      filter.updated_at = { $gte: afterDate };
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
      .populate('completedBy', 'ime prezime email')
      .populate('poslanMajstorId', 'ime prezime email')
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
    const baseFilter = { companyId: req.companyId, is_deleted: { $ne: true } };
    const total = await Repair.countDocuments(baseFilter);
    const pending = await Repair.countDocuments({ ...baseFilter, status: 'pending' });
    const inProgress = await Repair.countDocuments({ ...baseFilter, status: 'in_progress' });
    const completed = await Repair.countDocuments({ ...baseFilter, status: 'completed' });

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

    const prijavljeni = await  Repair.countDocuments({
      companyId: req.companyId,
      datumPrijave: { $gte: startDate, $lte: endDate },
      is_deleted: { $ne: true },
    });

    const zavrseni = await Repair.countDocuments({
      companyId: req.companyId,
      datumPopravka: { $gte: startDate, $lte: endDate },
      status: 'completed',
      is_deleted: { $ne: true },
    });

    const otvoreni = await Repair.countDocuments({
      companyId: req.companyId,
      datumPrijave: { $gte: startDate, $lte: endDate },
      status: { $in: ['pending', 'in_progress'] },
      is_deleted: { $ne: true },
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
    const repair = await Repair.findOne({ _id: req.params.id, companyId: req.companyId, is_deleted: { $ne: true } })
      .populate('elevatorId', 'nazivStranke ulica mjesto brojDizala')
      .populate('serviserID', 'ime prezime email uloga')
      .populate('completedBy', 'ime prezime email')
      .populate('poslanMajstorId', 'ime prezime email')
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
    const elevator = await Elevator.findOne({ _id: req.body.elevatorId || req.body.elevator, companyId: req.companyId });
    if (!elevator) {
      return res.status(404).json({ success: false, message: 'Dizalo nije pronađeno ili ne pripada vašoj firmi' });
    }

    // Legacy cleanup: ukloni polje "flag" ako dolazi iz starog klijenta
    if (Object.prototype.hasOwnProperty.call(req.body, 'flag')) {
      delete req.body.flag;
    }

    const trebFlag = Boolean(
      req.body.trebaloBi ||
      req.body.trebalo_bi ||
      req.body.category === 'trebalo_bi' ||
      req.body.type === 'trebalo_bi'
    );

    const now = new Date();
    const completedByName = `${req.user?.ime || ''} ${req.user?.prezime || ''}`.trim() || req.user?.email || '';
    const isCompleted = req.body.status === 'completed';
    
    // Provjeri duplikate - ako postoji popravka sa istim poljem i datumom, vrati postojeću
    const existingRepair = await Repair.findOne({
      companyId: req.companyId,
      elevatorId: req.body.elevatorId || req.body.elevator,
      opisKvara: req.body.opisKvara,
      datumPrijave: req.body.datumPrijave || { $gte: new Date(now.getTime() - 60000) }, // zadnjih 60s
      is_deleted: { $ne: true },
    }).lean();

    if (existingRepair) {
      console.log(`⚠️ Duplikat popravka pronađen, vraćam postojeću: ${existingRepair._id}`);
      const populated = await Repair.findById(existingRepair._id)
        .populate('elevatorId', 'nazivStranke ulica mjesto brojDizala')
        .populate('serviserID', 'ime prezime email')
        .populate('completedBy', 'ime prezime email');
      return res.status(201).json({ success: true, message: 'Popravak već postoji', data: populated });
    }

    const normalizedAdditionalTechnicians = await normalizeAdditionalTechnicians(req.body.dodatniServiseri, req.companyId);
    const hasAssignedTechnicianField = Object.prototype.hasOwnProperty.call(req.body, 'poslanMajstorId')
      || Object.prototype.hasOwnProperty.call(req.body, 'poslanMajstorIme');
    const normalizedAssignedTechnician = hasAssignedTechnicianField
      ? await normalizeAssignedTechnician({
          poslanMajstorId: req.body.poslanMajstorId,
          poslanMajstorIme: req.body.poslanMajstorIme,
        }, req.companyId)
      : {
          poslanMajstorId: existing.poslanMajstorId || null,
          poslanMajstorIme: existing.poslanMajstorIme || '',
        };
    const normalizedWorkHours = normalizeWorkHours(req.body.radniSati);
    const requestedSignatureType = normalizeWorkOrderSignatureType(req.body.radniNalogPotpisVrsta);
    const isWorkOrderSigned = Boolean(req.body.radniNalogPotpisan);
    const repair = new Repair({
      ...req.body,
      companyId: req.companyId,
      elevatorId: req.body.elevatorId || req.body.elevator,
      serviserID: req.user._id,
      dodatniServiseri: normalizedAdditionalTechnicians,
      radniSati: normalizedWorkHours,
      utroseniMaterijal: typeof req.body.utroseniMaterijal === 'string' ? req.body.utroseniMaterijal.trim() : '',
      poslanMajstorId: normalizedAssignedTechnician.poslanMajstorId,
      poslanMajstorIme: normalizedAssignedTechnician.poslanMajstorIme,
      status: req.body.status || 'pending',
      trebaloBi: trebFlag,
      datumPrijave: req.body.datumPrijave || now,
      datumPopravka: isCompleted ? (req.body.datumPopravka || now) : req.body.datumPopravka,
      completedBy: isCompleted ? req.user._id : undefined,
      completedByName: isCompleted ? completedByName : undefined,
      completedAt: isCompleted ? (req.body.datumPopravka || now) : undefined,
      radniNalogPotpisVrsta: isWorkOrderSigned ? (requestedSignatureType || 'paper') : null,
      updated_at: now,
      updated_by: req.user._id,
      is_deleted: false,
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
    await repair.populate('completedBy', 'ime prezime email');
    await repair.populate('poslanMajstorId', 'ime prezime email');

    res.status(201).json({ success: true, message: 'Popravak kreiran', data: repair });
  } catch (error) {
    console.error('Greška pri kreiranju popravka:', error);
    res.status(500).json({ success: false, message: 'Greška pri kreiranju popravka', error: error.message });
  }
});

// PUT /api/repairs/:id - ažuriraj popravak (serviser može ažurirati svoj rad)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const existing = await Repair.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Popravak nije pronađen ili ne pripada vašoj firmi' });
    }

    if (existing.is_deleted) {
      return res.status(404).json({ success: false, message: 'Popravak je obrisan' });
    }

    const relatedWorkOrder = await WorkOrder.findOne({
      repairId: existing._id,
      companyId: req.companyId,
    }).select('_id workOrderNumber status').lean();

    if (relatedWorkOrder && relatedWorkOrder.status === 'sent') {
      return res.status(409).json({
        success: false,
        message: `Popravak je zaključan jer je radni nalog ${relatedWorkOrder.workOrderNumber || ''} već potpisan i poslan.`,
      });
    }

    // Legacy cleanup: ukloni polje "flag" ako dolazi iz starog klijenta
    if (Object.prototype.hasOwnProperty.call(req.body, 'flag')) {
      delete req.body.flag;
    }
    // completedBy je server-controlled polje
    delete req.body.completedBy;
    delete req.body.completedByName;
    delete req.body.completedAt;

    const trebFlag = (() => {
      if (typeof req.body.trebaloBi === 'boolean') return req.body.trebaloBi;
      if (typeof req.body.trebalo_bi === 'boolean') return req.body.trebalo_bi;
      if (req.body.category === 'trebalo_bi' || req.body.type === 'trebalo_bi') return true;
      return existing.trebaloBi;
    })();

    // ako se zaključuje popravak
    if (req.body.status === 'completed' && existing.status !== 'completed') {
      req.body.datumPopravka = req.body.datumPopravka || new Date();
    }

    const completingNow = req.body.status === 'completed' && existing.status !== 'completed';
    const reopening = req.body.status && req.body.status !== 'completed' && existing.status === 'completed';
    const completedByName = `${req.user?.ime || ''} ${req.user?.prezime || ''}`.trim() || req.user?.email || '';

    const now = new Date();
    const normalizedAdditionalTechnicians = await normalizeAdditionalTechnicians(req.body.dodatniServiseri, req.companyId);
    const normalizedAssignedTechnician = await normalizeAssignedTechnician({
      poslanMajstorId: req.body.poslanMajstorId,
      poslanMajstorIme: req.body.poslanMajstorIme,
    }, req.companyId);
    const normalizedWorkHours = normalizeWorkHours(req.body.radniSati);

    const updatePayload = {
      ...req.body,
      elevatorId: req.body.elevatorId || req.body.elevator || existing.elevatorId,
      serviserID: req.body.serviserID || existing.serviserID,
      dodatniServiseri: normalizedAdditionalTechnicians,
      radniSati: normalizedWorkHours,
      utroseniMaterijal: typeof req.body.utroseniMaterijal === 'string' ? req.body.utroseniMaterijal.trim() : '',
      poslanMajstorId: normalizedAssignedTechnician.poslanMajstorId,
      poslanMajstorIme: normalizedAssignedTechnician.poslanMajstorIme,
      trebaloBi: trebFlag,
      azuriranDatum: now,
      updated_at: now,
      updated_by: req.user._id,
    };

    const requestedSignatureType = normalizeWorkOrderSignatureType(req.body.radniNalogPotpisVrsta);
    if (typeof req.body.radniNalogPotpisan === 'boolean') {
      if (!req.body.radniNalogPotpisan) {
        updatePayload.radniNalogPotpisVrsta = null;
      } else if (requestedSignatureType) {
        updatePayload.radniNalogPotpisVrsta = requestedSignatureType;
      } else {
        updatePayload.radniNalogPotpisVrsta = relatedWorkOrder ? 'digital' : 'paper';
      }
    } else if (requestedSignatureType) {
      const effectiveSigned = existing.radniNalogPotpisan === true;
      updatePayload.radniNalogPotpisVrsta = effectiveSigned ? requestedSignatureType : null;
    }

    if (completingNow) {
      updatePayload.completedBy = req.user._id;
      updatePayload.completedByName = completedByName;
      updatePayload.completedAt = req.body.datumPopravka || now;
    } else if (reopening) {
      updatePayload.completedBy = null;
      updatePayload.completedByName = null;
      updatePayload.completedAt = null;
    }

    const repair = await Repair.findByIdAndUpdate(req.params.id, updatePayload, { new: true, runValidators: true })
      .populate('elevatorId', 'nazivStranke ulica mjesto brojDizala')
      .populate('serviserID', 'ime prezime email')
      .populate('completedBy', 'ime prezime email');
      
    await repair.populate('poslanMajstorId', 'ime prezime email');

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
router.delete('/:id', authenticate, checkRole(['menadzer', 'admin']), async (req, res) => {
  try {
    const repair = await Repair.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!repair) {
      return res.status(404).json({ success: false, message: 'Popravak nije pronađen ili ne pripada vašoj firmi' });
    }

    const relatedWorkOrder = await WorkOrder.findOne({ repairId: repair._id, companyId: req.companyId });
    if (relatedWorkOrder) {
      if (relatedWorkOrder.pdfPath) {
        try {
          if (fs.existsSync(relatedWorkOrder.pdfPath)) {
            await fs.promises.unlink(relatedWorkOrder.pdfPath);
          }
        } catch (unlinkErr) {
          console.error('Greška pri brisanju PDF datoteke povezanog radnog naloga:', unlinkErr.message || unlinkErr);
        }
      }

      await WorkOrder.deleteOne({ _id: relatedWorkOrder._id, companyId: req.companyId });
    }

    const now = new Date();
    repair.is_deleted = true;
    repair.deleted_at = now;
    repair.updated_at = now;
    repair.updated_by = req.user._id;
    repair.azuriranDatum = now;
    await repair.save();

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

    if (relatedWorkOrder) {
      await logAction({
        korisnikId: req.user._id,
        akcija: 'DELETE',
        entitet: 'WorkOrder',
        entitetId: relatedWorkOrder._id,
        entitetNaziv: relatedWorkOrder.workOrderNumber,
        ipAdresa: req.ip,
        opis: 'Automatski obrisan radni nalog zbog brisanja popravka',
      });
    }

    res.json({ success: true, message: 'Popravak obrisan', data: repair });
  } catch (error) {
    console.error('Greška pri brisanju popravka:', error);
    res.status(500).json({ success: false, message: 'Greška pri brisanju popravka' });
  }
});

module.exports = router;

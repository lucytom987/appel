const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ejs = require('ejs');
const QRCode = require('qrcode');
const mongoose = require('mongoose');
const puppeteer = require('puppeteer');

const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { logAction } = require('../services/auditService');
const { sendWorkOrderEmail } = require('../services/emailService');
// const { generatePdfFromHtml, generateQRCode } = require('../services/workOrderPdfService'); // PRIVREMENO ISKLJUČENO
const WorkOrder = require('../models/WorkOrder');
const WorkOrderCounter = require('../models/WorkOrderCounter');
const Repair = require('../models/Repair');
const Elevator = require('../models/Elevator');
const Company = require('../models/Company');
const User = require('../models/User');

const OUTPUT_DIR = path.join(__dirname, '..', 'generated', 'work-orders');
const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'workorder.html');

const ensureDir = () => {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
};

const formatDateHR = (value) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString('hr-HR', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatDateOnlyHR = (value) => {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString('hr-HR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const formatHoursHR = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return `${String(numeric).replace('.', ',')} h`;
};

const normalizeMaterialUnit = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';

  if (['kom', 'komad', 'komada', 'komadi', 'pcs', 'piece', 'pieces'].includes(raw)) return 'kom';
  if (['m', 'metar', 'metra', 'metri', 'meter', 'meters'].includes(raw)) return 'm';

  return raw;
};

const parseMaterialItems = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return [];

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(' - ');
      const naziv = String(parts[0] || '').trim();
      const qtyUnit = String(parts[1] || '').trim();

      if (!qtyUnit) {
        return { naziv, kolicina: '', jedinica: '', structured: false };
      }

      const match = qtyUnit.match(/^([0-9]+(?:[.,][0-9]+)?)\s*(.*)$/);
      if (!match) {
        return { naziv, kolicina: qtyUnit, jedinica: '', structured: true };
      }

      return {
        naziv,
        kolicina: match[1] || '',
        jedinica: normalizeMaterialUnit(match[2]),
        structured: true,
      };
    });
};

const pad2 = (value) => String(value).padStart(2, '0');
const formatDayKey = (date = new Date()) => {
  const day = pad2(date.getDate());
  const month = pad2(date.getMonth() + 1);
  const year = String(date.getFullYear()).slice(-2);
  return `${day}${month}${year}`;
};

const resolveBaseUrl = (req) => {
  const envUrl = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
};

const nextWorkOrderNumber = async (companyId, date = new Date()) => {
  const dayKey = formatDayKey(date);
  const counter = await WorkOrderCounter.findOneAndUpdate(
    { companyId, dayKey },
    { $inc: { sequence: 1 }, $set: { updated_at: new Date() } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const seq = counter.sequence || 1;
  const sequenceLabel = String(seq).padStart(2, '0');
  return {
    dayKey,
    dailySequence: seq,
    workOrderNumber: `RN-${dayKey}-${sequenceLabel}`,
  };
};

const isTokenValid = (workOrder, token) => {
  if (!workOrder || !token) return false;
  if (workOrder.viewToken !== token) return false;
  const expires = new Date(workOrder.tokenExpiresAt);
  return expires.getTime() > Date.now();
};

const buildWorkOrderTemplateData = async (workOrder, req, token) => {
  const company = await Company.findById(workOrder.companyId).lean();
  const repair = await Repair.findById(workOrder.repairId)
    .populate('serviserID', 'ime prezime email')
    .lean();
  const elevator = await Elevator.findById(workOrder.elevatorId).lean();

  let normalizedRepair = repair || null;
  if (repair) {
    const additionalIds = (Array.isArray(repair.dodatniServiseri) ? repair.dodatniServiseri : [])
      .map((entry) => (typeof entry === 'object' ? entry?._id || entry?.id : entry))
      .filter((entry) => typeof entry === 'string' && mongoose.Types.ObjectId.isValid(entry));

    const additionalUsers = additionalIds.length
      ? await User.find({ _id: { $in: additionalIds }, companyId: workOrder.companyId })
          .select('ime prezime email')
          .lean()
      : [];

    normalizedRepair = {
      ...repair,
      dodatniServiseri: additionalUsers,
    };
  }

  const materialItems = parseMaterialItems(normalizedRepair?.utroseniMaterijal);
  const hasStructuredMaterial = materialItems.some((item) => item.structured || item.kolicina || item.jedinica);

  const viewUrl = `${resolveBaseUrl(req)}/api/work-orders/view/${workOrder._id}?token=${encodeURIComponent(token)}`;
  const qrCodeDataUrl = await QRCode.toDataURL(viewUrl, { margin: 1, width: 200 });

  return {
    workOrderNumber: workOrder.workOrderNumber,
    workOrder,
    company,
    repair: normalizedRepair,
    elevator,
    qrCodeDataUrl,
    formatDateHR,
    formatDateOnlyHR,
    formatHoursHR,
    materialItems,
    hasStructuredMaterial,
  };
};

const renderWorkOrderHtml = async (workOrder, req, token) => {
  const templateData = await buildWorkOrderTemplateData(workOrder, req, token);
  return ejs.renderFile(TEMPLATE_PATH, templateData);
};

const generatePdfBufferFromHtml = async (html) => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      preferCSSPageSize: true,
      scale: 1,
      printBackground: true,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm',
      },
    });

    return Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
};

const mapWorkOrderResponse = (workOrder, req) => {
  const baseUrl = resolveBaseUrl(req);
  const viewUrl = `${baseUrl}/api/work-orders/view/${workOrder._id}?token=${encodeURIComponent(workOrder.viewToken)}`;
  const downloadUrl = `${baseUrl}/api/work-orders/download/${workOrder._id}?token=${encodeURIComponent(workOrder.viewToken)}`;

  return {
    id: workOrder._id,
    workOrderNumber: workOrder.workOrderNumber,
    status: workOrder.status,
    signedAt: workOrder.signedAt,
    signedByName: workOrder.signedByName,
    sentAt: workOrder.sentAt,
    sentChannels: workOrder.sentChannels || [],
    tokenExpiresAt: workOrder.tokenExpiresAt,
    viewUrl,
    downloadUrl,
    qrUrl: viewUrl,
  };
};

// Kreiraj draft radnog naloga iz postojećeg popravka
router.post('/from-repair/:repairId', authenticate, async (req, res) => {
  try {
    const repair = await Repair.findOne({ _id: req.params.repairId, companyId: req.companyId, is_deleted: { $ne: true } })
      .populate('elevatorId', 'nazivStranke ulica mjesto brojDizala brojUgovora')
      .populate('serviserID', 'ime prezime email');

    if (!repair) {
      return res.status(404).json({ success: false, message: 'Popravak nije pronađen ili ne pripada vašoj firmi' });
    }

    if (repair.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Radni nalog se može kreirati tek za završeni popravak' });
    }

    const baseUrl = resolveBaseUrl(req);
    const company = await Company.findById(req.companyId);

    let workOrder = await WorkOrder.findOne({ repairId: repair._id, companyId: req.companyId });
    if (!workOrder) {
      const numbering = await nextWorkOrderNumber(req.companyId, new Date());
      const token = crypto.randomBytes(24).toString('hex');
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      workOrder = new WorkOrder({
        companyId: req.companyId,
        repairId: repair._id,
        elevatorId: repair.elevatorId?._id || repair.elevatorId,
        serviserID: repair.serviserID?._id || repair.serviserID,
        workOrderNumber: numbering.workOrderNumber,
        dayKey: numbering.dayKey,
        dailySequence: numbering.dailySequence,
        status: 'draft',
        viewToken: token,
        tokenExpiresAt: expires,
        updated_by: req.user._id,
      });
    } else {
      workOrder.status = workOrder.status === 'cancelled' ? 'draft' : workOrder.status;
      workOrder.updated_by = req.user._id;
      workOrder.updated_at = new Date();
    }

    // PRIVREMENO ISKLJUČENO - PDF generiranje
    // const qrUrl = `${baseUrl}/api/work-orders/view/${workOrder._id}?token=${encodeURIComponent(workOrder.viewToken)}`;
    // const qrCodeDataUrl = await generateQRCode(qrUrl);
    // const generated = await generatePdfFromHtml({ workOrder, repair, elevator: repair.elevatorId, company, qrCodeDataUrl });
    // workOrder.pdfFileName = generated.fileName;
    // workOrder.pdfPath = generated.filePath;
    // workOrder.lastGeneratedAt = new Date();
    await workOrder.save();

    await logAction({
      korisnikId: req.user._id,
      akcija: 'CREATE',
      entitet: 'WorkOrder',
      entitetId: workOrder._id,
      entitetNaziv: workOrder.workOrderNumber,
      noveVrijednosti: workOrder.toObject(),
      ipAdresa: req.ip,
      opis: 'Kreiran draft radnog naloga'
    });

    res.status(201).json({
      success: true,
      message: 'Draft radni nalog kreiran',
      data: mapWorkOrderResponse(workOrder, req),
    });
  } catch (error) {
    console.error('Greška pri kreiranju draft radnog naloga:', error);
    res.status(500).json({ success: false, message: 'Greška pri kreiranju draft radnog naloga' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const workOrder = await WorkOrder.findOne({ _id: req.params.id, companyId: req.companyId }).lean();
    if (!workOrder) {
      return res.status(404).json({ success: false, message: 'Radni nalog nije pronađen ili ne pripada vašoj firmi' });
    }

    res.json({ success: true, data: mapWorkOrderResponse(workOrder, req) });
  } catch (error) {
    console.error('Greška pri dohvaćanju radnog naloga:', error);
    res.status(500).json({ success: false, message: 'Greška pri dohvaćanju radnog naloga' });
  }
});

// Potpisuje i finalizira dokument. sendNow=true postavlja status sent
router.post('/:id/sign', authenticate, async (req, res) => {
  try {
    const workOrder = await WorkOrder.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!workOrder) {
      return res.status(404).json({ success: false, message: 'Radni nalog nije pronađen ili ne pripada vašoj firmi' });
    }

    const repair = await Repair.findOne({ _id: workOrder.repairId, companyId: req.companyId })
      .populate('elevatorId', 'nazivStranke ulica mjesto brojDizala brojUgovora')
      .populate('serviserID', 'ime prezime email');
    if (!repair) {
      return res.status(404).json({ success: false, message: 'Povezani popravak nije pronađen ili ne pripada vašoj firmi' });
    }

    const signerName = req.body.signedByName || `${req.user.ime || ''} ${req.user.prezime || ''}`.trim() || req.user.email;
    const sendNow = req.body.sendNow !== false;

    workOrder.signatureImage = req.body.signatureImage || workOrder.signatureImage;
    workOrder.signedBy = req.user._id;
    workOrder.signedByName = signerName;
    workOrder.signedAt = new Date();
    workOrder.status = sendNow ? 'sent' : 'signed';
    if (sendNow) {
      workOrder.sentAt = new Date();
      workOrder.sentChannels = ['company', 'customer'];
    }
    workOrder.updated_by = req.user._id;
    workOrder.updated_at = new Date();

    const baseUrl = resolveBaseUrl(req);
    const company = await Company.findById(req.companyId);
    
    // PRIVREMENO ISKLJUČENO - PDF generiranje
    // const qrUrl = `${baseUrl}/api/work-orders/view/${workOrder._id}?token=${encodeURIComponent(workOrder.viewToken)}`;
    // const qrCodeDataUrl = await generateQRCode(qrUrl);
    // const generated = await generatePdfFromHtml({ workOrder, repair, elevator: repair.elevatorId, company, qrCodeDataUrl });
    // workOrder.pdfFileName = generated.fileName;
    // workOrder.pdfPath = generated.filePath;
    // workOrder.lastGeneratedAt = new Date();
    await workOrder.save();

    // Pošalji email ako je radni nalog označen kao poslan i ako firma ima email
    if (sendNow && company?.email) {
      try {
        const downloadUrl = `${baseUrl}/api/work-orders/download/${workOrder._id}?token=${encodeURIComponent(workOrder.viewToken)}`;
        const htmlForEmail = await renderWorkOrderHtml(workOrder.toObject(), req, workOrder.viewToken);
        let pdfBase64 = null;

        try {
          const pdfBuffer = await generatePdfBufferFromHtml(htmlForEmail);
          pdfBase64 = pdfBuffer.toString('base64');
        } catch (pdfError) {
          console.error('Greška pri generiranju PDF-a za email prilog:', pdfError);
        }

        await sendWorkOrderEmail(workOrder, company, repair, repair.elevatorId, downloadUrl, {
          subject: `Radni nalog ${workOrder.workOrderNumber}`,
          attachments: pdfBase64
            ? [
                {
                  filename: `${workOrder.workOrderNumber || 'radni-nalog'}.pdf`,
                  content: pdfBase64,
                  type: 'application/pdf',
                  disposition: 'attachment',
                },
              ]
            : [],
        });
      } catch (emailError) {
        console.error('Greška pri slanju emaila:', emailError);
        // Nastavi dalje jer je radni nalog već spremljen
      }
    }

    await Repair.findByIdAndUpdate(repair._id, {
      radniNalogPotpisan: true,
      updated_at: new Date(),
      updated_by: req.user._id,
    });

    await logAction({
      korisnikId: req.user._id,
      akcija: 'UPDATE',
      entitet: 'WorkOrder',
      entitetId: workOrder._id,
      entitetNaziv: workOrder.workOrderNumber,
      noveVrijednosti: workOrder.toObject(),
      ipAdresa: req.ip,
      opis: sendNow ? 'Radni nalog potpisan i označen kao poslan' : 'Radni nalog potpisan'
    });

    res.json({
      success: true,
      message: sendNow ? 'Radni nalog potpisan i poslan' : 'Radni nalog potpisan',
      data: mapWorkOrderResponse(workOrder, req),
    });
  } catch (error) {
    console.error('Greška pri potpisu radnog naloga:', error);
    res.status(500).json({ success: false, message: 'Greška pri potpisu radnog naloga' });
  }
});

// Javna stranica pregleda (token)
router.get('/view/:id', async (req, res) => {
  try {
    const { token } = req.query;
    const workOrder = await WorkOrder.findById(req.params.id).lean();
    if (!workOrder || !isTokenValid(workOrder, token)) {
      return res.status(403).send('Nevažeći ili istekli link.');
    }

    const html = await renderWorkOrderHtml(workOrder, req, token);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (error) {
    console.error('Greška pri prikazu radnog naloga:', error);
    return res.status(500).send('Greška pri prikazu dokumenta.');
  }
});

// Download PDF (token)
router.get('/download/:id', async (req, res) => {
  try {
    const { token } = req.query;
    const workOrder = await WorkOrder.findById(req.params.id).lean();
    if (!workOrder || !isTokenValid(workOrder, token)) {
      return res.status(403).send('Nevažeći ili istekli link.');
    }

    const html = await renderWorkOrderHtml(workOrder, req, token);

    try {
      const pdfBuffer = await generatePdfBufferFromHtml(html);
      const safePdfName = `${workOrder.workOrderNumber || 'radni-nalog'}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safePdfName}"`);
      return res.send(pdfBuffer);
    } catch (pdfError) {
      console.error('Greška pri generiranju PDF-a za download, vraćam HTML fallback:', pdfError);
      const safeFileName = `${workOrder.workOrderNumber || 'radni-nalog'}.html`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
      return res.send(html);
    }
  } catch (error) {
    console.error('Greška pri downloadu radnog naloga:', error);
    return res.status(500).send('Greška pri preuzimanju dokumenta.');
  }
});

// Get work order by repair ID (authenticated)
router.get('/by-repair/:repairId', authenticate, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.repairId)) {
      return res.status(404).json({ message: 'Radni nalog nije pronađen za ovaj popravak ili ne pripada vašoj firmi' });
    }

    const workOrder = await WorkOrder.findOne({ repairId: req.params.repairId, companyId: req.companyId })
      .sort({ created_at: -1 }); // najnoviji prvi
    
    if (!workOrder) {
      return res.status(404).json({ message: 'Radni nalog nije pronađen za ovaj popravak ili ne pripada vašoj firmi' });
    }

    const baseUrl = resolveBaseUrl(req);
    const viewUrl = `${baseUrl}/api/work-orders/view/${workOrder._id}?token=${workOrder.viewToken}`;
    const downloadUrl = `${baseUrl}/api/work-orders/download/${workOrder._id}?token=${workOrder.viewToken}`;

    return res.json({
      data: {
        ...workOrder.toObject(),
        viewUrl,
        downloadUrl,
      },
    });
  } catch (error) {
    console.error('Greška pri dohvaćanju radnog naloga:', error);
    return res.status(500).json({ message: 'Greška poslužitelja' });
  }
});

module.exports = router;

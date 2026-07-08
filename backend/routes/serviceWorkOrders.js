const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ejs = require('ejs');
const QRCode = require('qrcode');
const mongoose = require('mongoose');
const puppeteerCore = require('puppeteer-core');
let chromium;
try { chromium = require('@sparticuz/chromium'); } catch (e) { chromium = null; }

const router = express.Router();
const { authenticate, checkRole } = require('../middleware/auth');
const { logAction } = require('../services/auditService');
const { sendWorkOrderEmail } = require('../services/emailService');
const ServiceWorkOrder = require('../models/ServiceWorkOrder');
const WorkOrderCounter = require('../models/WorkOrderCounter');
const Service = require('../models/Service');
const Elevator = require('../models/Elevator');
const Company = require('../models/Company');
const User = require('../models/User');

const OUTPUT_DIR = path.join(__dirname, '..', 'generated', 'service-work-orders');
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
    minute: '2-digit',
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

const resolveBaseUrl = (req, explicitBaseUrl = null) => {
  if (explicitBaseUrl) return String(explicitBaseUrl).replace(/\/$/, '');
  const envUrl = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');
  if (!req) return '';
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

const toEmbeddedImageDataUrl = async (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  if (raw.startsWith('data:image/')) return raw;
  if (!/^https?:\/\//i.test(raw)) return raw;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(raw, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'image/*,*/*;q=0.8',
      },
    });
    clearTimeout(timeout);

    if (!response.ok) return raw;
    const contentType = response.headers.get('content-type') || 'image/png';
    const bytes = Buffer.from(await response.arrayBuffer());

    if (bytes.length > 3 * 1024 * 1024) return raw;

    return `data:${contentType};base64,${bytes.toString('base64')}`;
  } catch (error) {
    return raw;
  }
};

const buildServiceDescription = (service, elevator) => {
  const serviceDate = service?.datum ? new Date(service.datum) : new Date();
  const monthYear = serviceDate.toLocaleDateString('hr-HR', { month: 'long', year: 'numeric' });
  const brojDizala = elevator?.brojDizala || '-';
  const base = `Izvrsen redovni mjesecni pregled i servis dizala ${brojDizala} po ugovoru za ${monthYear}.`;
  const note = String(service?.napomene || '').trim();
  return note ? `${base}\n\nNapomena: ${note}` : base;
};

const buildTemplateData = async (workOrder, req, token, explicitBaseUrl = null) => {
  const [company, service, elevator] = await Promise.all([
    Company.findById(workOrder.companyId).lean(),
    Service.findById(workOrder.serviceId)
      .populate('serviserID', 'ime prezime email')
      .populate('dodatniServiseri', 'ime prezime email')
      .lean(),
    Elevator.findById(workOrder.elevatorId).lean(),
  ]);

  const pseudoRepair = {
    opisPopravka: buildServiceDescription(service, elevator),
    utroseniMaterijal: service?.utroseniMaterijal || '',
    serviserID: service?.serviserID,
    dodatniServiseri: Array.isArray(service?.dodatniServiseri) ? service.dodatniServiseri : [],
    radniSati: {},
  };

  const materialItems = parseMaterialItems(pseudoRepair.utroseniMaterijal);
  const hasStructuredMaterial = materialItems.some((item) => item.structured || item.kolicina || item.jedinica);
  const companyLogoDataUrl = workOrder?.companyLogoDataUrl || company?.logoDataUrl || await toEmbeddedImageDataUrl(company?.logo);

  const viewUrl = `${resolveBaseUrl(req, explicitBaseUrl)}/api/service-work-orders/view/${workOrder._id}?token=${encodeURIComponent(token)}`;
  const qrCodeDataUrl = await QRCode.toDataURL(viewUrl, { margin: 1, width: 200 });

  return {
    workOrderNumber: workOrder.workOrderNumber,
    workOrder,
    company,
    companyLogoDataUrl,
    repair: pseudoRepair,
    elevator,
    qrCodeDataUrl,
    formatDateHR,
    formatDateOnlyHR,
    formatHoursHR,
    materialItems,
    hasStructuredMaterial,
  };
};

const renderWorkOrderHtml = async (workOrder, req, token, explicitBaseUrl = null) => {
  const templateData = await buildTemplateData(workOrder, req, token, explicitBaseUrl);
  return ejs.renderFile(TEMPLATE_PATH, templateData);
};

const generatePdfBufferFromHtml = async (html) => {
  let executablePath;
  if (chromium) {
    executablePath = await chromium.executablePath();
  }

  const browser = await puppeteerCore.launch({
    headless: chromium ? chromium.headless : 'new',
    executablePath: executablePath || '/usr/bin/google-chrome-stable',
    args: chromium
      ? chromium.args
      : [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--single-process',
        ],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.evaluate(async () => {
      const images = Array.from(document.images || []);
      await Promise.all(images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        });
      }));
    });

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

const mapResponse = (workOrder, req) => {
  const baseUrl = resolveBaseUrl(req);
  const viewUrl = `${baseUrl}/api/service-work-orders/view/${workOrder._id}?token=${encodeURIComponent(workOrder.viewToken)}`;
  const downloadUrl = `${baseUrl}/api/service-work-orders/download/${workOrder._id}?token=${encodeURIComponent(workOrder.viewToken)}`;

  return {
    id: workOrder._id,
    _id: workOrder._id,
    workOrderNumber: workOrder.workOrderNumber,
    status: workOrder.status,
    signedAt: workOrder.signedAt,
    signedByName: workOrder.signedByName,
    sentAt: workOrder.sentAt,
    sentChannels: workOrder.sentChannels || [],
    tokenExpiresAt: workOrder.tokenExpiresAt,
    created_at: workOrder.created_at,
    updated_at: workOrder.updated_at,
    viewUrl,
    downloadUrl,
    qrUrl: viewUrl,
  };
};

const sendSignedEmailInBackground = async ({ workOrderId, companyId, baseUrl }) => {
  const workOrder = await ServiceWorkOrder.findOne({ _id: workOrderId, companyId });
  if (!workOrder) return;
  if (String(workOrder.status || '').toLowerCase() !== 'sent') return;

  const [service, company, elevator] = await Promise.all([
    Service.findOne({ _id: workOrder.serviceId, companyId }),
    Company.findById(companyId),
    Elevator.findById(workOrder.elevatorId),
  ]);

  if (!service || !company?.email || !elevator) return;

  try {
    const downloadUrl = `${baseUrl}/api/service-work-orders/download/${workOrder._id}?token=${encodeURIComponent(workOrder.viewToken)}`;
    const htmlForEmail = await renderWorkOrderHtml(workOrder.toObject(), null, workOrder.viewToken, baseUrl);
    let pdfBuffer = null;

    try {
      pdfBuffer = await generatePdfBufferFromHtml(htmlForEmail);

      try {
        ensureDir();
        const fileName = `${workOrder.workOrderNumber || workOrder._id}.pdf`;
        const filePath = path.join(OUTPUT_DIR, fileName);
        await fs.promises.writeFile(filePath, pdfBuffer);
        workOrder.pdfFileName = fileName;
        workOrder.pdfPath = filePath;
        workOrder.lastGeneratedAt = new Date();
        await workOrder.save();
      } catch (saveErr) {
        console.error('Greška pri spremanju servisnog PDF-a:', saveErr.message || saveErr);
      }
    } catch (pdfError) {
      console.error('Greška pri generiranju servisnog PDF-a za email:', pdfError.message);
    }

    const customerEmail = elevator?.kontaktOsoba?.email || null;
    await sendWorkOrderEmail(workOrder, company, service, elevator, downloadUrl, {
      subject: `Radni nalog servisa ${workOrder.workOrderNumber}`,
      customerEmail,
      attachments: pdfBuffer
        ? [
            {
              filename: `${workOrder.workOrderNumber || 'radni-nalog-servisa'}.pdf`,
              content: pdfBuffer,
            },
          ]
        : [],
    });
  } catch (error) {
    console.error('Greška pri slanju servisnog radnog naloga emailom:', error);
  }
};

router.post('/from-service/:serviceId', authenticate, async (req, res) => {
  try {
    const service = await Service.findOne({ _id: req.params.serviceId, companyId: req.companyId, is_deleted: { $ne: true } })
      .populate('elevatorId', 'nazivStranke ulica mjesto brojDizala brojUgovora')
      .populate('serviserID', 'ime prezime email');

    if (!service) {
      return res.status(404).json({ success: false, message: 'Servis nije pronađen ili ne pripada vašoj firmi' });
    }

    const company = await Company.findById(req.companyId);

    let workOrder = await ServiceWorkOrder.findOne({ serviceId: service._id, companyId: req.companyId });
    if (!workOrder) {
      const numbering = await nextWorkOrderNumber(req.companyId, new Date());
      const token = crypto.randomBytes(24).toString('hex');
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      workOrder = new ServiceWorkOrder({
        companyId: req.companyId,
        serviceId: service._id,
        elevatorId: service.elevatorId?._id || service.elevatorId,
        serviserID: service.serviserID?._id || service.serviserID,
        companyLogoDataUrl: company?.logoDataUrl || await toEmbeddedImageDataUrl(company?.logo),
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

    await workOrder.save();

    await logAction({
      korisnikId: req.user._id,
      akcija: 'CREATE',
      entitet: 'ServiceWorkOrder',
      entitetId: workOrder._id,
      entitetNaziv: workOrder.workOrderNumber,
      noveVrijednosti: workOrder.toObject(),
      ipAdresa: req.ip,
      opis: 'Kreiran draft radnog naloga za servis',
    });

    return res.status(201).json({
      success: true,
      message: 'Draft radni nalog servisa kreiran',
      data: mapResponse(workOrder, req),
    });
  } catch (error) {
    console.error('Greška pri kreiranju draft naloga servisa:', error);
    return res.status(500).json({ success: false, message: 'Greška pri kreiranju draft radnog naloga servisa' });
  }
});

router.get('/by-service/:serviceId', authenticate, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.serviceId)) {
      return res.status(404).json({ message: 'Radni nalog servisa nije pronađen' });
    }

    const workOrder = await ServiceWorkOrder.findOne({ serviceId: req.params.serviceId, companyId: req.companyId })
      .sort({ created_at: -1 });

    if (!workOrder) {
      return res.status(404).json({ message: 'Radni nalog servisa nije pronađen' });
    }

    return res.json({ data: { ...workOrder.toObject(), ...mapResponse(workOrder, req) } });
  } catch (error) {
    console.error('Greška pri dohvaćanju servisnog radnog naloga:', error);
    return res.status(500).json({ message: 'Greška poslužitelja' });
  }
});

router.post('/:id/sign', authenticate, async (req, res) => {
  try {
    const workOrder = await ServiceWorkOrder.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!workOrder) {
      return res.status(404).json({ success: false, message: 'Radni nalog servisa nije pronađen' });
    }

    const [service, company] = await Promise.all([
      Service.findOne({ _id: workOrder.serviceId, companyId: req.companyId })
        .populate('elevatorId', 'nazivStranke ulica mjesto brojDizala brojUgovora kontaktOsoba'),
      Company.findById(req.companyId),
    ]);

    if (!service) {
      return res.status(404).json({ success: false, message: 'Povezani servis nije pronađen' });
    }

    const signerName = req.body.signedByName || `${req.user.ime || ''} ${req.user.prezime || ''}`.trim() || req.user.email;
    const sendNow = req.body.sendNow !== false;

    workOrder.signatureImage = req.body.signatureImage || workOrder.signatureImage;
    workOrder.customerSignatureImage = req.body.customerSignatureImage || workOrder.customerSignatureImage;
    workOrder.customerAbsent = req.body.customerAbsent === true;
    if (!workOrder.companyLogoDataUrl) {
      workOrder.companyLogoDataUrl = company?.logoDataUrl || await toEmbeddedImageDataUrl(company?.logo);
    }
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

    await workOrder.save();

    await logAction({
      korisnikId: req.user._id,
      akcija: 'UPDATE',
      entitet: 'ServiceWorkOrder',
      entitetId: workOrder._id,
      entitetNaziv: workOrder.workOrderNumber,
      noveVrijednosti: workOrder.toObject(),
      ipAdresa: req.ip,
      opis: sendNow ? 'Radni nalog servisa potpisan i označen kao poslan' : 'Radni nalog servisa potpisan',
    });

    res.json({
      success: true,
      message: sendNow ? 'Radni nalog servisa potpisan i poslan' : 'Radni nalog servisa potpisan',
      data: mapResponse(workOrder, req),
    });

    if (sendNow && company?.email) {
      const baseUrl = resolveBaseUrl(req);
      setImmediate(() => {
        sendSignedEmailInBackground({
          workOrderId: workOrder._id,
          companyId: req.companyId,
          baseUrl,
        }).catch((err) => {
          console.error('Background slanje servisnog naloga nije uspjelo:', err?.message || err);
        });
      });
    }
  } catch (error) {
    console.error('Greška pri potpisu servisnog radnog naloga:', error);
    return res.status(500).json({ success: false, message: 'Greška pri potpisu servisnog radnog naloga' });
  }
});

router.get('/view/:id', async (req, res) => {
  try {
    const { token } = req.query;
    const workOrder = await ServiceWorkOrder.findById(req.params.id).lean();
    if (!workOrder || !isTokenValid(workOrder, token)) {
      return res.status(403).send('Nevažeći ili istekli link.');
    }

    const html = await renderWorkOrderHtml(workOrder, req, token);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (error) {
    console.error('Greška pri prikazu servisnog naloga:', error);
    return res.status(500).send('Greška pri prikazu dokumenta.');
  }
});

router.get('/download/:id', async (req, res) => {
  try {
    const { token } = req.query;
    const workOrder = await ServiceWorkOrder.findById(req.params.id).lean();
    if (!workOrder || !isTokenValid(workOrder, token)) {
      return res.status(403).send('Nevažeći ili istekli link.');
    }

    const html = await renderWorkOrderHtml(workOrder, req, token);

    try {
      const pdfBuffer = await generatePdfBufferFromHtml(html);
      const safePdfName = `${workOrder.workOrderNumber || 'radni-nalog-servisa'}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safePdfName}"`);
      return res.send(pdfBuffer);
    } catch (pdfError) {
      console.error('Greška pri generiranju servisnog PDF-a:', pdfError);
      const safeFileName = `${workOrder.workOrderNumber || 'radni-nalog-servisa'}.html`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
      return res.send(html);
    }
  } catch (error) {
    console.error('Greška pri downloadu servisnog naloga:', error);
    return res.status(500).send('Greška pri preuzimanju dokumenta.');
  }
});

router.delete('/:id', authenticate, checkRole(['menadzer', 'admin']), async (req, res) => {
  try {
    const workOrder = await ServiceWorkOrder.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!workOrder) {
      return res.status(404).json({ success: false, message: 'Radni nalog servisa nije pronađen' });
    }

    if (workOrder.pdfPath) {
      try {
        if (fs.existsSync(workOrder.pdfPath)) {
          await fs.promises.unlink(workOrder.pdfPath);
        }
      } catch (unlinkErr) {
        console.error('Greška pri brisanju servisnog PDF-a:', unlinkErr.message || unlinkErr);
      }
    }

    await ServiceWorkOrder.deleteOne({ _id: workOrder._id, companyId: req.companyId });

    await logAction({
      korisnikId: req.user._id,
      akcija: 'DELETE',
      entitet: 'ServiceWorkOrder',
      entitetId: workOrder._id,
      entitetNaziv: workOrder.workOrderNumber,
      ipAdresa: req.ip,
      opis: 'Obrisan radni nalog servisa',
    });

    return res.json({ success: true, message: 'Radni nalog servisa obrisan' });
  } catch (error) {
    console.error('Greška pri brisanju servisnog radnog naloga:', error);
    return res.status(500).json({ success: false, message: 'Greška pri brisanju servisnog radnog naloga' });
  }
});

module.exports = router;

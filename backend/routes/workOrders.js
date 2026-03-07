const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { logAction } = require('../services/auditService');
const { sendWorkOrderEmail } = require('../services/emailService');
const WorkOrder = require('../models/WorkOrder');
const WorkOrderCounter = require('../models/WorkOrderCounter');
const Repair = require('../models/Repair');
const Elevator = require('../models/Elevator');
const Company = require('../models/Company');

const OUTPUT_DIR = path.join(__dirname, '..', 'generated', 'work-orders');

const ensureDir = () => {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
};

const pad2 = (value) => String(value).padStart(2, '0');
const formatDayKey = (date = new Date()) => {
  const day = pad2(date.getDate());
  const month = pad2(date.getMonth() + 1);
  const year = String(date.getFullYear()).slice(-2);
  return `${day}${month}${year}`;
};

const formatDateHR = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('hr-HR');
};

const resolveBaseUrl = (req) => {
  const envUrl = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL;
  if (envUrl) return envUrl.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
};

const nextWorkOrderNumber = async (date = new Date()) => {
  const dayKey = formatDayKey(date);
  const counter = await WorkOrderCounter.findOneAndUpdate(
    { dayKey },
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

const generatePdfForWorkOrder = async ({ workOrder, repair, elevator, company, baseUrl }) => {
  ensureDir();

  const fileName = `${workOrder.workOrderNumber}.pdf`;
  const filePath = path.join(OUTPUT_DIR, fileName);
  const qrUrl = `${baseUrl}/api/work-orders/view/${workOrder._id}?token=${encodeURIComponent(workOrder.viewToken)}`;
  const qrDataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, width: 200 });
  const qrImageBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

  // A4 portrait, margine 18-22mm (sa pretvorbom: 1 inch = 72 points, 1 inch = 25.4mm)
  // 20mm = approximately 56 points
  const marginMm = 20;
  const pageWidth = 595; // A4 width in points
  const pageHeight = 842; // A4 height in points
  const margin = 56; // 20mm u points

  const doc = new PDFDocument({ size: 'A4', margins: { top: margin, bottom: margin, left: margin, right: margin } });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  // ============ HEADER - Tamno plava ============
  doc.fillColor('#1e3a8a');
  doc.rect(margin - 20, margin - 60, pageWidth - 2 * (margin - 20), 100).fill();

  // Naziv firme
  doc.fillColor('#ffffff')
    .fontSize(22)
    .font('Helvetica-Bold')
    .text(company?.naziv || 'SERVISNA FIRMA', margin, margin - 45);

  // Kontakt firme
  doc.fontSize(10)
    .font('Helvetica')
    .text(company?.adresa || '', margin, margin - 10)
    .text(`OIB: ${company?.oib || '-'} | Email: ${company?.email || '-'}`, margin);

  // ============ METADATA O RADNOM NALOGU ============
  doc.moveDown(1.5);
  doc.fillColor('#111827').fontSize(16).font('Helvetica-Bold').text('RADNI NALOG');
  doc.fontSize(11).font('Helvetica');

  doc.fillColor('#374151')
    .text(`Broj: ${workOrder.workOrderNumber}`)
    .text(`Kreiran: ${formatDateHR(workOrder.created_at)}`)
    .text(`Status: ${workOrder.status === 'sent' ? 'POSLAN' : workOrder.status === 'signed' ? 'POTPISAN' : 'NACRT'}`);

  if (workOrder.status === 'draft') {
    doc.fillColor('#dc2626').fontSize(10).text('⚠️ PREDPREGLED - NIJE POSLAN');
    doc.fillColor('#111827');
  }

  // ============ SEPARATOR LINIJA ============
  doc.moveTo(margin, doc.y + 8)
    .lineTo(pageWidth - margin, doc.y + 8)
    .strokeColor('#d1d5db')
    .stroke();

  // ============ SEKCIJA: PODACI O STRANCI I DIZALU ============
  doc.moveDown(0.8);
  doc.fillColor('#1e40af').fontSize(13).font('Helvetica-Bold').text('📍 Podaci o stranci i dizalu');
  doc.fontSize(11).font('Helvetica').fillColor('#374151');

  doc.text(`Stranka: ${elevator?.nazivStranke || '-'}`, { width: 500 });
  doc.text(`Adresa: ${elevator?.ulica || '-'}, ${elevator?.mjesto || '-'}`);
  doc.text(`Broj dizala: ${elevator?.brojDizala || '-'}`);
  doc.text(`Broj ugovora: ${elevator?.brojUgovora || '-'}`);

  // ============ SEPARATOR LINIJA ============
  doc.moveTo(margin, doc.y + 8)
    .lineTo(pageWidth - margin, doc.y + 8)
    .strokeColor('#d1d5db')
    .stroke();

  // ============ SEKCIJA: PODACI O POPRAVKU ============
  doc.moveDown(0.8);
  doc.fillColor('#1e40af').fontSize(13).font('Helvetica-Bold').text('🔧 Podaci o popravku');
  doc.fontSize(11).font('Helvetica').fillColor('#374151');

  doc.text(`Datum prijave: ${formatDateHR(repair?.datumPrijave)}`);
  doc.text(`Datum popravke: ${formatDateHR(repair?.datumPopravka)}`);
  doc.text(`Status: ${repair?.status === 'completed' ? 'ZAVRŠENO' : repair?.status === 'in_progress' ? 'U TIJEKU' : 'PRIJAVLJEN'}`);
  
  if (repair?.opisKvara) {
    doc.text(`Opis kvara:`);
    doc.fontSize(10).text(repair.opisKvara, { width: 450, align: 'left' });
    doc.fontSize(11);
  }
  
  if (repair?.opisPopravka) {
    doc.text(`Opis popravke:`);
    doc.fontSize(10).text(repair.opisPopravka, { width: 450, align: 'left' });
    doc.fontSize(11);
  }

  // ============ SEPARATOR LINIJA ============
  doc.moveTo(margin, doc.y + 8)
    .lineTo(pageWidth - margin, doc.y + 8)
    .strokeColor('#d1d5db')
    .stroke();

  // ============ SEKCIJA: POTPIS ============
  if (workOrder.signedByName || workOrder.signedAt) {
    doc.moveDown(0.8);
    doc.fillColor('#1e40af').fontSize(13).font('Helvetica-Bold').text('✅ Potpis');
    doc.fontSize(10).font('Helvetica').fillColor('#374151');

    doc.text(`Potpisao: ${workOrder.signedByName || '-'}`);
    if (workOrder.signedAt) {
      doc.text(`Vrijeme: ${formatDateHR(workOrder.signedAt)}`);
    }

    // Digitalni potpis ako postoji
    if (workOrder.signatureImage) {
      try {
        const signatureData = workOrder.signatureImage.includes(',')
          ? workOrder.signatureImage.split(',')[1]
          : workOrder.signatureImage;
        const signatureBuffer = Buffer.from(signatureData, 'base64');
        doc.moveDown(0.5);
        doc.text('Digitalni potpis:', { underline: false });
        doc.image(signatureBuffer, margin, doc.y + 5, { fit: [150, 60] });
      } catch (err) {
        doc.text('Digitalni potpis: [nije moguće prikazati]');
      }
    }

    // ============ SEPARATOR LINIJA ============
    doc.moveTo(margin, doc.y + 8)
      .lineTo(pageWidth - margin, doc.y + 8)
      .strokeColor('#d1d5db')
      .stroke();
  }

  // ============ QR KOD I FOOTER ============
  doc.moveDown(0.8);
  doc.fontSize(9).fillColor('#6b7280').text('Skeniraj QR kod za online pregled i preuzimanje dokumenta.');
  doc.moveDown(0.3);
  
  // Postavi QR kod u donji desni kut
  const qrSize = 100;
  doc.image(qrImageBuffer, pageWidth - margin - qrSize - 10, doc.page.height - margin - qrSize - 10, { width: qrSize, height: qrSize });

  // Footer s kompanijom
  doc.moveDown(1);
  doc.fontSize(9).fillColor('#9ca3af');
  doc.text(`${company?.naziv || 'Servisna firma'} | ${company?.telefon || company?.mobitel || 'Kontakt'}`);
  doc.text(`${company?.email || ''}`);
  doc.text(`Generirano: ${new Date().toLocaleString('hr-HR')}`, { align: 'right' });

  doc.end();

  await new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return { fileName, filePath, qrUrl };
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
      const numbering = await nextWorkOrderNumber(new Date());
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

    const generated = await generatePdfForWorkOrder({
      workOrder,
      repair,
      elevator: repair.elevatorId,
      company,
      baseUrl,
    });

    workOrder.pdfFileName = generated.fileName;
    workOrder.pdfPath = generated.filePath;
    workOrder.lastGeneratedAt = new Date();
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
    const generated = await generatePdfForWorkOrder({
      workOrder,
      repair,
      elevator: repair.elevatorId,
      company,
      baseUrl,
    });

    workOrder.pdfFileName = generated.fileName;
    workOrder.pdfPath = generated.filePath;
    workOrder.lastGeneratedAt = new Date();
    await workOrder.save();

    // Pošalji email ako je radni nalog označen kao poslan i ako firma ima email
    if (sendNow && company?.email) {
      try {
        const downloadUrl = `${baseUrl}/api/work-orders/download/${workOrder._id}?token=${encodeURIComponent(workOrder.viewToken)}`;
        await sendWorkOrderEmail(workOrder, company, repair, repair.elevatorId, downloadUrl);
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

    const expiresText = formatDateHR(workOrder.tokenExpiresAt);
    const downloadUrl = `/api/work-orders/download/${workOrder._id}?token=${encodeURIComponent(token)}`;

    return res.send(`<!doctype html>
<html lang="hr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${workOrder.workOrderNumber}</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f3f4f6; margin: 0; padding: 24px; }
    .card { max-width: 620px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
    h1 { margin-top: 0; color: #111827; }
    .meta { color: #374151; line-height: 1.6; margin-bottom: 16px; }
    .status { display: inline-block; padding: 6px 10px; border-radius: 999px; background: #e0e7ff; color: #3730a3; font-weight: 700; }
    .btn { display: inline-block; margin-top: 12px; background: #2563eb; color: #fff; padding: 12px 14px; border-radius: 8px; text-decoration: none; font-weight: 700; }
    .small { color: #6b7280; font-size: 12px; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Radni nalog ${workOrder.workOrderNumber}</h1>
    <div class="meta">
      <div>Status: <span class="status">${workOrder.status.toUpperCase()}</span></div>
      <div>Kreiran: ${formatDateHR(workOrder.created_at)}</div>
      <div>Token vrijedi do: ${expiresText}</div>
    </div>
    <a class="btn" href="${downloadUrl}">Preuzmi PDF</a>
    <div class="small">Ako je link istekao, zatražite novi link od servisera ili firme.</div>
  </div>
</body>
</html>`);
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

    if (!workOrder.pdfPath || !fs.existsSync(workOrder.pdfPath)) {
      return res.status(404).send('PDF nije pronađen.');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${workOrder.pdfFileName || 'radni-nalog.pdf'}"`);
    return fs.createReadStream(workOrder.pdfPath).pipe(res);
  } catch (error) {
    console.error('Greška pri downloadu radnog naloga:', error);
    return res.status(500).send('Greška pri preuzimanju dokumenta.');
  }
});

// Get work order by repair ID (authenticated)
router.get('/by-repair/:repairId', authenticate, async (req, res) => {
  try {
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

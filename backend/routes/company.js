const express = require('express');
const router = express.Router();
const { authenticate, checkRole } = require('../middleware/auth');
const { logAction } = require('../services/auditService');
const Company = require('../models/Company');
const {
  createCompanyBackup,
  listCompanyBackups,
  getCompanyBackupFile,
  restoreCompanyBackup,
  restoreCompanyBackupFromUpload,
} = require('../services/backupService');

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

// GET /api/company/setup-status - Provjeri je li firma "setup" (obavezna polja)
router.get('/setup-status', authenticate, async (req, res) => {
  try {
    const company = await Company.findById(req.companyId);
    
    if (!company) {
      return res.json({ 
        isSetup: false, 
        message: 'Firma nije pronađena' 
      });
    }

    // Provjeri obavezna polja: naziv, adresa, email
    const isSetup = !!(company.naziv?.trim() && company.adresa?.trim() && company.email?.trim());

    return res.json({ 
      isSetup,
      missingFields: {
        naziv: !company.naziv?.trim(),
        adresa: !company.adresa?.trim(),
        email: !company.email?.trim(),
      }
    });
  } catch (error) {
    console.error('❌ Greška pri provjeri setup status:', error);
    return res.status(500).json({ message: 'Greška poslužitelja' });
  }
});

// GET /api/company - Dohvati podatke firme trenutnog usera
router.get('/', authenticate, async (req, res) => {
  try {
    const company = await Company.findById(req.companyId);
    
    if (!company) {
      return res.status(404).json({ message: 'Firma nije pronađena' });
    }

    return res.json({ data: company });
  } catch (error) {
    console.error(' Greška pri dohvaćanju firme:', error);
    return res.status(500).json({ message: 'Greška poslužitelja' });
  }
});

// PUT /api/company - Ažuriraj podatke firme (samo admin/menadžer)
router.put('/', authenticate, checkRole(['admin', 'menadzer']), async (req, res) => {
  try {
    const { naziv, adresa, oib, email, mobitel, telefon, web, logo } = req.body;

    const company = await Company.findById(req.companyId);
    
    if (!company) {
      return res.status(404).json({ message: 'Firma nije pronađena' });
    }

    // Ažuriraj polja
    if (naziv !== undefined) company.naziv = naziv;
    if (adresa !== undefined) company.adresa = adresa;
    if (oib !== undefined) company.oib = oib;
    if (email !== undefined) company.email = email;
    if (mobitel !== undefined) company.mobitel = mobitel;
    if (telefon !== undefined) company.telefon = telefon;
    if (web !== undefined) company.web = web;
    if (logo !== undefined) {
      const normalizedLogo = String(logo || '').trim();
      company.logo = normalizedLogo || null; // Base64 ili URL
      company.logoDataUrl = normalizedLogo ? await toEmbeddedImageDataUrl(normalizedLogo) : null;
    }

    await company.save();

    await logAction(
      'company',
      'update',
      company._id,
      req.user._id,
      { naziv: company.naziv },
      'Ažurirani podatci firme'
    );

    return res.json({
      message: 'Podatci firme uspješno ažurirani',
      data: company,
    });
  } catch (error) {
    console.error('❌ Greška pri ažuriranju firme:', error);
    return res.status(500).json({ message: 'Greška poslužitelja' });
  }
});

// GET /api/company/backup/list - Lista zadnjih backupa za firmu
router.get('/backup/list', authenticate, checkRole(['admin', 'menadzer']), async (req, res) => {
  try {
    const backups = await listCompanyBackups({
      companyId: req.companyId,
      limit: req.query.limit || 10,
    });

    return res.json({ success: true, data: backups });
  } catch (error) {
    console.error('❌ Greška pri dohvaćanju liste backupa firme:', error);
    return res.status(500).json({ message: 'Greška pri dohvaćanju backupa' });
  }
});

// POST /api/company/backup/create - Kreiraj backup firme
router.post('/backup/create', authenticate, checkRole(['admin', 'menadzer']), async (req, res) => {
  try {
    const backup = await createCompanyBackup({
      companyId: req.companyId,
      user: req.user,
      source: 'company',
      reason: req.body?.reason || '',
      customName: req.body?.backupName || '',
      includeAuditLogs: Boolean(req.body?.includeAuditLogs),
    });

    await logAction({
      companyId: req.companyId,
      korisnikId: req.user._id,
      akcija: 'UPDATE',
      entitet: 'Company',
      entitetId: req.companyId,
      opis: `Kreiran backup firme (${backup.totalDocuments} zapisa)`
    });

    return res.json({
      success: true,
      message: 'Backup je uspješno kreiran',
      data: backup,
    });
  } catch (error) {
    console.error('❌ Greška pri kreiranju backupa firme:', error);
    return res.status(500).json({ message: error.message || 'Greška pri kreiranju backupa' });
  }
});

// GET /api/company/backup/download/:backupId - Download backup datoteke
router.get('/backup/download/:backupId', authenticate, checkRole(['admin', 'menadzer']), async (req, res) => {
  try {
    const file = await getCompanyBackupFile({
      companyId: req.companyId,
      backupId: req.params.backupId,
    });

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Content-Length', String(file.compressedData.length));
    return res.send(file.compressedData);
  } catch (error) {
    console.error('❌ Greška pri download-u backupa firme:', error);
    return res.status(500).json({ message: error.message || 'Greška pri download-u backupa' });
  }
});

// POST /api/company/backup/restore/:backupId - Restore firme iz odabranog backupa
router.post('/backup/restore/:backupId', authenticate, checkRole(['admin', 'menadzer']), async (req, res) => {
  try {
    const restored = await restoreCompanyBackup({
      companyId: req.companyId,
      backupId: req.params.backupId,
      user: req.user,
    });

    await logAction({
      companyId: req.companyId,
      korisnikId: req.user._id,
      akcija: 'UPDATE',
      entitet: 'Company',
      entitetId: req.companyId,
      opis: `Vraćen backup firme (${restored.totalDocuments} zapisa)`
    });

    return res.json({
      success: true,
      message: 'Backup je uspješno vraćen',
      data: restored,
    });
  } catch (error) {
    console.error('❌ Greška pri restore-u backupa firme:', error);
    return res.status(500).json({ message: error.message || 'Greška pri vraćanju backupa' });
  }
});

// POST /api/company/backup/restore-upload - Restore firme iz uploadane .json.gz datoteke
router.post('/backup/restore-upload', authenticate, checkRole(['admin', 'menadzer']), async (req, res) => {
  try {
    const restored = await restoreCompanyBackupFromUpload({
      companyId: req.companyId,
      fileBase64: req.body?.fileBase64,
      fileName: req.body?.fileName,
      user: req.user,
    });

    await logAction({
      companyId: req.companyId,
      korisnikId: req.user._id,
      akcija: 'UPDATE',
      entitet: 'Company',
      entitetId: req.companyId,
      opis: `Vraćen backup firme iz datoteke (${restored.totalDocuments} zapisa)`
    });

    return res.json({
      success: true,
      message: 'Backup iz datoteke je uspješno vraćen',
      data: restored,
    });
  } catch (error) {
    console.error('❌ Greška pri restore-u iz datoteke:', error);
    return res.status(500).json({ message: error.message || 'Greška pri vraćanju backupa iz datoteke' });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const { authenticate, checkRole } = require('../middleware/auth');
const { logAction } = require('../services/auditService');
const Company = require('../models/Company');

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

module.exports = router;

const express = require('express');
const router = express.Router();
const { authenticate, checkRole } = require('../middleware/auth');
const { logAction } = require('../services/auditService');
const Company = require('../models/Company');

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
    if (logo !== undefined) company.logo = logo; // Base64 ili URL

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

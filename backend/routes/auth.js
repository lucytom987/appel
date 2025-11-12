const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

const router = express.Router();

// POST /api/auth/login - Prijava korisnika
router.post('/login', async (req, res) => {
  try {
    console.log('📥 Login request body:', req.body);
    const { email, lozinka } = req.body;

    console.log('📧 Email:', email);
    console.log('🔑 Lozinka primljena:', lozinka ? 'DA' : 'NE');

    if (!email || !lozinka) {
      console.log('❌ Email ili lozinka nedostaju!');
      return res.status(400).json({ message: 'Email i lozinka su obavezni' });
    }

    console.log('🔍 Tražim korisnika:', email);
    const user = await User.findOne({ email });
    console.log('👤 Korisnik pronađen:', user ? 'DA' : 'NE');
    
    if (!user || !user.aktivan) {
      console.log('❌ Korisnik ne postoji ili nije aktivan');
      return res.status(401).json({ message: 'Nevaljani email ili lozinka' });
    }

    console.log('🔐 Provjeravam lozinku...');
    const validnaLozinka = await user.provjeriLozinku(lozinka);
    console.log('✅ Lozinka validna:', validnaLozinka ? 'DA' : 'NE');
    
    if (!validnaLozinka) {
      console.log('❌ Pogrešna lozinka');
      return res.status(401).json({ message: 'Nevaljani email ili lozinka' });
    }

    // Kreiraj JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '24h' }
    );

    console.log(`✅ Korisnik prijavljen: ${user.email} (${user.uloga})`);

    res.json({
      token,
      korisnik: user.toJSON()
    });
  } catch (error) {
    console.error('❌ Login greška:', error);
    res.status(500).json({ message: 'Greška pri prijavi' });
  }
});

// POST /api/auth/register - Registracija novog korisnika (admin only)
router.post('/register', authenticate, async (req, res) => {
  try {
    const { ime, prezime, email, lozinka, uloga, telefon } = req.body;

    // Samo admin može registrirati
    if (req.user.uloga !== 'admin') {
      return res.status(403).json({ message: 'Samo admin može registrirati nove korisnike' });
    }

    const postojeciKorisnik = await User.findOne({ email });
    if (postojeciKorisnik) {
      return res.status(400).json({ message: 'Korisnik sa tim emailom već postoji' });
    }

    const noviKorisnik = new User({
      ime,
      prezime,
      email,
      lozinka,
      uloga: uloga || 'serviser',
      telefon
    });

    await noviKorisnik.save();

    // Log akciju
    await logAction({
      korisnikId: req.user._id,
      akcija: 'CREATE',
      entitet: 'User',
      entitetId: noviKorisnik._id,
      entitetNaziv: `${ime} ${prezime}`,
      noveVrijednosti: noviKorisnik.toJSON(),
      ipAdresa: req.ip,
      opis: `Kreiran novi korisnik: ${email}`
    });

    console.log(`✅ Novi korisnik registriran: ${email}`);

    res.status(201).json({
      message: 'Korisnik uspješno registriran',
      user: noviKorisnik.toJSON()
    });
  } catch (error) {
    console.error('❌ Register greška:', error);
    res.status(500).json({ message: 'Greška pri registraciji' });
  }
});

// GET /api/auth/me - Trenutni korisnik
router.get('/me', authenticate, (req, res) => {
  res.json(req.user.toJSON());
});

module.exports = router;

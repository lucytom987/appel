const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

const router = express.Router();

// POST /api/auth/login - Prijava korisnika
router.post('/login', async (req, res) => {
  try {
    const { email, lozinka } = req.body;

    if (!email || !lozinka) {
      return res.status(400).json({ message: 'Email i lozinka su obavezni' });
    }

    const user = await User.findOne({ email });
    
    if (!user || !user.aktivan) {
      return res.status(401).json({ message: 'Nevaljani email ili lozinka' });
    }

    const validnaLozinka = await user.provjeriLozinku(lozinka);
    
    if (!validnaLozinka) {
      return res.status(401).json({ message: 'Nevaljani email ili lozinka' });
    }

    // Kreiraj JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '24h' }
    );

    res.json({
      token,
      korisnik: user.toJSON()
    });
  } catch (error) {
    console.error('ƒ?O Login gre­ka:', error);
    res.status(500).json({ message: 'Gre­ka pri prijavi' });
  }
});

// POST /api/auth/register - Registracija novog korisnika (admin only)
router.post('/register', authenticate, async (req, res) => {
  try {
    const { ime, prezime, email, lozinka, uloga, telefon } = req.body;

    // Samo admin moóe registrirati
    if (req.user.uloga !== 'admin') {
      return res.status(403).json({ message: 'Samo admin moóe registrirati nove korisnike' });
    }

    const postojeciKorisnik = await User.findOne({ email });
    if (postojeciKorisnik) {
      return res.status(400).json({ message: 'Korisnik sa tim emailom veŽÎ postoji' });
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

    res.status(201).json({
      message: 'Korisnik uspje­no registriran',
      user: noviKorisnik.toJSON()
    });
  } catch (error) {
    console.error('ƒ?O Register gre­ka:', error);
    res.status(500).json({ message: 'Gre­ka pri registraciji' });
  }
});

// GET /api/auth/me - Trenutni korisnik
router.get('/me', authenticate, (req, res) => {
  res.json(req.user.toJSON());
});

module.exports = router;

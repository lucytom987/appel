const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Company = require('../models/Company');
const { authenticate } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

const router = express.Router();

// Helper za generiranje access/refresh tokena
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '30d' }
  );

  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '90d' }
  );

  return { accessToken, refreshToken };
};

// POST /api/auth/login - Prijava korisnika
router.post('/login', async (req, res) => {
  try {
    const { email, lozinka, companyId, firmaId } = req.body;
    const loginCompanyId = companyId || firmaId;

    if (!email || !lozinka) {
      return res.status(400).json({ message: 'Email i lozinka su obavezni' });
    }

    let user;
    if (loginCompanyId) {
      user = await User.findOne({ email, companyId: loginCompanyId });
    } else {
      const matches = await User.find({ email, aktivan: true }).limit(2);
      if (matches.length > 1) {
        return res.status(409).json({
          message: 'Pronađeno je više korisnika s istim emailom. Pošaljite i companyId pri prijavi.',
        });
      }
      user = matches[0];
    }

    if (!user || !user.aktivan) {
      return res.status(401).json({ message: 'Nevaljani email ili lozinka' });
    }

    const validnaLozinka = await user.provjeriLozinku(lozinka);
    if (!validnaLozinka) {
      return res.status(401).json({ message: 'Nevaljani email ili lozinka' });
    }

    const { accessToken, refreshToken } = generateTokens(user._id);

    res.json({
      token: accessToken,
      refreshToken,
      korisnik: user.toJSON(),
    });
  } catch (error) {
    console.error('Login greška:', error);
    res.status(500).json({ message: 'Greška pri prijavi' });
  }
});

// POST /api/auth/refresh - Osvježi access token
router.post('/refresh', async (req, res) => {
  try {
    const incoming = req.body.refreshToken || req.header('x-refresh-token');
    if (!incoming) {
      return res.status(401).json({ message: 'Nedostaje refresh token' });
    }

    let decoded;
    try {
      decoded = jwt.verify(incoming, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'Nevažeći refresh token' });
    }

    const user = await User.findById(decoded.userId);
    if (!user || !user.aktivan) {
      return res.status(401).json({ message: 'Korisnik nije pronađen ili nije aktivan' });
    }

    const { accessToken, refreshToken } = generateTokens(user._id);
    res.json({
      token: accessToken,
      refreshToken,
      korisnik: user.toJSON(),
    });
  } catch (error) {
    console.error('Refresh token greška:', error?.message);
    res.status(500).json({ message: 'Greška pri osvježavanju tokena' });
  }
});

// POST /api/auth/register - Registracija novog korisnika (admin only)
router.post('/register', authenticate, async (req, res) => {
  try {
    const { ime, prezime, email, lozinka, uloga, telefon } = req.body;

    if (req.user.uloga !== 'admin') {
      return res.status(403).json({ message: 'Samo admin može registrirati nove korisnike' });
    }

    const postojeciKorisnik = await User.findOne({ email, companyId: req.companyId });
    if (postojeciKorisnik) {
      return res.status(400).json({ message: 'Korisnik s tim emailom već postoji u vašoj firmi' });
    }

    const noviKorisnik = new User({
      companyId: req.companyId,
      ime,
      prezime,
      email,
      lozinka,
      uloga: uloga || 'serviser',
      telefon,
    });

    await noviKorisnik.save();

    await logAction({
      korisnikId: req.user._id,
      akcija: 'CREATE',
      entitet: 'User',
      entitetId: noviKorisnik._id,
      entitetNaziv: `${ime} ${prezime}`,
      noveVrijednosti: noviKorisnik.toJSON(),
      ipAdresa: req.ip,
      opis: `Kreiran novi korisnik: ${email}`,
    });

    res.status(201).json({
      message: 'Korisnik uspješno registriran',
      user: noviKorisnik.toJSON(),
    });
  } catch (error) {
    console.error('Register greška:', error);
    res.status(500).json({ message: 'Greška pri registraciji' });
  }
});

// POST /api/auth/public-register - Registracija nove stranke (javni endpoint)
router.post('/public-register', async (req, res) => {
  try {
    const { ime, prezime, email, lozinka, nazivFirme } = req.body;

    if (!ime || !prezime || !email || !lozinka || !nazivFirme) {
      return res.status(400).json({ message: 'Sva polja su obavezna (ime, prezime, email, lozinka, nazivFirme)' });
    }

    if (lozinka.length < 6) {
      return res.status(400).json({ message: 'Lozinka mora imati najmanje 6 znakova' });
    }

    // Kreiraj novu firmu
    const novaFirma = new Company({ naziv: nazivFirme });
    await novaFirma.save();

    // Provjeri postoji li korisnik s tim emailom u novoj firmi (ne bi trebalo, ali za svaki slučaj)
    const postojeciKorisnik = await User.findOne({ email, companyId: novaFirma._id });
    if (postojeciKorisnik) {
      await Company.findByIdAndDelete(novaFirma._id);
      return res.status(400).json({ message: 'Korisnik s tim emailom već postoji' });
    }

    // Kreiraj admin korisnika
    const adminKorisnik = new User({
      companyId: novaFirma._id,
      ime,
      prezime,
      email,
      lozinka,
      uloga: 'admin',
      aktivan: true,
    });
    await adminKorisnik.save();

    const { accessToken, refreshToken } = generateTokens(adminKorisnik._id);

    await logAction({
      korisnikId: adminKorisnik._id,
      akcija: 'CREATE',
      entitet: 'Company',
      entitetId: novaFirma._id,
      entitetNaziv: nazivFirme,
      noveVrijednosti: { firma: novaFirma.toJSON(), korisnik: adminKorisnik.toJSON() },
      ipAdresa: req.ip,
      opis: `Nova registracija: ${email} za firmu "${nazivFirme}"`,
    });

    res.status(201).json({
      token: accessToken,
      refreshToken,
      korisnik: adminKorisnik.toJSON(),
    });
  } catch (error) {
    console.error('Public register greška:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Korisnik s tim emailom već postoji' });
    }
    res.status(500).json({ message: 'Greška pri registraciji' });
  }
});

// GET /api/auth/me - Trenutni korisnik
router.get('/me', authenticate, (req, res) => {
  res.json(req.user.toJSON());
});

module.exports = router;

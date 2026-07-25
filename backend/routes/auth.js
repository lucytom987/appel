const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Company = require('../models/Company');
const { authenticate } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

const router = express.Router();

// Hardkodirani super admin - SAMO ovi emailovi imaju pristup
const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || 'vidacek.tomek@gmail.com,vidacek@appel.com')
  .split(',')
  .map(e => e.trim().toLowerCase());
const isSuperAdmin = (email) => email && SUPER_ADMIN_EMAILS.includes(email.toLowerCase());

const isTrue = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).trim().toLowerCase() === 'true';
};

const isPublicRegistrationEnabled = () => {
  const defaultEnabled = (process.env.NODE_ENV || '').toLowerCase() !== 'production';
  return isTrue(process.env.PUBLIC_REGISTER_ENABLED, defaultEnabled);
};

const getClientIp = (req) => {
  const forwardedFor = req.header('x-forwarded-for');
  if (forwardedFor) {
    return String(forwardedFor).split(',')[0].trim();
  }
  return req.ip;
};

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

    const korisnikData = user.toJSON();
    korisnikData.superAdmin = isSuperAdmin(user.email);

    res.json({
      token: accessToken,
      refreshToken,
      korisnik: korisnikData,
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
    if (!isPublicRegistrationEnabled()) {
      return res.status(403).json({
        message: 'Javna registracija firmi je trenutno onemogucena. Javite se administratoru.',
      });
    }

    const requiredRegistrationKey = String(process.env.PUBLIC_REGISTER_KEY || '').trim();
    if (requiredRegistrationKey) {
      const providedRegistrationKey = String(
        req.body?.registrationKey || req.header('x-registration-key') || ''
      ).trim();

      if (!providedRegistrationKey || providedRegistrationKey !== requiredRegistrationKey) {
        return res.status(403).json({
          message: 'Registracija nije dozvoljena bez valjanog registracijskog kljuca.',
        });
      }
    }

    const { ime, prezime, email, lozinka, nazivFirme } = req.body;
    const imeTrimmed = String(ime || '').trim();
    const prezimeTrimmed = String(prezime || '').trim();
    const nazivFirmeTrimmed = String(nazivFirme || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!imeTrimmed || !prezimeTrimmed || !normalizedEmail || !lozinka || !nazivFirmeTrimmed) {
      return res.status(400).json({ message: 'Sva polja su obavezna (ime, prezime, email, lozinka, nazivFirme)' });
    }

    if (imeTrimmed.length > 80 || prezimeTrimmed.length > 80 || nazivFirmeTrimmed.length > 140) {
      return res.status(400).json({ message: 'Ime, prezime ili naziv firme su predugacki' });
    }

    const basicEmailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
    if (!basicEmailOk) {
      return res.status(400).json({ message: 'Email nije ispravnog formata' });
    }

    if (lozinka.length < 6) {
      return res.status(400).json({ message: 'Lozinka mora imati najmanje 6 znakova' });
    }

    const postojeciEmail = await User.findOne({ email: normalizedEmail }).select('_id').lean();
    if (postojeciEmail) {
      return res.status(400).json({ message: 'Korisnik s tim emailom već postoji' });
    }

    let novaFirma;
    try {
      // Kreiraj novu firmu
      novaFirma = new Company({ naziv: nazivFirmeTrimmed });
      await novaFirma.save();

      // Kreiraj admin korisnika
      const adminKorisnik = new User({
        companyId: novaFirma._id,
        ime: imeTrimmed,
        prezime: prezimeTrimmed,
        email: normalizedEmail,
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
        entitetNaziv: nazivFirmeTrimmed,
        noveVrijednosti: { firma: novaFirma.toJSON(), korisnik: adminKorisnik.toJSON() },
        ipAdresa: getClientIp(req),
        opis: `Nova registracija: ${normalizedEmail} za firmu "${nazivFirmeTrimmed}"`,
      });

      res.status(201).json({
        token: accessToken,
        refreshToken,
        korisnik: adminKorisnik.toJSON(),
      });
    } catch (error) {
      if (novaFirma?._id) {
        await Company.findByIdAndDelete(novaFirma._id).catch(() => null);
      }
      throw error;
    }
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
  const data = req.user.toJSON();
  data.superAdmin = isSuperAdmin(req.user.email);
  res.json(data);
});

// Export isSuperAdmin za korištenje u drugim rutama
router.isSuperAdmin = isSuperAdmin;

module.exports = router;

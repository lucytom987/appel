const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticate, checkRole } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

const router = express.Router();

// GET /api/users - Lista svih korisnika
router.get('/', authenticate, async (req, res) => {
  try {
    const users = await User.find({}, { lozinka: 0 });
    res.json(users);
  } catch (error) {
    console.error('Greska pri dohvacanju korisnika:', error);
    res.status(500).json({ message: 'Greska pri dohvacanju korisnika' });
  }
});

// GET /api/users/lite - Ograniceni popis
router.get('/lite', authenticate, async (req, res) => {
  try {
    const users = await User.find({}, 'ime prezime uloga aktivan email telefon').sort({ prezime: 1, ime: 1 }).lean();
    res.json(users);
  } catch (error) {
    console.error('Greska pri dohvacanju korisnika (lite):', error);
    res.status(500).json({ message: 'Greska pri dohvacanju korisnika' });
  }
});

// GET /api/users/:id - Detalji korisnika
router.get('/:id', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.params.id, { lozinka: 0 });
    if (!user) {
      return res.status(404).json({ message: 'Korisnik nije pronadjen' });
    }
    res.json(user);
  } catch (error) {
    console.error('Greska pri dohvacanju korisnika:', error);
    res.status(500).json({ message: 'Greska pri dohvacanju korisnika' });
  }
});

// POST /api/users - Kreiraj novog korisnika
router.post('/', authenticate, async (req, res) => {
  try {
    const { ime, prezime, email, lozinka, uloga, telefon } = req.body;

    if (!ime || !prezime || !email || !lozinka || !uloga) {
      return res.status(400).json({ message: 'Svi obavezni podaci su potrebni' });
    }

    const postojeciKorisnik = await User.findOne({ email });
    if (postojeciKorisnik) {
      return res.status(400).json({ message: 'Korisnik sa tim emailom vec postoji' });
    }

    if (!['serviser', 'menadzer', 'admin', 'technician', 'manager'].includes(uloga)) {
      return res.status(400).json({ message: 'Nevaljana uloga' });
    }

    const noviKorisnik = new User({
      ime,
      prezime,
      email,
      lozinka,
      uloga,
      telefon,
      aktivan: true
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
      opis: `Kreiran novi korisnik: ${email} (${uloga})`
    });

    res.status(201).json({
      message: 'Korisnik uspjesno kreiran',
      user: noviKorisnik.toJSON()
    });
  } catch (error) {
    console.error('Greska pri kreiranju korisnika:', error);
    res.status(500).json({ message: 'Greska pri kreiranju korisnika' });
  }
});

// PUT /api/users/:id - Uredi korisnika
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { ime, prezime, lozinka, uloga, telefon, aktivan } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Korisnik nije pronadjen' });
    }

    const stareVrijednosti = {
      ime: user.ime,
      prezime: user.prezime,
      uloga: user.uloga,
      telefon: user.telefon,
      aktivan: user.aktivan
    };

    if (ime) user.ime = ime;
    if (prezime) user.prezime = prezime;
    if (lozinka) user.lozinka = lozinka;
    if (uloga && ['serviser', 'menadzer', 'admin', 'technician', 'manager'].includes(uloga)) user.uloga = uloga;
    if (telefon) user.telefon = telefon;
    if (typeof aktivan === 'boolean') user.aktivan = aktivan;

    user.azuriranDatum = new Date();
    await user.save();

    await logAction({
      korisnikId: req.user._id,
      akcija: 'UPDATE',
      entitet: 'User',
      entitetId: user._id,
      entitetNaziv: `${user.ime} ${user.prezime}`,
      stareVrijednosti,
      noveVrijednosti: {
        ime: user.ime,
        prezime: user.prezime,
        uloga: user.uloga,
        telefon: user.telefon,
        aktivan: user.aktivan
      },
      ipAdresa: req.ip,
      opis: `Azuriran korisnik: ${user.email}`
    });

    res.json({
      message: 'Korisnik uspjesno azuriran',
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Greska pri azuriranju korisnika:', error);
    res.status(500).json({ message: 'Greska pri azuriranju korisnika' });
  }
});

// DELETE /api/users/:id - Obrisi korisnika (samo menadzer/admin)
router.delete('/:id', authenticate, checkRole(['menadzer', 'admin']), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Korisnik nije pronadjen' });
    }

    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Ne mozete obrisati sami sebe' });
    }

    const userNaziv = `${user.ime} ${user.prezime}`;
    const userEmail = user.email;
    const userUloga = user.uloga;

    await User.findByIdAndDelete(req.params.id);

    await logAction({
      korisnikId: req.user._id,
      akcija: 'DELETE',
      entitet: 'User',
      entitetId: req.params.id,
      entitetNaziv: userNaziv,
      stareVrijednosti: user.toJSON(),
      ipAdresa: req.ip,
      opis: `Obrisan korisnik: ${userEmail} (${userUloga})`
    });

    res.json({
      message: 'Korisnik uspjesno obrisan',
      deletedUser: userNaziv
    });
  } catch (error) {
    console.error('Greska pri brisanju korisnika:', error);
    res.status(500).json({ message: 'Greska pri brisanju korisnika' });
  }
});

// GET /api/users/:id/password - Prikazi lozinku (logirano)
router.get('/:id/password', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Korisnik nije pronadjen' });
    }

    await logAction({
      korisnikId: req.user._id,
      akcija: 'VIEW',
      entitet: 'User',
      entitetId: user._id,
      entitetNaziv: `${user.ime} ${user.prezime}`,
      stareVrijednosti: user.toJSON(),
      ipAdresa: req.ip,
      opis: `Prikazana lozinka za korisnika ${user.email}`
    });

    res.json({ lozinka: user.lozinka, email: user.email });
  } catch (error) {
    console.error('Greska pri dohvaćanju lozinke:', error);
    res.status(500).json({ message: 'Greska pri dohvaćanju lozinke' });
  }
});

// PUT /api/users/:id/reset-password - Resetiraj lozinku
router.put('/:id/reset-password', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Korisnik nije pronadjen' });
    }

    const { novaLozinka } = req.body;
    if (!novaLozinka) {
      return res.status(400).json({ message: 'Nova lozinka je obavezna' });
    }

    user.lozinka = novaLozinka;
    user.azuriranDatum = new Date();
    await user.save();

    await logAction({
      korisnikId: req.user._id,
      akcija: 'UPDATE',
      entitet: 'User',
      entitetId: user._id,
      entitetNaziv: `${user.ime} ${user.prezime}`,
      stareVrijednosti: user.toJSON(),
      ipAdresa: req.ip,
      opis: `Resetirana lozinka za korisnika ${user.email}`
    });

    res.json({ message: 'Lozinka resetirana', user: user.toJSON() });
  } catch (error) {
    console.error('Greska pri resetiranju lozinke:', error);
    res.status(500).json({ message: 'Greska pri resetiranju lozinke' });
  }
});

module.exports = router;

const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { authenticate, checkRole } = require('../middleware/auth');
const { logAction } = require('../services/auditService');

const router = express.Router();

// GET /api/users - Lista svih korisnika (admin only)
router.get('/', authenticate, checkRole(['admin']), async (req, res) => {
  try {
    const users = await User.find({}, { lozinka: 0 }); // Nikad nemoj vraćati lozinku
    res.json(users);
  } catch (error) {
    console.error('❌ Greška pri dohvaćanju korisnika:', error);
    res.status(500).json({ message: 'Greška pri dohvaćanju korisnika' });
  }
});

// GET /api/users/:id - Detalji korisnika (admin only)
router.get('/:id', authenticate, checkRole(['admin']), async (req, res) => {
  try {
    const user = await User.findById(req.params.id, { lozinka: 0 });
    if (!user) {
      return res.status(404).json({ message: 'Korisnik nije pronađen' });
    }
    res.json(user);
  } catch (error) {
    console.error('❌ Greška pri dohvaćanju korisnika:', error);
    res.status(500).json({ message: 'Greška pri dohvaćanju korisnika' });
  }
});

// POST /api/users - Kreiraj novog korisnika (admin only)
router.post('/', authenticate, checkRole(['admin']), async (req, res) => {
  try {
    const { ime, prezime, email, lozinka, uloga, telefon } = req.body;

    // Validacija
    if (!ime || !prezime || !email || !lozinka || !uloga) {
      return res.status(400).json({ message: 'Svi obavezni podaci su potrebni' });
    }

    // Provjeri da li korisnik već postoji
    const postojeciKorisnik = await User.findOne({ email });
    if (postojeciKorisnik) {
      return res.status(400).json({ message: 'Korisnik sa tim emailom već postoji' });
    }

    // Provjeri valjanost uloge
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

    // Log akciju
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

    console.log(`✅ Novi korisnik kreiran: ${email} (${uloga})`);

    res.status(201).json({
      message: 'Korisnik uspješno kreiran',
      user: noviKorisnik.toJSON()
    });
  } catch (error) {
    console.error('❌ Greška pri kreiranju korisnika:', error);
    res.status(500).json({ message: 'Greška pri kreiranju korisnika' });
  }
});

// PUT /api/users/:id - Uredi korisnika (admin only)
router.put('/:id', authenticate, checkRole(['admin']), async (req, res) => {
  try {
    const { ime, prezime, lozinka, uloga, telefon, aktivan } = req.body;
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Korisnik nije pronađen' });
    }

    // Spremi stare vrijednosti za log
    const stareVrijednosti = {
      ime: user.ime,
      prezime: user.prezime,
      uloga: user.uloga,
      telefon: user.telefon,
      aktivan: user.aktivan
    };

    // Update polja
    if (ime) user.ime = ime;
    if (prezime) user.prezime = prezime;
    if (lozinka) user.lozinka = lozinka; // Će biti hashirana u pre('save')
    if (uloga && ['serviser', 'menadzer', 'admin', 'technician', 'manager'].includes(uloga)) user.uloga = uloga;
    if (telefon) user.telefon = telefon;
    if (typeof aktivan === 'boolean') user.aktivan = aktivan;

    user.azuriranDatum = new Date();
    await user.save();

    // Log akciju
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
      opis: `Ažuriran korisnik: ${user.email}`
    });

    console.log(`✅ Korisnik ažuriran: ${user.email}`);

    res.json({
      message: 'Korisnik uspješno ažuriran',
      user: user.toJSON()
    });
  } catch (error) {
    console.error('❌ Greška pri ažuriranju korisnika:', error);
    res.status(500).json({ message: 'Greška pri ažuriranju korisnika' });
  }
});

// DELETE /api/users/:id - Obriši korisnika (admin only)
router.delete('/:id', authenticate, checkRole(['admin']), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Korisnik nije pronađen' });
    }

    // Nemoj obrisati samog sebe
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Ne možeš obrisati samog sebe' });
    }

    const userNaziv = `${user.ime} ${user.prezime}`;
    const userEmail = user.email;
    const userUloga = user.uloga;

    await User.findByIdAndDelete(req.params.id);

    // Log akciju
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

    console.log(`✅ Korisnik obrisan: ${userEmail}`);

    res.json({
      message: 'Korisnik uspješno obrisan',
      deletedUser: userNaziv
    });
  } catch (error) {
    console.error('❌ Greška pri brisanju korisnika:', error);
    res.status(500).json({ message: 'Greška pri brisanju korisnika' });
  }
});

// GET /api/users/:id/password - Prikaži lozinku (admin only, za povrat ili reset)
// NAPOMENA: Ova ruta je SAMO za admin koji želi vidjeti lozinku - trebala bi biti loirana i zaštićena!
router.get('/:id/password', authenticate, checkRole(['admin']), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Korisnik nije pronađen' });
    }

    // Log akciju - važno za sigurnost!
    await logAction({
      korisnikId: req.user._id,
      akcija: 'VIEW',
      entitet: 'User',
      entitetId: user._id,
      entitetNaziv: `${user.ime} ${user.prezime}`,
      ipAdresa: req.ip,
      opis: `Admin je pogledao lozinku za: ${user.email}`
    });

    // NAPOMENA: Nikad nemoj vraćati hashovanu lozinku jer je nepovratna!
    // Trebao bi biti getPassword koji pamti originalnu lozinku ili koristi reset token
    // Za sada vraćam poruku da je lozinka hashirana
    res.json({
      message: 'Lozinka je kriptirana i ne može se prikazati',
      info: 'Trebao bi koristiti "Reset lozinku" opciju da bi postavio novu lozinku',
      user: {
        id: user._id,
        ime: user.ime,
        prezime: user.prezime,
        email: user.email
      }
    });
  } catch (error) {
    console.error('❌ Greška pri dohvaćanju lozinke:', error);
    res.status(500).json({ message: 'Greška pri dohvaćanju lozinke' });
  }
});

// PUT /api/users/:id/reset-password - Reset lozinke (admin only)
router.put('/:id/reset-password', authenticate, checkRole(['admin']), async (req, res) => {
  try {
    const { novaLozinka } = req.body;

    if (!novaLozinka || novaLozinka.length < 6) {
      return res.status(400).json({ message: 'Lozinka mora biti najmanje 6 znakova' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Korisnik nije pronađen' });
    }

    // Spremi novu lozinku kao privremenaLozinka (za prikaz admin-u)
    user.privremenaLozinka = novaLozinka;
    
    // Spremi stvarnu lozinku (će biti hashirana u pre('save') hooku)
    user.lozinka = novaLozinka;
    user.azuriranDatum = new Date();
    await user.save();

    // Log akciju
    await logAction({
      korisnikId: req.user._id,
      akcija: 'UPDATE',
      entitet: 'User',
      entitetId: user._id,
      entitetNaziv: `${user.ime} ${user.prezime}`,
      ipAdresa: req.ip,
      opis: `Admin je resetirao lozinku za: ${user.email}`
    });

    console.log(`✅ Lozinka resetirana za: ${user.email}`);

    res.json({
      message: 'Lozinka uspješno resetirana',
      temporaryPassword: novaLozinka, // Prikaži admin-u samo jednom
      user: user.toJSON()
    });
  } catch (error) {
    console.error('❌ Greška pri resetiranju lozinke:', error);
    res.status(500).json({ message: 'Greška pri resetiranju lozinke' });
  }
});

module.exports = router;

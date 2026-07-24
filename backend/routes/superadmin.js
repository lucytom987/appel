const express = require('express');
const { authenticate } = require('../middleware/auth');
const Company = require('../models/Company');
const User = require('../models/User');
const Elevator = require('../models/Elevator');
const Service = require('../models/Service');
const Repair = require('../models/Repair');
const BackupSnapshot = require('../models/BackupSnapshot');
const {
  createCompanyBackup,
  listCompanyBackups,
  getCompanyBackupFile,
  restoreCompanyBackup,
  restoreCompanyBackupFromUpload,
  createBackupsForAllCompanies,
} = require('../services/backupService');

const router = express.Router();

// Hardkodirani super admin emailovi - isti kao u auth.js
const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS || 'vidacek.tomek@gmail.com,vidacek@appel.com')
  .split(',')
  .map(e => e.trim().toLowerCase());

// Middleware: provjeri je li korisnik super admin po emailu
const requireSuperAdmin = async (req, res, next) => {
  if (!req.user.email || !SUPER_ADMIN_EMAILS.includes(req.user.email.toLowerCase())) {
    return res.status(403).json({ message: 'Pristup dozvoljen samo super administratoru' });
  }
  next();
};

// Sve rute zahtijevaju auth + superAdmin
router.use(authenticate, requireSuperAdmin);

// GET /api/superadmin/companies - Lista svih firmi
router.get('/companies', async (req, res) => {
  try {
    const companies = await Company.find().sort({ created_at: -1 }).lean();

    // Za svaku firmu dohvati broj korisnika i dizala
    const enriched = await Promise.all(
      companies.map(async (company) => {
        const [userCount, elevatorCount, adminUser] = await Promise.all([
          User.countDocuments({ companyId: company._id, aktivan: true }),
          Elevator.countDocuments({ companyId: company._id, is_deleted: { $ne: true } }),
          User.findOne({ companyId: company._id, uloga: 'admin' }).select('ime prezime email').lean(),
        ]);
        return {
          ...company,
          userCount,
          elevatorCount,
          admin: adminUser,
        };
      })
    );

    res.json({ success: true, data: enriched });
  } catch (error) {
    console.error('SuperAdmin companies error:', error);
    res.status(500).json({ message: 'Greška pri dohvaćanju firmi' });
  }
});

// GET /api/superadmin/companies/:id - Detalji jedne firme
router.get('/companies/:id', async (req, res) => {
  try {
    const company = await Company.findById(req.params.id).lean();
    if (!company) {
      return res.status(404).json({ message: 'Firma nije pronađena' });
    }

    const [users, elevatorCount, serviceCount, repairCount] = await Promise.all([
      User.find({ companyId: company._id }).select('ime prezime email uloga aktivan telefon kreiranDatum').lean(),
      Elevator.countDocuments({ companyId: company._id, is_deleted: { $ne: true } }),
      Service.countDocuments({ companyId: company._id, is_deleted: { $ne: true } }),
      Repair.countDocuments({ companyId: company._id, is_deleted: { $ne: true } }),
    ]);

    res.json({
      success: true,
      data: {
        ...company,
        users,
        stats: { elevatorCount, serviceCount, repairCount },
      },
    });
  } catch (error) {
    console.error('SuperAdmin company detail error:', error);
    res.status(500).json({ message: 'Greška pri dohvaćanju detalja firme' });
  }
});

// GET /api/superadmin/stats - Globalna statistika platforme
router.get('/stats', async (req, res) => {
  try {
    const [companyCount, userCount, elevatorCount, serviceCount, repairCount] = await Promise.all([
      Company.countDocuments(),
      User.countDocuments({ aktivan: true }),
      Elevator.countDocuments({ is_deleted: { $ne: true } }),
      Service.countDocuments({ is_deleted: { $ne: true } }),
      Repair.countDocuments({ is_deleted: { $ne: true } }),
    ]);

    // Zadnjih 5 registriranih firmi
    const recentCompanies = await Company.find()
      .sort({ created_at: -1 })
      .limit(5)
      .select('naziv created_at')
      .lean();

    res.json({
      success: true,
      data: {
        companyCount,
        userCount,
        elevatorCount,
        serviceCount,
        repairCount,
        recentCompanies,
      },
    });
  } catch (error) {
    console.error('SuperAdmin stats error:', error);
    res.status(500).json({ message: 'Greška pri dohvaćanju statistike' });
  }
});

// DELETE /api/superadmin/companies/:id - Obriši firmu i sve njene podatke
router.delete('/companies/:id', async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ message: 'Firma nije pronađena' });
    }

    // Obriši sve podatke firme
    await Promise.all([
      User.deleteMany({ companyId: company._id }),
      Elevator.deleteMany({ companyId: company._id }),
      Service.deleteMany({ companyId: company._id }),
      Repair.deleteMany({ companyId: company._id }),
      BackupSnapshot.deleteMany({ companyId: company._id }),
    ]);

    await Company.findByIdAndDelete(company._id);

    res.json({ success: true, message: `Firma "${company.naziv}" i svi podaci obrisani` });
  } catch (error) {
    console.error('SuperAdmin delete company error:', error);
    res.status(500).json({ message: 'Greška pri brisanju firme' });
  }
});

// POST /api/superadmin/backup/all/create - Kreiraj backup za sve firme (po firmi odvojeno)
router.post('/backup/all/create', async (req, res) => {
  try {
    const result = await createBackupsForAllCompanies({
      user: req.user,
      includeAuditLogs: Boolean(req.body?.includeAuditLogs),
      reason: req.body?.reason || 'SuperAdmin global backup',
    });

    const okCount = result.filter((item) => item.ok).length;
    const failCount = result.length - okCount;

    res.json({
      success: true,
      message: `Global backup završen: ${okCount} uspješno, ${failCount} neuspješno`,
      data: {
        totalCompanies: result.length,
        okCount,
        failCount,
        items: result,
      },
    });
  } catch (error) {
    console.error('SuperAdmin global backup error:', error);
    res.status(500).json({ message: error.message || 'Greška pri globalnom backupu' });
  }
});

// GET /api/superadmin/backup/company/:companyId - Lista backupa firme
router.get('/backup/company/:companyId', async (req, res) => {
  try {
    const company = await Company.findById(req.params.companyId).select('_id naziv').lean();
    if (!company) {
      return res.status(404).json({ message: 'Firma nije pronađena' });
    }

    const backups = await listCompanyBackups({
      companyId: company._id,
      limit: req.query.limit || 15,
    });

    return res.json({ success: true, data: backups });
  } catch (error) {
    console.error('SuperAdmin company backups error:', error);
    return res.status(500).json({ message: 'Greška pri dohvaćanju backupa firme' });
  }
});

// POST /api/superadmin/backup/company/:companyId/create - Ručni backup pojedine firme
router.post('/backup/company/:companyId/create', async (req, res) => {
  try {
    const company = await Company.findById(req.params.companyId).select('_id naziv').lean();
    if (!company) {
      return res.status(404).json({ message: 'Firma nije pronađena' });
    }

    const backup = await createCompanyBackup({
      companyId: company._id,
      user: req.user,
      source: 'superadmin-company',
      reason: req.body?.reason || 'SuperAdmin backup firme',
      customName: req.body?.backupName || req.body?.reason || '',
      includeAuditLogs: Boolean(req.body?.includeAuditLogs),
    });

    return res.json({
      success: true,
      message: `Backup firme "${company.naziv}" je uspješno kreiran`,
      data: backup,
    });
  } catch (error) {
    console.error('SuperAdmin create company backup error:', error);
    return res.status(500).json({ message: error.message || 'Greška pri kreiranju backupa firme' });
  }
});

// GET /api/superadmin/backup/company/:companyId/download/:backupId - Download backup datoteke firme
router.get('/backup/company/:companyId/download/:backupId', async (req, res) => {
  try {
    const company = await Company.findById(req.params.companyId).select('_id').lean();
    if (!company) {
      return res.status(404).json({ message: 'Firma nije pronađena' });
    }

    const file = await getCompanyBackupFile({
      companyId: company._id,
      backupId: req.params.backupId,
    });

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Content-Length', String(file.compressedData.length));
    return res.send(file.compressedData);
  } catch (error) {
    console.error('SuperAdmin company backup download error:', error);
    return res.status(500).json({ message: error.message || 'Greška pri download-u backupa firme' });
  }
});

// POST /api/superadmin/backup/company/:companyId/restore/:backupId - Restore firme iz backupa
router.post('/backup/company/:companyId/restore/:backupId', async (req, res) => {
  try {
    const company = await Company.findById(req.params.companyId).select('_id naziv').lean();
    if (!company) {
      return res.status(404).json({ message: 'Firma nije pronađena' });
    }

    const restored = await restoreCompanyBackup({
      companyId: company._id,
      backupId: req.params.backupId,
      user: req.user,
    });

    return res.json({
      success: true,
      message: `Backup firme "${company.naziv}" je uspješno vraćen`,
      data: restored,
    });
  } catch (error) {
    console.error('SuperAdmin restore company backup error:', error);
    return res.status(500).json({ message: error.message || 'Greška pri vraćanju backupa firme' });
  }
});

// POST /api/superadmin/backup/company/:companyId/restore-upload - Restore firme iz uploadane datoteke
router.post('/backup/company/:companyId/restore-upload', async (req, res) => {
  try {
    const company = await Company.findById(req.params.companyId).select('_id naziv').lean();
    if (!company) {
      return res.status(404).json({ message: 'Firma nije pronađena' });
    }

    const restored = await restoreCompanyBackupFromUpload({
      companyId: company._id,
      fileBase64: req.body?.fileBase64,
      fileName: req.body?.fileName,
      user: req.user,
    });

    return res.json({
      success: true,
      message: `Backup firme "${company.naziv}" iz datoteke je uspješno vraćen`,
      data: restored,
    });
  } catch (error) {
    console.error('SuperAdmin upload restore error:', error);
    return res.status(500).json({ message: error.message || 'Greška pri vraćanju backupa iz datoteke' });
  }
});

// GET /api/superadmin/users - Lista svih korisnika sa svim firmama
router.get('/users', async (req, res) => {
  try {
    const users = await User.find()
      .select('ime prezime email uloga aktivan telefon companyId kreiranDatum')
      .sort({ kreiranDatum: -1 })
      .lean();

    // Dohvati nazive firmi
    const companyIds = [...new Set(users.map(u => String(u.companyId)))];
    const companies = await Company.find({ _id: { $in: companyIds } }).select('naziv').lean();
    const companyMap = {};
    companies.forEach(c => { companyMap[String(c._id)] = c.naziv; });

    const enriched = users.map(u => ({
      ...u,
      companyNaziv: companyMap[String(u.companyId)] || 'Nepoznata firma',
    }));

    res.json({ success: true, data: enriched });
  } catch (error) {
    console.error('SuperAdmin users error:', error);
    res.status(500).json({ message: 'Greška pri dohvaćanju korisnika' });
  }
});

// GET /api/superadmin/users/:id - Detalji jednog korisnika
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('ime prezime email uloga aktivan telefon companyId kreiranDatum azuriranDatum')
      .lean();
    if (!user) {
      return res.status(404).json({ message: 'Korisnik nije pronađen' });
    }

    const company = await Company.findById(user.companyId).select('naziv adresa oib email').lean();

    // Statistike korisnika
    const [serviceCount, repairCount] = await Promise.all([
      Service.countDocuments({ companyId: user.companyId, servpicer: user._id, is_deleted: { $ne: true } }).catch(() => 0),
      Repair.countDocuments({ companyId: user.companyId, is_deleted: { $ne: true } }).catch(() => 0),
    ]);

    res.json({
      success: true,
      data: {
        ...user,
        company: company || { naziv: 'Nepoznata firma' },
        stats: { serviceCount, repairCount },
      },
    });
  } catch (error) {
    console.error('SuperAdmin user detail error:', error);
    res.status(500).json({ message: 'Greška pri dohvaćanju korisnika' });
  }
});

// PUT /api/superadmin/users/:id/reset-password - Promijeni lozinku korisnika
router.put('/users/:id/reset-password', async (req, res) => {
  try {
    const { novaLozinka } = req.body;
    if (!novaLozinka || novaLozinka.length < 6) {
      return res.status(400).json({ message: 'Lozinka mora imati najmanje 6 znakova' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'Korisnik nije pronađen' });
    }

    user.lozinka = novaLozinka;
    user.privremenaLozinka = true;
    await user.save();

    res.json({ success: true, message: `Lozinka za ${user.ime} ${user.prezime} je promijenjena` });
  } catch (error) {
    console.error('SuperAdmin reset password error:', error);
    res.status(500).json({ message: 'Greška pri promjeni lozinke' });
  }
});

module.exports = router;

const AuditLog = require('../models/AuditLog');
const User = require('../models/User');

// Logiranje akcija (podržava object ili positional potpis)
const logAction = async (...args) => {
  try {
    let payload = {};

    if (args.length === 1 && typeof args[0] === 'object' && !Array.isArray(args[0])) {
      payload = args[0];
    } else {
      const [korisnikId, akcija, entitet, entitetId, noveVrijednosti] = args;
      payload = { korisnikId, akcija, entitet, entitetId, noveVrijednosti };
    }

    const {
      companyId,
      korisnikId,
      akcija,
      entitet,
      entitetId,
      entitetNaziv,
      stareVrijednosti,
      noveVrijednosti,
      ipAdresa,
      opis,
    } = payload;

    let resolvedCompanyId = companyId;
    if (!resolvedCompanyId && korisnikId) {
      const user = await User.findById(korisnikId).select('companyId').lean();
      resolvedCompanyId = user?.companyId;
    }

    if (!resolvedCompanyId) {
      throw new Error('companyId je obavezan za audit log');
    }

    const auditLog = new AuditLog({
      companyId: resolvedCompanyId,
      korisnikId,
      akcija,
      entitet,
      entitetId,
      entitetNaziv,
      stareVrijednosti,
      noveVrijednosti,
      ipAdresa,
      opis,
    });

    await auditLog.save();
    console.log(`Audit log: ${akcija} ${entitet} od korisnika ${korisnikId}`);
  } catch (error) {
    console.error('Greška pri logiranju:', error);
    // Ne prekidaj glavnu akciju ako audit logs failne
  }
};

module.exports = { logAction };

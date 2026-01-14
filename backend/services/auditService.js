const AuditLog = require('../models/AuditLog');

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

    const auditLog = new AuditLog({
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

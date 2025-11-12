const AuditLog = require('../models/AuditLog');

// Logiranje akcija
const logAction = async (data) => {
  try {
    const {
      korisnikId,
      akcija,
      entitet,
      entitetId,
      entitetNaziv,
      stareVrijednosti,
      noveVrijednosti,
      ipAdresa,
      opis
    } = data;

    const auditLog = new AuditLog({
      korisnikId,
      akcija,
      entitet,
      entitetId,
      entitetNaziv,
      stareVrijednosti,
      noveVrijednosti,
      ipAdresa,
      opis
    });

    await auditLog.save();
    console.log(`📝 Audit log: ${akcija} ${entitet} od korisnika ${korisnikId}`);
  } catch (error) {
    console.error('❌ Greška pri logiiranju:', error);
    // Ne prekidaj glavnu akciju ako audit logs failne
  }
};

module.exports = { logAction };

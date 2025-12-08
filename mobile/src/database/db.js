import * as SQLite from 'expo-sqlite';

// Otvori ili kreiraj bazu
const db = SQLite.openDatabaseSync('appel.db');

// Database version
const DB_VERSION = 9; // Soft delete + audit fields + sync_status

// Provjeri verziju baze i migriraj ako je potrebno
const checkAndMigrate = () => {
  try {
    // Kreiraj version tablicu ako ne postoji
    db.execSync(`
      CREATE TABLE IF NOT EXISTS db_version (
        version INTEGER PRIMARY KEY
      );
    `);

    const versionRow = db.getFirstSync('SELECT version FROM db_version');
    const currentVersion = versionRow?.version || 0;

    console.log(`📊 Trenutna verzija baze: ${currentVersion}, Očekivana: ${DB_VERSION}`);

    if (currentVersion < DB_VERSION) {
      console.log(`🔄 Migriram bazu sa verzije ${currentVersion} na ${DB_VERSION}`);
      
      // Za bilo koju staru verziju - obriši sve i kreiraj novo
      console.log('🔄 Brisem sve stare tablice...');
      try {
        // Prvo obriši sve tablice osim db_version
        const tables = [
          'elevators', 'services', 'repairs', 'chatrooms', 'messages', 
          'simcards', 'users', 'sync_queue', 'repairs_old', 'services_old'
        ];
        
        tables.forEach(table => {
          try {
            db.execSync(`DROP TABLE IF EXISTS ${table};`);
            console.log(`  ✅ Obrisana tablica: ${table}`);
          } catch (e) {
            console.log(`  ⚠️  Tablica ${table} nije postojala`);
          }
        });
        
        console.log('✅ Sve stare tablice obrisane - počinjemo od čista!');
      } catch (e) {
        console.error('❌ Greška pri brisanju tablica:', e);
      }

      // Ažuriraj verziju
      try {
        db.execSync(`DELETE FROM db_version;`);
        db.execSync(`INSERT INTO db_version (version) VALUES (${DB_VERSION});`);
        console.log(`✅ db_version ažurirana na ${DB_VERSION}`);
      } catch (e) {
        console.error('❌ Greška pri ažuriranju verzije:', e);
      }
    } else {
      console.log(`✅ Baza je već na verziji ${DB_VERSION}`);
    }
  } catch (error) {
    console.error('❌ Greška pri migraciji baze:', error);
  }
};

// Inicijaliziraj bazu - kreiraj tablice
export const initDatabase = () => {
  try {
    // Prvo provjeri i migriraj ako je potrebno
    checkAndMigrate();

    db.execSync(`
      PRAGMA journal_mode = WAL;
      
      -- Korisnici (lokalni cache)
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        ime TEXT,
        prezime TEXT,
        email TEXT UNIQUE,
        uloga TEXT,
        telefon TEXT,
        privremenaLozinka TEXT,
        aktivan INTEGER DEFAULT 1,
        synced INTEGER DEFAULT 1,
        updated_at INTEGER
      );

      -- Dizala
      CREATE TABLE IF NOT EXISTS elevators (
        id TEXT PRIMARY KEY,
        brojUgovora TEXT,
        nazivStranke TEXT,
        ulica TEXT,
        mjesto TEXT,
        brojDizala TEXT,
        kontaktOsoba TEXT,
        koordinate_lat REAL,
        koordinate_lng REAL,
        status TEXT DEFAULT 'aktivan',
        intervalServisa INTEGER DEFAULT 1,
        zadnjiServis TEXT,
        sljedeciServis TEXT,
        napomene TEXT,
        synced INTEGER DEFAULT 1,
        updated_at INTEGER
      );

      -- Servisi
      CREATE TABLE IF NOT EXISTS services (
        id TEXT PRIMARY KEY,
        elevatorId TEXT,
        serviserID TEXT,
        datum TEXT,
        checklist TEXT,
        imaNedostataka INTEGER DEFAULT 0,
        nedostaci TEXT,
        napomene TEXT,
        sljedeciServis TEXT,
        kreiranDatum TEXT,
        azuriranDatum TEXT,
        is_deleted INTEGER DEFAULT 0,
        deleted_at TEXT,
        updated_by TEXT,
        updated_at INTEGER,
        sync_status TEXT DEFAULT 'synced',
        synced INTEGER DEFAULT 0,
        FOREIGN KEY (elevatorId) REFERENCES elevators(id)
      );

      -- Popravci
      CREATE TABLE IF NOT EXISTS repairs (
        id TEXT PRIMARY KEY,
        elevatorId TEXT,
        serviserID TEXT,
        datumPrijave TEXT,
        datumPopravka TEXT,
        opisKvara TEXT,
        opisPopravka TEXT,
        status TEXT DEFAULT 'pending',
        radniNalogPotpisan INTEGER DEFAULT 0,
        popravkaUPotpunosti INTEGER DEFAULT 0,
        napomene TEXT,
        prijavio TEXT,
        kontaktTelefon TEXT,
        primioPoziv TEXT,
        kreiranDatum TEXT,
        azuriranDatum TEXT,
        is_deleted INTEGER DEFAULT 0,
        deleted_at TEXT,
        updated_by TEXT,
        updated_at INTEGER,
        sync_status TEXT DEFAULT 'synced',
        synced INTEGER DEFAULT 0,
        FOREIGN KEY (elevatorId) REFERENCES elevators(id)
      );

      -- Chat sobe (cache)
      CREATE TABLE IF NOT EXISTS chatrooms (
        id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        createdBy TEXT,
        members TEXT,
        synced INTEGER DEFAULT 1,
        updated_at INTEGER
      );

      -- Poruke (cache)
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chatroomId TEXT,
        sender TEXT,
        senderName TEXT,
        tekst TEXT,
        slika TEXT,
        isRead TEXT,
        kreiranDatum TEXT,
        synced INTEGER DEFAULT 0,
        updated_at INTEGER,
        FOREIGN KEY (chatroomId) REFERENCES chatrooms(id)
      );

      -- SIM kartice
      CREATE TABLE IF NOT EXISTS simcards (
        id TEXT PRIMARY KEY,
        phoneNumber TEXT UNIQUE,
        provider TEXT,
        expiryDate TEXT,
        status TEXT DEFAULT 'active',
        assignedTo TEXT,
        notes TEXT,
        synced INTEGER DEFAULT 1,
        updated_at INTEGER
      );

      -- Offline queue - zahtjevi koji čekaju sync
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        method TEXT,
        endpoint TEXT,
        data TEXT,
        created_at INTEGER
      );

      -- Indexi za brže pretrage
      CREATE INDEX IF NOT EXISTS idx_elevators_status ON elevators(status);
      CREATE INDEX IF NOT EXISTS idx_services_elevator ON services(elevatorId);
      CREATE INDEX IF NOT EXISTS idx_services_synced ON services(synced);
      CREATE INDEX IF NOT EXISTS idx_services_sync_status ON services(sync_status);
      CREATE INDEX IF NOT EXISTS idx_services_datum ON services(datum);
      CREATE INDEX IF NOT EXISTS idx_repairs_elevator ON repairs(elevatorId);
      CREATE INDEX IF NOT EXISTS idx_repairs_status ON repairs(status);
      CREATE INDEX IF NOT EXISTS idx_repairs_synced ON repairs(synced);
      CREATE INDEX IF NOT EXISTS idx_repairs_sync_status ON repairs(sync_status);
      CREATE INDEX IF NOT EXISTS idx_repairs_datumPrijave ON repairs(datumPrijave);
      CREATE INDEX IF NOT EXISTS idx_messages_chatroom ON messages(chatroomId);
      CREATE INDEX IF NOT EXISTS idx_messages_synced ON messages(synced);
    `);


    // Dodaj nove kolone na repairs ako nedostaju
    try { db.execSync('ALTER TABLE repairs ADD COLUMN primioPoziv TEXT;'); } catch (e) {}
    console.log('✅ SQLite baza inicijalizirana');
    return true;
  } catch (error) {
    console.error('❌ Greška pri inicijalizaciji baze:', error);
    return false;
  }
};

// CRUD operacije za Elevators
export const elevatorDB = {
  getAll: () => {
    const elevators = db.getAllSync('SELECT * FROM elevators ORDER BY nazivStranke');
    return elevators.map(e => ({
      ...e,
      kontaktOsoba: typeof e.kontaktOsoba === 'string' ? JSON.parse(e.kontaktOsoba || '{}') : (e.kontaktOsoba || {}),
      koordinate: {
        latitude: e.koordinate_lat || 0,
        longitude: e.koordinate_lng || 0,
      }
    }));
  },
  
  getById: (id) => {
    const elevator = db.getFirstSync('SELECT * FROM elevators WHERE id = ?', [id]);
    if (elevator) {
      elevator.kontaktOsoba = typeof elevator.kontaktOsoba === 'string' ? JSON.parse(elevator.kontaktOsoba || '{}') : (elevator.kontaktOsoba || {});
      elevator.koordinate = {
        latitude: elevator.koordinate_lat || 0,
        longitude: elevator.koordinate_lng || 0,
      };
    }
    return elevator;
  },
  
  insert: (elevator) => {
    const result = db.runSync(
      `INSERT INTO elevators (id, brojUgovora, nazivStranke, ulica, mjesto, brojDizala, 
       kontaktOsoba, koordinate_lat, koordinate_lng, status, 
       intervalServisa, zadnjiServis, sljedeciServis, napomene, synced, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        elevator.id || elevator._id,
        elevator.brojUgovora,
        elevator.nazivStranke,
        elevator.ulica,
        elevator.mjesto,
        elevator.brojDizala,
        JSON.stringify(elevator.kontaktOsoba || {}),
        elevator.koordinate?.latitude,
        elevator.koordinate?.longitude,
        elevator.status || 'aktivan',
        elevator.intervalServisa || 1,
        elevator.zadnjiServis,
        elevator.sljedeciServis,
        elevator.napomene,
        1,
        Date.now()
      ]
    );
    return result;
  },
  
  update: (id, elevator) => {
    return db.runSync(
      `UPDATE elevators SET brojUgovora=?, nazivStranke=?, ulica=?, mjesto=?, brojDizala=?, 
       kontaktOsoba=?, koordinate_lat=?, koordinate_lng=?, 
       status=?, intervalServisa=?, zadnjiServis=?, sljedeciServis=?, napomene=?, 
       synced=?, updated_at=? WHERE id=?`,
      [
        elevator.brojUgovora,
        elevator.nazivStranke,
        elevator.ulica,
        elevator.mjesto,
        elevator.brojDizala,
        JSON.stringify(elevator.kontaktOsoba || {}),
        elevator.koordinate?.latitude,
        elevator.koordinate?.longitude,
        elevator.status,
        elevator.intervalServisa || 1,
        elevator.zadnjiServis,
        elevator.sljedeciServis,
        elevator.napomene,
        0,
        Date.now(),
        id
      ]
    );
  },
  
  delete: (id) => {
    return db.runSync('DELETE FROM elevators WHERE id = ?', [id]);
  },
  
  bulkInsert: (elevators) => {
    elevators.forEach(elevator => {
      try {
        elevatorDB.insert(elevator);
      } catch (error) {
        // Skip ako već postoji
        console.log(`Elevator ${elevator._id} već postoji`);
      }
    });
  },
};

// CRUD operacije za Services
export const serviceDB = {
  getAll: (elevatorId = null) => {
    let services;
    if (elevatorId) {
      services = db.getAllSync('SELECT * FROM services WHERE elevatorId = ? AND is_deleted = 0 ORDER BY datum DESC', [elevatorId]);
    } else {
      services = db.getAllSync('SELECT * FROM services WHERE is_deleted = 0 ORDER BY datum DESC');
    }
    return services.map(s => ({
      ...s,
      checklist: typeof s.checklist === 'string' ? JSON.parse(s.checklist || '[]') : (s.checklist || []),
      nedostaci: typeof s.nedostaci === 'string' ? JSON.parse(s.nedostaci || '[]') : (s.nedostaci || [])
    }));
  },
  
  getById: (id) => {
    const service = db.getFirstSync('SELECT * FROM services WHERE id = ?', [id]);
    if (service) {
      service.checklist = typeof service.checklist === 'string' ? JSON.parse(service.checklist || '[]') : (service.checklist || []);
      service.nedostaci = typeof service.nedostaci === 'string' ? JSON.parse(service.nedostaci || '[]') : (service.nedostaci || []);
    }
    return service;
  },
  
  insert: (service) => {
    const id = service.id || service._id || `local_${Date.now()}`;
    const syncStatus = service.sync_status
      || (String(id).startsWith('local_') ? 'dirty' : 'synced');
    const syncedFlag = syncStatus === 'synced' ? 1 : 0;
    // Normaliziraj serviserID u čitljivo ime (ako je objekt)
    let serviserID = service.serviserID;
    if (serviserID && typeof serviserID === 'object') {
      const ime = serviserID.ime || serviserID.firstName || '';
      const prezime = serviserID.prezime || serviserID.lastName || '';
      const full = `${ime} ${prezime}`.trim();
      serviserID = full || (serviserID._id || '');
    }
    // Normaliziraj elevatorId (ako je objekt uzmi _id)
    let elevatorId = service.elevatorId || service.elevator;
    if (elevatorId && typeof elevatorId === 'object') {
      elevatorId = elevatorId._id || elevatorId.id || '';
    }
    return db.runSync(
      `INSERT INTO services (id, elevatorId, serviserID, datum, checklist, 
       imaNedostataka, nedostaci, napomene, sljedeciServis, kreiranDatum, azuriranDatum, 
       is_deleted, deleted_at, updated_by, updated_at, sync_status, synced) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        elevatorId,
        serviserID,
        service.datum,
        JSON.stringify(service.checklist || []),
        service.imaNedostataka ? 1 : 0,
        JSON.stringify(service.nedostaci || []),
        service.napomene,
        service.sljedeciServis,
        service.kreiranDatum || new Date().toISOString(),
        service.azuriranDatum || new Date().toISOString(),
        service.is_deleted ? 1 : 0,
        service.deleted_at || null,
        service.updated_by || null,
        service.updated_at || Date.now(),
        syncStatus,
        syncedFlag
      ]
    );
  },
  
    update: (id, service) => {
    let serviserID = service.serviserID;
    if (serviserID && typeof serviserID === 'object') {
      const ime = serviserID.ime || serviserID.firstName || '';
      const prezime = serviserID.prezime || serviserID.lastName || '';
      const full = `${ime} ${prezime}`.trim();
      serviserID = full || (serviserID._id || '');
    }
      const syncStatus = service.sync_status
        || (service.synced === undefined ? 'dirty' : (service.synced ? 'synced' : 'dirty'));
      const syncedFlag = syncStatus === 'synced' ? 1 : 0;
    return db.runSync(
      `UPDATE services SET serviserID=?, datum=?, checklist=?, imaNedostataka=?, 
       nedostaci=?, napomene=?, sljedeciServis=?, azuriranDatum=?, is_deleted=?, deleted_at=?, updated_by=?, updated_at=?, sync_status=?, synced=? WHERE id=?`,
      [
        serviserID,
        service.datum,
        JSON.stringify(service.checklist || []),
        service.imaNedostataka ? 1 : 0,
        JSON.stringify(service.nedostaci || []),
        service.napomene,
        service.sljedeciServis,
        service.azuriranDatum || new Date().toISOString(),
        service.is_deleted ? 1 : 0,
        service.deleted_at || null,
        service.updated_by || null,
        service.updated_at || Date.now(),
        syncStatus,
        syncedFlag,
        id
      ]
    );
  },
  
  delete: (id) => {
    const now = Date.now();
    return db.runSync('UPDATE services SET is_deleted = 1, deleted_at = ?, updated_at = ?, sync_status = "dirty", synced = 0 WHERE id = ?', [
      new Date(now).toISOString(),
      now,
      id,
    ]);
  },
  
  getUnsynced: () => {
    try {
      const services = db.getAllSync('SELECT * FROM services WHERE sync_status = "dirty" OR synced = 0');
      return services.map(s => ({
        ...s,
        checklist: typeof s.checklist === 'string' ? JSON.parse(s.checklist || '[]') : (s.checklist || []),
        nedostaci: typeof s.nedostaci === 'string' ? JSON.parse(s.nedostaci || '[]') : (s.nedostaci || [])
      }));
    } catch (e) {
      console.log('⚠️ services getUnsynced failed:', e?.message);
      return [];
    }
  },
  
  bulkInsert: (services) => {
    services.forEach(service => {
      try {
        serviceDB.insert(service);
      } catch (error) {
        const sid = service.id || service._id || 'unknown';
        console.log(`Service ${sid} već postoji (skip insert)`);
      }
    });
  },
  
  markSynced: (id, serverId) => {
    return db.runSync('UPDATE services SET synced = 1, sync_status = "synced", id = ?, updated_at = ? WHERE id = ?', [serverId, Date.now(), id]);
  },
};

// CRUD operacije za Repairs
export const repairDB = {
  getAll: (elevatorId = null) => {
    let repairs;
    if (elevatorId) {
      repairs = db.getAllSync('SELECT * FROM repairs WHERE elevatorId = ? AND is_deleted = 0 ORDER BY datumPrijave DESC', [elevatorId]);
    } else {
      repairs = db.getAllSync('SELECT * FROM repairs WHERE is_deleted = 0 ORDER BY datumPrijave DESC');
    }
    return repairs.map(r => ({
      ...r,
      // Repair model doesn't have nested JSON fields, but keep consistent
    }));
  },
  
  getById: (id) => {
    return db.getFirstSync('SELECT * FROM repairs WHERE id = ?', [id]);
  },
  
  insert: (repair) => {
    const id = repair.id || repair._id || `local_${Date.now()}`;
    const syncStatus = repair.sync_status || (String(id).startsWith('local_') ? 'dirty' : 'synced');
    const syncedFlag = syncStatus === 'synced' ? 1 : 0;
    // Normaliziraj reference kako bi spremili čisti ID umjesto objekta
    let elevatorId = repair.elevatorId || repair.elevator;
    if (elevatorId && typeof elevatorId === 'object') {
      elevatorId = elevatorId._id || elevatorId.id || '';
    }

    let serviserID = repair.serviserID;
    if (serviserID && typeof serviserID === 'object') {
      serviserID = serviserID._id || serviserID.id || '';
    }

    return db.runSync(
      `INSERT INTO repairs (id, elevatorId, serviserID, datumPrijave, datumPopravka, 
       opisKvara, opisPopravka, status, radniNalogPotpisan, popravkaUPotpunosti, 
       napomene, prijavio, kontaktTelefon, primioPoziv, kreiranDatum, azuriranDatum, 
       is_deleted, deleted_at, updated_by, updated_at, sync_status, synced) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        elevatorId,
        serviserID,
        repair.datumPrijave,
        repair.datumPopravka,
        repair.opisKvara,
        repair.opisPopravka,
        repair.status || 'pending',
        repair.radniNalogPotpisan ? 1 : 0,
        repair.popravkaUPotpunosti ? 1 : 0,
        repair.napomene,
        repair.prijavio,
        repair.kontaktTelefon,
        repair.primioPoziv,
        repair.kreiranDatum || new Date().toISOString(),
        repair.azuriranDatum || new Date().toISOString(),
        repair.is_deleted ? 1 : 0,
        repair.deleted_at || null,
        repair.updated_by || null,
        repair.updated_at || Date.now(),
        syncStatus,
        syncedFlag
      ]
    );
  },
  
  update: (id, repair) => {
    // Svaka lokalna izmjena mora označiti zapis kao nesinkroniziran (osim ako je eksplicitno zadano)
    const syncStatus = repair.sync_status
      || (repair.synced === undefined ? 'dirty' : (repair.synced ? 'synced' : 'dirty'));
    const syncedFlag = syncStatus === 'synced' ? 1 : 0;
    let serviserID = repair.serviserID;
    if (serviserID && typeof serviserID === 'object') {
      serviserID = serviserID._id || serviserID.id || '';
    }

    let elevatorId = repair.elevatorId || repair.elevator;
    if (elevatorId && typeof elevatorId === 'object') {
      elevatorId = elevatorId._id || elevatorId.id || '';
    }

    return db.runSync(
      `UPDATE repairs SET elevatorId=?, serviserID=?, datumPrijave=?, datumPopravka=?, opisKvara=?, 
       opisPopravka=?, status=?, radniNalogPotpisan=?, popravkaUPotpunosti=?, 
       napomene=?, prijavio=?, kontaktTelefon=?, primioPoziv=?, azuriranDatum=?, is_deleted=?, deleted_at=?, updated_by=?, updated_at=?, sync_status=?, synced=? WHERE id=?`,
      [
        elevatorId,
        serviserID,
        repair.datumPrijave,
        repair.datumPopravka,
        repair.opisKvara,
        repair.opisPopravka,
        repair.status,
        repair.radniNalogPotpisan ? 1 : 0,
        repair.popravkaUPotpunosti ? 1 : 0,
        repair.napomene,
        repair.prijavio,
        repair.kontaktTelefon,
        repair.primioPoziv,
        repair.azuriranDatum || new Date().toISOString(),
        repair.is_deleted ? 1 : 0,
        repair.deleted_at || null,
        repair.updated_by || null,
        repair.updated_at || Date.now(),
        syncStatus,
        syncedFlag,
        id
      ]
    );
  },
  
  delete: (id) => {
    const now = Date.now();
    return db.runSync('UPDATE repairs SET is_deleted = 1, deleted_at = ?, updated_at = ?, sync_status = "dirty", synced = 0 WHERE id = ?', [
      new Date(now).toISOString(),
      now,
      id,
    ]);
  },
  
  getUnsynced: () => {
    try {
      return db.getAllSync('SELECT * FROM repairs WHERE sync_status = "dirty" OR synced = 0');
    } catch (e) {
      console.log('⚠️ repairs getUnsynced failed:', e?.message);
      return [];
    }
  },
  
  bulkInsert: (repairs) => {
    repairs.forEach(repair => {
      try {
        repairDB.insert(repair);
      } catch (error) {
        const rid = repair.id || repair._id || 'unknown';
        console.log(`Repair ${rid} već postoji (skip insert)`);
      }
    });
  },
  markSynced: (id, serverId) => {
    return db.runSync('UPDATE repairs SET synced = 1, sync_status = "synced", id = ?, updated_at = ? WHERE id = ?', [serverId, Date.now(), id]);
  },
};

// Users DB
export const userDB = {
  getAll: () => {
    return db.getAllSync('SELECT * FROM users ORDER BY prezime, ime');
  },
  
  getById: (id) => {
    return db.getFirstSync('SELECT * FROM users WHERE id = ?', [id]);
  },
  
  getByEmail: (email) => {
    return db.getFirstSync('SELECT * FROM users WHERE email = ?', [email]);
  },
  
  insert: (user) => {
    return db.runSync(
      `INSERT INTO users (id, ime, prezime, email, uloga, telefon, privremenaLozinka, aktivan, synced, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id || user._id,
        user.ime,
        user.prezime,
        user.email,
        user.uloga || 'serviser',
        user.telefon,
        user.privremenaLozinka || null,
        user.aktivan !== false ? 1 : 0,
        1, // synced
        Date.now()
      ]
    );
  },
  
  update: (id, user) => {
    return db.runSync(
      `UPDATE users SET ime=?, prezime=?, uloga=?, telefon=?, privremenaLozinka=?, aktivan=?, synced=?, updated_at=? WHERE id=?`,
      [
        user.ime,
        user.prezime,
        user.uloga,
        user.telefon,
        user.privremenaLozinka || null,
        user.aktivan !== false ? 1 : 0,
        0, // mark as unsynced for next sync
        Date.now(),
        id
      ]
    );
  },
  
  delete: (id) => {
    return db.runSync('DELETE FROM users WHERE id = ?', [id]);
  },
  
  bulkInsert: (users) => {
    users.forEach(user => {
      try {
        userDB.insert(user);
      } catch (error) {
        console.log(`Korisnik ${user.email} već postoji`);
      }
    });
  },
};

// Messages DB
export const messageDB = {
  getByRoom: (roomId) => {
    return db.getAllSync('SELECT * FROM messages WHERE chatroomId = ? ORDER BY kreiranDatum', [roomId]);
  },
  
  insert: (message) => {
    const id = message.id || message._id || `local_${Date.now()}`;
    return db.runSync(
      `INSERT INTO messages (id, chatroomId, sender, senderName, tekst, slika, 
       isRead, kreiranDatum, synced, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        message.chatRoom || message.chatroomId,
        message.senderId?._id || message.senderId || message.sender,
        message.sender?.name || message.senderName,
        message.tekst || message.content,
        message.slika || message.imageUrl,
        JSON.stringify(message.isRead || message.readBy || []),
        message.kreiranDatum || message.createdAt || new Date().toISOString(),
        0,
        Date.now()
      ]
    );
  },
  
  bulkInsert: (messages) => {
    messages.forEach(msg => {
      try {
        messageDB.insert(msg);
      } catch (error) {
        console.log(`Message ${msg._id} već postoji`);
      }
    });
  },
};

// Sync Queue
export const syncQueue = {
  add: (method, endpoint, data) => {
    return db.runSync(
      'INSERT INTO sync_queue (method, endpoint, data, created_at) VALUES (?, ?, ?, ?)',
      [method, endpoint, JSON.stringify(data), Date.now()]
    );
  },
  
  getAll: () => {
    return db.getAllSync('SELECT * FROM sync_queue ORDER BY created_at');
  },
  
  remove: (id) => {
    return db.runSync('DELETE FROM sync_queue WHERE id = ?', [id]);
  },
  
  clear: () => {
    return db.runSync('DELETE FROM sync_queue');
  },
};

// RESET cijele baze (obriši sve i rekreiraj)
export const resetDatabase = () => {
  try {
    console.log('🔄 Resetiram bazu...');
    db.execSync(`
      DROP TABLE IF EXISTS elevators;
      DROP TABLE IF EXISTS services;
      DROP TABLE IF EXISTS repairs;
      DROP TABLE IF EXISTS simcards;
      DROP TABLE IF EXISTS chatrooms;
      DROP TABLE IF EXISTS messages;
      DROP TABLE IF EXISTS users;
      DROP TABLE IF EXISTS sync_queue;
      DROP TABLE IF EXISTS db_version;
    `);
    console.log('✅ Sve tablice obrisane');
    
    // Reinicijaliziraj
    initDatabase();
    console.log('✅ Baza resetirana i rekreirana');
  } catch (error) {
    console.error('❌ Greška pri resetiranju baze:', error);
  }
};

// Očisti "siročad" servise i popravke bez postojećeg dizala
export const cleanupOrphans = () => {
  try {
    console.log('🧹 Pokrećem čišćenje siročadi servisa i popravaka...');
    const existingElevators = new Set(
      db.getAllSync('SELECT id FROM elevators').map(row => row.id)
    );

    // Ako nema učitanih dizala, ne briši ništa (čekaj sync)
    if (existingElevators.size === 0) {
      console.log('⏸️ Nema dizala u bazi - preskačem čišćenje siročadi');
      return { removedServices: 0, removedRepairs: 0, skipped: true };
    }

    const orphanServices = db.getAllSync('SELECT id, elevatorId FROM services WHERE elevatorId NOT IN (SELECT id FROM elevators)');
    const orphanRepairs = db.getAllSync('SELECT id, elevatorId FROM repairs WHERE elevatorId NOT IN (SELECT id FROM elevators)');
    let removedServices = 0;
    let removedRepairs = 0;
    orphanServices.forEach(s => {
      if (!existingElevators.has(s.elevatorId)) {
        db.runSync('DELETE FROM services WHERE id = ?', [s.id]);
        removedServices++;
      }
    });
    orphanRepairs.forEach(r => {
      if (!existingElevators.has(r.elevatorId)) {
        db.runSync('DELETE FROM repairs WHERE id = ?', [r.id]);
        removedRepairs++;
      }
    });
    console.log(`✅ Čišćenje završeno. Uklonjeno servisa: ${removedServices}, popravaka: ${removedRepairs}`);
    return { removedServices, removedRepairs };
  } catch (e) {
    console.error('❌ Greška pri čišćenju siročadi:', e);
    return { removedServices: 0, removedRepairs: 0, error: e.message };
  }
};

export default db;




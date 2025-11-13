import * as SQLite from 'expo-sqlite';

// Otvori ili kreiraj bazu
const db = SQLite.openDatabaseSync('appel.db');

// Database version
const DB_VERSION = 3; // Povećano zbog promjene sheme dizala (split adresa, kontaktOsoba)

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

    if (currentVersion < DB_VERSION) {
      console.log(`🔄 Migriram bazu sa verzije ${currentVersion} na ${DB_VERSION}`);
      
      // Migracija sa v1/v2 na v3 - nova shema elevators tablice
      if (currentVersion < 3) {
        console.log('🔄 Migriram elevators tablicu na novu shemu...');
        db.execSync(`
          DROP TABLE IF EXISTS elevators;
        `);
        console.log('✅ Stara elevators tablica obrisana');
      }

      // Ažuriraj verziju
      db.execSync(`
        DELETE FROM db_version;
        INSERT INTO db_version (version) VALUES (${DB_VERSION});
      `);
      console.log(`✅ Baza migrirana na verziju ${DB_VERSION}`);
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
        synced INTEGER DEFAULT 0,
        updated_at INTEGER,
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
        status TEXT DEFAULT 'čekanje',
        radniNalogPotpisan INTEGER DEFAULT 0,
        popravkaUPotpunosti INTEGER DEFAULT 0,
        napomene TEXT,
        kreiranDatum TEXT,
        azuriranDatum TEXT,
        synced INTEGER DEFAULT 0,
        updated_at INTEGER,
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
        content TEXT,
        imageUrl TEXT,
        readBy TEXT,
        createdAt TEXT,
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
      CREATE INDEX IF NOT EXISTS idx_repairs_elevator ON repairs(elevatorId);
      CREATE INDEX IF NOT EXISTS idx_repairs_status ON repairs(status);
      CREATE INDEX IF NOT EXISTS idx_repairs_synced ON repairs(synced);
      CREATE INDEX IF NOT EXISTS idx_messages_chatroom ON messages(chatroomId);
      CREATE INDEX IF NOT EXISTS idx_messages_synced ON messages(synced);
    `);

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
    return db.getAllSync('SELECT * FROM elevators ORDER BY nazivStranke');
  },
  
  getById: (id) => {
    return db.getFirstSync('SELECT * FROM elevators WHERE id = ?', [id]);
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
    if (elevatorId) {
      return db.getAllSync('SELECT * FROM services WHERE elevatorId = ? ORDER BY datum DESC', [elevatorId]);
    }
    return db.getAllSync('SELECT * FROM services ORDER BY datum DESC');
  },
  
  getById: (id) => {
    return db.getFirstSync('SELECT * FROM services WHERE id = ?', [id]);
  },
  
  insert: (service) => {
    const id = service.id || service._id || `local_${Date.now()}`;
    return db.runSync(
      `INSERT INTO services (id, elevatorId, serviserID, datum, checklist, 
       imaNedostataka, nedostaci, napomene, sljedeciServis, kreiranDatum, azuriranDatum, synced, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        service.elevatorId || service.elevator,
        service.serviserID,
        service.datum,
        JSON.stringify(service.checklist || []),
        service.imaNedostataka ? 1 : 0,
        JSON.stringify(service.nedostaci || []),
        service.napomene,
        service.sljedeciServis,
        service.kreiranDatum || new Date().toISOString(),
        service.azuriranDatum || new Date().toISOString(),
        1,
        Date.now()
      ]
    );
  },
  
  update: (id, service) => {
    return db.runSync(
      `UPDATE services SET serviserID=?, datum=?, checklist=?, imaNedostataka=?, 
       nedostaci=?, napomene=?, sljedeciServis=?, azuriranDatum=?, synced=?, updated_at=? WHERE id=?`,
      [
        service.serviserID,
        service.datum,
        JSON.stringify(service.checklist || []),
        service.imaNedostataka ? 1 : 0,
        JSON.stringify(service.nedostaci || []),
        service.napomene,
        service.sljedeciServis,
        service.azuriranDatum || new Date().toISOString(),
        0,
        Date.now(),
        id
      ]
    );
  },
  
  delete: (id) => {
    return db.runSync('DELETE FROM services WHERE id = ?', [id]);
  },
  
  getUnsynced: () => {
    return db.getAllSync('SELECT * FROM services WHERE synced = 0');
  },
  
  bulkInsert: (services) => {
    services.forEach(service => {
      try {
        serviceDB.insert(service);
      } catch (error) {
        console.log(`Service ${service._id} već postoji`);
      }
    });
  },
  
  markSynced: (id, serverId) => {
    return db.runSync('UPDATE services SET synced = 1, id = ? WHERE id = ?', [serverId, id]);
  },
};

// CRUD operacije za Repairs
export const repairDB = {
  getAll: (elevatorId = null) => {
    if (elevatorId) {
      return db.getAllSync('SELECT * FROM repairs WHERE elevatorId = ? ORDER BY datumPrijave DESC', [elevatorId]);
    }
    return db.getAllSync('SELECT * FROM repairs ORDER BY datumPrijave DESC');
  },
  
  getById: (id) => {
    return db.getFirstSync('SELECT * FROM repairs WHERE id = ?', [id]);
  },
  
  insert: (repair) => {
    const id = repair.id || repair._id || `local_${Date.now()}`;
    return db.runSync(
      `INSERT INTO repairs (id, elevatorId, serviserID, datumPrijave, datumPopravka, 
       opisKvara, opisPopravka, status, radniNalogPotpisan, popravkaUPotpunosti, 
       napomene, kreiranDatum, azuriranDatum, synced, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        repair.elevatorId || repair.elevator,
        repair.serviserID,
        repair.datumPrijave,
        repair.datumPopravka,
        repair.opisKvara,
        repair.opisPopravka,
        repair.status || 'čekanje',
        repair.radniNalogPotpisan ? 1 : 0,
        repair.popravkaUPotpunosti ? 1 : 0,
        repair.napomene,
        repair.kreiranDatum || new Date().toISOString(),
        repair.azuriranDatum || new Date().toISOString(),
        1,
        Date.now()
      ]
    );
  },
  
  update: (id, repair) => {
    return db.runSync(
      `UPDATE repairs SET serviserID=?, datumPrijave=?, datumPopravka=?, opisKvara=?, 
       opisPopravka=?, status=?, radniNalogPotpisan=?, popravkaUPotpunosti=?, 
       napomene=?, azuriranDatum=?, synced=?, updated_at=? WHERE id=?`,
      [
        repair.serviserID,
        repair.datumPrijave,
        repair.datumPopravka,
        repair.opisKvara,
        repair.opisPopravka,
        repair.status,
        repair.radniNalogPotpisan ? 1 : 0,
        repair.popravkaUPotpunosti ? 1 : 0,
        repair.napomene,
        repair.azuriranDatum || new Date().toISOString(),
        0,
        Date.now(),
        id
      ]
    );
  },
  
  delete: (id) => {
    return db.runSync('DELETE FROM repairs WHERE id = ?', [id]);
  },
  
  getUnsynced: () => {
    return db.getAllSync('SELECT * FROM repairs WHERE synced = 0');
  },
  
  bulkInsert: (repairs) => {
    repairs.forEach(repair => {
      try {
        repairDB.insert(repair);
      } catch (error) {
        console.log(`Repair ${repair._id} već postoji`);
      }
    });
  },
  
  markSynced: (id, repairId) => {
    return db.runSync('UPDATE repairs SET synced = 1, id = ? WHERE id = ?', [repairId, id]);
  },
};

// Messages DB
export const messageDB = {
  getByRoom: (roomId) => {
    return db.getAllSync('SELECT * FROM messages WHERE chatroomId = ? ORDER BY createdAt', [roomId]);
  },
  
  insert: (message) => {
    const id = message.id || message._id || `local_${Date.now()}`;
    return db.runSync(
      `INSERT INTO messages (id, chatroomId, sender, senderName, content, imageUrl, 
       readBy, createdAt, synced, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        message.chatRoom || message.chatroomId,
        message.sender?._id || message.sender,
        message.sender?.name || message.senderName,
        message.content,
        message.imageUrl,
        JSON.stringify(message.readBy || []),
        message.createdAt || new Date().toISOString(),
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

export default db;

import * as SQLite from 'expo-sqlite';

// Otvori ili kreiraj bazu
const db = SQLite.openDatabaseSync('appel.db');

// Inicijaliziraj bazu - kreiraj tablice
export const initDatabase = () => {
  try {
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
        address TEXT,
        buildingCode TEXT,
        location_lat REAL,
        location_lng REAL,
        manufacturer TEXT,
        model TEXT,
        serialNumber TEXT,
        installationDate TEXT,
        lastServiceDate TEXT,
        status TEXT DEFAULT 'active',
        notes TEXT,
        simCardId TEXT,
        synced INTEGER DEFAULT 1,
        updated_at INTEGER
      );

      -- Servisi
      CREATE TABLE IF NOT EXISTS services (
        id TEXT PRIMARY KEY,
        elevatorId TEXT,
        performedBy TEXT,
        serviceDate TEXT,
        status TEXT DEFAULT 'completed',
        checklistUPS INTEGER DEFAULT 0,
        checklistVoice INTEGER DEFAULT 0,
        checklistShaft INTEGER DEFAULT 0,
        checklistGuides INTEGER DEFAULT 0,
        defectsFound INTEGER DEFAULT 0,
        defectsDescription TEXT,
        defectsPhotos TEXT,
        notes TEXT,
        synced INTEGER DEFAULT 0,
        updated_at INTEGER,
        FOREIGN KEY (elevatorId) REFERENCES elevators(id)
      );

      -- Popravci
      CREATE TABLE IF NOT EXISTS repairs (
        id TEXT PRIMARY KEY,
        elevatorId TEXT,
        reportedBy TEXT,
        reportedDate TEXT,
        repairedBy TEXT,
        repairedDate TEXT,
        status TEXT DEFAULT 'pending',
        priority TEXT DEFAULT 'normal',
        faultDescription TEXT,
        faultPhotos TEXT,
        repairDescription TEXT,
        workOrderSigned INTEGER DEFAULT 0,
        repairCompleted INTEGER DEFAULT 0,
        notes TEXT,
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
    return db.getAllSync('SELECT * FROM elevators ORDER BY address');
  },
  
  getById: (id) => {
    return db.getFirstSync('SELECT * FROM elevators WHERE id = ?', [id]);
  },
  
  insert: (elevator) => {
    const result = db.runSync(
      `INSERT INTO elevators (id, address, buildingCode, location_lat, location_lng, 
       manufacturer, model, serialNumber, installationDate, lastServiceDate, status, 
       notes, simCardId, synced, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        elevator.id || elevator._id,
        elevator.address,
        elevator.buildingCode,
        elevator.location?.coordinates?.[1],
        elevator.location?.coordinates?.[0],
        elevator.manufacturer,
        elevator.model,
        elevator.serialNumber,
        elevator.installationDate,
        elevator.lastServiceDate,
        elevator.status,
        elevator.notes,
        elevator.simCard?._id || elevator.simCard,
        1,
        Date.now()
      ]
    );
    return result;
  },
  
  update: (id, elevator) => {
    return db.runSync(
      `UPDATE elevators SET address=?, buildingCode=?, location_lat=?, location_lng=?, 
       manufacturer=?, model=?, serialNumber=?, installationDate=?, lastServiceDate=?, 
       status=?, notes=?, simCardId=?, synced=?, updated_at=? WHERE id=?`,
      [
        elevator.address,
        elevator.buildingCode,
        elevator.location?.coordinates?.[1],
        elevator.location?.coordinates?.[0],
        elevator.manufacturer,
        elevator.model,
        elevator.serialNumber,
        elevator.installationDate,
        elevator.lastServiceDate,
        elevator.status,
        elevator.notes,
        elevator.simCard,
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
      return db.getAllSync('SELECT * FROM services WHERE elevatorId = ? ORDER BY serviceDate DESC', [elevatorId]);
    }
    return db.getAllSync('SELECT * FROM services ORDER BY serviceDate DESC');
  },
  
  getById: (id) => {
    return db.getFirstSync('SELECT * FROM services WHERE id = ?', [id]);
  },
  
  insert: (service) => {
    const id = service.id || `local_${Date.now()}`;
    return db.runSync(
      `INSERT INTO services (id, elevatorId, performedBy, serviceDate, status, 
       checklistUPS, checklistVoice, checklistShaft, checklistGuides, 
       defectsFound, defectsDescription, defectsPhotos, notes, synced, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        service.elevatorId || service.elevator,
        service.performedBy,
        service.serviceDate,
        service.status || 'completed',
        service.checklistUPS ? 1 : 0,
        service.checklistVoice ? 1 : 0,
        service.checklistShaft ? 1 : 0,
        service.checklistGuides ? 1 : 0,
        service.defectsFound ? 1 : 0,
        service.defectsDescription,
        JSON.stringify(service.defectsPhotos || []),
        service.notes,
        0,
        Date.now()
      ]
    );
  },
  
  update: (id, service) => {
    return db.runSync(
      `UPDATE services SET serviceDate=?, status=?, checklistUPS=?, checklistVoice=?, 
       checklistShaft=?, checklistGuides=?, defectsFound=?, defectsDescription=?, 
       defectsPhotos=?, notes=?, synced=?, updated_at=? WHERE id=?`,
      [
        service.serviceDate,
        service.status,
        service.checklistUPS ? 1 : 0,
        service.checklistVoice ? 1 : 0,
        service.checklistShaft ? 1 : 0,
        service.checklistGuides ? 1 : 0,
        service.defectsFound ? 1 : 0,
        service.defectsDescription,
        JSON.stringify(service.defectsPhotos || []),
        service.notes,
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
  
  markSynced: (id, serverId) => {
    return db.runSync('UPDATE services SET synced = 1, id = ? WHERE id = ?', [serverId, id]);
  },
};

// CRUD operacije za Repairs
export const repairDB = {
  getAll: (elevatorId = null) => {
    if (elevatorId) {
      return db.getAllSync('SELECT * FROM repairs WHERE elevatorId = ? ORDER BY reportedDate DESC', [elevatorId]);
    }
    return db.getAllSync('SELECT * FROM repairs ORDER BY reportedDate DESC');
  },
  
  getById: (id) => {
    return db.getFirstSync('SELECT * FROM repairs WHERE id = ?', [id]);
  },
  
  insert: (repair) => {
    const id = repair.id || `local_${Date.now()}`;
    return db.runSync(
      `INSERT INTO repairs (id, elevatorId, reportedBy, reportedDate, repairedBy, 
       repairedDate, status, priority, faultDescription, faultPhotos, 
       repairDescription, workOrderSigned, repairCompleted, notes, synced, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        repair.elevatorId || repair.elevator,
        repair.reportedBy,
        repair.reportedDate,
        repair.repairedBy,
        repair.repairedDate,
        repair.status || 'pending',
        repair.priority || 'normal',
        repair.faultDescription,
        JSON.stringify(repair.faultPhotos || []),
        repair.repairDescription,
        repair.workOrderSigned ? 1 : 0,
        repair.repairCompleted ? 1 : 0,
        repair.notes,
        0,
        Date.now()
      ]
    );
  },
  
  update: (id, repair) => {
    return db.runSync(
      `UPDATE repairs SET status=?, repairedBy=?, repairedDate=?, repairDescription=?, 
       workOrderSigned=?, repairCompleted=?, notes=?, synced=?, updated_at=? WHERE id=?`,
      [
        repair.status,
        repair.repairedBy,
        repair.repairedDate,
        repair.repairDescription,
        repair.workOrderSigned ? 1 : 0,
        repair.repairCompleted ? 1 : 0,
        repair.notes,
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

export default db;

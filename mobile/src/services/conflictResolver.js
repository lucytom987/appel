/**
 * Conflict Resolution Service - Timestamp-based merge
 * 
 * Pravila:
 * 1. Server ima noviju updated_at → koristi server verziju
 * 2. Local ima unsynced promjene (synced=0) → local ima prioritet
 * 3. Iste timestamps → server ima prioritet (sigurnija opcija)
 * 4. Ako user treba odlučiti → vrati conflict objekt
 */

/**
 * Odluči koja verzija zapisa je "winner"
 * @param {Object} localRecord - Local record s updated_at i synced flagom
 * @param {Object} serverRecord - Server record s updated_at
 * @returns {Object} { action: 'use_server'|'use_local'|'conflict', winner: Object }
 */
export const resolveConflict = (localRecord, serverRecord) => {
  // Nema local verzije → koristi server
  if (!localRecord) {
    return {
      action: 'use_server',
      winner: serverRecord,
      reason: 'Local verzija ne postoji'
    };
  }

  // Nema server verzije → zadrži local (obično neće se desiti)
  if (!serverRecord) {
    return {
      action: 'use_local',
      winner: localRecord,
      reason: 'Server verzija ne postoji'
    };
  }

  // Parse timestamps (mogu biti broj ili ISO string)
  const localTime = typeof localRecord.updated_at === 'number' 
    ? localRecord.updated_at 
    : new Date(localRecord.updated_at || localRecord.azuriranDatum).getTime();
  
  const serverTime = typeof serverRecord.updated_at === 'number'
    ? serverRecord.updated_at
    : new Date(serverRecord.updated_at || serverRecord.azuriranDatum).getTime();

  // Local ima unsynced promjene → local ima prioritet
  if (localRecord.synced === 0) {
    console.log(`🔧 Local conflict: local_time=${localTime}, server_time=${serverTime}, synced=0 → use LOCAL`);
    return {
      action: 'use_local',
      winner: localRecord,
      reason: 'Local ima unsynced promjene (synced=0)'
    };
  }

  // Server je noviji → koristi server
  if (serverTime > localTime) {
    console.log(`📥 Server conflict: server_time=${serverTime} > local_time=${localTime} → use SERVER`);
    return {
      action: 'use_server',
      winner: serverRecord,
      reason: 'Server verzija je novija'
    };
  }

  // Local je noviji ili isti → koristi server (konzervativniji pristup)
  console.log(`⚖️ Equal conflict: server_time=${serverTime} === local_time=${localTime} → use SERVER (default)`);
  return {
    action: 'use_server',
    winner: serverRecord,
    reason: 'Server verzija je ista ili local je noviji, ali koristimo server kao default'
  };
};

/**
 * Merge array of records s conflict resolution
 * @param {Array} localRecords - Local records
 * @param {Array} serverRecords - Server records
 * @param {String} idField - Ime polja koje sadrži ID ('id' ili '_id')
 * @returns {Object} { toUpdate: [], toDelete: [], conflicts: [] }
 */
export const mergeRecords = (localRecords, serverRecords, idField = 'id') => {
  const localMap = new Map(localRecords.map(r => [r[idField], r]));
  const serverMap = new Map(serverRecords.map(r => [r[idField] || r._id, r]));

  const toUpdate = [];
  const toDelete = [];
  const conflicts = [];

  // 1. Provjeri sve server records
  for (const [serverId, serverRecord] of serverMap.entries()) {
    const localRecord = localMap.get(serverId);
    const resolution = resolveConflict(localRecord, serverRecord);

    if (resolution.action === 'use_server') {
      toUpdate.push({ ...serverRecord, _resolvedBy: 'server' });
    } else if (resolution.action === 'conflict') {
      conflicts.push({
        local: localRecord,
        server: serverRecord,
        message: resolution.reason
      });
    }
    // 'use_local' → ne dodajemo u toUpdate (local ostaje)
  }

  // 2. Provjeri local records koji ne postoje na serveru
  for (const [localId, localRecord] of localMap.entries()) {
    // Preskoči dummy/local_ prefixe (još nisu synced)
    if (localId.startsWith('dummy_') || localId.startsWith('local_')) {
      continue;
    }

    // Ako local record ne postoji na serveru I nema unsynced promjena → obriši
    if (!serverMap.has(localId) && localRecord.synced !== 0) {
      toDelete.push(localId);
    }
  }

  return { toUpdate, toDelete, conflicts };
};

/**
 * Merge single record (korisno za real-time updates)
 * @param {Object} localRecord 
 * @param {Object} serverRecord 
 * @returns {Object} { shouldUpdate: boolean, record: Object }
 */
export const mergeSingleRecord = (localRecord, serverRecord) => {
  const resolution = resolveConflict(localRecord, serverRecord);

  if (resolution.action === 'use_server') {
    return {
      shouldUpdate: true,
      record: serverRecord,
      reason: resolution.reason
    };
  } else if (resolution.action === 'use_local') {
    return {
      shouldUpdate: false,
      record: localRecord,
      reason: resolution.reason
    };
  } else {
    // Conflict - za sada koristi server (može se kasnije dodati UI dialog)
    return {
      shouldUpdate: true,
      record: serverRecord,
      reason: 'Conflict - koristim server verziju',
      isConflict: true
    };
  }
};

export default {
  resolveConflict,
  mergeRecords,
  mergeSingleRecord
};

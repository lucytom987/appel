import NetInfo from '@react-native-community/netinfo';
import * as SecureStore from 'expo-secure-store';
import api, { elevatorsAPI, servicesAPI, repairsAPI, usersAPI } from './api';
import { elevatorDB, serviceDB, repairDB, userDB, syncQueue, cleanupOrphans } from '../database/db';

const ALLOWED_CHECKLIST = [
  'lubrication',
  'ups_check',
  'voice_comm',
  'shaft_cleaning',
  'drive_check',
  'brake_check',
  'cable_inspection',
];

// Normalizira payload prije slanja da spriječi validation/cast greške na backendu
const normalizeServicePayload = (s) => {
  const checklist = Array.isArray(s.checklist)
    ? s.checklist
        .filter((item) => ALLOWED_CHECKLIST.includes(item?.stavka))
        .map((item) => ({
          stavka: item?.stavka,
          // Normalize provjereno: accept number or boolean and always store 0/1
          provjereno: (() => {
            // Accept both correct and legacy typo keys to avoid losing existing data
            const raw = item?.provjereno ?? item?.provjereno;
            if (typeof raw === 'number') return raw;
            return raw === true ? 1 : 0;
          })(),
          napomena: item?.napomena,
        }))
    : [];

  const nedostaci = Array.isArray(s.nedostaci)
    ? s.nedostaci.map((n) => ({
        opis: n?.opis,
        fotografija: n?.fotografija,
        datumPrijave: n?.datumPrijave || undefined,
        repairId: n?.repairId || undefined,
      }))
    : [];

  const payload = {
    elevatorId: s.elevatorId,
    datum: s.datum,
    checklist,
    imaNedostataka: Boolean(s.imaNedostataka),
    nedostaci,
    napomene: s.napomene || '',
    sljedeciServis: s.sljedeciServis || undefined,
  };

  // Izbaci undefined polja da ne šaljemo prazne vrijednosti
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
  return payload;
};

const explainError = (err) => {
  const status = err?.response?.status;
  const data = err?.response?.data;
  if (!data) return `${err?.message || 'Unknown error'}${status ? ` (status ${status})` : ''}`;
  // Prefer detailed payload
  const payload = JSON.stringify(data);
  if (data.errorMessages) return `${data.errorMessages}${status ? ` (status ${status})` : ''}`;
  if (data.errors) return `${JSON.stringify(data.errors)}${status ? ` (status ${status})` : ''}`;
  if (data.message) return `${data.message}${status ? ` (status ${status})` : ''} | payload: ${payload}`;
  return `${payload}${status ? ` (status ${status})` : ''}`;
};

// Brzi, pouzdani sync s delta (updatedAfter) i push za lokalne promjene.

let isOnline = false;
let syncInterval = null;
let syncInProgress = false;
let queueInProgress = false;

// Mark local record as conflict for later resolution
const markConflict = (db, id) => {
  try {
    db.update?.(id, { sync_status: 'conflict', synced: 0, updated_at: Date.now() });
  } catch (e) {
    console.log('Failed to mark conflict for', id, e?.message);
  }
};

// Helper: odluÄi treba li full sync i po potrebi oÄisti lastSync kljuÄ
const shouldForceFullSync = async (key, hasLocalRecordsFn) => {
  try {
    const existing = hasLocalRecordsFn?.() || [];
    if (!existing.length) {
      if (SecureStore.deleteItemAsync) {
        await SecureStore.deleteItemAsync(key);
        console.log(`${key}: forcing full pull (cleared ${key})`);
      }
      return true;
    }
  } catch (e) {
    console.log(`Skip shouldForceFullSync check for ${key}:`, e?.message);
  }
  return false;
};

const toMs = (v) => {
  const t = new Date(v || 0).getTime();
  return Number.isNaN(t) ? 0 : t;
};

const isPendingDelete = (rec) => rec?.sync_status === 'pending_delete' || rec?.is_deleted;

// Network status
export const checkOnlineStatus = async () => {
  const state = await NetInfo.fetch();
  isOnline = Boolean(state.isConnected && state.isInternetReachable);
  return isOnline;
};

export const subscribeToNetworkChanges = (callback) =>
  NetInfo.addEventListener((state) => {
    const wasOnline = isOnline;
    isOnline = Boolean(state.isConnected && state.isInternetReachable);
    if (callback) callback(isOnline);
    if (!wasOnline && isOnline) {
      console.log('Online - pokreÄ‡em full sync');
      (async () => {
        await forceFullNextSync();
        await syncAll();
      })();
    }
  });

// lastSync helpers
const getLastSync = async (key) => {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
};
const setLastSync = async (key) => {
  try {
    await SecureStore.setItemAsync(key, new Date().toISOString());
  } catch {
    /* ignore */
  }
};

// OdluÄi treba li periodiÄki forsirati full sync kako bismo uhvatili brisanja
const shouldRunPeriodicFull = async (key, maxHours = 6) => {
  try {
    const last = await SecureStore.getItemAsync(key);
    if (!last) return true;
    const diffH = (Date.now() - new Date(last).getTime()) / (1000 * 60 * 60);
    return diffH >= maxHours;
  } catch {
    return true;
  }
};

const setLastFull = async (key) => {
  try {
    await SecureStore.setItemAsync(key, new Date().toISOString());
  } catch {
    /* ignore */
  }
};

  // Primaj full pull na idući sync (briše lastSync/lastFull ključeve)
export const forceFullNextSync = async () => {
  const keys = [
    'lastSyncElevators',
    'lastSyncServices',
    'lastSyncRepairs',
    'lastFullElevators',
    'lastFullServices',
    'lastFullRepairs',
  ];
  for (const key of keys) {
    try {
      if (SecureStore.deleteItemAsync) {
        await SecureStore.deleteItemAsync(key);
      }
    } catch (e) {
      console.log(`Could not clear ${key}:`, e?.message);
    }
  }
  console.log('Primed full pull: cleared lastSync/lastFull keys');
};
const ensureToken = async () => {
  const token = await SecureStore.getItemAsync('userToken');
  return token || null;
};

// Queue helpers
const parseQueuedData = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

export const processSyncQueue = async () => {
  if (queueInProgress) return false;
  queueInProgress = true;

  try {
    const online = await checkOnlineStatus();
    if (!online) {
      queueInProgress = false;
      return false;
    }

    const token = await ensureToken();
    if (!token) {
      queueInProgress = false;
      return false;
    }

    const items = syncQueue.getAll?.() || [];
    if (!items.length) {
      queueInProgress = false;
      return true;
    }

    console.log(`Sync queue: processing ${items.length} item(s)`);

    for (const item of items) {
      const payload = parseQueuedData(item.data);
      try {
        await api.request({
          method: item.method,
          url: item.endpoint,
          data: payload,
        });
        syncQueue.remove(item.id);
        console.log(`Queue item ${item.id} sent`);
      } catch (err) {
        const status = err?.response?.status;

        // Stop early if offline again
        if (!err?.response) {
          console.log(`Queue item ${item.id} failed (offline): ${err?.message || 'n/a'}`);
          break;
        }

        // Drop on unrecoverable 4xx to avoid endless retry
        if (status && status >= 400 && status < 500) {
          console.log(`Queue item ${item.id} dropped (status ${status})`);
          syncQueue.remove(item.id);
          continue;
        }

        console.log(`Queue item ${item.id} retained (status ${status || 'unknown'})`);
      }
    }

    return true;
  } finally {
    queueInProgress = false;
  }
};

// Pull elevatori (delta, uz auto-recovery ako lokalni broj je manji od server total)
export const syncElevatorsFromServer = async (forceFull = false) => {
  if (!isOnline) return false;
  try {
    const periodicFull = await shouldRunPeriodicFull('lastFullElevators', 6);
    const shouldFullSync = forceFull || periodicFull || (await shouldForceFullSync('lastSyncElevators', elevatorDB.getAll));
    const last = shouldFullSync ? null : await getLastSync('lastSyncElevators');

    const baseParams = last ? { updatedAfter: last, includeDeleted: true } : { includeDeleted: true };
    const limit = 200; // backend cap
    let skip = 0;
    let fetched = 0;
    let total = 0;

    const serverIds = new Set();

    do {
      const params = { ...baseParams, limit, skip };
      console.log('Sync elevators, params:', params);
      const res = await elevatorsAPI.getAll(params);
      const serverElevators = res.data.data || [];
      total = res.data.total || serverElevators.length;

      serverElevators.forEach((e) => {
        const serverId = e._id || e.id;
        if (serverId) {
          serverIds.add(String(serverId));
        }
        const local = elevatorDB.getAnyById?.(e._id || e.id);
        const serverUpdated = toMs(e.updated_at || e.azuriranDatum || e.updatedAt || e.kreiranDatum);
        const localUpdated = local ? toMs(local.updated_at || local.azuriranDatum) : 0;
        const localDirty = local && (local.sync_status === 'dirty' || local.synced === 0);

        if (localDirty && localUpdated > serverUpdated) {
          return; // zadrÅ¾i noviju lokalnu verziju
        }

        const payload = {
          id: e._id,
          brojUgovora: e.brojUgovora,
          nazivStranke: e.nazivStranke,
          ulica: e.ulica,
          mjesto: e.mjesto,
          brojDizala: e.brojDizala,
          kontaktOsoba: e.kontaktOsoba,
          koordinate: e.koordinate,
          status: e.status,
          intervalServisa: e.intervalServisa,
          zadnjiServis: e.zadnjiServis,
          sljedeciServis: e.sljedeciServis,
          napomene: e.napomene,
          updated_at: e.updated_at || e.azuriranDatum || e.updatedAt,
          updated_by: e.updated_by,
          is_deleted: e.is_deleted,
          deleted_at: e.deleted_at,
          sync_status: 'synced',
          synced: 1,
        };

        try {
          elevatorDB.insert(payload);
        } catch {
          elevatorDB.update(e._id, payload);
        }
      });

      fetched += serverElevators.length;
      skip += serverElevators.length;
    } while (fetched < total && skip < 5000);

    // Ako je full pull (nema updatedAfter) napravimo reconciliaciju: lokalni zapisi koji nisu na serveru -> oznaÄi kao obrisane (osim local_ i dirty)
    if (!last) {
      try {
        const locals = elevatorDB.getAllIncludingDeleted?.() || [];
        locals
          .filter((loc) => !String(loc.id || '').startsWith('local_'))
          .filter((loc) => !(loc.sync_status === 'dirty' || loc.synced === 0))
          .forEach((loc) => {
            if (!serverIds.has(String(loc.id))) {
              elevatorDB.update(loc.id, {
                ...loc,
                is_deleted: 1,
                deleted_at: loc.deleted_at || new Date().toISOString(),
                updated_at: Date.now(),
                sync_status: 'synced',
                synced: 1,
              });
            }
          });
      } catch (e) {
        console.log('Elevator reconciliation skipped:', e?.message);
      }
    }

    // Ako delta nije vratila ništa, forsiraj jedan full pull
    if (!shouldFullSync && fetched === 0) {
      try {
        if (SecureStore.deleteItemAsync) {
          await SecureStore.deleteItemAsync('lastSyncElevators');
          console.log('Elevators delta returned 0; retrying with full pull');
        }
      } catch (e) {
        console.log('Could not clear lastSyncElevators for full retry:', e?.message);
      }
      return syncElevatorsFromServer();
    }

    await setLastSync('lastSyncElevators');
    if (shouldFullSync) {
      await setLastFull('lastFullElevators');
    }

    // Recovery: ako delta sync donese manje zapisa od server total, odradi još jedan full pull
    const localCount = (elevatorDB.getAll?.() || []).length;
    if (!forceFull && total && localCount < total) {
      console.log(`Elevators local count (${localCount}) < server total (${total}); forcing full pull once`);
      return syncElevatorsFromServer(true);
    }

    console.log(`Elevators synced: ${fetched} (total reported: ${total || fetched})`);
    return true;
  } catch (err) {
    console.log('Greška sync elevators:', err.message);
    return false;
  }
};

// Push unsynced elevators
export const syncElevatorsToServer = async () => {
  if (!isOnline) return false;
  const unsynced = elevatorDB.getUnsynced?.() || [];
  if (!unsynced.length) return true;
  console.log(`Push elevators: ${unsynced.length}`);

  for (const e of unsynced) {
    try {
      const localId = String(e.id || '');
      const pendingDelete = isPendingDelete(e);

      // Parse kontaktOsoba ako je string iz SQLite
      let kontaktOsoba = e.kontaktOsoba;
      if (typeof kontaktOsoba === 'string') {
        try {
          kontaktOsoba = JSON.parse(kontaktOsoba || '{}');
        } catch {
          kontaktOsoba = {};
        }
      }

      const payload = {
        brojUgovora: e.brojUgovora,
        nazivStranke: e.nazivStranke,
        ulica: e.ulica,
        mjesto: e.mjesto,
        brojDizala: e.brojDizala,
        kontaktOsoba,
        koordinate: e.koordinate || {
          latitude: e.koordinate_lat,
          longitude: e.koordinate_lng,
        },
        status: e.status,
        intervalServisa: e.intervalServisa,
        zadnjiServis: e.zadnjiServis,
        sljedeciServis: e.sljedeciServis,
        napomene: e.napomene,
        is_deleted: e.is_deleted,
        deleted_at: e.deleted_at,
      };

      if (localId.startsWith('local_')) {
        if (pendingDelete) {
          // Lokalan zapis nikad nije otišao na server - oznaci kao sinkroniziran delete
          elevatorDB.markSynced(e.id, e.id);
          continue;
        }
        const res = await elevatorsAPI.create(payload);
        const serverId = res.data?.data?._id || res.data?._id || res.data?.id;
        if (serverId) {
          elevatorDB.markSynced(e.id, serverId);
        }
      } else {
        // Ako je oznacen kao deleted/pending_delete, pokušaj DELETE
        if (pendingDelete) {
          try {
            await elevatorsAPI.delete(e.id);
            elevatorDB.markSynced(e.id, e.id);
            continue;
          } catch (err) {
            const status = err?.response?.status || err?.status;
            if (status === 404) {
              console.log('Elevator already deleted on server, marking synced', e.id);
              elevatorDB.markSynced(e.id, e.id);
              continue;
            }
            console.log('Greška delete elevator', e.id, explainError(err));
            continue;
          }
        }

        // Za postojece zapise usporedi updated_at da ne pregazi noviju server verziju
        try {
          const remoteRes = await elevatorsAPI.getOne(e.id);
          const remote = remoteRes?.data?.data || remoteRes?.data || {};
          const serverUpdated = toMs(remote.updated_at || remote.azuriranDatum || remote.updatedAt || remote.kreiranDatum);
          const localUpdated = toMs(e.updated_at || e.azuriranDatum);
          if (serverUpdated && serverUpdated > localUpdated) {
            markConflict(elevatorDB, e.id);
            console.log(`Skip push elevator ${e.id}: server newer (${serverUpdated} > ${localUpdated})`);
            continue;
          }
        } catch (fetchErr) {
          const status = fetchErr?.response?.status || fetchErr?.status;
          if (status === 404) {
            console.log('Server nema elevator, kreiram ponovo', e.id);
            const res = await elevatorsAPI.create(payload);
            const serverId = res.data?.data?._id || res.data?._id || res.data?.id;
            if (serverId) elevatorDB.markSynced(e.id, serverId);
            continue;
          }
          console.log('Greška dohvat server elevator', e.id, explainError(fetchErr));
          // nastavi s push-om; bolje pokušati nego zapeti
        }

        await elevatorsAPI.update(e.id, payload);
        elevatorDB.markSynced(e.id, e.id);
      }
    } catch (err) {
      const status = err?.response?.status || err?.status;
      if (status === 409 || status === 412) {
        markConflict(elevatorDB, e.id);
      }
      console.log('Greška push elevator', e.id, explainError(err));
    }
  }
  return true;
};

// Pull services (delta)
export const syncServicesFromServer = async (forceFull = false) => {
  if (!isOnline) return false;
  try {
    const periodicFull = await shouldRunPeriodicFull('lastFullServices', 6);
    const shouldFullSync = forceFull || periodicFull || (await shouldForceFullSync('lastSyncServices', serviceDB.getAll));
    const last = shouldFullSync ? null : await getLastSync('lastSyncServices');

    const baseParams = last ? { updatedAfter: last, includeDeleted: true } : { includeDeleted: true };
    const limit = 200; // backend limit cap is 200
    let skip = 0;
    let fetched = 0;
    let total = 0;

    const serverIds = new Set();

    do {
      const params = { ...baseParams, limit, skip };
      console.log('Sync services, params:', params);
      const res = await servicesAPI.getAll(params);
      const serverServices = res.data.data || [];
      total = res.data.total || serverServices.length;

      serverServices.forEach((s) => {
        serverIds.add(String(s._id));
        const local = serviceDB.getById?.(s._id);
        const serverUpdated = toMs(s.updated_at || s.azuriranDatum || s.updatedAt || s.kreiranDatum);
        const localUpdated = local ? toMs(local.updated_at || local.azuriranDatum) : 0;
        const localDirty = local && (local.sync_status === 'dirty' || local.synced === 0);

        if (localDirty && localUpdated > serverUpdated) {
          return; // lokalna promjena novija
        }

        const payload = {
          id: s._id,
          elevatorId: s.elevatorId?._id || s.elevatorId,
          serviserID: s.serviserID?._id || s.serviserID,
          datum: s.datum,
          checklist: s.checklist || [],
          imaNedostataka: s.imaNedostataka,
          nedostaci: s.nedostaci || [],
          napomene: s.napomene,
          sljedeciServis: s.sljedeciServis,
          kreiranDatum: s.kreiranDatum || s.createdAt,
          azuriranDatum: s.azuriranDatum || s.updatedAt,
          updated_at: s.updated_at || s.azuriranDatum || s.updatedAt,
          updated_by: s.updated_by,
          is_deleted: s.is_deleted,
          deleted_at: s.deleted_at,
          sync_status: 'synced',
          synced: 1,
        };

        try {
          serviceDB.insert(payload);
        } catch {
          serviceDB.update(s._id, payload);
        }
      });

      fetched += serverServices.length;
      skip += serverServices.length;
    } while (fetched < total && skip < 5000); // hard stop to avoid runaway

    // Full pull reconciliation: mark local services missing on server as deleted (except local_ or dirty)
    if (!last) {
      try {
        const locals = serviceDB.getAll?.() || [];
        locals
          .filter((loc) => !String(loc.id || '').startsWith('local_'))
          .filter((loc) => !(loc.sync_status === 'dirty' || loc.synced === 0))
          .forEach((loc) => {
            if (!serverIds.has(String(loc.id))) {
              serviceDB.update(loc.id, {
                ...loc,
                is_deleted: 1,
                deleted_at: loc.deleted_at || new Date().toISOString(),
                updated_at: Date.now(),
                sync_status: 'synced',
                synced: 1,
              });
            }
          });
      } catch (e) {
        console.log('Services reconciliation skipped:', e?.message);
      }
    }

    // Ako je delta sync vratio 0 rezultata, pokušaj jedan full sync (obrisi lastSyncServices)
    if (!shouldFullSync && fetched === 0) {
      try {
        if (SecureStore.deleteItemAsync) {
          await SecureStore.deleteItemAsync('lastSyncServices');
          console.log('Services delta returned 0; retrying with full pull');
        }
      } catch (e) {
        console.log('Could not clear lastSyncServices for full retry:', e?.message);
      }
      return syncServicesFromServer(true);
    }

    await setLastSync('lastSyncServices');
    if (shouldFullSync) {
      await setLastFull('lastFullServices');
    }
    const localCount = serviceDB.getAll?.().length || 0;
    console.log(`Services synced: ${fetched} (total reported: ${total || fetched}), lokalno: ${localCount}`);
    return true;
  } catch (err) {
    console.log('Greška sync services:', err.message);
    return false;
  }
};

// Pull repairs (delta)
export const syncRepairsFromServer = async () => {
  if (!isOnline) return false;
  try {
    const periodicFull = await shouldRunPeriodicFull('lastFullRepairs', 1); // češći full sync da pokupimo brisanja (svakih ~1h)
    const shouldFullSync = periodicFull || (() => {
      try {
        const existing = repairDB.getAll();
        if (!existing.length) return true;
        return existing.some((r) => !r.elevatorId || r.elevatorId === '[object Object]');
      } catch {
        return false;
      }
    })();

    const last = shouldFullSync ? null : await getLastSync('lastSyncRepairs');
    const baseParams = last ? { updatedAfter: last, includeDeleted: true } : { includeDeleted: true };
    const limit = 200;
    let skip = 0;
    let fetched = 0;
    let total = 0;

    if (shouldFullSync && SecureStore.deleteItemAsync) {
      await SecureStore.deleteItemAsync('lastSyncRepairs');
      console.log('Repair sync: forcing full pull (cleared lastSyncRepairs)');
    }
    do {
      const params = { ...baseParams, limit, skip };
      console.log('Sync repairs, params:', params);
      const res = await repairsAPI.getAll(params);
      const serverRepairs = res.data.data || [];
      total = res.data.total || serverRepairs.length;

      serverRepairs.forEach((r) => {
      const elevatorId = r.elevatorId?._id || r.elevatorId?.id || r.elevator || r.elevatorId;
      const serviserID = r.serviserID?._id || r.serviserID?.id || r.serviserID;
      const local = repairDB.getById?.(r._id);
      const serverUpdated = toMs(r.updated_at || r.azuriranDatum || r.updatedAt || r.kreiranDatum);
      const localUpdated = local ? toMs(local.updated_at || local.azuriranDatum) : 0;
      const localDirty = local && (local.sync_status === 'dirty' || local.synced === 0);

      if (localDirty && localUpdated > serverUpdated) {
        return; // lokalna promjena novija
      }

      const payload = {
        id: r._id,
        elevatorId,
        serviserID,
        datumPrijave: r.datumPrijave,
        datumPopravka: r.datumPopravka,
        opisKvara: r.opisKvara,
        opisPopravka: r.opisPopravka,
        status: r.status,
        radniNalogPotpisan: r.radniNalogPotpisan,
        popravkaUPotpunosti: r.popravkaUPotpunosti,
        napomene: r.napomene,
        kreiranDatum: r.kreiranDatum || r.createdAt,
        azuriranDatum: r.azuriranDatum || r.updatedAt,
        prijavio: r.prijavio,
        kontaktTelefon: r.kontaktTelefon,
        primioPoziv: r.primioPoziv,
        updated_at: r.updated_at || r.azuriranDatum || r.updatedAt,
        updated_by: r.updated_by,
        is_deleted: r.is_deleted,
        deleted_at: r.deleted_at,
        sync_status: 'synced',
        synced: 1,
      };

      try {
        repairDB.insert(payload);
      } catch {
        repairDB.update(r._id, payload);
      }
      });

      fetched += serverRepairs.length;
      skip += serverRepairs.length;
    } while (fetched < total && skip < 5000);

    // Ako delta vrati 0, pokuaj full pull
    if (!shouldFullSync && fetched === 0) {
      try {
        if (SecureStore.deleteItemAsync) {
          await SecureStore.deleteItemAsync('lastSyncRepairs');
          console.log('Repairs delta returned 0; retrying with full pull');
        }
      } catch (e) {
        console.log('Could not clear lastSyncRepairs for full retry:', e?.message);
      }
      return syncRepairsFromServer();
    }

    await setLastSync('lastSyncRepairs');
    if (shouldFullSync) {
      await setLastFull('lastFullRepairs');
    }
    console.log(`Repairs synced: ${fetched} (total reported: ${total || fetched})`);
    return true;
  } catch (err) {
    console.log('Greška sync repairs:', err.message);
    return false;
  }
};

// Push unsynced services
export const syncServicesToServer = async () => {
  if (!isOnline) return false;
  const unsynced = serviceDB.getUnsynced();
  if (!unsynced.length) return true;
  console.log(`Push services: ${unsynced.length}`);
  for (const s of unsynced) {
    try {
      const localId = String(s.id || '');
      const pendingDelete = isPendingDelete(s);

      if (localId.startsWith('local_')) {
        if (pendingDelete) {
          serviceDB.markSynced(s.id, s.id);
          continue;
        }
        const res = await servicesAPI.create(normalizeServicePayload(s));
        serviceDB.markSynced(s.id, res.data.data._id);
      } else {
        const payload = normalizeServicePayload(s);
        delete payload.elevatorId; // backend čuva originalni elevatorId

        if (pendingDelete) {
          try {
            await servicesAPI.delete(s.id);
            serviceDB.markSynced(s.id, s.id);
            continue;
          } catch (err) {
            const status = err?.response?.status || err?.status;
            if (status === 404) {
              console.log('Service already deleted on server, marking synced', s.id);
              serviceDB.markSynced(s.id, s.id);
              continue;
            }
            console.log('Greška delete service', s.id, explainError(err));
            continue;
          }
        }

        // Ne pregazi noviju server verziju
        try {
          const remoteRes = await servicesAPI.getOne(s.id);
          const remote = remoteRes?.data?.data || remoteRes?.data || {};
          const serverUpdated = toMs(remote.updated_at || remote.azuriranDatum || remote.updatedAt || remote.kreiranDatum);
          const localUpdated = toMs(s.updated_at || s.azuriranDatum);
          if (serverUpdated && serverUpdated > localUpdated) {
            markConflict(serviceDB, s.id);
            console.log(`Skip push service ${s.id}: server newer (${serverUpdated} > ${localUpdated})`);
            continue;
          }
        } catch (fetchErr) {
          const status = fetchErr?.response?.status || fetchErr?.status;
          if (status === 404) {
            console.log('Server nema service, kreiram ponovo', s.id);
            const res = await servicesAPI.create(normalizeServicePayload(s));
            serviceDB.markSynced(s.id, res.data.data._id);
            continue;
          }
          console.log('Greška dohvat server service', s.id, explainError(fetchErr));
          // nastavi, pokušaj update
        }

        if (s.is_deleted) {
          payload.is_deleted = true;
          payload.deleted_at = s.deleted_at || new Date().toISOString();
        }
        await servicesAPI.update(s.id, payload);
        serviceDB.markSynced(s.id, s.id);
      }
    } catch (err) {
      const status = err?.response?.status || err?.status;
      if (status === 409 || status === 412) {
        markConflict(serviceDB, s.id);
      }
      console.log('Greška push service', s.id, explainError(err));
      if (err?.response?.data) {
        console.log('Detalji greške:', err.response.data);
      }
    }
  }
  return true;
};

// Push unsynced repairs
export const syncRepairsToServer = async () => {
  if (!isOnline) return false;
  const unsynced = repairDB.getUnsynced();
  if (!unsynced.length) return true;
  console.log(`Push repairs: ${unsynced.length}`);
  for (const r of unsynced) {
    const elevatorId = (typeof r.elevatorId === 'object') ? (r.elevatorId._id || r.elevatorId.id) : r.elevatorId;
    const serviserID = (typeof r.serviserID === 'object') ? (r.serviserID._id || r.serviserID.id) : r.serviserID;
    const localId = String(r.id || '');
    const pendingDelete = isPendingDelete(r);
    try {
      if (localId.startsWith('local_')) {
        if (pendingDelete) {
          repairDB.markSynced(r.id, r.id);
          continue;
        }
        const res = await repairsAPI.create({
          elevatorId,
          status: r.status,
          opisKvara: r.opisKvara,
          opisPopravka: r.opisPopravka,
          datumPrijave: r.datumPrijave,
          datumPopravka: r.datumPopravka,
          radniNalogPotpisan: Boolean(r.radniNalogPotpisan),
          popravkaUPotpunosti: Boolean(r.popravkaUPotpunosti),
          napomene: r.napomene,
          prijavio: r.prijavio,
          kontaktTelefon: r.kontaktTelefon,
          primioPoziv: r.primioPoziv,
          serviserID,
        });
        repairDB.markSynced(r.id, res.data.data._id);
      } else {
        if (pendingDelete) {
          try {
            await repairsAPI.delete(r.id);
            repairDB.markSynced(r.id, r.id);
            continue;
          } catch (err) {
            const status = err?.response?.status || err?.status;
            if (status === 404) {
              console.log('Repair already deleted on server, marking synced', r.id);
              repairDB.markSynced(r.id, r.id);
              continue;
            }
            console.log('Greska delete repair', r.id, explainError(err));
            continue;
          }
        }

        // Ne pregazi noviju server verziju
        try {
          const remoteRes = await repairsAPI.getOne(r.id);
          const remote = remoteRes?.data?.data || remoteRes?.data || {};
          const serverUpdated = toMs(remote.updated_at || remote.azuriranDatum || remote.updatedAt || remote.kreiranDatum);
          const localUpdated = toMs(r.updated_at || r.azuriranDatum);
          if (serverUpdated && serverUpdated > localUpdated) {
            markConflict(repairDB, r.id);
            console.log(`Skip push repair ${r.id}: server newer (${serverUpdated} > ${localUpdated})`);
            continue;
          }
        } catch (fetchErr) {
          const status = fetchErr?.response?.status || fetchErr?.status;
          if (status === 404) {
            console.log('Server nema repair, kreiram ponovo', r.id);
            const res = await repairsAPI.create({
              elevatorId,
              status: r.status,
              opisKvara: r.opisKvara,
              opisPopravka: r.opisPopravka,
              datumPrijave: r.datumPrijave,
              datumPopravka: r.datumPopravka,
              radniNalogPotpisan: Boolean(r.radniNalogPotpisan),
              popravkaUPotpunosti: Boolean(r.popravkaUPotpunosti),
              napomene: r.napomene,
              prijavio: r.prijavio,
              kontaktTelefon: r.kontaktTelefon,
              primioPoziv: r.primioPoziv,
              serviserID,
            });
            repairDB.markSynced(r.id, res.data.data._id);
            continue;
          }
          console.log('Greska dohvat server repair', r.id, explainError(fetchErr));
          // nastavi, pokušaj update
        }

        await repairsAPI.update(r.id, {
          elevatorId,
          status: r.status,
          opisKvara: r.opisKvara,
          opisPopravka: r.opisPopravka,
          datumPopravka: r.datumPopravka,
          radniNalogPotpisan: Boolean(r.radniNalogPotpisan),
          popravkaUPotpunosti: Boolean(r.popravkaUPotpunosti),
          napomene: r.napomene,
          prijavio: r.prijavio,
          kontaktTelefon: r.kontaktTelefon,
          primioPoziv: r.primioPoziv,
          is_deleted: Boolean(r.is_deleted),
          deleted_at: r.is_deleted ? (r.deleted_at || new Date().toISOString()) : undefined,
          serviserID,
        });
        repairDB.markSynced(r.id, r.id);
      }
    } catch (err) {
      const status = err?.response?.status || err?.status;
      if (status === 409 || status === 412) {
        markConflict(repairDB, r.id);
      }
      console.log('Greska push repair', r.id, explainError(err));
      if (err?.response?.data) {
        console.log('Detalji greske:', err.response.data);
      }
    }
  }
  return true;
};

// Sync users (admin)
export const syncUsersFromServer = async () => {
  if (!isOnline) return false;
  try {
    const userData = await SecureStore.getItemAsync('userData');
    if (!userData) return false;
    const u = JSON.parse(userData);
    if (u.uloga !== 'admin') return false;
    const res = await usersAPI.getAll();
    userDB.bulkInsert(res.data);
    return true;
  } catch (err) {
    console.log('Greška sync users:', err.message);
    return false;
  }
};

// Public helper: force idući sync da bude full (čisti lastSync/lastFull ključeve)
export const primeFullSync = async () => {
  await forceFullNextSync();
};

// Master sync
export const syncAll = async () => {
  if (syncInProgress) {
    console.log('Sync veÄ‡ u tijeku - preskaÄem');
    return false;
  }
  syncInProgress = true;

  const online = await checkOnlineStatus();
  if (!online) {
    console.log('Offline - nema sync');
    syncInProgress = false;
    return false;
  }

  const token = await ensureToken();
  if (!token) {
    console.log('Nema tokena - prekidam sync');
    syncInProgress = false;
    return false;
  }

  try {
    console.log('Full sync start...');
    await processSyncQueue();
    await syncElevatorsToServer();
    await syncServicesToServer();
    await syncRepairsToServer();
    await syncElevatorsFromServer();
    // Ako je broj lokalnih dizala neočekivano mali (npr. Expo dev s praznim cacheom), forsiraj jedan full pull
    const localElevatorCount = (elevatorDB.getAll?.() || []).length;
    if (localElevatorCount > 0 && localElevatorCount < 80) {
      console.log(`Elevators count looks low (${localElevatorCount}), forcing one full pull retry`);
      await forceFullNextSync();
      await syncElevatorsFromServer(true);
    }
    await syncServicesFromServer();
    await syncRepairsFromServer();
    await syncUsersFromServer();
    try {
      cleanupOrphans();
    } catch (e) {
      console.log('Cleanup orphans skipped:', e?.message);
    }
    console.log('Full sync done.');
    syncInProgress = false;
    return true;
  } catch (err) {
    console.error('Greška pri full sync:', err);
    syncInProgress = false;
    return false;
  }
};

// Auto sync
export const startAutoSync = () => {
  if (syncInterval) return;
  console.log('Auto-sync pokrenut (5 min interval)');
  syncInterval = setInterval(async () => {
    const online = await checkOnlineStatus();
    if (online) {
      syncAll();
    }
  }, 5 * 60 * 1000);
};

export const stopAutoSync = () => {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('Auto-sync zaustavljen');
  }
};

export default {
  checkOnlineStatus,
  subscribeToNetworkChanges,
  syncAll,
  startAutoSync,
  stopAutoSync,
  syncElevatorsFromServer,
  syncServicesFromServer,
  syncRepairsFromServer,
  syncUsersFromServer,
  syncServicesToServer,
  syncRepairsToServer,
  processSyncQueue,
  forceFullNextSync,
  primeFullSync,
};












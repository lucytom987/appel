import NetInfo from '@react-native-community/netinfo';
import * as SecureStore from 'expo-secure-store';
import { elevatorsAPI, servicesAPI, repairsAPI, usersAPI } from './api';
import { elevatorDB, serviceDB, repairDB, userDB } from '../database/db';

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
          provjereno: typeof item?.provjereno === 'number' ? item.provjereno : 0,
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

// Helper: odluči treba li full sync i po potrebi očisti lastSync ključ
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
      console.log('Online - pokrećem sync');
      syncAll();
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

// Odluči treba li periodički forsirati full sync kako bismo uhvatili brisanja
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
const ensureToken = async () => {
  const token = await SecureStore.getItemAsync('userToken');
  return token || null;
};

// Pull elevatori (delta)
export const syncElevatorsFromServer = async () => {
  if (!isOnline) return false;
  try {
    const periodicFull = await shouldRunPeriodicFull('lastFullElevators', 6);
    const shouldFullSync = periodicFull || (await shouldForceFullSync('lastSyncElevators', elevatorDB.getAll));
    const last = shouldFullSync ? null : await getLastSync('lastSyncElevators');

    const params = last ? { updatedAfter: last, includeDeleted: true } : { includeDeleted: true };
    console.log('Sync elevators, params:', params);
    const res = await elevatorsAPI.getAll(params);
    const serverElevators = res.data.data || [];
    serverElevators.forEach((e) => {
      const local = elevatorDB.getAnyById?.(e._id);
      const serverUpdated = toMs(e.updated_at || e.azuriranDatum || e.updatedAt || e.kreiranDatum);
      const localUpdated = local ? toMs(local.updated_at || local.azuriranDatum) : 0;
      const localDirty = local && (local.sync_status === 'dirty' || local.synced === 0);

      if (localDirty && localUpdated > serverUpdated) {
        return; // zadrži noviju lokalnu verziju
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
    await setLastSync('lastSyncElevators');
    if (shouldFullSync) {
      await setLastFull('lastFullElevators');
    }
    console.log(`Elevators synced: ${serverElevators.length}`);
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
      // Parse kontaktOsoba ako je string iz SQLite
      let kontaktOsoba = e.kontaktOsoba;
      if (typeof kontaktOsoba === 'string') {
        try { kontaktOsoba = JSON.parse(kontaktOsoba || '{}'); } catch { kontaktOsoba = {}; }
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

      if (String(e.id || '').startsWith('local_')) {
        const res = await elevatorsAPI.create(payload);
        const serverId = res.data?.data?._id || res.data?._id || res.data?.id;
        if (serverId) {
          elevatorDB.markSynced(e.id, serverId);
        }
      } else {
        // Ako je označen kao deleted, pokušaj DELETE; inače PUT
        if (e.is_deleted) {
          try {
            await elevatorsAPI.delete(e.id);
            elevatorDB.markSynced(e.id, e.id);
            continue;
          } catch (err) {
            console.log('Greška delete elevator', e.id, explainError(err));
          }
        }
        await elevatorsAPI.update(e.id, payload);
        elevatorDB.markSynced(e.id, e.id);
      }
    } catch (err) {
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

    do {
      const params = { ...baseParams, limit, skip };
      console.log('Sync services, params:', params);
      const res = await servicesAPI.getAll(params);
      const serverServices = res.data.data || [];
      total = res.data.total || serverServices.length;

      serverServices.forEach((s) => {
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
    const params = last ? { updatedAfter: last } : {};
    if (shouldFullSync && SecureStore.deleteItemAsync) {
      await SecureStore.deleteItemAsync('lastSyncRepairs');
      console.log('Repair sync: forcing full pull (cleared lastSyncRepairs)');
    }
    console.log('Sync repairs, params:', params);
    const res = await repairsAPI.getAll(params);
    const serverRepairs = res.data.data || [];
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
    await setLastSync('lastSyncRepairs');
    if (shouldFullSync) {
      await setLastFull('lastFullRepairs');
    }
    console.log(`Repairs synced: ${serverRepairs.length}`);
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
      if (s.id.startsWith('local_')) {
        const res = await servicesAPI.create(normalizeServicePayload(s));
        serviceDB.markSynced(s.id, res.data.data._id);
      } else {
        const payload = normalizeServicePayload(s);
        delete payload.elevatorId; // backend čuva originalni elevatorId
        if (s.is_deleted) {
          payload.is_deleted = true;
          payload.deleted_at = s.deleted_at || new Date().toISOString();
        }
        await servicesAPI.update(s.id, payload);
        serviceDB.markSynced(s.id, s.id);
      }
    } catch (err) {
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
    try {
      if (r.id.startsWith('local_')) {
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
        await repairsAPI.update(r.id, {
          elevatorId,
          status: r.status,
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
      console.log('Greška push repair', r.id, explainError(err));
      if (err?.response?.data) {
        console.log('Detalji greške:', err.response.data);
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

// Master sync
export const syncAll = async () => {
  if (syncInProgress) {
    console.log('Sync već u tijeku - preskačem');
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
    await syncElevatorsToServer();
    await syncServicesToServer();
    await syncRepairsToServer();
    await syncElevatorsFromServer();
    await syncServicesFromServer();
    await syncRepairsFromServer();
    await syncUsersFromServer();
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
};

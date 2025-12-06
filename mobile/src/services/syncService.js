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
const ensureToken = async () => {
  const token = await SecureStore.getItemAsync('userToken');
  return token || null;
};

// Pull elevatori (delta)
export const syncElevatorsFromServer = async () => {
  if (!isOnline) return false;
  try {
    const last = await getLastSync('lastSyncElevators');
    const params = last ? { updatedAfter: last } : {};
    console.log('Sync elevators, params:', params);
    const res = await elevatorsAPI.getAll(params);
    const serverElevators = res.data.data || [];
    serverElevators.forEach((e) => {
      try {
        elevatorDB.insert({
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
        });
      } catch {
        elevatorDB.update(e._id, {
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
        });
      }
    });
    await setLastSync('lastSyncElevators');
    console.log(`Elevators synced: ${serverElevators.length}`);
    return true;
  } catch (err) {
    console.log('Greška sync elevators:', err.message);
    return false;
  }
};

// Pull services (delta)
export const syncServicesFromServer = async () => {
  if (!isOnline) return false;
  try {
    const last = await getLastSync('lastSyncServices');
    const params = last ? { updatedAfter: last } : {};
    console.log('Sync services, params:', params);
    const res = await servicesAPI.getAll(params);
    const serverServices = res.data.data || [];
    serverServices.forEach((s) => {
      try {
        serviceDB.insert({
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
        });
      } catch {
        serviceDB.update(s._id, {
          serviserID: s.serviserID?._id || s.serviserID,
          datum: s.datum,
          checklist: s.checklist || [],
          imaNedostataka: s.imaNedostataka,
          nedostaci: s.nedostaci || [],
          napomene: s.napomene,
          sljedeciServis: s.sljedeciServis,
          azuriranDatum: s.azuriranDatum || s.updatedAt,
        });
      }
    });
    await setLastSync('lastSyncServices');
    console.log(`Services synced: ${serverServices.length}`);
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
    const last = await getLastSync('lastSyncRepairs');
    const params = last ? { updatedAfter: last } : {};
    console.log('Sync repairs, params:', params);
    const res = await repairsAPI.getAll(params);
    const serverRepairs = res.data.data || [];
    serverRepairs.forEach((r) => {
      try {
        repairDB.insert({
          id: r._id,
          elevatorId: r.elevatorId?._id || r.elevatorId,
          serviserID: r.serviserID?._id || r.serviserID,
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
        });
      } catch {
        repairDB.update(r._id, {
          serviserID: r.serviserID?._id || r.serviserID,
          datumPrijave: r.datumPrijave,
          datumPopravka: r.datumPopravka,
          opisKvara: r.opisKvara,
          opisPopravka: r.opisPopravka,
          status: r.status,
          radniNalogPotpisan: r.radniNalogPotpisan,
          popravkaUPotpunosti: r.popravkaUPotpunosti,
          napomene: r.napomene,
          azuriranDatum: r.azuriranDatum || r.updatedAt,
        });
      }
    });
    await setLastSync('lastSyncRepairs');
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
    try {
      if (r.id.startsWith('local_')) {
        const res = await repairsAPI.create({
          elevator: r.elevatorId,
          status: r.status,
          opisKvara: r.opisKvara,
          opisPopravka: r.opisPopravka,
          datumPrijave: r.datumPrijave,
          datumPopravka: r.datumPopravka,
          radniNalogPotpisan: Boolean(r.radniNalogPotpisan),
          popravkaUPotpunosti: Boolean(r.popravkaUPotpunosti),
          napomene: r.napomene,
        });
        repairDB.markSynced(r.id, res.data.data._id);
      } else {
        await repairsAPI.update(r.id, {
          status: r.status,
          opisPopravka: r.opisPopravka,
          datumPopravka: r.datumPopravka,
          radniNalogPotpisan: Boolean(r.radniNalogPotpisan),
          popravkaUPotpunosti: Boolean(r.popravkaUPotpunosti),
          napomene: r.napomene,
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

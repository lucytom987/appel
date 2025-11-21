import NetInfo from '@react-native-community/netinfo';
import * as SecureStore from 'expo-secure-store';
import { elevatorsAPI, servicesAPI, repairsAPI, messagesAPI, usersAPI } from './api';
import { elevatorDB, serviceDB, repairDB, messageDB, userDB, syncQueue } from '../database/db';

let isOnline = false;
let syncInterval = null;

// Provjeri network status
export const checkOnlineStatus = async () => {
  const state = await NetInfo.fetch();
  isOnline = Boolean(state.isConnected && state.isInternetReachable);
  return isOnline;
};

// Subscribe na network changes
export const subscribeToNetworkChanges = (callback) => {
  return NetInfo.addEventListener(state => {
    const wasOnline = isOnline;
    isOnline = Boolean(state.isConnected && state.isInternetReachable);
    
    if (callback) {
      callback(isOnline);
    }
    
    // Ako smo se spojili online, pokreni sync
    if (!wasOnline && isOnline) {
      console.log('✅ Online - pokrećem sync...');
      syncAll();
    }
  });
};

// Sync svi elevatori sa servera u lokalnu bazu
export const syncElevatorsFromServer = async () => {
  try {
    if (!isOnline) {
      console.log('⚠️ Offline - preskačem sync elevators');
      return false;
    }

    console.log('🔄 Syncing elevators from server...');
    const response = await elevatorsAPI.getAll();
    const serverElevators = response.data.data;
    const serverIds = serverElevators.map(e => e._id);

    // Dohvati lokalne elevatore
    const localElevators = elevatorDB.getAll();
    const localIds = localElevators.map(e => e.id);

    // Obriši lokalne koji više ne postoje na serveru
    const deletedIds = localIds.filter(id => !serverIds.includes(id));
    for (const id of deletedIds) {
      elevatorDB.delete(id);
      console.log(`🗑️ Obrisano lokalno dizalo ${id} (uklanjeno sa servera)`);
    }

    // Bulk insert nove/ažurirane elevatore
    elevatorDB.bulkInsert(serverElevators);
    
    console.log(`✅ Synced ${serverElevators.length} elevators (obrisano ${deletedIds.length})`);
    return true;
  } catch (error) {
    // Provjeri je li offline token
    const token = await SecureStore.getItemAsync('userToken');
    if (token && token.startsWith('offline_token_')) {
      console.log('⚠️ Offline korisnik - sync nije moguć (nema valjanog JWT)');
      return false;
    }

    // Ne loguj kao error ako je 401 (nije logiran), 502, 503, network error
    if (error.response?.status === 401) {
      console.log('⚠️ Nije autentificiran - sync će se izvršiti nakon logina');
    } else if (error.response?.status === 502 || error.response?.status === 503 || !error.response) {
      console.log('⚠️ Backend server trenutno nije dostupan - nastavaljam offline');
    } else {
      console.error('❌ Greška pri sync elevators:', error.message);
    }
    return false;
  }
};

// Sync svi servisi sa servera u lokalnu bazu
export const syncServicesFromServer = async () => {
  try {
    if (!isOnline) {
      console.log('⚠️ Offline - preskačem sync services');
      return false;
    }

    console.log('🔄 Syncing services from server...');
    const response = await servicesAPI.getAll();
    const serverServices = response.data.data || [];
    const serverIds = serverServices.map(s => s._id);

    // Dohvati lokalne servise
    const localServices = serviceDB.getAll();
    const localIds = localServices.map(s => s.id);

    // Obriši lokalne koji više ne postoje na serveru (osim dummy-ja)
    const deletedIds = localIds.filter(id => !serverIds.includes(id) && !id.startsWith('dummy_'));
    for (const id of deletedIds) {
      serviceDB.delete(id);
      console.log(`🗑️ Obrisana lokalna usluga ${id} (uklanjene sa servera)`);
    }

    // Bulk insert nove/ažurirane servise
    serviceDB.bulkInsert(serverServices);
    
    console.log(`✅ Synced ${serverServices.length} services (obrisano ${deletedIds.length})`);
    return true;
  } catch (error) {
    // Provjeri je li offline token
    const token = await SecureStore.getItemAsync('userToken');
    if (token && token.startsWith('offline_token_')) {
      console.log('⚠️ Offline korisnik - sync nije moguć (nema valjanog JWT)');
      return false;
    }

    if (error.response?.status === 401) {
      console.log('⚠️ Nije autentificiran - sync će se izvršiti nakon logina');
    } else if (error.response?.status === 502 || error.response?.status === 503 || !error.response) {
      console.log('⚠️ Backend server trenutno nije dostupan - nastavaljam offline');
    } else {
      console.error('❌ Greška pri sync services:', error.message);
    }
    return false;
  }
};

// Sync unsynced servici na server
export const syncServicesToServer = async () => {
  try {
    if (!isOnline) {
      console.log('⚠️ Offline - preskačem sync services');
      return false;
    }

    const unsyncedServices = serviceDB.getUnsynced();
    
    if (unsyncedServices.length === 0) {
      console.log('✅ Nema unsynced services');
      return true;
    }

    console.log(`🔄 Syncing ${unsyncedServices.length} services to server...`);

    for (const service of unsyncedServices) {
      try {
        // Skip dummy podatke (počinju sa "dummy_")
        if (service.id.startsWith('dummy_')) {
          console.log(`⏭️ Preskačem dummy service ${service.id}`);
          continue;
        }

        // Ako počinje sa "local_", to je novi servis - POST
        if (service.id.startsWith('local_')) {
          const response = await servicesAPI.create({
            elevator: service.elevatorId,
            serviceDate: service.serviceDate,
            status: service.status,
            checklistUPS: Boolean(service.checklistUPS),
            checklistVoice: Boolean(service.checklistVoice),
            checklistShaft: Boolean(service.checklistShaft),
            checklistGuides: Boolean(service.checklistGuides),
            defectsFound: Boolean(service.defectsFound),
            defectsDescription: service.defectsDescription,
            defectsPhotos: JSON.parse(service.defectsPhotos || '[]'),
            notes: service.notes,
          });
          
          // Označi kao synced i ažuriraj sa server ID-om
          const serverId = response.data.data._id;
          serviceDB.markSynced(service.id, serverId);
          console.log(`✅ Service ${service.id} synced → ${serverId}`);
        } else {
          // Postojeći servis - PUT
          await servicesAPI.update(service.id, {
            serviceDate: service.serviceDate,
            status: service.status,
            checklistUPS: Boolean(service.checklistUPS),
            checklistVoice: Boolean(service.checklistVoice),
            checklistShaft: Boolean(service.checklistShaft),
            checklistGuides: Boolean(service.checklistGuides),
            defectsFound: Boolean(service.defectsFound),
            defectsDescription: service.defectsDescription,
            defectsPhotos: JSON.parse(service.defectsPhotos || '[]'),
            notes: service.notes,
          });
          
          serviceDB.markSynced(service.id, service.id);
          console.log(`✅ Service ${service.id} updated`);
        }
      } catch (error) {
        // Ignoriraj 404 za dummy podatke ili nepostojeće servise
        if (error.response?.status === 404) {
          console.log(`⏭️ Service ${service.id} ne postoji na serveru - preskačem`);
        } else {
          console.error(`❌ Greška pri sync service ${service.id}:`, error.message);
        }
      }
    }

    return true;
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('⚠️ Nije autentificiran - sync services preskočen');
    } else {
      console.error('❌ Greška pri sync services:', error.message);
    }
    return false;
  }
};

// Sync svi korisnici sa servera u lokalnu bazu (admin only)
export const syncUsersFromServer = async () => {
  try {
    if (!isOnline) {
      console.log('⚠️ Offline - preskačem sync users');
      return false;
    }

    // Provjeri je li trenutni korisnik admin
    const userData = await SecureStore.getItemAsync('userData');
    if (!userData) {
      console.log('⚠️ Nema informacije o korisniku - preskačem sync users');
      return false;
    }

    const user = JSON.parse(userData);
    if (user.uloga !== 'admin') {
      console.log('⚠️ Korisnik nije admin - preskačem sync users');
      return false;
    }

    console.log('🔄 Syncing users from server...');
    const response = await usersAPI.getAll();
    const serverUsers = response.data;
    const serverIds = serverUsers.map(u => u._id);

    // Dohvati lokalne korisnike
    const localUsers = userDB.getAll();
    const localIds = localUsers.map(u => u.id);

    // Obriši lokalne koji više ne postoje na serveru
    const deletedIds = localIds.filter(id => !serverIds.includes(id));
    for (const id of deletedIds) {
      userDB.delete(id);
      console.log(`🗑️ Obrisan lokalni korisnik ${id} (uklanjan sa servera)`);
    }

    // Bulk insert nove/ažurirane korisnike
    userDB.bulkInsert(serverUsers);
    
    console.log(`✅ Synced ${serverUsers.length} users (obrisano ${deletedIds.length})`);
    return true;
  } catch (error) {
    // Provjeri je li offline token
    const token = await SecureStore.getItemAsync('userToken');
    if (token && token.startsWith('offline_token_')) {
      console.log('⚠️ Offline korisnik - sync nije moguć (nema valjanog JWT)');
      return false;
    }

    // Ne loguj kao error ako je 401, 403 (nedostatak pristupa) ili network error
    if (error.response?.status === 401) {
      console.log('⚠️ Nije autentificiran - sync će se izvršiti nakon logina');
    } else if (error.response?.status === 403) {
      console.log('⚠️ Nemaš pristupa - samo admin može vidjeti korisnike');
    } else if (error.response?.status === 502 || error.response?.status === 503 || !error.response) {
      console.log('⚠️ Backend server trenutno nije dostupan - nastavaljam offline');
    } else {
      console.error('❌ Greška pri sync users:', error.message);
    }
    return false;
  }
};

// Sync unsynced repairs sa servera u lokalnu bazu
export const syncRepairsFromServer = async () => {
  try {
    if (!isOnline) {
      console.log('⚠️ Offline - preskačem sync repairs');
      return false;
    }

    console.log('🔄 Syncing repairs from server...');
    const response = await repairsAPI.getAll();
    const serverRepairs = response.data.data || [];
    const serverIds = serverRepairs.map(r => r._id);

    // Dohvati lokalne popravke
    const localRepairs = repairDB.getAll();
    const localIds = localRepairs.map(r => r.id);

    // Obriši lokalne koji više ne postoje na serveru (osim dummy-ja)
    const deletedIds = localIds.filter(id => !serverIds.includes(id) && !id.startsWith('dummy_'));
    for (const id of deletedIds) {
      repairDB.delete(id);
      console.log(`🗑️ Obrisana lokalna popravka ${id} (uklanjene sa servera)`);
    }

    // Bulk insert nove/ažurirane popravke
    repairDB.bulkInsert(serverRepairs);
    
    console.log(`✅ Synced ${serverRepairs.length} repairs (obrisano ${deletedIds.length})`);
    return true;
  } catch (error) {
    // Provjeri je li offline token
    const token = await SecureStore.getItemAsync('userToken');
    if (token && token.startsWith('offline_token_')) {
      console.log('⚠️ Offline korisnik - sync nije moguć (nema valjanog JWT)');
      return false;
    }

    if (error.response?.status === 401) {
      console.log('⚠️ Nije autentificiran - sync će se izvršiti nakon logina');
    } else if (error.response?.status === 502 || error.response?.status === 503 || !error.response) {
      console.log('⚠️ Backend server trenutno nije dostupan - nastavaljam offline');
    } else {
      console.error('❌ Greška pri sync repairs:', error.message);
    }
    return false;
  }
};

// Sync unsynced repairs na server
export const syncRepairsToServer = async () => {
  try {
    if (!isOnline) {
      console.log('⚠️ Offline - preskačem sync repairs');
      return false;
    }

    const unsyncedRepairs = repairDB.getUnsynced();
    
    if (unsyncedRepairs.length === 0) {
      console.log('✅ Nema unsynced repairs');
      return true;
    }

    console.log(`🔄 Syncing ${unsyncedRepairs.length} repairs to server...`);

    for (const repair of unsyncedRepairs) {
      try {
        // Skip dummy podatke (počinju sa "dummy_")
        if (repair.id.startsWith('dummy_')) {
          console.log(`⏭️ Preskačem dummy repair ${repair.id}`);
          continue;
        }

        if (repair.id.startsWith('local_')) {
          const response = await repairsAPI.create({
            elevator: repair.elevatorId,
            reportedDate: repair.reportedDate,
            status: repair.status,
            priority: repair.priority,
            faultDescription: repair.faultDescription,
            faultPhotos: JSON.parse(repair.faultPhotos || '[]'),
            repairDescription: repair.repairDescription,
            repairedDate: repair.repairedDate,
            workOrderSigned: Boolean(repair.workOrderSigned),
            repairCompleted: Boolean(repair.repairCompleted),
            notes: repair.notes,
          });
          
          const repairId = response.data.data._id;
          repairDB.markSynced(repair.id, repairId);
          console.log(`✅ Repair ${repair.id} synced → ${repairId}`);
        } else {
          await repairsAPI.update(repair.id, {
            status: repair.status,
            repairDescription: repair.repairDescription,
            repairedDate: repair.repairedDate,
            workOrderSigned: Boolean(repair.workOrderSigned),
            repairCompleted: Boolean(repair.repairCompleted),
            notes: repair.notes,
          });
          
          repairDB.markSynced(repair.id, repair.id);
          console.log(`✅ Repair ${repair.id} updated`);
        }
      } catch (error) {
        // Ignoriraj 404 za dummy podatke ili nepostojeće repairs
        if (error.response?.status === 404) {
          console.log(`⏭️ Repair ${repair.id} ne postoji na serveru - preskačem`);
        } else {
          console.error(`❌ Greška pri sync repair ${repair.id}:`, error.message);
        }
      }
    }

    return true;
  } catch (error) {
    if (error.response?.status === 401) {
      console.log('⚠️ Nije autentificiran - sync repairs preskočen');
    } else {
      console.error('❌ Greška pri sync repairs:', error.message);
    }
    return false;
  }
};

// Sync SVE (poziva se automatski svakih 30s ako si online)
export const syncAll = async () => {
  const online = await checkOnlineStatus();
  
  if (!online) {
    console.log('⚠️ Offline - preskačem sync');
    return false;
  }

  // Provjeri je li offline token (demo korisnik)
  const token = await SecureStore.getItemAsync('userToken');
  console.log('🔐 syncAll: Token check', {
    exists: !!token,
    type: token ? (token.startsWith('offline_token_') ? 'OFFLINE' : 'ONLINE') : 'NONE'
  });
  
  if (!token) {
    console.warn('⚠️ Token nije dostupan pri sync-u - čekam...');
    // Čekaj 500ms i pokušaj opet
    await new Promise(resolve => setTimeout(resolve, 500));
    const retryToken = await SecureStore.getItemAsync('userToken');
    if (!retryToken) {
      console.error('❌ Token nije dostupan ni nakon čekanja - sync otkazan');
      return false;
    }
  }
  
  if (token && token.startsWith('offline_token_')) {
    console.log('⚠️ Offline korisnik - sync nije moguć (nema valjanog JWT)');
    return false;
  }

  console.log('🔄 Starting full sync...');
  
  try {
    // 1. Sync elevatori sa servera (GET) - uključujući brisanje
    await syncElevatorsFromServer();
    
    // 2. Sync servici sa servera (GET) - uključujući brisanje
    await syncServicesFromServer();
    
    // 3. Sync popravci sa servera (GET) - uključujući brisanje
    await syncRepairsFromServer();

    // 4. Sync korisnici sa servera (GET) - admin only
    await syncUsersFromServer();
    
    // 5. Sync unsynced servici na server (POST/PUT)
    await syncServicesToServer();
    
    // 6. Sync unsynced popravci na server (POST/PUT)
    await syncRepairsToServer();
    
    console.log('✅ Full sync completed');
    return true;
  } catch (error) {
    console.error('❌ Greška pri full sync:', error.message);
    return false;
  }
};

// Pokreni automatski sync svakih 30 sekundi
export const startAutoSync = () => {
  if (syncInterval) {
    return; // Već pokrenut
  }

  console.log('🔄 Auto-sync pokrenut (5 minuta interval)');
  
  syncInterval = setInterval(async () => {
    const online = await checkOnlineStatus();
    if (online) {
      syncAll();
    }
  }, 5 * 60 * 1000); // 5 minuta - smanjuje potrošnju baterije
};

// Zaustavi auto-sync
export const stopAutoSync = () => {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('⏸️ Auto-sync zaustavljen');
  }
};

// Export funkcije
export default {
  checkOnlineStatus,
  subscribeToNetworkChanges,
  syncElevatorsFromServer,
  syncServicesFromServer,
  syncUsersFromServer,
  syncRepairsFromServer,
  syncServicesToServer,
  syncRepairsToServer,
  syncAll,
  startAutoSync,
  stopAutoSync,
};

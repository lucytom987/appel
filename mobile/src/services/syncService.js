import NetInfo from '@react-native-community/netinfo';
import * as SecureStore from 'expo-secure-store';
import { elevatorsAPI, servicesAPI, repairsAPI, messagesAPI, usersAPI } from './api';
import { elevatorDB, serviceDB, repairDB, messageDB, userDB, syncQueue } from '../database/db';
import { mergeRecords } from './conflictResolver';

let isOnline = false;
let syncInterval = null;
let syncInProgress = false; // sprječava paralelne syncAll pozive

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
    const rawServerElevators = response.data.data;
    
    // Normaliziraj server records
    const serverElevators = rawServerElevators.map(e => ({
      id: e._id,
      brojUgovora: e.brojUgovora,
      nazivStranke: e.nazivStranke,
      ulica: e.ulica,
      mjesto: e.mjesto,
      brojDizala: e.brojDizala,
      kontaktOsoba: e.kontaktOsoba,
      koordinate: e.koordinate || { latitude: 0, longitude: 0 },
      status: e.status || 'aktivan',
      intervalServisa: e.intervalServisa || 1,
      zadnjiServis: e.zadnjiServis,
      sljedeciServis: e.sljedeciServis,
      napomene: e.napomene || '',
      updated_at: new Date(e.updatedAt || e.azuriranDatum || Date.now()).getTime(),
    }));

    // Dohvati lokalne elevatore
    const localElevators = elevatorDB.getAll();
    
    // 🔧 CONFLICT RESOLUTION - koristi mergeRecords
    const { toUpdate, toDelete, conflicts } = mergeRecords(localElevators, serverElevators, 'id');
    
    console.log(`🔍 Merge rezultat: ${toUpdate.length} za update, ${toDelete.length} za brisanje, ${conflicts.length} konflikti`);
    
    // Obriši lokalne zapise koji ne postoje na serveru
    toDelete.forEach(id => {
      elevatorDB.delete(id);
      console.log(`🗑️ Obrisano lokalno dizalo ${id} (uklonjena sa servera)`);
    });

    // Ažuriraj/insert sa server verzijom
    toUpdate.forEach(elevator => {
      try {
        const existing = elevatorDB.getById(elevator.id);
        if (existing) {
          elevatorDB.update(elevator.id, elevator);
          console.log(`🔄 Updated elevator ${elevator.id} (server verzija novija)`);
        } else {
          elevatorDB.insert(elevator);
          console.log(`➕ Inserted novi elevator ${elevator.id} sa servera`);
        }
      } catch (e) {
        console.log(`⚠️ Greška pri update dizala ${elevator.id}:`, e.message);
      }
    });
    
    // Log konflikte
    if (conflicts.length > 0) {
      console.log(`⚠️ ${conflicts.length} konflikti pronađeni - koristim server verziju`);
      conflicts.forEach(c => {
        console.log(`  - Elevator ${c.local.id}: ${c.message}`);
      });
    }
    
    console.log(`✅ Synced ${toUpdate.length} elevators (obrisano ${toDelete.length}, konflikti ${conflicts.length})`);
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
    const rawServerServices = response.data.data || [];
    
    // Normaliziraj server records
    const serverServices = rawServerServices.map(s => {
      const serviserObj = s.serviserID;
      let serviserID = serviserObj;
      if (serviserObj && typeof serviserObj === 'object') {
        const ime = serviserObj.ime || serviserObj.firstName || '';
        const prezime = serviserObj.prezime || serviserObj.lastName || '';
        const full = `${ime} ${prezime}`.trim();
        serviserID = full || (serviserObj._id || '');
      }
      let elevatorId = s.elevatorId;
      if (elevatorId && typeof elevatorId === 'object') {
        elevatorId = elevatorId._id || elevatorId.id || '';
      }
      return {
        id: s._id,
        elevatorId,
        serviserID,
        datum: s.datum || s.serviceDate,
        checklist: s.checklist || [],
        imaNedostataka: s.imaNedostataka || false,
        nedostaci: s.nedostaci || [],
        napomene: s.napomene || s.notes || '',
        sljedeciServis: s.sljedeciServis || s.nextServiceDate || null,
        kreiranDatum: s.kreiranDatum || s.createdAt || new Date().toISOString(),
        azuriranDatum: s.azuriranDatum || s.updatedAt || new Date().toISOString(),
        updated_at: new Date(s.updatedAt || s.azuriranDatum || Date.now()).getTime(),
      };
    });

    // Dohvati lokalne servise
    const localServices = serviceDB.getAll();
    
    // 🔧 CONFLICT RESOLUTION - koristi mergeRecords
    const { toUpdate, toDelete, conflicts } = mergeRecords(localServices, serverServices, 'id');
    
    console.log(`🔍 Merge rezultat: ${toUpdate.length} za update, ${toDelete.length} za brisanje, ${conflicts.length} konflikti`);
    
    // Obriši lokalne zapise koji ne postoje na serveru
    toDelete.forEach(id => {
      serviceDB.delete(id);
      console.log(`🗑️ Obrisana lokalna usluga ${id} (uklonjena sa servera)`);
    });

    // Ažuriraj/insert sa server verzijom (conflict resolution odlučio)
    toUpdate.forEach(service => {
      try {
        // Pokušaj update prvo, ako ne postoji onda insert
        const existing = serviceDB.getById(service.id);
        if (existing) {
          serviceDB.update(service.id, service);
          console.log(`🔄 Updated service ${service.id} (server verzija novija)`);
        } else {
          serviceDB.insert(service);
          console.log(`➕ Inserted novi service ${service.id} sa servera`);
        }
        serviceDB.markSynced(service.id, service.id);
      } catch (e) {
        console.log(`⚠️ Greška pri update servisa ${service.id}:`, e.message);
      }
    });
    
    // Log konflikte (za sad ih nismo resolution-ali s UI dialogom, već smo odabrali server verziju)
    if (conflicts.length > 0) {
      console.log(`⚠️ ${conflicts.length} konflikti pronađeni - koristim server verziju`);
      conflicts.forEach(c => {
        console.log(`  - Service ${c.local.id}: ${c.message}`);
      });
    }
    
    console.log(`✅ Synced ${toUpdate.length} services (obrisano ${toDelete.length}, konflikti ${conflicts.length})`);
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
            elevatorId: service.elevatorId,
            datum: service.datum || service.serviceDate,
            checklist: service.checklist || [],
            imaNedostataka: Boolean(service.imaNedostataka || service.defectsFound),
            nedostaci: service.nedostaci || [],
            napomene: service.napomene || service.notes,
            sljedeciServis: service.sljedeciServis || service.nextServiceDate,
            serviserID: service.serviserID,
          });
          
          // Označi kao synced i ažuriraj sa server ID-om
          const serverId = response.data.data._id;
          serviceDB.markSynced(service.id, serverId);
          console.log(`✅ Service ${service.id} synced → ${serverId}`);
        } else {
          // Postojeći servis - PUT
          await servicesAPI.update(service.id, {
            datum: service.datum || service.serviceDate,
            checklist: service.checklist || [],
            imaNedostataka: Boolean(service.imaNedostataka || service.defectsFound),
            nedostaci: service.nedostaci || [],
            napomene: service.napomene || service.notes,
            sljedeciServis: service.sljedeciServis || service.nextServiceDate,
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
    const rawServerRepairs = response.data.data || [];
    
    // Normaliziraj server records
    const serverRepairs = rawServerRepairs.map(r => ({
      id: r._id,
      elevatorId: typeof r.elevatorId === 'object' ? (r.elevatorId._id || r.elevatorId.id) : r.elevatorId,
      serviserID: typeof r.serviserID === 'object' ? (r.serviserID._id || r.serviserID.id) : r.serviserID,
      datumPrijave: r.datumPrijave || r.reportDate,
      datumPopravka: r.datumPopravka || r.repairDate,
      opisKvara: r.opisKvara || r.faultDescription,
      opisPopravka: r.opisPopravka || r.repairDescription,
      status: r.status || 'čekanje',
      radniNalogPotpisan: r.radniNalogPotpisan || false,
      popravkaUPotpunosti: r.popravkaUPotpunosti || false,
      napomene: r.napomene || r.notes || '',
      kreiranDatum: r.kreiranDatum || r.createdAt || new Date().toISOString(),
      azuriranDatum: r.azuriranDatum || r.updatedAt || new Date().toISOString(),
      updated_at: new Date(r.updatedAt || r.azuriranDatum || Date.now()).getTime(),
    }));

    // Dohvati lokalne popravke
    const localRepairs = repairDB.getAll();
    
    // 🔧 CONFLICT RESOLUTION - koristi mergeRecords
    const { toUpdate, toDelete, conflicts } = mergeRecords(localRepairs, serverRepairs, 'id');
    
    console.log(`🔍 Merge rezultat: ${toUpdate.length} za update, ${toDelete.length} za brisanje, ${conflicts.length} konflikti`);
    
    // Obriši lokalne zapise koji ne postoje na serveru
    toDelete.forEach(id => {
      repairDB.delete(id);
      console.log(`🗑️ Obrisana lokalna popravka ${id} (uklonjena sa servera)`);
    });

    // Ažuriraj/insert sa server verzijom (conflict resolution odlučio)
    toUpdate.forEach(repair => {
      try {
        const existing = repairDB.getById(repair.id);
        if (existing) {
          repairDB.update(repair.id, repair);
          console.log(`🔄 Updated repair ${repair.id} (server verzija novija)`);
        } else {
          repairDB.insert(repair);
          console.log(`➕ Inserted novi repair ${repair.id} sa servera`);
        }
        repairDB.markSynced(repair.id, repair.id);
      } catch (e) {
        console.log(`⚠️ Greška pri update popravka ${repair.id}:`, e.message);
      }
    });
    
    // Log konflikte
    if (conflicts.length > 0) {
      console.log(`⚠️ ${conflicts.length} konflikti pronađeni - koristim server verziju`);
      conflicts.forEach(c => {
        console.log(`  - Repair ${c.local.id}: ${c.message}`);
      });
    }
    
    console.log(`✅ Synced ${toUpdate.length} repairs (obrisano ${toDelete.length}, konflikti ${conflicts.length})`);
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
  if (syncInProgress) {
    console.log('⏳ Sync već u tijeku - preskačem novi poziv');
    return false;
  }
  syncInProgress = true;
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

  // Dijagnostika: broj unsynced prije sync-a
  try {
    const preUnsyncedServices = serviceDB.getUnsynced().length;
    const preUnsyncedRepairs = repairDB.getUnsynced().length;
    console.log(`🧪 Pre-sync status: services_unsynced=${preUnsyncedServices}, repairs_unsynced=${preUnsyncedRepairs}`);
  } catch (e) {
    console.log('⚠️ Pre-sync dijagnostika nije uspjela:', e.message);
  }

  console.log('🔄 Starting full sync...');
  
  try {
    // 1. Prvo uploadaj nove servise i popravke na server (POST/PUT)
    await syncServicesToServer();
    await syncRepairsToServer();
    
    // 2. Sync elevatori sa servera (GET) - uključujući brisanje
    await syncElevatorsFromServer();
    
    // 3. Sync servici sa servera (GET) - uključujući brisanje
    await syncServicesFromServer();
    
    // 4. Sync popravci sa servera (GET) - uključujući brisanje
    await syncRepairsFromServer();

    // 5. Sync korisnici sa servera (GET) - admin only
    await syncUsersFromServer();
    
    // Dijagnostika: broj unsynced nakon sync-a
    try {
      const postUnsyncedServices = serviceDB.getUnsynced().length;
      const postUnsyncedRepairs = repairDB.getUnsynced().length;
      console.log(`🧪 Post-sync status: services_unsynced=${postUnsyncedServices}, repairs_unsynced=${postUnsyncedRepairs}`);
    } catch (e) {
      console.log('⚠️ Post-sync dijagnostika nije uspjela:', e.message);
    }

    console.log('✅ Full sync completed');
    syncInProgress = false;
    return true;
  } catch (error) {
    console.error('❌ Greška pri full sync:', error.message);
    syncInProgress = false;
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

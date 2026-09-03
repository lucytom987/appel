import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';
import { serviceDB, elevatorDB, userDB, repairDB } from '../database/db';
import { servicesAPI, serviceWorkOrdersAPI, usersAPI, repairsAPI } from '../services/api';
import { usePhotoUpload } from '../hooks/usePhotoUpload';
import ms from '../utils/scale';
import { applyUserPickerFilter } from '../utils/userPickerFilters';
import { formatElevatorLabel } from '../utils/elevatorLabel';

const wait = (msDelay) => new Promise((resolve) => setTimeout(resolve, msDelay));

const isTransientRequestError = (err) => {
  if (!err) return false;
  if (err.queued) return false; // već je queue-ano u interceptoru

  const status = Number(err.status || err.response?.status || 0);
  if (status >= 500) return true;

  const message = String(err.message || '').toLowerCase();
  return message.includes('network') || message.includes('timeout') || message.includes('socket');
};

export default function AddServiceScreen({ navigation, route }) {
  const { elevator } = route.params || {};
  const insets = useSafeAreaInsets();
  if (!elevator) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#1f2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Novi servis</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ padding:20 }}>
          <Text style={{ fontSize:16, color:'#6b7280' }}>Dizalo je obrisano ili nedostupno. Vratite se i odaberite drugo.</Text>
        </View>
      </View>
    );
  }
  const { user, isOnline, serverAwake } = useAuth();
  const [isOfflineDemo, setIsOfflineDemo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeDateField, setActiveDateField] = useState('serviceDate');
  const [applyToAll, setApplyToAll] = useState(false);
  const [includeElevators, setIncludeElevators] = useState({});
  const [perElevatorChecklist, setPerElevatorChecklist] = useState({});
  const [perElevatorTrebaloBi, setPerElevatorTrebaloBi] = useState({});
  const [korisnici, setKorisnici] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showKolege, setShowKolege] = useState(false);
  const requestSessionIdRef = useRef(`svcSession_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);

  // Konvertiraj isOnline u boolean i traži backend da je budan
  const online = Boolean(isOnline && serverAwake);

  React.useEffect(() => {
    (async () => {
      const token = await SecureStore.getItemAsync('userToken');
      setIsOfflineDemo(Boolean(token && token.startsWith('offline_token_')));
    })();
  }, []);

  React.useEffect(() => {
    const fetchUsers = async () => {
      const filterOutCurrent = (arr = []) => applyUserPickerFilter(arr, {
        currentUserId: user?._id || user?.id,
        requireActiveAccount: true,
      });

      // Prikaži lokalni cache odmah da "Dodaj kolegu" ne bude blokiran spinnerom.
      const localUsers = filterOutCurrent(userDB.getAll());
      setKorisnici(localUsers);

      if (!online) {
        setLoadingUsers(false);
        return;
      }

      // Spinner samo ako nemamo ništa u cacheu.
      setLoadingUsers(localUsers.length === 0);

      try {
        const res = await usersAPI.getLiteCached();
        const data = res.data?.data || res.data || [];
        const filtered = filterOutCurrent(data);
        try {
          userDB.bulkInsert(filtered);
        } catch (cacheErr) {
          console.log('Cache users failed', cacheErr?.message);
        }
        setKorisnici(filtered);
      } catch (e) {
        console.log('Load users failed', e?.message);
        // Zadrži već prikazane lokalne korisnike
      } finally {
        setLoadingUsers(false);
      }
    };
    fetchUsers();
  }, [online, user]);

  const elevatorsOnAddress = React.useMemo(() => {
    const all = elevatorDB.getAll() || [];
    const street = (elevator?.ulica || '').trim().toLowerCase();
    const city = (elevator?.mjesto || '').trim().toLowerCase();
    return all.filter((e) =>
      (e.ulica || '').trim().toLowerCase() === street &&
      (e.mjesto || '').trim().toLowerCase() === city
    );
  }, [elevator]);

  // Ako ima više dizala na adresi, uključi applyToAll by default
  React.useEffect(() => {
    if (elevatorsOnAddress.length > 1) {
      setApplyToAll(true);
    } else {
      setApplyToAll(false);
    }
    // inicijalno uključi sva dizala i setiraj prazne checkliste
    const initInclude = {};
    const initChecklist = {};
    const initTrebaloBi = {};
    elevatorsOnAddress.forEach((e) => {
      initInclude[e._id || e.id] = true;
      initChecklist[e._id || e.id] = {
        lubrication: false,
        upsCheck: false,
        upsStatus: null,
        voiceComm: false,
        voiceCommStatus: null,
        shaftCleaning: false,
        driveCheck: false,
        brakeCheck: false,
        cableInspection: false,
      };
      initTrebaloBi[e._id || e.id] = {
        enabled: false,
        text: '',
      };
    });
    setIncludeElevators(initInclude);
    setPerElevatorChecklist(initChecklist);
    setPerElevatorTrebaloBi(initTrebaloBi);
  }, [elevatorsOnAddress]);

  // Izračunaj interval servisa u mjesecima (default 1 ako nije postavljen)
  const intervalMjeseci = typeof elevator.intervalServisa === 'number' && elevator.intervalServisa > 0
    ? elevator.intervalServisa
    : 1;

  const [formData, setFormData] = useState({
    serviceDate: new Date(),
    utroseniMaterijal: '',
    nextServiceDate: (() => {
      const d = new Date();
      d.setMonth(d.getMonth() + intervalMjeseci);
      return d;
    })(),
    kolegaId: null,
  });

  // Photo upload hook
  const { pickAndUploadPhoto, takePhotoWithCamera, uploading: uploadingPhoto, error: photoError, clearError } = usePhotoUpload();
  const [notePhotos, setNotePhotos] = useState([]);

  const baseChecklist = {
    lubrication: false,
    upsCheck: false,
    upsStatus: null,
    voiceComm: false,
    voiceCommStatus: null,
    shaftCleaning: false,
    driveCheck: false,
    brakeCheck: false,
    cableInspection: false,
  };

  const checklistItems = [
    { key: 'lubrication', label: 'Podmazivanje' },
    { key: 'upsCheck', label: 'Provjera UPS-a' },
    { key: 'voiceComm', label: 'Govorna veza' },
    { key: 'shaftCleaning', label: 'Čišćenje šahta' },
    { key: 'driveCheck', label: 'Provjera pog. stroja' },
    { key: 'brakeCheck', label: 'Provjera kočnice' },
    { key: 'cableInspection', label: 'Inspekcija užeta' },
  ];

  const toggleChecklistItem = (elevatorId, key) => {
    setPerElevatorChecklist((prev) => ({
      ...prev,
      [elevatorId]: (() => {
        const nextState = {
          ...(prev[elevatorId] || baseChecklist),
        };

        if (key === 'upsCheck') {
          const currentStatus = nextState.upsStatus || null;
          const nextStatus = currentStatus === null
            ? 'radi'
            : currentStatus === 'radi'
              ? 'ne_radi'
              : null;
          nextState.upsStatus = nextStatus;
          nextState.upsCheck = Boolean(nextStatus);
          return nextState;
        }

        if (key === 'voiceComm') {
          const currentStatus = nextState.voiceCommStatus || null;
          const nextStatus = currentStatus === null
            ? 'radi'
            : currentStatus === 'radi'
              ? 'ne_radi'
              : null;
          nextState.voiceCommStatus = nextStatus;
          nextState.voiceComm = Boolean(nextStatus);
          return nextState;
        }

        nextState[key] = !(prev[elevatorId]?.[key]);
        return nextState;
      })()
    }));
  };

  const handleDateChange = (event, selectedDate, field) => {
    setShowDatePicker(false);
    if (selectedDate) {
      if (field === 'serviceDate') {
        // Automatski izračunaj sljedeći servis na temelju intervala
        const next = new Date(selectedDate);
        next.setMonth(next.getMonth() + intervalMjeseci);
        setFormData(prev => ({
          ...prev,
          serviceDate: selectedDate,
          nextServiceDate: next
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          [field]: selectedDate
        }));
      }
    }
  };

  const toggleIncludeElevator = (elevatorId) => {
    setIncludeElevators((prev) => ({
      ...prev,
      [elevatorId]: prev[elevatorId] === false,
    }));
  };

  const toggleTrebaloBiForElevator = (elevatorId) => {
    setPerElevatorTrebaloBi((prev) => {
      const current = prev[elevatorId] || { enabled: false, text: '' };
      return {
        ...prev,
        [elevatorId]: {
          ...current,
          enabled: !current.enabled,
        },
      };
    });
  };

  const setTrebaloBiTextForElevator = (elevatorId, text) => {
    setPerElevatorTrebaloBi((prev) => {
      const current = prev[elevatorId] || { enabled: false, text: '' };
      return {
        ...prev,
        [elevatorId]: {
          ...current,
          text,
        },
      };
    });
  };

  // Funkcija koja pronalazi duplikate servisa na adresi za isti datum
  const findDuplicateServices = () => {
    const serviceDate = formData.serviceDate.toISOString().split('T')[0]; // DD-MM-YYYY format
    const allServices = serviceDB.getAll() || [];
    
    const duplicates = allServices.filter(service => {
      const svcDate = new Date(service.datum).toISOString().split('T')[0];
      if (svcDate !== serviceDate) return false;
      
      // Pronađi dizalo
      const svcElevator = elevatorDB.getById(service.elevatorId);
      if (!svcElevator) return false;
      
      // Provjeri je li na istoj adresi
      const svcStreet = (svcElevator.ulica || '').trim().toLowerCase();
      const svcCity = (svcElevator.mjesto || '').trim().toLowerCase();
      const currentStreet = (elevator.ulica || '').trim().toLowerCase();
      const currentCity = (elevator.mjesto || '').trim().toLowerCase();
      
      return svcStreet === currentStreet && svcCity === currentCity;
    });
    
    return duplicates;
  };

  const handleSubmit = async () => {
    // Provjeri duplikate prije slanja
    setLoading(true);
    const duplicates = findDuplicateServices();
    if (duplicates.length > 0) {
      Alert.alert(
        'Duplikati servisa detektirani',
        `Na adresi ${elevator.ulica}, ${elevator.mjesto} već postoji ${duplicates.length} servis(a) za datum ${formData.serviceDate.toLocaleDateString('hr-HR')}.\n\nDa li želite:\n1) Nastaviti i dodati novi\n2) Vidjeti postojeće servise`,
        [
          {
            text: 'Otkaži',
            style: 'cancel',
            onPress: () => setLoading(false)
          },
          {
            text: 'Vidi servise',
            onPress: () => {
              setLoading(false);
              navigation.navigate('Services');
            }
          },
          {
            text: 'Nastavi',
            style: 'destructive',
            onPress: () => {
              proceedWithSubmit();
            }
          }
        ]
      );
      return;
    }
    
    proceedWithSubmit();
  };

  const proceedWithSubmit = async () => {
    // Nema obaveznog opisa – redovni servis

    try {
      const targetsAll = applyToAll && elevatorsOnAddress.length > 1 ? elevatorsOnAddress : [elevator];
      const targets = targetsAll.filter((t) => includeElevators[t._id || t.id] !== false);
      if (!targets.length) {
        throw new Error('Odaberite barem jedno dizalo');
      }

      let successCount = 0;
      let failCount = 0;
      let queuedCount = 0;
      let trebaloBiCount = 0;
      let trebaloBiLocalCount = 0;

      const buildChecklistPayload = (cid) => {
        const state = perElevatorChecklist[cid] || baseChecklist;
        return [
          { stavka: 'lubrication', provjereno: state.lubrication ? 1 : 0, napomena: '' },
          { stavka: 'ups_check', provjereno: state.upsCheck ? 1 : 0, napomena: state.upsCheck && state.upsStatus ? state.upsStatus : '' },
          { stavka: 'voice_comm', provjereno: state.voiceComm ? 1 : 0, napomena: state.voiceComm && state.voiceCommStatus ? state.voiceCommStatus : '' },
          { stavka: 'shaft_cleaning', provjereno: state.shaftCleaning ? 1 : 0, napomena: '' },
          { stavka: 'drive_check', provjereno: state.driveCheck ? 1 : 0, napomena: '' },
          { stavka: 'brake_check', provjereno: state.brakeCheck ? 1 : 0, napomena: '' },
          { stavka: 'cable_inspection', provjereno: state.cableInspection ? 1 : 0, napomena: '' },
        ];
      };

      const serviceDataBase = {
        serviserID: user._id,
        datum: formData.serviceDate.toISOString(),
        napomene: '',
        utroseniMaterijal: formData.utroseniMaterijal,
        imaNedostataka: false,
        nedostaci: [],
        sljedeciServis: formData.nextServiceDate.toISOString(),
        dodatniServiseri: formData.kolegaId ? [formData.kolegaId] : [],
        notePhotos: notePhotos,
      };

      const buildServicePayload = (target) => {
        const targetId = target._id || target.id;
        const serviceDateKey = (formData.serviceDate instanceof Date
          ? formData.serviceDate.toISOString().split('T')[0]
          : String(formData.serviceDate || '').split('T')[0]) || 'no_date';
        const clientRequestId = `${requestSessionIdRef.current}_${String(targetId)}_${serviceDateKey}`;

        return {
          ...serviceDataBase,
          checklist: buildChecklistPayload(targetId),
          elevatorId: targetId,
          clientRequestId,
        };
      };

      const buildTrebaloBiPayload = (target) => {
        const targetId = target._id || target.id;
        const cfg = perElevatorTrebaloBi[targetId] || { enabled: false, text: '' };
        const note = String(cfg.text || '').trim();
        if (!cfg.enabled || !note) return null;

        const reporterName = `${user?.ime || user?.firstName || ''} ${user?.prezime || user?.lastName || ''}`.trim()
          || user?.name
          || '';

        return {
          elevatorId: targetId,
          serviserID: user?._id || user?.id,
          datumPrijave: new Date().toISOString(),
          datumPopravka: null,
          opisKvara: note,
          opisPopravka: '',
          status: 'pending',
          radniNalogPotpisan: false,
          popravkaUPotpunosti: false,
          napomene: '',
          prijavio: reporterName,
          primioPoziv: reporterName,
          trebaloBi: true,
        };
      };

      // Provjeri je li offline korisnik (demo korisnik)
      const token = await SecureStore.getItemAsync('userToken');
      const isOfflineUser = token && token.startsWith('offline_token_');

      if (isOfflineUser || !online) {
        console.log('📱 Demo/offline korisnik - dodajem servise lokalno bez API poziva');
        targets.forEach((target, idx) => {
          const localId = 'local_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substr(2, 9);
          const payload = buildServicePayload(target);
          serviceDB.insert({ id: localId, ...payload, synced: 0 });

          const trebaloBiPayload = buildTrebaloBiPayload(target);
          if (trebaloBiPayload) {
            const localRepairId = `local_trebalo_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 9)}`;
            repairDB.insert({ id: localRepairId, ...trebaloBiPayload, synced: 0 });
            trebaloBiLocalCount++;
          }

          try {
            const elev = elevatorDB.getById(target._id || target.id);
            if (elev) {
              elevatorDB.update(elev.id, { ...elev, zadnjiServis: payload.datum, sljedeciServis: payload.sljedeciServis });
            }
          } catch {}
          successCount++;
        });

        const extra = trebaloBiLocalCount > 0
          ? `\nDodano "trebalo bi" stavki: ${trebaloBiLocalCount} (lokalno).`
          : '';
        Alert.alert('Uspjeh', `Servisi dodani lokalno za ${successCount}/${targets.length} dizala (sinkronizacija kad budete online)${extra}`, [
          { text: 'OK', onPress: () => navigation.navigate('Home') }
        ]);
      } else {
        const createdOnlineServiceIds = [];
        const payloads = targets.map((target) => buildServicePayload(target));
        const payloadByRequestId = payloads.reduce((acc, payload) => {
          if (payload.clientRequestId) {
            acc[payload.clientRequestId] = payload;
          }
          return acc;
        }, {});

        const upsertLocalServiceFromServer = (created, fallbackPayload) => {
          const createdId = created?._id || created?.id;
          const payload = payloadByRequestId[created?.clientRequestId] || fallbackPayload;
          if (!createdId || !payload) return null;

          serviceDB.insert({
            id: createdId,
            elevatorId: created.elevatorId || created.elevator || payload.elevatorId,
            serviserID: created.serviserID || created.performedBy || payload.serviserID,
            dodatniServiseri: created.dodatniServiseri || payload.dodatniServiseri || [],
            datum: created.datum || created.serviceDate || payload.datum,
            checklist: created.checklist || payload.checklist,
            imaNedostataka: created.imaNedostataka ?? payload.imaNedostataka,
            nedostaci: created.nedostaci || payload.nedostaci,
            notePhotos: created.notePhotos || payload.notePhotos || [],
            napomene: created.napomene ?? created.notes ?? payload.napomene,
            utroseniMaterijal: created.utroseniMaterijal ?? payload.utroseniMaterijal,
            sljedeciServis: created.sljedeciServis || created.nextServiceDate || payload.sljedeciServis,
            kreiranDatum: created.kreiranDatum || new Date().toISOString(),
            azuriranDatum: created.azuriranDatum || new Date().toISOString(),
            synced: 1,
          });

          return String(createdId);
        };

        const createServiceOnlineWithRetry = async (payload, maxAttempts = 3) => {
          let lastErr;
          for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
              return await servicesAPI.create(payload);
            } catch (err) {
              lastErr = err;
              if (!isTransientRequestError(err) || attempt === maxAttempts) {
                throw err;
              }
              // Kratki backoff smanjuje šansu da batch zapne na Render cold-startu / kratkom dropu mreže
              await wait(500 * attempt);
            }
          }
          throw lastErr;
        };

        const createServicesBatchWithRetry = async (items, maxAttempts = 2) => {
          let lastErr;
          for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
              return await servicesAPI.createBatch(items);
            } catch (err) {
              lastErr = err;
              if (!isTransientRequestError(err) || attempt === maxAttempts) {
                throw err;
              }
              await wait(700 * attempt);
            }
          }
          throw lastErr;
        };

        let batchHandled = false;
        const batchCreatedRequestIds = new Set();
        if (payloads.length > 1) {
          try {
            const batchResponse = await createServicesBatchWithRetry(payloads);
            const batchItems = batchResponse?.data?.data || [];
            batchItems.forEach((created) => {
              if (created?.clientRequestId) {
                batchCreatedRequestIds.add(String(created.clientRequestId));
              }
              const insertedId = upsertLocalServiceFromServer(created);
              if (insertedId) {
                createdOnlineServiceIds.push(insertedId);
                successCount += 1;
              }
            });
            batchHandled = batchItems.length > 0;
          } catch (batchErr) {
            console.log('Batch create fallback to single requests:', batchErr?.message || batchErr);
          }
        }

        for (let idx = 0; idx < targets.length; idx += 1) {
          const target = targets[idx];
          const payload = payloads[idx];
          const trebaloBiPayload = buildTrebaloBiPayload(target);

          const payloadReqId = String(payload?.clientRequestId || '');
          const needsSingleCreate = !batchHandled || !batchCreatedRequestIds.has(payloadReqId);

          if (needsSingleCreate) {
          try {
            const response = await createServiceOnlineWithRetry(payload);
            const created = response.data?.data || response.data;
            const insertedId = upsertLocalServiceFromServer(created, payload);
            if (insertedId) createdOnlineServiceIds.push(insertedId);

            if (trebaloBiPayload) {
              try {
                const repairRes = await repairsAPI.create(trebaloBiPayload);
                const createdRepair = repairRes?.data?.data || repairRes?.data || {};
                repairDB.insert({
                  id: createdRepair._id || createdRepair.id,
                  ...createdRepair,
                  trebaloBi: true,
                  synced: 1,
                });
                trebaloBiCount++;
              } catch (trebaloErr) {
                console.log('Trebalo bi online create failed, saving local:', trebaloErr?.message || trebaloErr);
                const localRepairId = `local_trebalo_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 9)}`;
                repairDB.insert({ id: localRepairId, ...trebaloBiPayload, synced: 0 });
                trebaloBiLocalCount++;
              }
            }

            try {
              const elev = elevatorDB.getById(payload.elevatorId);
              if (elev) {
                elevatorDB.update(elev.id, { ...elev, zadnjiServis: payload.datum, sljedeciServis: payload.sljedeciServis });
              }
            } catch {}

            successCount++;
          } catch (error) {
            console.error('Greška pri slanju na backend:', error);
            if (error.response?.status === 401) {
              throw new Error('Vaša prijava je istekla. Molim prijavite se ponovno.');
            }
            if (error.queued) {
              queuedCount++;
              continue;
            }
            const localId = 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            serviceDB.insert({ id: localId, ...payload, synced: 0 });
            if (trebaloBiPayload) {
              const localRepairId = `local_trebalo_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 9)}`;
              repairDB.insert({ id: localRepairId, ...trebaloBiPayload, synced: 0 });
              trebaloBiLocalCount++;
            }
            try {
              const elev = elevatorDB.getById(payload.elevatorId);
              if (elev) {
                elevatorDB.update(elev.id, { ...elev, zadnjiServis: payload.datum, sljedeciServis: payload.sljedeciServis });
              }
            } catch {}
            failCount++;
          }
          }

          if (batchHandled && trebaloBiPayload) {
            try {
              const repairRes = await repairsAPI.create(trebaloBiPayload);
              const createdRepair = repairRes?.data?.data || repairRes?.data || {};
              repairDB.insert({
                id: createdRepair._id || createdRepair.id,
                ...createdRepair,
                trebaloBi: true,
                synced: 1,
              });
              trebaloBiCount++;
            } catch (trebaloErr) {
              if (trebaloErr?.queued) {
                queuedCount++;
                continue;
              }
              console.log('Trebalo bi online create failed, saving local:', trebaloErr?.message || trebaloErr);
              const localRepairId = `local_trebalo_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 9)}`;
              repairDB.insert({ id: localRepairId, ...trebaloBiPayload, synced: 0 });
              trebaloBiLocalCount++;
            }
          }

          if (batchHandled) {
            try {
              const elev = elevatorDB.getById(payload.elevatorId);
              if (elev) {
                elevatorDB.update(elev.id, { ...elev, zadnjiServis: payload.datum, sljedeciServis: payload.sljedeciServis });
              }
            } catch {}
          }
        }

        const baseTitle = failCount === 0 ? 'Uspjeh' : 'Djelomični uspjeh';
        const serviceMessage = failCount === 0
          ? `Servisi logirani za ${successCount}/${targets.length} dizala.`
          : `Logirano ${successCount}/${targets.length}, ${failCount} spremljeno lokalno (sync kasnije).`;
        const queuedMessage = queuedCount > 0
          ? `\nU queue dodano: ${queuedCount} zahtjeva.`
          : '';
        const trebaloMessage = (trebaloBiCount || trebaloBiLocalCount)
          ? `\n"Trebalo bi" stavke: online ${trebaloBiCount}, lokalno ${trebaloBiLocalCount}.`
          : '';
        const baseMessage = `${serviceMessage}${queuedMessage}${trebaloMessage}`;

        if (createdOnlineServiceIds.length === 1) {
          const serviceIdForWorkOrder = createdOnlineServiceIds[0];
          Alert.alert(
            baseTitle,
            `${baseMessage}\n\nŽelite li odmah generirati radni nalog servisa?`,
            [
              { text: 'Kasnije', style: 'cancel', onPress: () => navigation.navigate('Home') },
              {
                text: 'Generiraj',
                onPress: async () => {
                  try {
                    await serviceWorkOrdersAPI.createFromService(serviceIdForWorkOrder);
                    Alert.alert('Radni nalog kreiran', 'Draft radni nalog servisa je kreiran.', [
                      { text: 'OK', onPress: () => navigation.navigate('Home') },
                    ]);
                  } catch (woErr) {
                    Alert.alert('Greška', woErr?.response?.data?.message || woErr?.message || 'Kreiranje radnog naloga servisa nije uspjelo.', [
                      { text: 'OK', onPress: () => navigation.navigate('Home') },
                    ]);
                  }
                },
              },
            ]
          );
        } else {
          Alert.alert(baseTitle, baseMessage, [{ text: 'OK', onPress: () => navigation.navigate('Home') }]);
        }
      }

    } catch (error) {
      console.error('Greška pri logranju servisa:', error);
      Alert.alert('Greška', error.message || error.response?.data?.message || 'Nije moguće logirati servis');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Novi servis</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? (insets?.top || 0) + 60 : ms(2)}
      >
        <ScrollView
          style={styles.content}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: Math.max((insets?.bottom || 0) + 80, 120) }}
        >
        {/* Informacije o dizalu */}
        <View style={styles.elevatorInfo}>
          <Text style={styles.elevatorName}>{formatElevatorLabel(elevator)} - {elevator?.nazivStranke || 'Nepoznato'}</Text>
          <Text style={styles.elevatorDetail}>
            {(elevator?.ulica || '')} • {(elevator?.mjesto || '')}
          </Text>
        </View>

          {/* Kolega (opcionalno) */}
          <View style={styles.section}>
            <Text style={styles.label}>Dodaj kolegu (opcionalno)</Text>
            <TouchableOpacity
              style={styles.kolegaToggle}
              onPress={() => setShowKolege((v) => !v)}
            >
              <Ionicons name={showKolege ? 'chevron-up' : 'chevron-down'} size={18} color="#0f172a" />
              <Text style={styles.kolegaToggleText}>
                {formData.kolegaId
                  ? (() => {
                      const found = korisnici.find((k) => (k._id || k.id) === formData.kolegaId);
                      return found ? `${found.ime || ''} ${found.prezime || ''}`.trim() || 'Kolega odabran' : 'Kolega odabran';
                    })()
                  : 'Dodaj kolegu'}
              </Text>
            </TouchableOpacity>

            {showKolege && (
              (loadingUsers && korisnici.length === 0) ? (
                <View style={styles.userRow}>
                  <ActivityIndicator size="small" color="#0ea5e9" />
                  <Text style={styles.userRowText}>Učitavanje...</Text>
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 320, marginTop: 8 }}>
                  {loadingUsers && korisnici.length > 0 && (
                    <Text style={{ color: '#6b7280', marginBottom: 8 }}>Osvježavam listu...</Text>
                  )}
                  {korisnici.map((k) => {
                    const id = k._id || k.id;
                    const selected = formData.kolegaId === id;
                    return (
                      <TouchableOpacity
                        key={id}
                        style={[styles.userRow, selected && styles.userRowSelected]}
                        onPress={() => {
                          setFormData((prev) => ({ ...prev, kolegaId: selected ? null : id }));
                          setShowKolege(false);
                        }}
                      >
                        <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={selected ? '#16a34a' : '#94a3b8'} />
                        <Text style={styles.userRowText}>{(k.ime || '')} {(k.prezime || '')}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {korisnici.length === 0 && (
                    <Text style={{ color: '#94a3b8', marginTop: 6 }}>Nema dostupnih korisnika.</Text>
                  )}
                </ScrollView>
              )
            )}
          </View>

        {/* Offline warning */}
        {!online && !isOfflineDemo && (
          <View style={styles.offlineWarning}>
            <Ionicons name="warning" size={20} color="#ef4444" />
            <Text style={styles.offlineText}>
              Za logiranje servisa morate biti online
            </Text>
          </View>
        )}

        {/* Datum servisa */}
        <View style={styles.section}>
          <Text style={styles.label}>Datum servisa</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => { setActiveDateField('serviceDate'); setShowDatePicker(true); }}
          >
            <Ionicons name="calendar-outline" size={20} color="#666" />
            <Text style={styles.dateText}>
              {formData.serviceDate.toLocaleDateString('hr-HR')}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={activeDateField === 'serviceDate' ? formData.serviceDate : formData.nextServiceDate}
              mode="date"
              display="default"
              onChange={(e, date) => handleDateChange(e, date, activeDateField)}
            />
          )}
        </View>

        {/* Opis servisa uklonjen - servis je uvijek redovni */}

        {elevatorsOnAddress.length > 1 && (
          <View style={styles.section}>
            <TouchableOpacity style={styles.multiToggle} onPress={() => setApplyToAll(!applyToAll)}>
              <Ionicons name={applyToAll ? 'checkbox' : 'square-outline'} size={22} color={applyToAll ? '#2563eb' : '#6b7280'} />
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Dodaj za sva dizala na adresi</Text>
                <Text style={styles.helperText}>{elevatorsOnAddress.length} dizala na {elevator.ulica}, {elevator.mjesto}</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Checklist po dizalu */}
        <View style={styles.section}>
          <Text style={styles.label}>Checklist po dizalu</Text>
          {(applyToAll && elevatorsOnAddress.length > 1 ? elevatorsOnAddress : [elevator]).map((el) => {
            const cid = el._id || el.id;
            const included = includeElevators[cid] !== false;
            return (
              <View key={cid} style={styles.elevatorCard}>
                <View style={styles.elevatorCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.elevatorCardTitle}>{formatElevatorLabel(el)}</Text>
                    <Text style={styles.elevatorCardSubtitle}>{(el?.ulica || '')} • {(el?.mjesto || '')}</Text>
                  </View>
                  <TouchableOpacity onPress={() => toggleIncludeElevator(cid)} style={styles.includeToggle}>
                    <Ionicons name={included ? 'checkbox' : 'square-outline'} size={22} color={included ? '#2563eb' : '#9ca3af'} />
                    <Text style={styles.includeLabel}>Uključi</Text>
                  </TouchableOpacity>
                </View>
                {included && (
                  <View style={styles.checklist}>
                    {checklistItems.map(item => (
                      <View
                        key={item.key}
                        style={styles.checklistItem}
                      >
                        <TouchableOpacity
                          style={[
                            styles.checkbox,
                            (item.key === 'upsCheck' && perElevatorChecklist[cid]?.upsStatus === 'radi') && styles.checkboxOk,
                            (item.key === 'upsCheck' && perElevatorChecklist[cid]?.upsStatus === 'ne_radi') && styles.checkboxFail,
                            (item.key === 'voiceComm' && perElevatorChecklist[cid]?.voiceCommStatus === 'radi') && styles.checkboxOk,
                            (item.key === 'voiceComm' && perElevatorChecklist[cid]?.voiceCommStatus === 'ne_radi') && styles.checkboxFail,
                          ]}
                          onPress={() => toggleChecklistItem(cid, item.key)}
                          activeOpacity={0.7}
                        >
                          {perElevatorChecklist[cid]?.[item.key] && (
                            <Ionicons name="checkmark" size={18} color="#10b981" />
                          )}
                        </TouchableOpacity>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.checklistLabel}>{item.label}</Text>
                          {(item.key === 'upsCheck' || item.key === 'voiceComm') &&
                            (item.key === 'upsCheck'
                              ? perElevatorChecklist[cid]?.upsStatus
                              : perElevatorChecklist[cid]?.voiceCommStatus) && (
                            <View style={styles.statusRow}>
                              <View
                                style={[
                                  styles.statusBadge,
                                  (item.key === 'upsCheck'
                                    ? perElevatorChecklist[cid]?.upsStatus === 'radi'
                                    : perElevatorChecklist[cid]?.voiceCommStatus === 'radi')
                                    ? styles.statusBadgeOk
                                    : styles.statusBadgeFail,
                                ]}
                              >
                                <Text style={styles.statusBadgeText}>
                                  {(item.key === 'upsCheck'
                                    ? perElevatorChecklist[cid]?.upsStatus === 'radi'
                                    : perElevatorChecklist[cid]?.voiceCommStatus === 'radi')
                                    ? 'Radi'
                                    : 'Ne radi'}
                                </Text>
                              </View>
                            </View>
                          )}
                        </View>
                      </View>
                    ))}

                    <View style={styles.trebaloBiWrap}>
                      <TouchableOpacity
                        style={styles.trebaloBiToggle}
                        onPress={() => toggleTrebaloBiForElevator(cid)}
                      >
                        <Ionicons
                          name={perElevatorTrebaloBi[cid]?.enabled ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={perElevatorTrebaloBi[cid]?.enabled ? '#f59e0b' : '#9ca3af'}
                        />
                        <Text style={styles.trebaloBiToggleText}>Dodaj "Trebalo bi" stavku</Text>
                      </TouchableOpacity>

                      {perElevatorTrebaloBi[cid]?.enabled && (
                        <TextInput
                          style={[styles.input, styles.trebaloBiInput]}
                          placeholder="Što treba napraviti / nabaviti..."
                          value={perElevatorTrebaloBi[cid]?.text || ''}
                          onChangeText={(text) => setTrebaloBiTextForElevator(cid, text)}
                          multiline
                          numberOfLines={3}
                          textAlignVertical="top"
                        />
                      )}
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Ugrađeno / zamijenjeno (materijal)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={formData.utroseniMaterijal}
            onChangeText={(text) => setFormData(prev => ({ ...prev, utroseniMaterijal: text }))}
            placeholder="Npr. žarulja - 1 kom"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Fotografije */}
        <View style={styles.section}>
          <Text style={styles.label}>Fotografije</Text>
          {photoError && (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={18} color="#dc2626" />
              <Text style={styles.errorText}>{photoError}</Text>
              <TouchableOpacity onPress={clearError}>
                <Ionicons name="close" size={18} color="#dc2626" />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.photoButtonRow}>
            <TouchableOpacity
              style={[styles.photoButton, uploadingPhoto && styles.photoButtonDisabled]}
              onPress={async () => {
                const result = await pickAndUploadPhoto();
                if (result) {
                  setNotePhotos(prev => [...prev, result]);
                }
              }}
              disabled={uploadingPhoto}
            >
              {uploadingPhoto ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="image-outline" size={20} color="#fff" />
              )}
              <Text style={styles.photoButtonText}>Odaberi</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.photoButton, uploadingPhoto && styles.photoButtonDisabled]}
              onPress={async () => {
                const result = await takePhotoWithCamera();
                if (result) {
                  setNotePhotos(prev => [...prev, result]);
                }
              }}
              disabled={uploadingPhoto}
            >
              {uploadingPhoto ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="camera-outline" size={20} color="#fff" />
              )}
              <Text style={styles.photoButtonText}>Fotka</Text>
            </TouchableOpacity>
          </View>

          {notePhotos.length > 0 && (
            <View style={styles.photoGallery}>
              <Text style={styles.photoCountText}>{notePhotos.length} slika</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
                {notePhotos.map((photo, idx) => (
                  <View key={idx} style={styles.photoThumbnailWrapper}>
                    <Image
                      source={{ uri: photo.url }}
                      style={styles.photoThumbnail}
                    />
                    <TouchableOpacity
                      style={styles.photoRemoveBtn}
                      onPress={() => setNotePhotos(notePhotos.filter((_, i) => i !== idx))}
                    >
                      <Ionicons name="close" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Sljedeći servis */}
        <View style={styles.section}>
          <Text style={styles.label}>Sljedeći servis</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => { setActiveDateField('nextServiceDate'); setShowDatePicker(true); }}
          >
            <Ionicons name="calendar-outline" size={20} color="#666" />
            <Text style={styles.dateText}>
              {formData.nextServiceDate.toLocaleDateString('hr-HR')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Submit button */}
        <TouchableOpacity
          style={[styles.submitButton, (loading || (!online && !isOfflineDemo)) && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading || (!online && !isOfflineDemo)}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={24} color="#fff" />
              <Text style={styles.submitButtonText}>Logiraj servis</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  content: {
    flex: 1,
  },
  elevatorInfo: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  elevatorName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 5,
  },
  elevatorDetail: {
    fontSize: 14,
    color: '#666',
  },
  offlineWarning: {
    backgroundColor: '#fef2f2',
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#fecaca',
  },
  offlineText: {
    flex: 1,
    fontSize: 14,
    color: '#ef4444',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  userRowSelected: {
    backgroundColor: '#ecfdf3',
  },
  userRowText: { color: '#111827', fontSize: 14 },
  kolegaToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  kolegaToggleText: { color: '#0f172a', fontWeight: '600', fontSize: 14 },
  section: {
    backgroundColor: '#fff',
    padding: 20,
    marginTop: 15,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1f2937',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusBadgeOk: {
    backgroundColor: '#dcfce7',
    borderColor: '#22c55e',
  },
  statusBadgeFail: {
    backgroundColor: '#fee2e2',
    borderColor: '#ef4444',
  },
  statusBadgeText: {
    fontSize: 12,
    color: '#111827',
    fontWeight: '600',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    gap: 10,
  },
  dateText: {
    fontSize: 16,
    color: '#1f2937',
  },
  checklist: {
    gap: 12,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  trebaloBiWrap: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 10,
  },
  trebaloBiToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trebaloBiToggleText: {
    fontSize: 14,
    color: '#92400e',
    fontWeight: '700',
  },
  trebaloBiInput: {
    marginTop: 8,
    minHeight: 90,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOk: {
    backgroundColor: '#dcfce7',
    borderColor: '#22c55e',
  },
  checkboxFail: {
    backgroundColor: '#fee2e2',
    borderColor: '#ef4444',
  },
  checklistLabel: {
    fontSize: 16,
    color: '#1f2937',
  },
  multiToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  helperText: {
    fontSize: 13,
    color: '#6b7280',
  },
  elevatorCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  elevatorCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  elevatorCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  elevatorCardSubtitle: {
    fontSize: 13,
    color: '#6b7280',
  },
  includeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  includeLabel: {
    fontSize: 13,
    color: '#374151',
  },
  submitButton: {
    backgroundColor: '#10b981',
    marginHorizontal: 20,
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  submitButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },

  // Photo styles
  photoButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  photoButton: {
    flex: 1,
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  photoButtonDisabled: {
    opacity: 0.6,
  },
  photoButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  photoGallery: {
    marginTop: 12,
  },
  photoCountText: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 8,
  },
  photoScroll: {
    maxHeight: 100,
  },
  photoThumbnailWrapper: {
    marginRight: 10,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  photoThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  photoRemoveBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 12,
    padding: 4,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#dc2626',
    fontWeight: '500',
  },
});

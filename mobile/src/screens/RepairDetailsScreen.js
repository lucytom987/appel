import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, BackHandler, Image, ActivityIndicator, Modal, Linking, KeyboardAvoidingView, Platform, LayoutAnimation, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { elevatorDB, repairDB, userDB } from '../database/db';
import { repairsAPI, workOrdersAPI, usersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { usePhotoUpload } from '../hooks/usePhotoUpload';
import ImageViewer from 'react-native-image-zoom-viewer';
import SignatureModal from '../components/SignatureModal';
import ms from '../utils/scale';

const statusLabel = (repair) => {
  if (repair.trebaloBi) return 'Trebalo bi';
  if (repair.status === 'completed') return 'Završeno';
  return 'Prijavljen';
};

const statusColor = (repair) => {
  if (repair.trebaloBi) return '#f59e0b';
  if (repair.status === 'completed') return '#10b981';
  return '#ef4444';
};

const workOrderStatusLabel = (status) => {
  const normalizedStatus = String(status || '').toLowerCase();

  if (normalizedStatus === 'draft') return 'NACRT';
  if (normalizedStatus === 'signed') return 'POTPISAN';
  if (normalizedStatus === 'sent') return 'POSLAN';

  return String(status || '').toUpperCase();
};

const MAX_ADDITIONAL_SERVICERS = 2;

const getUserId = (entry) => {
  if (!entry) return null;
  if (typeof entry === 'object') return entry._id || entry.id || null;
  return entry;
};

export default function RepairDetailsScreen({ route, navigation }) {
  const { repair, returnTo = 'repairs', filter } = route.params || {};
  const [repairData, setRepairData] = useState(repair);
  const { user, isOnline, serverAwake } = useAuth();
  const online = Boolean(isOnline && serverAwake);
  
  // Photo upload hook
  const { pickAndUploadPhoto, takePhotoWithCamera, uploading: uploadingPhoto, error: photoError, clearError } = usePhotoUpload();
  const [photos, setPhotos] = useState(repair?.photos || []);
  const [activePhotoUrl, setActivePhotoUrl] = useState(null);

  // Na hardverski back vrati na listu popravaka
  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return true;
        }
        navigation.navigate('Repairs', { activeList: returnTo, filter });
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  // Učitaj svježe podatke iz lokalne baze (uključujući prijavio/kontakt)
  useEffect(() => {
    const id = repair._id || repair.id;
    if (!id) return;
    try {
      const fresh = repairDB.getById(id);
      if (fresh) {
        setRepairData({ ...repair, ...fresh });
        if (Array.isArray(fresh.photos)) {
          setPhotos(fresh.photos);
        }
      }
    } catch (e) {
      console.log('Ne mogu učitati detalje popravka iz baze:', e?.message);
    }
  }, [repair]);

  const elevatorId = (typeof repairData.elevatorId === 'object' && repairData.elevatorId !== null)
    ? (repairData.elevatorId._id || repairData.elevatorId.id)
    : repairData.elevatorId;
  const elevator = elevatorDB.getById(elevatorId) || repairData.elevatorId || {};

  const [opisKvara, setOpisKvara] = useState(repairData.opisKvara || '');
  const [opisPopravka, setOpisPopravka] = useState(repairData.opisPopravka || '');
  const [isTrebaloBi, setIsTrebaloBi] = useState(
    Boolean(
      repairData.trebaloBi ||
      repairData.trebalo_bi ||
      repairData.category === 'trebaloBi' || repairData.category === 'trebalo_bi' || repairData.category === 'trebalo-bi' || repairData.category === 'trebalo' ||
      repairData.type === 'trebaloBi' || repairData.type === 'trebalo_bi' || repairData.type === 'trebalo-bi' || repairData.type === 'trebalo' ||
      repairData.status === 'in_progress' ||
      repairData.status === 'u tijeku' ||
      repairData.status === 'u_tijeku'
    )
  );
  const [status, setStatus] = useState(repairData.status === 'completed' ? 'completed' : 'pending');
  const [radniNalogPotpisan, setRadniNalogPotpisan] = useState(Boolean(repairData.radniNalogPotpisan));
  const [saving, setSaving] = useState(false);
  const [workOrder, setWorkOrder] = useState(null);
  const [loadingWorkOrder, setLoadingWorkOrder] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [pendingSignWorkOrderId, setPendingSignWorkOrderId] = useState(null);
  const [signingLoading, setSigningLoading] = useState(false);
  const [korisnici, setKorisnici] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showKolegePickerIndex, setShowKolegePickerIndex] = useState(null);
  const initialAdditionalServicers = (() => {
    const ids = Array.isArray(repairData.dodatniServiseri)
      ? repairData.dodatniServiseri.map(getUserId).filter(Boolean).slice(0, MAX_ADDITIONAL_SERVICERS)
      : [];
    const detailedHours = Array.isArray(repairData.radniSati?.dodatni)
      ? repairData.radniSati.dodatni
      : [];

    return ids.map((userId, index) => ({
      userId,
      hours: detailedHours[index] != null
        ? String(detailedHours[index])
        : (index === 0 && repairData.radniSati?.kolega != null ? String(repairData.radniSati.kolega) : ''),
    }));
  })();
  const [additionalServicers, setAdditionalServicers] = useState(initialAdditionalServicers);
  const [radniSatiGlavni, setRadniSatiGlavni] = useState(
    repairData.radniSati?.glavni != null ? String(repairData.radniSati.glavni) : ''
  );
  const [utroseniMaterijal, setUtroseniMaterijal] = useState(repairData.utroseniMaterijal || '');
  const [materijalStavke, setMaterijalStavke] = useState([{ naziv: '', kolicina: '', jedinica: '' }]);

  useEffect(() => {
    const isNewArchitecture = Boolean(global?.nativeFabricUIManager);
    if (Platform.OS === 'android' && !isNewArchitecture && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  // Učitaj postojeći radni nalog (ako postoji)
  useEffect(() => {
    const loadWorkOrder = async () => {
      const id = repairData._id || repairData.id;
      if (!id || !online || String(id).startsWith('local_')) {
        setWorkOrder(null);
        setLoadingWorkOrder(false);
        return;
      }
      
      setLoadingWorkOrder(true);
      try {
        const res = await workOrdersAPI.getByRepair(id);
        setWorkOrder(res?.data?.data || null);
      } catch (err) {
        // 404 je OK - znači nema radnog naloga
        const status = err?.status || err?.response?.status;
        if (status !== 404) {
          console.log('Greška pri dohvaćanju radnog naloga:', err?.message);
        }
      } finally {
        setLoadingWorkOrder(false);
      }
    };

    loadWorkOrder();
  }, [repairData._id, repairData.id, online]);

  useEffect(() => {
    const fetchUsers = async () => {
      setLoadingUsers(true);
      const filterOutCurrent = (arr = []) => (Array.isArray(arr) ? arr : []).filter(
        (u) => (u._id || u.id) !== (user?._id || user?.id)
      );

      try {
        if (online) {
          const res = await usersAPI.getLite();
          const data = res.data?.data || res.data || [];
          const filtered = filterOutCurrent(data);
          try {
            userDB.bulkInsert(filtered);
          } catch (cacheErr) {
            console.log('Cache users failed', cacheErr?.message);
          }
          setKorisnici(filtered);
        } else {
          setKorisnici(filterOutCurrent(userDB.getAll()));
        }
      } catch (e) {
        console.log('Load users failed', e?.message);
        setKorisnici(filterOutCurrent(userDB.getAll()));
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchUsers();
  }, [online, user]);

  const toggleKolege = (index) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowKolegePickerIndex((prev) => (prev === index ? null : index));
  };

  const selectKolega = (index, id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAdditionalServicers((prev) => prev.map((entry, idx) => (
      idx === index ? { ...entry, userId: id } : entry
    )));
    setShowKolegePickerIndex(null);
  };

  const addAdditionalServicer = () => {
    if (additionalServicers.length >= MAX_ADDITIONAL_SERVICERS) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAdditionalServicers((prev) => [...prev, { userId: null, hours: '' }]);
    setShowKolegePickerIndex(additionalServicers.length);
  };

  const removeAdditionalServicer = (index) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAdditionalServicers((prev) => prev.filter((_, idx) => idx !== index));
    setShowKolegePickerIndex((prev) => (prev === index ? null : prev != null && prev > index ? prev - 1 : prev));
  };

  const updateAdditionalServicerHours = (index, hours) => {
    setAdditionalServicers((prev) => prev.map((entry, idx) => (
      idx === index ? { ...entry, hours } : entry
    )));
  };

  const getUserDisplayName = (id) => {
    if (!id) return '';
    const found = korisnici.find((k) => (k._id || k.id) === id);
    return found ? `${found.ime || ''} ${found.prezime || ''}`.trim() || found.email || '' : '';
  };

  const updateMaterijalStavka = (index, field, value) => {
    setMaterijalStavke((prev) => prev.map((stavka, idx) => (
      idx === index ? { ...stavka, [field]: value } : stavka
    )));
  };

  const addMaterijalStavka = () => {
    setMaterijalStavke((prev) => [...prev, { naziv: '', kolicina: '', jedinica: '' }]);
  };

  const removeMaterijalStavka = (index) => {
    setMaterijalStavke((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      return next.length ? next : [{ naziv: '', kolicina: '', jedinica: '' }];
    });
  };

  const openWorkOrderPreview = async (url) => {
    if (!url) return;

    try {
      await WebBrowser.openBrowserAsync(url, {
        showTitle: true,
        enableBarCollapsing: true,
      });
    } catch (browserErr) {
      try {
        await Linking.openURL(url);
      } catch (openErr) {
        Alert.alert('Greška', 'Ne mogu otvoriti pregled dokumenta.');
      }
    }
  };

  const openWorkOrderDownload = async (url) => {
    if (!url) return;

    try {
      await WebBrowser.openBrowserAsync(url, {
        showTitle: true,
        enableBarCollapsing: true,
      });
    } catch (browserErr) {
      try {
        await Linking.openURL(url);
      } catch (openErr) {
        Alert.alert('Greška', 'Ne mogu otvoriti preuzimanje PDF dokumenta.');
      }
    }
  };

  const openSignatureFlow = (woId) => {
    setPendingSignWorkOrderId(woId);
    setShowSignatureModal(true);
  };

  const handleSignatureConfirm = async ({ servicerSignature, customerSignature, customerAbsent }) => {
    const woId = pendingSignWorkOrderId;
    if (!woId) return;

    setSigningLoading(true);
    try {
      const signerName = `${user?.ime || ''} ${user?.prezime || ''}`.trim() || user?.email || 'Serviser';
      const signRes = await workOrdersAPI.sign(woId, {
        signedByName: signerName,
        sendNow: true,
        signatureImage: servicerSignature || undefined,
        customerSignatureImage: customerSignature || undefined,
        customerAbsent: customerAbsent || false,
      });
      const signed = signRes?.data?.data;
      setWorkOrder(signed);
      setShowSignatureModal(false);
      setPendingSignWorkOrderId(null);
      Alert.alert(
        'Radni nalog potpisan i poslan',
        `Broj: ${signed?.workOrderNumber || ''}\nStatus: ${workOrderStatusLabel(signed?.status || 'sent')}`
      );
    } catch (err) {
      Alert.alert('Greška', err?.response?.data?.message || err?.message || 'Potpis nije uspio');
    } finally {
      setSigningLoading(false);
    }
  };

  const handleCreateWorkOrder = async () => {
    const id = repairData._id || repairData.id;
    
    if (!online) {
      Alert.alert('Offline', 'Potrebna je internet veza za kreiranje radnog naloga.');
      return;
    }

    // Provjeri je li popravak sinkroniziran sa serverom
    const isLocalId = String(id).startsWith('local_');
    const isSynced = repairData.synced === 1 || repairData.sync_status === 'synced';
    
    if (isLocalId || !isSynced) {
      Alert.alert(
        'Popravak nije sinkroniziran',
        'Radni nalog se može kreirati samo za popravke koji su sinkronizirani sa serverom.\n\nMolimo prvo spremite ovaj popravak s internet vezom.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Provjeri postoji li već radni nalog
    if (workOrder) {
      Alert.alert(
        'Radni nalog već postoji',
        `Broj: ${workOrder.workOrderNumber}\nStatus: ${workOrderStatusLabel(workOrder.status)}\n\nŽeliš li otvoriti pregled?`,
        [
          { text: 'Odustani', style: 'cancel' },
          {
            text: 'Otvori pregled',
            onPress: async () => {
              if (!workOrder?.viewUrl) return;
              await openWorkOrderPreview(workOrder.viewUrl);
            }
          }
        ]
      );
      return;
    }

    // Kreiraj novi radni nalog
    Alert.alert(
      'Kreiranje radnog naloga',
      'Želiš li kreirati radni nalog za ovaj popravak?',
      [
        { text: 'Odustani', style: 'cancel' },
        {
          text: 'Kreiraj',
          onPress: async () => {
            try {
              const draftRes = await workOrdersAPI.createFromRepair(id);
              const newWorkOrder = draftRes?.data?.data;
              setWorkOrder(newWorkOrder);

              Alert.alert(
                'Radni nalog kreiran',
                `Broj: ${newWorkOrder?.workOrderNumber || ''}\nStatus: ${workOrderStatusLabel(newWorkOrder?.status || 'draft')}\n\nLink za pregled:\n${newWorkOrder?.viewUrl || '-'}\n\nŽeliš li odmah potpisati i označiti kao poslano?`,
                [
                  {
                    text: 'Otvori pregled',
                    onPress: async () => {
                      if (!newWorkOrder?.viewUrl) return;
                      await openWorkOrderPreview(newWorkOrder.viewUrl);
                    }
                  },
                  { text: 'Kasnije', style: 'cancel' },
                  {
                    text: 'Potpiši i pošalji',
                    onPress: () => openSignatureFlow(newWorkOrder.id || newWorkOrder._id),
                  }
                ]
              );
            } catch (err) {
              Alert.alert('Greška', err?.response?.data?.message || err?.message || 'Kreiranje radnog naloga nije uspjelo');
            }
          },
        },
      ]
    );
  };

  const promptWorkOrderFlow = (repairId) => {
    Alert.alert(
      'Kreiranje radnog naloga',
      'Popravak je završen. Želiš li kreirati radni nalog?',
      [
        { text: 'Kasnije', style: 'cancel' },
        {
          text: 'Kreiraj',
          onPress: async () => {
            try {
              const draftRes = await workOrdersAPI.createFromRepair(repairId);
              const newWorkOrder = draftRes?.data?.data;
              setWorkOrder(newWorkOrder); // Spremi u state

              Alert.alert(
                'Nacrt kreiran',
                `Radni nalog ${newWorkOrder?.workOrderNumber || ''} je kreiran.\n\nLink za pregled:\n${newWorkOrder?.viewUrl || '-'}\n\nŽeliš li odmah potpisati i označiti kao poslano?`,
                [
                  {
                    text: 'Otvori pregled',
                    onPress: async () => {
                      if (!newWorkOrder?.viewUrl) return;
                      await openWorkOrderPreview(newWorkOrder.viewUrl);
                    }
                  },
                  { text: 'Samo pregled', style: 'cancel' },
                  {
                    text: 'Potpiši',
                    onPress: () => openSignatureFlow(newWorkOrder.id || newWorkOrder._id),
                  }
                ]
              );
            } catch (err) {
              Alert.alert('Greška', err?.response?.data?.message || err?.message || 'Kreiranje radnog naloga nije uspjelo');
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    setIsTrebaloBi(Boolean(
      repairData.trebaloBi ||
      repairData.trebalo_bi ||
      repairData.category === 'trebaloBi' || repairData.category === 'trebalo_bi' || repairData.category === 'trebalo-bi' || repairData.category === 'trebalo' ||
      repairData.type === 'trebaloBi' || repairData.type === 'trebalo_bi' || repairData.type === 'trebalo-bi' || repairData.type === 'trebalo' ||
      repairData.status === 'in_progress' ||
      repairData.status === 'u tijeku' ||
      repairData.status === 'u_tijeku'
    ));
    setStatus(repairData.status === 'completed' ? 'completed' : 'pending');
    setRadniNalogPotpisan(Boolean(repairData.radniNalogPotpisan));
  }, [repairData.trebaloBi, repairData.status, repairData.radniNalogPotpisan, repairData.category, repairData.type]);

  const handleSave = async () => {
    const id = repairData._id || repairData.id;
    const wasCompleted = repairData.status === 'completed';
    const existsInDB = repairDB.getById(id);
    const isLocalId = String(id || '').startsWith('local_');

    const parseHours = (value) => {
      const normalized = String(value || '').replace(',', '.').trim();
      if (!normalized) return null;
      const parsed = Number.parseFloat(normalized);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    };

    const glavniSati = parseHours(radniSatiGlavni);
    const cleanedAdditionalServicers = additionalServicers
      .map((entry) => ({
        userId: entry.userId,
        hours: parseHours(entry.hours),
      }))
      .filter((entry) => entry.userId);
    const materijalLinije = materijalStavke
      .map((stavka) => {
        const naziv = String(stavka.naziv || '').trim();
        const kolicina = String(stavka.kolicina || '').trim();
        const jedinica = String(stavka.jedinica || '').trim();
        if (!naziv) return null;
        if (!kolicina) return naziv;
        return `${naziv} - ${kolicina}${jedinica ? ` ${jedinica}` : ''}`;
      })
      .filter(Boolean);
    const dodatnaNapomenaMaterijala = String(utroseniMaterijal || '').trim();
    const materijalTekst = [...materijalLinije, dodatnaNapomenaMaterijala].filter(Boolean).join('\n');
    
    const payload = {
      id,
      elevatorId: repairData.elevatorId,
      opisKvara,
      opisPopravka,
      status,
      trebaloBi: isTrebaloBi,
      radniNalogPotpisan,
      dodatniServiseri: cleanedAdditionalServicers.map((entry) => entry.userId),
      radniSati: {
        glavni: glavniSati,
        kolega: cleanedAdditionalServicers[0]?.hours ?? null,
        dodatni: cleanedAdditionalServicers.map((entry) => entry.hours),
      },
      utroseniMaterijal: materijalTekst,
      photos,
      updated_at: Date.now(),
    };

    setSaving(true);
    try {
      const onlineNow = online;
      let savedSuccessfully = false;
      let finalRepairId = id;
      const shouldCreateOnServer = onlineNow && (isLocalId || !existsInDB);
      
      // Provjeri postoji li već u lokalnoj bazi
      
      if (!existsInDB && !shouldCreateOnServer) {
        // NOVA popravka - spremi localno prvo
        repairDB.insert({ ...repairData, ...payload, synced: 0, sync_status: 'dirty' });
        setRepairData((prev) => ({ ...prev, ...payload, synced: 0, sync_status: 'dirty' }));
        savedSuccessfully = true;
      } else {
        // Postojeća popravka - ažuriraj
        if (!onlineNow) {
          repairDB.update(id, { ...repairData, ...payload, synced: 0, sync_status: 'dirty' });
          setRepairData((prev) => ({ ...prev, ...payload, synced: 0, sync_status: 'dirty' }));
          savedSuccessfully = true;
        } else {
          if (shouldCreateOnServer) {
            const createPayload = {
              ...payload,
              elevatorId,
              id: undefined,
            };
            const response = await repairsAPI.create(createPayload);
            const created = response.data?.data || response.data;
            const serverId = created?._id || created?.id;

            if (serverId) {
              finalRepairId = serverId;
              if (existsInDB) {
                repairDB.markSynced(id, serverId);
                repairDB.update(serverId, { ...repairData, ...created, synced: 1, sync_status: 'synced' });
              } else {
                repairDB.insert({ ...repairData, ...created, id: serverId, _id: serverId, synced: 1, sync_status: 'synced' });
              }
              setRepairData((prev) => ({ ...prev, ...created, id: serverId, _id: serverId, synced: 1, sync_status: 'synced' }));
              savedSuccessfully = true;
            } else {
              throw new Error('Server nije vratio ID za spremljeni popravak');
            }
          } else {
            const response = await repairsAPI.update(id, payload);
            const updated = response.data?.data || response.data;
            repairDB.update(id, { ...repairData, ...updated, synced: 1, sync_status: 'synced' });
            setRepairData((prev) => ({ ...prev, ...updated, synced: 1, sync_status: 'synced' }));
            finalRepairId = id;
            savedSuccessfully = true;
          }
        }
      }
      
      Alert.alert('Pohranjeno', 'Popravak je uspješno pohranjen.', [
        { text: 'OK', onPress: () => {
          // Provjeri trebali li pitati o radnom nalogu
          // Samo ako je sinkronizirano s serverom (ne lokalni ID)
          const nowSynced = savedSuccessfully && onlineNow && !String(finalRepairId || '').startsWith('local_');
          
          if (nowSynced && !wasCompleted && status === 'completed') {
            promptWorkOrderFlow(finalRepairId);
          }
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.navigate('Repairs', { activeList: returnTo, filter });
          }
        } },
      ]);
    } catch (e) {
      Alert.alert('Greška', e?.message || 'Nije moguće spremiti popravku');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenElevator = () => {
    const baseElevator = elevatorId
      ? (elevatorDB.getById(elevatorId) || { ...elevator, id: elevatorId })
      : elevator;

    if (baseElevator && (baseElevator._id || baseElevator.id || baseElevator.brojDizala)) {
      navigation.navigate('ElevatorDetails', { elevator: baseElevator });
      return;
    }

    Alert.alert('Greška', 'Nije moguće otvoriti dizalo.');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.navigate('Repairs', { activeList: returnTo, filter });
          }
        }}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Detalji popravka</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? ms(90) : ms(20)}
      >
      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: ms(100) }}>
        <View style={styles.elevatorHero}>
          <TouchableOpacity
            style={[styles.elevatorBadgeLarge, { borderColor: statusColor({ status, trebaloBi: isTrebaloBi }) }]}
            onPress={handleOpenElevator}
            activeOpacity={0.8}
          >
            <Text style={styles.elevatorBadgeLargeText}>{elevator?.brojDizala || 'Dizalo'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="warning-outline" size={18} color="#ef4444" />
            <Text style={styles.sectionTitle}>Opis kvara</Text>
          </View>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={opisKvara}
            onChangeText={setOpisKvara}
            placeholder="Detaljno opišite kvar dizala..."
            placeholderTextColor="#9ca3af"
            multiline
          />
        </View>

        <View style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="construct-outline" size={18} color="#2563eb" />
            <Text style={styles.sectionTitle}>Opis popravka</Text>
          </View>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={opisPopravka}
            onChangeText={setOpisPopravka}
            placeholder="Opišite izvršeni popravak..."
            placeholderTextColor="#9ca3af"
            multiline
          />
        </View>

        <View style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="people-outline" size={18} color="#0ea5e9" />
            <Text style={styles.sectionTitle}>Sudionici i radni sati</Text>
          </View>

          <Text style={styles.fieldLabel}>Tvoji radni sati</Text>
          <View style={styles.hoursInputRow}>
            <TextInput
              style={[styles.input, styles.hoursInput]}
              value={radniSatiGlavni}
              onChangeText={setRadniSatiGlavni}
              keyboardType="decimal-pad"
              placeholder="Upiši radne sate"
              placeholderTextColor="#9ca3af"
            />
            <View style={styles.hoursSuffix}>
              <Text style={styles.hoursSuffixText}>h</Text>
            </View>
          </View>

          <View style={styles.additionalHeaderRow}>
            <Text style={[styles.sectionTitle, { fontSize: ms(15), marginTop: ms(14), marginBottom: ms(8), flex: 1 }]}>Dodatni serviseri</Text>
            {additionalServicers.length < MAX_ADDITIONAL_SERVICERS && (
              <TouchableOpacity style={styles.addKolegaButton} onPress={addAdditionalServicer}>
                <Ionicons name="add-circle-outline" size={18} color="#2563eb" />
                <Text style={styles.addKolegaButtonText}>Dodaj</Text>
              </TouchableOpacity>
            )}
          </View>

          {additionalServicers.length === 0 && (
            <Text style={styles.emptyAssistantsText}>Ako nema kolege, na radnom nalogu će se prikazati samo glavni serviser.</Text>
          )}

          {additionalServicers.map((entry, index) => {
            const label = getUserDisplayName(entry.userId);
            return (
              <View key={`additional-servicer-${index}`} style={styles.additionalServicerCard}>
                <View style={styles.additionalServicerTopRow}>
                  <Text style={styles.additionalServicerTitle}>{`Serviser ${index + 2}`}</Text>
                  <TouchableOpacity style={styles.removeKolegaInlineBtn} onPress={() => removeAdditionalServicer(index)}>
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.kolegaToggle} onPress={() => toggleKolege(index)}>
                  <Ionicons name={showKolegePickerIndex === index ? 'chevron-up' : 'chevron-down'} size={18} color="#0f172a" />
                  <Text style={styles.kolegaToggleText}>{label || 'Odaberi servisera'}</Text>
                </TouchableOpacity>

                {showKolegePickerIndex === index && (
                  loadingUsers ? (
                    <View style={styles.userRow}>
                      <ActivityIndicator size="small" color="#0ea5e9" />
                      <Text style={styles.userRowText}>Učitavanje...</Text>
                    </View>
                  ) : (
                    <View style={styles.kolegeList}>
                      <TouchableOpacity
                        style={[styles.userRow, !entry.userId && styles.userRowSelected]}
                        onPress={() => selectKolega(index, null)}
                      >
                        <Ionicons name={!entry.userId ? 'radio-button-on' : 'radio-button-off'} size={18} color={!entry.userId ? '#0ea5e9' : '#94a3b8'} />
                        <Text style={styles.userRowText}>Bez servisera</Text>
                      </TouchableOpacity>
                      {korisnici
                        .filter((k) => {
                          const kid = k._id || k.id;
                          return !additionalServicers.some((item, itemIndex) => itemIndex !== index && item.userId === kid);
                        })
                        .map((k) => {
                          const kid = k._id || k.id;
                          const selected = entry.userId === kid;
                          return (
                            <TouchableOpacity
                              key={`${index}-${kid}`}
                              style={[styles.userRow, selected && styles.userRowSelected]}
                              onPress={() => selectKolega(index, kid)}
                            >
                              <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={18} color={selected ? '#0ea5e9' : '#94a3b8'} />
                              <Text style={styles.userRowText}>{`${k.ime || ''} ${k.prezime || ''}`.trim() || k.email}</Text>
                            </TouchableOpacity>
                          );
                        })}
                    </View>
                  )
                )}

                <Text style={[styles.fieldLabel, { marginTop: ms(12) }]}>{`Radni sati (${label || `serviser ${index + 2}`})`}</Text>
                <View style={styles.hoursInputRow}>
                  <TextInput
                    style={[styles.input, styles.hoursInput]}
                    value={entry.hours}
                    onChangeText={(text) => updateAdditionalServicerHours(index, text)}
                    keyboardType="decimal-pad"
                    placeholder="npr. 1.5"
                    placeholderTextColor="#9ca3af"
                  />
                  <View style={styles.hoursSuffix}>
                    <Text style={styles.hoursSuffixText}>h</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="cube-outline" size={18} color="#f59e0b" />
            <Text style={styles.sectionTitle}>Utrošeni materijal</Text>
          </View>
          {materijalStavke.map((stavka, index) => (
            <View key={`mat-${index}`} style={styles.materijalRow}>
              <TextInput
                style={[styles.input, styles.materijalNaziv]}
                value={stavka.naziv}
                onChangeText={(text) => updateMaterijalStavka(index, 'naziv', text)}
                placeholder="Naziv"
                placeholderTextColor="#9ca3af"
              />
              <TextInput
                style={[styles.input, styles.materijalKolicina]}
                value={stavka.kolicina}
                onChangeText={(text) => updateMaterijalStavka(index, 'kolicina', text)}
                placeholder="Kol."
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
              />
              <TextInput
                style={[styles.input, styles.materijalJedinica]}
                value={stavka.jedinica}
                onChangeText={(text) => updateMaterijalStavka(index, 'jedinica', text)}
                placeholder="Jed."
                placeholderTextColor="#9ca3af"
              />
              <TouchableOpacity style={styles.removeMaterijalBtn} onPress={() => removeMaterijalStavka(index)}>
                <Ionicons name="close-circle" size={22} color="#ef4444" />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.addMaterijalBtn} onPress={addMaterijalStavka}>
            <Ionicons name="add-circle-outline" size={18} color="#2563eb" />
            <Text style={styles.addMaterijalText}>Dodaj stavku materijala</Text>
          </TouchableOpacity>
          <Text style={[styles.fieldLabel, { marginTop: ms(12) }]}>Dodatna napomena (opcionalno)</Text>
          <TextInput
            style={[styles.input, { minHeight: ms(60), textAlignVertical: 'top' }]}
            value={utroseniMaterijal}
            onChangeText={setUtroseniMaterijal}
            placeholder="Npr. materijal donesen iz skladišta"
            placeholderTextColor="#9ca3af"
            multiline
          />
        </View>

        <View style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="camera-outline" size={18} color="#8b5cf6" />
            <Text style={styles.sectionTitle}>Fotografije</Text>
          </View>
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
                  setPhotos((prev) => [...prev, result]);
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
                  setPhotos((prev) => [...prev, result]);
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

          {photos.length > 0 && (
            <View style={styles.photoGallery}>
              <Text style={styles.photoCountText}>{photos.length} slika</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
                {photos.map((photo, idx) => (
                  <View key={idx} style={styles.photoThumbnailWrapper}>
                    <TouchableOpacity onPress={() => setActivePhotoUrl(photo.url)}>
                      <Image
                        source={{ uri: photo.url }}
                        style={styles.photoThumbnail}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.photoRemoveBtn}
                      onPress={() => setPhotos(photos.filter((_, i) => i !== idx))}
                    >
                      <Ionicons name="close" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        <Modal
          visible={Boolean(activePhotoUrl)}
          transparent
          animationType="fade"
          onRequestClose={() => setActivePhotoUrl(null)}
        >
          <View style={styles.photoModalOverlay}>
            <TouchableOpacity style={styles.photoModalClose} onPress={() => setActivePhotoUrl(null)}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <ImageViewer
              imageUrls={activePhotoUrl ? [{ url: activePhotoUrl }] : []}
              enableSwipeDown
              onSwipeDown={() => setActivePhotoUrl(null)}
              backgroundColor="transparent"
              style={styles.photoViewer}
              loadingRender={() => <ActivityIndicator size="large" color="#fff" />}
            />
          </View>
        </Modal>

        <View style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="flag-outline" size={18} color="#10b981" />
            <Text style={styles.sectionTitle}>Status</Text>
          </View>
          <View style={styles.statusChoiceRow}>
            {[
              { label: 'Prijavljen', value: 'pending', color: '#ef4444' },
              { label: 'Završeno', value: 'completed', color: '#10b981' },
            ].map((opt) => {
              const active = status === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.statusChip, active && styles.statusChipActive, active && { borderColor: opt.color }]}
                  onPress={() => setStatus(opt.value)}
                >
                  <Text style={[styles.statusChipText, active && { color: opt.color }]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.toggleRow, radniNalogPotpisan && styles.toggleRowActive]}
            onPress={() => setRadniNalogPotpisan((p) => !p)}
          >
            <Ionicons name={radniNalogPotpisan ? 'checkbox' : 'square-outline'} size={20} color={radniNalogPotpisan ? '#10b981' : '#6b7280'} />
            <Text style={styles.toggleLabel}>Radni nalog potpisan</Text>
          </TouchableOpacity>
        </View>

        {/* Postojeći radni nalog */}
        {online && loadingWorkOrder && (
          <View style={styles.card}>
            <ActivityIndicator size="small" color="#2563eb" />
            <Text style={{ textAlign: 'center', marginTop: ms(8), color: '#6b7280' }}>Učitavam radni nalog...</Text>
          </View>
        )}

        {online && !loadingWorkOrder && workOrder && (
          <View style={[styles.card, { backgroundColor: '#eff6ff' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: ms(8) }}>
              <Ionicons name="document-text" size={20} color="#2563eb" />
              <Text style={[styles.sectionTitle, { marginLeft: ms(8), flex: 1 }]}>Radni nalog</Text>
              <View style={{
                paddingHorizontal: ms(8),
                paddingVertical: ms(4),
                borderRadius: ms(6),
                backgroundColor: workOrder.status === 'draft' ? '#fef3c7' : workOrder.status === 'signed' ? '#d1fae5' : '#e0e7ff'
              }}>
                <Text style={{
                  fontSize: ms(11),
                  fontWeight: '700',
                  color: workOrder.status === 'draft' ? '#92400e' : workOrder.status === 'signed' ? '#065f46' : '#3730a3'
                }}>
                  {workOrderStatusLabel(workOrder.status)}
                </Text>
              </View>
            </View>
            
            <Text style={{ fontSize: ms(13), color: '#374151', marginBottom: ms(4) }}>
              <Text style={{ fontWeight: '700' }}>Broj:</Text> {workOrder.workOrderNumber}
            </Text>
            <Text style={{ fontSize: ms(13), color: '#374151', marginBottom: ms(12) }}>
              <Text style={{ fontWeight: '700' }}>Kreiran:</Text> {new Date(workOrder.created_at).toLocaleString('hr-HR')}
            </Text>

            <View style={{ flexDirection: 'row', gap: ms(8) }}>
              <TouchableOpacity
                style={[styles.secondaryButton, { flex: 1, marginTop: 0 }]}
                onPress={() => openWorkOrderPreview(workOrder.viewUrl)}
              >
                <Ionicons name="eye-outline" size={18} color="#2563eb" />
                <Text style={styles.secondaryText}>Pregled</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryButton, { flex: 1, marginTop: 0 }]}
                onPress={() => openWorkOrderDownload(workOrder.downloadUrl)}
              >
                <Ionicons name="download-outline" size={18} color="#2563eb" />
                <Text style={styles.secondaryText}>Preuzmi PDF</Text>
              </TouchableOpacity>
            </View>

            {workOrder.status === 'draft' && (
              <TouchableOpacity
                style={[styles.secondaryButton, { marginTop: ms(8), backgroundColor: '#10b981', borderColor: '#10b981' }]}
                onPress={() => openSignatureFlow(workOrder._id || workOrder.id)}
              >
                <Ionicons name="create-outline" size={18} color="#fff" />
                <Text style={[styles.secondaryText, { color: '#fff', fontWeight: '700' }]}>Potpiši i označi kao poslano</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <TouchableOpacity style={styles.primaryButton} onPress={handleSave} disabled={saving}>
          <Ionicons name="save-outline" size={18} color="#fff" />
          <Text style={styles.primaryButtonText}>{saving ? 'Spremam...' : 'Spremi'}</Text>
        </TouchableOpacity>

        {/* Tipka za kreiranje radnog naloga */}
        <TouchableOpacity
          style={[
            styles.workOrderButton, 
            (!online || String(repairData._id || repairData.id).startsWith('local_')) && styles.workOrderButtonDisabled
          ]}
          onPress={handleCreateWorkOrder}
          disabled={!online || loadingWorkOrder || String(repairData._id || repairData.id).startsWith('local_')}
        >
          <Ionicons 
            name="document-text-outline" 
            size={18} 
            color={(online && !String(repairData._id || repairData.id).startsWith('local_')) ? "#fff" : "#9ca3af"} 
          />
          <Text style={[
            styles.workOrderButtonText, 
            (!online || String(repairData._id || repairData.id).startsWith('local_')) && { color: '#9ca3af' }
          ]}>
            {loadingWorkOrder ? 'Učitavam...' : workOrder ? 'Pregled radnog naloga' : 'Kreiraj radni nalog'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryButton, { marginTop: ms(12) }]}
          onPress={() => navigation.navigate('EditRepair', { repair: repairData })}
        >
          <Ionicons name="information-circle-outline" size={18} color="#2563eb" />
          <Text style={styles.secondaryText}>Detalji</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
      </KeyboardAvoidingView>

      <SignatureModal
        visible={showSignatureModal}
        signerName={`${user?.ime || ''} ${user?.prezime || ''}`.trim() || user?.email || 'Serviser'}
        customerName={elevator?.nazivStranke || elevator?.kontaktOsoba?.ime || ''}
        onConfirm={handleSignatureConfirm}
        onCancel={() => { setShowSignatureModal(false); setPendingSignWorkOrderId(null); }}
        loading={signingLoading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#fff', paddingTop: ms(50), paddingBottom: ms(15), paddingHorizontal: ms(20), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e5e5e5' },
  headerTitle: { fontSize: ms(19), fontWeight: '700', color: '#1f2937' },
  content: { flex: 1 },
  card: { backgroundColor: '#fff', padding: ms(16), marginTop: ms(12), marginHorizontal: ms(12), borderRadius: ms(14), shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  elevatorHero: { alignItems: 'center', marginTop: ms(12) },
  elevatorBadgeLarge: { paddingHorizontal: ms(16), paddingVertical: ms(10), borderRadius: ms(14), borderWidth: 2, backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  elevatorBadgeLargeText: { fontSize: ms(18), fontWeight: '800', color: '#111827' },
  sectionTitle: { fontSize: ms(16), fontWeight: '700', color: '#111827' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: ms(8), marginBottom: ms(12) },
  actionIconBtn: { paddingHorizontal: ms(6), paddingVertical: ms(4) },
  primaryButton: {
    marginTop: ms(20),
    marginHorizontal: ms(16),
    backgroundColor: '#2563eb',
    borderRadius: ms(12),
    padding: ms(16),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(8),
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: ms(16),
  },
  workOrderButton: {
    marginTop: ms(12),
    marginHorizontal: ms(16),
    backgroundColor: '#059669',
    borderRadius: ms(12),
    padding: ms(16),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(8),
  },
  workOrderButtonDisabled: {
    backgroundColor: '#e5e7eb',
  },
  workOrderButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: ms(15),
  },
  secondaryButton: {
    marginHorizontal: ms(16),
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: ms(10),
    padding: ms(12),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(8),
    backgroundColor: '#eef2ff',
  },
  secondaryGhostButton: {
    paddingVertical: ms(10),
    paddingHorizontal: ms(12),
  },
  secondaryText: {
    color: '#2563eb',
    fontWeight: '700',
    fontSize: ms(14),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: ms(20),
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: ms(12),
    padding: ms(16),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: ms(12),
  },
  modalTitle: {
    fontSize: ms(16),
    fontWeight: '700',
    color: '#111827',
  },
  label: {
    fontSize: ms(14),
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: ms(8),
  },
  fieldLabel: {
    fontSize: ms(14),
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: ms(8),
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: ms(10),
    padding: ms(12),
    fontSize: ms(15),
    color: '#1f2937',
    backgroundColor: '#f8fafc',
  },
  textArea: {
    minHeight: ms(80),
    textAlignVertical: 'top',
  },
  hoursInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hoursInput: {
    flex: 1,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderRightWidth: 0,
  },
  hoursSuffix: {
    backgroundColor: '#e2e8f0',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderTopRightRadius: ms(10),
    borderBottomRightRadius: ms(10),
    paddingHorizontal: ms(14),
    paddingVertical: ms(12),
    justifyContent: 'center',
    alignItems: 'center',
  },
  hoursSuffixText: {
    fontSize: ms(15),
    fontWeight: '700',
    color: '#64748b',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(10),
    paddingVertical: ms(10),
  },
  toggleRowActive: {
    backgroundColor: '#ecfeff',
    paddingHorizontal: ms(6),
    borderRadius: ms(8),
  },
  toggleLabel: {
    fontSize: ms(15),
    color: '#111827',
  },
  statusChoiceRow: {
    flexDirection: 'row',
    gap: ms(8),
    marginBottom: ms(6),
  },
  statusChip: {
    flex: 1,
    paddingHorizontal: ms(12),
    paddingVertical: ms(12),
    borderRadius: ms(12),
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  statusChipActive: {
    borderWidth: 1.5,
    backgroundColor: '#f0fdf4',
  },
  statusChipText: {
    fontSize: ms(14),
    color: '#111827',
    fontWeight: '600',
  },
  additionalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addKolegaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(6),
    paddingHorizontal: ms(10),
    paddingVertical: ms(8),
    borderRadius: ms(10),
    backgroundColor: '#eff6ff',
  },
  addKolegaButtonText: {
    fontSize: ms(13),
    color: '#2563eb',
    fontWeight: '700',
  },
  emptyAssistantsText: {
    fontSize: ms(13),
    color: '#64748b',
    lineHeight: ms(18),
    marginBottom: ms(6),
  },
  additionalServicerCard: {
    marginTop: ms(10),
    padding: ms(12),
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: ms(12),
    backgroundColor: '#fafcff',
  },
  additionalServicerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: ms(8),
  },
  additionalServicerTitle: {
    fontSize: ms(14),
    fontWeight: '700',
    color: '#0f172a',
  },
  removeKolegaInlineBtn: {
    padding: ms(4),
  },
  kolegaToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(8),
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: ms(10),
    paddingHorizontal: ms(12),
    paddingVertical: ms(10),
    backgroundColor: '#f8fafc',
  },
  kolegaToggleText: {
    flex: 1,
    fontSize: ms(14),
    color: '#0f172a',
    fontWeight: '600',
  },
  kolegeList: {
    marginTop: ms(8),
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: ms(10),
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(8),
    paddingHorizontal: ms(12),
    paddingVertical: ms(10),
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  userRowSelected: {
    backgroundColor: '#eff6ff',
  },
  userRowText: {
    fontSize: ms(14),
    color: '#0f172a',
    fontWeight: '500',
  },
  materijalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(6),
    marginBottom: ms(4),
    paddingHorizontal: ms(4),
    paddingVertical: ms(6),
    backgroundColor: '#f1f5f9',
    borderRadius: ms(8),
  },
  materijalHeaderText: {
    fontSize: ms(11),
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  materijalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(6),
    marginTop: ms(6),
  },
  materijalNaziv: {
    flex: 1.5,
  },
  materijalKolicina: {
    flex: 1,
  },
  materijalJedinica: {
    flex: 1,
  },
  removeMaterijalBtn: {
    paddingHorizontal: ms(4),
    paddingVertical: ms(4),
  },
  addMaterijalBtn: {
    marginTop: ms(12),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(6),
    paddingVertical: ms(10),
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: ms(10),
    borderStyle: 'dashed',
    backgroundColor: '#f8faff',
  },
  addMaterijalText: {
    color: '#2563eb',
    fontWeight: '600',
    fontSize: ms(13),
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: ms(12),
    marginTop: ms(12),
  },
  primaryButtonSmall: {
    paddingVertical: ms(10),
    paddingHorizontal: ms(14),
    backgroundColor: '#2563eb',
    borderRadius: ms(8),
  },
  
  // Photo styles
  photoButtonRow: {
    flexDirection: 'row',
    gap: ms(10),
    marginTop: ms(12),
  },
  photoButton: {
    flex: 1,
    backgroundColor: '#3b82f6',
    borderRadius: ms(10),
    paddingVertical: ms(12),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(8),
  },
  photoButtonDisabled: {
    opacity: 0.6,
  },
  photoButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: ms(14),
  },
  photoGallery: {
    marginTop: ms(12),
  },
  photoCountText: {
    fontSize: ms(13),
    color: '#6b7280',
    marginBottom: ms(8),
  },
  photoScroll: {
    maxHeight: ms(100),
  },
  photoThumbnailWrapper: {
    marginRight: ms(10),
    borderRadius: ms(8),
    overflow: 'hidden',
    position: 'relative',
  },
  photoThumbnail: {
    width: ms(80),
    height: ms(80),
    borderRadius: ms(8),
    backgroundColor: '#f3f4f6',
  },
  photoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: ms(20),
  },
  photoModalClose: {
    position: 'absolute',
    top: ms(40),
    right: ms(20),
    padding: ms(8),
    zIndex: 2,
  },
  photoViewer: {
    flex: 1,
    width: '100%',
  },
  photoRemoveBtn: {
    position: 'absolute',
    top: ms(4),
    right: ms(4),
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: ms(12),
    padding: ms(4),
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(8),
    backgroundColor: '#fee2e2',
    borderRadius: ms(8),
    paddingHorizontal: ms(10),
    paddingVertical: ms(8),
    marginBottom: ms(12),
  },
  errorText: {
    flex: 1,
    fontSize: ms(13),
    color: '#dc2626',
    fontWeight: '500',
  },
});



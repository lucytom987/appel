import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, BackHandler, Image, ActivityIndicator, Modal, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { elevatorDB, repairDB, userDB } from '../database/db';
import { repairsAPI, workOrdersAPI, usersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { usePhotoUpload } from '../hooks/usePhotoUpload';
import ImageViewer from 'react-native-image-zoom-viewer';
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
  const [korisnici, setKorisnici] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showKolege, setShowKolege] = useState(false);
  const initialKolegaId = Array.isArray(repairData.dodatniServiseri) && repairData.dodatniServiseri.length
    ? (repairData.dodatniServiseri[0]?._id || repairData.dodatniServiseri[0]?.id || repairData.dodatniServiseri[0])
    : null;
  const [kolegaId, setKolegaId] = useState(initialKolegaId);
  const [radniSatiGlavni, setRadniSatiGlavni] = useState(
    repairData.radniSati?.glavni != null ? String(repairData.radniSati.glavni) : ''
  );
  const [radniSatiKolega, setRadniSatiKolega] = useState(
    repairData.radniSati?.kolega != null ? String(repairData.radniSati.kolega) : ''
  );
  const [utroseniMaterijal, setUtroseniMaterijal] = useState(repairData.utroseniMaterijal || '');

  // Učitaj postojeći radni nalog (ako postoji)
  useEffect(() => {
    const loadWorkOrder = async () => {
      const id = repairData._id || repairData.id;
      if (!id || !online) return;
      
      setLoadingWorkOrder(true);
      try {
        const res = await workOrdersAPI.getByRepair(id);
        setWorkOrder(res?.data?.data || null);
      } catch (err) {
        // 404 je OK - znači nema radnog naloga
        if (err?.response?.status !== 404) {
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
              try {
                await Linking.openURL(workOrder.viewUrl);
              } catch (openErr) {
                Alert.alert('Greška', 'Ne mogu otvoriti pregled dokumenta.');
              }
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
                      try {
                        await Linking.openURL(newWorkOrder.viewUrl);
                      } catch (openErr) {
                        Alert.alert('Greška', 'Ne mogu otvoriti pregled dokumenta.');
                      }
                    }
                  },
                  { text: 'Kasnije', style: 'cancel' },
                  {
                    text: 'Potpiši i pošalji',
                    onPress: async () => {
                      try {
                        const signerName = `${user?.ime || ''} ${user?.prezime || ''}`.trim() || user?.email || 'Serviser';
                        const signRes = await workOrdersAPI.sign(newWorkOrder.id, {
                          signedByName: signerName,
                          sendNow: true,
                        });
                        const signed = signRes?.data?.data;
                        setWorkOrder(signed);
                        Alert.alert(
                          'Radni nalog potpisan i poslan',
                          `Broj: ${signed?.workOrderNumber || ''}\nStatus: ${workOrderStatusLabel(signed?.status || 'sent')}\n\nLink za pregled:\n${signed?.viewUrl || '-'}`
                        );
                      } catch (err) {
                        Alert.alert('Greška', err?.response?.data?.message || err?.message || 'Potpis nije uspio');
                      }
                    }
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
                      try {
                        await Linking.openURL(newWorkOrder.viewUrl);
                      } catch (openErr) {
                        Alert.alert('Greška', 'Ne mogu otvoriti pregled dokumenta.');
                      }
                    }
                  },
                  { text: 'Samo pregled', style: 'cancel' },
                  {
                    text: 'Potpiši',
                    onPress: async () => {
                      try {
                        const signerName = `${user?.ime || ''} ${user?.prezime || ''}`.trim() || user?.email || 'Serviser';
                        const signRes = await workOrdersAPI.sign(newWorkOrder.id, {
                          signedByName: signerName,
                          sendNow: true,
                        });
                        const signed = signRes?.data?.data;
                        setWorkOrder(signed); // Ažuriraj state s potpisanom verzijom
                        Alert.alert(
                          'Radni nalog potpisan',
                          `Status: ${workOrderStatusLabel(signed?.status || 'signed')}\nBroj: ${signed?.workOrderNumber || ''}\n\nLink za pregled:\n${signed?.viewUrl || '-'}`
                        );
                      } catch (err) {
                        Alert.alert('Greška', err?.response?.data?.message || err?.message || 'Potpis nije uspio');
                      }
                    }
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

    const parseHours = (value) => {
      const normalized = String(value || '').replace(',', '.').trim();
      if (!normalized) return null;
      const parsed = Number.parseFloat(normalized);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    };

    const glavniSati = parseHours(radniSatiGlavni);
    const kolegaSati = parseHours(radniSatiKolega);
    
    const payload = {
      id,
      elevatorId: repairData.elevatorId,
      opisKvara,
      opisPopravka,
      status,
      trebaloBi: isTrebaloBi,
      radniNalogPotpisan,
      dodatniServiseri: kolegaId ? [kolegaId] : [],
      radniSati: {
        glavni: glavniSati,
        kolega: kolegaId ? kolegaSati : null,
      },
      utroseniMaterijal,
      photos,
      updated_at: Date.now(),
    };

    setSaving(true);
    try {
      const onlineNow = online;
      let savedSuccessfully = false;
      
      // Provjeri postoji li već u lokalnoj bazi
      
      if (!existsInDB) {
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
          const response = await repairsAPI.update(id, payload);
          const updated = response.data?.data || response.data;
          repairDB.update(id, { ...repairData, ...updated, synced: 1, sync_status: 'synced' });
          setRepairData((prev) => ({ ...prev, ...updated, synced: 1, sync_status: 'synced' }));
          savedSuccessfully = true;
        }
      }
      
      Alert.alert('Spremljeno', 'Popravka je spremljena', [
        { text: 'OK', onPress: () => {
          // Provjeri trebali li pitati o radnom nalogu
          // Samo ako je sinkronizirano s serverom (ne lokalni ID)
          const isLocalId = String(id).startsWith('local_');
          const nowSynced = savedSuccessfully && onlineNow && !isLocalId;
          
          if (nowSynced && !wasCompleted && status === 'completed') {
            promptWorkOrderFlow(id);
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

      <ScrollView style={styles.content}>
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
          <Text style={styles.sectionTitle}>Opis kvara</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={opisKvara}
            onChangeText={setOpisKvara}
            placeholder="Upiši opis kvara"
            multiline
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Opis popravka</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={opisPopravka}
            onChangeText={setOpisPopravka}
            placeholder="Što je rađeno na popravku"
            multiline
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Sudionici i radni sati</Text>

          <Text style={styles.fieldLabel}>Radni sati (ti)</Text>
          <TextInput
            style={styles.input}
            value={radniSatiGlavni}
            onChangeText={setRadniSatiGlavni}
            keyboardType="decimal-pad"
            placeholder="npr. 2.5"
          />

          <Text style={[styles.sectionTitle, { fontSize: ms(15), marginTop: ms(14), marginBottom: ms(8) }]}>Kolega (opcionalno)</Text>
          <TouchableOpacity style={styles.kolegaToggle} onPress={() => setShowKolege((v) => !v)}>
            <Ionicons name={showKolege ? 'chevron-up' : 'chevron-down'} size={18} color="#0f172a" />
            <Text style={styles.kolegaToggleText}>
              {kolegaId
                ? (() => {
                    const found = korisnici.find((k) => (k._id || k.id) === kolegaId);
                    return found ? `${found.ime || ''} ${found.prezime || ''}`.trim() || 'Kolega odabran' : 'Kolega odabran';
                  })()
                : 'Dodaj kolegu'}
            </Text>
          </TouchableOpacity>

          {showKolege && (
            loadingUsers ? (
              <View style={styles.userRow}>
                <ActivityIndicator size="small" color="#0ea5e9" />
                <Text style={styles.userRowText}>Učitavanje...</Text>
              </View>
            ) : (
              <View style={styles.kolegeList}>
                <TouchableOpacity
                  style={[styles.userRow, !kolegaId && styles.userRowSelected]}
                  onPress={() => setKolegaId(null)}
                >
                  <Ionicons name={!kolegaId ? 'radio-button-on' : 'radio-button-off'} size={18} color={!kolegaId ? '#0ea5e9' : '#94a3b8'} />
                  <Text style={styles.userRowText}>Bez kolege</Text>
                </TouchableOpacity>
                {korisnici.map((k) => {
                  const kid = k._id || k.id;
                  const selected = kolegaId === kid;
                  return (
                    <TouchableOpacity
                      key={kid}
                      style={[styles.userRow, selected && styles.userRowSelected]}
                      onPress={() => setKolegaId(kid)}
                    >
                      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={18} color={selected ? '#0ea5e9' : '#94a3b8'} />
                      <Text style={styles.userRowText}>{`${k.ime || ''} ${k.prezime || ''}`.trim() || k.email}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )
          )}

          {kolegaId && (
            <>
              <Text style={[styles.fieldLabel, { marginTop: ms(12) }]}>Radni sati (kolega)</Text>
              <TextInput
                style={styles.input}
                value={radniSatiKolega}
                onChangeText={setRadniSatiKolega}
                keyboardType="decimal-pad"
                placeholder="npr. 2"
              />
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Utrošeni materijal</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={utroseniMaterijal}
            onChangeText={setUtroseniMaterijal}
            placeholder="Upiši utrošeni materijal (npr. osigurač 10A x2, kontaktor, vijci...)"
            multiline
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Fotografije</Text>
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
          <Text style={styles.sectionTitle}>Status</Text>
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

            {workOrder.status === 'draft' && (
              <TouchableOpacity
                style={[styles.secondaryButton, { marginTop: ms(8), backgroundColor: '#10b981', borderColor: '#10b981' }]}
                onPress={async () => {
                  Alert.alert(
                    'Potpisivanje radnog naloga',
                    'Želiš li potpisati i označiti radni nalog kao poslano?',
                    [
                      { text: 'Odustani', style: 'cancel' },
                      {
                        text: 'Potpiši',
                        onPress: async () => {
                          try {
                            const signerName = `${user?.ime || ''} ${user?.prezime || ''}`.trim() || user?.email || 'Serviser';
                            const signRes = await workOrdersAPI.sign(workOrder._id || workOrder.id, {
                              signedByName: signerName,
                              sendNow: true,
                            });
                            const signed = signRes?.data?.data;
                            setWorkOrder(signed); // Ažuriraj lokalni state
                            Alert.alert('Uspjeh', `Radni nalog ${signed?.workOrderNumber || ''} je potpisan i označen kao poslan.`);
                          } catch (err) {
                            Alert.alert('Greška', err?.response?.data?.message || err?.message || 'Potpis nije uspio');
                          }
                        }
                      }
                    ]
                  );
                }}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#fff', paddingTop: ms(50), paddingBottom: ms(15), paddingHorizontal: ms(20), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e5e5e5' },
  headerTitle: { fontSize: ms(19), fontWeight: '700', color: '#1f2937' },
  content: { flex: 1 },
  card: { backgroundColor: '#fff', padding: ms(16), marginTop: ms(12), borderRadius: ms(12), shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  elevatorHero: { alignItems: 'center', marginTop: ms(12) },
  elevatorBadgeLarge: { paddingHorizontal: ms(16), paddingVertical: ms(10), borderRadius: ms(14), borderWidth: 2, backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  elevatorBadgeLargeText: { fontSize: ms(18), fontWeight: '800', color: '#111827' },
  sectionTitle: { fontSize: ms(17), fontWeight: '800', color: '#111827' },
  actionIconBtn: { paddingHorizontal: ms(6), paddingVertical: ms(4) },
  primaryButton: {
    marginTop: ms(20),
    marginHorizontal: ms(20),
    backgroundColor: '#2563eb',
    borderRadius: ms(10),
    padding: ms(14),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(8),
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: ms(15),
  },
  workOrderButton: {
    marginTop: ms(12),
    marginHorizontal: ms(20),
    backgroundColor: '#059669',
    borderRadius: ms(10),
    padding: ms(14),
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
    marginHorizontal: ms(20),
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
    borderColor: '#e5e7eb',
    borderRadius: ms(8),
    padding: ms(12),
    fontSize: ms(15),
    color: '#1f2937',
    backgroundColor: '#f9fafb',
  },
  textArea: {
    minHeight: ms(100),
    textAlignVertical: 'top',
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
    paddingHorizontal: ms(12),
    paddingVertical: ms(8),
    borderRadius: ms(10),
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  statusChipActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  statusChipText: {
    fontSize: ms(14),
    color: '#111827',
    fontWeight: '600',
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



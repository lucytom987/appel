import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, BackHandler, Image, Modal, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { elevatorDB, userDB, serviceDB } from '../database/db';
import { serviceWorkOrdersAPI, servicesAPI } from '../services/api';
import ImageViewer from 'react-native-image-zoom-viewer';
import SignatureModal from '../components/SignatureModal';
import { useAuth } from '../context/AuthContext';

export default function ServiceDetailsScreen({ route, navigation }) {
  const { service: routeService } = route.params;
  const { user, isOnline, serverAwake } = useAuth();
  const online = Boolean(isOnline && serverAwake);
  const [service, setService] = useState(routeService);
  const [activePhotoUrl, setActivePhotoUrl] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [serviceWorkOrder, setServiceWorkOrder] = useState(null);
  const [loadingServiceWorkOrder, setLoadingServiceWorkOrder] = useState(false);
  const [creatingServiceWorkOrder, setCreatingServiceWorkOrder] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [pendingSignWorkOrderId, setPendingSignWorkOrderId] = useState(null);
  const [signingLoading, setSigningLoading] = useState(false);

  const serviceId = routeService?._id || routeService?.id;

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return true;
        }
        return false;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  useFocusEffect(
    useCallback(() => {
      if (!serviceId) return;
      try {
        const fresh = serviceDB.getById(serviceId);
        if (fresh) {
          setService((prev) => ({
            ...prev,
            ...fresh,
            // Zadrži dodatne servisere iz stanja ako ih lokalni zapis nema
            dodatniServiseri: fresh.dodatniServiseri ?? prev?.dodatniServiseri,
          }));
        }
      } catch (e) {
        console.log('ServiceDetails refresh failed', e?.message);
      }
    }, [serviceId])
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const loadServiceWorkOrder = async () => {
        if (!serviceId || !online) {
          if (active) {
            setServiceWorkOrder(null);
            setLoadingServiceWorkOrder(false);
          }
          return;
        }

        setLoadingServiceWorkOrder(true);
        try {
          const res = await serviceWorkOrdersAPI.getByService(serviceId);
          if (active) setServiceWorkOrder(res?.data?.data || null);
        } catch (err) {
          const status = err?.status || err?.response?.status;
          if (status !== 404) {
            console.log('Greška pri dohvaćanju servisnog naloga:', err?.message);
          }
          if (active) setServiceWorkOrder(null);
        } finally {
          if (active) setLoadingServiceWorkOrder(false);
        }
      };

      loadServiceWorkOrder();
      return () => {
        active = false;
      };
    }, [serviceId, online])
  );

  const elevator = elevatorDB.getById(service?.elevatorId);

  const checklistItems = Array.isArray(service.checklist) ? service.checklist : [];
  const notePhotos = Array.isArray(service?.notePhotos) ? service.notePhotos : [];
  const serviceWorkOrderStatusLabel = (status) => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'draft') return 'NACRT';
    if (normalized === 'signed') return 'POTPISAN';
    if (normalized === 'sent') return 'POSLAN';
    return String(status || '').toUpperCase();
  };

  const serviserValue = (() => {
    const raw = service?.serviserID;
    if (!raw) return '-';

    // Ako je objekt, probaj ime/prezime
    if (typeof raw === 'object') {
      const ime = raw.ime || raw.firstName || '';
      const prezime = raw.prezime || raw.lastName || '';
      const full = `${ime} ${prezime}`.trim();
      if (full) return full;
      if (raw._id) {
        const found = userDB.getById(raw._id);
        if (found) {
          const f = `${found.ime || found.firstName || ''} ${found.prezime || found.lastName || ''}`.trim();
          if (f) return f;
        }
      }
      return '-';
    }

    // Ako je string/ID, pokušaj naći korisnika
    if (typeof raw === 'string' || typeof raw === 'number') {
      const idStr = String(raw);
      const found = userDB.getById(idStr);
      if (found) {
        const full = `${found.ime || found.firstName || ''} ${found.prezime || found.lastName || ''}`.trim();
        if (full) return full;
        if (found.email) return found.email;
      }
      // fallback: skrati ID
      return idStr.length > 8 ? `${idStr.slice(0, 8)}…` : idStr;
    }

    return String(raw);
  })();

  const dodatniServiseriValue = (() => {
    const rawList = service?.dodatniServiseri || service?.additionalServicers || service?.helpers;
    if (!rawList || (Array.isArray(rawList) && rawList.length === 0)) return '-';

    const ids = Array.isArray(rawList) ? rawList : [rawList];
    const labels = ids
      .map((raw) => {
        if (!raw) return null;
        if (typeof raw === 'object') {
          const ime = raw.ime || raw.firstName || '';
          const prezime = raw.prezime || raw.lastName || '';
          const full = `${ime} ${prezime}`.trim();
          if (full) return full;
          const id = raw._id || raw.id;
          if (id) {
            const found = userDB.getById(id);
            if (found) {
              const f = `${found.ime || found.firstName || ''} ${found.prezime || found.lastName || ''}`.trim();
              if (f) return f;
              if (found.email) return found.email;
            }
          }
          return null;
        }
        const idStr = String(raw);
        const found = userDB.getById(idStr);
        if (found) {
          const full = `${found.ime || found.firstName || ''} ${found.prezime || found.lastName || ''}`.trim();
          if (full) return full;
          if (found.email) return found.email;
        }
        return idStr.length > 8 ? `${idStr.slice(0, 8)}…` : idStr;
      })
      .filter(Boolean);

    if (!labels.length) return '-';
    const uniq = Array.from(new Set(labels));
    return uniq.join(', ');
  })();

  // Pronađi sve servise na adresi za isti datum
  const findServicesOnAddressAndDate = () => {
    if (!elevator) return [];
    
    const serviceDate = service.datum ? new Date(service.datum).toISOString().split('T')[0] : '';
    const allServices = serviceDB.getAll() || [];
    
    return allServices.filter(svc => {
      if (!serviceDate) return false;
      const svcDate = new Date(svc.datum).toISOString().split('T')[0];
      if (svcDate !== serviceDate) return false;
      
      const svcElevator = elevatorDB.getById(svc.elevatorId);
      if (!svcElevator) return false;
      
      const svcStreet = (svcElevator.ulica || '').trim().toLowerCase();
      const svcCity = (svcElevator.mjesto || '').trim().toLowerCase();
      const currentStreet = (elevator.ulica || '').trim().toLowerCase();
      const currentCity = (elevator.mjesto || '').trim().toLowerCase();
      
      return svcStreet === currentStreet && svcCity === currentCity;
    });
  };

  const handleDeleteService = async (deleteAll = false) => {
    setDeleteLoading(true);
    try {
      let servicesToDelete = [];
      
      if (deleteAll) {
        servicesToDelete = findServicesOnAddressAndDate();
      } else {
        servicesToDelete = [service];
      }
      
      if (servicesToDelete.length === 0) {
        Alert.alert('Greška', 'Nema servisa za brisanje');
        setDeleteLoading(false);
        return;
      }
      
      let successCount = 0;
      let failCount = 0;
      
      for (const svc of servicesToDelete) {
        const svcId = svc._id || svc.id;
        try {
          // Pokušaj obrisati sa servera ako je synced
          if (svc.synced) {
            try {
              await servicesAPI.delete(svcId);
            } catch (err) {
              console.log('API delete failed, marking locally deleted', err);
            }
          }
          
          // Obriši iz lokalnog DB-a
          serviceDB.delete(svcId);
          successCount++;
        } catch (err) {
          console.error('Local delete failed for service', svcId, err);
          failCount++;
        }
      }
      
      const message = deleteAll
        ? `Obrisano ${successCount} servisa na adresi za taj datum`
        : `Servis obrisan`;
      
      Alert.alert('Uspjeh', message, [
        { text: 'OK', onPress: () => {
          setDeleteLoading(false);
          navigation.goBack();
        } }
      ]);
    } catch (error) {
      console.error('Delete error:', error);
      Alert.alert('Greška', 'Greška pri brisanju servisa: ' + error.message);
      setDeleteLoading(false);
    }
  };

  const handleCreateServiceWorkOrder = async () => {
    if (!serviceId) return;
    if (!online) {
      Alert.alert('Offline', 'Za generiranje radnog naloga servisa potrebna je internet veza.');
      return;
    }

    if (serviceWorkOrder?.viewUrl) {
      navigation.navigate('WebViewScreen', {
        url: serviceWorkOrder.viewUrl,
        title: `RN ${serviceWorkOrder.workOrderNumber || ''}`,
      });
      return;
    }

    setCreatingServiceWorkOrder(true);
    try {
      const res = await serviceWorkOrdersAPI.createFromService(serviceId);
      const wo = res?.data?.data;
      setServiceWorkOrder(wo || null);
      Alert.alert('Radni nalog servisa', 'Draft radni nalog servisa je kreiran.');
    } catch (err) {
      Alert.alert('Greška', err?.response?.data?.message || err?.message || 'Kreiranje radnog naloga servisa nije uspjelo.');
    } finally {
      setCreatingServiceWorkOrder(false);
    }
  };

  const handleDeleteServiceWorkOrder = () => {
    const woId = serviceWorkOrder?._id || serviceWorkOrder?.id;
    if (!woId) return;

    Alert.alert('Obriši radni nalog servisa', 'Sigurno želiš obrisati ovaj radni nalog servisa?', [
      { text: 'Odustani', style: 'cancel' },
      {
        text: 'Obriši',
        style: 'destructive',
        onPress: async () => {
          try {
            await serviceWorkOrdersAPI.delete(woId);
            setServiceWorkOrder(null);
            Alert.alert('Obrisano', 'Radni nalog servisa je obrisan.');
          } catch (err) {
            Alert.alert('Greška', err?.response?.data?.message || err?.message || 'Brisanje nije uspjelo.');
          }
        },
      },
    ]);
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
      const signRes = await serviceWorkOrdersAPI.sign(woId, {
        signedByName: signerName,
        sendNow: true,
        signatureImage: servicerSignature || undefined,
        customerSignatureImage: customerSignature || undefined,
        customerAbsent: customerAbsent || false,
      });
      const signed = signRes?.data?.data;
      setServiceWorkOrder(signed || null);
      setShowSignatureModal(false);
      setPendingSignWorkOrderId(null);
      Alert.alert('Radni nalog servisa potpisan i poslan', `Broj: ${signed?.workOrderNumber || ''}`);
    } catch (err) {
      Alert.alert('Greška', err?.response?.data?.message || err?.message || 'Potpis nije uspio');
    } finally {
      setSigningLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.navigate('Services');
          }
        }}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Detalji servisa</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={() => navigation.navigate('EditService', { service, onSave: (updated) => setService(updated) })}>
            <Ionicons name="create-outline" size={22} color="#2563eb" />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => {
              const servicesOnAddress = findServicesOnAddressAndDate();
              const hasMultiple = servicesOnAddress.length > 1;
              
              const options = [
                { text: 'Otkaži', style: 'cancel' },
                {
                  text: 'Obriši samo ovaj',
                  style: 'destructive',
                  onPress: () => handleDeleteService(false)
                }
              ];
              
              if (hasMultiple) {
                options.splice(1, 0, {
                  text: `Obriši sve ${servicesOnAddress.length} na adresi`,
                  style: 'destructive',
                  onPress: () => handleDeleteService(true)
                });
              }
              
              Alert.alert('Obriši servis', 'Odaberite opciju:', options);
            }}
            disabled={deleteLoading}
          >
            <Ionicons name={deleteLoading ? "hourglass" : "trash-outline"} size={22} color={deleteLoading ? "#9ca3af" : "#ef4444"} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Dizalo</Text>
            {elevator?.brojDizala ? (
              <View style={styles.elevatorBadge}>
                <Text style={styles.elevatorBadgeText}>{elevator.brojDizala}</Text>
              </View>
            ) : null}
          </View>
          <DetailRow label="Stranka" value={elevator?.nazivStranke} />
          <DetailRow
            label="Adresa"
            value={elevator ? `${elevator.ulica || ''}${elevator.mjesto ? `, ${elevator.mjesto}` : ''}` : ''}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Servis</Text>
          <DetailRow
            label="Datum"
            value={service?.datum ? new Date(service.datum).toLocaleDateString('hr-HR') : '-'}
          />
          {service?.sljedeciServis && (
            <DetailRow
              label="Sljedeći servis"
              value={new Date(service.sljedeciServis).toLocaleDateString('hr-HR')}
            />
          )}
          <DetailRow label="Serviser" value={serviserValue} />
          <DetailRow label="Dodatni serviseri" value={dodatniServiseriValue} />
          <DetailRow label="Utrošeni materijal" value={service?.utroseniMaterijal || '-'} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Radni nalog servisa</Text>
          {loadingServiceWorkOrder ? (
            <View style={styles.inlineInfoRow}>
              <ActivityIndicator size="small" color="#2563eb" />
              <Text style={styles.inlineInfoText}>Učitavam radni nalog servisa...</Text>
            </View>
          ) : serviceWorkOrder ? (
            <>
              <DetailRow label="Broj" value={serviceWorkOrder.workOrderNumber || '-'} />
              <DetailRow label="Status" value={serviceWorkOrderStatusLabel(serviceWorkOrder.status)} />

              <View style={styles.woActionsRow}>
                <TouchableOpacity
                  style={styles.woActionBtn}
                  onPress={() => navigation.navigate('WebViewScreen', {
                    url: serviceWorkOrder.viewUrl,
                    title: `RN ${serviceWorkOrder.workOrderNumber || ''}`,
                  })}
                >
                  <Ionicons name="eye-outline" size={17} color="#1d4ed8" />
                  <Text style={styles.woActionBtnText}>Pregled</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.woActionBtn}
                  onPress={() => navigation.navigate('WebViewScreen', {
                    url: serviceWorkOrder.downloadUrl,
                    title: `PDF ${serviceWorkOrder.workOrderNumber || ''}`,
                  })}
                >
                  <Ionicons name="download-outline" size={17} color="#1d4ed8" />
                  <Text style={styles.woActionBtnText}>PDF</Text>
                </TouchableOpacity>
              </View>

              {serviceWorkOrder.status === 'draft' && (
                <TouchableOpacity style={styles.signButton} onPress={() => openSignatureFlow(serviceWorkOrder._id || serviceWorkOrder.id)}>
                  <Ionicons name="create-outline" size={18} color="#fff" />
                  <Text style={styles.signButtonText}>Potpiši i pošalji</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.deleteWoButton} onPress={handleDeleteServiceWorkOrder}>
                <Ionicons name="trash-outline" size={16} color="#9f1239" />
                <Text style={styles.deleteWoButtonText}>Obriši radni nalog servisa</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.createWoButton} onPress={handleCreateServiceWorkOrder} disabled={creatingServiceWorkOrder}>
              {creatingServiceWorkOrder ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="document-text-outline" size={18} color="#fff" />
              )}
              <Text style={styles.createWoButtonText}>{creatingServiceWorkOrder ? 'Kreiram...' : 'Kreiraj radni nalog servisa'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {!!service?.napomene && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Napomene</Text>
            <Text style={styles.notes}>{String(service.napomene)}</Text>
          </View>
        )}

        {notePhotos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Fotografije</Text>
            <Text style={styles.photoCountText}>{notePhotos.length} slika</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll}>
              {notePhotos.map((photo, idx) => (
                <View key={idx} style={styles.photoThumbnailWrapper}>
                  <TouchableOpacity onPress={() => setActivePhotoUrl(photo.url)}>
                    <Image source={{ uri: photo.url }} style={styles.photoThumbnail} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

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

        {checklistItems.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Checklist</Text>
            {checklistItems.map((item, idx) => {
              const labelMap = {
                lubrication: 'Podmazivanje',
                ups_check: 'Provjera UPS-a',
                voice_comm: 'Govorna veza',
                shaft_cleaning: 'Čišćenje šahta',
                drive_check: 'Provjera pog. stroja',
                brake_check: 'Provjera kočnice',
                cable_inspection: 'Inspekcija užeta',
                engine_check: 'Provjera motora',
                door_system: 'Sustav vrata',
                emergency_brake: 'Sigurnosna kočnica',
                control_panel: 'Kontrolna ploča',
                safety_devices: 'Sigurnosne naprave',
                lighting: 'Rasvjeta',
              };

              const rawKey = typeof item?.stavka === 'string' ? item.stavka : '';
              const fallback = rawKey.replace(/_/g, ' ');
              const label = labelMap[rawKey] || fallback || '-';
              const checked = item?.provjereno ?? item?.provjereno;
              const isChecked = checked === 1 || checked === true;
              const note = typeof item?.napomena === 'string' ? item.napomena.trim() : '';
              const hasStatus = (rawKey === 'ups_check' || rawKey === 'voice_comm') && (note === 'radi' || note === 'ne_radi');

              return (
                <View key={idx} style={styles.checkItem}>
                  <Ionicons
                    name={isChecked ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={isChecked ? '#10b981' : '#9ca3af'}
                  />
                  <Text style={styles.checkLabel}>{label}</Text>
                  {hasStatus && (
                    <View style={[styles.statusBadge, note === 'radi' ? styles.statusBadgeOk : styles.statusBadgeFail]}>
                      <Text style={styles.statusBadgeText}>{note === 'radi' ? 'Radi' : 'Ne radi'}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      <SignatureModal
        visible={showSignatureModal}
        signerName={`${user?.ime || ''} ${user?.prezime || ''}`.trim() || user?.email || 'Serviser'}
        signerId={user?._id || user?.id || ''}
        customerName={elevator?.nazivStranke || elevator?.kontaktOsoba?.ime || ''}
        onConfirm={handleSignatureConfirm}
        onCancel={() => {
          setShowSignatureModal(false);
          setPendingSignWorkOrderId(null);
        }}
        loading={signingLoading}
      />
    </SafeAreaView>
  );
}

function DetailRow({ label, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || '-'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    backgroundColor: '#fff',
    paddingTop: 46,
    paddingBottom: 12,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#1f2937' },
  content: { flex: 1 },
  section: { backgroundColor: '#fff', padding: 16, marginTop: 12 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  detailLabel: { fontSize: 14, color: '#6b7280' },
  detailValue: { fontSize: 14, color: '#1f2937', fontWeight: '500' },
  notes: { fontSize: 14, color: '#4b5563', lineHeight: 20 },
  createWoButton: {
    marginTop: 8,
    backgroundColor: '#0f766e',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  createWoButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  inlineInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineInfoText: {
    color: '#475569',
    fontSize: 13,
  },
  woActionsRow: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
  },
  woActionBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  woActionBtnText: {
    color: '#1d4ed8',
    fontWeight: '700',
    fontSize: 13,
  },
  signButton: {
    marginTop: 10,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  signButtonText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  deleteWoButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#fbcfe8',
    backgroundColor: '#fff1f2',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  deleteWoButtonText: {
    color: '#9f1239',
    fontWeight: '700',
    fontSize: 13,
  },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  checkLabel: { fontSize: 14, color: '#1f2937' },
  elevatorBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#e0e7ff' },
  elevatorBadgeText: { fontSize: 13, fontWeight: '700', color: '#1f2937' },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    marginLeft: 'auto',
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
  },
  photoThumbnail: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  photoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  photoModalClose: {
    position: 'absolute',
    top: 40,
    right: 20,
    padding: 8,
    zIndex: 2,
  },
  photoViewer: {
    flex: 1,
    width: '100%',
  },
});

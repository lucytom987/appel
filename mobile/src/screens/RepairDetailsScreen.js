import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, BackHandler, Image, ActivityIndicator, Modal, Linking, KeyboardAvoidingView, Platform, LayoutAnimation, UIManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

const safeText = (value, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).trim();
  return normalized || fallback;
};

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

const formatHalfHourInput = (value) => {
  const numeric = Number.parseFloat(String(value));
  if (!Number.isFinite(numeric) || numeric < 0) return '';
  const totalMinutes = Math.round(numeric * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return String(hours);
  if (minutes === 30) return `${hours}.30`;
  return String((totalMinutes / 60).toFixed(2));
};

const parseHalfHourInput = (value) => {
  const raw = String(value || '').trim().toLowerCase().replace('h', '');
  if (!raw) return null;

  if (raw.includes(':')) {
    const [hoursStr, minutesStr] = raw.split(':');
    const hours = Number.parseInt(hoursStr, 10);
    const minutes = Number.parseInt(minutesStr, 10);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes < 0) return null;
    return hours + (minutes / 60);
  }

  const normalized = raw.replace(',', '.');
  if (normalized.includes('.')) {
    const [hoursPart, minutesPartRaw] = normalized.split('.');
    const hours = Number.parseInt(hoursPart || '0', 10);
    const minutesPart = String(minutesPartRaw || '').trim();

    if (!Number.isFinite(hours)) return null;
    if (!minutesPart || minutesPart === '0' || minutesPart === '00') return hours;
    if (minutesPart === '30' || minutesPart === '3' || minutesPart === '5' || minutesPart === '50') return hours + 0.5;

    const fallback = Number.parseFloat(normalized);
    return Number.isFinite(fallback) && fallback >= 0 ? fallback : null;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
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

  const completedByLabel = (() => {
    if (repairData?.status !== 'completed' && !repairData?.completedBy && !repairData?.completedByName) {
      return '';
    }

    if (repairData?.completedByName) {
      return repairData.completedByName;
    }

    if (repairData?.completedBy && typeof repairData.completedBy === 'object') {
      const full = `${repairData.completedBy?.ime || ''} ${repairData.completedBy?.prezime || ''}`.trim();
      return full || repairData.completedBy?.email || '';
    }

    if (typeof repairData?.completedBy === 'string') {
      const found = userDB.getById(repairData.completedBy);
      if (found) {
        const full = `${found?.ime || ''} ${found?.prezime || ''}`.trim();
        return full || found?.email || '';
      }
      return repairData.completedBy;
    }

    return '';
  })();

  const completedAtLabel = (() => {
    const rawDate = repairData?.completedAt || repairData?.datumPopravka;
    if (!rawDate || repairData?.status !== 'completed') return '';
    const parsed = new Date(rawDate);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleString('hr-HR');
  })();

  const workOrderCreatedLabel = (() => {
    if (!workOrder) return '';
    const raw = workOrder.created_at || workOrder.updated_at || workOrder.sentAt || workOrder.signedAt || null;
    if (!raw) return '-';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString('hr-HR');
  })();

  const reporterLabel = (() => {
    if (repairData?.status !== 'pending' && !repairData?.trebaloBi) return '';
    
    // Prvo provjeravamo "Pozivatelja" ako je ekspicitno upisao
    if (repairData?.Pozivatelj) return repairData.Pozivatelj;
    if (repairData?.pozivatelj) return repairData.pozivatelj;
    
    // Ako nema Pozivatelja, koristimo onoga koji je upisao popravak
    if (repairData?.prijavio) return repairData.prijavio;
    
    // Fallback: ako je serviserID objekt s imenom
    if (repairData?.serviserID && typeof repairData.serviserID === 'object') {
      const full = `${repairData.serviserID?.ime || ''} ${repairData.serviserID?.prezime || ''}`.trim();
      return full || repairData.serviserID?.email || '';
    }
    
     // Ako je serviserID string ID, trebam ga lookupaiti u userDB
     if (repairData?.serviserID && typeof repairData.serviserID === 'string') {
       const user = userDB.getById(repairData.serviserID);
       if (user) {
         const full = `${user?.ime || ''} ${user?.prezime || ''}`.trim();
         return full || user?.email || '';
       }
     }

    return '';
  })();

  const reportedAtLabel = (() => {
    if (repairData?.status !== 'pending' && !repairData?.trebaloBi) return '';
    const rawDate = repairData?.datumPrijave || repairData?.datumKvara;
    if (!rawDate) return '';
    const parsed = new Date(rawDate);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleString('hr-HR');
  })();

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
  const [radniNalogPotpisVrsta, setRadniNalogPotpisVrsta] = useState(
    repairData.radniNalogPotpisVrsta === 'digital' || repairData.radniNalogPotpisVrsta === 'paper'
      ? repairData.radniNalogPotpisVrsta
      : null
  );
  const [saving, setSaving] = useState(false);
  const [workOrder, setWorkOrder] = useState(null);
  const [loadingWorkOrder, setLoadingWorkOrder] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [pendingSignWorkOrderId, setPendingSignWorkOrderId] = useState(null);
  const [signingLoading, setSigningLoading] = useState(false);
  const [creatingWorkOrder, setCreatingWorkOrder] = useState(false);
  const [creatingWorkOrderSeconds, setCreatingWorkOrderSeconds] = useState(0);
  const [showCreateWorkOrderCountdown, setShowCreateWorkOrderCountdown] = useState(false);
  const [createWorkOrderCountdownSeconds, setCreateWorkOrderCountdownSeconds] = useState(5);
  const [pendingWorkOrderRepairId, setPendingWorkOrderRepairId] = useState(null);
  const [deletingWorkOrder, setDeletingWorkOrder] = useState(false);
  const [deletingRepair, setDeletingRepair] = useState(false);
  const [showWorkOrderMenu, setShowWorkOrderMenu] = useState(false);
  const [showFlowModal, setShowFlowModal] = useState(false);
  const [flowLoadingSigner, setFlowLoadingSigner] = useState(false);
  const [flowSignerName, setFlowSignerName] = useState('');
  const [flowSignerAt, setFlowSignerAt] = useState(null);
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
        ? formatHalfHourInput(detailedHours[index])
        : (index === 0 && repairData.radniSati?.kolega != null ? formatHalfHourInput(repairData.radniSati.kolega) : ''),
    }));
  })();
  const [additionalServicers, setAdditionalServicers] = useState(initialAdditionalServicers);
  const [radniSatiGlavni, setRadniSatiGlavni] = useState(
    repairData.radniSati?.glavni != null ? formatHalfHourInput(repairData.radniSati.glavni) : '1'
  );
  const [utroseniMaterijal, setUtroseniMaterijal] = useState(repairData.utroseniMaterijal || '');
  const [materijalStavke, setMaterijalStavke] = useState([{ naziv: '', kolicina: '', jedinica: '' }]);
  const [expandedSections, setExpandedSections] = useState(() => ({
    materijal: Boolean(String(repairData.utroseniMaterijal || '').trim()),
    fotografije: Boolean((repair?.photos || repairData?.photos || []).length),
    serviseri: Boolean(initialAdditionalServicers.length),
  }));
  const isRepairLocked = workOrder?.status === 'sent';
  const hasMaterialContent = materijalStavke.some((stavka) => String(stavka.naziv || '').trim() || String(stavka.kolicina || '').trim() || String(stavka.jedinica || '').trim())
    || Boolean(String(utroseniMaterijal || '').trim());
  const hasAdditionalServicersContent = additionalServicers.some((entry) => entry.userId || String(entry.hours || '').trim());
  const hasPhotosContent = photos.length > 0;
  const canCreateWorkOrder = Boolean(
    online
    && status === 'completed'
    && !radniNalogPotpisan
    && !workOrder
    && !isRepairLocked
  );
  const signatureTypeLabel = (() => {
    if (!radniNalogPotpisan) return '';
    if (radniNalogPotpisVrsta === 'digital') return 'Digitalno';
    if (radniNalogPotpisVrsta === 'paper') return 'Papirnato';
    return workOrder ? 'Digitalno' : 'Papirnato';
  })();

  const selectedFlow = repairData || {};
  const selectedFlowRepairId = selectedFlow?._id || selectedFlow?.id;

  const formatDateTime = (value) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleString('hr-HR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const composeFlowValue = (name, dateValue) => {
    const resolvedName = safeText(name, '').trim();
    const resolvedDate = formatDateTime(dateValue);
    if (resolvedName && resolvedDate) return `${resolvedName} • ${resolvedDate}`;
    if (resolvedName) return resolvedName;
    if (resolvedDate) return resolvedDate;
    return '-';
  };

  const resolveUserName = (value) => {
    if (!value) return '';
    if (typeof value === 'object') {
      const full = `${safeText(value.ime)} ${safeText(value.prezime)}`.trim();
      return full || safeText(value.email) || safeText(value._id || value.id);
    }
    const id = String(value);
    const found = userDB.getById(id);
    if (found) {
      const full = `${safeText(found.ime)} ${safeText(found.prezime)}`.trim();
      return full || safeText(found.email) || id;
    }
    return id;
  };

  const flowReportedAt = selectedFlow?.datumPrijave || selectedFlow?.datumKvara || null;
  const flowReportedBy = (() => {
    if (!selectedFlowRepairId) return '-';
    return composeFlowValue(resolveUserName(selectedFlow?.serviserID), flowReportedAt);
  })();

  const flowCaller = composeFlowValue(
    safeText(selectedFlow?.pozivatelj || selectedFlow?.Pozivatelj || selectedFlow?.prijavio, ''),
    flowReportedAt
  );

  const flowAssignedTechnician = (() => {
    const fromLinked = resolveUserName(selectedFlow?.poslanMajstorId);
    const name = fromLinked || safeText(selectedFlow?.poslanMajstorIme, '');
    if (!name) return '-';
    const assignedAt = selectedFlow?.poslanMajstorAt || selectedFlow?.datumPrijave || null;
    return composeFlowValue(name, assignedAt);
  })();

  const flowResolvedBy = (() => {
    if (selectedFlow?.status !== 'completed') return '-';
    const resolvedName = safeText(selectedFlow?.completedByName) || resolveUserName(selectedFlow?.completedBy) || '';
    const resolvedAt = selectedFlow?.completedAt || selectedFlow?.datumPopravka || null;
    return composeFlowValue(resolvedName, resolvedAt);
  })();

  const flowSignedBy = (() => {
    if (!selectedFlow?.radniNalogPotpisan) return '-';
    if (flowLoadingSigner) return 'Učitavam...';
    if (flowSignerName || flowSignerAt) {
      return composeFlowValue(flowSignerName, flowSignerAt);
    }
    const signatureType = String(selectedFlow?.radniNalogPotpisVrsta || '').toLowerCase();
    const fallbackName = signatureType === 'paper' ? 'Papirnato potpisano' : 'Potpisano';
    return composeFlowValue(fallbackName, selectedFlow?.updated_at || selectedFlow?.azuriranDatum || null);
  })();

  useEffect(() => {
    const isNewArchitecture = Boolean(global?.nativeFabricUIManager);
    if (Platform.OS === 'android' && !isNewArchitecture && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    if (!creatingWorkOrder) {
      setCreatingWorkOrderSeconds(0);
      return;
    }

    const timer = setInterval(() => {
      setCreatingWorkOrderSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [creatingWorkOrder]);

  useEffect(() => {
    if (!showCreateWorkOrderCountdown || !pendingWorkOrderRepairId) {
      setCreateWorkOrderCountdownSeconds(5);
      return;
    }

    const timer = setInterval(() => {
      setCreateWorkOrderCountdownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [showCreateWorkOrderCountdown, pendingWorkOrderRepairId]);

  useEffect(() => {
    if (!showCreateWorkOrderCountdown || !pendingWorkOrderRepairId) return;
    if (createWorkOrderCountdownSeconds > 0) return;

    const executeCreate = async () => {
      setShowCreateWorkOrderCountdown(false);
      setCreatingWorkOrder(true);
      try {
        const draftRes = await workOrdersAPI.createFromRepair(pendingWorkOrderRepairId);
        const newWorkOrder = draftRes?.data?.data;
        setWorkOrder(newWorkOrder);
      } catch (err) {
        Alert.alert('Greška', err?.response?.data?.message || err?.message || 'Kreiranje radnog naloga nije uspjelo');
      } finally {
        setPendingWorkOrderRepairId(null);
        setCreatingWorkOrder(false);
        setCreateWorkOrderCountdownSeconds(5);
      }
    };

    executeCreate();
  }, [createWorkOrderCountdownSeconds, showCreateWorkOrderCountdown, pendingWorkOrderRepairId]);

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
      const currentUserId = user?._id || user?.id;
      const routeRepairCompanyId = repairData?.companyId || repair?.companyId || null;
      const elevatorCompanyId = elevator?.companyId || elevator?._companyId || null;
      const currentCompanyId = user?.companyId || user?.company?._id || user?.company?.id || routeRepairCompanyId || elevatorCompanyId || null;
      const normalizeRole = (role) => {
        const r = String(role || '').toLowerCase();
        if (r === 'technician') return 'serviser';
        if (r === 'manager') return 'menadzer';
        return r;
      };
      const filterOutCurrent = (arr = [], enforceKnownCompany = true) => (Array.isArray(arr) ? arr : []).filter((u) => {
        const userId = u?._id || u?.id;
        if (!userId || userId === currentUserId) return false;

        const role = normalizeRole(u?.uloga || u?.role);
        const isTechnician = role === 'serviser';
        if (!isTechnician) return false;

        const isActive = !(u?.aktivan === false || u?.aktivan === 0 || String(u?.aktivan).toLowerCase() === 'false');
        if (!isActive) return false;

        if (!currentCompanyId) return !enforceKnownCompany;
        const userCompanyId = u?.companyId || u?.company?._id || u?.company?.id || null;
        return Boolean(userCompanyId) && String(userCompanyId) === String(currentCompanyId);
      });

      try {
        if (online) {
          const res = await usersAPI.getLite();
          const data = res.data?.data || res.data || [];
          // Online endpoint je tenant-scoped po JWT-u, ne trebamo dodatno filtrirati po companyId.
          const filtered = (Array.isArray(data) ? data : []).filter((u) => {
            const userId = u?._id || u?.id;
            if (!userId || userId === currentUserId) return false;
            const role = normalizeRole(u?.uloga || u?.role);
            const isActive = !(u?.aktivan === false || u?.aktivan === 0 || String(u?.aktivan).toLowerCase() === 'false');
            return (role === 'serviser' || role === 'technician') && isActive;
          });
          try {
            userDB.bulkInsert(filtered);
          } catch (cacheErr) {
            console.log('Cache users failed', cacheErr?.message);
          }
          setKorisnici(filtered);
        } else {
          // Offline: fail-closed. Ako ne znamo firmu, ne prikazuj nikoga.
          setKorisnici(filterOutCurrent(userDB.getAll(), true));
        }
      } catch (e) {
        console.log('Load users failed', e?.message);
        setKorisnici(filterOutCurrent(userDB.getAll(), true));
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchUsers();
  }, [online, user, repairData?.companyId, repair?.companyId, elevator?.companyId, elevator?._companyId]);

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
    if (isRepairLocked) return;
    if (additionalServicers.length >= MAX_ADDITIONAL_SERVICERS) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAdditionalServicers((prev) => [...prev, { userId: null, hours: '' }]);
    setShowKolegePickerIndex(additionalServicers.length);
  };

  const removeAdditionalServicer = (index) => {
    if (isRepairLocked) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAdditionalServicers((prev) => prev.filter((_, idx) => idx !== index));
    setShowKolegePickerIndex((prev) => (prev === index ? null : prev != null && prev > index ? prev - 1 : prev));
  };

  const updateAdditionalServicerHours = (index, hours) => {
    if (isRepairLocked) return;
    setAdditionalServicers((prev) => prev.map((entry, idx) => (
      idx === index ? { ...entry, hours } : entry
    )));
  };

  const toggleExpandableSection = (section) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const adjustHoursValue = (currentValue, delta, onChange) => {
    if (isRepairLocked) return;
    const parsed = parseHalfHourInput(currentValue);
    const base = Number.isFinite(parsed) ? parsed : 0;
    const next = Math.max(0, Math.round((base + delta) * 2) / 2);
    onChange(formatHalfHourInput(next));
  };

  const renderHoursControl = (value, onChange, placeholder = '0') => (
    <View style={styles.hoursStepperRow}>
      <TouchableOpacity
        style={[styles.hoursStepperBtn, isRepairLocked && styles.disabledAction]}
        onPress={() => adjustHoursValue(value, -0.5, onChange)}
        disabled={isRepairLocked}
        activeOpacity={0.8}
      >
        <Ionicons name="remove" size={18} color="#334155" />
      </TouchableOpacity>

      <TextInput
        style={styles.hoursStepperInput}
        value={value}
        onChangeText={onChange}
        editable={!isRepairLocked}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
      />

      <View style={styles.hoursStepperSuffix}>
        <Text style={styles.hoursStepperSuffixText}>h</Text>
      </View>

      <TouchableOpacity
        style={[styles.hoursStepperBtn, isRepairLocked && styles.disabledAction]}
        onPress={() => adjustHoursValue(value, 0.5, onChange)}
        disabled={isRepairLocked}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={18} color="#334155" />
      </TouchableOpacity>
    </View>
  );

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
      setRadniNalogPotpisan(true);
      setRadniNalogPotpisVrsta('digital');
      setRepairData((prev) => ({ ...prev, radniNalogPotpisan: true, radniNalogPotpisVrsta: 'digital' }));
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

  const cancelCreateWorkOrderCountdown = () => {
    setShowCreateWorkOrderCountdown(false);
    setPendingWorkOrderRepairId(null);
    setCreateWorkOrderCountdownSeconds(5);
  };

  const handleDeleteWorkOrder = () => {
    const woId = workOrder?._id || workOrder?.id;
    if (!woId) return;

    Alert.alert(
      'Obriši radni nalog',
      `Sigurno želiš obrisati radni nalog ${workOrder?.workOrderNumber || ''}?`,
      [
        { text: 'Odustani', style: 'cancel' },
        {
          text: 'Obriši',
          style: 'destructive',
          onPress: async () => {
            setDeletingWorkOrder(true);
            try {
              await workOrdersAPI.delete(woId);
              setWorkOrder(null);
              setRadniNalogPotpisan(false);
              setRadniNalogPotpisVrsta(null);
              setRepairData((prev) => ({ ...prev, radniNalogPotpisan: false, radniNalogPotpisVrsta: null }));
              Alert.alert('Obrisano', 'Radni nalog je obrisan. Popravak je ponovno otključan za uređivanje.');
            } catch (err) {
              Alert.alert('Greška', err?.response?.data?.message || err?.message || 'Brisanje radnog naloga nije uspjelo');
            } finally {
              setDeletingWorkOrder(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteRepair = () => {
    const id = repairData._id || repairData.id;
    if (!id) return;

    Alert.alert(
      'Obriši popravak',
      'Sigurno želiš obrisati ovaj popravak?',
      [
        { text: 'Odustani', style: 'cancel' },
        {
          text: 'Obriši',
          style: 'destructive',
          onPress: async () => {
            setDeletingRepair(true);
            try {
              if (online && !String(id).startsWith('local_')) {
                await repairsAPI.delete(id);
              }
              repairDB.delete(id);
              Alert.alert('Obrisano', 'Popravak je obrisan.', [
                {
                  text: 'OK',
                  onPress: () => {
                    if (navigation.canGoBack()) {
                      navigation.goBack();
                    } else {
                      navigation.navigate('Repairs', { activeList: returnTo, filter });
                    }
                  },
                },
              ]);
            } catch (err) {
              Alert.alert('Greška', err?.response?.data?.message || err?.message || 'Brisanje popravka nije uspjelo');
            } finally {
              setDeletingRepair(false);
            }
          },
        },
      ]
    );
  };

  const saveRepair = async ({ showSuccessAlert = true } = {}) => {
    if (isRepairLocked) {
      Alert.alert('Zaključano', 'Popravak se više ne može uređivati jer je radni nalog potpisan i poslan.');
      return { success: false, repairId: null };
    }

    const id = repairData._id || repairData.id;
    const wasCompleted = repairData.status === 'completed';
    const existsInDB = repairDB.getById(id);
    const isLocalId = String(id || '').startsWith('local_');

    const glavniSati = parseHalfHourInput(radniSatiGlavni);
    const cleanedAdditionalServicers = additionalServicers
      .map((entry) => ({
        userId: entry.userId,
        hours: parseHalfHourInput(entry.hours),
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
    const existingCompletedById = typeof repairData.completedBy === 'object'
      ? (repairData.completedBy?._id || repairData.completedBy?.id || null)
      : (repairData.completedBy || null);
    const existingCompletedByName = (() => {
      if (repairData.completedByName) return repairData.completedByName;
      if (repairData.completedBy && typeof repairData.completedBy === 'object') {
        const full = `${repairData.completedBy?.ime || ''} ${repairData.completedBy?.prezime || ''}`.trim();
        return full || repairData.completedBy?.email || '';
      }
      if (typeof repairData.completedBy === 'string') {
        const found = userDB.getById(repairData.completedBy);
        if (found) {
          const full = `${found?.ime || ''} ${found?.prezime || ''}`.trim();
          return full || found?.email || '';
        }
      }
      return '';
    })();
    const completionTimestamp = status === 'completed'
      ? (wasCompleted
        ? (repairData.completedAt || repairData.datumPopravka || new Date().toISOString())
        : new Date().toISOString())
      : null;
    const completionUserId = status === 'completed'
      ? (wasCompleted
        ? (existingCompletedById || null)
        : (user?._id || user?.id || existingCompletedById || null)
      )
      : null;
    const completionName = status === 'completed'
      ? (wasCompleted
        ? existingCompletedByName
        : (`${user?.ime || ''} ${user?.prezime || ''}`.trim() || user?.email || existingCompletedByName || '')
      )
      : null;

    const effectiveSignatureType = radniNalogPotpisan
      ? (workOrder ? 'digital' : (radniNalogPotpisVrsta || 'paper'))
      : null;

    const payload = {
      id,
      elevatorId: repairData.elevatorId,
      opisKvara,
      opisPopravka,
      status,
      trebaloBi: isTrebaloBi,
      radniNalogPotpisan,
      radniNalogPotpisVrsta: effectiveSignatureType,
      dodatniServiseri: cleanedAdditionalServicers.map((entry) => entry.userId),
      radniSati: {
        glavni: glavniSati,
        kolega: cleanedAdditionalServicers[0]?.hours ?? null,
        dodatni: cleanedAdditionalServicers.map((entry) => entry.hours),
      },
      utroseniMaterijal: materijalTekst,
      photos,
      pozivatelj: repairData.pozivatelj || repairData.Pozivatelj || repairData.prijavio || '',
      prijavio: repairData.prijavio || repairData.pozivatelj || repairData.Pozivatelj || '',
      kontaktTelefon: repairData.kontaktTelefon || '',
      primioPoziv: repairData.primioPoziv || '',
      poslanMajstorId: typeof repairData.poslanMajstorId === 'object'
        ? (repairData.poslanMajstorId?._id || repairData.poslanMajstorId?.id || null)
        : (repairData.poslanMajstorId || null),
      poslanMajstorIme: repairData.poslanMajstorIme || '',
      completedBy: completionUserId,
      completedByName: completionName,
      completedAt: completionTimestamp,
      updated_at: Date.now(),
    };

    setSaving(true);
    try {
      const onlineNow = online;
      let finalRepairId = id;
      const shouldCreateOnServer = onlineNow && (isLocalId || !existsInDB);

      if (!existsInDB && !shouldCreateOnServer) {
        repairDB.insert({ ...repairData, ...payload, synced: 0, sync_status: 'dirty' });
        setRepairData((prev) => ({ ...prev, ...payload, synced: 0, sync_status: 'dirty' }));
      } else {
        if (!onlineNow) {
          repairDB.update(id, { ...repairData, ...payload, synced: 0, sync_status: 'dirty' });
          setRepairData((prev) => ({ ...prev, ...payload, synced: 0, sync_status: 'dirty' }));
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
            } else {
              throw new Error('Server nije vratio ID za spremljeni popravak');
            }
          } else {
            const response = await repairsAPI.update(id, payload);
            const updated = response.data?.data || response.data;
            repairDB.update(id, { ...repairData, ...updated, synced: 1, sync_status: 'synced' });
            setRepairData((prev) => ({ ...prev, ...updated, synced: 1, sync_status: 'synced' }));
            finalRepairId = id;
          }
        }
      }

      if (showSuccessAlert) {
        Alert.alert('Pohranjeno', 'Popravak je uspješno pohranjen.');
      }

      return { success: true, repairId: finalRepairId };
    } catch (e) {
      Alert.alert('Greška', e?.message || 'Nije moguće spremiti popravku');
      return { success: false, repairId: null };
    } finally {
      setSaving(false);
    }
  };

  const handleCreateWorkOrder = async () => {
    const currentId = repairData._id || repairData.id;

    if (!online) {
      Alert.alert('Offline', 'Potrebna je internet veza za kreiranje radnog naloga.');
      return;
    }

    if (workOrder) {
      if (workOrder?.viewUrl) {
        await openWorkOrderPreview(workOrder.viewUrl);
      }
      return;
    }

    if (status !== 'completed') {
      Alert.alert('Status nije završen', 'Za radni nalog status mora biti postavljen na "Završen".');
      return;
    }

    const saveResult = await saveRepair({ showSuccessAlert: false });
    if (!saveResult.success || !saveResult.repairId) return;

    const repairIdForWorkOrder = saveResult.repairId;

    if (String(repairIdForWorkOrder || '').startsWith('local_')) {
      Alert.alert(
        'Popravak nije sinkroniziran',
        'Radni nalog se može kreirati samo za popravke koji su sinkronizirani sa serverom.'
      );
      return;
    }

    setPendingWorkOrderRepairId(repairIdForWorkOrder);
    setCreateWorkOrderCountdownSeconds(5);
    setShowCreateWorkOrderCountdown(true);
  };

  const openWorkOrderMenu = () => {
    if (!workOrder) return;
    setShowWorkOrderMenu(true);
  };

  const openFlowPopup = async () => {
    setFlowSignerName('');
    setFlowSignerAt(null);
    setShowFlowModal(true);

    const repairId = selectedFlowRepairId;
    if (!online || !repairId || String(repairId).startsWith('local_') || !selectedFlow?.radniNalogPotpisan) {
      return;
    }

    setFlowLoadingSigner(true);
    try {
      const woRes = await workOrdersAPI.getByRepair(repairId);
      const wo = woRes?.data?.data;
      const signer = wo?.signedByName
        || (wo?.signedBy && typeof wo.signedBy === 'object'
          ? `${safeText(wo.signedBy.ime)} ${safeText(wo.signedBy.prezime)}`.trim() || safeText(wo.signedBy.email)
          : '')
        || '';
      setFlowSignerName(signer);
      setFlowSignerAt(wo?.signedAt || wo?.updated_at || wo?.sentAt || null);
    } catch (err) {
      setFlowSignerName('');
      setFlowSignerAt(null);
    } finally {
      setFlowLoadingSigner(false);
    }
  };

  const promptWorkOrderFlow = (repairId) => {
    setPendingWorkOrderRepairId(repairId);
    setCreateWorkOrderCountdownSeconds(5);
    setShowCreateWorkOrderCountdown(true);
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
    setRadniNalogPotpisVrsta(
      repairData.radniNalogPotpisVrsta === 'digital' || repairData.radniNalogPotpisVrsta === 'paper'
        ? repairData.radniNalogPotpisVrsta
        : null
    );
  }, [repairData.trebaloBi, repairData.status, repairData.radniNalogPotpisan, repairData.radniNalogPotpisVrsta, repairData.category, repairData.type]);

  const handleSave = async () => {
    await saveRepair({ showSuccessAlert: true });
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
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
        <Text style={styles.headerTitle} numberOfLines={1}>{`Popravak "${elevator?.brojDizala || 'Dizalo'}"`}</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('EditRepair', { repair: repairData })}
          disabled={isRepairLocked}
          style={isRepairLocked && styles.disabledAction}
        >
          <Ionicons name="create-outline" size={22} color="#1f2937" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? ms(90) : ms(2)}
      >
      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: ms(100) }}>
        {isRepairLocked && (
          <View style={[styles.card, styles.lockedBannerCard]}>
            <Ionicons name="lock-closed" size={18} color="#b45309" />
            <Text style={styles.lockedBannerText}>
              Ovaj popravak je zaključan jer je radni nalog potpisan i poslan.
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="warning-outline" size={18} color="#ef4444" />
            <Text style={styles.sectionTitle}>Kvar</Text>
          </View>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={opisKvara}
            onChangeText={setOpisKvara}
            editable={!isRepairLocked}
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
            editable={!isRepairLocked}
            placeholder="Opišite izvršeni popravak..."
            placeholderTextColor="#9ca3af"
            multiline
          />
        </View>

        <View style={styles.card}>
          <View style={[styles.sectionTitleRow, { justifyContent: 'space-between' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: ms(8) }}>
              <Ionicons name="time-outline" size={18} color="#2563eb" />
              <Text style={styles.sectionTitle}>Radni sati</Text>
            </View>
            <View style={{ flex: 1, marginLeft: ms(16) }}>
              {renderHoursControl(radniSatiGlavni, setRadniSatiGlavni, 'Upiši radne sate')}
            </View>
          </View>
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
          <TouchableOpacity style={styles.expandableHeader} onPress={() => toggleExpandableSection('materijal')}>
            <View style={styles.expandableTitleWrap}>
              <Ionicons name="cube-outline" size={18} color="#f59e0b" />
              <Text style={styles.sectionTitle}>Materijal</Text>
            </View>
            <Ionicons name={expandedSections.materijal ? 'chevron-up' : 'chevron-down'} size={18} color="#475569" />
          </TouchableOpacity>

          {expandedSections.materijal && (
            <>
              {materijalStavke.map((stavka, index) => (
                <View key={`mat-${index}`} style={styles.materijalRow}>
                  <TextInput
                    style={[styles.input, styles.materijalNaziv]}
                    value={stavka.naziv}
                    onChangeText={(text) => updateMaterijalStavka(index, 'naziv', text)}
                    editable={!isRepairLocked}
                    placeholder="Naziv"
                    placeholderTextColor="#9ca3af"
                  />
                  <TextInput
                    style={[styles.input, styles.materijalKolicina]}
                    value={stavka.kolicina}
                    onChangeText={(text) => updateMaterijalStavka(index, 'kolicina', text)}
                    editable={!isRepairLocked}
                    placeholder="Kol."
                    placeholderTextColor="#9ca3af"
                    keyboardType="decimal-pad"
                  />
                  <TextInput
                    style={[styles.input, styles.materijalJedinica]}
                    value={stavka.jedinica}
                    onChangeText={(text) => updateMaterijalStavka(index, 'jedinica', text)}
                    editable={!isRepairLocked}
                    placeholder="Jed."
                    placeholderTextColor="#9ca3af"
                  />
                  <TouchableOpacity style={[styles.removeMaterijalBtn, isRepairLocked && styles.disabledAction]} onPress={() => !isRepairLocked && removeMaterijalStavka(index)} disabled={isRepairLocked}>
                    <Ionicons name="close-circle" size={22} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={[styles.addMaterijalBtn, isRepairLocked && styles.disabledAction]} onPress={() => !isRepairLocked && addMaterijalStavka()} disabled={isRepairLocked}>
                <Ionicons name="add-circle-outline" size={18} color="#2563eb" />
                <Text style={styles.addMaterijalText}>Dodaj stavku materijala</Text>
              </TouchableOpacity>
              <Text style={[styles.fieldLabel, { marginTop: ms(12) }]}>Dodatna napomena (opcionalno)</Text>
              <TextInput
                style={[styles.input, { minHeight: ms(60), textAlignVertical: 'top' }]}
                value={utroseniMaterijal}
                onChangeText={setUtroseniMaterijal}
                editable={!isRepairLocked}
                placeholder="Npr. materijal donesen iz skladišta"
                placeholderTextColor="#9ca3af"
                multiline
              />
            </>
          )}
        </View>

        <View style={styles.card}>
          <TouchableOpacity style={styles.expandableHeader} onPress={() => toggleExpandableSection('serviseri')}>
            <View style={styles.expandableTitleWrap}>
              <Ionicons name="people-outline" size={18} color="#2563eb" />
              <Text style={styles.sectionTitle}>Dodatni serviseri</Text>
            </View>
            <Ionicons name={expandedSections.serviseri ? 'chevron-up' : 'chevron-down'} size={18} color="#475569" />
          </TouchableOpacity>

          {expandedSections.serviseri && (
            <>
              <View style={styles.additionalHeaderRow}>
                <Text style={[styles.fieldLabel, { marginBottom: 0, flex: 1 }]}>Po potrebi dodaj kolege</Text>
                {additionalServicers.length < MAX_ADDITIONAL_SERVICERS && (
                  <TouchableOpacity style={[styles.addKolegaButton, isRepairLocked && styles.disabledAction]} onPress={addAdditionalServicer} disabled={isRepairLocked}>
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
                      <TouchableOpacity style={[styles.removeKolegaInlineBtn, isRepairLocked && styles.disabledAction]} onPress={() => removeAdditionalServicer(index)} disabled={isRepairLocked}>
                        <Ionicons name="trash-outline" size={18} color="#ef4444" />
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity style={[styles.kolegaToggle, isRepairLocked && styles.disabledAction]} onPress={() => !isRepairLocked && toggleKolege(index)} disabled={isRepairLocked}>
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
                                  onPress={() => !isRepairLocked && selectKolega(index, kid)}
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
                    {renderHoursControl(entry.hours, (text) => updateAdditionalServicerHours(index, text), 'npr. 1.30')}
                  </View>
                );
              })}
            </>
          )}
        </View>

        <View style={styles.card}>
          <TouchableOpacity style={styles.expandableHeader} onPress={() => toggleExpandableSection('fotografije')}>
            <View style={styles.expandableTitleWrap}>
              <Ionicons name="camera-outline" size={18} color="#8b5cf6" />
              <Text style={styles.sectionTitle}>Fotografije</Text>
            </View>
            <Ionicons name={expandedSections.fotografije ? 'chevron-up' : 'chevron-down'} size={18} color="#475569" />
          </TouchableOpacity>

          {expandedSections.fotografije && (
            <>
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
                    if (isRepairLocked) return;
                    const result = await pickAndUploadPhoto();
                    if (result) {
                      setPhotos((prev) => [...prev, result]);
                    }
                  }}
                  disabled={uploadingPhoto || isRepairLocked}
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
                    if (isRepairLocked) return;
                    const result = await takePhotoWithCamera();
                    if (result) {
                      setPhotos((prev) => [...prev, result]);
                    }
                  }}
                  disabled={uploadingPhoto || isRepairLocked}
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
                          onPress={() => !isRepairLocked && setPhotos(photos.filter((_, i) => i !== idx))}
                          disabled={isRepairLocked}
                        >
                          <Ionicons name="close" size={16} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}
            </>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="flag-outline" size={18} color="#10b981" />
            <Text style={styles.sectionTitle}>Status i radni nalog</Text>
          </View>
          <TouchableOpacity
            style={[
              styles.statusToggleButton,
              status === 'completed' ? styles.statusToggleButtonCompleted : styles.statusToggleButtonPending,
              isRepairLocked && styles.disabledAction,
            ]}
            onPress={() => {
              if (isRepairLocked) return;
              setStatus((prev) => (prev === 'completed' ? 'pending' : 'completed'));
            }}
            disabled={isRepairLocked}
          >
            <Ionicons
              name={status === 'completed' ? 'checkmark-circle' : 'alert-circle'}
              size={18}
              color={status === 'completed' ? '#065f46' : '#991b1b'}
            />
            <Text style={[
              styles.statusToggleButtonText,
              status === 'completed' ? styles.statusToggleButtonTextCompleted : styles.statusToggleButtonTextPending,
            ]}>
              {status === 'completed' ? 'Završen' : 'Prijavljen'}
            </Text>
            <Ionicons name="swap-horizontal" size={16} color={status === 'completed' ? '#065f46' : '#991b1b'} />
          </TouchableOpacity>

          {status === 'pending' && (reporterLabel || reportedAtLabel) && (
            <TouchableOpacity style={styles.reporterAuditBoxCompact} onPress={openFlowPopup} activeOpacity={0.8}>
              <Ionicons name="person-add-outline" size={18} color="#dc2626" />
              <View style={{ flex: 1 }}>
                {reporterLabel ? (
                  <Text style={styles.reporterAuditText}>Prijavio: {reporterLabel}</Text>
                ) : null}
                {reportedAtLabel ? (
                  <Text style={styles.reporterAuditSubText}>Vrijeme prijave: {reportedAtLabel}</Text>
                ) : null}
              </View>
              <Ionicons name="information-circle-outline" size={18} color="#475569" />
            </TouchableOpacity>
          )}

          {status === 'completed' && (
            <View style={styles.statusActionsRow}>
              <TouchableOpacity
                style={[styles.toggleRow, styles.statusInlineToggle, radniNalogPotpisan && styles.toggleRowActive]}
                onPress={() => {
                  if (isRepairLocked) return;
                  setRadniNalogPotpisan((prev) => {
                    const next = !prev;
                    if (!next) {
                      setRadniNalogPotpisVrsta(null);
                    } else if (workOrder) {
                      setRadniNalogPotpisVrsta('digital');
                    } else {
                      setRadniNalogPotpisVrsta('paper');
                    }
                    return next;
                  });
                }}
                disabled={isRepairLocked}
              >
                <Ionicons name={radniNalogPotpisan ? 'checkbox' : 'square-outline'} size={20} color={radniNalogPotpisan ? '#10b981' : '#6b7280'} />
                <Text style={styles.toggleLabel}>Radni nalog potpisan</Text>
              </TouchableOpacity>

              {radniNalogPotpisan ? (
                <View style={styles.signatureTypeBadge}>
                  <Ionicons name={signatureTypeLabel === 'Digitalno' ? 'phone-portrait-outline' : 'document-text-outline'} size={14} color="#1e3a8a" />
                  <Text style={styles.signatureTypeBadgeText}>Potpis: {signatureTypeLabel}</Text>
                </View>
              ) : null}

              {canCreateWorkOrder && (
                <TouchableOpacity style={styles.inlineWorkOrderButton} onPress={handleCreateWorkOrder}>
                  <Ionicons name="document-text-outline" size={18} color="#fff" />
                  <Text style={styles.inlineWorkOrderButtonText}>Kreiraj radni nalog</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {status === 'completed' && (completedByLabel || completedAtLabel) && (
            <TouchableOpacity style={styles.completionAuditBox} onPress={openFlowPopup} activeOpacity={0.8}>
              <Ionicons name="person-circle-outline" size={18} color="#2563eb" />
              <View style={{ flex: 1 }}>
                {completedByLabel ? (
                  <Text style={styles.completionAuditText}>Odradio: {completedByLabel}</Text>
                ) : null}
                {completedAtLabel ? (
                  <Text style={styles.completionAuditSubText}>Vrijeme završetka: {completedAtLabel}</Text>
                ) : null}
              </View>
              <Ionicons name="information-circle-outline" size={18} color="#475569" />
            </TouchableOpacity>
          )}

          {online && loadingWorkOrder && status === 'completed' && (
            <View style={styles.inlineInfoRow}>
              <ActivityIndicator size="small" color="#2563eb" />
              <Text style={styles.inlineInfoText}>Učitavam radni nalog...</Text>
            </View>
          )}

          {online && !loadingWorkOrder && workOrder && (
            <TouchableOpacity
              activeOpacity={0.92}
              style={styles.inlineWorkOrderCard}
              onPress={openWorkOrderMenu}
              disabled={deletingWorkOrder || deletingRepair}
            >
              <View style={styles.inlineWorkOrderHeader}>
                <View style={styles.inlineWorkOrderTitleWrap}>
                  <Ionicons name="document-text" size={18} color="#2563eb" />
                  <Text style={styles.inlineWorkOrderTitle}>Radni nalog</Text>
                </View>
                <View style={styles.inlineWorkOrderRight}>
                  <View style={[
                    styles.inlineWorkOrderStatusBadge,
                    { backgroundColor: workOrder.status === 'draft' ? '#fef3c7' : workOrder.status === 'signed' ? '#d1fae5' : '#e0e7ff' },
                  ]}>
                    <Text style={[
                      styles.inlineWorkOrderStatusText,
                      { color: workOrder.status === 'draft' ? '#92400e' : workOrder.status === 'signed' ? '#065f46' : '#3730a3' },
                    ]}>
                      {workOrderStatusLabel(workOrder.status)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.workOrderMenuBtn, (deletingWorkOrder || deletingRepair) && styles.disabledAction]}
                    onPress={openWorkOrderMenu}
                    disabled={deletingWorkOrder || deletingRepair}
                  >
                    <Ionicons name="ellipsis-horizontal" size={18} color="#334155" />
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.inlineWorkOrderMeta}>
                <Text style={styles.inlineWorkOrderMetaStrong}>Broj:</Text> {workOrder.workOrderNumber}
              </Text>
              <Text style={styles.inlineWorkOrderMeta}>
                <Text style={styles.inlineWorkOrderMetaStrong}>Kreiran:</Text> {workOrderCreatedLabel}
              </Text>

              {workOrder.status === 'draft' && (
                <TouchableOpacity
                  style={styles.inlineSignButton}
                  onPress={() => openSignatureFlow(workOrder._id || workOrder.id)}
                >
                  <Ionicons name="create-outline" size={18} color="#fff" />
                  <Text style={styles.inlineSignButtonText}>Potpiši i označi kao poslano</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={[styles.primaryButton, isRepairLocked && styles.workOrderButtonDisabled]} onPress={handleSave} disabled={saving || isRepairLocked}>
          <Ionicons name="save-outline" size={18} color="#fff" />
          <Text style={styles.primaryButtonText}>{isRepairLocked ? 'Zaključano' : (saving ? 'Spremam...' : 'Spremi')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryButton, styles.dangerButtonSoft, { marginTop: ms(12) }, (deletingRepair || deletingWorkOrder) && styles.disabledAction]}
          onPress={handleDeleteRepair}
          disabled={deletingRepair || deletingWorkOrder}
        >
          {deletingRepair ? (
            <ActivityIndicator size="small" color="#9f1239" />
          ) : (
            <Ionicons name="trash-outline" size={18} color="#9f1239" />
          )}
          <Text style={[styles.secondaryText, styles.dangerButtonSoftText]}>Obriši popravak</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>

      <Modal
        visible={showFlowModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFlowModal(false)}
      >
        <View style={styles.flowModalOverlay}>
          <View style={styles.flowModalCard}>
            <View style={styles.flowModalHeader}>
              <Text style={styles.flowModalTitle}>Tok prijave i izvedbe</Text>
              <TouchableOpacity onPress={() => setShowFlowModal(false)}>
                <Ionicons name="close" size={22} color="#334155" />
              </TouchableOpacity>
            </View>

            <View style={styles.flowModalRows}>
              <FlowRow label="Prijavio kvar" value={flowReportedBy} icon="person-add-outline" />
              <FlowRow label="Pozivatelj" value={flowCaller} icon="person-outline" />
              <FlowRow label="Majstor poslan" value={flowAssignedTechnician} icon="construct-outline" />
              <FlowRow label="Riješio kvar" value={flowResolvedBy} icon="checkmark-done-outline" />
              <FlowRow label="Potpisao" value={flowSignedBy} icon="create-outline" />
            </View>

            {flowLoadingSigner && (
              <View style={styles.flowModalLoadingRow}>
                <ActivityIndicator size="small" color="#2563eb" />
                <Text style={styles.flowModalLoadingText}>Provjeravam tko je potpisao...</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
      </KeyboardAvoidingView>

      <SignatureModal
        visible={showSignatureModal}
        signerName={`${user?.ime || ''} ${user?.prezime || ''}`.trim() || user?.email || 'Serviser'}
        signerId={user?._id || user?.id || ''}
        customerName={elevator?.nazivStranke || elevator?.kontaktOsoba?.ime || ''}
        onConfirm={handleSignatureConfirm}
        onCancel={() => { setShowSignatureModal(false); setPendingSignWorkOrderId(null); }}
        loading={signingLoading}
      />

      <Modal visible={creatingWorkOrder} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingTitle}>Kreiram radni nalog...</Text>
            <Text style={styles.loadingSubtitle}>Pričekaj malo, obrada traje duže na sporijoj mreži.</Text>
            <Text style={styles.loadingTimer}>Trajanje: {creatingWorkOrderSeconds}s</Text>
          </View>
        </View>
      </Modal>

      <Modal visible={showCreateWorkOrderCountdown} transparent animationType="fade" onRequestClose={cancelCreateWorkOrderCountdown}>
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <Ionicons name="document-text-outline" size={30} color="#2563eb" />
            <Text style={styles.loadingTitle}>Kreiram radni nalog...</Text>
            <Text style={styles.loadingSubtitle}>Ako si se predomislio, možeš odustati prije početka kreiranja.</Text>
            <Text style={styles.loadingTimer}>Pokretanje za: {createWorkOrderCountdownSeconds}s</Text>
            <TouchableOpacity style={styles.countdownCancelButton} onPress={cancelCreateWorkOrderCountdown}>
              <Text style={styles.countdownCancelButtonText}>Odustani</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showWorkOrderMenu} transparent animationType="fade" onRequestClose={() => setShowWorkOrderMenu(false)}>
        <View style={styles.workOrderMenuOverlay}>
          <View style={styles.workOrderMenuCard}>
            <View style={styles.workOrderMenuHeader}>
              <Text style={styles.workOrderMenuTitle}>Radni nalog {workOrder?.workOrderNumber || ''}</Text>
              <TouchableOpacity onPress={() => setShowWorkOrderMenu(false)} style={styles.workOrderMenuCloseBtn}>
                <Ionicons name="close" size={20} color="#334155" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.workOrderMenuActionBtn}
              onPress={() => {
                setShowWorkOrderMenu(false);
                if (workOrder?.viewUrl) openWorkOrderPreview(workOrder.viewUrl);
              }}
            >
              <Ionicons name="eye-outline" size={18} color="#1d4ed8" />
              <Text style={styles.workOrderMenuActionText}>Pregled</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.workOrderMenuActionBtn}
              onPress={() => {
                setShowWorkOrderMenu(false);
                if (workOrder?.downloadUrl) openWorkOrderDownload(workOrder.downloadUrl);
              }}
            >
              <Ionicons name="download-outline" size={18} color="#1d4ed8" />
              <Text style={styles.workOrderMenuActionText}>Preuzmi PDF</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.workOrderMenuActionBtn, styles.workOrderMenuDangerBtn]}
              onPress={() => {
                setShowWorkOrderMenu(false);
                handleDeleteWorkOrder();
              }}
            >
              <Ionicons name="trash-outline" size={18} color="#b91c1c" />
              <Text style={styles.workOrderMenuDangerText}>Obriši radni nalog</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function FlowRow({ label, value, icon }) {
  return (
    <View style={styles.flowRow}>
      <View style={styles.flowLabelWrap}>
        <Ionicons name={icon} size={16} color="#334155" />
        <Text style={styles.flowLabel}>{label}</Text>
      </View>
      <Text style={styles.flowValue}>{value || '-'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#fff', paddingTop: ms(50), paddingBottom: ms(15), paddingHorizontal: ms(20), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e5e5e5' },
  headerTitle: { flex: 1, textAlign: 'center', marginHorizontal: ms(10), fontSize: ms(18), fontWeight: '700', color: '#1f2937' },
  content: { flex: 1 },
  card: { backgroundColor: '#fff', padding: ms(12), marginTop: ms(12), marginHorizontal: ms(12), borderRadius: ms(14), shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  sectionTitle: { fontSize: ms(16), fontWeight: '700', color: '#111827' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: ms(8), marginBottom: ms(8) },
  expandableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  expandableTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(8),
  },
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
  dangerButtonSoft: {
    backgroundColor: '#ffe4e6',
    borderColor: '#fda4af',
  },
  dangerButtonSoftText: {
    color: '#be123c',
  },
  workOrderMenuBtn: {
    marginLeft: ms(8),
    width: ms(30),
    height: ms(30),
    borderRadius: ms(15),
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  workOrderMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    justifyContent: 'center',
    paddingHorizontal: ms(22),
  },
  workOrderMenuCard: {
    backgroundColor: '#fff',
    borderRadius: ms(18),
    padding: ms(14),
  },
  workOrderMenuHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: ms(8),
  },
  workOrderMenuTitle: {
    flex: 1,
    textAlign: 'center',
    marginLeft: ms(24),
    fontSize: ms(20),
    fontWeight: '800',
    color: '#0f172a',
  },
  workOrderMenuCloseBtn: {
    width: ms(28),
    height: ms(28),
    borderRadius: ms(14),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  workOrderMenuActionBtn: {
    marginTop: ms(10),
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#eff6ff',
    borderRadius: ms(12),
    paddingVertical: ms(12),
    paddingHorizontal: ms(12),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(8),
  },
  workOrderMenuActionText: {
    fontSize: ms(15),
    fontWeight: '700',
    color: '#1d4ed8',
  },
  workOrderMenuDangerBtn: {
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  workOrderMenuDangerText: {
    fontSize: ms(15),
    fontWeight: '700',
    color: '#b91c1c',
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
  hoursInput: {
    flex: 1,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderRightWidth: 0,
  },
  hoursStepperRow: {
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: ms(10),
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    height: ms(42),
  },
  hoursStepperBtn: {
    width: ms(42),
    height: ms(42),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  hoursStepperInput: {
    flex: 1,
    textAlign: 'center',
    paddingVertical: 0,
    fontSize: ms(15),
    fontWeight: '700',
    color: '#1e293b',
    backgroundColor: 'transparent',
  },
  hoursStepperSuffix: {
    paddingHorizontal: ms(12),
    height: ms(42),
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  hoursStepperSuffixText: {
    fontSize: ms(16),
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
  statusActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(10),
    marginTop: ms(2),
    marginBottom: ms(4),
  },
  statusInlineToggle: {
    flex: 1,
    paddingVertical: ms(12),
    paddingHorizontal: ms(10),
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: ms(10),
    backgroundColor: '#f8fafc',
  },
  inlineWorkOrderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(8),
    paddingHorizontal: ms(12),
    paddingVertical: ms(12),
    borderRadius: ms(10),
    backgroundColor: '#0f766e',
  },
  inlineWorkOrderButtonText: {
    color: '#fff',
    fontSize: ms(13),
    fontWeight: '700',
  },
  toggleLabel: {
    fontSize: ms(15),
    color: '#111827',
  },
  signatureTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: ms(6),
    paddingHorizontal: ms(10),
    paddingVertical: ms(6),
    borderRadius: ms(999),
    backgroundColor: '#dbeafe',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  signatureTypeBadgeText: {
    fontSize: ms(12),
    fontWeight: '700',
    color: '#1e3a8a',
  },
  reporterAuditBox: {
    marginTop: ms(10),
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ms(8),
    paddingVertical: ms(10),
    paddingHorizontal: ms(12),
    borderRadius: ms(10),
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  reporterAuditBoxCompact: {
    marginTop: ms(2),
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ms(8),
    paddingVertical: ms(10),
    paddingHorizontal: ms(12),
    borderRadius: ms(10),
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  reporterAuditText: {
    fontSize: ms(14),
    fontWeight: '700',
    color: '#991b1b',
  },
  reporterAuditSubText: {
    marginTop: ms(2),
    fontSize: ms(12),
    color: '#dc2626',
  },
  completionAuditBox: {
    marginTop: ms(10),
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ms(8),
    paddingVertical: ms(10),
    paddingHorizontal: ms(12),
    borderRadius: ms(10),
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  completionAuditText: {
    fontSize: ms(14),
    fontWeight: '700',
    color: '#1e3a8a',
  },
  completionAuditSubText: {
    marginTop: ms(2),
    fontSize: ms(12),
    color: '#1d4ed8',
  },
  statusChoiceRow: {
    flexDirection: 'row',
    gap: ms(8),
    marginBottom: ms(6),
  },
  statusToggleButton: {
    marginBottom: ms(8),
    borderRadius: ms(12),
    borderWidth: 1.5,
    paddingHorizontal: ms(14),
    paddingVertical: ms(14),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(8),
  },
  statusToggleButtonPending: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  statusToggleButtonCompleted: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  statusToggleButtonText: {
    fontSize: ms(15),
    fontWeight: '800',
  },
  statusToggleButtonTextPending: {
    color: '#991b1b',
  },
  flowModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  flowModalCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    gap: 14,
  },
  flowModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  flowModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  flowModalRows: {
    gap: 10,
  },
  flowRow: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#f8fafc',
    gap: 8,
  },
  flowLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flowLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  flowValue: {
    fontSize: 14,
    color: '#0f172a',
    lineHeight: 20,
  },
  flowModalLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flowModalLoadingText: {
    fontSize: 13,
    color: '#475569',
  },
  statusToggleButtonTextCompleted: {
    color: '#065f46',
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
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: ms(20),
  },
  loadingCard: {
    width: '100%',
    maxWidth: ms(320),
    backgroundColor: '#fff',
    borderRadius: ms(14),
    paddingVertical: ms(20),
    paddingHorizontal: ms(16),
    alignItems: 'center',
  },
  loadingTitle: {
    marginTop: ms(12),
    fontSize: ms(16),
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
  loadingSubtitle: {
    marginTop: ms(8),
    fontSize: ms(13),
    color: '#475569',
    textAlign: 'center',
  },
  loadingTimer: {
    marginTop: ms(10),
    fontSize: ms(12),
    color: '#64748b',
    fontWeight: '600',
  },
  inlineInfoRow: {
    marginTop: ms(10),
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(8),
    paddingVertical: ms(10),
  },
  inlineInfoText: {
    fontSize: ms(13),
    color: '#64748b',
    fontWeight: '600',
  },
  inlineWorkOrderCard: {
    marginTop: ms(10),
    borderRadius: ms(12),
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    padding: ms(12),
  },
  inlineWorkOrderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: ms(8),
  },
  inlineWorkOrderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(8),
  },
  inlineWorkOrderTitle: {
    fontSize: ms(15),
    fontWeight: '800',
    color: '#1e3a8a',
  },
  inlineWorkOrderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(8),
  },
  inlineWorkOrderStatusBadge: {
    paddingHorizontal: ms(8),
    paddingVertical: ms(4),
    borderRadius: ms(6),
  },
  inlineWorkOrderStatusText: {
    fontSize: ms(11),
    fontWeight: '700',
  },
  inlineWorkOrderMeta: {
    fontSize: ms(13),
    color: '#374151',
    marginBottom: ms(4),
  },
  inlineWorkOrderMetaStrong: {
    fontWeight: '700',
  },
  inlineSignButton: {
    marginTop: ms(8),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(8),
    backgroundColor: '#10b981',
    borderRadius: ms(10),
    paddingVertical: ms(12),
  },
  inlineSignButtonText: {
    fontSize: ms(14),
    color: '#fff',
    fontWeight: '700',
  },
  countdownCancelButton: {
    marginTop: ms(16),
    paddingHorizontal: ms(18),
    paddingVertical: ms(10),
    borderRadius: ms(10),
    backgroundColor: '#e2e8f0',
  },
  countdownCancelButtonText: {
    fontSize: ms(14),
    fontWeight: '700',
    color: '#334155',
  },
  disabledAction: {
    opacity: 0.45,
  },
  lockedBannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(8),
    borderWidth: 1,
    borderColor: '#fcd34d',
    backgroundColor: '#fffbeb',
  },
  lockedBannerText: {
    flex: 1,
    fontSize: ms(13),
    color: '#92400e',
    fontWeight: '600',
  },
});



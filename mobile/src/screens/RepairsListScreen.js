import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  BackHandler,
  Modal,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { repairDB, elevatorDB, userDB, serviceDB } from '../database/db';
import { syncAll, getSyncRateLimitUntil, getSyncRateLimitMessage } from '../services/syncService';
import { useAuth } from '../context/AuthContext';
import { workOrdersAPI } from '../services/api';
import { formatElevatorLabel } from '../utils/elevatorLabel';

const safeText = (value, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  try {
    return String(value);
  } catch {
    return fallback;
  }
};

const normalizePhoneForCall = (value) => String(value || '').replace(/[^\d+]/g, '');
const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const buildElevatorDisplay = (elevator) => {
  const tip = elevator?.tip || elevator?.tipObjekta;
  const address = [safeText(elevator?.ulica), safeText(elevator?.mjesto)].filter(Boolean).join(', ').trim();
  const name = safeText(elevator?.nazivStranke);
  const elevatorLabel = formatElevatorLabel(elevator);
  const primary = tip === 'privreda'
    ? (name || address || 'Nepoznato dizalo')
    : (address || name || 'Nepoznato dizalo');
  const secondary = tip === 'privreda' ? address : name;
  const extra = elevatorLabel && elevatorLabel !== 'Dizalo' ? `Dizalo: ${elevatorLabel}` : '';
  return { primary, secondary, extra };
};

export default function RepairsListScreen({ navigation, route }) {
  const { isOnline, serverAwake } = useAuth();
  const online = Boolean(isOnline && serverAwake);
  const [repairs, setRepairs] = useState([]);
  const [filteredRepairs, setFilteredRepairs] = useState([]);
  const [trebaloBiList, setTrebaloBiList] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('pending');
  const [activeList, setActiveList] = useState('repairs'); // 'repairs' | 'trebalo'
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return { month: now.getMonth(), year: now.getFullYear() };
  });
  const [periodFilter, setPeriodFilter] = useState('all'); // 'current' | 'all'
  const [userMap] = useState({}); // placeholder, više se ne koristi u prikazu
  const [showFlowModal, setShowFlowModal] = useState(false);
  const [selectedRepairForFlow, setSelectedRepairForFlow] = useState(null);
  const [flowSignerName, setFlowSignerName] = useState('');
  const [flowSignerAt, setFlowSignerAt] = useState(null);
  const [flowLoadingSigner, setFlowLoadingSigner] = useState(false);

  const monthNames = [
    'Siječanj',
    'Veljača',
    'Ožujak',
    'Travanj',
    'Svibanj',
    'Lipanj',
    'Srpanj',
    'Kolovoz',
    'Rujan',
    'Listopad',
    'Studeni',
    'Prosinac',
  ];

  const changeMonth = (delta) => {
    setPeriod((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { month: next.getMonth(), year: next.getFullYear() };
    });
  };

  const handleMonthArrowPress = (delta) => {
    if (periodFilter === 'all') {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth() + delta, 1);
      setPeriod({ month: next.getMonth(), year: next.getFullYear() });
      setPeriodFilter('current');
      return;
    }

    changeMonth(delta);
  };

  const periodLabel = periodFilter === 'all' ? 'SVE' : `${monthNames[period.month]} ${period.year}`;

  const resolveElevatorForRepair = useCallback((item) => {
    const elevatorId = typeof item?.elevatorId === 'object' && item?.elevatorId !== null
      ? item.elevatorId._id || item.elevatorId.id
      : item?.elevatorId;

    let elevator = elevatorId ? elevatorDB.getById(elevatorId) : null;

    if (!elevator && typeof item?.elevatorId === 'object' && item?.elevatorId) {
      elevator = {
        brojDizala: item.elevatorId.brojDizala || undefined,
        brojDizalaOpis: item.elevatorId.brojDizalaOpis || undefined,
        nazivStranke: item.elevatorId.nazivStranke || 'Obrisano dizalo',
        ulica: item.elevatorId.ulica || '',
        mjesto: item.elevatorId.mjesto || '',
      };
    }

    if (!elevator) {
      elevator = {
        brojDizala: undefined,
        brojDizalaOpis: undefined,
        nazivStranke: 'Obrisano dizalo',
        ulica: '',
        mjesto: '',
      };
    }

    return elevator;
  }, []);

  const resolveUserNameForPrint = useCallback((value) => {
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
  }, []);

  const handlePrintRepairs = useCallback(async () => {
    try {
      const isMonthOnly = periodFilter !== 'all';
      const base = repairs
        .filter((r) => r && typeof r === 'object')
        .filter((r) => !r.trebaloBi)
        .filter((r) => {
          if (filter === 'pending') return r.status === 'pending';
          if (filter === 'nepotpisani') return !r.radniNalogPotpisan;
          return false;
        });

      const selected = base.filter((r) => {
        if (!isMonthOnly) return true;
        const raw = r?.datumPrijave || r?.datumKvara;
        if (!raw) return false;
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return false;
        return d.getMonth() === period.month && d.getFullYear() === period.year;
      });

      if (!selected.length) {
        Alert.alert('Nema podataka', 'Nema stavki za odabrani ispis.');
        return;
      }

      const rows = selected.map((item) => {
        const elevator = resolveElevatorForRepair(item);
        const naziv = safeText(elevator?.nazivStranke, '-').trim() || '-';
        const adresa = [safeText(elevator?.ulica), safeText(elevator?.mjesto)].filter(Boolean).join(', ').trim() || '-';
        const brojOpis = formatElevatorLabel(elevator) || '-';
        const opisKvara = safeText(item?.opisKvara, '-').trim() || '-';
        const opisPopravka = safeText(item?.opisPopravka, '-').trim() || '-';
        const prijavio = safeText(item?.prijavio, '').trim() || resolveUserNameForPrint(item?.serviserID) || '-';
        const pozivatelj = safeText(item?.pozivatelj || item?.Pozivatelj, '').trim();
        const telefon = safeText(item?.kontaktTelefon || item?.pozivateljTelefon, '').trim();
        const poslanMajstor = safeText(item?.poslanMajstorIme, '').trim() || resolveUserNameForPrint(item?.poslanMajstorId);
        const rijesio = safeText(item?.completedByName, '').trim() || resolveUserNameForPrint(item?.completedBy);
        const potpis = item?.radniNalogPotpisan
          ? (String(item?.radniNalogPotpisVrsta || '').toLowerCase() === 'paper' ? 'Papirnato' : 'Digitalno')
          : '';

        const flowSteps = [
          `Prijavio: ${prijavio || '-'}`,
          `Pozivatelj: ${pozivatelj || '-'}`,
          `Telefon: ${telefon || '-'}`,
          `Majstor: ${poslanMajstor || '-'}`,
          `Riješio: ${rijesio || '-'}`,
          `Potpis: ${potpis || '-'}`,
        ];

        return {
          naziv,
          adresa,
          brojOpis,
          opisKvara,
          opisPopravka,
          flowSteps,
        };
      });

      const statusTitle = filter === 'nepotpisani' ? 'Nepotpisani' : 'Prijavljeni';
      const scopeTitle = isMonthOnly ? `${monthNames[period.month]} ${period.year}` : 'Svi mjeseci';
      const generatedAt = `${new Date().toLocaleDateString('hr-HR')} ${new Date().toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit' })}`;

      const tableRows = rows.map((row, idx) => `
        <tr style="${idx % 2 === 0 ? 'background:#f8fafc;' : ''}">
          <td>${idx + 1}</td>
          <td>
            <div style="font-weight:700; color:#111827;">${escapeHtml(row.naziv)}</div>
            <div style="margin-top:2px; color:#4b5563; font-size:10px;">${escapeHtml(row.adresa)}</div>
          </td>
          <td>${escapeHtml(row.brojOpis)}</td>
          <td>${escapeHtml(row.opisKvara)}</td>
          <td>${escapeHtml(row.opisPopravka)}</td>
          <td>${row.flowSteps.map((step) => escapeHtml(step)).join('<br/>')}</td>
        </tr>
      `).join('');

      const html = `
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body { font-family: Arial, sans-serif; padding: 18px; color: #111827; }
              h1 { margin: 0 0 4px; font-size: 18px; }
              h2 { margin: 0 0 12px; font-size: 13px; color: #4b5563; font-weight: 500; }
              table { width: 100%; border-collapse: collapse; font-size: 11px; table-layout: fixed; }
              th, td { border: 1px solid #d1d5db; padding: 6px 8px; vertical-align: top; word-wrap: break-word; }
              th { background: #1f2937; color: white; text-align: left; }
              .meta { margin-top: 12px; font-size: 11px; color: #6b7280; }
            </style>
          </head>
          <body>
            <h1>Popravci - ${escapeHtml(statusTitle)}</h1>
            <h2>Period: ${escapeHtml(scopeTitle)} | Ukupno: ${rows.length}</h2>
            <table>
              <thead>
                <tr>
                  <th style="width:5%;">#</th>
                  <th style="width:22%;">Naziv i adresa</th>
                  <th style="width:11%;">Broj i opis dizala</th>
                  <th style="width:18%;">Opis kvara</th>
                  <th style="width:18%;">Opis popravka</th>
                  <th style="width:26%;">Tok prijave i izvedbe</th>
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>
            <div class="meta">Generirano: ${escapeHtml(generatedAt)}</div>
          </body>
        </html>
      `;

      await Print.printAsync({ html });
    } catch (e) {
      console.error('Greška pri printanju popravaka:', e);
      Alert.alert('Greška', 'Print nije uspio.');
    }
  }, [repairs, filter, period, monthNames, periodFilter, resolveElevatorForRepair, resolveUserNameForPrint]);

  const loadRepairs = useCallback(() => {
    try {
      const allRepairs = repairDB.getAll() || [];

      // Ne odbacuj zapise bez dizala: prikaži ih s placeholderom da korisnik zna da postoje
      const normalizeStatus = (s) => {
        if (s === 'čekanje' || s === 'cek') return 'pending';
        if (s === 'završen' || s === 'zavrsen') return 'completed';
        return s || 'pending';
      };

      const sorted = allRepairs
        .filter((r) => r && typeof r === 'object') // safety: drop malformed entries
        .filter((r) => {
          const elevatorId = typeof r.elevatorId === 'object' && r.elevatorId !== null
            ? r.elevatorId._id || r.elevatorId.id
            : r.elevatorId;

          const elevator = elevatorId ? elevatorDB.getById(elevatorId) : null;
          const elevatorDeleted = Boolean(
            (typeof r.elevatorId === 'object' && r.elevatorId?.is_deleted) ||
            (elevator && elevator.is_deleted)
          );

          // Ako je zapis popravka obrisan ili vezano dizalo obrisano/ne postoji, sakrij
          if (r.is_deleted) return false;
          if (elevatorDeleted) return false;
          if (elevatorId && !elevator) return false;
          return true;
        })
        .map((r) => {
          const rawStatus = String(r.status || '').toLowerCase();
          const wasInProgress = rawStatus === 'in_progress' || rawStatus === 'u tijeku' || rawStatus === 'u_tijeku';
          const normalizedStatus = wasInProgress ? 'pending' : normalizeStatus(r.status);

          const rawType = String(r.type || r.category || '').toLowerCase();
          const rawFlag = Boolean(
            r.trebaloBi || r.trebalo_bi || r.trebaloBI || r.trebalobi ||
            rawType === 'trebalobi' || rawType === 'trebalo_bi' || rawType === 'trebalo-bi' || rawType === 'trebalo' ||
            wasInProgress
          );

          return {
            ...r,
            status: normalizedStatus,
            trebaloBi: rawFlag,
            synced: r.synced === 0 ? 0 : 1, // default missing synced flag to synced
          };
        })
        .sort((a, b) => new Date(b.datumPrijave) - new Date(a.datumPrijave));

      setRepairs(sorted);
    } catch (error) {
      console.error('Greška pri učitavanju popravaka:', error);
      setRepairs([]);
    }
  }, []);

  useEffect(() => {
    loadRepairs();
    const unsubscribe = navigation.addListener('focus', loadRepairs);
    return unsubscribe;
  }, [navigation, loadRepairs]);

  // Ako se vraćamo iz detalja s traženim odabirom liste, postavi ga
  useEffect(() => {
    const desiredList = route?.params?.activeList;
    if (desiredList === 'trebalo' || desiredList === 'repairs') {
      setActiveList(desiredList);
    }
    const desiredFilter = route?.params?.filter;
    if (desiredFilter === 'pending' || desiredFilter === 'completed') {
      setFilter(desiredFilter);
    }
  }, [route?.params?.activeList, route?.params?.filter]);

  // Override hardware back to uvijek vrati na Home
  useEffect(() => {
    const handler = () => {
      navigation.navigate('Home');
      return true; // spriječi default goBack
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => sub.remove();
  }, [navigation]);

  const isInSelectedPeriod = useCallback((repair) => {
    if (periodFilter === 'all') return true;

    const datum = repair?.datumPrijave || repair?.datumKvara;
    if (!datum) return true; // prikaži ako nemamo datum
    const parsed = new Date(datum);
    if (Number.isNaN(parsed.getTime())) return true; // fallback ako je loš format
    return parsed.getMonth() === period.month && parsed.getFullYear() === period.year;
  }, [period, periodFilter]);

  const applyFilter = useCallback(() => {
    const periodFiltered = repairs.filter((r) => isInSelectedPeriod(r));

    const repairsOnly = periodFiltered.filter((r) => !r.trebaloBi);
    const trebalo = periodFiltered.filter((r) => r.trebaloBi);

    // U "Trebalo bi" listu dodaj i servisne napomene kako bi sve bilo na jednom mjestu.
    const serviceNoteItems = (serviceDB.getAll?.() || [])
      .filter((service) => service && typeof service === 'object')
      .filter((service) => !service.is_deleted)
      .map((service) => {
        const note = safeText(service.napomene || service.notes, '').trim();
        if (!note) return null;

        const rawElevatorId = typeof service.elevatorId === 'object' && service.elevatorId !== null
          ? service.elevatorId._id || service.elevatorId.id
          : service.elevatorId;
        const elevator = rawElevatorId ? elevatorDB.getById(rawElevatorId) : null;

        if (!elevator || elevator.is_deleted || elevator.status === 'neaktivan') {
          return null;
        }

        const serviceDate = service.datum || service.serviceDate || service.kreiranDatum || service.azuriranDatum;

        return {
          id: `service_note_${service._id || service.id}`,
          _id: `service_note_${service._id || service.id}`,
          elevatorId: rawElevatorId,
          opisKvara: note,
          napomene: note,
          status: 'pending',
          trebaloBi: true,
          isServiceNote: true,
          sourceServiceId: service._id || service.id,
          datumPrijave: serviceDate,
          synced: service.synced === 0 ? 0 : 1,
        };
      })
      .filter(Boolean)
      .filter((item) => isInSelectedPeriod(item));

    const mergedTrebalo = [...trebalo, ...serviceNoteItems].sort(
      (a, b) => new Date(b.datumPrijave || b.kreiranDatum || 0) - new Date(a.datumPrijave || a.kreiranDatum || 0)
    );
    const nepotpisani = periodFiltered.filter((r) => !r.trebaloBi && !r.radniNalogPotpisan);

    let filtered = repairsOnly;
    if (filter === 'pending') {
      filtered = repairsOnly.filter((r) => r.status === 'pending');
    } else if (filter === 'completed') {
      filtered = repairsOnly.filter((r) => r.status === 'completed');
    } else if (filter === 'nepotpisani') {
      filtered = nepotpisani;
    }

    setFilteredRepairs(filtered);
    setTrebaloBiList(mergedTrebalo);
  }, [repairs, filter, isInSelectedPeriod, periodFilter]);

  useEffect(() => {
    applyFilter();
  }, [applyFilter]);

  // Memoriranje pozicije scrolla je uklonjeno na zahtjev; lista se ponaša standardno

  const getStatusColor = (item) => {
    if (item?.trebaloBi) return '#f59e0b';
    if (item?.status === 'completed') return '#10b981';
    return '#ef4444';
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const synced = await syncAll();
      if (!synced && Date.now() < getSyncRateLimitUntil()) {
        Alert.alert('Sinkronizacija pauzirana', getSyncRateLimitMessage());
      }
      loadRepairs();
    } catch (e) {
      console.error('Greška pri syncu popravaka:', e);
    } finally {
      setRefreshing(false);
    }
  }, [loadRepairs]);

  const renderRepairItem = ({ item }) => {
    if (!item || typeof item !== 'object') {
      return (
        <View style={styles.repairCard}>
          <View style={styles.repairContent}>
            <Text style={styles.repairDescription}>
              {`Neispravan zapis popravka: ${safeText(item, '')}`}
            </Text>
          </View>
        </View>
      );
    }

    const elevator = resolveElevatorForRepair(item);

    const display = buildElevatorDisplay(elevator);

    const isServiceNote = Boolean(item.isServiceNote);
    const opisKvara = safeText(item.opisKvara, 'Bez opisa');
    const isSynced = Boolean(item.synced);

    const isTrebalo = Boolean(item.trebaloBi);
    const isResolvedTrebalo = isTrebalo && item.status === 'completed';
    const completedByLabel = (() => {
      if (item.status !== 'completed') return '';
      if (item.completedByName) return safeText(item.completedByName);

      if (item.completedBy && typeof item.completedBy === 'object') {
        const full = `${safeText(item.completedBy.ime)} ${safeText(item.completedBy.prezime)}`.trim();
        return full || safeText(item.completedBy.email);
      }

      if (typeof item.completedBy === 'string' && item.completedBy.trim()) {
        return item.completedBy;
      }

      return '';
    })();

    const reporterLabel = (() => {
      if (item.status !== 'pending') return '';
      
      // Prvo provjeravamo "Pozivatelja" ako je ekspicitno upisao
      if (item.Pozivatelj) return safeText(item.Pozivatelj);
      if (item.pozivatelj) return safeText(item.pozivatelj);
      
      // Ako nema Pozivatelja, koristimo onoga koji je upisao popravak
      if (item.prijavio) return safeText(item.prijavio);
      
      // Fallback: ako je serviserID objekt s imenom
      if (item.serviserID && typeof item.serviserID === 'object') {
        const full = `${safeText(item.serviserID.ime)} ${safeText(item.serviserID.prezime)}`.trim();
        return full || safeText(item.serviserID.email);
      }
      
       // Ako je serviserID string ID, trebam ga lookupaiti u userDB
       if (item.serviserID && typeof item.serviserID === 'string') {
         const user = userDB.getById(item.serviserID);
         if (user) {
           const full = `${safeText(user.ime)} ${safeText(user.prezime)}`.trim();
           return full || safeText(user.email);
         }
       }

      return '';
    })();

    const openFlowPopup = async () => {
      setSelectedRepairForFlow(item);
      setFlowSignerName('');
      setFlowSignerAt(null);
      setShowFlowModal(true);

      const repairId = item?._id || item?.id;
      if (!online || !repairId || String(repairId).startsWith('local_') || !item?.radniNalogPotpisan) {
        return;
      }

      setFlowLoadingSigner(true);
      try {
        const woRes = await workOrdersAPI.getByRepair(repairId);
        const wo = woRes?.data?.data;
        const signer = wo?.signedByName
          || (wo?.signedBy && typeof wo.signedBy === 'object' ? `${safeText(wo.signedBy.ime)} ${safeText(wo.signedBy.prezime)}`.trim() || safeText(wo.signedBy.email) : '')
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

    const reportedDateLabel = (() => {
      if (item.status !== 'pending') return '';
      const datum = item.datumPrijave || item.datumKvara;
      if (!datum) return '';
      const parsed = new Date(datum);
      if (Number.isNaN(parsed.getTime())) return '';
      return parsed.toLocaleDateString('hr-HR');
    })();

    return (
      <TouchableOpacity
        style={[styles.repairCard, { borderColor: getStatusColor(item) }]}
        onPress={() => {
          if (isServiceNote) {
            const service = serviceDB.getById?.(item.sourceServiceId);
            if (service) {
              navigation.navigate('ServiceDetails', { service });
              return;
            }

            navigation.navigate('ElevatorDetails', { elevator });
            return;
          }

          navigation.navigate(
            isTrebalo ? 'TrebaloBiDetails' : 'RepairDetails',
            {
              repair: item,
              returnTo: isTrebalo ? 'trebalo' : 'repairs',
              filter,
            }
          );
        }}
        activeOpacity={0.8}
      >
        <View style={styles.repairContent}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.elevatorName} numberOfLines={1}>{display.primary}</Text>
            </View>
            <View style={styles.iconRow}>
              <Ionicons
                name={isServiceNote
                  ? 'reader-outline'
                  : (isTrebalo
                    ? (isResolvedTrebalo ? 'checkbox' : 'square-outline')
                    : (item.radniNalogPotpisan ? 'document-text-outline' : 'document-outline'))}
                size={18}
                color={isServiceNote
                  ? '#2563eb'
                  : (isTrebalo
                    ? (isResolvedTrebalo ? '#16a34a' : '#f59e0b')
                    : (item.radniNalogPotpisan ? '#16a34a' : '#ef4444'))}
                style={{ marginRight: 8 }}
              />
              <Ionicons
                name={isSynced ? 'cloud-done-outline' : 'cloud-offline-outline'}
                size={18}
                color={isSynced ? '#16a34a' : '#f59e0b'}
              />
            </View>
          </View>

          {isServiceNote ? (
            <Text style={styles.serviceNoteLabel}>Servisna napomena</Text>
          ) : null}

          <Text style={styles.repairDescription} numberOfLines={3}>
            {opisKvara}
          </Text>

          {!isServiceNote && reporterLabel && reportedDateLabel ? (
            <TouchableOpacity style={styles.reporterRow} onPress={openFlowPopup} activeOpacity={0.75}>
              <Ionicons name="person-add-outline" size={15} color="#dc2626" />
              <Text style={styles.reporterText}>{reporterLabel} • {reportedDateLabel}</Text>
              <Ionicons name="information-circle-outline" size={15} color="#475569" />
            </TouchableOpacity>
          ) : null}

          {!isServiceNote && completedByLabel ? (
            <TouchableOpacity style={styles.completedByRow} onPress={openFlowPopup} activeOpacity={0.75}>
              <Ionicons name="person-circle-outline" size={15} color="#1d4ed8" />
              <Text style={styles.completedByText}>Odradio: {completedByLabel}</Text>
              <Ionicons name="information-circle-outline" size={15} color="#475569" />
            </TouchableOpacity>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const selectedFlow = selectedRepairForFlow || {};
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

  const flowCallerPhone = safeText(selectedFlow?.kontaktTelefon || selectedFlow?.pozivateljTelefon, '');
  const canShowPrint = activeList === 'repairs' && (filter === 'pending' || filter === 'nepotpisani');

  const handleCallCaller = useCallback(async () => {
    if (!flowCallerPhone) return;
    const dialValue = normalizePhoneForCall(flowCallerPhone);
    if (!dialValue) {
      Alert.alert('Poziv nije moguć', 'Broj telefona nije ispravnog formata.');
      return;
    }

    const telUrl = `tel:${dialValue}`;
    try {
      const canOpen = await Linking.canOpenURL(telUrl);
      if (!canOpen) {
        Alert.alert('Poziv nije moguć', 'Uređaj ne podržava direktno pozivanje.');
        return;
      }
      await Linking.openURL(telUrl);
    } catch (err) {
      Alert.alert('Greška', 'Ne mogu otvoriti biranje broja.');
    }
  }, [flowCallerPhone]);

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

  const renderEmptyState = (type) => (
    <View style={styles.emptyState}>
      <Ionicons name="construct-outline" size={64} color="#ccc" />
      <Text style={styles.emptyText}>
        {type === 'trebalo' ? 'Nema stavki "trebalo bi"' : 'Nema popravaka'}
      </Text>
      <Text style={styles.emptySubtext}>
        {type === 'trebalo'
          ? 'Dodajte stavke koje mogu pričekati sljedeći obilazak'
          : filter === 'pending'
            ? 'Nema prijavljenih popravaka'
            : 'Nema završenih popravaka'}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header s odabirom mjeseca/godine i SVE opcije */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('Home')}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <View style={styles.monthPicker}>
          <TouchableOpacity 
            style={[styles.chevronButton, periodFilter === 'all' && styles.periodAllButton]}
            onPress={() => setPeriodFilter(periodFilter === 'all' ? 'current' : 'all')}
          >
            <Text style={[styles.periodText, periodFilter === 'all' && styles.periodTextActive]}>
              {periodFilter === 'all' ? 'SVE' : '📅'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.chevronButton} onPress={() => handleMonthArrowPress(-1)}>
            <Ionicons name="chevron-back" size={20} color="#1f2937" />
          </TouchableOpacity>
          <Text style={styles.monthText}>{periodLabel}</Text>
          <TouchableOpacity style={styles.chevronButton} onPress={() => handleMonthArrowPress(1)}>
            <Ionicons name="chevron-forward" size={20} color="#1f2937" />
          </TouchableOpacity>
        </View>
        {canShowPrint ? (
          <TouchableOpacity onPress={handlePrintRepairs} style={styles.headerPrint}>
            <Ionicons name="print-outline" size={22} color="#0ea5e9" />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerPrintPlaceholder} />
        )}
      </View>

      {/* Filteri: popravci (pending/completed/nepotpisani) ili "trebalo bi" (ekskluzivno) */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[
            styles.filterToggle,
            activeList === 'repairs' && filter === 'pending' && styles.filterToggleRed,
            activeList === 'repairs' && filter === 'completed' && styles.filterToggleGreen,
            activeList === 'repairs' && filter === 'nepotpisani' && styles.filterTogglePurple,
            activeList !== 'repairs' && styles.filterToggleMuted,
          ]}
          onPress={() => {
            setActiveList('repairs');
            setFilter((prev) => {
              if (prev === 'pending') return 'completed';
              if (prev === 'completed') return 'nepotpisani';
              return 'pending';
            });
          }}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.filterToggleText,
              activeList === 'repairs' && filter === 'pending' && styles.filterToggleTextRed,
              activeList === 'repairs' && filter === 'completed' && styles.filterToggleTextGreen,
              activeList === 'repairs' && filter === 'nepotpisani' && styles.filterToggleTextPurple,
              activeList !== 'repairs' && styles.filterToggleTextMuted,
            ]}
          >
            {filter === 'nepotpisani' ? 'Nepotpisani' : (filter === 'completed' ? 'Završeni' : 'Prijavljeni')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterPill, activeList === 'trebalo' && styles.filterPillBlue]}
          onPress={() => setActiveList('trebalo')}
          activeOpacity={0.85}
        >
          <Text style={[styles.filterPillText, activeList === 'trebalo' && styles.filterPillTextBlue]}>
            Trebalo bi
          </Text>
        </TouchableOpacity>
      </View>

      {/* Popravci ili Trebalo bi sekcija */}
      <SectionList
        sections={[
          activeList === 'repairs'
            ? { key: 'repairs', title: filter === 'completed' ? 'Završeni' : 'Prijavljeni', data: filteredRepairs }
            : { key: 'trebalo', title: 'Trebalo bi', data: trebaloBiList },
        ]}
        keyExtractor={(item, index) => String(item?._id || item?.id || item?.key || index)}
        renderItem={renderRepairItem}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {section.key === 'repairs' ? `Popravci — ${section.title.toLowerCase()}` : 'Trebalo bi'}
            </Text>
            <Text style={styles.sectionCount}>{section.data.length}</Text>
          </View>
        )}
        renderSectionFooter={({ section }) => (section.data.length ? null : renderEmptyState(section.key))}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
      />

      <Modal
        visible={showFlowModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFlowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Tok prijave i izvedbe</Text>
              <TouchableOpacity onPress={() => setShowFlowModal(false)}>
                <Ionicons name="close" size={22} color="#334155" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalRows}>
              <FlowRow label="Prijavio kvar" value={flowReportedBy} icon="person-add-outline" />
              <FlowRow label="Pozivatelj" value={flowCaller} icon="person-outline" />
              {flowCallerPhone ? (
                <TouchableOpacity style={styles.flowCallRow} onPress={handleCallCaller} activeOpacity={0.8}>
                  <View style={styles.flowLabelWrap}>
                    <Ionicons name="call-outline" size={16} color="#065f46" />
                    <Text style={styles.flowLabel}>Telefon pozivatelja</Text>
                  </View>
                  <View style={styles.flowCallContent}>
                    <Text style={styles.flowValue}>{flowCallerPhone}</Text>
                    <View style={styles.flowCallButton}>
                      <Text style={styles.flowCallButtonText}>Nazovi</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ) : null}
              <FlowRow label="Majstor poslan" value={flowAssignedTechnician} icon="construct-outline" />
              <FlowRow label="Riješio kvar" value={flowResolvedBy} icon="checkmark-done-outline" />
              <FlowRow label="Potpisao" value={flowSignedBy} icon="create-outline" />
            </View>

            {flowLoadingSigner && (
              <View style={styles.modalLoadingRow}>
                <ActivityIndicator size="small" color="#2563eb" />
                <Text style={styles.modalLoadingText}>Provjeravam tko je potpisao...</Text>
              </View>
            )}
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
  monthPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chevronButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  headerPrint: {
    padding: 4,
  },
  headerPrintPlaceholder: {
    width: 24,
  },
  monthText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  filterContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  filterToggle: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  filterToggleMuted: {
    backgroundColor: '#f9fafb',
    borderColor: '#e5e7eb',
  },
  filterToggleRed: {
    backgroundColor: '#fee2e2',
    borderColor: '#ef4444',
  },
  filterToggleGreen: {
    backgroundColor: '#dcfce7',
    borderColor: '#10b981',
  },
  filterToggleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
  },
  filterToggleTextRed: {
    color: '#991b1b',
  },
  filterToggleTextGreen: {
    color: '#065f46',
  },
  filterTogglePurple: {
    backgroundColor: '#f3e8ff',
    borderColor: '#a855f7',
  },
  filterToggleTextPurple: {
    color: '#6b21a8',
  },
  filterToggleTextMuted: {
    color: '#9ca3af',
  },
  periodAllButton: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6',
  },
  periodText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
  },
  periodTextActive: {
    color: '#1d4ed8',
  },
  filterPill: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fed7aa',
    backgroundColor: '#fff',
    alignItems: 'center',
    minWidth: 120,
  },
  filterPillBlue: {
    backgroundColor: '#ffedd5',
    borderColor: '#f59e0b',
  },
  filterPillText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
  },
  filterPillTextBlue: {
    color: '#b45309',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4b5563',
    textTransform: 'capitalize',
  },
  sectionCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9ca3af',
  },
  listContent: {
    padding: 15,
    flexGrow: 1,
  },
  repairCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    borderWidth: 2,
  },
  repairContent: {
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  elevatorName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginTop: 2,
  },
  elevatorSub: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6b7280',
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  repairDescription: {
    fontSize: 14,
    fontWeight: '400',
    color: '#4b5563',
    lineHeight: 20,
    marginTop: 4,
  },
  serviceNoteLabel: {
    marginTop: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '700',
    color: '#1d4ed8',
    backgroundColor: '#e0ecff',
  },
  reporterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  reporterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#991b1b',
  },
  completedByRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  completedByText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e3a8a',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalRows: {
    gap: 10,
  },
  flowRow: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#f8fafc',
  },
  flowLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  flowLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  flowValue: {
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '600',
  },
  flowCallRow: {
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#f0fdf4',
    gap: 6,
  },
  flowCallContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  flowCallButton: {
    backgroundColor: '#16a34a',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  flowCallButtonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  modalLoadingRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalLoadingText: {
    fontSize: 12,
    color: '#475569',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 15,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 5,
    textAlign: 'center',
  },
});

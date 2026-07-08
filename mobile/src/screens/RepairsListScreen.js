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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { repairDB, elevatorDB, userDB } from '../database/db';
import { syncAll } from '../services/syncService';
import { useAuth } from '../context/AuthContext';
import { workOrdersAPI } from '../services/api';

const safeText = (value, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  try {
    return String(value);
  } catch {
    return fallback;
  }
};

const buildElevatorDisplay = (elevator) => {
  const tip = elevator?.tip || elevator?.tipObjekta;
  const address = [safeText(elevator?.ulica), safeText(elevator?.mjesto)].filter(Boolean).join(', ').trim();
  const name = safeText(elevator?.nazivStranke);
  const primary = tip === 'privreda'
    ? (name || address || 'Nepoznato dizalo')
    : (address || name || 'Nepoznato dizalo');
  const secondary = tip === 'privreda' ? address : name;
  const extra = safeText(elevator?.brojDizala) ? `Dizalo: ${safeText(elevator?.brojDizala)}` : '';
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
  const [periodFilter, setPeriodFilter] = useState('current'); // 'current' | 'all'
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

  const periodLabel = periodFilter === 'all' ? 'SVE' : `${monthNames[period.month]} ${period.year}`;

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
    setTrebaloBiList(trebalo);
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
      await syncAll();
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

    const elevatorId = typeof item.elevatorId === 'object' && item.elevatorId !== null
      ? item.elevatorId._id || item.elevatorId.id
      : item.elevatorId;

    let elevator = elevatorId ? elevatorDB.getById(elevatorId) : null;

    if (!elevator && typeof item.elevatorId === 'object' && item.elevatorId) {
      elevator = {
        brojDizala: item.elevatorId.brojDizala || undefined,
        nazivStranke: item.elevatorId.nazivStranke || 'Obrisano dizalo',
        ulica: item.elevatorId.ulica || '',
        mjesto: item.elevatorId.mjesto || '',
      };
    }

    if (!elevator) {
      elevator = {
        brojDizala: undefined,
        nazivStranke: 'Obrisano dizalo',
        ulica: '',
        mjesto: '',
      };
    }

    const display = buildElevatorDisplay(elevator);

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
        onPress={() => navigation.navigate(
          isTrebalo ? 'TrebaloBiDetails' : 'RepairDetails',
          {
            repair: item,
            returnTo: isTrebalo ? 'trebalo' : 'repairs',
            filter,
          }
        )}
        activeOpacity={0.8}
      >
        <View style={styles.repairContent}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.elevatorName} numberOfLines={1}>{display.primary}</Text>
            </View>
            <View style={styles.iconRow}>
              <Ionicons
                name={isTrebalo ? (isResolvedTrebalo ? 'checkbox' : 'square-outline') : (item.radniNalogPotpisan ? 'document-text-outline' : 'document-outline')}
                size={18}
                color={isTrebalo ? (isResolvedTrebalo ? '#16a34a' : '#f59e0b') : (item.radniNalogPotpisan ? '#16a34a' : '#ef4444')}
                style={{ marginRight: 8 }}
              />
              <Ionicons
                name={isSynced ? 'cloud-done-outline' : 'cloud-offline-outline'}
                size={18}
                color={isSynced ? '#16a34a' : '#f59e0b'}
              />
            </View>
          </View>

          <Text style={styles.repairDescription} numberOfLines={3}>
            {opisKvara}
          </Text>

          {reporterLabel && reportedDateLabel ? (
            <TouchableOpacity style={styles.reporterRow} onPress={openFlowPopup} activeOpacity={0.75}>
              <Ionicons name="person-add-outline" size={15} color="#dc2626" />
              <Text style={styles.reporterText}>{reporterLabel} • {reportedDateLabel}</Text>
              <Ionicons name="information-circle-outline" size={15} color="#475569" />
            </TouchableOpacity>
          ) : null}

          {completedByLabel ? (
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

  const flowAssignedTechnician = (() => {
    const fromLinked = resolveUserName(selectedFlow?.poslanMajstorId);
    const name = fromLinked || safeText(selectedFlow?.poslanMajstorIme, '');
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
          <TouchableOpacity style={styles.chevronButton} onPress={() => changeMonth(-1)}>
            <Ionicons name="chevron-back" size={20} color="#1f2937" />
          </TouchableOpacity>
          <Text style={styles.monthText}>{periodLabel}</Text>
          <TouchableOpacity style={styles.chevronButton} onPress={() => changeMonth(1)}>
            <Ionicons name="chevron-forward" size={20} color="#1f2937" />
          </TouchableOpacity>
        </View>
        <View style={{ width: 24 }} />
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

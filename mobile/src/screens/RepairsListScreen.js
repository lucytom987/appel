import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { repairDB, elevatorDB } from '../database/db';
import { syncAll } from '../services/syncService';

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

export default function RepairsListScreen({ navigation }) {
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
  const [userMap] = useState({}); // placeholder, više se ne koristi u prikazu

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

  const periodLabel = `${monthNames[period.month]} ${period.year}`;

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
    const datum = repair?.datumPrijave || repair?.datumKvara;
    if (!datum) return true; // prikaži ako nemamo datum
    const parsed = new Date(datum);
    if (Number.isNaN(parsed.getTime())) return true; // fallback ako je loš format
    return parsed.getMonth() === period.month && parsed.getFullYear() === period.year;
  }, [period]);

  const applyFilter = useCallback(() => {
    const periodFiltered = repairs.filter((r) => isInSelectedPeriod(r));

    const repairsOnly = periodFiltered.filter((r) => !r.trebaloBi);
    const trebalo = periodFiltered.filter((r) => r.trebaloBi);

    let filtered = repairsOnly;
    if (['pending', 'completed'].includes(filter)) {
      filtered = repairsOnly.filter((r) => r.status === filter);
    }

    setFilteredRepairs(filtered);
    setTrebaloBiList(trebalo);
  }, [repairs, filter, isInSelectedPeriod]);

  useEffect(() => {
    applyFilter();
  }, [applyFilter]);

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
    const isSigned = Boolean(item.radniNalogPotpisan);
    const isSynced = Boolean(item.synced);

    return (
      <TouchableOpacity
        style={[styles.repairCard, { borderColor: getStatusColor(item) }]}
        onPress={() => navigation.navigate('RepairDetails', { repair: item })}
        activeOpacity={0.8}
      >
        <View style={styles.repairContent}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.elevatorName} numberOfLines={1}>{display.primary}</Text>
              {!!display.secondary && (
                <Text style={styles.elevatorSub} numberOfLines={1}>{display.secondary}</Text>
              )}
              {!!display.extra && (
                <Text style={styles.elevatorSub} numberOfLines={1}>{display.extra}</Text>
              )}
            </View>
            <View style={styles.iconRow}>
              <Ionicons
                name={isSigned ? 'document-text-outline' : 'document-outline'}
                size={18}
                color={isSigned ? '#16a34a' : '#9ca3af'}
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
        </View>
      </TouchableOpacity>
    );
  };

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
    <View style={styles.container}>
      {/* Header s odabirom mjeseca/godine */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('Home')}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <View style={styles.monthPicker}>
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

      {/* Filteri: popravci ili "trebalo bi" (ekskluzivno) */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[
            styles.filterToggle,
            activeList === 'repairs' && filter === 'pending' && styles.filterToggleRed,
            activeList === 'repairs' && filter === 'completed' && styles.filterToggleGreen,
            activeList !== 'repairs' && styles.filterToggleMuted,
          ]}
          onPress={() => {
            setActiveList('repairs');
            setFilter((prev) => (prev === 'completed' ? 'pending' : 'completed'));
          }}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.filterToggleText,
              activeList === 'repairs' && filter === 'pending' && styles.filterToggleTextRed,
              activeList === 'repairs' && filter === 'completed' && styles.filterToggleTextGreen,
              activeList !== 'repairs' && styles.filterToggleTextMuted,
            ]}
          >
            {filter === 'completed' ? 'Završeni' : 'Prijavljeni'}
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
  filterToggleTextMuted: {
    color: '#9ca3af',
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
    fontSize: 16,
    fontWeight: '600',
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
    color: '#4b5563',
    lineHeight: 20,
    marginTop: 4,
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

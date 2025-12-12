import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { serviceDB, elevatorDB } from '../database/db';
import { syncAll } from '../services/syncService';

const MONTHS = [
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

// helper za datume
const parseDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatDateLabel = (date) => (date ? date.toLocaleDateString('hr-HR') : '-');

const normalizeElevatorId = (raw) => {
  if (typeof raw === 'object' && raw !== null) return raw._id || raw.id;
  return raw;
};

const isInactiveElevator = (rawElevatorId) => {
  const elevatorId = normalizeElevatorId(rawElevatorId);
  let elevator = elevatorId ? elevatorDB.getById?.(elevatorId) : null;

  // Ako je zapis stigao sa servera s ugniježđenim objektom, koristi ga kao fallback
  if (!elevator && rawElevatorId && typeof rawElevatorId === 'object') {
    elevator = rawElevatorId;
  }

  return elevator?.status === 'neaktivan';
};

const buildAddressLabel = (service) => {
  if (!service) return 'Nepoznata adresa';
  const raw = service.elevatorId;
  const elevatorId = typeof raw === 'object' && raw !== null ? raw._id || raw.id : raw;
  let elevator = elevatorId ? elevatorDB.getById(elevatorId) : null;

  if (!elevator && typeof raw === 'object' && raw) {
    elevator = {
      brojDizala: raw.brojDizala || undefined,
      nazivStranke: raw.nazivStranke || 'Nepoznato dizalo',
      ulica: raw.ulica || '',
      mjesto: raw.mjesto || '',
    };
  }

  if (!elevator) {
    elevator = { ulica: '', mjesto: '' };
  }

  const address = elevator.ulica || elevator.mjesto
    ? `${elevator.ulica || ''}${elevator.mjesto ? `, ${elevator.mjesto}` : ''}`
    : '';

  return address || 'Nepoznata adresa';
};

export default function ServicesListScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [services, setServices] = useState([]);
  const [filteredServices, setFilteredServices] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('serviced');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  const [tempMonth, setTempMonth] = useState(selectedMonth);
  const [tempYear, setTempYear] = useState(selectedYear);

  const monthsByYear = useMemo(() => {
    const map = new Map();
    services.forEach((s) => {
      const d = parseDate(s.datum || s.serviceDate);
      if (!d) return;
      const y = d.getFullYear();
      const m = d.getMonth();
      if (!map.has(y)) map.set(y, new Set());
      map.get(y).add(m);
    });
    return map;
  }, [services]);

  const availableYears = useMemo(() => {
    const years = new Set();
    const nowYear = new Date().getFullYear();
    years.add(nowYear);
    services.forEach((s) => {
      const d = parseDate(s.datum || s.serviceDate);
      if (d) years.add(d.getFullYear());
    });
    const arr = Array.from(years);
    arr.sort((a, b) => b - a);
    return arr;
  }, [services]);

  const availableMonthsForTempYear = useMemo(() => {
    const set = monthsByYear.get(tempYear);
    if (!set) return [];
    return Array.from(set).sort((a, b) => a - b);
  }, [monthsByYear, tempYear]);

  const loadServices = useCallback(() => {
    try {
      const allServices = serviceDB.getAll() || [];

      const onlyObjects = allServices.filter((s) => {
        const ok = s && typeof s === 'object';
        if (!ok) {
          console.warn('ServicesListScreen: ne-objekt zapis iz baze', s);
        }
        return ok;
      });

      const sorted = onlyObjects.sort((a, b) => {
        const ad = parseDate(a.datum || a.serviceDate);
        const bd = parseDate(b.datum || b.serviceDate);
        return (bd?.getTime() || 0) - (ad?.getTime() || 0);
      });

      setServices(sorted);
    } catch (error) {
      console.error('Greška pri učitavanju servisa:', error);
      setServices([]);
    }
  }, []);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  // Ako u trenutno odabranom periodu nema servisa, automatski prebaci na najnoviji dostupni period
  useEffect(() => {
    if (!services.length) return;
    const hasInSelection = services.some((s) => {
      const d = parseDate(s.datum || s.serviceDate);
      return d && d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    });
    if (!hasInSelection) {
      const latest = services[0];
      const d = parseDate(latest?.datum || latest?.serviceDate);
      if (d) {
        setSelectedMonth(d.getMonth());
        setSelectedYear(d.getFullYear());
      }
    }
  }, [services, selectedMonth, selectedYear]);

  const applyFilter = useCallback(() => {
    let filtered = Array.isArray(services) ? services : [];

    // Izbaci servise vezane uz neaktivna dizala
    filtered = filtered.filter((s) => !isInactiveElevator(s?.elevatorId));

    if (filter === 'notServiced') {
      const servicedThisMonth = new Set();
      const latestByElevator = new Map();

      filtered.forEach((s) => {
        const date = parseDate(s.datum || s.serviceDate);
        const elevatorIdRaw = s.elevatorId;
        const elevatorId = normalizeElevatorId(elevatorIdRaw);
        if (!elevatorId) return;

        const prev = latestByElevator.get(elevatorId);
        const prevDate = prev ? parseDate(prev.datum || prev.serviceDate) : null;
        if (!prevDate || (date && prevDate && date > prevDate)) {
          latestByElevator.set(elevatorId, s);
        }

        if (date && date.getMonth() === selectedMonth && date.getFullYear() === selectedYear) {
          servicedThisMonth.add(elevatorId);
        }
      });

      const allElevators = (elevatorDB.getAll?.() || []).filter((e) => e?.status !== 'neaktivan');
      const notServiced = allElevators
        .map((e) => {
          const eid = e._id || e.id;
          if (!eid) return null;
          if (servicedThisMonth.has(eid)) return null;

          const lastService = latestByElevator.get(eid);
          if (lastService) return lastService;
          return {
            id: `placeholder_${eid}`,
            elevatorId: eid,
            datum: null,
            napomene: '',
            synced: 1,
          };
        })
        .filter(Boolean);

      setFilteredServices(notServiced);
      return;
    }

    // Servisirani za odabrani mjesec/godinu
    filtered = filtered.filter((s) => {
      const date = parseDate(s.datum || s.serviceDate);
      if (!date) return false;
      return date.getMonth() === selectedMonth && date.getFullYear() === selectedYear;
    });

    setFilteredServices(filtered);
  }, [services, filter, selectedMonth, selectedYear]);

  useEffect(() => {
    applyFilter();
  }, [applyFilter]);

  const safeFiltered = useMemo(() => {
    if (!Array.isArray(filteredServices)) return [];
    return filteredServices.filter((s) => s && typeof s === 'object');
  }, [filteredServices]);

  const dedupedServices = useMemo(() => {
    // Za "serviced" zadrži samo najnoviji servis po dizalu u odabranom mjesecu, grupirano po adresi
    if (filter === 'serviced') {
      const latestByElevator = new Map();
      safeFiltered.forEach((s) => {
        const elevatorIdRaw = s.elevatorId;
        const elevatorId = typeof elevatorIdRaw === 'object' && elevatorIdRaw !== null
          ? (elevatorIdRaw._id || elevatorIdRaw.id)
          : elevatorIdRaw;
        if (!elevatorId) return;
        const prev = latestByElevator.get(elevatorId);
        const prevDate = prev ? parseDate(prev.datum || prev.serviceDate) : null;
        const curDate = parseDate(s.datum || s.serviceDate);
        if (!prev || (curDate && prevDate && curDate > prevDate)) {
          latestByElevator.set(elevatorId, s);
        }
      });

      const byAddress = new Map();
      Array.from(latestByElevator.values()).forEach((s) => {
        const raw = s.elevatorId;
        const elevatorId = normalizeElevatorId(raw);
        let elevator = elevatorId ? elevatorDB.getById?.(elevatorId) : null;
        if (!elevator && raw && typeof raw === 'object') {
          elevator = raw;
        }
        const ulica = (elevator?.ulica || '').trim().toLowerCase();
        const mjesto = (elevator?.mjesto || '').trim().toLowerCase();
        const key = `${ulica}___${mjesto}`;
        if (!byAddress.has(key)) {
          const ensuredId = s._id || s.id || `${key}_${elevatorId || ''}`;
          byAddress.set(key, { ...s, _id: ensuredId, id: ensuredId });
        }
      });

      return Array.from(byAddress.values());
    }

    if (filter === 'notServiced') {
      // Za ne-servisirane: prikaži samo jednu stavku po adresi (ulica + mjesto)
      const byAddress = new Map();
      safeFiltered.forEach((s) => {
        const raw = s.elevatorId;
        const elevatorId = normalizeElevatorId(raw);
        let elevator = elevatorId ? elevatorDB.getById?.(elevatorId) : null;
        if (!elevator && raw && typeof raw === 'object') {
          elevator = raw;
        }
        const ulica = (elevator?.ulica || '').trim().toLowerCase();
        const mjesto = (elevator?.mjesto || '').trim().toLowerCase();
        const key = `${ulica}___${mjesto}`; // group key by address
        if (!byAddress.has(key)) {
          const ensuredId = s._id || s.id || key;
          byAddress.set(key, { ...s, _id: ensuredId, id: ensuredId });
        }
      });
      return Array.from(byAddress.values());
    }

    return safeFiltered;
  }, [safeFiltered, filter]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncAll();
      loadServices();
    } catch (e) {
      console.error('Greška pri syncu servisa:', e);
    } finally {
      setRefreshing(false);
    }
  }, [loadServices]);

  const renderServiceItem = ({ item }) => {
    if (!item || typeof item !== 'object') {
      return (
        <View style={styles.serviceCard}>
          <View style={styles.serviceContent}>
            <Text style={styles.serviceDescription}>
              {`Neispravan zapis servisa: ${String(item ?? '')}`}
            </Text>
          </View>
        </View>
      );
    }

    const rawDate = item.datum || item.serviceDate;
    const serviceDate = parseDate(rawDate);
    const sljedeciServisDate = parseDate(item.sljedeciServis);

    const daysUntilNext = sljedeciServisDate
      ? Math.ceil((sljedeciServisDate - new Date()) / (1000 * 60 * 60 * 24))
      : null;

    const addressLabel = buildAddressLabel(item);
    const dateLabel = formatDateLabel(serviceDate);

    const showNextBadge = daysUntilNext !== null;
    const nextLabel =
      daysUntilNext === null
        ? ''
        : daysUntilNext < 0
          ? 'Prekoračeno'
          : `${daysUntilNext}d`;

    const napomeneText = item.napomene ? String(item.napomene) : '';

    const elevatorId = normalizeElevatorId(item.elevatorId);
    const elevator = elevatorId ? elevatorDB.getById?.(elevatorId) : null;

    const handlePress = () => {
      if (filter === 'notServiced') {
        if (elevator) {
          navigation.navigate('ElevatorDetails', { elevator });
        }
        return;
      }
      navigation.navigate('ServiceDetails', { service: item });
    };

    return (
      <View style={styles.serviceCard}>
        <TouchableOpacity
          onPress={handlePress}
          style={styles.serviceContent}
        >
          <View style={styles.serviceHeader}>
            <View style={styles.serviceInfo}>
              <Text style={styles.elevatorName}>{addressLabel}</Text>
            </View>

            <View style={styles.serviceMeta}>
              <Text style={styles.serviceMetaDate}>{String(dateLabel)}</Text>
              <Ionicons
                name={item.synced ? 'cloud-done-outline' : 'cloud-offline-outline'}
                size={16}
                color={item.synced ? '#10b981' : '#ef4444'}
                style={styles.syncIcon}
              />
              {showNextBadge ? (
                <View
                  style={[
                    styles.nextServiceBadge,
                    daysUntilNext < 7 && styles.nextServiceBadgeUrgent,
                    daysUntilNext < 0 && styles.nextServiceBadgeOverdue,
                  ]}
                >
                  <Text style={styles.nextServiceText}>{String(nextLabel)}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {napomeneText ? (
            <Text style={styles.serviceDescription} numberOfLines={2}>
              {napomeneText}
            </Text>
          ) : null}

        </TouchableOpacity>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="checkmark-circle-outline" size={64} color="#ccc" />
      <Text style={styles.emptyText}>Nema servisa</Text>
      <Text style={styles.emptySubtext}>
        {filter === 'serviced'
          ? 'Nema servisa za odabrani mjesec'
          : 'Sva dizala su servisirana u odabranom mjesecu'}
      </Text>
    </View>
  );

  const keyExtractor = (item, index) => item?._id || item?.id || String(index);

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 12,
            paddingBottom: 12,
            paddingHorizontal: 16,
          },
        ]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Servisi</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.summaryBar}>
        <TouchableOpacity
          style={[styles.summaryPill, styles.summaryPillPressable]}
          onPress={() => {
            setTempMonth(selectedMonth);
            setTempYear(selectedYear);
            setPeriodPickerOpen(true);
          }}
        >
          <Ionicons name="calendar-outline" size={18} color="#0f172a" />
          <Text style={styles.summaryDateText}>{MONTHS[selectedMonth]} {selectedYear}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.summaryPill,
            filter === 'serviced' ? styles.summaryPillGreen : styles.summaryPillOrange,
          ]}
          onPress={() => setFilter((prev) => (prev === 'serviced' ? 'notServiced' : 'serviced'))}
        >
          <Ionicons
            name={filter === 'serviced' ? 'checkmark-circle' : 'alert-circle'}
            size={18}
            color={filter === 'serviced' ? '#065f46' : '#b45309'}
          />
          <Text
            style={[
              styles.summaryTextEmphasis,
              filter === 'serviced' ? styles.summaryTextGreen : styles.summaryTextOrange,
            ]}
          >
            {filter === 'serviced' ? 'Servisirana' : 'Neservisirana'}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={dedupedServices}
        renderItem={renderServiceItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: (insets.bottom || 0) + 16 },
        ]}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
          />
        )}
        ListEmptyComponent={renderEmptyState}
      />

      <Modal
        visible={periodPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPeriodPickerOpen(false)}
      >
        <View style={styles.pickerOverlay}>
          <View style={styles.periodCard}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Odaberi period</Text>
              <TouchableOpacity onPress={() => setPeriodPickerOpen(false)}>
                <Ionicons name="close" size={22} color="#111827" />
              </TouchableOpacity>
            </View>

            <View style={styles.periodColumns}>
              <View style={styles.periodColumn}>
                <Text style={styles.pickerSubtitle}>Mjesec</Text>
                <View>
                  {availableMonthsForTempYear.length === 0 ? (
                    <Text style={styles.pickerEmpty}>Nema zapisa za ovu godinu</Text>
                  ) : (
                    availableMonthsForTempYear.map((idx) => (
                      <TouchableOpacity
                        key={MONTHS[idx]}
                        style={[styles.pickerItem, tempMonth === idx && styles.pickerItemActive]}
                        onPress={() => setTempMonth(idx)}
                      >
                        <Text style={styles.pickerItemTitle}>{MONTHS[idx]}</Text>
                      </TouchableOpacity>
                    ))
                  )}
                </View>
              </View>

              <View style={styles.periodColumn}>
                <Text style={styles.pickerSubtitle}>Godina</Text>
                <ScrollView style={styles.periodScroll}>
                  {availableYears.map((year) => (
                    <TouchableOpacity
                      key={year}
                      style={[styles.pickerItem, tempYear === year && styles.pickerItemActive]}
                      onPress={() => {
                        setTempYear(year);
                        const monthsForYear = monthsByYear.get(year);
                        if (monthsForYear && monthsForYear.size) {
                          const first = Array.from(monthsForYear).sort((a, b) => a - b)[0];
                          setTempMonth(first);
                        }
                      }}
                    >
                      <Text style={styles.pickerItemTitle}>{year}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.applyButton,
                availableMonthsForTempYear.length === 0 && styles.applyButtonDisabled,
              ]}
              disabled={availableMonthsForTempYear.length === 0}
              onPress={() => {
                setSelectedMonth(tempMonth);
                setSelectedYear(tempYear);
                setPeriodPickerOpen(false);
              }}
            >
              <Text style={styles.applyButtonText}>Primijeni</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 20,
  },
  pickerCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    maxHeight: '80%',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  pickerSubtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  pickerItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  pickerItemActive: {
    backgroundColor: '#f0fdf4',
  },
  pickerItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: 8,
  },
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#e0f2fe',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  summaryPillPressable: {
    flex: 1,
  },
  summaryPillGreen: {
    backgroundColor: '#dcfce7',
    borderColor: '#bbf7d0',
  },
  summaryPillOrange: {
    backgroundColor: '#ffedd5',
    borderColor: '#fed7aa',
  },
  summaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  summaryTextEmphasis: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  summaryDateText: {
    fontSize: 19,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: 0.2,
  },
  summaryTextGreen: {
    color: '#065f46',
  },
  summaryTextOrange: {
    color: '#b45309',
  },
  periodCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    maxHeight: '80%',
    width: '100%',
  },
  periodColumns: {
    flexDirection: 'row',
    gap: 10,
  },
  periodColumn: {
    flex: 1,
  },
  periodScroll: {
    maxHeight: 280,
  },
  applyButton: {
    marginTop: 10,
    backgroundColor: '#10b981',
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
  },
  applyButtonDisabled: {
    opacity: 0.5,
  },
  applyButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  pickerEmpty: {
    paddingVertical: 12,
    color: '#6b7280',
    fontSize: 14,
  },
  listContent: {
    padding: 12,
    flexGrow: 1,
  },
  serviceCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  serviceContent: {
    flex: 1,
    padding: 12,
  },
  serviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 8,
  },
  serviceInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  elevatorName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  serviceMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  serviceMetaDate: {
    fontSize: 13,
    color: '#374151',
  },
  syncIcon: {
    marginTop: 0,
  },
  nextServiceBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  nextServiceBadgeUrgent: {
    backgroundColor: '#fef3c7',
  },
  nextServiceBadgeOverdue: {
    backgroundColor: '#fee2e2',
  },
  nextServiceText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#1f2937',
  },
  serviceDescription: {
    fontSize: 13.5,
    color: '#666',
    marginBottom: 10,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#999',
    marginTop: 15,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#999',
    marginTop: 5,
    textAlign: 'center',
  },
});

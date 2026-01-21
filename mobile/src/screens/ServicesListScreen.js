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
import { serviceDB, elevatorDB, userDB } from '../database/db';
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

const buildElevatorDisplay = (rawElevator) => {
  const tip = rawElevator?.tip || rawElevator?.tipObjekta;
  const address = [rawElevator?.ulica, rawElevator?.mjesto].filter(Boolean).join(', ').trim();
  const name = rawElevator?.nazivStranke || '';
  const title = tip === 'privreda'
    ? (name || address || 'Nepoznato dizalo')
    : (address || name || 'Nepoznato dizalo');
  return { title };
};

const getServiserLabel = (service) => {
  const raw = service?.serviserID;
  if (!raw) return '-';

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

  if (typeof raw === 'string' || typeof raw === 'number') {
    const idStr = String(raw);
    const found = userDB.getById(idStr);
    if (found) {
      const full = `${found.ime || found.firstName || ''} ${found.prezime || found.lastName || ''}`.trim();
      if (full) return full;
      if (found.email) return found.email;
    }
    return idStr.length > 8 ? `${idStr.slice(0, 8)}...` : idStr;
  }

  return String(raw);
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

const resolveElevatorForService = (service) => {
  const raw = service?.elevatorId;
  const elevatorId = typeof raw === 'object' && raw !== null ? raw._id || raw.id : raw;
  let elevator = elevatorId ? elevatorDB.getById?.(elevatorId) : null;

  if (!elevator && raw && typeof raw === 'object') {
    elevator = {
      brojDizala: raw.brojDizala || undefined,
      nazivStranke: raw.nazivStranke || 'Nepoznato dizalo',
      ulica: raw.ulica || '',
      mjesto: raw.mjesto || '',
      tip: raw.tip || raw.tipObjekta,
    };
  }

  if (!elevator) {
    elevator = { nazivStranke: 'Nepoznato dizalo', ulica: '', mjesto: '' };
  }

  return elevator;
};

export default function ServicesListScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [services, setServices] = useState([]);
  const [filteredServices, setFilteredServices] = useState([]);
  const [annualOccurrences, setAnnualOccurrences] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('serviced');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  const [tempMonth, setTempMonth] = useState(selectedMonth);
  const [tempYear, setTempYear] = useState(selectedYear);

  const monthsByYear = useMemo(() => {
    const map = new Map();
    const source = filter === 'annual' ? annualOccurrences : services;
    source.forEach((s) => {
      const d = parseDate(s.datum || s.serviceDate);
      if (!d) return;
      const y = d.getFullYear();
      const m = d.getMonth();
      if (!map.has(y)) map.set(y, new Set());
      map.get(y).add(m);
    });
    return map;
  }, [services, annualOccurrences, filter]);

  const availableYears = useMemo(() => {
    const years = new Set();
    const nowYear = new Date().getFullYear();
    years.add(nowYear);
    const source = filter === 'annual' ? annualOccurrences : services;
    source.forEach((s) => {
      const d = parseDate(s.datum || s.serviceDate);
      if (d) years.add(d.getFullYear());
    });
    const arr = Array.from(years);
    arr.sort((a, b) => b - a);
    return arr;
  }, [services, annualOccurrences, filter]);

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

  const refreshAnnualOccurrences = useCallback(() => {
    try {
      const elevators = elevatorDB.getAll?.() || [];
      const start = new Date();
      const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
      const horizon = new Date(monthStart);
      horizon.setMonth(horizon.getMonth() + 18); // sljedećih ~18 mjeseci

      const items = [];

      elevators.forEach((e) => {
        const base = parseDate(e.godisnjiPregled);
        if (!base) return;

        let due = new Date(base);
        while (due < monthStart) {
          due.setFullYear(due.getFullYear() + 1);
        }

        while (due <= horizon) {
          const dueIso = due.toISOString();
          items.push({
            id: `annual_${e.id}_${dueIso}`,
            _id: `annual_${e.id}_${dueIso}`,
            elevatorId: e.id,
            datum: dueIso,
            napomene: 'Godišnji pregled',
            synced: 1,
          });
          due = new Date(due);
          due.setFullYear(due.getFullYear() + 1);
        }
      });

      items.sort((a, b) => {
        const ad = parseDate(a.datum);
        const bd = parseDate(b.datum);
        return (ad?.getTime() || 0) - (bd?.getTime() || 0);
      });

      setAnnualOccurrences(items);
    } catch (e) {
      console.error('Greška pri izračunu godišnjih pregleda:', e);
      setAnnualOccurrences([]);
    }
  }, []);

  useEffect(() => {
    loadServices();
    refreshAnnualOccurrences();
  }, [loadServices, refreshAnnualOccurrences]);

  // Ako u trenutno odabranom periodu nema servisa, automatski prebaci na najnoviji dostupni period
  // Ne preskači korisnički odabir za godišnje preglede (annual)
  useEffect(() => {
    if (filter === 'annual') return; // ne diraj izbor u GP modu
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
  }, [services, selectedMonth, selectedYear, filter]);

  const applyFilter = useCallback(() => {
    if (filter === 'annual') {
      const annualForPeriod = annualOccurrences.filter((item) => {
        const d = parseDate(item.datum || item.serviceDate);
        if (!d) return false;
        return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
      });
      setFilteredServices(annualForPeriod);
      return;
    }

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
  }, [services, filter, selectedMonth, selectedYear, annualOccurrences]);

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

    if (filter === 'annual') {
      return safeFiltered;
    }

    return safeFiltered;
  }, [safeFiltered, filter]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncAll();
      loadServices();
      refreshAnnualOccurrences();
    } catch (e) {
      console.error('Greška pri syncu servisa:', e);
    } finally {
      setRefreshing(false);
    }
  }, [loadServices, refreshAnnualOccurrences]);

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

    const elevator = resolveElevatorForService(item);
    const display = buildElevatorDisplay(elevator);
    const serviserLabel = getServiserLabel(item);
    const dateLabel = formatDateLabel(serviceDate);

    const showNextBadge = daysUntilNext !== null;
    const nextLabel =
      daysUntilNext === null
        ? ''
        : daysUntilNext < 0
          ? 'Prekoračeno'
          : `${daysUntilNext}d`;

    let napomeneText = item.napomene ? String(item.napomene) : '';
    if (filter === 'annual' && napomeneText.toLowerCase() === 'godišnji pregled') {
      napomeneText = '';
    }

    const elevatorId = normalizeElevatorId(item.elevatorId);
    const elevatorFull = elevatorId ? elevatorDB.getById?.(elevatorId) : null;

    const handlePress = () => {
      // Otvaraj detalje dizala i na karticama servisiranih
      const fallbackElevator = elevatorFull || (elevatorId ? { ...elevator, id: elevatorId } : elevator);
      if (fallbackElevator) {
        navigation.navigate('ElevatorDetails', { elevator: fallbackElevator });
      }
    };

    return (
      <View style={styles.serviceCard}>
        <TouchableOpacity
          onPress={handlePress}
          style={styles.serviceContent}
        >
          <View style={styles.serviceHeader}>
            <View style={styles.serviceInfo}>
              <Text style={styles.elevatorName} numberOfLines={1}>{display.title}</Text>
              <Text style={styles.serviserLabel} numberOfLines={1}>Serviser: {serviserLabel}</Text>
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
            paddingTop: insets.top + 8,
            paddingBottom: 12,
            paddingHorizontal: 14,
          },
        ]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <TouchableOpacity
            style={[
              styles.headerToggle,
              filter === 'serviced' && styles.headerToggleGreen,
              filter === 'notServiced' && styles.headerToggleRed,
            ]}
            onPress={() => setFilter((prev) => (prev === 'serviced' ? 'notServiced' : 'serviced'))}
          >
            <Text
              style={[
                styles.headerToggleText,
                filter === 'serviced' && styles.headerToggleTextGreen,
                filter === 'notServiced' && styles.headerToggleTextRed,
              ]}
            >
              {filter === 'notServiced' ? 'Neservisirani' : 'Servisirani'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerAnnualPill, filter === 'annual' && styles.headerAnnualPillActive]}
            onPress={() => setFilter('annual')}
          >
            <Text style={[styles.headerAnnualText, filter === 'annual' && styles.headerAnnualTextActive]}>
              Godišnji pregled
            </Text>
          </TouchableOpacity>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.summaryBar, styles.summaryBarColumn]}>
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
    backgroundColor: '#f9fafb',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerToggle: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  headerToggleGreen: {
    borderColor: '#15803d',
    backgroundColor: '#dcfce7',
  },
  headerToggleRed: {
    borderColor: '#dc2626',
    backgroundColor: '#fecdd3',
  },
  headerToggleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
  },
  headerToggleTextGreen: {
    color: '#065f46',
  },
  headerToggleTextRed: {
    color: '#7f1d1d',
  },
  headerAnnualPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    backgroundColor: '#fff',
  },
  headerAnnualPillActive: {
    borderColor: '#1d4ed8',
    backgroundColor: '#dbeafe',
  },
  headerAnnualText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1f2937',
  },
  headerAnnualTextActive: {
    color: '#1d4ed8',
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
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: 10,
  },
  summaryBarColumn: {
    gap: 10,
  },
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    minHeight: 44,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  summaryPillPressable: {
    flex: 0,
    width: 'auto',
    alignSelf: 'center',
  },
  summaryPillGreen: {
    backgroundColor: '#dcfce7',
    borderColor: '#bbf7d0',
  },
  summaryPillOrange: {
    backgroundColor: '#ffedd5',
    borderColor: '#fed7aa',
  },
  summaryPillBlue: {
    backgroundColor: '#e0e7ff',
    borderColor: '#c7d2fe',
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
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
  summaryTextGreen: {
    color: '#065f46',
  },
  summaryTextOrange: {
    color: '#b45309',
  },
  summaryTextBlue: {
    color: '#1d4ed8',
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
    paddingTop: 20,
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
  elevatorSub: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6b7280',
  },
  serviserLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4b5563',
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

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Print from 'expo-print';
import { serviceDB, elevatorDB, userDB } from '../database/db';
import { syncAll } from '../services/syncService';
import { useAuth } from '../context/AuthContext';
import { usersAPI } from '../services/api';

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
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{10,13}$/.test(raw)) {
    const n = Number(raw.length === 10 ? `${raw}000` : raw);
    const d = new Date(n);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const parts = raw.split(/[./-]/).filter(Boolean);
  if (parts.length === 3 && parts[0].length <= 2 && parts[1].length <= 2 && parts[2].length === 4) {
    const dd = Number(parts[0]);
    const mm = Number(parts[1]);
    const yyyy = Number(parts[2]);
    const d = new Date(yyyy, mm - 1, dd);
    if (!Number.isNaN(d.getTime()) && d.getDate() === dd && d.getMonth() === mm - 1 && d.getFullYear() === yyyy) {
      return d;
    }
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

const formatDateLabel = (date) => (date ? date.toLocaleDateString('hr-HR') : '-');

const getServiceStatus = (daysLeft) => {
  if (typeof daysLeft !== 'number' || Number.isNaN(daysLeft)) {
    return {
      label: 'OK',
      backgroundColor: '#f0fdf4',
      borderColor: '#16a34a',
      badgeBackground: '#dcfce7',
      badgeTextColor: '#166534',
      textColor: '#166534',
    };
  }

  if (daysLeft < 0) {
    return {
      label: 'KASNI',
      backgroundColor: '#fff1f2',
      borderColor: '#dc2626',
      badgeBackground: '#ffe4e6',
      badgeTextColor: '#b91c1c',
      textColor: '#b91c1c',
    };
  }

  if (daysLeft <= 2) {
    return {
      label: 'HITNO',
      backgroundColor: '#fff7ed',
      borderColor: '#ea580c',
      badgeBackground: '#ffedd5',
      badgeTextColor: '#c2410c',
      textColor: '#c2410c',
    };
  }

  if (daysLeft <= 7) {
    return {
      label: 'USKORO',
      backgroundColor: '#fffbeb',
      borderColor: '#d97706',
      badgeBackground: '#fef3c7',
      badgeTextColor: '#b45309',
      textColor: '#b45309',
    };
  }

  if (daysLeft <= 15) {
    return {
      label: 'PLANIRANO',
      backgroundColor: '#eff6ff',
      borderColor: '#2563eb',
      badgeBackground: '#dbeafe',
      badgeTextColor: '#1d4ed8',
      textColor: '#1d4ed8',
    };
  }

  return {
    label: 'OK',
    backgroundColor: '#f0fdf4',
    borderColor: '#16a34a',
    badgeBackground: '#dcfce7',
    badgeTextColor: '#166534',
    textColor: '#166534',
  };
};

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
  const { isOnline, serverAwake } = useAuth();
  const [services, setServices] = useState([]);
  const [filteredServices, setFilteredServices] = useState([]);
  const [annualOccurrences, setAnnualOccurrences] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('notServiced');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);
  const [tempMonth, setTempMonth] = useState(selectedMonth);
  const [tempYear, setTempYear] = useState(selectedYear);
  const [statusToast, setStatusToast] = useState(null);
  const toastTimeout = useRef(null);

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

  const loadUsersIfOnline = useCallback(async () => {
    try {
      const online = Boolean(isOnline && serverAwake);
      if (!online) return;
      const res = await usersAPI.getLite();
      const data = res?.data?.data || res?.data || [];
      if (Array.isArray(data) && data.length) {
        try {
          userDB.bulkInsert(data);
        } catch (e) {
          console.log('ServicesListScreen: cache users fail', e?.message);
        }
      }
    } catch (e) {
      console.log('ServicesListScreen: load users fail', e?.message);
    }
  }, [isOnline, serverAwake]);

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
    loadUsersIfOnline();
  }, [loadServices, refreshAnnualOccurrences, loadUsersIfOnline]);

  // Ako u trenutno odabranom periodu nema servisa, automatski prebaci na najnoviji dostupni period
  // Ne preskači korisnički odabir za godišnje preglede (annual)
  useEffect(() => {
    if (filter !== 'serviced') return; // ne diraj korisnički odabir za druge modove
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
      const periodEnd = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);

      const resolveDueDate = (elevator) => {
        const nextDate = parseDate(elevator?.sljedeciServis);
        if (nextDate) return nextDate;

        const lastDate = parseDate(elevator?.zadnjiServis);
        if (lastDate) {
          const interval = Number(elevator?.intervalServisa || 1);
          const computed = new Date(lastDate);
          computed.setMonth(computed.getMonth() + (Number.isFinite(interval) && interval > 0 ? interval : 1));
          return computed;
        }

        return null;
      };

      filtered.forEach((s) => {
        const date = parseDate(s.datum || s.serviceDate);
        const elevatorIdRaw = s.elevatorId;
        const elevatorId = normalizeElevatorId(elevatorIdRaw);
        if (!elevatorId) return;
        const elevatorKey = String(elevatorId);

        const prev = latestByElevator.get(elevatorKey);
        const prevDate = prev ? parseDate(prev.datum || prev.serviceDate) : null;
        if (!prevDate || (date && prevDate && date > prevDate)) {
          latestByElevator.set(elevatorKey, s);
        }

        if (date && date.getMonth() === selectedMonth && date.getFullYear() === selectedYear) {
          servicedThisMonth.add(elevatorKey);
        }
      });

      const allElevators = (elevatorDB.getAll?.() || []).filter((e) => e?.status !== 'neaktivan');
      const dueElevators = allElevators.filter((e) => {
        const dueDate = resolveDueDate(e);
        if (!dueDate) return false;
        return dueDate <= periodEnd;
      });

      const notServiced = dueElevators
        .map((e) => {
          const eid = e._id || e.id;
          if (!eid) return null;
          const elevatorKey = String(eid);
          if (servicedThisMonth.has(elevatorKey)) return null;

          const lastService = latestByElevator.get(elevatorKey);
          if (lastService) {
            return {
              ...lastService,
              elevatorId: eid,
              sljedeciServis: e.sljedeciServis || lastService.sljedeciServis,
            };
          }
          return {
            id: `placeholder_${eid}`,
            elevatorId: eid,
            datum: null,
            sljedeciServis: e.sljedeciServis || null,
            napomene: '',
            synced: 1,
          };
        })
        .filter(Boolean);

      // Sortiraj po daysUntilNext - prekoračeno prvo, zatim po broju dana
      notServiced.sort((a, b) => {
        const sljedeciA = parseDate(a.sljedeciServis);
        const sljedeciB = parseDate(b.sljedeciServis);
        
        const daysA = sljedeciA ? Math.ceil((sljedeciA - new Date()) / (1000 * 60 * 60 * 24)) : Infinity;
        const daysB = sljedeciB ? Math.ceil((sljedeciB - new Date()) / (1000 * 60 * 60 * 24)) : Infinity;
        
        // Prekoračene (negativne) prvo, sortirane od najviše prekoračenosti prema manjoj
        if (daysA < 0 && daysB < 0) {
          return daysA - daysB; // manja vrijednost (prije) = više prekoračeno
        }
        
        // Ako je samo jedan prekoračen, taj ide prvi
        if (daysA < 0) return -1;
        if (daysB < 0) return 1;
        
        // Inače sortiraj po broju preostalih dana (manje = prvo)
        return daysA - daysB;
      });

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

  const FILTER_META = {
    notServiced: { label: 'NESERVISIRANI', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
    serviced: { label: 'SERVISIRANI', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
    annual: { label: 'GODIŠNJI PREGLED', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  };
  const FILTER_ORDER = ['notServiced', 'serviced', 'annual'];
  const activeFilterMeta = FILTER_META[filter] || FILTER_META.notServiced;

  const showStatusToast = useCallback((label) => {
    setStatusToast(label);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => {
      setStatusToast(null);
    }, 5000);
  }, []);

  const clearStatusToast = useCallback(() => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setStatusToast(null);
  }, []);

  useEffect(() => () => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
  }, []);

  useEffect(() => {
    showStatusToast(FILTER_META[filter].label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cycleFilter = useCallback(() => {
    setFilter((prev) => {
      const idx = FILTER_ORDER.indexOf(prev);
      const next = FILTER_ORDER[(idx + 1) % FILTER_ORDER.length];
      showStatusToast(FILTER_META[next].label);
      return next;
    });
  }, [showStatusToast]);

  const goPrevMonth = useCallback(() => {
    clearStatusToast();
    setSelectedMonth((m) => {
      if (m === 0) {
        setSelectedYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }, [clearStatusToast]);

  const goNextMonth = useCallback(() => {
    clearStatusToast();
    setSelectedMonth((m) => {
      if (m === 11) {
        setSelectedYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }, [clearStatusToast]);

  const handlePrintNotServiced = useCallback(async () => {
    try {
      const rows = dedupedServices.map((item) => {
        const elevator = resolveElevatorForService(item);
        const display = buildElevatorDisplay(elevator);
        const sljedeciServisDate = parseDate(item.sljedeciServis);
        const daysUntilNext = sljedeciServisDate
          ? Math.ceil((sljedeciServisDate - new Date()) / (1000 * 60 * 60 * 24))
          : null;
        const statusLabel = daysUntilNext === null
          ? '-'
          : daysUntilNext < 0
            ? `Prekoračeno ${Math.abs(daysUntilNext)}d`
            : `${daysUntilNext}d`;
        const lastServiceDate = parseDate(item.datum || item.serviceDate);
        const lastServiceLabel = lastServiceDate ? lastServiceDate.toLocaleDateString('hr-HR') : '-';
        const nextServiceLabel = sljedeciServisDate ? sljedeciServisDate.toLocaleDateString('hr-HR') : '-';

        return { title: display.title, lastService: lastServiceLabel, nextService: nextServiceLabel, status: statusLabel, overdue: daysUntilNext !== null && daysUntilNext < 0 };
      });

      const tableRows = rows.map((r, i) => `
        <tr style="${r.overdue ? 'background:#fee2e2;' : i % 2 === 0 ? 'background:#f9fafb;' : ''}">
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${i + 1}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${r.title}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;">${r.lastService}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;">${r.nextService}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:600;${r.overdue ? 'color:#dc2626;' : ''}">${r.status}</td>
        </tr>
      `).join('');

      const html = `
        <html>
        <head><meta charset="utf-8"><style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { font-size: 18px; color: #1f2937; margin-bottom: 4px; }
          h2 { font-size: 14px; color: #6b7280; font-weight: 400; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: #1f2937; color: #fff; padding: 8px 10px; text-align: left; }
          .summary { margin-top: 16px; font-size: 12px; color: #6b7280; }
        </style></head>
        <body>
          <h1>Neservisirana dizala — ${MONTHS[selectedMonth]} ${selectedYear}</h1>
          <h2>Ukupno: ${rows.length} lokacija</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Lokacija</th>
                <th style="text-align:center;">Zadnji servis</th>
                <th style="text-align:center;">Sljedeći servis</th>
                <th style="text-align:center;">Status</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
          <p class="summary">Generirano: ${new Date().toLocaleDateString('hr-HR')} ${new Date().toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit' })}</p>
        </body>
        </html>
      `;

      await Print.printAsync({ html });
    } catch (e) {
      console.error('Greška pri printanju:', e);
    }
  }, [dedupedServices, selectedMonth, selectedYear]);

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
    const status = getServiceStatus(daysUntilNext);
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
      <View
        style={[
          styles.serviceCard,
          {
            backgroundColor: status.backgroundColor,
            borderColor: status.borderColor,
          },
        ]}
      >
        <View style={[styles.statusStrip, { backgroundColor: status.borderColor }]} />
        <TouchableOpacity
          onPress={handlePress}
          style={styles.serviceContent}
        >
          <View style={styles.serviceHeader}>
            <View style={styles.serviceInfoRow}>
              <View style={[styles.serviceIconWrap, { backgroundColor: status.badgeBackground }]}>
                <Ionicons name="business-outline" size={16} color={status.textColor} />
              </View>
              <View style={styles.serviceInfo}>
                <Text style={styles.elevatorName} numberOfLines={1}>{display.title}</Text>
                <Text style={styles.serviserLabel} numberOfLines={1}>Serviser: {serviserLabel}</Text>
              </View>
            </View>

            <View style={styles.serviceMeta}>
              <View style={styles.serviceMetaTopRow}>
                <Text style={[styles.serviceMetaDate, { color: status.textColor }]}>{String(dateLabel)}</Text>
                <Ionicons
                  name={item.synced ? 'cloud-done-outline' : 'cloud-offline-outline'}
                  size={16}
                  color={item.synced ? '#10b981' : '#ef4444'}
                  style={styles.syncIcon}
                />
                {showNextBadge ? (
                  <View style={[styles.nextServiceBadge, { backgroundColor: status.badgeBackground }]}>
                    <Text style={[styles.nextServiceText, { color: status.badgeTextColor }]}>{String(nextLabel)}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.serviceStatusRow}>
                <View style={[styles.statusDot, { backgroundColor: status.textColor }]} />
                <Text style={[styles.serviceStatusText, { color: status.textColor }]}>{status.label}</Text>
              </View>
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
          : filter === 'notServiced'
            ? 'Sva dizala koja su trebala servis ovaj mjesec su servisirana'
            : 'Nema godišnjih pregleda za odabrani mjesec'}
      </Text>
    </View>
  );

  const keyExtractor = (item, index) => item?._id || item?.id || String(index);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBack}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>

        <View style={styles.monthNav}>
          <TouchableOpacity onPress={goPrevMonth} style={styles.monthArrow} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={22} color="#475569" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.monthButton,
              { backgroundColor: activeFilterMeta.bg, borderColor: activeFilterMeta.border },
            ]}
            onPress={cycleFilter}
            onLongPress={() => {
              clearStatusToast();
              setTempMonth(selectedMonth);
              setTempYear(selectedYear);
              setPeriodPickerOpen(true);
            }}
            activeOpacity={0.85}
          >
            <Text style={[styles.monthButtonText, { color: activeFilterMeta.color }]} numberOfLines={1}>
              {statusToast ? statusToast : `${MONTHS[selectedMonth]} ${selectedYear}`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={goNextMonth} style={styles.monthArrow} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-forward" size={22} color="#475569" />
          </TouchableOpacity>
        </View>

        {filter === 'notServiced' && dedupedServices.length > 0 ? (
          <TouchableOpacity onPress={handlePrintNotServiced} style={styles.headerPrint}>
            <Ionicons name="print-outline" size={22} color="#0ea5e9" />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerBack} />
        )}
      </View>

      <FlatList
        data={dedupedServices}
        renderItem={renderServiceItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: 16 },
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
    </SafeAreaView>
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
  headerBack: {
    width: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerPrint: {
    width: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  monthNav: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  monthArrow: {
    padding: 6,
    borderRadius: 999,
  },
  monthButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    minWidth: 210,
    justifyContent: 'center',
  },
  monthButtonText: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.2,
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
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    overflow: 'hidden',
  },
  statusStrip: {
    width: 4,
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
  serviceInfoRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  serviceIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
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
    alignItems: 'flex-end',
    gap: 5,
  },
  serviceMetaTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  serviceMetaDate: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#374151',
  },
  syncIcon: {
    marginTop: 0,
  },
  nextServiceBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
  },
  nextServiceText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#1f2937',
  },
  serviceStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  serviceStatusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
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

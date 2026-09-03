import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
  Platform,
  BackHandler,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { elevatorDB, serviceDB, repairDB } from '../database/db';
import { syncAll, primeFullSync, getSyncRateLimitUntil, getSyncRateLimitMessage } from '../services/syncService';
import { messagesAPI } from '../services/api';
import ms, { rf } from '../utils/scale';
import { isElevatorDueThisMonth } from '../utils/serviceSchedule';

const DIZALA_CARD_IMAGE = require('../../assets/dizala_card.png');
const MAP_CARD_IMAGE = require('../../assets/map_card.png');

export default function HomeScreen({ navigation }) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { user, isOnline, serverAwake, logout } = useAuth();
  const [offlineDemo, setOfflineDemo] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const unreadFetchInProgressRef = useRef(false);
  const lastUnreadFetchAtRef = useRef(0);
  const unreadRateLimitedUntilRef = useRef(0);

  useEffect(() => {
    (async () => {
      const token = await SecureStore.getItemAsync('userToken');
      setOfflineDemo(Boolean(token && token.startsWith('offline_token_')));
    })();
  }, []);
   const [stats, setStats] = useState({
     totalElevators: 0,
     elevatorsRequiringServiceThisMonth: 0,
     servicedElevatorsThisMonth: 0,
     servicesThisMonth: 0,
     repairsPending: 0,
     repairsTrebaloBi: 0,
     repairsUnsigned: 0,
     repairsUrgent: 0,
   });
  const [refreshing, setRefreshing] = useState(false);

  const isSmallScreen = screenWidth < 390;
  const isTinyScreen = screenWidth < 360;
  const isCompactScreen = isTinyScreen || (isSmallScreen && screenHeight < 780);
  const gridGap = isTinyScreen ? 7 : (isCompactScreen ? 8 : 9);
  const gridPadding = isTinyScreen ? 10 : (isCompactScreen ? 12 : 14);
  const cardWidth = (screenWidth - (gridPadding * 2) - gridGap) / 2;
  const fullCardWidth = screenWidth - (gridPadding * 2);
  const quickCardHeight = isTinyScreen ? 94 : (isCompactScreen ? 98 : 104);
  const servicesCardHeight = isTinyScreen ? 108 : (isCompactScreen ? 112 : 118);
  const repairsCardHeight = isTinyScreen ? 112 : (isCompactScreen ? 116 : 122);

  // Konvertiraj isOnline u boolean eksplicitno
  const online = Boolean(isOnline);
  const serverReady = serverAwake === null ? null : Boolean(serverAwake);

  const fetchUnread = useCallback(async () => {
    if (!online) {
      setUnreadCount(0);
      return;
    }

    if (Date.now() < unreadRateLimitedUntilRef.current) {
      return;
    }

    const now = Date.now();
    if (unreadFetchInProgressRef.current) {
      return;
    }
    if (now - lastUnreadFetchAtRef.current < 2000) {
      return;
    }

    unreadFetchInProgressRef.current = true;
    lastUnreadFetchAtRef.current = now;

    try {
      const res = await messagesAPI.getUnreadCount();
      // Backend šalje { success, count, data } gdje su count i data jednaki
      const payload = res?.data || {};
      const count = payload.count ?? payload.data ?? 0;
      setUnreadCount(Number(count) || 0);
    } catch (e) {
      console.log('Unread count fetch failed', e?.message || e);
      const status = Number(e?.status || e?.response?.status || 0);
      if (status === 429) {
        unreadRateLimitedUntilRef.current = Date.now() + (15 * 60 * 1000);
      }
    } finally {
      unreadFetchInProgressRef.current = false;
    }
  }, [online]);

  useEffect(() => {
    loadStats();
    fetchUnread();
  }, [fetchUnread]);

  useFocusEffect(
    useCallback(() => {
      loadStats();
      fetchUnread();
      // Na Home ekranu, hardverski Back na Androidu izlazi iz aplikacije
      if (Platform.OS === 'android') {
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
          BackHandler.exitApp();
          return true; // spriječi default navigaciju
        });
        return () => sub.remove();
      }
      return undefined;
    }, [fetchUnread])
  );

   // Gauge se računa prema dizalima koja trebaju biti servisirana ovaj mjesec
   const serviceProgress = stats.elevatorsRequiringServiceThisMonth
     ? Math.min(1, Math.max(0, stats.servicedElevatorsThisMonth / stats.elevatorsRequiringServiceThisMonth))
     : 0;

  // Semicircle only (no labels/dashes)

  function loadStats() {
    try {
      const elevators = elevatorDB.getAll() || [];
      const servicesAll = serviceDB.getAll() || [];
      const repairs = repairDB.getAll() || [];

      const parseAnyDate = (value) => {
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

        // Epoch kao string
        if (/^\d{10,13}$/.test(raw)) {
          const n = Number(raw.length === 10 ? `${raw}000` : raw);
          const d = new Date(n);
          if (!Number.isNaN(d.getTime())) return d;
        }

        // Euro format: dd.mm.yyyy ili dd-mm-yyyy
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

      const normalizeStatus = (s) => {
        if (!s) return 'pending';
        const lower = String(s).toLowerCase();
        if (lower === 'cek' || lower === 'čekanje' || lower === 'pending') return 'pending';
        if (lower === 'završen' || lower === 'zavrsen' || lower === 'completed') return 'completed';
        return s;
      };

      // Broji sva neobrisana dizala osim eksplicitno neaktivnih
      const activeElevators = elevators.filter((e) => !e.is_deleted && String(e.status || '').toLowerCase() !== 'neaktivan');
      const activeElevatorIds = new Set(
        activeElevators
          .map((e) => {
            const id = e.id || e._id;
            return id ? String(id) : null;
          })
          .filter(Boolean)
      );

      // Izgradi skup postojećih ID-eva dizala (lokalni id ili _id), izuzmi obrisane
      const existingElevatorIds = new Set(
        elevators
          .filter(e => !e.is_deleted)
          .map(e => {
            const id = e.id || e._id;
            return id ? String(id) : null;
          })
          .filter(Boolean)
      );

      // Normaliziraj i filtriraj servise koji pripadaju postojećim dizalima
      const validServicesRaw = servicesAll.filter(s => {
        const elevatorIdRaw = typeof s.elevatorId === 'object' && s.elevatorId !== null
          ? (s.elevatorId._id || s.elevatorId.id)
          : s.elevatorId;
        const elevatorId = elevatorIdRaw ? String(elevatorIdRaw) : null;
        return elevatorId && existingElevatorIds.has(elevatorId);
      });

      // Ukloni eventualne duplikate (po id/_id) – ponekad sync može privremeno duplicirati
      const uniqueServicesMap = new Map();
      validServicesRaw.forEach(s => {
        const sid = s.id || s._id;
        if (sid && !uniqueServicesMap.has(sid)) {
          uniqueServicesMap.set(sid, s);
        }
      });
      const services = Array.from(uniqueServicesMap.values());

      // Servisi ovaj mjesec
      const now = new Date();
      const thisMonth = services.filter(s => {
        // ✅ FIX: Pokušaj oboje - novi 'datum' i stari 'serviceDate' ako migration nije završena
        const dateStr = s.datum || s.serviceDate;
        if (!dateStr) return false;

        const date = parseAnyDate(dateStr);
        if (!date) return false;
        return date.getMonth() === now.getMonth() && 
               date.getFullYear() === now.getFullYear();
      });

      const servicedThisMonthIds = new Set(
        thisMonth
          .map((s) => {
            const sid = typeof s.elevatorId === 'object' && s.elevatorId !== null
              ? (s.elevatorId._id || s.elevatorId.id)
              : s.elevatorId;
            return sid ? String(sid) : null;
          })
          .filter(Boolean)
      );

      const dueElevatorIds = new Set();

      activeElevators.forEach((elevator) => {
        const elevatorId = elevator.id || elevator._id;
        if (!elevatorId) return;
        const elevatorKey = String(elevatorId);

        if (isElevatorDueThisMonth(elevator, now)) {
          dueElevatorIds.add(elevatorKey);
        }
      });

      // KPI za mjesec: trebalo servisirati = (due po roku) U (servisirano ovaj mjesec)
      // Time servisirana dizala ne ispadaju iz nazivnika nakon što im se sljedeciServis pomakne u idući mjesec.
      const servicedActiveIds = new Set(
        Array.from(servicedThisMonthIds).filter((id) => activeElevatorIds.has(String(id)))
      );
      const requiredThisMonthIds = new Set([...dueElevatorIds, ...servicedActiveIds]);

      const elevatorsRequiringServiceThisMonth = requiredThisMonthIds.size;
      const servicedElevatorsThisMonth = servicedActiveIds.size;

      // Servisirana brojimo samo među dizalima koja su bila due u odabranom mjesecu.

      // Filtriraj popravke: preskoči obrisane i one čije je dizalo obrisano ili ne postoji
      const filteredRepairs = repairs
        .filter((r) => r && typeof r === 'object')
        .filter((r) => {
          const elevatorId = typeof r.elevatorId === 'object' && r.elevatorId !== null
            ? r.elevatorId._id || r.elevatorId.id
            : r.elevatorId;

          const elevator = elevatorId ? elevatorDB.getById(elevatorId) : null;
          const elevatorDeleted = Boolean(
            (typeof r.elevatorId === 'object' && r.elevatorId?.is_deleted) ||
            (elevator && elevator.is_deleted)
          );

          if (r.is_deleted) return false;
          if (elevatorDeleted) return false;
          if (elevatorId && !elevator) return false;
          return true;
        });

      // Ukloni duplikate po id/_id kako bi brojač bio usklađen s listom
      const uniqueRepairsMap = new Map();
      filteredRepairs.forEach((r) => {
        const rid = r._id || r.id;
        if (rid && !uniqueRepairsMap.has(rid)) {
          uniqueRepairsMap.set(rid, r);
        } else if (!rid) {
          uniqueRepairsMap.set(Symbol('no-id'), r);
        }
      });
      const uniqueRepairs = Array.from(uniqueRepairsMap.values());

      // Popravci po statusu
      const statusCounts = uniqueRepairs.reduce(
        (acc, r) => {
          const rawLower = String(r.status || '').toLowerCase();
          const rawType = String(r.type || r.category || '').toLowerCase();
          const status = normalizeStatus(r.status);
          const isTrebaloBi = Boolean(
            r.trebaloBi || r.trebalo_bi || r.trebaloBI || r.trebalobi ||
            rawType === 'trebalobi' || rawType === 'trebalo_bi' || rawType === 'trebalo-bi' || rawType === 'trebalo' ||
            rawLower === 'in_progress' || rawLower === 'u tijeku' || rawLower === 'u_tijeku'
          );
          const isSigned = r.radniNalogPotpisan === true || r.radniNalogPotpisan === 1 || String(r.radniNalogPotpisan).toLowerCase() === 'true';

          if (isTrebaloBi) acc.trebaloBi += 1;
          else if (status === 'pending') acc.pending += 1;
          if (!isTrebaloBi && status === 'completed' && !isSigned) acc.unsigned += 1;
          return acc;
        },
        { pending: 0, trebaloBi: 0, unsigned: 0 }
      );

       setStats({
         totalElevators: activeElevators.length,
         elevatorsRequiringServiceThisMonth,
         servicedElevatorsThisMonth,
         servicesThisMonth: thisMonth.length,
         repairsPending: statusCounts.pending,
         repairsTrebaloBi: statusCounts.trebaloBi,
         repairsUnsigned: statusCounts.unsigned,
         repairsUrgent: 0, // U novoj shemi nema priority polja
       });
    } catch (error) {
       console.error('Greška pri učitavanju statistike:', error);
       setStats({
         totalElevators: 0,
         elevatorsRequiringServiceThisMonth: 0,
         servicedElevatorsThisMonth: 0,
         servicesThisMonth: 0,
         repairsPending: 0,
         repairsTrebaloBi: 0,
         repairsUnsigned: 0,
        repairsUrgent: 0,
      });
    }
  }

  const onRefresh = async () => {
    setRefreshing(true);
    const synced = await syncAll();
    if (!synced && Date.now() < getSyncRateLimitUntil()) {
      Alert.alert('Sinkronizacija pauzirana', getSyncRateLimitMessage());
    }
    loadStats();
    await fetchUnread();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={[styles.header, isCompactScreen && styles.headerCompact]}>
        <View>
          <Text style={[styles.greeting, isCompactScreen && styles.greetingCompact]}>Pozdrav, {user?.prezime}!</Text>
          <View style={styles.statusLine}>
            <View style={styles.statusContainer}>
              <View style={[styles.statusDot, { backgroundColor: online ? '#10b981' : '#ef4444' }]} />
              <Text style={[styles.statusText, isCompactScreen && styles.statusTextCompact]}>
                {online ? 'Online' : 'Offline'}
              </Text>
            </View>
            <View style={styles.statusContainer}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: serverReady ? '#10b981' : (serverReady === null ? '#f59e0b' : '#ef4444') },
                ]}
              />
              <Text style={[styles.statusText, isCompactScreen && styles.statusTextCompact]}>
                {serverReady
                  ? 'Server ON'
                  : serverReady === null
                    ? 'Provjeravam...'
                    : 'Server se budi'}
              </Text>
            </View>
          </View>
        </View>
        <View style={[styles.headerButtons, isCompactScreen && styles.headerButtonsCompact]}>
          <TouchableOpacity 
            onPress={() => navigation.navigate('About')}
            style={styles.headerButton}
          >
            <Ionicons name="information-circle-outline" size={isCompactScreen ? 24 : 28} color="#666" />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => navigation.navigate('ChatRooms')}
            style={styles.headerButton}
          >
            <View>
              <Ionicons
                name="chatbubbles-outline"
                size={isCompactScreen ? 22 : 26}
                color={unreadCount > 0 ? '#ef4444' : '#666'}
              />
              {unreadCount > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={logout}>
            <Ionicons name="log-out-outline" size={isCompactScreen ? 24 : 28} color="#666" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {!serverReady && (
          <View style={styles.serverWarning}>
            <Ionicons name="time-outline" size={18} color="#f59e0b" />
            <Text style={styles.serverWarningText}>
              Server se budi (Render free tier). Čitanje je dostupno, uređivanje čeka "Server ON".
            </Text>
          </View>
        )}
        {/* Stats Cards */}
        <View style={[styles.statsGrid, { padding: gridPadding, gap: gridGap }]}>
          <TouchableOpacity 
            style={[
              styles.statCard,
              styles.quickCard,
              styles.statCardElevators,
              { width: cardWidth, height: quickCardHeight },
            ]}
            onPress={() => navigation.navigate('Elevators')}
          >
            <View style={[styles.quickCardImageFrame, styles.elevatorImageFrame]}>
              <Image
                source={DIZALA_CARD_IMAGE}
                style={styles.quickCardImage}
                resizeMode="contain"
              />
            </View>
            <View style={styles.quickCardText}>
              <Text style={styles.quickCardLabel}>DIZALA</Text>
              <Text style={styles.quickCardValue}>{stats.totalElevators}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[
              styles.statCard,
              styles.quickCard,
              styles.mapCard,
              { width: cardWidth, height: quickCardHeight },
            ]}
            onPress={() => navigation.navigate('Map')}
          >
            <View style={[styles.quickCardImageFrame, styles.mapImageFrame]}>
              <Image
                source={MAP_CARD_IMAGE}
                style={styles.quickCardImage}
                resizeMode="contain"
              />
            </View>
            <View style={styles.quickCardText}>
              <Text style={styles.quickCardLabel}>KARTA</Text>
              <Ionicons name="location" size={24} color="#15956f" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[
              styles.statCard,
              styles.statCardServices,
              styles.statCardWide,
              { width: fullCardWidth, height: servicesCardHeight },
            ]}
            onPress={() => navigation.navigate('Services')}
          >
            <View style={styles.summaryHeader}>
              <View style={styles.summaryTitleWrap}>
                <View style={styles.summaryIconBlue}>
                  <Ionicons name="construct-outline" size={21} color="#2563eb" />
                </View>
                <View>
                  <Text style={styles.summaryTitle}>SERVISI</Text>
                  <Text style={styles.summarySubtitle}>Servisirano ovaj mjesec</Text>
                </View>
              </View>
              <Text style={styles.summaryValue}>{stats.servicedElevatorsThisMonth}/{stats.elevatorsRequiringServiceThisMonth}</Text>
            </View>
            <View style={styles.serviceProgressMeta}>
              <Text style={styles.serviceProgressLabel}>Napredak</Text>
              <Text style={styles.serviceProgressPercent}>{Math.round(serviceProgress * 100)}%</Text>
            </View>
            <View style={styles.servicesProgressTrack}>
              <View
                style={[
                  styles.servicesProgressFill,
                  { width: `${Math.max(4, Math.round(serviceProgress * 100))}%` },
                ]}
              />
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[
              styles.statCard,
              styles.statCardRepairs,
              styles.statCardWide,
              { width: fullCardWidth, height: repairsCardHeight },
            ]}
            onPress={() => navigation.navigate('Repairs')}
          >
            <View style={styles.summaryHeader}>
              <View style={styles.summaryTitleWrap}>
                <View style={styles.summaryIconRed}>
                  <Ionicons name="hammer-outline" size={21} color="#ef4444" />
                </View>
                <Text style={styles.summaryTitle}>POPRAVCI</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#64748b" />
            </View>
            <View style={styles.repairMetricsRow}>
              <View style={styles.repairMetric}>
                <Text style={[styles.repairMetricNumber, { color: '#ef4444' }]}>{stats.repairsPending}</Text>
                <Text style={styles.repairMetricLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Čekanje</Text>
              </View>
              <View style={styles.repairMetricDivider} />
              <View style={styles.repairMetric}>
                <Text style={[styles.repairMetricNumber, { color: '#f59e0b' }]}>{stats.repairsTrebaloBi}</Text>
                <Text style={styles.repairMetricLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Trebalo bi</Text>
              </View>
              <View style={styles.repairMetricDivider} />
              <View style={styles.repairMetric}>
                <Text style={[styles.repairMetricNumber, { color: '#2563eb' }]}>{stats.repairsUnsigned}</Text>
                <Text style={styles.repairMetricLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>Nepotpisano</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Admin sekcija - samo za administratore i menadžere */}
        {(user?.uloga === 'admin' || user?.uloga === 'menadzer') && !offlineDemo && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Administracija</Text>
            
            <TouchableOpacity 
              style={[styles.actionButton, styles.adminButton]}
              onPress={() => navigation.navigate('CompanySettings')}
            >
              <Ionicons name="business" size={24} color="#2563eb" />
              <Text style={styles.actionText}>Postavke firme</Text>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>

            {user?.uloga === 'admin' && (
              <TouchableOpacity 
                style={[styles.actionButton, styles.adminButton]}
                onPress={() => navigation.navigate('UserManagement')}
              >
                <Ionicons name="people" size={24} color="#FF6B6B" />
                <Text style={styles.actionText}>Upravljanje korisnicima</Text>
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </TouchableOpacity>
            )}

            {user?.superAdmin && (
              <TouchableOpacity 
                style={[styles.actionButton, { borderLeftColor: '#7c3aed', borderLeftWidth: 4 }]}
                onPress={() => navigation.navigate('SuperAdmin')}
              >
                <Ionicons name="shield-checkmark" size={24} color="#7c3aed" />
                <Text style={styles.actionText}>Super Admin Panel</Text>
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {(user?.uloga === 'admin' || user?.uloga === 'menadzer') && offlineDemo && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Administracija</Text>
            <View style={styles.offlineAdminBox}>
              <Ionicons name="lock-closed" size={20} color="#ef4444" />
              <Text style={styles.offlineAdminText}>Offline demo korisnik – administracija nedostupna dok se ne prijaviš online.</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    paddingTop: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerButtonsCompact: {
    gap: 10,
  },
  headerButton: {
    padding: 4,
  },
  greeting: {
    fontSize: rf(22, 18, 38),
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 5,
  },
  greetingCompact: {
    fontSize: rf(19, 16, 30),
    marginBottom: 3,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: 14,
    rowGap: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: rf(13, 11.5, 20),
    color: '#666',
  },
  statusTextCompact: {
    fontSize: rf(12, 10.5, 18),
  },
  headerCompact: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    paddingTop: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 22,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 15,
    gap: 10,
  },
  statCard: {
    backgroundColor: '#f3f6fb',
    borderRadius: 16,
    padding: 12,
    width: '47%',
    minHeight: 0,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#dfe7f2',
  },
  statCardElevators: {
    backgroundColor: '#f3f7ff',
    borderColor: '#d6e3f8',
  },
  statCardTopSquare: {
    minHeight: 0,
    justifyContent: 'flex-start',
    paddingTop: 8,
    paddingBottom: 8,
    overflow: 'hidden',
  },
  topCardBody: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topCardFooter: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 2,
  },
  statCardBottom: {
    minHeight: 0,
  },
  statCardWide: {
    width: '100%',
  },
  quickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 7,
    gap: 7,
    overflow: 'hidden',
  },
  quickCardImageFrame: {
    height: '100%',
    aspectRatio: 1,
    padding: 0,
    borderRadius: 12,
    backgroundColor: 'transparent',
    borderWidth: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    overflow: 'hidden',
  },
  elevatorImageFrame: {
    borderColor: 'transparent',
  },
  mapImageFrame: {
    borderColor: 'transparent',
  },
  quickCardImage: {
    width: '100%',
    height: '100%',
    borderRadius: 9,
  },
  quickCardText: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  quickCardValue: {
    fontSize: rf(23, 19, 30),
    fontWeight: '800',
    color: '#0f172a',
    lineHeight: rf(27, 23, 35),
    textAlign: 'center',
  },
  quickCardLabel: {
    fontSize: rf(11, 9.5, 14),
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0,
    textAlign: 'center',
  },
  dizalaCardImage: {
    width: '100%',
    height: 114,
    borderRadius: 16,
    marginTop: 4,
    marginBottom: 8,
  },
  dizalaCardImageInner: {
    borderRadius: 16,
  },
  statCardServices: {
    backgroundColor: '#f3f7fb',
    borderColor: '#dfe7f1',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
  },
  servicesCardBody: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
    paddingBottom: 2,
  },
  statCardRepairs: {
    backgroundColor: '#f3f7fb',
    borderColor: '#dfe7f1',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  mapCard: {
    backgroundColor: '#f2f8f5',
    overflow: 'hidden',
    borderColor: '#d7e9e1',
  },
  summaryHeader: {
    width: '100%',
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  summaryTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flexShrink: 1,
  },
  summaryIconBlue: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dbeafe',
  },
  summaryIconRed: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fee2e2',
  },
  summaryTitle: {
    fontSize: rf(16, 14, 20),
    fontWeight: '800',
    color: '#1f2937',
    letterSpacing: 0.2,
  },
  summarySubtitle: {
    marginTop: 1,
    fontSize: rf(10.5, 9, 13),
    fontWeight: '600',
    color: '#64748b',
  },
  summaryValue: {
    fontSize: rf(22, 18, 29),
    fontWeight: '800',
    color: '#0f172a',
  },
  serviceProgressMeta: {
    width: '100%',
    marginTop: 9,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  serviceProgressLabel: {
    fontSize: rf(10.5, 9, 13),
    fontWeight: '600',
    color: '#64748b',
  },
  serviceProgressPercent: {
    fontSize: rf(11, 9.5, 14),
    fontWeight: '800',
    color: '#2563eb',
  },
  repairMetricsRow: {
    flex: 1,
    width: '100%',
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  repairMetric: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repairMetricNumber: {
    fontSize: rf(22, 18, 29),
    fontWeight: '800',
    lineHeight: rf(25, 21, 33),
  },
  repairMetricLabel: {
    marginTop: 1,
    fontSize: rf(12, 10.5, 15),
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
    width: '100%',
  },
  repairMetricDivider: {
    width: 1,
    marginVertical: 4,
    backgroundColor: '#dbe3ee',
  },
  mapCardImage: {
    width: '100%',
    height: 192,
    borderRadius: 16,
  },
  mapCardImageInner: {
    borderRadius: 16,
  },
  cardIconBubble: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: '#f2f6fd',
    borderWidth: 1,
    borderColor: '#dbe5f4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  cardIconBubbleTop: {
    marginTop: 12,
  },
  cardIconBubbleRepairs: {
    marginTop: 2,
    marginBottom: 10,
  },
  repairsList: {
    flex: 1,
    width: '100%',
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  repairsListCompact: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 6,
  },
  repairsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#0f172a',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  repairsRowCompact: {
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 10,
  },
  repairsRowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  repairsRowLabel: {
    flex: 1,
    flexShrink: 0,
    fontSize: rf(12, 10, 18),
    fontWeight: '700',
    color: '#334155',
    letterSpacing: 0.2,
    marginRight: 6,
  },
  repairsRowLabelCompact: {
    fontSize: rf(11, 9.5, 16),
    letterSpacing: 0.2,
  },
  repairsRowNumber: {
    fontSize: rf(18, 15, 24),
    fontWeight: '800',
    minWidth: 24,
    textAlign: 'right',
  },
  repairsRowNumberCompact: {
    fontSize: rf(16, 14, 22),
    minWidth: 22,
  },
  repairsCardBackground: {
    flex: 1,
    width: '100%',
  },
  repairsCardBackgroundImage: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  repairsCardBlend: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.16)',
  },
  repairsTopArea: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  repairsCardFooter: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: 6,
    paddingBottom: 16,
    backgroundColor: '#f3f7fb',
  },
  servicesKpiWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  servicesKpiRatio: {
    fontSize: rf(26, 20, 34),
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 0.2,
    marginBottom: 6,
  },
  servicesKpiRatioCompact: {
    fontSize: rf(24, 18, 34),
    marginBottom: 6,
  },
  servicesProgressTrack: {
    width: '100%',
    height: 8,
    backgroundColor: '#dbe7fb',
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#c7d7f3',
  },
  servicesProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#2563eb',
  },
  servicesProgressScale: {
    width: '88%',
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  servicesProgressScaleText: {
    fontSize: rf(10.5, 9, 13),
    fontWeight: '700',
    color: '#64748b',
  },
  statNumberTop: {
    fontSize: rf(33, 26, 44),
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 2,
    marginBottom: 2,
  },
  statNumberTopSmall: {
    fontSize: rf(34, 25, 44),
  },
  statNumberTopTiny: {
    fontSize: rf(30, 22, 38),
    marginTop: 2,
    marginBottom: 4,
  },
  cardBottomDivider: {
    width: '92%',
    height: 1,
    backgroundColor: '#d8dee8',
    marginTop: 'auto',
    marginBottom: 8,
  },
  cardBottomDividerTop: {
    marginTop: 0,
  },
  cardBottomTitle: {
    fontSize: rf(15, 12.5, 19),
    fontWeight: '800',
    color: '#1f2937',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statCardUrgent: {
    borderWidth: 2,
    borderColor: '#ef4444',
  },
  statNumber: {
    fontSize: rf(44, 32, 58),
    fontWeight: 'bold',
    color: '#0f172a',
    marginTop: 4,
  },
  statLabel: {
    fontSize: rf(13, 11.5, 20),
    color: '#666',
    textAlign: 'center',
    marginTop: 5,
  },
  servicesStatLabel: {
    fontSize: rf(12, 10.5, 18),
    marginTop: 3,
  },
  servicesStatLabelCompact: {
    fontSize: rf(10.5, 9.5, 14),
    marginTop: 2,
  },
  statSubLabel: {
    fontSize: rf(12, 11, 19),
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 2,
  },
  statLabelBold: {
    fontWeight: '700',
    color: '#111827',
  },
  sectionTitleUpper: {
    letterSpacing: 0.8,
    fontSize: rf(18, 15, 28),
    marginBottom: 0,
    fontFamily: Platform.select({ ios: 'HelveticaNeue-Medium', android: 'sans-serif-medium', default: 'sans-serif' }),
  },
  repairsCounters: {
    flex: 1,
    width: '100%',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  repairsSubLabel: {
    fontSize: rf(13, 10.5, 20),
    color: '#f8fafc',
    fontWeight: '800',
    textAlign: 'center',
    flexShrink: 1,
    letterSpacing: 0.2,
    width: '86%',
    backgroundColor: 'rgba(15, 23, 42, 0.24)',
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 8,
    textShadowColor: 'rgba(15, 23, 42, 0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  repairsPending: {
    color: '#ef4444',
  },
  repairsTrebaloBi: {
    color: '#f59e0b',
  },
  repairsUnsigned: {
    color: '#2563eb',
  },
  gaugeWrapper: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
  },
  section: {
    padding: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 15,
  },
  actionButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  actionText: {
    flex: 1,
    fontSize: rf(15, 13, 23),
    color: '#1f2937',
    marginLeft: 15,
  },
  adminButton: {
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B6B',
  },
  offlineAdminBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  offlineAdminText: {
    flex: 1,
    fontSize: rf(13, 11.5, 20),
    color: '#b91c1c',
    lineHeight: 20,
  },
  unreadBadge: {
    position: 'absolute',
    top: -6,
    right: -10,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  unreadText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  serverWarning: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fef3c7',
    margin: 15,
    marginTop: 8,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  serverWarningText: {
    flex: 1,
    color: '#92400e',
    fontSize: rf(13, 11.5, 20),
    lineHeight: 18,
  },
});



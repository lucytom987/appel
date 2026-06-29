import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Animated,
  Easing,
  ImageBackground,
  Platform,
  BackHandler,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import { elevatorDB, serviceDB, repairDB } from '../database/db';
import { syncAll, primeFullSync } from '../services/syncService';
import { messagesAPI } from '../services/api';
import ms, { rf } from '../utils/scale';

// Gauge geometry (semicircle)
const GAUGE_SIZE = 140;
const GAUGE_RADIUS = GAUGE_SIZE / 2;
const GAUGE_MASK_HEIGHT = GAUGE_RADIUS;
const GAUGE_BG_IMAGE = { uri: 'https://images.unsplash.com/photo-1517244871184-6ac0400d035b?auto=format&fit=crop&w=400&q=60' };
const DIZALA_CARD_IMAGE = require('../../assets/dizala_card.png');
const MAP_CARD_IMAGE = require('../../assets/map_card.png');
const GAUGE_NEEDLE_COLOR = '#22c55e';
const GAUGE_NEEDLE_WIDTH = 4;
const GAUGE_NEEDLE_HEIGHT = GAUGE_RADIUS - 6;

export default function HomeScreen({ navigation }) {
  const { width: screenWidth } = useWindowDimensions();
  const { user, isOnline, serverAwake, logout } = useAuth();
  const [offlineDemo, setOfflineDemo] = useState(false);
  const serviceGauge = useRef(new Animated.Value(0));
  const [unreadCount, setUnreadCount] = useState(0);

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
  const gridGap = isTinyScreen ? 8 : 10;
  const gridPadding = isTinyScreen ? 12 : 15;
  const cardWidth = (screenWidth - (gridPadding * 2) - gridGap) / 2;
  const topCardHeight = isTinyScreen ? 194 : (isSmallScreen ? 202 : 212);
  const bottomCardHeight = isTinyScreen ? 248 : (isSmallScreen ? 258 : 268);

  // Konvertiraj isOnline u boolean eksplicitno
  const online = Boolean(isOnline);
  const serverReady = serverAwake === null ? null : Boolean(serverAwake);

  const fetchUnread = useCallback(async () => {
    if (!online) {
      setUnreadCount(0);
      return;
    }
    try {
      const res = await messagesAPI.getUnreadCount();
      // Backend šalje { success, count, data } gdje su count i data jednaki
      const payload = res?.data || {};
      const count = payload.count ?? payload.data ?? 0;
      setUnreadCount(Number(count) || 0);
    } catch (e) {
      console.log('Unread count fetch failed', e?.message || e);
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

  useEffect(() => {
    Animated.timing(serviceGauge.current, {
      toValue: serviceProgress,
      duration: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [serviceProgress]);

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
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      const thisMonth = services.filter(s => {
        // ✅ FIX: Pokušaj oboje - novi 'datum' i stari 'serviceDate' ako migration nije završena
        const dateStr = s.datum || s.serviceDate;
        if (!dateStr) return false;

        const date = parseAnyDate(dateStr);
        if (!date) return false;
        return date.getMonth() === now.getMonth() && 
               date.getFullYear() === now.getFullYear();
      });

      // ===== LOGIKA: due = sljedeciServis do kraja mjeseca (uključuje overdue) =====
      const resolveDueDate = (elevator) => {
        const nextRaw = elevator?.sljedeciServis;
        const nextDate = parseAnyDate(nextRaw);
        if (nextDate) return nextDate;

        const lastRaw = elevator?.zadnjiServis;
        const lastDate = parseAnyDate(lastRaw);
        if (lastDate) {
          const interval = Number(elevator?.intervalServisa || 1);
          const computed = new Date(lastDate);
          computed.setMonth(computed.getMonth() + (Number.isFinite(interval) && interval > 0 ? interval : 1));
          return computed;
        }

        return null;
      };

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

        const dueDate = resolveDueDate(elevator);
        if (!dueDate) return;

        // Due ako je rok do kraja mjeseca (uključuje prethodno propuštene servise)
        if (dueDate <= endOfMonth) {
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
    await syncAll();
    loadStats();
    await fetchUnread();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Pozdrav, {user?.prezime}!</Text>
          <View style={styles.statusContainer}>
            <View style={[styles.statusDot, { backgroundColor: online ? '#10b981' : '#ef4444' }]} />
            <Text style={styles.statusText}>
              {online ? 'Online' : 'Offline'}
            </Text>
          </View>
          <View style={[styles.statusContainer, { marginTop: 4 }]}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: serverReady ? '#10b981' : (serverReady === null ? '#f59e0b' : '#ef4444') },
              ]}
            />
            <Text style={styles.statusText}>
              {serverReady
                ? 'Server ON'
                : serverReady === null
                  ? 'Provjeravam server...'
                  : 'Server se budi (Render)'}
            </Text>
          </View>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity 
            onPress={() => navigation.navigate('About')}
            style={styles.headerButton}
          >
            <Ionicons name="information-circle-outline" size={28} color="#666" />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => navigation.navigate('ChatRooms')}
            style={styles.headerButton}
          >
            <View>
              <Ionicons
                name="chatbubbles-outline"
                size={26}
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
            <Ionicons name="log-out-outline" size={28} color="#666" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
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
              styles.statCardTopSquare,
              styles.statCardElevators,
              { width: cardWidth, height: topCardHeight },
            ]}
            onPress={() => navigation.navigate('Elevators')}
          >
            <View style={styles.topCardBody}>
              <ImageBackground
                source={DIZALA_CARD_IMAGE}
                style={[
                  styles.dizalaCardImage,
                  {
                    height: isTinyScreen ? 82 : (isSmallScreen ? 90 : 100),
                    marginBottom: isTinyScreen ? 4 : 6,
                  },
                ]}
                imageStyle={styles.dizalaCardImageInner}
                resizeMode="cover"
              />
              <Text style={[styles.statNumberTop, isSmallScreen && styles.statNumberTopSmall, isTinyScreen && styles.statNumberTopTiny]}>
                {stats.totalElevators}
              </Text>
            </View>
            <View style={styles.topCardFooter}>
              <View style={[styles.cardBottomDivider, styles.cardBottomDividerTop]} />
              <Text style={styles.cardBottomTitle}>DIZALA</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[
              styles.statCard,
              styles.statCardTopSquare,
              styles.mapCard,
              { width: cardWidth, height: topCardHeight },
            ]}
            onPress={() => navigation.navigate('Map')}
          >
            <View style={styles.topCardBody}>
              <ImageBackground
                source={MAP_CARD_IMAGE}
                style={[
                  styles.mapCardImage,
                  { height: isTinyScreen ? 104 : (isSmallScreen ? 112 : 122) },
                ]}
                imageStyle={styles.mapCardImageInner}
                resizeMode="cover"
              />
            </View>
            <View style={styles.topCardFooter}>
              <View style={[styles.cardBottomDivider, styles.cardBottomDividerTop]} />
              <Text style={styles.cardBottomTitle}>KARTA</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[
              styles.statCard,
              styles.statCardBottom,
              styles.statCardServices,
              { width: cardWidth, minHeight: bottomCardHeight },
            ]}
            onPress={() => navigation.navigate('Services')}
          >
            <View style={styles.servicesCardBody}>
              <View style={styles.gaugeWrapper}>
                <ImageBackground
                  source={GAUGE_BG_IMAGE}
                  style={styles.gaugeBg}
                  imageStyle={styles.gaugeBgImage}
                >
                  <View style={styles.gaugeMask}>
                    <View style={styles.gaugeArc} />
                    <Animated.View
                      style={[
                        styles.gaugeNeedle,
                        {
                          transform: [
                            { translateY: GAUGE_NEEDLE_HEIGHT / 2 },
                            {
                              rotateZ: serviceGauge.current.interpolate({
                                inputRange: [0, 1],
                                outputRange: ['-90deg', '90deg'],
                                extrapolate: 'clamp',
                              }),
                            },
                            { translateY: -GAUGE_NEEDLE_HEIGHT / 2 },
                          ],
                        },
                      ]}
                    >
                      <View style={styles.gaugeNeedleBody} />
                      <View style={styles.gaugeNeedleHighlight} />
                    </Animated.View>
                    <View style={styles.gaugeNeedleHub} />
                  </View>
                </ImageBackground>
              </View>
              <Text
                style={[
                  styles.statNumber,
                  styles.statNumberServices,
                  isSmallScreen && styles.statNumberServicesSmall,
                  isTinyScreen && styles.statNumberServicesTiny,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {stats.servicedElevatorsThisMonth}/{stats.elevatorsRequiringServiceThisMonth}
              </Text>
              <Text style={styles.statLabel}>Servisirano ovaj mjesec</Text>
            </View>
            <View style={styles.cardBottomDivider} />
            <Text style={styles.cardBottomTitle}>SERVISI</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[
              styles.statCard,
              styles.statCardBottom,
              styles.statCardRepairs,
              { width: cardWidth, minHeight: bottomCardHeight },
            ]}
            onPress={() => navigation.navigate('Repairs')}
          >
            <View style={[styles.cardIconBubble, styles.cardIconBubbleRepairs]}>
              <Ionicons name="construct" size={30} color="#f59e0b" />
            </View>
            <View style={styles.repairsCounters}>
              <Text style={styles.repairsSubLabel}>
                ČEKANJE: <Text style={styles.repairsPending}>{stats.repairsPending}</Text>
              </Text>
              <Text style={styles.repairsSubLabel}>
                TREBALO BI: <Text style={styles.repairsTrebaloBi}>{stats.repairsTrebaloBi}</Text>
              </Text>
              <Text style={styles.repairsSubLabel}>
                NEPOTPISANO: <Text style={styles.repairsUnsigned}>{stats.repairsUnsigned}</Text>
              </Text>
            </View>
            <View style={styles.cardBottomDivider} />
            <Text style={styles.cardBottomTitle}>POPRAVCI</Text>
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
  headerButton: {
    padding: 4,
  },
  greeting: {
    fontSize: rf(22, 18, 38),
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 5,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
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
  content: {
    flex: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 15,
    gap: 10,
  },
  statCard: {
    backgroundColor: '#f3f6fb',
    borderRadius: 20,
    padding: 16,
    width: '47%',
    minHeight: 246,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#dfe7f2',
  },
  statCardElevators: {
    backgroundColor: '#eef4ff',
    borderColor: '#dfe8f7',
  },
  statCardTopSquare: {
    minHeight: 212,
    justifyContent: 'flex-start',
    paddingTop: 12,
    paddingBottom: 10,
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
    minHeight: 262,
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
  },
  servicesCardBody: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
    paddingBottom: 4,
  },
  statCardRepairs: {
    backgroundColor: '#f3f7fb',
    borderColor: '#dfe7f1',
  },
  mapCard: {
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 12,
    overflow: 'hidden',
    borderColor: '#dfe7f1',
    justifyContent: 'space-between',
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
  statNumberTop: {
    fontSize: rf(38, 28, 50),
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 4,
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
    fontSize: rf(16, 13, 22),
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
  statNumberServices: {
    fontSize: rf(32, 24, 44),
    lineHeight: rf(38, 28, 50),
    marginTop: 2,
    letterSpacing: 0.3,
  },
  statNumberServicesSmall: {
    fontSize: rf(28, 22, 38),
    lineHeight: rf(34, 26, 44),
  },
  statNumberServicesTiny: {
    fontSize: rf(24, 20, 34),
    lineHeight: rf(30, 24, 38),
  },
  statLabel: {
    fontSize: rf(13, 11.5, 20),
    color: '#666',
    textAlign: 'center',
    marginTop: 5,
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
    marginTop: 6,
    width: '100%',
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    gap: 4,
  },
  repairsSubLabel: {
    fontSize: rf(14, 11, 30),
    color: '#1f2937',
    fontWeight: '800',
    textAlign: 'left',
    flexShrink: 1,
    letterSpacing: 0.2,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 6,
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
    width: GAUGE_SIZE + 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  gaugeBg: {
    width: GAUGE_SIZE,
    height: GAUGE_MASK_HEIGHT + 2,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  gaugeBgImage: {
    borderRadius: 12,
    opacity: 0.22,
  },
  gaugeMask: {
    width: GAUGE_SIZE,
    height: GAUGE_MASK_HEIGHT,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  gaugeArc: {
    width: GAUGE_SIZE,
    height: GAUGE_SIZE,
    borderRadius: GAUGE_RADIUS,
    borderWidth: 2,
    borderColor: '#93c5fd',
    backgroundColor: '#eff6ff',
    position: 'absolute',
    bottom: -GAUGE_RADIUS,
  },
  gaugeNeedle: {
    position: 'absolute',
    bottom: 8,
    left: GAUGE_SIZE / 2 - GAUGE_NEEDLE_WIDTH / 2,
    width: GAUGE_NEEDLE_WIDTH,
    height: GAUGE_NEEDLE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-end',
    shadowColor: GAUGE_NEEDLE_COLOR,
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    zIndex: 5,
  },
  gaugeNeedleBody: {
    width: '100%',
    height: '100%',
    backgroundColor: GAUGE_NEEDLE_COLOR,
    borderColor: '#166534',
    borderWidth: 1,
    borderTopLeftRadius: GAUGE_NEEDLE_WIDTH,
    borderTopRightRadius: GAUGE_NEEDLE_WIDTH,
    borderBottomLeftRadius: GAUGE_NEEDLE_WIDTH / 1.5,
    borderBottomRightRadius: GAUGE_NEEDLE_WIDTH / 1.5,
  },
  gaugeNeedleHighlight: {
    position: 'absolute',
    top: 6,
    width: GAUGE_NEEDLE_WIDTH / 1.5,
    height: GAUGE_NEEDLE_HEIGHT * 0.6,
    backgroundColor: '#bbf7d0',
    borderTopLeftRadius: GAUGE_NEEDLE_WIDTH,
    borderTopRightRadius: GAUGE_NEEDLE_WIDTH,
    opacity: 0.6,
  },
  gaugeNeedleHub: {
    position: 'absolute',
    bottom: -2,
    left: GAUGE_SIZE / 2 - 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    borderWidth: 2,
    borderColor: '#86efac',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    zIndex: 6,
  },
  gaugeTicksOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: GAUGE_SIZE,
    height: GAUGE_MASK_HEIGHT,
  },
  gaugeTickLabel: {
    fontSize: 10,
    color: '#6b7280',
    fontWeight: '600',
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



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
const GAUGE_NEEDLE_COLOR = '#22c55e';
const GAUGE_NEEDLE_WIDTH = 4;
const GAUGE_NEEDLE_HEIGHT = GAUGE_RADIUS - 6;

export default function HomeScreen({ navigation }) {
  const { user, isOnline, logout } = useAuth();
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
    servicedElevatorsThisMonth: 0,
    servicesThisMonth: 0,
    repairsPending: 0,
    repairsInProgress: 0,
    repairsCompleted: 0,
    repairsUrgent: 0,
  });
  const [refreshing, setRefreshing] = useState(false);

  // Konvertiraj isOnline u boolean eksplicitno
  const online = Boolean(isOnline);

  const fetchUnread = useCallback(async () => {
    if (!online) {
      setUnreadCount(0);
      return;
    }
    try {
      const res = await messagesAPI.getUnreadCount();
    await primeFullSync();
    await syncAll();
      // Backend šalje { success, count, data } gdje su count i data jednaki
      const count = payload.count ?? payload.data ?? 0;
      setUnreadCount(Number(count) || 0);
    } catch (e) {
      console.log('Unread count fetch failed', e?.message || e);
    }
  }, [online]);

  useEffect(() => {
    loadStats();
    fetchUnread();
  }, []);

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
    }, [])
  );

  const serviceProgress = stats.totalElevators
    ? Math.min(1, Math.max(0, stats.servicedElevatorsThisMonth / stats.totalElevators))
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

  const loadStats = () => {
    try {
      const elevators = elevatorDB.getAll() || [];
      const servicesAll = serviceDB.getAll() || [];
      const repairs = repairDB.getAll() || [];

      const normalizeStatus = (s) => {
        if (!s) return 'pending';
        const lower = String(s).toLowerCase();
        if (lower === 'cek' || lower === 'čekanje' || lower === 'pending') return 'pending';
        if (lower === 'u tijeku' || lower === 'u_tijeku' || lower === 'in_progress') return 'in_progress';
        if (lower === 'završen' || lower === 'zavrsen' || lower === 'completed') return 'completed';
        return s;
      };

      // Broji samo aktivna, neobrisana dizala
      const activeElevators = elevators.filter(e => e.status === 'aktivan' && !e.is_deleted);

      // Izgradi skup postojećih ID-eva dizala (lokalni id ili _id), izuzmi obrisane
      const existingElevatorIds = new Set(
        elevators
          .filter(e => !e.is_deleted)
          .map(e => e.id || e._id)
          .filter(Boolean)
      );

      // Normaliziraj i filtriraj servise koji pripadaju postojećim dizalima
      const validServicesRaw = servicesAll.filter(s => {
        const elevatorId = typeof s.elevatorId === 'object' && s.elevatorId !== null
          ? (s.elevatorId._id || s.elevatorId.id)
          : s.elevatorId;
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
        
        const date = new Date(dateStr);
        return date.getMonth() === now.getMonth() && 
               date.getFullYear() === now.getFullYear();
      });

      // Jedinstvena dizala servisirana ovaj mjesec
      const servicedElevatorsSet = new Set(
        thisMonth.map((s) => {
          const eid = typeof s.elevatorId === 'object' && s.elevatorId !== null
            ? (s.elevatorId._id || s.elevatorId.id)
            : s.elevatorId;
          return eid || null;
        }).filter(Boolean)
      );
      const servicedElevatorsThisMonth = servicedElevatorsSet.size;

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
          const status = normalizeStatus(r.status);
          if (status === 'pending') acc.pending += 1;
          else if (status === 'in_progress') acc.inProgress += 1;
          else if (status === 'completed') acc.completed += 1;
          return acc;
        },
        { pending: 0, inProgress: 0, completed: 0 }
      );

      setStats({
        totalElevators: activeElevators.length,
        servicedElevatorsThisMonth,
        servicesThisMonth: thisMonth.length,
        repairsPending: statusCounts.pending,
        repairsInProgress: statusCounts.inProgress,
        repairsCompleted: statusCounts.completed,
        repairsUrgent: 0, // U novoj shemi nema priority polja
      });
    } catch (error) {
      console.error('Greška pri učitavanju statistike:', error);
      setStats({
        totalElevators: 0,
        servicedElevatorsThisMonth: 0,
        servicesThisMonth: 0,
        repairsPending: 0,
        repairsUrgent: 0,
      });
    }
  };

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
        {/* Stats Cards */}
        <View style={styles.statsGrid}>
          <TouchableOpacity 
            style={[styles.statCard, styles.statCardElevators]}
            onPress={() => navigation.navigate('Elevators')}
          >
            <Text style={[styles.statLabel, styles.statLabelBold, styles.sectionTitleUpper]}>DIZALA</Text>
            <Ionicons name="business" size={32} color="#2563eb" />
            <Text style={styles.statNumber}>{stats.totalElevators}</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.statCard}
            onPress={() => navigation.navigate('Map')}
          >
            <Text style={[styles.statLabel, styles.statLabelBold, styles.sectionTitleUpper]}>KARTA</Text>
            <Text style={[styles.statNumber, { marginTop: 4, fontSize: 44 }]}>🌍</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.statCard, styles.statCardServices]}
            onPress={() => navigation.navigate('Services')}
          >
            <Text style={[styles.statLabel, styles.statLabelBold, styles.sectionTitleUpper]}>SERVISI</Text>
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
            <Text style={styles.statNumber}>
              {stats.servicedElevatorsThisMonth}/{stats.totalElevators}
            </Text>
            <Text style={styles.statLabel}>Dizala servisirana ovaj mjesec</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.statCard, styles.statCardRepairs]}
            onPress={() => navigation.navigate('Repairs')}
          >
            <Text style={[styles.statLabel, styles.statLabelBold, styles.sectionTitleUpper]}>POPRAVCI</Text>
            <Ionicons name="construct" size={32} color="#f59e0b" style={{ marginTop: 4 }} />
            <View style={styles.repairsCounters}>
              <Text style={styles.repairsSubLabel}>
                ČEKANJE: <Text style={styles.repairsPending}>{stats.repairsPending}</Text>
              </Text>
              <Text style={styles.repairsSubLabel}>
                U TIJEKU: <Text style={styles.repairsInProgress}>{stats.repairsInProgress}</Text>
              </Text>
              <Text style={styles.repairsSubLabel}>
                ZAVRŠENO: <Text style={styles.repairsCompleted}>{stats.repairsCompleted}</Text>
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Admin sekcija - samo za administratore */}
        {user?.uloga === 'admin' && !offlineDemo && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Administracija</Text>
            
            <TouchableOpacity 
              style={[styles.actionButton, styles.adminButton]}
              onPress={() => navigation.navigate('UserManagement')}
            >
              <Ionicons name="people" size={24} color="#FF6B6B" />
              <Text style={styles.actionText}>Upravljanje korisnicima</Text>
              <Ionicons name="chevron-forward" size={20} color="#999" />
            </TouchableOpacity>
          </View>
        )}

        {user?.uloga === 'admin' && offlineDemo && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Administracija</Text>
            <View style={styles.offlineAdminBox}>
              <Ionicons name="lock-closed" size={20} color="#ef4444" />
              <Text style={styles.offlineAdminText}>Offline demo korisnik – upravljanje korisnicima nedostupno dok se ne prijaviš online.</Text>
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
    gap: 15,
  },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '47%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statCardElevators: {
    backgroundColor: '#eff6ff', // blago plava
    borderColor: '#bfdbfe',
  },
  statCardServices: {
    backgroundColor: '#ecfdf3', // blago zelena
    borderColor: '#bbf7d0',
  },
  statCardRepairs: {
    backgroundColor: '#fef2f2', // blago crvena
    borderColor: '#fecaca',
  },
  statCardUrgent: {
    borderWidth: 2,
    borderColor: '#ef4444',
  },
  statNumber: {
    fontSize: rf(30, 24, 46),
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 10,
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
    marginBottom: 6,
    fontFamily: Platform.select({ ios: 'HelveticaNeue-Medium', android: 'sans-serif-medium', default: 'sans-serif' }),
  },
  repairsCounters: {
    marginTop: 6,
    width: '100%',
    flexDirection: 'column',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    gap: 2,
  },
  repairsSubLabel: {
    fontSize: rf(15, 11, 38),
    color: '#111827',
    fontWeight: '800',
    textAlign: 'right',
    flexShrink: 1,
    letterSpacing: 0.2,
  },
  repairsPending: {
    color: '#ef4444',
  },
  repairsInProgress: {
    color: '#f59e0b',
  },
  repairsCompleted: {
    color: '#10b981',
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
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
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
});

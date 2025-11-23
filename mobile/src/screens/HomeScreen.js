import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import * as SecureStore from 'expo-secure-store';
import { elevatorDB, serviceDB, repairDB } from '../database/db';
import { syncAll } from '../services/syncService';

export default function HomeScreen({ navigation }) {
  const { user, isOnline, logout } = useAuth();
  const [offlineDemo, setOfflineDemo] = useState(false);

  useEffect(() => {
    (async () => {
      const token = await SecureStore.getItemAsync('userToken');
      setOfflineDemo(Boolean(token && token.startsWith('offline_token_')));
    })();
  }, []);
  const [stats, setStats] = useState({
    totalElevators: 0,
    servicesThisMonth: 0,
    repairsPending: 0,
    repairsUrgent: 0,
  });
  const [refreshing, setRefreshing] = useState(false);

  // Konvertiraj isOnline u boolean eksplicitno
  const online = Boolean(isOnline);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = () => {
    try {
      const elevators = elevatorDB.getAll() || [];
      const servicesAll = serviceDB.getAll() || [];
      const repairs = repairDB.getAll() || [];

      // Broji samo aktivna dizala
      const activeElevators = elevators.filter(e => e.status === 'aktivan');

      // Izgradi skup postojećih ID-eva dizala (lokalni id ili _id)
      const existingElevatorIds = new Set(
        elevators.map(e => e.id || e._id).filter(Boolean)
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

      // Popravci pending ili u tijeku
      const pending = repairs.filter(r => 
        r.status === 'čekanje' || r.status === 'u tijeku'
      );

      setStats({
        totalElevators: activeElevators.length,
        servicesThisMonth: thisMonth.length,
        repairsPending: pending.length,
        repairsUrgent: 0, // U novoj shemi nema priority polja
      });
    } catch (error) {
      console.error('Greška pri učitavanju statistike:', error);
      setStats({
        totalElevators: 0,
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
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Pozdrav, {user?.ime}!</Text>
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
            style={styles.statCard}
            onPress={() => navigation.navigate('Elevators')}
          >
            <Ionicons name="business" size={32} color="#2563eb" />
            <Text style={styles.statNumber}>{stats.totalElevators}</Text>
            <Text style={styles.statLabel}>Dizala</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.statCard}
            onPress={() => navigation.navigate('Map')}
          >
            <Ionicons name="map" size={32} color="#8b5cf6" />
            <Text style={styles.statNumber}>📍</Text>
            <Text style={styles.statLabel}>Karta</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.statCard}
            onPress={() => navigation.navigate('Services')}
          >
            <Ionicons name="checkmark-circle" size={32} color="#10b981" />
            <Text style={styles.statNumber}>{stats.servicesThisMonth}</Text>
            <Text style={styles.statLabel}>Servisi ovaj mjesec</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.statCard}
            onPress={() => navigation.navigate('Repairs')}
          >
            <Ionicons name="construct" size={32} color="#f59e0b" />
            <Text style={styles.statNumber}>{stats.repairsPending}</Text>
            <Text style={styles.statLabel}>Popravci na čekanju</Text>
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
    fontSize: 24,
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
    fontSize: 14,
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
  statCardUrgent: {
    borderWidth: 2,
    borderColor: '#ef4444',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 10,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 5,
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
    fontSize: 16,
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
    fontSize: 14,
    color: '#b91c1c',
    lineHeight: 20,
  },
});

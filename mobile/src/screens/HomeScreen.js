import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { elevatorDB, serviceDB, repairDB } from '../database/db';
import { syncAll } from '../services/syncService';

export default function HomeScreen({ navigation }) {
  const { user, isOnline, logout } = useAuth();
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
      const services = serviceDB.getAll() || [];
      const repairs = repairDB.getAll() || [];

      // Servisi ovaj mjesec
      const now = new Date();
      const thisMonth = services.filter(s => {
        const date = new Date(s.serviceDate);
        return date.getMonth() === now.getMonth() && 
               date.getFullYear() === now.getFullYear();
      });

      // Popravci pending
      const pending = repairs.filter(r => 
        r.status === 'pending' || r.status === 'in_progress'
      );

      // Hitni popravci
      const urgent = repairs.filter(r => 
        r.priority === 'urgent' && r.status !== 'completed'
      );

      setStats({
        totalElevators: elevators.length,
        servicesThisMonth: thisMonth.length,
        repairsPending: pending.length,
        repairsUrgent: urgent.length,
      });
    } catch (error) {
      console.error('Greška pri učitavanju statistike:', error);
      // Postavi default stats ako nešto pukne
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
    <View style={styles.container}>
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
        <TouchableOpacity onPress={logout}>
          <Ionicons name="log-out-outline" size={28} color="#666" />
        </TouchableOpacity>
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

          <TouchableOpacity 
            style={[styles.statCard, stats.repairsUrgent > 0 && styles.statCardUrgent]}
            onPress={() => navigation.navigate('Repairs')}
          >
            <Ionicons name="warning" size={32} color="#ef4444" />
            <Text style={styles.statNumber}>{stats.repairsUrgent}</Text>
            <Text style={styles.statLabel}>Hitni popravci</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Brze akcije</Text>
          
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => navigation.navigate('Elevators')}
          >
            <Ionicons name="list" size={24} color="#2563eb" />
            <Text style={styles.actionText}>Sva dizala</Text>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => navigation.navigate('Map')}
          >
            <Ionicons name="map" size={24} color="#10b981" />
            <Text style={styles.actionText}>Mapa dizala</Text>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => navigation.navigate('Chat')}
          >
            <Ionicons name="chatbubbles" size={24} color="#f59e0b" />
            <Text style={styles.actionText}>Chat</Text>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => navigation.navigate('Statistics')}
          >
            <Ionicons name="stats-chart" size={24} color="#8b5cf6" />
            <Text style={styles.actionText}>Statistika</Text>
            <Ionicons name="chevron-forward" size={20} color="#999" />
          </TouchableOpacity>
        </View>
      </ScrollView>
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
    padding: 20,
    paddingTop: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
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
});

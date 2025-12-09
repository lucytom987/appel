import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
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

export default function RepairsListScreen({ navigation }) {
  const [repairs, setRepairs] = useState([]);
  const [filteredRepairs, setFilteredRepairs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [userMap] = useState({}); // placeholder, više se ne koristi u prikazu

  const loadRepairs = useCallback(() => {
    try {
      const allRepairs = repairDB.getAll() || [];

      // Ne odbacuj zapise bez dizala: prikaži ih s placeholderom da korisnik zna da postoje
      const normalizeStatus = (s) => {
        if (s === 'čekanje' || s === 'cek') return 'pending';
        if (s === 'u tijeku' || s === 'u_tijeku') return 'in_progress';
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
        .map((r) => ({
          ...r,
          status: normalizeStatus(r.status),
          synced: r.synced === 0 ? 0 : 1, // default missing synced flag to synced
        }))
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

  const applyFilter = useCallback(() => {
    let filtered = repairs;
    if (filter !== 'all') {
      filtered = repairs.filter(r => r.status === filter);
    }
    setFilteredRepairs(filtered);
  }, [repairs, filter]);

  useEffect(() => {
    applyFilter();
  }, [applyFilter]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return '#ef4444';
      case 'in_progress': return '#f59e0b';
      case 'completed': return '#10b981';
      default: return '#6b7280';
    }
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

    const elevatorAddress = elevator.ulica || elevator.mjesto
      ? `${safeText(elevator.ulica)}${elevator.mjesto ? `, ${safeText(elevator.mjesto)}` : ''}`
      : 'Adresa nije dostupna';
    const elevatorLabel = `${elevatorAddress}${elevator.brojDizala ? ` • ${safeText(elevator.brojDizala)}` : ''}`;

    const opisKvara = safeText(item.opisKvara, 'Bez opisa');
    const isSigned = Boolean(item.radniNalogPotpisan);
    const isSynced = Boolean(item.synced);

    return (
      <TouchableOpacity
        style={[styles.repairCard, { borderColor: getStatusColor(item.status) }]}
        onPress={() => navigation.navigate('RepairDetails', { repair: item })}
        activeOpacity={0.8}
      >
        <View style={styles.repairContent}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.elevatorName} numberOfLines={1}>{elevatorLabel}</Text>
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

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="construct-outline" size={64} color="#ccc" />
      <Text style={styles.emptyText}>Nema popravaka</Text>
      <Text style={styles.emptySubtext}>
        {filter === 'pending' ? 'Nema prijavljenih popravaka' :
         filter === 'in_progress' ? 'Nema popravaka u tijeku' :
         filter === 'completed' ? 'Nema završenih popravaka' :
         'Još nema logiranih popravaka'}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('Home')}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Popravci</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Filter tabs */}
      <View style={styles.filterContainer}>
        {[
          { key: 'all', label: 'Svi' },
          { key: 'pending', label: 'Prijavljeni' },
          { key: 'in_progress', label: 'U tijeku' },
          { key: 'completed', label: 'Završeni' },
        ].map(opt => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.filterTab, filter === opt.key && styles.filterTabActive]}
            onPress={() => setFilter(opt.key)}
          >
            <Text style={[styles.filterText, filter === opt.key && styles.filterTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Repairs list */}
      <FlatList
        data={filteredRepairs}
        renderItem={renderRepairItem}
        keyExtractor={(item, index) => String(item?._id || item?.id || item?.key || index)}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={renderEmptyState}
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  filterContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  filterTabActive: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4b5563',
  },
  filterTextActive: {
    color: '#fff',
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

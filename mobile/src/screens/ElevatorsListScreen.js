import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { elevatorDB } from '../database/db';
import { syncAll } from '../services/syncService';
import { useAuth } from '../context/AuthContext';

export default function ElevatorsListScreen({ navigation }) {
  const { isOnline } = useAuth();
  const [elevators, setElevators] = useState([]);
  const [filteredElevators, setFilteredElevators] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all'); // all, active, out_of_order, maintenance

  useEffect(() => {
    loadElevators();
  }, []);

  useEffect(() => {
    filterElevators();
  }, [searchQuery, filter, elevators]);

  const loadElevators = () => {
    try {
      const data = elevatorDB.getAll() || [];
      setElevators(data);
    } catch (error) {
      console.error('Greška pri učitavanju dizala:', error);
      Alert.alert('Greška', 'Nije moguće učitati dizala');
    }
  };

  const filterElevators = () => {
    let filtered = elevators;

    // Filter po statusu
    if (filter !== 'all') {
      filtered = filtered.filter(e => e.status === filter);
    }

    // Filter po search query
    if (searchQuery) {
      filtered = filtered.filter(e =>
        e.nazivStranke?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.ulica?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.mjesto?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.brojUgovora?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.brojDizala?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredElevators(filtered);
  };

  const onRefresh = async () => {
    if (!isOnline) {
      Alert.alert('Offline', 'Nema internet veze za sinkronizaciju');
      return;
    }

    setRefreshing(true);
    await syncAll();
    loadElevators();
    setRefreshing(false);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return '#10b981';
      case 'out_of_order':
        return '#ef4444';
      case 'maintenance':
        return '#f59e0b';
      default:
        return '#6b7280';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'active':
        return 'Aktivno';
      case 'out_of_order':
        return 'Neispravno';
      case 'maintenance':
        return 'Održavanje';
      default:
        return status;
    }
  };

  const renderElevator = ({ item }) => (
    <TouchableOpacity
      style={styles.elevatorCard}
      onPress={() => navigation.navigate('ElevatorDetails', { elevator: item })}
    >
      <View style={styles.elevatorHeader}>
        <View style={styles.elevatorInfo}>
          <Text style={styles.address}>{item.nazivStranke}</Text>
          <Text style={styles.buildingCode}>{item.ulica}, {item.mjesto}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{getStatusLabel(item.status)}</Text>
        </View>
      </View>

      <View style={styles.elevatorDetails}>
        <View style={styles.detailRow}>
          <Ionicons name="document-text-outline" size={16} color="#6b7280" />
          <Text style={styles.detailText}>Ugovor: {item.brojUgovora}</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="barcode-outline" size={16} color="#6b7280" />
          <Text style={styles.detailText}>Dizalo: {item.brojDizala}</Text>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={20} color="#d1d5db" style={styles.chevron} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Dizala</Text>
        <View style={styles.headerRight}>
          <View style={[styles.onlineIndicator, { backgroundColor: isOnline ? '#10b981' : '#ef4444' }]} />
          <Text style={styles.count}>{filteredElevators.length}</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#9ca3af" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Pretraži po nazivu, adresi, ugovoru..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#9ca3af"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filters */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            Sva
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'active' && styles.filterButtonActive]}
          onPress={() => setFilter('active')}
        >
          <Text style={[styles.filterText, filter === 'active' && styles.filterTextActive]}>
            Aktivna
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'out_of_order' && styles.filterButtonActive]}
          onPress={() => setFilter('out_of_order')}
        >
          <Text style={[styles.filterText, filter === 'out_of_order' && styles.filterTextActive]}>
            Neispravna
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'maintenance' && styles.filterButtonActive]}
          onPress={() => setFilter('maintenance')}
        >
          <Text style={[styles.filterText, filter === 'maintenance' && styles.filterTextActive]}>
            Održavanje
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      <FlatList
        data={filteredElevators}
        renderItem={renderElevator}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="business-outline" size={64} color="#d1d5db" />
            <Text style={styles.emptyText}>
              {searchQuery ? 'Nema rezultata pretrage' : 'Nema dizala'}
            </Text>
          </View>
        }
      />

      {/* FAB - Dodaj dizalo */}
      {isOnline && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('AddElevator')}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    paddingTop: 60,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  onlineIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  count: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
  },
  searchContainer: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  filterButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  filterText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  elevatorCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    position: 'relative',
  },
  elevatorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  elevatorInfo: {
    flex: 1,
  },
  address: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  buildingCode: {
    fontSize: 14,
    color: '#6b7280',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  elevatorDetails: {
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    color: '#6b7280',
  },
  chevron: {
    position: 'absolute',
    right: 16,
    top: '50%',
    marginTop: -10,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#9ca3af',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
});

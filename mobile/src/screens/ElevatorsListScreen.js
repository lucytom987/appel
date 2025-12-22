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
import { syncAll, primeFullSync } from '../services/syncService';
import { useAuth } from '../context/AuthContext';

export default function ElevatorsListScreen({ navigation }) {
  const { isOnline } = useAuth();
  const [elevators, setElevators] = useState([]);
  const [filteredElevators, setFilteredElevators] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('aktivan'); // aktivan, neaktivan

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

  // Normalizacija slova s kvačicama
  const normalize = (str) => {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/č|ć/g, 'c')
      .replace(/š/g, 's')
      .replace(/ž/g, 'z')
      .replace(/đ/g, 'd');
  };

  const filterElevators = () => {
    let filtered = elevators;

    filtered = filtered.filter(e => e.status === filter);

    if (searchQuery) {
      const q = normalize(searchQuery);
      filtered = filtered.filter(e => {
        // Sva polja za pretragu
        const fields = [
          e.nazivStranke,
          e.ulica,
          e.mjesto,
          e.brojUgovora,
          e.brojDizala,
          e.kontaktOsoba?.imePrezime,
          e.kontaktOsoba?.mobitel,
          e.kontaktOsoba?.email,
          e.napomene
        ];
        return fields.some(f => normalize(f).includes(q));
      });
    }

    // Sortiraj po abecedi adresa (ulica, zatim mjesto, pa naziv stranke)
    const compareAddresses = (a, b) => {
      const au = normalize(a.ulica || '');
      const bu = normalize(b.ulica || '');
      if (au !== bu) return au.localeCompare(bu);

      const am = normalize(a.mjesto || '');
      const bm = normalize(b.mjesto || '');
      if (am !== bm) return am.localeCompare(bm);

      const an = normalize(a.nazivStranke || '');
      const bn = normalize(b.nazivStranke || '');
      return an.localeCompare(bn);
    };

    const sorted = [...filtered].sort(compareAddresses);
    setFilteredElevators(sorted);
  };

  const onRefresh = async () => {
    if (!isOnline) {
      Alert.alert('Offline', 'Nema internet veze za sinkronizaciju');
      return;
    }

    setRefreshing(true);
    await primeFullSync();
    await syncAll();
    loadElevators();
    setRefreshing(false);
  };

  const renderElevator = ({ item }) => (
    <TouchableOpacity
      style={styles.elevatorCard}
      onPress={() => navigation.navigate('ElevatorDetails', { elevator: item })}
    >
      <View style={styles.elevatorHeader}>
        <View style={styles.elevatorInfo}>
          {(() => {
            const tip = item.tip || item.tipObjekta;
            const primary = tip === 'privreda'
              ? (item.nazivStranke || `${item.ulica || ''}, ${item.mjesto || ''}`)
              : `${item.ulica || ''}, ${item.mjesto || ''}`;
            const secondary = tip === 'privreda'
              ? `${item.ulica || ''}${item.mjesto ? `, ${item.mjesto}` : ''}`
              : (item.nazivStranke || '');
            return (
              <>
                <Text style={styles.buildingCode}>{primary}</Text>
                {!!secondary && <Text style={styles.address}>{secondary}</Text>}
              </>
            );
          })()}
        </View>
      </View>

      <View style={styles.elevatorDetails}>
        <View style={styles.detailRow}>
          <View style={styles.detailLeft}>
            <Ionicons name="barcode-outline" size={16} color="#6b7280" />
            <Text style={styles.detailText}>Dizalo: {item.brojDizala}</Text>
          </View>
          {(() => {
            const isSynced = item.sync_status === 'synced' || item.synced;
            const isPendingDelete = item.sync_status === 'pending_delete';
            const syncLabel = isPendingDelete ? 'čeka brisanje' : (isSynced ? '' : 'čeka sync');

            return (
              <View style={[
                styles.syncBadge,
                isSynced && styles.syncBadgeCompact,
                isSynced ? styles.syncBadgeOk
                  : isPendingDelete ? styles.syncBadgeDelete
                  : styles.syncBadgeDirty,
              ]}>
                <Ionicons
                  name={
                    isPendingDelete ? 'trash-outline'
                      : isSynced ? 'cloud-done-outline'
                      : 'cloud-offline-outline'
                  }
                  size={14}
                  color="#fff"
                />
                {syncLabel ? (
                  <Text style={styles.syncBadgeText}>
                    {syncLabel}
                  </Text>
                ) : null}
              </View>
            );
          })()}
        </View>
      </View>

    </TouchableOpacity>
  );

  const activeCount = elevators.filter(e => e.status === 'aktivan').length;
  const inactiveCount = elevators.filter(e => e.status === 'neaktivan').length;
  const isActiveFilter = filter === 'aktivan';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('Home')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.title}>Dizala</Text>
        <TouchableOpacity
          style={[styles.filterChip, isActiveFilter ? styles.filterChipActive : styles.filterChipInactive]}
          onPress={() => setFilter(isActiveFilter ? 'neaktivan' : 'aktivan')}
          activeOpacity={0.8}
        >
          <View style={[styles.chipDot, { backgroundColor: isActiveFilter ? '#10b981' : '#6b7280' }]} />
          <Text style={styles.chipText}>
            {isActiveFilter ? `Aktivna · ${activeCount}` : `Neaktivna · ${inactiveCount}`}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#9ca3af" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Pretraži po adresi, nazivu, kontakt osobi..."
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
    backgroundColor: '#eff6ff', // blago plava pozadina
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
  backButton: {
    marginRight: 12,
    padding: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
  },
  filterChipActive: {
    backgroundColor: '#ecfdf3',
    borderColor: '#bbf7d0',
  },
  filterChipInactive: {
    backgroundColor: '#f3f4f6',
    borderColor: '#e5e7eb',
  },
  chipDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
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
    alignItems: 'center',
    marginBottom: 12,
  },
  elevatorInfo: {
    flex: 1,
  },
  address: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  buildingCode: {
    fontSize: 22,
    color: '#111827',
    fontWeight: '800',
    marginBottom: 4,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '700',
  },
  elevatorDetails: {
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  detailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 15,
    color: '#6b7280',
    fontWeight: '600',
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  syncBadgeCompact: {
    paddingHorizontal: 8,
    gap: 0,
  },
  syncBadgeOk: { backgroundColor: '#10b981' },
  syncBadgeDirty: { backgroundColor: '#f59e0b' },
  syncBadgeDelete: { backgroundColor: '#ef4444' },
  syncBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
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
    bottom: 40, // podignuto da ne sjeda prenisko
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

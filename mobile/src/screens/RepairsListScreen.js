import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { repairDB, elevatorDB, userDB } from '../database/db';
import { syncAll } from '../services/syncService';
import { repairsAPI } from '../services/api';

export default function RepairsListScreen({ navigation }) {
  const [repairs, setRepairs] = useState([]);
  const [filteredRepairs, setFilteredRepairs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    loadRepairs();
    const unsubscribe = navigation.addListener('focus', loadRepairs);
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    applyFilter();
  }, [repairs, filter]);

  const loadRepairs = () => {
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
        .map((r) => ({ ...r, status: normalizeStatus(r.status) }))
        .sort((a, b) => new Date(b.datumPrijave) - new Date(a.datumPrijave));

      setRepairs(sorted);
    } catch (error) {
      console.error('Greška pri učitavanju popravaka:', error);
      setRepairs([]);
    }
  };

  const applyFilter = () => {
    let filtered = repairs;
    if (filter !== 'all') {
      filtered = repairs.filter(r => r.status === filter);
    }
    setFilteredRepairs(filtered);
  };

  const handleDeleteRepair = async (repair) => {
    Alert.alert(
      'Obriši popravak',
      'Sigurno želiš obrisati ovaj popravak?',
      [
        { text: 'Otkaži', style: 'cancel' },
        {
          text: 'Obriši',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(repair.id);
              // Obriši s backenda ako je sinkroniziran
              const backendId = repair._id || repair.id;
              if (repair.synced && backendId && !String(backendId).startsWith('local_')) {
                await repairsAPI.delete(backendId);
              }
              // Obriši iz lokalne baze
              repairDB.delete(backendId);
              loadRepairs();
            } catch (error) {
              console.error('Greška pri brisanju popravka:', error);
              Alert.alert('Greška', 'Nije moguće obrisati popravak');
            } finally {
              setDeleting(null);
            }
          }
        }
      ]
    );
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return '#ef4444';
      case 'in_progress': return '#f59e0b';
      case 'completed': return '#10b981';
      default: return '#6b7280';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending': return 'Prijavljen';
      case 'in_progress': return 'U tijeku';
      case 'completed': return 'Završeno';
      default: return status;
    }
  };

  const getServiserName = (serviser) => {
    if (!serviser) return 'Nepoznat serviser';
    if (typeof serviser === 'object') {
      const ime = serviser.ime || serviser.firstName || '';
      const prezime = serviser.prezime || serviser.lastName || '';
      const full = `${ime} ${prezime}`.trim();
      return full || 'Nepoznat serviser';
    }

    // Ako je serviserID string, probaj dohvatiti korisnika iz lokalne baze radi imena
    const user = userDB.getById ? userDB.getById(serviser) : null;
    if (user) {
      const full = `${user.ime || ''} ${user.prezime || ''}`.trim();
      if (full) return full;
    }

    // string ID fallback
    return serviser.length > 10 ? `${serviser.slice(0, 6)}…` : serviser;
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await syncAll();
    loadRepairs();
    setRefreshing(false);
  };

  const renderRepairItem = ({ item }) => {
    const datumPrijave = new Date(item.datumPrijave);
    const prijavaLabel = datumPrijave.toLocaleString('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const serviserName = getServiserName(item.serviserID);
    const prijavio = item.prijavio || '';
    const kontakt = item.kontaktTelefon || '';
    
    // Pronađi dizalo po ID-u
    const elevator = elevatorDB.getById(item.elevatorId);

    return (
      <View style={styles.repairCard}>
        <TouchableOpacity
          onPress={() => navigation.navigate('RepairDetails', { repair: item })}
          style={styles.repairContent}
        >
          <View style={styles.repairHeader}>
            <View style={styles.repairInfo}>
              <Text style={styles.elevatorName}>
                {elevator?.ulica || ''}{elevator?.mjesto ? `, ${elevator.mjesto}` : ''} ({elevator?.brojDizala || 'N/A'})
              </Text>
              <Text style={styles.repairDate}>
                {prijavaLabel}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
              <Text style={styles.badgeText}>{getStatusLabel(item.status)}</Text>
            </View>
          </View>

          <Text style={styles.repairDescription} numberOfLines={2}>
            {item.opisKvara || 'Bez opisa'}
          </Text>

          <View style={styles.repairFooter}>
            <View style={styles.technicianInfo}>
              <Ionicons name="person-outline" size={16} color="#666" />
              <View>
                <Text style={styles.technicianName}>{serviserName}</Text>
                {(prijavio || kontakt) && (
                  <Text style={styles.reporterText} numberOfLines={1}>
                    Prijavio: {prijavio || 'N/A'}{kontakt ? ` • ${kontakt}` : ''}
                  </Text>
                )}
              </View>
            </View>
            <View style={{ width: 60 }} />
          </View>
        </TouchableOpacity>

        {/* Action buttons */}
        <TouchableOpacity
          style={styles.floatingDelete}
          onPress={() => handleDeleteRepair(item)}
          disabled={deleting === item.id}
        >
          <Ionicons name="trash-outline" size={18} color="#ef4444" />
        </TouchableOpacity>
        <View style={styles.floatingIconsRight}>
          <Ionicons
            name={item.radniNalogPotpisan ? 'document-text-outline' : 'document-outline'}
            size={16}
            color={item.radniNalogPotpisan ? '#10b981' : '#ef4444'}
            style={{ marginRight: 8 }}
          />
          {item.synced && (
            <Ionicons name="cloud-done-outline" size={16} color="#10b981" />
          )}
        </View>
      </View>
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
        <TouchableOpacity onPress={() => navigation.goBack()}>
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
        keyExtractor={(item) => item._id || item.id}
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
    flexDirection: 'row',
    position: 'relative',
  },
  repairContent: {
    flex: 1,
    padding: 15,
  },
  repairHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  repairInfo: {
    flex: 1,
  },
  elevatorName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  repairDate: {
    fontSize: 14,
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  repairDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  repairFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  technicianInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  technicianName: {
    fontSize: 14,
    color: '#666',
  },
  reporterText: {
    fontSize: 12,
    color: '#888',
  },
  footerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
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
  actionButtons: {
    display: 'none',
  },
  floatingDelete: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fee2e2',
    backgroundColor: '#fff',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  floatingIconsRight: {
    position: 'absolute',
    bottom: 16,
    right: 60,
    flexDirection: 'row',
    alignItems: 'center',
  },
});

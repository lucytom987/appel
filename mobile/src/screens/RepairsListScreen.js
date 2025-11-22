import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { repairDB, elevatorDB } from '../database/db';
import { syncAll } from '../services/syncService';
import { repairsAPI } from '../services/api';

export default function RepairsListScreen({ navigation }) {
  const [repairs, setRepairs] = useState([]);
  const [filteredRepairs, setFilteredRepairs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all'); // all, čekanje, u tijeku, završeno
  const [deleting, setDeleting] = useState(null);
  const [updating, setUpdating] = useState(null);

  useEffect(() => {
    loadRepairs();
  }, []);

  useEffect(() => {
    applyFilter();
  }, [repairs, filter]);

  const loadRepairs = () => {
    try {
      const allRepairs = repairDB.getAll() || [];
      // Sortiraj po datumu - najnoviji prvo
      const sorted = allRepairs.sort((a, b) => 
        new Date(b.datumPrijave) - new Date(a.datumPrijave)
      );
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

  const handleUpdateStatus = async (repair) => {
    const statusOptions = [
      { label: 'Na čekanju', value: 'čekanje' },
      { label: 'U tijeku', value: 'u tijeku' },
      { label: 'Završeno', value: 'završeno' },
    ];

    Alert.alert(
      'Ažuriraj status',
      'Odaberi novi status:',
      [
        ...statusOptions.map(option => ({
          text: option.label,
          onPress: async () => {
            try {
              setUpdating(repair.id);
              const updated = { ...repair, status: option.value };
              
              // Ažuriraj na backenda ako je sinkroniziran
              const backendId = repair._id || repair.id;
              if (repair.synced && backendId && !String(backendId).startsWith('local_')) {
                await repairsAPI.update(backendId, updated);
              }
              
              // Ažuriraj lokalnu bazu
              repairDB.update(backendId, updated);
              loadRepairs();
            } catch (error) {
              console.error('Greška pri ažuriranju:', error);
              Alert.alert('Greška', 'Nije moguće ažurirati status');
            } finally {
              setUpdating(null);
            }
          }
        })),
        { text: 'Otkaži', style: 'cancel' }
      ]
    );
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'čekanje': return '#f59e0b';
      case 'u tijeku': return '#3b82f6';
      case 'završen': return '#10b981';
      default: return '#6b7280';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'čekanje': return 'Na čekanju';
      case 'u tijeku': return 'U tijeku';
      case 'završen': return 'Završeno';
      default: return status;
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await syncAll();
    loadRepairs();
    setRefreshing(false);
  };

  const renderRepairItem = ({ item }) => {
    const datumPrijave = new Date(item.datumPrijave);
    
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
                {elevator?.nazivStranke || 'N/A'} - {elevator?.ulica || ''} ({elevator?.brojDizala || 'N/A'})
              </Text>
              <Text style={styles.repairDate}>
                {datumPrijave.toLocaleDateString('hr-HR')}
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
              <Text style={styles.technicianName}>
                {item.serviserID || 'Nepoznat serviser'}
              </Text>
            </View>
            {item.synced && (
              <Ionicons name="cloud-done-outline" size={16} color="#10b981" />
            )}
          </View>
        </TouchableOpacity>

        {/* Action buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, styles.statusButton]}
            onPress={() => handleUpdateStatus(item)}
            disabled={updating === item.id}
          >
            <Ionicons name="swap-vertical" size={18} color="#3b82f6" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={() => handleDeleteRepair(item)}
            disabled={deleting === item.id}
          >
            <Ionicons name="trash-outline" size={18} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="construct-outline" size={64} color="#ccc" />
      <Text style={styles.emptyText}>Nema popravaka</Text>
      <Text style={styles.emptySubtext}>
        {filter === 'čekanje' ? 'Nema popravaka na čekanju' :
         filter === 'u tijeku' ? 'Nema popravaka u tijeku' :
         filter === 'završeno' ? 'Nema završenih popravaka' :
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
        {[
          { key: 'all', label: 'Svi' },
          { key: 'čekanje', label: 'Na čekanju' },
          { key: 'u tijeku', label: 'U tijeku' },
          { key: 'završen', label: 'Završeno' },
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
      </ScrollView>

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
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: '#f9fafb',
  },
  filterTabActive: {
    backgroundColor: '#3b82f6',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
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
    justifyContent: 'center',
    paddingRight: 10,
    gap: 8,
  },
  actionButton: {
    padding: 12,
    borderRadius: 8,
  },
  statusButton: {
    backgroundColor: '#dbeafe',
  },
  deleteButton: {
    backgroundColor: '#fee2e2',
  },
});

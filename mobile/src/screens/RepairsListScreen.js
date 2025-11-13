import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { repairDB } from '../database/db';
import { syncAll } from '../services/syncService';

export default function RepairsListScreen({ navigation }) {
  const [repairs, setRepairs] = useState([]);
  const [filteredRepairs, setFilteredRepairs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all'); // all, pending, inProgress, completed, urgent

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
        new Date(b.reportedDate) - new Date(a.reportedDate)
      );
      setRepairs(sorted);
    } catch (error) {
      console.error('Greška pri učitavanju popravaka:', error);
      setRepairs([]);
    }
  };

  const applyFilter = () => {
    let filtered = repairs;

    switch (filter) {
      case 'pending':
        filtered = repairs.filter(r => r.status === 'pending');
        break;
      case 'inProgress':
        filtered = repairs.filter(r => r.status === 'in_progress');
        break;
      case 'completed':
        filtered = repairs.filter(r => r.status === 'completed');
        break;
      case 'urgent':
        filtered = repairs.filter(r => r.priority === 'urgent' && r.status !== 'completed');
        break;
    }

    setFilteredRepairs(filtered);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await syncAll();
    loadRepairs();
    setRefreshing(false);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return '#f59e0b';
      case 'in_progress': return '#3b82f6';
      case 'completed': return '#10b981';
      default: return '#6b7280';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending': return 'Na čekanju';
      case 'in_progress': return 'U tijeku';
      case 'completed': return 'Završeno';
      default: return status;
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return '#ef4444';
      case 'normal': return '#f59e0b';
      case 'low': return '#10b981';
      default: return '#6b7280';
    }
  };

  const renderRepairItem = ({ item }) => {
    const reportedDate = new Date(item.reportedDate);

    return (
      <TouchableOpacity
        style={[
          styles.repairCard,
          item.priority === 'urgent' && item.status !== 'completed' && styles.repairCardUrgent
        ]}
        onPress={() => navigation.navigate('RepairDetails', { repair: item })}
      >
        <View style={styles.repairHeader}>
          <View style={styles.repairInfo}>
            <Text style={styles.elevatorName}>{item.elevator?.lokacija || 'N/A'}</Text>
            <Text style={styles.repairDate}>
              {reportedDate.toLocaleDateString('hr-HR')}
            </Text>
          </View>
          <View style={styles.badges}>
            {item.priority === 'urgent' && (
              <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(item.priority) }]}>
                <Ionicons name="warning" size={12} color="#fff" />
                <Text style={styles.badgeText}>Hitno</Text>
              </View>
            )}
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
              <Text style={styles.badgeText}>{getStatusLabel(item.status)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.repairDescription} numberOfLines={2}>
          {item.opis}
        </Text>

        <View style={styles.repairFooter}>
          <View style={styles.technicianInfo}>
            <Ionicons name="person-outline" size={16} color="#666" />
            <Text style={styles.technicianName}>
              {item.reportedBy?.ime || 'N/A'} {item.reportedBy?.prezime || ''}
            </Text>
          </View>
          <View style={styles.footerRight}>
            {item.estimatedCost && (
              <Text style={styles.costText}>€{item.estimatedCost.toFixed(2)}</Text>
            )}
            {item.synced && (
              <Ionicons name="cloud-done-outline" size={16} color="#10b981" />
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="construct-outline" size={64} color="#ccc" />
      <Text style={styles.emptyText}>Nema popravaka</Text>
      <Text style={styles.emptySubtext}>
        {filter === 'urgent' ? 'Nema hitnih popravaka' :
         filter === 'pending' ? 'Nema popravaka na čekanju' :
         filter === 'inProgress' ? 'Nema popravaka u tijeku' :
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            Svi
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'urgent' && styles.filterTabActive]}
          onPress={() => setFilter('urgent')}
        >
          <Ionicons 
            name="warning" 
            size={16} 
            color={filter === 'urgent' ? '#fff' : '#ef4444'} 
          />
          <Text style={[styles.filterText, filter === 'urgent' && styles.filterTextActive]}>
            Hitni
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'pending' && styles.filterTabActive]}
          onPress={() => setFilter('pending')}
        >
          <Text style={[styles.filterText, filter === 'pending' && styles.filterTextActive]}>
            Na čekanju
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'inProgress' && styles.filterTabActive]}
          onPress={() => setFilter('inProgress')}
        >
          <Text style={[styles.filterText, filter === 'inProgress' && styles.filterTextActive]}>
            U tijeku
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'completed' && styles.filterTabActive]}
          onPress={() => setFilter('completed')}
        >
          <Text style={[styles.filterText, filter === 'completed' && styles.filterTextActive]}>
            Završeno
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Repairs list */}
      <FlatList
        data={filteredRepairs}
        renderItem={renderRepairItem}
        keyExtractor={(item) => item._id || item.localId}
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
    padding: 15,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  repairCardUrgent: {
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
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
  badges: {
    flexDirection: 'row',
    gap: 6,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
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
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  costText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10b981',
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

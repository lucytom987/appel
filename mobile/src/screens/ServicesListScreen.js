import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { serviceDB } from '../database/db';
import { syncAll } from '../services/syncService';

export default function ServicesListScreen({ navigation }) {
  const [services, setServices] = useState([]);
  const [filteredServices, setFilteredServices] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all'); // all, thisMonth, lastMonth

  useEffect(() => {
    loadServices();
  }, []);

  useEffect(() => {
    applyFilter();
  }, [services, filter]);

  const loadServices = () => {
    try {
      const allServices = serviceDB.getAll() || [];
      // Sortiraj po datumu - najnoviji prvo
      const sorted = allServices.sort((a, b) => 
        new Date(b.serviceDate) - new Date(a.serviceDate)
      );
      setServices(sorted);
    } catch (error) {
      console.error('Greška pri učitavanju servisa:', error);
      setServices([]);
    }
  };

  const applyFilter = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let filtered = services;

    if (filter === 'thisMonth') {
      filtered = services.filter(s => {
        const date = new Date(s.serviceDate);
        return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
      });
    } else if (filter === 'lastMonth') {
      const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      filtered = services.filter(s => {
        const date = new Date(s.serviceDate);
        return date.getMonth() === lastMonth && date.getFullYear() === lastMonthYear;
      });
    }

    setFilteredServices(filtered);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await syncAll();
    loadServices();
    setRefreshing(false);
  };

  const renderServiceItem = ({ item }) => {
    const serviceDate = new Date(item.serviceDate);
    const nextServiceDate = new Date(item.nextServiceDate);
    const daysUntilNext = Math.ceil((nextServiceDate - new Date()) / (1000 * 60 * 60 * 24));

    return (
      <TouchableOpacity
        style={styles.serviceCard}
        onPress={() => navigation.navigate('ServiceDetails', { service: item })}
      >
        <View style={styles.serviceHeader}>
          <View style={styles.serviceInfo}>
            <Text style={styles.elevatorName}>{item.elevator?.lokacija || 'N/A'}</Text>
            <Text style={styles.serviceDate}>
              {serviceDate.toLocaleDateString('hr-HR')}
            </Text>
          </View>
          <View style={[
            styles.nextServiceBadge,
            daysUntilNext < 7 && styles.nextServiceBadgeUrgent,
            daysUntilNext < 0 && styles.nextServiceBadgeOverdue
          ]}>
            <Text style={styles.nextServiceText}>
              {daysUntilNext < 0 ? 'Prekoračeno' : `${daysUntilNext}d`}
            </Text>
          </View>
        </View>

        <Text style={styles.serviceDescription} numberOfLines={2}>
          {item.opis}
        </Text>

        <View style={styles.serviceFooter}>
          <View style={styles.technicianInfo}>
            <Ionicons name="person-outline" size={16} color="#666" />
            <Text style={styles.technicianName}>
              {item.korisnik?.ime || 'N/A'} {item.korisnik?.prezime || ''}
            </Text>
          </View>
          {item.synced && (
            <Ionicons name="cloud-done-outline" size={16} color="#10b981" />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="checkmark-circle-outline" size={64} color="#ccc" />
      <Text style={styles.emptyText}>Nema servisa</Text>
      <Text style={styles.emptySubtext}>
        {filter === 'thisMonth' ? 'Ovaj mjesec još nema servisa' : 
         filter === 'lastMonth' ? 'Prošli mjesec nema servisa' : 
         'Još nema logiranih servisa'}
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
        <Text style={styles.headerTitle}>Servisi</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Filter tabs */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            Svi
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'thisMonth' && styles.filterTabActive]}
          onPress={() => setFilter('thisMonth')}
        >
          <Text style={[styles.filterText, filter === 'thisMonth' && styles.filterTextActive]}>
            Ovaj mjesec
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'lastMonth' && styles.filterTabActive]}
          onPress={() => setFilter('lastMonth')}
        >
          <Text style={[styles.filterText, filter === 'lastMonth' && styles.filterTextActive]}>
            Prošli mjesec
          </Text>
        </TouchableOpacity>
      </View>

      {/* Services list */}
      <FlatList
        data={filteredServices}
        renderItem={renderServiceItem}
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
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  filterTabActive: {
    backgroundColor: '#10b981',
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
  serviceCard: {
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
  serviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  serviceInfo: {
    flex: 1,
  },
  elevatorName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  serviceDate: {
    fontSize: 14,
    color: '#666',
  },
  nextServiceBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  nextServiceBadgeUrgent: {
    backgroundColor: '#fef3c7',
  },
  nextServiceBadgeOverdue: {
    backgroundColor: '#fee2e2',
  },
  nextServiceText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f2937',
  },
  serviceDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  serviceFooter: {
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
});

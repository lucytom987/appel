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
import { serviceDB, elevatorDB } from '../database/db';
import { syncAll } from '../services/syncService';
import { servicesAPI } from '../services/api';

export default function ServicesListScreen({ navigation }) {
  const [services, setServices] = useState([]);
  const [filteredServices, setFilteredServices] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all'); // all, thisMonth, lastMonth
  const [deleting, setDeleting] = useState(null);

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
      const sorted = allServices.sort((a, b) => new Date(b.datum) - new Date(a.datum));
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
        const date = new Date(s.datum);
        return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
      });
    } else if (filter === 'lastMonth') {
      const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      filtered = services.filter(s => {
        const date = new Date(s.datum);
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

  const handleDeleteService = async (service) => {
    Alert.alert(
      'Obriši servis',
      'Sigurno želiš obrisati ovaj servis?',
      [
        { text: 'Otkaži', style: 'cancel' },
        {
          text: 'Obriši',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(service.id);
              // Obriši s backenda ako je sinkroniziran
              const backendId = service._id || service.id;
              if (service.synced && backendId && !String(backendId).startsWith('local_')) {
                await servicesAPI.delete(backendId);
              }
              // Obriši iz lokalne baze
              serviceDB.delete(backendId);
              loadServices();
            } catch (error) {
              console.error('Greška pri brisanju servisa:', error);
              Alert.alert('Greška', 'Nije moguće obrisati servis');
            } finally {
              setDeleting(null);
            }
          }
        }
      ]
    );
  };

  const renderServiceItem = ({ item }) => {
    const rawDate = item.datum || item.serviceDate;
    const serviceDate = rawDate ? new Date(rawDate) : new Date();
    const sljedeciServisDate = item.sljedeciServis ? new Date(item.sljedeciServis) : null;
    const daysUntilNext = sljedeciServisDate ? 
      Math.ceil((sljedeciServisDate - new Date()) / (1000 * 60 * 60 * 24)) : null;
    // Normaliziraj elevatorId (može biti objekt ako je došlo direktno iz API-ja)
    const elevatorId = (typeof item.elevatorId === 'object' && item.elevatorId !== null)
      ? (item.elevatorId._id || item.elevatorId.id)
      : item.elevatorId;
    let elevator = elevatorId ? elevatorDB.getById(elevatorId) : null;
    // Ako nije pronađeno u lokalnoj bazi, ali imamo objekt, koristi taj objekt
    if (!elevator && typeof item.elevatorId === 'object' && item.elevatorId) {
      elevator = {
        brojDizala: item.elevatorId.brojDizala || undefined,
        nazivStranke: item.elevatorId.nazivStranke || 'Nepoznato dizalo',
        ulica: item.elevatorId.ulica || '',
        mjesto: item.elevatorId.mjesto || ''
      };
    }
    // Fallback ako elevatorId uopće ne postoji
    if (!elevator) {
      elevator = {
        brojDizala: undefined,
        nazivStranke: 'Obrisano dizalo',
        ulica: '',
        mjesto: ''
      };
    }

    // Formatiraj ime servisera
    let serviserName = 'Nepoznat serviser';
    if (item.serviserID) {
      if (typeof item.serviserID === 'object') {
        const ime = item.serviserID.ime || item.serviserID.firstName || '';
        const prezime = item.serviserID.prezime || item.serviserID.lastName || '';
        const full = `${ime} ${prezime}`.trim();
        if (full) serviserName = full;
      } else if (typeof item.serviserID === 'string') {
        // ID string – prikaži skraćeno
        serviserName = item.serviserID.substring(0, 6) + '…';
      }
    }

    return (
      <View style={styles.serviceCard}>
        <TouchableOpacity
          onPress={() => navigation.navigate('ServiceDetails', { service: item })}
          style={styles.serviceContent}
        >
          <View style={styles.serviceHeader}>
            <View style={styles.serviceInfo}>
              <Text style={styles.elevatorName}>
                {elevator?.nazivStranke || 'Obrisano dizalo'} {elevator?.brojDizala ? `• ${elevator.brojDizala}` : ''}
              </Text>
              <Text style={styles.elevatorAddress}>
                {elevator ? `${elevator.ulica || ''}${elevator.mjesto ? `, ${elevator.mjesto}` : ''}` : ''}
              </Text>
              <Text style={styles.serviceDate}>
                {serviceDate.toLocaleDateString('hr-HR')}
              </Text>
            </View>
            {daysUntilNext !== null && (
              <View style={[
                styles.nextServiceBadge,
                daysUntilNext < 7 && styles.nextServiceBadgeUrgent,
                daysUntilNext < 0 && styles.nextServiceBadgeOverdue
              ]}>
                <Text style={styles.nextServiceText}>
                  {daysUntilNext < 0 ? 'Prekoračeno' : `${daysUntilNext}d`}
                </Text>
              </View>
            )}
          </View>

          {!!item.napomene && (
            <Text style={styles.serviceDescription} numberOfLines={2}>
              {item.napomene}
            </Text>
          )}

          <View style={styles.serviceFooter}>
            <View style={styles.technicianInfo}>
              <Ionicons name="person-outline" size={16} color="#666" />
              <Text style={styles.technicianName}>
                {serviserName}
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
            style={[styles.actionButton, styles.deleteButton]}
            onPress={() => handleDeleteService(item)}
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
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    flexDirection: 'row',
  },
  serviceContent: {
    flex: 1,
    padding: 15,
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
  actionButtons: {
    justifyContent: 'center',
    paddingRight: 10,
  },
  actionButton: {
    padding: 12,
    borderRadius: 8,
  },
  deleteButton: {
    backgroundColor: '#fee2e2',
  },
});

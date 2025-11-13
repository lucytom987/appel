import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { serviceDB, repairDB } from '../database/db';
import { useAuth } from '../context/AuthContext';

export default function ElevatorDetailsScreen({ route, navigation }) {
  const { elevator } = route.params;
  const { user, isOnline } = useAuth();
  const [activeTab, setActiveTab] = useState('info'); // info, services, repairs
  const [services, setServices] = useState([]);
  const [repairs, setRepairs] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    try {
      const servicesData = serviceDB.getAll(elevator.id) || [];
      const repairsData = repairDB.getAll(elevator.id) || [];
      setServices(servicesData);
      setRepairs(repairsData);
    } catch (error) {
      console.error('Greška pri učitavanju podataka:', error);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'aktivan':
        return '#10b981';
      case 'u kvaru':
        return '#ef4444';
      case 'u servisu':
        return '#f59e0b';
      case 'neaktivan':
        return '#6b7280';
      default:
        return '#6b7280';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'aktivan':
        return 'Aktivno';
      case 'u kvaru':
        return 'U kvaru';
      case 'u servisu':
        return 'U servisu';
      case 'neaktivan':
        return 'Neaktivno';
      default:
        return status;
    }
  };



  const handleAddService = () => {
    if (!isOnline) {
      Alert.alert('Offline', 'Kreiranje servisa moguće samo online');
      return;
    }
    navigation.navigate('AddService', { elevator });
  };

  const handleReportFault = () => {
    if (!isOnline) {
      Alert.alert('Offline', 'Prijavljivanje kvara moguće samo online');
      return;
    }
    navigation.navigate('AddRepair', { elevator });
  };

  const renderInfoTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.infoSection}>
        <Text style={styles.sectionTitle}>Osnovno</Text>
        
        <InfoRow icon="document-text" label="Broj ugovora" value={elevator.brojUgovora} />
        <InfoRow icon="briefcase" label="Naziv stranke" value={elevator.nazivStranke} />
        <InfoRow icon="location" label="Ulica" value={elevator.ulica} />
        <InfoRow icon="business-outline" label="Mjesto" value={elevator.mjesto} />
        <InfoRow icon="barcode" label="Broj dizala" value={elevator.brojDizala} />
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.sectionTitle}>Kontakt osoba</Text>
        
        {elevator.kontaktOsoba?.imePrezime && (
          <InfoRow icon="person" label="Ime i prezime" value={elevator.kontaktOsoba.imePrezime} />
        )}
        {elevator.kontaktOsoba?.mobitel && (
          <InfoRow icon="call" label="Mobitel" value={elevator.kontaktOsoba.mobitel} />
        )}
        {elevator.kontaktOsoba?.email && (
          <InfoRow icon="mail" label="E-mail" value={elevator.kontaktOsoba.email} />
        )}
        {elevator.kontaktOsoba?.ulaznaKoda && (
          <InfoRow icon="key" label="Ulazna \u0161ifra" value={elevator.kontaktOsoba.ulaznaKoda} />
        )}
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.sectionTitle}>Servisiranje</Text>
        
        {elevator.zadnjiServis && (
          <InfoRow
            icon="checkmark-circle"
            label="Zadnji servis"
            value={new Date(elevator.zadnjiServis).toLocaleDateString('hr-HR')}
          />
        )}
        {elevator.sljedeciServis && (
          <InfoRow
            icon="time-outline"
            label="Sljede\u0107i servis"
            value={new Date(elevator.sljedeciServis).toLocaleDateString('hr-HR')}
          />
        )}
        {elevator.intervalServisa && (
          <InfoRow icon="repeat-outline" label="Interval servisa" value={`${elevator.intervalServisa} ${elevator.intervalServisa === 1 ? 'mjesec' : 'mjeseci'}`} />
        )}
      </View>

      {elevator.napomene && (
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Napomene</Text>
          <Text style={styles.notesText}>{elevator.napomene}</Text>
        </View>
      )}

      <View style={styles.actionButtons}>
        {elevator.kontaktOsoba?.mobitel && (
          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={() => Linking.openURL(`tel:${elevator.kontaktOsoba.mobitel}`)}
          >
            <Ionicons name="call" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>Pozovi kontakt osobu</Text>
          </TouchableOpacity>
        )}

        {elevator.koordinate?.latitude && elevator.koordinate?.longitude && (
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => {
              const url = `https://maps.google.com/?q=${elevator.koordinate.latitude},${elevator.koordinate.longitude}`;
              Linking.openURL(url);
            }}
          >
            <Ionicons name="map" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>Otvori u Mapama</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderServicesTab = () => (
    <View style={styles.tabContent}>
      {services.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="checkmark-circle-outline" size={48} color="#d1d5db" />
          <Text style={styles.emptyText}>Nema servisa</Text>
        </View>
      ) : (
        services.map((service, index) => (
          <View key={service.id || index} style={styles.historyCard}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyDate}>
                {new Date(service.datum || service.serviceDate).toLocaleDateString('hr-HR')}
              </Text>
              <View style={[styles.historyBadge, { backgroundColor: '#10b981' }]}>
                <Text style={styles.historyBadgeText}>Obavljen</Text>
              </View>
            </View>
            {(service.napomene || service.notes) && (
              <Text style={styles.historyNotes}>{service.napomene || service.notes}</Text>
            )}
            {(service.imaNedostataka === 1 || service.imaNedostataka === true) && (
              <View style={styles.defectTag}>
                <Ionicons name="warning" size={14} color="#f59e0b" />
                <Text style={styles.defectText}>Nedostaci pronađeni</Text>
              </View>
            )}
          </View>
        ))
      )}
    </View>
  );

  const renderRepairsTab = () => (
    <View style={styles.tabContent}>
      {repairs.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="construct-outline" size={48} color="#d1d5db" />
          <Text style={styles.emptyText}>Nema popravaka</Text>
        </View>
      ) : (
        repairs.map((repair, index) => (
          <View key={repair.id || index} style={styles.historyCard}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyDate}>
                {new Date(repair.datumPrijave || repair.reportedDate).toLocaleDateString('hr-HR')}
              </Text>
              <View style={[
                styles.historyBadge,
                {
                  backgroundColor:
                    repair.status === 'završen' ? '#10b981' :
                    repair.status === 'u tijeku' ? '#f59e0b' : '#ef4444'
                }
              ]}>
                <Text style={styles.historyBadgeText}>{repair.status === 'završen' ? 'Završeno' : repair.status === 'u tijeku' ? 'U tijeku' : 'Na čekanju'}</Text>
              </View>
            </View>
            <Text style={styles.historyNotes}>{repair.opisKvara || repair.faultDescription}</Text>
          </View>
        ))
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{elevator.nazivStranke}</Text>
          <Text style={styles.headerSubtitle}>{elevator.ulica}, {elevator.mjesto}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity 
            onPress={() => navigation.navigate('EditElevator', { elevator })}
            style={styles.editButton}
          >
            <Ionicons name="create-outline" size={24} color="#2563eb" />
          </TouchableOpacity>
          <View style={[styles.headerStatus, { backgroundColor: getStatusColor(elevator.status) }]}>
            <Text style={styles.headerStatusText}>{getStatusLabel(elevator.status)}</Text>
          </View>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'info' && styles.tabActive]}
          onPress={() => setActiveTab('info')}
        >
          <Text style={[styles.tabText, activeTab === 'info' && styles.tabTextActive]}>
            Informacije
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'services' && styles.tabActive]}
          onPress={() => setActiveTab('services')}
        >
          <Text style={[styles.tabText, activeTab === 'services' && styles.tabTextActive]}>
            Servisi ({services.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'repairs' && styles.tabActive]}
          onPress={() => setActiveTab('repairs')}
        >
          <Text style={[styles.tabText, activeTab === 'repairs' && styles.tabTextActive]}>
            Popravci ({repairs.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.scrollView}>
        {activeTab === 'info' && renderInfoTab()}
        {activeTab === 'services' && renderServicesTab()}
        {activeTab === 'repairs' && renderRepairsTab()}
      </ScrollView>

      {/* Floating Action Buttons */}
      <View style={styles.fabContainer}>
        <TouchableOpacity style={[styles.fab, styles.fabSecondary]} onPress={handleReportFault}>
          <Ionicons name="warning" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.fab} onPress={handleAddService}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Helper component
function InfoRow({ icon, label, value }) {
  // Osiguraj da je value string
  let displayValue = '-';
  if (value) {
    if (typeof value === 'object') {
      displayValue = JSON.stringify(value);
    } else {
      displayValue = String(value);
    }
  }

  return (
    <View style={styles.infoRow}>
      <View style={styles.infoLeft}>
        <Ionicons name={icon} size={18} color="#6b7280" />
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={styles.infoValue}>{displayValue}</Text>
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
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 12,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  editButton: {
    padding: 4,
  },
  headerStatus: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  headerStatusText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#2563eb',
  },
  tabText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#2563eb',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  tabContent: {
    padding: 16,
  },
  infoSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  infoValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },
  notesText: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  historyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  historyDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  historyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  historyBadgeText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  historyNotes: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
  },
  defectTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  defectText: {
    fontSize: 12,
    color: '#f59e0b',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 16,
    color: '#9ca3af',
    marginTop: 12,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    flexDirection: 'row',
    gap: 12,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabSecondary: {
    backgroundColor: '#f59e0b',
    width: 48,
    height: 48,
    borderRadius: 24,
  },
});

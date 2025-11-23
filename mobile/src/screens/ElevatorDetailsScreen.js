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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { serviceDB, repairDB, elevatorDB } from '../database/db';
import { useAuth } from '../context/AuthContext';

export default function ElevatorDetailsScreen({ route, navigation }) {
  const { elevator: rawElevator } = route.params || {};
  // Ako je dizalo obrisano ili ne postoji u parametrima, prikaži fallback umjesto rušenja
  if (!rawElevator) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>Dizalo nedostupno</Text>
            <Text style={styles.headerSubtitle}>Ovo dizalo je obrisano.</Text>
          </View>
        </View>
        <View style={{ padding:16 }}>
          <Text style={{ fontSize:16, color:'#6b7280' }}>Dizalo više ne postoji u bazi. Vratite se nazad i odaberite drugo ili dodajte novo.</Text>
        </View>
      </SafeAreaView>
    );
  }
  const { user, isOnline } = useAuth();
  const [activeTab, setActiveTab] = useState('info'); // info, services, repairs
  const [services, setServices] = useState([]);
  const [repairs, setRepairs] = useState([]);
  const [checklistHistory, setChecklistHistory] = useState({});
  const [groupElevators, setGroupElevators] = useState([]); // sva dizala na adresi

  // Osiguraj da je elevator pravilno strukturiran
  const elevator = {
    ...rawElevator,
    kontaktOsoba: typeof rawElevator.kontaktOsoba === 'string' 
      ? JSON.parse(rawElevator.kontaktOsoba || '{}') 
      : (rawElevator.kontaktOsoba || {}),
    koordinate: Array.isArray(rawElevator.koordinate)
      ? { latitude: rawElevator.koordinate[0], longitude: rawElevator.koordinate[1] }
      : (rawElevator.koordinate || { latitude: 0, longitude: 0 })
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    try {
      const servicesData = serviceDB.getAll(elevator.id) || [];
      const repairsData = repairDB.getAll(elevator.id) || [];
      setServices(servicesData);
      setRepairs(repairsData);
      computeChecklistHistory(servicesData);

      // Grupiraj dizala na istoj adresi (isti brojUgovora + nazivStranke + ulica + mjesto)
      const all = elevatorDB.getAll();
      const grouped = Array.isArray(all) ? all.filter(e =>
        e &&
        e.brojUgovora === elevator.brojUgovora &&
        e.nazivStranke === elevator.nazivStranke &&
        e.ulica === elevator.ulica &&
        e.mjesto === elevator.mjesto
      ).sort((a,b) => (a?.brojDizala || '').localeCompare(b?.brojDizala || '')) : [];
      setGroupElevators(grouped);
    } catch (error) {
      console.error('Greška pri učitavanju podataka:', error);
    }
  };

  const checklistLabels = {
    lubrication: 'Podmazivanje',
    ups_check: 'Provjera UPS-a',
    voice_comm: 'Govorna veza',
    shaft_cleaning: 'Čišćenje šahta',
    drive_check: 'Provjera pog. stroja',
    brake_check: 'Provjera kočnice',
    cable_inspection: 'Inspekcija užeta'
  };

  const computeChecklistHistory = (servicesData) => {
    const latest = {};
    servicesData.forEach(svc => {
      const serviceDateStr = svc.datum || svc.serviceDate;
      if (!serviceDateStr) return;
      const serviceDate = new Date(serviceDateStr);
      (svc.checklist || []).forEach(item => {
        if (item.provjereno === 1 || item.provjereno === true) {
          const key = item.stavka;
          if (!latest[key] || serviceDate > latest[key]) {
            latest[key] = serviceDate;
          }
        }
      });
    });
    setChecklistHistory(latest);
  };

  const daysAgo = (date) => {
    if (!date) return null;
    const diffMs = Date.now() - date.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'aktivan':
        return '#10b981';
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
        <InfoRow icon="document-text" label="Broj ugovora" value={String(elevator.brojUgovora || '')} />
        <InfoRow icon="briefcase" label="Naziv stranke" value={String(elevator.nazivStranke || '')} />
        <InfoRow icon="location" label="Ulica" value={String(elevator.ulica || '')} />
        <InfoRow icon="business-outline" label="Mjesto" value={String(elevator.mjesto || '')} />
      </View>

      {groupElevators.length > 0 && (
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Dizala na adresi ({groupElevators.length})</Text>
          <View style={styles.elevatorsInline}>
            {groupElevators.map(e => {
              const active = e.id === elevator.id || e._id === elevator.id;
              return (
                <TouchableOpacity
                  key={e.id}
                  disabled={active}
                  style={[styles.elevatorBadge, active && styles.elevatorBadgeActive]}
                  onPress={() => {
                    if (!active) {
                      navigation.replace('ElevatorDetails', { elevator: e });
                    }
                  }}
                >
                  <Text style={[styles.elevatorBadgeText, active && styles.elevatorBadgeTextActive]}>{e.brojDizala || '?'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}


      <View style={styles.infoSection}>
        <Text style={styles.sectionTitle}>Kontakt osoba</Text>
        
        {elevator.kontaktOsoba && elevator.kontaktOsoba.imePrezime && (
          <InfoRow icon="person" label="Ime i prezime" value={elevator.kontaktOsoba.imePrezime} />
        )}
        {elevator.kontaktOsoba && elevator.kontaktOsoba.mobitel && (
          <InfoRow icon="call" label="Mobitel" value={elevator.kontaktOsoba.mobitel} />
        )}
        {elevator.kontaktOsoba && elevator.kontaktOsoba.email && (
          <InfoRow icon="mail" label="E-mail" value={elevator.kontaktOsoba.email} />
        )}
        {elevator.kontaktOsoba && elevator.kontaktOsoba.ulaznaKoda && (
          <InfoRow icon="key" label="Ulazna šifra" value={elevator.kontaktOsoba.ulaznaKoda} />
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
            label="Sljedeći servis"
            value={new Date(elevator.sljedeciServis).toLocaleDateString('hr-HR')}
          />
        )}
        {elevator.intervalServisa && (
          <InfoRow icon="repeat-outline" label="Interval servisa" value={`${elevator.intervalServisa} ${elevator.intervalServisa === 1 ? 'mjesec' : 'mjeseci'}`} />
        )}
      </View>

      {elevator.napomene && typeof elevator.napomene === 'string' && elevator.napomene.trim() && (
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Napomene</Text>
          <Text style={styles.notesText}>{elevator.napomene}</Text>
        </View>
      )}

      <View style={styles.infoSection}>
        <Text style={styles.sectionTitle}>Checklist povijest</Text>
        {Object.keys(checklistLabels).map(key => {
          const lastDate = checklistHistory[key];
          const ago = lastDate ? daysAgo(lastDate) : null;
          // Boja prema starosti i intervalServisa (ako postoji)
          let badgeColor = '#6b7280';
          if (ago === null) {
            badgeColor = '#9ca3af';
          } else if (ago <= 60) {
            badgeColor = '#10b981';
          } else if (ago <= 180) {
            badgeColor = '#f59e0b';
          } else {
            badgeColor = '#ef4444';
          }
          return (
            <View key={key} style={styles.checkHistoryRow}>
              <Text style={styles.checkHistoryLabel}>{checklistLabels[key]}</Text>
              <View style={[styles.checkHistoryBadge, { backgroundColor: badgeColor }]}> 
                <Text style={styles.checkHistoryBadgeText}>
                  {lastDate ? `${ago} d` : 'nikad'}
                </Text>
              </View>
            </View>
          );
        })}
        <Text style={styles.checkHistoryHint}>Prikazuje koliko dana je prošlo od zadnje provjere svake stavke.</Text>
      </View>

      <View style={styles.actionButtons}>
        {elevator.kontaktOsoba && typeof elevator.kontaktOsoba === 'object' && 
         elevator.kontaktOsoba.mobitel && typeof elevator.kontaktOsoba.mobitel === 'string' && (
          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={() => Linking.openURL(`tel:${elevator.kontaktOsoba.mobitel}`)}
          >
            <Ionicons name="call" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>Pozovi kontakt osobu</Text>
          </TouchableOpacity>
        )}

        {elevator.koordinate && typeof elevator.koordinate === 'object' && 
         typeof elevator.koordinate.latitude === 'number' && elevator.koordinate.latitude !== 0 &&
         typeof elevator.koordinate.longitude === 'number' && elevator.koordinate.longitude !== 0 && (
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
        services.map((service, index) => {
          // Osiguraj da je service.napomene sigurno string
          const serviceNotes = typeof (service.napomene || service.notes) === 'string'
            ? (service.napomene || service.notes)
            : '';
          
          return (
            <View key={service.id || index} style={styles.historyCard}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyDate}>
                  {new Date(service.datum || service.serviceDate).toLocaleDateString('hr-HR')}
                </Text>
                <View style={[styles.historyBadge, { backgroundColor: '#10b981' }]}>
                  <Text style={styles.historyBadgeText}>Obavljen</Text>
                </View>
              </View>
              {serviceNotes && (
                <Text style={styles.historyNotes}>{serviceNotes}</Text>
              )}
              {(service.imaNedostataka === 1 || service.imaNedostataka === true) && (
                <View style={styles.defectTag}>
                  <Ionicons name="warning" size={14} color="#f59e0b" />
                  <Text style={styles.defectText}>Nedostaci pronađeni</Text>
                </View>
              )}
            </View>
          );
        })
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
        repairs.map((repair, index) => {
          // Osiguraj da je repair.opisKvara sigurno string
          const faultDescription = typeof (repair.opisKvara || repair.faultDescription) === 'string'
            ? (repair.opisKvara || repair.faultDescription)
            : '';
          
          return (
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
              {faultDescription && (
                <Text style={styles.historyNotes}>{faultDescription}</Text>
              )}
            </View>
          );
        })
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{String(elevator.nazivStranke || 'Dizalo')}</Text>
          <Text style={styles.headerSubtitle}>{String(elevator.ulica || '')}, {String(elevator.mjesto || '')}</Text>
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
          <Ionicons name="construct" size={24} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.fab} onPress={handleAddService}>
          <Ionicons name="briefcase" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// Helper component
function InfoRow({ icon, label, value }) {
  // Osiguraj da je vrijednost sigurno string ili prazna
  const safeValue = value ? String(value).trim() : '';

  return (
    <View style={styles.infoRow}>
      <View style={styles.infoLeft}>
        <Ionicons name={icon} size={18} color="#6b7280" />
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={styles.infoValue}>{safeValue || '-'}</Text>
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
  elevatorsInline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  elevatorBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  elevatorBadgeActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  elevatorBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  elevatorBadgeTextActive: {
    color: '#fff',
  },
  checkHistoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6'
  },
  checkHistoryLabel: {
    fontSize: 14,
    color: '#374151'
  },
  checkHistoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12
  },
  checkHistoryBadgeText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600'
  },
  checkHistoryHint: {
    marginTop: 10,
    fontSize: 12,
    color: '#6b7280'
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
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabSecondary: {
    backgroundColor: '#ef4444',
    width: 48,
    height: 48,
    borderRadius: 24,
  },
});

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { serviceDB, repairDB, elevatorDB, userDB } from '../database/db';
import { useAuth } from '../context/AuthContext';
import { servicesAPI } from '../services/api';

export default function ElevatorDetailsScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
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
  const { user, isOnline, serverAwake } = useAuth();
  const userRole = ((user?.uloga || user?.role || '') || '').toLowerCase();
  const canDelete = userRole === 'admin' || userRole === 'menadzer' || userRole === 'manager';
  const [activeTab, setActiveTab] = useState('info'); // info, services, repairs
  const [services, setServices] = useState([]);
  const [repairs, setRepairs] = useState([]);
  const [checklistHistory, setChecklistHistory] = useState({});
  const [groupElevators, setGroupElevators] = useState([]); // sva dizala na adresi
  const [deletingService, setDeletingService] = useState(null);
  const online = Boolean(isOnline && serverAwake);
  
  const parseDateSafe = (value) => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  
  const getServiserLabel = (service) => {
    const raw = service?.serviserID;
    if (!raw) return '-';

    if (typeof raw === 'object') {
      const ime = raw.ime || raw.firstName || '';
      const prezime = raw.prezime || raw.lastName || '';
      const full = `${ime} ${prezime}`.trim();
      if (full) return full;
      if (raw._id) {
        const found = userDB.getById(raw._id);
        if (found) {
          const f = `${found.ime || found.firstName || ''} ${found.prezime || found.lastName || ''}`.trim();
          if (f) return f;
        }
      }
      return '-';
    }

    if (typeof raw === 'string' || typeof raw === 'number') {
      const idStr = String(raw);
      const found = userDB.getById(idStr);
      if (found) {
        const full = `${found.ime || found.firstName || ''} ${found.prezime || found.lastName || ''}`.trim();
        if (full) return full;
        if (found.email) return found.email;
      }
      return idStr.length > 8 ? `${idStr.slice(0, 8)}…` : idStr;
    }

    return String(raw);
  };

  const getServiserSurname = (label) => {
    if (!label || typeof label !== 'string') return '';
    const parts = label.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    // ako je e-mail ili skraćeni ID, vrati cijeli label
    if (label.includes('@') || label.includes('…')) return label;
    return parts[parts.length - 1];
  };

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

  const loadData = useCallback(() => {
    try {
      const servicesData = serviceDB.getAll(elevator.id) || [];
      const sortedServices = [...servicesData].sort((a, b) => {
        const ad = parseDateSafe(a?.datum || a?.serviceDate);
        const bd = parseDateSafe(b?.datum || b?.serviceDate);
        return (bd?.getTime() || 0) - (ad?.getTime() || 0);
      });
      const repairsData = repairDB.getAll(elevator.id) || [];
      const sortedRepairs = [...repairsData].sort((a, b) => {
        const ad = parseDateSafe(a?.datumPrijave || a?.reportedDate || a?.datum);
        const bd = parseDateSafe(b?.datumPrijave || b?.reportedDate || b?.datum);
        return (bd?.getTime() || 0) - (ad?.getTime() || 0);
      });
      setServices(sortedServices);
      setRepairs(sortedRepairs);
      computeChecklistHistory(sortedServices);

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
  }, [elevator.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

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
      const serviceDate = parseDateSafe(serviceDateStr);
      if (!serviceDate) return;
      (svc.checklist || []).forEach(item => {
        const checked = item?.provjereno ?? item?.provjereno;
        if (checked === 1 || checked === true) {
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
    if (!online) {
      Alert.alert('Offline', 'Kreiranje servisa moguće samo online');
      return;
    }
    navigation.navigate('AddService', { elevator });
  };

  const handleReportFault = () => {
    if (!online) {
      Alert.alert('Offline', 'Prijavljivanje kvara moguće samo online');
      return;
    }
    navigation.navigate('AddRepair', { elevator });
  };

  const handleAddTrebaloBi = () => {
    navigation.navigate('AddTrebaloBi', { elevator });
  };

  const handleDeleteService = (service) => {
    if (!canDelete) {
      Alert.alert('Nedovoljno prava', 'Samo administratori ili menadžeri mogu obrisati servis.');
      return;
    }

    const backendId = service?._id || service?.id;
    if (!backendId) {
      Alert.alert('Greška', 'Nije moguće obrisati: nedostaje ID servisa.');
      return;
    }

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
              setDeletingService(backendId);

              if (service.synced && backendId && !String(backendId).startsWith('local_')) {
                await servicesAPI.delete(backendId);
              }

              serviceDB.delete(backendId);
              loadData();
            } catch (error) {
              console.error('Greška pri brisanju servisa:', error);
              Alert.alert('Greška', 'Brisanje servisa nije uspjelo.');
            } finally {
              setDeletingService(null);
            }
          },
        },
      ],
    );
  };

  const renderInfoTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.infoSection}>
        <Text style={styles.sectionTitle}>Kontakt osoba</Text>
        
        {elevator.kontaktOsoba && elevator.kontaktOsoba.imePrezime && (
          <InfoRow icon="person" label="Ime i prezime" value={elevator.kontaktOsoba.imePrezime} />
        )}
        {elevator.kontaktOsoba && elevator.kontaktOsoba.mobitel && (
          <InfoRow
            icon="call"
            label="Mobitel"
            value={elevator.kontaktOsoba.mobitel}
            onPress={() => Linking.openURL(`tel:${elevator.kontaktOsoba.mobitel}`)}
          />
        )}
        {elevator.kontaktOsoba && elevator.kontaktOsoba.email && (
          <InfoRow icon="mail" label="E-mail" value={elevator.kontaktOsoba.email} />
        )}
        {(() => {
          const codesArray = Array.isArray(elevator.kontaktOsoba?.ulazneSifre)
            ? elevator.kontaktOsoba.ulazneSifre.filter(Boolean)
            : [];
          const single = elevator.kontaktOsoba?.ulaznaKoda;
          const codes = codesArray.length ? codesArray : (single ? [single] : []);
          if (!codes.length) return null;
          return (
            <View style={styles.codesBlock}>
              <View style={styles.codesHeader}>
                <Ionicons name="key" size={18} color="#10b981" />
                <Text style={styles.codesTitle}>Ulazne šifre</Text>
              </View>
              <View style={styles.codesList}>
                {codes.map((code, idx) => (
                  <View key={idx} style={styles.codePill}>
                    <Text style={styles.codePillText}>{code}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })()}
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.sectionTitle}>Servisiranje</Text>

        {(() => {
          const annual = parseDateSafe(elevator.godisnjiPregled);
          if (!annual) return null;
          return (
            <InfoRow
              icon="calendar-outline"
              label="Godišnji pregled"
              value={annual.toLocaleDateString('hr-HR')}
            />
          );
        })()}
        
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

      {elevator.koordinate && typeof elevator.koordinate === 'object' && 
       typeof elevator.koordinate.latitude === 'number' && elevator.koordinate.latitude !== 0 &&
       typeof elevator.koordinate.longitude === 'number' && elevator.koordinate.longitude !== 0 && (
        <View style={styles.actionButtons}>
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
        </View>
      )}
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
          const serviceNotes = typeof (service.napomene || service.notes) === 'string'
            ? (service.napomene || service.notes)
            : '';
          const serviserLabel = getServiserLabel(service);
          const serviserSurname = getServiserSurname(serviserLabel);
          const parsedDate = parseDateSafe(service.datum || service.serviceDate);
          const dateLabel = parsedDate ? parsedDate.toLocaleDateString('hr-HR') : '-';
          const key = service._id || service.id || service.localId || `svc_${index}`;

          return (
            <TouchableOpacity
              key={key}
              style={styles.historyCard}
              onPress={() => navigation.navigate('ServiceDetails', { service })}
            >
              <View style={styles.historyHeader}>
                <Text style={styles.historyDate}>
                  {serviserSurname ? `${dateLabel} · ${serviserSurname}` : dateLabel}
                </Text>
              <View style={styles.historyHeaderRight}>
                <View style={[styles.historyBadge, { backgroundColor: '#10b981' }]}>
                  <Text style={styles.historyBadgeText}>Obavljen</Text>
                </View>
                {canDelete && (
                  <TouchableOpacity
                    style={styles.historyDeleteButton}
                    onPress={() => handleDeleteService(service)}
                    disabled={deletingService === (service._id || service.id)}
                  >
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </TouchableOpacity>
                )}
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
            </TouchableOpacity>
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
          const parsedDate = parseDateSafe(repair.datumPrijave || repair.reportedDate || repair.datum);
          const dateLabel = parsedDate ? parsedDate.toLocaleDateString('hr-HR') : '-';
          const key = repair._id || repair.id || repair.localId || `rep_${index}`;
          
          const isTrebaloBi = Boolean(
            repair.trebaloBi ||
            repair.trebalo_bi ||
            repair.category === 'trebaloBi' || repair.category === 'trebalo_bi' || repair.category === 'trebalo-bi' || repair.category === 'trebalo' ||
            repair.type === 'trebaloBi' || repair.type === 'trebalo_bi' || repair.type === 'trebalo-bi' || repair.type === 'trebalo' ||
            repair.status === 'in_progress' ||
            repair.status === 'u tijeku' ||
            repair.status === 'u_tijeku'
          );

          return (
            <TouchableOpacity
              key={key}
              style={styles.historyCard}
              onPress={() => navigation.navigate(isTrebaloBi ? 'TrebaloBiDetails' : 'RepairDetails', { repair })}
            >
              <View style={styles.historyHeader}>
                <Text style={styles.historyDate}>
                  {dateLabel}
                </Text>
                <View style={[
                  styles.historyBadge,
                  {
                    backgroundColor:
                      repair.status === 'završen' || repair.status === 'completed' ? '#10b981' :
                      isTrebaloBi ? '#f59e0b' : '#ef4444'
                  }
                ]}>
                  <Text style={styles.historyBadgeText}>{
                    repair.status === 'završen' || repair.status === 'completed'
                      ? 'Završeno'
                      : isTrebaloBi
                        ? 'Trebalo bi'
                        : 'Na čekanju'
                  }</Text>
                </View>
              </View>
              {faultDescription && (
                <Text style={styles.historyNotes}>{faultDescription}</Text>
              )}
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <View style={styles.headerActions}>
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

        <View style={styles.heroBlock}>
          <Text style={styles.heroContract}>{elevator.brojUgovora || 'Bez ugovora'}</Text>
          <Text style={styles.heroName} numberOfLines={2}>{elevator.nazivStranke || 'Naziv nije postavljen'}</Text>
          <Text style={styles.heroAddress} numberOfLines={2}>
            {[elevator.ulica, elevator.mjesto].filter(Boolean).join(', ') || 'Adresa nije postavljena'}
          </Text>
        </View>
      </View>

      {groupElevators.length > 0 && (
        <View style={styles.groupBlock}>
          <Text style={styles.sectionTitle}>Dizala na adresi ({groupElevators.length})</Text>
          <View style={styles.elevatorsInline}>
            {groupElevators.map((e) => {
              const active = e.id === elevator.id || e._id === elevator.id;
              return (
                <TouchableOpacity
                  key={e.id}
                  disabled={active}
                  style={[styles.elevatorBadge, active && styles.elevatorBadgeActive]}
                  onPress={() => !active && navigation.navigate('ElevatorDetails', { elevator: e })}
                >
                  <Text style={[styles.elevatorBadgeText, active && styles.elevatorBadgeTextActive]}>{e.brojDizala || '?'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

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
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 20, 40) }}
      >
        {activeTab === 'info' && renderInfoTab()}
        {activeTab === 'services' && renderServicesTab()}
        {activeTab === 'repairs' && renderRepairsTab()}
      </ScrollView>

      {/* Floating Action Buttons */}
      <View style={[styles.fabContainer, { bottom: Math.max(insets.bottom + 12, 20) }]}>
        <TouchableOpacity style={[styles.fab, styles.fabTrebalo]} onPress={handleAddTrebaloBi}>
          <Ionicons name="bulb" size={24} color="#fff" />
        </TouchableOpacity>
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
function InfoRow({ icon, label, value, onPress }) {
  // Osiguraj da je vrijednost sigurno string ili prazna
  const safeValue = value ? String(value).trim() : '';
  const Wrapper = onPress ? TouchableOpacity : View;

  return (
    <Wrapper style={[styles.infoRow, onPress && styles.infoRowPressable]} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.infoLeft}>
        <Ionicons name={icon} size={18} color="#6b7280" />
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={[styles.infoValue, onPress && styles.infoValueLink]}>{safeValue || '-'}</Text>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    backgroundColor: '#fff',
    paddingTop: 52,
    paddingBottom: 16,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    flexDirection: 'column',
    gap: 10,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    marginRight: 10,
  },
  headerActions: {
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
  heroBlock: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  heroContract: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6,
  },
  heroName: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
  },
  heroAddress: {
    marginTop: 6,
    fontSize: 15,
    color: '#475569',
  },
  heroNumbersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  numberBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  numberBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  groupBlock: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 18,
    marginTop: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
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
    padding: 14,
  },
  infoSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoLabel: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '600',
  },
  notesText: {
    fontSize: 16,
    color: '#4b5563',
    lineHeight: 22,
    fontWeight: '500',
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
    gap: 10,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoRowPressable: {
    paddingVertical: 10,
  },
  infoValueLink: {
    color: '#2563eb',
    fontWeight: '700',
  },
  historyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  historyHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  historyDeleteButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
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
    paddingVertical: 36,
  },
  emptyText: {
    fontSize: 16,
    color: '#9ca3af',
    marginTop: 12,
  },
  codesBlock: {
    marginTop: 8,
    gap: 8,
  },
  codesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  codesTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
  },
  codesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  codePill: {
    backgroundColor: '#f0fdf4',
    borderColor: '#10b981',
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  codePillText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#065f46',
    letterSpacing: 1,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 20,
    right: 18,
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
  fabTrebalo: {
    backgroundColor: '#f59e0b',
    width: 48,
    height: 48,
    borderRadius: 24,
  },
});

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { useAuth } from '../context/AuthContext';

const safeText = (value, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  try {
    return String(value);
  } catch {
    return fallback;
  }
};

// helper za datume
const parseDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export default function RepairsListScreen({ navigation }) {
  const { user } = useAuth();

  const [repairs, setRepairs] = useState([]);
  const [filteredRepairs, setFilteredRepairs] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [deleting, setDeleting] = useState(null);
  const [userMap, setUserMap] = useState({});

  // Prebaci sve korisnike u mapu id -> ime radi brzog resolve-a
  useEffect(() => {
    try {
      const all = userDB.getAll ? userDB.getAll() || [] : [];
      const map = {};
      all.forEach((u) => {
        if (!u || typeof u !== 'object') return;
        const uid = u.id || u._id;
        if (!uid) return;
        const full = `${u.ime || u.firstName || ''} ${u.prezime || u.lastName || ''}`.trim();
        map[uid] = full || u.email || 'Serviser';
      });

      const authId = user?._id || user?.id;
      const authName = `${user?.ime || user?.firstName || ''} ${user?.prezime || user?.lastName || ''}`.trim();
      if (authId && authName) {
        map[authId] = authName;
      }

      setUserMap(map);
    } catch (e) {
      console.warn('RepairsListScreen: ne mogu učitati korisnike', e?.message || e);
    }
  }, [user]);

  const loadRepairs = useCallback(() => {
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
        .filter((r) => r && typeof r === 'object') // safety: drop malformed entries
        .map((r) => ({
          ...r,
          status: normalizeStatus(r.status),
          synced: r.synced === 0 ? 0 : 1, // default missing synced flag to synced
        }))
        .sort((a, b) => new Date(b.datumPrijave) - new Date(a.datumPrijave));

      setRepairs(sorted);
    } catch (error) {
      console.error('Greška pri učitavanju popravaka:', error);
      setRepairs([]);
    }
  }, []);

  useEffect(() => {
    loadRepairs();
    const unsubscribe = navigation.addListener('focus', loadRepairs);
    return unsubscribe;
  }, [navigation, loadRepairs]);

  const applyFilter = useCallback(() => {
    let filtered = repairs;
    if (filter !== 'all') {
      filtered = repairs.filter(r => r.status === filter);
    }
    setFilteredRepairs(filtered);
  }, [repairs, filter]);

  useEffect(() => {
    applyFilter();
  }, [applyFilter]);

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

  const resolvePersonName = useCallback((raw, fallbackUnknown = 'N/A') => {
    if (!raw) return fallbackUnknown;

    if (typeof raw === 'object') {
      const full = `${raw.ime || raw.firstName || raw.name || raw.fullName || ''} ${raw.prezime || raw.lastName || ''}`.trim();
      if (full) return full;
      const refId = raw._id || raw.id;
      if (refId && userMap[refId]) return userMap[refId];
      if (refId) return refId.length > 14 ? `${refId.slice(0, 6)}…${refId.slice(-3)}` : String(refId);
      if (raw.email) return raw.email;
      return fallbackUnknown;
    }

    if (typeof raw === 'string') {
      const maybe = userMap[raw];
      if (maybe) return maybe;
      return raw.length > 14 ? `${raw.slice(0, 6)}…${raw.slice(-3)}` : raw;
    }

    if (typeof raw === 'number') return String(raw);
    return fallbackUnknown;
  }, [userMap]);

  const resolveServiserName = useCallback((item) => {
    // Prefer explicit name fields if present on the record
    const explicit = item?.serviserName || item?.serviser || item?.serviserFullName;
    const explicitStr = safeText(explicit, '');
    if (explicitStr) return explicitStr;

    // Fallback to serviserID resolution
    return resolvePersonName(item?.serviserID, 'Nepoznat serviser');
  }, [resolvePersonName]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncAll();
      loadRepairs();
    } catch (e) {
      console.error('Greška pri syncu popravaka:', e);
    } finally {
      setRefreshing(false);
    }
  }, [loadRepairs]);

  const renderRepairItem = ({ item }) => {
    if (!item || typeof item !== 'object') {
      return (
        <View style={styles.repairCard}>
          <View style={styles.repairContent}>
            <Text style={styles.repairDescription}>
              {`Neispravan zapis popravka: ${safeText(item, '')}`}
            </Text>
          </View>
        </View>
      );
    }

    const datumPrijave = parseDate(item.datumPrijave);
    const prijavaLabel = datumPrijave
      ? datumPrijave.toLocaleString('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '-';

    const serviserName = safeText(resolveServiserName(item), 'Nepoznat serviser');
    const prijavio = safeText(resolvePersonName(item.prijavio, 'N/A'), 'N/A');
    const primioPoziv = safeText(item.primioPoziv || item.receivedBy, '');
    const kontakt = safeText(item.kontaktTelefon, '');

    const elevatorId = typeof item.elevatorId === 'object' && item.elevatorId !== null
      ? item.elevatorId._id || item.elevatorId.id
      : item.elevatorId;

    let elevator = elevatorId ? elevatorDB.getById(elevatorId) : null;

    if (!elevator && typeof item.elevatorId === 'object' && item.elevatorId) {
      elevator = {
        brojDizala: item.elevatorId.brojDizala || undefined,
        nazivStranke: item.elevatorId.nazivStranke || 'Obrisano dizalo',
        ulica: item.elevatorId.ulica || '',
        mjesto: item.elevatorId.mjesto || '',
      };
    }

    if (!elevator) {
      elevator = {
        brojDizala: undefined,
        nazivStranke: 'Obrisano dizalo',
        ulica: '',
        mjesto: '',
      };
    }

    const elevatorLabel = `${safeText(elevator.nazivStranke || 'Obrisano dizalo')}${elevator.brojDizala ? ` - ${safeText(elevator.brojDizala)}` : ''}`;
    const elevatorAddress = elevator.ulica || elevator.mjesto
      ? `${safeText(elevator.ulica)}${elevator.mjesto ? `, ${safeText(elevator.mjesto)}` : ''}`
      : '';

    const opisKvara = safeText(item.opisKvara, 'Bez opisa');

    return (
      <View style={styles.repairCard}>
        <TouchableOpacity
          onPress={() => navigation.navigate('RepairDetails', { repair: item })}
          style={styles.repairContent}
        >
          <View style={styles.repairHeader}>
            <View style={styles.repairInfo}>
              <Text style={styles.elevatorName}>{elevatorLabel}</Text>
              {elevatorAddress ? (
                <Text style={styles.repairDate}>{elevatorAddress}</Text>
              ) : null}
              <Text style={styles.repairDate}>
                {prijavaLabel}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
              <Text style={styles.badgeText}>{safeText(getStatusLabel(item.status), '-')}</Text>
            </View>
          </View>

          <Text style={styles.repairDescription} numberOfLines={2}>
            {opisKvara}
          </Text>

          <View style={styles.repairFooter}>
            <View style={styles.technicianInfo}>
              <Ionicons name="person-outline" size={16} color="#666" />
              <View>
                <Text style={styles.technicianName}>{serviserName}</Text>
                {primioPoziv ? (
                  <Text style={styles.reporterText} numberOfLines={1}>
                    Primio poziv: {primioPoziv}
                  </Text>
                ) : null}
                {(prijavio !== 'N/A' || kontakt) && (
                  <Text style={styles.reporterText} numberOfLines={1}>
                    Prijavio: {prijavio}{kontakt ? ` • ${kontakt}` : ''}
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
        keyExtractor={(item, index) => String(item?._id || item?.id || item?.key || index)}
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

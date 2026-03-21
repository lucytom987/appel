import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { superadminAPI } from '../services/api';

export default function SuperAdminScreen({ navigation }) {
  const [stats, setStats] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [companyDetail, setCompanyDetail] = useState(null);

  const loadData = async () => {
    try {
      const [statsRes, companiesRes] = await Promise.all([
        superadminAPI.getStats(),
        superadminAPI.getCompanies(),
      ]);
      setStats(statsRes.data?.data || null);
      setCompanies(companiesRes.data?.data || []);
    } catch (err) {
      Alert.alert('Greška', err.message || 'Nije moguće dohvatiti podatke');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const toggleExpand = async (companyId) => {
    if (expandedId === companyId) {
      setExpandedId(null);
      setCompanyDetail(null);
      return;
    }
    setExpandedId(companyId);
    try {
      const res = await superadminAPI.getCompany(companyId);
      setCompanyDetail(res.data?.data || null);
    } catch (err) {
      Alert.alert('Greška', 'Nije moguće dohvatiti detalje firme');
    }
  };

  const handleDeleteCompany = (company) => {
    Alert.alert(
      'Obriši firmu',
      `Jeste li sigurni da želite obrisati firmu "${company.naziv}" i SVE njene podatke?\n\nOvo se ne može poništiti!`,
      [
        { text: 'Odustani', style: 'cancel' },
        {
          text: 'Obriši',
          style: 'destructive',
          onPress: async () => {
            try {
              await superadminAPI.deleteCompany(company._id);
              Alert.alert('Uspjeh', `Firma "${company.naziv}" je obrisana`);
              setExpandedId(null);
              setCompanyDetail(null);
              loadData();
            } catch (err) {
              Alert.alert('Greška', err.message || 'Brisanje nije uspjelo');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#7c3aed" />
          <Text style={styles.loadingText}>Učitavam podatke platforme...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Super Admin</Text>
        <Ionicons name="shield-checkmark" size={24} color="#fff" />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Globalna statistika */}
        {stats && (
          <View style={styles.statsSection}>
            <Text style={styles.sectionTitle}>Statistika platforme</Text>
            <View style={styles.statsGrid}>
              <View style={[styles.statCard, { backgroundColor: '#eff6ff' }]}>
                <Ionicons name="business" size={24} color="#2563eb" />
                <Text style={styles.statNumber}>{stats.companyCount}</Text>
                <Text style={styles.statLabel}>Firmi</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: '#f0fdf4' }]}>
                <Ionicons name="people" size={24} color="#16a34a" />
                <Text style={styles.statNumber}>{stats.userCount}</Text>
                <Text style={styles.statLabel}>Korisnika</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: '#fef3c7' }]}>
                <Ionicons name="cube" size={24} color="#d97706" />
                <Text style={styles.statNumber}>{stats.elevatorCount}</Text>
                <Text style={styles.statLabel}>Dizala</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: '#fce7f3' }]}>
                <Ionicons name="construct" size={24} color="#db2777" />
                <Text style={styles.statNumber}>{stats.repairCount}</Text>
                <Text style={styles.statLabel}>Popravaka</Text>
              </View>
            </View>
          </View>
        )}

        {/* Lista firmi */}
        <View style={styles.companiesSection}>
          <Text style={styles.sectionTitle}>
            Registrirane firme ({companies.length})
          </Text>

          {companies.map((company) => (
            <View key={company._id} style={styles.companyCard}>
              <TouchableOpacity
                style={styles.companyHeader}
                onPress={() => toggleExpand(company._id)}
              >
                <View style={styles.companyInfo}>
                  <Text style={styles.companyName}>{company.naziv || 'Bez naziva'}</Text>
                  <Text style={styles.companyMeta}>
                    {company.admin ? `${company.admin.ime} ${company.admin.prezime}` : 'Nema admina'}
                    {' • '}{company.userCount} korisnika • {company.elevatorCount} dizala
                  </Text>
                  <Text style={styles.companyDate}>
                    Registrirano: {new Date(company.created_at).toLocaleDateString('hr-HR')}
                  </Text>
                </View>
                <Ionicons
                  name={expandedId === company._id ? 'chevron-up' : 'chevron-down'}
                  size={22}
                  color="#666"
                />
              </TouchableOpacity>

              {expandedId === company._id && companyDetail && (
                <View style={styles.companyDetail}>
                  {/* Podaci firme */}
                  <View style={styles.detailSection}>
                    <Text style={styles.detailTitle}>Podaci firme</Text>
                    {companyDetail.adresa && (
                      <Text style={styles.detailText}>Adresa: {companyDetail.adresa}</Text>
                    )}
                    {companyDetail.oib && (
                      <Text style={styles.detailText}>OIB: {companyDetail.oib}</Text>
                    )}
                    {companyDetail.email && (
                      <Text style={styles.detailText}>Email: {companyDetail.email}</Text>
                    )}
                    {companyDetail.mobitel && (
                      <Text style={styles.detailText}>Mobitel: {companyDetail.mobitel}</Text>
                    )}
                  </View>

                  {/* Statistike */}
                  <View style={styles.detailSection}>
                    <Text style={styles.detailTitle}>Statistike</Text>
                    <Text style={styles.detailText}>
                      Dizala: {companyDetail.stats?.elevatorCount || 0}
                    </Text>
                    <Text style={styles.detailText}>
                      Servisi: {companyDetail.stats?.serviceCount || 0}
                    </Text>
                    <Text style={styles.detailText}>
                      Popravci: {companyDetail.stats?.repairCount || 0}
                    </Text>
                  </View>

                  {/* Korisnici */}
                  <View style={styles.detailSection}>
                    <Text style={styles.detailTitle}>
                      Korisnici ({companyDetail.users?.length || 0})
                    </Text>
                    {(companyDetail.users || []).map((u) => (
                      <View key={u._id} style={styles.userRow}>
                        <Ionicons
                          name={u.uloga === 'admin' ? 'shield' : 'person'}
                          size={16}
                          color={u.aktivan ? '#16a34a' : '#ef4444'}
                        />
                        <Text style={[styles.userName, !u.aktivan && styles.userInactive]}>
                          {u.ime} {u.prezime}
                        </Text>
                        <Text style={styles.userRole}>{u.uloga}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Obriši firmu */}
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeleteCompany(company)}
                  >
                    <Ionicons name="trash" size={18} color="#fff" />
                    <Text style={styles.deleteButtonText}>Obriši firmu i sve podatke</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}

          {companies.length === 0 && (
            <Text style={styles.emptyText}>Nema registriranih firmi</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 16,
  },
  header: {
    backgroundColor: '#7c3aed',
    padding: 20,
    paddingTop: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  statsSection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: '47%',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 6,
  },
  statLabel: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  companiesSection: {
    padding: 16,
    paddingTop: 0,
  },
  companyCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  companyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  companyInfo: {
    flex: 1,
  },
  companyName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1f2937',
  },
  companyMeta: {
    fontSize: 13,
    color: '#666',
    marginTop: 3,
  },
  companyDate: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  companyDetail: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    padding: 16,
    backgroundColor: '#fafafa',
  },
  detailSection: {
    marginBottom: 16,
  },
  detailTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
  },
  detailText: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 3,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  userName: {
    flex: 1,
    fontSize: 14,
    color: '#1f2937',
  },
  userInactive: {
    color: '#9ca3af',
    textDecorationLine: 'line-through',
  },
  userRole: {
    fontSize: 12,
    color: '#7c3aed',
    fontWeight: '600',
    backgroundColor: '#f3e8ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ef4444',
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: 16,
    marginTop: 40,
  },
});

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
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { superadminAPI } from '../services/api';

export default function SuperAdminScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('firme');
  const [stats, setStats] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [companyDetail, setCompanyDetail] = useState(null);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [userDetail, setUserDetail] = useState(null);
  const [passwordUserId, setPasswordUserId] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  const loadData = async () => {
    try {
      const [statsRes, companiesRes, usersRes] = await Promise.all([
        superadminAPI.getStats(),
        superadminAPI.getCompanies(),
        superadminAPI.getUsers(),
      ]);
      setStats(statsRes.data?.data || null);
      setCompanies(companiesRes.data?.data || []);
      setUsers(usersRes.data?.data || []);
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

  const toggleUserExpand = async (userId) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      setUserDetail(null);
      return;
    }
    setExpandedUserId(userId);
    try {
      const res = await superadminAPI.getUser(userId);
      setUserDetail(res.data?.data || null);
    } catch (err) {
      Alert.alert('Greška', 'Nije moguće dohvatiti detalje korisnika');
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

  const getRoleColor = (uloga) => {
    switch (uloga) {
      case 'admin': return '#7c3aed';
      case 'menadzer': return '#2563eb';
      default: return '#16a34a';
    }
  };

  const getRoleBg = (uloga) => {
    switch (uloga) {
      case 'admin': return '#f3e8ff';
      case 'menadzer': return '#eff6ff';
      default: return '#f0fdf4';
    }
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

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'firme' && styles.tabActive]}
          onPress={() => setActiveTab('firme')}
        >
          <Ionicons name="business" size={18} color={activeTab === 'firme' ? '#7c3aed' : '#666'} />
          <Text style={[styles.tabText, activeTab === 'firme' && styles.tabTextActive]}>
            Firme ({companies.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'korisnici' && styles.tabActive]}
          onPress={() => setActiveTab('korisnici')}
        >
          <Ionicons name="people" size={18} color={activeTab === 'korisnici' ? '#7c3aed' : '#666'} />
          <Text style={[styles.tabText, activeTab === 'korisnici' && styles.tabTextActive]}>
            Korisnici ({users.length})
          </Text>
        </TouchableOpacity>
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

        {/* TAB: Firme */}
        {activeTab === 'firme' && (
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
                          <Text style={[styles.userRole, { color: getRoleColor(u.uloga), backgroundColor: getRoleBg(u.uloga) }]}>{u.uloga}</Text>
                        </View>
                      ))}
                    </View>

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
        )}

        {/* TAB: Korisnici */}
        {activeTab === 'korisnici' && (
          <View style={styles.companiesSection}>
            <Text style={styles.sectionTitle}>
              Svi korisnici ({users.length})
            </Text>

            {users.map((u) => (
              <View key={u._id} style={styles.companyCard}>
                <TouchableOpacity
                  style={styles.companyHeader}
                  onPress={() => toggleUserExpand(u._id)}
                >
                  <View style={{ flex: 1 }}>
                    <View style={styles.userHeaderRow}>
                      <Ionicons
                        name={u.uloga === 'admin' ? 'shield' : u.uloga === 'menadzer' ? 'briefcase' : 'person'}
                        size={20}
                        color={u.aktivan ? getRoleColor(u.uloga) : '#9ca3af'}
                      />
                      <Text style={[styles.companyName, !u.aktivan && { color: '#9ca3af' }]}>
                        {u.ime} {u.prezime}
                      </Text>
                      {!u.aktivan && (
                        <View style={styles.inactiveBadge}>
                          <Text style={styles.inactiveBadgeText}>Neaktivan</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.companyMeta}>{u.email}</Text>
                    <Text style={styles.companyDate}>
                      {u.companyNaziv} • <Text style={[{ color: getRoleColor(u.uloga), fontWeight: '600' }]}>{u.uloga}</Text>
                    </Text>
                  </View>
                  <Ionicons
                    name={expandedUserId === u._id ? 'chevron-up' : 'chevron-down'}
                    size={22}
                    color="#666"
                  />
                </TouchableOpacity>

                {expandedUserId === u._id && userDetail && (
                  <View style={styles.companyDetail}>
                    <View style={styles.detailSection}>
                      <Text style={styles.detailTitle}>Osobni podaci</Text>
                      <Text style={styles.detailText}>Ime: {userDetail.ime} {userDetail.prezime}</Text>
                      <Text style={styles.detailText}>Email: {userDetail.email}</Text>
                      {userDetail.telefon && (
                        <Text style={styles.detailText}>Telefon: {userDetail.telefon}</Text>
                      )}
                      <Text style={styles.detailText}>Uloga: {userDetail.uloga}</Text>
                      <Text style={styles.detailText}>
                        Status: {userDetail.aktivan ? 'Aktivan' : 'Neaktivan'}
                      </Text>
                      <Text style={styles.detailText}>
                        Registriran: {new Date(userDetail.kreiranDatum).toLocaleDateString('hr-HR')}
                      </Text>
                    </View>

                    <View style={styles.detailSection}>
                      <Text style={styles.detailTitle}>Firma</Text>
                      <Text style={styles.detailText}>
                        Naziv: {userDetail.company?.naziv || 'Nepoznato'}
                      </Text>
                      {userDetail.company?.adresa && (
                        <Text style={styles.detailText}>Adresa: {userDetail.company.adresa}</Text>
                      )}
                      {userDetail.company?.oib && (
                        <Text style={styles.detailText}>OIB: {userDetail.company.oib}</Text>
                      )}
                      {userDetail.company?.email && (
                        <Text style={styles.detailText}>Email firme: {userDetail.company.email}</Text>
                      )}
                    </View>

                    <View style={styles.detailSection}>
                      <Text style={styles.detailTitle}>Aktivnost</Text>
                      <Text style={styles.detailText}>
                        Servisi firme: {userDetail.stats?.serviceCount || 0}
                      </Text>
                      <Text style={styles.detailText}>
                        Popravci firme: {userDetail.stats?.repairCount || 0}
                      </Text>
                    </View>

                    <View style={styles.detailSection}>
                      <Text style={styles.detailTitle}>Promjena lozinke</Text>
                      {passwordUserId === u._id ? (
                        <View>
                          <TextInput
                            style={styles.passwordInput}
                            placeholder="Nova lozinka (min. 6 znakova)"
                            value={newPassword}
                            onChangeText={setNewPassword}
                            secureTextEntry
                            autoCapitalize="none"
                          />
                          <View style={styles.passwordActions}>
                            <TouchableOpacity
                              style={styles.passwordSaveBtn}
                              onPress={async () => {
                                if (newPassword.length < 6) {
                                  Alert.alert('Greška', 'Lozinka mora imati najmanje 6 znakova');
                                  return;
                                }
                                try {
                                  const res = await superadminAPI.resetPassword(u._id, newPassword);
                                  Alert.alert('Uspjeh', res.data.message);
                                  setPasswordUserId(null);
                                  setNewPassword('');
                                } catch (err) {
                                  Alert.alert('Greška', err.response?.data?.message || 'Greška pri promjeni lozinke');
                                }
                              }}
                            >
                              <Ionicons name="checkmark" size={18} color="#fff" />
                              <Text style={styles.passwordSaveBtnText}>Spremi</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.passwordCancelBtn}
                              onPress={() => { setPasswordUserId(null); setNewPassword(''); }}
                            >
                              <Text style={styles.passwordCancelBtnText}>Odustani</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.changePasswordBtn}
                          onPress={() => { setPasswordUserId(u._id); setNewPassword(''); }}
                        >
                          <Ionicons name="key" size={18} color="#7c3aed" />
                          <Text style={styles.changePasswordBtnText}>Promijeni lozinku</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}
              </View>
            ))}

            {users.length === 0 && (
              <Text style={styles.emptyText}>Nema korisnika</Text>
            )}
          </View>
        )}
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#7c3aed',
  },
  tabText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#7c3aed',
    fontWeight: '700',
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
  userHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inactiveBadge: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
  },
  inactiveBadgeText: {
    fontSize: 11,
    color: '#ef4444',
    fontWeight: '600',
  },
  passwordInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 10,
  },
  passwordActions: {
    flexDirection: 'row',
    gap: 10,
  },
  passwordSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#7c3aed',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  passwordSaveBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  passwordCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  passwordCancelBtnText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '500',
  },
  changePasswordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f3e8ff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  changePasswordBtnText: {
    color: '#7c3aed',
    fontSize: 14,
    fontWeight: '600',
    fontWeight: '600',
  },
});

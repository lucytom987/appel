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
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as SecureStore from 'expo-secure-store';
import { superadminAPI, API_URL } from '../services/api';

export default function SuperAdminScreen({ navigation }) {
  const [stats, setStats] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [companyDetail, setCompanyDetail] = useState(null);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [passwordUserId, setPasswordUserId] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [globalBackupLoading, setGlobalBackupLoading] = useState(false);
  const [companyBackupsMap, setCompanyBackupsMap] = useState({});
  const [companyBackupActionId, setCompanyBackupActionId] = useState(null);
  const [companyBackupLoadId, setCompanyBackupLoadId] = useState(null);
  const [backupNameMap, setBackupNameMap] = useState({});
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [createFormExpanded, setCreateFormExpanded] = useState(false);
  const [newCompanyForm, setNewCompanyForm] = useState({
    naziv: '',
    adresa: '',
    oib: '',
    emailFirme: '',
    adminIme: '',
    adminPrezime: '',
    adminEmail: '',
    adminTelefon: '',
  });

  const formatBackupSize = (bytes) => {
    const value = Number(bytes || 0);
    if (!Number.isFinite(value) || value < 1) return '0 KB';
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatCollectionCounts = (collectionCounts) => {
    if (!collectionCounts || typeof collectionCounts !== 'object') return '';

    const labels = {
      users: 'Korisnici',
      elevators: 'Dizala',
      services: 'Servisi',
      repairs: 'Popravci',
      events: 'Događaji',
      chatRooms: 'Chat sobe',
      messages: 'Poruke',
      simCards: 'SIM',
      workOrderCounters: 'Brojači RN',
      workOrders: 'Radni nalozi',
      serviceWorkOrders: 'Servisni nalozi',
      auditLogs: 'Audit',
    };

    const parts = Object.entries(collectionCounts)
      .filter(([, count]) => Number(count) > 0)
      .map(([key, count]) => `${labels[key] || key}: ${count}`);

    if (!parts.length) return 'Detalji: nema zapisa u kolekcijama';
    return `Detalji: ${parts.join(' • ')}`;
  };

  const loadCompanyBackups = async (companyId) => {
    try {
      setCompanyBackupLoadId(companyId);
      const res = await superadminAPI.listCompanyBackups(companyId, 15);
      setCompanyBackupsMap((prev) => ({
        ...prev,
        [companyId]: res.data?.data || [],
      }));
    } catch (err) {
      Alert.alert('Greška', err?.response?.data?.message || 'Nije moguće dohvatiti listu backupa');
    } finally {
      setCompanyBackupLoadId(null);
    }
  };

  const getBackupNameInput = (companyId) => String(backupNameMap[companyId] || 'manual');

  const setBackupNameInput = (companyId, value) => {
    setBackupNameMap((prev) => ({
      ...prev,
      [companyId]: value,
    }));
  };

  const getDeviceBackupPath = (fileName) => {
    const safeName = String(fileName || 'backup.json.gz').replace(/[^a-zA-Z0-9._-]/g, '_');
    const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
    return `${baseDir}backups/${safeName}`;
  };

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

  const updateNewCompanyField = (field, value) => {
    setNewCompanyForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const resetNewCompanyForm = () => {
    setNewCompanyForm({
      naziv: '',
      adresa: '',
      oib: '',
      emailFirme: '',
      adminIme: '',
      adminPrezime: '',
      adminEmail: '',
      adminTelefon: '',
    });
  };

  const handleCreateManagedCompany = async () => {
    const payload = {
      naziv: String(newCompanyForm.naziv || '').trim(),
      adresa: String(newCompanyForm.adresa || '').trim(),
      oib: String(newCompanyForm.oib || '').trim(),
      emailFirme: String(newCompanyForm.emailFirme || '').trim(),
      adminIme: String(newCompanyForm.adminIme || '').trim(),
      adminPrezime: String(newCompanyForm.adminPrezime || '').trim(),
      adminEmail: String(newCompanyForm.adminEmail || '').trim().toLowerCase(),
      adminTelefon: String(newCompanyForm.adminTelefon || '').trim(),
    };

    if (!payload.naziv || !payload.adminIme || !payload.adminPrezime || !payload.adminEmail) {
      Alert.alert('Greška', 'Unesite naziv firme te ime, prezime i email admin korisnika');
      return;
    }

    try {
      setCreatingCompany(true);
      const res = await superadminAPI.createManagedCompany(payload);
      const credentials = res?.data?.data?.credentials || {};

      Alert.alert(
        'Firma kreirana',
        `Login: ${credentials.email || payload.adminEmail}\nPrivremena lozinka: ${credentials.temporaryPassword || '-'}\n\nKorisnik mora promijeniti lozinku na prvoj prijavi.`
      );

      resetNewCompanyForm();
      setCreateFormExpanded(false);
      await loadData();
    } catch (err) {
      Alert.alert('Greška', err?.response?.data?.message || err?.message || 'Kreiranje firme nije uspjelo');
    } finally {
      setCreatingCompany(false);
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
      setExpandedUserId(null);
      setPasswordUserId(null);
      setNewPassword('');
      return;
    }
    setExpandedId(companyId);
    setExpandedUserId(null);
    setPasswordUserId(null);
    setNewPassword('');
    try {
      const [detailRes, backupsRes] = await Promise.all([
        superadminAPI.getCompany(companyId),
        superadminAPI.listCompanyBackups(companyId, 15),
      ]);
      setCompanyDetail(detailRes.data?.data || null);
      setCompanyBackupsMap((prev) => ({
        ...prev,
        [companyId]: backupsRes.data?.data || [],
      }));
    } catch (err) {
      Alert.alert('Greška', 'Nije moguće dohvatiti detalje firme');
    }
  };

  const handleCreateGlobalBackup = () => {
    Alert.alert(
      'Globalni backup',
      'Kreirati backup za sve firme? Svaka firma se sprema kao zaseban snapshot za kasniji pojedinačni restore.',
      [
        { text: 'Odustani', style: 'cancel' },
        {
          text: 'Kreiraj',
          onPress: async () => {
            try {
              setGlobalBackupLoading(true);
              const res = await superadminAPI.createAllBackups({ includeAuditLogs: false });
              const data = res.data?.data || {};
              Alert.alert(
                'Backup završen',
                `Uspješno: ${data.okCount || 0}, neuspješno: ${data.failCount || 0}`
              );
              await loadData();
              if (expandedId) {
                await loadCompanyBackups(expandedId);
              }
            } catch (err) {
              Alert.alert('Greška', err?.response?.data?.message || err.message || 'Globalni backup nije uspio');
            } finally {
              setGlobalBackupLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleCreateCompanyBackup = (company) => {
    const customName = getBackupNameInput(company._id).trim();

    Alert.alert(
      'Backup firme',
      `Kreirati novi backup firme "${company.naziv}"?`,
      [
        { text: 'Odustani', style: 'cancel' },
        {
          text: 'Kreiraj',
          onPress: async () => {
            try {
              setCompanyBackupActionId(company._id);
              const res = await superadminAPI.createCompanyBackup(company._id, {
                includeAuditLogs: false,
                backupName: customName,
              });
              Alert.alert('Uspjeh', res.data?.message || 'Backup je kreiran');
              await loadCompanyBackups(company._id);
            } catch (err) {
              Alert.alert('Greška', err?.response?.data?.message || 'Kreiranje backupa nije uspjelo');
            } finally {
              setCompanyBackupActionId(null);
            }
          },
        },
      ]
    );
  };

  const handleDownloadCompanyBackup = async (company, backup) => {
    try {
      setCompanyBackupActionId(company._id);
      const token = await SecureStore.getItemAsync('userToken');
      if (!token) {
        Alert.alert('Greška', 'Nedostaje token za autorizaciju');
        return;
      }

      const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
      const backupDir = `${baseDir}backups`;
      const dirInfo = await FileSystem.getInfoAsync(backupDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(backupDir, { intermediates: true });
      }

      const targetPath = getDeviceBackupPath(backup.fileName || `${backup.backupName || 'backup'}.json.gz`);
      const downloadUrl = `${API_URL}/superadmin/backup/company/${company._id}/download/${backup._id}`;

      const result = await FileSystem.downloadAsync(downloadUrl, targetPath, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(result.uri, {
          mimeType: 'application/gzip',
          dialogTitle: 'Spremi ili podijeli backup firme',
        });
      } else {
        Alert.alert('Preuzeto', `Backup je spremljen na: ${result.uri}`);
      }
    } catch (err) {
      Alert.alert('Greška', err?.message || 'Preuzimanje backupa nije uspjelo');
    } finally {
      setCompanyBackupActionId(null);
    }
  };

  const handleRestoreCompanyFromFile = async (company) => {
    try {
      const pickResult = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ['application/gzip', 'application/octet-stream', '*/*'],
      });

      if (pickResult.canceled || !pickResult.assets?.length) {
        return;
      }

      const picked = pickResult.assets[0];
      const selectedName = picked.name || 'uploaded-backup.json.gz';

      Alert.alert(
        'Restore iz datoteke',
        `Firma: ${company.naziv}\nDatoteka: ${selectedName}\n\nOvo prepisuje trenutne podatke firme. Nastaviti?`,
        [
          { text: 'Odustani', style: 'cancel' },
          {
            text: 'Vrati',
            style: 'destructive',
            onPress: async () => {
              try {
                setCompanyBackupActionId(company._id);
                const fileBase64 = await FileSystem.readAsStringAsync(picked.uri, {
                  encoding: FileSystem.EncodingType.Base64,
                });

                const res = await superadminAPI.restoreCompanyBackupUpload(company._id, {
                  fileName: selectedName,
                  fileBase64,
                });

                Alert.alert('Uspjeh', res.data?.message || 'Backup iz datoteke je vraćen');
                const detailRes = await superadminAPI.getCompany(company._id);
                setCompanyDetail(detailRes.data?.data || null);
                await loadCompanyBackups(company._id);
              } catch (err) {
                Alert.alert('Greška', err?.response?.data?.message || err?.message || 'Restore iz datoteke nije uspio');
              } finally {
                setCompanyBackupActionId(null);
              }
            },
          },
        ]
      );
    } catch (err) {
      Alert.alert('Greška', err?.message || 'Odabir datoteke nije uspio');
    }
  };

  const handleRestoreCompanyBackup = (company, backup) => {
    Alert.alert(
      'Vrati backup firme',
      `Vratiti backup firme "${company.naziv}" iz ${new Date(backup.createdAt).toLocaleString('hr-HR')}?\n\nOvo prepisuje trenutne podatke firme.`,
      [
        { text: 'Odustani', style: 'cancel' },
        {
          text: 'Vrati',
          style: 'destructive',
          onPress: async () => {
            try {
              setCompanyBackupActionId(company._id);
              const res = await superadminAPI.restoreCompanyBackup(company._id, backup._id);
              Alert.alert('Uspjeh', res.data?.message || 'Backup je vraćen');
              const detailRes = await superadminAPI.getCompany(company._id);
              setCompanyDetail(detailRes.data?.data || null);
              await loadCompanyBackups(company._id);
            } catch (err) {
              Alert.alert('Greška', err?.response?.data?.message || 'Restore backupa nije uspio');
            } finally {
              setCompanyBackupActionId(null);
            }
          },
        },
      ]
    );
  };

  const toggleUserExpand = (userId) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      setPasswordUserId(null);
      setNewPassword('');
      setShowPassword(false);
      return;
    }
    setExpandedUserId(userId);
    setPasswordUserId(null);
    setNewPassword('');
    setShowPassword(false);
  };

  const handleDeleteCompany = (company) => {
    Alert.alert(
      'Obriši firmu - 1/2',
      `Jeste li sigurni da želite pokrenuti brisanje firme "${company.naziv}" i SVIH njenih podataka?\n\nOvo je trajna radnja.`,
      [
        { text: 'Odustani', style: 'cancel' },
        {
          text: 'Nastavi',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Potvrda brisanja - 2/2',
              `Zadnji korak: stvarno obrisati firmu "${company.naziv}"?\n\nBrisanjem će se ukloniti svi korisnici i podaci te firme.`,
              [
                { text: 'Ne, vrati nazad', style: 'cancel' },
                {
                  text: 'DA, OBRIŠI TRAJNO',
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

            <TouchableOpacity
              style={[styles.globalBackupButton, globalBackupLoading && styles.disabledButton]}
              onPress={handleCreateGlobalBackup}
              disabled={globalBackupLoading}
            >
              {globalBackupLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
              )}
              <Text style={styles.globalBackupButtonText}>
                {globalBackupLoading ? 'Kreiram backup...' : 'Kreiraj backup svih firmi'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.createSection}>
          <View style={styles.createHeaderRow}>
            <Text style={styles.sectionTitle}>Kreiranje nove firme</Text>
            <TouchableOpacity
              style={styles.expandToggleBtn}
              onPress={() => setCreateFormExpanded((prev) => !prev)}
              disabled={creatingCompany}
            >
              <Ionicons
                name={createFormExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#1d4ed8"
              />
              <Text style={styles.expandToggleText}>
                {createFormExpanded ? 'Sakrij formu' : 'Kreiraj novu firmu'}
              </Text>
            </TouchableOpacity>
          </View>

          {createFormExpanded && (
            <>
              <TextInput
                style={styles.createInput}
                placeholder="Naziv firme *"
                value={newCompanyForm.naziv}
                onChangeText={(v) => updateNewCompanyField('naziv', v)}
                editable={!creatingCompany}
              />
              <TextInput
                style={styles.createInput}
                placeholder="Adresa"
                value={newCompanyForm.adresa}
                onChangeText={(v) => updateNewCompanyField('adresa', v)}
                editable={!creatingCompany}
              />
              <TextInput
                style={styles.createInput}
                placeholder="OIB"
                value={newCompanyForm.oib}
                onChangeText={(v) => updateNewCompanyField('oib', v)}
                editable={!creatingCompany}
              />
              <TextInput
                style={styles.createInput}
                placeholder="Email firme"
                value={newCompanyForm.emailFirme}
                onChangeText={(v) => updateNewCompanyField('emailFirme', v)}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!creatingCompany}
              />

              <Text style={styles.createSubTitle}>Admin korisnik</Text>
              <TextInput
                style={styles.createInput}
                placeholder="Ime admina *"
                value={newCompanyForm.adminIme}
                onChangeText={(v) => updateNewCompanyField('adminIme', v)}
                editable={!creatingCompany}
              />
              <TextInput
                style={styles.createInput}
                placeholder="Prezime admina *"
                value={newCompanyForm.adminPrezime}
                onChangeText={(v) => updateNewCompanyField('adminPrezime', v)}
                editable={!creatingCompany}
              />
              <TextInput
                style={styles.createInput}
                placeholder="Admin email *"
                value={newCompanyForm.adminEmail}
                onChangeText={(v) => updateNewCompanyField('adminEmail', v)}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!creatingCompany}
              />
              <TextInput
                style={styles.createInput}
                placeholder="Telefon admina"
                value={newCompanyForm.adminTelefon}
                onChangeText={(v) => updateNewCompanyField('adminTelefon', v)}
                keyboardType="phone-pad"
                editable={!creatingCompany}
              />

              <TouchableOpacity
                style={[styles.createButton, creatingCompany && styles.disabledButton]}
                onPress={handleCreateManagedCompany}
                disabled={creatingCompany}
              >
                {creatingCompany ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="person-add" size={16} color="#fff" />
                )}
                <Text style={styles.createButtonText}>
                  {creatingCompany ? 'Kreiram firmu...' : 'Kreiraj firmu i admin login'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Firme */}
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
                      Članovi ({companyDetail.users?.length || 0})
                    </Text>
                    {(companyDetail.users || []).map((u) => (
                      <View key={u._id} style={styles.memberCard}>
                        <TouchableOpacity
                          style={styles.memberHeader}
                          onPress={() => toggleUserExpand(u._id)}
                        >
                          <Ionicons
                            name={u.uloga === 'admin' ? 'shield' : u.uloga === 'menadzer' ? 'briefcase' : 'person'}
                            size={18}
                            color={u.aktivan ? getRoleColor(u.uloga) : '#9ca3af'}
                          />
                          <Text style={[styles.memberName, !u.aktivan && { color: '#9ca3af' }]}>
                            {u.ime} {u.prezime}
                          </Text>
                          {!u.aktivan && (
                            <View style={styles.inactiveBadge}>
                              <Text style={styles.inactiveBadgeText}>Neaktivan</Text>
                            </View>
                          )}
                          <Text style={[styles.userRole, { color: getRoleColor(u.uloga), backgroundColor: getRoleBg(u.uloga) }]}>
                            {u.uloga}
                          </Text>
                          <Ionicons
                            name={expandedUserId === u._id ? 'chevron-up' : 'chevron-down'}
                            size={18}
                            color="#999"
                          />
                        </TouchableOpacity>

                        {expandedUserId === u._id && (
                          <View style={styles.memberDetail}>
                            <View style={styles.memberInfoRow}>
                              <Ionicons name="person" size={15} color="#6b7280" />
                              <Text style={styles.memberInfoLabel}>Ime:</Text>
                              <Text style={styles.memberInfoValue}>{u.ime} {u.prezime}</Text>
                            </View>
                            <View style={styles.memberInfoRow}>
                              <Ionicons name="mail" size={15} color="#6b7280" />
                              <Text style={styles.memberInfoLabel}>Email:</Text>
                              <Text style={styles.memberInfoValue}>{u.email}</Text>
                            </View>
                            {u.telefon ? (
                              <View style={styles.memberInfoRow}>
                                <Ionicons name="call" size={15} color="#6b7280" />
                                <Text style={styles.memberInfoLabel}>Mobitel:</Text>
                                <Text style={styles.memberInfoValue}>{u.telefon}</Text>
                              </View>
                            ) : null}
                            <View style={styles.memberInfoRow}>
                              <Ionicons name="shield" size={15} color="#6b7280" />
                              <Text style={styles.memberInfoLabel}>Uloga:</Text>
                              <Text style={[styles.memberInfoValue, { color: getRoleColor(u.uloga), fontWeight: '600' }]}>{u.uloga}</Text>
                            </View>
                            <View style={styles.memberInfoRow}>
                              <Ionicons name={u.aktivan ? 'checkmark-circle' : 'close-circle'} size={15} color={u.aktivan ? '#16a34a' : '#ef4444'} />
                              <Text style={styles.memberInfoLabel}>Status:</Text>
                              <Text style={[styles.memberInfoValue, { color: u.aktivan ? '#16a34a' : '#ef4444' }]}>
                                {u.aktivan ? 'Aktivan' : 'Neaktivan'}
                              </Text>
                            </View>
                            <View style={styles.memberInfoRow}>
                              <Ionicons name="calendar" size={15} color="#6b7280" />
                              <Text style={styles.memberInfoLabel}>Registriran:</Text>
                              <Text style={styles.memberInfoValue}>
                                {u.kreiranDatum ? new Date(u.kreiranDatum).toLocaleDateString('hr-HR') : '-'}
                              </Text>
                            </View>

                            {/* Lozinka sekcija */}
                            <View style={styles.passwordSection}>
                              <View style={styles.memberInfoRow}>
                                <Ionicons name="lock-closed" size={15} color="#6b7280" />
                                <Text style={styles.memberInfoLabel}>Lozinka:</Text>
                                <Text style={styles.memberInfoValue}>••••••••</Text>
                              </View>
                              <Text style={styles.passwordNote}>
                                Lozinke su enkriptirane i ne mogu se prikazati. Možete postaviti novu lozinku.
                              </Text>

                              {passwordUserId === u._id ? (
                                <View style={styles.passwordForm}>
                                  <View style={styles.passwordInputRow}>
                                    <TextInput
                                      style={styles.passwordInput}
                                      placeholder="Nova lozinka (min. 6 znakova)"
                                      value={newPassword}
                                      onChangeText={setNewPassword}
                                      secureTextEntry={!showPassword}
                                      autoCapitalize="none"
                                    />
                                    <TouchableOpacity
                                      style={styles.eyeBtn}
                                      onPress={() => setShowPassword(!showPassword)}
                                    >
                                      <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="#6b7280" />
                                    </TouchableOpacity>
                                  </View>
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
                                          setShowPassword(false);
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
                                      onPress={() => { setPasswordUserId(null); setNewPassword(''); setShowPassword(false); }}
                                    >
                                      <Text style={styles.passwordCancelBtnText}>Odustani</Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              ) : (
                                <TouchableOpacity
                                  style={styles.changePasswordBtn}
                                  onPress={() => { setPasswordUserId(u._id); setNewPassword(''); setShowPassword(false); }}
                                >
                                  <Ionicons name="key" size={16} color="#7c3aed" />
                                  <Text style={styles.changePasswordBtnText}>Promijeni lozinku</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>

                  <View style={styles.detailSection}>
                    <View style={styles.backupSectionHeader}>
                      <Text style={styles.detailTitle}>Backup firme</Text>
                      <TouchableOpacity
                        style={[styles.smallSecondaryBtn, companyBackupActionId === company._id && styles.disabledButton]}
                        onPress={() => loadCompanyBackups(company._id)}
                        disabled={companyBackupActionId === company._id}
                      >
                        {companyBackupLoadId === company._id ? (
                          <ActivityIndicator size="small" color="#2563eb" />
                        ) : (
                          <Ionicons name="refresh" size={14} color="#2563eb" />
                        )}
                        <Text style={styles.smallSecondaryBtnText}>Osvježi</Text>
                      </TouchableOpacity>
                    </View>

                    <Text style={styles.detailText}>Naziv backupa</Text>
                    <TextInput
                      style={styles.backupNameInput}
                      placeholder="npr. prije_migracije"
                      value={getBackupNameInput(company._id)}
                      onChangeText={(value) => setBackupNameInput(company._id, value)}
                      editable={companyBackupActionId !== company._id}
                      autoCapitalize="none"
                    />

                    <TouchableOpacity
                      style={[styles.smallPrimaryBtn, companyBackupActionId === company._id && styles.disabledButton]}
                      onPress={() => handleCreateCompanyBackup(company)}
                      disabled={companyBackupActionId === company._id}
                    >
                      <Ionicons name="save-outline" size={14} color="#fff" />
                      <Text style={styles.smallPrimaryBtnText}>Kreiraj backup firme</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.smallSecondaryActionBtn, companyBackupActionId === company._id && styles.disabledButton]}
                      onPress={() => handleRestoreCompanyFromFile(company)}
                      disabled={companyBackupActionId === company._id}
                    >
                      <Ionicons name="cloud-upload-outline" size={14} color="#1d4ed8" />
                      <Text style={styles.smallSecondaryActionBtnText}>Upload datoteke i restore</Text>
                    </TouchableOpacity>

                    {(companyBackupsMap[company._id] || []).length === 0 ? (
                      <Text style={styles.detailText}>Nema spremljenih backupa za ovu firmu.</Text>
                    ) : (
                      (companyBackupsMap[company._id] || []).map((backup) => (
                        <View key={backup._id} style={styles.backupRow}>
                          <View style={styles.backupInfoCol}>
                            <Text style={styles.backupRowDate}>{backup.backupName || new Date(backup.createdAt).toLocaleString('hr-HR')}</Text>
                            <Text style={styles.backupRowMeta}>
                              Zapisa: {backup.totalDocuments || 0} • {formatBackupSize(backup.compressedBytes)}
                            </Text>
                            <Text style={styles.backupRowMeta}>Kreiran: {new Date(backup.createdAt).toLocaleString('hr-HR')}</Text>
                            <Text style={styles.backupRowMeta}>Datoteka: {backup.fileName || '-'}</Text>
                            {!!backup.collectionCounts && (
                              <Text style={styles.backupRowMeta}>{formatCollectionCounts(backup.collectionCounts)}</Text>
                            )}
                          </View>
                          <View style={styles.backupActionCol}>
                            <TouchableOpacity
                              style={[styles.downloadBtn, companyBackupActionId === company._id && styles.disabledButton]}
                              onPress={() => handleDownloadCompanyBackup(company, backup)}
                              disabled={companyBackupActionId === company._id}
                            >
                              <Ionicons name="download-outline" size={14} color="#0f766e" />
                              <Text style={styles.downloadBtnText}>Download</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={[styles.restoreBtn, companyBackupActionId === company._id && styles.disabledButton]}
                              onPress={() => handleRestoreCompanyBackup(company, backup)}
                              disabled={companyBackupActionId === company._id}
                            >
                              <Ionicons name="reload" size={14} color="#b91c1c" />
                              <Text style={styles.restoreBtnText}>Vrati</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))
                    )}
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
  globalBackupButton: {
    marginTop: 14,
    backgroundColor: '#0f766e',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  globalBackupButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.6,
  },
  createSection: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  createHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  expandToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  expandToggleText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '700',
  },
  createSubTitle: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 4,
  },
  createInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 13,
    color: '#111827',
    marginBottom: 9,
  },
  createButton: {
    marginTop: 4,
    backgroundColor: '#1d4ed8',
    borderRadius: 8,
    paddingVertical: 11,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
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
  backupNameInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
    color: '#111827',
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  backupSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  smallPrimaryBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1d4ed8',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  smallPrimaryBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  smallSecondaryActionBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  smallSecondaryActionBtnText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '700',
  },
  smallSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  smallSecondaryBtnText: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '600',
  },
  backupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    backgroundColor: '#fff',
    padding: 10,
    marginBottom: 8,
    gap: 8,
  },
  backupInfoCol: {
    flex: 1,
  },
  backupActionCol: {
    gap: 6,
  },
  backupRowDate: {
    color: '#111827',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  backupRowMeta: {
    color: '#6b7280',
    fontSize: 11,
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fff1f2',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#99f6e4',
    backgroundColor: '#f0fdfa',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  downloadBtnText: {
    color: '#0f766e',
    fontWeight: '700',
    fontSize: 12,
  },
  restoreBtnText: {
    color: '#b91c1c',
    fontWeight: '700',
    fontSize: 12,
  },
  memberCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 8,
    overflow: 'hidden',
  },
  memberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
  },
  memberName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
  },
  memberDetail: {
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    padding: 12,
    backgroundColor: '#f9fafb',
  },
  memberInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
  },
  memberInfoLabel: {
    fontSize: 13,
    color: '#6b7280',
    width: 80,
  },
  memberInfoValue: {
    flex: 1,
    fontSize: 14,
    color: '#1f2937',
  },
  userRole: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  inactiveBadge: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  inactiveBadgeText: {
    fontSize: 10,
    color: '#ef4444',
    fontWeight: '600',
  },
  passwordSection: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  passwordNote: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
    marginBottom: 10,
    fontStyle: 'italic',
  },
  passwordForm: {
    marginTop: 4,
  },
  passwordInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  passwordInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  eyeBtn: {
    padding: 10,
    marginLeft: 4,
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
    gap: 6,
    backgroundColor: '#f3e8ff',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  changePasswordBtnText: {
    color: '#7c3aed',
    fontSize: 13,
    fontWeight: '600',
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

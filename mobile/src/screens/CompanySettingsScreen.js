import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  StatusBar,
  Platform,
  Image,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { companyAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { usePhotoUpload } from '../hooks/usePhotoUpload';
import ms from '../utils/scale';

const CompanySettingsScreen = ({ navigation }) => {
  const { user, isOnline, serverAwake, companySetupRequired, setCompanySetupRequired } = useAuth();
  const online = Boolean(isOnline && serverAwake);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [company, setCompany] = useState(null);
  const [editValues, setEditValues] = useState({});
  const { pickAndUploadPhoto, uploading: uploadingLogo, error: logoUploadError, clearError: clearLogoError } = usePhotoUpload();

  useEffect(() => {
    if (online) {
      loadCompanyInfo();
    }
  }, [online]);

  const loadCompanyInfo = async () => {
    if (!online) return;

    try {
      setLoading(true);
      const response = await companyAPI.getInfo();
      const companyData = response.data?.data || response.data;
      setCompany(companyData);
      setEditValues({
        naziv: companyData.naziv || '',
        adresa: companyData.adresa || '',
        oib: companyData.oib || '',
        email: companyData.email || '',
        mobitel: companyData.mobitel || '',
        telefon: companyData.telefon || '',
        web: companyData.web || '',
        logo: companyData.logo || '',
      });
    } catch (error) {
      console.error('❌ Greška pri dohvaćanju podataka firme:', error);
      Alert.alert('Greška', 'Nije moguće učitati podatke firme');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Validacija obaveznih polja
    if (!editValues.naziv?.trim()) {
      Alert.alert('Greška', 'Naziv firme je obavezan');
      return;
    }

    if (!editValues.adresa?.trim()) {
      Alert.alert('Greška', 'Adresa firme je obavezna');
      return;
    }

    if (!editValues.email?.trim()) {
      Alert.alert('Greška', 'Email firme je obavezan (koristi se za slanje radnih naloga)');
      return;
    }

    setSaving(true);
    try {
      const response = await companyAPI.update(editValues);
      const updated = response.data?.data || response.data;
      setCompany(updated);
      Alert.alert('Uspjeh', 'Podaci firme su ažurirani');

      // Ako je ovo bio forced setup ekran, resetiraj flag i idi na Home
      if (companySetupRequired) {
        setCompanySetupRequired(false);
        setTimeout(() => navigation.navigate('Home'), 500);
      }
    } catch (error) {
      console.error('❌ Greška pri ažuriranju firme:', error);
      Alert.alert('Greška', error.response?.data?.message || 'Nije moguće ažurirati podatke');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadLogo = async () => {
    clearLogoError();
    const result = await pickAndUploadPhoto();
    if (!result?.url) return;

    setEditValues((prev) => ({
      ...prev,
      logo: result.url,
    }));
  };

  const handleRemoveLogo = () => {
    setEditValues((prev) => ({
      ...prev,
      logo: '',
    }));
  };

  // Provjera permisija
  const isAdmin = user?.uloga === 'admin' || user?.uloga === 'menadzer';
  if (!isAdmin) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="lock-closed" size={64} color="#ef4444" />
        <Text style={styles.errorText}>Nemate dozvolu za pristup ovoj stranici!</Text>
        <Text style={styles.infoText}>Samo admin ili menadžer mogu vidjeti/ažurirati podatke firme.</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Vrati se</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!online) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="wifi-outline" size={64} color="#FF6B6B" />
        <Text style={styles.errorText}>Trebate biti online!</Text>
        <Text style={styles.infoText}>Podaci firme mogu se ažurirati samo na internetu.</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Vrati se</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.infoText}>Učitavam podatke firme...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F5F5" />
      
      <View style={styles.pageHeader}>
        {!companySetupRequired ? (
          <TouchableOpacity
            style={styles.pageBackButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={22} color="#111827" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 34 }} />
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>Postavke firme</Text>
          <Text style={styles.pageSubtitle}>Uredi podatke firme za dokumente i komunikaciju</Text>
        </View>
      </View>

      {/* Info poruka ako je forced setup */}
      {companySetupRequired && (
        <View style={styles.forcedSetupBanner}>
          <Ionicons name="alert-circle" size={20} color="#2563eb" />
          <Text style={styles.forcedSetupText}>
            Trebate popuniti podatke firme prije nego što nastavite s aplikacijom
          </Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? ms(92) : ms(2)}
      >
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Osnovni podaci */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Osnovni podaci</Text>

          <Text style={styles.label}>Logo firme</Text>
          {!!editValues.logo && (
            <View style={styles.logoPreviewWrap}>
              <Image source={{ uri: editValues.logo }} style={styles.logoPreview} resizeMode="contain" />
            </View>
          )}

          {logoUploadError ? (
            <View style={styles.logoErrorRow}>
              <Ionicons name="alert-circle-outline" size={16} color="#dc2626" />
              <Text style={styles.logoErrorText}>{logoUploadError}</Text>
            </View>
          ) : null}

          <View style={styles.logoActions}>
            <TouchableOpacity
              style={[styles.logoButton, uploadingLogo && styles.buttonDisabled]}
              onPress={handleUploadLogo}
              disabled={saving || uploadingLogo}
            >
              {uploadingLogo ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="image-outline" size={16} color="#fff" />
              )}
              <Text style={styles.logoButtonText}>{uploadingLogo ? 'Upload...' : 'Dodaj / promijeni logo'}</Text>
            </TouchableOpacity>

            {!!editValues.logo && (
              <TouchableOpacity
                style={styles.removeLogoButton}
                onPress={handleRemoveLogo}
                disabled={saving || uploadingLogo}
              >
                <Ionicons name="trash-outline" size={16} color="#dc2626" />
                <Text style={styles.removeLogoText}>Ukloni logo</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.logoHintText}>
            JPG/PNG/WebP, max 2MB. Preporuka: 800x800 px.
          </Text>

          <Text style={styles.label}>Naziv firme * (obavezno)</Text>
          <TextInput
            style={styles.input}
            placeholder="Naziv firme"
            value={editValues.naziv}
            onChangeText={(text) => setEditValues({ ...editValues, naziv: text })}
            editable={!saving}
          />

          <Text style={styles.label}>Adresa * (obavezno)</Text>
          <TextInput
            style={[styles.input, styles.multilineInput]}
            placeholder="Ulica i broj, grad"
            value={editValues.adresa}
            onChangeText={(text) => setEditValues({ ...editValues, adresa: text })}
            multiline
            numberOfLines={2}
            editable={!saving}
          />

          <Text style={styles.label}>OIB</Text>
          <TextInput
            style={styles.input}
            placeholder="OIB firme"
            value={editValues.oib}
            onChangeText={(text) => setEditValues({ ...editValues, oib: text })}
            editable={!saving}
          />
        </View>

        {/* Kontakt podaci */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Kontakt podaci</Text>

          <Text style={styles.label}>Email * (obavezno - koristi se za slanje radnih naloga)</Text>
          <TextInput
            style={styles.input}
            placeholder="email@firma.com"
            value={editValues.email}
            onChangeText={(text) => setEditValues({ ...editValues, email: text })}
            keyboardType="email-address"
            editable={!saving}
          />

          <Text style={styles.label}>Mobitel</Text>
          <TextInput
            style={styles.input}
            placeholder="+385 1 234 5678"
            value={editValues.mobitel}
            onChangeText={(text) => setEditValues({ ...editValues, mobitel: text })}
            keyboardType="phone-pad"
            editable={!saving}
          />

          <Text style={styles.label}>Telefon</Text>
          <TextInput
            style={styles.input}
            placeholder="+385 1 234 5678"
            value={editValues.telefon}
            onChangeText={(text) => setEditValues({ ...editValues, telefon: text })}
            keyboardType="phone-pad"
            editable={!saving}
          />

          <Text style={styles.label}>Web stranica</Text>
          <TextInput
            style={styles.input}
            placeholder="https://firma.com"
            value={editValues.web}
            onChangeText={(text) => setEditValues({ ...editValues, web: text })}
            keyboardType="url"
            editable={!saving}
          />
        </View>

        <View style={styles.bottomDescriptionCard}>
          <Ionicons name="information-circle-outline" size={16} color="#6b7280" />
          <Text style={styles.bottomDescriptionText}>
            Ovi podaci se koriste na radnim nalozima i u kontakt informacijama prema klijentima.
          </Text>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Akcije */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, styles.saveButton, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
          <Text style={styles.buttonText}>{saving ? 'Sprema...' : 'Spremi'}</Text>
        </TouchableOpacity>

        {!companySetupRequired && (
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={() => navigation.goBack()}
            disabled={saving}
          >
            <Ionicons name="close-circle-outline" size={18} color="#6b7280" />
            <Text style={[styles.buttonText, { color: '#6b7280' }]}>Odustani</Text>
          </TouchableOpacity>
        )}
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    paddingTop: Platform.OS === 'android'
      ? (StatusBar.currentHeight || 0) + 12
      : 24,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: ms(20),
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(12),
    paddingHorizontal: ms(16),
    paddingVertical: ms(10),
    backgroundColor: '#F5F5F5',
  },
  pageBackButton: {
    padding: ms(6),
  },
  pageTitle: {
    fontSize: ms(20),
    fontWeight: '700',
    color: '#111827',
  },
  pageSubtitle: {
    fontSize: ms(13),
    color: '#6b7280',
    marginTop: ms(2),
  },
  keyboardWrap: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: ms(16),
  },
  contentContainer: {
    paddingBottom: ms(24),
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: ms(12),
    padding: ms(16),
    marginBottom: ms(16),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  bottomDescriptionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ms(8),
    backgroundColor: '#f3f4f6',
    borderRadius: ms(10),
    padding: ms(12),
    marginBottom: ms(8),
  },
  bottomDescriptionText: {
    flex: 1,
    fontSize: ms(12),
    color: '#6b7280',
    lineHeight: ms(17),
  },
  sectionTitle: {
    fontSize: ms(15),
    fontWeight: '700',
    color: '#111827',
    marginBottom: ms(12),
  },
  logoPreviewWrap: {
    width: '100%',
    height: ms(120),
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: ms(10),
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: ms(8),
    overflow: 'hidden',
  },
  logoPreview: {
    width: '100%',
    height: '100%',
  },
  logoActions: {
    flexDirection: 'row',
    gap: ms(8),
    alignItems: 'center',
    marginBottom: ms(4),
  },
  logoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(6),
    backgroundColor: '#0f4c81',
    borderRadius: ms(8),
    paddingVertical: ms(10),
    paddingHorizontal: ms(12),
  },
  logoButtonText: {
    color: '#fff',
    fontSize: ms(13),
    fontWeight: '700',
  },
  removeLogoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(6),
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    borderRadius: ms(8),
    paddingVertical: ms(10),
    paddingHorizontal: ms(12),
  },
  removeLogoText: {
    color: '#dc2626',
    fontSize: ms(13),
    fontWeight: '700',
  },
  logoErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(6),
    marginBottom: ms(8),
  },
  logoErrorText: {
    flex: 1,
    color: '#dc2626',
    fontSize: ms(12),
  },
  logoHintText: {
    fontSize: ms(12),
    color: '#64748b',
    lineHeight: ms(17),
    marginBottom: ms(8),
  },
  label: {
    fontSize: ms(13),
    fontWeight: '600',
    color: '#374151',
    marginTop: ms(8),
    marginBottom: ms(4),
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: ms(8),
    padding: ms(12),
    fontSize: ms(14),
    color: '#111827',
    backgroundColor: '#fafafa',
  },
  multilineInput: {
    textAlignVertical: 'top',
    minHeight: ms(80),
  },
  footer: {
    flexDirection: 'row',
    gap: ms(8),
    padding: ms(16),
    paddingBottom: ms(16),
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(8),
    padding: ms(12),
    borderRadius: ms(8),
  },
  saveButton: {
    backgroundColor: '#2563eb',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  buttonText: {
    fontSize: ms(14),
    fontWeight: '700',
    color: '#fff',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  errorText: {
    fontSize: ms(16),
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: ms(8),
    textAlign: 'center',
  },
  infoText: {
    fontSize: ms(13),
    color: '#6b7280',
    textAlign: 'center',
  },
  backButton: {
    marginTop: ms(16),
    paddingHorizontal: ms(24),
    paddingVertical: ms(12),
    backgroundColor: '#2563eb',
    borderRadius: ms(8),
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: ms(14),
  },
  forcedSetupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderLeftWidth: 4,
    borderLeftColor: '#2563eb',
    paddingHorizontal: ms(16),
    paddingVertical: ms(12),
    gap: ms(12),
  },
  forcedSetupText: {
    flex: 1,
    fontSize: ms(13),
    fontWeight: '600',
    color: '#1e40af',
    marginTop: ms(2),
  },
});

export default CompanySettingsScreen;

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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { companyAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import ms from '../utils/scale';

const CompanySettingsScreen = ({ navigation }) => {
  const { user, isOnline, serverAwake } = useAuth();
  const online = Boolean(isOnline && serverAwake);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [company, setCompany] = useState(null);
  const [editValues, setEditValues] = useState({});

  useEffect(() => {
    loadCompanyInfo();
  }, []);

  const loadCompanyInfo = async () => {
    if (!online) {
      Alert.alert('Nema konekcije', 'Trebate biti online za pregled/ažuriranje podataka firme');
      setLoading(false);
      return;
    }

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
      });
    } catch (error) {
      console.error('❌ Greška pri dohvaćanju podataka firme:', error);
      Alert.alert('Greška', 'Nije moguće učitati podatke firme');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editValues.naziv?.trim()) {
      Alert.alert('Greška', 'Naziv firme je obavezan');
      return;
    }

    setSaving(true);
    try {
      const response = await companyAPI.update(editValues);
      const updated = response.data?.data || response.data;
      setCompany(updated);
      Alert.alert('Uspjeh', 'Podaci firme su ažurirani');
    } catch (error) {
      console.error('❌ Greška pri ažuriranju firme:', error);
      Alert.alert('Greška', error.response?.data?.message || 'Nije moguće ažurirati podatke');
    } finally {
      setSaving(false);
    }
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
        <Ionicons name="wifi-off" size={64} color="#FF6B6B" />
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
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBack}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Postavke firme</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Osnovni podaci */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Osnovni podaci</Text>

          <Text style={styles.label}>Naziv firme *</Text>
          <TextInput
            style={styles.input}
            placeholder="Naziv firme"
            value={editValues.naziv}
            onChangeText={(text) => setEditValues({ ...editValues, naziv: text })}
            editable={!saving}
          />

          <Text style={styles.label}>Adresa</Text>
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

          <Text style={styles.label}>Email</Text>
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

        <View style={{ height: 100 }} />
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

        <TouchableOpacity
          style={[styles.button, styles.cancelButton]}
          onPress={() => navigation.goBack()}
          disabled={saving}
        >
          <Ionicons name="close-circle-outline" size={18} color="#6b7280" />
          <Text style={[styles.buttonText, { color: '#6b7280' }]}>Odustani</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: ms(20),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: ms(16),
    paddingVertical: ms(12),
    paddingTop: Platform.OS === 'android' ? ms(12) : ms(50),
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  headerBack: {
    padding: ms(8),
  },
  headerTitle: {
    fontSize: ms(18),
    fontWeight: '700',
    color: '#1f2937',
  },
  content: {
    flex: 1,
    padding: ms(16),
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
  sectionTitle: {
    fontSize: ms(15),
    fontWeight: '700',
    color: '#111827',
    marginBottom: ms(12),
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
});

export default CompanySettingsScreen;

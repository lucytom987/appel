import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { useAuth } from '../context/AuthContext';
import LocationPickerModal from '../components/LocationPickerModal';
import { elevatorDB } from '../database/db';
import { elevatorsAPI } from '../services/api';

export default function AddElevatorScreen({ navigation }) {
  const { isOnline } = useAuth();
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [mapPickerVisible, setMapPickerVisible] = useState(false);

  // Konvertiraj isOnline u boolean
  const online = Boolean(isOnline);

  const [elevators, setElevators] = useState([
    { id: 1, brojDizala: '', intervalServisa: '1' }
  ]);

  const [formData, setFormData] = useState({
    // Osnovno
    brojUgovora: '',
    nazivStranke: '',
    ulica: '',
    mjesto: '',
    
    // Kontakt osoba
    kontaktOsoba: {
      imePrezime: '',
      mobitel: '',
      email: '',
      ulaznaKoda: '',
      ulazneSifre: [''],
    },

    // GPS Koordinate - backend očekuje
    koordinate: {
      latitude: 0,
      longitude: 0,
    },
    
    // Napomene za adresu
    napomene: '',
  });

  const addElevator = () => {
    const newId = elevators.length > 0 ? Math.max(...elevators.map(e => e.id)) + 1 : 1;
    setElevators([...elevators, { id: newId, brojDizala: '', intervalServisa: '1' }]);
  };

  // Geocoding - pretvorba adrese u GPS koordinate
  const geocodeAddress = async () => {
    if (!formData.ulica.trim() || !formData.mjesto.trim()) {
      Alert.alert('Greška', 'Molim prvo unesite ulicu i mjesto');
      return;
    }

    setGeocoding(true);

    try {
      const address = `${formData.ulica}, ${formData.mjesto}, Croatia`;
      
      // Koristi Google Geocoding API preko expo-location
      const results = await Location.geocodeAsync(address);
      
      if (results && results.length > 0) {
        const { latitude, longitude } = results[0];
        
        setFormData(prev => ({
          ...prev,
          koordinate: { latitude, longitude }
        }));
        
        Alert.alert(
          'Uspjeh',
          `Lokacija pronađena:\nŠirina: ${latitude.toFixed(6)}\nDužina: ${longitude.toFixed(6)}`
        );
      } else {
        Alert.alert('Greška', 'Nije moguće pronaći koordinate za unesenu adresu. Pokušajte s drugačijom adresom ili odaberite lokaciju na karti.');
      }
    } catch (error) {
      console.error('Geocoding greška:', error);
      Alert.alert('Greška', 'Došlo je do greške pri traženju koordinata. Provjerite internet vezu ili odaberite lokaciju na karti.');
    } finally {
      setGeocoding(false);
    }
  };

  const handleMapPickerSelect = (location) => {
    setFormData(prev => ({
      ...prev,
      koordinate: {
        latitude: location.latitude,
        longitude: location.longitude
      }
    }));
  };

  const removeElevator = (id) => {
    if (elevators.length > 1) {
      setElevators(elevators.filter(e => e.id !== id));
    }
  };

  const addEntryCode = () => {
    setFormData(prev => ({
      ...prev,
      kontaktOsoba: {
        ...prev.kontaktOsoba,
        ulazneSifre: [...(prev.kontaktOsoba.ulazneSifre || []), ''],
      },
    }));
  };

  const updateEntryCode = (index, value) => {
    setFormData(prev => {
      const list = [...(prev.kontaktOsoba.ulazneSifre || [])];
      list[index] = value;
      return {
        ...prev,
        kontaktOsoba: { ...prev.kontaktOsoba, ulazneSifre: list },
      };
    });
  };

  const removeEntryCode = (index) => {
    setFormData(prev => {
      const list = [...(prev.kontaktOsoba.ulazneSifre || [])];
      if (list.length <= 1) {
        list[0] = '';
      } else {
        list.splice(index, 1);
      }
      return {
        ...prev,
        kontaktOsoba: { ...prev.kontaktOsoba, ulazneSifre: list },
      };
    });
  };

  const updateElevator = (id, field, value) => {
    setElevators(elevators.map(e => 
      e.id === id ? { ...e, [field]: value } : e
    ));
  };

  const handleSubmit = async () => {
    // Validacija - broj ugovora više nije obavezan
    if (!formData.nazivStranke.trim()) {
      Alert.alert('Greška', 'Molim unesite naziv stranke');
      return;
    }
    if (!formData.ulica.trim()) {
      Alert.alert('Greška', 'Molim unesite ulicu i kućni broj');
      return;
    }
    if (!formData.mjesto.trim()) {
      Alert.alert('Greška', 'Molim unesite mjesto');
      return;
    }
    
    // Provjeri jesu li sva dizala popunjena
    const invalidElevator = elevators.find(e => !e.brojDizala.trim());
    if (invalidElevator) {
      Alert.alert('Greška', 'Molim unesite broj za sva dizala');
      return;
    }

    setLoading(true);

    try {
      let successCount = 0;

      const cleanEntryCodes = (formData.kontaktOsoba.ulazneSifre || [])
        .map((c) => (c || '').trim())
        .filter(Boolean);

      // Provjeri je li token offline token (demo korisnik)
      const token = await SecureStore.getItemAsync('userToken');
      const isOfflineUser = token && token.startsWith('offline_token_');
      
      // Dodaj svako dizalo
      for (const elevator of elevators) {
        const elevatorData = {
          brojUgovora: formData.brojUgovora.trim() || undefined, // Opcionalno - može biti prazan
          nazivStranke: formData.nazivStranke,
          ulica: formData.ulica,
          mjesto: formData.mjesto,
          brojDizala: elevator.brojDizala,
          kontaktOsoba: {
            ...formData.kontaktOsoba,
            ulaznaKoda: cleanEntryCodes[0] || formData.kontaktOsoba.ulaznaKoda || '',
            ulazneSifre: cleanEntryCodes,
          },
          intervalServisa: parseInt(elevator.intervalServisa) || 1,
          napomene: formData.napomene,
          koordinate: {
            latitude: parseFloat(formData.koordinate.latitude) || 0,
            longitude: parseFloat(formData.koordinate.longitude) || 0,
          },
          status: 'aktivan',
        };

        // Ako je offline korisnik ILI nema interneta - spremi samo lokalno
        if (isOfflineUser || !online) {
          console.log('📱 Demo/offline korisnik - dodajem dizalo lokalno bez API poziva');
          elevatorDB.insert({
            id: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            ...elevatorData,
            synced: 0, // Bit će syncirano kada se prijavi s pravim korisnicima
          });
          
          successCount++;
        } else {
          // Online s pravim korisničkim tokenom - spremi na backend
          try {
            const response = await elevatorsAPI.create(elevatorData);
            const created = response.data?.data || response.data;

            // Spremi u lokalnu bazu s ispravnim poljima
            elevatorDB.insert({
              id: created._id || created.id,
              ...created,
              synced: 1,
            });
            
            successCount++;
          } catch (error) {
            console.error('Greška pri slanju na backend:', error);
            // Ako je 401 - korisnik je odjavljenje, obavijesti ga
            if (error.response?.status === 401) {
              throw new Error('Vaša prijava je istekla. Molim prijavite se ponovno.');
            }
            // Inače - pokušaj offline fallback
            console.log('⚠️ Backend greška - fallback na lokalnu bazu');
            elevatorDB.insert({
              id: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
              ...elevatorData,
              synced: 0,
            });
            successCount++;
          }
        }
      }

      Alert.alert('Uspjeh', 
        isOfflineUser || !online
          ? `Uspješno dodano ${successCount} dizala (bit će sinkronizovano kada budete online s pravim korisničkim računom)`
          : `Uspješno dodano ${successCount} dizala`,
        [
          { 
            text: 'Gotovo', 
            onPress: () => navigation.goBack() 
          }
        ]
      );

    } catch (error) {
      console.error('Greška pri dodavanju dizala:', error);
      Alert.alert('Greška', error.message || error.response?.data?.message || 'Nije moguće dodati dizalo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Novo dizalo</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        {/* Offline warning */}
        {!online && (
          <View style={styles.offlineWarning}>
            <Ionicons name="warning" size={20} color="#ef4444" />
            <Text style={styles.offlineText}>
              Za dodavanje dizala morate biti online
            </Text>
          </View>
        )}

        {/* Osnovno */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Osnovno</Text>
          
          <Text style={styles.label}>Broj ugovora</Text>
          <TextInput
            style={styles.input}
            value={formData.brojUgovora}
            onChangeText={(text) => setFormData(prev => ({ ...prev, brojUgovora: text }))}
            placeholder="npr. 001/2026"
          />

          <Text style={styles.label}>Naziv stranke *</Text>
          <TextInput
            style={styles.input}
            value={formData.nazivStranke}
            onChangeText={(text) => setFormData(prev => ({ ...prev, nazivStranke: text }))}
            placeholder="npr. Firma d.o.o."
          />

          <Text style={styles.label}>Ulica i kućni broj *</Text>
          <TextInput
            style={styles.input}
            value={formData.ulica}
            onChangeText={(text) => setFormData(prev => ({ ...prev, ulica: text }))}
            placeholder="npr. Zagrebacka 1"
          />

          <Text style={styles.label}>Mjesto *</Text>
          <TextInput
            style={styles.input}
            value={formData.mjesto}
            onChangeText={(text) => setFormData(prev => ({ ...prev, mjesto: text }))}
            placeholder="npr. Varaždin"
          />
        </View>

        {/* Dizala na adresi */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Dizala na ovoj adresi</Text>
            <TouchableOpacity style={styles.addButton} onPress={addElevator}>
              <Ionicons name="add" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          
          {elevators.map((elevator, index) => (
            <View key={elevator.id} style={styles.elevatorItem}>
              <View style={styles.elevatorHeader}>
                <Text style={styles.elevatorNumber}>Dizalo #{index + 1}</Text>
                {elevators.length > 1 && (
                  <TouchableOpacity onPress={() => removeElevator(elevator.id)}>
                    <Ionicons name="trash-outline" size={20} color="#ef4444" />
                  </TouchableOpacity>
                )}
              </View>
              
              <Text style={styles.label}>Broj dizala *</Text>
              <TextInput
                style={styles.input}
                value={elevator.brojDizala}
                onChangeText={(text) => updateElevator(elevator.id, 'brojDizala', text)}
                placeholder="npr. 40-1234"
              />
              
              <Text style={styles.label}>Interval servisa</Text>
              <View style={styles.monthSelector}>
                {[1, 2, 3, 4, 5, 6].map(month => (
                  <TouchableOpacity
                    key={month}
                    style={[
                      styles.monthButton,
                      elevator.intervalServisa === month.toString() && styles.monthButtonActive
                    ]}
                    onPress={() => updateElevator(elevator.id, 'intervalServisa', month.toString())}
                  >
                    <Text style={[
                      styles.monthButtonText,
                      elevator.intervalServisa === month.toString() && styles.monthButtonTextActive
                    ]}>
                      {month}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.hint}>Odaberite broj mjeseci (zadano: 1 mjesec)</Text>
            </View>
          ))}
        </View>

        {/* Kontakt osoba */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Kontakt osoba</Text>
          
          <Text style={styles.label}>Ime i prezime</Text>
          <TextInput
            style={styles.input}
            value={formData.kontaktOsoba.imePrezime}
            onChangeText={(text) => setFormData(prev => ({ 
              ...prev, 
              kontaktOsoba: { ...prev.kontaktOsoba, imePrezime: text }
            }))}
            placeholder="Ime i prezime"
          />

          <Text style={styles.label}>Mobitel</Text>
          <TextInput
            style={styles.input}
            value={formData.kontaktOsoba.mobitel}
            onChangeText={(text) => setFormData(prev => ({ 
              ...prev, 
              kontaktOsoba: { ...prev.kontaktOsoba, mobitel: text }
            }))}
            placeholder="+385 91 123 4567"
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>E-mail</Text>
          <TextInput
            style={styles.input}
            value={formData.kontaktOsoba.email}
            onChangeText={(text) => setFormData(prev => ({ 
              ...prev, 
              kontaktOsoba: { ...prev.kontaktOsoba, email: text }
            }))}
            placeholder="email@domena.hr"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Ulazne šifre (više ulaza)</Text>
          <View style={styles.codeList}>
            {(formData.kontaktOsoba.ulazneSifre || ['']).map((code, idx) => (
              <View key={idx} style={styles.codeRow}>
                <Text style={styles.codeIndex}>Ulaz {idx + 1}</Text>
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  value={code}
                  onChangeText={(text) => updateEntryCode(idx, text)}
                  placeholder="npr. 1234#"
                />
                {idx > 0 && (
                  <TouchableOpacity onPress={() => removeEntryCode(idx)}>
                    <Ionicons name="trash-outline" size={20} color="#ef4444" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity style={styles.addCodeButton} onPress={addEntryCode}>
              <Ionicons name="add" size={18} color="#2563eb" />
              <Text style={styles.addCodeText}>Dodaj ulaz</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Lokacija (GPS) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lokacija (GPS)</Text>
          
          {/* Akcijski gumbi */}
          <View style={styles.locationActions}>
            <TouchableOpacity
              style={styles.locationButton}
              onPress={geocodeAddress}
              disabled={geocoding}
            >
              {geocoding ? (
                <ActivityIndicator size="small" color="#2563eb" />
              ) : (
                <Ionicons name="search" size={20} color="#2563eb" />
              )}
              <Text style={styles.locationButtonText}>
                {geocoding ? 'Tražim...' : 'Nađi iz adrese'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.locationButton}
              onPress={() => setMapPickerVisible(true)}
            >
              <Ionicons name="map" size={20} color="#10b981" />
              <Text style={styles.locationButtonText}>Odaberi na karti</Text>
            </TouchableOpacity>
          </View>

          {/* Koordinate prikaz */}
          <View style={styles.coordinatesDisplay}>
            <View style={styles.coordinateItem}>
              <Text style={styles.coordinateLabel}>Širina (lat):</Text>
              <TextInput
                style={styles.coordinateInput}
                value={formData.koordinate.latitude.toString()}
                onChangeText={(text) => setFormData(prev => ({
                  ...prev,
                  koordinate: { ...prev.koordinate, latitude: parseFloat(text) || 0 }
                }))}
                placeholder="45.815"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={styles.coordinateItem}>
              <Text style={styles.coordinateLabel}>Dužina (lng):</Text>
              <TextInput
                style={styles.coordinateInput}
                value={formData.koordinate.longitude.toString()}
                onChangeText={(text) => setFormData(prev => ({
                  ...prev,
                  koordinate: { ...prev.koordinate, longitude: parseFloat(text) || 0 }
                }))}
                placeholder="15.982"
                keyboardType="decimal-pad"
              />
            </View>
          </View>

          {formData.koordinate.latitude !== 0 && formData.koordinate.longitude !== 0 && (
            <View style={styles.locationSet}>
              <Ionicons name="checkmark-circle" size={16} color="#10b981" />
              <Text style={styles.locationSetText}>
                Lokacija postavljena
              </Text>
            </View>
          )}
        </View>

        {/* Napomene */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Napomene</Text>
          
          <TextInput
            style={[styles.input, styles.textArea]}
            value={formData.napomene}
            onChangeText={(text) => setFormData(prev => ({ ...prev, napomene: text }))}
            placeholder="Razne napomene za ovu adresu..."
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Submit button */}
        <TouchableOpacity
          style={[styles.submitButton, (!online || loading) && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!online || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="add-circle" size={24} color="#fff" />
              <Text style={styles.submitButtonText}>
                Dodaj {elevators.length} {elevators.length === 1 ? 'dizalo' : 'dizala'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Location Picker Modal */}
      <LocationPickerModal
        visible={mapPickerVisible}
        onClose={() => setMapPickerVisible(false)}
        onSelectLocation={handleMapPickerSelect}
        initialLocation={formData.koordinate.latitude && formData.koordinate.longitude ? formData.koordinate : null}
      />
    </SafeAreaView>
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
  content: {
    flex: 1,
  },
  offlineWarning: {
    backgroundColor: '#fef2f2',
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#fecaca',
  },
  offlineText: {
    flex: 1,
    fontSize: 14,
    color: '#ef4444',
  },
  section: {
    backgroundColor: '#fff',
    padding: 20,
    marginTop: 15,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1f2937',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  halfWidth: {
    flex: 1,
  },
  thirdWidth: {
    flex: 1,
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
  },
  codeList: {
    gap: 10,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  codeIndex: {
    width: 60,
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
  },
  codeInput: {
    flex: 1,
  },
  addCodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  addCodeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  monthSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  monthButton: {
    width: 50,
    height: 44,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthButtonActive: {
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
  },
  monthButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  monthButtonTextActive: {
    color: '#fff',
  },
  typeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  typeButtonActive: {
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  typeButtonTextActive: {
    color: '#fff',
  },
  submitButton: {
    backgroundColor: '#2563eb',
    marginHorizontal: 20,
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  submitButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  elevatorItem: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 15,
    marginBottom: 12,
  },
  elevatorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  elevatorNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  locationActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 15,
  },
  locationButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  locationButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  coordinatesDisplay: {
    gap: 10,
  },
  coordinateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  coordinateLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    width: 100,
  },
  coordinateInput: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#1f2937',
  },
  locationSet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    padding: 8,
    backgroundColor: '#f0fdf4',
    borderRadius: 6,
  },
  locationSetText: {
    fontSize: 12,
    color: '#10b981',
    fontWeight: '600',
  },
});

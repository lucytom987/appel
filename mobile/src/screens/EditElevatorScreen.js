import React, { useState, useEffect } from 'react';
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
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { useAuth } from '../context/AuthContext';
import LocationPickerModal from '../components/LocationPickerModal';
import { elevatorDB, serviceDB, repairDB } from '../database/db';
import { elevatorsAPI, servicesAPI, repairsAPI } from '../services/api';

export default function EditElevatorScreen({ navigation, route }) {
  const { elevator } = route.params;
  const { isOnline, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [mapPickerVisible, setMapPickerVisible] = useState(false);

  // Konvertiraj isOnline u boolean
  const online = Boolean(isOnline);

  const [formData, setFormData] = useState({
    // Osnovno
    brojUgovora: elevator.brojUgovora || '',
    nazivStranke: elevator.nazivStranke || '',
    ulica: elevator.ulica || '',
    mjesto: elevator.mjesto || '',
    brojDizala: elevator.brojDizala || '',
    
    // Kontakt osoba
    kontaktOsoba: {
      imePrezime: elevator.kontaktOsoba?.imePrezime || '',
      mobitel: elevator.kontaktOsoba?.mobitel || '',
      email: elevator.kontaktOsoba?.email || '',
      ulaznaKoda: elevator.kontaktOsoba?.ulaznaKoda || '',
    },

    // GPS Koordinate
    koordinate: {
      latitude: elevator.koordinate?.latitude || 0,
      longitude: elevator.koordinate?.longitude || 0,
    },
    
    // Status
    status: elevator.status || 'aktivan',
    
    // Servisiranje
    intervalServisa: elevator.intervalServisa?.toString() || '1',
    
    // Napomene
    napomene: elevator.napomene || '',
  });

  const statusOptions = [
    { value: 'aktivan', label: 'Aktivno', color: '#10b981' },
    { value: 'neaktivan', label: 'Neaktivno', color: '#6b7280' },
  ];

  // Geocoding - pretvorba adrese u GPS koordinate
  const geocodeAddress = async () => {
    if (!formData.ulica.trim() || !formData.mjesto.trim()) {
      Alert.alert('Greška', 'Molim prvo unesite ulicu i mjesto');
      return;
    }

    setGeocoding(true);

    try {
      const address = `${formData.ulica}, ${formData.mjesto}, Croatia`;
      
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

  const handleUpdate = async () => {
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
    if (!formData.brojDizala.trim()) {
      Alert.alert('Greška', 'Molim unesite broj dizala');
      return;
    }

    setLoading(true);

    try {
      const elevatorData = {
        brojUgovora: formData.brojUgovora,
        nazivStranke: formData.nazivStranke,
        ulica: formData.ulica,
        mjesto: formData.mjesto,
        brojDizala: formData.brojDizala,
        kontaktOsoba: formData.kontaktOsoba,
        koordinate: {
          latitude: parseFloat(formData.koordinate.latitude) || 0,
          longitude: parseFloat(formData.koordinate.longitude) || 0,
        },
        status: formData.status,
        intervalServisa: parseInt(formData.intervalServisa) || 1,
        napomene: formData.napomene,
      };

      // Odredi ispravan ID (lokalni 'id' ili server '_id')
      const eid = elevator._id || elevator.id;
      if (!eid) {
        throw new Error('Nedostaje ID dizala (id/_id)');
      }

      const token = await SecureStore.getItemAsync('userToken');
      const isOfflineUser = token?.startsWith('offline_token_');

      if (!online || isOfflineUser) {
        // Spremi samo lokalno i označi za sync
        elevatorDB.update(eid, {
          ...elevator,
          ...elevatorData,
          id: eid,
          sync_status: 'dirty',
          synced: 0,
          updated_at: Date.now(),
        });
        Alert.alert('Spremljeno lokalno', 'Dizalo je ažurirano i čeka sinkronizaciju.');
      } else {
        // Ažuriraj na backend
        const response = await elevatorsAPI.update(eid, elevatorData);

        // Ažuriraj u lokalnoj bazi
        const updated = response.data?.data || response.data;
        elevatorDB.update(eid, {
          ...updated,
          id: eid,
          synced: 1,
          sync_status: 'synced',
        });

        Alert.alert('Uspjeh', 'Dizalo uspješno ažurirano', [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Elevators'),
          }
        ]);
      }

    } catch (error) {
      console.error('Greška pri ažuriranju dizala:', error);
      const msg = error.response?.data?.message || error.message || 'Nije moguće ažurirati dizalo';
      Alert.alert('Greška', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Obriši dizalo',
      'Jeste li sigurni da želite obrisati ovo dizalo? Ova akcija je nepovratna.',
      [
        { text: 'Odustani', style: 'cancel' },
        { 
          text: 'Obriši', 
          style: 'destructive',
          onPress: confirmDelete 
        }
      ]
    );
  };

  const confirmDelete = async () => {
    // Provjeri je li admin
    if (user?.uloga !== 'admin') {
      Alert.alert('Nemate dozvolu', 'Samo administratori mogu brisati dizala');
      return;
    }

    setDeleting(true);
    let eid;

    try {
      // Provjeri je li offline korisnik (demo)
      const token = await SecureStore.getItemAsync('userToken');
      const isOfflineUser = token?.startsWith('offline_token_');

      eid = elevator._id || elevator.id;
      if (!eid) {
        throw new Error('Nedostaje ID dizala (id/_id)');
      }

      // Ako je online i pravi korisnik - obriši s backenda (elevator + vezani servisi/popravci)
      if (online && !isOfflineUser) {
        try {
          await elevatorsAPI.delete(eid);
        } catch (err) {
          // Ako backend vrati 404 za dizalo, nastavi na brisanje vezanih i lokalno
          const status = err?.status || err?.response?.status;
          if (status !== 404) throw err;
        }

        // Pokušaj obrisati vezane servise/popravke na backendu (best effort)
        try {
          const services = serviceDB.getAll(eid) || [];
          for (const s of services) {
            const sid = s._id || s.id;
            if (sid && !String(sid).startsWith('local_')) {
              try { await servicesAPI.delete(sid); } catch { /* ignore individual failures */ }
            }
          }
        } catch (e) {
          console.log('Skip remote service delete:', e?.message);
        }

        try {
          const repairs = repairDB.getAll(eid) || [];
          for (const r of repairs) {
            const rid = r._id || r.id;
            if (rid && !String(rid).startsWith('local_')) {
              try { await repairsAPI.delete(rid); } catch { /* ignore individual failures */ }
            }
          }
        } catch (e) {
          console.log('Skip remote repair delete:', e?.message);
        }
      }

      // Obriši iz lokalne baze (uvijek, offline ili online) uključujući vezane servise/popravke
      try {
        const services = serviceDB.getAll(eid) || [];
        services.forEach((s) => {
          const sid = s._id || s.id;
          if (sid) serviceDB.delete(sid);
        });
      } catch (e) {
        console.log('Skip local service delete:', e?.message);
      }

      try {
        const repairs = repairDB.getAll(eid) || [];
        repairs.forEach((r) => {
          const rid = r._id || r.id;
          if (rid) repairDB.delete(rid);
        });
      } catch (e) {
        console.log('Skip local repair delete:', e?.message);
      }

      elevatorDB.delete(eid);

      Alert.alert('Uspjeh', online && !isOfflineUser ? 'Dizalo obrisano' : 'Dizalo označeno kao obrisano (čeka sync)', [
        { 
          text: 'OK', 
          onPress: () => {
            navigation.navigate('Repairs');
          }
        }
      ]);

    } catch (error) {
      console.error('Greška pri brisanju dizala:', error);

      const status = error?.status || error?.response?.status;
      const backendMsg = error?.response?.data?.message || error?.message;
      const isNetwork = Boolean(error?.network);
      const wasQueued = Boolean(error?.queued);

      // Ako backend kaže 404 (već obrisano), ukloni lokalno i nastavi
      if (status === 404) {
        try {
          elevatorDB.delete(eid);
        } catch (localError) {
          console.log('Lok. delete nakon 404 nije uspio:', localError?.message);
        }
        Alert.alert('Info', 'Dizalo je već obrisano na serveru. Uklonjeno lokalno.', [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Repairs'),
          },
        ]);
        return;
      }

      if (!online || isNetwork || wasQueued) {
        // Offline ili mrežna/queued greška: obriši lokalno i sync kasnije
        try {
          elevatorDB.delete(eid);
          Alert.alert('Uspjeh', 'Dizalo obrisano lokalno (sync će se obaviti kada budete online)', [
            { 
              text: 'OK', 
              onPress: () => navigation.navigate('Repairs'),
            }
          ]);
        } catch (localError) {
          Alert.alert('Greška', 'Nije moguće obrisati dizalo');
        }
      } else {
        // Online druga greška
        Alert.alert('Greška', backendMsg || 'Nije moguće obrisati dizalo s backenda');
      }
    } finally {
      setDeleting(false);
    }
  };

  // Hardverski back uvijek vodi na listu dizala
  useEffect(() => {
    const handler = () => {
        navigation.navigate('Elevators');
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => sub.remove();
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('Elevators')}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Uredi dizalo</Text>
        {user?.uloga === 'admin' && (
          <TouchableOpacity onPress={handleDelete} disabled={deleting}>
            {deleting ? (
              <ActivityIndicator size="small" color="#ef4444" />
            ) : (
              <Ionicons name="trash-outline" size={24} color="#ef4444" />
            )}
          </TouchableOpacity>
        )}
        {user?.uloga !== 'admin' && <View style={{ width: 24 }} />}
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={100}
      >
        <ScrollView style={styles.content}>
        {/* Offline warning */}
        {!online && (
          <View style={styles.offlineWarning}>
            <Ionicons name="warning" size={20} color="#ef4444" />
            <Text style={styles.offlineText}>
              Offline ste – izmjene će se spremiti lokalno i syncati čim bude mreže.
            </Text>
          </View>
        )}

        {/* Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Status</Text>
          
          <View style={styles.statusButtons}>
            {statusOptions.map(option => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.statusButton,
                  formData.status === option.value && {
                    backgroundColor: option.color,
                    borderColor: option.color,
                  }
                ]}
                onPress={() => setFormData(prev => ({ ...prev, status: option.value }))}
              >
                <Text style={[
                  styles.statusButtonText,
                  formData.status === option.value && styles.statusButtonTextActive
                ]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Osnovno */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Osnovno</Text>
          
          <Text style={styles.label}>Broj ugovora *</Text>
          <TextInput
            style={styles.input}
            value={formData.brojUgovora}
            onChangeText={(text) => setFormData(prev => ({ ...prev, brojUgovora: text }))}
            placeholder="npr. UG-2025-001"
          />

          <Text style={styles.label}>Naziv stranke *</Text>
          <TextInput
            style={styles.input}
            value={formData.nazivStranke}
            onChangeText={(text) => setFormData(prev => ({ ...prev, nazivStranke: text }))}
            placeholder="npr. ABC d.o.o."
          />

          <Text style={styles.label}>Ulica i kućni broj *</Text>
          <TextInput
            style={styles.input}
            value={formData.ulica}
            onChangeText={(text) => setFormData(prev => ({ ...prev, ulica: text }))}
            placeholder="npr. Ilica 123"
          />

          <Text style={styles.label}>Mjesto *</Text>
          <TextInput
            style={styles.input}
            value={formData.mjesto}
            onChangeText={(text) => setFormData(prev => ({ ...prev, mjesto: text }))}
            placeholder="npr. Zagreb"
          />

          <Text style={styles.label}>Broj dizala *</Text>
          <TextInput
            style={styles.input}
            value={formData.brojDizala}
            onChangeText={(text) => setFormData(prev => ({ ...prev, brojDizala: text }))}
            placeholder="npr. D1, D2..."
          />
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

          <Text style={styles.label}>Ulazna šifra na zgradu</Text>
          <TextInput
            style={styles.input}
            value={formData.kontaktOsoba.ulaznaKoda}
            onChangeText={(text) => setFormData(prev => ({ 
              ...prev, 
              kontaktOsoba: { ...prev.kontaktOsoba, ulaznaKoda: text }
            }))}
            placeholder="npr. 1234#"
          />
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

        {/* Servisiranje */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Servisiranje</Text>
          
          <Text style={styles.label}>Interval servisa</Text>
          <View style={styles.monthSelector}>
            {[1, 2, 3, 4, 5, 6].map(month => (
              <TouchableOpacity
                key={month}
                style={[
                  styles.monthButton,
                  formData.intervalServisa === month.toString() && styles.monthButtonActive
                ]}
                onPress={() => setFormData(prev => ({ ...prev, intervalServisa: month.toString() }))}
              >
                <Text style={[
                  styles.monthButtonText,
                  formData.intervalServisa === month.toString() && styles.monthButtonTextActive
                ]}>
                  {month}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.hint}>Odaberite broj mjeseci (zadano: 1 mjesec)</Text>
        </View>

        {/* Napomene */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Napomene</Text>
          
          <TextInput
            style={[styles.input, styles.textArea]}
            value={formData.napomene}
            onChangeText={(text) => setFormData(prev => ({ ...prev, napomene: text }))}
            placeholder="Razne napomene..."
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Submit button */}
        <TouchableOpacity
          style={[styles.submitButton, (!online || loading) && styles.submitButtonDisabled]}
          onPress={handleUpdate}
          disabled={!online || loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="save-outline" size={24} color="#fff" />
              <Text style={styles.submitButtonText}>Spremi promjene</Text>
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
  statusButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusButton: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  statusButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  statusButtonTextActive: {
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

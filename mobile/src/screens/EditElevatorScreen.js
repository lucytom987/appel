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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { elevatorDB } from '../database/db';
import { elevatorsAPI } from '../services/api';

export default function EditElevatorScreen({ navigation, route }) {
  const { elevator } = route.params;
  const { isOnline, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    { value: 'u kvaru', label: 'U kvaru', color: '#ef4444' },
    { value: 'u servisu', label: 'U servisu', color: '#f59e0b' },
  ];

  const handleUpdate = async () => {
    // Validacija
    if (!formData.brojUgovora.trim()) {
      Alert.alert('Greška', 'Molim unesite broj ugovora');
      return;
    }
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

    // Provjeri je li online
    if (!online) {
      Alert.alert('Offline', 'Za ažuriranje dizala morate biti online');
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

      // Ažuriraj na backend
      const response = await elevatorsAPI.update(elevator._id, elevatorData);

      // Ažuriraj u lokalnoj bazi
      elevatorDB.update(elevator._id, {
        ...response.data,
        synced: true,
      });

      Alert.alert('Uspjeh', 'Dizalo uspješno ažurirano', [
        { 
          text: 'OK', 
          onPress: () => navigation.goBack() 
        }
      ]);

    } catch (error) {
      console.error('Greška pri ažuriranju dizala:', error);
      Alert.alert('Greška', error.response?.data?.message || 'Nije moguće ažurirati dizalo');
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

    try {
      // Ako je online - obriši s backenda prvo
      if (online) {
        await elevatorsAPI.delete(elevator._id);
      }

      // Obriši iz lokalne baze (uvijek, offline ili online)
      elevatorDB.delete(elevator._id);

      Alert.alert('Uspjeh', 'Dizalo obrisano', [
        { 
          text: 'OK', 
          onPress: () => {
            navigation.navigate('Elevators');
          }
        }
      ]);

    } catch (error) {
      console.error('Greška pri brisanju dizala:', error);
      
      // Ako je greška s backenda - obriši lokalno i nastavи
      if (online) {
        // Ako je online i brisanje s backenda failalo - prikazi grešku
        Alert.alert('Greška', error.response?.data?.message || 'Nije moguće obrisati dizalo s backenda');
      } else {
        // Ako je offline - obriši lokalno kako je planirano
        try {
          elevatorDB.delete(elevator._id);
          Alert.alert('Uspjeh', 'Dizalo obrisano lokalno (sync će se obaviti kada budete online)', [
            { 
              text: 'OK', 
              onPress: () => {
                navigation.navigate('Elevators');
              }
            }
          ]);
        } catch (localError) {
          Alert.alert('Greška', 'Nije moguće obrisati dizalo');
        }
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
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

      <ScrollView style={styles.content}>
        {/* Offline warning */}
        {!online && (
          <View style={styles.offlineWarning}>
            <Ionicons name="warning" size={20} color="#ef4444" />
            <Text style={styles.offlineText}>
              Za ažuriranje dizala morate biti online
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

        {/* Servisiranje */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lokacija (GPS)</Text>
          
          <Text style={styles.label}>Geografska širina (latitude)</Text>
          <TextInput
            style={styles.input}
            value={formData.koordinate.latitude.toString()}
            onChangeText={(text) => setFormData(prev => ({
              ...prev,
              koordinate: { ...prev.koordinate, latitude: parseFloat(text) || 0 }
            }))}
            placeholder="npr. 45.815"
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>Geografska dužina (longitude)</Text>
          <TextInput
            style={styles.input}
            value={formData.koordinate.longitude.toString()}
            onChangeText={(text) => setFormData(prev => ({
              ...prev,
              koordinate: { ...prev.koordinate, longitude: parseFloat(text) || 0 }
            }))}
            placeholder="npr. 15.982"
            keyboardType="decimal-pad"
          />
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
});

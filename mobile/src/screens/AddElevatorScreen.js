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

export default function AddElevatorScreen({ navigation }) {
  const { isOnline } = useAuth();
  const [loading, setLoading] = useState(false);

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

  const removeElevator = (id) => {
    if (elevators.length > 1) {
      setElevators(elevators.filter(e => e.id !== id));
    }
  };

  const updateElevator = (id, field, value) => {
    setElevators(elevators.map(e => 
      e.id === id ? { ...e, [field]: value } : e
    ));
  };

  const handleSubmit = async () => {
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
    
    // Provjeri jesu li sva dizala popunjena
    const invalidElevator = elevators.find(e => !e.brojDizala.trim());
    if (invalidElevator) {
      Alert.alert('Greška', 'Molim unesite broj za sva dizala');
      return;
    }

    // Provjeri je li online (samo online može dodavati dizala)
    if (!online) {
      Alert.alert('Offline', 'Za dodavanje dizala morate biti online');
      return;
    }

    setLoading(true);

    try {
      let successCount = 0;
      
      // Dodaj svako dizalo
      for (const elevator of elevators) {
        const elevatorData = {
          brojUgovora: formData.brojUgovora,
          nazivStranke: formData.nazivStranke,
          ulica: formData.ulica,
          mjesto: formData.mjesto,
          brojDizala: elevator.brojDizala,
          kontaktOsoba: formData.kontaktOsoba,
          intervalServisa: parseInt(elevator.intervalServisa) || 1,
          napomene: formData.napomene,
          koordinate: {
            latitude: parseFloat(formData.koordinate.latitude) || 0,
            longitude: parseFloat(formData.koordinate.longitude) || 0,
          },
          status: 'aktivan',
        };

        const response = await elevatorsAPI.create(elevatorData);

        // Spremi u lokalnu bazu
        elevatorDB.insert({
          _id: response.data._id,
          ...response.data,
          synced: true,
        });
        
        successCount++;
      }

      Alert.alert('Uspjeh', `Uspješno dodano ${successCount} dizala`, [
        { 
          text: 'Gotovo', 
          onPress: () => navigation.goBack() 
        }
      ]);

    } catch (error) {
      console.error('Greška pri dodavanju dizala:', error);
      Alert.alert('Greška', error.response?.data?.message || 'Nije moguće dodati dizalo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Novo dizalo</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
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
                placeholder="npr. D1, D2..."
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

        {/* Napomene */}
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
});

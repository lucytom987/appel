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
import DateTimePicker from '@react-native-community/datetimepicker';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';
import { serviceDB } from '../database/db';
import { servicesAPI } from '../services/api';

export default function AddServiceScreen({ navigation, route }) {
  const { elevator } = route.params;
  const { user, isOnline } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Konvertiraj isOnline u boolean
  const online = Boolean(isOnline);

  const [formData, setFormData] = useState({
    serviceDate: new Date(),
    opis: '',
    napomene: '',
    nextServiceDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 dana
  });

  const [checklist, setChecklist] = useState({
    engineCheck: false,
    cableInspection: false,
    doorSystem: false,
    emergencyBrake: false,
    controlPanel: false,
    safetyDevices: false,
    lubrication: false,
    lighting: false,
  });

  const checklistItems = [
    { key: 'engineCheck', label: 'Provjera motora' },
    { key: 'cableInspection', label: 'Inspekcija užeta' },
    { key: 'doorSystem', label: 'Sustav vrata' },
    { key: 'emergencyBrake', label: 'Sigurnosna kočnica' },
    { key: 'controlPanel', label: 'Kontrolna ploča' },
    { key: 'safetyDevices', label: 'Sigurnosne naprave' },
    { key: 'lubrication', label: 'Podmazivanje' },
    { key: 'lighting', label: 'Rasvjeta' },
  ];

  const toggleChecklistItem = (key) => {
    setChecklist(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleDateChange = (event, selectedDate, field) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setFormData(prev => ({
        ...prev,
        [field]: selectedDate
      }));
    }
  };

  const handleSubmit = async () => {
    // Validacija
    if (!formData.opis.trim()) {
      Alert.alert('Greška', 'Molim unesite opis servisa');
      return;
    }

    setLoading(true);

    try {
      const serviceData = {
        elevatorId: elevator._id,
        serviserID: user._id,
        datum: formData.serviceDate.toISOString(),
        napomene: formData.napomene,
        imaNedostataka: false,
        nedostaci: [],
        sljedeciServis: formData.nextServiceDate.toISOString(),
        checklist: [
          { stavka: 'engine_check', provjereno: checklist.engineCheck ? 1 : 0, napomena: '' },
          { stavka: 'cable_inspection', provjereno: checklist.cableInspection ? 1 : 0, napomena: '' },
          { stavka: 'door_system', provjereno: checklist.doorSystem ? 1 : 0, napomena: '' },
          { stavka: 'emergency_brake', provjereno: checklist.emergencyBrake ? 1 : 0, napomena: '' },
          { stavka: 'control_panel', provjereno: checklist.controlPanel ? 1 : 0, napomena: '' },
          { stavka: 'safety_devices', provjereno: checklist.safetyDevices ? 1 : 0, napomena: '' },
          { stavka: 'lubrication', provjereno: checklist.lubrication ? 1 : 0, napomena: '' },
          { stavka: 'lighting', provjereno: checklist.lighting ? 1 : 0, napomena: '' },
        ],
      };

      // Provjeri je li offline korisnik (demo korisnik)
      const token = await SecureStore.getItemAsync('userToken');
      const isOfflineUser = token && token.startsWith('offline_token_');

      if (isOfflineUser || !online) {
        // Offline korisnik - spremi samo lokalno
        console.log('📱 Demo/offline korisnik - dodajem servis lokalno bez API poziva');
        serviceDB.insert({
          id: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          ...serviceData,
          synced: 0, // Bit će syncirano kada se prijavi s pravim korisnicima
        });

        Alert.alert('Uspjeh', 'Servis je dodan lokalno (bit će sinkronizovan kada budete online s pravim korisničkim računom)', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      } else {
        // Online s pravim korisničkim tokenom - spremi na backend
        try {
          const response = await servicesAPI.create(serviceData);

          // Spremi u lokalnu bazu
          serviceDB.insert({
            ...response.data,
            synced: true,
          });

          Alert.alert('Uspjeh', 'Servis uspješno logiran', [
            { text: 'OK', onPress: () => navigation.goBack() }
          ]);
        } catch (error) {
          console.error('Greška pri slanju na backend:', error);
          if (error.response?.status === 401) {
            throw new Error('Vaša prijava je istekla. Molim prijavite se ponovno.');
          }
          // Fallback na lokalnu bazu
          console.log('⚠️ Backend greška - fallback na lokalnu bazu');
          serviceDB.insert({
            id: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            ...serviceData,
            synced: 0,
          });

          Alert.alert('Uspjeh', 'Servis je dodan lokalno (bit će sinkronizovan kada budete online)', [
            { text: 'OK', onPress: () => navigation.goBack() }
          ]);
        }
      }

    } catch (error) {
      console.error('Greška pri logranju servisa:', error);
      Alert.alert('Greška', error.message || error.response?.data?.message || 'Nije moguće logirati servis');
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
        <Text style={styles.headerTitle}>Novi servis</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Informacije o dizalu */}
        <View style={styles.elevatorInfo}>
          <Text style={styles.elevatorName}>{elevator.brojDizala} - {elevator.nazivStranke}</Text>
          <Text style={styles.elevatorDetail}>
            {elevator.ulica} • {elevator.mjesto}
          </Text>
        </View>

        {/* Offline warning */}
        {!online && (
          <View style={styles.offlineWarning}>
            <Ionicons name="warning" size={20} color="#ef4444" />
            <Text style={styles.offlineText}>
              Za logiranje servisa morate biti online
            </Text>
          </View>
        )}

        {/* Datum servisa */}
        <View style={styles.section}>
          <Text style={styles.label}>Datum servisa</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="calendar-outline" size={20} color="#666" />
            <Text style={styles.dateText}>
              {formData.serviceDate.toLocaleDateString('hr-HR')}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={formData.serviceDate}
              mode="date"
              display="default"
              onChange={(e, date) => handleDateChange(e, date, 'serviceDate')}
            />
          )}
        </View>

        {/* Opis */}
        <View style={styles.section}>
          <Text style={styles.label}>Opis servisa *</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={formData.opis}
            onChangeText={(text) => setFormData(prev => ({ ...prev, opis: text }))}
            placeholder="Opišite što je napravljeno..."
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Checklist */}
        <View style={styles.section}>
          <Text style={styles.label}>Checklist</Text>
          <View style={styles.checklist}>
            {checklistItems.map(item => (
              <TouchableOpacity
                key={item.key}
                style={styles.checklistItem}
                onPress={() => toggleChecklistItem(item.key)}
              >
                <View style={styles.checkbox}>
                  {checklist[item.key] && (
                    <Ionicons name="checkmark" size={18} color="#10b981" />
                  )}
                </View>
                <Text style={styles.checklistLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Napomene */}
        <View style={styles.section}>
          <Text style={styles.label}>Napomene</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={formData.napomene}
            onChangeText={(text) => setFormData(prev => ({ ...prev, napomene: text }))}
            placeholder="Dodatne napomene..."
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Sljedeći servis */}
        <View style={styles.section}>
          <Text style={styles.label}>Sljedeći servis</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="calendar-outline" size={20} color="#666" />
            <Text style={styles.dateText}>
              {formData.nextServiceDate.toLocaleDateString('hr-HR')}
            </Text>
          </TouchableOpacity>
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
              <Ionicons name="checkmark-circle" size={24} color="#fff" />
              <Text style={styles.submitButtonText}>Logiraj servis</Text>
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
  elevatorInfo: {
    backgroundColor: '#fff',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  elevatorName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 5,
  },
  elevatorDetail: {
    fontSize: 14,
    color: '#666',
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
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 10,
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
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    gap: 10,
  },
  dateText: {
    fontSize: 16,
    color: '#1f2937',
  },
  checklist: {
    gap: 12,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklistLabel: {
    fontSize: 16,
    color: '#1f2937',
  },
  submitButton: {
    backgroundColor: '#10b981',
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

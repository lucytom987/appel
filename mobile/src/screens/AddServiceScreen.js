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
import DateTimePicker from '@react-native-community/datetimepicker';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '../context/AuthContext';
import { serviceDB, elevatorDB } from '../database/db';
import { servicesAPI } from '../services/api';

export default function AddServiceScreen({ navigation, route }) {
  const { elevator } = route.params || {};
  if (!elevator) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#1f2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Novi servis</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ padding:20 }}>
          <Text style={{ fontSize:16, color:'#6b7280' }}>Dizalo je obrisano ili nedostupno. Vratite se i odaberite drugo.</Text>
        </View>
      </View>
    );
  }
  const { user, isOnline } = useAuth();
  const [isOfflineDemo, setIsOfflineDemo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [applyToAll, setApplyToAll] = useState(false);

  // Konvertiraj isOnline u boolean
  const online = Boolean(isOnline);

  React.useEffect(() => {
    (async () => {
      const token = await SecureStore.getItemAsync('userToken');
      setIsOfflineDemo(Boolean(token && token.startsWith('offline_token_')));
    })();
  }, []);

  const elevatorsOnAddress = React.useMemo(() => {
    const all = elevatorDB.getAll() || [];
    const street = (elevator?.ulica || '').trim().toLowerCase();
    const city = (elevator?.mjesto || '').trim().toLowerCase();
    return all.filter((e) =>
      (e.ulica || '').trim().toLowerCase() === street &&
      (e.mjesto || '').trim().toLowerCase() === city
    );
  }, [elevator]);

  // Izračunaj interval servisa u mjesecima (default 1 ako nije postavljen)
  const intervalMjeseci = typeof elevator.intervalServisa === 'number' && elevator.intervalServisa > 0
    ? elevator.intervalServisa
    : 1;

  const [formData, setFormData] = useState({
    serviceDate: new Date(),
    napomene: '',
    nextServiceDate: (() => {
      const d = new Date();
      d.setMonth(d.getMonth() + intervalMjeseci);
      return d;
    })(),
  });

  const [checklist, setChecklist] = useState({
    lubrication: false,
    upsCheck: false,
    voiceComm: false,
    shaftCleaning: false,
    driveCheck: false,
    brakeCheck: false,
    cableInspection: false,
  });

  const checklistItems = [
    { key: 'lubrication', label: 'Podmazivanje' },
    { key: 'upsCheck', label: 'Provjera UPS-a' },
    { key: 'voiceComm', label: 'Govorna veza' },
    { key: 'shaftCleaning', label: 'Čišćenje šahta' },
    { key: 'driveCheck', label: 'Provjera pog. stroja' },
    { key: 'brakeCheck', label: 'Provjera kočnice' },
    { key: 'cableInspection', label: 'Inspekcija užeta' },
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
      if (field === 'serviceDate') {
        // Automatski izračunaj sljedeći servis na temelju intervala
        const next = new Date(selectedDate);
        next.setMonth(next.getMonth() + intervalMjeseci);
        setFormData(prev => ({
          ...prev,
          serviceDate: selectedDate,
          nextServiceDate: next
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          [field]: selectedDate
        }));
      }
    }
  };

  const handleSubmit = async () => {
    // Nema obaveznog opisa – redovni servis

    setLoading(true);

    try {
      const targets = applyToAll && elevatorsOnAddress.length > 1 ? elevatorsOnAddress : [elevator];
      let successCount = 0;
      let failCount = 0;

      const serviceData = {
        serviserID: user._id,
        datum: formData.serviceDate.toISOString(),
        napomene: formData.napomene,
        imaNedostataka: false,
        nedostaci: [],
        sljedeciServis: formData.nextServiceDate.toISOString(),
        checklist: [
          { stavka: 'lubrication', provjereno: checklist.lubrication ? 1 : 0, napomena: '' },
          { stavka: 'ups_check', provjereno: checklist.upsCheck ? 1 : 0, napomena: '' },
          { stavka: 'voice_comm', provjereno: checklist.voiceComm ? 1 : 0, napomena: '' },
          { stavka: 'shaft_cleaning', provjereno: checklist.shaftCleaning ? 1 : 0, napomena: '' },
          { stavka: 'drive_check', provjereno: checklist.driveCheck ? 1 : 0, napomena: '' },
          { stavka: 'brake_check', provjereno: checklist.brakeCheck ? 1 : 0, napomena: '' },
          { stavka: 'cable_inspection', provjereno: checklist.cableInspection ? 1 : 0, napomena: '' },
        ],
      };

      // Provjeri je li offline korisnik (demo korisnik)
      const token = await SecureStore.getItemAsync('userToken');
      const isOfflineUser = token && token.startsWith('offline_token_');

      if (isOfflineUser || !online) {
        console.log('📱 Demo/offline korisnik - dodajem servise lokalno bez API poziva');
        targets.forEach((target, idx) => {
          const localId = 'local_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substr(2, 9);
          const payload = { ...serviceData, elevatorId: target._id || target.id };
          serviceDB.insert({ id: localId, ...payload, synced: 0 });
          try {
            const elev = elevatorDB.getById(target._id || target.id);
            if (elev) {
              elevatorDB.update(elev.id, { ...elev, zadnjiServis: payload.datum, sljedeciServis: payload.sljedeciServis });
            }
          } catch {}
          successCount++;
        });

        Alert.alert('Uspjeh', `Servisi dodani lokalno za ${successCount}/${targets.length} dizala (sinkronizacija kad budete online)`, [
          { text: 'OK', onPress: () => navigation.navigate('Home') }
        ]);
      } else {
        for (const target of targets) {
          const payload = { ...serviceData, elevatorId: target._id || target.id };
          try {
            const response = await servicesAPI.create(payload);
            const created = response.data?.data || response.data;
            serviceDB.insert({
              id: created._id || created.id,
              elevatorId: created.elevatorId || created.elevator || payload.elevatorId,
              serviserID: created.serviserID || created.performedBy || payload.serviserID,
              datum: created.datum || created.serviceDate || payload.datum,
              checklist: created.checklist || payload.checklist,
              imaNedostataka: created.imaNedostataka ?? payload.imaNedostataka,
              nedostaci: created.nedostaci || payload.nedostaci,
              napomene: created.napomene ?? created.notes ?? payload.napomene,
              sljedeciServis: created.sljedeciServis || created.nextServiceDate || payload.sljedeciServis,
              kreiranDatum: created.kreiranDatum || new Date().toISOString(),
              azuriranDatum: created.azuriranDatum || new Date().toISOString(),
              synced: 1,
            });

            try {
              const elev = elevatorDB.getById(payload.elevatorId);
              if (elev) {
                elevatorDB.update(elev.id, { ...elev, zadnjiServis: payload.datum, sljedeciServis: payload.sljedeciServis });
              }
            } catch {}

            successCount++;
          } catch (error) {
            console.error('Greška pri slanju na backend:', error);
            if (error.response?.status === 401) {
              throw new Error('Vaša prijava je istekla. Molim prijavite se ponovno.');
            }
            const localId = 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            serviceDB.insert({ id: localId, ...payload, synced: 0 });
            try {
              const elev = elevatorDB.getById(payload.elevatorId);
              if (elev) {
                elevatorDB.update(elev.id, { ...elev, zadnjiServis: payload.datum, sljedeciServis: payload.sljedeciServis });
              }
            } catch {}
            failCount++;
          }
        }

        Alert.alert(
          failCount === 0 ? 'Uspjeh' : 'Djelomični uspjeh',
          failCount === 0
            ? `Servisi logirani za ${successCount}/${targets.length} dizala.`
            : `Logirano ${successCount}/${targets.length}, ${failCount} spremljeno lokalno (sync kasnije).`,
          [{ text: 'OK', onPress: () => navigation.navigate('Home') }]
        );
      }

    } catch (error) {
      console.error('Greška pri logranju servisa:', error);
      Alert.alert('Greška', error.message || error.response?.data?.message || 'Nije moguće logirati servis');
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
        <Text style={styles.headerTitle}>Novi servis</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={100}
      >
        <ScrollView style={styles.content}>
        {/* Informacije o dizalu */}
        <View style={styles.elevatorInfo}>
          <Text style={styles.elevatorName}>{elevator?.brojDizala || '?'} - {elevator?.nazivStranke || 'Nepoznato'}</Text>
          <Text style={styles.elevatorDetail}>
            {(elevator?.ulica || '')} • {(elevator?.mjesto || '')}
          </Text>
        </View>

        {/* Offline warning */}
        {!online && !isOfflineDemo && (
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

        {/* Opis servisa uklonjen - servis je uvijek redovni */}

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

        {elevatorsOnAddress.length > 1 && (
          <View style={styles.section}>
            <TouchableOpacity style={styles.multiToggle} onPress={() => setApplyToAll(!applyToAll)}>
              <Ionicons name={applyToAll ? 'checkbox' : 'square-outline'} size={22} color={applyToAll ? '#2563eb' : '#6b7280'} />
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Dodaj za sva dizala na adresi</Text>
                <Text style={styles.helperText}>{elevatorsOnAddress.length} dizala na {elevator.ulica}, {elevator.mjesto}</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

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
          style={[styles.submitButton, (loading || (!online && !isOfflineDemo)) && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading || (!online && !isOfflineDemo)}
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
      </KeyboardAvoidingView>
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

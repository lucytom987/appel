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
import { useAuth } from '../context/AuthContext';
import { repairDB } from '../database/db';
import { repairsAPI } from '../services/api';

export default function AddRepairScreen({ navigation, route }) {
  const { elevator } = route.params || {};
  const { user, isOnline } = useAuth();
  const [isOfflineDemo, setIsOfflineDemo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isTrebaloBi, setIsTrebaloBi] = useState(false);

  // Konvertiraj isOnline u boolean
  const online = Boolean(isOnline);

  // Detektiraj offline demo token da omogući lokalni unos
  React.useEffect(() => {
    (async () => {
      const token = await SecureStore.getItemAsync('userToken');
      setIsOfflineDemo(Boolean(token && token.startsWith('offline_token_')));
    })();
  }, []);

  const [selectedElevator] = useState(() => elevator || null);

  const [formData, setFormData] = useState({
    reportedDate: new Date(),
    opis: '',
    primioPoziv: '',
    pozivatelj: '',
    pozivateljTelefon: '',
  });

  // Prefill reporter/contact from logged-in user for convenience
  const defaultReporter = React.useMemo(() => {
    if (!user) return { name: '', phone: '' };
    const name = `${user.ime || user.firstName || ''} ${user.prezime || user.lastName || ''}`.trim() || user.name || user.fullName || '';
    const phone = user.telefon || user.phone || '';
    return { name, phone };
  }, [user]);

  React.useEffect(() => {
    if (!defaultReporter.name && !defaultReporter.phone) return;
    setFormData((prev) => ({
      ...prev,
      primioPoziv: prev.primioPoziv || defaultReporter.name,
      pozivateljTelefon: prev.pozivateljTelefon || '',
    }));
  }, [defaultReporter.name, defaultReporter.phone]);

  // Kada se odabere "Trebalo bi", auto-popuni tko prijavljuje
  React.useEffect(() => {
    if (!isTrebaloBi) return;
    if (!defaultReporter.name) return;
    setFormData((prev) => ({
      ...prev,
      pozivatelj: prev.pozivatelj || defaultReporter.name,
      primioPoziv: prev.primioPoziv || defaultReporter.name,
    }));
  }, [isTrebaloBi, defaultReporter.name]);

  if (!selectedElevator && elevators.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#1f2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Novi popravak</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ padding:20 }}>
          <Text style={{ fontSize:16, color:'#6b7280' }}>Nema učitanih dizala. Sinkronizirajte podatke i pokušajte ponovno.</Text>
        </View>
      </View>
    );
  }

  const handleSubmit = async () => {
    if (!selectedElevator) {
      Alert.alert('Greška', 'Odaberite dizalo');
      return;
    }

    if (!formData.opis.trim()) {
      Alert.alert('Greška', 'Molim unesite opis kvara');
      return;
    }

    setLoading(true);

    try {
      const receiverName = formData.primioPoziv?.trim() || defaultReporter.name;
      const reporterName = formData.pozivatelj?.trim() || '';
      const reporterPhone = formData.pozivateljTelefon?.trim() || '';
      const serviserId = user?._id || user?.id;
      const repairData = {
        elevatorId: selectedElevator._id || selectedElevator.id,
        serviserID: serviserId,
        datumPrijave: (formData.reportedDate || new Date()).toISOString(),
        datumPopravka: null,
        opisKvara: formData.opis,
        opisPopravka: '',
        status: 'pending',
        radniNalogPotpisan: false,
        popravkaUPotpunosti: false,
        napomene: '',
        prijavio: reporterName,
        kontaktTelefon: reporterPhone,
        primioPoziv: receiverName,
        trebaloBi: isTrebaloBi,
      };

      // Provjeri je li offline korisnik (demo korisnik)
      const token = await SecureStore.getItemAsync('userToken');
      const isOfflineUser = token && token.startsWith('offline_token_');

      if (isOfflineUser || !online) {
        // Offline korisnik - spremi samo lokalno
        console.log('📱 Demo/offline korisnik - dodajem popravak lokalno bez API poziva');
        repairDB.insert({
          id: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          ...repairData,
          synced: 0, // Bit će syncirano kada se prijavi s pravim korisnicima
        });

        Alert.alert('Prijavljeno', 'Prijava kvara je spremljena lokalno', [
          { text: 'OK', onPress: () => navigation.navigate('Repairs') }
        ]);
      } else {
        // Online s pravim korisničkim tokenom - spremi na backend
        try {
          const response = await repairsAPI.create(repairData);

          // Spremi u lokalnu bazu (osiguraj "trebalo bi" flag i offline kompatibilnost)
          const created = response.data?.data || response.data || {};
          repairDB.insert({
            id: created._id || created.id,
            ...created,
            trebaloBi: typeof created.trebaloBi === 'boolean' ? created.trebaloBi : isTrebaloBi,
            synced: true,
          });

          Alert.alert('Prijavljeno', 'Prijava kvara je uspješno poslana', [
            { text: 'OK', onPress: () => navigation.navigate('Repairs') }
          ]);
        } catch (error) {
          console.error('Greška pri slanju na backend:', error);
          if (error.response?.status === 401) {
            throw new Error('Vaša prijava je istekla. Molim prijavite se ponovno.');
          }
          // Fallback na lokalnu bazu
          console.log('⚠️ Backend greška - fallback na lokalnu bazu');
          repairDB.insert({
            id: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            ...repairData,
            synced: 0,
          });

          Alert.alert('Prijavljeno', 'Kvar je spremljen lokalno (sync kad budete online)', [
            { text: 'OK', onPress: () => navigation.navigate('Repairs') }
          ]);
        }
      }

    } catch (error) {
      console.error('Greška pri logranju popravka:', error);
      Alert.alert('Greška', error.message || error.response?.data?.message || 'Nije moguće logirati popravak');
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
          <Text style={styles.headerTitle}>{isTrebaloBi ? 'Nova stavka "Trebalo bi"' : 'Novi hitni popravak'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={100}
      >
        <ScrollView style={styles.content}>
        {/* Vrsta prijave: popravak ili "trebalo bi" */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.typeToggle, !isTrebaloBi && styles.typeToggleActive]}
            onPress={() => setIsTrebaloBi(false)}
            activeOpacity={0.8}
          >
            <Text style={[styles.typeToggleText, !isTrebaloBi && styles.typeToggleTextActive]}>
              Popravak
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeToggle, isTrebaloBi && styles.typeToggleActiveAlt]}
            onPress={() => setIsTrebaloBi(true)}
            activeOpacity={0.8}
          >
            <Text style={[styles.typeToggleText, isTrebaloBi && styles.typeToggleTextActiveAlt]}>
              Trebalo bi
            </Text>
          </TouchableOpacity>
        </View>

        {/* Offline warning */}
        {!online && !isOfflineDemo && (
          <View style={styles.offlineWarning}>
            <Ionicons name="warning" size={20} color="#ef4444" />
            <Text style={styles.offlineText}>
              Za logiranje popravaka morate biti online
            </Text>
          </View>
        )}

        {/* Opis kvara */}
        <View style={styles.section}>
          <Text style={styles.label}>{isTrebaloBi ? 'Opis problema *' : 'Opis kvara *'}</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={formData.opis}
            onChangeText={(text) => setFormData(prev => ({ ...prev, opis: text }))}
            placeholder={isTrebaloBi ? 'Što treba napraviti / nabaviti...' : 'Detaljno opišite kvar...'}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          {isTrebaloBi && !!defaultReporter.name && (
            <Text style={styles.helperText}>
              Prijavljuje: {defaultReporter.name}
            </Text>
          )}
        </View>

        {/* Pozivatelj */}
        <View style={styles.section}>
          <Text style={styles.label}>Pozivatelj</Text>
          <TextInput
            style={styles.input}
            value={formData.pozivatelj}
            onChangeText={(text) => setFormData(prev => ({ ...prev, pozivatelj: text }))}
            placeholder="Ime i prezime pozivatelja"
            placeholderTextColor="#9ca3af"
          />
          <TextInput
            style={[styles.input, { marginTop: 10 }]}
            value={formData.pozivateljTelefon}
            onChangeText={(text) => setFormData(prev => ({ ...prev, pozivateljTelefon: text }))}
            placeholder="Telefon pozivatelja"
            placeholderTextColor="#9ca3af"
            keyboardType="phone-pad"
          />
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
              <Text style={styles.submitButtonText}>{isTrebaloBi ? 'Spremi "trebalo bi"' : 'Logiraj popravak'}</Text>
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
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
    padding: 20,
    paddingBottom: 10,
  },
  typeToggle: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  typeToggleActive: {
    backgroundColor: '#dcfce7',
    borderColor: '#10b981',
  },
  typeToggleActiveAlt: {
    backgroundColor: '#ffedd5',
    borderColor: '#f59e0b',
  },
  typeToggleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4b5563',
  },
  typeToggleTextActive: {
    color: '#065f46',
  },
  typeToggleTextActiveAlt: {
    color: '#b45309',
  },
  helperText: {
    marginTop: 8,
    fontSize: 12,
    color: '#6b7280',
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    color: '#1f2937',
  },
  readonlyInput: {
    backgroundColor: '#f3f4f6',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  submitButton: {
    backgroundColor: '#b91c1c',
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

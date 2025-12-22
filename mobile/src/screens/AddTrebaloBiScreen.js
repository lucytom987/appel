import React, { useEffect, useMemo, useState } from 'react';
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

export default function AddTrebaloBiScreen({ navigation, route }) {
  const { elevator } = route.params || {};
  const { user, isOnline } = useAuth();
  const [loading, setLoading] = useState(false);
  const [isOfflineDemo, setIsOfflineDemo] = useState(false);

  // Offline demo flag
  useEffect(() => {
    (async () => {
      const token = await SecureStore.getItemAsync('userToken');
      setIsOfflineDemo(Boolean(token && token.startsWith('offline_token_')));
    })();
  }, []);

  const defaultReporter = useMemo(() => {
    if (!user) return { name: '', phone: '' };
    const name = `${user.ime || user.firstName || ''} ${user.prezime || user.lastName || ''}`.trim() || user.name || user.fullName || '';
    return { name };
  }, [user]);

  const [formData, setFormData] = useState({
    opis: '',
  });

  useEffect(() => {
    if (!defaultReporter.name) return;
    setFormData((prev) => ({
      ...prev,
      // auto-populate silently
      prijavio: prev.prijavio || defaultReporter.name,
    }));
  }, [defaultReporter.name]);

  const handleSubmit = async () => {
    if (!elevator) {
      Alert.alert('Greska', 'Nedostaje dizalo za ovu stavku.');
      return;
    }
    if (!formData.opis.trim()) {
      Alert.alert('Greska', 'Molim unesite opis stavke.');
      return;
    }

    setLoading(true);

    try {
      const repairData = {
        elevatorId: elevator._id || elevator.id,
        serviserID: user?._id || user?.id,
        datumPrijave: new Date().toISOString(),
        datumPopravka: null,
        opisKvara: formData.opis,
        opisPopravka: '',
        status: 'pending',
        radniNalogPotpisan: false,
        popravkaUPotpunosti: false,
        napomene: '',
        prijavio: formData.prijavio?.trim() || defaultReporter.name,
        primioPoziv: formData.prijavio?.trim() || defaultReporter.name,
        trebaloBi: true,
      };

      const token = await SecureStore.getItemAsync('userToken');
      const isOfflineUser = token && token.startsWith('offline_token_');
      const online = Boolean(isOnline);

      if (isOfflineUser || !online) {
        repairDB.insert({
          id: 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          ...repairData,
          synced: 0,
        });
        Alert.alert('Spremljeno', 'Stavka je spremljena lokalno', [
          { text: 'OK', onPress: () => navigation.navigate('Repairs') },
        ]);
      } else {
        const response = await repairsAPI.create(repairData);
        const created = response.data?.data || response.data || {};
        repairDB.insert({
          id: created._id || created.id,
          ...created,
          trebaloBi: true,
          synced: 1,
        });
        Alert.alert('Spremljeno', 'Stavka "trebalo bi" je poslana', [
          { text: 'OK', onPress: () => navigation.navigate('Repairs') },
        ]);
      }
    } catch (error) {
      console.error('Greska pri spremanju "trebalo bi":', error);
      Alert.alert('Greska', error.message || error.response?.data?.message || 'Nije moguce spremiti stavku');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nova stavka "trebalo bi"</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={100}
      >
        <ScrollView style={styles.content}>
          {!isOnline && !isOfflineDemo && (
            <View style={styles.offlineWarning}>
              <Ionicons name="warning" size={20} color="#ef4444" />
              <Text style={styles.offlineText}>
                Bez mreze se zapis sprema samo lokalno
              </Text>
            </View>
          )}

          <View style={[styles.section, styles.card]}>
            <Text style={styles.label}>Opis *</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.opis}
              onChangeText={(text) => setFormData((prev) => ({ ...prev, opis: text }))}
              placeholder='Sto bi trebalo odraditi ili nabaviti...'
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Reporter is auto-filled from user context; no manual input to keep UI minimal */}

          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="bulb" size={22} color="#fff" />
                <Text style={styles.submitButtonText}>Spremi "trebalo bi"</Text>
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
    fontWeight: '700',
    color: '#1f2937',
  },
  content: {
    flex: 1,
  },
  section: {
    backgroundColor: '#fff',
    padding: 20,
    marginTop: 15,
  },
  card: {
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
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
    color: '#1f2937',
    borderRadius: 10,
    padding: 12,
  },
  textArea: {
    minHeight: 220,
    paddingTop: 12,
  },
  submitButton: {
    backgroundColor: '#f59e0b',
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
    backgroundColor: '#fbbf24',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  offlineWarning: {
    backgroundColor: '#fffbeb',
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#fef3c7',
  },
  offlineText: {
    flex: 1,
    fontSize: 14,
    color: '#b45309',
  },
});

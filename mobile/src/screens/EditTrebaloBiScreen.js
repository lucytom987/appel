import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { repairDB } from '../database/db';
import { repairsAPI } from '../services/api';
import { useFocusEffect } from '@react-navigation/native';
import ms from '../utils/scale';

export default function EditTrebaloBiScreen({ route, navigation }) {
  const { repair } = route.params || {};
  const { user, isOnline, serverAwake } = useAuth();
  const userRole = ((user?.uloga || user?.role || '') || '').toLowerCase();
  const canDelete = userRole === 'admin' || userRole === 'menadzer' || userRole === 'manager';

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        navigation.navigate('TrebaloBiDetails', { repair });
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation, repair])
  );

  const baseRepair = useMemo(() => {
    const id = repair?._id || repair?.id;
    if (!id) return repair || {};
    try {
      const fresh = repairDB.getById(id);
      return fresh ? { ...repair, ...fresh } : repair;
    } catch (e) {
      console.log('Ne mogu ucitati "trebalo bi":', e?.message);
      return repair;
    }
  }, [repair]);

  const [form, setForm] = useState(() => ({
    opisKvara: baseRepair.opisKvara || '',
  }));

  const [saving, setSaving] = useState(false);

  const handleDelete = () => {
    if (!canDelete) {
      Alert.alert('Nedovoljno prava', 'Samo administratori ili menadžeri mogu brisati zapise.');
      return;
    }
    const id = baseRepair?._id || baseRepair?.id;
    if (!id) {
      Alert.alert('Greska', 'Nije moguce obrisati zapis.');
      return;
    }
    Alert.alert('Brisanje', 'Zelite li obrisati ovu stavku?', [
      { text: 'Odustani', style: 'cancel' },
      {
        text: 'Obrisi',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            const online = Boolean(isOnline && serverAwake);
            if (online && !String(id).startsWith('local_')) {
              try {
                await repairsAPI.delete(id);
              } catch (err) {
                const status = err?.response?.status || err?.status;
                if (status && status !== 404) {
                  throw err;
                }
              }
            }
            repairDB.delete(id);
            Alert.alert('Obrisano', 'Stavka je uklonjena', [
              { text: 'OK', onPress: () => navigation.navigate('Repairs') },
            ]);
          } catch (e) {
            Alert.alert('Greska', e?.message || 'Brisanje nije uspjelo');
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const handleSave = async () => {
    const id = baseRepair._id || baseRepair.id;
    if (!id) {
      Alert.alert('Greska', 'Nedostaje ID zapisa.');
      return;
    }
    if (!form.opisKvara.trim()) {
      Alert.alert('Greska', 'Opis je obavezan.');
      return;
    }

    const payload = {
      opisKvara: form.opisKvara,
      napomene: baseRepair.napomene || '',
      prijavio: baseRepair.prijavio,
      kontaktTelefon: baseRepair.kontaktTelefon,
      status: baseRepair.status || 'pending',
      trebaloBi: true,
    };

    const merged = { ...baseRepair, ...payload, synced: 0, sync_status: 'dirty', updated_at: Date.now() };

    setSaving(true);
    try {
      const online = Boolean(isOnline && serverAwake);
      if (online) {
        const res = await repairsAPI.update(id, payload);
        const updated = res.data?.data || res.data || {};
        repairDB.update(id, { ...merged, ...updated, synced: 1, sync_status: 'synced' });
      } else {
        repairDB.update(id, merged);
      }
      Alert.alert('Spremljeno', 'Promjene su spremljene', [
        { text: 'OK', onPress: () => navigation.navigate('TrebaloBiDetails', { repair: merged }) },
      ]);
    } catch (e) {
      console.log('Greska pri spremanju "trebalo bi":', e?.message);
      repairDB.update(id, merged);
      Alert.alert('Spremanje lokalno', 'Promjene su snimljene lokalno i cekaju sync.', [
        { text: 'OK', onPress: () => navigation.navigate('TrebaloBiDetails', { repair: merged }) },
      ]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('TrebaloBiDetails', { repair })}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Uredi "trebalo bi"</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <ScrollView
          style={styles.content}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          <View style={styles.card}>
            <Text style={styles.label}>Opis *</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={form.opisKvara}
              onChangeText={(text) => setForm((prev) => ({ ...prev, opisKvara: text }))}
              placeholder="Sto treba odraditi..."
              multiline
            />
          </View>

          <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
            <Ionicons name="save-outline" size={18} color="#fff" />
            <Text style={styles.saveButtonText}>{saving ? 'Spremam...' : 'Spremi'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.deleteButton, saving && styles.saveButtonDisabled]}
            onPress={handleDelete}
            disabled={saving}
          >
            <Ionicons name="trash-outline" size={18} color="#fff" />
            <Text style={styles.saveButtonText}>Obrisi</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#fff', paddingTop: ms(50), paddingBottom: ms(15), paddingHorizontal: ms(20), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e5e5e5' },
  headerTitle: { fontSize: ms(18), fontWeight: '700', color: '#1f2937' },
  content: { flex: 1 },
  card: { backgroundColor: '#fff', padding: ms(16), marginTop: ms(12), borderRadius: ms(12), shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2, marginHorizontal: ms(12) },
  label: { fontSize: ms(14), fontWeight: '700', color: '#1f2937', marginBottom: 8 },
  input: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, color: '#1f2937' },
  textArea: { minHeight: 100, paddingTop: 12 },
  saveButton: {
    backgroundColor: '#2563eb',
    marginHorizontal: ms(20),
    marginTop: ms(20),
    padding: ms(14),
    borderRadius: ms(12),
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
  saveButtonDisabled: { backgroundColor: '#93c5fd' },
  saveButtonText: { fontSize: ms(15), fontWeight: '700', color: '#fff' },
  deleteButton: {
    backgroundColor: '#ef4444',
    marginHorizontal: ms(20),
    marginTop: ms(12),
    padding: ms(14),
    borderRadius: ms(12),
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
});

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
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { elevatorDB, repairDB } from '../database/db';
import { repairsAPI } from '../services/api';
import ms from '../utils/scale';
import { useFocusEffect } from '@react-navigation/native';

function formatName(person) {
  if (!person) return '';
  const full = `${person.ime || person.firstName || person.name || person.fullName || ''} ${person.prezime || person.lastName || ''}`.trim();
  return full || person.email || '';
}

const confirmDelete = (baseRepair, navigation, setSaving, isOnline) => {
  const id = baseRepair?._id || baseRepair?.id;
  if (!id) {
    Alert.alert('Greska', 'Nije moguce obrisati zapis.');
    return;
  }

  Alert.alert('Brisanje popravka', 'Zelite li obrisati ovaj popravak?', [
    { text: 'Odustani', style: 'cancel' },
    {
      text: 'Obrisi',
      style: 'destructive',
      onPress: async () => {
        setSaving(true);
        try {
          const online = Boolean(isOnline);
          if (online) {
            try {
              await repairsAPI.delete(id);
              repairDB.delete(id);
              Alert.alert('Obrisano', 'Popravak je obrisan', [
                { text: 'OK', onPress: () => navigation.navigate('Repairs') },
              ]);
              return;
            } catch (err) {
              const status = err?.response?.status || err?.status;
              if (status === 404) {
                repairDB.delete(id);
                Alert.alert('Info', 'Popravak je već obrisan na serveru. Uklonjeno lokalno.', [
                  { text: 'OK', onPress: () => navigation.navigate('Repairs') },
                ]);
                return;
              }
              console.log('Skip remote delete', err?.message);
            }
          }
          // Offline ili mrežna greška – označi za brisanje lokalno
          repairDB.delete(id);
          Alert.alert('Spremljeno lokalno', 'Popravak je označen za brisanje i čeka sync.', [
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

export default function EditRepairScreen({ route, navigation }) {
  const { repair } = route.params;
  const { user, isOnline } = useAuth();

  // Hardverski back vraća na detalje popravka
  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        navigation.navigate('RepairDetails', { repair });
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation, repair])
  );

  // Učitaj svježi zapis ako postoji u lokalnoj bazi
  const baseRepair = useMemo(() => {
    const id = repair?._id || repair?.id;
    if (!id) return repair || {};
    try {
      const fresh = repairDB.getById(id);
      return fresh ? { ...repair, ...fresh } : repair;
    } catch (e) {
      console.log('Ne mogu učitati popravak iz baze:', e?.message);
      return repair;
    }
  }, [repair]);

  const elevatorId = (typeof baseRepair.elevatorId === 'object' && baseRepair.elevatorId !== null)
    ? (baseRepair.elevatorId._id || baseRepair.elevatorId.id)
    : baseRepair.elevatorId;
  const elevator = elevatorDB.getById(elevatorId);

  const [showDateReported, setShowDateReported] = useState(false);
  const [showDateRepaired, setShowDateRepaired] = useState(false);
  const [saving, setSaving] = useState(false);

  const parseDate = (val) => {
    if (!val) return null;
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const [form, setForm] = useState(() => ({
    datumPrijave: parseDate(baseRepair.datumPrijave) || new Date(),
    datumPopravka: parseDate(baseRepair.datumPopravka),
    prijavio: baseRepair.prijavio || '',
    kontaktTelefon: baseRepair.kontaktTelefon || '',
    primioPoziv: baseRepair.primioPoziv || formatName(user) || '',
  }));

  const [showingSaveHint, setShowingSaveHint] = useState(false);

  const onChangeDate = (key, event, selected) => {
    if (key === 'datumPrijave') setShowDateReported(false);
    if (key === 'datumPopravka') setShowDateRepaired(false);
    if (selected) {
      setForm((prev) => ({ ...prev, [key]: selected }));
    }
  };

  const formatDate = (date) => date ? date.toLocaleString('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Nije postavljeno';

    const handleSave = async () => {
    setSaving(true);
    const id = baseRepair._id || baseRepair.id;
    const payload = {
      datumPrijave: form.datumPrijave ? form.datumPrijave.toISOString() : null,
      datumPopravka: form.datumPopravka ? form.datumPopravka.toISOString() : null,
      status: baseRepair.status,
      opisKvara: baseRepair.opisKvara,
      opisPopravka: baseRepair.opisPopravka,
      napomene: baseRepair.napomene,
      prijavio: form.prijavio,
      kontaktTelefon: form.kontaktTelefon,
      primioPoziv: form.primioPoziv,
      radniNalogPotpisan: baseRepair.radniNalogPotpisan,
      popravkaUPotpunosti: baseRepair.popravkaUPotpunosti,
    };

    const merged = { ...baseRepair, ...payload, synced: 0, sync_status: 'dirty', updated_at: Date.now() };

    try {
      const online = Boolean(isOnline);
      if (!online) {
        repairDB.update(id, merged);
        setShowingSaveHint(true);
      } else {
        const res = await repairsAPI.update(id, payload);
        const updated = res.data?.data || res.data || {};
        repairDB.update(id, { ...merged, ...updated, synced: 1, sync_status: 'synced' });
      }
    } catch (e) {
      console.log('Backend nedostupan, spremam lokalno', e?.message);
      repairDB.update(id, merged);
      setShowingSaveHint(true);
    } finally {
      setSaving(false);
      Alert.alert('Spremljeno', 'Podaci o popravku su ažurirani', [
        { text: 'OK', onPress: () => navigation.navigate('Repairs') },
      ]);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('RepairDetails', { repair })}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Uredi popravak</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={80}>
        <ScrollView style={styles.content}>
          {elevator && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Dizalo</Text>
              <Text style={styles.elevatorTitle}>{elevator.nazivStranke || ''}</Text>
              <Text style={styles.elevatorDetail}>{elevator.ulica}, {elevator.mjesto}</Text>
              <Text style={styles.elevatorCode}>Dizalo: {elevator.brojDizala}</Text>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Datumi</Text>
            <Text style={styles.label}>Datum prijave</Text>
            <TouchableOpacity style={styles.dateButton} onPress={() => setShowDateReported(true)}>
              <Ionicons name="calendar-outline" size={20} color="#666" />
              <Text style={styles.dateText}>{formatDate(form.datumPrijave)}</Text>
            </TouchableOpacity>
            {showDateReported && (
              <DateTimePicker
                value={form.datumPrijave || new Date()}
                mode="date"
                display="default"
                onChange={(e, d) => onChangeDate('datumPrijave', e, d)}
              />
            )}

            <Text style={[styles.label, { marginTop: 14 }]}>Datum popravka</Text>
            <TouchableOpacity style={styles.dateButton} onPress={() => setShowDateRepaired(true)}>
              <Ionicons name="calendar-outline" size={20} color="#666" />
              <Text style={styles.dateText}>{form.datumPopravka ? formatDate(form.datumPopravka) : 'Nije postavljeno'}</Text>
            </TouchableOpacity>
            {showDateRepaired && (
              <DateTimePicker
                value={form.datumPopravka || new Date()}
                mode="date"
                display="default"
                onChange={(e, d) => onChangeDate('datumPopravka', e, d)}
              />
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Poziv</Text>
            <Text style={styles.label}>Primio poziv</Text>
            <TextInput
              style={styles.input}
              value={form.primioPoziv}
              onChangeText={(text) => setForm((p) => ({ ...p, primioPoziv: text }))}
              placeholder="Ime i prezime"
              placeholderTextColor="#9ca3af"
            />
            <Text style={[styles.label, { marginTop: 12 }]}>Pozivatelj</Text>
            <TextInput
              style={styles.input}
              value={form.prijavio}
              onChangeText={(text) => setForm((p) => ({ ...p, prijavio: text }))}
              placeholder="Ime i prezime pozivatelja"
              placeholderTextColor="#9ca3af"
            />
            <TextInput
              style={[styles.input, { marginTop: 10 }]}
              value={form.kontaktTelefon}
              onChangeText={(text) => setForm((p) => ({ ...p, kontaktTelefon: text }))}
              placeholder="Telefon pozivatelja"
              placeholderTextColor="#9ca3af"
              keyboardType="phone-pad"
            />
          </View>

          {showingSaveHint && (
            <Text style={styles.hintText}>Backend nije bio dostupan, promjene su snimljene lokalno i sinkat će se kasnije.</Text>
          )}

          <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
            <Ionicons name="save" size={20} color="#fff" />
            <Text style={styles.saveButtonText}>{saving ? 'Spremam...' : 'Spremi promjene'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.deleteButton} onPress={() => confirmDelete(baseRepair, navigation, setSaving, isOnline)} disabled={saving}>
            <Ionicons name="trash" size={20} color="#b91c1c" />
            <Text style={styles.deleteButtonText}>Obriši popravak</Text>
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
  headerTitle: { fontSize: ms(19), fontWeight: '700', color: '#1f2937' },
  content: { flex: 1 },
  card: { backgroundColor: '#fff', padding: ms(16), marginTop: ms(12), borderRadius: ms(12), shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  sectionTitle: { fontSize: ms(17), fontWeight: '800', color: '#111827', marginBottom: ms(10) },
  elevatorTitle: { fontSize: ms(16), fontWeight: '700', color: '#111827' },
  elevatorDetail: { fontSize: ms(14), color: '#6b7280', marginTop: ms(2) },
  elevatorCode: { fontSize: ms(14), color: '#374151', marginTop: ms(4), fontWeight: '600' },
  label: { fontSize: ms(14), fontWeight: '600', color: '#1f2937', marginBottom: ms(8) },
  dateButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: ms(8), padding: ms(12), gap: ms(10) },
  dateText: { fontSize: ms(16), color: '#1f2937' },
  input: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: ms(8), padding: ms(12), fontSize: ms(16), color: '#1f2937' },
  hintText: { marginTop: ms(10), marginHorizontal: ms(16), fontSize: ms(13), color: '#6b7280' },
  saveButton: { backgroundColor: '#2563eb', marginHorizontal: ms(16), marginTop: ms(16), padding: ms(16), borderRadius: ms(12), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: ms(8) },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { color: '#fff', fontSize: ms(16), fontWeight: '700' },
  deleteButton: { borderWidth: 1, borderColor: '#fca5a5', backgroundColor: '#fef2f2', marginHorizontal: ms(16), marginTop: ms(12), padding: ms(14), borderRadius: ms(12), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: ms(8) },
  deleteButtonText: { color: '#b91c1c', fontSize: ms(15), fontWeight: '700' },
});




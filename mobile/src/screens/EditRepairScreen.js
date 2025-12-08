import React, { useEffect, useMemo, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { elevatorDB, repairDB } from '../database/db';
import { repairsAPI } from '../services/api';
import ms from '../utils/scale';

const statusOptions = [
  { label: 'Prijavljen', value: 'pending', color: '#ef4444' },
  { label: 'U tijeku', value: 'in_progress', color: '#f59e0b' },
  { label: 'Završeno', value: 'completed', color: '#10b981' },
];

const normalizeStatus = (status) => {
  if (['pending', 'in_progress', 'completed'].includes(status)) return status;
  if (status === 'u tijeku' || status === 'u_tijeku') return 'in_progress';
  if (status === 'završen' || status === 'zavrsen') return 'completed';
  return 'pending';
};

function formatName(person) {
  if (!person) return '';
  const full = `${person.ime || person.firstName || person.name || person.fullName || ''} ${person.prezime || person.lastName || ''}`.trim();
  return full || person.email || '';
}

export default function EditRepairScreen({ route, navigation }) {
  const { repair } = route.params;
  const { user } = useAuth();

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
    status: normalizeStatus(baseRepair.status || 'pending'),
    opisKvara: baseRepair.opisKvara || '',
    opisPopravka: baseRepair.opisPopravka || '',
    napomene: baseRepair.napomene || '',
    prijavio: baseRepair.prijavio || '',
    kontaktTelefon: baseRepair.kontaktTelefon || '',
    primioPoziv: baseRepair.primioPoziv || formatName(user) || '',
    radniNalogPotpisan: Boolean(baseRepair.radniNalogPotpisan),
    popravkaUPotpunosti: Boolean(baseRepair.popravkaUPotpunosti) || normalizeStatus(baseRepair.status) === 'completed',
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
    if (!form.opisKvara.trim()) {
      Alert.alert('Greška', 'Opis kvara je obavezan');
      return;
    }

    setSaving(true);
    const id = baseRepair._id || baseRepair.id;
    const status = normalizeStatus(form.status);
    const payload = {
      datumPrijave: form.datumPrijave ? form.datumPrijave.toISOString() : null,
      datumPopravka: form.datumPopravka ? form.datumPopravka.toISOString() : null,
      status,
      opisKvara: form.opisKvara,
      opisPopravka: form.opisPopravka,
      napomene: form.napomene,
      prijavio: form.prijavio,
      kontaktTelefon: form.kontaktTelefon,
      primioPoziv: form.primioPoziv,
      radniNalogPotpisan: form.radniNalogPotpisan,
      popravkaUPotpunosti: status === 'completed' ? true : Boolean(form.popravkaUPotpunosti),
    };

    // Označi lokalnu izmjenu kao nesinkroniziranu dok backend ne potvrdi
    const merged = { ...baseRepair, ...payload, synced: 0 };

    try {
      const res = await repairsAPI.update(id, payload);
      const updated = res.data?.data || res.data || {};
      repairDB.update(id, { ...merged, ...updated, synced: 1 });
    } catch (e) {
      console.log('⚠️ Backend nedostupan, spremam lokalno', e?.message);
      repairDB.update(id, { ...merged, synced: 0 });
      setShowingSaveHint(true);
    } finally {
      setSaving(false);
      Alert.alert('Spremljeno', 'Podaci o popravku su ažurirani');
      navigation.goBack();
    }
  };

  const toggle = (key) => setForm((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
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
            <Text style={styles.sectionTitle}>Status</Text>
            <View style={styles.statusRow}>
              {statusOptions.map((opt) => {
                const active = form.status === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.statusChip, active && { borderColor: opt.color, backgroundColor: '#fff' }]}
                    onPress={() => setForm((p) => ({ ...p, status: opt.value, popravkaUPotpunosti: opt.value === 'completed' }))}
                  >
                    <Text style={[styles.statusChipText, active && { color: opt.color }]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.toggleRow}>
              <TouchableOpacity style={[styles.toggleButton, form.radniNalogPotpisan && styles.toggleButtonActive]} onPress={() => toggle('radniNalogPotpisan')}>
                <Ionicons name={form.radniNalogPotpisan ? 'checkbox' : 'square-outline'} size={18} color={form.radniNalogPotpisan ? '#10b981' : '#6b7280'} />
                <Text style={styles.toggleText}>Radni nalog potpisan</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.toggleButton, form.popravkaUPotpunosti && styles.toggleButtonActive]} onPress={() => toggle('popravkaUPotpunosti')}>
                <Ionicons name={form.popravkaUPotpunosti ? 'checkbox' : 'square-outline'} size={18} color={form.popravkaUPotpunosti ? '#10b981' : '#6b7280'} />
                <Text style={styles.toggleText}>Popravak u potpunosti</Text>
              </TouchableOpacity>
            </View>
          </View>

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

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Opis kvara</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={form.opisKvara}
              onChangeText={(text) => setForm((p) => ({ ...p, opisKvara: text }))}
              placeholder="Detaljno opišite kvar"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Opis popravka</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={form.opisPopravka}
              onChangeText={(text) => setForm((p) => ({ ...p, opisPopravka: text }))}
              placeholder="Što je rađeno na popravku"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Napomene</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={form.napomene}
              onChangeText={(text) => setForm((p) => ({ ...p, napomene: text }))}
              placeholder="Dodatne napomene"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {showingSaveHint && (
            <Text style={styles.hintText}>Backend nije bio dostupan, promjene su snimljene lokalno i sinkat će se kasnije.</Text>
          )}

          <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
            <Ionicons name="save" size={20} color="#fff" />
            <Text style={styles.saveButtonText}>{saving ? 'Spremam...' : 'Spremi promjene'}</Text>
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
  statusRow: { flexDirection: 'row', gap: ms(10) },
  statusChip: { paddingHorizontal: ms(12), paddingVertical: ms(8), borderRadius: ms(10), borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  statusChipText: { fontSize: ms(15), fontWeight: '700', color: '#6b7280' },
  toggleRow: { flexDirection: 'row', gap: ms(10), marginTop: ms(12), flexWrap: 'wrap' },
  toggleButton: { flexDirection: 'row', alignItems: 'center', gap: ms(8), paddingVertical: ms(10), paddingHorizontal: ms(12), borderRadius: ms(10), borderWidth: 1, borderColor: '#e5e7eb' },
  toggleButtonActive: { borderColor: '#10b981', backgroundColor: '#ecfdf3' },
  toggleText: { fontSize: ms(14), color: '#111827', fontWeight: '600' },
  label: { fontSize: ms(14), fontWeight: '600', color: '#1f2937', marginBottom: ms(8) },
  dateButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: ms(8), padding: ms(12), gap: ms(10) },
  dateText: { fontSize: ms(16), color: '#1f2937' },
  input: { backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: ms(8), padding: ms(12), fontSize: ms(16), color: '#1f2937' },
  textArea: { minHeight: ms(100), paddingTop: ms(12), textAlignVertical: 'top' },
  hintText: { marginTop: ms(10), marginHorizontal: ms(16), fontSize: ms(13), color: '#6b7280' },
  saveButton: { backgroundColor: '#2563eb', marginHorizontal: ms(16), marginTop: ms(16), padding: ms(16), borderRadius: ms(12), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: ms(8) },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { color: '#fff', fontSize: ms(16), fontWeight: '700' },
});

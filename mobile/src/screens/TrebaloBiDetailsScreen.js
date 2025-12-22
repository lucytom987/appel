import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, BackHandler } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { elevatorDB, repairDB } from '../database/db';
import { useFocusEffect } from '@react-navigation/native';
import ms from '../utils/scale';

const formatDate = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function TrebaloBiDetailsScreen({ route, navigation }) {
  const { repair } = route.params || {};
  const [data, setData] = useState(repair || {});
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const onBack = () => {
        navigation.navigate('Repairs');
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation])
  );

  // Load fresh copy from local DB if available
  useEffect(() => {
    const id = repair?._id || repair?.id;
    if (!id) return;
    try {
      const fresh = repairDB.getById(id);
      if (fresh) setData((prev) => ({ ...prev, ...fresh }));
    } catch (e) {
      console.log('Ne mogu ucitati "trebalo bi" iz baze:', e?.message);
    }
  }, [repair]);

  const elevatorId = (typeof data.elevatorId === 'object' && data.elevatorId !== null)
    ? (data.elevatorId._id || data.elevatorId.id)
    : data.elevatorId;
  const elevator = elevatorDB.getById(elevatorId) || data.elevatorId || {};

  const opis = typeof data.opisKvara === 'string' ? data.opisKvara : '';
  const prijavio = data.prijavio || '';
  const datumPrijave = data.datumPrijave || data.kreiranDatum || data.datum;
  const resolved = data.status === 'completed';

  const goToElevator = () => {
    if (!elevatorId) {
      Alert.alert('Info', 'Ovaj zapis nema povezano dizalo.');
      return;
    }
    navigation.navigate('ElevatorDetails', { elevator });
  };

  const isPrivreda = elevator?.tip === 'privreda';
  const headerPrimary = isPrivreda
    ? (elevator?.nazivStranke || 'Korisnik')
    : [elevator?.ulica, elevator?.mjesto].filter(Boolean).join(', ') || 'Adresa nedostaje';
  const headerSecondary = isPrivreda
    ? [elevator?.ulica, elevator?.mjesto].filter(Boolean).join(', ')
    : (elevator?.nazivStranke || '');

  const toggleResolved = async () => {
    const id = data._id || data.id;
    if (!id) return;
    const sanitized = { ...data };
    if (Object.prototype.hasOwnProperty.call(sanitized, 'flag')) {
      delete sanitized.flag;
    }
    const nextStatus = resolved ? 'pending' : 'completed';
    const payload = {
      ...sanitized,
      status: nextStatus,
      azuriranDatum: new Date().toISOString(),
      updated_at: Date.now(),
      sync_status: 'dirty',
      synced: 0,
    };
    setSaving(true);
    try {
      setData(payload);
      repairDB.update(id, payload);
    } catch (e) {
      console.log('Ne mogu promijeniti status:', e?.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.fakeHeader}>
        <TouchableOpacity onPress={() => navigation.navigate('Repairs')} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: ms(40) }}>
        <TouchableOpacity style={styles.heroCard} onPress={goToElevator} activeOpacity={0.9}>
          <View style={styles.heroTitleRow}>
            <Text style={styles.heroTitle} numberOfLines={2}>{headerPrimary}</Text>
          </View>
          {!!headerSecondary && (
            <Text style={styles.heroSubtitle} numberOfLines={2}>{headerSecondary}</Text>
          )}
          <View style={styles.heroMetaRow}>
            <View style={[styles.badge, { borderColor: '#f59e0b' }]}>
              <Text style={styles.badgeText}>{elevator?.brojDizala || 'Dizalo'}</Text>
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="time" size={16} color="#6b7280" />
              <Text style={styles.metaText}>Prijavljeno: {formatDate(datumPrijave)}</Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Opis</Text>
          <Text style={styles.bodyText}>{opis || 'Nema opisa.'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Prijavio</Text>
          <Text style={styles.bodyText}>{prijavio || '-'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Status</Text>
          <TouchableOpacity
            style={[styles.statusToggle, resolved && styles.statusToggleActive]}
            onPress={toggleResolved}
            disabled={saving}
          >
            <Ionicons
              name={resolved ? 'checkbox' : 'square-outline'}
              size={20}
              color={resolved ? '#10b981' : '#6b7280'}
            />
            <Text style={[styles.statusText, resolved && styles.statusTextActive]}>
              {resolved ? 'Riješeno' : 'Nije riješeno'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.editButton]}
            onPress={() => navigation.navigate('EditTrebaloBi', { repair: data })}
          >
            <Ionicons name="create-outline" size={18} color="#2563eb" />
            <Text style={styles.editText}>Uredi</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    backgroundColor: '#fff',
    paddingTop: ms(50),
    paddingBottom: ms(12),
    paddingHorizontal: ms(16),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  content: { flex: 1 },
  fakeHeader: { paddingTop: ms(24), paddingBottom: ms(8), paddingHorizontal: ms(12) },
  backBtn: { padding: 8, alignSelf: 'flex-start' },
  heroCard: {
    backgroundColor: '#fff',
    padding: ms(18),
    marginHorizontal: ms(12),
    marginBottom: ms(14),
    borderRadius: ms(14),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  heroTitle: { fontSize: ms(20), fontWeight: '800', color: '#111827' },
  heroSubtitle: { fontSize: ms(15), color: '#4b5563', marginBottom: 10 },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  badge: {
    paddingHorizontal: ms(14),
    paddingVertical: ms(8),
    borderRadius: ms(12),
    borderWidth: 2,
    backgroundColor: '#fff',
  },
  badgeText: { fontSize: ms(16), fontWeight: '800', color: '#111827' },
  card: {
    backgroundColor: '#fff',
    padding: ms(16),
    marginHorizontal: ms(12),
    marginBottom: ms(12),
    borderRadius: ms(12),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: { fontSize: ms(16), fontWeight: '800', color: '#111827', marginBottom: ms(8) },
  bodyText: { fontSize: ms(14), color: '#111827', lineHeight: 20 },
  subtle: { color: '#6b7280', marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  metaText: { color: '#6b7280', fontSize: 13 },
  statusToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: ms(10),
    paddingHorizontal: ms(12),
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f8fafc',
  },
  statusToggleActive: {
    borderColor: '#10b981',
    backgroundColor: '#ecfdf3',
  },
  statusText: { fontSize: ms(14), color: '#374151', fontWeight: '700' },
  statusTextActive: { color: '#0f5132' },
  buttonRow: { paddingHorizontal: ms(16), marginTop: ms(8) },
  button: {
    height: ms(48),
    borderRadius: ms(12),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  editButton: { backgroundColor: '#e0f2fe', borderWidth: 1, borderColor: '#bfdbfe' },
  editText: { color: '#2563eb', fontSize: ms(15), fontWeight: '700' },
});

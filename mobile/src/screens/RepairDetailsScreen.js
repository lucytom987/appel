import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, BackHandler } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { elevatorDB, repairDB } from '../database/db';
import { repairsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import ms from '../utils/scale';

const statusLabel = (repair) => {
  if (repair.trebaloBi) return 'Trebalo bi';
  if (repair.status === 'completed') return 'Završeno';
  return 'Prijavljen';
};

const statusColor = (repair) => {
  if (repair.trebaloBi) return '#f59e0b';
  if (repair.status === 'completed') return '#10b981';
  return '#ef4444';
};

export default function RepairDetailsScreen({ route, navigation }) {
  const { repair } = route.params;
  const [repairData, setRepairData] = useState(repair);
  const { user, isOnline, serverAwake } = useAuth();
  const online = Boolean(isOnline && serverAwake);

  // Na hardverski back vrati na listu popravaka
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

  // Učitaj svježe podatke iz lokalne baze (uključujući prijavio/kontakt)
  useEffect(() => {
    const id = repair._id || repair.id;
    if (!id) return;
    try {
      const fresh = repairDB.getById(id);
      if (fresh) {
        setRepairData({ ...repair, ...fresh });
      }
    } catch (e) {
      console.log('Ne mogu učitati detalje popravka iz baze:', e?.message);
    }
  }, [repair]);

  const elevatorId = (typeof repairData.elevatorId === 'object' && repairData.elevatorId !== null)
    ? (repairData.elevatorId._id || repairData.elevatorId.id)
    : repairData.elevatorId;
  const elevator = elevatorDB.getById(elevatorId) || repairData.elevatorId || {};

  const [opisKvara, setOpisKvara] = useState(repairData.opisKvara || '');
  const [opisPopravka, setOpisPopravka] = useState(repairData.opisPopravka || '');
  const [isTrebaloBi, setIsTrebaloBi] = useState(
    Boolean(
      repairData.trebaloBi ||
      repairData.trebalo_bi ||
      repairData.category === 'trebaloBi' || repairData.category === 'trebalo_bi' || repairData.category === 'trebalo-bi' || repairData.category === 'trebalo' ||
      repairData.type === 'trebaloBi' || repairData.type === 'trebalo_bi' || repairData.type === 'trebalo-bi' || repairData.type === 'trebalo' ||
      repairData.status === 'in_progress' ||
      repairData.status === 'u tijeku' ||
      repairData.status === 'u_tijeku'
    )
  );
  const [status, setStatus] = useState(repairData.status === 'completed' ? 'completed' : 'pending');
  const [radniNalogPotpisan, setRadniNalogPotpisan] = useState(Boolean(repairData.radniNalogPotpisan));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setIsTrebaloBi(Boolean(
      repairData.trebaloBi ||
      repairData.trebalo_bi ||
      repairData.category === 'trebaloBi' || repairData.category === 'trebalo_bi' || repairData.category === 'trebalo-bi' || repairData.category === 'trebalo' ||
      repairData.type === 'trebaloBi' || repairData.type === 'trebalo_bi' || repairData.type === 'trebalo-bi' || repairData.type === 'trebalo' ||
      repairData.status === 'in_progress' ||
      repairData.status === 'u tijeku' ||
      repairData.status === 'u_tijeku'
    ));
    setStatus(repairData.status === 'completed' ? 'completed' : 'pending');
    setRadniNalogPotpisan(Boolean(repairData.radniNalogPotpisan));
  }, [repairData.trebaloBi, repairData.status, repairData.radniNalogPotpisan, repairData.category, repairData.type]);

  const handleSave = async () => {
    const id = repairData._id || repairData.id;
    const payload = {
      opisKvara,
      opisPopravka,
      status,
      trebaloBi: isTrebaloBi,
      radniNalogPotpisan,
      updated_at: Date.now(),
    };

    setSaving(true);
    try {
      const onlineNow = online;
      if (!onlineNow) {
        repairDB.update(id, { ...repairData, ...payload, synced: 0, sync_status: 'dirty' });
        setRepairData((prev) => ({ ...prev, ...payload, synced: 0, sync_status: 'dirty' }));
      } else {
        const response = await repairsAPI.update(id, payload);
        const updated = response.data?.data || response.data;
        repairDB.update(id, { ...repairData, ...updated, synced: 1, sync_status: 'synced' });
        setRepairData((prev) => ({ ...prev, ...updated, synced: 1, sync_status: 'synced' }));
      }
      Alert.alert('Spremljeno', 'Promjene su spremljene', [
        { text: 'OK', onPress: () => navigation.navigate('Repairs') },
      ]);
    } catch (e) {
      Alert.alert('Greška', e?.message || 'Nije moguće spremiti promjene');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('Repairs')}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Detalji popravka</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.elevatorHero}>
          <View style={[styles.elevatorBadgeLarge, { borderColor: statusColor({ status, trebaloBi: isTrebaloBi }) }]}>
            <Text style={styles.elevatorBadgeLargeText}>{elevator?.brojDizala || 'Dizalo'}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Opis kvara</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={opisKvara}
            onChangeText={setOpisKvara}
            placeholder="Upiši opis kvara"
            multiline
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Opis popravka</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={opisPopravka}
            onChangeText={setOpisPopravka}
            placeholder="Što je rađeno na popravku"
            multiline
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Status</Text>
          <View style={styles.statusChoiceRow}>
            {[
              { label: 'Prijavljen', value: 'pending', color: '#ef4444' },
              { label: 'Završeno', value: 'completed', color: '#10b981' },
            ].map((opt) => {
              const active = status === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.statusChip, active && styles.statusChipActive, active && { borderColor: opt.color }]}
                  onPress={() => setStatus(opt.value)}
                >
                  <Text style={[styles.statusChipText, active && { color: opt.color }]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.toggleRow, radniNalogPotpisan && styles.toggleRowActive]}
            onPress={() => setRadniNalogPotpisan((p) => !p)}
          >
            <Ionicons name={radniNalogPotpisan ? 'checkbox' : 'square-outline'} size={20} color={radniNalogPotpisan ? '#10b981' : '#6b7280'} />
            <Text style={styles.toggleLabel}>Radni nalog potpisan</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={handleSave} disabled={saving}>
          <Ionicons name="save-outline" size={18} color="#fff" />
          <Text style={styles.primaryButtonText}>{saving ? 'Spremam...' : 'Spremi'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryButton, { marginTop: ms(12) }]}
          onPress={() => navigation.navigate('EditRepair', { repair: repairData })}
        >
          <Ionicons name="information-circle-outline" size={18} color="#2563eb" />
          <Text style={styles.secondaryText}>Detalji</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#fff', paddingTop: ms(50), paddingBottom: ms(15), paddingHorizontal: ms(20), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e5e5e5' },
  headerTitle: { fontSize: ms(19), fontWeight: '700', color: '#1f2937' },
  content: { flex: 1 },
  card: { backgroundColor: '#fff', padding: ms(16), marginTop: ms(12), borderRadius: ms(12), shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  elevatorHero: { alignItems: 'center', marginTop: ms(12) },
  elevatorBadgeLarge: { paddingHorizontal: ms(16), paddingVertical: ms(10), borderRadius: ms(14), borderWidth: 2, backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  elevatorBadgeLargeText: { fontSize: ms(18), fontWeight: '800', color: '#111827' },
  sectionTitle: { fontSize: ms(17), fontWeight: '800', color: '#111827' },
  actionIconBtn: { paddingHorizontal: ms(6), paddingVertical: ms(4) },
  primaryButton: {
    marginTop: ms(20),
    marginHorizontal: ms(20),
    backgroundColor: '#2563eb',
    borderRadius: ms(10),
    padding: ms(14),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(8),
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: ms(15),
  },
  secondaryButton: {
    marginHorizontal: ms(20),
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: ms(10),
    padding: ms(12),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(8),
    backgroundColor: '#eef2ff',
  },
  secondaryGhostButton: {
    paddingVertical: ms(10),
    paddingHorizontal: ms(12),
  },
  secondaryText: {
    color: '#2563eb',
    fontWeight: '700',
    fontSize: ms(14),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: ms(20),
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: ms(12),
    padding: ms(16),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: ms(12),
  },
  modalTitle: {
    fontSize: ms(16),
    fontWeight: '700',
    color: '#111827',
  },
  label: {
    fontSize: ms(14),
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: ms(8),
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: ms(8),
    padding: ms(12),
    fontSize: ms(15),
    color: '#1f2937',
    backgroundColor: '#f9fafb',
  },
  textArea: {
    minHeight: ms(100),
    textAlignVertical: 'top',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(10),
    paddingVertical: ms(10),
  },
  toggleRowActive: {
    backgroundColor: '#ecfeff',
    paddingHorizontal: ms(6),
    borderRadius: ms(8),
  },
  toggleLabel: {
    fontSize: ms(15),
    color: '#111827',
  },
  statusChoiceRow: {
    flexDirection: 'row',
    gap: ms(8),
    marginBottom: ms(6),
  },
  statusChip: {
    paddingHorizontal: ms(12),
    paddingVertical: ms(8),
    borderRadius: ms(10),
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  statusChipActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  statusChipText: {
    fontSize: ms(14),
    color: '#111827',
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: ms(12),
    marginTop: ms(12),
  },
  primaryButtonSmall: {
    paddingVertical: ms(10),
    paddingHorizontal: ms(14),
    backgroundColor: '#2563eb',
    borderRadius: ms(8),
  },
});



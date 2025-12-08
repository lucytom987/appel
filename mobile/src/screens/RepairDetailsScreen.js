import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { elevatorDB, userDB, repairDB } from '../database/db';
import { repairsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const statusLabel = (status) => {
  switch (status) {
    case 'pending': return 'Prijavljen';
    case 'in_progress': return 'U tijeku';
    case 'completed': return 'Završeno';
    default: return status;
  }
};

const statusColor = (repair) => {
  const status = repair.status;
  if (status === 'completed') return '#10b981';
  if (status === 'in_progress') return '#f59e0b';
  return '#ef4444';
};

export default function RepairDetailsScreen({ route, navigation }) {
  const { repair } = route.params;
  const [repairData, setRepairData] = useState(repair);
  const { user } = useAuth();

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
  const elevator = elevatorDB.getById(elevatorId);
  const currentUserId = user?._id || user?.id;
  const normalizeStatus = (status) => {
    if (['pending', 'in_progress', 'completed'].includes(status)) return status;
    if (status === 'u tijeku' || status === 'u_tijeku') return 'in_progress';
    if (status === 'završen' || status === 'zavrsen') return 'completed';
    return 'pending';
  };
  const initialStatus = normalizeStatus(repairData.status);
  const formatName = (person) => {
    if (!person) return '';
    const full = `${person.ime || person.firstName || person.name || person.fullName || ''} ${person.prezime || person.lastName || ''}`.trim();
    return full || person.email || '';
  };
  const serviser = (() => {
    if (typeof repairData.serviserID === 'object' && repairData.serviserID !== null) return repairData.serviserID;
    const found = userDB.getById ? userDB.getById(repairData.serviserID) : null;
    if (found) return found;
    if (repairData.serviserID && currentUserId && repairData.serviserID === currentUserId) return user || { id: repairData.serviserID };
    return { ime: '', prezime: '', id: repairData.serviserID };
  })();
  const reporterName = repairData.prijavio || formatName(user) || 'Nije uneseno';
  const reporterPhone = repairData.kontaktTelefon || user?.telefon || user?.phone || '';
  const workOrderSigned = Boolean(repairData.radniNalogPotpisan);
  const workOrderColor = workOrderSigned ? '#10b981' : '#ef4444';
  const workOrderIcon = workOrderSigned ? 'document-text-outline' : 'document-outline';
  const [editVisible, setEditVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editValues, setEditValues] = useState({
    opisPopravka: repairData.opisPopravka || '',
    popravkaUPotpunosti: normalizeStatus(repairData.status) === 'completed' ? true : Boolean(repairData.popravkaUPotpunosti),
    status: initialStatus,
    radniNalogPotpisan: Boolean(repairData.radniNalogPotpisan),
  });

  const handleUpdate = async () => {
    try {
      setSaving(true);
      const newStatus = editValues.status || (editValues.popravkaUPotpunosti ? 'completed' : 'in_progress');
      const serviserId = user?._id || user?.id || repairData.serviserID;
      const payload = {
        opisPopravka: editValues.opisPopravka,
        popravkaUPotpunosti: newStatus === 'completed' ? true : Boolean(editValues.popravkaUPotpunosti),
        radniNalogPotpisan: editValues.radniNalogPotpisan,
        status: newStatus,
        datumPopravka: newStatus === 'completed' ? new Date().toISOString() : (repairData.datumPopravka || undefined),
        serviserID: serviserId,
      };

      const id = repairData._id || repairData.id;
      try {
        const response = await repairsAPI.update(id, payload);
        const updated = response.data?.data || response.data;
        repairDB.update(id, { ...repairData, ...updated, serviserID: serviserId, synced: 1 });
      } catch (err) {
        console.log('⚠️ Backend nedostupan, spremam lokalno', err?.message);
        repairDB.update(id, { ...repairData, ...payload, synced: 0 });
      }

      setSaving(false);
      setEditVisible(false);
      Alert.alert('Ažurirano', editValues.popravkaUPotpunosti ? 'Popravak označen kao završen' : 'Popravak je u tijeku');
      navigation.goBack();
    } catch (error) {
      setSaving(false);
      Alert.alert('Greška', error.message || 'Nije moguće spremiti promjene');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Detalji popravka</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Dizalo</Text>
            {elevator?.brojDizala ? (
              <View style={styles.elevatorBadge}>
                <Text style={styles.elevatorBadgeText}>{elevator.brojDizala}</Text>
              </View>
            ) : null}
          </View>
          <DetailRow label="Stranka" value={elevator?.nazivStranke} />
          <DetailRow label="Adresa" value={elevator ? `${elevator.ulica}, ${elevator.mjesto}` : ''} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Prijavio kvar</Text>
          <DetailRow label="Ime i prezime" value={reporterName} />
          <DetailRow
            label="Telefon"
            value={reporterPhone || 'Nije uneseno'}
            action={reporterPhone ? () => Linking.openURL(`tel:${reporterPhone}`) : null}
            actionIcon="call"
          />
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Popravak</Text>
            <View style={styles.statusHeaderRow}>
              <Ionicons name={workOrderIcon} size={18} color={workOrderColor} style={styles.statusIcon} />
              <View style={[styles.statusPill, { backgroundColor: statusColor(repairData) }]}>
                <Text style={styles.statusPillText}>{statusLabel(repairData.status)}</Text>
              </View>
            </View>
          </View>
          <DetailRow label="Datum prijave" value={new Date(repairData.datumPrijave).toLocaleString('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
          {repairData.datumPopravka && (
            <DetailRow label="Datum popravka" value={new Date(repairData.datumPopravka).toLocaleString('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
          )}
          <DetailRow
            label="Serviser"
            value={formatName(serviser) || serviser.id || 'Nepoznat'}
          />
        </View>

        {repairData.opisKvara && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Opis kvara</Text>
            <Text style={styles.notes}>{repairData.opisKvara}</Text>
          </View>
        )}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Opis popravka</Text>
          <Text style={styles.notes}>{repairData.opisPopravka?.trim() ? repairData.opisPopravka : 'Čeka se upis opisa popravka.'}</Text>
        </View>
        {repairData.napomene && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Napomene</Text>
            <Text style={styles.notes}>{repairData.napomene}</Text>
          </View>
        )}

        <TouchableOpacity style={styles.primaryButton} onPress={() => setEditVisible(true)}>
          <Ionicons name="create-outline" size={18} color="#fff" />
          <Text style={styles.primaryButtonText}>Ažuriraj popravak</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>

      <Modal visible={editVisible} transparent animationType="fade" onRequestClose={() => setEditVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ažuriraj popravak</Text>
              <TouchableOpacity onPress={() => setEditVisible(false)}>
                <Ionicons name="close" size={22} color="#111827" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              <Text style={styles.label}>Opis popravka</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={editValues.opisPopravka}
                onChangeText={(text) => setEditValues((p) => ({ ...p, opisPopravka: text }))}
                placeholder="Što je rađeno na popravku"
                multiline
              />

              <Text style={[styles.label, { marginTop: 10 }]}>Status</Text>
              <View style={styles.statusChoiceRow}>
                {[
                  { label: 'Prijavljen', value: 'pending' },
                  { label: 'U tijeku', value: 'in_progress' },
                  { label: 'Završeno', value: 'completed' },
                ].map((opt) => {
                  const active = editValues.status === opt.value;
                  const color = opt.value === 'pending' ? '#ef4444' : opt.value === 'in_progress' ? '#f59e0b' : '#10b981';
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.statusChip, active && styles.statusChipActive, active && { borderColor: color, backgroundColor: '#fff' }]}
                      onPress={() => setEditValues((p) => ({
                        ...p,
                        status: opt.value,
                        popravkaUPotpunosti: opt.value === 'completed',
                      }))}
                    >
                      <Text style={[styles.statusChipText, active && { color }]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[styles.toggleRow, editValues.radniNalogPotpisan && styles.toggleRowActive]}
                onPress={() => setEditValues((p) => ({ ...p, radniNalogPotpisan: !p.radniNalogPotpisan }))}
              >
                <Ionicons name={editValues.radniNalogPotpisan ? 'checkbox' : 'square-outline'} size={22} color={editValues.radniNalogPotpisan ? '#10b981' : '#6b7280'} />
                <Text style={styles.toggleLabel}>Radni nalog potpisan</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setEditVisible(false)} style={styles.secondaryButton}>
                <Text style={styles.secondaryText}>Odustani</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleUpdate} style={styles.primaryButtonSmall} disabled={saving}>
                <Text style={styles.primaryButtonText}>{saving ? 'Spremam...' : 'Spremi'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DetailRow({ label, value, badgeColor, action, actionIcon }) {
  const displayValue = (() => {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'string' || typeof value === 'number') return value;
    // Fallback za neočekivane tipove
    try {
      return String(value);
    } catch {
      return '-';
    }
  })();

  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <View style={styles.detailValueWrap}>
        {badgeColor && <View style={[styles.badgeDot, { backgroundColor: badgeColor }]} />}
        <Text style={styles.detailValue}>{displayValue}</Text>
        {action && (
          <TouchableOpacity onPress={action} style={styles.actionIconBtn}>
            <Ionicons name={actionIcon || 'call'} size={18} color="#2563eb" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#fff', paddingTop: 50, paddingBottom: 15, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e5e5e5' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#1f2937' },
  content: { flex: 1 },
  card: { backgroundColor: '#fff', padding: 16, marginTop: 12, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  detailLabel: { fontSize: 14, color: '#6b7280' },
  detailValue: { fontSize: 14, color: '#1f2937', fontWeight: '500' },
  detailValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionIconBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  badgeDot: { width: 10, height: 10, borderRadius: 5 },
  notes: { fontSize: 14, color: '#4b5563', lineHeight: 20 },
  elevatorBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#e0e7ff' },
  elevatorBadgeText: { fontSize: 13, fontWeight: '700', color: '#1f2937' },
  statusHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusIcon: { marginRight: -2 },
  statusPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  statusPillText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  primaryButton: {
    marginTop: 20,
    marginHorizontal: 20,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#1f2937',
    backgroundColor: '#f9fafb',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  toggleRowActive: {
    backgroundColor: '#ecfeff',
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  toggleLabel: {
    fontSize: 15,
    color: '#111827',
  },
  statusChoiceRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  statusChipActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  statusChipText: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
  },
  statusChipTextActive: {
    color: '#1d4ed8',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 12,
  },
  secondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  secondaryText: {
    color: '#6b7280',
    fontWeight: '600',
  },
  primaryButtonSmall: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#2563eb',
    borderRadius: 8,
  },
});

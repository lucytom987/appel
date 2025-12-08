import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { elevatorDB, userDB } from '../database/db';

export default function ServiceDetailsScreen({ route, navigation }) {
  const { service } = route.params;
  const elevator = elevatorDB.getById(service.elevatorId);

  const checklistItems = Array.isArray(service.checklist) ? service.checklist : [];

  const serviserValue = (() => {
    const raw = service?.serviserID;
    if (!raw) return '-';

    // Ako je objekt, probaj ime/prezime
    if (typeof raw === 'object') {
      const ime = raw.ime || raw.firstName || '';
      const prezime = raw.prezime || raw.lastName || '';
      const full = `${ime} ${prezime}`.trim();
      if (full) return full;
      if (raw._id) {
        const found = userDB.getById(raw._id);
        if (found) {
          const f = `${found.ime || found.firstName || ''} ${found.prezime || found.lastName || ''}`.trim();
          if (f) return f;
        }
      }
      return '-';
    }

    // Ako je string/ID, pokušaj naći korisnika
    if (typeof raw === 'string' || typeof raw === 'number') {
      const idStr = String(raw);
      const found = userDB.getById(idStr);
      if (found) {
        const full = `${found.ime || found.firstName || ''} ${found.prezime || found.lastName || ''}`.trim();
        if (full) return full;
        if (found.email) return found.email;
      }
      // fallback: skrati ID
      return idStr.length > 8 ? `${idStr.slice(0, 8)}…` : idStr;
    }

    return String(raw);
  })();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Detalji servisa</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Dizalo</Text>
            {elevator?.brojDizala ? (
              <View style={styles.elevatorBadge}>
                <Text style={styles.elevatorBadgeText}>{elevator.brojDizala}</Text>
              </View>
            ) : null}
          </View>
          <DetailRow label="Stranka" value={elevator?.nazivStranke} />
          <DetailRow
            label="Adresa"
            value={elevator ? `${elevator.ulica || ''}${elevator.mjesto ? `, ${elevator.mjesto}` : ''}` : ''}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Servis</Text>
          <DetailRow
            label="Datum"
            value={service?.datum ? new Date(service.datum).toLocaleDateString('hr-HR') : '-'}
          />
          {service?.sljedeciServis && (
            <DetailRow
              label="Sljedeći servis"
              value={new Date(service.sljedeciServis).toLocaleDateString('hr-HR')}
            />
          )}
          <DetailRow label="Serviser" value={serviserValue} />
        </View>

        {!!service?.napomene && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Napomene</Text>
            <Text style={styles.notes}>{String(service.napomene)}</Text>
          </View>
        )}

        {checklistItems.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Checklist</Text>
            {checklistItems.map((item, idx) => {
              const labelMap = {
                lubrication: 'Podmazivanje',
                ups_check: 'Provjera UPS-a',
                voice_comm: 'Govorna veza',
                shaft_cleaning: 'Čišćenje šahta',
                drive_check: 'Provjera pog. stroja',
                brake_check: 'Provjera kočnice',
                cable_inspection: 'Inspekcija užeta',
                engine_check: 'Provjera motora',
                door_system: 'Sustav vrata',
                emergency_brake: 'Sigurnosna kočnica',
                control_panel: 'Kontrolna ploča',
                safety_devices: 'Sigurnosne naprave',
                lighting: 'Rasvjeta',
              };

              const rawKey = typeof item?.stavka === 'string' ? item.stavka : '';
              const fallback = rawKey.replace(/_/g, ' ');
              const label = labelMap[rawKey] || fallback || '-';

              return (
                <View key={idx} style={styles.checkItem}>
                  <Ionicons
                    name={item.provjereno ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={item.provjereno ? '#10b981' : '#9ca3af'}
                  />
                  <Text style={styles.checkLabel}>{label}</Text>
                </View>
              );
            })}
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

function DetailRow({ label, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || '-'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    backgroundColor: '#fff',
    paddingTop: 46,
    paddingBottom: 12,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#1f2937' },
  content: { flex: 1 },
  section: { backgroundColor: '#fff', padding: 16, marginTop: 12 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  detailLabel: { fontSize: 14, color: '#6b7280' },
  detailValue: { fontSize: 14, color: '#1f2937', fontWeight: '500' },
  notes: { fontSize: 14, color: '#4b5563', lineHeight: 20 },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  checkLabel: { fontSize: 14, color: '#1f2937' },
  elevatorBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: '#eef2ff', borderWidth: 1, borderColor: '#e0e7ff' },
  elevatorBadgeText: { fontSize: 13, fontWeight: '700', color: '#1f2937' },
});

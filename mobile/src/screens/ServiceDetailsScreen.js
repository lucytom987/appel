import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { elevatorDB } from '../database/db';

export default function ServiceDetailsScreen({ route, navigation }) {
  const { service } = route.params;
  const elevator = elevatorDB.getById(service.elevatorId);

  const checklistItems = Array.isArray(service.checklist) ? service.checklist : [];

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
          <Text style={styles.sectionTitle}>Dizalo</Text>
          <DetailRow label="Stranka" value={elevator?.nazivStranke} />
          <DetailRow label="Adresa" value={elevator ? `${elevator.ulica}, ${elevator.mjesto}` : ''} />
          <DetailRow label="Broj dizala" value={elevator?.brojDizala} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Servis</Text>
          <DetailRow label="Datum" value={new Date(service.datum).toLocaleDateString('hr-HR')} />
          {service.sljedeciServis && (
            <DetailRow label="Sljedeći servis" value={new Date(service.sljedeciServis).toLocaleDateString('hr-HR')} />
          )}
          <DetailRow label="Serviser ID" value={service.serviserID} />
        </View>

        {service.napomene && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Napomene</Text>
            <Text style={styles.notes}>{service.napomene}</Text>
          </View>
        )}

        {checklistItems.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Checklist</Text>
            {checklistItems.map((item, idx) => (
              <View key={idx} style={styles.checkItem}>
                <Ionicons name={item.provjereno ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={item.provjereno ? '#10b981' : '#9ca3af'} />
                <Text style={styles.checkLabel}>{item.stavka.replace(/_/g, ' ')}</Text>
              </View>
            ))}
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
  header: { backgroundColor: '#fff', paddingTop: 50, paddingBottom: 15, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e5e5e5' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#1f2937' },
  content: { flex: 1 },
  section: { backgroundColor: '#fff', padding: 20, marginTop: 15 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#1f2937', marginBottom: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  detailLabel: { fontSize: 14, color: '#6b7280' },
  detailValue: { fontSize: 14, color: '#1f2937', fontWeight: '500' },
  notes: { fontSize: 14, color: '#4b5563', lineHeight: 20 },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  checkLabel: { fontSize: 14, color: '#1f2937' },
});

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { elevatorDB } from '../database/db';

export default function RepairDetailsScreen({ route, navigation }) {
  const { repair } = route.params;
  const elevator = elevatorDB.getById(repair.elevatorId);

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
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dizalo</Text>
          <DetailRow label="Stranka" value={elevator?.nazivStranke} />
          <DetailRow label="Adresa" value={elevator ? `${elevator.ulica}, ${elevator.mjesto}` : ''} />
          <DetailRow label="Broj dizala" value={elevator?.brojDizala} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Popravak</Text>
          <DetailRow label="Datum prijave" value={new Date(repair.datumPrijave).toLocaleDateString('hr-HR')} />
          {repair.datumPopravka && (
            <DetailRow label="Datum popravka" value={new Date(repair.datumPopravka).toLocaleDateString('hr-HR')} />
          )}
          <DetailRow label="Status" value={repair.status} />
          <DetailRow label="Serviser ID" value={repair.serviserID} />
        </View>

        {repair.opisKvara && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Opis kvara</Text>
            <Text style={styles.notes}>{repair.opisKvara}</Text>
          </View>
        )}
        {repair.opisPopravka && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Opis popravka</Text>
            <Text style={styles.notes}>{repair.opisPopravka}</Text>
          </View>
        )}
        {repair.napomene && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Napomene</Text>
            <Text style={styles.notes}>{repair.napomene}</Text>
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
});

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { chatroomsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { chatroomDB } from '../database/db';

export default function ChatRoomsScreen({ navigation }) {
  const { isOnline } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    try {
      const res = await chatroomsAPI.getAll();
      const data = res.data?.data || res.data || [];
      setRooms(data);
      chatroomDB?.bulkInsert?.(data);
    } catch (e) {
      console.log('Chat rooms load failed', e?.message);
      const cached = chatroomDB?.getAll?.() || [];
      setRooms(cached);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await chatroomsAPI.create({ name: newName.trim(), description: newDesc.trim() || undefined });
      const created = res.data?.data || res.data;
      if (created) {
        setRooms((prev) => [created, ...prev]);
        chatroomDB?.insertOrReplace?.(created);
        setNewName('');
        setNewDesc('');
        setShowModal(false);
      }
    } catch (e) {
      console.log('Create room failed', e?.message);
    } finally {
      setCreating(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRooms();
    setRefreshing(false);
  };

  const renderItem = ({ item }) => {
    const name = item.name || item.title || item.naziv || 'Chat';
    const desc = item.description || item.opis || '';
    return (
    <TouchableOpacity
      style={styles.roomCard}
      onPress={() => navigation.navigate('ChatRoom', { room: item })}
      activeOpacity={0.8}
    >
      <View style={styles.roomHeader}>
        <Text style={styles.roomName}>{name}</Text>
        <View style={[styles.badge, isOnline ? styles.badgeOnline : styles.badgeOffline]}>
          <Text style={styles.badgeText}>{isOnline ? 'Online' : 'Offline'}</Text>
        </View>
      </View>
      {desc ? <Text style={styles.roomDesc}>{desc}</Text> : null}
      <View style={styles.metaRow}>
        <Ionicons name="people-outline" size={16} color="#6b7280" />
        <Text style={styles.metaText}>{item.members?.length || 0} članova</Text>
      </View>
    </TouchableOpacity>
  );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Chat sobe</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#7c3aed" />
          <Text style={styles.loaderText}>Učitavanje...</Text>
        </View>
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(item) => item._id || item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubble-ellipses-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyText}>Nema dostupnih chat soba.</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => setShowModal(true)}>
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.formTitle}>Nova soba</Text>
            <TextInput
              style={styles.input}
              placeholder="Naziv sobe"
              value={newName}
              onChangeText={setNewName}
            />
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              placeholder="Opis (opcionalno)"
              value={newDesc}
              onChangeText={setNewDesc}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.createButton, (!newName.trim() || creating) && styles.createButtonDisabled]}
                onPress={handleCreate}
                disabled={!newName.trim() || creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.createButtonText}>Kreiraj</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelText}>Odustani</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  listContent: { padding: 16 },
  roomCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  roomHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roomName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  roomDesc: { marginTop: 6, fontSize: 14, color: '#4b5563' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  metaText: { fontSize: 13, color: '#6b7280' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  badgeOnline: { backgroundColor: '#ede9fe' },
  badgeOffline: { backgroundColor: '#fee2e2' },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loaderText: { marginTop: 8, color: '#4b5563' },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyText: { marginTop: 8, color: '#9ca3af', fontSize: 14 },
  formCard: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  formTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#f8fafc',
  },
  createButton: {
    marginTop: 10,
    backgroundColor: '#7c3aed',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  createButtonDisabled: { backgroundColor: '#c4b5fd' },
  createButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 70,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#7c3aed',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
  },
  modalActions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  cancelButton: { paddingVertical: 12, paddingHorizontal: 14 },
  cancelText: { color: '#6b7280', fontWeight: '600' },
});

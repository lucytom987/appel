import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { chatroomsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { chatroomDB } from '../database/db';
import { useFocusEffect } from '@react-navigation/native';

export default function ChatRoomsScreen({ navigation }) {
  const { isOnline } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [editingRoom, setEditingRoom] = useState(null);

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

  useFocusEffect(
    useCallback(() => {
      loadRooms();
    }, [loadRooms])
  );

  const resetModal = () => {
    setNewName('');
    setNewDesc('');
    setEditingRoom(null);
    setShowModal(false);
  };

  const handleSaveRoom = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    const payload = { name: newName.trim(), description: newDesc.trim() || undefined };
    try {
      if (editingRoom) {
        const id = editingRoom._id || editingRoom.id;
        const res = await chatroomsAPI.update(id, payload);
        const updated = res.data?.data || res.data;
        if (updated) {
          setRooms((prev) => prev.map((r) => ((r._id || r.id) === id ? updated : r)));
          chatroomDB?.insertOrReplace?.(updated);
        }
      } else {
        const res = await chatroomsAPI.create(payload);
        const created = res.data?.data || res.data;
        if (created) {
          setRooms((prev) => [created, ...prev]);
          chatroomDB?.insertOrReplace?.(created);
        }
      }
      resetModal();
    } catch (e) {
      console.log('Save room failed', e?.message);
    } finally {
      setSaving(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRooms();
    setRefreshing(false);
  };

  const formatLastMessageTime = (value) => {
    if (!value) return 'Nema poruka';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Nema poruka';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return 'Upravo sada'; // zaštita ako server/klijent vrijeme kasni/žuri

    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return 'Prije manje od minute';
    if (diffMinutes < 60) return `Prije ${diffMinutes} min`;
    if (diffHours < 24) return `Prije ${diffHours} h`;
    if (diffDays < 7) return `Prije ${diffDays} d`; // prikaz samo broj dana unazad

    return date.toLocaleDateString('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const renderItem = ({ item }) => {
    const name = item.name || item.title || item.naziv || 'Chat';
    const desc = item.description || item.opis || '';
    const roomId = item._id || item.id;
    const isDeleting = deletingId === roomId;
    const initials = name.slice(0, 2).toUpperCase();
    const unreadCount = item.unreadCount || 0;
    const lastMessageAt = item.lastMessageAt || null; // prikazi samo vrijeme zadnje poruke; inače "Nema poruka"
    const lastMessageLabel = formatLastMessageTime(lastMessageAt);
    return (
      <TouchableOpacity
        style={[styles.roomCard, unreadCount > 0 && styles.roomCardUnread]}
        onPress={() => navigation.navigate('ChatRoom', { room: item })}
        activeOpacity={0.9}
      >
        <View style={styles.roomHeader}>
          <View style={styles.roomLeft}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.roomName} numberOfLines={1}>{name}</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => {
                setEditingRoom(item);
                setNewName(name);
                setNewDesc(desc);
                setShowModal(true);
              }}
              style={styles.actionButton}
            >
              <Ionicons name="pencil-outline" size={20} color="#0f172a" />
            </TouchableOpacity>
            {isDeleting ? (
              <ActivityIndicator size="small" color="#ef4444" />
            ) : (
              <TouchableOpacity
                onPress={() =>
                  Alert.alert(
                    'Obriši chat sobu',
                    `Sigurno želiš obrisati "${name}"? Sve poruke u toj sobi će se obrisati.`,
                    [
                      { text: 'Odustani', style: 'cancel' },
                      {
                        text: 'Obriši',
                        style: 'destructive',
                        onPress: async () => {
                          setDeletingId(roomId);
                          setRooms((prev) => prev.filter((r) => (r._id || r.id) !== roomId));
                          try {
                            await chatroomsAPI.delete(roomId);
                            chatroomDB?.remove?.(roomId);
                          } catch (e) {
                            console.log('Delete room failed', e?.message);
                            await loadRooms();
                          } finally {
                            setDeletingId(null);
                          }
                        },
                      },
                    ]
                  )
                }
                style={styles.actionButton}
              >
                <Ionicons name="trash-outline" size={20} color="#ef4444" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {desc ? <Text style={styles.roomDesc} numberOfLines={2}>{desc}</Text> : null}
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={16} color="#475569" />
          <Text style={styles.metaText}>{lastMessageLabel}</Text>
        </View>
        {unreadCount > 0 ? (
          <View style={styles.unreadPill}>
            <Text style={styles.unreadText}>{unreadCount} novih</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.heroTop}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#0f172a" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>Chat sobe</Text>
            <Text style={styles.headerSubtitle}>Brzi pristup razgovorima i timovima</Text>
          </View>
          <View style={{ width: 24 }} />
        </View>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#0ea5e9" />
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
            <Text style={styles.formTitle}>{editingRoom ? 'Uredi sobu' : 'Nova soba'}</Text>
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
                style={[styles.createButton, (!newName.trim() || saving) && styles.createButtonDisabled]}
                onPress={handleSaveRoom}
                disabled={!newName.trim() || saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.createButtonText}>{editingRoom ? 'Spremi promjene' : 'Kreiraj'}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelButton} onPress={resetModal}>
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
  container: { flex: 1, backgroundColor: '#eef2f6' },
  heroTop: {
    backgroundColor: '#e0f2fe',
    paddingBottom: 6,
    paddingTop: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#dbeafe',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  headerSubtitle: { marginTop: 2, color: '#475569', fontSize: 13 },
  listContent: { padding: 16, paddingBottom: 120 },
  roomCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  roomCardUnread: {
    borderColor: '#16a34a',
    borderWidth: 2,
  },
  roomHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  roomLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#0f172a', fontWeight: '800', fontSize: 14 },
  roomName: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  roomDesc: { marginTop: 10, fontSize: 14, color: '#475569', lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  metaText: { fontSize: 13, color: '#475569' },
  unreadPill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(22,163,74,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.4)',
  },
  unreadText: { color: '#15803d', fontWeight: '700', fontSize: 12 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loaderText: { marginTop: 8, color: '#475569' },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyText: { marginTop: 8, color: '#94a3b8', fontSize: 14 },
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
    borderColor: '#dbeafe',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#f8fafc',
  },
  createButton: {
    marginTop: 10,
    backgroundColor: '#0ea5e9',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  createButtonDisabled: { backgroundColor: '#9bdcf7' },
  createButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 70,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0ea5e9',
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

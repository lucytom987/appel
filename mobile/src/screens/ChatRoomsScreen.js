import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { chatroomsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { chatroomDB } from '../database/db';
import { useFocusEffect } from '@react-navigation/native';

const colorChoices = [
  { key: 'sky', color: '#0ea5e9' },
  { key: 'blue', color: '#2563eb' },
  { key: 'indigo', color: '#4f46e5' },
  { key: 'violet', color: '#7c3aed' },
  { key: 'purple', color: '#9333ea' },
  { key: 'teal', color: '#0d9488' },
  { key: 'emerald', color: '#059669' },
  { key: 'green', color: '#22c55e' },
  { key: 'lime', color: '#65a30d' },
  { key: 'amber', color: '#d97706' },
  { key: 'orange', color: '#f97316' },
  { key: 'rose', color: '#e11d48' },
  { key: 'fuchsia', color: '#c026d3' },
  { key: 'brown', color: '#92400e' },
  { key: 'slate', color: '#475569' },
  { key: 'black', color: '#0f172a' },
];

export default function ChatRoomsScreen({ navigation }) {
  const { isOnline, serverAwake } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showOnlyUnread, setShowOnlyUnread] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [roomColors, setRoomColors] = useState({});
  const [selectedColorKey, setSelectedColorKey] = useState('');
  const online = Boolean(isOnline && serverAwake);

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

  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync('roomColorTags');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed === 'object') setRoomColors(parsed);
        }
      } catch (err) {
        console.log('Load room colors failed', err?.message);
      }
    })();
  }, []);

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
    setSelectedColorKey('');
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
          if (selectedColorKey !== undefined) {
            updateRoomColor(id, selectedColorKey);
          }
        }
      } else {
        const res = await chatroomsAPI.create(payload);
        const created = res.data?.data || res.data;
        if (created) {
          setRooms((prev) => [created, ...prev]);
          chatroomDB?.insertOrReplace?.(created);
          updateRoomColor(created._id || created.id, selectedColorKey);
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
    if (diffMs < 0) return 'Upravo sada';

    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return 'Prije manje od minute';
    if (diffMinutes < 60) return `Prije ${diffMinutes} min`;
    if (diffHours < 24) return `Prije ${diffHours} h`;
    if (diffDays < 7) return `Prije ${diffDays} d`;

    return date.toLocaleDateString('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const openEdit = (room) => {
    setEditingRoom(room);
    setNewName(room?.name || room?.title || room?.naziv || '');
    setNewDesc(room?.description || room?.opis || '');
    setShowModal(true);
    const roomId = room?._id || room?.id;
    setSelectedColorKey((roomId && roomColors?.[roomId]) || '');
  };

  const getSortableDate = (value) => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
  };

  const updateRoomColor = (roomId, colorKey) => {
    if (!roomId) return;
    setRoomColors((prev) => {
      const next = { ...prev };
      if (colorKey) next[roomId] = colorKey;
      else delete next[roomId];
      SecureStore.setItemAsync('roomColorTags', JSON.stringify(next)).catch((err) =>
        console.log('Save room color failed', err?.message),
      );
      return next;
    });
  };

  const displayRooms = [...rooms]
    .filter((room) => {
      const unreadOk = !showOnlyUnread || (room.unreadCount || 0) > 0;
      return unreadOk;
    })
    .sort((a, b) => getSortableDate(b.lastMessageAt) - getSortableDate(a.lastMessageAt));

  const renderItem = ({ item }) => {
    const name = item.name || item.title || item.naziv || 'Chat';
    const desc = item.description || item.opis || '';
    const initials = name.slice(0, 2).toUpperCase();
    const unreadCount = item.unreadCount || 0;
    const lastMessageAt = item.lastMessageAt || null;
    const lastMessageLabel = formatLastMessageTime(lastMessageAt);
    const roomId = item._id || item.id;
    const accent = colorChoices.find((c) => c.key === roomColors?.[roomId]);
    return (
      <TouchableOpacity
        style={[styles.roomCard, unreadCount > 0 && styles.roomCardUnread]}
        onPress={() => navigation.navigate('ChatRoom', { room: item })}
        onLongPress={() => openEdit(item)}
        activeOpacity={0.92}
      >
        <View style={styles.roomHeader}>
          <View style={styles.avatarWrap}>
            <View style={[styles.avatar, accent && { backgroundColor: accent.color }]}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            {accent ? <View style={[styles.colorTag, { backgroundColor: accent.color }]} /> : null}
            {unreadCount > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
              </View>
            ) : null}
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.roomName} numberOfLines={1}>{name}</Text>
            <View style={styles.roomMetaRow}>
              <Ionicons name="time-outline" size={14} color="#63708f" />
              <Text style={styles.metaText}>{lastMessageLabel}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
        </View>

        {desc ? <Text style={styles.roomDesc} numberOfLines={2}>{desc}</Text> : null}
        {unreadCount > 0 ? (
          <View style={styles.unreadPill}>
            <Ionicons name="flash" size={14} color="#15803d" />
            <Text style={styles.unreadText}>{unreadCount} novih</Text>
          </View>
        ) : (
          <View style={styles.unreadPillMuted}>
            <Ionicons name="checkmark-done" size={14} color="#64748b" />
            <Text style={styles.unreadTextMuted}>Sve procitano</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.heroTop}>
        <View style={styles.blobOne} />
        <View style={styles.blobTwo} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
            <Ionicons name="arrow-back" size={20} color="#e2e8f0" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>Chat sobe</Text>
            <Text style={styles.headerSubtitle}>Brzi pristup razgovorima i timovima</Text>
          </View>
          <TouchableOpacity style={styles.iconButton} onPress={() => { setEditingRoom(null); setShowModal(true); }}>
            <Ionicons name="add" size={20} color="#e2e8f0" />
          </TouchableOpacity>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.statPill}>
            <View style={[styles.statusDot, { backgroundColor: online ? '#22c55e' : '#f97316' }]} />
            <Text style={styles.statText}>{online ? 'Online' : 'Offline mod'}</Text>
          </View>
          <View style={styles.statPill}>
            <Ionicons name="albums-outline" size={16} color="#e2e8f0" />
            <Text style={styles.statText}>{rooms.length} soba</Text>
          </View>
          <TouchableOpacity style={[styles.statPill, styles.refreshPill]} onPress={onRefresh}>
            <Ionicons name="refresh" size={16} color="#0f172a" />
            <Text style={styles.refreshText}>Osvjezi</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#0ea5e9" />
          <Text style={styles.loaderText}>Ucitavanje...</Text>
        </View>
      ) : (
        <FlatList
          data={displayRooms}
          keyExtractor={(item, index) => item._id || item.id || `${item.name || 'room'}-${index}`}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubble-ellipses-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyText}>Nema dostupnih chat soba.</Text>
              <Text style={styles.emptySub}>Kreiraj novu sobu ili osvjezi listu.</Text>
            </View>
          }
        />
      )}

      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.formTitle}>{editingRoom ? 'Uredi sobu' : 'Nova soba'}</Text>
                <Text style={styles.formSubtitle}>{editingRoom ? 'Preimenuj ili azuriraj opis sobe.' : 'Postavi ime koje clanovi lako prepoznaju.'}</Text>
              </View>
              <TouchableOpacity onPress={resetModal} style={styles.closeIcon}>
                <Ionicons name="close" size={20} color="#0f172a" />
              </TouchableOpacity>
            </View>
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
            <View style={styles.colorDotsRow}>
              <Text style={styles.colorLabel}>Boja oznake (opcionalno)</Text>
              <View style={styles.colorDotsWrap}>
                <TouchableOpacity
                  style={[styles.colorDot, styles.colorDotNone, !selectedColorKey && styles.colorDotActive]}
                  onPress={() => setSelectedColorKey('')}
                >
                  <Ionicons name="close" size={14} color="#475569" />
                </TouchableOpacity>
                {colorChoices.map((choice) => {
                  const active = choice.key === selectedColorKey;
                  return (
                    <TouchableOpacity
                      key={choice.key}
                      style={[styles.colorDot, { backgroundColor: choice.color }, active && styles.colorDotActive]}
                      onPress={() => setSelectedColorKey(choice.key)}
                    />
                  );
                })}
              </View>
            </View>
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
  container: { flex: 1, backgroundColor: '#b3bdcc' },
  heroTop: {
    backgroundColor: '#0f172a',
    paddingBottom: 20,
    paddingTop: 12,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  blobOne: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#1d4ed8',
    opacity: 0.25,
    top: -30,
    right: -60,
  },
  blobTwo: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#0ea5e9',
    opacity: 0.18,
    top: -80,
    left: -90,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#e2e8f0' },
  headerSubtitle: { marginTop: 2, color: '#cbd5e1', fontSize: 13 },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  refreshPill: { backgroundColor: '#e2e8f0' },
  refreshText: { color: '#0f172a', fontWeight: '700', fontSize: 13 },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statText: { color: '#e2e8f0', fontWeight: '700', fontSize: 13 },
  listContent: { padding: 16, paddingBottom: 140, paddingTop: 12 },
  roomCard: {
    backgroundColor: '#c5cedb',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#7c8599',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  roomCardUnread: {
    borderColor: '#15803d',
    shadowOpacity: 0.16,
  },
  roomHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0ea5e9',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  avatarText: { color: '#0f172a', fontWeight: '800', fontSize: 15 },
  unreadBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#ecfdf3',
  },
  unreadBadgeText: { color: '#ecfdf3', fontWeight: '800', fontSize: 11 },
  roomName: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  roomMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  roomDesc: { marginTop: 10, fontSize: 14, color: '#475569', lineHeight: 20 },
  metaText: { fontSize: 13, color: '#0f172a' },
  unreadPill: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(22,163,74,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.4)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unreadPillMuted: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unreadText: { color: '#15803d', fontWeight: '700', fontSize: 12 },
  unreadTextMuted: { color: '#64748b', fontWeight: '700', fontSize: 12 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loaderText: { marginTop: 8, color: '#475569' },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyText: { marginTop: 8, color: '#94a3b8', fontSize: 15, fontWeight: '700' },
  emptySub: { color: '#cbd5e1', marginTop: 4 },
  formTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  formSubtitle: { color: '#475569', marginTop: 4, fontSize: 13 },
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
    flex: 1,
  },
  createButtonDisabled: { backgroundColor: '#9bdcf7' },
  createButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
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
    gap: 10,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  closeIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  cancelButton: { paddingVertical: 12, paddingHorizontal: 14 },
  cancelText: { color: '#6b7280', fontWeight: '600' },
  colorDotsRow: { marginTop: 10, gap: 6 },
  colorLabel: { color: '#475569', fontWeight: '700', fontSize: 13 },
  colorDotsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colorDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDotNone: { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' },
  colorDotActive: {
    borderColor: '#0f172a',
    shadowColor: '#0f172a',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});

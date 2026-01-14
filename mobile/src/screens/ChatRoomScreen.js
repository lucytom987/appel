import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { messagesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { messageDB } from '../database/db';
import { chatroomsAPI } from '../services/api';
import { chatroomDB } from '../database/db';
const defaultAccent = { color: '#e5e7eb', meta: '#d1d5db' };
const SEND_COLOR = '#0ea5e9';

export default function ChatRoomScreen({ route, navigation }) {
  const { room } = route.params;
  const { user, isOnline, serverAwake } = useAuth();
  const normalizedRole = ((user?.uloga || user?.role || '') || '').toLowerCase();
  const isAdmin = normalizedRole === 'admin';
  const isManager = normalizedRole === 'menadzer' || normalizedRole === 'manager';
  const canDelete = isAdmin || isManager;
  const online = Boolean(isOnline && serverAwake);
  const [roomInfo, setRoomInfo] = useState(room || {});
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedIds, setExpandedIds] = useState([]);
  const [actionsVisible, setActionsVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState(room?.name || room?.title || room?.naziv || '');
  const [editDesc, setEditDesc] = useState(room?.description || room?.opis || '');
  const [savingRoom, setSavingRoom] = useState(false);
  const [deletingRoom, setDeletingRoom] = useState(false);
  const listRef = useRef(null);
  const roomId = roomInfo?._id || roomInfo?.id;

  const sortMessagesAsc = useCallback((arr) => {
    return [...(arr || [])].sort((a, b) => {
      const da = new Date(a?.kreiranDatum || a?.createdAt || 0).getTime();
      const db = new Date(b?.kreiranDatum || b?.createdAt || 0).getTime();
      return da - db;
    });
  }, []);

  const normalizeMessage = useCallback((msg) => {
    if (!msg || typeof msg !== 'object') return msg;

    const chatRoomId = msg.chatRoomId || msg.chatRoom || msg.chatroomId;
    const senderObj = msg.senderId || msg.sender;
    const senderId = senderObj?._id || senderObj || null;
    const senderName = msg.senderName
      || (senderObj && `${senderObj.ime || ''} ${senderObj.prezime || ''}`.trim())
      || (msg.sender?.name)
      || '';

    return {
      ...msg,
      id: msg.id || msg._id,
      _id: msg._id || msg.id,
      chatRoomId: chatRoomId,
      chatroomId: chatRoomId,
      sender: senderId,
      senderId: senderObj,
      senderName,
      tekst: msg.tekst || msg.content,
      isRead: msg.isRead || [],
      kreiranDatum: msg.kreiranDatum || msg.createdAt || msg.azuriranDatum,
      accentKey: msg.accentKey || msg.bojaKorisnika || msg.colorKey,
    };
  }, []);

  const markUnreadAsRead = useCallback(async (msgs) => {
    if (!online || !user?._id) return;
    const myId = user._id || user.id;
    const unread = (msgs || []).filter((m) => {
      if (!m?._id) return false;
      const senderId = m.sender?._id || m.sender || m.senderId;
      const already = (m.isRead || []).map(String).includes(String(myId));
      return senderId !== myId && !already;
    });

    for (const msg of unread) {
      try {
        await messagesAPI.markAsRead(msg._id);
        messageDB.insert?.({ ...msg, isRead: [...(msg.isRead || []), myId], synced: 1 });
      } catch (err) {
        console.log('Mark as read failed', err?.message);
      }
    }
  }, [online, user]);

  const loadMessages = useCallback(async () => {
    if (!roomId) return;
    try {
      if (online) {
        const res = await messagesAPI.getByRoom(roomId);
        const data = res.data?.data || res.data || [];
        const normalized = Array.isArray(data) ? data.map(normalizeMessage) : [];
        const synced = normalized.map((m) => ({ ...m, synced: 1 }));
        messageDB.bulkInsert?.(synced);

        const localCached = messageDB.getByRoom?.(roomId) || [];
        const localUnsynced = localCached.filter((m) => !m.synced);
        const mergedById = new Map();
        [...synced, ...localUnsynced.map(normalizeMessage)].forEach((msg) => {
          if (!msg) return;
          const key = msg._id || msg.id;
          if (!key) return;
          mergedById.set(key, msg);
        });
        setMessages(sortMessagesAsc(Array.from(mergedById.values())));

        for (const msg of localUnsynced) {
          const mine = (msg.sender?._id || msg.sender || msg.senderId) === (user?._id || user?.id);
          if (!mine) continue;
          try {
            const sendRes = await messagesAPI.send({ chatRoomId: room._id || room.id, tekst: msg.tekst || msg.content });
            const savedMsg = normalizeMessage(sendRes.data?.data || sendRes.data);
            if (savedMsg?._id) {
              messageDB.insert?.({ ...savedMsg, synced: 1 });
              mergedById.set(savedMsg._id, { ...savedMsg, synced: 1 });
              mergedById.delete(msg.id || msg._id);
            }
          } catch (retryErr) {
            console.log('Retry slanja poruke nije uspio:', retryErr?.message);
          }
        }

        setMessages(sortMessagesAsc(Array.from(mergedById.values())));
        await markUnreadAsRead(Array.from(mergedById.values()));
      } else {
        const cached = messageDB.getByRoom?.(room._id || room.id) || [];
        setMessages(sortMessagesAsc(cached.map(normalizeMessage)));
      }
    } catch (e) {
      console.log('Chat load failed', e?.message);
      const cached = messageDB.getByRoom?.(roomId) || [];
      setMessages(sortMessagesAsc(cached.map(normalizeMessage)));
    }
  }, [roomId, online, normalizeMessage, markUnreadAsRead, sortMessagesAsc, room, user]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMessages();
    setRefreshing(false);
  };

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (listRef.current?.scrollToEnd) {
        listRef.current.scrollToEnd({ animated: false });
      }
    });
  }, []);

  useEffect(() => {
    if (messages.length) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  const handleSend = async () => {
    if (!text.trim() || !roomId) return;
    const message = normalizeMessage({
      id: `local_${Date.now()}`,
      chatRoomId: roomId,
      sender: user?._id || user?.id,
      senderId: user,
      senderName: `${user?.ime || ''} ${user?.prezime || ''}`.trim() || user?.email,
      tekst: text.trim(),
      kreiranDatum: new Date().toISOString(),
      synced: 0,
      accentKey: undefined,
    });
    setMessages((prev) => sortMessagesAsc([...prev, message]));
    setText('');
    try {
      setSending(true);
      const res = await messagesAPI.send({
        chatRoomId: roomId,
        tekst: message.tekst,
      });
      const saved = res.data?.data || res.data;
      if (saved?._id) {
        const normalizedSaved = normalizeMessage(saved);
        messageDB.insert?.(normalizedSaved);
        setMessages((prev) =>
          prev.map((m) => (m.id === message.id ? { ...normalizedSaved, synced: 1 } : m))
        );
      } else {
        setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, synced: 0 } : m)));
      }
    } catch (e) {
      console.log('Send message failed', e?.message);
      messageDB.insert?.(message);
    } finally {
      setSending(false);
    }
  };

  const openEditRoom = () => {
    setEditName(roomInfo?.name || roomInfo?.title || roomInfo?.naziv || '');
    setEditDesc(roomInfo?.description || roomInfo?.opis || '');
    setActionsVisible(false);
    setEditVisible(true);
  };

  const handleSaveRoom = async () => {
    if (!roomId || !editName.trim()) {
      setEditVisible(false);
      return;
    }
    setSavingRoom(true);
    const payload = { name: editName.trim(), description: editDesc.trim() || undefined };
    try {
      const res = await chatroomsAPI.update(roomId, payload);
      const updated = res.data?.data || res.data || { ...roomInfo, ...payload };
      setRoomInfo(updated);
      chatroomDB?.insertOrReplace?.(updated);
      setEditVisible(false);
    } catch (err) {
      console.log('Update room failed', err?.message);
    } finally {
      setSavingRoom(false);
    }
  };

  const handleDeleteRoom = async () => {
    if (!canDelete) {
      Alert.alert('Nedovoljno prava', 'Samo administratori ili menadžeri mogu obrisati sobu.');
      return;
    }
    if (!roomId) return;
    setActionsVisible(false);
    Alert.alert(
      'Obrisi chat sobu',
      'Sigurno zelis obrisati ovu sobu i sve poruke u njoj?',
      [
        { text: 'Odustani', style: 'cancel' },
        {
          text: 'Obrisi',
          style: 'destructive',
          onPress: async () => {
            setDeletingRoom(true);
            try {
              await chatroomsAPI.delete(roomId);
              chatroomDB?.remove?.(roomId);
              navigation.goBack();
            } catch (err) {
              console.log('Delete room failed', err?.message);
            } finally {
              setDeletingRoom(false);
            }
          },
        },
      ],
    );
  };

  const handleDelete = async (id) => {
    if (!canDelete) {
      Alert.alert('Nedovoljno prava', 'Samo administratori ili menadžeri mogu brisati poruke.');
      return;
    }
    const msg = messages.find((m) => m._id === id || m.id === id);
    if (!msg) return;
    setMessages((prev) => prev.filter((m) => m._id !== id && m.id !== id));
    try {
      if (online && msg._id) {
        await messagesAPI.delete(msg._id);
      }
      messageDB.remove?.(msg._id || msg.id);
    } catch (e) {
      console.log('Delete message failed', e?.message);
    }
  };

  const formatDateHeading = useCallback((value) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const dateOnly = date.toDateString();
    if (dateOnly === today.toDateString()) return 'Danas';
    if (dateOnly === yesterday.toDateString()) return 'Jucer';
    return date.toLocaleDateString('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }, []);

  const formatTimeLabel = useCallback((value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit' });
  }, []);

  const decoratedMessages = useMemo(() => {
    const result = [];
    let lastDateKey = '';
    (messages || []).forEach((msg) => {
      const rawDate = msg?.kreiranDatum || msg?.createdAt;
      const date = rawDate ? new Date(rawDate) : null;
      const dateKey = date && !Number.isNaN(date.getTime()) ? date.toDateString() : '';
      if (dateKey && dateKey !== lastDateKey) {
        result.push({ type: 'date', id: `date-${dateKey}`, label: formatDateHeading(date) });
        lastDateKey = dateKey;
      }
      result.push({ type: 'message', data: msg });
    });
    return result;
  }, [messages, formatDateHeading]);

  const renderItem = ({ item }) => {
    if (item.type === 'date') {
      return (
        <View style={styles.dateDivider}>
          <Text style={styles.dateLabel}>{item.label}</Text>
        </View>
      );
    }
    const msg = item.data || item;
    const mine = (msg.sender?._id || msg.sender || msg.senderId) === (user?._id || user?.id);
    const canDeleteMessage = canDelete;
    const accent = defaultAccent;
    const msgId = msg._id || msg.id;
    const expanded = msgId && expandedIds.includes(msgId);
    const toggleMeta = () => {
      if (!msgId) return;
      setExpandedIds((prev) => (prev.includes(msgId) ? prev.filter((id) => id !== msgId) : [...prev, msgId]));
    };
    const timeLabel = formatTimeLabel(msg.kreiranDatum);
    const statusIcon = msg.synced ? 'checkmark-done' : 'cloud-offline';
    const statusColor = msg.synced ? '#0f172a' : '#ea580c';
    const senderInitial = (msg.senderName || 'K')[0]?.toUpperCase?.() || 'K';
    return (
      <View style={[styles.messageRow, mine ? styles.messageMine : styles.messageOther]}>
        {!mine ? (
          <View style={styles.avatarMini}>
            <Text style={styles.avatarMiniText}>{senderInitial}</Text>
          </View>
        ) : null}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={toggleMeta}
          style={[
            styles.messageBubble,
            mine ? styles.bubbleMine : styles.bubbleOther,
          ]}
        >
          {!mine && (
            <Text style={styles.senderName} numberOfLines={1}>
              {msg.senderName || msg.sender?.name || 'Korisnik'}
            </Text>
          )}
          <Text style={styles.messageText}>{msg.tekst || msg.content}</Text>
          {expanded && (
            <View style={styles.expandedRow}>
              <View style={styles.expandedMeta}>
                <View style={styles.metaRow}>
                  <Ionicons name="time-outline" size={14} color="#0f172a" />
                  <Text style={styles.metaText}>{timeLabel}</Text>
                </View>
                {mine && (
                  <View style={styles.statusWrap}>
                    <Ionicons name={statusIcon} size={14} color={statusColor} />
                    <Text style={[styles.metaText, { color: statusColor }]}>
                      {msg.synced ? 'Poslano' : 'Offline cuvanje'}
                    </Text>
                  </View>
                )}
              </View>
              {canDeleteMessage && (
                <View style={styles.messageActionsRow}>
                  <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(msgId)}>
                    <Ionicons name="trash-outline" size={16} color="#ef4444" />
                    <Text style={[styles.deleteText, { color: '#0f172a' }]}>Obrisi</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const roomTitle = roomInfo?.name || roomInfo?.title || roomInfo?.naziv || 'Chat';
  const roomDesc = roomInfo?.description || roomInfo?.opis || '';

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
            <Text style={styles.headerTitle} numberOfLines={1}>{roomTitle}</Text>
            {roomDesc ? <Text style={styles.headerSubtitle} numberOfLines={1}>{roomDesc}</Text> : null}
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.iconButton} onPress={() => setActionsVisible(true)}>
              <Ionicons name="ellipsis-vertical" size={18} color="#e2e8f0" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 50 : 0}
      >
        <FlatList
          ref={listRef}
          data={decoratedMessages}
          keyExtractor={(item, index) => item.type === 'date' ? item.id : item._id || item.id || `msg-${index}`}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={scrollToBottom}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubble-ellipses-outline" size={38} color="#cbd5e1" />
              <Text style={styles.emptyText}>Jos nema poruka</Text>
              <Text style={styles.emptySub}>Zapocni razgovor ispod.</Text>
            </View>
          }
        />

        <View style={styles.inputBar}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              placeholder="Upisi poruku..."
              value={text}
              onChangeText={setText}
              multiline
              placeholderTextColor="#94a3b8"
            />
          </View>
          <TouchableOpacity
            style={[
              styles.sendButton,
              { backgroundColor: SEND_COLOR },
              (!text.trim() || sending) && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
          >
            {sending ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={18} color="#fff" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={actionsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setActionsVisible(false)}
      >
        <View style={styles.actionOverlay}>
          <View style={styles.actionSheet}>
            <TouchableOpacity style={styles.actionRow} onPress={openEditRoom}>
              <Ionicons name="create-outline" size={20} color="#0f172a" />
              <Text style={styles.actionText}>Uredi sobu</Text>
            </TouchableOpacity>
            {canDelete && (
              <TouchableOpacity style={styles.actionRow} onPress={handleDeleteRoom}>
                <Ionicons name="trash-outline" size={20} color="#ef4444" />
                <Text style={[styles.actionText, { color: '#ef4444' }]}>{deletingRoom ? 'Brisanje...' : 'Obrisi sobu'}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.actionRow} onPress={() => setActionsVisible(false)}>
              <Ionicons name="close-outline" size={20} color="#0f172a" />
              <Text style={styles.actionText}>Zatvori</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={editVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditVisible(false)}
      >
        <View style={styles.editOverlay}>
          <View style={styles.editCard}>
            <View style={styles.editHeader}>
              <Text style={styles.editTitle}>Uredi sobu</Text>
              <TouchableOpacity onPress={() => setEditVisible(false)}>
                <Ionicons name="close" size={22} color="#0f172a" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.editInput}
              placeholder="Naziv sobe"
              value={editName}
              onChangeText={setEditName}
            />
            <TextInput
              style={[styles.editInput, { marginTop: 10 }]}
              placeholder="Opis (opcionalno)"
              value={editDesc}
              onChangeText={setEditDesc}
            />
            <TouchableOpacity
              style={[styles.saveButton, (!editName.trim() || savingRoom) && styles.saveButtonDisabled]}
              onPress={handleSaveRoom}
              disabled={!editName.trim() || savingRoom}
            >
              {savingRoom ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>Spremi</Text>
              )}
            </TouchableOpacity>
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
    paddingBottom: 18,
    paddingTop: 12,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  blobOne: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#1d4ed8',
    opacity: 0.22,
    top: -40,
    right: -70,
  },
  blobTwo: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#0ea5e9',
    opacity: 0.18,
    top: -90,
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
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#e2e8f0' },
  headerSubtitle: { marginTop: 2, color: '#e2e8f0', fontSize: 14 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listContent: { padding: 12, paddingBottom: 150, paddingTop: 10 },
  dateDivider: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#e2e8f0',
    marginVertical: 6,
  },
  dateLabel: { color: '#475569', fontWeight: '700', fontSize: 12 },
  messageRow: { marginBottom: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  messageMine: { justifyContent: 'flex-end', alignSelf: 'flex-end' },
  messageOther: { justifyContent: 'flex-start', alignSelf: 'flex-start' },
  avatarMini: {
    width: 30,
    height: 30,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMiniText: { color: '#0f172a', fontWeight: '800' },
  messageBubble: {
    maxWidth: '86%',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#c5cedb',
    borderWidth: 1,
    borderColor: '#7c8599',
    position: 'relative',
  },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: '#c5cedb', borderColor: '#7c8599' },
  bubbleOther: { alignSelf: 'flex-start', backgroundColor: '#c5cedb', borderColor: '#7c8599' },
  senderName: { fontSize: 16, color: '#0b74b8', marginBottom: 4, fontWeight: '700' },
  messageText: { fontSize: 18, color: '#0f172a', lineHeight: 24 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12, color: '#0f172a' },
  statusWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  expandedRow: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  expandedMeta: { flexDirection: 'column', alignItems: 'flex-start' },
  messageActionsRow: { flexDirection: 'row', gap: 8 },
  deleteButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deleteText: { fontWeight: '700', fontSize: 12 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    gap: 10,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  input: {
    minHeight: 34,
    maxHeight: 120,
    fontSize: 16,
    color: '#0f172a',
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0ea5e9',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  sendButtonDisabled: { backgroundColor: '#9bdcf7' },
  empty: { alignItems: 'center', marginTop: 30 },
  emptyText: { marginTop: 8, color: '#94a3b8', fontWeight: '700' },
  emptySub: { color: '#cbd5e1', marginTop: 2 },
  actionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  actionSheet: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  actionText: { fontSize: 16, color: '#0f172a', fontWeight: '600' },
  editOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 16,
  },
  editCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  editInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  saveButton: {
    marginTop: 6,
    backgroundColor: '#0ea5e9',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});

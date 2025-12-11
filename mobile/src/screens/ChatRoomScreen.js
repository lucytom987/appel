import React, { useEffect, useState, useCallback, useRef } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { messagesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { messageDB } from '../database/db';

const colorChoices = [
  { key: 'sky', label: 'Sky', color: '#0ea5e9', bubble: 'rgba(14,165,233,0.12)', meta: '#0b6ea8' },
  { key: 'blue', label: 'Blue', color: '#2563eb', bubble: 'rgba(37,99,235,0.12)', meta: '#1d4ed8' },
  { key: 'indigo', label: 'Indigo', color: '#4f46e5', bubble: 'rgba(79,70,229,0.12)', meta: '#3730a3' },
  { key: 'violet', label: 'Violet', color: '#7c3aed', bubble: 'rgba(124,58,237,0.12)', meta: '#5b21b6' },
  { key: 'teal', label: 'Teal', color: '#0d9488', bubble: 'rgba(13,148,136,0.12)', meta: '#0f766e' },
  { key: 'emerald', label: 'Emerald', color: '#059669', bubble: 'rgba(5,150,105,0.12)', meta: '#065f46' },
  { key: 'lime', label: 'Lime', color: '#65a30d', bubble: 'rgba(101,163,13,0.12)', meta: '#4d7c0f' },
  { key: 'amber', label: 'Amber', color: '#d97706', bubble: 'rgba(217,119,6,0.12)', meta: '#92400e' },
  { key: 'rose', label: 'Rose', color: '#e11d48', bubble: 'rgba(225,29,72,0.12)', meta: '#9f1239' },
  { key: 'fuchsia', label: 'Fuchsia', color: '#c026d3', bubble: 'rgba(192,38,211,0.12)', meta: '#a21caf' },
  { key: 'slate', label: 'Slate', color: '#334155', bubble: 'rgba(51,65,85,0.12)', meta: '#1e293b' },
];

export default function ChatRoomScreen({ route, navigation }) {
  const { room } = route.params;
  const { user, isOnline } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [accentChoice, setAccentChoice] = useState(colorChoices[0]);
  const [expandedIds, setExpandedIds] = useState([]);
  const [showPalette, setShowPalette] = useState(false);
  const listRef = useRef(null);
  const sortMessagesAsc = useCallback((arr) => {
    return [...(arr || [])].sort((a, b) => {
      const da = new Date(a?.kreiranDatum || a?.createdAt || 0).getTime();
      const db = new Date(b?.kreiranDatum || b?.createdAt || 0).getTime();
      return da - db;
    });
  }, []);

  useEffect(() => {
    const loadAccent = async () => {
      const userId = user?._id || user?.id;
      if (!userId) return;
      try {
        const stored = await SecureStore.getItemAsync(`chatColor_${userId}`);
        const found = colorChoices.find((c) => c.key === stored);
        if (found) setAccentChoice(found);
      } catch (err) {
        console.log('Load chat color failed', err?.message);
      }
    };
    loadAccent();
  }, [user]);

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
    if (!isOnline || !user?._id) return;
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
  }, [isOnline, user]);

  const loadMessages = useCallback(async () => {
    try {
      if (isOnline) {
        const res = await messagesAPI.getByRoom(room._id || room.id);
        const data = res.data?.data || res.data || [];
        const normalized = Array.isArray(data) ? data.map(normalizeMessage) : [];
        const synced = normalized.map((m) => ({ ...m, synced: 1 }));
        messageDB.bulkInsert?.(synced);

        // Merge unsynced local messages (offline or failed sends)
        const localCached = messageDB.getByRoom?.(room._id || room.id) || [];
        const localUnsynced = localCached.filter((m) => !m.synced);
        const mergedById = new Map();
        [...synced, ...localUnsynced.map(normalizeMessage)].forEach((msg) => {
          if (!msg) return;
          const key = msg._id || msg.id;
          if (!key) return;
          mergedById.set(key, msg);
        });
        setMessages(sortMessagesAsc(Array.from(mergedById.values())));

        // Pokušaj ponovno poslati lokalne nesinkronizirane poruke tekućeg korisnika
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

        // Označi kao pročitane sve tuđe poruke
        await markUnreadAsRead(Array.from(mergedById.values()));
      } else {
        const cached = messageDB.getByRoom?.(room._id || room.id) || [];
        setMessages(sortMessagesAsc(cached.map(normalizeMessage)));
      }
    } catch (e) {
      console.log('Chat load failed', e?.message);
      const cached = messageDB.getByRoom?.(room._id || room.id) || [];
      setMessages(sortMessagesAsc(cached.map(normalizeMessage)));
    }
  }, [room, isOnline, normalizeMessage, markUnreadAsRead, sortMessagesAsc]);

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
    if (!text.trim()) return;
    const message = normalizeMessage({
      id: `local_${Date.now()}`,
      chatRoomId: room._id || room.id,
      sender: user?._id || user?.id,
      senderId: user,
      senderName: `${user?.ime || ''} ${user?.prezime || ''}`.trim() || user?.email,
      tekst: text.trim(),
      kreiranDatum: new Date().toISOString(),
      synced: 0,
      accentKey: accentChoice.key,
    });
    setMessages((prev) => sortMessagesAsc([...prev, message]));
    setText('');
    try {
      setSending(true);
      const res = await messagesAPI.send({
        chatRoomId: room._id || room.id,
        tekst: message.tekst,
        accentKey: accentChoice.key,
      });
      const saved = res.data?.data || res.data;
      if (saved?._id) {
        const normalizedSaved = normalizeMessage(saved);
        messageDB.insert?.(normalizedSaved);
        setMessages((prev) =>
          prev.map((m) => (m.id === message.id ? { ...normalizedSaved, synced: 1 } : m))
        );
      } else {
        // fallback: keep local message if response malformed
        setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, synced: 0 } : m)));
      }
    } catch (e) {
      console.log('Send message failed', e?.message);
      messageDB.insert?.(message);
    } finally {
      setSending(false);
    }
  };

  const handleColorSelect = async (choice) => {
    setAccentChoice(choice);
    const userId = user?._id || user?.id;
    if (!userId) return;
    try {
      await SecureStore.setItemAsync(`chatColor_${userId}`, choice.key);
    } catch (err) {
      console.log('Save chat color failed', err?.message);
    }
  };

  const handleDelete = async (id) => {
    const msg = messages.find((m) => m._id === id || m.id === id);
    if (!msg) return;
    setMessages((prev) => prev.filter((m) => m._id !== id && m.id !== id));
    try {
      if (isOnline && msg._id) {
        await messagesAPI.delete(msg._id);
      }
      messageDB.remove?.(msg._id || msg.id);
    } catch (e) {
      console.log('Delete message failed', e?.message);
    }
  };

  const renderItem = ({ item }) => {
    const mine = (item.sender?._id || item.sender || item.senderId) === (user?._id || user?.id);
    const accent = colorChoices.find((c) => c.key === item.accentKey) || (mine ? accentChoice : colorChoices[0]);
    const msgId = item._id || item.id;
    const expanded = msgId && expandedIds.includes(msgId);
    const toggleMeta = () => {
      if (!msgId) return;
      setExpandedIds((prev) => (prev.includes(msgId) ? prev.filter((id) => id !== msgId) : [...prev, msgId]));
    };
    return (
      <View style={[styles.messageRow, mine ? styles.messageMine : styles.messageOther]}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={toggleMeta}
          style={[
            styles.messageBubble,
            mine ? styles.bubbleMine : styles.bubbleOther,
            mine && { backgroundColor: accent.bubble, borderColor: accent.color },
          ]}
        >
          <Text style={[styles.senderName, mine && { color: accent.color }]}>{item.senderName || item.sender?.name || 'Korisnik'}</Text>
          <Text style={[styles.messageText, mine && { color: accent.color }]}>{item.tekst || item.content}</Text>
          {expanded && (
            <View style={styles.metaRow}>
              <Text style={[styles.metaText, mine && { color: accent.meta }]}>
                {item.kreiranDatum ? new Date(item.kreiranDatum).toLocaleString('hr-HR') : ''}
              </Text>
              {mine && (
                <TouchableOpacity onPress={() => handleDelete(item._id || item.id)}>
                  <Ionicons name="trash-outline" size={16} color={accent.meta} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const roomTitle = room?.name || room?.title || room?.naziv || 'Chat';
  const roomDesc = room?.description || room?.opis || '';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.heroTop}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#0f172a" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>{roomTitle}</Text>
            {roomDesc ? <Text style={styles.headerSubtitle} numberOfLines={1}>{roomDesc}</Text> : null}
          </View>
          <View style={styles.headerBadge}><Text style={styles.headerBadgeText}>Chat</Text></View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.select({ ios: 80, android: 30, default: 0 })}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item._id || item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={scrollToBottom}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />

        <View style={styles.colorPickerRow}>
          <Text style={styles.colorPickerLabel}>Tvoja boja:</Text>
          <TouchableOpacity style={styles.colorToggle} onPress={() => setShowPalette((v) => !v)}>
            <View style={[styles.colorDot, { backgroundColor: accentChoice.color, marginRight: 6 }]} />
            <Ionicons name={showPalette ? 'chevron-down' : 'chevron-forward'} size={18} color="#0f172a" />
          </TouchableOpacity>
        </View>
        {showPalette && (
          <View style={styles.colorDotsWrap}>
            {colorChoices.map((choice) => {
              const active = choice.key === accentChoice.key;
              return (
                <TouchableOpacity
                  key={choice.key}
                  style={[styles.colorDot, { backgroundColor: choice.color }, active && styles.colorDotActive]}
                  onPress={() => handleColorSelect(choice)}
                  accessibilityLabel={`Odaberi ${choice.label}`}
                />
              );
            })}
          </View>
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Upiši poruku..."
            value={text}
            onChangeText={setText}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: accentChoice.color }, (!text.trim() || sending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
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
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#0f172a' },
  headerSubtitle: { fontSize: 18, color: '#475569' },
  headerBadge: {
    backgroundColor: '#0ea5e9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  headerBadgeText: { color: '#0f172a', fontWeight: '800', fontSize: 12 },
  listContent: { padding: 10, paddingBottom: 140 },
  messageRow: { marginBottom: 8, flexDirection: 'row', flex: 1 },
  messageMine: { justifyContent: 'flex-end' },
  messageOther: { justifyContent: 'flex-start' },
  messageBubble: {
    maxWidth: '92%',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  bubbleMine: { backgroundColor: '#0ea5e9', borderWidth: 1, borderColor: '#0ea5e9' },
  bubbleOther: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  senderName: { fontSize: 14, color: '#0ea5e9', marginBottom: 4, fontWeight: '700' },
  messageText: { fontSize: 18, color: '#0f172a' },
  metaRow: { marginTop: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText: { fontSize: 12, color: '#475569' },
  colorPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 2,
    paddingBottom: 6,
  },
  colorPickerLabel: { color: '#475569', fontWeight: '700', marginRight: 8, fontSize: 16 },
  colorToggle: { flexDirection: 'row', alignItems: 'center' },
  colorDotsWrap: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingBottom: 4 },
  colorDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'transparent',
    marginRight: 8,
    marginBottom: 8,
  },
  colorDotActive: {
    borderColor: '#0f172a',
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 18,
    marginRight: 10,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
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
});

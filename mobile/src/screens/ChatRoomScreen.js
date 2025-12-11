import React, { useEffect, useState, useCallback } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { messagesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { messageDB } from '../database/db';

export default function ChatRoomScreen({ route, navigation }) {
  const { room } = route.params;
  const { user, isOnline } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
        setMessages(Array.from(mergedById.values()));

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

        setMessages(Array.from(mergedById.values()));

        // Označi kao pročitane sve tuđe poruke
        await markUnreadAsRead(Array.from(mergedById.values()));
      } else {
        const cached = messageDB.getByRoom?.(room._id || room.id) || [];
        setMessages(cached.map(normalizeMessage));
      }
    } catch (e) {
      console.log('Chat load failed', e?.message);
      const cached = messageDB.getByRoom?.(room._id || room.id) || [];
      setMessages(cached.map(normalizeMessage));
    }
  }, [room, isOnline, normalizeMessage, markUnreadAsRead]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMessages();
    setRefreshing(false);
  };

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
    });
    setMessages((prev) => [...prev, message]);
    setText('');
    try {
      setSending(true);
      const res = await messagesAPI.send({
        chatRoomId: room._id || room.id,
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
    return (
      <View style={[styles.messageRow, mine ? styles.messageMine : styles.messageOther]}>
        <View style={styles.messageBubble}>
          <Text style={styles.senderName}>{item.senderName || item.sender?.name || 'Korisnik'}</Text>
          <Text style={styles.messageText}>{item.tekst || item.content}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaText}>
              {item.kreiranDatum ? new Date(item.kreiranDatum).toLocaleString('hr-HR') : ''}
            </Text>
            {mine && (
              <TouchableOpacity onPress={() => handleDelete(item._id || item.id)}>
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  const roomTitle = room?.name || room?.title || room?.naziv || 'Chat';
  const roomDesc = room?.description || room?.opis || '';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{roomTitle}</Text>
          {roomDesc ? <Text style={styles.headerSubtitle} numberOfLines={1}>{roomDesc}</Text> : null}
        </View>
        <View style={{ width: 10 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.select({ ios: 80, android: 30, default: 0 })}
      >
        <FlatList
          data={messages}
          keyExtractor={(item) => item._id || item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Upiši poruku..."
            value={text}
            onChangeText={setText}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, (!text.trim() || sending) && styles.sendButtonDisabled]}
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
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  headerSubtitle: { fontSize: 13, color: '#6b7280' },
  listContent: { padding: 16, paddingBottom: 80 },
  messageRow: { marginBottom: 12, flexDirection: 'row' },
  messageMine: { justifyContent: 'flex-end' },
  messageOther: { justifyContent: 'flex-start' },
  messageBubble: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#f3e8ff',
  },
  senderName: { fontSize: 12, color: '#7c3aed', marginBottom: 4, fontWeight: '700' },
  messageText: { fontSize: 15, color: '#0f172a' },
  metaRow: { marginTop: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText: { fontSize: 11, color: '#6b7280' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  input: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginRight: 10,
    maxHeight: 120,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#7c3aed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { backgroundColor: '#c4b5fd' },
});

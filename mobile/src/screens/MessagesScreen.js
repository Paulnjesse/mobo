import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, KeyboardAvoidingView, Platform, StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { io } from 'socket.io-client';
import Constants from 'expo-constants';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { colors, spacing, radius } from '../theme';
import api from '../services/api';

const QUICK_REPLIES = [
  "I'm on my way",
  'Be there in 2 min',
  "I've arrived",
  "Can't find you",
];

const SOCKET_URL =
  process.env.EXPO_PUBLIC_SOCKET_URL ||
  Constants.expoConfig?.extra?.apiBaseUrl?.replace('/api', '') ||
  'http://localhost:3000';

export default function MessagesScreen({ navigation, route }) {
  const { rideId, otherName, otherRole } = route?.params || {};
  const { user, token } = useAuth();
  const { t } = useLanguage();

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const flatListRef = useRef(null);
  const socketRef = useRef(null);
  const myId = String(user?.id || '');
  const myRole = user?.role || 'rider';

  // ── Load message history ────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!rideId) { setLoading(false); return; }
    try {
      const res = await api.get(`/rides/${rideId}/messages`);
      const msgs = (res.data?.messages || []).map((m) => ({
        id: String(m.id || m.message_id || Date.now()),
        text: m.content || m.text || '',
        senderId: String(m.sender_id),
        senderName: m.sender_name || '',
        senderRole: m.sender_role || '',
        time: new Date(m.created_at || m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }));
      setMessages(msgs);
    } catch (err) {
      console.warn('[Messages] history load failed:', err.message);
    } finally {
      setLoading(false);
    }
  }, [rideId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // ── Socket connection ───────────────────────────────────────────────────
  useEffect(() => {
    if (!rideId || !token) return;

    const socket = io(`${SOCKET_URL}/rides`, {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join_ride', { rideId });
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('message', (payload) => {
      // Avoid duplicate from own optimistic append
      setMessages((prev) => {
        const isDup = prev.some(
          (m) => m.id === payload.messageId || (m._optimistic && m.text === payload.text && m.senderId === payload.senderId)
        );
        if (isDup) {
          // Replace optimistic copy with server-confirmed one
          return prev.map((m) =>
            m._optimistic && m.text === payload.text && m.senderId === payload.senderId
              ? {
                  id: payload.messageId,
                  text: payload.text,
                  senderId: payload.senderId,
                  senderName: payload.senderName,
                  senderRole: payload.senderRole,
                  time: new Date(payload.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                }
              : m
          );
        }
        return [
          ...prev,
          {
            id: payload.messageId,
            text: payload.text,
            senderId: payload.senderId,
            senderName: payload.senderName,
            senderRole: payload.senderRole,
            time: new Date(payload.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ];
      });
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [rideId, token]);

  // ── Scroll to bottom when history loads ────────────────────────────────
  useEffect(() => {
    if (!loading && messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 120);
    }
  }, [loading]);

  // ── Send message ────────────────────────────────────────────────────────
  const sendMessage = useCallback((text) => {
    const msg = (text || inputText).trim();
    if (!msg) return;

    // Optimistic add
    const tempId = `opt_${Date.now()}`;
    const now = new Date();
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        text: msg,
        senderId: myId,
        senderName: user?.full_name || 'Me',
        senderRole: myRole,
        time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        _optimistic: true,
      },
    ]);
    setInputText('');
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);

    if (socketRef.current?.connected && rideId) {
      socketRef.current.emit('message', {
        rideId,
        text: msg,
        senderId: myId,
        senderName: user?.full_name,
        senderRole: myRole,
      });
    } else {
      // Fallback: REST
      api.post(`/rides/${rideId}/messages`, { content: msg }).catch(() => {});
    }
  }, [inputText, myId, myRole, rideId, user?.full_name]);

  // ── Render message bubble ───────────────────────────────────────────────
  const renderMessage = ({ item, index }) => {
    const isMe = item.senderId === myId;
    const showAvatar = !isMe && (index === 0 || messages[index - 1]?.senderId === myId);
    const avatarLetter = (item.senderName || otherName || 'D')[0].toUpperCase();

    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}>
        {!isMe && (
          <View style={[styles.avatar, !showAvatar && styles.avatarHidden]}>
            <Text style={styles.avatarText}>{avatarLetter}</Text>
          </View>
        )}
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem, item._optimistic && styles.bubbleOptimistic]}>
          <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
            {item.text}
          </Text>
        </View>
        {isMe && <Text style={styles.timeText}>{item.time}</Text>}
      </View>
    );
  };

  const displayName = otherName || (myRole === 'driver' ? t('rider') || 'Rider' : t('driver') || 'Driver');

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.driverAvatar}>
            <Text style={styles.driverAvatarText}>{displayName[0].toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.headerName}>{displayName}</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: connected ? colors.success : colors.gray400 }]} />
              <Text style={[styles.headerStatus, { color: connected ? colors.success : colors.gray400 }]}>
                {connected ? 'Connected' : 'Reconnecting…'}
              </Text>
            </View>
          </View>
        </View>
        <TouchableOpacity style={styles.callBtn}>
          <Ionicons name="call-outline" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={[styles.messagesList, messages.length === 0 && styles.messagesListEmpty]}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Ionicons name="chatbubbles-outline" size={48} color={colors.gray300} />
                <Text style={styles.emptyText}>No messages yet. Say hi!</Text>
              </View>
            }
          />
        )}

        {/* Quick replies */}
        <FlatList
          data={QUICK_REPLIES}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.quickRepliesRow}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.quickReplyChip} onPress={() => sendMessage(item)} activeOpacity={0.8}>
              <Text style={styles.quickReplyText}>{item}</Text>
            </TouchableOpacity>
          )}
        />

        {/* Input bar */}
        <View style={styles.inputBar}>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Message…"
              placeholderTextColor={colors.textLight}
              multiline
              maxLength={300}
              onSubmitEditing={() => sendMessage()}
              blurOnSubmit={false}
            />
          </View>
          <TouchableOpacity
            style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
            onPress={() => sendMessage()}
            disabled={!inputText.trim()}
            activeOpacity={0.8}
          >
            <Ionicons name="send" size={18} color={inputText.trim() ? colors.white : colors.gray400} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray200,
    gap: spacing.md,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  driverAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  driverAvatarText: { fontSize: 16, fontWeight: '800', color: colors.white },
  headerName: { fontSize: 15, fontWeight: '700', color: colors.text },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  headerStatus: { fontSize: 12, fontWeight: '500' },
  callBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,0,191,0.1)', alignItems: 'center', justifyContent: 'center' },

  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  messagesList: { padding: spacing.md, paddingBottom: spacing.sm, flexGrow: 1, justifyContent: 'flex-end' },
  messagesListEmpty: { justifyContent: 'center' },
  emptyWrap: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: spacing.sm, gap: spacing.xs },
  msgRowMe: { justifyContent: 'flex-end' },
  msgRowThem: { justifyContent: 'flex-start' },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarHidden: { opacity: 0 },
  avatarText: { fontSize: 13, fontWeight: '800', color: colors.white },
  bubble: { maxWidth: '72%', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg },
  bubbleMe: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  bubbleOptimistic: { opacity: 0.75 },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  bubbleTextMe: { color: colors.white },
  bubbleTextThem: { color: colors.text },
  timeText: { fontSize: 10, color: colors.textLight, alignSelf: 'flex-end', marginBottom: 2 },

  quickRepliesRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  quickReplyChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    backgroundColor: colors.surface, borderRadius: radius.round,
    borderWidth: 1, borderColor: colors.gray200,
  },
  quickReplyText: { fontSize: 13, color: colors.text, fontWeight: '500' },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.gray200,
  },
  inputWrap: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm - 2, minHeight: 44,
  },
  input: { fontSize: 15, color: colors.text, maxHeight: 100 },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.gray200 },
});

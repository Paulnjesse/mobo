import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
  StatusBar, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, shadows } from '../theme';
import api from '../services/api';

const CATEGORIES = [
  { key: 'general',      label: 'General',       icon: 'help-circle-outline' },
  { key: 'payment',      label: 'Payment',        icon: 'card-outline' },
  { key: 'cancellation', label: 'Cancellation',   icon: 'close-circle-outline' },
  { key: 'lost_item',    label: 'Lost Item',       icon: 'briefcase-outline' },
  { key: 'safety',       label: 'Safety',          icon: 'shield-checkmark-outline' },
  { key: 'driver',       label: 'Driver Issue',    icon: 'car-outline' },
  { key: 'account',      label: 'Account',         icon: 'person-outline' },
];

function fmtTime(d) {
  return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function SupportChatScreen({ navigation, route }) {
  const { colors } = useTheme();
  const { rideId } = route.params || {};

  const [phase, setPhase] = useState('pick'); // 'pick' | 'chat'
  const [category, setCategory] = useState('general');
  const [ticketId, setTicketId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [ticketStatus, setTicketStatus] = useState('open');
  const listRef = useRef(null);
  const pollRef = useRef(null);

  // Open / reopen ticket for chosen category
  const openTicket = useCallback(async (cat) => {
    setLoading(true);
    try {
      const r = await api.post('/rides/support/tickets', {
        subject: `Support request: ${cat}`,
        category: cat,
        ride_id: rideId || null,
      });
      setTicketId(r.data.ticket_id || r.data.ticket?.id);
      setCategory(cat);
      setPhase('chat');
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.error || 'Could not open ticket.');
    } finally {
      setLoading(false);
    }
  }, [rideId]);

  // Load messages for open ticket
  const loadMessages = useCallback(async () => {
    if (!ticketId) return;
    try {
      const r = await api.get(`/rides/support/tickets/${ticketId}/messages`);
      setMessages(r.data.messages || []);
      setTicketStatus(r.data.ticket?.status || 'open');
    } catch { /* silent */ }
  }, [ticketId]);

  useEffect(() => {
    if (phase !== 'chat') return;
    loadMessages();
    pollRef.current = setInterval(loadMessages, 5000); // poll every 5s
    return () => clearInterval(pollRef.current);
  }, [phase, loadMessages]);

  useEffect(() => {
    if (messages.length > 0) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages.length]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || !ticketId) return;
    setInput('');
    setSending(true);
    try {
      await api.post(`/rides/support/tickets/${ticketId}/messages`, { content: text });
      await loadMessages();
    } catch {
      setInput(text); // restore on failure
    } finally {
      setSending(false);
    }
  };

  const closeTicket = () => {
    Alert.alert('Close Ticket', 'Mark this issue as resolved?', [
      { text: 'Cancel' },
      {
        text: 'Resolve', onPress: async () => {
          try {
            await api.patch(`/rides/support/tickets/${ticketId}/close`);
            setTicketStatus('closed');
          } catch { /* silent */ }
        },
      },
    ]);
  };

  const s = makeStyles(colors);

  // ── Category picker ─────────────────────────────────────────────────────────
  if (phase === 'pick') {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <StatusBar barStyle={colors.text === '#FFFFFF' ? 'light-content' : 'dark-content'} />
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Support Chat</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={s.pickBody}>
          <View style={s.heroWrap}>
            <View style={s.heroIcon}>
              <Ionicons name="chatbubbles" size={40} color={colors.primary} />
            </View>
            <Text style={s.heroTitle}>How can we help?</Text>
            <Text style={s.heroSub}>Choose a topic and our support bot will assist you immediately. Human agents available 24/7.</Text>
          </View>

          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.key}
              style={s.catRow}
              onPress={() => openTicket(cat.key)}
              activeOpacity={0.75}
              disabled={loading}
            >
              <View style={[s.catIcon, { backgroundColor: colors.secondaryLight }]}>
                <Ionicons name={cat.icon} size={20} color={colors.primary} />
              </View>
              <Text style={s.catLabel}>{cat.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.gray400} />
            </TouchableOpacity>
          ))}
          {loading && <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.primary} />}
        </View>
      </SafeAreaView>
    );
  }

  // ── Chat view ───────────────────────────────────────────────────────────────
  const catInfo = CATEGORIES.find((c) => c.key === category) || CATEGORIES[0];
  const isClosed = ticketStatus === 'closed' || ticketStatus === 'resolved';

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle={colors.text === '#FFFFFF' ? 'light-content' : 'dark-content'} />
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => setPhase('pick')}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.headerTitle}>MOBO Support</Text>
          <Text style={s.headerSub}>{catInfo.label}</Text>
        </View>
        <TouchableOpacity style={s.backBtn} onPress={closeTicket} disabled={isClosed}>
          <Ionicons name="checkmark-done-outline" size={20} color={isClosed ? colors.gray400 : colors.success} />
        </TouchableOpacity>
      </View>

      {/* Status chip */}
      {ticketStatus !== 'open' && (
        <View style={[s.statusChip, { backgroundColor: isClosed ? colors.gray100 : 'rgba(0,166,81,0.1)' }]}>
          <Ionicons
            name={isClosed ? 'checkmark-circle' : 'person'}
            size={14}
            color={isClosed ? colors.gray500 : colors.success}
          />
          <Text style={[s.statusChipText, { color: isClosed ? colors.gray500 : colors.success }]}>
            {isClosed ? 'Ticket resolved' : 'Agent connected'}
          </Text>
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={s.msgList}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item: msg }) => {
            const isUser = msg.sender_role === 'user';
            const isBot  = msg.sender_role === 'bot';
            return (
              <View style={[s.bubble, isUser ? s.bubbleUser : s.bubbleAgent]}>
                {!isUser && (
                  <View style={[s.avatarWrap, { backgroundColor: isBot ? colors.primary : colors.success }]}>
                    <Ionicons name={isBot ? 'sparkles' : 'person'} size={12} color="#fff" />
                  </View>
                )}
                <View style={[s.bubbleContent, isUser ? s.bubbleContentUser : s.bubbleContentAgent, { backgroundColor: isUser ? colors.primary : colors.gray100 }]}>
                  <Text style={[s.bubbleText, { color: isUser ? '#fff' : colors.text }]}>{msg.content}</Text>
                  <Text style={[s.bubbleTime, { color: isUser ? 'rgba(255,255,255,0.65)' : colors.textLight }]}>{fmtTime(msg.created_at)}</Text>
                </View>
              </View>
            );
          }}
        />

        {!isClosed && (
          <View style={[s.inputBar, { borderTopColor: colors.gray200, backgroundColor: colors.white }]}>
            <TextInput
              style={[s.inputField, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.gray200 }]}
              placeholder="Type a message…"
              placeholderTextColor={colors.textLight}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              style={[s.sendBtn, { backgroundColor: input.trim() ? colors.primary : colors.gray200 }]}
              onPress={sendMessage}
              disabled={!input.trim() || sending}
            >
              {sending
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="send" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
        )}
        {isClosed && (
          <View style={[s.closedBar, { backgroundColor: colors.gray100 }]}>
            <Text style={[s.closedText, { color: colors.textSecondary }]}>This ticket is resolved. Open a new chat if you need more help.</Text>
            <TouchableOpacity onPress={() => setPhase('pick')}>
              <Text style={[s.closedNewBtn, { color: colors.primary }]}>New Chat</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: spacing.md, paddingVertical: spacing.md,
      backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.gray200,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
    headerSub: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },

    pickBody: { flex: 1, padding: spacing.md },
    heroWrap: { alignItems: 'center', paddingVertical: spacing.lg },
    heroIcon: {
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: colors.secondaryLight,
      alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
    },
    heroTitle: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
    heroSub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
    catRow: {
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      backgroundColor: colors.white, borderRadius: radius.md,
      padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm,
    },
    catIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    catLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },

    statusChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: spacing.md, paddingVertical: 6,
    },
    statusChipText: { fontSize: 13, fontWeight: '600' },

    msgList: { padding: spacing.md, gap: spacing.sm },
    bubble: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs, marginBottom: spacing.sm },
    bubbleUser: { justifyContent: 'flex-end' },
    bubbleAgent: { justifyContent: 'flex-start' },
    avatarWrap: {
      width: 24, height: 24, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center', marginBottom: 4,
    },
    bubbleContent: {
      maxWidth: '78%', borderRadius: radius.lg, padding: spacing.sm + 4,
    },
    bubbleContentUser: { borderBottomRightRadius: 4 },
    bubbleContentAgent: { borderBottomLeftRadius: 4 },
    bubbleText: { fontSize: 14, lineHeight: 20 },
    bubbleTime: { fontSize: 10, marginTop: 4, textAlign: 'right' },

    inputBar: {
      flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm,
      padding: spacing.sm, borderTopWidth: 1,
    },
    inputField: {
      flex: 1, minHeight: 44, maxHeight: 120, borderRadius: radius.pill,
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
      fontSize: 14, borderWidth: 1,
    },
    sendBtn: {
      width: 44, height: 44, borderRadius: 22,
      alignItems: 'center', justifyContent: 'center',
    },

    closedBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      padding: spacing.md, gap: spacing.sm,
    },
    closedText: { flex: 1, fontSize: 13 },
    closedNewBtn: { fontSize: 14, fontWeight: '700' },
  });
}

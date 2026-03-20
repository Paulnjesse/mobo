import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Modal, Switch
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

const FamilyAccountScreen = ({ navigation }) => {
  const [family, setFamily] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [familyName, setFamilyName] = useState('My Family');
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteLimit, setInviteLimit] = useState('');
  const [canSeeRides, setCanSeeRides] = useState(false);
  const [creating, setCreating] = useState(false);
  const [inviting, setInviting] = useState(false);

  useEffect(() => { loadFamily(); }, []);

  const loadFamily = async () => {
    try {
      const res = await api.get('/social/family');
      setFamily(res.data.family);
      setMembers(res.data.members);
    } catch (e) {
      if (e.response?.status !== 404) Alert.alert('Error', 'Failed to load family account');
    } finally {
      setLoading(false);
    }
  };

  const createFamily = async () => {
    setCreating(true);
    try {
      await api.post('/social/family', {
        name: familyName,
        monthly_limit: monthlyLimit ? parseInt(monthlyLimit) : null
      });
      setShowCreate(false);
      loadFamily();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to create family account');
    } finally {
      setCreating(false);
    }
  };

  const inviteMember = async () => {
    setInviting(true);
    try {
      await api.post('/social/family/members', {
        phone: invitePhone,
        monthly_spend_limit: inviteLimit ? parseInt(inviteLimit) : null,
        can_see_rides: canSeeRides
      });
      Alert.alert('Success', 'Member added to family account');
      setShowInvite(false);
      setInvitePhone('');
      loadFamily();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to invite member');
    } finally {
      setInviting(false);
    }
  };

  const removeMember = (userId, name) => {
    Alert.alert('Remove Member', `Remove ${name} from family account?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/social/family/members/${userId}`);
            loadFamily();
          } catch (e) {
            Alert.alert('Error', 'Failed to remove member');
          }
        }
      }
    ]);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#FF00BF" /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.title}>Family Account</Text>
      </View>

      {!family ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={64} color="#ddd" />
          <Text style={styles.emptyTitle}>No Family Account</Text>
          <Text style={styles.emptySub}>Create a family account to share rides and payments with up to 5 members.</Text>
          <TouchableOpacity style={styles.createBtn} onPress={() => setShowCreate(true)}>
            <Text style={styles.createBtnText}>Create Family Account</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView>
          <View style={styles.familyCard}>
            <Ionicons name="home" size={24} color="#FF00BF" />
            <Text style={styles.familyName}>{family.name}</Text>
            <Text style={styles.familyMeta}>{members.length}/{family.max_members} members</Text>
            {family.monthly_limit && (
              <Text style={styles.familyLimit}>Monthly limit: {family.monthly_limit.toLocaleString()} XAF</Text>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Members</Text>
              <TouchableOpacity onPress={() => setShowInvite(true)} style={styles.addBtn}>
                <Ionicons name="add" size={18} color="#FF00BF" />
                <Text style={styles.addBtnText}>Add</Text>
              </TouchableOpacity>
            </View>

            {members.map(m => (
              <View key={m.id} style={styles.memberRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{m.full_name?.[0] || '?'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{m.full_name}</Text>
                  <Text style={styles.memberPhone}>{m.phone}</Text>
                  {m.monthly_spend_limit && (
                    <Text style={styles.memberLimit}>Limit: {m.monthly_spend_limit.toLocaleString()} XAF/mo</Text>
                  )}
                </View>
                <View style={styles.memberRight}>
                  <View style={[styles.roleBadge, m.role === 'owner' ? styles.ownerBadge : styles.memberBadge]}>
                    <Text style={styles.roleText}>{m.role}</Text>
                  </View>
                  {m.role !== 'owner' && (
                    <TouchableOpacity onPress={() => removeMember(m.user_id, m.full_name)} style={{ marginTop: 4 }}>
                      <Ionicons name="close-circle-outline" size={20} color="#999" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Create Modal */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Create Family Account</Text>
            <TextInput style={styles.input} value={familyName} onChangeText={setFamilyName} placeholder="Family name" />
            <TextInput style={styles.input} value={monthlyLimit} onChangeText={setMonthlyLimit} placeholder="Monthly limit (XAF, optional)" keyboardType="numeric" />
            <TouchableOpacity style={styles.modalBtn} onPress={createFamily} disabled={creating}>
              {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnText}>Create</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowCreate(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Invite Modal */}
      <Modal visible={showInvite} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Add Member</Text>
            <TextInput style={styles.input} value={invitePhone} onChangeText={setInvitePhone} placeholder="Phone number" keyboardType="phone-pad" />
            <TextInput style={styles.input} value={inviteLimit} onChangeText={setInviteLimit} placeholder="Monthly spend limit (optional)" keyboardType="numeric" />
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Can see ride history</Text>
              <Switch value={canSeeRides} onValueChange={setCanSeeRides} trackColor={{ true: '#FF00BF' }} />
            </View>
            <TouchableOpacity style={styles.modalBtn} onPress={inviteMember} disabled={inviting}>
              {inviting ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnText}>Add Member</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowInvite(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 50, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#1A1A1A' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1A1A1A', marginTop: 16 },
  emptySub: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 8, marginBottom: 24 },
  createBtn: { backgroundColor: '#FF00BF', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  familyCard: { margin: 16, padding: 20, backgroundColor: '#FFF0FA', borderRadius: 16, alignItems: 'center' },
  familyName: { fontSize: 20, fontWeight: '800', color: '#1A1A1A', marginTop: 8 },
  familyMeta: { fontSize: 13, color: '#666', marginTop: 4 },
  familyLimit: { fontSize: 13, color: '#FF00BF', marginTop: 4, fontWeight: '600' },
  section: { margin: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addBtnText: { color: '#FF00BF', fontWeight: '600' },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FF00BF', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  memberName: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
  memberPhone: { fontSize: 12, color: '#666' },
  memberLimit: { fontSize: 12, color: '#FF00BF', fontWeight: '500' },
  memberRight: { alignItems: 'center' },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  ownerBadge: { backgroundColor: '#FF00BF' },
  memberBadge: { backgroundColor: '#F6F6F6' },
  roleText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderRadius: 20, padding: 24, margin: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 15 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  switchLabel: { fontSize: 14, color: '#333' },
  modalBtn: { backgroundColor: '#FF00BF', padding: 14, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  modalBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancelBtn: { padding: 12, alignItems: 'center' },
  cancelBtnText: { color: '#666', fontWeight: '600' },
});

export default FamilyAccountScreen;

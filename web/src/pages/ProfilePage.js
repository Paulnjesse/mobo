import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const [businessMode, setBusinessMode] = useState(false);

  const initial = user?.name?.charAt(0) || 'U';

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        <div style={styles.avatarWrap}>
          <div style={styles.avatar}>{initial}</div>
          <div>
            <div style={styles.name}>{user?.name || 'Rider'}</div>
            <div style={styles.email}>{user?.email || ''}</div>
          </div>
        </div>

        <div style={styles.section}>
          <div style={styles.sectionTitle}>Account Mode</div>
          <div style={styles.modeRow}>
            <button style={{ ...styles.modeBtn, ...(businessMode ? {} : styles.modeBtnActive) }} onClick={() => setBusinessMode(false)}>
              👤 Personal
            </button>
            <button style={{ ...styles.modeBtn, ...(businessMode ? styles.modeBtnActive : {}) }} onClick={() => setBusinessMode(true)}>
              💼 Business
            </button>
          </div>
          {businessMode && (
            <div style={styles.bizNote}>
              Rides will be billed to your corporate account and auto-categorized for expense reporting.
            </div>
          )}
        </div>

        <div style={styles.section}>
          <div style={styles.sectionTitle}>Preferences</div>
          <div style={styles.prefRow}>
            <span style={styles.prefLabel}>Language</span>
            <select style={styles.prefSelect}>
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </div>
          <div style={styles.prefRow}>
            <span style={styles.prefLabel}>Default payment</span>
            <select style={styles.prefSelect}>
              <option>MOBO Wallet</option>
              <option>MTN MoMo</option>
              <option>Orange Money</option>
              <option>Cash</option>
            </select>
          </div>
        </div>

        <button style={styles.logoutBtn} onClick={logout}>Log Out</button>
      </div>
    </div>
  );
}

const styles = {
  root: { display: 'flex', justifyContent: 'center', padding: '40px 20px' },
  card: { background: colors.white, borderRadius: 20, padding: 32, width: '100%', maxWidth: 520, border: `1px solid ${colors.border}` },
  avatarWrap: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 },
  avatar: { width: 64, height: 64, borderRadius: '50%', background: `linear-gradient(135deg, ${colors.primary}, #7c3aed)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 900, color: '#fff', flexShrink: 0 },
  name: { fontSize: 20, fontWeight: 800, color: colors.text },
  email: { fontSize: 14, color: colors.textSec, marginTop: 2 },
  section: { marginBottom: 24, paddingBottom: 24, borderBottom: `1px solid ${colors.border}` },
  sectionTitle: { fontSize: 12, fontWeight: 700, color: colors.textSec, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14 },
  modeRow: { display: 'flex', gap: 10 },
  modeBtn: { flex: 1, padding: '12px 16px', borderRadius: 12, border: `1.5px solid ${colors.border}`, background: colors.surface, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: colors.textSec },
  modeBtnActive: { border: `2px solid ${colors.primary}`, background: colors.primary + '12', color: colors.primary },
  bizNote: { background: '#eff6ff', color: colors.info, borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 500, marginTop: 12, border: '1px solid #bfdbfe' },
  prefRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  prefLabel: { fontSize: 14, color: colors.text, fontWeight: 500 },
  prefSelect: { padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${colors.border}`, fontSize: 14, fontFamily: 'inherit', outline: 'none', color: colors.text },
  logoutBtn: { width: '100%', padding: 14, border: '1.5px solid #fecaca', background: '#fef2f2', color: colors.danger, borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
};

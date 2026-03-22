import React, { useState } from 'react';
import { colors } from '../theme';

const DEMO_STATS = {
  totalRides: 248,
  totalSpent: 1_248_500,
  activeEmployees: 34,
  pendingReimbursements: 12,
};

const DEMO_EMPLOYEES = [
  { id: 1, name: 'Alice Mbarga', email: 'alice@acme.cm', rides: 42, spent: 198400, approved: true },
  { id: 2, name: 'Boris Foko',   email: 'boris@acme.cm', rides: 38, spent: 176000, approved: true },
  { id: 3, name: 'Chantal Ngo',  email: 'chantal@acme.cm', rides: 21, spent: 94500, approved: false },
  { id: 4, name: 'David Eto',    email: 'david@acme.cm', rides: 55, spent: 245000, approved: true },
  { id: 5, name: 'Emilie Tcham', email: 'emilie@acme.cm', rides: 12, spent: 52800, approved: false },
];

const DEMO_RIDES = [
  { id: 'r1', employee: 'Alice Mbarga', date: '2026-03-21', from: 'Bastos', to: 'Aéroport NSI', fare: 4500, status: 'approved', category: 'Business Travel' },
  { id: 'r2', employee: 'Boris Foko',   date: '2026-03-20', from: 'Akwa, Douala', to: 'La Falaise Hotel', fare: 2800, status: 'approved', category: 'Client Meeting' },
  { id: 'r3', employee: 'Chantal Ngo',  date: '2026-03-20', from: 'Mvog-Mbi', to: 'Omnisport', fare: 1200, status: 'pending', category: 'Office Commute' },
  { id: 'r4', employee: 'David Eto',    date: '2026-03-19', from: 'Biyem-Assi', to: 'Palais des Congrès', fare: 1800, status: 'approved', category: 'Conference' },
  { id: 'r5', employee: 'Emilie Tcham', date: '2026-03-18', from: 'Essos', to: 'Centre-ville', fare: 950, status: 'pending', category: 'Office Commute' },
];

const CATEGORIES = ['Business Travel', 'Client Meeting', 'Office Commute', 'Conference', 'Other'];

function StatCard({ icon, label, value, color }) {
  return (
    <div style={{ ...cardStyles.root, borderLeft: `4px solid ${color}` }}>
      <div style={{ ...cardStyles.icon, color }}>{icon}</div>
      <div>
        <div style={cardStyles.value}>{value}</div>
        <div style={cardStyles.label}>{label}</div>
      </div>
    </div>
  );
}

const cardStyles = {
  root: { background: colors.white, borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16, border: `1px solid ${colors.border}`, flex: 1 },
  icon: { fontSize: 30, lineHeight: 1 },
  value: { fontSize: 24, fontWeight: 900, color: colors.text },
  label: { fontSize: 13, color: colors.textSec, marginTop: 2 },
};

export default function CorporateDashboardPage() {
  const [tab, setTab] = useState('overview');
  const [rides, setRides] = useState(DEMO_RIDES);

  const approveRide = (id) => setRides(prev => prev.map(r => r.id === id ? { ...r, status: 'approved' } : r));

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.heading}>Corporate Dashboard</h1>
          <p style={styles.sub}>Acme Corp — March 2026</p>
        </div>
        <button style={styles.exportBtn}>⬇ Export CSV</button>
      </div>

      {/* Stats */}
      <div style={styles.statsRow}>
        <StatCard icon="🚗" label="Total Rides" value={DEMO_STATS.totalRides.toLocaleString()} color={colors.info} />
        <StatCard icon="💰" label="Total Spent" value={`${(DEMO_STATS.totalSpent / 1000000).toFixed(2)}M XAF`} color={colors.primary} />
        <StatCard icon="👥" label="Active Employees" value={DEMO_STATS.activeEmployees} color={colors.success} />
        <StatCard icon="⏳" label="Pending Approvals" value={DEMO_STATS.pendingReimbursements} color={colors.warning} />
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {['overview', 'employees', 'rides', 'policy'].map(t => (
          <button key={t} style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div>
          <div style={styles.sectionTitle}>Spending by Category</div>
          {CATEGORIES.map(cat => {
            const catRides = rides.filter(r => r.category === cat);
            const total = catRides.reduce((s, r) => s + r.fare, 0);
            const pct = Math.round((total / DEMO_STATS.totalSpent) * 100) || 0;
            return (
              <div key={cat} style={styles.catRow}>
                <span style={styles.catLabel}>{cat}</span>
                <div style={styles.catBarWrap}>
                  <div style={{ ...styles.catBar, width: `${pct}%`, background: colors.primary }} />
                </div>
                <span style={styles.catVal}>{total.toLocaleString()} XAF</span>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'employees' && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {['Employee', 'Email', 'Rides', 'Spent (XAF)', 'Status'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DEMO_EMPLOYEES.map(emp => (
                <tr key={emp.id} style={styles.tr}>
                  <td style={styles.td}><b>{emp.name}</b></td>
                  <td style={styles.td}>{emp.email}</td>
                  <td style={styles.td}>{emp.rides}</td>
                  <td style={styles.td}>{emp.spent.toLocaleString()}</td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, background: emp.approved ? '#d1fae5' : '#fef3c7', color: emp.approved ? colors.success : colors.warning }}>
                      {emp.approved ? 'Active' : 'Pending'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'rides' && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {['Date', 'Employee', 'Route', 'Fare', 'Category', 'Status', ''].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rides.map(ride => (
                <tr key={ride.id} style={styles.tr}>
                  <td style={styles.td}>{ride.date}</td>
                  <td style={styles.td}>{ride.employee}</td>
                  <td style={styles.td}>{ride.from} → {ride.to}</td>
                  <td style={styles.td}>{ride.fare.toLocaleString()} XAF</td>
                  <td style={styles.td}>
                    <span style={styles.catTag}>{ride.category}</span>
                  </td>
                  <td style={styles.td}>
                    <span style={{ ...styles.badge, background: ride.status === 'approved' ? '#d1fae5' : '#fef3c7', color: ride.status === 'approved' ? colors.success : colors.warning }}>
                      {ride.status}
                    </span>
                  </td>
                  <td style={styles.td}>
                    {ride.status === 'pending' && (
                      <button style={styles.approveBtn} onClick={() => approveRide(ride.id)}>Approve</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'policy' && (
        <div style={styles.policyCard}>
          <h3 style={styles.policyTitle}>Expense Policy</h3>
          {[
            { label: 'Max fare per trip', value: '10,000 XAF' },
            { label: 'Allowed ride types', value: 'Moto, Standard, XL' },
            { label: 'Allowed categories', value: 'Business Travel, Client Meeting, Conference' },
            { label: 'Reimbursement cycle', value: 'Monthly (last business day)' },
            { label: 'Approval required above', value: '5,000 XAF' },
          ].map(row => (
            <div key={row.label} style={styles.policyRow}>
              <span style={styles.policyLabel}>{row.label}</span>
              <span style={styles.policyVal}>{row.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  root: { maxWidth: 1100, margin: '0 auto', padding: '28px 20px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  heading: { fontSize: 26, fontWeight: 900, color: colors.text, marginBottom: 4 },
  sub: { fontSize: 14, color: colors.textSec },
  exportBtn: { padding: '10px 18px', borderRadius: 10, border: `1.5px solid ${colors.border}`, background: colors.white, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  statsRow: { display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28 },
  tabs: { display: 'flex', gap: 4, marginBottom: 24, borderBottom: `1px solid ${colors.border}` },
  tab: { padding: '10px 18px', background: 'none', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', borderBottom: '2px solid transparent', color: colors.textSec, fontFamily: 'inherit', marginBottom: -1 },
  tabActive: { borderBottom: `2px solid ${colors.primary}`, color: colors.primary },
  sectionTitle: { fontSize: 14, fontWeight: 700, color: colors.textSec, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 16 },
  catRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 },
  catLabel: { width: 160, fontSize: 13, color: colors.text, fontWeight: 500, flexShrink: 0 },
  catBarWrap: { flex: 1, height: 8, background: colors.border, borderRadius: 4, overflow: 'hidden' },
  catBar: { height: '100%', borderRadius: 4, transition: 'width 0.5s' },
  catVal: { width: 120, fontSize: 13, fontWeight: 600, color: colors.text, textAlign: 'right', flexShrink: 0 },
  tableWrap: { background: colors.white, borderRadius: 14, border: `1px solid ${colors.border}`, overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { background: colors.surface, padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: colors.textSec, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: `1px solid ${colors.border}` },
  tr: { borderBottom: `1px solid ${colors.border}` },
  td: { padding: '12px 16px', fontSize: 14, color: colors.text },
  badge: { padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, textTransform: 'capitalize' },
  catTag: { padding: '3px 10px', borderRadius: 6, fontSize: 12, background: colors.primary + '15', color: colors.primary, fontWeight: 600 },
  approveBtn: { padding: '5px 12px', borderRadius: 7, background: colors.success, color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  policyCard: { background: colors.white, borderRadius: 14, padding: 24, border: `1px solid ${colors.border}` },
  policyTitle: { fontSize: 18, fontWeight: 800, color: colors.text, marginBottom: 20 },
  policyRow: { display: 'flex', justifyContent: 'space-between', paddingBottom: 14, marginBottom: 14, borderBottom: `1px solid ${colors.border}` },
  policyLabel: { fontSize: 14, color: colors.textSec },
  policyVal: { fontSize: 14, fontWeight: 700, color: colors.text },
};

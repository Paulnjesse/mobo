import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

const STATUS_COLOR = {
  completed:  colors.success,
  cancelled:  colors.danger,
  in_progress: colors.info,
};

const DEMO_RIDES = [
  { id: '1', date: '2026-03-21', pickup: 'Bastos, Yaoundé', dropoff: 'Mvan, Yaoundé', ride_type: 'standard', fare: 1850, status: 'completed', driver: 'Emmanuel N.' },
  { id: '2', date: '2026-03-20', pickup: 'Centre-ville, Douala', dropoff: 'Akwa, Douala', ride_type: 'xl', fare: 3200, status: 'completed', driver: 'Marie K.' },
  { id: '3', date: '2026-03-19', pickup: 'Nlongkak, Yaoundé', dropoff: 'Mimboman, Yaoundé', ride_type: 'moto', fare: 700, status: 'cancelled', driver: null },
  { id: '4', date: '2026-03-18', pickup: 'Omnisport, Yaoundé', dropoff: 'Essos, Yaoundé', ride_type: 'standard', fare: 1200, status: 'completed', driver: 'Paul A.' },
  { id: '5', date: '2026-03-17', pickup: 'Biyem-Assi, Yaoundé', dropoff: 'Mvog-Mbi, Yaoundé', ride_type: 'standard', fare: 950, status: 'completed', driver: 'Serge M.' },
];

const RIDE_ICONS = { moto: '🏍', standard: '🚗', xl: '🚙', delivery: '📦' };

export default function RideHistoryPage() {
  const { api } = useAuth();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api.get('/rides/history').then(({ data }) => setRides(data.rides || DEMO_RIDES)).catch(() => setRides(DEMO_RIDES)).finally(() => setLoading(false));
  }, []); // eslint-disable-line

  const totalSpent = rides.filter(r => r.status === 'completed').reduce((s, r) => s + (r.fare || 0), 0);

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.heading}>My Rides</h1>
          <p style={styles.sub}>{rides.length} trips · {totalSpent.toLocaleString()} XAF total spent</p>
        </div>
      </div>

      {loading ? (
        <div style={styles.loading}>Loading…</div>
      ) : (
        <div style={styles.list}>
          {rides.map(ride => (
            <div
              key={ride.id}
              style={{ ...styles.card, ...(selected === ride.id ? styles.cardSelected : {}) }}
              onClick={() => setSelected(selected === ride.id ? null : ride.id)}
            >
              <div style={styles.cardTop}>
                <span style={styles.rideIcon}>{RIDE_ICONS[ride.ride_type] || '🚗'}</span>
                <div style={styles.cardMid}>
                  <div style={styles.cardRoute}>
                    <span style={styles.cardPickup}>{ride.pickup}</span>
                    <span style={styles.routeArrow}>→</span>
                    <span style={styles.cardDropoff}>{ride.dropoff}</span>
                  </div>
                  <div style={styles.cardMeta}>
                    <span style={styles.cardDate}>{ride.date}</span>
                    {ride.driver && <span style={styles.cardDriver}>· {ride.driver}</span>}
                  </div>
                </div>
                <div style={styles.cardRight}>
                  <div style={styles.cardFare}>{ride.fare?.toLocaleString() || '—'} XAF</div>
                  <div style={{ ...styles.statusBadge, background: (STATUS_COLOR[ride.status] || colors.textSec) + '20', color: STATUS_COLOR[ride.status] || colors.textSec }}>
                    {ride.status}
                  </div>
                </div>
              </div>

              {selected === ride.id && (
                <div style={styles.expanded}>
                  <div style={styles.expRow}>
                    <span style={styles.expLabel}>Ride type</span>
                    <span style={styles.expVal}>{RIDE_ICONS[ride.ride_type]} {ride.ride_type}</span>
                  </div>
                  <div style={styles.expRow}>
                    <span style={styles.expLabel}>Fare paid</span>
                    <span style={styles.expVal}>{ride.fare?.toLocaleString()} XAF</span>
                  </div>
                  {ride.driver && (
                    <div style={styles.expRow}>
                      <span style={styles.expLabel}>Driver</span>
                      <span style={styles.expVal}>{ride.driver}</span>
                    </div>
                  )}
                  {ride.status === 'completed' && (
                    <div style={styles.expActions}>
                      <button style={styles.expBtn}>Rate driver</button>
                      <button style={styles.expBtn}>Report issue</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  root: { maxWidth: 760, margin: '0 auto', padding: '28px 20px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  heading: { fontSize: 26, fontWeight: 900, color: colors.text, marginBottom: 4 },
  sub: { fontSize: 14, color: colors.textSec },
  loading: { textAlign: 'center', padding: 40, color: colors.textSec },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  card: { background: colors.white, borderRadius: 14, padding: '16px 18px', border: `1.5px solid ${colors.border}`, cursor: 'pointer', transition: 'box-shadow 0.15s' },
  cardSelected: { borderColor: colors.primary, boxShadow: `0 0 0 3px ${colors.primary}22` },
  cardTop: { display: 'flex', alignItems: 'center', gap: 14 },
  rideIcon: { fontSize: 28, flexShrink: 0 },
  cardMid: { flex: 1, minWidth: 0 },
  cardRoute: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  cardPickup: { fontSize: 14, fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 },
  routeArrow: { color: colors.textSec, fontSize: 13, flexShrink: 0 },
  cardDropoff: { fontSize: 14, fontWeight: 600, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 },
  cardMeta: { display: 'flex', gap: 6, marginTop: 4 },
  cardDate: { fontSize: 12, color: colors.textSec },
  cardDriver: { fontSize: 12, color: colors.textSec },
  cardRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  cardFare: { fontSize: 16, fontWeight: 800, color: colors.text },
  statusBadge: { fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, textTransform: 'capitalize' },
  expanded: { marginTop: 14, paddingTop: 14, borderTop: `1px solid ${colors.border}` },
  expRow: { display: 'flex', justifyContent: 'space-between', marginBottom: 8 },
  expLabel: { fontSize: 13, color: colors.textSec },
  expVal: { fontSize: 13, fontWeight: 600, color: colors.text },
  expActions: { display: 'flex', gap: 10, marginTop: 12 },
  expBtn: { padding: '8px 16px', borderRadius: 8, border: `1.5px solid ${colors.border}`, background: colors.white, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', color: colors.text },
};

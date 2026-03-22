import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

const STATUS_STEPS = [
  { key: 'pending',     label: 'Finding driver',    icon: '🔍' },
  { key: 'accepted',    label: 'Driver on the way',  icon: '🚗' },
  { key: 'arrived',     label: 'Driver arrived',     icon: '📍' },
  { key: 'in_progress', label: 'On your way',        icon: '⚡' },
  { key: 'completed',   label: 'Arrived!',           icon: '✅' },
];

const STATUS_IDX = Object.fromEntries(STATUS_STEPS.map((s, i) => [s.key, i]));

// Demo data
const DEMO_RIDE = {
  id: 'demo',
  status: 'accepted',
  pickup_address: '1 Rue de la Réunification, Yaoundé',
  dropoff_address: 'Marché Central, Yaoundé',
  driver: { name: 'Emmanuel Nkoa', rating: 4.9, vehicle: 'Toyota Corolla', plate: 'LT-7824-A', phone: '+237 6XX XXX XXX' },
  fare: 2450,
  eta_minutes: 4,
};

const MAP_CENTER = [3.848, 11.502];
const ROUTE_POINTS = [[3.845, 11.498], [3.847, 11.500], [3.850, 11.503], [3.852, 11.506]];

const TIP_OPTIONS = [200, 500, 1000, 2000];

export default function RideTrackingPage() {
  const { rideId } = useParams();
  const { api } = useAuth();
  const navigate = useNavigate();

  const [ride, setRide] = useState(DEMO_RIDE);
  const [loading, setLoading] = useState(rideId !== 'demo');
  const [tipSent, setTipSent] = useState(false);
  const [tipAmount, setTipAmount] = useState(null);

  useEffect(() => {
    if (rideId === 'demo') return;
    api.get(`/rides/${rideId}`).then(({ data }) => setRide(data.ride || DEMO_RIDE)).catch(() => setRide(DEMO_RIDE)).finally(() => setLoading(false));
  }, [rideId]); // eslint-disable-line

  const sendTip = async (amount) => {
    if (tipSent) return;
    setTipAmount(amount);
    try { await api.post(`/rides/${rideId}/tip`, { amount }); } catch {}
    setTipSent(true);
  };

  if (loading) return <div style={styles.loading}>Loading ride…</div>;

  const currentStepIdx = STATUS_IDX[ride.status] ?? 0;
  const isActive = ride.status === 'in_progress' || ride.status === 'arrived';

  return (
    <div style={styles.root}>
      {/* Map */}
      <div style={styles.mapWrap}>
        <MapContainer center={MAP_CENTER} zoom={14} style={{ width: '100%', height: '100%' }}>
          <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Polyline positions={ROUTE_POINTS} color={colors.primary} weight={4} />
          <Marker position={ROUTE_POINTS[0]}><Popup>Pickup</Popup></Marker>
          <Marker position={ROUTE_POINTS[ROUTE_POINTS.length - 1]}><Popup>Dropoff</Popup></Marker>
        </MapContainer>
      </div>

      {/* Side panel */}
      <div style={styles.panel}>
        <button style={styles.backBtn} onClick={() => navigate('/')}>← Back</button>

        <h2 style={styles.heading}>Your Ride</h2>

        {/* Progress steps */}
        <div style={styles.steps}>
          {STATUS_STEPS.map((step, idx) => {
            const done = idx < currentStepIdx;
            const active = idx === currentStepIdx;
            return (
              <div key={step.key} style={styles.stepRow}>
                <div style={{ ...styles.stepCircle, background: done || active ? colors.primary : colors.border, color: done || active ? '#fff' : colors.textSec }}>
                  {step.icon}
                </div>
                <div style={{ ...styles.stepLabel, fontWeight: active ? 700 : 400, color: active ? colors.text : colors.textSec }}>
                  {step.label}
                  {active && ride.eta_minutes && <span style={styles.eta}> · {ride.eta_minutes} min</span>}
                </div>
                {idx < STATUS_STEPS.length - 1 && <div style={{ ...styles.stepLine, background: done ? colors.primary : colors.border }} />}
              </div>
            );
          })}
        </div>

        {/* Driver card */}
        {ride.driver && (
          <div style={styles.driverCard}>
            <div style={styles.driverAvatar}>{ride.driver.name.charAt(0)}</div>
            <div style={styles.driverInfo}>
              <div style={styles.driverName}>{ride.driver.name}</div>
              <div style={styles.driverSub}>{ride.driver.vehicle} · {ride.driver.plate}</div>
              <div style={styles.driverRating}>⭐ {ride.driver.rating}</div>
            </div>
            <a href={`tel:${ride.driver.phone}`} style={styles.callBtn}>📞 Call</a>
          </div>
        )}

        {/* Route */}
        <div style={styles.routeCard}>
          <div style={styles.routeRow}>
            <span style={{ ...styles.routeDot, background: colors.success }} />
            <span style={styles.routeAddr}>{ride.pickup_address}</span>
          </div>
          <div style={styles.routeLine} />
          <div style={styles.routeRow}>
            <span style={{ ...styles.routeDot, background: colors.primary }} />
            <span style={styles.routeAddr}>{ride.dropoff_address}</span>
          </div>
        </div>

        {/* Fare */}
        <div style={styles.fareRow}>
          <span style={styles.fareLabel}>Estimated fare</span>
          <span style={styles.fareValue}>{ride.fare?.toLocaleString() || '—'} XAF</span>
        </div>

        {/* Tip */}
        {isActive && !tipSent && (
          <div style={styles.tipBox}>
            <div style={styles.tipLabel}>Tip your driver</div>
            <div style={styles.tipBtns}>
              {TIP_OPTIONS.map(amt => (
                <button
                  key={amt}
                  style={{ ...styles.tipBtn, ...(tipAmount === amt ? styles.tipBtnActive : {}) }}
                  onClick={() => sendTip(amt)}
                >
                  {amt.toLocaleString()}
                </button>
              ))}
            </div>
          </div>
        )}
        {tipSent && (
          <div style={styles.tipSent}>❤ {tipAmount?.toLocaleString()} XAF tip sent!</div>
        )}

        {ride.status === 'completed' && (
          <button style={styles.histBtn} onClick={() => navigate('/history')}>
            View Receipt →
          </button>
        )}
      </div>
    </div>
  );
}

const styles = {
  root: { display: 'flex', height: 'calc(100vh - 64px)' },
  mapWrap: { flex: 1 },
  panel: { width: 380, background: colors.white, padding: '20px 20px', overflowY: 'auto', borderLeft: `1px solid ${colors.border}` },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh', fontSize: 18, color: colors.textSec },
  backBtn: { background: 'none', border: 'none', color: colors.primary, fontWeight: 600, fontSize: 14, cursor: 'pointer', marginBottom: 16, padding: 0, fontFamily: 'inherit' },
  heading: { fontSize: 22, fontWeight: 800, color: colors.text, marginBottom: 20 },
  steps: { marginBottom: 24 },
  stepRow: { display: 'flex', alignItems: 'center', gap: 12, position: 'relative', marginBottom: 4 },
  stepCircle: { width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 },
  stepLabel: { fontSize: 14, flex: 1 },
  stepLine: { position: 'absolute', left: 16, top: 34, width: 2, height: 20, marginLeft: 0 },
  eta: { color: colors.primary, fontWeight: 600 },
  driverCard: { background: colors.surface, borderRadius: 14, padding: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, border: `1px solid ${colors.border}` },
  driverAvatar: { width: 50, height: 50, borderRadius: '50%', background: `linear-gradient(135deg, ${colors.primary}, #7c3aed)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#fff', flexShrink: 0 },
  driverInfo: { flex: 1 },
  driverName: { fontWeight: 700, fontSize: 16, color: colors.text },
  driverSub: { fontSize: 13, color: colors.textSec },
  driverRating: { fontSize: 13, fontWeight: 600, marginTop: 2 },
  callBtn: { background: colors.success, color: '#fff', padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, textDecoration: 'none' },
  routeCard: { background: colors.surface, borderRadius: 12, padding: 14, marginBottom: 16, border: `1px solid ${colors.border}` },
  routeRow: { display: 'flex', alignItems: 'center', gap: 10 },
  routeDot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  routeAddr: { fontSize: 13, color: colors.text, fontWeight: 500 },
  routeLine: { height: 16, width: 2, background: colors.border, marginLeft: 4, marginTop: 4, marginBottom: 4 },
  fareRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, padding: '12px 0', borderTop: `1px solid ${colors.border}` },
  fareLabel: { fontSize: 14, color: colors.textSec },
  fareValue: { fontSize: 22, fontWeight: 800, color: colors.text },
  tipBox: { background: colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, border: `1px solid ${colors.border}` },
  tipLabel: { fontSize: 13, fontWeight: 700, color: colors.text, marginBottom: 10 },
  tipBtns: { display: 'flex', gap: 8 },
  tipBtn: { flex: 1, padding: '8px 4px', borderRadius: 8, border: `1.5px solid ${colors.border}`, background: colors.white, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  tipBtnActive: { border: `2px solid ${colors.primary}`, color: colors.primary, background: colors.primary + '10' },
  tipSent: { color: colors.success, fontWeight: 700, fontSize: 14, textAlign: 'center', marginBottom: 16 },
  histBtn: { width: '100%', padding: 14, background: colors.primary, color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
};

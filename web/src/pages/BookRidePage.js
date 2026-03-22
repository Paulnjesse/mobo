import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

const RIDE_TYPES = [
  { id: 'moto',     label: 'Moto',     emoji: '🏍',  base: 300,  desc: 'Fastest, 1 passenger' },
  { id: 'standard', label: 'Standard', emoji: '🚗',  base: 600,  desc: '1-4 passengers, sedan' },
  { id: 'xl',       label: 'XL',       emoji: '🚙',  base: 900,  desc: 'Up to 6 passengers, SUV' },
  { id: 'delivery', label: 'Delivery', emoji: '📦',  base: 400,  desc: 'Package delivery' },
];

const PAYMENT_METHODS = [
  { id: 'wallet',   label: 'MOBO Wallet',  icon: '💳' },
  { id: 'mtn',      label: 'MTN MoMo',     icon: '📱' },
  { id: 'orange',   label: 'Orange Money', icon: '🟠' },
  { id: 'cash',     label: 'Cash',         icon: '💵' },
];

// Yaoundé center
const MAP_CENTER = [3.848, 11.502];

function FareEstimate({ rideType, distanceKm = 5 }) {
  const t = RIDE_TYPES.find(r => r.id === rideType);
  if (!t || !distanceKm) return null;
  const estimate = t.base + distanceKm * 120;
  return (
    <div style={fareStyles.root}>
      <div style={fareStyles.row}>
        <span style={fareStyles.label}>Estimated fare</span>
        <span style={fareStyles.value}>{estimate.toLocaleString()} XAF</span>
      </div>
      <div style={fareStyles.row}>
        <span style={fareStyles.label}>Distance</span>
        <span style={fareStyles.small}>{distanceKm} km</span>
      </div>
      <div style={fareStyles.row}>
        <span style={fareStyles.label}>Est. time</span>
        <span style={fareStyles.small}>{Math.ceil(distanceKm * 3)} min</span>
      </div>
      <div style={fareStyles.upfront}>Upfront price — guaranteed</div>
    </div>
  );
}

const fareStyles = {
  root: { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '14px 16px', marginTop: 12 },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  label: { fontSize: 13, color: colors.textSec, fontWeight: 500 },
  value: { fontSize: 20, fontWeight: 800, color: colors.text },
  small: { fontSize: 14, fontWeight: 600, color: colors.text },
  upfront: { marginTop: 8, fontSize: 12, fontWeight: 700, color: colors.success, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 },
};

export default function BookRidePage() {
  const { api } = useAuth();
  const navigate = useNavigate();

  const [pickup, setPickup] = useState('');
  const [dropoff, setDropoff] = useState('');
  const [rideType, setRideType] = useState('standard');
  const [paymentMethod, setPaymentMethod] = useState('wallet');
  const [isForOther, setIsForOther] = useState(false);
  const [otherName, setOtherName] = useState('');
  const [otherPhone, setOtherPhone] = useState('');
  const [childSeat, setChildSeat] = useState(false);
  const [splitPayment, setSplitPayment] = useState(false);
  const [walletPct, setWalletPct] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleBook = async () => {
    if (!pickup || !dropoff) { setError('Enter pickup and dropoff locations.'); return; }
    setError('');
    setLoading(true);
    try {
      const payload = {
        pickup_address: pickup,
        dropoff_address: dropoff,
        ride_type: rideType,
        payment_method: paymentMethod,
        is_for_other: isForOther,
        other_passenger_name: isForOther ? otherName : undefined,
        other_passenger_phone: isForOther ? otherPhone : undefined,
        child_seat_required: childSeat,
        split_payment: splitPayment,
        split_wallet_pct: splitPayment ? walletPct : 100,
        split_momo_pct: splitPayment ? 100 - walletPct : 0,
      };
      const { data } = await api.post('/rides/request', payload);
      navigate(`/track/${data.ride?.id || 'demo'}`);
    } catch (err) {
      // For demo, navigate anyway
      navigate('/track/demo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.root}>
      {/* Left panel */}
      <div style={styles.panel}>
        <h1 style={styles.heading}>Book a Ride</h1>
        <p style={styles.sub}>Fast, safe rides across Yaoundé & Douala</p>

        {error && <div style={styles.error}>{error}</div>}

        {/* Locations */}
        <div style={styles.locationBox}>
          <div style={styles.locationRow}>
            <span style={{ ...styles.dot, background: colors.success }} />
            <input
              style={styles.locInput}
              placeholder="Pickup location"
              value={pickup}
              onChange={e => setPickup(e.target.value)}
            />
          </div>
          <div style={styles.locationDivider} />
          <div style={styles.locationRow}>
            <span style={{ ...styles.dot, background: colors.primary }} />
            <input
              style={styles.locInput}
              placeholder="Dropoff destination"
              value={dropoff}
              onChange={e => setDropoff(e.target.value)}
            />
          </div>
        </div>

        {/* Ride type */}
        <div style={styles.section}>
          <div style={styles.sectionLabel}>Ride Type</div>
          <div style={styles.rideTypes}>
            {RIDE_TYPES.map(rt => (
              <button
                key={rt.id}
                style={{ ...styles.rideType, ...(rideType === rt.id ? styles.rideTypeActive : {}) }}
                onClick={() => setRideType(rt.id)}
              >
                <span style={styles.rideEmoji}>{rt.emoji}</span>
                <span style={styles.rideLabel}>{rt.label}</span>
                <span style={styles.rideBase}>{rt.base.toLocaleString()} XAF</span>
              </button>
            ))}
          </div>
        </div>

        {/* Fare estimate */}
        <FareEstimate rideType={rideType} distanceKm={pickup && dropoff ? 7 : null} />

        {/* Payment */}
        <div style={styles.section}>
          <div style={styles.sectionLabel}>Payment</div>
          <div style={styles.payGrid}>
            {PAYMENT_METHODS.map(pm => (
              <button
                key={pm.id}
                style={{ ...styles.payBtn, ...(paymentMethod === pm.id ? styles.payBtnActive : {}) }}
                onClick={() => setPaymentMethod(pm.id)}
              >
                <span style={{ fontSize: 20 }}>{pm.icon}</span>
                <span style={styles.payLabel}>{pm.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Options */}
        <div style={styles.section}>
          <div style={styles.sectionLabel}>Options</div>

          {/* For someone else */}
          <div style={styles.optRow}>
            <div style={styles.optLeft}>
              <span>👤</span>
              <div>
                <div style={styles.optTitle}>Book for someone else</div>
                <div style={styles.optSub}>Ride will be taken by another person</div>
              </div>
            </div>
            <label style={styles.toggle}>
              <input type="checkbox" style={{ display: 'none' }} checked={isForOther} onChange={e => setIsForOther(e.target.checked)} />
              <div style={{ ...styles.toggleTrack, background: isForOther ? colors.primary : colors.border }}>
                <div style={{ ...styles.toggleThumb, transform: isForOther ? 'translateX(22px)' : 'translateX(2px)' }} />
              </div>
            </label>
          </div>
          {isForOther && (
            <div style={styles.expandBox}>
              <input style={styles.expandInput} placeholder="Passenger name" value={otherName} onChange={e => setOtherName(e.target.value)} />
              <input style={styles.expandInput} placeholder="Passenger phone" value={otherPhone} onChange={e => setOtherPhone(e.target.value)} />
            </div>
          )}

          {/* Child seat */}
          <div style={styles.optRow}>
            <div style={styles.optLeft}>
              <span>🪑</span>
              <div>
                <div style={styles.optTitle}>Child seat needed</div>
                <div style={styles.optSub}>Driver will have a child safety seat</div>
              </div>
            </div>
            <label style={styles.toggle}>
              <input type="checkbox" style={{ display: 'none' }} checked={childSeat} onChange={e => setChildSeat(e.target.checked)} />
              <div style={{ ...styles.toggleTrack, background: childSeat ? colors.primary : colors.border }}>
                <div style={{ ...styles.toggleThumb, transform: childSeat ? 'translateX(22px)' : 'translateX(2px)' }} />
              </div>
            </label>
          </div>

          {/* Split payment */}
          <div style={styles.optRow}>
            <div style={styles.optLeft}>
              <span>💸</span>
              <div>
                <div style={styles.optTitle}>Split payment</div>
                <div style={styles.optSub}>Pay partly from wallet, partly MoMo</div>
              </div>
            </div>
            <label style={styles.toggle}>
              <input type="checkbox" style={{ display: 'none' }} checked={splitPayment} onChange={e => setSplitPayment(e.target.checked)} />
              <div style={{ ...styles.toggleTrack, background: splitPayment ? colors.primary : colors.border }}>
                <div style={{ ...styles.toggleThumb, transform: splitPayment ? 'translateX(22px)' : 'translateX(2px)' }} />
              </div>
            </label>
          </div>
          {splitPayment && (
            <div style={styles.expandBox}>
              <div style={styles.splitLabel}>Wallet: {walletPct}% · MoMo: {100 - walletPct}%</div>
              <div style={styles.splitBtns}>
                {[25, 50, 75].map(p => (
                  <button key={p} style={{ ...styles.splitChip, ...(walletPct === p ? styles.splitChipActive : {}) }} onClick={() => setWalletPct(p)}>
                    {p}% wallet
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          style={{ ...styles.bookBtn, opacity: loading ? 0.7 : 1 }}
          onClick={handleBook}
          disabled={loading}
        >
          {loading ? 'Booking…' : '🚗  Confirm Booking'}
        </button>
      </div>

      {/* Map */}
      <div style={styles.mapWrap}>
        <MapContainer center={MAP_CENTER} zoom={13} style={{ width: '100%', height: '100%' }} zoomControl={false}>
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={MAP_CENTER}>
            <Popup>Yaoundé City Centre</Popup>
          </Marker>
        </MapContainer>
      </div>
    </div>
  );
}

const styles = {
  root: { display: 'flex', minHeight: 'calc(100vh - 64px)', background: colors.surface },
  panel: {
    width: 420,
    flexShrink: 0,
    background: colors.white,
    padding: '28px 24px',
    overflowY: 'auto',
    borderRight: `1px solid ${colors.border}`,
  },
  heading: { fontSize: 26, fontWeight: 900, color: colors.text, marginBottom: 4 },
  sub: { fontSize: 14, color: colors.textSec, marginBottom: 20 },
  error: { background: '#fef2f2', color: colors.danger, border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 14, marginBottom: 16 },
  locationBox: { background: colors.surface, borderRadius: 14, padding: '4px 16px', border: `1.5px solid ${colors.border}`, marginBottom: 20 },
  locationRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' },
  dot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  locInput: { flex: 1, border: 'none', background: 'none', fontSize: 15, outline: 'none', fontFamily: 'inherit', color: colors.text },
  locationDivider: { height: 1, background: colors.border, marginLeft: 20 },
  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 12, fontWeight: 700, color: colors.textSec, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 },
  rideTypes: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  rideType: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 8px', background: colors.surface, border: `1.5px solid ${colors.border}`, borderRadius: 12, cursor: 'pointer', gap: 2, fontFamily: 'inherit' },
  rideTypeActive: { border: `2px solid ${colors.primary}`, background: colors.primary + '10' },
  rideEmoji: { fontSize: 22 },
  rideLabel: { fontSize: 13, fontWeight: 700, color: colors.text },
  rideBase: { fontSize: 11, color: colors.textSec },
  payGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  payBtn: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: colors.surface, border: `1.5px solid ${colors.border}`, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' },
  payBtnActive: { border: `2px solid ${colors.primary}`, background: colors.primary + '10' },
  payLabel: { fontSize: 13, fontWeight: 600, color: colors.text },
  optRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, padding: '8px 0', gap: 12 },
  optLeft: { display: 'flex', alignItems: 'center', gap: 10, flex: 1 },
  optTitle: { fontSize: 14, fontWeight: 600, color: colors.text },
  optSub: { fontSize: 12, color: colors.textSec },
  toggle: { cursor: 'pointer' },
  toggleTrack: { width: 46, height: 26, borderRadius: 13, position: 'relative', transition: 'background 0.2s' },
  toggleThumb: { position: 'absolute', top: 3, width: 20, height: 20, borderRadius: '50%', background: colors.white, boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'transform 0.2s' },
  expandBox: { background: colors.surface, borderRadius: 10, padding: 12, marginBottom: 8, border: `1px solid ${colors.border}` },
  expandInput: { display: 'block', width: '100%', padding: '10px 12px', fontSize: 14, borderRadius: 8, border: `1px solid ${colors.border}`, marginBottom: 8, outline: 'none', fontFamily: 'inherit' },
  splitLabel: { fontSize: 13, fontWeight: 600, color: colors.text, marginBottom: 8 },
  splitBtns: { display: 'flex', gap: 8 },
  splitChip: { padding: '6px 12px', borderRadius: 8, border: `1.5px solid ${colors.border}`, background: colors.white, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  splitChipActive: { border: `2px solid ${colors.primary}`, color: colors.primary, background: colors.primary + '10' },
  bookBtn: {
    width: '100%',
    padding: '16px',
    fontSize: 16,
    fontWeight: 800,
    color: colors.white,
    background: `linear-gradient(135deg, ${colors.primary}, #7c3aed)`,
    border: 'none',
    borderRadius: 14,
    cursor: 'pointer',
    marginTop: 8,
    fontFamily: 'inherit',
    letterSpacing: 0.3,
    boxShadow: `0 8px 24px ${colors.primary}44`,
  },
  mapWrap: { flex: 1, position: 'relative', minHeight: 400 },
};

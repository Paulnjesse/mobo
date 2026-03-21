import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Chip, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert,
  Select, MenuItem, FormControl, InputLabel, TextField,
  Divider, IconButton, CircularProgress,
} from '@mui/material';
import {
  LocalShipping as DeliveryIcon,
  Pending as PendingIcon,
  DirectionsBike as TransitIcon,
  CheckCircle as DeliveredIcon,
  ErrorOutline as FailedIcon,
  AttachMoney as RevenueIcon,
  Close as CloseIcon,
  Download as DownloadIcon,
  Cancel as CancelIcon,
  Block as MarkFailedIcon,
  Image as ImageIcon,
} from '@mui/icons-material';
import StatCard from '../components/StatCard';
import DataTable from '../components/DataTable';
import api from '../services/api';

// ─────────────────────────────────────────────────
// Mock data — shown when API is unavailable
// ─────────────────────────────────────────────────
const SIZES = ['envelope', 'small', 'medium', 'large', 'extra_large'];
const STATUSES = ['pending', 'driver_assigned', 'driver_arriving', 'picked_up', 'in_transit', 'delivered', 'cancelled', 'failed'];
const SENDERS = ['Alice Bongo', 'Jean Nkomo', 'Marie Fouda', 'Paul Kamga', 'Fatima Oumarou', 'Robert Essama'];
const DRIVERS = ['Kofi Mensah', 'Ibrahim Traore', 'Yves Nkomo', null, 'Grace Bello', null];
const ADDRESSES = [
  'Rue de la Joie, Akwa, Douala',
  'Avenue Kennedy, Bonapriso, Douala',
  'Carrefour Warda, Douala',
  'Quartier Tsinga, Yaoundé',
  'Centre Commercial, Bastos, Yaoundé',
  'Marché Central, Mvan, Yaoundé',
];

const MOCK_DELIVERIES = Array.from({ length: 42 }, (_, i) => ({
  id: `del-${String(i + 1).padStart(4, '0')}-mock`,
  created_at: new Date(Date.now() - i * 3_600_000).toISOString(),
  sender_name: SENDERS[i % SENDERS.length],
  recipient_name: SENDERS[(i + 2) % SENDERS.length],
  recipient_phone: `+237 6${String(i + 50).padStart(2, '0')} ${String(i * 3 + 100).substring(0, 3)} ${String(i * 7 + 200).substring(0, 3)}`,
  package_size: SIZES[i % SIZES.length],
  pickup_address: ADDRESSES[i % ADDRESSES.length],
  dropoff_address: ADDRESSES[(i + 3) % ADDRESSES.length],
  status: STATUSES[i % STATUSES.length],
  fare_estimate: (800 + i * 150),
  final_fare: STATUSES[i % STATUSES.length] === 'delivered' ? (800 + i * 150) : null,
  currency: 'XAF',
  driver_name: DRIVERS[i % DRIVERS.length],
  driver_phone: DRIVERS[i % DRIVERS.length] ? `+237 677 ${String(i * 11 + 100).substring(0, 3)} ${String(i * 7 + 200).substring(0, 3)}` : null,
  distance_km: (1.5 + i * 0.4).toFixed(2),
  is_fragile: i % 5 === 0,
  requires_signature: i % 7 === 0,
  payment_method: ['cash', 'mobile_money', 'wallet', 'card'][i % 4],
  payment_status: STATUSES[i % STATUSES.length] === 'delivered' ? 'paid' : 'pending',
  driver_assigned_at: STATUSES[i % STATUSES.length] !== 'pending' ? new Date(Date.now() - i * 3_000_000).toISOString() : null,
  picked_up_at: ['picked_up', 'in_transit', 'delivered'].includes(STATUSES[i % STATUSES.length]) ? new Date(Date.now() - i * 1_800_000).toISOString() : null,
  delivered_at: STATUSES[i % STATUSES.length] === 'delivered' ? new Date(Date.now() - i * 600_000).toISOString() : null,
  pickup_photo_url: ['picked_up', 'in_transit', 'delivered'].includes(STATUSES[i % STATUSES.length]) ? 'https://placehold.co/400x300?text=Pickup+Photo' : null,
  delivery_photo_url: STATUSES[i % STATUSES.length] === 'delivered' ? 'https://placehold.co/400x300?text=Delivery+Photo' : null,
  cancellation_reason: STATUSES[i % STATUSES.length] === 'cancelled' ? 'Sender request' : null,
  failure_reason: STATUSES[i % STATUSES.length] === 'failed' ? 'Recipient not home' : null,
  sender_note: i % 3 === 0 ? 'Please handle with care' : null,
}));

// ─────────────────────────────────────────────────
// Chip helpers
// ─────────────────────────────────────────────────
const STATUS_CHIP = {
  pending:         { label: 'Pending',         bg: 'rgba(0,0,0,0.06)',         color: '#666' },
  driver_assigned: { label: 'Driver Assigned', bg: 'rgba(33,150,243,0.1)',     color: '#1976D2' },
  driver_arriving: { label: 'Driver Arriving', bg: 'rgba(33,150,243,0.1)',     color: '#1976D2' },
  picked_up:       { label: 'Picked Up',       bg: 'rgba(245,166,35,0.12)',    color: '#E65100' },
  in_transit:      { label: 'In Transit',      bg: 'rgba(245,166,35,0.12)',    color: '#E65100' },
  delivered:       { label: 'Delivered',       bg: 'rgba(76,175,80,0.12)',     color: '#388E3C' },
  cancelled:       { label: 'Cancelled',       bg: 'rgba(0,0,0,0.06)',         color: '#999' },
  failed:          { label: 'Failed',          bg: 'rgba(233,69,96,0.12)',     color: '#C62828' },
};

const SIZE_CHIP = {
  envelope:    { bg: 'rgba(0,0,0,0.06)',         color: '#555' },
  small:       { bg: 'rgba(33,150,243,0.1)',     color: '#1565C0' },
  medium:      { bg: 'rgba(245,166,35,0.1)',     color: '#E65100' },
  large:       { bg: 'rgba(156,39,176,0.1)',     color: '#6A1B9A' },
  extra_large: { bg: 'rgba(233,69,96,0.12)',     color: '#B71C1C' },
};

function StatusChip({ status }) {
  const cfg = STATUS_CHIP[status] || { label: status, bg: 'rgba(0,0,0,0.06)', color: '#666' };
  return (
    <Chip
      label={cfg.label}
      size="small"
      sx={{ bgcolor: cfg.bg, color: cfg.color, fontWeight: 700, fontSize: '0.68rem', height: 22 }}
    />
  );
}

function SizeChip({ size }) {
  const cfg = SIZE_CHIP[size] || { bg: 'rgba(0,0,0,0.06)', color: '#666' };
  return (
    <Chip
      label={size?.replace('_', ' ')}
      size="small"
      sx={{ bgcolor: cfg.bg, color: cfg.color, fontWeight: 600, fontSize: '0.68rem', height: 22, textTransform: 'capitalize' }}
    />
  );
}

// ─────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────
const shortId = (id = '') => id.substring(0, 8).toUpperCase();
const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const fmtFare = (n, currency = 'XAF') => n != null ? `${Number(n).toLocaleString()} ${currency}` : '—';
const truncate = (str = '', n = 30) => str.length > n ? str.substring(0, n) + '…' : str;

function TimelineRow({ label, value }) {
  if (!value) return null;
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.75, borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
      <Typography sx={{ fontSize: '0.8rem', color: 'rgba(0,0,0,0.55)', minWidth: 140 }}>{label}</Typography>
      <Typography sx={{ fontSize: '0.8rem', fontWeight: 500 }}>{fmtDate(value)}</Typography>
    </Box>
  );
}

function PhotoThumb({ url, label }) {
  if (!url) return null;
  return (
    <Box>
      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#666', mb: 0.5 }}>{label}</Typography>
      <Box
        component="img"
        src={url}
        alt={label}
        sx={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.1)' }}
        onError={(e) => { e.target.style.display = 'none'; }}
      />
    </Box>
  );
}

// ─────────────────────────────────────────────────
// CSV export
// ─────────────────────────────────────────────────
function exportCSV(rows) {
  const headers = [
    'Date', 'ID', 'Sender', 'Recipient', 'Recipient Phone',
    'Size', 'Pickup Address', 'Dropoff Address', 'Distance (km)',
    'Status', 'Fare Estimate (XAF)', 'Final Fare (XAF)', 'Payment Method',
    'Payment Status', 'Driver', 'Driver Phone',
    'Assigned At', 'Picked Up At', 'Delivered At',
    'Is Fragile', 'Requires Signature',
    'Cancellation Reason', 'Failure Reason',
  ];

  const escape = (v) => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
  };

  const csvRows = rows.map((d) => [
    fmtDate(d.created_at),
    d.id,
    d.sender_name || '',
    d.recipient_name || '',
    d.recipient_phone || '',
    d.package_size || '',
    d.pickup_address || '',
    d.dropoff_address || '',
    d.distance_km || '',
    d.status || '',
    d.fare_estimate ?? '',
    d.final_fare ?? '',
    d.payment_method || '',
    d.payment_status || '',
    d.driver_name || '',
    d.driver_phone || '',
    fmtDate(d.driver_assigned_at),
    fmtDate(d.picked_up_at),
    fmtDate(d.delivered_at),
    d.is_fragile ? 'Yes' : 'No',
    d.requires_signature ? 'Yes' : 'No',
    d.cancellation_reason || '',
    d.failure_reason || '',
  ].map(escape).join(','));

  const csv = [headers.join(','), ...csvRows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `mobo_deliveries_${new Date().toISOString().substring(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────
export default function Deliveries() {
  const [deliveries, setDeliveries] = useState([]);
  const [stats, setStats] = useState({
    total_deliveries: 0,
    pending: 0,
    in_transit: 0,
    delivered_today: 0,
    failed: 0,
    revenue_today: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');

  // Detail dialog
  const [selected, setSelected] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Cancel / fail dialogs
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [failTarget, setFailTarget] = useState(null);
  const [failReason, setFailReason] = useState('');
  const [failLoading, setFailLoading] = useState(false);

  // ── Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [deliveriesRes, statsRes] = await Promise.allSettled([
        api.get('/deliveries', { params: { admin: 'true' } }),
        api.get('/deliveries/stats'),
      ]);

      if (deliveriesRes.status === 'fulfilled') {
        const data = deliveriesRes.value.data?.data || deliveriesRes.value.data || [];
        setDeliveries(Array.isArray(data) ? data : MOCK_DELIVERIES);
      } else {
        setDeliveries(MOCK_DELIVERIES);
      }

      if (statsRes.status === 'fulfilled') {
        const s = statsRes.value.data?.data || statsRes.value.data || {};
        setStats({
          total_deliveries: Number(s.total_deliveries || 0),
          pending: Number(s.pending || 0),
          in_transit: Number(s.in_transit || 0) + Number(s.picked_up || 0),
          delivered_today: Number(s.delivered_today || 0),
          failed: Number(s.failed || 0),
          revenue_today: Number(s.revenue_today || 0),
        });
      } else {
        // Compute stats from mock data
        const d = MOCK_DELIVERIES;
        setStats({
          total_deliveries: d.length,
          pending: d.filter(x => x.status === 'pending').length,
          in_transit: d.filter(x => ['in_transit', 'picked_up'].includes(x.status)).length,
          delivered_today: d.filter(x => x.status === 'delivered').length,
          failed: d.filter(x => x.status === 'failed').length,
          revenue_today: d.filter(x => x.status === 'delivered').reduce((s, x) => s + (x.fare_estimate || 0), 0),
        });
      }
    } catch {
      setDeliveries(MOCK_DELIVERIES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Client-side filter
  const filtered = deliveries.filter((d) => {
    const matchStatus = statusFilter === 'all' || d.status === statusFilter;
    const matchSearch = !search || (d.sender_name || '').toLowerCase().includes(search.toLowerCase());
    const matchFrom = !dateFrom || new Date(d.created_at) >= new Date(dateFrom);
    const matchTo = !dateTo || new Date(d.created_at) <= new Date(dateTo + 'T23:59:59');
    return matchStatus && matchSearch && matchFrom && matchTo;
  });

  // ── Cancel
  const handleCancelSubmit = async () => {
    if (!cancelTarget) return;
    setCancelLoading(true);
    try {
      await api.post(`/deliveries/${cancelTarget.id}/cancel`, { reason: cancelReason });
      setDeliveries(prev =>
        prev.map(d => d.id === cancelTarget.id ? { ...d, status: 'cancelled', cancellation_reason: cancelReason } : d)
      );
      setSuccess(`Delivery ${shortId(cancelTarget.id)} cancelled.`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to cancel delivery');
    } finally {
      setCancelLoading(false);
      setCancelTarget(null);
      setCancelReason('');
      setDetailOpen(false);
      setTimeout(() => setSuccess(''), 4000);
    }
  };

  // ── Mark as Failed
  const handleFailSubmit = async () => {
    if (!failTarget) return;
    setFailLoading(true);
    try {
      await api.patch(`/deliveries/${failTarget.id}/status`, { status: 'failed', failure_reason: failReason });
      setDeliveries(prev =>
        prev.map(d => d.id === failTarget.id ? { ...d, status: 'failed', failure_reason: failReason } : d)
      );
      setSuccess(`Delivery ${shortId(failTarget.id)} marked as failed.`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update delivery');
    } finally {
      setFailLoading(false);
      setFailTarget(null);
      setFailReason('');
      setDetailOpen(false);
      setTimeout(() => setSuccess(''), 4000);
    }
  };

  // ── Table columns
  const columns = [
    {
      field: 'created_at',
      headerName: 'Date',
      renderCell: row => (
        <Typography sx={{ fontSize: '0.78rem' }}>{fmtDate(row.created_at)}</Typography>
      ),
    },
    {
      field: 'id',
      headerName: 'ID',
      renderCell: row => (
        <Typography sx={{ fontSize: '0.78rem', fontFamily: 'monospace', color: '#1976D2', fontWeight: 600 }}>
          #{shortId(row.id)}
        </Typography>
      ),
    },
    {
      field: 'sender_name',
      headerName: 'Sender',
      renderCell: row => (
        <Typography sx={{ fontSize: '0.82rem', fontWeight: 500 }}>{row.sender_name || '—'}</Typography>
      ),
    },
    {
      field: 'recipient_name',
      headerName: 'Recipient',
      renderCell: row => (
        <Box>
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 500 }}>{row.recipient_name || '—'}</Typography>
          <Typography sx={{ fontSize: '0.7rem', color: '#888' }}>{row.recipient_phone || ''}</Typography>
        </Box>
      ),
    },
    {
      field: 'package_size',
      headerName: 'Size',
      renderCell: row => <SizeChip size={row.package_size} />,
    },
    {
      field: 'route',
      headerName: 'Route',
      renderCell: row => (
        <Box>
          <Typography sx={{ fontSize: '0.75rem', color: '#555' }}>{truncate(row.pickup_address, 28)}</Typography>
          <Typography sx={{ fontSize: '0.7rem', color: '#999' }}>→ {truncate(row.dropoff_address, 28)}</Typography>
        </Box>
      ),
    },
    {
      field: 'status',
      headerName: 'Status',
      renderCell: row => <StatusChip status={row.status} />,
    },
    {
      field: 'fare_estimate',
      headerName: 'Fare',
      renderCell: row => (
        <Typography sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
          {fmtFare(row.final_fare ?? row.fare_estimate, row.currency || 'XAF')}
        </Typography>
      ),
    },
    {
      field: 'driver_name',
      headerName: 'Driver',
      renderCell: row => (
        <Typography sx={{ fontSize: '0.78rem', color: row.driver_name ? '#333' : '#bbb' }}>
          {row.driver_name || '—'}
        </Typography>
      ),
    },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Parcel Deliveries</Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<DownloadIcon />}
          onClick={() => exportCSV(filtered)}
          sx={{ borderRadius: '8px', borderColor: '#1A1A2E', color: '#1A1A2E', fontWeight: 600 }}
        >
          Export CSV
        </Button>
      </Box>

      {success && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* ── Summary cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard title="Total Deliveries" value={stats.total_deliveries?.toLocaleString()} icon={<DeliveryIcon />} iconBg="#1A1A2E" loading={loading} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard title="Pending" value={stats.pending?.toLocaleString()} icon={<PendingIcon />} iconBg="#757575" loading={loading} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard title="In Transit" value={stats.in_transit?.toLocaleString()} icon={<TransitIcon />} iconBg="#E65100" loading={loading} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard title="Delivered Today" value={stats.delivered_today?.toLocaleString()} icon={<DeliveredIcon />} iconBg="#388E3C" loading={loading} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard title="Failed" value={stats.failed?.toLocaleString()} icon={<FailedIcon />} iconBg="#C62828" loading={loading} />
        </Grid>
        <Grid item xs={6} sm={4} md={2}>
          <StatCard
            title="Revenue Today"
            value={`${Number(stats.revenue_today || 0).toLocaleString()} XAF`}
            icon={<RevenueIcon />}
            iconBg="#1565C0"
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* ── Filter bar + table */}
      <Card>
        <CardContent sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              placeholder="Search by sender name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              sx={{ flex: 1, minWidth: 200, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
            <FormControl size="small" sx={{ minWidth: 170 }}>
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                label="Status"
                onChange={e => setStatusFilter(e.target.value)}
                sx={{ borderRadius: '8px' }}
              >
                <MenuItem value="all">All Statuses</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="driver_assigned">Driver Assigned</MenuItem>
                <MenuItem value="driver_arriving">Driver Arriving</MenuItem>
                <MenuItem value="picked_up">Picked Up</MenuItem>
                <MenuItem value="in_transit">In Transit</MenuItem>
                <MenuItem value="delivered">Delivered</MenuItem>
                <MenuItem value="cancelled">Cancelled</MenuItem>
                <MenuItem value="failed">Failed</MenuItem>
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="From"
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 145, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
            <TextField
              size="small"
              label="To"
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: 145, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Box>

          <DataTable
            columns={columns}
            rows={filtered}
            loading={loading}
            externalSearch={search}
            actions
            onView={row => { setSelected(row); setDetailOpen(true); }}
            searchPlaceholder="Filter table..."
          />
        </CardContent>
      </Card>

      {/* ── Detail Dialog */}
      <Dialog
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: '16px' } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <DeliveryIcon sx={{ color: '#1A1A2E' }} />
            <Box>
              <Typography fontWeight={700} fontSize="1rem">
                Delivery #{shortId(selected?.id)}
              </Typography>
              {selected && <StatusChip status={selected.status} />}
            </Box>
          </Box>
          <IconButton onClick={() => setDetailOpen(false)} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <Divider />

        {selected && (
          <DialogContent sx={{ pt: 2.5 }}>
            <Grid container spacing={3}>
              {/* Left column — info */}
              <Grid item xs={12} md={7}>

                {/* Package */}
                <Typography variant="subtitle2" sx={{ mb: 1, color: '#555', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 0.5 }}>Package</Typography>
                <Grid container spacing={1.5} sx={{ mb: 2 }}>
                  {[
                    ['Description', selected.package_description || '—'],
                    ['Size', <SizeChip key="s" size={selected.package_size} />],
                    ['Weight', selected.package_weight_kg ? `${selected.package_weight_kg} kg` : '—'],
                    ['Fragile', selected.is_fragile ? 'Yes' : 'No'],
                    ['Requires Signature', selected.requires_signature ? 'Yes' : 'No'],
                    ['Distance', selected.distance_km ? `${selected.distance_km} km` : '—'],
                  ].map(([l, v]) => (
                    <Grid item xs={6} key={l}>
                      <Typography sx={{ fontSize: '0.7rem', color: 'rgba(0,0,0,0.45)', mb: 0.3 }}>{l}</Typography>
                      {typeof v === 'string' ? (
                        <Typography sx={{ fontSize: '0.85rem', fontWeight: 500 }}>{v}</Typography>
                      ) : v}
                    </Grid>
                  ))}
                </Grid>

                <Divider sx={{ my: 1.5 }} />

                {/* Route */}
                <Typography variant="subtitle2" sx={{ mb: 1, color: '#555', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 0.5 }}>Route</Typography>
                <Grid container spacing={1.5} sx={{ mb: 2 }}>
                  {[
                    ['Pickup Address', selected.pickup_address],
                    ['Dropoff Address', selected.dropoff_address],
                  ].map(([l, v]) => (
                    <Grid item xs={12} sm={6} key={l}>
                      <Typography sx={{ fontSize: '0.7rem', color: 'rgba(0,0,0,0.45)', mb: 0.3 }}>{l}</Typography>
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 500 }}>{v || '—'}</Typography>
                    </Grid>
                  ))}
                </Grid>

                <Divider sx={{ my: 1.5 }} />

                {/* People */}
                <Typography variant="subtitle2" sx={{ mb: 1, color: '#555', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 0.5 }}>Parties</Typography>
                <Grid container spacing={1.5} sx={{ mb: 2 }}>
                  {[
                    ['Sender', selected.sender_name || '—'],
                    ['Recipient', selected.recipient_name || '—'],
                    ['Recipient Phone', selected.recipient_phone || '—'],
                    ['Driver', selected.driver_name || '—'],
                    ['Driver Phone', selected.driver_phone || '—'],
                  ].map(([l, v]) => (
                    <Grid item xs={6} key={l}>
                      <Typography sx={{ fontSize: '0.7rem', color: 'rgba(0,0,0,0.45)', mb: 0.3 }}>{l}</Typography>
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 500 }}>{v}</Typography>
                    </Grid>
                  ))}
                </Grid>

                <Divider sx={{ my: 1.5 }} />

                {/* Payment */}
                <Typography variant="subtitle2" sx={{ mb: 1, color: '#555', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 0.5 }}>Payment</Typography>
                <Grid container spacing={1.5} sx={{ mb: 2 }}>
                  {[
                    ['Fare Estimate', fmtFare(selected.fare_estimate, selected.currency)],
                    ['Final Fare', fmtFare(selected.final_fare, selected.currency)],
                    ['Method', selected.payment_method || '—'],
                    ['Payment Status', selected.payment_status || '—'],
                  ].map(([l, v]) => (
                    <Grid item xs={6} key={l}>
                      <Typography sx={{ fontSize: '0.7rem', color: 'rgba(0,0,0,0.45)', mb: 0.3 }}>{l}</Typography>
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, textTransform: 'capitalize' }}>{v}</Typography>
                    </Grid>
                  ))}
                </Grid>

                {/* Notes / reasons */}
                {(selected.sender_note || selected.cancellation_reason || selected.failure_reason) && (
                  <>
                    <Divider sx={{ my: 1.5 }} />
                    <Typography variant="subtitle2" sx={{ mb: 1, color: '#555', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 0.5 }}>Notes</Typography>
                    {selected.sender_note && (
                      <Box sx={{ mb: 1 }}>
                        <Typography sx={{ fontSize: '0.7rem', color: 'rgba(0,0,0,0.45)', mb: 0.3 }}>Sender Note</Typography>
                        <Typography sx={{ fontSize: '0.85rem' }}>{selected.sender_note}</Typography>
                      </Box>
                    )}
                    {selected.cancellation_reason && (
                      <Box sx={{ mb: 1 }}>
                        <Typography sx={{ fontSize: '0.7rem', color: 'rgba(0,0,0,0.45)', mb: 0.3 }}>Cancellation Reason</Typography>
                        <Typography sx={{ fontSize: '0.85rem', color: '#C62828' }}>{selected.cancellation_reason}</Typography>
                      </Box>
                    )}
                    {selected.failure_reason && (
                      <Box sx={{ mb: 1 }}>
                        <Typography sx={{ fontSize: '0.7rem', color: 'rgba(0,0,0,0.45)', mb: 0.3 }}>Failure Reason</Typography>
                        <Typography sx={{ fontSize: '0.85rem', color: '#C62828' }}>{selected.failure_reason}</Typography>
                      </Box>
                    )}
                  </>
                )}
              </Grid>

              {/* Right column — timeline + photos */}
              <Grid item xs={12} md={5}>
                {/* Timeline */}
                <Typography variant="subtitle2" sx={{ mb: 1, color: '#555', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 0.5 }}>Timeline</Typography>
                <Box sx={{ bgcolor: 'rgba(0,0,0,0.02)', borderRadius: '8px', p: 1.5, mb: 2 }}>
                  <TimelineRow label="Booked" value={selected.created_at} />
                  <TimelineRow label="Driver Assigned" value={selected.driver_assigned_at} />
                  <TimelineRow label="Picked Up" value={selected.picked_up_at} />
                  <TimelineRow label="Delivered" value={selected.delivered_at} />
                  <TimelineRow label="Estimated Delivery" value={selected.estimated_delivery_at} />
                  <TimelineRow label="Scheduled For" value={selected.scheduled_at} />
                </Box>

                {/* Photos */}
                {(selected.package_photo_url || selected.pickup_photo_url || selected.delivery_photo_url) && (
                  <>
                    <Typography variant="subtitle2" sx={{ mb: 1.5, color: '#555', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 0.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <ImageIcon sx={{ fontSize: 14 }} /> Photos
                      </Box>
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      <PhotoThumb url={selected.package_photo_url} label="Package Photo (Sender)" />
                      <PhotoThumb url={selected.pickup_photo_url} label="Pickup Photo (Driver)" />
                      <PhotoThumb url={selected.delivery_photo_url} label="Delivery Photo (Proof)" />
                    </Box>
                  </>
                )}
              </Grid>
            </Grid>
          </DialogContent>
        )}

        <Divider />
        <DialogActions sx={{ p: 2, gap: 1, flexWrap: 'wrap' }}>
          {/* Admin actions — only show for non-terminal statuses */}
          {selected && !['delivered', 'cancelled', 'failed'].includes(selected.status) && (
            <>
              <Button
                size="small"
                variant="outlined"
                color="error"
                startIcon={<CancelIcon />}
                onClick={() => { setCancelTarget(selected); setDetailOpen(false); }}
                sx={{ borderRadius: '8px' }}
              >
                Cancel Delivery
              </Button>
              {['driver_assigned', 'driver_arriving', 'picked_up', 'in_transit'].includes(selected?.status) && (
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  startIcon={<MarkFailedIcon />}
                  onClick={() => { setFailTarget(selected); setDetailOpen(false); }}
                  sx={{ borderRadius: '8px' }}
                >
                  Mark as Failed
                </Button>
              )}
            </>
          )}
          <Button
            onClick={() => setDetailOpen(false)}
            variant="contained"
            size="small"
            sx={{ bgcolor: '#1A1A2E', '&:hover': { bgcolor: '#2d2d4e' }, borderRadius: '8px', ml: 'auto' }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Cancel Confirm Dialog */}
      <Dialog
        open={!!cancelTarget}
        onClose={() => { setCancelTarget(null); setCancelReason(''); }}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: '16px' } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Cancel Delivery</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2, fontSize: '0.9rem' }}>
            Cancel delivery <strong>#{shortId(cancelTarget?.id)}</strong>?
          </Typography>
          <TextField
            fullWidth
            size="small"
            label="Cancellation Reason"
            multiline
            rows={3}
            value={cancelReason}
            onChange={e => setCancelReason(e.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button
            onClick={() => { setCancelTarget(null); setCancelReason(''); }}
            variant="outlined"
            size="small"
            sx={{ borderRadius: '8px' }}
          >
            Back
          </Button>
          <Button
            onClick={handleCancelSubmit}
            color="error"
            variant="contained"
            size="small"
            disabled={cancelLoading}
            sx={{ borderRadius: '8px' }}
          >
            {cancelLoading ? <CircularProgress size={16} color="inherit" /> : 'Confirm Cancel'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Mark as Failed Dialog */}
      <Dialog
        open={!!failTarget}
        onClose={() => { setFailTarget(null); setFailReason(''); }}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: '16px' } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Mark as Failed</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2, fontSize: '0.9rem' }}>
            Mark delivery <strong>#{shortId(failTarget?.id)}</strong> as failed?
          </Typography>
          <TextField
            fullWidth
            size="small"
            label="Failure Reason (required)"
            multiline
            rows={3}
            value={failReason}
            onChange={e => setFailReason(e.target.value)}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button
            onClick={() => { setFailTarget(null); setFailReason(''); }}
            variant="outlined"
            size="small"
            sx={{ borderRadius: '8px' }}
          >
            Back
          </Button>
          <Button
            onClick={handleFailSubmit}
            color="warning"
            variant="contained"
            size="small"
            disabled={failLoading || !failReason.trim()}
            sx={{ borderRadius: '8px' }}
          >
            {failLoading ? <CircularProgress size={16} color="inherit" /> : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

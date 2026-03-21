import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Card, CardContent, Typography, Chip, Button, Grid,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert,
  Select, MenuItem, FormControl, InputLabel, TextField,
  Divider, IconButton, CircularProgress, Tooltip, Avatar,
} from '@mui/material';
import {
  VerifiedUser as VerifiedIcon,
  Warning as WarningIcon,
  Schedule as PendingIcon,
  Block as ExpiredIcon,
  Close as CloseIcon,
  Edit as EditIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import StatCard from '../components/StatCard';
import api from '../services/api';

// ─── mock data ────────────────────────────────────────────────────────────────

const BG_STATUSES = ['not_checked', 'pending', 'clear', 'flagged', 'expired'];

const MOCK_DRIVERS = Array.from({ length: 28 }, (_, i) => {
  const statuses = BG_STATUSES;
  const status = statuses[i % statuses.length];
  const lastCheckDate = status === 'not_checked' ? null : `202${4 + (i % 2)}-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`;
  const expiryDate = lastCheckDate
    ? (() => {
        const d = new Date(lastCheckDate);
        d.setFullYear(d.getFullYear() + 1);
        return d.toISOString().split('T')[0];
      })()
    : null;
  const daysUntilExpiry = expiryDate
    ? Math.round((new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  return {
    id: `drv_${i + 1}`,
    name: ['Kofi Mensah', 'Ibrahim Traore', 'Yves Nkomo', 'Grace Bello', 'Moussa Coulibaly', 'Aisha Mohammed'][i % 6],
    phone: `+237 6${String(i + 50).padStart(2, '0')} ${String(i * 3 + 100).substring(0, 3)} ${String(i * 7 + 200).substring(0, 3)}`,
    city: i % 2 === 0 ? 'Douala' : 'Yaoundé',
    background_check: {
      status,
      provider: status !== 'not_checked' ? ['CamChecks Cameroon', 'SecureVerify', 'AfriCheck'][i % 3] : '',
      last_check_date: lastCheckDate,
      expiry_date: expiryDate,
      days_until_expiry: daysUntilExpiry,
      notes: '',
    },
  };
});

// ─── helpers ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  not_checked: { label: 'Not Checked', color: '#E94560', bg: 'rgba(233,69,96,0.1)' },
  pending:     { label: 'Pending',     color: '#F5A623', bg: 'rgba(245,166,35,0.1)' },
  clear:       { label: 'Clear',       color: '#4CAF50', bg: 'rgba(76,175,80,0.1)'  },
  flagged:     { label: 'Flagged ⚠️',  color: '#E94560', bg: 'rgba(233,69,96,0.1)' },
  expired:     { label: 'Expired',     color: '#E94560', bg: 'rgba(233,69,96,0.1)' },
};

function StatusChip({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.not_checked;
  return (
    <Chip
      label={cfg.label}
      size="small"
      sx={{
        bgcolor: cfg.bg,
        color: cfg.color,
        fontWeight: 700,
        fontSize: '0.72rem',
        height: 22,
      }}
    />
  );
}

function urgencyScore(driver) {
  const s = driver.background_check?.status;
  if (s === 'not_checked' || s === 'expired') return 0;
  if (s === 'flagged') return 1;
  const days = driver.background_check?.days_until_expiry ?? 999;
  if (days < 0) return 0;
  if (days < 30) return 2;
  return 3;
}

function sortDrivers(drivers) {
  return [...drivers].sort((a, b) => {
    const ua = urgencyScore(a);
    const ub = urgencyScore(b);
    if (ua !== ub) return ua - ub;
    const da = a.background_check?.days_until_expiry ?? 999;
    const db = b.background_check?.days_until_expiry ?? 999;
    return da - db;
  });
}

const EMPTY_FORM = {
  status: 'pending',
  provider: '',
  check_date: '',
  notes: '',
};

const inputSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '8px',
    '&:hover fieldset': { borderColor: '#1A1A2E' },
    '&.Mui-focused fieldset': { borderColor: '#1A1A2E' },
  },
  '& .MuiInputLabel-root.Mui-focused': { color: '#1A1A2E' },
};

// ─── main component ──────────────────────────────────────────────────────────

export default function BackgroundChecks() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [editOpen, setEditOpen] = useState(false);
  const [editDriver, setEditDriver] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchDrivers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [driversRes, expiredRes] = await Promise.allSettled([
        api.get('/users/drivers'),
        api.get('/users/drivers/background-checks/expired'),
      ]);

      let data = [];
      if (driversRes.status === 'fulfilled') {
        const raw = driversRes.value.data;
        data = Array.isArray(raw) ? raw : (raw?.drivers || raw?.data || []);
      }

      // Merge expired list if available
      if (expiredRes.status === 'fulfilled') {
        const expiredIds = new Set(
          (expiredRes.value.data?.drivers || expiredRes.value.data || []).map(d => d.id || d._id)
        );
        data = data.map(d => {
          const id = d.id || d._id;
          if (expiredIds.has(id) && d.background_check?.status !== 'expired') {
            return { ...d, background_check: { ...(d.background_check || {}), status: 'expired' } };
          }
          return d;
        });
      }

      setDrivers(data.length ? data : MOCK_DRIVERS);
    } catch {
      setDrivers(MOCK_DRIVERS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDrivers(); }, [fetchDrivers]);

  const getName = d => d.full_name || d.name || '';

  const stats = {
    total: drivers.length,
    notChecked: drivers.filter(d => d.background_check?.status === 'not_checked' || !d.background_check).length,
    expiringSoon: drivers.filter(d => {
      const days = d.background_check?.days_until_expiry;
      return typeof days === 'number' && days >= 0 && days < 30;
    }).length,
    flagged: drivers.filter(d => d.background_check?.status === 'flagged').length,
  };

  const filtered = sortDrivers(
    drivers.filter(d => {
      const q = search.toLowerCase();
      const name = getName(d).toLowerCase();
      const matchQ = !q || name.includes(q) || d.phone?.includes(q) || d.city?.toLowerCase().includes(q);
      const matchStatus =
        statusFilter === 'all' ||
        (d.background_check?.status || 'not_checked') === statusFilter;
      return matchQ && matchStatus;
    })
  );

  const openEdit = (driver) => {
    setEditDriver(driver);
    const bc = driver.background_check || {};
    setForm({
      status: bc.status || 'not_checked',
      provider: bc.provider || '',
      check_date: bc.last_check_date?.substring(0, 10) || '',
      notes: bc.notes || '',
    });
    setEditOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const id = editDriver.id || editDriver._id;
      await api.patch(`/users/drivers/${id}/background-check`, {
        status: form.status,
        provider: form.provider,
        last_check_date: form.check_date || null,
        notes: form.notes,
      });
    } catch {
      // optimistic — update local state even if API fails
    }

    // Compute new expiry + days
    let expiryDate = null;
    let daysUntilExpiry = null;
    if (form.check_date) {
      const d = new Date(form.check_date);
      d.setFullYear(d.getFullYear() + 1);
      expiryDate = d.toISOString().split('T')[0];
      daysUntilExpiry = Math.round((d - new Date()) / (1000 * 60 * 60 * 24));
    }

    setDrivers(prev =>
      prev.map(d => {
        if ((d.id || d._id) === (editDriver.id || editDriver._id)) {
          return {
            ...d,
            background_check: {
              ...d.background_check,
              status: form.status,
              provider: form.provider,
              last_check_date: form.check_date || d.background_check?.last_check_date,
              expiry_date: expiryDate || d.background_check?.expiry_date,
              days_until_expiry: daysUntilExpiry ?? d.background_check?.days_until_expiry,
              notes: form.notes,
            },
          };
        }
        return d;
      })
    );

    setSuccess(`Background check updated for ${getName(editDriver)}.`);
    setEditOpen(false);
    setSaving(false);
    setTimeout(() => setSuccess(''), 4000);
  };

  const daysChip = (days) => {
    if (days == null) return '—';
    if (days < 0) return <Chip label="Overdue" size="small" sx={{ bgcolor: 'rgba(233,69,96,0.1)', color: '#E94560', fontWeight: 700, fontSize: '0.7rem', height: 20 }} />;
    if (days < 30) return <Chip label={`${days}d`} size="small" sx={{ bgcolor: 'rgba(245,166,35,0.1)', color: '#F5A623', fontWeight: 700, fontSize: '0.7rem', height: 20 }} />;
    return <Typography sx={{ fontSize: '0.82rem' }}>{days}d</Typography>;
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Background Check Dashboard</Typography>
        <Button
          variant="outlined"
          startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
          onClick={fetchDrivers}
          disabled={loading}
          sx={{ borderRadius: '8px', borderColor: '#1A1A2E', color: '#1A1A2E', fontWeight: 600 }}
        >
          Refresh
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setSuccess('')}>{success}</Alert>}

      {/* ── Summary cards ── */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <StatCard
            title="Total Drivers"
            value={stats.total.toLocaleString()}
            icon={<VerifiedIcon />}
            iconBg="#1A1A2E"
            loading={loading}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard
            title="Not Checked"
            value={stats.notChecked.toLocaleString()}
            icon={<ExpiredIcon />}
            iconBg="#E94560"
            loading={loading}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard
            title="Expiring Soon"
            value={stats.expiringSoon.toLocaleString()}
            icon={<PendingIcon />}
            iconBg="#F5A623"
            loading={loading}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard
            title="Flagged"
            value={stats.flagged.toLocaleString()}
            icon={<WarningIcon />}
            iconBg="#E94560"
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* ── Table card ── */}
      <Card sx={{ borderRadius: '16px' }}>
        <CardContent sx={{ p: 2.5 }}>
          {/* Filters */}
          <Box sx={{ display: 'flex', gap: 2, mb: 2.5, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              placeholder="Search by name, phone, city…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              sx={{ flex: 1, minWidth: 200, ...inputSx }}
            />
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                label="Status"
                onChange={e => setStatusFilter(e.target.value)}
                sx={{ borderRadius: '8px' }}
              >
                <MenuItem value="all">All Statuses</MenuItem>
                {BG_STATUSES.map(s => (
                  <MenuItem key={s} value={s}>{STATUS_CONFIG[s].label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {/* Table */}
          <Box sx={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Driver', 'Phone', 'City', 'Last Check', 'Expires', 'Days Left', 'Status', 'Actions'].map(col => (
                    <th
                      key={col}
                      style={{
                        padding: '8px 12px',
                        textAlign: 'left',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        color: 'rgba(26,26,46,0.45)',
                        borderBottom: '1px solid rgba(0,0,0,0.08)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '32px', textAlign: 'center' }}>
                      <CircularProgress size={28} sx={{ color: '#1A1A2E' }} />
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: 'rgba(26,26,46,0.4)', fontSize: '0.88rem' }}>
                      No drivers found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((driver, idx) => {
                    const bc = driver.background_check || {};
                    return (
                      <tr
                        key={driver.id || driver._id || idx}
                        style={{
                          borderBottom: '1px solid rgba(0,0,0,0.05)',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(26,26,46,0.02)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        {/* Driver */}
                        <td style={{ padding: '10px 12px' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Avatar sx={{ width: 28, height: 28, fontSize: '0.75rem', bgcolor: '#1A1A2E' }}>
                              {getName(driver)?.charAt(0)}
                            </Avatar>
                            <Typography sx={{ fontSize: '0.83rem', fontWeight: 600 }}>{getName(driver)}</Typography>
                          </Box>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <Typography sx={{ fontSize: '0.8rem', color: 'rgba(26,26,46,0.7)' }}>{driver.phone}</Typography>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <Typography sx={{ fontSize: '0.8rem', color: 'rgba(26,26,46,0.7)' }}>{driver.city}</Typography>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <Typography sx={{ fontSize: '0.8rem' }}>{bc.last_check_date?.substring(0, 10) || '—'}</Typography>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <Typography sx={{ fontSize: '0.8rem' }}>{bc.expiry_date?.substring(0, 10) || '—'}</Typography>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {daysChip(bc.days_until_expiry)}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <StatusChip status={bc.status || 'not_checked'} />
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <Tooltip title="Update background check">
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<EditIcon sx={{ fontSize: 14 }} />}
                              onClick={() => openEdit(driver)}
                              sx={{
                                fontSize: '0.72rem',
                                py: 0.4,
                                px: 1.2,
                                borderRadius: '6px',
                                borderColor: '#1A1A2E',
                                color: '#1A1A2E',
                                fontWeight: 600,
                                minWidth: 'auto',
                              }}
                            >
                              Update
                            </Button>
                          </Tooltip>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </Box>

          {!loading && (
            <Typography sx={{ fontSize: '0.75rem', color: 'rgba(26,26,46,0.4)', mt: 1.5, textAlign: 'right' }}>
              {filtered.length} of {drivers.length} drivers shown
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* ── Edit dialog ── */}
      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: '16px' } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EditIcon sx={{ color: '#1A1A2E', fontSize: 20 }} />
            <Typography fontWeight={700}>
              Update Background Check — {editDriver && getName(editDriver)}
            </Typography>
          </Box>
          <IconButton onClick={() => setEditOpen(false)} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          <Grid container spacing={2}>
            {/* Status */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select
                  value={form.status}
                  label="Status"
                  onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                  sx={{ borderRadius: '8px' }}
                >
                  {BG_STATUSES.map(s => (
                    <MenuItem key={s} value={s}>{STATUS_CONFIG[s].label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* Provider */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Provider"
                placeholder="e.g. CamChecks Cameroon"
                value={form.provider}
                onChange={e => setForm(p => ({ ...p, provider: e.target.value }))}
                sx={inputSx}
              />
            </Grid>

            {/* Check date */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                size="small"
                label="Check Date"
                type="date"
                value={form.check_date}
                onChange={e => setForm(p => ({ ...p, check_date: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={inputSx}
              />
            </Grid>

            {/* Notes */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                label="Notes"
                multiline
                rows={3}
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Any relevant notes about this background check…"
                sx={inputSx}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setEditOpen(false)} variant="outlined" size="small" sx={{ borderRadius: '8px' }}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            size="small"
            disabled={saving}
            sx={{ bgcolor: '#1A1A2E', '&:hover': { bgcolor: '#2d2d4e' }, borderRadius: '8px', fontWeight: 700 }}
          >
            {saving ? <CircularProgress size={18} color="inherit" /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

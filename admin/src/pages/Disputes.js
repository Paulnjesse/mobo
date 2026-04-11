import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  Divider,
  IconButton,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tooltip,
  Snackbar,
} from '@mui/material';
import {
  Close as CloseIcon,
  Visibility as ViewIcon,
  CheckCircle as ResolveIcon,
  Block as DismissIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';
import api from '../services/api';

// ── Constants ──────────────────────────────────────────────────────────────
const CATEGORY_LABELS = {
  overcharge: 'Overcharge',
  wrong_route: 'Wrong Route',
  driver_behavior: 'Driver Behavior',
  rider_behavior: 'Rider Behavior',
  vehicle_condition: 'Vehicle Condition',
  item_damage: 'Item / Damage',
  safety: 'Safety',
  other: 'Other',
};

const STATUS_CHIPS = {
  open: { label: 'Open', color: '#FF8C00', bg: 'rgba(255,140,0,0.12)' },
  under_review: { label: 'Under Review', color: '#1565C0', bg: 'rgba(21,101,192,0.1)' },
  resolved: { label: 'Resolved', color: '#2E7D32', bg: 'rgba(46,125,50,0.1)' },
  dismissed: { label: 'Dismissed', color: '#757575', bg: 'rgba(0,0,0,0.06)' },
};

// ── Mock data (used if API fails) ─────────────────────────────────────────
const MOCK_DISPUTES = Array.from({ length: 18 }, (_, i) => ({
  id: `dsp_${i + 1}`,
  ride_id: `ride_${String(i * 789 + 1000).substring(0, 6)}`,
  category: Object.keys(CATEGORY_LABELS)[i % Object.keys(CATEGORY_LABELS).length],
  description: [
    'The driver took a completely different route and charged extra.',
    'Driver was rude and used inappropriate language during the trip.',
    'The vehicle had a broken seat belt and smelled strongly of smoke.',
    'I was charged twice for the same ride.',
    'Driver cancelled after I was already waiting 15 minutes.',
    'My bag was left in the car and I cannot reach the driver.',
  ][i % 6],
  status: ['open', 'under_review', 'resolved', 'dismissed', 'open', 'under_review'][i % 6],
  reporter_name: ['Kofi Mensah', 'Grace Bello', 'Ibrahim Traore', 'Aisha Mohammed'][i % 4],
  reporter_phone: `+237 6${String(i + 50).padStart(2, '0')} 000 ${String(i * 7 + 100).substring(0, 3)}`,
  pickup: ['Akwa, Douala', 'Bastos, Yaoundé', 'Bonanjo, Douala'][i % 3],
  dropoff: ['Bonapriso, Douala', 'Nlongkak, Yaoundé', 'Deido, Douala'][i % 3],
  resolution: i % 6 === 2 ? 'Refund of 1500 XAF issued to rider. Driver warned.' : null,
  created_at: new Date(Date.now() - i * 86400000 * 2).toISOString(),
}));

// ── Helpers ────────────────────────────────────────────────────────────────
function StatusChip({ status }) {
  const meta = STATUS_CHIPS[status] || STATUS_CHIPS.open;
  return (
    <Chip
      label={meta.label}
      size="small"
      sx={{
        bgcolor: meta.bg,
        color: meta.color,
        fontWeight: 700,
        fontSize: '0.7rem',
        height: 22,
        border: `1px solid ${meta.color}30`,
      }}
    />
  );
}

function truncate(str, n = 50) {
  if (!str) return '—';
  return str.length > n ? str.substring(0, n) + '…' : str;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function Disputes() {
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Detail dialog
  const [selected, setSelected] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resolution, setResolution] = useState('');
  const [actionLoading, setActionLoading] = useState(null); // 'resolve' | 'dismiss'

  const fetchDisputes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/disputes');
      const data = res.data?.disputes || res.data || [];
      setDisputes(data.length ? data : MOCK_DISPUTES);
    } catch {
      setDisputes(MOCK_DISPUTES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDisputes(); }, [fetchDisputes]);

  // ── Filtering ──────────────────────────────────────────────────────────
  const filtered = disputes.filter((d) => {
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    if (categoryFilter !== 'all' && d.category !== categoryFilter) return false;
    if (dateFrom) {
      const created = new Date(d.created_at);
      if (created < new Date(dateFrom)) return false;
    }
    if (dateTo) {
      const created = new Date(d.created_at);
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      if (created > endOfDay) return false;
    }
    return true;
  });

  // ── Actions ────────────────────────────────────────────────────────────
  const openDialog = (dispute) => {
    setSelected(dispute);
    setResolution(dispute.resolution || '');
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setTimeout(() => { setSelected(null); setResolution(''); }, 300);
  };

  const handleAction = async (action) => {
    if (!selected) return;
    setActionLoading(action);
    try {
      const newStatus = action === 'resolve' ? 'resolved' : 'dismissed';
      await api.patch(`/disputes/${selected.id}/resolve`, {
        status: newStatus,
        resolution: action === 'resolve' ? resolution : undefined,
      });
      setDisputes((prev) =>
        prev.map((d) =>
          d.id === selected.id
            ? { ...d, status: newStatus, resolution: action === 'resolve' ? resolution : d.resolution }
            : d
        )
      );
      setSnackbar({
        open: true,
        message: action === 'resolve' ? 'Dispute marked as resolved.' : 'Dispute dismissed.',
        severity: 'success',
      });
      closeDialog();
    } catch (err) {
      setSnackbar({
        open: true,
        message: err?.response?.data?.message || 'Action failed. Please try again.',
        severity: 'error',
      });
    } finally {
      setActionLoading(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
        Ride Disputes
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* ── Filter bar ── */}
      <Paper sx={{ p: 2, mb: 2, borderRadius: '12px', display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <FilterIcon sx={{ color: '#666' }} />

        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Status</InputLabel>
          <Select value={statusFilter} label="Status" onChange={(e) => setStatusFilter(e.target.value)} sx={{ borderRadius: '8px' }}>
            <MenuItem value="all">All Statuses</MenuItem>
            {Object.entries(STATUS_CHIPS).map(([k, v]) => (
              <MenuItem key={k} value={k}>{v.label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel>Category</InputLabel>
          <Select value={categoryFilter} label="Category" onChange={(e) => setCategoryFilter(e.target.value)} sx={{ borderRadius: '8px' }}>
            <MenuItem value="all">All Categories</MenuItem>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <MenuItem key={k} value={k}>{v}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          size="small"
          label="From"
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 150, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
        />
        <TextField
          size="small"
          label="To"
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 150, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
        />

        <Button
          size="small"
          variant="outlined"
          onClick={() => { setStatusFilter('all'); setCategoryFilter('all'); setDateFrom(''); setDateTo(''); }}
          sx={{ borderRadius: '8px', ml: 'auto' }}
        >
          Clear Filters
        </Button>
      </Paper>

      {/* ── Table ── */}
      <Paper sx={{ borderRadius: '12px', overflow: 'hidden' }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#F9FAFB' }}>
                {['Date', 'Ride ID', 'Reporter', 'Category', 'Description', 'Status', 'Actions'].map((h) => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#555', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6, color: '#999' }}>
                    No disputes match the selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((d) => (
                  <TableRow
                    key={d.id}
                    hover
                    sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'rgba(0,0,0,0.02)' } }}
                    onClick={() => openDialog(d)}
                  >
                    <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{fmtDate(d.created_at)}</TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: '0.78rem', fontFamily: 'monospace', color: '#000000', fontWeight: 600 }}>
                        #{String(d.ride_id || d.id).slice(-6).toUpperCase()}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }}>{d.reporter_name || '—'}</Typography>
                      {d.reporter_phone && (
                        <Typography sx={{ fontSize: '0.72rem', color: '#666' }}>{d.reporter_phone}</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: '0.8rem' }}>
                        {CATEGORY_LABELS[d.category] || d.category || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 220 }}>
                      <Tooltip title={d.description || ''} placement="top">
                        <Typography sx={{ fontSize: '0.78rem', color: '#555' }}>
                          {truncate(d.description, 50)}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <StatusChip status={d.status} />
                    </TableCell>
                    <TableCell>
                      <Tooltip title="View details">
                        <IconButton
                          size="small"
                          onClick={(e) => { e.stopPropagation(); openDialog(d); }}
                          sx={{ color: '#000000' }}
                        >
                          <ViewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
          <Typography sx={{ fontSize: '0.78rem', color: '#888' }}>
            Showing {filtered.length} of {disputes.length} disputes
          </Typography>
        </Box>
      </Paper>

      {/* ── Detail dialog ── */}
      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: '16px' } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography fontWeight={700}>Dispute Details</Typography>
            {selected && <StatusChip status={selected.status} />}
          </Box>
          <IconButton size="small" onClick={closeDialog}><CloseIcon /></IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          {selected && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Ride info */}
              <Box>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, mb: 1 }}>
                  Ride Info
                </Typography>
                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: '8px', bgcolor: '#F9FAFB' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontSize: '0.82rem' }}>
                      <strong>Ride ID:</strong> #{String(selected.ride_id || selected.id).slice(-8).toUpperCase()}
                    </Typography>
                  </Box>
                  {(selected.pickup || selected.dropoff) && (
                    <Typography sx={{ fontSize: '0.82rem', mt: 0.5 }}>
                      {selected.pickup || '—'} <strong>→</strong> {selected.dropoff || '—'}
                    </Typography>
                  )}
                </Paper>
              </Box>

              {/* Reporter */}
              <Box>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, mb: 1 }}>
                  Reporter
                </Typography>
                <Box sx={{ display: 'flex', gap: 4 }}>
                  {[['Name', selected.reporter_name], ['Phone', selected.reporter_phone], ['Date', fmtDate(selected.created_at)]].map(([l, v]) => (
                    <Box key={l}>
                      <Typography sx={{ fontSize: '0.7rem', color: '#aaa', mb: 0.2 }}>{l}</Typography>
                      <Typography sx={{ fontSize: '0.88rem', fontWeight: 500 }}>{v || '—'}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>

              {/* Category */}
              <Box>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.5 }}>
                  Category
                </Typography>
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 600 }}>
                  {CATEGORY_LABELS[selected.category] || selected.category || '—'}
                </Typography>
              </Box>

              {/* Description */}
              <Box>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.5 }}>
                  Description
                </Typography>
                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: '8px', bgcolor: '#F9FAFB' }}>
                  <Typography sx={{ fontSize: '0.88rem', lineHeight: 1.6 }}>
                    {selected.description || '—'}
                  </Typography>
                </Paper>
              </Box>

              {/* Resolution (only if not already resolved/dismissed) */}
              {!['resolved', 'dismissed'].includes(selected.status) && (
                <Box>
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.5 }}>
                    Resolution Notes
                  </Typography>
                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    placeholder="Describe the resolution or reason for dismissal..."
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    size="small"
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: '0.88rem' } }}
                  />
                </Box>
              )}

              {/* Existing resolution */}
              {selected.resolution && (
                <Box>
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#2E7D32', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.5 }}>
                    Resolution
                  </Typography>
                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: '8px', bgcolor: 'rgba(46,125,50,0.04)', borderColor: 'rgba(46,125,50,0.3)' }}>
                    <Typography sx={{ fontSize: '0.88rem', color: '#2E7D32' }}>{selected.resolution}</Typography>
                  </Paper>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2, gap: 1, flexWrap: 'wrap' }}>
          <Button onClick={closeDialog} variant="outlined" size="small" sx={{ borderRadius: '8px' }}>
            Close
          </Button>
          {selected && !['resolved', 'dismissed'].includes(selected.status) && (
            <>
              <Button
                onClick={() => handleAction('dismiss')}
                variant="outlined"
                color="error"
                size="small"
                disabled={!!actionLoading}
                startIcon={actionLoading === 'dismiss' ? <CircularProgress size={14} color="inherit" /> : <DismissIcon />}
                sx={{ borderRadius: '8px' }}
              >
                Dismiss
              </Button>
              <Button
                onClick={() => handleAction('resolve')}
                variant="contained"
                color="success"
                size="small"
                disabled={!!actionLoading}
                startIcon={actionLoading === 'resolve' ? <CircularProgress size={14} color="inherit" /> : <ResolveIcon />}
                sx={{ borderRadius: '8px' }}
              >
                Mark Resolved
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3500}
        onClose={() => setSnackbar((p) => ({ ...p, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((p) => ({ ...p, open: false }))}
          severity={snackbar.severity}
          sx={{ borderRadius: '8px' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

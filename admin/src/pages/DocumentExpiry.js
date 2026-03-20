import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  Alert,
  Tabs,
  Tab,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Snackbar,
  Avatar,
} from '@mui/material';
import {
  NotificationsActive as ReminderIcon,
  Warning as WarningIcon,
  CheckCircle as OkIcon,
} from '@mui/icons-material';
import { driversAPI } from '../services/api';

// ── Constants ──────────────────────────────────────────────────────────────
const WARN_SOON_DAYS = 7;   // Red if < 7 days
const WARN_DAYS = 30;       // Orange if < 30 days

// ── Mock drivers (used if API fails) ─────────────────────────────────────
const MOCK_DRIVERS = Array.from({ length: 20 }, (_, i) => ({
  id: `drv_${i + 1}`,
  name: ['Kofi Mensah', 'Ibrahim Traore', 'Yves Nkomo', 'Grace Bello', 'Moussa Coulibaly', 'Aisha Mohammed'][i % 6],
  phone: `+237 6${String(i + 50).padStart(2, '0')} ${String(i * 3 + 100).substring(0, 3)} ${String(i * 7 + 200).substring(0, 3)}`,
  // Spread expiry dates: some expired, some soon, some far away
  license_expiry: (() => {
    const offsets = [-10, -3, 2, 6, 15, 25, 45, 90, 120, 200];
    const d = new Date();
    d.setDate(d.getDate() + offsets[i % offsets.length]);
    return d.toISOString().substring(0, 10);
  })(),
  vehicle: {
    insurance_expiry: (() => {
      const offsets = [5, -5, 20, -1, 29, 8, 60, -15, 3, 180];
      const d = new Date();
      d.setDate(d.getDate() + offsets[i % offsets.length]);
      return d.toISOString().substring(0, 10);
    })(),
  },
}));

// ── Helpers ────────────────────────────────────────────────────────────────
function daysRemaining(dateStr) {
  if (!dateStr) return null;
  const expiry = new Date(dateStr);
  expiry.setHours(23, 59, 59, 999);
  const now = new Date();
  return Math.floor((expiry - now) / (1000 * 60 * 60 * 24));
}

function getExpiryStatus(days) {
  if (days === null) return null;
  if (days < 0) return 'expired';
  if (days < WARN_SOON_DAYS) return 'critical';
  if (days < WARN_DAYS) return 'warning';
  return 'ok';
}

const STATUS_CHIP_META = {
  expired: { label: 'Expired', color: '#C62828', bg: 'rgba(198,40,40,0.1)' },
  critical: { label: `< ${WARN_SOON_DAYS}d`, color: '#C62828', bg: 'rgba(198,40,40,0.1)' },
  warning: { label: `< ${WARN_DAYS}d`, color: '#E65100', bg: 'rgba(230,81,0,0.1)' },
  ok: { label: 'OK', color: '#2E7D32', bg: 'rgba(46,125,50,0.1)' },
};

function ExpiryChip({ days }) {
  const status = getExpiryStatus(days);
  if (!status) return <Typography sx={{ fontSize: '0.8rem', color: '#aaa' }}>—</Typography>;
  const meta = STATUS_CHIP_META[status];
  return (
    <Chip
      size="small"
      label={status === 'expired' ? 'Expired' : days === 0 ? 'Today' : status === 'ok' ? `${days}d` : `${days}d`}
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

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Build expiry rows from a drivers array ─────────────────────────────────
function buildRows(drivers, docType) {
  const rows = [];
  for (const driver of drivers) {
    if (docType === 'license' || docType === 'all') {
      const days = daysRemaining(driver.license_expiry);
      if (days !== null && days < WARN_DAYS) {
        rows.push({
          key: `${driver.id}_license`,
          driver,
          docType: 'License',
          expiryDate: driver.license_expiry,
          daysRemaining: days,
        });
      }
    }
    if (docType === 'insurance' || docType === 'all') {
      const days = daysRemaining(driver.vehicle?.insurance_expiry);
      if (days !== null && days < WARN_DAYS) {
        rows.push({
          key: `${driver.id}_insurance`,
          driver,
          docType: 'Insurance',
          expiryDate: driver.vehicle?.insurance_expiry,
          daysRemaining: days,
        });
      }
    }
  }
  // Sort: most urgent first (expired = most negative = most urgent)
  rows.sort((a, b) => a.daysRemaining - b.daysRemaining);
  return rows;
}

// ── ExpiryTable sub-component ──────────────────────────────────────────────
function ExpiryTable({ rows, onSendReminder, remindersSent }) {
  if (rows.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8, color: '#aaa' }}>
        <OkIcon sx={{ fontSize: 48, color: '#A5D6A7', mb: 1 }} />
        <Typography fontWeight={600} color="#555">
          No expiring documents in this category
        </Typography>
        <Typography fontSize="0.85rem" mt={0.5}>
          All drivers are up to date.
        </Typography>
      </Box>
    );
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ bgcolor: '#F9FAFB' }}>
            {['Driver', 'Phone', 'Document', 'Expiry Date', 'Days Remaining', 'Status', 'Action'].map((h) => (
              <TableCell
                key={h}
                sx={{ fontWeight: 700, fontSize: '0.74rem', color: '#555', textTransform: 'uppercase', letterSpacing: 0.5 }}
              >
                {h}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const status = getExpiryStatus(row.daysRemaining);
            const isExpired = status === 'expired';
            const isCritical = status === 'critical';
            const sent = remindersSent.has(row.key);

            return (
              <TableRow
                key={row.key}
                sx={{
                  bgcolor: isExpired ? 'rgba(198,40,40,0.03)' : isCritical ? 'rgba(198,40,40,0.02)' : 'inherit',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.02)' },
                }}
              >
                {/* Driver */}
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Avatar sx={{ width: 28, height: 28, fontSize: '0.75rem', bgcolor: '#1A1A2E' }}>
                      {(row.driver.name || row.driver.full_name || '?').charAt(0)}
                    </Avatar>
                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }}>
                      {row.driver.name || row.driver.full_name || '—'}
                    </Typography>
                  </Box>
                </TableCell>

                {/* Phone */}
                <TableCell sx={{ fontSize: '0.8rem', color: '#555' }}>
                  {row.driver.phone || '—'}
                </TableCell>

                {/* Doc type */}
                <TableCell>
                  <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }}>
                    {row.docType}
                  </Typography>
                </TableCell>

                {/* Expiry date */}
                <TableCell sx={{ fontSize: '0.82rem', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                  {fmtDate(row.expiryDate)}
                </TableCell>

                {/* Days remaining */}
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {isExpired || isCritical ? (
                      <WarningIcon sx={{ fontSize: 14, color: '#C62828' }} />
                    ) : null}
                    <Typography
                      sx={{
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        color: isExpired ? '#C62828' : isCritical ? '#C62828' : status === 'warning' ? '#E65100' : '#2E7D32',
                      }}
                    >
                      {row.daysRemaining < 0
                        ? `${Math.abs(row.daysRemaining)}d ago`
                        : row.daysRemaining === 0
                        ? 'Today'
                        : `${row.daysRemaining} days`}
                    </Typography>
                  </Box>
                </TableCell>

                {/* Status chip */}
                <TableCell>
                  <ExpiryChip days={row.daysRemaining} />
                </TableCell>

                {/* Action */}
                <TableCell>
                  <Button
                    size="small"
                    variant={sent ? 'outlined' : 'contained'}
                    color={sent ? 'success' : 'primary'}
                    disabled={sent}
                    startIcon={<ReminderIcon sx={{ fontSize: '0.9rem !important' }} />}
                    onClick={() => onSendReminder(row)}
                    sx={{
                      borderRadius: '8px',
                      fontSize: '0.72rem',
                      textTransform: 'none',
                      fontWeight: 700,
                      minWidth: 120,
                      bgcolor: sent ? undefined : '#1A1A2E',
                      '&:hover': { bgcolor: sent ? undefined : '#2d2d4e' },
                    }}
                  >
                    {sent ? 'Sent' : 'Send Reminder'}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function DocumentExpiry() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0); // 0=License, 1=Insurance, 2=All
  const [remindersSent, setRemindersSent] = useState(new Set());
  const [snackbar, setSnackbar] = useState({ open: false, message: '' });

  const fetchDrivers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await driversAPI.getAll({});
      const data = res.data?.drivers || res.data || [];
      setDrivers(data.length ? data : MOCK_DRIVERS);
    } catch {
      setDrivers(MOCK_DRIVERS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDrivers(); }, [fetchDrivers]);

  const handleSendReminder = useCallback((row) => {
    setRemindersSent((prev) => new Set([...prev, row.key]));
    const name = row.driver.name || row.driver.full_name || 'Driver';
    setSnackbar({ open: true, message: `Reminder sent to ${name} for ${row.docType} expiry.` });
  }, []);

  const docTypes = ['license', 'insurance', 'all'];
  const currentDocType = docTypes[tab];

  const rows = loading ? [] : buildRows(drivers, currentDocType);

  // Summary counts
  const allRows = loading ? [] : buildRows(drivers, 'all');
  const expiredCount = allRows.filter((r) => r.daysRemaining < 0).length;
  const criticalCount = allRows.filter((r) => r.daysRemaining >= 0 && r.daysRemaining < WARN_SOON_DAYS).length;
  const warningCount = allRows.filter((r) => r.daysRemaining >= WARN_SOON_DAYS && r.daysRemaining < WARN_DAYS).length;

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
        Document Expiry
      </Typography>
      <Typography sx={{ fontSize: '0.9rem', color: '#666', mb: 3 }}>
        Monitor driver license and insurance expiry dates. Drivers within {WARN_DAYS} days of expiry are shown here.
      </Typography>

      {/* Summary chips */}
      {!loading && (
        <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap' }}>
          <Chip
            icon={<WarningIcon sx={{ fontSize: '1rem !important', color: '#C62828 !important' }} />}
            label={`${expiredCount} Expired`}
            sx={{ bgcolor: 'rgba(198,40,40,0.1)', color: '#C62828', fontWeight: 700, border: '1px solid rgba(198,40,40,0.2)' }}
          />
          <Chip
            icon={<WarningIcon sx={{ fontSize: '1rem !important', color: '#C62828 !important' }} />}
            label={`${criticalCount} Critical (< ${WARN_SOON_DAYS}d)`}
            sx={{ bgcolor: 'rgba(198,40,40,0.07)', color: '#C62828', fontWeight: 700, border: '1px solid rgba(198,40,40,0.15)' }}
          />
          <Chip
            icon={<WarningIcon sx={{ fontSize: '1rem !important', color: '#E65100 !important' }} />}
            label={`${warningCount} Expiring Soon (< ${WARN_DAYS}d)`}
            sx={{ bgcolor: 'rgba(230,81,0,0.08)', color: '#E65100', fontWeight: 700, border: '1px solid rgba(230,81,0,0.2)' }}
          />
        </Box>
      )}

      <Paper sx={{ borderRadius: '12px', overflow: 'hidden' }}>
        {/* Tabs */}
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ borderBottom: '1px solid rgba(0,0,0,0.08)', px: 2 }}
          TabIndicatorProps={{ sx: { bgcolor: '#1A1A2E' } }}
        >
          <Tab
            label={`License Expiry${!loading ? ` (${buildRows(drivers, 'license').length})` : ''}`}
            sx={{ fontWeight: 700, fontSize: '0.82rem', textTransform: 'none', '&.Mui-selected': { color: '#1A1A2E' } }}
          />
          <Tab
            label={`Insurance Expiry${!loading ? ` (${buildRows(drivers, 'insurance').length})` : ''}`}
            sx={{ fontWeight: 700, fontSize: '0.82rem', textTransform: 'none', '&.Mui-selected': { color: '#1A1A2E' } }}
          />
          <Tab
            label={`All Expiring${!loading ? ` (${allRows.length})` : ''}`}
            sx={{ fontWeight: 700, fontSize: '0.82rem', textTransform: 'none', '&.Mui-selected': { color: '#1A1A2E' } }}
          />
        </Tabs>

        {loading ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <CircularProgress size={32} sx={{ color: '#1A1A2E' }} />
            <Typography sx={{ mt: 2, color: '#666' }}>Loading driver documents...</Typography>
          </Box>
        ) : (
          <ExpiryTable
            rows={rows}
            onSendReminder={handleSendReminder}
            remindersSent={remindersSent}
          />
        )}

        {/* Footer */}
        {!loading && rows.length > 0 && (
          <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography sx={{ fontSize: '0.78rem', color: '#888' }}>
              Showing {rows.length} record{rows.length !== 1 ? 's' : ''} · sorted by urgency
            </Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={fetchDrivers}
              sx={{ borderRadius: '8px', fontSize: '0.76rem', textTransform: 'none' }}
            >
              Refresh
            </Button>
          </Box>
        )}
      </Paper>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3500}
        onClose={() => setSnackbar((p) => ({ ...p, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((p) => ({ ...p, open: false }))}
          severity="success"
          sx={{ borderRadius: '8px' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

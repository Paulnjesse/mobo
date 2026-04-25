import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Grid, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Table, TableBody, TableCell,
  TableHead, TableRow, TableContainer, Paper, IconButton,
  Tabs, Tab, Alert, Tooltip, Switch, FormControlLabel,
  InputAdornment,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ToggleOn as ToggleOnIcon,
  ToggleOff as ToggleOffIcon,
  AccountBalanceWallet as WalletIcon,
  LocalOffer as PackIcon,
  TrendingUp as RevenueIcon,
  People as PeopleIcon,
} from '@mui/icons-material';
import api from '../services/api';

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => `${Number(n || 0).toLocaleString()} XAF`;

const packTypeLabel = (t) =>
  ({ rider: 'Riders', driver: 'Drivers', both: 'All Users' }[t] || t);

const packTypeColor = (t) =>
  ({ rider: 'primary', driver: 'warning', both: 'success' }[t] || 'default');

const EMPTY_FORM = {
  name: '', pack_type: 'both', price_xaf: '', credit_xaf: '',
  bonus_percent: 0, description: '', valid_days: '', sort_order: 0,
};

// ─── component ────────────────────────────────────────────────────────────────
export default function WalletPacks() {
  const [tab, setTab]               = useState(0);
  const [packs, setPacks]           = useState([]);
  const [purchases, setPurchases]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPack, setEditPack]     = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(null);

  const loadPacks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/payments/admin/wallet-packs');
      setPacks(res.data.packs || []);
    } catch {
      setError('Failed to load wallet packs');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPurchases = useCallback(async () => {
    try {
      const res = await api.get('/payments/admin/wallet-packs/purchases?limit=100');
      setPurchases(res.data.purchases || []);
    } catch {
      setError('Failed to load purchases');
    }
  }, []);

  useEffect(() => {
    loadPacks();
    loadPurchases();
  }, [loadPacks, loadPurchases]);

  const openCreate = () => { setEditPack(null); setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (p) => {
    setEditPack(p);
    setForm({
      name: p.name, pack_type: p.pack_type,
      price_xaf: p.price_xaf, credit_xaf: p.credit_xaf,
      bonus_percent: p.bonus_percent, description: p.description || '',
      valid_days: p.valid_days || '', sort_order: p.sort_order,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.price_xaf || !form.credit_xaf) {
      setError('Name, price and credit amount are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        price_xaf:     parseInt(form.price_xaf),
        credit_xaf:    parseInt(form.credit_xaf),
        bonus_percent: parseFloat(form.bonus_percent) || 0,
        valid_days:    form.valid_days ? parseInt(form.valid_days) : null,
        sort_order:    parseInt(form.sort_order) || 0,
      };
      if (editPack) {
        await api.put(`/payments/admin/wallet-packs/${editPack.id}`, payload);
        setSuccess(`Pack "${form.name}" updated`);
      } else {
        await api.post('/payments/admin/wallet-packs', payload);
        setSuccess(`Pack "${form.name}" created`);
      }
      setDialogOpen(false);
      loadPacks();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save pack');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (pack) => {
    try {
      await api.patch(`/payments/admin/wallet-packs/${pack.id}/toggle`);
      setPacks(prev => prev.map(p => p.id === pack.id ? { ...p, is_active: !p.is_active } : p));
    } catch { setError('Failed to toggle pack'); }
  };

  const handleDelete = async () => {
    if (!deleteDialog) return;
    try {
      await api.delete(`/payments/admin/wallet-packs/${deleteDialog.id}`);
      setSuccess(`Pack "${deleteDialog.name}" deleted`);
      setDeleteDialog(null);
      loadPacks();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete pack');
      setDeleteDialog(null);
    }
  };

  const totalRevenue = packs.reduce((s, p) => s + (p.total_revenue_xaf || 0), 0);
  const totalPurchases = packs.reduce((s, p) => s + (p.total_purchases || 0), 0);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Wallet Credit Packs</Typography>
          <Typography variant="body2" color="text.secondary">
            Manage credit packs for riders and drivers. Packs can carry bonus credits on top of the purchase amount.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          New Pack
        </Button>
      </Box>

      {error   && <Alert severity="error"   onClose={() => setError('')}   sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" onClose={() => setSuccess('')} sx={{ mb: 2 }}>{success}</Alert>}

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total Packs',     value: packs.length,        icon: <PackIcon />,    color: '#1A1A2E' },
          { label: 'Total Purchases', value: totalPurchases,      icon: <PeopleIcon />,  color: '#E31837' },
          { label: 'Total Revenue',   value: fmt(totalRevenue),   icon: <RevenueIcon />, color: '#2E7D32' },
          { label: 'Active Packs',    value: packs.filter(p => p.is_active).length, icon: <WalletIcon />, color: '#FF6B35' },
        ].map(s => (
          <Grid item xs={6} md={3} key={s.label}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ p: 1.2, borderRadius: 2, bgcolor: s.color + '18', color: s.color }}>
                  {s.icon}
                </Box>
                <Box>
                  <Typography variant="h6" fontWeight={700}>{s.value}</Typography>
                  <Typography variant="caption" color="text.secondary">{s.label}</Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Packs" />
        <Tab label={`Purchases (${purchases.length})`} />
      </Tabs>

      {tab === 0 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>For</TableCell>
                <TableCell>Price</TableCell>
                <TableCell>Credits</TableCell>
                <TableCell>Bonus</TableCell>
                <TableCell>Total Credit</TableCell>
                <TableCell>Purchases</TableCell>
                <TableCell>Revenue</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {packs.map(p => {
                const bonusXAF = Math.round(p.credit_xaf * p.bonus_percent / 100);
                return (
                  <TableRow key={p.id} hover>
                    <TableCell>
                      <Typography fontWeight={600}>{p.name}</Typography>
                      {p.description && (
                        <Typography variant="caption" color="text.secondary">{p.description}</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip label={packTypeLabel(p.pack_type)} size="small" color={packTypeColor(p.pack_type)} />
                    </TableCell>
                    <TableCell>{fmt(p.price_xaf)}</TableCell>
                    <TableCell>{fmt(p.credit_xaf)}</TableCell>
                    <TableCell>
                      {p.bonus_percent > 0
                        ? <Chip label={`+${p.bonus_percent}% (${fmt(bonusXAF)})`} size="small" color="success" variant="outlined" />
                        : <Typography color="text.secondary">—</Typography>}
                    </TableCell>
                    <TableCell><Typography fontWeight={600} color="success.main">{fmt(p.credit_xaf + bonusXAF)}</Typography></TableCell>
                    <TableCell>{p.total_purchases || 0}</TableCell>
                    <TableCell>{fmt(p.total_revenue_xaf)}</TableCell>
                    <TableCell>
                      <Chip label={p.is_active ? 'Active' : 'Inactive'} size="small"
                        color={p.is_active ? 'success' : 'default'} />
                    </TableCell>
                    <TableCell>
                      <Tooltip title={p.is_active ? 'Deactivate' : 'Activate'}>
                        <IconButton size="small" onClick={() => handleToggle(p)}>
                          {p.is_active ? <ToggleOnIcon color="success" /> : <ToggleOffIcon />}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(p)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => setDeleteDialog(p)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!loading && packs.length === 0 && (
                <TableRow><TableCell colSpan={10} align="center">No packs yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {tab === 1 && (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>User</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Pack</TableCell>
                <TableCell>Paid</TableCell>
                <TableCell>Credited</TableCell>
                <TableCell>Bonus</TableCell>
                <TableCell>Method</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {purchases.map(p => (
                <TableRow key={p.id} hover>
                  <TableCell>{new Date(p.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>{p.user_name || '—'}</Typography>
                    <Typography variant="caption" color="text.secondary">{p.user_phone}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={p.user_role} size="small" color={p.user_role === 'driver' ? 'warning' : 'primary'} />
                  </TableCell>
                  <TableCell>{p.pack_name}</TableCell>
                  <TableCell>{fmt(p.amount_paid_xaf)}</TableCell>
                  <TableCell>{fmt(p.credit_xaf)}</TableCell>
                  <TableCell>
                    {p.bonus_xaf > 0
                      ? <Typography color="success.main" fontWeight={600}>+{fmt(p.bonus_xaf)}</Typography>
                      : '—'}
                  </TableCell>
                  <TableCell>{p.payment_method}</TableCell>
                  <TableCell>
                    <Chip label={p.status} size="small"
                      color={p.status === 'completed' ? 'success' : p.status === 'failed' ? 'error' : 'default'} />
                  </TableCell>
                </TableRow>
              ))}
              {purchases.length === 0 && (
                <TableRow><TableCell colSpan={9} align="center">No purchases yet</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editPack ? 'Edit Pack' : 'Create Wallet Pack'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField label="Pack Name" value={form.name} fullWidth
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />

          <TextField select label="Available For" value={form.pack_type} fullWidth
            onChange={e => setForm(f => ({ ...f, pack_type: e.target.value }))}>
            <MenuItem value="both">All Users (Riders + Drivers)</MenuItem>
            <MenuItem value="rider">Riders Only</MenuItem>
            <MenuItem value="driver">Drivers Only</MenuItem>
          </TextField>

          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField label="Price (XAF)" type="number" value={form.price_xaf} fullWidth
                InputProps={{ startAdornment: <InputAdornment position="start">XAF</InputAdornment> }}
                onChange={e => setForm(f => ({ ...f, price_xaf: e.target.value }))} />
            </Grid>
            <Grid item xs={6}>
              <TextField label="Credit Amount (XAF)" type="number" value={form.credit_xaf} fullWidth
                InputProps={{ startAdornment: <InputAdornment position="start">XAF</InputAdornment> }}
                onChange={e => setForm(f => ({ ...f, credit_xaf: e.target.value }))} />
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField label="Bonus %" type="number" value={form.bonus_percent} fullWidth
                helperText={form.credit_xaf && form.bonus_percent > 0
                  ? `+${Math.round(parseFloat(form.credit_xaf) * parseFloat(form.bonus_percent) / 100).toLocaleString()} XAF bonus`
                  : 'Bonus on top of credit amount'}
                InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
                onChange={e => setForm(f => ({ ...f, bonus_percent: e.target.value }))} />
            </Grid>
            <Grid item xs={6}>
              <TextField label="Valid Days" type="number" value={form.valid_days} fullWidth
                helperText="Leave blank for no expiry"
                onChange={e => setForm(f => ({ ...f, valid_days: e.target.value }))} />
            </Grid>
          </Grid>

          <TextField label="Description (optional)" value={form.description} fullWidth multiline rows={2}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />

          <TextField label="Sort Order" type="number" value={form.sort_order} fullWidth
            helperText="Lower numbers show first"
            onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))} />

          {form.price_xaf && form.credit_xaf && (
            <Alert severity="info">
              User pays <strong>{fmt(form.price_xaf)}</strong> and receives{' '}
              <strong>{fmt(parseInt(form.credit_xaf) + Math.round(parseInt(form.credit_xaf) * parseFloat(form.bonus_percent || 0) / 100))}</strong> in wallet credits.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editPack ? 'Update' : 'Create Pack'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteDialog} onClose={() => setDeleteDialog(null)}>
        <DialogTitle>Delete Pack</DialogTitle>
        <DialogContent>
          <Typography>
            Delete <strong>{deleteDialog?.name}</strong>? This cannot be undone.
            If the pack has purchases, deletion will be blocked — deactivate it instead.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

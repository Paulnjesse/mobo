import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Grid, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Table, TableBody, TableCell,
  TableHead, TableRow, TableContainer, Paper, IconButton,
  Tabs, Tab, Alert, Tooltip, LinearProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ToggleOn as ToggleOnIcon,
  ToggleOff as ToggleOffIcon,
  DirectionsBus as BusIcon,
  People as PeopleIcon,
  Route as RouteIcon,
  CardMembership as CardIcon,
} from '@mui/icons-material';
import api from '../services/api';

const fmt = (n) => `${Number(n || 0).toLocaleString()} XAF`;

const EMPTY_FORM = {
  route_name: '',
  origin_address: '', origin_lat: '', origin_lng: '',
  destination_address: '', destination_lat: '', destination_lng: '',
  match_radius_m: 500,
  discount_percent: 20,
  rides_total: 40,
  price_paid: '',
  valid_days: 30,
};

export default function CommuterPassMgmt() {
  const [tab, setTab]               = useState(0);
  const [passes, setPasses]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPass, setEditPass]     = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(null);

  const loadPasses = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/rides/admin/commuter-passes');
      setPasses(res.data.passes || []);
    } catch {
      setError('Failed to load commuter passes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPasses(); }, [loadPasses]);

  const openCreate = () => { setEditPass(null); setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (p) => {
    setEditPass(p);
    setForm({
      route_name: p.route_name,
      origin_address: p.origin_address, origin_lat: p.origin_lat, origin_lng: p.origin_lng,
      destination_address: p.destination_address, destination_lat: p.destination_lat, destination_lng: p.destination_lng,
      match_radius_m: p.match_radius_m || 500,
      discount_percent: p.discount_percent || 20,
      rides_total: p.rides_total || 40,
      price_paid: p.price_paid,
      valid_days: p.valid_days || 30,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.route_name || !form.origin_address || !form.destination_address || !form.price_paid) {
      setError('Route name, origin, destination and price are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        price_paid:      parseInt(form.price_paid),
        rides_total:     parseInt(form.rides_total),
        discount_percent: parseFloat(form.discount_percent),
        match_radius_m:  parseInt(form.match_radius_m),
        valid_days:      parseInt(form.valid_days),
        origin_lat:      form.origin_lat ? parseFloat(form.origin_lat) : null,
        origin_lng:      form.origin_lng ? parseFloat(form.origin_lng) : null,
        destination_lat: form.destination_lat ? parseFloat(form.destination_lat) : null,
        destination_lng: form.destination_lng ? parseFloat(form.destination_lng) : null,
      };
      if (editPass) {
        await api.put(`/rides/admin/commuter-passes/${editPass.id}`, payload);
        setSuccess(`Pass "${form.route_name}" updated`);
      } else {
        await api.post('/rides/admin/commuter-passes', payload);
        setSuccess(`Pass "${form.route_name}" created`);
      }
      setDialogOpen(false);
      loadPasses();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save pass');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (pass) => {
    try {
      await api.patch(`/rides/admin/commuter-passes/${pass.id}/toggle`);
      setPasses(prev => prev.map(p => p.id === pass.id ? { ...p, is_active: !p.is_active } : p));
    } catch { setError('Failed to toggle pass'); }
  };

  const handleDelete = async () => {
    if (!deleteDialog) return;
    try {
      await api.delete(`/rides/admin/commuter-passes/${deleteDialog.id}`);
      setSuccess(`Pass "${deleteDialog.route_name}" deleted`);
      setDeleteDialog(null);
      loadPasses();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete pass');
      setDeleteDialog(null);
    }
  };

  const activePasses  = passes.filter(p => p.is_active).length;
  const totalRidesUsed = passes.reduce((s, p) => s + (p.rides_used || 0), 0);
  const totalRevenue   = passes.reduce((s, p) => s + (p.price_paid || 0), 0);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Commuter Pass Management</Typography>
          <Typography variant="body2" color="text.secondary">
            Create fixed-price route packages for regular commuters. Riders subscribe and get discounted rides on matched routes.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          New Pass
        </Button>
      </Box>

      {error   && <Alert severity="error"   onClose={() => setError('')}   sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" onClose={() => setSuccess('')} sx={{ mb: 2 }}>{success}</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total Passes',  value: passes.length,     icon: <CardIcon />,   color: '#1A1A2E' },
          { label: 'Active',        value: activePasses,      icon: <BusIcon />,    color: '#2E7D32' },
          { label: 'Rides Used',    value: totalRidesUsed,    icon: <RouteIcon />,  color: '#E31837' },
          { label: 'Total Revenue', value: fmt(totalRevenue), icon: <PeopleIcon />, color: '#FF6B35' },
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

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Route</TableCell>
              <TableCell>Origin → Destination</TableCell>
              <TableCell>Price</TableCell>
              <TableCell>Discount</TableCell>
              <TableCell>Rides</TableCell>
              <TableCell>Progress</TableCell>
              <TableCell>Radius</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {passes.map(p => {
              const pct = p.rides_total ? Math.round((p.rides_used / p.rides_total) * 100) : 0;
              return (
                <TableRow key={p.id} hover>
                  <TableCell>
                    <Typography fontWeight={600}>{p.route_name}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{p.origin_address}</Typography>
                    <Typography variant="caption" color="text.secondary">→ {p.destination_address}</Typography>
                  </TableCell>
                  <TableCell>{fmt(p.price_paid)}</TableCell>
                  <TableCell>
                    <Chip label={`${p.discount_percent}% off`} size="small" color="success" variant="outlined" />
                  </TableCell>
                  <TableCell>{p.rides_used || 0} / {p.rides_total}</TableCell>
                  <TableCell sx={{ minWidth: 100 }}>
                    <LinearProgress variant="determinate" value={pct}
                      color={pct >= 90 ? 'error' : pct >= 60 ? 'warning' : 'success'} />
                    <Typography variant="caption">{pct}%</Typography>
                  </TableCell>
                  <TableCell>{p.match_radius_m || 500}m</TableCell>
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
            {!loading && passes.length === 0 && (
              <TableRow><TableCell colSpan={9} align="center">
                No commuter passes yet. Create one to offer fixed-price route subscriptions to riders.
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editPass ? 'Edit Commuter Pass' : 'Create Commuter Pass'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField label="Route Name" value={form.route_name} fullWidth
            placeholder="e.g. Home → Office, Akwa → Bonanjo"
            onChange={e => setForm(f => ({ ...f, route_name: e.target.value }))} />

          <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>Origin</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField label="Origin Address" value={form.origin_address} fullWidth
                onChange={e => setForm(f => ({ ...f, origin_address: e.target.value }))} />
            </Grid>
            <Grid item xs={6} md={3}>
              <TextField label="Latitude" type="number" value={form.origin_lat} fullWidth
                onChange={e => setForm(f => ({ ...f, origin_lat: e.target.value }))} />
            </Grid>
            <Grid item xs={6} md={3}>
              <TextField label="Longitude" type="number" value={form.origin_lng} fullWidth
                onChange={e => setForm(f => ({ ...f, origin_lng: e.target.value }))} />
            </Grid>
          </Grid>

          <Typography variant="subtitle2" color="text.secondary">Destination</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField label="Destination Address" value={form.destination_address} fullWidth
                onChange={e => setForm(f => ({ ...f, destination_address: e.target.value }))} />
            </Grid>
            <Grid item xs={6} md={3}>
              <TextField label="Latitude" type="number" value={form.destination_lat} fullWidth
                onChange={e => setForm(f => ({ ...f, destination_lat: e.target.value }))} />
            </Grid>
            <Grid item xs={6} md={3}>
              <TextField label="Longitude" type="number" value={form.destination_lng} fullWidth
                onChange={e => setForm(f => ({ ...f, destination_lng: e.target.value }))} />
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid item xs={6} md={3}>
              <TextField label="Package Price (XAF)" type="number" value={form.price_paid} fullWidth
                onChange={e => setForm(f => ({ ...f, price_paid: e.target.value }))} />
            </Grid>
            <Grid item xs={6} md={3}>
              <TextField label="Rides Included" type="number" value={form.rides_total} fullWidth
                onChange={e => setForm(f => ({ ...f, rides_total: e.target.value }))} />
            </Grid>
            <Grid item xs={6} md={3}>
              <TextField label="Discount %" type="number" value={form.discount_percent} fullWidth
                helperText="Vs standard fare"
                onChange={e => setForm(f => ({ ...f, discount_percent: e.target.value }))} />
            </Grid>
            <Grid item xs={6} md={3}>
              <TextField label="Valid Days" type="number" value={form.valid_days} fullWidth
                helperText="From activation"
                onChange={e => setForm(f => ({ ...f, valid_days: e.target.value }))} />
            </Grid>
          </Grid>

          <TextField label="Match Radius (m)" type="number" value={form.match_radius_m}
            helperText="Rider pickup/dropoff must be within this distance of the defined origin/destination"
            onChange={e => setForm(f => ({ ...f, match_radius_m: e.target.value }))} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editPass ? 'Update' : 'Create Pass'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteDialog} onClose={() => setDeleteDialog(null)}>
        <DialogTitle>Delete Pass</DialogTitle>
        <DialogContent>
          <Typography>Delete <strong>{deleteDialog?.route_name}</strong>? This cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/**
 * Ads Management — Admin page
 * Create, edit, toggle, and delete ad banners shown in the mobile app.
 * Supports internal (MOBO promos) and business (sponsored) ad types.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper, Chip,
  IconButton, Switch, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Select, MenuItem, FormControl,
  InputLabel, Alert, Tooltip, CircularProgress, Stack,
  LinearProgress, Avatar,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  Campaign as CampaignIcon,
  Store as StoreIcon,
  BarChart as BarChartIcon,
} from '@mui/icons-material';
import axios from 'axios';

const API = axios.create({ baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3002' });
API.interceptors.request.use((c) => {
  const t = localStorage.getItem('admin_token');
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

const CONTEXTS = ['home', 'ride', 'auth', 'all'];
const TYPES    = ['internal', 'business'];
const ICONS    = [
  'flash-outline','leaf-outline','train-outline','people-outline','bicycle-outline',
  'restaurant-outline','bag-handle-outline','fitness-outline','cafe-outline','medkit-outline',
  'megaphone-outline','gift-outline','star-outline','pricetag-outline','car-outline',
];
const COLORS   = ['#FF6B00','#00A651','#FF00BF','#0077CC','#8B4513','#E74C3C','#8E44AD','#1ABC9C','#F39C12','#2980B9'];

const EMPTY_FORM = {
  type: 'internal', title: '', subtitle: '', cta: 'Learn More',
  icon: 'megaphone-outline', color: '#FF00BF', sponsor: '',
  url: '', image_url: '', context: 'home', priority: 0,
  start_date: '', end_date: '',
};

export default function AdsManagement() {
  const [ads, setAds]           = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [dialog, setDialog]     = useState(null); // null | 'create' | 'edit'
  const [deleteId, setDeleteId] = useState(null);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/ads/admin/all');
      setAds(data.ads || []);
    } catch (e) {
      setError('Failed to load ads');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm(EMPTY_FORM); setDialog('create'); };
  const openEdit   = (ad) => {
    setForm({
      type: ad.type, title: ad.title, subtitle: ad.subtitle, cta: ad.cta,
      icon: ad.icon, color: ad.color, sponsor: ad.sponsor || '',
      url: ad.url || '', image_url: ad.image_url || '',
      context: ad.context, priority: ad.priority,
      start_date: ad.start_date ? ad.start_date.slice(0, 10) : '',
      end_date: ad.end_date ? ad.end_date.slice(0, 10) : '',
      _id: ad.id,
    });
    setDialog('edit');
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.subtitle.trim()) return;
    setSaving(true);
    try {
      if (dialog === 'create') {
        await API.post('/ads', form);
      } else {
        await API.put(`/ads/${form._id}`, form);
      }
      setDialog(null);
      load();
    } catch {
      setError('Failed to save ad');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id) => {
    try {
      const { data } = await API.patch(`/ads/${id}/toggle`);
      setAds((prev) => prev.map((a) => a.id === id ? { ...a, active: data.active } : a));
    } catch { setError('Failed to toggle'); }
  };

  const handleDelete = async () => {
    try {
      await API.delete(`/ads/${deleteId}`);
      setDeleteId(null);
      load();
    } catch { setError('Failed to delete ad'); }
  };

  // Stats
  const totalImpressions = ads.reduce((s, a) => s + (a.impressions || 0), 0);
  const totalClicks      = ads.reduce((s, a) => s + (a.clicks || 0), 0);
  const activeCount      = ads.filter((a) => a.active).length;
  const bizCount         = ads.filter((a) => a.type === 'business').length;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5">Ad Banner Management</Typography>
          <Typography variant="body2" color="text.secondary">
            Control promotional banners shown in the MOBO mobile app
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}
          sx={{ bgcolor: '#E94560', '&:hover': { bgcolor: '#c73652' } }}>
          New Ad
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {/* Stats cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, mb: 3 }}>
        {[
          { label: 'Total Ads',    value: ads.length,                  icon: <CampaignIcon />, color: '#1A1A2E' },
          { label: 'Active',       value: activeCount,                  icon: <VisibilityIcon />, color: '#00A651' },
          { label: 'Sponsored',    value: bizCount,                     icon: <StoreIcon />, color: '#E94560' },
          { label: 'Total Clicks', value: totalClicks.toLocaleString(), icon: <BarChartIcon />, color: '#0077CC' },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Avatar sx={{ bgcolor: s.color + '18', color: s.color }}>{s.icon}</Avatar>
              <Box>
                <Typography variant="h5" fontWeight={700}>{s.value}</Typography>
                <Typography variant="body2" color="text.secondary">{s.label}</Typography>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* Ads table */}
      <Card>
        <TableContainer component={Paper} elevation={0}>
          {loading && <LinearProgress />}
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Ad</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Context</TableCell>
                <TableCell>Priority</TableCell>
                <TableCell>Performance</TableCell>
                <TableCell>Schedule</TableCell>
                <TableCell>Active</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {ads.map((ad) => {
                const ctr = ad.impressions > 0
                  ? ((ad.clicks / ad.impressions) * 100).toFixed(1)
                  : '0.0';
                return (
                  <TableRow key={ad.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar sx={{ bgcolor: ad.color + '22', width: 36, height: 36 }}>
                          <Box sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: ad.color }} />
                        </Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight={600}>{ad.title}</Typography>
                          <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 220, display: 'block' }}>
                            {ad.subtitle}
                          </Typography>
                          {ad.sponsor && (
                            <Typography variant="caption" color="primary" fontStyle="italic">
                              {ad.sponsor}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={ad.type}
                        size="small"
                        icon={ad.type === 'business' ? <StoreIcon fontSize="small" /> : <CampaignIcon fontSize="small" />}
                        color={ad.type === 'business' ? 'secondary' : 'default'}
                        sx={{ fontWeight: 600 }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip label={ad.context} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>{ad.priority}</TableCell>
                    <TableCell>
                      <Box>
                        <Typography variant="caption">
                          {(ad.impressions || 0).toLocaleString()} views · {(ad.clicks || 0).toLocaleString()} clicks
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                          <LinearProgress
                            variant="determinate"
                            value={Math.min(parseFloat(ctr), 100)}
                            sx={{ flex: 1, height: 4, borderRadius: 2 }}
                          />
                          <Typography variant="caption" fontWeight={600}>{ctr}%</Typography>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {ad.start_date ? ad.start_date.slice(0, 10) : '–'}<br />
                        {ad.end_date   ? `→ ${ad.end_date.slice(0, 10)}` : 'No end'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Switch checked={ad.active} onChange={() => handleToggle(ad.id)} size="small" />
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => openEdit(ad)}><EditIcon fontSize="small" /></IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => setDeleteId(ad.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!loading && ads.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    No ads yet. Click "New Ad" to create one.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Create / Edit dialog */}
      <Dialog open={!!dialog} onClose={() => setDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{dialog === 'create' ? 'New Ad Banner' : 'Edit Ad Banner'}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {/* Type */}
            <FormControl fullWidth size="small">
              <InputLabel>Type</InputLabel>
              <Select value={form.type} label="Type" onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((t) => <MenuItem key={t} value={t}>{t === 'business' ? '🏪 Business (Sponsored)' : '📣 Internal (MOBO Promo)'}</MenuItem>)}
              </Select>
            </FormControl>

            {form.type === 'business' && (
              <TextField label="Sponsor / Business Name" size="small" value={form.sponsor}
                onChange={(e) => setForm({ ...form, sponsor: e.target.value })} />
            )}

            <TextField label="Title *" size="small" value={form.title} inputProps={{ maxLength: 120 }}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <TextField label="Subtitle *" size="small" value={form.subtitle} inputProps={{ maxLength: 200 }}
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
            <TextField label="CTA Button Text" size="small" value={form.cta} inputProps={{ maxLength: 40 }}
              onChange={(e) => setForm({ ...form, cta: e.target.value })} />

            {form.type === 'business' && (
              <TextField label="Tap URL (optional)" size="small" value={form.url}
                placeholder="https://..." onChange={(e) => setForm({ ...form, url: e.target.value })} />
            )}

            {/* Icon picker */}
            <FormControl fullWidth size="small">
              <InputLabel>Icon (Ionicons name)</InputLabel>
              <Select value={form.icon} label="Icon (Ionicons name)"
                onChange={(e) => setForm({ ...form, icon: e.target.value })}>
                {ICONS.map((i) => <MenuItem key={i} value={i}>{i}</MenuItem>)}
              </Select>
            </FormControl>

            {/* Color picker */}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>Color</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {COLORS.map((c) => (
                  <Box key={c} onClick={() => setForm({ ...form, color: c })}
                    sx={{
                      width: 28, height: 28, borderRadius: '50%', bgcolor: c, cursor: 'pointer',
                      border: form.color === c ? '3px solid #1A1A2E' : '2px solid transparent',
                    }} />
                ))}
                <TextField size="small" value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  sx={{ width: 110 }} inputProps={{ maxLength: 20 }} />
              </Box>
            </Box>

            {/* Context */}
            <FormControl fullWidth size="small">
              <InputLabel>Show in context</InputLabel>
              <Select value={form.context} label="Show in context"
                onChange={(e) => setForm({ ...form, context: e.target.value })}>
                {CONTEXTS.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c === 'home' ? '🏠 Home Screen' : c === 'ride' ? '🚗 During Ride' : c === 'auth' ? '🔑 Login / Welcome' : '🌐 All Screens'}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField label="Priority (higher = shown first)" size="small" type="number"
              value={form.priority} onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 0 })} />

            {/* Schedule */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField label="Start Date" size="small" type="date" value={form.start_date}
                InputLabelProps={{ shrink: true }} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              <TextField label="End Date" size="small" type="date" value={form.end_date}
                InputLabelProps={{ shrink: true }} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </Box>

            {/* Live preview */}
            <Box sx={{ border: '1px solid #eee', borderRadius: 2, p: 1.5, bgcolor: '#fafafa' }}>
              <Typography variant="caption" color="text.secondary">Preview</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: 1.5, bgcolor: form.color + '22',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: form.color }} />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" fontWeight={700}>{form.title || 'Ad Title'}</Typography>
                  <Typography variant="caption" color="text.secondary">{form.subtitle || 'Ad subtitle text'}</Typography>
                </Box>
                <Box sx={{ bgcolor: form.color, color: '#fff', borderRadius: 4, px: 1.5, py: 0.5, fontSize: 11, fontWeight: 700 }}>
                  {form.cta || 'CTA'}
                </Box>
              </Box>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)}>Cancel</Button>
          <Button onClick={handleSave} variant="contained" disabled={saving || !form.title || !form.subtitle}
            sx={{ bgcolor: '#E94560', '&:hover': { bgcolor: '#c73652' } }}>
            {saving ? <CircularProgress size={20} color="inherit" /> : dialog === 'create' ? 'Create Ad' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Ad?</DialogTitle>
        <DialogContent>
          <Typography>This ad will be permanently removed from the app. This cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

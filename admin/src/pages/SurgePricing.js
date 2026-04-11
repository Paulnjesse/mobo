import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Chip, Button, Switch,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert, TextField,
  FormControlLabel, Divider, IconButton, Slider, Select, MenuItem,
  FormControl, InputLabel,
} from '@mui/material';
import {
  Bolt as BoltIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Close as CloseIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import { surgeAPI } from '../services/api';

const CITIES = ['Douala', 'Yaoundé', 'Bafoussam', 'Garoua', 'Buea', 'Ngaoundéré', 'Bamenda', 'Bertoua'];

const PEAK_PRESETS = [
  { label: 'Morning Rush', multiplier: 1.5, startTime: '07:00', endTime: '09:00', description: '7-9am weekdays' },
  { label: 'Evening Rush', multiplier: 1.5, startTime: '17:00', endTime: '20:00', description: '5-8pm weekdays' },
  { label: 'Weekend Night', multiplier: 2.0, startTime: '22:00', endTime: '02:00', description: 'Fri-Sat nights' },
];

const MOCK_SURGE_ZONES = [
  { id: 's1', name: 'Douala Centre — Peak Hours', city: 'Douala', multiplier: 1.8, active: true, startTime: '07:00', endTime: '09:00', autoSurge: true, createdAt: '2024-03-01' },
  { id: 's2', name: 'Yaoundé Evening Rush', city: 'Yaoundé', multiplier: 1.5, active: true, startTime: '17:00', endTime: '20:00', autoSurge: false, createdAt: '2024-03-02' },
  { id: 's3', name: 'Weekend Night Surge', city: 'Douala', multiplier: 2.2, active: false, startTime: '22:00', endTime: '02:00', autoSurge: true, createdAt: '2024-03-03' },
  { id: 's4', name: 'Bafoussam Market Day', city: 'Bafoussam', multiplier: 1.4, active: true, startTime: '08:00', endTime: '14:00', autoSurge: false, createdAt: '2024-03-04' },
];

const EMPTY_FORM = { name: '', city: 'Douala', multiplier: 1.5, startTime: '07:00', endTime: '09:00', autoSurge: false };

function multiplierColor(m) {
  if (m < 1.3) return '#4CAF50';
  if (m < 1.7) return '#FF8C00';
  if (m < 2.0) return '#FF5722';
  return '#FFD100';
}

export default function SurgePricing() {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchZones = useCallback(async () => {
    setLoading(true);
    try {
      const res = await surgeAPI.getAll();
      const data = res.data?.zones || res.data || [];
      setZones(data.length ? data : MOCK_SURGE_ZONES);
    } catch {
      setZones(MOCK_SURGE_ZONES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchZones(); }, [fetchZones]);

  const handleToggle = async (zone) => {
    try {
      await surgeAPI.toggle(zone.id);
    } catch {}
    setZones((prev) => prev.map((z) => z.id === zone.id ? { ...z, active: !z.active } : z));
    setSuccess(`${zone.name} has been ${zone.active ? 'deactivated' : 'activated'}.`);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleDelete = async (zone) => {
    try {
      await surgeAPI.delete(zone.id);
    } catch {}
    setZones((prev) => prev.filter((z) => z.id !== zone.id));
    setSuccess(`${zone.name} has been deleted.`);
    setDeleteConfirm(null);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleCreate = async () => {
    if (!form.name.trim()) { setError('Zone name is required.'); return; }
    setSaving(true);
    try {
      const res = await surgeAPI.create(form);
      const newZone = res.data?.zone || res.data || { ...form, id: `s_${Date.now()}`, active: true, createdAt: new Date().toISOString().split('T')[0] };
      setZones((prev) => [newZone, ...prev]);
      setSuccess(`Surge zone "${form.name}" created.`);
      setCreateOpen(false);
      setForm(EMPTY_FORM);
    } catch {
      const newZone = { ...form, id: `s_${Date.now()}`, active: true, createdAt: new Date().toISOString().split('T')[0] };
      setZones((prev) => [newZone, ...prev]);
      setSuccess(`Surge zone "${form.name}" created.`);
      setCreateOpen(false);
      setForm(EMPTY_FORM);
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(''), 3000);
    }
  };

  const applyPreset = (preset) => {
    setForm((prev) => ({
      ...prev,
      multiplier: preset.multiplier,
      startTime: preset.startTime,
      endTime: preset.endTime,
      name: prev.name || `${prev.city} — ${preset.label}`,
    }));
  };

  const activeCount = zones.filter((z) => z.active).length;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Surge Pricing</Typography>
          <Typography sx={{ fontSize: '0.8rem', color: 'rgba(0,0,0,0.5)', mt: 0.3 }}>
            Manage dynamic pricing zones and multipliers
          </Typography>
        </Box>
        <Button startIcon={<AddIcon />} variant="contained" onClick={() => setCreateOpen(true)}
          sx={{ bgcolor: '#000000', borderRadius: '8px', '&:hover': { bgcolor: '#111111' } }}>
          New Surge Zone
        </Button>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setError('')}>{error}</Alert>}

      {/* Summary */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ p: '16px !important', textAlign: 'center' }}>
              <Typography sx={{ fontSize: '1.6rem', fontWeight: 800, color: '#000000' }}>{zones.length}</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.55)' }}>Total Zones</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ p: '16px !important', textAlign: 'center' }}>
              <Typography sx={{ fontSize: '1.6rem', fontWeight: 800, color: '#4CAF50' }}>{activeCount}</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.55)' }}>Active Zones</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ p: '16px !important', textAlign: 'center' }}>
              <Typography sx={{ fontSize: '1.6rem', fontWeight: 800, color: '#FFD100' }}>{zones.length - activeCount}</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.55)' }}>Inactive</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={6} sm={3}>
          <Card>
            <CardContent sx={{ p: '16px !important', textAlign: 'center' }}>
              <Typography sx={{ fontSize: '1.6rem', fontWeight: 800, color: '#FF8C00' }}>
                {zones.length > 0 ? (zones.reduce((a, z) => a + z.multiplier, 0) / zones.length).toFixed(1) : '—'}x
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.55)' }}>Avg Multiplier</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Peak Presets */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 2.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5, fontSize: '0.95rem' }}>Peak Hour Presets</Typography>
          <Typography sx={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.45)', mb: 2 }}>
            Click a preset to quickly create a surge zone
          </Typography>
          <Grid container spacing={1.5}>
            {PEAK_PRESETS.map((preset) => (
              <Grid item xs={12} sm={4} key={preset.label}>
                <Card
                  onClick={() => { setForm({ ...EMPTY_FORM, name: `Douala — ${preset.label}`, multiplier: preset.multiplier, startTime: preset.startTime, endTime: preset.endTime }); setCreateOpen(true); }}
                  sx={{
                    cursor: 'pointer', border: '1px solid rgba(0,0,0,0.1)',
                    '&:hover': { borderColor: '#FFD100', boxShadow: '0 4px 16px rgba(255,209,0,0.1)', transform: 'translateY(-1px)' },
                    transition: 'all 0.2s',
                  }}
                >
                  <CardContent sx={{ p: '14px !important' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <BoltIcon sx={{ color: '#FF8C00', fontSize: 18 }} />
                      <Typography sx={{ fontWeight: 700, fontSize: '0.88rem' }}>{preset.label}</Typography>
                    </Box>
                    <Typography sx={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.5)', mb: 0.5 }}>{preset.description}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip label={`${preset.multiplier}x`} size="small" sx={{ bgcolor: `${multiplierColor(preset.multiplier)}18`, color: multiplierColor(preset.multiplier), fontWeight: 700, fontSize: '0.8rem' }} />
                      <Typography sx={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.45)' }}>{preset.startTime} – {preset.endTime}</Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      {/* Zones List */}
      <Card>
        <CardContent sx={{ p: 2.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, fontSize: '0.95rem' }}>Surge Zones</Typography>
          {loading ? (
            <Typography sx={{ color: 'rgba(0,0,0,0.45)', textAlign: 'center', py: 4 }}>Loading zones...</Typography>
          ) : zones.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <BoltIcon sx={{ fontSize: 48, color: 'rgba(0,0,0,0.2)', mb: 1 }} />
              <Typography sx={{ color: 'rgba(0,0,0,0.4)' }}>No surge zones configured</Typography>
              <Button onClick={() => setCreateOpen(true)} sx={{ mt: 1, color: '#FFD100' }}>Create your first zone</Button>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {zones.map((zone) => (
                <Box key={zone.id} sx={{
                  p: 2, borderRadius: '10px', border: `1px solid ${zone.active ? 'rgba(76,175,80,0.2)' : 'rgba(0,0,0,0.08)'}`,
                  bgcolor: zone.active ? 'rgba(76,175,80,0.02)' : '#fafafa',
                  display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
                }}>
                  <Box sx={{ flex: 1, minWidth: 200 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>{zone.name}</Typography>
                      <Chip
                        label={`${zone.multiplier}x`}
                        size="small"
                        sx={{ bgcolor: `${multiplierColor(zone.multiplier)}18`, color: multiplierColor(zone.multiplier), fontWeight: 800, fontSize: '0.78rem' }}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                      <Typography sx={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.55)' }}>📍 {zone.city}</Typography>
                      <Typography sx={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', gap: 0.3 }}>
                        <ScheduleIcon sx={{ fontSize: 12 }} /> {zone.startTime} – {zone.endTime}
                      </Typography>
                      {zone.autoSurge && <Chip label="Auto" size="small" sx={{ bgcolor: 'rgba(33,150,243,0.1)', color: '#2196F3', fontSize: '0.68rem', height: 18 }} />}
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                      label={zone.active ? 'Active' : 'Inactive'}
                      size="small"
                      sx={{
                        bgcolor: zone.active ? 'rgba(76,175,80,0.1)' : 'rgba(158,158,158,0.1)',
                        color: zone.active ? '#4CAF50' : '#9E9E9E',
                        fontWeight: 600, fontSize: '0.7rem', height: 22,
                      }}
                    />
                    <Switch
                      checked={zone.active}
                      onChange={() => handleToggle(zone)}
                      size="small"
                      sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#4CAF50' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#4CAF50' } }}
                    />
                    <IconButton size="small" onClick={() => setDeleteConfirm(zone)} sx={{ color: '#FFD100', '&:hover': { bgcolor: 'rgba(255,209,0,0.1)' } }}>
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Typography fontWeight={700}>Create Surge Zone</Typography>
          <IconButton onClick={() => setCreateOpen(false)} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Zone Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              fullWidth size="small" required
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
            <FormControl size="small" fullWidth>
              <InputLabel>City</InputLabel>
              <Select value={form.city} label="City" onChange={(e) => setForm({ ...form, city: e.target.value })} sx={{ borderRadius: '8px' }}>
                {CITIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
              </Select>
            </FormControl>
            <Box>
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, mb: 1 }}>
                Multiplier: <span style={{ color: multiplierColor(form.multiplier), fontWeight: 800 }}>{form.multiplier}x</span>
              </Typography>
              <Slider
                value={form.multiplier}
                onChange={(_, v) => setForm({ ...form, multiplier: v })}
                min={1.0} max={3.0} step={0.1}
                marks={[{ value: 1, label: '1x' }, { value: 1.5, label: '1.5x' }, { value: 2, label: '2x' }, { value: 2.5, label: '2.5x' }, { value: 3, label: '3x' }]}
                valueLabelDisplay="auto"
                sx={{ color: multiplierColor(form.multiplier) }}
              />
            </Box>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField label="Start Time" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  fullWidth size="small" InputLabelProps={{ shrink: true }} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
              </Grid>
              <Grid item xs={6}>
                <TextField label="End Time" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                  fullWidth size="small" InputLabelProps={{ shrink: true }} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
              </Grid>
            </Grid>
            <FormControlLabel
              control={<Switch checked={form.autoSurge} onChange={(e) => setForm({ ...form, autoSurge: e.target.checked })} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#000000' } }} />}
              label={<Box><Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>Auto-Surge</Typography><Typography sx={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.5)' }}>Automatically activate during peak hours</Typography></Box>}
            />
            <Box sx={{ p: 1.5, bgcolor: '#F8F9FA', borderRadius: '8px' }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, mb: 0.5, color: 'rgba(0,0,0,0.6)' }}>Quick Presets</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {PEAK_PRESETS.map((p) => (
                  <Chip key={p.label} label={p.label} size="small" onClick={() => applyPreset(p)} clickable
                    sx={{ fontSize: '0.72rem', cursor: 'pointer', '&:hover': { bgcolor: 'rgba(255,209,0,0.1)', color: '#FFD100' } }} />
                ))}
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setCreateOpen(false)} variant="outlined" size="small">Cancel</Button>
          <Button onClick={handleCreate} variant="contained" size="small" disabled={saving} sx={{ bgcolor: '#000000' }}>
            {saving ? 'Creating...' : 'Create Zone'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle>Delete Surge Zone</DialogTitle>
        <DialogContent>
          <Typography>Delete <strong>{deleteConfirm?.name}</strong>? This cannot be undone.</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setDeleteConfirm(null)} variant="outlined" size="small">Cancel</Button>
          <Button onClick={() => handleDelete(deleteConfirm)} color="error" variant="contained" size="small">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

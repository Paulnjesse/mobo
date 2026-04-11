import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Card, CardContent, Typography, Chip, Button, Grid,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert,
  Select, MenuItem, FormControl, InputLabel, TextField,
  Divider, IconButton, CircularProgress, Switch, FormControlLabel,
  Tooltip,
} from '@mui/material';
import {
  AddLocation as AddIcon,
  Edit as EditIcon,
  Close as CloseIcon,
  PowerSettingsNew as DeactivateIcon,
  LocationOn as LocationIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import api from '../services/api';

// ─── helpers ─────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  low:    { label: 'Low',    color: '#1565C0', bg: 'rgba(21,101,192,0.1)'  },
  medium: { label: 'Medium', color: '#FF8C00', bg: 'rgba(255,140,0,0.1)'  },
  high:   { label: 'High',   color: '#FFD100', bg: 'rgba(255,209,0,0.1)'   },
};

const ZONE_TYPE_LABELS = {
  surge: 'Surge',
  safety_incident: 'Safety Incident',
};

const INCIDENT_TYPES = [
  { value: 'crime',         label: 'Crime'         },
  { value: 'flooding',      label: 'Flooding'       },
  { value: 'road_closure',  label: 'Road Closure'   },
  { value: 'construction',  label: 'Construction'   },
  { value: 'protest',       label: 'Protest'        },
  { value: 'other',         label: 'Other'          },
];

function SeverityChip({ severity }) {
  const cfg = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.low;
  return (
    <Chip
      label={cfg.label}
      size="small"
      sx={{ bgcolor: cfg.bg, color: cfg.color, fontWeight: 700, fontSize: '0.72rem', height: 22 }}
    />
  );
}

/**
 * Compute 8-point circular polygon around a center point.
 * Returns a GeoJSON Polygon geometry.
 */
function circleToGeoJSON(lat, lng, radiusMeters) {
  const pts = 8;
  const earthRadius = 6371000; // metres
  const coords = [];
  for (let i = 0; i < pts; i++) {
    const angle = (i * 2 * Math.PI) / pts;
    const dLat = (radiusMeters / earthRadius) * (180 / Math.PI);
    const dLng = (radiusMeters / (earthRadius * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI);
    coords.push([lng + dLng * Math.sin(angle), lat + dLat * Math.cos(angle)]);
  }
  // close the ring
  coords.push(coords[0]);
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coords],
    },
    properties: {},
  };
}

const MOCK_ZONES = [
  {
    id: 'zone_1',
    name: 'Akwa Flooding Zone',
    city: 'Douala',
    zone_type: 'safety_incident',
    incident_type: 'flooding',
    severity: 'high',
    alert_message: 'Heavy flooding reported in Akwa. Avoid Avenue de Gaulle and surrounding streets.',
    is_active: true,
    starts_at: '2025-06-01T06:00',
    ends_at: '2025-06-05T20:00',
    center_lat: 4.0483,
    center_lng: 9.7043,
    radius_m: 500,
  },
  {
    id: 'zone_2',
    name: 'Biyem-Assi Construction',
    city: 'Yaoundé',
    zone_type: 'safety_incident',
    incident_type: 'construction',
    severity: 'medium',
    alert_message: 'Road construction on Boulevard du 20 Mai. Expect delays.',
    is_active: true,
    starts_at: '2025-05-01T00:00',
    ends_at: '2025-09-30T23:59',
    center_lat: 3.8444,
    center_lng: 11.5028,
    radius_m: 300,
  },
  {
    id: 'zone_3',
    name: 'Douala Port Surge Zone',
    city: 'Douala',
    zone_type: 'surge',
    incident_type: null,
    severity: 'low',
    alert_message: 'High demand near Douala Port. Surge pricing active.',
    is_active: false,
    starts_at: '2025-05-20T07:00',
    ends_at: '2025-05-20T10:00',
    center_lat: 4.0534,
    center_lng: 9.6977,
    radius_m: 800,
  },
];

const EMPTY_FORM = {
  name: '',
  city: '',
  zone_type: 'safety_incident',
  incident_type: 'crime',
  severity: 'medium',
  alert_message: '',
  starts_at: '',
  ends_at: '',
  center_lat: '',
  center_lng: '',
  radius_m: '',
};

const inputSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '8px',
    '&:hover fieldset': { borderColor: '#000000' },
    '&.Mui-focused fieldset': { borderColor: '#000000' },
  },
  '& .MuiInputLabel-root.Mui-focused': { color: '#000000' },
};

// ─── main component ──────────────────────────────────────────────────────────

export default function SafetyZones() {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editZone, setEditZone] = useState(null); // null = create new
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivating, setDeactivating] = useState(false);

  const fetchZones = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/safety-zones');
      const data = res.data;
      const list = Array.isArray(data) ? data : (data?.zones || data?.data || []);
      setZones(list.length ? list : MOCK_ZONES);
    } catch {
      setZones(MOCK_ZONES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchZones(); }, [fetchZones]);

  const openCreate = () => {
    setEditZone(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setDialogOpen(true);
  };

  const openEdit = (zone) => {
    setEditZone(zone);
    setForm({
      name: zone.name || '',
      city: zone.city || '',
      zone_type: zone.zone_type || 'safety_incident',
      incident_type: zone.incident_type || 'crime',
      severity: zone.severity || 'medium',
      alert_message: zone.alert_message || '',
      starts_at: zone.starts_at?.slice(0, 16) || '',
      ends_at: zone.ends_at?.slice(0, 16) || '',
      center_lat: zone.center_lat != null ? String(zone.center_lat) : '',
      center_lng: zone.center_lng != null ? String(zone.center_lng) : '',
      radius_m: zone.radius_m != null ? String(zone.radius_m) : '',
    });
    setFormError('');
    setDialogOpen(true);
  };

  const buildPayload = () => {
    const lat = parseFloat(form.center_lat);
    const lng = parseFloat(form.center_lng);
    const radius = parseFloat(form.radius_m);

    const payload = {
      name: form.name.trim(),
      city: form.city.trim(),
      zone_type: form.zone_type,
      severity: form.severity,
      alert_message: form.alert_message.trim(),
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
    };

    if (form.zone_type === 'safety_incident') {
      payload.incident_type = form.incident_type;
    }

    if (!isNaN(lat) && !isNaN(lng) && !isNaN(radius) && radius > 0) {
      payload.center_lat = lat;
      payload.center_lng = lng;
      payload.radius_m = radius;
      payload.coordinates = circleToGeoJSON(lat, lng, radius);
    }

    return payload;
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('Zone name is required.'); return; }
    if (!form.city.trim()) { setFormError('City is required.'); return; }
    if (!form.alert_message.trim()) { setFormError('Alert message is required.'); return; }

    setSaving(true);
    setFormError('');

    const payload = buildPayload();

    try {
      if (editZone) {
        const id = editZone.id || editZone._id;
        await api.patch(`/safety-zones/${id}`, payload);
        setZones(prev => prev.map(z => (z.id === id || z._id === id) ? { ...z, ...payload, id } : z));
        setSuccess(`Safety zone "${payload.name}" updated.`);
      } else {
        const res = await api.post('/safety-zones', payload);
        const created = res.data?.zone || res.data || { ...payload, id: `zone_${Date.now()}`, is_active: true };
        setZones(prev => [created, ...prev]);
        setSuccess(`Safety zone "${payload.name}" created.`);
      }
      setDialogOpen(false);
    } catch (err) {
      setFormError(err.response?.data?.message || err.message || 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(''), 4000);
    }
  };

  const handleDeactivate = async (zone) => {
    setDeactivating(true);
    const id = zone.id || zone._id;
    try {
      await api.delete(`/safety-zones/${id}`);
    } catch {
      // optimistic
    }
    setZones(prev => prev.map(z => (z.id === id || z._id === id) ? { ...z, is_active: false } : z));
    setSuccess(`Zone "${zone.name}" deactivated.`);
    setDeactivateTarget(null);
    setDeactivating(false);
    setTimeout(() => setSuccess(''), 4000);
  };

  const truncate = (str, n = 60) => str?.length > n ? str.slice(0, n) + '…' : str;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <LocationIcon sx={{ fontSize: 28, color: '#000000' }} />
          <Typography variant="h5" fontWeight={700}>Safety Zones Manager</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button
            variant="outlined"
            startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
            onClick={fetchZones}
            disabled={loading}
            sx={{ borderRadius: '8px', borderColor: '#000000', color: '#000000', fontWeight: 600 }}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={openCreate}
            sx={{ bgcolor: '#000000', '&:hover': { bgcolor: '#222222' }, borderRadius: '8px', fontWeight: 700 }}
          >
            Add Safety Zone
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Card sx={{ borderRadius: '16px' }}>
        <CardContent sx={{ p: 2.5 }}>
          <Box sx={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Zone Name', 'City', 'Type', 'Incident', 'Severity', 'Alert Message', 'Active', 'Ends At', 'Actions'].map(col => (
                    <th
                      key={col}
                      style={{
                        padding: '8px 12px',
                        textAlign: 'left',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        color: 'rgba(0,0,0,0.45)',
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
                    <td colSpan={9} style={{ padding: '32px', textAlign: 'center' }}>
                      <CircularProgress size={28} sx={{ color: '#000000' }} />
                    </td>
                  </tr>
                ) : zones.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: 'rgba(0,0,0,0.4)', fontSize: '0.88rem' }}>
                      No safety zones found. Click "Add Safety Zone" to create one.
                    </td>
                  </tr>
                ) : (
                  zones.map((zone, idx) => (
                    <tr
                      key={zone.id || zone._id || idx}
                      style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.02)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '10px 12px' }}>
                        <Typography sx={{ fontSize: '0.83rem', fontWeight: 600 }}>{zone.name}</Typography>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <Typography sx={{ fontSize: '0.8rem', color: 'rgba(0,0,0,0.7)' }}>{zone.city}</Typography>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <Chip
                          label={ZONE_TYPE_LABELS[zone.zone_type] || zone.zone_type}
                          size="small"
                          sx={{
                            bgcolor: zone.zone_type === 'surge' ? 'rgba(255,140,0,0.1)' : 'rgba(255,209,0,0.1)',
                            color: zone.zone_type === 'surge' ? '#FF8C00' : '#FFD100',
                            fontWeight: 700, fontSize: '0.7rem', height: 22,
                          }}
                        />
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <Typography sx={{ fontSize: '0.8rem', color: 'rgba(0,0,0,0.7)', textTransform: 'capitalize' }}>
                          {zone.incident_type ? zone.incident_type.replace('_', ' ') : '—'}
                        </Typography>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <SeverityChip severity={zone.severity} />
                      </td>
                      <td style={{ padding: '10px 12px', maxWidth: 220 }}>
                        <Tooltip title={zone.alert_message || ''}>
                          <Typography sx={{ fontSize: '0.8rem', color: 'rgba(0,0,0,0.75)' }}>
                            {truncate(zone.alert_message)}
                          </Typography>
                        </Tooltip>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <Chip
                          label={zone.is_active ? 'Active' : 'Inactive'}
                          size="small"
                          sx={{
                            bgcolor: zone.is_active ? 'rgba(76,175,80,0.1)' : 'rgba(0,0,0,0.06)',
                            color: zone.is_active ? '#4CAF50' : '#999',
                            fontWeight: 700, fontSize: '0.7rem', height: 22,
                          }}
                        />
                      </td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <Typography sx={{ fontSize: '0.8rem', color: 'rgba(0,0,0,0.7)' }}>
                          {zone.ends_at ? new Date(zone.ends_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </Typography>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <Box sx={{ display: 'flex', gap: 0.8 }}>
                          <Tooltip title="Edit zone">
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => openEdit(zone)}
                              sx={{ fontSize: '0.7rem', py: 0.3, px: 1, borderRadius: '6px', borderColor: '#000000', color: '#000000', fontWeight: 600, minWidth: 'auto' }}
                            >
                              Edit
                            </Button>
                          </Tooltip>
                          {zone.is_active && (
                            <Tooltip title="Deactivate zone">
                              <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                onClick={() => setDeactivateTarget(zone)}
                                sx={{ fontSize: '0.7rem', py: 0.3, px: 1, borderRadius: '6px', fontWeight: 600, minWidth: 'auto' }}
                              >
                                Deactivate
                              </Button>
                            </Tooltip>
                          )}
                        </Box>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Box>

          {!loading && (
            <Typography sx={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.4)', mt: 1.5, textAlign: 'right' }}>
              {zones.length} zone{zones.length !== 1 ? 's' : ''} total
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* ── Add / Edit dialog ── */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: '16px' } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {editZone ? <EditIcon sx={{ color: '#000000', fontSize: 20 }} /> : <AddIcon sx={{ color: '#000000', fontSize: 20 }} />}
            <Typography fontWeight={700}>{editZone ? `Edit Zone — ${editZone.name}` : 'Add Safety Zone'}</Typography>
          </Box>
          <IconButton onClick={() => setDialogOpen(false)} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          {formError && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setFormError('')}>{formError}</Alert>
          )}

          <Grid container spacing={2}>
            {/* Zone name */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth size="small" label="Zone Name" required
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                sx={inputSx}
              />
            </Grid>

            {/* City */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth size="small" label="City" required
                value={form.city}
                onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
                sx={inputSx}
              />
            </Grid>

            {/* Zone type */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Zone Type</InputLabel>
                <Select
                  value={form.zone_type}
                  label="Zone Type"
                  onChange={e => setForm(p => ({ ...p, zone_type: e.target.value }))}
                  sx={{ borderRadius: '8px' }}
                >
                  <MenuItem value="surge">Surge</MenuItem>
                  <MenuItem value="safety_incident">Safety Incident</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Incident type — only when safety_incident */}
            {form.zone_type === 'safety_incident' && (
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Incident Type</InputLabel>
                  <Select
                    value={form.incident_type}
                    label="Incident Type"
                    onChange={e => setForm(p => ({ ...p, incident_type: e.target.value }))}
                    sx={{ borderRadius: '8px' }}
                  >
                    {INCIDENT_TYPES.map(t => (
                      <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}

            {/* Severity */}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Severity</InputLabel>
                <Select
                  value={form.severity}
                  label="Severity"
                  onChange={e => setForm(p => ({ ...p, severity: e.target.value }))}
                  sx={{ borderRadius: '8px' }}
                >
                  <MenuItem value="low">Low</MenuItem>
                  <MenuItem value="medium">Medium</MenuItem>
                  <MenuItem value="high">High</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Alert message */}
            <Grid item xs={12}>
              <TextField
                fullWidth size="small" label="Alert Message" required multiline rows={3}
                value={form.alert_message}
                onChange={e => setForm(p => ({ ...p, alert_message: e.target.value }))}
                placeholder="Message drivers will see when entering this zone…"
                sx={inputSx}
              />
            </Grid>

            {/* Starts / Ends */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth size="small" label="Starts At"
                type="datetime-local"
                value={form.starts_at}
                onChange={e => setForm(p => ({ ...p, starts_at: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={inputSx}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth size="small" label="Ends At"
                type="datetime-local"
                value={form.ends_at}
                onChange={e => setForm(p => ({ ...p, ends_at: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={inputSx}
              />
            </Grid>

            {/* Coordinates section */}
            <Grid item xs={12}>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(0,0,0,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, mb: 1 }}>
                Zone Coordinates (center + radius)
              </Typography>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth size="small" label="Center Latitude"
                type="number"
                value={form.center_lat}
                onChange={e => setForm(p => ({ ...p, center_lat: e.target.value }))}
                placeholder="e.g. 4.0483"
                inputProps={{ step: 'any' }}
                sx={inputSx}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth size="small" label="Center Longitude"
                type="number"
                value={form.center_lng}
                onChange={e => setForm(p => ({ ...p, center_lng: e.target.value }))}
                placeholder="e.g. 9.7043"
                inputProps={{ step: 'any' }}
                sx={inputSx}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth size="small" label="Radius (meters)"
                type="number"
                value={form.radius_m}
                onChange={e => setForm(p => ({ ...p, radius_m: e.target.value }))}
                placeholder="e.g. 500"
                inputProps={{ min: 50, step: 50 }}
                helperText="Approximated as 8-point polygon"
                sx={inputSx}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setDialogOpen(false)} variant="outlined" size="small" sx={{ borderRadius: '8px' }}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            size="small"
            disabled={saving}
            sx={{ bgcolor: '#000000', '&:hover': { bgcolor: '#222222' }, borderRadius: '8px', fontWeight: 700 }}
          >
            {saving ? <CircularProgress size={18} color="inherit" /> : (editZone ? 'Save Changes' : 'Create Zone')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Deactivate confirm dialog ── */}
      <Dialog
        open={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: '16px' } }}
      >
        <DialogTitle>Deactivate Zone</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.9rem' }}>
            Are you sure you want to deactivate <strong>{deactivateTarget?.name}</strong>? Drivers will no longer see alerts for this zone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setDeactivateTarget(null)} variant="outlined" size="small" sx={{ borderRadius: '8px' }}>
            Cancel
          </Button>
          <Button
            onClick={() => handleDeactivate(deactivateTarget)}
            color="error"
            variant="contained"
            size="small"
            disabled={deactivating}
            sx={{ borderRadius: '8px', fontWeight: 700 }}
          >
            {deactivating ? <CircularProgress size={18} color="inherit" /> : 'Deactivate'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

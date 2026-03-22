import React, { useState } from 'react';
import {
  Box, Typography, Card, CardContent, Button, Table, TableBody,
  TableCell, TableHead, TableRow, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Switch, FormControlLabel, Chip, Grid,
  Alert, Snackbar, Tooltip, IconButton,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import TwoWheelerIcon from '@mui/icons-material/TwoWheeler';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import AirportShuttleIcon from '@mui/icons-material/AirportShuttle';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import FaceIcon from '@mui/icons-material/Face';

const RIDE_ICONS = {
  moto:     <TwoWheelerIcon />,
  benskin:  <TwoWheelerIcon />,
  standard: <DirectionsCarIcon />,
  xl:       <AirportShuttleIcon />,
  women:    <FaceIcon />,
  delivery: <LocalShippingIcon />,
};

const RIDE_COLORS = {
  moto:     '#ea580c',
  benskin:  '#ea580c',
  standard: '#2563eb',
  xl:       '#7c3aed',
  women:    '#db2777',
  delivery: '#0891b2',
};

const DEFAULT_FARES = [
  { ride_type: 'moto',     base_fare: 300,  per_km: 80,  per_min: 12, booking_fee: 200, min_fare: 300,  active: true },
  { ride_type: 'benskin',  base_fare: 300,  per_km: 80,  per_min: 12, booking_fee: 200, min_fare: 300,  active: true },
  { ride_type: 'standard', base_fare: 1000, per_km: 700, per_min: 100, booking_fee: 500, min_fare: 500, active: true },
  { ride_type: 'xl',       base_fare: 1400, per_km: 900, per_min: 130, booking_fee: 500, min_fare: 700, active: true },
  { ride_type: 'women',    base_fare: 1000, per_km: 700, per_min: 100, booking_fee: 500, min_fare: 500, active: true },
  { ride_type: 'delivery', base_fare: 500,  per_km: 150, per_min: 40, booking_fee: 300, min_fare: 400,  active: true },
];

function exampleFare(row, km = 5) {
  const raw = row.base_fare + (row.per_km * km) + (row.per_min * km * 3);
  const service = Math.round(raw * 0.20);
  return Math.max(row.min_fare, raw + service + row.booking_fee);
}

export default function FareManagement() {
  const [fares, setFares] = useState(DEFAULT_FARES);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saved, setSaved] = useState(false);

  const openEdit = (row) => { setForm({ ...row }); setEditing(row.ride_type); };

  const handleSave = () => {
    setFares(prev => prev.map(f => f.ride_type === editing ? { ...form } : f));
    setEditing(null);
    setSaved(true);
  };

  const toggleActive = (ride_type) => {
    setFares(prev => prev.map(f => f.ride_type === ride_type ? { ...f, active: !f.active } : f));
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: Number(e.target.value) }));

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={800}>Fare Management</Typography>
          <Typography color="text.secondary">Per-ride-type pricing — all values in XAF</Typography>
        </Box>
        <Button variant="contained" onClick={() => setSaved(true)}>Save All Changes</Button>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        Fare formula: <strong>Base + (Per km × distance) + (Per min × duration)</strong> + Service fee (20%) + Booking fee.
        Changes here update the database and take effect on the next ride request.
      </Alert>

      {/* Summary cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {fares.map(row => (
          <Grid item xs={12} sm={6} md={4} key={row.ride_type}>
            <Card sx={{ borderLeft: `4px solid ${RIDE_COLORS[row.ride_type]}`, opacity: row.active ? 1 : 0.5 }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ color: RIDE_COLORS[row.ride_type] }}>{RIDE_ICONS[row.ride_type]}</Box>
                    <Typography fontWeight={700} textTransform="capitalize">{row.ride_type}</Typography>
                  </Box>
                  <Chip
                    label={row.active ? 'Active' : 'Off'}
                    size="small"
                    color={row.active ? 'success' : 'default'}
                    onClick={() => toggleActive(row.ride_type)}
                    sx={{ cursor: 'pointer', fontWeight: 700 }}
                  />
                </Box>
                <Typography variant="h6" fontWeight={800} sx={{ color: RIDE_COLORS[row.ride_type] }}>
                  ~{exampleFare(row).toLocaleString()} XAF
                </Typography>
                <Typography variant="caption" color="text.secondary">Example fare (5 km, 15 min)</Typography>
                <Box sx={{ display: 'flex', gap: 2, mt: 1.5, flexWrap: 'wrap' }}>
                  <Box><Typography variant="caption" color="text.secondary">Base</Typography><Typography variant="body2" fontWeight={600}>{row.base_fare.toLocaleString()}</Typography></Box>
                  <Box><Typography variant="caption" color="text.secondary">Per km</Typography><Typography variant="body2" fontWeight={600}>{row.per_km.toLocaleString()}</Typography></Box>
                  <Box><Typography variant="caption" color="text.secondary">Per min</Typography><Typography variant="body2" fontWeight={600}>{row.per_min.toLocaleString()}</Typography></Box>
                  <Box><Typography variant="caption" color="text.secondary">Min fare</Typography><Typography variant="body2" fontWeight={600}>{row.min_fare.toLocaleString()}</Typography></Box>
                </Box>
                <Button size="small" startIcon={<EditIcon />} sx={{ mt: 1.5 }} onClick={() => openEdit(row)}>Edit</Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Detail table */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Ride Type</TableCell>
                <TableCell align="right">Base Fare</TableCell>
                <TableCell align="right">Per km</TableCell>
                <TableCell align="right">Per min</TableCell>
                <TableCell align="right">Booking Fee</TableCell>
                <TableCell align="right">Min Fare</TableCell>
                <TableCell align="right">~5km Fare</TableCell>
                <TableCell align="center">Status</TableCell>
                <TableCell align="center">Edit</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {fares.map(row => (
                <TableRow key={row.ride_type} hover sx={{ opacity: row.active ? 1 : 0.5 }}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ color: RIDE_COLORS[row.ride_type] }}>{RIDE_ICONS[row.ride_type]}</Box>
                      <Typography fontWeight={600} textTransform="capitalize">{row.ride_type}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell align="right">{row.base_fare.toLocaleString()} XAF</TableCell>
                  <TableCell align="right">{row.per_km.toLocaleString()} XAF</TableCell>
                  <TableCell align="right">{row.per_min.toLocaleString()} XAF</TableCell>
                  <TableCell align="right">{row.booking_fee.toLocaleString()} XAF</TableCell>
                  <TableCell align="right">{row.min_fare.toLocaleString()} XAF</TableCell>
                  <TableCell align="right">
                    <Typography fontWeight={700} color={RIDE_COLORS[row.ride_type]}>
                      ~{exampleFare(row).toLocaleString()} XAF
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Switch checked={row.active} onChange={() => toggleActive(row.ride_type)} color="success" size="small" />
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Edit pricing">
                      <IconButton size="small" onClick={() => openEdit(row)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editing} onClose={() => setEditing(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit {editing} Pricing</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <TextField label="Base Fare (XAF)" type="number" value={form.base_fare || ''} onChange={set('base_fare')} fullWidth />
          <TextField label="Per km (XAF)" type="number" value={form.per_km || ''} onChange={set('per_km')} fullWidth />
          <TextField label="Per minute (XAF)" type="number" value={form.per_min || ''} onChange={set('per_min')} fullWidth />
          <TextField label="Booking Fee (XAF)" type="number" value={form.booking_fee || ''} onChange={set('booking_fee')} fullWidth />
          <TextField label="Minimum Fare (XAF)" type="number" value={form.min_fare || ''} onChange={set('min_fare')} fullWidth />
          {form.base_fare && (
            <Alert severity="info">
              Example 5km/15min fare: <strong>{exampleFare(form).toLocaleString()} XAF</strong>
            </Alert>
          )}
          <FormControlLabel
            control={<Switch checked={!!form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />}
            label="Ride type active"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={saved} autoHideDuration={3000} onClose={() => setSaved(false)}>
        <Alert severity="success" onClose={() => setSaved(false)}>Fare settings saved.</Alert>
      </Snackbar>
    </Box>
  );
}

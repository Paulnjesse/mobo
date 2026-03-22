import React, { useState } from 'react';
import {
  Box, Typography, Card, CardContent, Button, Chip, Table, TableBody,
  TableCell, TableHead, TableRow, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Select, MenuItem, FormControl, InputLabel,
  Switch, FormControlLabel, IconButton, Tooltip, Alert, Grid,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import LocationCityIcon from '@mui/icons-material/LocationCity';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PeopleIcon from '@mui/icons-material/People';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import PublicIcon from '@mui/icons-material/Public';

const MOCK_CITIES = [
  {
    id: 1,
    name: 'Yaoundé',
    country: 'Cameroon',
    timezone: 'Africa/Douala',
    currency: 'XAF',
    language: ['fr', 'en'],
    active: true,
    launchDate: '2023-01-15',
    activeDrivers: 412,
    activeRiders: 8840,
    ridesThisMonth: 14200,
    revenueThisMonth: 71000000,
    surgeEnabled: true,
    ussdEnabled: true,
    baseFare: 300,
    perKm: 120,
    perMin: 20,
    cancelFee: 500,
    minFare: 500,
  },
  {
    id: 2,
    name: 'Douala',
    country: 'Cameroon',
    timezone: 'Africa/Douala',
    currency: 'XAF',
    language: ['fr', 'en'],
    active: true,
    launchDate: '2023-03-01',
    activeDrivers: 688,
    activeRiders: 13200,
    ridesThisMonth: 22800,
    revenueThisMonth: 114000000,
    surgeEnabled: true,
    ussdEnabled: true,
    baseFare: 300,
    perKm: 130,
    perMin: 22,
    cancelFee: 500,
    minFare: 500,
  },
  {
    id: 3,
    name: 'Bafoussam',
    country: 'Cameroon',
    timezone: 'Africa/Douala',
    currency: 'XAF',
    language: ['fr'],
    active: false,
    launchDate: null,
    activeDrivers: 0,
    activeRiders: 0,
    ridesThisMonth: 0,
    revenueThisMonth: 0,
    surgeEnabled: false,
    ussdEnabled: true,
    baseFare: 250,
    perKm: 100,
    perMin: 18,
    cancelFee: 400,
    minFare: 400,
  },
  {
    id: 4,
    name: 'Bamenda',
    country: 'Cameroon',
    timezone: 'Africa/Douala',
    currency: 'XAF',
    language: ['en'],
    active: false,
    launchDate: null,
    activeDrivers: 0,
    activeRiders: 0,
    ridesThisMonth: 0,
    revenueThisMonth: 0,
    surgeEnabled: false,
    ussdEnabled: true,
    baseFare: 250,
    perKm: 100,
    perMin: 18,
    cancelFee: 400,
    minFare: 400,
  },
];

const TIMEZONES = ['Africa/Douala', 'Africa/Lagos', 'Africa/Nairobi', 'Africa/Johannesburg', 'Europe/Paris'];
const CURRENCIES = ['XAF', 'NGN', 'KES', 'ZAR', 'EUR'];

function StatCard({ icon, label, value, color }) {
  return (
    <Card>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2 }}>
        <Box sx={{ p: 1.5, borderRadius: 2, backgroundColor: color + '18' }}>
          {React.cloneElement(icon, { sx: { color, fontSize: 28 } })}
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={800}>{value}</Typography>
          <Typography variant="body2" color="text.secondary">{label}</Typography>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function MultiCity() {
  const [cities, setCities] = useState(MOCK_CITIES);
  const [selected, setSelected] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [form, setForm] = useState({});

  const totalDrivers = cities.filter(c => c.active).reduce((s, c) => s + c.activeDrivers, 0);
  const totalRiders = cities.filter(c => c.active).reduce((s, c) => s + c.activeRiders, 0);
  const totalRides = cities.reduce((s, c) => s + c.ridesThisMonth, 0);
  const totalRevenue = cities.reduce((s, c) => s + c.revenueThisMonth, 0);

  const openAdd = () => {
    setForm({
      name: '', country: 'Cameroon', timezone: 'Africa/Douala', currency: 'XAF',
      active: false, surgeEnabled: false, ussdEnabled: true,
      baseFare: 300, perKm: 120, perMin: 20, cancelFee: 500, minFare: 500,
      language: ['fr'],
    });
    setSelected(null);
    setDialogOpen(true);
  };

  const openEdit = (city) => {
    setForm({ ...city });
    setSelected(city.id);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (selected) {
      setCities(prev => prev.map(c => c.id === selected ? { ...c, ...form } : c));
    } else {
      setCities(prev => [...prev, { ...form, id: Date.now(), activeDrivers: 0, activeRiders: 0, ridesThisMonth: 0, revenueThisMonth: 0, launchDate: form.active ? new Date().toISOString().slice(0, 10) : null }]);
    }
    setDialogOpen(false);
  };

  const handleDelete = () => {
    setCities(prev => prev.filter(c => c.id !== deleteId));
    setDeleteId(null);
  };

  const toggleActive = (id) => {
    setCities(prev => prev.map(c => {
      if (c.id !== id) return c;
      const nowActive = !c.active;
      return { ...c, active: nowActive, launchDate: nowActive && !c.launchDate ? new Date().toISOString().slice(0, 10) : c.launchDate };
    }));
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={800}>Multi-City Management</Typography>
          <Typography color="text.secondary">Configure and monitor MOBO across all cities</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
          Add City
        </Button>
      </Box>

      {/* Summary stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard icon={<LocationCityIcon />} label="Active Cities" value={cities.filter(c => c.active).length} color="#1a3c6e" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard icon={<DirectionsCarIcon />} label="Active Drivers" value={totalDrivers.toLocaleString()} color="#16a34a" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard icon={<PeopleIcon />} label="Active Riders" value={totalRiders.toLocaleString()} color="#9333ea" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard icon={<TrendingUpIcon />} label="Revenue (This Month)" value={`${(totalRevenue / 1000000).toFixed(1)}M XAF`} color="#ea580c" />
        </Grid>
      </Grid>

      {/* City table */}
      <Card>
        <CardContent sx={{ p: 0 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>City</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Drivers</TableCell>
                <TableCell align="right">Riders</TableCell>
                <TableCell align="right">Rides/Month</TableCell>
                <TableCell align="right">Revenue/Month</TableCell>
                <TableCell>Pricing</TableCell>
                <TableCell>Features</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cities.map((city) => (
                <TableRow key={city.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <PublicIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                      <Box>
                        <Typography fontWeight={600}>{city.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{city.country} · {city.currency}</Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Switch
                        size="small"
                        checked={city.active}
                        onChange={() => toggleActive(city.id)}
                        color="success"
                      />
                      <Chip
                        label={city.active ? 'Live' : 'Inactive'}
                        size="small"
                        color={city.active ? 'success' : 'default'}
                        sx={{ fontWeight: 600 }}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Typography fontWeight={600}>{city.activeDrivers.toLocaleString()}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography fontWeight={600}>{city.activeRiders.toLocaleString()}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography fontWeight={600}>{city.ridesThisMonth.toLocaleString()}</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography fontWeight={600}>
                      {city.revenueThisMonth > 0 ? `${(city.revenueThisMonth / 1000000).toFixed(1)}M` : '—'} XAF
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ display: 'block' }}>
                      Base: {city.baseFare} XAF
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {city.perKm}/km · {city.perMin}/min
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {city.surgeEnabled && <Chip label="Surge" size="small" color="warning" variant="outlined" />}
                      {city.ussdEnabled && <Chip label="USSD" size="small" color="primary" variant="outlined" />}
                      {city.language?.map(l => (
                        <Chip key={l} label={l.toUpperCase()} size="small" variant="outlined" />
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Edit">
                      <IconButton size="small" onClick={() => openEdit(city)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" color="error" onClick={() => setDeleteId(city.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{selected ? 'Edit City' : 'Add New City'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="City Name" value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} fullWidth required />
            <TextField label="Country" value={form.country || ''} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} fullWidth />
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Timezone</InputLabel>
              <Select value={form.timezone || 'Africa/Douala'} label="Timezone" onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))}>
                {TIMEZONES.map(tz => <MenuItem key={tz} value={tz}>{tz}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Currency</InputLabel>
              <Select value={form.currency || 'XAF'} label="Currency" onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                {CURRENCIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 1 }}>Pricing (XAF)</Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="Base Fare" type="number" value={form.baseFare || ''} onChange={e => setForm(f => ({ ...f, baseFare: +e.target.value }))} fullWidth />
            <TextField label="Per km" type="number" value={form.perKm || ''} onChange={e => setForm(f => ({ ...f, perKm: +e.target.value }))} fullWidth />
            <TextField label="Per min" type="number" value={form.perMin || ''} onChange={e => setForm(f => ({ ...f, perMin: +e.target.value }))} fullWidth />
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="Min Fare" type="number" value={form.minFare || ''} onChange={e => setForm(f => ({ ...f, minFare: +e.target.value }))} fullWidth />
            <TextField label="Cancel Fee" type="number" value={form.cancelFee || ''} onChange={e => setForm(f => ({ ...f, cancelFee: +e.target.value }))} fullWidth />
          </Box>
          <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 1 }}>Features</Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControlLabel control={<Switch checked={!!form.surgeEnabled} onChange={e => setForm(f => ({ ...f, surgeEnabled: e.target.checked }))} />} label="Surge Pricing" />
            <FormControlLabel control={<Switch checked={!!form.ussdEnabled} onChange={e => setForm(f => ({ ...f, ussdEnabled: e.target.checked }))} />} label="USSD Booking" />
            <FormControlLabel control={<Switch checked={!!form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} color="success" />} label="Live" />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name}>
            {selected ? 'Save Changes' : 'Add City'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)}>
        <DialogTitle>Delete City?</DialogTitle>
        <DialogContent>
          <Alert severity="error">
            This will remove all city configuration. Existing ride data is retained.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

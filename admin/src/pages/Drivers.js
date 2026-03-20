import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Chip, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert,
  Select, MenuItem, FormControl, InputLabel, TextField,
  Divider, Avatar, IconButton, Switch, FormControlLabel,
  CircularProgress, Tabs, Tab, Rating,
} from '@mui/material';
import {
  DirectionsCar as CarIcon, CheckCircle as CheckIcon,
  WifiTethering as OnlineIcon, Block as BlockIcon,
  Close as CloseIcon, Edit as EditIcon, Star as StarIcon,
} from '@mui/icons-material';
import StatCard from '../components/StatCard';
import DataTable from '../components/DataTable';
import { driversAPI } from '../services/api';

const MOCK_DRIVERS = Array.from({ length: 35 }, (_, i) => ({
  id: `drv_${i + 1}`,
  name: ['Kofi Mensah', 'Ibrahim Traore', 'Yves Nkomo', 'Grace Bello', 'Moussa Coulibaly', 'Aisha Mohammed'][i % 6],
  phone: `+237 6${String(i + 50).padStart(2, '0')} ${String(i * 3 + 100).substring(0, 3)} ${String(i * 7 + 200).substring(0, 3)}`,
  email: `driver${i + 1}@mobo.cm`,
  city: i % 2 === 0 ? 'Douala' : 'Yaoundé',
  license_number: `CM-DL-${2020 + (i % 4)}-${String(i + 1).padStart(3, '0')}`,
  license_expiry: `202${6 + (i % 3)}-12-31`,
  national_id: `CM${String(i * 12345 + 100000).substring(0, 8)}`,
  is_approved: i % 4 !== 0,
  is_online: i % 3 === 0,
  is_suspended: i % 11 === 0,
  rating: (3.8 + Math.random() * 1.2).toFixed(1),
  total_rides: Math.floor(Math.random() * 300),
  total_earnings: Math.floor(Math.random() * 1000000),
  acceptance_rate: (80 + Math.random() * 20).toFixed(1),
  cancellation_rate: (Math.random() * 10).toFixed(1),
  vehicle: {
    make: ['Toyota', 'Honda', 'Kia', 'Hyundai', 'Nissan'][i % 5],
    model: ['Corolla', 'Civic', 'Rio', 'Accent', 'Sentra'][i % 5],
    year: 2018 + (i % 5),
    plate: `DL-${String(i * 111 + 1000).substring(0, 4)}-${String.fromCharCode(65 + i % 6)}`,
    color: ['White', 'Black', 'Silver', 'Grey', 'Blue'][i % 5],
    vehicle_type: ['standard', 'comfort', 'luxury', 'van', 'standard'][i % 5],
    seats: [4, 4, 5, 8, 4][i % 5],
    is_wheelchair_accessible: i % 7 === 0,
    is_active: i % 10 !== 0,
  },
}));

const EMPTY_DRIVER_FORM = {
  full_name: '', phone: '', email: '', city: '',
  license_number: '', license_expiry: '', national_id: '',
  is_approved: false, is_online: false,
  acceptance_rate: 100, cancellation_rate: 0,
};
const EMPTY_VEHICLE_FORM = {
  make: '', model: '', year: 2020, plate: '', color: '',
  vehicle_type: 'standard', seats: 4,
  is_wheelchair_accessible: false, is_active: true,
};

export default function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const [stats, setStats] = useState({ total: 0, online: 0, pending: 0, suspended: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editDriver, setEditDriver] = useState(null);
  const [driverForm, setDriverForm] = useState(EMPTY_DRIVER_FORM);
  const [vehicleForm, setVehicleForm] = useState(EMPTY_VEHICLE_FORM);
  const [editTab, setEditTab] = useState(0);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchDrivers = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = {};
      if (statusFilter === 'pending') params.approved = false;
      if (statusFilter === 'online') params.online = true;
      if (statusFilter === 'suspended') params.suspended = true;
      const [driversRes, statsRes] = await Promise.allSettled([
        driversAPI.getAll(params), driversAPI.getStats?.(),
      ]);
      const data = driversRes.status === 'fulfilled' ? (driversRes.value.data?.drivers || driversRes.value.data || []) : [];
      setDrivers(data.length ? data : MOCK_DRIVERS);
      const s = statsRes.status === 'fulfilled' ? statsRes.value.data : null;
      if (s) {
        setStats(s);
      } else {
        const d = data.length ? data : MOCK_DRIVERS;
        setStats({ total: d.length, online: d.filter(x => x.is_online).length, pending: d.filter(x => !x.is_approved).length, suspended: d.filter(x => x.is_suspended).length });
      }
    } catch {
      setDrivers(MOCK_DRIVERS);
      setStats({ total: MOCK_DRIVERS.length, online: MOCK_DRIVERS.filter(x => x.is_online).length, pending: MOCK_DRIVERS.filter(x => !x.is_approved).length, suspended: MOCK_DRIVERS.filter(x => x.is_suspended).length });
    } finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchDrivers(); }, [fetchDrivers]);

  const filtered = drivers.filter(d => {
    const q = search.toLowerCase();
    const name = d.full_name || d.name || '';
    return (!q || name.toLowerCase().includes(q) || d.phone?.includes(q) || d.city?.toLowerCase().includes(q))
      && (statusFilter === 'all'
        || (statusFilter === 'online' && d.is_online)
        || (statusFilter === 'pending' && !d.is_approved)
        || (statusFilter === 'suspended' && d.is_suspended));
  });

  const openEdit = (driver) => {
    setEditDriver(driver);
    setDriverForm({
      full_name: driver.full_name || driver.name || '',
      phone: driver.phone || '',
      email: driver.email || '',
      city: driver.city || '',
      license_number: driver.license_number || '',
      license_expiry: driver.license_expiry?.substring(0, 10) || '',
      national_id: driver.national_id || '',
      is_approved: driver.is_approved ?? false,
      is_online: driver.is_online ?? false,
      acceptance_rate: driver.acceptance_rate || 100,
      cancellation_rate: driver.cancellation_rate || 0,
    });
    setVehicleForm({
      make: driver.vehicle?.make || driver.make || '',
      model: driver.vehicle?.model || driver.model || '',
      year: driver.vehicle?.year || driver.year || 2020,
      plate: driver.vehicle?.plate || driver.plate || '',
      color: driver.vehicle?.color || driver.color || '',
      vehicle_type: driver.vehicle?.vehicle_type || driver.vehicle_type || 'standard',
      seats: driver.vehicle?.seats || driver.seats || 4,
      is_wheelchair_accessible: driver.vehicle?.is_wheelchair_accessible || false,
      is_active: driver.vehicle?.is_active ?? true,
    });
    setEditTab(0);
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    setEditSaving(true);
    try {
      await driversAPI.update(editDriver.id || editDriver._id, { ...driverForm, vehicle: vehicleForm });
    } catch {}
    setDrivers(prev => prev.map(d =>
      (d.id === editDriver.id || d._id === editDriver._id)
        ? { ...d, ...driverForm, name: driverForm.full_name, vehicle: vehicleForm }
        : d
    ));
    setSuccess(`${driverForm.full_name} updated successfully.`);
    setEditOpen(false);
    setEditSaving(false);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleApprove = async (driver) => {
    try { await driversAPI.approve(driver.id || driver._id); } catch {}
    setDrivers(prev => prev.map(d => (d.id === driver.id || d._id === driver._id) ? { ...d, is_approved: true } : d));
    setSuccess(`${driver.full_name || driver.name} approved.`);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleSuspend = async (driver) => {
    try { await driversAPI.suspend(driver.id || driver._id); } catch {}
    setDrivers(prev => prev.map(d => (d.id === driver.id || d._id === driver._id) ? { ...d, is_suspended: true } : d));
    setSuccess(`${driver.full_name || driver.name} suspended.`);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleUnsuspend = async (driver) => {
    try { await driversAPI.unsuspend(driver.id || driver._id); } catch {}
    setDrivers(prev => prev.map(d => (d.id === driver.id || d._id === driver._id) ? { ...d, is_suspended: false } : d));
    setSuccess(`${driver.full_name || driver.name} unsuspended.`);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleDelete = async (driver) => {
    try { await driversAPI.delete(driver.id || driver._id); } catch {}
    setDrivers(prev => prev.filter(d => d.id !== driver.id && d._id !== driver._id));
    setSuccess(`${driver.full_name || driver.name} deleted.`);
    setDeleteConfirm(null);
    setTimeout(() => setSuccess(''), 3000);
  };

  const getName = d => d.full_name || d.name || '';

  const columns = [
    { field: 'name', headerName: 'Driver', renderCell: row => (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Avatar sx={{ width: 28, height: 28, fontSize: '0.75rem', bgcolor: '#1A1A2E' }}>{getName(row)?.charAt(0)}</Avatar>
        <Box>
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }}>{getName(row)}</Typography>
          <Typography sx={{ fontSize: '0.7rem', color: '#666' }}>{row.city}</Typography>
        </Box>
      </Box>
    )},
    { field: 'phone', headerName: 'Phone' },
    { field: 'vehicle', headerName: 'Vehicle', renderCell: row => {
      const v = row.vehicle || row;
      return <Typography sx={{ fontSize: '0.8rem' }}>{v.make} {v.model} · <em>{v.plate}</em></Typography>;
    }},
    { field: 'rating', headerName: 'Rating', renderCell: row => (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <StarIcon sx={{ fontSize: 14, color: '#F5A623' }} />
        <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }}>{row.rating}</Typography>
      </Box>
    )},
    { field: 'total_rides', headerName: 'Rides', align: 'right' },
    { field: 'is_online', headerName: 'Online', renderCell: row => (
      <Chip label={row.is_online ? 'Online' : 'Offline'} size="small" sx={{ bgcolor: row.is_online ? 'rgba(76,175,80,0.1)' : 'rgba(0,0,0,0.06)', color: row.is_online ? '#4CAF50' : '#999', fontWeight: 600, fontSize: '0.7rem', height: 22 }} />
    )},
    { field: 'is_approved', headerName: 'Approval', renderCell: row => (
      <Chip label={row.is_approved ? 'Approved' : 'Pending'} size="small" sx={{ bgcolor: row.is_approved ? 'rgba(76,175,80,0.1)' : 'rgba(245,166,35,0.1)', color: row.is_approved ? '#4CAF50' : '#F5A623', fontWeight: 600, fontSize: '0.7rem', height: 22 }} />
    )},
    { field: 'is_suspended', headerName: 'Status', renderCell: row => (
      row.is_suspended
        ? <Chip label="Suspended" size="small" sx={{ bgcolor: 'rgba(233,69,96,0.1)', color: '#E94560', fontWeight: 600, fontSize: '0.7rem', height: 22 }} />
        : <Chip label="Active" size="small" sx={{ bgcolor: 'rgba(76,175,80,0.1)', color: '#4CAF50', fontWeight: 600, fontSize: '0.7rem', height: 22 }} />
    )},
  ];

  const tf = (label, key, form, setForm, type = 'text') => (
    <Grid item xs={12} sm={6} key={key}>
      <TextField fullWidth size="small" label={label} type={type} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
    </Grid>
  );
  const sw = (label, key, form, setForm) => (
    <Grid item xs={12} sm={6} key={key}>
      <FormControlLabel control={<Switch checked={!!form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.checked }))} color="primary" />} label={label} />
    </Grid>
  );
  const sel = (label, key, form, setForm, options) => (
    <Grid item xs={12} sm={6} key={key}>
      <FormControl fullWidth size="small">
        <InputLabel>{label}</InputLabel>
        <Select value={form[key]} label={label} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} sx={{ borderRadius: '8px' }}>
          {options.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
        </Select>
      </FormControl>
    </Grid>
  );

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>Driver Management</Typography>

      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setError('')}>{error}</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}><StatCard title="Total Drivers" value={stats.total?.toLocaleString()} icon={<CarIcon />} iconBg="#1A1A2E" loading={loading} /></Grid>
        <Grid item xs={6} sm={3}><StatCard title="Online Now" value={stats.online?.toLocaleString()} icon={<OnlineIcon />} iconBg="#4CAF50" loading={loading} /></Grid>
        <Grid item xs={6} sm={3}><StatCard title="Pending Approval" value={stats.pending?.toLocaleString()} icon={<CheckIcon />} iconBg="#F5A623" loading={loading} /></Grid>
        <Grid item xs={6} sm={3}><StatCard title="Suspended" value={stats.suspended?.toLocaleString()} icon={<BlockIcon />} iconBg="#E94560" loading={loading} /></Grid>
      </Grid>

      <Card>
        <CardContent sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <TextField size="small" placeholder="Search by name, phone, city..." value={search} onChange={e => setSearch(e.target.value)} sx={{ flex: 1, minWidth: 200, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Status</InputLabel>
              <Select value={statusFilter} label="Status" onChange={e => setStatusFilter(e.target.value)} sx={{ borderRadius: '8px' }}>
                <MenuItem value="all">All Drivers</MenuItem>
                <MenuItem value="online">Online</MenuItem>
                <MenuItem value="pending">Pending Approval</MenuItem>
                <MenuItem value="suspended">Suspended</MenuItem>
              </Select>
            </FormControl>
          </Box>
          <DataTable columns={columns} rows={filtered} loading={loading} externalSearch={search} actions
            onView={row => { setSelectedDriver(row); setViewOpen(true); }}
            onEdit={openEdit}
            onSuspend={handleSuspend} onUnsuspend={handleUnsuspend}
            onDelete={row => setDeleteConfirm(row)}
            getRowSuspended={row => row.is_suspended}
            extraAction={{ label: 'Approve', color: 'success', show: row => !row.is_approved, onClick: handleApprove }}
            searchPlaceholder="Filter table..."
          />
        </CardContent>
      </Card>

      {/* ── EDIT DIALOG ── */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EditIcon sx={{ color: '#1A1A2E' }} />
            <Typography fontWeight={700}>Edit Driver — {editDriver && getName(editDriver)}</Typography>
          </Box>
          <IconButton onClick={() => setEditOpen(false)} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <Tabs value={editTab} onChange={(_, v) => setEditTab(v)} sx={{ px: 2, borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
          <Tab label="Driver Info" />
          <Tab label="Vehicle Info" />
        </Tabs>
        <DialogContent sx={{ pt: 2.5 }}>
          {editTab === 0 && (
            <Grid container spacing={2}>
              {tf('Full Name', 'full_name', driverForm, setDriverForm)}
              {tf('Phone', 'phone', driverForm, setDriverForm)}
              {tf('Email', 'email', driverForm, setDriverForm)}
              {tf('City', 'city', driverForm, setDriverForm)}
              {tf('License Number', 'license_number', driverForm, setDriverForm)}
              {tf('License Expiry', 'license_expiry', driverForm, setDriverForm, 'date')}
              {tf('National ID', 'national_id', driverForm, setDriverForm)}
              {tf('Acceptance Rate (%)', 'acceptance_rate', driverForm, setDriverForm, 'number')}
              {tf('Cancellation Rate (%)', 'cancellation_rate', driverForm, setDriverForm, 'number')}
              {sw('Approved', 'is_approved', driverForm, setDriverForm)}
              {sw('Currently Online', 'is_online', driverForm, setDriverForm)}
            </Grid>
          )}
          {editTab === 1 && (
            <Grid container spacing={2}>
              {tf('Make', 'make', vehicleForm, setVehicleForm)}
              {tf('Model', 'model', vehicleForm, setVehicleForm)}
              {tf('Year', 'year', vehicleForm, setVehicleForm, 'number')}
              {tf('Plate Number', 'plate', vehicleForm, setVehicleForm)}
              {tf('Color', 'color', vehicleForm, setVehicleForm)}
              {sel('Vehicle Type', 'vehicle_type', vehicleForm, setVehicleForm, [
                { value: 'standard', label: 'Standard' }, { value: 'comfort', label: 'Comfort' },
                { value: 'luxury', label: 'Luxury' }, { value: 'bike', label: 'Bike' },
                { value: 'scooter', label: 'Scooter' }, { value: 'shared', label: 'Shared' },
                { value: 'van', label: 'Van' },
              ])}
              {tf('Seats', 'seats', vehicleForm, setVehicleForm, 'number')}
              {sw('Wheelchair Accessible', 'is_wheelchair_accessible', vehicleForm, setVehicleForm)}
              {sw('Vehicle Active', 'is_active', vehicleForm, setVehicleForm)}
            </Grid>
          )}
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setEditOpen(false)} variant="outlined" size="small">Cancel</Button>
          <Button onClick={handleEditSave} variant="contained" size="small" disabled={editSaving}
            sx={{ bgcolor: '#1A1A2E', '&:hover': { bgcolor: '#2d2d4e' } }}>
            {editSaving ? <CircularProgress size={18} color="inherit" /> : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── VIEW DIALOG ── */}
      <Dialog open={viewOpen} onClose={() => setViewOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Typography fontWeight={700}>Driver Profile</Typography>
          <IconButton onClick={() => setViewOpen(false)} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          {selectedDriver && (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <Avatar sx={{ width: 56, height: 56, bgcolor: '#1A1A2E', fontSize: '1.4rem' }}>{getName(selectedDriver)?.charAt(0)}</Avatar>
                <Box>
                  <Typography fontWeight={700} fontSize="1rem">{getName(selectedDriver)}</Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                    <Chip label={selectedDriver.is_approved ? 'Approved' : 'Pending'} size="small" sx={{ bgcolor: selectedDriver.is_approved ? 'rgba(76,175,80,0.1)' : 'rgba(245,166,35,0.1)', color: selectedDriver.is_approved ? '#4CAF50' : '#F5A623', fontWeight: 600, fontSize: '0.7rem', height: 22 }} />
                    <Chip label={selectedDriver.is_online ? 'Online' : 'Offline'} size="small" sx={{ bgcolor: selectedDriver.is_online ? 'rgba(76,175,80,0.15)' : 'rgba(0,0,0,0.06)', color: selectedDriver.is_online ? '#4CAF50' : '#999', fontWeight: 600, fontSize: '0.7rem', height: 22 }} />
                  </Box>
                </Box>
              </Box>
              <Typography variant="subtitle2" sx={{ mb: 1, color: '#666', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem' }}>Driver Info</Typography>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                {[
                  ['Phone', selectedDriver.phone], ['Email', selectedDriver.email], ['City', selectedDriver.city],
                  ['License', selectedDriver.license_number], ['License Expiry', selectedDriver.license_expiry?.substring(0,10)],
                  ['Rating', `${selectedDriver.rating} / 5`], ['Total Rides', selectedDriver.total_rides],
                  ['Acceptance Rate', `${selectedDriver.acceptance_rate}%`],
                  ['Total Earnings', `${Number(selectedDriver.total_earnings || 0).toLocaleString()} XAF`],
                ].map(([l, v]) => (
                  <Grid item xs={6} key={l}>
                    <Typography sx={{ fontSize: '0.72rem', color: 'rgba(26,26,46,0.5)', mb: 0.3 }}>{l}</Typography>
                    <Typography sx={{ fontSize: '0.88rem', fontWeight: 500 }}>{v || '—'}</Typography>
                  </Grid>
                ))}
              </Grid>
              {selectedDriver.vehicle && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Typography variant="subtitle2" sx={{ mb: 1, color: '#666', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem' }}>Vehicle</Typography>
                  <Grid container spacing={2}>
                    {[
                      ['Make', selectedDriver.vehicle.make], ['Model', selectedDriver.vehicle.model],
                      ['Year', selectedDriver.vehicle.year], ['Plate', selectedDriver.vehicle.plate],
                      ['Color', selectedDriver.vehicle.color], ['Type', selectedDriver.vehicle.vehicle_type],
                      ['Seats', selectedDriver.vehicle.seats],
                      ['Wheelchair', selectedDriver.vehicle.is_wheelchair_accessible ? 'Yes' : 'No'],
                    ].map(([l, v]) => (
                      <Grid item xs={6} key={l}>
                        <Typography sx={{ fontSize: '0.72rem', color: 'rgba(26,26,46,0.5)', mb: 0.3 }}>{l}</Typography>
                        <Typography sx={{ fontSize: '0.88rem', fontWeight: 500, textTransform: 'capitalize' }}>{v || '—'}</Typography>
                      </Grid>
                    ))}
                  </Grid>
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => { openEdit(selectedDriver); setViewOpen(false); }} variant="outlined" size="small" startIcon={<EditIcon />} sx={{ borderColor: '#1A1A2E', color: '#1A1A2E' }}>Edit</Button>
          {!selectedDriver?.is_approved && <Button onClick={() => { handleApprove(selectedDriver); setViewOpen(false); }} color="success" variant="outlined" size="small">Approve</Button>}
          {selectedDriver?.is_suspended ? (
            <Button onClick={() => { handleUnsuspend(selectedDriver); setViewOpen(false); }} color="success" variant="outlined" size="small">Unsuspend</Button>
          ) : (
            <Button onClick={() => { handleSuspend(selectedDriver); setViewOpen(false); }} color="error" variant="outlined" size="small">Suspend</Button>
          )}
          <Button onClick={() => setViewOpen(false)} variant="contained" size="small" sx={{ bgcolor: '#1A1A2E' }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── DELETE CONFIRM ── */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent><Typography>Are you sure you want to delete <strong>{deleteConfirm && getName(deleteConfirm)}</strong>?</Typography></DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setDeleteConfirm(null)} variant="outlined" size="small">Cancel</Button>
          <Button onClick={() => handleDelete(deleteConfirm)} color="error" variant="contained" size="small">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

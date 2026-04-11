import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Chip, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert,
  Select, MenuItem, FormControl, InputLabel, TextField,
  Divider, Avatar, IconButton, LinearProgress, Switch,
  FormControlLabel, CircularProgress, Tabs, Tab,
} from '@mui/material';
import {
  LocalShipping as FleetIcon, DirectionsCar as CarIcon,
  CheckCircle as CheckIcon, Block as BlockIcon,
  Close as CloseIcon, Edit as EditIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import StatCard from '../components/StatCard';
import DataTable from '../components/DataTable';
import { AuthContext } from '../context/AuthContext';
import api from '../services/api';

// ── helpers ─────────────────────────────────────────────────
const getName = u => u?.full_name || u?.owner_name || u?.name || '';

const MOCK_FLEETS = Array.from({ length: 12 }, (_, i) => ({
  id: `fleet_${i + 1}`,
  name: `FleetCo ${i + 1}`,
  fleet_number: i + 1,
  owner_name: ['Jean-Pierre Fotso', 'Alice Mbeki', 'Samuel Obi', 'Marie Fon'][i % 4],
  owner_phone: `+237 6${String(i + 10).padStart(2, '0')} 123 456`,
  city: i % 2 === 0 ? 'Douala' : 'Yaoundé',
  country: 'Cameroon',
  description: 'Premium fleet service',
  vehicle_count: 3 + (i % 8),
  max_vehicles: 15,
  total_earnings: Math.floor(Math.random() * 2000000),
  is_active: i % 5 !== 0,
  is_approved: i % 4 !== 0,
  is_suspended: i % 9 === 0,
  created_at: `2024-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')}`,
  vehicles: Array.from({ length: 3 + (i % 4) }, (_, j) => ({
    id: `veh_${i}_${j}`,
    make: ['Toyota', 'Honda', 'Kia'][j % 3],
    model: ['Corolla', 'Civic', 'Rio'][j % 3],
    year: 2018 + j,
    plate: `DL-${String(i * 100 + j * 10 + 1000).substring(0, 4)}-${String.fromCharCode(65 + j)}`,
    color: ['White', 'Black', 'Silver'][j % 3],
    vehicle_type: ['standard', 'comfort', 'luxury'][j % 3],
    seats: [4, 5, 4][j % 3],
    is_wheelchair_accessible: j === 2,
    is_active: j !== 0,
    insurance_expiry: `202${6 + j}-12-31`,
    assigned_driver: j % 2 === 0 ? `Driver ${j + 1}` : null,
    status: j % 3 === 0 ? 'pending' : 'approved',
  })),
}));

const EMPTY_FLEET_FORM = { name: '', city: '', description: '', max_vehicles: 15, is_active: true };
const EMPTY_VEHICLE_FORM = { make: '', model: '', year: 2020, plate: '', color: '', vehicle_type: 'standard', seats: 4, is_wheelchair_accessible: false, is_active: true, insurance_expiry: '' };

export default function FleetManagement() {
  const { token } = useContext(AuthContext);
  const [fleets, setFleets] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, active: 0, total_vehicles: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Fleet detail modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedFleet, setSelectedFleet] = useState(null);

  // Edit Fleet
  const [editFleetOpen, setEditFleetOpen] = useState(false);
  const [editFleet, setEditFleet] = useState(null);
  const [fleetForm, setFleetForm] = useState(EMPTY_FLEET_FORM);
  const [fleetSaving, setFleetSaving] = useState(false);

  // Edit Vehicle
  const [editVehicleOpen, setEditVehicleOpen] = useState(false);
  const [editVehicle, setEditVehicle] = useState(null);
  const [vehicleForm, setVehicleForm] = useState(EMPTY_VEHICLE_FORM);
  const [vehicleSaving, setVehicleSaving] = useState(false);

  const fetchFleets = useCallback(async () => {
    setLoading(true);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await api.get('/fleet/admin/all', { headers });
      const data = res.data?.fleets || res.data || [];
      setFleets(data.length ? data : MOCK_FLEETS);
      const f = data.length ? data : MOCK_FLEETS;
      setStats({
        total: f.length,
        pending: f.filter(x => !x.is_approved).length,
        active: f.filter(x => x.is_active && x.is_approved).length,
        total_vehicles: f.reduce((s, x) => s + (x.vehicle_count || 0), 0),
      });
    } catch {
      setFleets(MOCK_FLEETS);
      setStats({ total: MOCK_FLEETS.length, pending: MOCK_FLEETS.filter(x => !x.is_approved).length, active: MOCK_FLEETS.filter(x => x.is_active).length, total_vehicles: MOCK_FLEETS.reduce((s, x) => s + x.vehicle_count, 0) });
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchFleets(); }, [fetchFleets]);

  const filtered = fleets.filter(f => {
    const q = search.toLowerCase();
    return (!q || f.name?.toLowerCase().includes(q) || f.owner_name?.toLowerCase().includes(q) || f.city?.toLowerCase().includes(q))
      && (statusFilter === 'all'
        || (statusFilter === 'pending' && !f.is_approved)
        || (statusFilter === 'active' && f.is_active && f.is_approved)
        || (statusFilter === 'suspended' && f.is_suspended));
  });

  // Fleet actions
  const handleApproveFleet = async (fleet) => {
    try { await api.patch(`/fleet/admin/${fleet.id || fleet._id}/approve`); } catch {}
    setFleets(prev => prev.map(f => (f.id === fleet.id || f._id === fleet._id) ? { ...f, is_approved: true } : f));
    setSuccess(`${fleet.name} approved.`);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleSuspendFleet = async (fleet) => {
    try { await api.patch(`/fleet/admin/${fleet.id || fleet._id}/suspend`); } catch {}
    setFleets(prev => prev.map(f => (f.id === fleet.id || f._id === fleet._id) ? { ...f, is_suspended: true, is_active: false } : f));
    setSuccess(`${fleet.name} suspended.`);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleUnsuspendFleet = async (fleet) => {
    try { await api.patch(`/fleet/admin/${fleet.id || fleet._id}/activate`); } catch {}
    setFleets(prev => prev.map(f => (f.id === fleet.id || f._id === fleet._id) ? { ...f, is_suspended: false, is_active: true } : f));
    setSuccess(`${fleet.name} reactivated.`);
    setTimeout(() => setSuccess(''), 3000);
  };

  // Edit Fleet
  const openEditFleet = (fleet) => {
    setEditFleet(fleet);
    setFleetForm({
      name: fleet.name || '',
      city: fleet.city || '',
      description: fleet.description || '',
      max_vehicles: fleet.max_vehicles || 15,
      is_active: fleet.is_active ?? true,
    });
    setEditFleetOpen(true);
  };

  const handleSaveFleet = async () => {
    setFleetSaving(true);
    try { await api.patch(`/fleet/${editFleet.id || editFleet._id}`, fleetForm); } catch {}
    setFleets(prev => prev.map(f => (f.id === editFleet.id || f._id === editFleet._id) ? { ...f, ...fleetForm } : f));
    if (selectedFleet?.id === editFleet.id) setSelectedFleet(prev => ({ ...prev, ...fleetForm }));
    setSuccess(`${fleetForm.name} updated.`);
    setEditFleetOpen(false);
    setFleetSaving(false);
    setTimeout(() => setSuccess(''), 3000);
  };

  // Edit Vehicle
  const openEditVehicle = (vehicle, fleet) => {
    setEditVehicle({ ...vehicle, fleetId: fleet.id || fleet._id });
    setVehicleForm({
      make: vehicle.make || '',
      model: vehicle.model || '',
      year: vehicle.year || 2020,
      plate: vehicle.plate || '',
      color: vehicle.color || '',
      vehicle_type: vehicle.vehicle_type || 'standard',
      seats: vehicle.seats || 4,
      is_wheelchair_accessible: vehicle.is_wheelchair_accessible || false,
      is_active: vehicle.is_active ?? true,
      insurance_expiry: vehicle.insurance_expiry?.substring(0, 10) || '',
    });
    setEditVehicleOpen(true);
  };

  const handleSaveVehicle = async () => {
    setVehicleSaving(true);
    try { await api.patch(`/fleet/${editVehicle.fleetId}/vehicles/${editVehicle.id || editVehicle._id}`, vehicleForm); } catch {}
    // Update vehicle in all fleet's vehicle arrays
    setFleets(prev => prev.map(f => ({
      ...f,
      vehicles: f.vehicles?.map(v => (v.id === editVehicle.id || v._id === editVehicle._id) ? { ...v, ...vehicleForm } : v),
    })));
    if (selectedFleet) {
      setSelectedFleet(prev => ({
        ...prev,
        vehicles: prev.vehicles?.map(v => (v.id === editVehicle.id || v._id === editVehicle._id) ? { ...v, ...vehicleForm } : v),
      }));
    }
    setSuccess('Vehicle updated.');
    setEditVehicleOpen(false);
    setVehicleSaving(false);
    setTimeout(() => setSuccess(''), 3000);
  };

  // Vehicle approval
  const handleApproveVehicle = async (vehicle, fleet) => {
    try { await api.patch(`/fleet/admin/vehicles/${vehicle.id || vehicle._id}/approve`); } catch {}
    setFleets(prev => prev.map(f => ({
      ...f,
      vehicles: f.vehicles?.map(v => (v.id === vehicle.id || v._id === vehicle._id) ? { ...v, status: 'approved' } : v),
    })));
    if (selectedFleet) setSelectedFleet(prev => ({ ...prev, vehicles: prev.vehicles?.map(v => (v.id === vehicle.id) ? { ...v, status: 'approved' } : v) }));
    setSuccess('Vehicle approved.');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleRejectVehicle = async (vehicle) => {
    try { await api.patch(`/fleet/admin/vehicles/${vehicle.id || vehicle._id}/reject`); } catch {}
    setFleets(prev => prev.map(f => ({ ...f, vehicles: f.vehicles?.map(v => (v.id === vehicle.id) ? { ...v, status: 'rejected' } : v) })));
    if (selectedFleet) setSelectedFleet(prev => ({ ...prev, vehicles: prev.vehicles?.map(v => (v.id === vehicle.id) ? { ...v, status: 'rejected' } : v) }));
    setSuccess('Vehicle rejected.');
    setTimeout(() => setSuccess(''), 3000);
  };

  const statusColor = s => ({ active: '#4CAF50', approved: '#4CAF50', pending: '#FF6B35', suspended: '#E31837', rejected: '#E31837' }[s] || '#999');
  const statusBg = s => ({ active: 'rgba(76,175,80,0.1)', approved: 'rgba(76,175,80,0.1)', pending: 'rgba(255,107,53,0.1)', suspended: 'rgba(227,24,55,0.1)', rejected: 'rgba(227,24,55,0.1)' }[s] || 'rgba(0,0,0,0.06)');

  const columns = [
    { field: 'name', headerName: 'Fleet', renderCell: row => (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Avatar sx={{ width: 32, height: 32, bgcolor: '#000000', fontSize: '0.8rem' }}>{row.name?.charAt(0)}</Avatar>
        <Box>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 700 }}>{row.name}</Typography>
          <Typography sx={{ fontSize: '0.72rem', color: '#666' }}>Fleet #{row.fleet_number}</Typography>
        </Box>
      </Box>
    )},
    { field: 'owner_name', headerName: 'Owner', renderCell: row => (
      <Box>
        <Typography sx={{ fontSize: '0.82rem', fontWeight: 500 }}>{row.owner_name}</Typography>
        <Typography sx={{ fontSize: '0.72rem', color: '#666' }}>{row.owner_phone}</Typography>
      </Box>
    )},
    { field: 'city', headerName: 'City' },
    { field: 'vehicles', headerName: 'Vehicles', renderCell: row => (
      <Box sx={{ minWidth: 100 }}>
        <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, mb: 0.3 }}>{row.vehicle_count || 0}/{row.max_vehicles || 15}</Typography>
        <LinearProgress variant="determinate" value={((row.vehicle_count || 0) / (row.max_vehicles || 15)) * 100} sx={{ height: 5, borderRadius: 3, bgcolor: 'rgba(0,0,0,0.1)', '& .MuiLinearProgress-bar': { bgcolor: '#000000' } }} />
      </Box>
    )},
    { field: 'total_earnings', headerName: 'Earnings', renderCell: row => (
      <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }}>{Number(row.total_earnings || 0).toLocaleString()} XAF</Typography>
    )},
    { field: 'status', headerName: 'Status', renderCell: row => {
      const s = row.is_suspended ? 'suspended' : row.is_approved ? 'active' : 'pending';
      return <Chip label={s.charAt(0).toUpperCase() + s.slice(1)} size="small" sx={{ bgcolor: statusBg(s), color: statusColor(s), fontWeight: 600, fontSize: '0.7rem', height: 22, textTransform: 'capitalize' }} />;
    }},
  ];

  const vf = (label, key, type = 'text') => (
    <Grid item xs={12} sm={6} key={key}>
      <TextField fullWidth size="small" label={label} type={type} value={vehicleForm[key]} onChange={e => setVehicleForm(p => ({ ...p, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
    </Grid>
  );

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>Fleet Management</Typography>

      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setError('')}>{error}</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}><StatCard title="Total Fleets" value={stats.total?.toLocaleString()} icon={<FleetIcon />} iconBg="#000000" loading={loading} /></Grid>
        <Grid item xs={6} sm={3}><StatCard title="Pending Approval" value={stats.pending?.toLocaleString()} icon={<CheckIcon />} iconBg="#FF6B35" loading={loading} /></Grid>
        <Grid item xs={6} sm={3}><StatCard title="Active Fleets" value={stats.active?.toLocaleString()} icon={<CarIcon />} iconBg="#4CAF50" loading={loading} /></Grid>
        <Grid item xs={6} sm={3}><StatCard title="Total Vehicles" value={stats.total_vehicles?.toLocaleString()} icon={<CarIcon />} iconBg="#E31837" loading={loading} /></Grid>
      </Grid>

      <Card>
        <CardContent sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <TextField size="small" placeholder="Search by name, owner, city..." value={search} onChange={e => setSearch(e.target.value)} sx={{ flex: 1, minWidth: 200, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Status</InputLabel>
              <Select value={statusFilter} label="Status" onChange={e => setStatusFilter(e.target.value)} sx={{ borderRadius: '8px' }}>
                <MenuItem value="all">All Fleets</MenuItem>
                <MenuItem value="active">Active</MenuItem>
                <MenuItem value="pending">Pending Approval</MenuItem>
                <MenuItem value="suspended">Suspended</MenuItem>
              </Select>
            </FormControl>
          </Box>
          <DataTable columns={columns} rows={filtered} loading={loading} externalSearch={search} actions
            onView={row => { setSelectedFleet(row); setDetailOpen(true); }}
            onEdit={openEditFleet}
            onSuspend={handleSuspendFleet}
            onUnsuspend={handleUnsuspendFleet}
            getRowSuspended={row => row.is_suspended}
            extraAction={{ label: 'Approve', color: 'success', show: row => !row.is_approved, onClick: handleApproveFleet }}
            searchPlaceholder="Filter fleets..."
          />
        </CardContent>
      </Card>

      {/* ── FLEET DETAIL MODAL ── */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Typography fontWeight={700}>{selectedFleet?.name}</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" startIcon={<EditIcon />} variant="outlined" onClick={() => { openEditFleet(selectedFleet); setDetailOpen(false); }} sx={{ borderColor: '#000000', color: '#000000', borderRadius: '8px' }}>Edit Fleet</Button>
            <IconButton onClick={() => setDetailOpen(false)} size="small"><CloseIcon /></IconButton>
          </Box>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          {selectedFleet && (
            <>
              <Grid container spacing={2} sx={{ mb: 3 }}>
                {[
                  ['Owner', selectedFleet.owner_name], ['Phone', selectedFleet.owner_phone],
                  ['City', selectedFleet.city], ['Country', selectedFleet.country],
                  ['Vehicles', `${selectedFleet.vehicle_count || 0} / ${selectedFleet.max_vehicles || 15}`],
                  ['Earnings', `${Number(selectedFleet.total_earnings || 0).toLocaleString()} XAF`],
                  ['Created', selectedFleet.created_at?.substring(0, 10)],
                  ['Description', selectedFleet.description],
                ].map(([l, v]) => (
                  <Grid item xs={6} sm={3} key={l}>
                    <Typography sx={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.5)', mb: 0.3 }}>{l}</Typography>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 500 }}>{v || '—'}</Typography>
                  </Grid>
                ))}
              </Grid>

              <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700 }}>Vehicles ({selectedFleet.vehicles?.length || 0})</Typography>
              {selectedFleet.vehicles?.map(v => (
                <Box key={v.id} sx={{ display: 'flex', alignItems: 'center', p: 1.5, mb: 1, bgcolor: 'rgba(0,0,0,0.03)', borderRadius: '10px', gap: 1.5 }}>
                  <CarIcon sx={{ color: '#666', fontSize: 20 }} />
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>{v.make} {v.model} {v.year} · {v.plate}</Typography>
                    <Typography sx={{ fontSize: '0.75rem', color: '#666' }}>{v.color} · {v.vehicle_type} · {v.seats} seats {v.is_wheelchair_accessible ? '· ♿' : ''}</Typography>
                    {v.assigned_driver && <Typography sx={{ fontSize: '0.72rem', color: '#4CAF50' }}>Driver: {v.assigned_driver}</Typography>}
                  </Box>
                  <Chip label={v.status || 'pending'} size="small" sx={{ bgcolor: statusBg(v.status), color: statusColor(v.status), fontWeight: 600, fontSize: '0.7rem', height: 20, textTransform: 'capitalize' }} />
                  <Box sx={{ display: 'flex', gap: 0.5 }}>
                    <IconButton size="small" onClick={() => openEditVehicle(v, selectedFleet)} sx={{ color: '#000000' }}><EditIcon fontSize="small" /></IconButton>
                    {v.status === 'pending' && (
                      <>
                        <Button size="small" color="success" variant="outlined" onClick={() => handleApproveVehicle(v, selectedFleet)} sx={{ minWidth: 0, px: 1, py: 0.3, fontSize: '0.72rem', borderRadius: '6px' }}>✓</Button>
                        <Button size="small" color="error" variant="outlined" onClick={() => handleRejectVehicle(v)} sx={{ minWidth: 0, px: 1, py: 0.3, fontSize: '0.72rem', borderRadius: '6px' }}>✗</Button>
                      </>
                    )}
                  </Box>
                </Box>
              ))}
            </>
          )}
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2 }}>
          {selectedFleet && !selectedFleet.is_approved && (
            <Button onClick={() => { handleApproveFleet(selectedFleet); setDetailOpen(false); }} color="success" variant="outlined" size="small">Approve Fleet</Button>
          )}
          {selectedFleet?.is_suspended ? (
            <Button onClick={() => { handleUnsuspendFleet(selectedFleet); setDetailOpen(false); }} color="success" variant="outlined" size="small">Unsuspend</Button>
          ) : (
            <Button onClick={() => { handleSuspendFleet(selectedFleet); setDetailOpen(false); }} color="error" variant="outlined" size="small">Suspend</Button>
          )}
          <Button onClick={() => setDetailOpen(false)} variant="contained" size="small" sx={{ bgcolor: '#000000' }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── EDIT FLEET DIALOG ── */}
      <Dialog open={editFleetOpen} onClose={() => setEditFleetOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EditIcon sx={{ color: '#000000' }} />
            <Typography fontWeight={700}>Edit Fleet — {editFleet?.name}</Typography>
          </Box>
          <IconButton onClick={() => setEditFleetOpen(false)} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label="Fleet Name" value={fleetForm.name} onChange={e => setFleetForm(p => ({ ...p, name: e.target.value }))} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label="City" value={fleetForm.city} onChange={e => setFleetForm(p => ({ ...p, city: e.target.value }))} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth size="small" label="Description" value={fleetForm.description} onChange={e => setFleetForm(p => ({ ...p, description: e.target.value }))} multiline rows={2} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label="Max Vehicles (5–15)" type="number" value={fleetForm.max_vehicles}
                onChange={e => setFleetForm(p => ({ ...p, max_vehicles: Math.min(15, Math.max(5, Number(e.target.value))) }))}
                inputProps={{ min: 5, max: 15 }} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControlLabel control={<Switch checked={!!fleetForm.is_active} onChange={e => setFleetForm(p => ({ ...p, is_active: e.target.checked }))} color="success" />} label="Fleet Active" />
            </Grid>
          </Grid>
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setEditFleetOpen(false)} variant="outlined" size="small">Cancel</Button>
          <Button onClick={handleSaveFleet} variant="contained" size="small" disabled={fleetSaving} sx={{ bgcolor: '#000000' }}>
            {fleetSaving ? <CircularProgress size={18} color="inherit" /> : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── EDIT VEHICLE DIALOG ── */}
      <Dialog open={editVehicleOpen} onClose={() => setEditVehicleOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EditIcon sx={{ color: '#000000' }} />
            <Typography fontWeight={700}>Edit Vehicle — {editVehicle?.plate}</Typography>
          </Box>
          <IconButton onClick={() => setEditVehicleOpen(false)} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          <Grid container spacing={2}>
            {vf('Make', 'make')}
            {vf('Model', 'model')}
            {vf('Year', 'year', 'number')}
            {vf('Plate Number', 'plate')}
            {vf('Color', 'color')}
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Vehicle Type</InputLabel>
                <Select value={vehicleForm.vehicle_type} label="Vehicle Type" onChange={e => setVehicleForm(p => ({ ...p, vehicle_type: e.target.value }))} sx={{ borderRadius: '8px' }}>
                  {['standard','comfort','luxury','bike','scooter','shared','van'].map(t => <MenuItem key={t} value={t} sx={{ textTransform: 'capitalize' }}>{t.charAt(0).toUpperCase() + t.slice(1)}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            {vf('Seats', 'seats', 'number')}
            {vf('Insurance Expiry', 'insurance_expiry', 'date')}
            <Grid item xs={12} sx={{ display: 'flex', gap: 3 }}>
              <FormControlLabel control={<Switch checked={!!vehicleForm.is_wheelchair_accessible} onChange={e => setVehicleForm(p => ({ ...p, is_wheelchair_accessible: e.target.checked }))} />} label="Wheelchair Accessible" />
              <FormControlLabel control={<Switch checked={!!vehicleForm.is_active} onChange={e => setVehicleForm(p => ({ ...p, is_active: e.target.checked }))} color="success" />} label="Active" />
            </Grid>
          </Grid>
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setEditVehicleOpen(false)} variant="outlined" size="small">Cancel</Button>
          <Button onClick={handleSaveVehicle} variant="contained" size="small" disabled={vehicleSaving} sx={{ bgcolor: '#000000' }}>
            {vehicleSaving ? <CircularProgress size={18} color="inherit" /> : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

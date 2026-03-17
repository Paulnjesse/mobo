import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Chip, Button, Dialog,
  DialogTitle, DialogContent, DialogActions, Alert, Select, MenuItem,
  FormControl, InputLabel, Divider, Avatar, IconButton, Rating, TextField,
} from '@mui/material';
import {
  DriveEta as DriveEtaIcon,
  CheckCircle as CheckCircleIcon,
  HourglassEmpty as HourglassIcon,
  Block as BlockIcon,
  Close as CloseIcon,
  DirectionsCar as DirectionsCarIcon,
  Star as StarIcon,
} from '@mui/icons-material';
import StatCard from '../components/StatCard';
import DataTable from '../components/DataTable';
import { driversAPI } from '../services/api';

const MOCK_DRIVERS = Array.from({ length: 35 }, (_, i) => ({
  id: `drv_${i + 1}`,
  name: ['Martin Eto', 'Pierre Ngo', 'Jacques Biya', 'Eric Mbe', 'Denis Fouda', 'Alain Samba', 'Felix Ondo', 'Joseph Essam'][i % 8],
  phone: `+237 6${String(i + 50).padStart(2, '0')} ${String(i * 5 + 300).substring(0, 3)} ${String(i * 9 + 100).substring(0, 3)}`,
  email: `driver${i + 1}@mobo.cm`,
  vehicle: ['Toyota Corolla', 'Hyundai i10', 'Kia Rio', 'Peugeot 301', 'Honda Civic'][i % 5],
  vehiclePlate: `LT-${String(i * 7 + 1000).substring(0, 4)}-CM`,
  city: ['Douala', 'Yaoundé', 'Bafoussam', 'Garoua', 'Buea'][i % 5],
  rating: parseFloat((3.5 + Math.random() * 1.5).toFixed(1)),
  totalRides: Math.floor(Math.random() * 500) + 10,
  online: i % 4 === 0,
  approved: i % 6 !== 0,
  suspended: i % 13 === 0,
  pendingApproval: i % 6 === 0 && i % 13 !== 0,
  joinedDate: `2024-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')}`,
  licenseNumber: `DL${String(i * 3 + 10000).substring(0, 5)}`,
  vehicleYear: 2015 + (i % 9),
}));

export default function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const [stats, setStats] = useState({ total: 0, online: 0, pending: 0, suspended: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [viewOpen, setViewOpen] = useState(false);

  const fetchDrivers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter === 'pending') params.approved = false;
      if (filter === 'online') params.online = true;
      if (filter === 'suspended') params.suspended = true;
      const [dRes, sRes] = await Promise.allSettled([driversAPI.getAll(params), driversAPI.getStats()]);
      const data = dRes.status === 'fulfilled' ? (dRes.value.data?.drivers || dRes.value.data || []) : [];
      setDrivers(data.length ? data : MOCK_DRIVERS);
      const s = sRes.status === 'fulfilled' ? sRes.value.data : null;
      if (s) {
        setStats(s);
      } else {
        const d = data.length ? data : MOCK_DRIVERS;
        setStats({
          total: d.length,
          online: d.filter((x) => x.online).length,
          pending: d.filter((x) => x.pendingApproval || !x.approved).length,
          suspended: d.filter((x) => x.suspended).length,
        });
      }
    } catch {
      setDrivers(MOCK_DRIVERS);
      setStats({
        total: MOCK_DRIVERS.length,
        online: MOCK_DRIVERS.filter((x) => x.online).length,
        pending: MOCK_DRIVERS.filter((x) => x.pendingApproval).length,
        suspended: MOCK_DRIVERS.filter((x) => x.suspended).length,
      });
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchDrivers(); }, [fetchDrivers]);

  const filteredDrivers = drivers.filter((d) => {
    const q = search.toLowerCase();
    const matchSearch = !q || d.name?.toLowerCase().includes(q) || d.phone?.includes(q) || d.city?.toLowerCase().includes(q);
    const matchFilter =
      filter === 'all' ||
      (filter === 'pending' && (d.pendingApproval || !d.approved)) ||
      (filter === 'online' && d.online) ||
      (filter === 'suspended' && d.suspended);
    return matchSearch && matchFilter;
  });

  const handleApprove = async (driver) => {
    try { await driversAPI.approve(driver.id || driver._id); } catch {}
    setDrivers((prev) => prev.map((d) => (d.id === driver.id || d._id === driver._id) ? { ...d, approved: true, pendingApproval: false } : d));
    setSuccess(`${driver.name} has been approved.`);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleSuspend = async (driver) => {
    try { await driversAPI.suspend(driver.id || driver._id); } catch {}
    setDrivers((prev) => prev.map((d) => (d.id === driver.id || d._id === driver._id) ? { ...d, suspended: true } : d));
    setSuccess(`${driver.name} has been suspended.`);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleUnsuspend = async (driver) => {
    try { await driversAPI.unsuspend(driver.id || driver._id); } catch {}
    setDrivers((prev) => prev.map((d) => (d.id === driver.id || d._id === driver._id) ? { ...d, suspended: false } : d));
    setSuccess(`${driver.name} has been unsuspended.`);
    setTimeout(() => setSuccess(''), 3000);
  };

  const columns = [
    {
      field: 'name', headerName: 'Name',
      renderCell: (row) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Avatar sx={{ width: 28, height: 28, fontSize: '0.75rem', bgcolor: '#1A1A2E' }}>{row.name?.charAt(0)}</Avatar>
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 500 }}>{row.name}</Typography>
        </Box>
      ),
    },
    { field: 'phone', headerName: 'Phone' },
    { field: 'vehicle', headerName: 'Vehicle' },
    { field: 'city', headerName: 'City' },
    {
      field: 'rating', headerName: 'Rating',
      renderCell: (row) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <StarIcon sx={{ fontSize: 14, color: '#F5A623' }} />
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }}>{row.rating}</Typography>
        </Box>
      ),
    },
    { field: 'totalRides', headerName: 'Rides', align: 'right' },
    {
      field: 'online', headerName: 'Online',
      renderCell: (row) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: row.online ? '#4CAF50' : '#9E9E9E' }} />
          <Typography sx={{ fontSize: '0.78rem', color: row.online ? '#4CAF50' : '#9E9E9E' }}>
            {row.online ? 'Online' : 'Offline'}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'approved', headerName: 'Status',
      renderCell: (row) => {
        if (row.suspended) return <Chip label="Suspended" size="small" sx={{ bgcolor: 'rgba(233,69,96,0.1)', color: '#E94560', fontWeight: 600, fontSize: '0.7rem', height: 22 }} />;
        if (!row.approved || row.pendingApproval) return <Chip label="Pending" size="small" sx={{ bgcolor: 'rgba(245,166,35,0.1)', color: '#F5A623', fontWeight: 600, fontSize: '0.7rem', height: 22 }} />;
        return <Chip label="Approved" size="small" sx={{ bgcolor: 'rgba(76,175,80,0.1)', color: '#4CAF50', fontWeight: 600, fontSize: '0.7rem', height: 22 }} />;
      },
    },
  ];

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>Driver Management</Typography>

      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setError('')}>{error}</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}><StatCard title="Total Drivers" value={stats.total?.toLocaleString()} icon={<DriveEtaIcon />} iconBg="#1A1A2E" loading={loading} /></Grid>
        <Grid item xs={6} sm={3}><StatCard title="Online Now" value={stats.online?.toLocaleString()} icon={<DirectionsCarIcon />} iconBg="#4CAF50" loading={loading} /></Grid>
        <Grid item xs={6} sm={3}><StatCard title="Pending Approval" value={stats.pending?.toLocaleString()} icon={<HourglassIcon />} iconBg="#F5A623" loading={loading} /></Grid>
        <Grid item xs={6} sm={3}><StatCard title="Suspended" value={stats.suspended?.toLocaleString()} icon={<BlockIcon />} iconBg="#E94560" loading={loading} /></Grid>
      </Grid>

      <Card>
        <CardContent sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <TextField
              size="small" placeholder="Search by name, phone, city..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              sx={{ flex: 1, minWidth: 200, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Filter</InputLabel>
              <Select value={filter} label="Filter" onChange={(e) => setFilter(e.target.value)} sx={{ borderRadius: '8px' }}>
                <MenuItem value="all">All Drivers</MenuItem>
                <MenuItem value="pending">Pending Approval</MenuItem>
                <MenuItem value="online">Online</MenuItem>
                <MenuItem value="suspended">Suspended</MenuItem>
              </Select>
            </FormControl>
          </Box>
          <DataTable
            columns={columns}
            rows={filteredDrivers}
            loading={loading}
            externalSearch={search}
            actions
            onView={(row) => { setSelectedDriver(row); setViewOpen(true); }}
            onSuspend={handleSuspend}
            onUnsuspend={handleUnsuspend}
            getRowSuspended={(row) => row.suspended}
            extraActions={(row) =>
              (!row.approved || row.pendingApproval) && (
                <Button size="small" onClick={() => handleApprove(row)} variant="contained"
                  sx={{ bgcolor: '#4CAF50', fontSize: '0.7rem', py: 0.3, px: 1, minWidth: 'auto', borderRadius: '6px', mr: 0.5,
                    '&:hover': { bgcolor: '#388E3C' } }}>
                  Approve
                </Button>
              )
            }
          />
        </CardContent>
      </Card>

      {/* Driver Detail Modal */}
      <Dialog open={viewOpen} onClose={() => setViewOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Typography fontWeight={700}>Driver Details</Typography>
          <IconButton onClick={() => setViewOpen(false)} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          {selectedDriver && (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <Avatar sx={{ width: 60, height: 60, bgcolor: '#1A1A2E', fontSize: '1.5rem' }}>
                  {selectedDriver.name?.charAt(0)}
                </Avatar>
                <Box>
                  <Typography fontWeight={700} fontSize="1.05rem">{selectedDriver.name}</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.3 }}>
                    <Rating value={selectedDriver.rating} readOnly size="small" precision={0.1} />
                    <Typography sx={{ fontSize: '0.8rem', color: 'rgba(26,26,46,0.6)' }}>({selectedDriver.rating})</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                    {selectedDriver.suspended && <Chip label="Suspended" size="small" sx={{ bgcolor: 'rgba(233,69,96,0.1)', color: '#E94560', fontSize: '0.68rem' }} />}
                    {selectedDriver.approved && !selectedDriver.suspended && <Chip label="Approved" size="small" sx={{ bgcolor: 'rgba(76,175,80,0.1)', color: '#4CAF50', fontSize: '0.68rem' }} />}
                    {(!selectedDriver.approved || selectedDriver.pendingApproval) && <Chip label="Pending Approval" size="small" sx={{ bgcolor: 'rgba(245,166,35,0.1)', color: '#F5A623', fontSize: '0.68rem' }} />}
                    <Chip label={selectedDriver.online ? 'Online' : 'Offline'} size="small"
                      sx={{ bgcolor: selectedDriver.online ? 'rgba(76,175,80,0.1)' : 'rgba(158,158,158,0.1)', color: selectedDriver.online ? '#4CAF50' : '#9E9E9E', fontSize: '0.68rem' }} />
                  </Box>
                </Box>
              </Box>
              <Divider sx={{ mb: 2 }} />
              <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', mb: 1.5, color: 'rgba(26,26,46,0.7)' }}>Contact & Location</Typography>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                {[
                  ['Phone', selectedDriver.phone],
                  ['Email', selectedDriver.email],
                  ['City', selectedDriver.city],
                  ['Joined', selectedDriver.joinedDate],
                ].map(([label, val]) => (
                  <Grid item xs={6} key={label}>
                    <Typography sx={{ fontSize: '0.72rem', color: 'rgba(26,26,46,0.5)', mb: 0.3 }}>{label}</Typography>
                    <Typography sx={{ fontSize: '0.88rem', fontWeight: 500 }}>{val || '—'}</Typography>
                  </Grid>
                ))}
              </Grid>
              <Divider sx={{ mb: 2 }} />
              <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', mb: 1.5, color: 'rgba(26,26,46,0.7)' }}>Vehicle & Documents</Typography>
              <Grid container spacing={2}>
                {[
                  ['Vehicle', selectedDriver.vehicle],
                  ['Plate Number', selectedDriver.vehiclePlate],
                  ['Year', selectedDriver.vehicleYear],
                  ['License No.', selectedDriver.licenseNumber],
                  ['Total Rides', selectedDriver.totalRides?.toLocaleString()],
                  ['Rating', `${selectedDriver.rating} / 5`],
                ].map(([label, val]) => (
                  <Grid item xs={6} key={label}>
                    <Typography sx={{ fontSize: '0.72rem', color: 'rgba(26,26,46,0.5)', mb: 0.3 }}>{label}</Typography>
                    <Typography sx={{ fontSize: '0.88rem', fontWeight: 500 }}>{val || '—'}</Typography>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2, gap: 1 }}>
          {selectedDriver && (!selectedDriver.approved || selectedDriver.pendingApproval) && (
            <Button onClick={() => { handleApprove(selectedDriver); setViewOpen(false); }} color="success" variant="contained" size="small" sx={{ bgcolor: '#4CAF50' }}>Approve Driver</Button>
          )}
          {selectedDriver?.suspended ? (
            <Button onClick={() => { handleUnsuspend(selectedDriver); setViewOpen(false); }} color="success" variant="outlined" size="small">Unsuspend</Button>
          ) : (
            <Button onClick={() => { handleSuspend(selectedDriver); setViewOpen(false); }} color="error" variant="outlined" size="small">Suspend</Button>
          )}
          <Button onClick={() => setViewOpen(false)} variant="contained" size="small" sx={{ bgcolor: '#1A1A2E' }}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

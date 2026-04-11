import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Chip, Dialog,
  DialogTitle, DialogContent, Divider, Alert, Select, MenuItem,
  FormControl, InputLabel, TextField, IconButton,
} from '@mui/material';
import {
  DirectionsCar as DirectionsCarIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  HourglassEmpty as ActiveIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import StatCard from '../components/StatCard';
import DataTable from '../components/DataTable';
import { ridesAPI } from '../services/api';

const STATUS_COLORS = {
  completed: '#4CAF50',
  in_progress: '#2196F3',
  cancelled: '#FFD100',
  requested: '#FF8C00',
  accepted: '#9C27B0',
};

const RIDE_TYPES = ['Standard', 'Premium', 'Delivery', 'Moto', 'Shuttle'];

const MOCK_RIDES = Array.from({ length: 60 }, (_, i) => {
  const statuses = ['completed', 'in_progress', 'cancelled', 'requested', 'accepted'];
  const riders = ['Jean Dupont', 'Alice Mbeki', 'Samuel Obi', 'Marie Fon', 'Paul Kamga'];
  const drivers = ['Martin Eto', 'Pierre Ngo', 'Jacques Biya', 'Eric Mbe', 'N/A'];
  const cities = ['Douala', 'Yaoundé', 'Bafoussam', 'Garoua', 'Buea'];
  const status = statuses[i % 5];
  const d = new Date();
  d.setHours(d.getHours() - i * 2);
  return {
    id: `R-${9000 - i}`,
    rider: riders[i % 5],
    driver: status === 'cancelled' || status === 'requested' ? 'N/A' : drivers[i % 5],
    type: RIDE_TYPES[i % 5],
    status,
    city: cities[i % 5],
    fare: status === 'cancelled' ? 0 : Math.floor(Math.random() * 6000) + 1000,
    distance: status === 'cancelled' ? 0 : (Math.random() * 15 + 1).toFixed(1),
    duration: status === 'cancelled' ? 0 : Math.floor(Math.random() * 40) + 5,
    createdAt: d.toISOString().replace('T', ' ').substring(0, 16),
    pickup: ['Bonanjo, Douala', 'Bastos, Yaoundé', 'Marché A, Bafoussam', 'Centre, Garoua', 'Mile 16, Buea'][i % 5],
    dropoff: ['Akwa, Douala', 'Mvan, Yaoundé', 'Bafoussam Centre', 'Ngaoundéré Rd', 'Molyko, Buea'][i % 5],
    paymentMethod: ['Cash', 'MTN', 'Orange', 'Wave', 'Card'][i % 5],
    cancelReason: status === 'cancelled' ? ['Driver too far', 'Changed mind', 'No driver available'][i % 3] : null,
  };
});

export default function Rides() {
  const [rides, setRides] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, completedToday: 0, cancelledToday: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedRide, setSelectedRide] = useState(null);
  const [viewOpen, setViewOpen] = useState(false);

  const fetchRides = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (typeFilter !== 'all') params.type = typeFilter;
      const [rRes, sRes] = await Promise.allSettled([ridesAPI.getAll(params), ridesAPI.getStats()]);
      const data = rRes.status === 'fulfilled' ? (rRes.value.data?.rides || rRes.value.data || []) : [];
      setRides(data.length ? data : MOCK_RIDES);
      const s = sRes.status === 'fulfilled' ? sRes.value.data : null;
      if (s) {
        setStats(s);
      } else {
        const r = data.length ? data : MOCK_RIDES;
        setStats({
          total: r.length,
          active: r.filter((x) => x.status === 'in_progress' || x.status === 'accepted').length,
          completedToday: r.filter((x) => x.status === 'completed').length,
          cancelledToday: r.filter((x) => x.status === 'cancelled').length,
        });
      }
    } catch {
      setRides(MOCK_RIDES);
      setStats({
        total: MOCK_RIDES.length,
        active: MOCK_RIDES.filter((x) => x.status === 'in_progress' || x.status === 'accepted').length,
        completedToday: MOCK_RIDES.filter((x) => x.status === 'completed').length,
        cancelledToday: MOCK_RIDES.filter((x) => x.status === 'cancelled').length,
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => { fetchRides(); }, [fetchRides]);

  const filteredRides = rides.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.id?.toLowerCase().includes(q) || r.rider?.toLowerCase().includes(q) || r.driver?.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchType = typeFilter === 'all' || r.type === typeFilter;
    return matchSearch && matchStatus && matchType;
  });

  const columns = [
    { field: 'id', headerName: 'Ride ID', width: 90 },
    { field: 'rider', headerName: 'Rider' },
    { field: 'driver', headerName: 'Driver' },
    { field: 'type', headerName: 'Type' },
    {
      field: 'status', headerName: 'Status',
      renderCell: (row) => (
        <Chip label={row.status?.replace('_', ' ')} size="small" sx={{
          bgcolor: `${STATUS_COLORS[row.status] || '#999'}18`,
          color: STATUS_COLORS[row.status] || '#999',
          fontWeight: 600, fontSize: '0.7rem', height: 22, textTransform: 'capitalize',
        }} />
      ),
    },
    { field: 'city', headerName: 'City' },
    {
      field: 'fare', headerName: 'Fare', align: 'right',
      renderCell: (row) => (
        <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }}>
          {row.fare ? `${Number(row.fare).toLocaleString()} XAF` : '—'}
        </Typography>
      ),
    },
    { field: 'createdAt', headerName: 'Date', noWrap: true },
  ];

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>Ride Management</Typography>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setError('')}>{error}</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}><StatCard title="Total Rides" value={stats.total?.toLocaleString()} icon={<DirectionsCarIcon />} iconBg="#000000" loading={loading} /></Grid>
        <Grid item xs={6} sm={3}><StatCard title="Active Now" value={stats.active?.toLocaleString()} icon={<ActiveIcon />} iconBg="#2196F3" loading={loading} /></Grid>
        <Grid item xs={6} sm={3}><StatCard title="Completed Today" value={stats.completedToday?.toLocaleString()} icon={<CheckCircleIcon />} iconBg="#4CAF50" loading={loading} /></Grid>
        <Grid item xs={6} sm={3}><StatCard title="Cancelled Today" value={stats.cancelledToday?.toLocaleString()} icon={<CancelIcon />} iconBg="#FFD100" loading={loading} /></Grid>
      </Grid>

      <Card>
        <CardContent sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <TextField
              size="small" placeholder="Search by ID, rider, driver..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              sx={{ flex: 1, minWidth: 200, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>Status</InputLabel>
              <Select value={statusFilter} label="Status" onChange={(e) => setStatusFilter(e.target.value)} sx={{ borderRadius: '8px' }}>
                <MenuItem value="all">All Statuses</MenuItem>
                <MenuItem value="requested">Requested</MenuItem>
                <MenuItem value="accepted">Accepted</MenuItem>
                <MenuItem value="in_progress">In Progress</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
                <MenuItem value="cancelled">Cancelled</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Type</InputLabel>
              <Select value={typeFilter} label="Type" onChange={(e) => setTypeFilter(e.target.value)} sx={{ borderRadius: '8px' }}>
                <MenuItem value="all">All Types</MenuItem>
                {RIDE_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>
          <DataTable
            columns={columns}
            rows={filteredRides}
            loading={loading}
            externalSearch={search}
            actions
            onView={(row) => { setSelectedRide(row); setViewOpen(true); }}
            onSuspend={undefined}
            onUnsuspend={undefined}
          />
        </CardContent>
      </Card>

      {/* Ride Detail Modal */}
      <Dialog open={viewOpen} onClose={() => setViewOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box>
            <Typography fontWeight={700}>Ride Details</Typography>
            {selectedRide && <Typography sx={{ fontSize: '0.78rem', color: 'rgba(0,0,0,0.5)' }}>{selectedRide.id}</Typography>}
          </Box>
          <IconButton onClick={() => setViewOpen(false)} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          {selectedRide && (
            <Box>
              <Box sx={{ display: 'flex', gap: 1, mb: 2.5 }}>
                <Chip label={selectedRide.status?.replace('_', ' ')} size="small" sx={{
                  bgcolor: `${STATUS_COLORS[selectedRide.status]}18`,
                  color: STATUS_COLORS[selectedRide.status],
                  fontWeight: 700, fontSize: '0.78rem', height: 26, textTransform: 'capitalize',
                }} />
                <Chip label={selectedRide.type} size="small" sx={{ bgcolor: 'rgba(0,0,0,0.08)', fontSize: '0.78rem', height: 26 }} />
                <Chip label={selectedRide.paymentMethod} size="small" sx={{ bgcolor: 'rgba(0,0,0,0.08)', fontSize: '0.78rem', height: 26 }} />
              </Box>

              <Grid container spacing={2} sx={{ mb: 2 }}>
                {[
                  ['Rider', selectedRide.rider],
                  ['Driver', selectedRide.driver],
                  ['City', selectedRide.city],
                  ['Date', selectedRide.createdAt],
                  ['Distance', selectedRide.distance ? `${selectedRide.distance} km` : '—'],
                  ['Duration', selectedRide.duration ? `${selectedRide.duration} min` : '—'],
                ].map(([label, val]) => (
                  <Grid item xs={6} key={label}>
                    <Typography sx={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.5)', mb: 0.3 }}>{label}</Typography>
                    <Typography sx={{ fontSize: '0.88rem', fontWeight: 500 }}>{val || '—'}</Typography>
                  </Grid>
                ))}
              </Grid>

              <Divider sx={{ mb: 2 }} />
              <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', mb: 1.5, color: 'rgba(0,0,0,0.7)' }}>Route</Typography>
              <Box sx={{ bgcolor: '#F8F9FA', borderRadius: '8px', p: 1.5, mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#4CAF50', flexShrink: 0 }} />
                  <Typography sx={{ fontSize: '0.82rem' }}><strong>Pickup:</strong> {selectedRide.pickup}</Typography>
                </Box>
                <Box sx={{ ml: 1.25, borderLeft: '2px dashed rgba(0,0,0,0.15)', height: 16, mb: 1 }} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: '#FFD100', flexShrink: 0 }} />
                  <Typography sx={{ fontSize: '0.82rem' }}><strong>Dropoff:</strong> {selectedRide.dropoff}</Typography>
                </Box>
              </Box>

              <Box sx={{ bgcolor: '#000000', borderRadius: '10px', p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>Total Fare</Typography>
                <Typography sx={{ color: '#FF8C00', fontSize: '1.3rem', fontWeight: 800 }}>
                  {selectedRide.fare ? `${Number(selectedRide.fare).toLocaleString()} XAF` : '—'}
                </Typography>
              </Box>

              {selectedRide.cancelReason && (
                <Alert severity="warning" sx={{ mt: 2, borderRadius: '8px', fontSize: '0.82rem' }}>
                  Cancel reason: {selectedRide.cancelReason}
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}

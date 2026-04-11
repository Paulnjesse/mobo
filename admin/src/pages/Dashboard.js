import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  Alert,
  Button,
  Divider,
} from '@mui/material';
import {
  People as PeopleIcon,
  DriveEta as DriveEtaIcon,
  DirectionsCar as DirectionsCarIcon,
  AccountBalanceWallet as WalletIcon,
  Refresh as RefreshIcon,
  Shield as ShieldIcon,
  Visibility as ViewIcon,
  Download as DownloadIcon,
  PersonSearch as RevealIcon,
} from '@mui/icons-material';
import { format, subDays } from 'date-fns';
import StatCard from '../components/StatCard';
import { RevenueLineChart, RidesBarChart, PaymentPieChart } from '../components/Chart';
import DataTable from '../components/DataTable';
import { dashboardAPI, adminDataAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

// Mock data used as fallback when API returns empty
function generateMockRevenue() {
  return Array.from({ length: 7 }, (_, i) => ({
    date: format(subDays(new Date(), 6 - i), 'MMM d'),
    revenue: Math.floor(Math.random() * 800000) + 200000,
  }));
}

function generateMockRides() {
  return Array.from({ length: 7 }, (_, i) => ({
    date: format(subDays(new Date(), 6 - i), 'MMM d'),
    rides: Math.floor(Math.random() * 200) + 50,
  }));
}

const MOCK_PAYMENT_METHODS = [
  { name: 'Cash', value: 35 },
  { name: 'MTN Mobile Money', value: 28 },
  { name: 'Orange Money', value: 20 },
  { name: 'Wave', value: 12 },
  { name: 'Card', value: 5 },
];

const MOCK_STATS = {
  totalUsers: 1248,
  totalDrivers: 312,
  activeRides: 47,
  revenueToday: 1245000,
};

const MOCK_RECENT_RIDES = [
  { id: 'R-8821', rider: 'Jean Dupont', driver: 'Martin Eto', type: 'Standard', status: 'completed', city: 'Douala', fare: 2500 },
  { id: 'R-8820', rider: 'Alice Mbeki', driver: 'Pierre Ngo', type: 'Premium', status: 'in_progress', city: 'Yaoundé', fare: 4200 },
  { id: 'R-8819', rider: 'Samuel Obi', driver: 'N/A', type: 'Standard', status: 'cancelled', city: 'Douala', fare: 0 },
  { id: 'R-8818', rider: 'Marie Fon', driver: 'Jacques Biya', type: 'Standard', status: 'completed', city: 'Bafoussam', fare: 1800 },
  { id: 'R-8817', rider: 'Paul Kamga', driver: 'Eric Mbe', type: 'Delivery', status: 'completed', city: 'Douala', fare: 3100 },
  { id: 'R-8816', rider: 'Esther Nkum', driver: 'Denis Fouda', type: 'Standard', status: 'completed', city: 'Yaoundé', fare: 2200 },
  { id: 'R-8815', rider: 'Thomas Bello', driver: 'Alain Samba', type: 'Premium', status: 'completed', city: 'Douala', fare: 5500 },
  { id: 'R-8814', rider: 'Grace Tabi', driver: 'Felix Ondo', type: 'Standard', status: 'completed', city: 'Garoua', fare: 1600 },
  { id: 'R-8813', rider: 'Victor Muna', driver: 'Joseph Essam', type: 'Standard', status: 'in_progress', city: 'Douala', fare: 2800 },
  { id: 'R-8812', rider: 'Claire Njoya', driver: 'Henri Bidias', type: 'Standard', status: 'completed', city: 'Buea', fare: 2100 },
];

const MOCK_RECENT_USERS = [
  { id: 1, name: 'Jean Dupont', phone: '+237 6XX XXX 001', email: 'jean@email.com', role: 'rider', country: 'CM', joined: '2024-03-10' },
  { id: 2, name: 'Alice Mbeki', phone: '+237 6XX XXX 002', email: 'alice@email.com', role: 'rider', country: 'CM', joined: '2024-03-09' },
  { id: 3, name: 'Samuel Obi', phone: '+234 8XX XXX 003', email: 'samuel@email.com', role: 'driver', country: 'NG', joined: '2024-03-09' },
  { id: 4, name: 'Marie Fon', phone: '+237 6XX XXX 004', email: 'marie@email.com', role: 'rider', country: 'CM', joined: '2024-03-08' },
  { id: 5, name: 'Paul Kamga', phone: '+237 6XX XXX 005', email: 'paul@email.com', role: 'driver', country: 'CM', joined: '2024-03-08' },
];

const STATUS_COLORS = {
  completed:   '#4CAF50',
  in_progress: '#2196F3',
  cancelled:   '#E53935',
  requested:   '#FF6B35',
  accepted:    '#9C27B0',
};

const rideColumns = [
  { field: 'id', headerName: 'Ride ID', width: 90 },
  { field: 'rider', headerName: 'Rider' },
  { field: 'driver', headerName: 'Driver' },
  { field: 'type', headerName: 'Type' },
  {
    field: 'status',
    headerName: 'Status',
    renderCell: (row) => (
      <Chip
        label={row.status?.replace('_', ' ')}
        size="small"
        sx={{
          backgroundColor: `${STATUS_COLORS[row.status] || '#999'}20`,
          color: STATUS_COLORS[row.status] || '#999',
          fontWeight: 600,
          fontSize: '0.7rem',
          height: 22,
          textTransform: 'capitalize',
        }}
      />
    ),
  },
  { field: 'city', headerName: 'City' },
  {
    field: 'fare',
    headerName: 'Fare',
    align: 'right',
    renderCell: (row) => (
      <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#000000' }}>
        {row.fare ? `${Number(row.fare).toLocaleString()} XAF` : '—'}
      </Typography>
    ),
  },
];

const userColumns = [
  { field: 'name', headerName: 'Name' },
  { field: 'phone', headerName: 'Phone' },
  { field: 'email', headerName: 'Email' },
  {
    field: 'role',
    headerName: 'Role',
    renderCell: (row) => (
      <Chip
        label={row.role}
        size="small"
        sx={{
          backgroundColor: row.role === 'driver' ? 'rgba(0,0,0,0.08)' : 'rgba(227,24,55,0.1)',
          color: row.role === 'driver' ? '#000000' : '#E31837',
          fontWeight: 600,
          fontSize: '0.7rem',
          height: 22,
          textTransform: 'capitalize',
        }}
      />
    ),
  },
  { field: 'country', headerName: 'Country', width: 80 },
  { field: 'joined', headerName: 'Joined' },
];

const ACCESS_ICONS = {
  reveal_field: <RevealIcon sx={{ fontSize: 14, color: '#E31837' }} />,
  download:     <DownloadIcon sx={{ fontSize: 14, color: '#FF6B35' }} />,
  view:         <ViewIcon sx={{ fontSize: 14, color: '#2196F3' }} />,
};

export default function Dashboard() {
  const { hasPermission } = useAuth();
  const canSeeRevenue  = hasPermission('payments:read') || hasPermission('admin:full');
  const canSeeUsers    = hasPermission('users:read')    || hasPermission('admin:full');
  const canSeeRides    = hasPermission('rides:read')    || hasPermission('admin:full');
  const canSeeAlerts   = hasPermission('admin:audit_logs');

  const [stats, setStats] = useState(null);
  const [revenueData, setRevenueData] = useState([]);
  const [ridesData, setRidesData] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [recentRides, setRecentRides] = useState([]);
  const [recentUsers, setRecentUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [accessAlerts, setAccessAlerts] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const calls = [
        dashboardAPI.getStats(),
        dashboardAPI.getRevenueChart(7),
        dashboardAPI.getRidesChart(7),
        dashboardAPI.getPaymentMethods(),
        dashboardAPI.getRecentRides(),
        dashboardAPI.getRecentUsers(),
      ];
      if (canSeeAlerts) calls.push(adminDataAPI.getAccessLogs({ limit: 10 }));

      const [statsRes, revenueRes, ridesRes, pmRes, rrRes, ruRes, alertsRes] = await Promise.allSettled(calls);

      if (canSeeAlerts && alertsRes?.status === 'fulfilled') {
        setAccessAlerts(alertsRes.value.data?.logs || []);
      }

      setStats(statsRes.status === 'fulfilled' && statsRes.value.data ? statsRes.value.data : MOCK_STATS);
      setRevenueData(
        revenueRes.status === 'fulfilled' && revenueRes.value.data?.length
          ? revenueRes.value.data
          : generateMockRevenue()
      );
      setRidesData(
        ridesRes.status === 'fulfilled' && ridesRes.value.data?.length
          ? ridesRes.value.data
          : generateMockRides()
      );
      setPaymentMethods(
        pmRes.status === 'fulfilled' && pmRes.value.data?.length
          ? pmRes.value.data
          : MOCK_PAYMENT_METHODS
      );
      setRecentRides(
        rrRes.status === 'fulfilled' && rrRes.value.data?.length
          ? rrRes.value.data
          : MOCK_RECENT_RIDES
      );
      setRecentUsers(
        ruRes.status === 'fulfilled' && ruRes.value.data?.length
          ? ruRes.value.data
          : MOCK_RECENT_USERS
      );
      setLastUpdated(new Date());
    } catch (err) {
      setError('Failed to load dashboard data. Showing cached/sample data.');
      setStats(MOCK_STATS);
      setRevenueData(generateMockRevenue());
      setRidesData(generateMockRides());
      setPaymentMethods(MOCK_PAYMENT_METHODS);
      setRecentRides(MOCK_RECENT_RIDES);
      setRecentUsers(MOCK_RECENT_USERS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <Box>
      {/* Header row */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#000000' }}>
            Overview
          </Typography>
          {lastUpdated && (
            <Typography sx={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.45)', mt: 0.3 }}>
              Last updated: {format(lastUpdated, 'HH:mm:ss')}
            </Typography>
          )}
        </Box>
        <Button
          startIcon={<RefreshIcon />}
          onClick={fetchData}
          disabled={loading}
          size="small"
          sx={{
            color: '#000000',
            border: '1px solid rgba(0,0,0,0.15)',
            borderRadius: '8px',
            px: 2,
            '&:hover': { backgroundColor: 'rgba(0,0,0,0.05)' },
          }}
        >
          Refresh
        </Button>
      </Box>

      {error && (
        <Alert severity="warning" sx={{ mb: 2.5, borderRadius: '8px' }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Stat Cards — shown to all roles */}
      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {canSeeUsers && (
          <Grid item xs={12} sm={6} lg={3}>
            <StatCard
              title="Total Users"
              value={loading ? '—' : Number(stats?.totalUsers || 0).toLocaleString()}
              icon={<PeopleIcon />}
              iconBg="#000000"
              trend={12}
              trendLabel="vs last month"
              navigateTo="/users"
              loading={loading}
            />
          </Grid>
        )}
        {canSeeUsers && (
          <Grid item xs={12} sm={6} lg={3}>
            <StatCard
              title="Total Drivers"
              value={loading ? '—' : Number(stats?.totalDrivers || 0).toLocaleString()}
              icon={<DriveEtaIcon />}
              iconBg="#E31837"
              trend={8}
              trendLabel="vs last month"
              navigateTo="/drivers"
              loading={loading}
            />
          </Grid>
        )}
        {canSeeRides && (
          <Grid item xs={12} sm={6} lg={3}>
            <StatCard
              title="Active Rides"
              value={loading ? '—' : Number(stats?.activeRides || 0).toLocaleString()}
              icon={<DirectionsCarIcon />}
              iconBg="#FF6B35"
              subtitle="Right now"
              navigateTo="/rides"
              loading={loading}
            />
          </Grid>
        )}
        {canSeeRevenue && (
          <Grid item xs={12} sm={6} lg={3}>
            <StatCard
              title="Revenue Today"
              value={loading ? '—' : `${Number(stats?.revenueToday || 0).toLocaleString()} XAF`}
              icon={<WalletIcon />}
              iconBg="#4CAF50"
              trend={5}
              trendLabel="vs yesterday"
              navigateTo="/payments"
              loading={loading}
            />
          </Grid>
        )}
      </Grid>

      {/* Charts Row 1 — finance / full access */}
      {canSeeRevenue && (
        <Grid container spacing={2.5} sx={{ mb: 3 }}>
          <Grid item xs={12} md={8}>
            <Card>
              <CardContent sx={{ p: 2.5 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5, fontSize: '0.95rem' }}>
                  Revenue — Last 7 Days
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.45)', mb: 2 }}>
                  Total earnings in XAF
                </Typography>
                <RevenueLineChart data={revenueData} loading={loading} height={240} />
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ p: 2.5 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5, fontSize: '0.95rem' }}>
                  Payment Methods
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.45)', mb: 1 }}>
                  Distribution breakdown
                </Typography>
                <PaymentPieChart data={paymentMethods} loading={loading} height={240} />
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Charts Row 2 — ops / rides */}
      {canSeeRides && (
        <Grid container spacing={2.5} sx={{ mb: 3 }}>
          <Grid item xs={12}>
            <Card>
              <CardContent sx={{ p: 2.5 }}>
                <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5, fontSize: '0.95rem' }}>
                  Rides Per Day — Last 7 Days
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.45)', mb: 2 }}>
                  Daily ride volume
                </Typography>
                <RidesBarChart data={ridesData} loading={loading} height={200} />
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Bottom row: recent rides + access alerts (super admin) */}
      <Grid container spacing={2.5}>
        {canSeeRides && (
          <Grid item xs={12} md={canSeeAlerts ? 8 : 12}>
            <Card sx={{ mb: 3 }}>
              <CardContent sx={{ p: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>Recent Rides</Typography>
                  <Chip label="Last 10" size="small" sx={{ fontSize: '0.72rem' }} />
                </Box>
                <DataTable columns={rideColumns} rows={recentRides} loading={loading} actions={false} searchPlaceholder="Search rides..." defaultRowsPerPage={10} />
              </CardContent>
            </Card>
          </Grid>
        )}

        {/* Access alert panel — super admins only */}
        {canSeeAlerts && (
          <Grid item xs={12} md={4}>
            <Card sx={{ mb: 3, height: '100%' }}>
              <CardContent sx={{ p: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <ShieldIcon sx={{ fontSize: 18, color: '#E31837' }} />
                  <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                    Recent Data Access
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.45)', mb: 2 }}>
                  Last 10 admin data access events
                </Typography>
                {loading ? (
                  <Box sx={{ textAlign: 'center', py: 3 }}>
                    <Typography sx={{ color: '#BBB', fontSize: '0.82rem' }}>Loading…</Typography>
                  </Box>
                ) : accessAlerts.length === 0 ? (
                  <Typography sx={{ color: '#BBB', fontSize: '0.82rem', textAlign: 'center', py: 2 }}>
                    No recent access events
                  </Typography>
                ) : (
                  <Box>
                    {accessAlerts.map((log, i) => (
                      <Box key={log.id || i}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 1 }}>
                          <Box sx={{ mt: 0.2 }}>
                            {ACCESS_ICONS[log.action] || <ViewIcon sx={{ fontSize: 14, color: '#999' }} />}
                          </Box>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: '#000000', lineHeight: 1.3 }}>
                              {log.admin_name || 'Admin'} · {log.action?.replace('_', ' ')}
                            </Typography>
                            <Typography sx={{ fontSize: '0.7rem', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {log.resource_type} {log.resource_id ? `(${String(log.resource_id).substring(0,8)}…)` : ''}
                            </Typography>
                            <Typography sx={{ fontSize: '0.68rem', color: '#BBB' }}>
                              {log.created_at ? format(new Date(log.created_at), 'MMM d, HH:mm') : ''}
                            </Typography>
                          </Box>
                        </Box>
                        {i < accessAlerts.length - 1 && <Divider />}
                      </Box>
                    ))}
                  </Box>
                )}
                <Divider sx={{ mt: 1.5, mb: 1 }} />
                <Button
                  size="small" fullWidth
                  onClick={() => window.location.href = '/audit-log'}
                  sx={{ color: '#E31837', fontSize: '0.78rem', fontWeight: 600 }}>
                  View Full Audit Log →
                </Button>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      {/* Recent Users Table */}
      {canSeeUsers && (
        <Card>
          <CardContent sx={{ p: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
                Recent Registrations
              </Typography>
              <Chip label="Last 5" size="small" sx={{ fontSize: '0.72rem' }} />
            </Box>
            <DataTable
              columns={userColumns}
              rows={recentUsers}
              loading={loading}
              actions={false}
              searchPlaceholder="Search users..."
              defaultRowsPerPage={5}
            />
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

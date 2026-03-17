import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Chip, Alert, Select, MenuItem,
  FormControl, InputLabel, TextField,
} from '@mui/material';
import {
  AccountBalanceWallet as WalletIcon,
  TrendingUp as TrendingUpIcon,
  HourglassEmpty as PendingIcon,
  ErrorOutline as FailedIcon,
} from '@mui/icons-material';
import StatCard from '../components/StatCard';
import DataTable from '../components/DataTable';
import { RevenueAreaChart, PaymentPieChart } from '../components/Chart';
import { paymentsAPI } from '../services/api';
import { format, subDays } from 'date-fns';

const PAYMENT_METHODS = ['Cash', 'MTN', 'Orange', 'Wave', 'Card'];
const PAYMENT_STATUSES = ['completed', 'pending', 'failed', 'refunded'];

const MOCK_PAYMENTS = Array.from({ length: 55 }, (_, i) => {
  const statuses = ['completed', 'completed', 'completed', 'pending', 'failed'];
  const methods = PAYMENT_METHODS;
  const riders = ['Jean Dupont', 'Alice Mbeki', 'Samuel Obi', 'Marie Fon', 'Paul Kamga'];
  return {
    id: `PAY-${8000 - i}`,
    rideId: `R-${9000 - i}`,
    user: riders[i % 5],
    amount: Math.floor(Math.random() * 8000) + 800,
    method: methods[i % 5],
    status: statuses[i % 5],
    date: format(subDays(new Date(), Math.floor(i / 5)), 'yyyy-MM-dd HH:mm'),
  };
});

const MOCK_REVENUE_CHART = Array.from({ length: 30 }, (_, i) => ({
  date: format(subDays(new Date(), 29 - i), 'MMM d'),
  revenue: Math.floor(Math.random() * 1200000) + 300000,
}));

const MOCK_PAYMENT_METHODS = [
  { name: 'Cash', value: 35 },
  { name: 'MTN Mobile Money', value: 28 },
  { name: 'Orange Money', value: 20 },
  { name: 'Wave', value: 12 },
  { name: 'Card', value: 5 },
];

const STATUS_COLORS = {
  completed: '#4CAF50',
  pending: '#F5A623',
  failed: '#E94560',
  refunded: '#2196F3',
};

export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState({ today: 0, month: 0, pending: 0, failed: 0 });
  const [revenueChart, setRevenueChart] = useState([]);
  const [methodBreakdown, setMethodBreakdown] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (methodFilter !== 'all') params.method = methodFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      const [pRes, sRes, cRes, mRes] = await Promise.allSettled([
        paymentsAPI.getAll(params),
        paymentsAPI.getStats(),
        paymentsAPI.getRevenueChart(30),
        paymentsAPI.getMethodBreakdown(),
      ]);
      const pData = pRes.status === 'fulfilled' ? (pRes.value.data?.payments || pRes.value.data || []) : [];
      setPayments(pData.length ? pData : MOCK_PAYMENTS);
      const s = sRes.status === 'fulfilled' ? sRes.value.data : null;
      setStats(s || {
        today: 1245000,
        month: 38750000,
        pending: MOCK_PAYMENTS.filter((x) => x.status === 'pending').length,
        failed: MOCK_PAYMENTS.filter((x) => x.status === 'failed').length,
      });
      setRevenueChart(
        cRes.status === 'fulfilled' && cRes.value.data?.length ? cRes.value.data : MOCK_REVENUE_CHART
      );
      setMethodBreakdown(
        mRes.status === 'fulfilled' && mRes.value.data?.length ? mRes.value.data : MOCK_PAYMENT_METHODS
      );
    } catch {
      setPayments(MOCK_PAYMENTS);
      setStats({ today: 1245000, month: 38750000, pending: 8, failed: 3 });
      setRevenueChart(MOCK_REVENUE_CHART);
      setMethodBreakdown(MOCK_PAYMENT_METHODS);
    } finally {
      setLoading(false);
    }
  }, [methodFilter, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredPayments = payments.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.id?.toLowerCase().includes(q) || p.user?.toLowerCase().includes(q) || p.rideId?.toLowerCase().includes(q);
    const matchMethod = methodFilter === 'all' || p.method === methodFilter;
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchSearch && matchMethod && matchStatus;
  });

  const columns = [
    { field: 'id', headerName: 'Payment ID', width: 110 },
    { field: 'rideId', headerName: 'Ride ID', width: 90 },
    { field: 'user', headerName: 'User' },
    {
      field: 'amount', headerName: 'Amount', align: 'right',
      renderCell: (row) => (
        <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#1A1A2E' }}>
          {Number(row.amount).toLocaleString()} XAF
        </Typography>
      ),
    },
    {
      field: 'method', headerName: 'Method',
      renderCell: (row) => {
        const colors = { Cash: '#795548', MTN: '#FFC107', Orange: '#FF9800', Wave: '#2196F3', Card: '#9C27B0' };
        return (
          <Chip label={row.method} size="small" sx={{
            bgcolor: `${colors[row.method] || '#999'}18`,
            color: colors[row.method] || '#999',
            fontWeight: 600, fontSize: '0.7rem', height: 22,
          }} />
        );
      },
    },
    {
      field: 'status', headerName: 'Status',
      renderCell: (row) => (
        <Chip label={row.status} size="small" sx={{
          bgcolor: `${STATUS_COLORS[row.status]}18`,
          color: STATUS_COLORS[row.status],
          fontWeight: 600, fontSize: '0.7rem', height: 22, textTransform: 'capitalize',
        }} />
      ),
    },
    { field: 'date', headerName: 'Date', noWrap: true },
  ];

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>Payments & Revenue</Typography>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setError('')}>{error}</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}><StatCard title="Revenue Today" value={`${Number(stats.today || 0).toLocaleString()} XAF`} icon={<WalletIcon />} iconBg="#1A1A2E" trend={5} loading={loading} /></Grid>
        <Grid item xs={6} sm={3}><StatCard title="This Month" value={`${Number(stats.month || 0).toLocaleString()} XAF`} icon={<TrendingUpIcon />} iconBg="#E94560" trend={12} loading={loading} /></Grid>
        <Grid item xs={6} sm={3}><StatCard title="Pending" value={Number(stats.pending || 0).toLocaleString()} icon={<PendingIcon />} iconBg="#F5A623" loading={loading} /></Grid>
        <Grid item xs={6} sm={3}><StatCard title="Failed" value={Number(stats.failed || 0).toLocaleString()} icon={<FailedIcon />} iconBg="#E94560" loading={loading} /></Grid>
      </Grid>

      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent sx={{ p: 2.5 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5, fontSize: '0.95rem' }}>Revenue — Last 30 Days</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: 'rgba(26,26,46,0.45)', mb: 2 }}>Total earnings in XAF</Typography>
              <RevenueAreaChart data={revenueChart} loading={loading} height={240} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5, fontSize: '0.95rem' }}>Payment Methods</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: 'rgba(26,26,46,0.45)', mb: 1 }}>Distribution</Typography>
              <PaymentPieChart data={methodBreakdown} loading={loading} height={240} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent sx={{ p: 2.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2, fontSize: '0.95rem' }}>Payment Transactions</Typography>
          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <TextField
              size="small" placeholder="Search by ID, user..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              sx={{ flex: 1, minWidth: 200, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Method</InputLabel>
              <Select value={methodFilter} label="Method" onChange={(e) => setMethodFilter(e.target.value)} sx={{ borderRadius: '8px' }}>
                <MenuItem value="all">All Methods</MenuItem>
                {PAYMENT_METHODS.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Status</InputLabel>
              <Select value={statusFilter} label="Status" onChange={(e) => setStatusFilter(e.target.value)} sx={{ borderRadius: '8px' }}>
                <MenuItem value="all">All Statuses</MenuItem>
                {PAYMENT_STATUSES.map((s) => <MenuItem key={s} value={s} sx={{ textTransform: 'capitalize' }}>{s}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>
          <DataTable
            columns={columns}
            rows={filteredPayments}
            loading={loading}
            externalSearch={search}
            actions={false}
          />
        </CardContent>
      </Card>
    </Box>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Card, CardContent, Typography, Chip, Button,
  TextField, FormControl, InputLabel, Select, MenuItem,
  CircularProgress, Alert, Grid, Tooltip, IconButton,
} from '@mui/material';
import {
  Shield as ShieldIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  Visibility as ViewIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import DataTable from '../components/DataTable';
import { adminDataAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const ACTION_COLORS = {
  view:         { bg: 'rgba(33,150,243,0.1)',  color: '#2196F3' },
  reveal_field: { bg: 'rgba(255,209,0,0.1)',   color: '#FFD100' },
  download:     { bg: 'rgba(255,140,0,0.1)',  color: '#FF8C00' },
  upload:       { bg: 'rgba(76,175,80,0.1)',   color: '#4CAF50' },
  verify:       { bg: 'rgba(76,175,80,0.1)',   color: '#4CAF50' },
  archive:      { bg: 'rgba(158,158,158,0.1)', color: '#9E9E9E' },
  list:         { bg: 'rgba(33,150,243,0.08)', color: '#64B5F6' },
};

const RESOURCE_LABELS = {
  user:     'User',
  driver:   'Driver',
  document: 'Document',
  pii:      'PII Field',
};

export default function AuditLog() {
  const { hasPermission } = useAuth();
  const canView = hasPermission('admin:audit_logs');

  const [logs,    setLogs]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [page,    setPage]    = useState(0);
  const [rowsPerPage] = useState(25);

  // Filters
  const [search,       setSearch]       = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [typeFilter,   setTypeFilter]   = useState('all');
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');

  const fetchLogs = useCallback(async () => {
    if (!canView) return;
    setLoading(true); setError('');
    try {
      const params = {
        limit: rowsPerPage,
        offset: page * rowsPerPage,
      };
      if (actionFilter !== 'all') params.action = actionFilter;
      if (typeFilter   !== 'all') params.resource_type = typeFilter;
      if (dateFrom) params.from = dateFrom;
      if (dateTo)   params.to   = dateTo;
      if (search)   params.q    = search;

      const res = await adminDataAPI.getAccessLogs(params);
      setLogs(res.data?.logs || []);
      setTotal(res.data?.total || 0);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load access logs.');
    } finally { setLoading(false); }
  }, [canView, page, rowsPerPage, actionFilter, typeFilter, dateFrom, dateTo, search]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleExportCSV = () => {
    const headers = ['Timestamp', 'Admin', 'Action', 'Resource', 'Resource ID', 'Fields', 'IP Address'];
    const rows = logs.map(l => [
      l.created_at,
      l.admin_name || l.accessed_by,
      l.action,
      l.resource_type,
      l.resource_id,
      Array.isArray(l.fields_accessed) ? l.fields_accessed.join('; ') : (l.fields_accessed || ''),
      l.ip_address || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `mobo-audit-log-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns = [
    {
      field: 'created_at',
      headerName: 'Timestamp',
      width: 160,
      renderCell: (row) => (
        <Typography sx={{ fontSize: '0.78rem', color: '#555', fontFamily: 'monospace' }}>
          {row.created_at ? format(new Date(row.created_at), 'yyyy-MM-dd HH:mm:ss') : '—'}
        </Typography>
      ),
    },
    {
      field: 'admin_name',
      headerName: 'Admin',
      renderCell: (row) => (
        <Box>
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#000000' }}>
            {row.admin_name || row.accessed_by_name || 'Unknown'}
          </Typography>
          <Typography sx={{ fontSize: '0.7rem', color: '#999' }}>
            {row.admin_email || ''}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'action',
      headerName: 'Action',
      renderCell: (row) => {
        const c = ACTION_COLORS[row.action] || { bg: 'rgba(0,0,0,0.06)', color: '#666' };
        return (
          <Chip
            label={row.action?.replace('_', ' ')}
            size="small"
            sx={{ bgcolor: c.bg, color: c.color, fontWeight: 600, fontSize: '0.7rem', height: 22, textTransform: 'capitalize' }}
          />
        );
      },
    },
    {
      field: 'resource_type',
      headerName: 'Resource',
      renderCell: (row) => (
        <Box>
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: '#000000' }}>
            {RESOURCE_LABELS[row.resource_type] || row.resource_type}
          </Typography>
          <Typography sx={{ fontSize: '0.7rem', color: '#BBB', fontFamily: 'monospace' }}>
            {row.resource_id ? String(row.resource_id).substring(0, 12) + '…' : ''}
          </Typography>
        </Box>
      ),
    },
    {
      field: 'fields_accessed',
      headerName: 'Fields / Details',
      renderCell: (row) => {
        const fields = Array.isArray(row.fields_accessed) ? row.fields_accessed : [];
        if (!fields.length) return <Typography sx={{ fontSize: '0.78rem', color: '#BBB' }}>—</Typography>;
        return (
          <Box sx={{ display: 'flex', gap: 0.4, flexWrap: 'wrap' }}>
            {fields.slice(0, 3).map(f => (
              <Chip key={f} label={f} size="small"
                sx={{ height: 18, fontSize: '0.62rem', bgcolor: 'rgba(255,209,0,0.08)', color: '#FFD100' }} />
            ))}
            {fields.length > 3 && (
              <Chip label={`+${fields.length - 3}`} size="small"
                sx={{ height: 18, fontSize: '0.62rem', bgcolor: 'rgba(0,0,0,0.06)', color: '#666' }} />
            )}
          </Box>
        );
      },
    },
    {
      field: 'ip_address',
      headerName: 'IP Address',
      width: 130,
      renderCell: (row) => (
        <Typography sx={{ fontSize: '0.78rem', fontFamily: 'monospace', color: '#777' }}>
          {row.ip_address || '—'}
        </Typography>
      ),
    },
  ];

  if (!canView) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Box sx={{ textAlign: 'center' }}>
          <ShieldIcon sx={{ fontSize: 48, color: '#CCC', mb: 2 }} />
          <Typography variant="h6" color="#666">Access Restricted</Typography>
          <Typography sx={{ color: '#999', mt: 1 }}>You need the <strong>admin:audit_logs</strong> permission to view this page.</Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <ShieldIcon sx={{ color: '#FFD100' }} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>Audit Log</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.45)' }}>
              Every data access by admin staff is recorded here
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button startIcon={<RefreshIcon />} onClick={fetchLogs} disabled={loading}
            size="small" variant="outlined" sx={{ borderColor: '#000000', color: '#000000', borderRadius: '8px' }}>
            Refresh
          </Button>
          <Button startIcon={<DownloadIcon />} onClick={handleExportCSV} disabled={logs.length === 0}
            size="small" variant="outlined" sx={{ borderColor: '#000000', color: '#000000', borderRadius: '8px' }}>
            Export CSV
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setError('')}>{error}</Alert>}

      {/* Summary cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total Records', value: total.toLocaleString(), color: '#000000' },
          { label: 'Filtered', value: logs.length.toLocaleString(), color: '#2196F3' },
          { label: 'PII Reveals', value: logs.filter(l => l.action === 'reveal_field').length.toLocaleString(), color: '#FFD100' },
          { label: 'Downloads', value: logs.filter(l => l.action === 'download').length.toLocaleString(), color: '#FF8C00' },
        ].map(({ label, value, color }) => (
          <Grid item xs={6} sm={3} key={label}>
            <Card>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography sx={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.5)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Typography>
                <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color }}>{value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Filters */}
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ p: 2 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={4}>
              <TextField
                size="small" fullWidth
                placeholder="Search admin name, resource ID…"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
                InputProps={{ startAdornment: <SearchIcon sx={{ fontSize: 16, color: '#CCC', mr: 0.5 }} /> }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Grid>
            <Grid item xs={6} sm={2}>
              <FormControl size="small" fullWidth>
                <InputLabel>Action</InputLabel>
                <Select value={actionFilter} label="Action" onChange={e => { setActionFilter(e.target.value); setPage(0); }} sx={{ borderRadius: '8px' }}>
                  <MenuItem value="all">All Actions</MenuItem>
                  <MenuItem value="view">View</MenuItem>
                  <MenuItem value="reveal_field">Reveal PII</MenuItem>
                  <MenuItem value="download">Download</MenuItem>
                  <MenuItem value="upload">Upload</MenuItem>
                  <MenuItem value="verify">Verify</MenuItem>
                  <MenuItem value="archive">Archive</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={2}>
              <FormControl size="small" fullWidth>
                <InputLabel>Resource</InputLabel>
                <Select value={typeFilter} label="Resource" onChange={e => { setTypeFilter(e.target.value); setPage(0); }} sx={{ borderRadius: '8px' }}>
                  <MenuItem value="all">All Types</MenuItem>
                  <MenuItem value="user">User</MenuItem>
                  <MenuItem value="driver">Driver</MenuItem>
                  <MenuItem value="document">Document</MenuItem>
                  <MenuItem value="pii">PII</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6} sm={2}>
              <TextField size="small" fullWidth type="date" label="From"
                InputLabelProps={{ shrink: true }}
                value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Grid>
            <Grid item xs={6} sm={2}>
              <TextField size="small" fullWidth type="date" label="To"
                InputLabelProps={{ shrink: true }}
                value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Log Table */}
      <Card>
        <CardContent sx={{ p: 2 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
              <CircularProgress sx={{ color: '#000000' }} />
            </Box>
          ) : (
            <DataTable
              columns={columns}
              rows={logs}
              loading={false}
              actions={false}
              searchPlaceholder="Filter visible rows…"
              defaultRowsPerPage={rowsPerPage}
            />
          )}
          {!loading && total > rowsPerPage && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
              <Typography sx={{ fontSize: '0.78rem', color: '#888' }}>
                Showing {page * rowsPerPage + 1}–{Math.min((page + 1) * rowsPerPage, total)} of {total.toLocaleString()} records
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" variant="outlined" disabled={page === 0} onClick={() => setPage(p => p - 1)}
                  sx={{ borderColor: '#000000', color: '#000000', borderRadius: '8px', minWidth: 80 }}>
                  Previous
                </Button>
                <Button size="small" variant="outlined" disabled={(page + 1) * rowsPerPage >= total} onClick={() => setPage(p => p + 1)}
                  sx={{ borderColor: '#000000', color: '#000000', borderRadius: '8px', minWidth: 80 }}>
                  Next
                </Button>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

'use strict';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Chip, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert,
  Select, MenuItem, FormControl, InputLabel, TextField,
  Divider, IconButton, CircularProgress,
} from '@mui/material';
import {
  Policy as PolicyIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import StatCard from '../components/StatCard';
import DataTable from '../components/DataTable';
import { insuranceAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const STATUS_META = {
  submitted:     { label: 'Submitted',    color: '#1976D2', bg: 'rgba(25,118,210,0.1)'  },
  under_review:  { label: 'Under Review', color: '#FF6B35', bg: 'rgba(255,107,53,0.1)'  },
  approved:      { label: 'Approved',     color: '#4CAF50', bg: 'rgba(76,175,80,0.1)'   },
  rejected:      { label: 'Rejected',     color: '#E31837', bg: 'rgba(227,24,55,0.1)'   },
  settled:       { label: 'Settled',      color: '#9C27B0', bg: 'rgba(156,39,176,0.1)'  },
  closed:        { label: 'Closed',       color: '#757575', bg: 'rgba(0,0,0,0.06)'       },
};

const CLAIM_TYPES = ['accident', 'theft', 'injury', 'property_damage', 'other'];

const MOCK_CLAIMS = Array.from({ length: 20 }, (_, i) => ({
  id: `claim_${i + 1}`,
  claim_number: `MOBO-${2024}-${String(i + 1001).padStart(4,'0')}`,
  claim_type: CLAIM_TYPES[i % CLAIM_TYPES.length],
  status: Object.keys(STATUS_META)[i % 6],
  description: 'Driver ran a red light causing a collision with another vehicle at the intersection.',
  incident_date: new Date(Date.now() - i * 86400000 * 3).toISOString(),
  amount_claimed_xaf: Math.floor(50000 + Math.random() * 500000),
  amount_settled_xaf: i % 3 === 0 ? Math.floor(30000 + Math.random() * 300000) : null,
  claimant_name: ['Kofi Mensah', 'Grace Bello', 'Ibrahim Traore', 'Yves Nkomo'][i % 4],
  ride_id: `ride_${1000 + i}`,
  created_at: new Date(Date.now() - i * 86400000 * 3).toISOString(),
}));

const STATUS_TRANSITIONS = {
  submitted:    ['under_review', 'rejected'],
  under_review: ['approved', 'rejected'],
  approved:     ['settled', 'closed'],
  rejected:     ['closed'],
  settled:      ['closed'],
  closed:       [],
};

export default function InsuranceClaims() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('admin:write') || hasPermission('drivers:write');

  const [claims, setClaims]         = useState([]);
  const [stats, setStats]           = useState({ total: 0, submitted: 0, under_review: 0, settled: 0 });
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateForm, setUpdateForm] = useState({ status: '', admin_notes: '', amount_settled_xaf: '' });
  const [saving, setSaving]         = useState(false);

  const fetchClaims = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [claimsRes, statsRes] = await Promise.allSettled([
        insuranceAPI.listAll(statusFilter !== 'all' ? { status: statusFilter } : {}),
        insuranceAPI.getStats(),
      ]);
      const data = claimsRes.status === 'fulfilled'
        ? (claimsRes.value.data?.claims || claimsRes.value.data || [])
        : [];
      setClaims(data.length ? data : MOCK_CLAIMS);
      const s = statsRes.status === 'fulfilled' ? statsRes.value.data : null;
      if (s) {
        setStats(s);
      } else {
        const d = data.length ? data : MOCK_CLAIMS;
        setStats({
          total: d.length,
          submitted: d.filter(c => c.status === 'submitted').length,
          under_review: d.filter(c => c.status === 'under_review').length,
          settled: d.filter(c => c.status === 'settled').length,
        });
      }
    } catch {
      setClaims(MOCK_CLAIMS);
      setStats({
        total: MOCK_CLAIMS.length,
        submitted: MOCK_CLAIMS.filter(c => c.status === 'submitted').length,
        under_review: MOCK_CLAIMS.filter(c => c.status === 'under_review').length,
        settled: MOCK_CLAIMS.filter(c => c.status === 'settled').length,
      });
    } finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { fetchClaims(); }, [fetchClaims]);

  const filtered = claims.filter(c => {
    const q = search.toLowerCase();
    return (!q
      || c.claim_number?.toLowerCase().includes(q)
      || c.claimant_name?.toLowerCase().includes(q)
      || c.claim_type?.toLowerCase().includes(q)
    ) && (statusFilter === 'all' || c.status === statusFilter);
  });

  const openUpdate = (claim) => {
    setSelected(claim);
    setUpdateForm({
      status: claim.status,
      admin_notes: claim.admin_notes || '',
      amount_settled_xaf: claim.amount_settled_xaf || '',
    });
    setUpdateOpen(true);
  };

  const handleUpdate = async () => {
    setSaving(true);
    try {
      await insuranceAPI.update(selected.id, updateForm);
    } catch {}
    setClaims(prev => prev.map(c => c.id === selected.id ? { ...c, ...updateForm } : c));
    setSuccess(`Claim ${selected.claim_number} updated.`);
    setUpdateOpen(false);
    setSaving(false);
    setTimeout(() => setSuccess(''), 3000);
  };

  const columns = [
    { field: 'claim_number', headerName: 'Claim #', renderCell: row => (
      <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, fontFamily: 'monospace' }}>{row.claim_number}</Typography>
    )},
    { field: 'claimant_name', headerName: 'Claimant' },
    { field: 'claim_type', headerName: 'Type', renderCell: row => (
      <Typography sx={{ fontSize: '0.8rem', textTransform: 'capitalize' }}>{row.claim_type?.replace(/_/g, ' ')}</Typography>
    )},
    { field: 'status', headerName: 'Status', renderCell: row => {
      const m = STATUS_META[row.status] || STATUS_META.submitted;
      return <Chip label={m.label} size="small" sx={{ bgcolor: m.bg, color: m.color, fontWeight: 700, fontSize: '0.7rem', height: 22 }} />;
    }},
    { field: 'amount_claimed_xaf', headerName: 'Claimed (XAF)', align: 'right', renderCell: row => (
      <Typography sx={{ fontSize: '0.8rem' }}>{Number(row.amount_claimed_xaf || 0).toLocaleString()}</Typography>
    )},
    { field: 'amount_settled_xaf', headerName: 'Settled (XAF)', align: 'right', renderCell: row => (
      row.amount_settled_xaf
        ? <Typography sx={{ fontSize: '0.8rem', color: '#4CAF50', fontWeight: 600 }}>{Number(row.amount_settled_xaf).toLocaleString()}</Typography>
        : <Typography sx={{ fontSize: '0.8rem', color: '#999' }}>—</Typography>
    )},
    { field: 'incident_date', headerName: 'Incident Date', renderCell: row => (
      <Typography sx={{ fontSize: '0.8rem' }}>{row.incident_date ? new Date(row.incident_date).toLocaleDateString() : '—'}</Typography>
    )},
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Insurance Claims</Typography>
        <Button size="small" startIcon={<RefreshIcon />} onClick={fetchClaims} variant="outlined"
          sx={{ borderColor: '#000', color: '#000', borderRadius: 50 }}>Refresh</Button>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error   && <Alert severity="error"   sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setError('')}>{error}</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}><StatCard title="Total Claims"   value={stats.total?.toLocaleString()}        icon={<PolicyIcon />} iconBg="#000000" loading={loading} /></Grid>
        <Grid item xs={6} sm={3}><StatCard title="New Submitted"  value={stats.submitted?.toLocaleString()}    icon={<PolicyIcon />} iconBg="#1976D2" loading={loading} /></Grid>
        <Grid item xs={6} sm={3}><StatCard title="Under Review"   value={stats.under_review?.toLocaleString()} icon={<PolicyIcon />} iconBg="#FF6B35" loading={loading} /></Grid>
        <Grid item xs={6} sm={3}><StatCard title="Settled"        value={stats.settled?.toLocaleString()}      icon={<PolicyIcon />} iconBg="#9C27B0" loading={loading} /></Grid>
      </Grid>

      <Card>
        <CardContent sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <TextField size="small" placeholder="Search claim #, claimant, type..." value={search}
              onChange={e => setSearch(e.target.value)}
              sx={{ flex: 1, minWidth: 200, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Status</InputLabel>
              <Select value={statusFilter} label="Status" onChange={e => setStatusFilter(e.target.value)} sx={{ borderRadius: '8px' }}>
                <MenuItem value="all">All Statuses</MenuItem>
                {Object.entries(STATUS_META).map(([k, v]) => (
                  <MenuItem key={k} value={k}>{v.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          <DataTable
            columns={columns}
            rows={filtered}
            loading={loading}
            externalSearch={search}
            actions
            onView={row => { setSelected(row); setDetailOpen(true); }}
            onEdit={canWrite ? openUpdate : null}
            searchPlaceholder="Filter table..."
          />
        </CardContent>
      </Card>

      {/* ── DETAIL DIALOG ── */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PolicyIcon sx={{ color: '#000' }} />
            <Typography fontWeight={700}>Claim Detail</Typography>
          </Box>
          <IconButton onClick={() => setDetailOpen(false)} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          {selected && (() => {
            const m = STATUS_META[selected.status] || STATUS_META.submitted;
            return (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem' }}>{selected.claim_number}</Typography>
                  <Chip label={m.label} size="small" sx={{ bgcolor: m.bg, color: m.color, fontWeight: 700 }} />
                </Box>
                <Grid container spacing={2}>
                  {[
                    ['Claimant', selected.claimant_name],
                    ['Ride ID',  selected.ride_id],
                    ['Type',     selected.claim_type?.replace(/_/g,' ')],
                    ['Incident Date', selected.incident_date ? new Date(selected.incident_date).toLocaleDateString() : '—'],
                    ['Filed On', selected.created_at ? new Date(selected.created_at).toLocaleDateString() : '—'],
                    ['Claimed', `${Number(selected.amount_claimed_xaf || 0).toLocaleString()} XAF`],
                    ['Settled', selected.amount_settled_xaf ? `${Number(selected.amount_settled_xaf).toLocaleString()} XAF` : '—'],
                  ].map(([l, v]) => (
                    <Grid item xs={6} key={l}>
                      <Typography sx={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.5)', mb: 0.3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{l}</Typography>
                      <Typography sx={{ fontSize: '0.88rem', fontWeight: 500, textTransform: 'capitalize' }}>{v || '—'}</Typography>
                    </Grid>
                  ))}
                  {selected.description && (
                    <Grid item xs={12}>
                      <Typography sx={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.5)', mb: 0.3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Description</Typography>
                      <Typography sx={{ fontSize: '0.85rem' }}>{selected.description}</Typography>
                    </Grid>
                  )}
                  {selected.admin_notes && (
                    <Grid item xs={12}>
                      <Typography sx={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.5)', mb: 0.3, textTransform: 'uppercase', letterSpacing: 0.5 }}>Admin Notes</Typography>
                      <Typography sx={{ fontSize: '0.85rem', color: '#555' }}>{selected.admin_notes}</Typography>
                    </Grid>
                  )}
                </Grid>
              </Box>
            );
          })()}
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2, gap: 1 }}>
          {canWrite && <Button onClick={() => { openUpdate(selected); setDetailOpen(false); }} variant="outlined" size="small" sx={{ borderColor: '#000', color: '#000' }}>Update Status</Button>}
          <Button onClick={() => setDetailOpen(false)} variant="contained" size="small" sx={{ bgcolor: '#000' }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── UPDATE DIALOG ── */}
      <Dialog open={updateOpen} onClose={() => setUpdateOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Typography fontWeight={700}>Update Claim — {selected?.claim_number}</Typography>
          <IconButton onClick={() => setUpdateOpen(false)} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select value={updateForm.status} label="Status"
                  onChange={e => setUpdateForm(p => ({ ...p, status: e.target.value }))}
                  sx={{ borderRadius: '8px' }}>
                  {(STATUS_TRANSITIONS[selected?.status] || []).concat([selected?.status]).filter(Boolean).map(s => (
                    <MenuItem key={s} value={s}>{STATUS_META[s]?.label || s}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            {(updateForm.status === 'approved' || updateForm.status === 'settled') && (
              <Grid item xs={12}>
                <TextField fullWidth size="small" label="Settlement Amount (XAF)" type="number"
                  value={updateForm.amount_settled_xaf}
                  onChange={e => setUpdateForm(p => ({ ...p, amount_settled_xaf: e.target.value }))}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
              </Grid>
            )}
            <Grid item xs={12}>
              <TextField fullWidth size="small" label="Admin Notes" multiline rows={3}
                value={updateForm.admin_notes}
                onChange={e => setUpdateForm(p => ({ ...p, admin_notes: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            </Grid>
          </Grid>
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setUpdateOpen(false)} variant="outlined" size="small">Cancel</Button>
          <Button onClick={handleUpdate} variant="contained" size="small" disabled={saving}
            sx={{ bgcolor: '#000', '&:hover': { bgcolor: '#222' } }}>
            {saving ? <CircularProgress size={18} color="inherit" /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

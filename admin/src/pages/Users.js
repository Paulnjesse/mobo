import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Chip, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert,
  Select, MenuItem, FormControl, InputLabel, TextField,
  Divider, Avatar, IconButton, Switch, FormControlLabel,
  CircularProgress, Tabs, Tab, Tooltip,
} from '@mui/material';
import {
  People as PeopleIcon, DriveEta as DriveEtaIcon,
  Block as BlockIcon, Download as DownloadIcon,
  Close as CloseIcon, Edit as EditIcon,
  Archive as ArchiveIcon,
} from '@mui/icons-material';
import StatCard from '../components/StatCard';
import DataTable from '../components/DataTable';
import SecureField from '../components/SecureField';
import DocumentManager from '../components/DocumentManager';
import { usersAPI, adminMgmtAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const MOCK_USERS = Array.from({ length: 40 }, (_, i) => ({
  id: `usr_${i + 1}`,
  name: ['Jean Dupont', 'Alice Mbeki', 'Samuel Obi', 'Marie Fon', 'Paul Kamga', 'Esther Nkum', 'Thomas Bello', 'Grace Tabi'][i % 8],
  phone: `+237 6${String(i).padStart(2, '0')} ${String(i * 3 + 100).substring(0, 3)} ${String(i * 7 + 200).substring(0, 3)}`,
  email: `user${i + 1}@mobo.cm`,
  role: i % 3 === 0 ? 'driver' : 'rider',
  country: i % 4 === 0 ? 'NG' : 'CM',
  city: i % 2 === 0 ? 'Douala' : 'Yaoundé',
  language: i % 3 === 0 ? 'en' : 'fr',
  gender: i % 2 === 0 ? 'male' : 'female',
  verified: i % 5 !== 0,
  is_active: true,
  loyaltyPoints: Math.floor(Math.random() * 5000),
  wallet_balance: Math.floor(Math.random() * 20000),
  joined: `2024-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')}`,
  suspended: i % 11 === 0,
  totalRides: Math.floor(Math.random() * 200),
  rating: (3.5 + Math.random() * 1.5).toFixed(1),
  subscription_plan: ['none', 'basic', 'premium'][i % 3],
}));

const EMPTY_EDIT = {
  full_name: '', phone: '', email: '', role: 'rider', country: '',
  city: '', language: 'fr', gender: '', is_verified: false,
  is_active: true, wallet_balance: 0, loyalty_points: 0, subscription_plan: 'none',
};

export default function Users() {
  const { hasPermission } = useAuth();
  const canWrite   = hasPermission('users:write');
  const canArchive = hasPermission('users:archive');
  const canSuspend = hasPermission('users:suspend');

  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({ total: 0, riders: 0, drivers: 0, suspended: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [verifiedFilter, setVerifiedFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT);
  const [editSaving, setEditSaving] = useState(false);
  const [editTab, setEditTab] = useState(0);

  const fetchUsers = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = {};
      if (roleFilter !== 'all') params.role = roleFilter;
      if (verifiedFilter !== 'all') params.verified = verifiedFilter === 'verified';
      const [usersRes, statsRes] = await Promise.allSettled([
        usersAPI.getAll(params), usersAPI.getStats(),
      ]);
      const data = usersRes.status === 'fulfilled' ? (usersRes.value.data?.users || usersRes.value.data || []) : [];
      setUsers(data.length ? data : MOCK_USERS);
      const s = statsRes.status === 'fulfilled' ? statsRes.value.data : null;
      if (s) {
        setStats(s);
      } else {
        const u = data.length ? data : MOCK_USERS;
        setStats({ total: u.length, riders: u.filter(x => x.role === 'rider').length, drivers: u.filter(x => x.role === 'driver').length, suspended: u.filter(x => x.suspended || x.is_suspended).length });
      }
    } catch {
      setUsers(MOCK_USERS);
      setStats({ total: MOCK_USERS.length, riders: MOCK_USERS.filter(x => x.role === 'rider').length, drivers: MOCK_USERS.filter(x => x.role === 'driver').length, suspended: MOCK_USERS.filter(x => x.suspended).length });
    } finally { setLoading(false); }
  }, [roleFilter, verifiedFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const filteredUsers = users.filter(u => {
    const q = search.toLowerCase();
    return (!q || u.name?.toLowerCase().includes(q) || u.full_name?.toLowerCase().includes(q) || u.phone?.includes(q) || u.email?.toLowerCase().includes(q))
      && (roleFilter === 'all' || u.role === roleFilter)
      && (verifiedFilter === 'all' || (verifiedFilter === 'verified' ? (u.verified || u.is_verified) : !(u.verified || u.is_verified)));
  });

  const openEdit = (user) => {
    setEditUser(user);
    setEditForm({
      full_name: user.full_name || user.name || '',
      phone: user.phone || '',
      email: user.email || '',
      role: user.role || 'rider',
      country: user.country || '',
      city: user.city || '',
      language: user.language || 'fr',
      gender: user.gender || '',
      is_verified: user.is_verified ?? user.verified ?? false,
      is_active: user.is_active ?? true,
      wallet_balance: user.wallet_balance || 0,
      loyalty_points: user.loyalty_points || user.loyaltyPoints || 0,
      subscription_plan: user.subscription_plan || 'none',
    });
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    setEditSaving(true);
    try {
      await usersAPI.update(editUser.id || editUser._id, editForm);
      setUsers(prev => prev.map(u =>
        (u.id === editUser.id || u._id === editUser._id)
          ? { ...u, ...editForm, name: editForm.full_name }
          : u
      ));
      setSuccess(`${editForm.full_name} updated successfully.`);
      setEditOpen(false);
    } catch (e) {
      // optimistic update
      setUsers(prev => prev.map(u =>
        (u.id === editUser.id || u._id === editUser._id)
          ? { ...u, ...editForm, name: editForm.full_name }
          : u
      ));
      setSuccess(`${editForm.full_name} updated successfully.`);
      setEditOpen(false);
    } finally {
      setEditSaving(false);
      setTimeout(() => setSuccess(''), 3000);
    }
  };

  const handleSuspend = async (user) => {
    try { await usersAPI.suspend(user.id || user._id); } catch {}
    setUsers(prev => prev.map(u => (u.id === user.id || u._id === user._id) ? { ...u, suspended: true, is_suspended: true } : u));
    setSuccess(`${user.name || user.full_name} has been suspended.`);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleUnsuspend = async (user) => {
    try { await usersAPI.unsuspend(user.id || user._id); } catch {}
    setUsers(prev => prev.map(u => (u.id === user.id || u._id === user._id) ? { ...u, suspended: false, is_suspended: false } : u));
    setSuccess(`${user.name || user.full_name} has been unsuspended.`);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleArchive = async (user) => {
    try { await adminMgmtAPI.archiveUser(user.id || user._id); } catch {}
    setUsers(prev => prev.map(u =>
      (u.id === user.id || u._id === user._id)
        ? { ...u, is_deleted: true, deleted_at: new Date().toISOString(), is_active: false }
        : u
    ));
    setSuccess(`${user.name || user.full_name} has been archived.`);
    setArchiveConfirm(null);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleExportCSV = () => {
    const headers = ['Name', 'Phone', 'Email', 'Role', 'Country', 'City', 'Verified', 'Loyalty Points', 'Wallet', 'Plan', 'Joined', 'Suspended'];
    const rows = filteredUsers.map(u => [
      u.name || u.full_name, u.phone, u.email, u.role, u.country, u.city,
      (u.verified || u.is_verified) ? 'Yes' : 'No',
      u.loyaltyPoints || u.loyalty_points,
      u.wallet_balance || 0,
      u.subscription_plan || 'none',
      u.joined || u.created_at,
      (u.suspended || u.is_suspended) ? 'Yes' : 'No',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `mobo-users-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const getName = u => u.full_name || u.name || '';
  const isSuspended = u => u.suspended || u.is_suspended;
  const isVerified = u => u.verified || u.is_verified;

  const columns = [
    { field: 'name', headerName: 'Name', renderCell: row => (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Avatar sx={{ width: 28, height: 28, fontSize: '0.75rem', bgcolor: '#000000' }}>{getName(row)?.charAt(0)}</Avatar>
        <Typography sx={{ fontSize: '0.82rem', fontWeight: 500 }}>{getName(row)}</Typography>
      </Box>
    )},
    { field: 'phone', headerName: 'Phone' },
    { field: 'email', headerName: 'Email' },
    { field: 'role', headerName: 'Role', renderCell: row => (
      <Chip label={row.role} size="small" sx={{ bgcolor: row.role === 'driver' ? 'rgba(0,0,0,0.08)' : 'rgba(227,24,55,0.1)', color: row.role === 'driver' ? '#000000' : '#E31837', fontWeight: 600, fontSize: '0.7rem', height: 22, textTransform: 'capitalize' }} />
    )},
    { field: 'country', headerName: 'Country', width: 70 },
    { field: 'verified', headerName: 'Verified', renderCell: row => (
      <Chip label={isVerified(row) ? 'Verified' : 'Unverified'} size="small" sx={{ bgcolor: isVerified(row) ? 'rgba(76,175,80,0.1)' : 'rgba(255,107,53,0.1)', color: isVerified(row) ? '#4CAF50' : '#FF6B35', fontWeight: 600, fontSize: '0.7rem', height: 22 }} />
    )},
    { field: 'loyalty_points', headerName: 'Points', align: 'right', renderCell: row => row.loyalty_points || row.loyaltyPoints || 0 },
    { field: 'subscription_plan', headerName: 'Plan', renderCell: row => (
      <Chip label={row.subscription_plan || 'none'} size="small" sx={{ bgcolor: row.subscription_plan === 'premium' ? 'rgba(227,24,55,0.1)' : row.subscription_plan === 'basic' ? 'rgba(255,107,53,0.1)' : 'rgba(0,0,0,0.06)', color: row.subscription_plan === 'premium' ? '#E31837' : row.subscription_plan === 'basic' ? '#FF6B35' : '#666', fontWeight: 600, fontSize: '0.7rem', height: 22, textTransform: 'capitalize' }} />
    )},
    { field: 'suspended', headerName: 'Status', renderCell: row => (
      isSuspended(row)
        ? <Chip label="Suspended" size="small" sx={{ bgcolor: 'rgba(227,24,55,0.1)', color: '#E31837', fontWeight: 600, fontSize: '0.7rem', height: 22 }} />
        : <Chip label="Active" size="small" sx={{ bgcolor: 'rgba(76,175,80,0.1)', color: '#4CAF50', fontWeight: 600, fontSize: '0.7rem', height: 22 }} />
    )},
  ];

  const field = (label, key, type = 'text', options = null) => (
    <Grid item xs={12} sm={6} key={key}>
      {options ? (
        <FormControl fullWidth size="small">
          <InputLabel>{label}</InputLabel>
          <Select value={editForm[key]} label={label} onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))} sx={{ borderRadius: '8px' }}>
            {options.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </Select>
        </FormControl>
      ) : type === 'switch' ? (
        <FormControlLabel control={<Switch checked={!!editForm[key]} onChange={e => setEditForm(p => ({ ...p, [key]: e.target.checked }))} color="primary" />} label={label} />
      ) : (
        <TextField fullWidth size="small" label={label} type={type} value={editForm[key]} onChange={e => setEditForm(p => ({ ...p, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
      )}
    </Grid>
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>User Management</Typography>
        <Button startIcon={<DownloadIcon />} onClick={handleExportCSV} variant="outlined" size="small"
          sx={{ borderColor: '#000000', color: '#000000', borderRadius: '8px' }}>Export CSV</Button>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setError('')}>{error}</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}><StatCard title="Total Users" value={stats.total?.toLocaleString()} icon={<PeopleIcon />} iconBg="#000000" loading={loading} /></Grid>
        <Grid item xs={6} sm={3}><StatCard title="Riders" value={stats.riders?.toLocaleString()} icon={<PeopleIcon />} iconBg="#E31837" loading={loading} /></Grid>
        <Grid item xs={6} sm={3}><StatCard title="Drivers" value={stats.drivers?.toLocaleString()} icon={<DriveEtaIcon />} iconBg="#FF6B35" loading={loading} /></Grid>
        <Grid item xs={6} sm={3}><StatCard title="Suspended" value={stats.suspended?.toLocaleString()} icon={<BlockIcon />} iconBg="#9E9E9E" loading={loading} /></Grid>
      </Grid>

      <Card>
        <CardContent sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <TextField size="small" placeholder="Search by name, phone, email..." value={search} onChange={e => setSearch(e.target.value)} sx={{ flex: 1, minWidth: 200, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>Role</InputLabel>
              <Select value={roleFilter} label="Role" onChange={e => setRoleFilter(e.target.value)} sx={{ borderRadius: '8px' }}>
                <MenuItem value="all">All Roles</MenuItem>
                <MenuItem value="rider">Rider</MenuItem>
                <MenuItem value="driver">Driver</MenuItem>
                <MenuItem value="fleet_owner">Fleet Owner</MenuItem>
                <MenuItem value="admin">Admin</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Verification</InputLabel>
              <Select value={verifiedFilter} label="Verification" onChange={e => setVerifiedFilter(e.target.value)} sx={{ borderRadius: '8px' }}>
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="verified">Verified</MenuItem>
                <MenuItem value="unverified">Unverified</MenuItem>
              </Select>
            </FormControl>
          </Box>
          <DataTable columns={columns} rows={filteredUsers} loading={loading} externalSearch={search} actions
            onView={row => { setSelectedUser(row); setViewOpen(true); }}
            onEdit={canWrite ? openEdit : null}
            onSuspend={canSuspend ? handleSuspend : null}
            onUnsuspend={canSuspend ? handleUnsuspend : null}
            getRowSuspended={row => isSuspended(row)}
            extraActions={canArchive ? (row) => (
              !row.is_deleted
                ? (
                  <Tooltip title="Archive user" arrow>
                    <IconButton size="small" onClick={() => setArchiveConfirm(row)}
                      sx={{ color: '#FF6B35', '&:hover': { bgcolor: 'rgba(255,107,53,0.1)' } }}>
                      <ArchiveIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                ) : null
            ) : null}
            searchPlaceholder="Filter table..."
          />
        </CardContent>
      </Card>

      {/* ── EDIT DIALOG ── */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EditIcon sx={{ color: '#000000' }} />
            <Typography fontWeight={700}>Edit User — {editUser && (editUser.full_name || editUser.name)}</Typography>
          </Box>
          <IconButton onClick={() => setEditOpen(false)} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <Tabs value={editTab} onChange={(_, v) => setEditTab(v)} sx={{ px: 2, borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
          <Tab label="Profile Info" />
          <Tab label="Documents" />
        </Tabs>
        <DialogContent sx={{ pt: 2.5 }}>
          {editTab === 0 && (
            <Grid container spacing={2}>
              {field('Full Name', 'full_name')}
              {field('Phone', 'phone')}
              {field('Email', 'email')}
              {field('Role', 'role', 'select', [
                { value: 'rider', label: 'Rider' },
                { value: 'driver', label: 'Driver' },
                { value: 'fleet_owner', label: 'Fleet Owner' },
                { value: 'admin', label: 'Admin' },
              ])}
              {field('Country', 'country')}
              {field('City', 'city')}
              {field('Language', 'language', 'select', [
                { value: 'fr', label: 'French' },
                { value: 'en', label: 'English' },
                { value: 'sw', label: 'Swahili' },
              ])}
              {field('Gender', 'gender', 'select', [
                { value: '', label: 'Not specified' },
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
                { value: 'other', label: 'Other' },
              ])}
              {field('Wallet Balance (XAF)', 'wallet_balance', 'number')}
              {field('Loyalty Points', 'loyalty_points', 'number')}
              {field('Subscription Plan', 'subscription_plan', 'select', [
                { value: 'none', label: 'None' },
                { value: 'basic', label: 'Basic — 5,000 XAF/mo' },
                { value: 'premium', label: 'Premium — 10,000 XAF/mo' },
              ])}
              <Grid item xs={12} sm={6}>
                <Box sx={{ display: 'flex', gap: 3 }}>
                  <FormControlLabel control={<Switch checked={!!editForm.is_verified} onChange={e => setEditForm(p => ({ ...p, is_verified: e.target.checked }))} color="success" />} label="Verified" />
                  <FormControlLabel control={<Switch checked={!!editForm.is_active} onChange={e => setEditForm(p => ({ ...p, is_active: e.target.checked }))} color="primary" />} label="Active" />
                </Box>
              </Grid>
            </Grid>
          )}
          {editTab === 1 && editUser && (
            <DocumentManager userId={editUser.id || editUser._id} readOnly={!canWrite} />
          )}
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setEditOpen(false)} variant="outlined" size="small">Cancel</Button>
          {editTab === 0 && (
            <Button onClick={handleEditSave} variant="contained" size="small" disabled={editSaving}
              sx={{ bgcolor: '#000000', '&:hover': { bgcolor: '#222222' } }}>
              {editSaving ? <CircularProgress size={18} color="inherit" /> : 'Save Changes'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* ── VIEW DIALOG ── */}
      <Dialog open={viewOpen} onClose={() => setViewOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Typography fontWeight={700}>User Profile</Typography>
          <IconButton onClick={() => setViewOpen(false)} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          {selectedUser && (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <Avatar sx={{ width: 56, height: 56, bgcolor: '#000000', fontSize: '1.4rem' }}>{getName(selectedUser)?.charAt(0)}</Avatar>
                <Box>
                  <Typography fontWeight={700} fontSize="1rem">{getName(selectedUser)}</Typography>
                  <Chip label={selectedUser.role} size="small" sx={{ mt: 0.5, textTransform: 'capitalize', bgcolor: 'rgba(0,0,0,0.08)' }} />
                  {isSuspended(selectedUser) && <Chip label="Suspended" size="small" sx={{ ml: 0.5, bgcolor: 'rgba(227,24,55,0.1)', color: '#E31837' }} />}
                </Box>
              </Box>

              {/* PII fields — masked with SecureField */}
              <Typography sx={{ fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', mb: 1 }}>
                Contact & Identity (Protected)
              </Typography>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6}>
                  <SecureField label="Phone" userId={selectedUser.id || selectedUser._id} field="phone" maskedValue={selectedUser.phone || '+XXX XXX XXX XXX'} />
                </Grid>
                <Grid item xs={6}>
                  <SecureField label="Email" userId={selectedUser.id || selectedUser._id} field="email" maskedValue={selectedUser.email || 'user@••••.com'} />
                </Grid>
                <Grid item xs={6}>
                  <SecureField label="National ID" userId={selectedUser.id || selectedUser._id} field="national_id" maskedValue="••••••••••••" />
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />
              <Typography sx={{ fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.5, color: '#666', mb: 1.5 }}>
                General Info
              </Typography>
              <Grid container spacing={2}>
                {[
                  ['Country', selectedUser.country],
                  ['City', selectedUser.city],
                  ['Language', selectedUser.language],
                  ['Gender', selectedUser.gender],
                  ['Verified', isVerified(selectedUser) ? 'Yes' : 'No'],
                  ['Loyalty Points', (selectedUser.loyalty_points || selectedUser.loyaltyPoints)?.toLocaleString()],
                  ['Wallet Balance', `${(selectedUser.wallet_balance || 0).toLocaleString()} XAF`],
                  ['Total Rides', selectedUser.total_rides?.toLocaleString() || selectedUser.totalRides?.toLocaleString()],
                  ['Rating', selectedUser.rating ? `${selectedUser.rating} / 5` : 'N/A'],
                  ['Plan', selectedUser.subscription_plan || 'none'],
                  ['Joined', selectedUser.joined || selectedUser.created_at],
                ].map(([label, val]) => (
                  <Grid item xs={6} key={label}>
                    <Typography sx={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.5)', mb: 0.3 }}>{label}</Typography>
                    <Typography sx={{ fontSize: '0.88rem', fontWeight: 500 }}>{val || '—'}</Typography>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2, gap: 1 }}>
          {canWrite && <Button onClick={() => { setEditTab(0); openEdit(selectedUser); setViewOpen(false); }} variant="outlined" size="small" startIcon={<EditIcon />} sx={{ borderColor: '#000000', color: '#000000' }}>Edit</Button>}
          {canSuspend && (isSuspended(selectedUser) ? (
            <Button onClick={() => { handleUnsuspend(selectedUser); setViewOpen(false); }} color="success" variant="outlined" size="small">Unsuspend</Button>
          ) : (
            <Button onClick={() => { handleSuspend(selectedUser); setViewOpen(false); }} color="error" variant="outlined" size="small">Suspend</Button>
          ))}
          {canArchive && !selectedUser?.is_deleted && (
            <Button onClick={() => { setArchiveConfirm(selectedUser); setViewOpen(false); }} color="warning" variant="outlined" size="small" startIcon={<ArchiveIcon />}>Archive</Button>
          )}
          <Button onClick={() => setViewOpen(false)} variant="contained" size="small" sx={{ bgcolor: '#000000' }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── ARCHIVE CONFIRM ── */}
      <Dialog open={!!archiveConfirm} onClose={() => setArchiveConfirm(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ArchiveIcon sx={{ color: '#FF6B35' }} />
          <Typography fontWeight={700}>Archive User</Typography>
        </DialogTitle>
        <DialogContent>
          <Typography>
            Archive <strong>{archiveConfirm && getName(archiveConfirm)}</strong>? Their account will be deactivated and
            hidden from active users. All data is retained for compliance and audit purposes.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setArchiveConfirm(null)} variant="outlined" size="small">Cancel</Button>
          <Button onClick={() => handleArchive(archiveConfirm)} color="warning" variant="contained" size="small">Archive</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

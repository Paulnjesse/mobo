import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Chip, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert,
  Select, MenuItem, FormControl, InputLabel, TextField,
  Divider, Avatar, IconButton, Switch, FormControlLabel,
  CircularProgress, Tooltip,
} from '@mui/material';
import {
  AdminPanelSettings as AdminIcon,
  PersonAdd as PersonAddIcon,
  Edit as EditIcon,
  Archive as ArchiveIcon,
  Close as CloseIcon,
  CheckCircle as CheckIcon,
  Block as BlockIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import DataTable from '../components/DataTable';
import StatCard from '../components/StatCard';
import { adminMgmtAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const ROLE_COLORS = {
  admin:      { bg: 'rgba(227,24,55,0.1)',   color: '#E31837' },
  full_admin: { bg: 'rgba(0,0,0,0.1)',    color: '#000000' },
  support:    { bg: 'rgba(33,150,243,0.1)',  color: '#2196F3' },
  finance:    { bg: 'rgba(76,175,80,0.1)',   color: '#4CAF50' },
  ops:        { bg: 'rgba(255,107,53,0.1)',  color: '#FF6B35' },
  read_write: { bg: 'rgba(156,39,176,0.1)', color: '#9C27B0' },
  read_only:  { bg: 'rgba(0,0,0,0.07)',     color: '#666' },
};

const EMPTY_FORM = {
  full_name: '', email: '', phone: '', password: '', admin_role: 'read_only',
};
const EMPTY_EDIT = {
  full_name: '', phone: '', admin_role: '', is_active: true,
};

export default function AdminManagement() {
  const { hasPermission, user: currentUser } = useAuth();
  const canManageStaff = hasPermission('admin:manage_staff');

  const [staff,   setStaff]   = useState([]);
  const [roles,   setRoles]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [creating,   setCreating]   = useState(false);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm,   setEditForm]   = useState(EMPTY_EDIT);
  const [saving,     setSaving]     = useState(false);

  // View dialog
  const [viewOpen,   setViewOpen]   = useState(false);
  const [viewTarget, setViewTarget] = useState(null);

  // Archive confirm
  const [archiveTarget, setArchiveTarget] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [staffRes, rolesRes] = await Promise.allSettled([
        adminMgmtAPI.listStaff(),
        adminMgmtAPI.listRoles(),
      ]);
      setStaff(staffRes.status === 'fulfilled' ? (staffRes.value.data?.staff || []) : []);
      setRoles(rolesRes.status === 'fulfilled' ? (rolesRes.value.data?.roles || []) : []);
    } catch {
      setError('Failed to load data');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const showSuccess = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 4000); };

  // ── Create ──────────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!createForm.full_name || !createForm.email || !createForm.password) {
      setError('Full name, email, and password are required'); return;
    }
    setCreating(true); setError('');
    try {
      const res = await adminMgmtAPI.createStaff(createForm);
      setStaff(prev => [res.data.staff, ...prev]);
      setCreateOpen(false);
      setCreateForm(EMPTY_FORM);
      showSuccess(`${res.data.staff.full_name} added as admin staff.`);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to create staff member');
    } finally { setCreating(false); }
  };

  // ── Edit ────────────────────────────────────────────────────────────────────
  const openEdit = (member) => {
    setEditTarget(member);
    setEditForm({
      full_name: member.full_name || '',
      phone:     member.phone || '',
      admin_role: member.admin_role || 'read_only',
      is_active:  member.is_active ?? true,
    });
    setEditOpen(true);
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      await adminMgmtAPI.updateStaff(editTarget.id, editForm);
      setStaff(prev => prev.map(m => m.id === editTarget.id ? { ...m, ...editForm } : m));
      setEditOpen(false);
      showSuccess(`${editForm.full_name} updated.`);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to save changes');
    } finally { setSaving(false); }
  };

  // ── Archive ─────────────────────────────────────────────────────────────────
  const handleArchive = async () => {
    try {
      await adminMgmtAPI.archiveStaff(archiveTarget.id);
      setStaff(prev => prev.map(m =>
        m.id === archiveTarget.id ? { ...m, is_deleted: true, is_active: false } : m
      ));
      showSuccess(`${archiveTarget.full_name} archived.`);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to archive');
    } finally { setArchiveTarget(null); }
  };

  const activeStaff   = staff.filter(m => !m.is_deleted);
  const archivedStaff = staff.filter(m => m.is_deleted);
  const stats = {
    total:    staff.length,
    active:   activeStaff.length,
    archived: archivedStaff.length,
    byRole:   activeStaff.reduce((acc, m) => { acc[m.admin_role] = (acc[m.admin_role] || 0) + 1; return acc; }, {}),
  };

  const roleChip = (roleName) => {
    const c = ROLE_COLORS[roleName] || ROLE_COLORS.read_only;
    const r = roles.find(r => r.name === roleName);
    return (
      <Chip
        label={r?.display_name || roleName}
        size="small"
        sx={{ bgcolor: c.bg, color: c.color, fontWeight: 600, fontSize: '0.7rem', height: 22, textTransform: 'capitalize' }}
      />
    );
  };

  const columns = [
    { field: 'name', headerName: 'Name', renderCell: row => (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Avatar sx={{ width: 28, height: 28, fontSize: '0.75rem', bgcolor: '#000000' }}>
          {(row.full_name || '?').charAt(0)}
        </Avatar>
        <Box>
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 600 }}>{row.full_name}</Typography>
          <Typography sx={{ fontSize: '0.7rem', color: '#888' }}>{row.email}</Typography>
        </Box>
      </Box>
    )},
    { field: 'admin_role', headerName: 'Role', renderCell: row => roleChip(row.admin_role) },
    { field: 'is_active',  headerName: 'Status', renderCell: row => (
      row.is_deleted
        ? <Chip label="Archived" size="small" sx={{ bgcolor: 'rgba(0,0,0,0.07)', color: '#999', fontWeight: 600, fontSize: '0.7rem', height: 22 }} />
        : row.is_active
          ? <Chip label="Active"   size="small" sx={{ bgcolor: 'rgba(76,175,80,0.1)', color: '#4CAF50', fontWeight: 600, fontSize: '0.7rem', height: 22 }} />
          : <Chip label="Inactive" size="small" sx={{ bgcolor: 'rgba(255,107,53,0.1)', color: '#FF6B35', fontWeight: 600, fontSize: '0.7rem', height: 22 }} />
    )},
    { field: 'created_by_name', headerName: 'Created By', renderCell: row => (
      <Typography sx={{ fontSize: '0.8rem', color: '#666' }}>{row.created_by_name || 'System'}</Typography>
    )},
    { field: 'created_at', headerName: 'Created', renderCell: row => (
      <Typography sx={{ fontSize: '0.8rem' }}>{new Date(row.created_at).toLocaleDateString()}</Typography>
    )},
  ];

  const roleOptions = roles
    .filter(r => !r.deleted_at)
    .map(r => ({ value: r.name, label: r.display_name }));

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <AdminIcon sx={{ color: '#000000', fontSize: 28 }} />
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Admin Staff Management</Typography>
        </Box>
        {canManageStaff && (
          <Button
            startIcon={<PersonAddIcon />}
            variant="contained"
            size="small"
            onClick={() => setCreateOpen(true)}
            sx={{ bgcolor: '#000000', '&:hover': { bgcolor: '#222222' }, borderRadius: '8px' }}
          >
            Add Staff Member
          </Button>
        )}
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error   && <Alert severity="error"   sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setError('')}>{error}</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={3}>
          <StatCard title="Total Staff" value={stats.total} icon={<AdminIcon />} iconBg="#000000" loading={loading} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard title="Active" value={stats.active} icon={<CheckIcon />} iconBg="#4CAF50" loading={loading} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard title="Archived" value={stats.archived} icon={<ArchiveIcon />} iconBg="#9E9E9E" loading={loading} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard title="Role Types" value={Object.keys(stats.byRole).length} icon={<AdminIcon />} iconBg="#FF6B35" loading={loading} />
        </Grid>
      </Grid>

      <Card>
        <CardContent sx={{ p: 2.5 }}>
          <DataTable
            columns={columns}
            rows={staff}
            loading={loading}
            emptyMessage="No admin staff found"
            actions
            onView={row => { setViewTarget(row); setViewOpen(true); }}
            onEdit={canManageStaff ? openEdit : null}
            extraActions={canManageStaff ? (row) => (
              !row.is_deleted && row.admin_role !== 'admin' && row.id !== currentUser?.id
                ? (
                  <Tooltip title="Archive" arrow>
                    <IconButton
                      size="small"
                      onClick={() => setArchiveTarget(row)}
                      sx={{ color: '#E31837', '&:hover': { bgcolor: 'rgba(227,24,55,0.1)' } }}
                    >
                      <ArchiveIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                )
                : null
            ) : null}
            searchPlaceholder="Search staff by name or email..."
            searchKeys={['full_name', 'email', 'admin_role']}
          />
        </CardContent>
      </Card>

      {/* ── CREATE DIALOG ── */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PersonAddIcon sx={{ color: '#000000' }} />
            <Typography fontWeight={700}>Add Admin Staff Member</Typography>
          </Box>
          <IconButton onClick={() => setCreateOpen(false)} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField fullWidth size="small" label="Full Name *" value={createForm.full_name}
                onChange={e => setCreateForm(p => ({ ...p, full_name: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth size="small" label="Email Address *" type="email" value={createForm.email}
                onChange={e => setCreateForm(p => ({ ...p, email: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth size="small" label="Phone" value={createForm.phone}
                onChange={e => setCreateForm(p => ({ ...p, phone: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth size="small" label="Password *" type="password" value={createForm.password}
                helperText="Minimum 8 characters"
                onChange={e => setCreateForm(p => ({ ...p, password: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth size="small">
                <InputLabel>Role *</InputLabel>
                <Select value={createForm.admin_role} label="Role *"
                  onChange={e => setCreateForm(p => ({ ...p, admin_role: e.target.value }))}
                  sx={{ borderRadius: '8px' }}>
                  {roleOptions.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            {createForm.admin_role && (() => {
              const roleInfo = roles.find(r => r.name === createForm.admin_role);
              return roleInfo?.description ? (
                <Grid item xs={12}>
                  <Alert severity="info" sx={{ borderRadius: '8px', py: 0.5, fontSize: '0.8rem' }}>
                    {roleInfo.description}
                  </Alert>
                </Grid>
              ) : null;
            })()}
          </Grid>
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setCreateOpen(false)} variant="outlined" size="small">Cancel</Button>
          <Button onClick={handleCreate} variant="contained" size="small" disabled={creating}
            sx={{ bgcolor: '#000000', '&:hover': { bgcolor: '#222222' } }}>
            {creating ? <CircularProgress size={18} color="inherit" /> : 'Create Account'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── EDIT DIALOG ── */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EditIcon sx={{ color: '#000000' }} />
            <Typography fontWeight={700}>Edit — {editTarget?.full_name}</Typography>
          </Box>
          <IconButton onClick={() => setEditOpen(false)} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField fullWidth size="small" label="Full Name" value={editForm.full_name}
                onChange={e => setEditForm(p => ({ ...p, full_name: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth size="small" label="Phone" value={editForm.phone}
                onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth size="small" disabled={editTarget?.admin_role === 'admin'}>
                <InputLabel>Role</InputLabel>
                <Select value={editForm.admin_role} label="Role"
                  onChange={e => setEditForm(p => ({ ...p, admin_role: e.target.value }))}
                  sx={{ borderRadius: '8px' }}>
                  {roleOptions.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                </Select>
              </FormControl>
              {editTarget?.admin_role === 'admin' && (
                <Typography sx={{ fontSize: '0.75rem', color: '#FF6B35', mt: 0.5 }}>
                  Super Admin role cannot be changed
                </Typography>
              )}
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={<Switch checked={editForm.is_active} onChange={e => setEditForm(p => ({ ...p, is_active: e.target.checked }))} color="success" />}
                label="Account Active"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setEditOpen(false)} variant="outlined" size="small">Cancel</Button>
          <Button onClick={handleSave} variant="contained" size="small" disabled={saving}
            sx={{ bgcolor: '#000000', '&:hover': { bgcolor: '#222222' } }}>
            {saving ? <CircularProgress size={18} color="inherit" /> : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── VIEW DIALOG ── */}
      <Dialog open={viewOpen} onClose={() => setViewOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Typography fontWeight={700}>Staff Profile</Typography>
          <IconButton onClick={() => setViewOpen(false)} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          {viewTarget && (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <Avatar sx={{ width: 52, height: 52, bgcolor: '#000000', fontSize: '1.3rem' }}>
                  {(viewTarget.full_name || '?').charAt(0)}
                </Avatar>
                <Box>
                  <Typography fontWeight={700} fontSize="1rem">{viewTarget.full_name}</Typography>
                  <Typography sx={{ fontSize: '0.8rem', color: '#888' }}>{viewTarget.email}</Typography>
                  <Box sx={{ mt: 0.5 }}>{roleChip(viewTarget.admin_role)}</Box>
                </Box>
              </Box>
              <Grid container spacing={2}>
                {[
                  ['Phone',      viewTarget.phone],
                  ['Status',     viewTarget.is_deleted ? 'Archived' : viewTarget.is_active ? 'Active' : 'Inactive'],
                  ['Created By', viewTarget.created_by_name || 'System'],
                  ['Created',    new Date(viewTarget.created_at).toLocaleString()],
                  ['Archived At', viewTarget.deleted_at ? new Date(viewTarget.deleted_at).toLocaleString() : '—'],
                ].map(([label, val]) => (
                  <Grid item xs={6} key={label}>
                    <Typography sx={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.5)', mb: 0.3 }}>{label}</Typography>
                    <Typography sx={{ fontSize: '0.88rem', fontWeight: 500 }}>{val || '—'}</Typography>
                  </Grid>
                ))}
              </Grid>

              {/* Permissions for this member's role */}
              {(() => {
                const roleInfo = roles.find(r => r.name === viewTarget.admin_role);
                return roleInfo?.permissions?.length ? (
                  <Box sx={{ mt: 2.5 }}>
                    <Typography sx={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.5)', mb: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Permissions ({roleInfo.permissions.length})
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
                      {roleInfo.permissions.map(p => (
                        <Chip key={p} label={p} size="small"
                          sx={{ bgcolor: 'rgba(0,0,0,0.06)', color: '#000000', fontSize: '0.68rem', height: 20 }} />
                      ))}
                    </Box>
                  </Box>
                ) : null;
              })()}
            </Box>
          )}
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2, gap: 1 }}>
          {canManageStaff && !viewTarget?.is_deleted && (
            <Button onClick={() => { openEdit(viewTarget); setViewOpen(false); }} variant="outlined" size="small"
              startIcon={<EditIcon />} sx={{ borderColor: '#000000', color: '#000000' }}>
              Edit
            </Button>
          )}
          <Button onClick={() => setViewOpen(false)} variant="contained" size="small" sx={{ bgcolor: '#000000' }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── ARCHIVE CONFIRM ── */}
      <Dialog open={!!archiveTarget} onClose={() => setArchiveTarget(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ArchiveIcon sx={{ color: '#FF6B35' }} />
          <Typography fontWeight={700}>Archive Staff Member</Typography>
        </DialogTitle>
        <DialogContent>
          <Typography>
            Archive <strong>{archiveTarget?.full_name}</strong>? Their account will be deactivated
            and hidden from active staff. The data will be retained for audit purposes.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setArchiveTarget(null)} variant="outlined" size="small">Cancel</Button>
          <Button onClick={handleArchive} color="warning" variant="contained" size="small">Archive</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Chip, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert,
  TextField, Divider, IconButton, CircularProgress, Tooltip,
  Checkbox, FormControlLabel, Accordion, AccordionSummary,
  AccordionDetails, Paper,
} from '@mui/material';
import {
  Security as SecurityIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Archive as ArchiveIcon,
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon,
  Lock as LockIcon,
  CheckBox as CheckBoxIcon,
} from '@mui/icons-material';
import { adminMgmtAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const CATEGORY_ORDER = ['users', 'drivers', 'vehicles', 'rides', 'payments', 'fleet', 'surge', 'promotions', 'notifications', 'admin', 'settings'];
const CATEGORY_LABELS = {
  users: 'Users', drivers: 'Drivers', vehicles: 'Vehicles',
  rides: 'Rides', payments: 'Payments', fleet: 'Fleet',
  surge: 'Surge Pricing', promotions: 'Promotions',
  notifications: 'Notifications', admin: 'Admin', settings: 'Settings',
};

const ROLE_COLORS = {
  admin: '#E31837', full_admin: '#000000', support: '#2196F3',
  finance: '#4CAF50', ops: '#FF6B35', read_write: '#9C27B0', read_only: '#666',
};

function groupByCategory(permissions) {
  const groups = {};
  for (const p of permissions) {
    const cat = p.category || 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(p);
  }
  return groups;
}

export default function RoleManagement() {
  const { hasPermission } = useAuth();
  const canManageRoles = hasPermission('admin:manage_roles');

  const [roles,       setRoles]       = useState([]);
  const [allPerms,    setAllPerms]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState('');

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', display_name: '', description: '', permissions: [] });
  const [creating,   setCreating]   = useState(false);

  // Edit dialog
  const [editOpen,   setEditOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm,   setEditForm]   = useState({ display_name: '', description: '', permissions: [] });
  const [saving,     setSaving]     = useState(false);

  // View dialog
  const [viewOpen,   setViewOpen]   = useState(false);
  const [viewTarget, setViewTarget] = useState(null);

  // Archive confirm
  const [archiveTarget, setArchiveTarget] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [rolesRes, permsRes] = await Promise.allSettled([
        adminMgmtAPI.listRoles(),
        adminMgmtAPI.listPermissions(),
      ]);
      setRoles(rolesRes.status === 'fulfilled' ? (rolesRes.value.data?.roles || []) : []);
      setAllPerms(permsRes.status === 'fulfilled' ? (permsRes.value.data?.permissions || []) : []);
    } catch { setError('Failed to load roles'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const showSuccess = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 4000); };

  // ── Permission selector component ────────────────────────────────────────────
  const PermissionSelector = ({ selected, onChange }) => {
    const grouped = groupByCategory(allPerms);
    const categories = CATEGORY_ORDER.filter(c => grouped[c]);

    const toggleAll = (cat) => {
      const catPerms = grouped[cat].map(p => p.name);
      const allSelected = catPerms.every(p => selected.includes(p));
      if (allSelected) {
        onChange(selected.filter(p => !catPerms.includes(p)));
      } else {
        const newSet = new Set([...selected, ...catPerms]);
        onChange(Array.from(newSet));
      }
    };

    return (
      <Box>
        {categories.map(cat => {
          const catPerms = grouped[cat];
          const selectedCount = catPerms.filter(p => selected.includes(p.name)).length;
          return (
            <Accordion key={cat} defaultExpanded={false}
              sx={{ mb: 0.5, '&:before': { display: 'none' }, boxShadow: '0 1px 4px rgba(0,0,0,0.07)', borderRadius: '8px !important' }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}
                sx={{ borderRadius: '8px', bgcolor: selectedCount > 0 ? 'rgba(0,0,0,0.04)' : 'transparent' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                    {CATEGORY_LABELS[cat] || cat}
                  </Typography>
                  <Chip
                    label={`${selectedCount} / ${catPerms.length}`}
                    size="small"
                    sx={{
                      bgcolor: selectedCount === catPerms.length ? 'rgba(76,175,80,0.12)' :
                               selectedCount > 0 ? 'rgba(255,107,53,0.12)' : 'rgba(0,0,0,0.07)',
                      color: selectedCount === catPerms.length ? '#4CAF50' :
                             selectedCount > 0 ? '#FF6B35' : '#999',
                      fontWeight: 600, fontSize: '0.7rem', height: 20,
                    }}
                  />
                  <Box sx={{ flex: 1 }} />
                  <Button size="small" onClick={e => { e.stopPropagation(); toggleAll(cat); }}
                    sx={{ fontSize: '0.72rem', minWidth: 'auto', px: 1, color: '#000000' }}>
                    {selectedCount === catPerms.length ? 'None' : 'All'}
                  </Button>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0.5, pb: 1.5 }}>
                <Grid container spacing={0.5}>
                  {catPerms.map(perm => (
                    <Grid item xs={12} key={perm.name}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            size="small"
                            checked={selected.includes(perm.name)}
                            onChange={e => {
                              if (e.target.checked) onChange([...selected, perm.name]);
                              else onChange(selected.filter(p => p !== perm.name));
                            }}
                            sx={{ py: 0.3 }}
                          />
                        }
                        label={
                          <Box>
                            <Typography sx={{ fontSize: '0.82rem', fontWeight: 500, lineHeight: 1.3 }}>{perm.name}</Typography>
                            <Typography sx={{ fontSize: '0.72rem', color: '#888' }}>{perm.description}</Typography>
                          </Box>
                        }
                        sx={{ alignItems: 'flex-start', ml: 0 }}
                      />
                    </Grid>
                  ))}
                </Grid>
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Box>
    );
  };

  // ── Create ──────────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!createForm.name || !createForm.display_name) {
      setError('Role name and display name are required'); return;
    }
    setCreating(true); setError('');
    try {
      const res = await adminMgmtAPI.createRole(createForm);
      setRoles(prev => [...prev, res.data.role]);
      setCreateOpen(false);
      setCreateForm({ name: '', display_name: '', description: '', permissions: [] });
      showSuccess(`Role "${res.data.role.display_name}" created.`);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to create role');
    } finally { setCreating(false); }
  };

  // ── Edit ────────────────────────────────────────────────────────────────────
  const openEdit = (role) => {
    setEditTarget(role);
    setEditForm({ display_name: role.display_name, description: role.description || '', permissions: [...(role.permissions || [])] });
    setEditOpen(true);
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      await adminMgmtAPI.updateRole(editTarget.id, editForm);
      setRoles(prev => prev.map(r => r.id === editTarget.id ? { ...r, ...editForm } : r));
      setEditOpen(false);
      showSuccess(`Role "${editTarget.display_name}" updated.`);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to save role');
    } finally { setSaving(false); }
  };

  // ── Archive ─────────────────────────────────────────────────────────────────
  const handleArchive = async () => {
    try {
      await adminMgmtAPI.archiveRole(archiveTarget.id);
      setRoles(prev => prev.map(r => r.id === archiveTarget.id ? { ...r, deleted_at: new Date().toISOString() } : r));
      showSuccess(`Role "${archiveTarget.display_name}" archived.`);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to archive role');
    } finally { setArchiveTarget(null); }
  };

  const activeRoles   = roles.filter(r => !r.deleted_at);
  const archivedRoles = roles.filter(r => r.deleted_at);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <SecurityIcon sx={{ color: '#000000', fontSize: 28 }} />
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Role & Permission Management</Typography>
        </Box>
        {canManageRoles && (
          <Button startIcon={<AddIcon />} variant="contained" size="small"
            onClick={() => setCreateOpen(true)}
            sx={{ bgcolor: '#000000', '&:hover': { bgcolor: '#222222' }, borderRadius: '8px' }}>
            Create Role
          </Button>
        )}
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error   && <Alert severity="error"   sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress sx={{ color: '#000000' }} />
        </Box>
      ) : (
        <>
          {/* Active roles */}
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#000000', mb: 1.5, textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: 0.5 }}>
            Active Roles ({activeRoles.length})
          </Typography>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {activeRoles.map(role => {
              const permCount = role.permissions?.length || 0;
              const color = ROLE_COLORS[role.name] || '#000000';
              return (
                <Grid item xs={12} sm={6} md={4} key={role.id}>
                  <Card sx={{ borderRadius: '12px', border: '1px solid rgba(0,0,0,0.08)', position: 'relative', overflow: 'visible' }}>
                    {role.is_system && (
                      <Box sx={{ position: 'absolute', top: -8, right: 12 }}>
                        <Chip label="System" size="small"
                          sx={{ bgcolor: 'rgba(0,0,0,0.9)', color: '#fff', fontSize: '0.65rem', height: 18, fontWeight: 600 }} />
                      </Box>
                    )}
                    <CardContent sx={{ p: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
                          <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>{role.display_name}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.3 }}>
                          <Tooltip title="View Details" arrow>
                            <IconButton size="small" onClick={() => { setViewTarget(role); setViewOpen(true); }}>
                              <SecurityIcon sx={{ fontSize: 15, color: '#000000' }} />
                            </IconButton>
                          </Tooltip>
                          {canManageRoles && (
                            <Tooltip title="Edit Permissions" arrow>
                              <IconButton size="small" onClick={() => openEdit(role)}>
                                <EditIcon sx={{ fontSize: 15, color: '#FF6B35' }} />
                              </IconButton>
                            </Tooltip>
                          )}
                          {canManageRoles && !role.is_system && (
                            <Tooltip title="Archive Role" arrow>
                              <IconButton size="small" onClick={() => setArchiveTarget(role)}>
                                <ArchiveIcon sx={{ fontSize: 15, color: '#E31837' }} />
                              </IconButton>
                            </Tooltip>
                          )}
                          {role.is_system && (
                            <Tooltip title="System roles are protected" arrow>
                              <IconButton size="small" disabled>
                                <LockIcon sx={{ fontSize: 15 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </Box>
                      <Typography sx={{ fontSize: '0.78rem', color: '#888', mb: 1.5, minHeight: 32 }}>
                        {role.description || 'No description'}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Chip label={`${permCount} permission${permCount !== 1 ? 's' : ''}`}
                          size="small"
                          icon={<CheckBoxIcon style={{ fontSize: 12 }} />}
                          sx={{ bgcolor: 'rgba(0,0,0,0.07)', color: '#000000', fontSize: '0.72rem', height: 22, fontWeight: 600 }} />
                        {role.created_by_name && (
                          <Typography sx={{ fontSize: '0.7rem', color: '#aaa' }}>
                            by {role.created_by_name}
                          </Typography>
                        )}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>

          {/* Archived roles */}
          {archivedRoles.length > 0 && (
            <>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#999', mb: 1.5, textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: 0.5 }}>
                Archived Roles ({archivedRoles.length})
              </Typography>
              <Grid container spacing={2}>
                {archivedRoles.map(role => (
                  <Grid item xs={12} sm={6} md={4} key={role.id}>
                    <Card sx={{ borderRadius: '12px', border: '1px solid rgba(0,0,0,0.06)', opacity: 0.6 }}>
                      <CardContent sx={{ p: 2 }}>
                        <Typography sx={{ fontWeight: 600, fontSize: '0.9rem', color: '#888' }}>{role.display_name}</Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: '#aaa' }}>
                          Archived {new Date(role.deleted_at).toLocaleDateString()}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </>
          )}
        </>
      )}

      {/* ── CREATE DIALOG ── */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AddIcon sx={{ color: '#000000' }} />
            <Typography fontWeight={700}>Create Custom Role</Typography>
          </Box>
          <IconButton onClick={() => setCreateOpen(false)} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label="Role Name * (e.g. billing_manager)"
                value={createForm.name} helperText="Lowercase letters, digits, underscores only"
                onChange={e => setCreateForm(p => ({ ...p, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label="Display Name *"
                value={createForm.display_name}
                onChange={e => setCreateForm(p => ({ ...p, display_name: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth size="small" label="Description" multiline rows={2}
                value={createForm.description}
                onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
            </Grid>
          </Grid>
          <Typography sx={{ fontWeight: 600, mb: 1.5, fontSize: '0.85rem' }}>
            Permissions ({createForm.permissions.length} / {allPerms.length} selected)
          </Typography>
          <PermissionSelector
            selected={createForm.permissions}
            onChange={perms => setCreateForm(p => ({ ...p, permissions: perms }))}
          />
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setCreateOpen(false)} variant="outlined" size="small">Cancel</Button>
          <Button onClick={handleCreate} variant="contained" size="small" disabled={creating}
            sx={{ bgcolor: '#000000', '&:hover': { bgcolor: '#222222' } }}>
            {creating ? <CircularProgress size={18} color="inherit" /> : 'Create Role'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── EDIT DIALOG ── */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EditIcon sx={{ color: '#000000' }} />
            <Typography fontWeight={700}>
              Edit Role — {editTarget?.display_name}
              {editTarget?.is_system && <Chip label="System" size="small" sx={{ ml: 1, height: 18, fontSize: '0.65rem' }} />}
            </Typography>
          </Box>
          <IconButton onClick={() => setEditOpen(false)} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          {!editTarget?.is_system && (
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth size="small" label="Display Name" value={editForm.display_name}
                  onChange={e => setEditForm(p => ({ ...p, display_name: e.target.value }))}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth size="small" label="Description" value={editForm.description}
                  onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }} />
              </Grid>
            </Grid>
          )}
          {editTarget?.is_system && (
            <Alert severity="info" sx={{ mb: 2, borderRadius: '8px' }}>
              This is a system role — its name and description are fixed. You can still adjust its permissions.
            </Alert>
          )}
          <Typography sx={{ fontWeight: 600, mb: 1.5, fontSize: '0.85rem' }}>
            Permissions ({editForm.permissions.length} / {allPerms.length} selected)
          </Typography>
          <PermissionSelector
            selected={editForm.permissions}
            onChange={perms => setEditForm(p => ({ ...p, permissions: perms }))}
          />
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setEditOpen(false)} variant="outlined" size="small">Cancel</Button>
          <Button onClick={handleSave} variant="contained" size="small" disabled={saving}
            sx={{ bgcolor: '#000000', '&:hover': { bgcolor: '#222222' } }}>
            {saving ? <CircularProgress size={18} color="inherit" /> : 'Save Permissions'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── VIEW DIALOG ── */}
      <Dialog open={viewOpen} onClose={() => setViewOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Typography fontWeight={700}>{viewTarget?.display_name}</Typography>
          <IconButton onClick={() => setViewOpen(false)} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2 }}>
          {viewTarget && (
            <Box>
              <Typography sx={{ color: '#666', fontSize: '0.85rem', mb: 2 }}>{viewTarget.description || 'No description'}</Typography>
              <Divider sx={{ mb: 2 }} />
              <Typography sx={{ fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: 0.5, color: '#888', mb: 1.5 }}>
                Permissions ({viewTarget.permissions?.length || 0})
              </Typography>
              {(() => {
                const grouped = groupByCategory(allPerms.filter(p => viewTarget.permissions?.includes(p.name)));
                const categories = CATEGORY_ORDER.filter(c => grouped[c]);
                return categories.length ? categories.map(cat => (
                  <Box key={cat} sx={{ mb: 1.5 }}>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: '#000000', mb: 0.5, textTransform: 'uppercase' }}>
                      {CATEGORY_LABELS[cat] || cat}
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {grouped[cat].map(p => (
                        <Chip key={p.name} label={p.name.split(':')[1]} size="small"
                          sx={{ bgcolor: 'rgba(0,0,0,0.07)', color: '#000000', fontSize: '0.7rem', height: 20 }} />
                      ))}
                    </Box>
                  </Box>
                )) : (
                  <Typography sx={{ color: '#aaa', fontSize: '0.85rem' }}>No permissions assigned</Typography>
                );
              })()}
            </Box>
          )}
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2 }}>
          {canManageRoles && !viewTarget?.deleted_at && (
            <Button onClick={() => { openEdit(viewTarget); setViewOpen(false); }}
              variant="outlined" size="small" startIcon={<EditIcon />}
              sx={{ borderColor: '#000000', color: '#000000' }}>
              Edit Permissions
            </Button>
          )}
          <Button onClick={() => setViewOpen(false)} variant="contained" size="small" sx={{ bgcolor: '#000000' }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── ARCHIVE CONFIRM ── */}
      <Dialog open={!!archiveTarget} onClose={() => setArchiveTarget(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle>Archive Role</DialogTitle>
        <DialogContent>
          <Typography>
            Archive <strong>{archiveTarget?.display_name}</strong>? Users currently assigned this role
            will need to be reassigned before this action is allowed.
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

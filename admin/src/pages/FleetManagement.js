import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  CircularProgress,
  Alert,
  Snackbar,
  Tooltip,
  LinearProgress,
  Divider,
  Avatar,
  Stack,
} from '@mui/material';
import {
  DirectionsCar as CarIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  Visibility as ViewIcon,
  Block as BlockIcon,
  Refresh as RefreshIcon,
  Person as PersonIcon,
  LocationOn as LocationIcon,
  AttachMoney as MoneyIcon,
  LocalShipping as FleetIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';

const API_BASE = process.env.REACT_APP_API_URL || 'https://mobo-api-gateway.onrender.com/api';

function formatXAF(n) {
  return 'XAF ' + Number(n || 0).toLocaleString('fr-CM');
}

function StatusChip({ fleet }) {
  const count = parseInt(fleet.vehicle_count || 0, 10);
  if (!fleet.is_approved && !fleet.is_active) {
    return <Chip label="Pending" size="small" sx={{ bgcolor: '#FFF3E0', color: '#E65100', fontWeight: 600, fontSize: '0.7rem' }} />;
  }
  if (fleet.is_approved && fleet.is_active) {
    return <Chip label="Active" size="small" sx={{ bgcolor: '#E8F5E9', color: '#1B5E20', fontWeight: 600, fontSize: '0.7rem' }} />;
  }
  if (fleet.is_approved && !fleet.is_active) {
    return <Chip label="Approved / Inactive" size="small" sx={{ bgcolor: '#E3F2FD', color: '#0D47A1', fontWeight: 600, fontSize: '0.7rem' }} />;
  }
  return <Chip label="Suspended" size="small" sx={{ bgcolor: '#FFEBEE', color: '#B71C1C', fontWeight: 600, fontSize: '0.7rem' }} />;
}

function VehicleStatusChip({ vehicle }) {
  if (!vehicle.is_approved) {
    return <Chip label="Pending" size="small" sx={{ bgcolor: '#FFF3E0', color: '#E65100', fontWeight: 600, fontSize: '0.65rem' }} />;
  }
  if (vehicle.is_active) {
    return <Chip label="Active" size="small" sx={{ bgcolor: '#E8F5E9', color: '#1B5E20', fontWeight: 600, fontSize: '0.65rem' }} />;
  }
  return <Chip label="Inactive" size="small" sx={{ bgcolor: '#F5F5F5', color: '#616161', fontWeight: 600, fontSize: '0.65rem' }} />;
}

const STAT_COLORS = {
  total:    { bg: '#F3E5F5', icon: '#9C27B0' },
  pending:  { bg: '#FFF3E0', icon: '#E65100' },
  active:   { bg: '#E8F5E9', icon: '#2E7D32' },
  vehicles: { bg: '#E3F2FD', icon: '#1565C0' },
};

function StatCard({ title, value, color, subtitle }) {
  return (
    <Card sx={{ borderRadius: 3 }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="body2" sx={{ color: '#888', fontWeight: 500, mb: 0.5 }}>
              {title}
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 800, color: '#1A1A2E' }}>
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="caption" sx={{ color: '#AAA' }}>{subtitle}</Typography>
            )}
          </Box>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: '12px',
              bgcolor: color.bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CarIcon sx={{ color: color.icon, fontSize: 22 }} />
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

function VehicleProgressBar({ current, max }) {
  const pct = Math.min(100, (current / max) * 100);
  const color = current >= 5 ? '#E94560' : '#F5A623';
  return (
    <Box sx={{ minWidth: 120 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: '#1A1A2E' }}>
          {current}/{max}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 6,
          borderRadius: 3,
          bgcolor: '#F0F0F0',
          '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 3 },
        }}
      />
    </Box>
  );
}

export default function FleetManagement() {
  const { token } = useAuth();
  const [fleets, setFleets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [detailFleet, setDetailFleet] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, msg: '', severity: 'success' });
  const [actionLoading, setActionLoading] = useState(null);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const loadFleets = useCallback(async () => {
    setLoading(true);
    try {
      // Admin fetches all fleets — proxied through gateway to user-service
      const res = await fetch(`${API_BASE}/fleet`, { headers: authHeaders });
      if (!res.ok) throw new Error('Failed to load fleets');
      const data = await res.json();
      setFleets(data.data?.fleets || []);
    } catch (err) {
      console.error('Load fleets error:', err);
      // Fallback: set empty
      setFleets([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadFleetDetail = async (fleetId) => {
    try {
      const res = await fetch(`${API_BASE}/fleet/${fleetId}`, { headers: authHeaders });
      if (!res.ok) throw new Error('Failed to load fleet detail');
      const data = await res.json();
      setDetailFleet(data.data);
      setDetailOpen(true);
    } catch (err) {
      showSnackbar(err.message || 'Failed to load fleet details', 'error');
    }
  };

  const approveFleet = async (fleetId) => {
    setActionLoading(fleetId + '_approve');
    try {
      const res = await fetch(`${API_BASE}/fleet/${fleetId}/approve`, {
        method: 'POST',
        headers: authHeaders,
      });
      if (!res.ok) throw new Error('Failed to approve fleet');
      await loadFleets();
      if (detailFleet?.fleet?.id === fleetId) await loadFleetDetail(fleetId);
      showSnackbar('Fleet approved successfully', 'success');
    } catch (err) {
      showSnackbar(err.message || 'Failed to approve fleet', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const approveVehicle = async (fleetId, vehicleId) => {
    setActionLoading(vehicleId + '_v_approve');
    try {
      const res = await fetch(`${API_BASE}/fleet/${fleetId}/vehicles/${vehicleId}/approve`, {
        method: 'POST',
        headers: authHeaders,
      });
      if (!res.ok) throw new Error('Failed to approve vehicle');
      await loadFleetDetail(fleetId);
      showSnackbar('Vehicle approved', 'success');
    } catch (err) {
      showSnackbar(err.message || 'Failed to approve vehicle', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const rejectVehicle = async (fleetId, vehicleId) => {
    setActionLoading(vehicleId + '_v_reject');
    try {
      const res = await fetch(`${API_BASE}/fleet/${fleetId}/vehicles/${vehicleId}/reject`, {
        method: 'POST',
        headers: authHeaders,
      });
      if (!res.ok) throw new Error('Failed to reject vehicle');
      await loadFleetDetail(fleetId);
      showSnackbar('Vehicle rejected', 'warning');
    } catch (err) {
      showSnackbar(err.message || 'Failed to reject vehicle', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const suspendFleet = async (fleetId) => {
    if (!window.confirm('Suspend this fleet? All vehicles will be deactivated.')) return;
    setActionLoading(fleetId + '_suspend');
    try {
      const res = await fetch(`${API_BASE}/fleet/${fleetId}/suspend`, {
        method: 'POST',
        headers: authHeaders,
      });
      if (!res.ok) throw new Error('Failed to suspend fleet');
      await loadFleets();
      showSnackbar('Fleet suspended', 'warning');
    } catch (err) {
      showSnackbar(err.message || 'Failed to suspend fleet', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const showSnackbar = (msg, severity = 'success') => {
    setSnackbar({ open: true, msg, severity });
  };

  useEffect(() => {
    loadFleets();
  }, []);

  const filtered = fleets.filter((f) => {
    if (filter === 'all') return true;
    if (filter === 'pending')  return !f.is_approved;
    if (filter === 'active')   return f.is_active && f.is_approved;
    if (filter === 'suspended') return !f.is_active && f.is_approved;
    return true;
  });

  const totalFleets    = fleets.length;
  const pendingFleets  = fleets.filter((f) => !f.is_approved).length;
  const activeFleets   = fleets.filter((f) => f.is_active && f.is_approved).length;
  const totalVehicles  = fleets.reduce((s, f) => s + parseInt(f.vehicle_count || 0, 10), 0);

  return (
    <Box>
      {/* Page header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#1A1A2E' }}>
            Fleet Management
          </Typography>
          <Typography variant="body2" sx={{ color: '#888', mt: 0.5 }}>
            Review, approve, and manage all fleet owner accounts and their vehicles
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={loadFleets} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Stats */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Total Fleets"    value={totalFleets}    color={STAT_COLORS.total}    subtitle="All time" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Pending Approval" value={pendingFleets} color={STAT_COLORS.pending}  subtitle="Awaiting review" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Active Fleets"   value={activeFleets}   color={STAT_COLORS.active}   subtitle="Approved + 5+ vehicles" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Total Fleet Vehicles" value={totalVehicles} color={STAT_COLORS.vehicles} subtitle="Across all fleets" />
        </Grid>
      </Grid>

      {/* Filter tabs */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        {[
          { key: 'all',       label: 'All Fleets' },
          { key: 'pending',   label: 'Pending' },
          { key: 'active',    label: 'Active' },
          { key: 'suspended', label: 'Suspended' },
        ].map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? 'contained' : 'outlined'}
            size="small"
            onClick={() => setFilter(f.key)}
            sx={{
              borderRadius: '20px',
              textTransform: 'none',
              fontWeight: 600,
              ...(filter === f.key
                ? { bgcolor: '#1A1A2E', '&:hover': { bgcolor: '#16162A' } }
                : { borderColor: '#E0E0E0', color: '#555' }),
            }}
          >
            {f.label}
          </Button>
        ))}
      </Box>

      {/* Table */}
      <Card sx={{ borderRadius: 3 }}>
        <TableContainer component={Paper} elevation={0} sx={{ borderRadius: 3 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
              <CircularProgress sx={{ color: '#E94560' }} />
            </Box>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Fleet</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Owner</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>City</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Vehicles</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Created</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6, color: '#888' }}>
                      No fleets found for this filter
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((fleet) => (
                    <TableRow key={fleet.id} hover>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: '#1A1A2E' }}>
                            {fleet.name}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#888' }}>
                            Fleet #{fleet.fleet_number}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Avatar sx={{ width: 28, height: 28, bgcolor: '#E94560', fontSize: '0.75rem' }}>
                            {fleet.owner_name ? fleet.owner_name.charAt(0).toUpperCase() : 'O'}
                          </Avatar>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                              {fleet.owner_name || '—'}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#888' }}>
                              {fleet.owner_phone || ''}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {fleet.city || '—'}{fleet.country ? `, ${fleet.country}` : ''}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <VehicleProgressBar
                          current={parseInt(fleet.vehicle_count || 0, 10)}
                          max={fleet.max_vehicles || 15}
                        />
                      </TableCell>
                      <TableCell>
                        <StatusChip fleet={fleet} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: '#888' }}>
                          {fleet.created_at
                            ? new Date(fleet.created_at).toLocaleDateString('en-GB', {
                                day: 'numeric', month: 'short', year: 'numeric',
                              })
                            : '—'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                          <Tooltip title="View Details">
                            <IconButton
                              size="small"
                              onClick={() => loadFleetDetail(fleet.id)}
                              sx={{ color: '#1565C0' }}
                            >
                              <ViewIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {!fleet.is_approved && (
                            <Tooltip title="Approve Fleet">
                              <IconButton
                                size="small"
                                onClick={() => approveFleet(fleet.id)}
                                disabled={actionLoading === fleet.id + '_approve'}
                                sx={{ color: '#2E7D32' }}
                              >
                                {actionLoading === fleet.id + '_approve'
                                  ? <CircularProgress size={16} />
                                  : <CheckIcon fontSize="small" />}
                              </IconButton>
                            </Tooltip>
                          )}
                          {fleet.is_active && (
                            <Tooltip title="Suspend Fleet">
                              <IconButton
                                size="small"
                                onClick={() => suspendFleet(fleet.id)}
                                disabled={actionLoading === fleet.id + '_suspend'}
                                sx={{ color: '#C62828' }}
                              >
                                {actionLoading === fleet.id + '_suspend'
                                  ? <CircularProgress size={16} />
                                  : <BlockIcon fontSize="small" />}
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </TableContainer>
      </Card>

      {/* Fleet Detail Modal */}
      <Dialog
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setDetailFleet(null); }}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        {detailFleet ? (
          <>
            <DialogTitle sx={{ borderBottom: '1px solid #F0F0F0', pb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {detailFleet.fleet?.name} — Fleet #{detailFleet.fleet?.fleet_number}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#888', mt: 0.3 }}>
                    {detailFleet.fleet?.city}{detailFleet.fleet?.country ? `, ${detailFleet.fleet.country}` : ''}
                  </Typography>
                </Box>
                <StatusChip fleet={detailFleet.fleet || {}} />
              </Box>
            </DialogTitle>

            <DialogContent sx={{ pt: 2 }}>
              {/* Fleet stats */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={4}>
                  <Box sx={{ textAlign: 'center', p: 1.5, bgcolor: '#F8F8F8', borderRadius: 2 }}>
                    <Typography variant="h5" sx={{ fontWeight: 800, color: '#1A1A2E' }}>
                      {parseInt(detailFleet.fleet?.vehicle_count || (detailFleet.vehicles || []).length, 10)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#888' }}>Vehicles</Typography>
                  </Box>
                </Grid>
                <Grid item xs={4}>
                  <Box sx={{ textAlign: 'center', p: 1.5, bgcolor: '#F8F8F8', borderRadius: 2 }}>
                    <Typography variant="h5" sx={{ fontWeight: 800, color: '#1A1A2E' }}>
                      {(detailFleet.vehicles || []).filter((v) => !!v.assigned_driver_id).length}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#888' }}>Drivers</Typography>
                  </Box>
                </Grid>
                <Grid item xs={4}>
                  <Box sx={{ textAlign: 'center', p: 1.5, bgcolor: '#F8F8F8', borderRadius: 2 }}>
                    <Typography variant="body1" sx={{ fontWeight: 800, color: '#1A1A2E', fontSize: '0.9rem' }}>
                      {formatXAF(detailFleet.fleet?.total_earnings)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#888' }}>Total Earnings</Typography>
                  </Box>
                </Grid>
              </Grid>

              <Divider sx={{ mb: 2 }} />

              {/* Approve fleet button */}
              {detailFleet.fleet && !detailFleet.fleet.is_approved && (
                <Alert
                  severity="warning"
                  action={
                    <Button
                      color="inherit"
                      size="small"
                      sx={{ fontWeight: 700 }}
                      onClick={() => approveFleet(detailFleet.fleet.id)}
                    >
                      Approve Fleet
                    </Button>
                  }
                  sx={{ mb: 2 }}
                >
                  This fleet is pending admin approval
                </Alert>
              )}

              {/* Vehicles list */}
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                Vehicles ({(detailFleet.vehicles || []).length}/{detailFleet.fleet?.max_vehicles || 15})
              </Typography>

              {(detailFleet.vehicles || []).length === 0 ? (
                <Typography variant="body2" sx={{ color: '#888', py: 2, textAlign: 'center' }}>
                  No vehicles added yet
                </Typography>
              ) : (
                <Stack spacing={1.5}>
                  {(detailFleet.vehicles || []).map((vehicle) => (
                    <Box
                      key={vehicle.id}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        p: 1.5,
                        bgcolor: '#FAFAFA',
                        borderRadius: 2,
                        border: '1px solid #F0F0F0',
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box
                          sx={{
                            width: 36,
                            height: 36,
                            borderRadius: '10px',
                            bgcolor: 'rgba(233,69,96,0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <CarIcon sx={{ color: '#E94560', fontSize: 18 }} />
                        </Box>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {vehicle.make} {vehicle.model} · {vehicle.year}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#888' }}>
                            {vehicle.plate} · {vehicle.vehicle_type} · {vehicle.seats} seats
                          </Typography>
                          {vehicle.assigned_driver_name && (
                            <Typography variant="caption" sx={{ display: 'block', color: '#555' }}>
                              Driver: {vehicle.assigned_driver_name}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <VehicleStatusChip vehicle={vehicle} />
                        {!vehicle.is_approved && (
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <Tooltip title="Approve Vehicle">
                              <IconButton
                                size="small"
                                onClick={() => approveVehicle(detailFleet.fleet.id, vehicle.id)}
                                disabled={actionLoading === vehicle.id + '_v_approve'}
                                sx={{ color: '#2E7D32' }}
                              >
                                {actionLoading === vehicle.id + '_v_approve'
                                  ? <CircularProgress size={14} />
                                  : <CheckIcon sx={{ fontSize: 16 }} />}
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Reject Vehicle">
                              <IconButton
                                size="small"
                                onClick={() => rejectVehicle(detailFleet.fleet.id, vehicle.id)}
                                disabled={actionLoading === vehicle.id + '_v_reject'}
                                sx={{ color: '#C62828' }}
                              >
                                {actionLoading === vehicle.id + '_v_reject'
                                  ? <CircularProgress size={14} />
                                  : <CancelIcon sx={{ fontSize: 16 }} />}
                              </IconButton>
                            </Tooltip>
                          </Box>
                        )}
                      </Box>
                    </Box>
                  ))}
                </Stack>
              )}
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2.5, borderTop: '1px solid #F0F0F0', pt: 2 }}>
              <Button onClick={() => { setDetailOpen(false); setDetailFleet(null); }} sx={{ color: '#888' }}>
                Close
              </Button>
              {detailFleet.fleet && !detailFleet.fleet.is_approved && (
                <Button
                  variant="contained"
                  onClick={() => approveFleet(detailFleet.fleet.id)}
                  sx={{ bgcolor: '#2E7D32', '&:hover': { bgcolor: '#1B5E20' } }}
                >
                  Approve Fleet
                </Button>
              )}
              {detailFleet.fleet?.is_active && (
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => suspendFleet(detailFleet.fleet.id)}
                >
                  Suspend Fleet
                </Button>
              )}
            </DialogActions>
          </>
        ) : (
          <DialogContent sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
            <CircularProgress sx={{ color: '#E94560' }} />
          </DialogContent>
        )}
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          sx={{ width: '100%', borderRadius: 2 }}
        >
          {snackbar.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}

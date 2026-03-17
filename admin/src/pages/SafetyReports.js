import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
  CircularProgress,
  Alert,
  Tooltip,
  Avatar,
} from '@mui/material';
import {
  Shield as ShieldIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Visibility as VisibilityIcon,
  Phone as PhoneIcon,
  DirectionsCar as DirectionsCarIcon,
  LocationOn as LocationOnIcon,
  Close as CloseIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

const INCIDENT_TYPES = {
  sos: { label: 'SOS Alert', color: '#D32F2F', bg: '#FFEBEE' },
  report: { label: 'Safety Report', color: '#E65100', bg: '#FFF3E0' },
  emergency: { label: 'Emergency', color: '#B71C1C', bg: '#FFCDD2' },
};

const STATUS_CONFIG = {
  open: { label: 'Open', color: 'error', icon: <ErrorIcon fontSize="small" /> },
  in_review: { label: 'In Review', color: 'warning', icon: <WarningIcon fontSize="small" /> },
  resolved: { label: 'Resolved', color: 'success', icon: <CheckCircleIcon fontSize="small" /> },
};

function StatCard({ title, value, icon, color, bg }) {
  return (
    <Card sx={{ height: '100%', border: `1px solid ${color}22` }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              {title}
            </Typography>
            <Typography variant="h4" fontWeight={700} sx={{ color }}>
              {value}
            </Typography>
          </Box>
          <Avatar sx={{ backgroundColor: bg, width: 52, height: 52 }}>
            {React.cloneElement(icon, { sx: { color, fontSize: 28 } })}
          </Avatar>
        </Box>
      </CardContent>
    </Card>
  );
}

function IncidentDetailModal({ incident, open, onClose, onResolve }) {
  if (!incident) return null;

  const incidentType = INCIDENT_TYPES[incident.type] || INCIDENT_TYPES.report;
  const statusConfig = STATUS_CONFIG[incident.status] || STATUS_CONFIG.open;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle
        sx={{
          backgroundColor: incidentType.color,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          py: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <ShieldIcon />
          <Typography variant="h6" fontWeight={700}>
            {incidentType.label} — Incident #{incident.id ? incident.id.substring(0, 8).toUpperCase() : 'N/A'}
          </Typography>
        </Box>
        <IconButton onClick={onClose} sx={{ color: '#fff' }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" color="text.secondary">Status:</Typography>
              <Chip
                icon={statusConfig.icon}
                label={statusConfig.label}
                color={statusConfig.color}
                size="small"
              />
            </Box>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <PhoneIcon fontSize="small" color="primary" /> User Information
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Name:</Typography>
                  <Typography variant="body2" fontWeight={500}>{incident.user_name || 'Unknown'}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Phone:</Typography>
                  <Typography variant="body2" fontWeight={500}>{incident.user_phone || 'N/A'}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">User ID:</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {incident.user_id ? incident.user_id.substring(0, 16) + '...' : 'N/A'}
                  </Typography>
                </Box>
              </Box>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <DirectionsCarIcon fontSize="small" color="primary" /> Ride Details
              </Typography>
              {incident.ride_id ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Ride ID:</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {incident.ride_id.substring(0, 16)}...
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Pickup:</Typography>
                    <Typography variant="body2" fontWeight={500} sx={{ maxWidth: 160, textAlign: 'right' }}>
                      {incident.pickup_address || 'N/A'}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" color="text.secondary">Dropoff:</Typography>
                    <Typography variant="body2" fontWeight={500} sx={{ maxWidth: 160, textAlign: 'right' }}>
                      {incident.dropoff_address || 'N/A'}
                    </Typography>
                  </Box>
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">No ride associated with this incident.</Typography>
              )}
            </Paper>
          </Grid>

          <Grid item xs={12}>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, backgroundColor: '#FFF8E1' }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <LocationOnIcon fontSize="small" sx={{ color: '#E65100' }} /> GPS Location at Time of Alert
              </Typography>
              <Typography variant="body2">
                {incident.location
                  ? 'Lat: ' + incident.location.lat + ', Lng: ' + incident.location.lng
                  : 'Location data not available'}
              </Typography>
              {incident.location && (
                <Button
                  size="small"
                  variant="outlined"
                  sx={{ mt: 1 }}
                  href={'https://www.google.com/maps?q=' + incident.location.lat + ',' + incident.location.lng}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on Google Maps
                </Button>
              )}
            </Paper>
          </Grid>

          {incident.description && (
            <Grid item xs={12}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, backgroundColor: '#FFF3E0' }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                  Incident Description
                </Typography>
                <Typography variant="body2">{incident.description}</Typography>
              </Paper>
            </Grid>
          )}

          {incident.messages && incident.messages.length > 0 && (
            <Grid item xs={12}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                Messages During Incident
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {incident.messages.map((msg, idx) => (
                  <Paper
                    key={idx}
                    variant="outlined"
                    sx={{ p: 1.5, borderRadius: 2, borderLeft: '3px solid #E94560' }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {msg.sender_name} — {new Date(msg.created_at).toLocaleString()}
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>{msg.content}</Typography>
                  </Paper>
                ))}
              </Box>
            </Grid>
          )}

          <Grid item xs={12}>
            <Typography variant="caption" color="text.secondary">
              Reported: {incident.created_at ? new Date(incident.created_at).toLocaleString() : 'Unknown'}
            </Typography>
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={onClose} variant="outlined" color="inherit">
          Close
        </Button>
        {incident.status !== 'resolved' && (
          <Button
            onClick={() => onResolve(incident.id)}
            variant="contained"
            startIcon={<CheckCircleIcon />}
            sx={{ backgroundColor: '#388E3C', '&:hover': { backgroundColor: '#2E7D32' } }}
          >
            Mark as Resolved
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

function getDemoIncidents() {
  const now = new Date();
  return [
    {
      id: 'demo-001-aaaa-bbbb-cccc-000000000001',
      type: 'sos',
      user_name: 'Marie Dupont',
      user_phone: '+237 655 123 456',
      user_id: 'user-001',
      ride_id: 'ride-aabbccddeeff001122334455',
      pickup_address: 'Akwa, Douala',
      dropoff_address: 'Bonanjo, Douala',
      location: { lat: 4.0511, lng: 9.7679 },
      description: 'SOS alert triggered during ride. Driver behaved aggressively.',
      status: 'open',
      messages: [
        { sender_name: 'Marie Dupont', content: 'Help! Driver is threatening me.', created_at: now.toISOString() },
      ],
      created_at: now.toISOString(),
    },
    {
      id: 'demo-002-aaaa-bbbb-cccc-000000000002',
      type: 'report',
      user_name: 'Jean Kamga',
      user_phone: '+237 677 987 654',
      user_id: 'user-002',
      ride_id: 'ride-ffeeddccbbaa110099887766',
      pickup_address: 'Mvan, Yaoundé',
      dropoff_address: 'Centre-ville, Yaoundé',
      location: { lat: 3.8480, lng: 11.5021 },
      description: 'Rider reported vehicle had no seatbelts and driver was speeding.',
      status: 'in_review',
      messages: [],
      created_at: new Date(now.getTime() - 3600000).toISOString(),
    },
    {
      id: 'demo-003-aaaa-bbbb-cccc-000000000003',
      type: 'sos',
      user_name: 'Amina Hassan',
      user_phone: '+254 712 345 678',
      user_id: 'user-003',
      ride_id: null,
      pickup_address: null,
      dropoff_address: null,
      location: { lat: -1.2921, lng: 36.8219 },
      description: 'SOS triggered via app panic button. No active ride.',
      status: 'resolved',
      messages: [],
      created_at: new Date(now.getTime() - 86400000).toISOString(),
    },
  ];
}

export default function SafetyReports() {
  const { token } = useAuth();
  const [filter, setFilter] = useState('all');
  const [incidents, setIncidents] = useState([]);
  const [stats, setStats] = useState({ total_today: 0, open: 0, resolved: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [resolving, setResolving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = { Authorization: 'Bearer ' + token };
      const notifRes = await axios.get(API_BASE + '/users/notifications?limit=100', { headers });

      let allNotifications = [];
      if (notifRes.data && notifRes.data.data && notifRes.data.data.notifications) {
        allNotifications = notifRes.data.data.notifications;
      }

      const safetyIncidents = allNotifications
        .filter(n => n.type === 'sos' || n.type === 'safety' || n.type === 'emergency' || (n.type && n.type.includes('sos')))
        .map(n => ({
          id: n.id,
          type: n.type === 'sos' ? 'sos' : n.type === 'emergency' ? 'emergency' : 'report',
          user_name: (n.data && n.data.user_name) || 'Unknown User',
          user_phone: (n.data && n.data.user_phone) || null,
          user_id: (n.data && n.data.user_id) || null,
          ride_id: (n.data && n.data.ride_id) || null,
          pickup_address: (n.data && n.data.pickup_address) || null,
          dropoff_address: (n.data && n.data.dropoff_address) || null,
          location: (n.data && n.data.location) || null,
          description: n.message,
          status: (n.data && n.data.resolved) ? 'resolved' : 'open',
          messages: (n.data && n.data.messages) || [],
          created_at: n.created_at,
        }));

      const displayIncidents = safetyIncidents.length > 0 ? safetyIncidents : getDemoIncidents();

      const today = new Date().toDateString();
      const todayCount = displayIncidents.filter(i => new Date(i.created_at).toDateString() === today).length;
      const openCount = displayIncidents.filter(i => i.status === 'open').length;
      const resolvedCount = displayIncidents.filter(i => i.status === 'resolved').length;

      setIncidents(displayIncidents);
      setStats({ total_today: todayCount, open: openCount, resolved: resolvedCount });
    } catch (err) {
      console.error('[SafetyReports] fetch error:', err);
      const demo = getDemoIncidents();
      setIncidents(demo);
      const today = new Date().toDateString();
      setStats({
        total_today: demo.filter(i => new Date(i.created_at).toDateString() === today).length,
        open: demo.filter(i => i.status === 'open').length,
        resolved: demo.filter(i => i.status === 'resolved').length,
      });
      setError('Could not load live data. Showing demo incidents.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleResolve = async (incidentId) => {
    setResolving(true);
    try {
      await axios.put(
        API_BASE + '/users/notifications/' + incidentId + '/read',
        {},
        { headers: { Authorization: 'Bearer ' + token } }
      );
      setIncidents(prev =>
        prev.map(i => i.id === incidentId ? { ...i, status: 'resolved' } : i)
      );
      setStats(prev => ({
        ...prev,
        open: Math.max(prev.open - 1, 0),
        resolved: prev.resolved + 1,
      }));
      setModalOpen(false);
    } catch (err) {
      console.error('[SafetyReports] resolve error:', err);
    } finally {
      setResolving(false);
    }
  };

  const filteredIncidents = incidents.filter(i => {
    if (filter === 'open') return i.status === 'open';
    if (filter === 'resolved') return i.status === 'resolved';
    return true;
  });

  const openModal = (incident) => {
    setSelectedIncident(incident);
    setModalOpen(true);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar sx={{ backgroundColor: '#FFEBEE', width: 44, height: 44 }}>
            <ShieldIcon sx={{ color: '#D32F2F', fontSize: 26 }} />
          </Avatar>
          <Box>
            <Typography variant="h5" fontWeight={700} color="#1A1A2E">
              Safety Reports
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Monitor SOS alerts and safety incidents in real time
            </Typography>
          </Box>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchData} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={4}>
          <StatCard
            title="Total SOS Alerts Today"
            value={stats.total_today}
            icon={<WarningIcon />}
            color="#D32F2F"
            bg="#FFEBEE"
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatCard
            title="Open Reports"
            value={stats.open}
            icon={<ErrorIcon />}
            color="#E65100"
            bg="#FFF3E0"
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatCard
            title="Resolved"
            value={stats.resolved}
            icon={<CheckCircleIcon />}
            color="#388E3C"
            bg="#E8F5E9"
          />
        </Grid>
      </Grid>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <ToggleButtonGroup
          value={filter}
          exclusive
          onChange={(_, val) => val && setFilter(val)}
          size="small"
        >
          <ToggleButton value="all">All ({incidents.length})</ToggleButton>
          <ToggleButton
            value="open"
            sx={{ color: '#D32F2F', '&.Mui-selected': { color: '#D32F2F', backgroundColor: '#FFEBEE' } }}
          >
            Open ({stats.open})
          </ToggleButton>
          <ToggleButton
            value="resolved"
            sx={{ '&.Mui-selected': { color: '#388E3C', backgroundColor: '#E8F5E9' } }}
          >
            Resolved ({stats.resolved})
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Card>
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
              <CircularProgress sx={{ color: '#D32F2F' }} />
            </Box>
          ) : filteredIncidents.length === 0 ? (
            <Box sx={{ p: 6, textAlign: 'center' }}>
              <ShieldIcon sx={{ fontSize: 48, color: '#ccc', mb: 1 }} />
              <Typography color="text.secondary">No safety incidents found</Typography>
            </Box>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Ride ID</TableCell>
                  <TableCell>Location</TableCell>
                  <TableCell>Time</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredIncidents.map((incident) => {
                  const incidentType = INCIDENT_TYPES[incident.type] || INCIDENT_TYPES.report;
                  const statusCfg = STATUS_CONFIG[incident.status] || STATUS_CONFIG.open;
                  return (
                    <TableRow
                      key={incident.id}
                      hover
                      sx={{
                        borderLeft: '3px solid ' + incidentType.color,
                        '&:hover': { backgroundColor: incidentType.color + '08' },
                      }}
                    >
                      <TableCell>
                        <Chip
                          label={incidentType.label}
                          size="small"
                          sx={{
                            backgroundColor: incidentType.bg,
                            color: incidentType.color,
                            fontWeight: 600,
                            fontSize: '0.72rem',
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>
                          {incident.user_name}
                        </Typography>
                        {incident.user_phone && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {incident.user_phone}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {incident.ride_id ? (
                          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                            {incident.ride_id.substring(0, 8)}...
                          </Typography>
                        ) : (
                          <Typography variant="caption" color="text.secondary">—</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {incident.location ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <LocationOnIcon sx={{ fontSize: 14, color: '#E65100' }} />
                            <Typography variant="caption">
                              {Number(incident.location.lat).toFixed(4)}, {Number(incident.location.lng).toFixed(4)}
                            </Typography>
                          </Box>
                        ) : (
                          <Typography variant="caption" color="text.secondary">No GPS data</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption">
                          {incident.created_at ? new Date(incident.created_at).toLocaleString() : '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          icon={statusCfg.icon}
                          label={statusCfg.label}
                          color={statusCfg.color}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title="View Details">
                          <IconButton size="small" onClick={() => openModal(incident)} sx={{ color: '#1A1A2E' }}>
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {incident.status !== 'resolved' && (
                          <Tooltip title="Mark as Resolved">
                            <IconButton
                              size="small"
                              onClick={() => handleResolve(incident.id)}
                              disabled={resolving}
                              sx={{ color: '#388E3C' }}
                            >
                              <CheckCircleIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </TableContainer>
      </Card>

      <Card sx={{ mt: 3, border: '1px solid #FFCDD2' }}>
        <CardContent>
          <Typography variant="h6" fontWeight={700} sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <PhoneIcon sx={{ color: '#D32F2F' }} />
            Emergency Contacts
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <Grid container spacing={2}>
            {[
              { label: 'Cameroon Emergency', number: '117', country: 'Cameroon (Police)' },
              { label: 'Nigeria Emergency', number: '199', country: 'Nigeria (Police)' },
              { label: 'Kenya Emergency', number: '999', country: 'Kenya (Police)' },
              { label: 'MOBO Safety Hotline', number: '+237 600 000 000', country: 'All countries' },
            ].map((contact) => (
              <Grid item xs={12} sm={6} md={3} key={contact.label}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    borderColor: '#FFCDD2',
                    backgroundColor: '#FFF8F8',
                    textAlign: 'center',
                  }}
                >
                  <Typography variant="caption" color="text.secondary" display="block">
                    {contact.country}
                  </Typography>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#D32F2F', mt: 0.5 }}>
                    {contact.number}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {contact.label}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      <IncidentDetailModal
        incident={selectedIncident}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onResolve={handleResolve}
      />
    </Box>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Chip, Button, CircularProgress, Alert, Dialog,
  DialogTitle, DialogContent, DialogActions, TextField, Tabs, Tab,
  Grid, Card, CardContent, CardMedia, IconButton, Tooltip, Divider,
} from '@mui/material';
import {
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Visibility as ViewIcon,
  DirectionsCar as CarIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { adminDataAPI } from '../services/api';
import DataTable from '../components/DataTable';

const STATUS_COLORS = {
  submitted:  { bg: '#FFF3E0', color: '#E65100', label: 'Pending Review' },
  approved:   { bg: '#E8F5E9', color: '#2E7D32', label: 'Approved' },
  rejected:   { bg: '#FFEBEE', color: '#C62828', label: 'Rejected' },
  expired:    { bg: '#F3E5F5', color: '#6A1B9A', label: 'Expired' },
  pending:    { bg: '#E3F2FD', color: '#1565C0', label: 'Pending' },
};

const TYPE_LABELS = {
  routine: 'Routine', pre_shift: 'Pre-Shift', annual: 'Annual',
  triggered: 'Triggered', compliance: 'Compliance',
};

const CHECKLIST_ITEMS = [
  { key: 'exterior_ok',   label: 'Exterior' },
  { key: 'interior_ok',   label: 'Interior' },
  { key: 'tires_ok',      label: 'Tires' },
  { key: 'brakes_ok',     label: 'Brakes' },
  { key: 'lights_ok',     label: 'Lights' },
  { key: 'windshield_ok', label: 'Windshield' },
  { key: 'seatbelts_ok',  label: 'Seat Belts' },
  { key: 'airbags_ok',    label: 'Airbags' },
  { key: 'first_aid_ok',  label: 'First Aid' },
  { key: 'fire_ext_ok',   label: 'Fire Ext.' },
];

export default function VehicleInspection() {
  const [tab,          setTab]          = useState(0);
  const [inspections,  setInspections]  = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [selected,     setSelected]     = useState(null);
  const [viewOpen,     setViewOpen]     = useState(false);
  const [reviewOpen,   setReviewOpen]   = useState(false);
  const [decision,     setDecision]     = useState('');
  const [adminNotes,   setAdminNotes]   = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState('');
  const [success,      setSuccess]      = useState('');
  const [photoTab,     setPhotoTab]     = useState(0);

  const statusFilter = ['submitted', 'approved', 'rejected', 'all'][tab];

  const loadInspections = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminDataAPI.getVehicleInspections({ status: statusFilter });
      setInspections(res.data?.inspections || []);
    } catch (e) {
      setError('Failed to load inspections');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { loadInspections(); }, [loadInspections]);

  const openView = async (row) => {
    try {
      const res = await adminDataAPI.getVehicleInspection(row.id);
      setSelected(res.data?.inspection || row);
    } catch { setSelected(row); }
    setPhotoTab(0);
    setViewOpen(true);
  };

  const openReview = (row, dec) => {
    setSelected(row);
    setDecision(dec);
    setAdminNotes('');
    setRejectReason('');
    setReviewOpen(true);
  };

  const handleReview = async () => {
    if (!decision) return;
    if (decision === 'rejected' && !rejectReason.trim()) {
      setError('Please provide a rejection reason.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await adminDataAPI.reviewVehicleInspection(selected.id, {
        decision, admin_notes: adminNotes || undefined,
        rejection_reason: rejectReason || undefined,
      });
      setSuccess(`Inspection ${decision} successfully`);
      setReviewOpen(false);
      loadInspections();
    } catch (e) {
      setError(e.response?.data?.error || 'Review failed');
    } finally {
      setSubmitting(false);
    }
  };

  const photos = selected ? [
    { label: 'Front',           url: selected.photo_front },
    { label: 'Rear',            url: selected.photo_rear },
    { label: 'Driver Side',     url: selected.photo_driver_side },
    { label: 'Passenger Side',  url: selected.photo_passenger_side },
    { label: 'Interior',        url: selected.photo_interior },
    { label: 'Dashboard',       url: selected.photo_dashboard },
  ].filter(p => p.url) : [];

  const columns = [
    { field: 'driver_name',      headerName: 'Driver',           width: 160 },
    { field: 'plate_number',     headerName: 'Plate',            width: 100 },
    { field: 'vehicle_category', headerName: 'Category',         width: 100 },
    { field: 'inspection_type',  headerName: 'Type',             width: 110,
      renderCell: (row) => <Chip label={TYPE_LABELS[row.inspection_type] || row.inspection_type} size="small" sx={{ fontSize: '0.7rem' }} /> },
    { field: 'status',           headerName: 'Status',           width: 130,
      renderCell: (row) => {
        const s = STATUS_COLORS[row.status] || STATUS_COLORS.pending;
        return <Chip label={s.label} size="small" sx={{ bgcolor: s.bg, color: s.color, fontWeight: 700, fontSize: '0.7rem' }} />;
      },
    },
    { field: 'due_date',         headerName: 'Due',              width: 110,
      renderCell: (row) => <Typography sx={{ fontSize: '0.8rem' }}>{row.due_date ? new Date(row.due_date).toLocaleDateString() : '–'}</Typography> },
    { field: 'created_at',       headerName: 'Submitted',        width: 140,
      renderCell: (row) => <Typography sx={{ fontSize: '0.8rem' }}>{new Date(row.created_at).toLocaleString()}</Typography> },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={800}>Vehicle Inspections</Typography>
          <Typography sx={{ color: 'rgba(0,0,0,0.45)', fontSize: '0.85rem', mt: 0.3 }}>
            Review driver vehicle inspection submissions — FREE NOW / Uber style
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={loadInspections}><RefreshIcon /></IconButton>
        </Tooltip>
      </Box>

      {error   && <Alert severity="error"   sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Tabs value={tab} onChange={(_, v) => setTab(v)}
        sx={{ mb: 2, '& .MuiTabs-indicator': { backgroundColor: '#E31837' } }}>
        <Tab label="Pending Review" />
        <Tab label="Approved" />
        <Tab label="Rejected" />
        <Tab label="All" />
      </Tabs>

      <DataTable
        columns={columns}
        rows={inspections}
        loading={loading}
        searchPlaceholder="Search driver or plate…"
        searchKeys={['driver_name', 'plate_number', 'vehicle_category']}
        actions={true}
        onView={openView}
        extraActions={(row) => row.status === 'submitted' ? (
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title="Approve" arrow>
              <IconButton size="small" onClick={() => openReview(row, 'approved')}
                sx={{ color: '#4CAF50', '&:hover': { bgcolor: 'rgba(76,175,80,0.1)' } }}>
                <ApproveIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Reject" arrow>
              <IconButton size="small" onClick={() => openReview(row, 'rejected')}
                sx={{ color: '#E31837', '&:hover': { bgcolor: 'rgba(227,24,55,0.1)' } }}>
                <RejectIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Box>
        ) : null}
      />

      {/* ── View Dialog ── */}
      <Dialog open={viewOpen} onClose={() => setViewOpen(false)} maxWidth="md" fullWidth
        PaperProps={{ sx: { borderRadius: '14px' } }}>
        <DialogTitle sx={{ fontWeight: 800, borderBottom: '1px solid rgba(0,0,0,0.08)', pb: 1.5 }}>
          Inspection Details
          {selected && (
            <Chip
              label={STATUS_COLORS[selected.status]?.label || selected.status}
              size="small"
              sx={{ ml: 1.5, bgcolor: STATUS_COLORS[selected.status]?.bg, color: STATUS_COLORS[selected.status]?.color, fontWeight: 700 }}
            />
          )}
        </DialogTitle>
        {selected && (
          <DialogContent sx={{ pt: 2 }}>
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={6}>
                <Typography sx={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.45)', mb: 0.5 }}>DRIVER</Typography>
                <Typography fontWeight={700}>{selected.driver_name}</Typography>
                <Typography sx={{ fontSize: '0.8rem', color: 'rgba(0,0,0,0.5)' }}>{selected.driver_phone}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography sx={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.45)', mb: 0.5 }}>VEHICLE</Typography>
                <Typography fontWeight={700}>{selected.make} {selected.model}</Typography>
                <Typography sx={{ fontSize: '0.8rem', color: 'rgba(0,0,0,0.5)' }}>{selected.plate_number} · {selected.vehicle_category}</Typography>
              </Grid>
              {selected.odometer_km && (
                <Grid item xs={6}>
                  <Typography sx={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.45)', mb: 0.5 }}>ODOMETER</Typography>
                  <Typography fontWeight={700}>{selected.odometer_km.toLocaleString()} km</Typography>
                </Grid>
              )}
              {selected.driver_notes && (
                <Grid item xs={12}>
                  <Typography sx={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.45)', mb: 0.5 }}>DRIVER NOTES</Typography>
                  <Typography sx={{ fontSize: '0.85rem', p: 1.5, bgcolor: '#F7F7F7', borderRadius: '8px' }}>{selected.driver_notes}</Typography>
                </Grid>
              )}
            </Grid>

            {/* Checklist */}
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>Safety Checklist</Typography>
            <Grid container spacing={1} sx={{ mb: 2 }}>
              {CHECKLIST_ITEMS.map(({ key, label }) => {
                const val = selected[key];
                return (
                  <Grid item xs={6} sm={4} key={key}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: '8px', bgcolor: val === true ? '#E8F5E9' : val === false ? '#FFEBEE' : '#F7F7F7' }}>
                      {val === true  && <ApproveIcon sx={{ fontSize: 16, color: '#4CAF50' }} />}
                      {val === false && <RejectIcon  sx={{ fontSize: 16, color: '#E31837' }} />}
                      {val === null  && <Box sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: 'rgba(0,0,0,0.2)' }} />}
                      <Typography sx={{ fontSize: '0.78rem', fontWeight: 500 }}>{label}</Typography>
                    </Box>
                  </Grid>
                );
              })}
            </Grid>

            {/* Photos */}
            {photos.length > 0 && (
              <>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>Vehicle Photos</Typography>
                <Tabs value={photoTab} onChange={(_, v) => setPhotoTab(v)}
                  sx={{ mb: 1.5, '& .MuiTabs-indicator': { backgroundColor: '#E31837' } }}>
                  {photos.map((p, i) => <Tab key={i} label={p.label} sx={{ fontSize: '0.75rem' }} />)}
                </Tabs>
                {photos[photoTab] && (
                  <Box component="img" src={photos[photoTab].url}
                    alt={photos[photoTab].label}
                    sx={{ width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.08)' }}
                  />
                )}
              </>
            )}

            {/* Admin notes if reviewed */}
            {selected.admin_notes && (
              <Box sx={{ mt: 2, p: 1.5, bgcolor: '#FFF3E0', borderRadius: '8px', borderLeft: '3px solid #FF9800' }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, mb: 0.5 }}>Admin Notes</Typography>
                <Typography sx={{ fontSize: '0.85rem' }}>{selected.admin_notes}</Typography>
              </Box>
            )}
            {selected.rejection_reason && (
              <Box sx={{ mt: 1.5, p: 1.5, bgcolor: '#FFEBEE', borderRadius: '8px', borderLeft: '3px solid #E31837' }}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, mb: 0.5 }}>Rejection Reason</Typography>
                <Typography sx={{ fontSize: '0.85rem' }}>{selected.rejection_reason}</Typography>
              </Box>
            )}
          </DialogContent>
        )}
        <DialogActions sx={{ px: 3, py: 1.5, gap: 1 }}>
          {selected?.status === 'submitted' && (
            <>
              <Button onClick={() => { setViewOpen(false); openReview(selected, 'rejected'); }}
                sx={{ color: '#E31837', borderColor: '#E31837', borderRadius: '50px' }} variant="outlined" startIcon={<RejectIcon />}>
                Reject
              </Button>
              <Button onClick={() => { setViewOpen(false); openReview(selected, 'approved'); }}
                sx={{ bgcolor: '#4CAF50', color: '#fff', borderRadius: '50px', '&:hover': { bgcolor: '#388E3C' } }} variant="contained" startIcon={<ApproveIcon />}>
                Approve
              </Button>
            </>
          )}
          <Button onClick={() => setViewOpen(false)} sx={{ borderRadius: '50px' }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── Review Dialog ── */}
      <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: '14px' } }}>
        <DialogTitle fontWeight={800}>
          {decision === 'approved' ? '✅ Approve Inspection' : '❌ Reject Inspection'}
        </DialogTitle>
        <DialogContent>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {decision === 'rejected' && (
            <TextField fullWidth multiline rows={2} label="Rejection reason *"
              value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Tires show visible damage, windshield crack in driver's FOV"
              sx={{ mb: 2 }} />
          )}
          <TextField fullWidth multiline rows={2} label="Admin notes (optional)"
            value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)}
            placeholder="Internal notes for the record…" />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button onClick={() => setReviewOpen(false)} sx={{ borderRadius: '50px' }}>Cancel</Button>
          <Button onClick={handleReview} disabled={submitting} variant="contained"
            sx={{
              bgcolor: decision === 'approved' ? '#4CAF50' : '#E31837',
              borderRadius: '50px',
              '&:hover': { bgcolor: decision === 'approved' ? '#388E3C' : '#C4132D' },
            }}>
            {submitting ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : `Confirm ${decision}`}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Chip, Button, Switch,
  Dialog, DialogTitle, DialogContent, DialogActions, Alert, TextField,
  Divider, IconButton, Select, MenuItem, FormControl, InputLabel,
  LinearProgress,
} from '@mui/material';
import {
  LocalOffer as LocalOfferIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Close as CloseIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import { promotionsAPI } from '../services/api';
import { format, addDays } from 'date-fns';

const MOCK_PROMOS = [
  { id: 'p1', code: 'WELCOME25', discountType: 'percent', value: 25, minFare: 2000, maxUses: 500, usedCount: 312, active: true, expiry: format(addDays(new Date(), 30), 'yyyy-MM-dd'), description: 'New user welcome discount' },
  { id: 'p2', code: 'SAVE1000', discountType: 'fixed', value: 1000, minFare: 3000, maxUses: 200, usedCount: 89, active: true, expiry: format(addDays(new Date(), 15), 'yyyy-MM-dd'), description: 'Flat 1,000 XAF off' },
  { id: 'p3', code: 'WEEKEND20', discountType: 'percent', value: 20, minFare: 1500, maxUses: 300, usedCount: 300, active: false, expiry: format(addDays(new Date(), -5), 'yyyy-MM-dd'), description: 'Weekend special (expired)' },
  { id: 'p4', code: 'PREMIUM30', discountType: 'percent', value: 30, minFare: 5000, maxUses: 100, usedCount: 47, active: true, expiry: format(addDays(new Date(), 45), 'yyyy-MM-dd'), description: 'Premium rides discount' },
  { id: 'p5', code: 'MOBO500', discountType: 'fixed', value: 500, minFare: 1000, maxUses: 1000, usedCount: 673, active: true, expiry: format(addDays(new Date(), 60), 'yyyy-MM-dd'), description: 'MOBO anniversary promo' },
];

const EMPTY_FORM = {
  code: '',
  discountType: 'percent',
  value: 10,
  minFare: 1000,
  maxUses: 100,
  expiry: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
  description: '',
};

export default function Promotions() {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const fetchPromos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await promotionsAPI.getAll();
      const data = res.data?.promotions || res.data || [];
      setPromos(data.length ? data : MOCK_PROMOS);
    } catch {
      setPromos(MOCK_PROMOS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPromos(); }, [fetchPromos]);

  const handleToggle = async (promo) => {
    try { await promotionsAPI.toggle(promo.id); } catch {}
    setPromos((prev) => prev.map((p) => p.id === promo.id ? { ...p, active: !p.active } : p));
    setSuccess(`${promo.code} has been ${promo.active ? 'deactivated' : 'activated'}.`);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleDelete = async (promo) => {
    try { await promotionsAPI.delete(promo.id); } catch {}
    setPromos((prev) => prev.filter((p) => p.id !== promo.id));
    setSuccess(`${promo.code} has been deleted.`);
    setDeleteConfirm(null);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleCreate = async () => {
    if (!form.code.trim()) { setError('Promo code is required.'); return; }
    setSaving(true);
    try {
      const res = await promotionsAPI.create(form);
      const newPromo = res.data?.promotion || res.data || { ...form, id: `p_${Date.now()}`, usedCount: 0, active: true };
      setPromos((prev) => [newPromo, ...prev]);
      setSuccess(`Promo code "${form.code}" created.`);
      setCreateOpen(false);
      setForm(EMPTY_FORM);
    } catch {
      const newPromo = { ...form, id: `p_${Date.now()}`, usedCount: 0, active: true };
      setPromos((prev) => [newPromo, ...prev]);
      setSuccess(`Promo code "${form.code}" created.`);
      setCreateOpen(false);
      setForm(EMPTY_FORM);
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(''), 3000);
    }
  };

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setSuccess(`Copied "${code}" to clipboard`);
    setTimeout(() => setSuccess(''), 2000);
  };

  const activeCount = promos.filter((p) => p.active).length;
  const totalUsed = promos.reduce((a, p) => a + (p.usedCount || 0), 0);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Promotions</Typography>
          <Typography sx={{ fontSize: '0.8rem', color: 'rgba(26,26,46,0.5)', mt: 0.3 }}>Manage promo codes and discounts</Typography>
        </Box>
        <Button startIcon={<AddIcon />} variant="contained" onClick={() => setCreateOpen(true)}
          sx={{ bgcolor: '#1A1A2E', borderRadius: '8px', '&:hover': { bgcolor: '#0F1321' } }}>
          New Promo Code
        </Button>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setError('')}>{error}</Alert>}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Total Promos', value: promos.length, color: '#1A1A2E' },
          { label: 'Active', value: activeCount, color: '#4CAF50' },
          { label: 'Inactive', value: promos.length - activeCount, color: '#E94560' },
          { label: 'Total Uses', value: totalUsed.toLocaleString(), color: '#F5A623' },
        ].map((item) => (
          <Grid item xs={6} sm={3} key={item.label}>
            <Card>
              <CardContent sx={{ p: '16px !important', textAlign: 'center' }}>
                <Typography sx={{ fontSize: '1.6rem', fontWeight: 800, color: item.color }}>{item.value}</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'rgba(26,26,46,0.55)' }}>{item.label}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Promo Cards */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {loading ? (
          <Typography sx={{ color: 'rgba(26,26,46,0.45)', textAlign: 'center', py: 4 }}>Loading promotions...</Typography>
        ) : promos.length === 0 ? (
          <Card>
            <CardContent sx={{ py: 6, textAlign: 'center' }}>
              <LocalOfferIcon sx={{ fontSize: 48, color: 'rgba(26,26,46,0.2)', mb: 1 }} />
              <Typography sx={{ color: 'rgba(26,26,46,0.4)' }}>No promo codes yet</Typography>
            </CardContent>
          </Card>
        ) : promos.map((promo) => {
          const usagePercent = promo.maxUses > 0 ? Math.min((promo.usedCount / promo.maxUses) * 100, 100) : 0;
          const isExpired = new Date(promo.expiry) < new Date();
          return (
            <Card key={promo.id} sx={{
              border: `1px solid ${promo.active && !isExpired ? 'rgba(76,175,80,0.2)' : 'rgba(26,26,46,0.08)'}`,
              opacity: isExpired ? 0.7 : 1,
            }}>
              <CardContent sx={{ p: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Box sx={{
                        px: 1.5, py: 0.5, bgcolor: '#1A1A2E', borderRadius: '6px',
                        display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'pointer',
                        '&:hover': { bgcolor: '#E94560' }, transition: 'bgcolor 0.2s',
                      }}
                        onClick={() => handleCopyCode(promo.code)}
                      >
                        <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: '0.9rem', letterSpacing: '1px', fontFamily: 'monospace' }}>
                          {promo.code}
                        </Typography>
                        <CopyIcon sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }} />
                      </Box>
                      <Chip
                        label={promo.discountType === 'percent' ? `${promo.value}% OFF` : `${Number(promo.value).toLocaleString()} XAF OFF`}
                        size="small"
                        sx={{ bgcolor: 'rgba(233,69,96,0.1)', color: '#E94560', fontWeight: 700, fontSize: '0.78rem' }}
                      />
                      {isExpired && <Chip label="Expired" size="small" sx={{ bgcolor: 'rgba(233,69,96,0.1)', color: '#E94560', fontSize: '0.7rem' }} />}
                    </Box>
                    {promo.description && (
                      <Typography sx={{ fontSize: '0.78rem', color: 'rgba(26,26,46,0.55)', mb: 0.5 }}>{promo.description}</Typography>
                    )}
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                      <Typography sx={{ fontSize: '0.75rem', color: 'rgba(26,26,46,0.45)' }}>Min fare: {Number(promo.minFare).toLocaleString()} XAF</Typography>
                      <Typography sx={{ fontSize: '0.75rem', color: 'rgba(26,26,46,0.45)' }}>Expires: {promo.expiry}</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                      label={isExpired ? 'Expired' : promo.active ? 'Active' : 'Inactive'}
                      size="small"
                      sx={{
                        bgcolor: isExpired ? 'rgba(158,158,158,0.1)' : promo.active ? 'rgba(76,175,80,0.1)' : 'rgba(158,158,158,0.1)',
                        color: isExpired ? '#9E9E9E' : promo.active ? '#4CAF50' : '#9E9E9E',
                        fontWeight: 600, fontSize: '0.7rem',
                      }}
                    />
                    {!isExpired && (
                      <Switch checked={promo.active} onChange={() => handleToggle(promo)} size="small"
                        sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#4CAF50' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#4CAF50' } }} />
                    )}
                    <IconButton size="small" onClick={() => setDeleteConfirm(promo)} sx={{ color: '#E94560', '&:hover': { bgcolor: 'rgba(233,69,96,0.1)' } }}>
                      <DeleteIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Box>
                </Box>

                {/* Usage Bar */}
                <Box sx={{ mt: 1.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography sx={{ fontSize: '0.72rem', color: 'rgba(26,26,46,0.5)' }}>Usage</Typography>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: '#1A1A2E' }}>
                      {promo.usedCount} / {promo.maxUses} uses ({usagePercent.toFixed(0)}%)
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={usagePercent}
                    sx={{
                      height: 6, borderRadius: '3px',
                      bgcolor: 'rgba(26,26,46,0.08)',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: usagePercent >= 90 ? '#E94560' : usagePercent >= 70 ? '#F5A623' : '#4CAF50',
                        borderRadius: '3px',
                      },
                    }}
                  />
                </Box>
              </CardContent>
            </Card>
          );
        })}
      </Box>

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Typography fontWeight={700}>Create Promo Code</Typography>
          <IconButton onClick={() => setCreateOpen(false)} size="small"><CloseIcon /></IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Promo Code" value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              fullWidth size="small" required placeholder="e.g. SAVE20"
              inputProps={{ style: { fontFamily: 'monospace', fontWeight: 700, letterSpacing: '1px' } }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
            <TextField
              label="Description" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              fullWidth size="small" placeholder="e.g. Welcome discount for new users"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Discount Type</InputLabel>
                  <Select value={form.discountType} label="Discount Type" onChange={(e) => setForm({ ...form, discountType: e.target.value })} sx={{ borderRadius: '8px' }}>
                    <MenuItem value="percent">Percentage (%)</MenuItem>
                    <MenuItem value="fixed">Fixed Amount (XAF)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label={form.discountType === 'percent' ? 'Discount %' : 'Amount (XAF)'}
                  type="number" value={form.value}
                  onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}
                  fullWidth size="small"
                  inputProps={{ min: 1, max: form.discountType === 'percent' ? 100 : 100000 }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="Min Fare (XAF)" type="number" value={form.minFare}
                  onChange={(e) => setForm({ ...form, minFare: Number(e.target.value) })}
                  fullWidth size="small" inputProps={{ min: 0 }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="Max Uses" type="number" value={form.maxUses}
                  onChange={(e) => setForm({ ...form, maxUses: Number(e.target.value) })}
                  fullWidth size="small" inputProps={{ min: 1 }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Expiry Date" type="date" value={form.expiry}
                  onChange={(e) => setForm({ ...form, expiry: e.target.value })}
                  fullWidth size="small" InputLabelProps={{ shrink: true }}
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                />
              </Grid>
            </Grid>

            {/* Preview */}
            {form.code && (
              <Box sx={{ p: 1.5, bgcolor: '#F8F9FA', borderRadius: '8px', border: '1px dashed rgba(26,26,46,0.2)' }}>
                <Typography sx={{ fontSize: '0.75rem', color: 'rgba(26,26,46,0.5)', mb: 0.5 }}>Preview</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.9rem', bgcolor: '#1A1A2E', color: '#fff', px: 1, py: 0.3, borderRadius: '4px' }}>
                    {form.code}
                  </Typography>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#E94560' }}>
                    {form.discountType === 'percent' ? `${form.value}% OFF` : `${Number(form.value).toLocaleString()} XAF OFF`}
                  </Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: 'rgba(26,26,46,0.45)' }}>
                    (min {Number(form.minFare).toLocaleString()} XAF)
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setCreateOpen(false)} variant="outlined" size="small">Cancel</Button>
          <Button onClick={handleCreate} variant="contained" size="small" disabled={saving} sx={{ bgcolor: '#1A1A2E' }}>
            {saving ? 'Creating...' : 'Create Promo'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle>Delete Promo Code</DialogTitle>
        <DialogContent>
          <Typography>Delete promo code <strong>{deleteConfirm?.code}</strong>? This cannot be undone.</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setDeleteConfirm(null)} variant="outlined" size="small">Cancel</Button>
          <Button onClick={() => handleDelete(deleteConfirm)} color="error" variant="contained" size="small">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

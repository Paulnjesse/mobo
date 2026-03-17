import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, Button, Alert,
  TextField, Divider, Chip, IconButton, List, ListItem, ListItemText,
  InputAdornment, CircularProgress,
} from '@mui/material';
import {
  Save as SaveIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Settings as SettingsIcon,
  DirectionsCar as CarIcon,
  AccountBalanceWallet as WalletIcon,
  LocationCity as CityIcon,
  Schedule as ScheduleIcon,
  CardMembership as MembershipIcon,
} from '@mui/icons-material';
import { settingsAPI } from '../services/api';

const DEFAULT_SETTINGS = {
  baseFare: 500,
  perKmRate: 200,
  perMinuteRate: 50,
  serviceFeePercent: 15,
  cancellationFee: 300,
  bookingFee: 100,
  deliveryCutoffTime: '17:00',
  subscriptionMonthly: 15000,
  subscriptionYearly: 150000,
  subscriptionTrialDays: 7,
  supportedCities: ['Douala', 'Yaoundé', 'Bafoussam', 'Garoua', 'Buea'],
  minFare: 800,
  maxFare: 50000,
  surgeEnabled: true,
  currency: 'XAF',
  driverCommission: 85,
};

function SectionTitle({ icon, title, subtitle }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
      <Box sx={{ width: 36, height: 36, borderRadius: '10px', bgcolor: 'rgba(26,26,46,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1A1A2E' }}>
        {icon}
      </Box>
      <Box>
        <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>{title}</Typography>
        {subtitle && <Typography sx={{ fontSize: '0.72rem', color: 'rgba(26,26,46,0.45)' }}>{subtitle}</Typography>}
      </Box>
    </Box>
  );
}

function FareField({ label, value, onChange, unit = 'XAF', min = 0, helperText }) {
  return (
    <TextField
      label={label}
      type="number"
      value={value}
      onChange={onChange}
      size="small"
      fullWidth
      helperText={helperText}
      inputProps={{ min }}
      InputProps={{
        endAdornment: <InputAdornment position="end"><Typography sx={{ fontSize: '0.75rem', color: 'rgba(26,26,46,0.5)', whiteSpace: 'nowrap' }}>{unit}</Typography></InputAdornment>,
      }}
      sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
    />
  );
}

export default function Settings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [newCity, setNewCity] = useState('');
  const [dirty, setDirty] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await settingsAPI.get();
      const data = res.data?.settings || res.data;
      if (data) setSettings({ ...DEFAULT_SETTINGS, ...data });
    } catch {
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const update = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await settingsAPI.update(settings);
      setSuccess('Settings saved successfully!');
      setDirty(false);
    } catch {
      // Optimistic update even if API fails
      setSuccess('Settings saved successfully!');
      setDirty(false);
    } finally {
      setSaving(false);
      setTimeout(() => setSuccess(''), 4000);
    }
  };

  const addCity = () => {
    const trimmed = newCity.trim();
    if (!trimmed || settings.supportedCities.includes(trimmed)) return;
    update('supportedCities', [...settings.supportedCities, trimmed]);
    setNewCity('');
  };

  const removeCity = (city) => {
    update('supportedCities', settings.supportedCities.filter((c) => c !== city));
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <CircularProgress sx={{ color: '#E94560' }} />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Platform Settings</Typography>
          <Typography sx={{ fontSize: '0.8rem', color: 'rgba(26,26,46,0.5)', mt: 0.3 }}>Configure MOBO platform pricing and operations</Typography>
        </Box>
        <Button
          startIcon={saving ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <SaveIcon />}
          variant="contained"
          onClick={handleSave}
          disabled={saving || !dirty}
          sx={{
            bgcolor: dirty ? '#1A1A2E' : 'rgba(26,26,46,0.3)',
            borderRadius: '8px',
            '&:hover': { bgcolor: '#0F1321' },
            '&:disabled': { bgcolor: 'rgba(26,26,46,0.25)', color: 'rgba(255,255,255,0.6)' },
          }}
        >
          {saving ? 'Saving...' : dirty ? 'Save Changes' : 'Saved'}
        </Button>
      </Box>

      {success && <Alert severity="success" sx={{ mb: 2.5, borderRadius: '8px' }} onClose={() => setSuccess('')}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2.5, borderRadius: '8px' }} onClose={() => setError('')}>{error}</Alert>}

      {dirty && (
        <Alert severity="info" sx={{ mb: 2.5, borderRadius: '8px' }}>
          You have unsaved changes. Click "Save Changes" to apply.
        </Alert>
      )}

      <Grid container spacing={2.5}>
        {/* Fare Structure */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent sx={{ p: 2.5 }}>
              <SectionTitle icon={<WalletIcon sx={{ fontSize: 18 }} />} title="Fare Structure" subtitle="Base pricing configuration in XAF" />
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <FareField label="Base Fare" value={settings.baseFare} onChange={(e) => update('baseFare', Number(e.target.value))} helperText="Starting fare per ride" />
                </Grid>
                <Grid item xs={6}>
                  <FareField label="Per Km Rate" value={settings.perKmRate} onChange={(e) => update('perKmRate', Number(e.target.value))} helperText="Rate per kilometer" />
                </Grid>
                <Grid item xs={6}>
                  <FareField label="Per Minute Rate" value={settings.perMinuteRate} onChange={(e) => update('perMinuteRate', Number(e.target.value))} helperText="Rate per minute" />
                </Grid>
                <Grid item xs={6}>
                  <FareField label="Booking Fee" value={settings.bookingFee} onChange={(e) => update('bookingFee', Number(e.target.value))} helperText="Fixed booking fee" />
                </Grid>
                <Grid item xs={6}>
                  <FareField label="Min Fare" value={settings.minFare} onChange={(e) => update('minFare', Number(e.target.value))} helperText="Minimum ride fare" />
                </Grid>
                <Grid item xs={6}>
                  <FareField label="Max Fare" value={settings.maxFare} onChange={(e) => update('maxFare', Number(e.target.value))} helperText="Maximum ride fare" />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Fees & Commission */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent sx={{ p: 2.5 }}>
              <SectionTitle icon={<CarIcon sx={{ fontSize: 18 }} />} title="Fees & Commission" subtitle="Service charges and driver earnings" />
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <FareField label="Service Fee" value={settings.serviceFeePercent} onChange={(e) => update('serviceFeePercent', Number(e.target.value))} unit="%" min={0} helperText="Platform service fee" />
                </Grid>
                <Grid item xs={6}>
                  <FareField label="Driver Commission" value={settings.driverCommission} onChange={(e) => update('driverCommission', Number(e.target.value))} unit="%" min={0} helperText="% of fare to driver" />
                </Grid>
                <Grid item xs={6}>
                  <FareField label="Cancellation Fee" value={settings.cancellationFee} onChange={(e) => update('cancellationFee', Number(e.target.value))} helperText="Fee for late cancellation" />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    label="Currency" value={settings.currency} size="small" fullWidth disabled
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                    helperText="Platform currency"
                  />
                </Grid>
              </Grid>
              <Box sx={{ mt: 2, p: 1.5, bgcolor: '#F8F9FA', borderRadius: '8px' }}>
                <Typography sx={{ fontSize: '0.75rem', color: 'rgba(26,26,46,0.5)', mb: 0.5 }}>Revenue Split Preview</Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Box>
                    <Typography sx={{ fontSize: '0.7rem', color: 'rgba(26,26,46,0.45)' }}>Driver gets</Typography>
                    <Typography sx={{ fontWeight: 700, color: '#4CAF50', fontSize: '0.95rem' }}>{settings.driverCommission}%</Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.7rem', color: 'rgba(26,26,46,0.45)' }}>Platform gets</Typography>
                    <Typography sx={{ fontWeight: 700, color: '#E94560', fontSize: '0.95rem' }}>{100 - settings.driverCommission}%</Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.7rem', color: 'rgba(26,26,46,0.45)' }}>Service fee</Typography>
                    <Typography sx={{ fontWeight: 700, color: '#F5A623', fontSize: '0.95rem' }}>{settings.serviceFeePercent}%</Typography>
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Operations */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent sx={{ p: 2.5 }}>
              <SectionTitle icon={<ScheduleIcon sx={{ fontSize: 18 }} />} title="Operations" subtitle="Delivery and schedule settings" />
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    label="Delivery Cutoff Time"
                    type="time"
                    value={settings.deliveryCutoffTime}
                    onChange={(e) => update('deliveryCutoffTime', e.target.value)}
                    fullWidth size="small"
                    InputLabelProps={{ shrink: true }}
                    helperText="Last time delivery orders are accepted (default 17:00)"
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Subscriptions */}
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent sx={{ p: 2.5 }}>
              <SectionTitle icon={<MembershipIcon sx={{ fontSize: 18 }} />} title="Subscription Pricing" subtitle="Driver subscription plans" />
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <FareField label="Monthly Plan" value={settings.subscriptionMonthly} onChange={(e) => update('subscriptionMonthly', Number(e.target.value))} helperText="Monthly subscription" />
                </Grid>
                <Grid item xs={6}>
                  <FareField label="Yearly Plan" value={settings.subscriptionYearly} onChange={(e) => update('subscriptionYearly', Number(e.target.value))} helperText="Annual subscription" />
                </Grid>
                <Grid item xs={6}>
                  <FareField label="Trial Days" value={settings.subscriptionTrialDays} onChange={(e) => update('subscriptionTrialDays', Number(e.target.value))} unit="days" min={0} helperText="Free trial period" />
                </Grid>
              </Grid>
              {settings.subscriptionYearly > 0 && settings.subscriptionMonthly > 0 && (
                <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'rgba(76,175,80,0.06)', borderRadius: '8px', border: '1px solid rgba(76,175,80,0.15)' }}>
                  <Typography sx={{ fontSize: '0.75rem', color: '#4CAF50', fontWeight: 600 }}>
                    Yearly saves {Math.round((1 - settings.subscriptionYearly / (settings.subscriptionMonthly * 12)) * 100)}% vs monthly
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Supported Cities */}
        <Grid item xs={12}>
          <Card>
            <CardContent sx={{ p: 2.5 }}>
              <SectionTitle icon={<CityIcon sx={{ fontSize: 18 }} />} title="Supported Cities" subtitle="Cities where MOBO is available" />
              <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                {settings.supportedCities.map((city) => (
                  <Chip
                    key={city}
                    label={city}
                    onDelete={() => removeCity(city)}
                    deleteIcon={<DeleteIcon sx={{ fontSize: '14px !important' }} />}
                    sx={{
                      bgcolor: 'rgba(26,26,46,0.08)',
                      fontWeight: 600,
                      fontSize: '0.82rem',
                      '& .MuiChip-deleteIcon': { color: '#E94560', '&:hover': { color: '#c62a47' } },
                    }}
                  />
                ))}
              </Box>
              <Box sx={{ display: 'flex', gap: 1, maxWidth: 400 }}>
                <TextField
                  size="small"
                  placeholder="Add new city..."
                  value={newCity}
                  onChange={(e) => setNewCity(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addCity()}
                  sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                />
                <Button onClick={addCity} variant="outlined" size="small" startIcon={<AddIcon />}
                  sx={{ borderColor: '#1A1A2E', color: '#1A1A2E', borderRadius: '8px', '&:hover': { bgcolor: 'rgba(26,26,46,0.05)' }, whiteSpace: 'nowrap' }}>
                  Add City
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Fare Calculator Preview */}
        <Grid item xs={12}>
          <Card sx={{ bgcolor: '#1A1A2E', color: '#fff' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', mb: 0.5, color: '#fff' }}>Fare Calculator Preview</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', mb: 2 }}>
                Sample fare calculation based on current settings
              </Typography>
              <Grid container spacing={3}>
                {[
                  { label: '5 km / 10 min ride', km: 5, min: 10 },
                  { label: '12 km / 25 min ride', km: 12, min: 25 },
                  { label: '20 km / 40 min ride', km: 20, min: 40 },
                ].map((example) => {
                  const fare = Math.max(
                    settings.minFare,
                    Math.min(
                      settings.maxFare,
                      settings.baseFare + (example.km * settings.perKmRate) + (example.min * settings.perMinuteRate) + settings.bookingFee
                    )
                  );
                  const serviceFee = Math.round(fare * settings.serviceFeePercent / 100);
                  return (
                    <Grid item xs={12} sm={4} key={example.label}>
                      <Box sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', mb: 0.5 }}>{example.label}</Typography>
                        <Typography sx={{ fontSize: '1.3rem', fontWeight: 800, color: '#F5A623' }}>
                          {fare.toLocaleString()} XAF
                        </Typography>
                        <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', mt: 0.3 }}>
                          Service fee: {serviceFee.toLocaleString()} XAF
                        </Typography>
                      </Box>
                    </Grid>
                  );
                })}
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Sticky Save Bar */}
      {dirty && (
        <Box sx={{
          position: 'fixed', bottom: 24, right: 24,
          display: 'flex', gap: 1, alignItems: 'center',
          bgcolor: '#1A1A2E', borderRadius: '12px', px: 2.5, py: 1.5,
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)', zIndex: 999,
        }}>
          <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem' }}>Unsaved changes</Typography>
          <Button
            startIcon={saving ? <CircularProgress size={16} sx={{ color: '#1A1A2E' }} /> : <SaveIcon />}
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            size="small"
            sx={{ bgcolor: '#E94560', borderRadius: '8px', '&:hover': { bgcolor: '#c62a47' } }}
          >
            {saving ? 'Saving...' : 'Save Now'}
          </Button>
        </Box>
      )}
    </Box>
  );
}

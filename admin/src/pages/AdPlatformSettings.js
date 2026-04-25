import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Grid, TextField, Switch, FormControlLabel,
  Button, Divider, Chip, Alert, CircularProgress, Tab, Tabs,
  Select, MenuItem, FormControl, InputLabel, Slider, InputAdornment,
  IconButton, Tooltip,
} from '@mui/material';
import {
  Google as GoogleIcon,
  PhoneAndroid as AdMobIcon,
  Web as AdSenseIcon,
  Refresh as SplashIcon,
  Save as SaveIcon,
  Info as InfoIcon,
  CheckCircle as CheckIcon,
  Warning as WarnIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import { adPlatformAPI } from '../services/api';

// ── Test Ad Unit IDs provided by Google (safe to publish) ────────────────────
const ADMOB_TEST_IDS = {
  android: {
    banner:       'ca-app-pub-3940256099942544/6300978111',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
    rewarded:     'ca-app-pub-3940256099942544/5224354917',
    native:       'ca-app-pub-3940256099942544/2247696110',
  },
  ios: {
    banner:       'ca-app-pub-3940256099942544/2934735716',
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
    rewarded:     'ca-app-pub-3940256099942544/1712485313',
    native:       'ca-app-pub-3940256099942544/3986624511',
  },
};

const ANIMATION_TYPES = [
  { value: 'logo_pulse', label: 'Logo Pulse — scale breathe animation' },
  { value: 'logo_slide', label: 'Logo Slide — slide in from bottom' },
  { value: 'logo_fade',  label: 'Logo Fade — fade in with opacity' },
  { value: 'full_screen', label: 'Full Screen — expand from centre' },
];

function TabPanel({ children, value, index }) {
  return value === index ? <Box sx={{ pt: 3 }}>{children}</Box> : null;
}

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Tooltip title={copied ? 'Copied!' : 'Copy'}>
      <IconButton size="small" onClick={handleCopy}>
        {copied ? <CheckIcon fontSize="small" color="success" /> : <CopyIcon fontSize="small" />}
      </IconButton>
    </Tooltip>
  );
}

function StatusChip({ enabled, testMode }) {
  if (!enabled) return <Chip label="Disabled" size="small" color="default" />;
  if (testMode) return <Chip label="Test Mode" size="small" color="warning" icon={<WarnIcon />} />;
  return <Chip label="Live" size="small" color="success" icon={<CheckIcon />} />;
}

// ── AdMob Panel ───────────────────────────────────────────────────────────────
function AdMobPanel({ config, onChange, onSave, saving }) {
  const f = (field) => config[field] ?? '';
  const set = (field) => (e) => onChange({ ...config, [field]: e.target.value });
  const toggle = (field) => () => onChange({ ...config, [field]: !config[field] });

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <AdMobIcon sx={{ color: '#E8710A', fontSize: 32 }} />
        <Box>
          <Typography variant="h6" fontWeight={700}>Google AdMob</Typography>
          <Typography variant="body2" color="text.secondary">
            In-app banner, interstitial and rewarded video ads for the MOBO mobile app
          </Typography>
        </Box>
        <Box sx={{ ml: 'auto' }}>
          <StatusChip enabled={config.is_enabled} testMode={config.test_mode} />
        </Box>
      </Box>

      <Grid container spacing={2.5}>
        <Grid item xs={12}>
          <Box sx={{ display: 'flex', gap: 3 }}>
            <FormControlLabel
              control={<Switch checked={!!config.is_enabled} onChange={toggle('is_enabled')} color="success" />}
              label={<Typography fontWeight={600}>Enable AdMob</Typography>}
            />
            <FormControlLabel
              control={<Switch checked={!!config.test_mode} onChange={toggle('test_mode')} color="warning" />}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography fontWeight={600}>Test Mode</Typography>
                  <Tooltip title="Use Google's test ad unit IDs. Enable in production only after AdMob account is approved.">
                    <InfoIcon fontSize="small" color="action" />
                  </Tooltip>
                </Box>
              }
            />
          </Box>
        </Grid>

        <Grid item xs={12}>
          <Divider><Chip label="App Identity" size="small" /></Divider>
        </Grid>

        <Grid item xs={12} md={6}>
          <TextField fullWidth label="Publisher ID" value={f('publisher_id')}
            onChange={set('publisher_id')} size="small"
            placeholder="ca-app-pub-XXXXXXXXXXXXXXXX"
            helperText="Found in AdMob console → Account → Publisher ID"
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField fullWidth label="Android App ID" value={f('app_id')}
            onChange={set('app_id')} size="small"
            placeholder="ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX"
            helperText="AdMob → Apps → MOBO Android → App settings"
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField fullWidth label="iOS App ID" value={f('app_id_ios')}
            onChange={set('app_id_ios')} size="small"
            placeholder="ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX"
            helperText="AdMob → Apps → MOBO iOS → App settings"
          />
        </Grid>

        <Grid item xs={12}>
          <Divider><Chip label="Ad Unit IDs" size="small" /></Divider>
        </Grid>

        {[
          { field: 'banner_unit_id',       label: 'Banner Unit ID',       test: ADMOB_TEST_IDS.android.banner },
          { field: 'interstitial_unit_id', label: 'Interstitial Unit ID', test: ADMOB_TEST_IDS.android.interstitial },
          { field: 'rewarded_unit_id',     label: 'Rewarded Video Unit ID', test: ADMOB_TEST_IDS.android.rewarded },
          { field: 'native_unit_id',       label: 'Native Advanced Unit ID', test: ADMOB_TEST_IDS.android.native },
        ].map(({ field, label, test }) => (
          <Grid item xs={12} md={6} key={field}>
            <TextField fullWidth label={label} value={f(field)}
              onChange={set(field)} size="small"
              placeholder={config.test_mode ? test : 'ca-app-pub-XXXX/XXXXXXXXXX'}
              InputProps={config.test_mode ? {
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Auto-fill Google test ID">
                      <Button size="small" onClick={() => onChange({ ...config, [field]: test })}
                        sx={{ fontSize: '0.7rem', minWidth: 0, px: 1 }}>Test</Button>
                    </Tooltip>
                  </InputAdornment>
                )
              } : undefined}
            />
          </Grid>
        ))}

        {config.test_mode && (
          <Grid item xs={12}>
            <Alert severity="warning" icon={<WarnIcon />}>
              <strong>Test mode is ON.</strong> Ads display Google test creatives — no real revenue.
              Disable test mode only after your AdMob account is approved and production ad units are created.
            </Alert>
          </Grid>
        )}

        <Grid item xs={12}>
          <Button variant="contained" startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
            onClick={onSave} disabled={saving}
            sx={{ bgcolor: '#E8710A', '&:hover': { bgcolor: '#c95f08' } }}>
            {saving ? 'Saving…' : 'Save AdMob Config'}
          </Button>
        </Grid>
      </Grid>
    </Box>
  );
}

// ── AdSense Panel ─────────────────────────────────────────────────────────────
function AdSensePanel({ config, onChange, onSave, saving }) {
  const f = (field) => config[field] ?? '';
  const set = (field) => (e) => onChange({ ...config, [field]: e.target.value });
  const toggle = (field) => () => onChange({ ...config, [field]: !config[field] });

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <AdSenseIcon sx={{ color: '#4285F4', fontSize: 32 }} />
        <Box>
          <Typography variant="h6" fontWeight={700}>Google AdSense</Typography>
          <Typography variant="body2" color="text.secondary">
            Display ads on the MOBO Admin web dashboard (Netlify deployment)
          </Typography>
        </Box>
        <Box sx={{ ml: 'auto' }}>
          <StatusChip enabled={config.is_enabled} testMode={config.test_mode} />
        </Box>
      </Box>

      <Grid container spacing={2.5}>
        <Grid item xs={12}>
          <Box sx={{ display: 'flex', gap: 3 }}>
            <FormControlLabel
              control={<Switch checked={!!config.is_enabled} onChange={toggle('is_enabled')} color="success" />}
              label={<Typography fontWeight={600}>Enable AdSense</Typography>}
            />
            <FormControlLabel
              control={<Switch checked={!!config.test_mode} onChange={toggle('test_mode')} color="warning" />}
              label={<Typography fontWeight={600}>Test Mode (no real ads)</Typography>}
            />
          </Box>
        </Grid>

        <Grid item xs={12} md={6}>
          <TextField fullWidth label="Publisher ID (data-ad-client)" value={f('publisher_id')}
            onChange={(e) => onChange({ ...config, publisher_id: e.target.value, adsense_client: e.target.value })}
            size="small" placeholder="ca-pub-XXXXXXXXXXXXXXXX"
            helperText="AdSense → Account → Publisher ID"
          />
        </Grid>

        <Grid item xs={12}>
          <Divider><Chip label="Ad Slot IDs" size="small" /></Divider>
        </Grid>

        <Grid item xs={12} md={6}>
          <TextField fullWidth label="Header Banner Slot" value={f('adsense_slot_header')}
            onChange={set('adsense_slot_header')} size="small"
            placeholder="XXXXXXXXXX"
            helperText="Displayed at the top of admin pages"
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField fullWidth label="Sidebar Slot" value={f('adsense_slot_sidebar')}
            onChange={set('adsense_slot_sidebar')} size="small"
            placeholder="XXXXXXXXXX"
            helperText="Displayed in admin sidebar footer area"
          />
        </Grid>

        <Grid item xs={12}>
          <Alert severity="info">
            After saving, paste the AdSense auto-ads script into <strong>admin/public/index.html</strong>:
            <Box component="pre" sx={{ mt: 1, p: 1.5, bgcolor: '#f5f5f5', borderRadius: 1, fontSize: '0.75rem', overflowX: 'auto' }}>
              {`<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${f('publisher_id') || 'ca-pub-XXXXXXXXXXXXXXXX'}"\n     crossorigin="anonymous"></script>`}
            </Box>
          </Alert>
        </Grid>

        <Grid item xs={12}>
          <Button variant="contained" startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
            onClick={onSave} disabled={saving}
            sx={{ bgcolor: '#4285F4', '&:hover': { bgcolor: '#3367d6' } }}>
            {saving ? 'Saving…' : 'Save AdSense Config'}
          </Button>
        </Grid>
      </Grid>
    </Box>
  );
}

// ── Splash Config Panel ───────────────────────────────────────────────────────
function SplashPanel({ config, onChange, onSave, saving }) {
  const set = (field) => (e) => onChange({ ...config, [field]: e.target.value });
  const toggle = (field) => () => onChange({ ...config, [field]: !config[field] });

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <SplashIcon sx={{ color: '#FF00BF', fontSize: 32 }} />
        <Box>
          <Typography variant="h6" fontWeight={700}>Animated Splash Screen</Typography>
          <Typography variant="body2" color="text.secondary">
            Customise the animated loading screen shown on mobile app launch
          </Typography>
        </Box>
        <Chip label={config.enabled ? 'Enabled' : 'Disabled'} size="small"
          color={config.enabled ? 'success' : 'default'} sx={{ ml: 'auto' }} />
      </Box>

      <Grid container spacing={2.5}>
        <Grid item xs={12}>
          <FormControlLabel
            control={<Switch checked={!!config.enabled} onChange={toggle('enabled')} color="success" />}
            label={<Typography fontWeight={600}>Enable Animated Splash</Typography>}
          />
        </Grid>

        <Grid item xs={12} md={6}>
          <FormControl fullWidth size="small">
            <InputLabel>Animation Type</InputLabel>
            <Select value={config.animation_type || 'logo_pulse'} label="Animation Type"
              onChange={(e) => onChange({ ...config, animation_type: e.target.value })}>
              {ANIMATION_TYPES.map(({ value, label }) => (
                <MenuItem key={value} value={value}>{label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} md={6}>
          <Box>
            <Typography variant="body2" gutterBottom>
              Duration: <strong>{config.duration_ms || 2500}ms</strong>
            </Typography>
            <Slider value={config.duration_ms || 2500} min={500} max={6000} step={100}
              onChange={(_, v) => onChange({ ...config, duration_ms: v })}
              marks={[{ value: 500, label: '0.5s' }, { value: 2500, label: '2.5s' }, { value: 6000, label: '6s' }]}
              sx={{ color: '#FF00BF' }}
            />
          </Box>
        </Grid>

        <Grid item xs={12} md={6}>
          <Box>
            <Typography variant="body2" fontWeight={600} gutterBottom>Background Color</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ width: 36, height: 36, borderRadius: 1, bgcolor: config.background_color || '#1A1A2E', border: '1px solid #e0e0e0' }} />
              <TextField size="small" value={config.background_color || '#1A1A2E'} onChange={set('background_color')}
                sx={{ width: 140 }} placeholder="#1A1A2E" />
            </Box>
          </Box>
        </Grid>

        <Grid item xs={12} md={6}>
          <Box>
            <Typography variant="body2" fontWeight={600} gutterBottom>Logo / Accent Color</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ width: 36, height: 36, borderRadius: 1, bgcolor: config.logo_color || '#FF00BF', border: '1px solid #e0e0e0' }} />
              <TextField size="small" value={config.logo_color || '#FF00BF'} onChange={set('logo_color')}
                sx={{ width: 140 }} placeholder="#FF00BF" />
            </Box>
          </Box>
        </Grid>

        <Grid item xs={12}>
          <FormControlLabel
            control={<Switch checked={!!config.show_tagline} onChange={toggle('show_tagline')} />}
            label="Show tagline text"
          />
        </Grid>

        {config.show_tagline && (
          <Grid item xs={12} md={8}>
            <TextField fullWidth size="small" label="Tagline Text"
              value={config.tagline_text || 'Your ride, your way.'}
              onChange={set('tagline_text')}
              inputProps={{ maxLength: 60 }}
              helperText={`${(config.tagline_text || '').length}/60 characters`}
            />
          </Grid>
        )}

        {/* Preview */}
        <Grid item xs={12}>
          <Typography variant="body2" fontWeight={600} gutterBottom>Preview</Typography>
          <Box sx={{
            width: 180, height: 320, borderRadius: 3, overflow: 'hidden',
            bgcolor: config.background_color || '#1A1A2E',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 1.5, border: '1px solid #e0e0e0',
          }}>
            <Box sx={{
              width: 64, height: 64, borderRadius: '16px',
              bgcolor: config.logo_color || '#FF00BF',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Typography sx={{ color: '#fff', fontWeight: 900, fontSize: '1.5rem' }}>M</Typography>
            </Box>
            <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: '1.4rem', letterSpacing: '-0.5px' }}>MOBO</Typography>
            {config.show_tagline && (
              <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', textAlign: 'center', px: 2 }}>
                {config.tagline_text || 'Your ride, your way.'}
              </Typography>
            )}
            <Box sx={{ width: 32, height: 3, borderRadius: 2, bgcolor: config.logo_color || '#FF00BF', mt: 1, opacity: 0.7 }} />
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Approximate mobile preview ({config.animation_type})
          </Typography>
        </Grid>

        <Grid item xs={12}>
          <Button variant="contained" startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />}
            onClick={onSave} disabled={saving}
            sx={{ bgcolor: '#FF00BF', '&:hover': { bgcolor: '#cc009a' } }}>
            {saving ? 'Saving…' : 'Save Splash Config'}
          </Button>
        </Grid>
      </Grid>
    </Box>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function AdPlatformSettings() {
  const [tab,          setTab]          = useState(0);
  const [admob,        setAdmob]        = useState({});
  const [adsense,      setAdsense]      = useState({});
  const [splash,       setSplash]       = useState({});
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [saveTarget,   setSaveTarget]   = useState(null);
  const [alert,        setAlert]        = useState(null);

  const showAlert = (msg, sev = 'success') => {
    setAlert({ msg, sev });
    setTimeout(() => setAlert(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adPlatformAPI.listAll();
      const admobRow   = data.platforms?.find(p => p.platform === 'admob')   || {};
      const adsenseRow = data.platforms?.find(p => p.platform === 'adsense') || {};
      setAdmob(admobRow);
      setAdsense(adsenseRow);
      setSplash(data.splash || {});
    } catch {
      showAlert('Failed to load platform config', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (platform) => {
    setSaving(true);
    setSaveTarget(platform);
    try {
      if (platform === 'splash') {
        await adPlatformAPI.updateSplash(splash);
        showAlert('Splash config saved');
      } else {
        const body = platform === 'admob' ? admob : adsense;
        await adPlatformAPI.upsert(platform, body);
        showAlert(`${platform === 'admob' ? 'AdMob' : 'AdSense'} config saved`);
      }
    } catch (err) {
      showAlert(err.response?.data?.error || 'Failed to save', 'error');
    } finally {
      setSaving(false);
      setSaveTarget(null);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
        <CircularProgress sx={{ color: '#FF00BF' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 900 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Box sx={{ width: 44, height: 44, borderRadius: '10px', bgcolor: '#FF00BF',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <GoogleIcon sx={{ color: '#fff', fontSize: 24 }} />
        </Box>
        <Box>
          <Typography variant="h5" fontWeight={800}>Ad Platform & Splash Settings</Typography>
          <Typography variant="body2" color="text.secondary">
            Configure Google AdMob (mobile), Google AdSense (web admin), and animated splash screen
          </Typography>
        </Box>
      </Box>

      {alert && (
        <Alert severity={alert.sev} sx={{ mb: 2 }} onClose={() => setAlert(null)}>
          {alert.msg}
        </Alert>
      )}

      {/* Status bar */}
      <Paper sx={{ p: 2, mb: 3, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {[
          { label: 'AdMob',   enabled: admob.is_enabled,   testMode: admob.test_mode   },
          { label: 'AdSense', enabled: adsense.is_enabled, testMode: adsense.test_mode },
          { label: 'Splash',  enabled: splash.enabled,     testMode: false             },
        ].map(({ label, enabled, testMode }) => (
          <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">{label}:</Typography>
            <StatusChip enabled={enabled} testMode={testMode} />
          </Box>
        ))}
      </Paper>

      <Paper sx={{ p: 0 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: '1px solid #e0e0e0', px: 2 }}>
          <Tab label="AdMob (Mobile)" icon={<AdMobIcon />} iconPosition="start" />
          <Tab label="AdSense (Web)"  icon={<AdSenseIcon />} iconPosition="start" />
          <Tab label="Splash Screen"  icon={<SplashIcon />} iconPosition="start" />
        </Tabs>

        <Box sx={{ p: 3 }}>
          <TabPanel value={tab} index={0}>
            <AdMobPanel config={admob} onChange={setAdmob}
              onSave={() => save('admob')} saving={saving && saveTarget === 'admob'} />
          </TabPanel>
          <TabPanel value={tab} index={1}>
            <AdSensePanel config={adsense} onChange={setAdsense}
              onSave={() => save('adsense')} saving={saving && saveTarget === 'adsense'} />
          </TabPanel>
          <TabPanel value={tab} index={2}>
            <SplashPanel config={splash} onChange={setSplash}
              onSave={() => save('splash')} saving={saving && saveTarget === 'splash'} />
          </TabPanel>
        </Box>
      </Paper>

      {/* Setup guide */}
      <Paper sx={{ p: 2.5, mt: 3, bgcolor: '#f8f8f8' }}>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>Quick Setup Guide</Typography>
        <Box component="ol" sx={{ pl: 2, m: 0, '& li': { mb: 0.5, fontSize: '0.85rem', color: 'text.secondary' } }}>
          <li>Create a Google AdMob account at <strong>admob.google.com</strong> and add the MOBO app</li>
          <li>Copy Publisher ID and App IDs into the AdMob tab above</li>
          <li>Create ad units (Banner, Interstitial, Rewarded) and copy unit IDs</li>
          <li>Keep <strong>Test Mode ON</strong> during development — switch to Live only in production builds</li>
          <li>For AdSense, create an account at <strong>adsense.google.com</strong> and add the admin domain</li>
          <li>Paste the auto-ads script into <code>admin/public/index.html</code> (shown in AdSense tab)</li>
          <li>Configure the splash screen animation and save — the mobile app picks up changes on next launch</li>
        </Box>
      </Paper>
    </Box>
  );
}

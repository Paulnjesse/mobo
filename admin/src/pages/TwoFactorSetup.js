import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Card, CardContent, Typography, Button, TextField, Alert,
  CircularProgress, Chip, Grid, Dialog, DialogTitle, DialogContent,
  DialogActions, Divider, IconButton, Paper, Tooltip,
} from '@mui/material';
import {
  Security as SecurityIcon,
  CheckCircle as CheckCircleIcon,
  ContentCopy as CopyIcon,
  Download as DownloadIcon,
  Warning as WarningIcon,
  Close as CloseIcon,
  LockOpen as LockOpenIcon,
} from '@mui/icons-material';
import api from '../services/api';

// QR code — wrap in try/catch so the build doesn't fail if the package is absent
let QRCode = null;
try {
  // eslint-disable-next-line import/no-extraneous-dependencies
  QRCode = require('qrcode.react').default;
} catch {
  QRCode = null;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function SecretBox({ secret, onCopy }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        bgcolor: '#F8F9FA',
        borderRadius: '10px',
        fontFamily: 'monospace',
        fontSize: '1.1rem',
        letterSpacing: 3,
        wordBreak: 'break-all',
        textAlign: 'center',
        position: 'relative',
      }}
    >
      {secret}
      <Tooltip title="Copy secret">
        <IconButton
          size="small"
          onClick={onCopy}
          sx={{ position: 'absolute', top: 6, right: 6 }}
        >
          <CopyIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Paper>
  );
}

function BackupCodesGrid({ codes }) {
  return (
    <Grid container spacing={1} sx={{ mt: 1 }}>
      {codes.map((code, i) => (
        <Grid item xs={6} sm={3} key={i}>
          <Paper
            variant="outlined"
            sx={{
              p: 1,
              textAlign: 'center',
              fontFamily: 'monospace',
              fontWeight: 700,
              fontSize: '0.85rem',
              letterSpacing: 1.5,
              borderRadius: '8px',
              bgcolor: '#F8F9FA',
            }}
          >
            {code}
          </Paper>
        </Grid>
      ))}
    </Grid>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function TwoFactorSetup() {
  // 'loading' | 'inactive' | 'setup' | 'verify' | 'done' | 'active'
  const [phase, setPhase] = useState('loading');
  const [status, setStatus] = useState(null);      // GET /auth/2fa/status response
  const [setupData, setSetupData] = useState(null); // { secret, otpauth_url }
  const [token, setToken] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Disable dialog
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableToken, setDisableToken] = useState('');
  const [disableBusy, setDisableBusy] = useState(false);
  const [disableError, setDisableError] = useState('');

  const tokenInputRef = useRef(null);

  // ── fetch status on mount ──
  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    setPhase('loading');
    setError('');
    try {
      const res = await api.get('/auth/2fa/status');
      const data = res.data;
      setStatus(data);
      setPhase(data.enabled ? 'active' : 'inactive');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load 2FA status.');
      setPhase('inactive');
    }
  };

  // ── step 1: initiate setup ──
  const handleSetup = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/auth/2fa/setup');
      setSetupData(res.data); // { secret, otpauth_url }
      setPhase('setup');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to start 2FA setup.');
    } finally {
      setBusy(false);
    }
  };

  // ── step 2: verify TOTP ──
  const handleVerify = async () => {
    if (token.length !== 6) {
      setError('Please enter the 6-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/auth/2fa/verify', { token });
      const codes = res.data?.backup_codes || [];
      setBackupCodes(codes);
      setSuccess('2FA has been enabled successfully.');
      setPhase('done');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Invalid code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // ── disable 2FA ──
  const handleDisable = async () => {
    if (!disableToken.trim()) {
      setDisableError('Please enter your current TOTP code.');
      return;
    }
    setDisableBusy(true);
    setDisableError('');
    try {
      await api.delete('/auth/2fa', { data: { token: disableToken } });
      setDisableOpen(false);
      setDisableToken('');
      setSuccess('2FA has been disabled.');
      await fetchStatus();
    } catch (err) {
      setDisableError(err.response?.data?.message || err.message || 'Failed to disable 2FA.');
    } finally {
      setDisableBusy(false);
    }
  };

  const handleCopySecret = () => {
    if (setupData?.secret) {
      navigator.clipboard.writeText(setupData.secret).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadCodes = () => {
    const text = [
      'MOBO Admin — 2FA Backup Codes',
      'Generated: ' + new Date().toLocaleString(),
      'Save these codes somewhere safe. Each code can only be used once.',
      '',
      ...backupCodes,
    ].join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mobo-admin-2fa-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── token input: auto-submit at 6 digits ──
  const handleTokenChange = (val) => {
    const digits = val.replace(/\D/g, '').slice(0, 6);
    setToken(digits);
    setError('');
  };

  // ─── render helpers ──────────────────────────────────────────────────────

  const inputSx = {
    '& .MuiOutlinedInput-root': {
      borderRadius: '10px',
      '&:hover fieldset': { borderColor: '#000000' },
      '&.Mui-focused fieldset': { borderColor: '#000000' },
    },
    '& .MuiInputLabel-root.Mui-focused': { color: '#000000' },
  };

  const primaryBtn = {
    bgcolor: '#000000',
    '&:hover': { bgcolor: '#222222' },
    borderRadius: '10px',
    fontWeight: 700,
    py: 1.2,
  };

  if (phase === 'loading') {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress sx={{ color: '#000000' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 640, mx: 'auto', py: 4, px: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <SecurityIcon sx={{ fontSize: 28, color: '#000000' }} />
        <Typography variant="h5" fontWeight={700}>
          Two-Factor Authentication
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {/* ── ACTIVE STATE ── */}
      {phase === 'active' && (
        <Card sx={{ borderRadius: '16px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          <Box sx={{ height: 4, background: 'linear-gradient(90deg, #000000 0%, #4CAF50 100%)' }} />
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
              <Box
                sx={{
                  width: 56, height: 56, borderRadius: '14px',
                  bgcolor: 'rgba(76,175,80,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <CheckCircleIcon sx={{ fontSize: 32, color: '#4CAF50' }} />
              </Box>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography fontWeight={700} fontSize="1.1rem">2FA is Active</Typography>
                  <Chip
                    label="Enabled"
                    size="small"
                    sx={{ bgcolor: 'rgba(76,175,80,0.1)', color: '#4CAF50', fontWeight: 700, fontSize: '0.72rem', height: 22 }}
                  />
                </Box>
                {status?.verified_at && (
                  <Typography sx={{ fontSize: '0.82rem', color: 'rgba(0,0,0,0.55)', mt: 0.3 }}>
                    Enabled on {new Date(status.verified_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </Typography>
                )}
              </Box>
            </Box>

            <Grid container spacing={2} sx={{ mb: 3 }}>
              {status?.backup_codes_remaining != null && (
                <Grid item xs={12} sm={6}>
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: '10px', textAlign: 'center' }}>
                    <Typography sx={{ fontSize: '2rem', fontWeight: 800, color: '#000000' }}>
                      {status.backup_codes_remaining}
                    </Typography>
                    <Typography sx={{ fontSize: '0.78rem', color: 'rgba(0,0,0,0.55)', fontWeight: 600 }}>
                      Backup Codes Remaining
                    </Typography>
                  </Paper>
                </Grid>
              )}
            </Grid>

            <Divider sx={{ mb: 2.5 }} />
            <Button
              variant="outlined"
              color="error"
              startIcon={<LockOpenIcon />}
              onClick={() => setDisableOpen(true)}
              sx={{ borderRadius: '10px', fontWeight: 700 }}
            >
              Disable 2FA
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── INACTIVE STATE ── */}
      {phase === 'inactive' && (
        <Card sx={{ borderRadius: '16px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          <Box sx={{ height: 4, background: 'linear-gradient(90deg, #000000 0%, #E31837 50%, #FF6B35 100%)' }} />
          <CardContent sx={{ p: 3 }}>
            <Alert
              severity="info"
              icon={<SecurityIcon />}
              sx={{ mb: 3, borderRadius: '10px', '& .MuiAlert-message': { fontSize: '0.88rem' } }}
            >
              <strong>2FA adds an extra layer of security.</strong> You'll need Google Authenticator
              or a similar TOTP app installed on your phone.
            </Alert>

            <Typography fontWeight={700} sx={{ mb: 1 }}>
              Enable Two-Factor Authentication
            </Typography>
            <Typography sx={{ fontSize: '0.88rem', color: 'rgba(0,0,0,0.6)', mb: 3 }}>
              Once enabled, you'll be asked for a 6-digit code each time you log in.
            </Typography>

            <Button
              variant="contained"
              startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <SecurityIcon />}
              onClick={handleSetup}
              disabled={busy}
              sx={primaryBtn}
            >
              {busy ? 'Starting setup…' : 'Enable 2FA'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── SETUP STEP (show QR + secret) ── */}
      {phase === 'setup' && setupData && (
        <Card sx={{ borderRadius: '16px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          <Box sx={{ height: 4, background: 'linear-gradient(90deg, #000000 0%, #E31837 50%, #FF6B35 100%)' }} />
          <CardContent sx={{ p: 3 }}>
            <Typography fontWeight={700} fontSize="1.05rem" sx={{ mb: 2 }}>
              Scan the QR Code
            </Typography>

            {/* QR code */}
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 3 }}>
              {QRCode && setupData.otpauth_url ? (
                (() => {
                  try {
                    return (
                      <Paper
                        variant="outlined"
                        sx={{ p: 2, borderRadius: '12px', display: 'inline-block' }}
                      >
                        <QRCode value={setupData.otpauth_url} size={180} level="M" />
                      </Paper>
                    );
                  } catch {
                    return null;
                  }
                })()
              ) : (
                <Alert severity="info" sx={{ borderRadius: '10px' }}>
                  QR code library not loaded. Use the secret key below to add your account manually.
                </Alert>
              )}
            </Box>

            {/* Secret key */}
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(0,0,0,0.55)', mb: 1, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Or enter this key manually
            </Typography>
            <SecretBox secret={setupData.secret} onCopy={handleCopySecret} />
            {copied && (
              <Typography sx={{ fontSize: '0.78rem', color: '#4CAF50', mt: 0.5, textAlign: 'center' }}>
                Copied to clipboard!
              </Typography>
            )}

            {/* Instructions */}
            <Paper variant="outlined" sx={{ p: 2, borderRadius: '10px', mt: 3, bgcolor: '#FAFBFC' }}>
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, mb: 1.5, textTransform: 'uppercase', letterSpacing: 0.4, color: 'rgba(0,0,0,0.55)' }}>
                Setup instructions
              </Typography>
              {[
                'Install Google Authenticator (or Authy) on your phone.',
                'Tap the + button → "Scan a QR code" (or "Enter a setup key").',
                'Scan the QR code above, or enter the key manually.',
                'Enter the 6-digit code shown in the app below to verify.',
              ].map((step, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1.5, mb: 1 }}>
                  <Box
                    sx={{
                      width: 22, height: 22, borderRadius: '50%',
                      bgcolor: '#000000', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.72rem', fontWeight: 700, flexShrink: 0, mt: 0.1,
                    }}
                  >
                    {i + 1}
                  </Box>
                  <Typography sx={{ fontSize: '0.85rem', color: 'rgba(0,0,0,0.75)' }}>{step}</Typography>
                </Box>
              ))}
            </Paper>

            <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
              <Button
                variant="outlined"
                onClick={() => setPhase('inactive')}
                sx={{ borderRadius: '10px', fontWeight: 700, borderColor: '#000000', color: '#000000' }}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                onClick={() => { setPhase('verify'); setTimeout(() => tokenInputRef.current?.focus(), 100); }}
                sx={primaryBtn}
              >
                I've scanned it — Continue
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* ── VERIFY STEP ── */}
      {phase === 'verify' && (
        <Card sx={{ borderRadius: '16px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          <Box sx={{ height: 4, background: 'linear-gradient(90deg, #000000 0%, #E31837 50%, #FF6B35 100%)' }} />
          <CardContent sx={{ p: 3 }}>
            <Typography fontWeight={700} fontSize="1.05rem" sx={{ mb: 0.5 }}>
              Verify & Activate
            </Typography>
            <Typography sx={{ fontSize: '0.88rem', color: 'rgba(0,0,0,0.6)', mb: 3 }}>
              Enter the 6-digit code from your authenticator app to confirm setup.
            </Typography>

            <TextField
              inputRef={tokenInputRef}
              fullWidth
              label="6-digit code"
              value={token}
              onChange={(e) => handleTokenChange(e.target.value)}
              inputProps={{ maxLength: 6, inputMode: 'numeric', style: { letterSpacing: 8, fontSize: '1.4rem', textAlign: 'center' } }}
              disabled={busy}
              sx={{ ...inputSx, mb: 3 }}
            />

            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="outlined"
                onClick={() => setPhase('setup')}
                sx={{ borderRadius: '10px', fontWeight: 700, borderColor: '#000000', color: '#000000' }}
              >
                Back
              </Button>
              <Button
                variant="contained"
                onClick={handleVerify}
                disabled={busy || token.length !== 6}
                startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <CheckCircleIcon />}
                sx={primaryBtn}
              >
                {busy ? 'Verifying…' : 'Verify & Activate'}
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* ── DONE — show backup codes ── */}
      {phase === 'done' && (
        <Card sx={{ borderRadius: '16px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
          <Box sx={{ height: 4, background: 'linear-gradient(90deg, #4CAF50 0%, #000000 100%)' }} />
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
              <CheckCircleIcon sx={{ fontSize: 32, color: '#4CAF50' }} />
              <Typography fontWeight={700} fontSize="1.1rem" color="#4CAF50">
                2FA Enabled Successfully!
              </Typography>
            </Box>

            <Alert
              severity="warning"
              icon={<WarningIcon />}
              sx={{ mb: 2.5, borderRadius: '10px', '& .MuiAlert-message': { fontSize: '0.88rem' } }}
            >
              <strong>Save these backup codes.</strong> You can only see them once. Store them somewhere safe.
              If you lose access to your authenticator app, you can use one of these codes to log in.
            </Alert>

            {backupCodes.length > 0 && (
              <>
                <BackupCodesGrid codes={backupCodes} />
                <Box sx={{ mt: 2, display: 'flex', gap: 1.5 }}>
                  <Button
                    variant="outlined"
                    startIcon={<DownloadIcon />}
                    onClick={handleDownloadCodes}
                    sx={{ borderRadius: '10px', fontWeight: 700, borderColor: '#000000', color: '#000000' }}
                  >
                    Download Codes
                  </Button>
                  <Button
                    variant="contained"
                    onClick={() => { setPhase('active'); fetchStatus(); }}
                    sx={primaryBtn}
                  >
                    Done
                  </Button>
                </Box>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── DISABLE DIALOG ── */}
      <Dialog
        open={disableOpen}
        onClose={() => { setDisableOpen(false); setDisableToken(''); setDisableError(''); }}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: '16px' } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Typography fontWeight={700}>Disable Two-Factor Authentication</Typography>
          <IconButton size="small" onClick={() => { setDisableOpen(false); setDisableToken(''); setDisableError(''); }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <Divider />
        <DialogContent sx={{ pt: 2.5 }}>
          <Alert severity="warning" sx={{ mb: 2.5, borderRadius: '10px' }}>
            Disabling 2FA reduces your account security. Only do this if necessary.
          </Alert>
          {disableError && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }}>{disableError}</Alert>
          )}
          <TextField
            fullWidth
            label="Current 6-digit code"
            value={disableToken}
            onChange={(e) => { setDisableToken(e.target.value.replace(/\D/g, '').slice(0, 6)); setDisableError(''); }}
            inputProps={{ maxLength: 6, inputMode: 'numeric', style: { letterSpacing: 6, fontSize: '1.2rem', textAlign: 'center' } }}
            sx={inputSx}
          />
        </DialogContent>
        <Divider />
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button
            variant="outlined"
            onClick={() => { setDisableOpen(false); setDisableToken(''); setDisableError(''); }}
            sx={{ borderRadius: '10px' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDisable}
            disabled={disableBusy || disableToken.length !== 6}
            startIcon={disableBusy ? <CircularProgress size={16} color="inherit" /> : null}
            sx={{ borderRadius: '10px', fontWeight: 700 }}
          >
            {disableBusy ? 'Disabling…' : 'Disable 2FA'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

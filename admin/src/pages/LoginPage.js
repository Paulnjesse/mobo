import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, TextField, Button, Typography, Alert,
  InputAdornment, IconButton, CircularProgress, Link,
} from '@mui/material';
import {
  Email as EmailIcon,
  Lock as LockIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  DirectionsCar as DirectionsCarIcon,
  PhonelinkLock as TwoFAIcon,
  ArrowBack as BackIcon,
  ArrowForward as ArrowIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, complete2FA, isAuthenticated } = useAuth();

  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [showPwd,    setShowPwd]    = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  const [step,          setStep]          = useState(1);
  const [twoFaUserId,   setTwoFaUserId]   = useState(null);
  const [twoFaToken,    setTwoFaToken]    = useState('');
  const [twoFaLoading,  setTwoFaLoading]  = useState(false);
  const [twoFaError,    setTwoFaError]    = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const twoFaRef = useRef(null);

  useEffect(() => {
    if (step === 2) setTimeout(() => twoFaRef.current?.focus(), 150);
  }, [step]);

  if (isAuthenticated) { navigate('/'); return null; }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) { setError('Please enter both email and password.'); return; }
    setLoading(true); setError('');
    try {
      const result = await login(email.trim(), password);
      if (result?.requires_2fa) {
        setTwoFaUserId(result.tempToken);
        setTwoFaToken(''); setTwoFaError(''); setUseBackupCode(false);
        setStep(2);
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Login failed. Please check your credentials.');
    } finally { setLoading(false); }
  };

  const handleTwoFaSubmit = async (tokenValue) => {
    const tok = tokenValue ?? twoFaToken;
    if (!tok.trim()) { setTwoFaError('Please enter the code from your authenticator app.'); return; }
    setTwoFaLoading(true); setTwoFaError('');
    try {
      await complete2FA(twoFaUserId, tok.trim());
      navigate('/');
    } catch (err) {
      setTwoFaError(err.response?.data?.message || err.message || 'Invalid code. Please try again.');
    } finally { setTwoFaLoading(false); }
  };

  const handleTwoFaChange = (val) => {
    const maxLen = useBackupCode ? 8 : 6;
    const cleaned = useBackupCode
      ? val.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)
      : val.replace(/\D/g, '').slice(0, 6);
    setTwoFaToken(cleaned); setTwoFaError('');
    if (cleaned.length === maxLen) handleTwoFaSubmit(cleaned);
  };

  const goBack = () => {
    setStep(1); setTwoFaUserId(null); setTwoFaToken('');
    setTwoFaError(''); setUseBackupCode(false);
  };

  const inputSx = {
    '& .MuiOutlinedInput-root': {
      borderRadius: '6px',
      backgroundColor: '#F5F5F5',
      '& fieldset': { borderColor: 'transparent' },
      '&:hover fieldset': { borderColor: '#000000' },
      '&.Mui-focused fieldset': { borderColor: '#000000', borderWidth: 2 },
      '&.Mui-focused': { backgroundColor: '#fff' },
    },
    '& .MuiInputLabel-root.Mui-focused': { color: '#000000' },
  };

  const yellowBtn = {
    py: 1.6,
    bgcolor: '#FFD100',
    color: '#000000',
    borderRadius: '6px',
    fontSize: '0.95rem',
    fontWeight: 800,
    letterSpacing: '0.2px',
    boxShadow: 'none',
    '&:hover': { bgcolor: '#FFBA00', boxShadow: 'none' },
    '&:disabled': { bgcolor: '#F5F5F5', color: '#999' },
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', bgcolor: '#ffffff' }}>

      {/* ── Left panel — branding (desktop only) ── */}
      <Box sx={{
        display: { xs: 'none', md: 'flex' },
        width: '46%',
        bgcolor: '#000000',
        flexDirection: 'column',
        justifyContent: 'space-between',
        p: 6,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative circles */}
        <Box sx={{ position: 'absolute', width: 440, height: 440, borderRadius: '50%', bgcolor: '#FFD100', opacity: 0.07, top: -100, right: -130 }} />
        <Box sx={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', bgcolor: '#FFD100', opacity: 0.05, bottom: 40, left: -80 }} />

        {/* Logo */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, position: 'relative', zIndex: 1 }}>
          <Box sx={{ width: 48, height: 48, borderRadius: '10px', bgcolor: '#FFD100', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <DirectionsCarIcon sx={{ color: '#000000', fontSize: 26 }} />
          </Box>
          <Box>
            <Typography sx={{ color: '#ffffff', fontWeight: 800, fontSize: '1.5rem', lineHeight: 1, letterSpacing: '-0.5px' }}>MOBO</Typography>
            <Typography sx={{ color: '#FFD100', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', mt: 0.3 }}>Admin Console</Typography>
          </Box>
        </Box>

        {/* Hero text */}
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Typography sx={{ color: '#ffffff', fontWeight: 800, fontSize: '2.8rem', lineHeight: 1.12, letterSpacing: '-1px', mb: 2.5 }}>
            Manage your<br />
            <Box component="span" sx={{ color: '#FFD100' }}>ride-hailing</Box><br />
            platform.
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.92rem', lineHeight: 1.65 }}>
            Real-time oversight for drivers, riders,<br />
            payments and operations across Africa.
          </Typography>

          {/* Feature pills */}
          <Box sx={{ display: 'flex', gap: 1, mt: 3, flexWrap: 'wrap' }}>
            {['Live Map', 'Fraud Detection', 'RBAC', 'Audit Logs'].map(f => (
              <Box key={f} sx={{ px: 1.5, py: 0.5, borderRadius: '20px', border: '1px solid rgba(255,209,0,0.3)', bgcolor: 'rgba(255,209,0,0.08)' }}>
                <Typography sx={{ color: '#FFD100', fontSize: '0.72rem', fontWeight: 600 }}>{f}</Typography>
              </Box>
            ))}
          </Box>
        </Box>

        <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.75rem', position: 'relative', zIndex: 1 }}>
          © {new Date().getFullYear()} MOBO Technologies · Africa
        </Typography>
      </Box>

      {/* ── Right panel — form ── */}
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: { xs: 3, sm: 6 } }}>
        <Box sx={{ width: '100%', maxWidth: 400 }}>

          {/* Mobile logo */}
          <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1.5, mb: 5 }}>
            <Box sx={{ width: 42, height: 42, borderRadius: '8px', bgcolor: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DirectionsCarIcon sx={{ color: '#FFD100', fontSize: 22 }} />
            </Box>
            <Typography sx={{ fontWeight: 800, fontSize: '1.3rem', color: '#000000' }}>MOBO Admin</Typography>
          </Box>

          {/* ══ STEP 1 — sign in ══ */}
          {step === 1 && (
            <>
              <Typography sx={{ fontWeight: 800, fontSize: '2rem', color: '#000000', mb: 0.5, letterSpacing: '-0.5px', lineHeight: 1.2 }}>
                Welcome back
              </Typography>
              <Typography sx={{ color: '#888', fontSize: '0.9rem', mb: 4 }}>
                Sign in to your admin dashboard
              </Typography>

              {error && (
                <Alert severity="error" sx={{ mb: 3, borderRadius: '6px', fontSize: '0.85rem' }} onClose={() => setError('')}>
                  {error}
                </Alert>
              )}

              <Box component="form" onSubmit={handleSubmit}>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#000000', mb: 0.8 }}>Email address</Typography>
                <TextField
                  fullWidth size="small"
                  type="email" placeholder="admin@mobo.cm"
                  value={email} onChange={e => setEmail(e.target.value)}
                  disabled={loading}
                  InputProps={{ startAdornment: <InputAdornment position="start"><EmailIcon sx={{ color: '#bbb', fontSize: 18 }} /></InputAdornment> }}
                  sx={{ ...inputSx, mb: 2.5 }}
                />

                <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#000000', mb: 0.8 }}>Password</Typography>
                <TextField
                  fullWidth size="small"
                  type={showPwd ? 'text' : 'password'} placeholder="••••••••"
                  value={password} onChange={e => setPassword(e.target.value)}
                  disabled={loading}
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><LockIcon sx={{ color: '#bbb', fontSize: 18 }} /></InputAdornment>,
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton onClick={() => setShowPwd(v => !v)} edge="end" size="small" tabIndex={-1}>
                          {showPwd ? <VisibilityOffIcon sx={{ fontSize: 16, color: '#bbb' }} /> : <VisibilityIcon sx={{ fontSize: 16, color: '#bbb' }} />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                  sx={{ ...inputSx, mb: 4 }}
                />

                <Button type="submit" fullWidth variant="contained" disabled={loading}
                  endIcon={!loading && <ArrowIcon sx={{ fontSize: 18 }} />}
                  sx={yellowBtn}>
                  {loading
                    ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><CircularProgress size={18} sx={{ color: '#000' }} /><span>Signing in…</span></Box>
                    : 'Sign in'}
                </Button>
              </Box>

              <Box sx={{ mt: 5, pt: 3, borderTop: '1px solid #F0F0F0', textAlign: 'center' }}>
                <Typography sx={{ fontSize: '0.75rem', color: '#CCC' }}>
                  Restricted to authorised MOBO admin personnel only
                </Typography>
              </Box>
            </>
          )}

          {/* ══ STEP 2 — 2FA ══ */}
          {step === 2 && (
            <>
              <Box sx={{ width: 52, height: 52, borderRadius: '10px', bgcolor: '#FFD100', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3 }}>
                <TwoFAIcon sx={{ color: '#000000', fontSize: 26 }} />
              </Box>

              <Typography sx={{ fontWeight: 800, fontSize: '2rem', color: '#000000', mb: 0.5, letterSpacing: '-0.5px', lineHeight: 1.2 }}>
                Two-step verification
              </Typography>
              <Typography sx={{ color: '#888', fontSize: '0.9rem', mb: 4, lineHeight: 1.6 }}>
                {useBackupCode ? 'Enter one of your 8-character backup codes' : 'Enter the 6-digit code from your authenticator app'}
              </Typography>

              {twoFaError && (
                <Alert severity="error" sx={{ mb: 3, borderRadius: '6px', fontSize: '0.85rem' }} onClose={() => setTwoFaError('')}>
                  {twoFaError}
                </Alert>
              )}

              <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#000000', mb: 0.8 }}>
                {useBackupCode ? 'Backup code' : 'Authentication code'}
              </Typography>
              <TextField
                inputRef={twoFaRef}
                fullWidth size="small"
                placeholder={useBackupCode ? 'XXXXXXXX' : '000000'}
                value={twoFaToken} onChange={e => handleTwoFaChange(e.target.value)}
                disabled={twoFaLoading}
                inputProps={{
                  maxLength: useBackupCode ? 8 : 6,
                  inputMode: useBackupCode ? 'text' : 'numeric',
                  style: { letterSpacing: useBackupCode ? 8 : 12, fontSize: '1.8rem', textAlign: 'center', fontFamily: 'monospace', fontWeight: 800, padding: '16px 0' },
                }}
                helperText={twoFaLoading ? 'Verifying…' : (useBackupCode ? '' : 'Code auto-submits when 6 digits are entered')}
                sx={{ ...inputSx, mb: 3.5 }}
              />

              <Button fullWidth variant="contained"
                disabled={twoFaLoading || twoFaToken.length < (useBackupCode ? 8 : 6)}
                onClick={() => handleTwoFaSubmit()}
                endIcon={!twoFaLoading && <ArrowIcon sx={{ fontSize: 18 }} />}
                sx={yellowBtn}>
                {twoFaLoading
                  ? <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><CircularProgress size={18} sx={{ color: '#000' }} /><span>Verifying…</span></Box>
                  : 'Verify'}
              </Button>

              <Box sx={{ textAlign: 'center', mt: 3 }}>
                <Link component="button" type="button"
                  onClick={() => { setUseBackupCode(v => !v); setTwoFaToken(''); setTwoFaError(''); }}
                  sx={{ color: '#000000', fontSize: '0.83rem', fontWeight: 700, cursor: 'pointer', display: 'block', mb: 1.5, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
                  {useBackupCode ? 'Use authenticator app instead' : 'Use a backup code instead'}
                </Link>
                <Link component="button" type="button" onClick={goBack}
                  sx={{ color: '#999', fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 0.4, textDecoration: 'none', '&:hover': { color: '#000' } }}>
                  <BackIcon sx={{ fontSize: 14 }} /> Back to sign in
                </Link>
              </Box>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}

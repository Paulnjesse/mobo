import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
  CircularProgress,
  Link,
} from '@mui/material';
import {
  Email as EmailIcon,
  Lock as LockIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  DirectionsCar as DirectionsCarIcon,
  PhonelinkLock as TwoFAIcon,
  ArrowBack as BackIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, complete2FA, isAuthenticated } = useAuth();

  // ── Step 1 state ──
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Step 2 (2FA) state ──
  const [step, setStep] = useState(1);           // 1 | 2
  const [twoFaUserId, setTwoFaUserId] = useState(null);
  const [twoFaToken, setTwoFaToken] = useState('');
  const [twoFaLoading, setTwoFaLoading] = useState(false);
  const [twoFaError, setTwoFaError] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const twoFaInputRef = useRef(null);

  useEffect(() => {
    if (step === 2) {
      setTimeout(() => twoFaInputRef.current?.focus(), 150);
    }
  }, [step]);

  if (isAuthenticated) {
    navigate('/');
    return null;
  }

  // ── Step 1: submit email + password ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      // Use AuthContext.login — stores token in memory only (not localStorage)
      const result = await login(email.trim(), password);

      if (result?.requires_2fa) {
        // Server requires 2FA — switch to verification step
        setTwoFaUserId(result.tempToken);  // tempToken carries the pre-auth context
        setTwoFaToken('');
        setTwoFaError('');
        setUseBackupCode(false);
        setStep(2);
      } else {
        // Full session granted (only if admin has 2FA already set up and passed)
        navigate('/');
      }
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        'Login failed. Please check your credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: validate 2FA token ──
  const handleTwoFaSubmit = async (tokenValue) => {
    const tok = tokenValue ?? twoFaToken;
    if (!tok.trim()) {
      setTwoFaError('Please enter the code from your authenticator app.');
      return;
    }
    setTwoFaLoading(true);
    setTwoFaError('');
    try {
      // complete2FA stores final token in memory only (not localStorage)
      await complete2FA(twoFaUserId, tok.trim());
      navigate('/');
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        'Invalid code. Please try again.';
      setTwoFaError(msg);
    } finally {
      setTwoFaLoading(false);
    }
  };

  const handleTwoFaChange = (val) => {
    const maxLen = useBackupCode ? 8 : 6;
    const cleaned = useBackupCode ? val.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) : val.replace(/\D/g, '').slice(0, 6);
    setTwoFaToken(cleaned);
    setTwoFaError('');
    // Auto-submit when full length reached
    if (cleaned.length === maxLen) {
      handleTwoFaSubmit(cleaned);
    }
  };

  const goBackToStep1 = () => {
    setStep(1);
    setTwoFaUserId(null);
    setTwoFaToken('');
    setTwoFaError('');
    setUseBackupCode(false);
  };

  // ─── shared card wrapper ────────────────────────────────────────────────────
  const cardSx = {
    width: '100%',
    maxWidth: 420,
    borderRadius: '16px',
    boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
    position: 'relative',
    overflow: 'hidden',
  };

  const fieldSx = (mb = 0.5) => ({
    mb,
    '& .MuiOutlinedInput-root': {
      borderRadius: '10px',
      '&:hover fieldset': { borderColor: '#1A1A2E' },
      '&.Mui-focused fieldset': { borderColor: '#1A1A2E' },
    },
    '& .MuiInputLabel-root.Mui-focused': { color: '#1A1A2E' },
  });

  const primaryBtnSx = {
    py: 1.5,
    backgroundColor: '#1A1A2E',
    borderRadius: '10px',
    fontSize: '0.95rem',
    fontWeight: 700,
    letterSpacing: '0.3px',
    boxShadow: '0 4px 16px rgba(26,26,46,0.25)',
    '&:hover': { backgroundColor: '#0F1321', boxShadow: '0 6px 20px rgba(26,26,46,0.35)' },
    '&:disabled': { backgroundColor: 'rgba(26,26,46,0.4)' },
    transition: 'all 0.2s',
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1A1A2E 0%, #16213E 50%, #0F3460 100%)',
        p: 2,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background decoration */}
      {[...Array(5)].map((_, i) => (
        <Box
          key={i}
          sx={{
            position: 'absolute',
            width: [80, 120, 60, 100, 140][i],
            height: [80, 120, 60, 100, 140][i],
            borderRadius: '50%',
            border: '1px solid rgba(233,69,96,0.12)',
            top: ['10%', '70%', '20%', '80%', '40%'][i],
            left: ['5%', '85%', '60%', '10%', '75%'][i],
            animation: `float${i} ${6 + i}s ease-in-out infinite`,
          }}
        />
      ))}

      {/* ══ STEP 1 — email + password ══ */}
      {step === 1 && (
        <Card sx={cardSx}>
          {/* Top accent bar */}
          <Box sx={{ height: 4, background: 'linear-gradient(90deg, #1A1A2E 0%, #E94560 50%, #F5A623 100%)' }} />
          <CardContent sx={{ p: 4 }}>
            {/* Logo */}
            <Box sx={{ textAlign: 'center', mb: 4 }}>
              <Box
                sx={{
                  width: 70, height: 70, borderRadius: '18px',
                  background: 'linear-gradient(135deg, #E94560 0%, #F5A623 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  mx: 'auto', mb: 2, boxShadow: '0 8px 24px rgba(233,69,96,0.3)',
                }}
              >
                <DirectionsCarIcon sx={{ color: '#fff', fontSize: 36 }} />
              </Box>
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 800,
                  background: 'linear-gradient(135deg, #1A1A2E, #E94560)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  mb: 0.5,
                  letterSpacing: '-0.5px',
                }}
              >
                MOBO Admin
              </Typography>
              <Typography sx={{ color: 'rgba(26,26,46,0.5)', fontSize: '0.85rem' }}>
                Ride-Hailing Management Platform
              </Typography>
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 2.5, borderRadius: '8px', fontSize: '0.82rem' }} onClose={() => setError('')}>
                {error}
              </Alert>
            )}

            <Box component="form" onSubmit={handleSubmit}>
              <TextField
                fullWidth
                label="Email Address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                margin="normal"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <EmailIcon sx={{ color: 'rgba(26,26,46,0.4)', fontSize: 20 }} />
                    </InputAdornment>
                  ),
                }}
                sx={fieldSx(0.5)}
              />
              <TextField
                fullWidth
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                margin="normal"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon sx={{ color: 'rgba(26,26,46,0.4)', fontSize: 20 }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" size="small">
                        {showPassword ? (
                          <VisibilityOffIcon sx={{ fontSize: 18 }} />
                        ) : (
                          <VisibilityIcon sx={{ fontSize: 18 }} />
                        )}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={fieldSx(3)}
              />
              <Button type="submit" fullWidth variant="contained" disabled={loading} sx={primaryBtnSx}>
                {loading ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={18} sx={{ color: '#fff' }} />
                    <span>Signing In...</span>
                  </Box>
                ) : (
                  'Sign In to Dashboard'
                )}
              </Button>
            </Box>

            <Box sx={{ mt: 3, pt: 2.5, borderTop: '1px solid rgba(26,26,46,0.08)', textAlign: 'center' }}>
              <Typography sx={{ fontSize: '0.75rem', color: 'rgba(26,26,46,0.4)' }}>
                Restricted access — Admin credentials required
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: 'rgba(26,26,46,0.4)', mt: 0.3 }}>
                MOBO Ride-Hailing Platform &copy; {new Date().getFullYear()}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* ══ STEP 2 — 2FA verification ══ */}
      {step === 2 && (
        <Card sx={cardSx}>
          <Box sx={{ height: 4, background: 'linear-gradient(90deg, #1A1A2E 0%, #E94560 50%, #F5A623 100%)' }} />
          <CardContent sx={{ p: 4 }}>
            {/* Icon + title */}
            <Box sx={{ textAlign: 'center', mb: 3.5 }}>
              <Box
                sx={{
                  width: 64, height: 64, borderRadius: '16px',
                  background: 'linear-gradient(135deg, #1A1A2E 0%, #0F3460 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  mx: 'auto', mb: 2, boxShadow: '0 8px 24px rgba(26,26,46,0.3)',
                }}
              >
                <TwoFAIcon sx={{ color: '#fff', fontSize: 30 }} />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 800, color: '#1A1A2E', mb: 0.5 }}>
                Two-Factor Authentication
              </Typography>
              <Typography sx={{ color: 'rgba(26,26,46,0.55)', fontSize: '0.86rem', lineHeight: 1.5 }}>
                {useBackupCode
                  ? 'Enter one of your 8-character backup codes'
                  : 'Enter the 6-digit code from your authenticator app'}
              </Typography>
            </Box>

            {twoFaError && (
              <Alert severity="error" sx={{ mb: 2.5, borderRadius: '8px', fontSize: '0.82rem' }} onClose={() => setTwoFaError('')}>
                {twoFaError}
              </Alert>
            )}

            <TextField
              inputRef={twoFaInputRef}
              fullWidth
              label={useBackupCode ? 'Backup code' : '6-digit code'}
              value={twoFaToken}
              onChange={(e) => handleTwoFaChange(e.target.value)}
              disabled={twoFaLoading}
              inputProps={{
                maxLength: useBackupCode ? 8 : 6,
                inputMode: useBackupCode ? 'text' : 'numeric',
                style: {
                  letterSpacing: useBackupCode ? 4 : 8,
                  fontSize: '1.5rem',
                  textAlign: 'center',
                  fontFamily: 'monospace',
                },
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <TwoFAIcon sx={{ color: 'rgba(26,26,46,0.4)', fontSize: 20 }} />
                  </InputAdornment>
                ),
              }}
              sx={{ ...fieldSx(2.5), mt: 0 }}
              helperText={
                twoFaLoading ? 'Verifying…' : (useBackupCode ? '' : 'Code auto-submits when 6 digits are entered')
              }
            />

            <Button
              fullWidth
              variant="contained"
              disabled={twoFaLoading || twoFaToken.length < (useBackupCode ? 8 : 6)}
              onClick={() => handleTwoFaSubmit()}
              sx={primaryBtnSx}
            >
              {twoFaLoading ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CircularProgress size={18} sx={{ color: '#fff' }} />
                  <span>Verifying...</span>
                </Box>
              ) : (
                'Verify'
              )}
            </Button>

            {/* Backup code / normal toggle */}
            <Box sx={{ textAlign: 'center', mt: 2 }}>
              <Link
                component="button"
                type="button"
                variant="body2"
                onClick={() => {
                  setUseBackupCode(prev => !prev);
                  setTwoFaToken('');
                  setTwoFaError('');
                }}
                sx={{ color: '#1A1A2E', fontSize: '0.82rem', cursor: 'pointer' }}
              >
                {useBackupCode
                  ? 'Use authenticator code instead'
                  : 'Use a backup code instead'}
              </Link>
            </Box>

            {/* Back to step 1 */}
            <Box sx={{ textAlign: 'center', mt: 1 }}>
              <Link
                component="button"
                type="button"
                variant="body2"
                onClick={goBackToStep1}
                sx={{
                  color: 'rgba(26,26,46,0.5)',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.4,
                  textDecoration: 'none',
                  '&:hover': { color: '#1A1A2E' },
                }}
              >
                <BackIcon sx={{ fontSize: 14 }} />
                Back to sign in
              </Link>
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

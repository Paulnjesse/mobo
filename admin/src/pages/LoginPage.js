import React, { useState } from 'react';
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
} from '@mui/material';
import {
  Email as EmailIcon,
  Lock as LockIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  DirectionsCar as DirectionsCarIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (isAuthenticated) {
    navigate('/');
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login(email.trim(), password);
      navigate('/');
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

      <Card
        sx={{
          width: '100%',
          maxWidth: 420,
          borderRadius: '16px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Top accent bar */}
        <Box
          sx={{
            height: 4,
            background: 'linear-gradient(90deg, #1A1A2E 0%, #E94560 50%, #F5A623 100%)',
          }}
        />
        <CardContent sx={{ p: 4 }}>
          {/* Logo */}
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Box
              sx={{
                width: 70,
                height: 70,
                borderRadius: '18px',
                background: 'linear-gradient(135deg, #E94560 0%, #F5A623 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 2,
                boxShadow: '0 8px 24px rgba(233,69,96,0.3)',
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
            <Typography
              sx={{
                color: 'rgba(26,26,46,0.5)',
                fontSize: '0.85rem',
              }}
            >
              Ride-Hailing Management Platform
            </Typography>
          </Box>

          {error && (
            <Alert
              severity="error"
              sx={{ mb: 2.5, borderRadius: '8px', fontSize: '0.82rem' }}
              onClose={() => setError('')}
            >
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
              sx={{
                mb: 0.5,
                '& .MuiOutlinedInput-root': {
                  borderRadius: '10px',
                  '&:hover fieldset': { borderColor: '#1A1A2E' },
                  '&.Mui-focused fieldset': { borderColor: '#1A1A2E' },
                },
                '& .MuiInputLabel-root.Mui-focused': { color: '#1A1A2E' },
              }}
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
              sx={{
                mb: 3,
                '& .MuiOutlinedInput-root': {
                  borderRadius: '10px',
                  '&:hover fieldset': { borderColor: '#1A1A2E' },
                  '&.Mui-focused fieldset': { borderColor: '#1A1A2E' },
                },
                '& .MuiInputLabel-root.Mui-focused': { color: '#1A1A2E' },
              }}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={loading}
              sx={{
                py: 1.5,
                backgroundColor: '#1A1A2E',
                borderRadius: '10px',
                fontSize: '0.95rem',
                fontWeight: 700,
                letterSpacing: '0.3px',
                boxShadow: '0 4px 16px rgba(26,26,46,0.25)',
                '&:hover': {
                  backgroundColor: '#0F1321',
                  boxShadow: '0 6px 20px rgba(26,26,46,0.35)',
                },
                '&:disabled': { backgroundColor: 'rgba(26,26,46,0.4)' },
                transition: 'all 0.2s',
              }}
            >
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

          <Box
            sx={{
              mt: 3,
              pt: 2.5,
              borderTop: '1px solid rgba(26,26,46,0.08)',
              textAlign: 'center',
            }}
          >
            <Typography sx={{ fontSize: '0.75rem', color: 'rgba(26,26,46,0.4)' }}>
              Restricted access — Admin credentials required
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'rgba(26,26,46,0.4)', mt: 0.3 }}>
              MOBO Ride-Hailing Platform &copy; {new Date().getFullYear()}
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

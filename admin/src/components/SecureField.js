/**
 * SecureField.js
 *
 * Displays sensitive PII with masking by default.
 * Clicking "Reveal" fetches the decrypted value from the server, logs the access,
 * and triggers an admin notification.
 *
 * Usage:
 *   <SecureField
 *     label="Phone"
 *     userId={user.id}
 *     field="phone"
 *     maskedValue="+237 6XX XXX 123"
 *   />
 */
import React, { useState, useCallback } from 'react';
import {
  Box, Typography, IconButton, Tooltip, CircularProgress, Chip,
} from '@mui/material';
import {
  Visibility as RevealIcon,
  VisibilityOff as HideIcon,
  Lock as LockIcon,
} from '@mui/icons-material';
import { adminDataAPI } from '../services/api';

export default function SecureField({
  label,
  userId,
  field,
  maskedValue = '••••••••',
  sx = {},
}) {
  const [revealed,  setRevealed]  = useState(false);
  const [value,     setValue]     = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  const handleReveal = useCallback(async () => {
    if (revealed) {
      setRevealed(false);
      setValue(null);
      return;
    }
    setLoading(true); setError('');
    try {
      const res = await adminDataAPI.revealFields(userId, [field]);
      setValue(res.data?.data?.[field] || maskedValue);
      setRevealed(true);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to reveal');
    } finally { setLoading(false); }
  }, [revealed, userId, field, maskedValue]);

  return (
    <Box sx={{ position: 'relative', ...sx }}>
      <Typography sx={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.5)', mb: 0.2 }}>
        {label}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Box
          className="mobo-protected"
          sx={{
            fontFamily: revealed ? 'inherit' : 'monospace',
            fontSize: '0.88rem',
            fontWeight: 500,
            color: revealed ? '#000000' : '#9E9E9E',
            letterSpacing: revealed ? 'normal' : '0.1em',
            transition: 'all 0.2s',
            flex: 1,
          }}
        >
          {revealed ? value : maskedValue}
        </Box>
        {!revealed && (
          <LockIcon sx={{ fontSize: 13, color: '#CCC', flexShrink: 0 }} />
        )}
        <Tooltip title={revealed ? 'Hide (access has been logged)' : 'Reveal — access will be logged and admin notified'} arrow>
          <span>
            <IconButton
              size="small"
              onClick={handleReveal}
              disabled={loading}
              sx={{
                p: 0.3,
                color: revealed ? '#FFD100' : '#000000',
                opacity: 0.7,
                '&:hover': { opacity: 1, bgcolor: 'rgba(0,0,0,0.06)' },
              }}
            >
              {loading
                ? <CircularProgress size={13} color="inherit" />
                : revealed
                  ? <HideIcon sx={{ fontSize: 14 }} />
                  : <RevealIcon sx={{ fontSize: 14 }} />
              }
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      {revealed && (
        <Chip
          label="Access logged"
          size="small"
          sx={{
            mt: 0.4,
            height: 16,
            fontSize: '0.62rem',
            bgcolor: 'rgba(255,209,0,0.08)',
            color: '#FFD100',
          }}
        />
      )}
      {error && (
        <Typography sx={{ fontSize: '0.7rem', color: '#FFD100', mt: 0.3 }}>{error}</Typography>
      )}
    </Box>
  );
}

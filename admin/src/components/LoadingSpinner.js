import React from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { DirectionsCar as DirectionsCarIcon } from '@mui/icons-material';

export default function LoadingSpinner({ message = 'Loading...', fullPage = false }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: fullPage ? '100vh' : 300,
        gap: 2,
      }}
    >
      <Box sx={{ position: 'relative', display: 'inline-flex' }}>
        <CircularProgress
          size={56}
          thickness={3}
          sx={{ color: '#E31837' }}
        />
        <Box
          sx={{
            top: 0,
            left: 0,
            bottom: 0,
            right: 0,
            position: 'absolute',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #000000, #E31837)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <DirectionsCarIcon sx={{ color: '#fff', fontSize: 16 }} />
          </Box>
        </Box>
      </Box>
      {message && (
        <Typography
          sx={{
            color: 'rgba(0,0,0,0.5)',
            fontSize: '0.85rem',
            fontWeight: 500,
          }}
        >
          {message}
        </Typography>
      )}
    </Box>
  );
}

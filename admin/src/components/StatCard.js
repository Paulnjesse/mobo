import React from 'react';
import { Card, CardContent, Box, Typography, Skeleton } from '@mui/material';
import { TrendingUp as TrendingUpIcon, TrendingDown as TrendingDownIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

export default function StatCard({
  title,
  value,
  icon,
  iconBg = '#000000',
  iconColor = '#ffffff',
  trend,
  trendLabel,
  navigateTo,
  loading = false,
  subtitle,
}) {
  const navigate = useNavigate();
  const isPositive = trend >= 0;

  const handleClick = () => {
    if (navigateTo) navigate(navigateTo);
  };

  if (loading) {
    return (
      <Card sx={{ height: '100%', cursor: 'default' }}>
        <CardContent sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
            <Skeleton variant="rounded" width={48} height={48} />
            <Skeleton variant="rounded" width={60} height={22} />
          </Box>
          <Skeleton variant="text" width="50%" height={40} />
          <Skeleton variant="text" width="70%" height={20} sx={{ mt: 0.5 }} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      onClick={handleClick}
      sx={{
        height: '100%',
        cursor: navigateTo ? 'pointer' : 'default',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        '&:hover': navigateTo
          ? {
              transform: 'translateY(-2px)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
            }
          : {},
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Accent bar at top */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          backgroundColor: iconBg,
          opacity: 0.7,
        }}
      />
      <CardContent sx={{ p: 2.5, pt: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: '12px',
              backgroundColor: iconBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Box sx={{ color: iconColor, display: 'flex', '& .MuiSvgIcon-root': { fontSize: 24 } }}>
              {icon}
            </Box>
          </Box>

          {trend !== undefined && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.3,
                px: 1,
                py: 0.4,
                borderRadius: '20px',
                backgroundColor: isPositive ? 'rgba(76,175,80,0.1)' : 'rgba(255,209,0,0.1)',
              }}
            >
              {isPositive ? (
                <TrendingUpIcon sx={{ fontSize: 14, color: '#4CAF50' }} />
              ) : (
                <TrendingDownIcon sx={{ fontSize: 14, color: '#FFD100' }} />
              )}
              <Typography
                sx={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: isPositive ? '#4CAF50' : '#FFD100',
                }}
              >
                {Math.abs(trend)}%
              </Typography>
            </Box>
          )}
        </Box>

        <Typography
          sx={{
            fontSize: '1.75rem',
            fontWeight: 700,
            color: '#000000',
            lineHeight: 1.1,
            mb: 0.5,
          }}
        >
          {value}
        </Typography>
        <Typography
          sx={{
            fontSize: '0.82rem',
            fontWeight: 500,
            color: 'rgba(0,0,0,0.6)',
          }}
        >
          {title}
        </Typography>
        {trendLabel && (
          <Typography
            sx={{
              fontSize: '0.72rem',
              color: 'rgba(0,0,0,0.4)',
              mt: 0.3,
            }}
          >
            {trendLabel}
          </Typography>
        )}
        {subtitle && (
          <Typography
            sx={{
              fontSize: '0.72rem',
              color: 'rgba(0,0,0,0.4)',
              mt: 0.3,
            }}
          >
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

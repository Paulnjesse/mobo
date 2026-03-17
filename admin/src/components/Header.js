import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Avatar,
  Badge,
  Box,
  Menu,
  MenuItem,
  Divider,
  ListItemIcon,
} from '@mui/material';
import {
  Notifications as NotificationsIcon,
  AccountCircle,
  Logout as LogoutIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/users': 'User Management',
  '/drivers': 'Driver Management',
  '/rides': 'Ride Management',
  '/payments': 'Payments & Revenue',
  '/map': 'Live Map',
  '/surge': 'Surge Pricing',
  '/promotions': 'Promotions',
  '/notifications': 'Notifications',
  '/settings': 'Platform Settings',
};

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [anchorEl, setAnchorEl] = useState(null);
  const [notifAnchor, setNotifAnchor] = useState(null);

  const pageTitle = PAGE_TITLES[location.pathname] || 'MOBO Admin';

  const handleMenuOpen = (e) => setAnchorEl(e.currentTarget);
  const handleMenuClose = () => setAnchorEl(null);
  const handleNotifOpen = (e) => setNotifAnchor(e.currentTarget);
  const handleNotifClose = () => setNotifAnchor(null);

  const handleLogout = async () => {
    handleMenuClose();
    await logout();
    navigate('/login');
  };

  const userInitial = user?.name ? user.name.charAt(0).toUpperCase() : 'A';

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        backgroundColor: '#ffffff',
        borderBottom: '1px solid rgba(26,26,46,0.08)',
        zIndex: 1100,
      }}
    >
      {/* Red accent bar at top */}
      <Box
        sx={{
          height: 3,
          background: 'linear-gradient(90deg, #1A1A2E 0%, #E94560 50%, #F5A623 100%)',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
        }}
      />
      <Toolbar sx={{ pt: '3px', minHeight: '64px !important', px: 3 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography
            variant="h6"
            sx={{
              color: '#1A1A2E',
              fontWeight: 700,
              fontSize: '1.1rem',
            }}
          >
            {pageTitle}
          </Typography>
          <Typography
            sx={{
              color: 'rgba(26,26,46,0.45)',
              fontSize: '0.72rem',
              mt: -0.3,
            }}
          >
            MOBO Ride-Hailing Platform
          </Typography>
        </Box>

        {/* Notification Bell */}
        <IconButton
          onClick={handleNotifOpen}
          sx={{
            mr: 1,
            color: '#1A1A2E',
            '&:hover': { backgroundColor: 'rgba(26,26,46,0.06)' },
          }}
        >
          <Badge badgeContent={3} color="secondary">
            <NotificationsIcon />
          </Badge>
        </IconButton>

        <Menu
          anchorEl={notifAnchor}
          open={Boolean(notifAnchor)}
          onClose={handleNotifClose}
          PaperProps={{
            sx: { mt: 1, width: 320, borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' },
          }}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography variant="subtitle2" fontWeight={700} color="primary">
              Notifications
            </Typography>
          </Box>
          <Divider />
          {[
            { text: '3 new drivers pending approval', time: '5m ago', color: '#F5A623' },
            { text: 'Revenue target reached for today', time: '1h ago', color: '#4CAF50' },
            { text: 'System update available', time: '2h ago', color: '#E94560' },
          ].map((notif, i) => (
            <MenuItem
              key={i}
              onClick={handleNotifClose}
              sx={{ py: 1.5, px: 2, alignItems: 'flex-start' }}
            >
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: notif.color,
                  flexShrink: 0,
                  mt: 0.7,
                  mr: 1.5,
                }}
              />
              <Box>
                <Typography sx={{ fontSize: '0.82rem', color: '#1A1A2E', lineHeight: 1.4 }}>
                  {notif.text}
                </Typography>
                <Typography sx={{ fontSize: '0.72rem', color: 'rgba(26,26,46,0.45)', mt: 0.3 }}>
                  {notif.time}
                </Typography>
              </Box>
            </MenuItem>
          ))}
          <Divider />
          <MenuItem
            onClick={() => { handleNotifClose(); navigate('/notifications'); }}
            sx={{ justifyContent: 'center', color: '#E94560', fontSize: '0.82rem', fontWeight: 600 }}
          >
            View all notifications
          </MenuItem>
        </Menu>

        {/* Admin Avatar + Menu */}
        <Box
          onClick={handleMenuOpen}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.2,
            cursor: 'pointer',
            pl: 1.5,
            pr: 0.5,
            py: 0.5,
            borderRadius: '40px',
            border: '1px solid rgba(26,26,46,0.1)',
            '&:hover': { backgroundColor: 'rgba(26,26,46,0.04)' },
            transition: 'all 0.2s',
          }}
        >
          <Avatar
            sx={{
              width: 34,
              height: 34,
              background: 'linear-gradient(135deg, #1A1A2E, #E94560)',
              fontSize: '0.85rem',
              fontWeight: 700,
            }}
          >
            {userInitial}
          </Avatar>
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#1A1A2E', lineHeight: 1.2 }}>
              {user?.name || 'Admin'}
            </Typography>
            <Typography sx={{ fontSize: '0.68rem', color: 'rgba(26,26,46,0.45)' }}>
              Administrator
            </Typography>
          </Box>
        </Box>

        <Menu
          anchorEl={anchorEl}
          open={Boolean(anchorEl)}
          onClose={handleMenuClose}
          PaperProps={{
            sx: { mt: 1, width: 200, borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' },
          }}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#1A1A2E' }}>
              {user?.name || 'Admin User'}
            </Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'rgba(26,26,46,0.5)' }}>
              {user?.email || ''}
            </Typography>
          </Box>
          <Divider />
          <MenuItem onClick={() => { handleMenuClose(); navigate('/settings'); }}>
            <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
            <Typography fontSize="0.85rem">Settings</Typography>
          </MenuItem>
          <MenuItem onClick={handleLogout} sx={{ color: '#E94560' }}>
            <ListItemIcon><LogoutIcon fontSize="small" sx={{ color: '#E94560' }} /></ListItemIcon>
            <Typography fontSize="0.85rem">Logout</Typography>
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}

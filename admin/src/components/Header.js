import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AppBar, Toolbar, Typography, IconButton, Avatar, Badge, Box,
  Menu, MenuItem, Divider, ListItemIcon, Chip, Tooltip,
} from '@mui/material';
import {
  Notifications as NotificationsIcon,
  Logout as LogoutIcon,
  Settings as SettingsIcon,
  Shield as ShieldIcon,
  Download as DownloadIcon,
  PersonSearch as AccessIcon,
  AdminPanelSettings as AdminIcon,
  DoneAll as DoneAllIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { adminDataAPI } from '../services/api';

const PAGE_TITLES = {
  '/':              'Dashboard',
  '/users':         'User Management',
  '/drivers':       'Driver Management',
  '/fleets':        'Fleet Management',
  '/rides':         'Ride Management',
  '/payments':      'Payments & Revenue',
  '/map':           'Live Map',
  '/surge':         'Surge Pricing',
  '/promotions':    'Promotions',
  '/notifications': 'Notifications',
  '/settings':      'Platform Settings',
  '/admin-staff':   'Admin Staff Management',
  '/roles':         'Roles & Permissions',
  '/audit-log':     'Audit Log',
};

const NOTIF_ICONS = {
  data_access:  <AccessIcon sx={{ fontSize: 15, color: '#E31837' }} />,
  file_upload:  <DownloadIcon sx={{ fontSize: 15, color: '#2196F3' }} />,
  staff_created: <AdminIcon  sx={{ fontSize: 15, color: '#4CAF50' }} />,
  suspicious:   <ShieldIcon  sx={{ fontSize: 15, color: '#FF6B35' }} />,
};

const NOTIF_COLORS = {
  data_access: '#E31837', file_upload: '#2196F3', staff_created: '#4CAF50', suspicious: '#FF6B35',
};

const POLL_INTERVAL_MS = 30_000; // poll every 30 s

export default function Header() {
  const navigate  = useNavigate();
  const loc       = useLocation();
  const { user, logout, hasPermission } = useAuth();

  const [anchorEl,     setAnchorEl]     = useState(null);
  const [notifAnchor,  setNotifAnchor]  = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unread,        setUnread]        = useState(0);
  const pollRef = useRef(null);

  const pageTitle = PAGE_TITLES[loc.pathname] || 'MOBO Admin';
  const userInitial = (user?.full_name || user?.name || 'A').charAt(0).toUpperCase();

  // ── Poll notifications every 30 s ──────────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    try {
      const res = await adminDataAPI.getNotifications();
      setNotifications(res.data?.notifications || []);
      setUnread(res.data?.unread_count || 0);
    } catch { /* silent — don't break the header if API is down */ }
  }, []);

  useEffect(() => {
    fetchNotifications();
    pollRef.current = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [fetchNotifications]);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await adminDataAPI.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnread(0);
    } catch { /* silent */ }
  }, []);

  const handleMarkRead = useCallback(async (id) => {
    try {
      await adminDataAPI.markRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      setUnread(prev => Math.max(0, prev - 1));
    } catch { /* silent */ }
  }, []);

  const handleLogout = async () => {
    setAnchorEl(null);
    await logout();
    navigate('/login');
  };

  const formatTime = (ts) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <AppBar position="sticky" elevation={0}
      sx={{ backgroundColor: '#ffffff', borderBottom: '1px solid rgba(0,0,0,0.08)', zIndex: 1100 }}>
      <Box sx={{ height: 3, background: 'linear-gradient(90deg, #000000 0%, #E31837 50%, #FF6B35 100%)', position: 'absolute', top: 0, left: 0, right: 0 }} />
      <Toolbar sx={{ pt: '3px', minHeight: '64px !important', px: 3 }}>
        {/* Page title */}
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6" sx={{ color: '#000000', fontWeight: 700, fontSize: '1.1rem' }}>
            {pageTitle}
          </Typography>
          <Typography sx={{ color: 'rgba(0,0,0,0.45)', fontSize: '0.72rem', mt: -0.3 }}>
            MOBO Ride-Hailing Platform
          </Typography>
        </Box>

        {/* Audit log shortcut — only for users with access */}
        {hasPermission('admin:audit_logs') && (
          <Tooltip title="Access Audit Log" arrow>
            <IconButton onClick={() => navigate('/audit-log')} sx={{ mr: 0.5, color: '#000000', '&:hover': { bgcolor: 'rgba(0,0,0,0.06)' } }}>
              <ShieldIcon />
            </IconButton>
          </Tooltip>
        )}

        {/* Notification Bell */}
        <IconButton onClick={e => setNotifAnchor(e.currentTarget)}
          sx={{ mr: 1, color: '#000000', '&:hover': { bgcolor: 'rgba(0,0,0,0.06)' } }}>
          <Badge badgeContent={unread > 0 ? unread : null} color="error" max={99}>
            <NotificationsIcon />
          </Badge>
        </IconButton>

        {/* Notification Dropdown */}
        <Menu anchorEl={notifAnchor} open={Boolean(notifAnchor)} onClose={() => setNotifAnchor(null)}
          PaperProps={{ sx: { mt: 1, width: 380, borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.14)', maxHeight: 480, overflowY: 'auto' } }}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}>
          <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="subtitle2" fontWeight={700} color="#000000">
              Notifications
              {unread > 0 && (
                <Chip label={unread} size="small" sx={{ ml: 1, height: 18, fontSize: '0.65rem', bgcolor: '#E31837', color: '#ffffff' }} />
              )}
            </Typography>
            {unread > 0 && (
              <Tooltip title="Mark all as read">
                <IconButton size="small" onClick={handleMarkAllRead}>
                  <DoneAllIcon sx={{ fontSize: 16, color: '#000000' }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
          <Divider />

          {notifications.length === 0 ? (
            <Box sx={{ py: 3, textAlign: 'center' }}>
              <Typography sx={{ color: '#CCC', fontSize: '0.85rem' }}>No notifications</Typography>
            </Box>
          ) : notifications.slice(0, 20).map(n => (
            <MenuItem key={n.id} onClick={() => handleMarkRead(n.id)}
              sx={{
                py: 1.2, px: 2, alignItems: 'flex-start',
                bgcolor: n.is_read ? 'transparent' : 'rgba(227,24,55,0.03)',
                borderLeft: n.is_read ? 'none' : `3px solid ${NOTIF_COLORS[n.type] || '#E31837'}`,
              }}>
              <Box sx={{ mr: 1.2, mt: 0.3, flexShrink: 0 }}>
                {NOTIF_ICONS[n.type] || <NotificationsIcon sx={{ fontSize: 15, color: '#999' }} />}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: n.is_read ? 400 : 600, color: '#000000', lineHeight: 1.3 }}>
                  {n.title}
                </Typography>
                <Typography sx={{ fontSize: '0.72rem', color: '#888', mt: 0.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {n.message}
                </Typography>
                <Typography sx={{ fontSize: '0.68rem', color: '#BBB', mt: 0.2 }}>
                  {formatTime(n.created_at)}
                </Typography>
              </Box>
              {!n.is_read && (
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: NOTIF_COLORS[n.type] || '#E31837', flexShrink: 0, mt: 0.8, ml: 1 }} />
              )}
            </MenuItem>
          ))}

          <Divider />
          {hasPermission('admin:audit_logs') && (
            <MenuItem onClick={() => { setNotifAnchor(null); navigate('/audit-log'); }}
              sx={{ justifyContent: 'center', color: '#E31837', fontSize: '0.82rem', fontWeight: 600, py: 1 }}>
              View Full Audit Log
            </MenuItem>
          )}
        </Menu>

        {/* Admin Avatar + Menu */}
        <Box onClick={e => setAnchorEl(e.currentTarget)}
          sx={{ display: 'flex', alignItems: 'center', gap: 1.2, cursor: 'pointer', pl: 1.5, pr: 0.5, py: 0.5, borderRadius: '40px', border: '1px solid rgba(0,0,0,0.1)', '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' } }}>
          <Avatar sx={{ width: 34, height: 34, background: 'linear-gradient(135deg, #000000, #E31837)', fontSize: '0.85rem', fontWeight: 700 }}>
            {userInitial}
          </Avatar>
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: '#000000', lineHeight: 1.2 }}>
              {user?.full_name || user?.name || 'Admin'}
            </Typography>
            <Typography sx={{ fontSize: '0.68rem', color: 'rgba(0,0,0,0.45)', textTransform: 'capitalize' }}>
              {user?.admin_role?.replace(/_/g, ' ') || 'Admin'}
            </Typography>
          </Box>
        </Box>

        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}
          PaperProps={{ sx: { mt: 1, width: 220, borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' } }}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}>
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#000000' }}>
              {user?.full_name || user?.name || 'Admin User'}
            </Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.5)' }}>
              {user?.email || ''}
            </Typography>
            <Chip label={user?.admin_role?.replace(/_/g, ' ') || 'admin'} size="small"
              sx={{ mt: 0.5, height: 18, fontSize: '0.65rem', bgcolor: 'rgba(0,0,0,0.08)', textTransform: 'capitalize' }} />
          </Box>
          <Divider />
          <MenuItem onClick={() => { setAnchorEl(null); navigate('/settings'); }}>
            <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
            <Typography fontSize="0.85rem">Settings</Typography>
          </MenuItem>
          <MenuItem onClick={handleLogout} sx={{ color: '#E31837' }}>
            <ListItemIcon><LogoutIcon fontSize="small" sx={{ color: '#E31837' }} /></ListItemIcon>
            <Typography fontSize="0.85rem">Logout</Typography>
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}

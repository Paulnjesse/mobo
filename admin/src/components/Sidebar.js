import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  Tooltip,
} from '@mui/material';
import {
  Restaurant as RestaurantIcon,
  BarChart as BarChartIcon,
  People as PeopleIcon,
  DriveEta as DriveEtaIcon,
  DirectionsCar as DirectionsCarIcon,
  Payment as PaymentIcon,
  Map as MapIcon,
  Bolt as BoltIcon,
  LocalOffer as LocalOfferIcon,
  Shield as ShieldIcon,
  Notifications as NotificationsIcon,
  Settings as SettingsIcon,
  Logout as LogoutIcon,
  LocalShipping as FleetIcon,
  LocalOffer as FareIcon,
  Gavel as GavelIcon,
  WarningAmber as WarningAmberIcon,
  VerifiedUser as VerifiedUserIcon,
  PersonSearch as PersonSearchIcon,
  LocationOn as LocationOnIcon,
  Security as SecurityIcon,
  DeliveryDining as DeliveryDiningIcon,
  LocationCity as LocationCityIcon,
  Campaign as CampaignIcon,
  AdminPanelSettings as AdminPanelSettingsIcon,
  ManageAccounts as ManageAccountsIcon,
  Shield as ShieldIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';

// Items that always show for any authenticated admin
const BASE_NAV_ITEMS = [
  { label: 'Dashboard',    path: '/',             icon: <BarChartIcon /> },
  { label: 'Users',        path: '/users',         icon: <PeopleIcon /> },
  { label: 'Drivers',      path: '/drivers',       icon: <DriveEtaIcon /> },
  { label: 'Fleets',       path: '/fleets',        icon: <FleetIcon /> },
  { label: 'Rides',        path: '/rides',         icon: <DirectionsCarIcon /> },
  { label: 'Payments',     path: '/payments',      icon: <PaymentIcon /> },
  { label: 'Live Map',     path: '/map',           icon: <MapIcon /> },
  { label: 'Surge Pricing', path: '/surge',        icon: <BoltIcon /> },
  { label: 'Promotions',   path: '/promotions',    icon: <LocalOfferIcon /> },
  { label: 'Safety',        path: '/safety',       icon: <ShieldIcon /> },
  { label: 'Disputes',        path: '/disputes',        icon: <GavelIcon /> },
  { label: 'Doc Expiry',     path: '/doc-expiry',     icon: <WarningAmberIcon /> },
  { label: 'BG Checks',      path: '/bg-checks',      icon: <PersonSearchIcon /> },
  { label: 'Safety Zones',   path: '/safety-zones-mgr', icon: <LocationOnIcon /> },
  { label: '2FA Security',   path: '/2fa-setup',      icon: <SecurityIcon /> },
  { label: 'Deliveries',     path: '/deliveries-mgmt', icon: <DeliveryDiningIcon /> },
  { label: 'Multi-City',    path: '/multi-city',      icon: <LocationCityIcon /> },
  { label: 'Fare Mgmt',    path: '/fare-management', icon: <FareIcon /> },
  { label: 'Ad Banners',   path: '/ads',             icon: <CampaignIcon /> },
  { label: 'Food Delivery', path: '/food',           icon: <RestaurantIcon /> },
  { label: 'Notifications', path: '/notifications', icon: <NotificationsIcon /> },
  { label: 'Settings',     path: '/settings',      icon: <SettingsIcon /> },
];

// Items only shown to users with admin:manage_staff permission
const STAFF_NAV_ITEMS = [
  { label: 'Admin Staff',  path: '/admin-staff', icon: <ManageAccountsIcon /> },
];

// Items only shown to users with admin:manage_roles permission
const ROLES_NAV_ITEMS = [
  { label: 'Roles & Perms', path: '/roles', icon: <AdminPanelSettingsIcon /> },
];

// Items only shown to users with admin:audit_logs permission
const AUDIT_NAV_ITEMS = [
  { label: 'Audit Log', path: '/audit-log', icon: <ShieldIcon /> },
];

export default function Sidebar({ width = 240 }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user, hasPermission } = useAuth();

  const NAV_ITEMS = [
    ...BASE_NAV_ITEMS,
    ...(hasPermission('admin:manage_staff') ? STAFF_NAV_ITEMS : []),
    ...(hasPermission('admin:manage_roles') ? ROLES_NAV_ITEMS : []),
    ...(hasPermission('admin:audit_logs')   ? AUDIT_NAV_ITEMS : []),
  ];

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <Box
      sx={{
        width,
        flexShrink: 0,
        position: 'fixed',
        top: 0,
        left: 0,
        height: '100vh',
        backgroundColor: '#000000',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1200,
        boxShadow: '4px 0 20px rgba(0,0,0,0.15)',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
    >
      {/* Logo Area */}
      <Box
        sx={{
          px: 3,
          py: 2.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <Box
          sx={{
            width: 40, height: 40, borderRadius: '8px',
            bgcolor: '#FFD100',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <DirectionsCarIcon sx={{ color: '#000000', fontSize: 22 }} />
        </Box>
        <Box>
          <Typography sx={{ color: '#ffffff', fontWeight: 800, fontSize: '1.2rem', lineHeight: 1, letterSpacing: '-0.3px' }}>
            MOBO
          </Typography>
          <Typography sx={{ color: '#FFD100', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', mt: 0.2 }}>
            Admin
          </Typography>
        </Box>
      </Box>

      {/* Navigation Items */}
      <Box sx={{ flexGrow: 1, py: 1.5 }}>
        <List dense disablePadding>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.path);
            return (
              <ListItem key={item.path} disablePadding sx={{ px: 1.5, mb: 0.3 }}>
                <Tooltip title={item.label} placement="right" arrow>
                  <ListItemButton
                    onClick={() => navigate(item.path)}
                    sx={{
                      borderRadius: '7px',
                      px: 1.5,
                      py: 0.9,
                      backgroundColor: active ? '#FFD100' : 'transparent',
                      '&:hover': {
                        backgroundColor: active ? '#FFBA00' : 'rgba(255,255,255,0.07)',
                      },
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        color: active ? '#000000' : 'rgba(255,255,255,0.5)',
                        minWidth: 34,
                        '& .MuiSvgIcon-root': { fontSize: 19 },
                      }}
                    >
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{
                        fontSize: '0.855rem',
                        fontWeight: active ? 700 : 400,
                        color: active ? '#000000' : 'rgba(255,255,255,0.65)',
                        noWrap: true,
                      }}
                    />
                  </ListItemButton>
                </Tooltip>
              </ListItem>
            );
          })}
        </List>
      </Box>

      {/* User Info + Logout */}
      <Box>
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
        <Box sx={{ p: 2 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              mb: 1.5,
              p: 1.2,
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.05)',
            }}
          >
            <Box
              sx={{
                width: 34, height: 34, borderRadius: '50%',
                bgcolor: '#FFD100',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Typography sx={{ color: '#000000', fontWeight: 800, fontSize: '0.8rem' }}>
                {user?.name ? user.name.charAt(0).toUpperCase() : 'A'}
              </Typography>
            </Box>
            <Box sx={{ overflow: 'hidden' }}>
              <Typography
                sx={{
                  color: '#fff',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user?.name || 'Admin User'}
              </Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.7rem', textTransform: 'capitalize' }}>
                {user?.admin_role ? user.admin_role.replace(/_/g, ' ') : 'Administrator'}
              </Typography>
            </Box>
          </Box>
          <ListItemButton
            onClick={handleLogout}
            sx={{
              borderRadius: '8px',
              px: 1.5,
              py: 0.8,
              '&:hover': { backgroundColor: 'rgba(255,209,0,0.15)' },
              transition: 'all 0.2s',
            }}
          >
            <ListItemIcon sx={{ color: '#FFD100', minWidth: 34 }}>
              <LogoutIcon sx={{ fontSize: 18 }} />
            </ListItemIcon>
            <ListItemText
              primary="Logout"
              primaryTypographyProps={{
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#FFD100',
              }}
            />
          </ListItemButton>
        </Box>
      </Box>
    </Box>
  );
}

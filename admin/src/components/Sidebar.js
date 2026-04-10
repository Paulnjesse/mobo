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

export default function Sidebar({ width = 240 }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user, hasPermission } = useAuth();

  const NAV_ITEMS = [
    ...BASE_NAV_ITEMS,
    ...(hasPermission('admin:manage_staff') ? STAFF_NAV_ITEMS : []),
    ...(hasPermission('admin:manage_roles') ? ROLES_NAV_ITEMS : []),
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
        backgroundColor: '#1A1A2E',
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
            width: 40,
            height: 40,
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #E94560 0%, #F5A623 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <DirectionsCarIcon sx={{ color: '#fff', fontSize: 22 }} />
        </Box>
        <Box>
          <Typography
            variant="h6"
            sx={{
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '1.2rem',
              lineHeight: 1,
              letterSpacing: '0.5px',
            }}
          >
            MOBO
          </Typography>
          <Box
            component="span"
            sx={{
              display: 'inline-block',
              background: 'linear-gradient(135deg, #E94560, #F5A623)',
              color: '#fff',
              fontSize: '0.6rem',
              fontWeight: 700,
              px: 0.8,
              py: 0.2,
              borderRadius: '4px',
              letterSpacing: '1px',
              mt: 0.3,
            }}
          >
            ADMIN
          </Box>
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
                      borderRadius: '8px',
                      px: 1.5,
                      py: 1,
                      backgroundColor: active ? '#E94560' : 'transparent',
                      '&:hover': {
                        backgroundColor: active ? '#E94560' : 'rgba(255,255,255,0.07)',
                      },
                      transition: 'all 0.2s ease',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    {active && (
                      <Box
                        sx={{
                          position: 'absolute',
                          left: 0,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: 3,
                          height: '60%',
                          backgroundColor: '#F5A623',
                          borderRadius: '0 2px 2px 0',
                        }}
                      />
                    )}
                    <ListItemIcon
                      sx={{
                        color: active ? '#ffffff' : 'rgba(255,255,255,0.55)',
                        minWidth: 36,
                        '& .MuiSvgIcon-root': { fontSize: 20 },
                      }}
                    >
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{
                        fontSize: '0.875rem',
                        fontWeight: active ? 600 : 400,
                        color: active ? '#ffffff' : 'rgba(255,255,255,0.7)',
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
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #E94560, #F5A623)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '0.8rem' }}>
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
              '&:hover': { backgroundColor: 'rgba(233,69,96,0.15)' },
              transition: 'all 0.2s',
            }}
          >
            <ListItemIcon sx={{ color: '#E94560', minWidth: 34 }}>
              <LogoutIcon sx={{ fontSize: 18 }} />
            </ListItemIcon>
            <ListItemText
              primary="Logout"
              primaryTypographyProps={{
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#E94560',
              }}
            />
          </ListItemButton>
        </Box>
      </Box>
    </Box>
  );
}

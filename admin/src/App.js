import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline, Box } from '@mui/material';
import { AuthProvider, useAuth } from './context/AuthContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Drivers from './pages/Drivers';
import Rides from './pages/Rides';
import Payments from './pages/Payments';
import LocationMap from './pages/LocationMap';
import SurgePricing from './pages/SurgePricing';
import Promotions from './pages/Promotions';
import Notifications from './pages/Notifications';
import SafetyReports from './pages/SafetyReports';
import Settings from './pages/Settings';
import FleetManagement from './pages/FleetManagement';
import Disputes from './pages/Disputes';
import DocumentExpiry from './pages/DocumentExpiry';
import TwoFactorSetup from './pages/TwoFactorSetup';
import BackgroundChecks from './pages/BackgroundChecks';
import SafetyZones from './pages/SafetyZones';
import Deliveries from './pages/Deliveries';
import MultiCity from './pages/MultiCity';
import FareManagement from './pages/FareManagement';
import AdsManagement from './pages/AdsManagement';
import FoodManagement from './pages/FoodManagement';
import AdminManagement from './pages/AdminManagement';
import RoleManagement from './pages/RoleManagement';
import AuditLog from './pages/AuditLog';
import VehicleInspection from './pages/VehicleInspection';
import { CopyProtectionProvider } from './components/CopyProtection';

const theme = createTheme({
  palette: {
    primary: {
      main: '#000000',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#E31837',
      contrastText: '#ffffff',  // white text on red
    },
    warning: {
      main: '#FF6B35',
    },
    error: {
      main: '#E53935',
    },
    background: {
      default: '#FFFFFF',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    h4: { fontWeight: 800 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 600 },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 700,
          borderRadius: 50,
          letterSpacing: '0.1px',
        },
        containedPrimary: {
          backgroundColor: '#000000',
          color: '#ffffff',
          '&:hover': { backgroundColor: '#222222' },
        },
        containedSecondary: {
          backgroundColor: '#E31837',
          color: '#ffffff',
          '&:hover': { backgroundColor: '#C4132D' },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          '&.Mui-selected': { color: '#000000' },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: { backgroundColor: '#E31837', height: 3 },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          border: '1px solid rgba(0,0,0,0.06)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { borderRadius: 10 },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-head': {
            backgroundColor: '#F7F7F7',
            fontWeight: 700,
            color: '#000000',
            fontSize: '0.78rem',
            textTransform: 'uppercase',
            letterSpacing: '0.4px',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600 },
      },
    },
  },
});

const SIDEBAR_WIDTH = 240;

function ProtectedLayout() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return (
    <CopyProtectionProvider>
      <Box sx={{ display: 'flex', minHeight: '100vh', background: '#FFFFFF' }}>
        <Sidebar width={SIDEBAR_WIDTH} />
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            ml: `${SIDEBAR_WIDTH}px`,
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100vh',
          }}
        >
          <Header />
          <Box sx={{ flexGrow: 1, p: 3, pt: 2 }}>
            <Outlet />
          </Box>
        </Box>
      </Box>
    </CopyProtectionProvider>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedLayout />}>
              <Route path="/"             element={<Dashboard />} />
              <Route path="/users"        element={<Users />} />
              <Route path="/drivers"      element={<Drivers />} />
              <Route path="/fleets"       element={<FleetManagement />} />
              <Route path="/rides"        element={<Rides />} />
              <Route path="/payments"     element={<Payments />} />
              <Route path="/map"          element={<LocationMap />} />
              <Route path="/surge"        element={<SurgePricing />} />
              <Route path="/promotions"   element={<Promotions />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/safety"       element={<SafetyReports />} />
              <Route path="/disputes"          element={<Disputes />} />
              <Route path="/doc-expiry"        element={<DocumentExpiry />} />
              <Route path="/bg-checks"         element={<BackgroundChecks />} />
              <Route path="/safety-zones-mgr"  element={<SafetyZones />} />
              <Route path="/2fa-setup"         element={<TwoFactorSetup />} />
              <Route path="/deliveries-mgmt"   element={<Deliveries />} />
              <Route path="/multi-city"        element={<MultiCity />} />
              <Route path="/fare-management"   element={<FareManagement />} />
              <Route path="/ads"               element={<AdsManagement />} />
              <Route path="/food"              element={<FoodManagement />} />
              <Route path="/admin-staff"       element={<AdminManagement />} />
              <Route path="/roles"             element={<RoleManagement />} />
              <Route path="/audit-log"         element={<AuditLog />} />
              <Route path="/vehicle-inspection" element={<VehicleInspection />} />
              <Route path="/settings"          element={<Settings />} />
              <Route path="*"             element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;

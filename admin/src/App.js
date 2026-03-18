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

const theme = createTheme({
  palette: {
    primary: {
      main: '#1A1A2E',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#E94560',
      contrastText: '#ffffff',
    },
    warning: {
      main: '#F5A623',
    },
    background: {
      default: '#F8F9FA',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 600 },
  },
  shape: {
    borderRadius: 10,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 8,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 2px 12px rgba(26,26,46,0.08)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-head': {
            backgroundColor: '#F8F9FA',
            fontWeight: 600,
            color: '#1A1A2E',
          },
        },
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
    <Box sx={{ display: 'flex', minHeight: '100vh', background: '#F8F9FA' }}>
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
              <Route path="/settings"     element={<Settings />} />
              <Route path="*"             element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;

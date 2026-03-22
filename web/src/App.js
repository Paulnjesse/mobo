import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import BookRidePage from './pages/BookRidePage';
import RideTrackingPage from './pages/RideTrackingPage';
import RideHistoryPage from './pages/RideHistoryPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import CorporateDashboardPage from './pages/CorporateDashboardPage';
import ProfilePage from './pages/ProfilePage';

function ProtectedRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

function Layout({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <main style={{ flex: 1 }}>{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={
            <ProtectedRoute>
              <Layout><BookRidePage /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/track/:rideId" element={
            <ProtectedRoute>
              <Layout><RideTrackingPage /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/history" element={
            <ProtectedRoute>
              <Layout><RideHistoryPage /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/corporate" element={
            <ProtectedRoute>
              <Layout><CorporateDashboardPage /></Layout>
            </ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute>
              <Layout><ProfilePage /></Layout>
            </ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

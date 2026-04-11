import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Card, CardContent, Typography, Chip, Button, ToggleButton,
  ToggleButtonGroup, Alert, CircularProgress,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  MyLocation as MyLocationIcon,
  Wifi as WifiIcon,
  WifiOff as WifiOffIcon,
} from '@mui/icons-material';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { io } from 'socket.io-client';
import { mapAPI } from '../services/api';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL?.replace('/api', '') || 'https://mobo-api-gateway.onrender.com';

// Fix Leaflet default icon path
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom driver icons
const createDriverIcon = (color) =>
  L.divIcon({
    html: `<div style="
      width: 32px; height: 32px;
      background: ${color};
      border: 3px solid #fff;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      display: flex; align-items: center; justify-content: center;
    ">
      <div style="transform: rotate(45deg); font-size: 14px;">🚗</div>
    </div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });

const ONLINE_ICON = createDriverIcon('#4CAF50');
const ON_RIDE_ICON = createDriverIcon('#E31837');
const OFFLINE_ICON = createDriverIcon('#9E9E9E');

// Mock driver data centered on Douala/Yaoundé, Cameroon
const MOCK_DRIVERS = [
  { id: 'd1', name: 'Martin Eto', vehicle: 'Toyota Corolla', rating: 4.8, lat: 4.0511, lng: 9.7679, online: true, onRide: false, city: 'Douala' },
  { id: 'd2', name: 'Pierre Ngo', vehicle: 'Hyundai i10', rating: 4.6, lat: 4.0621, lng: 9.7789, online: true, onRide: true, city: 'Douala' },
  { id: 'd3', name: 'Jacques Biya', vehicle: 'Kia Rio', rating: 4.5, lat: 3.8634, lng: 11.5200, online: true, onRide: false, city: 'Yaoundé' },
  { id: 'd4', name: 'Eric Mbe', vehicle: 'Peugeot 301', rating: 4.9, lat: 3.8734, lng: 11.5100, online: true, onRide: true, city: 'Yaoundé' },
  { id: 'd5', name: 'Denis Fouda', vehicle: 'Honda Civic', rating: 4.3, lat: 4.0400, lng: 9.7900, online: true, onRide: false, city: 'Douala' },
  { id: 'd6', name: 'Alain Samba', vehicle: 'Toyota Corolla', rating: 4.7, lat: 4.0300, lng: 9.7600, online: false, onRide: false, city: 'Douala' },
  { id: 'd7', name: 'Felix Ondo', vehicle: 'Nissan Almera', rating: 4.4, lat: 3.8900, lng: 11.5300, online: true, onRide: false, city: 'Yaoundé' },
  { id: 'd8', name: 'Joseph Essam', vehicle: 'VW Polo', rating: 4.2, lat: 3.8500, lng: 11.5050, online: false, onRide: false, city: 'Yaoundé' },
];

const MOCK_ACTIVE_RIDES = [
  {
    id: 'R-8820',
    driver: MOCK_DRIVERS[1],
    pickup: [4.0600, 9.7750],
    dropoff: [4.0700, 9.7900],
    rider: 'Alice Mbeki',
  },
  {
    id: 'R-8813',
    driver: MOCK_DRIVERS[3],
    pickup: [3.8700, 11.5150],
    dropoff: [3.8800, 11.5250],
    rider: 'Victor Muna',
  },
];

function MapController({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [map, center, zoom]);
  return null;
}

export default function LocationMap() {
  const [drivers, setDrivers] = useState([]);
  const [activeRides, setActiveRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [socketConnected, setSocketConnected] = useState(false);
  const intervalRef = useRef(null);
  const socketRef = useRef(null);

  const fetchMapData = useCallback(async () => {
    try {
      const [dRes, rRes] = await Promise.allSettled([mapAPI.getOnlineDrivers(), mapAPI.getActiveRides()]);
      const dData = dRes.status === 'fulfilled' ? (dRes.value.data || []) : [];
      const rData = rRes.status === 'fulfilled' ? (rRes.value.data || []) : [];
      setDrivers(dData.length ? dData : MOCK_DRIVERS);
      setActiveRides(rData.length ? rData : MOCK_ACTIVE_RIDES);
      setLastUpdated(new Date());
      setError('');
    } catch {
      setDrivers(MOCK_DRIVERS);
      setActiveRides(MOCK_ACTIVE_RIDES);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMapData();
  }, [fetchMapData]);

  // ── 30-second polling ──────────────────────────────────────────────────
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchMapData, 30000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, fetchMapData]);

  // ── Socket.IO — real-time driver location updates ──────────────────────
  useEffect(() => {
    const token = localStorage.getItem('mobo_admin_token');
    const socket = io(`${SOCKET_URL}/rides`, {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 3000,
    });
    socketRef.current = socket;

    socket.on('connect', () => setSocketConnected(true));
    socket.on('disconnect', () => setSocketConnected(false));

    // Move a driver marker in real-time
    socket.on('driver_location_update', (payload) => {
      const { driverId, latitude, longitude } = payload;
      if (!driverId || latitude == null || longitude == null) return;
      setDrivers((prev) =>
        prev.map((d) =>
          String(d.id) === String(driverId)
            ? { ...d, lat: latitude, lng: longitude }
            : d
        )
      );
    });

    // Keep ride list fresh on status change
    socket.on('ride_status_change', () => {
      mapAPI.getActiveRides().then((res) => {
        const data = res.data || [];
        if (data.length) setActiveRides(data);
      }).catch(() => {});
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const filteredDrivers = drivers.filter((d) => {
    if (filter === 'all') return true;
    if (filter === 'on_ride') return d.onRide;
    if (filter === 'online') return d.online && !d.onRide;
    return true;
  });

  const getIcon = (driver) => {
    if (!driver.online) return OFFLINE_ICON;
    if (driver.onRide) return ON_RIDE_ICON;
    return ONLINE_ICON;
  };

  const onlineCount = drivers.filter((d) => d.online && !d.onRide).length;
  const onRideCount = drivers.filter((d) => d.onRide).length;
  const offlineCount = drivers.filter((d) => !d.online).length;

  return (
    <Box sx={{ height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>Live Driver Map</Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {/* Socket status badge */}
          <Chip
            icon={socketConnected ? <WifiIcon sx={{ fontSize: '0.85rem !important' }} /> : <WifiOffIcon sx={{ fontSize: '0.85rem !important' }} />}
            label={socketConnected ? 'Live' : 'Polling'}
            size="small"
            sx={{
              bgcolor: socketConnected ? 'rgba(76,175,80,0.1)' : 'rgba(158,158,158,0.1)',
              color: socketConnected ? '#4CAF50' : '#9E9E9E',
              fontWeight: 700, fontSize: '0.7rem', height: 22,
              border: `1px solid ${socketConnected ? '#4CAF50' : '#9E9E9E'}40`,
            }}
          />
          {lastUpdated && (
            <Typography sx={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.45)' }}>
              Updated: {lastUpdated.toLocaleTimeString()}
            </Typography>
          )}
          <Button
            size="small"
            variant={autoRefresh ? 'contained' : 'outlined'}
            onClick={() => setAutoRefresh((v) => !v)}
            sx={{
              fontSize: '0.75rem',
              bgcolor: autoRefresh ? '#4CAF50' : 'transparent',
              borderColor: '#4CAF50',
              color: autoRefresh ? '#fff' : '#4CAF50',
              '&:hover': { bgcolor: autoRefresh ? '#388E3C' : 'rgba(76,175,80,0.08)' },
              borderRadius: '8px',
            }}
          >
            Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
          </Button>
          <Button
            startIcon={loading ? <CircularProgress size={14} /> : <RefreshIcon />}
            onClick={fetchMapData}
            disabled={loading}
            size="small"
            sx={{ borderRadius: '8px', color: '#000000', border: '1px solid rgba(0,0,0,0.15)', '&:hover': { bgcolor: 'rgba(0,0,0,0.05)' } }}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="warning" sx={{ mb: 2, borderRadius: '8px' }} onClose={() => setError('')}>{error}</Alert>}

      {/* Stats Row */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Drivers', value: drivers.length, color: '#000000' },
          { label: 'Online', value: onlineCount, color: '#4CAF50' },
          { label: 'On Ride', value: onRideCount, color: '#E31837' },
          { label: 'Offline', value: offlineCount, color: '#9E9E9E' },
          { label: 'Active Rides', value: activeRides.length, color: '#2196F3' },
        ].map((item) => (
          <Card key={item.label} sx={{ flex: '1 1 auto', minWidth: 110 }}>
            <CardContent sx={{ p: '12px !important', textAlign: 'center' }}>
              <Typography sx={{ fontSize: '1.4rem', fontWeight: 800, color: item.color }}>{item.value}</Typography>
              <Typography sx={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.55)' }}>{item.label}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* Filter + Legend */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <ToggleButtonGroup
          value={filter}
          exclusive
          onChange={(_, v) => v && setFilter(v)}
          size="small"
          sx={{ '& .MuiToggleButton-root': { borderRadius: '8px !important', px: 2, fontSize: '0.78rem', fontWeight: 600, border: '1px solid rgba(0,0,0,0.15) !important' } }}
        >
          <ToggleButton value="all">All Drivers</ToggleButton>
          <ToggleButton value="online">Online Only</ToggleButton>
          <ToggleButton value="on_ride">On Ride</ToggleButton>
        </ToggleButtonGroup>

        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          {[
            { color: '#4CAF50', label: 'Online' },
            { color: '#E31837', label: 'On Ride' },
            { color: '#9E9E9E', label: 'Offline' },
            { color: '#2196F3', label: 'Active Route' },
          ].map((item) => (
            <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: item.color }} />
              <Typography sx={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.6)' }}>{item.label}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Map */}
      <Card sx={{ overflow: 'hidden' }}>
        <Box sx={{ height: 520, position: 'relative' }}>
          {loading && (
            <Box sx={{
              position: 'absolute', inset: 0, zIndex: 1000,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.8)',
            }}>
              <CircularProgress sx={{ color: '#E31837' }} />
            </Box>
          )}
          <MapContainer
            center={[4.0511, 9.7679]}
            zoom={12}
            style={{ height: '100%', width: '100%' }}
            zoomControl={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Driver markers */}
            {filteredDrivers.map((driver) => (
              <Marker
                key={driver.id}
                position={[driver.lat, driver.lng]}
                icon={getIcon(driver)}
              >
                <Popup>
                  <Box sx={{ minWidth: 180 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', mb: 0.5 }}>{driver.name}</Typography>
                    <Typography sx={{ fontSize: '0.78rem', color: 'rgba(0,0,0,0.6)', mb: 0.3 }}>{driver.vehicle}</Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
                      <Chip
                        label={driver.onRide ? 'On Ride' : driver.online ? 'Online' : 'Offline'}
                        size="small"
                        sx={{
                          bgcolor: driver.onRide ? 'rgba(227,24,55,0.1)' : driver.online ? 'rgba(76,175,80,0.1)' : 'rgba(158,158,158,0.1)',
                          color: driver.onRide ? '#E31837' : driver.online ? '#4CAF50' : '#9E9E9E',
                          fontWeight: 600, fontSize: '0.68rem', height: 20,
                        }}
                      />
                    </Box>
                    <Typography sx={{ fontSize: '0.78rem' }}>⭐ {driver.rating} rating</Typography>
                    <Typography sx={{ fontSize: '0.78rem', color: 'rgba(0,0,0,0.55)' }}>{driver.city}</Typography>
                  </Box>
                </Popup>
              </Marker>
            ))}

            {/* Active ride routes */}
            {activeRides.map((ride) => (
              <Polyline
                key={ride.id}
                positions={[ride.pickup, ride.dropoff]}
                pathOptions={{ color: '#2196F3', weight: 3, dashArray: '6 4', opacity: 0.8 }}
              />
            ))}
          </MapContainer>
        </Box>
      </Card>

      <Typography sx={{ mt: 1.5, fontSize: '0.72rem', color: 'rgba(0,0,0,0.4)', textAlign: 'center' }}>
        Map data from OpenStreetMap contributors. Driver positions refresh every 30 seconds.
      </Typography>
    </Box>
  );
}

/**
 * Feature 30 — Offline Mode / Poor Connectivity Handling
 *
 * Monitors network state using @react-native-community/netinfo.
 * Falls back gracefully when the package is unavailable (web / bare without native module).
 *
 * Returns:
 *   isOnline          boolean  — false when fully offline
 *   isWeak            boolean  — true on cellular 2G or low-quality connection
 *   lastOnlineAt      Date|null — timestamp of last confirmed online moment
 *   connectionType    string   — 'wifi' | 'cellular' | 'none' | 'unknown'
 */
import { useState, useEffect, useRef } from 'react';

let NetInfo;
try {
  // Peer dependency — available in bare / Expo with native module installed
  NetInfo = require('@react-native-community/netinfo').default;
} catch {
  NetInfo = null; // Degrade gracefully; hook will assume online
}

const WEAK_TYPES = ['2g', 'edge', 'gprs'];

export function useNetworkStatus() {
  const [state, setState] = useState({
    isOnline: true,
    isWeak: false,
    connectionType: 'unknown',
    lastOnlineAt: new Date(),
  });

  const lastOnlineRef = useRef(new Date());

  useEffect(() => {
    if (!NetInfo) return; // package not installed — assume online

    const unsubscribe = NetInfo.addEventListener((info) => {
      const online = info.isConnected && info.isInternetReachable !== false;
      const type = info.type || 'unknown';
      const effectiveType = info.details?.cellularGeneration?.toLowerCase() ?? '';
      const weak = type === 'cellular' && WEAK_TYPES.includes(effectiveType);

      if (online) lastOnlineRef.current = new Date();

      setState({
        isOnline: online,
        isWeak: weak,
        connectionType: type,
        lastOnlineAt: lastOnlineRef.current,
      });
    });

    return () => unsubscribe();
  }, []);

  return state;
}

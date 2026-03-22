/**
 * Feature 27 — Live Activity / Dynamic Island (iOS) + Persistent Notification (Android)
 *
 * iOS 16.2+ Live Activity via ActivityKit requires a WidgetKit extension in the
 * native (bare) project. In the Expo managed workflow we approximate the experience
 * with a sticky, cancellable foreground notification that is updated in real-time as
 * the ride status changes. The notification persists on the lock screen and in the
 * notification tray, giving riders key trip info without opening the app.
 *
 * On iOS 16.2+ with a bare Expo / RN project, swap the _sendLiveNotification calls
 * for the native LiveActivity bridge (see docs/live-activity-native.md).
 */
import { useEffect, useRef, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Notification channel for Android "ongoing" ride notifications
const RIDE_CHANNEL_ID = 'mobo_ride_live';

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(RIDE_CHANNEL_ID, {
    name: 'Active Ride',
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    showBadge: false,
    vibrationPattern: [0],      // No vibration on updates
    enableVibrate: false,
  });
}

// Status → human-readable info
function statusInfo(status, driverName, eta, plate) {
  const drv = driverName ? driverName.split(' ')[0] : 'Your driver';
  switch (status) {
    case 'accepted':
      return {
        title: `${drv} is on the way`,
        body: `ETA ${eta ?? '–'} min · ${plate ?? ''}`,
        icon: 'car',
      };
    case 'arriving':
      return {
        title: `${drv} has arrived!`,
        body: `Look for ${plate ?? 'your driver'} at the pickup point`,
        icon: 'location',
      };
    case 'in_progress':
      return {
        title: 'Ride in progress',
        body: `Heading to your destination with ${drv}`,
        icon: 'navigate',
      };
    case 'completed':
      return {
        title: 'You have arrived!',
        body: 'Rate your ride and see the receipt',
        icon: 'checkmark-circle',
      };
    default:
      return null;
  }
}

/**
 * useLiveActivity(ride)
 * Pass the current ride object. The hook will:
 * 1. Create a persistent notification when ride becomes active
 * 2. Update it as status changes
 * 3. Dismiss it when the ride is completed / cancelled
 *
 * @param {{ id: string, status: string, driver?: { name: string, plate: string }, eta_minutes?: number } | null} ride
 */
export function useLiveActivity(ride) {
  const notifIdRef = useRef(null);
  const lastStatusRef = useRef(null);
  const channelReady = useRef(false);

  const setup = useCallback(async () => {
    if (channelReady.current) return;
    await ensureChannel();
    channelReady.current = true;
  }, []);

  const dismiss = useCallback(async () => {
    if (notifIdRef.current) {
      await Notifications.dismissNotificationAsync(notifIdRef.current).catch(() => {});
      notifIdRef.current = null;
    }
  }, []);

  const update = useCallback(async (rideObj) => {
    await setup();

    const { status, driver, eta_minutes } = rideObj;
    const info = statusInfo(status, driver?.name || driver?.full_name, eta_minutes, driver?.vehicle?.plate);
    if (!info) { dismiss(); return; }

    const content = {
      title: info.title,
      body: info.body,
      data: { rideId: rideObj.id, status, screen: 'RideTracking' },
      // Android
      android: {
        channelId: RIDE_CHANNEL_ID,
        ongoing: status !== 'completed',   // sticky until ride ends
        color: '#FF00BF',
        smallIcon: 'notification_icon',
        priority: 'high',
        actions: status !== 'completed' ? [
          { identifier: 'open', buttonTitle: 'Open App', isDestructive: false },
        ] : [],
      },
      // iOS — shown on lock screen + notification tray
      ios: {
        sound: status === 'arriving',      // alert sound only on "arrived"
        interruptionLevel: status === 'arriving' ? 'timeSensitive' : 'active',
      },
    };

    if (notifIdRef.current) {
      // Update existing notification
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: notifIdRef.current,
          content,
          trigger: null,
        });
      } catch {
        // Notification was dismissed by user; create a fresh one
        notifIdRef.current = null;
      }
    }

    if (!notifIdRef.current) {
      const id = await Notifications.scheduleNotificationAsync({
        content,
        trigger: null,
      });
      notifIdRef.current = id;
    }
  }, [setup, dismiss]);

  useEffect(() => {
    if (!ride) { dismiss(); return; }

    const terminal = ['completed', 'cancelled'];
    if (terminal.includes(ride.status)) {
      // Brief delay so "arrived" notification is visible before dismissal
      const timer = setTimeout(() => dismiss(), ride.status === 'completed' ? 4000 : 0);
      return () => clearTimeout(timer);
    }

    // Only re-push when status actually changes
    if (ride.status !== lastStatusRef.current) {
      lastStatusRef.current = ride.status;
      update(ride);
    }
  }, [ride, update, dismiss]);

  // Clean up on unmount
  useEffect(() => () => { dismiss(); }, [dismiss]);

  return { dismiss };
}

import { View, Text } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

// isConnected can read false for a single tick during a network transition
// (e.g. wifi handoff) even though the device has real connectivity. Only
// show the banner once two consecutive readings agree it's offline, so a
// one-off blip doesn't flash a false "You're offline" banner.
const CONFIRM_THRESHOLD = 2;

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const consecutiveOffline = useRef(0);

  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      const offline = state.isConnected === false;
      consecutiveOffline.current = offline ? consecutiveOffline.current + 1 : 0;
      setIsOffline(consecutiveOffline.current >= CONFIRM_THRESHOLD);
    });
  }, []);

  if (!isOffline) return null;
  return (
    <View style={{ backgroundColor: '#B91C1C', padding: 8 }}>
      <Text style={{ color: 'white', textAlign: 'center' }}>You're offline — changes will sync later</Text>
    </View>
  );
}

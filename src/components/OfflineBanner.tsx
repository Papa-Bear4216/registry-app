import { View, Text } from 'react-native';
import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    return NetInfo.addEventListener((state) => setIsOffline(state.isConnected === false));
  }, []);

  if (!isOffline) return null;
  return (
    <View style={{ backgroundColor: '#B91C1C', padding: 8 }}>
      <Text style={{ color: 'white', textAlign: 'center' }}>You're offline — changes will sync later</Text>
    </View>
  );
}

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import { useAuth } from '../hooks/useAuth';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { SignupScreen } from '../screens/auth/SignupScreen';
import { TabNavigator } from './TabNavigator';
import { AddItemScreen } from '../screens/registry/AddItemScreen';
import { ItemDetailScreen } from '../screens/registry/ItemDetailScreen';
import { MonthlyReviewScreen } from '../screens/reviews/MonthlyReviewScreen';
import { OfflineBanner } from '../components/OfflineBanner';
import { View, ActivityIndicator } from 'react-native';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <OfflineBanner />
      <Stack.Navigator>
        {user ? (
          <>
            <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
            <Stack.Screen name="AddItem" component={AddItemScreen} options={{ title: 'Add Item' }} />
            <Stack.Screen name="ItemDetail" component={ItemDetailScreen} options={{ title: 'Item Detail' }} />
            <Stack.Screen
              name="MonthlyReview"
              component={MonthlyReviewScreen}
              options={{ title: 'Monthly Checkpoint' }}
            />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

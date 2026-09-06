import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { RootTabParamList } from './types';
import { HomeScreen } from '../screens/home/HomeScreen';
import { RegistryListScreen } from '../screens/registry/RegistryListScreen';
import { StagingScreen } from '../screens/staging/StagingScreen';
import { TasksScreen } from '../screens/tasks/TasksScreen';
import { AlertsScreen } from '../screens/alerts/AlertsScreen';

const Tab = createBottomTabNavigator<RootTabParamList>();

export function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#2563EB',
        tabBarInactiveTintColor: '#6B7280',
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Hub' }} />
      <Tab.Screen name="Registry" component={RegistryListScreen} options={{ title: 'Automations' }} />
      <Tab.Screen name="Staging" component={StagingScreen} options={{ title: 'Discovery' }} />
    </Tab.Navigator>
  );
}

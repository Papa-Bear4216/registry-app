import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { RootTabParamList } from './types';
import { HomeScreen } from '../screens/home/HomeScreen';
import { RegistryListScreen } from '../screens/registry/RegistryListScreen';
import { TasksScreen } from '../screens/tasks/TasksScreen';
import { AlertsScreen } from '../screens/alerts/AlertsScreen';

const Tab = createBottomTabNavigator<RootTabParamList>();

export function TabNavigator() {
  return (
    <Tab.Navigator>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Registry" component={RegistryListScreen} />
      <Tab.Screen name="Tasks" component={TasksScreen} />
      <Tab.Screen name="Alerts" component={AlertsScreen} />
    </Tab.Navigator>
  );
}

import React from 'react';
import { View, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';

// Screens
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import ElevatorsListScreen from '../screens/ElevatorsListScreen';
import ElevatorDetailsScreen from '../screens/ElevatorDetailsScreen';
import AddElevatorScreen from '../screens/AddElevatorScreen';
import EditElevatorScreen from '../screens/EditElevatorScreen';
import ServicesListScreen from '../screens/ServicesListScreen';
import AddServiceScreen from '../screens/AddServiceScreen';
import RepairsListScreen from '../screens/RepairsListScreen';
import AddRepairScreen from '../screens/AddRepairScreen';
import UserManagementScreen from '../screens/UserManagementScreen';
import AddUserScreen from '../screens/AddUserScreen';

const Stack = createNativeStackNavigator();

// Glavni navigation
export default function Navigation() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Elevators" component={ElevatorsListScreen} />
            <Stack.Screen name="ElevatorDetails" component={ElevatorDetailsScreen} />
            <Stack.Screen name="AddElevator" component={AddElevatorScreen} />
            <Stack.Screen name="EditElevator" component={EditElevatorScreen} />
            <Stack.Screen name="Services" component={ServicesListScreen} />
            <Stack.Screen name="AddService" component={AddServiceScreen} />
            <Stack.Screen name="Repairs" component={RepairsListScreen} />
            <Stack.Screen name="AddRepair" component={AddRepairScreen} />
            <Stack.Screen name="UserManagement" component={UserManagementScreen} />
            <Stack.Screen name="AddUser" component={AddUserScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

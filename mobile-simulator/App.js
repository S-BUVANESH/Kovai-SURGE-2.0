import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import HomeScreen from './screens/HomeScreen';
import DustbinSimulator from './screens/DustbinSimulator';
import TruckSimulator from './screens/TruckSimulator';

const Stack = createNativeStackNavigator();

export default function App() {
    return (
        <>
            <StatusBar style="light" />
            <NavigationContainer>
                <Stack.Navigator
                    screenOptions={{
                        headerStyle: { backgroundColor: '#0a120a' },
                        headerTintColor: '#53d22d',
                        headerTitleStyle: { fontWeight: '700', fontSize: 16 },
                        contentStyle: { backgroundColor: '#0c1a0c' },
                    }}
                >
                    <Stack.Screen
                        name="Home"
                        component={HomeScreen}
                        options={{ title: 'SURGE Simulator', headerShown: false }}
                    />
                    <Stack.Screen
                        name="DustbinSimulator"
                        component={DustbinSimulator}
                        options={{ title: '🗑️ Dustbin Simulator' }}
                    />
                    <Stack.Screen
                        name="TruckSimulator"
                        component={TruckSimulator}
                        options={{ title: '🚛 Truck Simulator' }}
                    />
                </Stack.Navigator>
            </NavigationContainer>
        </>
    );
}

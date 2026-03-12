import React, { useMemo, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import HomeScreen from './screens/HomeScreen';
import DustbinSimulator from './screens/DustbinSimulator';
import TruckSimulator from './screens/TruckSimulator';
import WorkerOpsScreen from './screens/WorkerOpsScreen';

const Stack = createNativeStackNavigator();

const THEMES = {
    neon: {
        bg: '#071111',
        header: '#081317',
        text: '#8fffc8',
        panel: 'rgba(8, 24, 24, 0.86)',
        border: 'rgba(255,255,255,0.08)',
        orbA: 'rgba(74, 222, 128, 0.16)',
        orbB: 'rgba(59, 130, 246, 0.16)',
        binCard: 'rgba(20, 52, 38, 0.9)',
        truckCard: 'rgba(18, 37, 58, 0.9)',
        accent: '#6be39a',
        accentAlt: '#79b8ff',
        buttonTextDark: '#072117',
    },
    ocean: {
        bg: '#07101a',
        header: '#091423',
        text: '#9ed7ff',
        panel: 'rgba(12, 23, 40, 0.88)',
        border: 'rgba(160,200,255,0.18)',
        orbA: 'rgba(69, 145, 255, 0.18)',
        orbB: 'rgba(86, 230, 255, 0.14)',
        binCard: 'rgba(12, 44, 64, 0.9)',
        truckCard: 'rgba(16, 40, 74, 0.9)',
        accent: '#66c8ff',
        accentAlt: '#7be6ff',
        buttonTextDark: '#021a2b',
    },
    sunset: {
        bg: '#15100a',
        header: '#20150d',
        text: '#ffd8a8',
        panel: 'rgba(40, 22, 14, 0.86)',
        border: 'rgba(255,205,153,0.2)',
        orbA: 'rgba(255, 140, 92, 0.18)',
        orbB: 'rgba(255, 199, 102, 0.14)',
        binCard: 'rgba(64, 33, 18, 0.9)',
        truckCard: 'rgba(76, 38, 20, 0.9)',
        accent: '#ffb870',
        accentAlt: '#ff8f61',
        buttonTextDark: '#2b1207',
    },
    military: {
        bg: '#0a0f0a',
        header: '#121a11',
        text: '#d2e8b1',
        panel: 'rgba(18, 27, 16, 0.9)',
        border: 'rgba(194,224,153,0.22)',
        orbA: 'rgba(120, 160, 70, 0.18)',
        orbB: 'rgba(70, 95, 58, 0.2)',
        binCard: 'rgba(24, 34, 20, 0.93)',
        truckCard: 'rgba(28, 39, 22, 0.93)',
        accent: '#b2d87c',
        accentAlt: '#d7bf72',
        buttonTextDark: '#101709',
    },
};

export default function App() {
    const [themeKey, setThemeKey] = useState('neon');
    const theme = useMemo(() => THEMES[themeKey] || THEMES.neon, [themeKey]);

    return (
        <>
            <StatusBar style="light" />
            <NavigationContainer>
                <Stack.Navigator
                    screenOptions={{
                        animation: 'slide_from_right',
                        headerStyle: { backgroundColor: theme.header },
                        headerTintColor: theme.text,
                        headerTitleStyle: { fontWeight: '800', fontSize: 16, letterSpacing: 0.4 },
                        headerShadowVisible: false,
                        contentStyle: { backgroundColor: theme.bg },
                    }}
                >
                    <Stack.Screen name="Home" options={{ title: 'SURGE Simulator', headerShown: false }}>
                        {(props) => (
                            <HomeScreen
                                {...props}
                                theme={theme}
                                themeKey={themeKey}
                                setThemeKey={setThemeKey}
                                themes={THEMES}
                            />
                        )}
                    </Stack.Screen>
                    <Stack.Screen name="DustbinSimulator" options={{ title: 'Dustbin Simulator' }}>
                        {(props) => (
                            <DustbinSimulator
                                {...props}
                                theme={theme}
                                themeKey={themeKey}
                                setThemeKey={setThemeKey}
                                themes={THEMES}
                            />
                        )}
                    </Stack.Screen>
                    <Stack.Screen name="TruckSimulator" options={{ title: 'Truck Simulator' }}>
                        {(props) => (
                            <TruckSimulator
                                {...props}
                                theme={theme}
                                themeKey={themeKey}
                                setThemeKey={setThemeKey}
                                themes={THEMES}
                            />
                        )}
                    </Stack.Screen>
                    <Stack.Screen name="WorkerOps" options={{ title: 'Worker Ops' }}>
                        {(props) => (
                            <WorkerOpsScreen
                                {...props}
                                theme={theme}
                                themeKey={themeKey}
                                setThemeKey={setThemeKey}
                                themes={THEMES}
                            />
                        )}
                    </Stack.Screen>
                </Stack.Navigator>
            </NavigationContainer>
        </>
    );
}

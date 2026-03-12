import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, TextInput, Alert } from 'react-native';
import * as Location from 'expo-location';
import { database, ref, set, removeData } from '../firebase';

export default function TruckSimulator() {
    const [truckId, setTruckId] = useState('truck_1');
    const [driverName, setDriverName] = useState('Driver');
    const [location, setLocation] = useState(null);
    const [speed, setSpeed] = useState(0);
    const [heading, setHeading] = useState(0);
    const [isTracking, setIsTracking] = useState(false);
    const [pushCount, setPushCount] = useState(0);
    const [lastPush, setLastPush] = useState(null);
    const [status, setStatus] = useState('Ready — Start your shift');
    const watchRef = useRef(null);
    const intervalRef = useRef(null);
    const locationDataRef = useRef(null);

    useEffect(() => {
        (async () => {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Location permission is required for truck tracking.');
                return;
            }
            let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            setLocation(loc.coords);
        })();

        return () => stopTracking();
    }, []);

    const pushData = async () => {
        const loc = locationDataRef.current;
        if (!loc) return;
        
        try {
            await set(ref(database, `live/trucks/${truckId}`), {
                lat: loc.latitude,
                lng: loc.longitude,
                speed: Math.round(loc.speed * 3.6) || 0, // m/s to km/h
                heading: Math.round(loc.heading) || 0,
                driverName: driverName,
                vehicleNumber: `TN-37-SIM-${truckId.replace('truck_', '')}`,
                timestamp: Date.now()
            });
            setPushCount(prev => prev + 1);
            setLastPush(new Date().toLocaleTimeString());
            setStatus('🟢 Tracking active');
        } catch (error) {
            setStatus('❌ Push failed');
            console.error('Firebase push error:', error);
        }
    };

    const startTracking = async () => {
        setIsTracking(true);
        setStatus('🔄 Starting GPS tracking...');
        setPushCount(0);

        // Watch position continuously
        watchRef.current = await Location.watchPositionAsync(
            {
                accuracy: Location.Accuracy.BestForNavigation,
                timeInterval: 2000,
                distanceInterval: 5,
            },
            (loc) => {
                setLocation(loc.coords);
                setSpeed(Math.round((loc.coords.speed || 0) * 3.6));
                setHeading(Math.round(loc.coords.heading || 0));
                locationDataRef.current = loc.coords;
            }
        );

        // Push to Firebase every 3 seconds
        intervalRef.current = setInterval(() => {
            pushData();
        }, 3000);

        // Initial push
        if (location) {
            locationDataRef.current = location;
            pushData();
        }
    };

    const stopTracking = async () => {
        setIsTracking(false);
        if (watchRef.current) {
            watchRef.current.remove();
            watchRef.current = null;
        }
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        
        // Remove truck from live tracking map
        try {
            await removeData(ref(database, `live/trucks/${truckId}`));
        } catch (e) { console.error('Failed to remove truck:', e); }

        setStatus('⏸ Shift ended - Removed from Map');
    };

    const getSpeedColor = () => {
        if (speed > 40) return '#fa4b38';
        if (speed > 20) return '#fa9d38';
        return '#53d22d';
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                {/* Truck & Driver ID */}
                <View style={styles.row}>
                    <View style={[styles.section, { flex: 1 }]}>
                        <Text style={styles.sectionLabel}>TRUCK ID</Text>
                        <TextInput
                            style={styles.input}
                            value={truckId}
                            onChangeText={setTruckId}
                            placeholder="truck_1"
                            placeholderTextColor="#666"
                            editable={!isTracking}
                        />
                    </View>
                    <View style={[styles.section, { flex: 1 }]}>
                        <Text style={styles.sectionLabel}>DRIVER NAME</Text>
                        <TextInput
                            style={styles.input}
                            value={driverName}
                            onChangeText={setDriverName}
                            placeholder="Name"
                            placeholderTextColor="#666"
                            editable={!isTracking}
                        />
                    </View>
                </View>

                {/* Speed Dashboard */}
                <View style={styles.speedContainer}>
                    <View style={styles.speedGauge}>
                        <Text style={[styles.speedValue, { color: getSpeedColor() }]}>{speed}</Text>
                        <Text style={styles.speedUnit}>km/h</Text>
                    </View>
                    <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                            <Text style={styles.statLabel}>HEADING</Text>
                            <Text style={styles.statValue}>🧭 {heading}°</Text>
                        </View>
                        <View style={styles.statItem}>
                            <Text style={styles.statLabel}>PUSHES</Text>
                            <Text style={[styles.statValue, { color: '#3b82f6' }]}>{pushCount}</Text>
                        </View>
                    </View>
                </View>

                {/* GPS Info */}
                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>GPS COORDINATES</Text>
                    <View style={styles.gpsBox}>
                        <Text style={styles.gpsText}>
                            📍 {location ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}` : 'Acquiring GPS...'}
                        </Text>
                    </View>
                </View>

                {/* Status */}
                <View style={styles.statusBox}>
                    <Text style={styles.statusText}>{status}</Text>
                    {lastPush && <Text style={styles.lastPushText}>Last push: {lastPush}</Text>}
                </View>

                {/* Start/Stop Button */}
                <TouchableOpacity
                    style={[styles.mainBtn, isTracking ? styles.stopBtn : styles.startBtn]}
                    onPress={isTracking ? stopTracking : startTracking}
                >
                    <Text style={styles.mainBtnText}>
                        {isTracking ? '⏹ End Shift' : '▶ Start Shift'}
                    </Text>
                </TouchableOpacity>

                <Text style={styles.helpText}>
                    {isTracking
                        ? '📡 Move around — your location updates on the admin map in real-time!'
                        : 'Tap "Start Shift" to begin GPS tracking. Walk/drive to simulate truck movement.'}
                </Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0c1a0c' },
    content: { flex: 1, padding: 20, gap: 16 },
    row: { flexDirection: 'row', gap: 12 },
    section: { gap: 8 },
    sectionLabel: { color: '#a5b6a0', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
    input: {
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)',
        borderRadius: 12, color: '#fff', padding: 14, fontSize: 14, fontWeight: '600',
    },
    speedContainer: { alignItems: 'center', gap: 16, paddingVertical: 12 },
    speedGauge: {
        width: 160, height: 160,
        borderRadius: 80,
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderWidth: 3, borderColor: 'rgba(59,130,246,0.3)',
        justifyContent: 'center', alignItems: 'center',
    },
    speedValue: { fontSize: 56, fontWeight: '900', color: '#53d22d' },
    speedUnit: { color: '#666', fontSize: 14, fontWeight: '600', marginTop: -4 },
    statsRow: { flexDirection: 'row', gap: 40 },
    statItem: { alignItems: 'center', gap: 4 },
    statLabel: { color: '#666', fontSize: 10, fontWeight: '700', letterSpacing: 2 },
    statValue: { color: '#fff', fontSize: 18, fontWeight: '800' },
    gpsBox: {
        backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 12,
        padding: 14, borderWidth: 1, borderColor: 'rgba(59,130,246,0.1)',
    },
    gpsText: { color: '#a5b6a0', fontSize: 13, fontFamily: 'monospace' },
    statusBox: { alignItems: 'center', padding: 8 },
    statusText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    lastPushText: { color: '#666', fontSize: 11, marginTop: 4 },
    mainBtn: { padding: 18, borderRadius: 16, alignItems: 'center' },
    startBtn: { backgroundColor: '#3b82f6' },
    stopBtn: { backgroundColor: '#fa4b38' },
    mainBtnText: { color: '#fff', fontSize: 18, fontWeight: '900' },
    helpText: { color: '#666', fontSize: 12, textAlign: 'center', lineHeight: 18, paddingHorizontal: 12 },
});

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, TextInput, Alert } from 'react-native';
import * as Location from 'expo-location';
import { database, ref, set, removeData } from '../firebase';

export default function DustbinSimulator() {
    const [binId, setBinId] = useState('bin_001');
    const [fillLevel, setFillLevel] = useState(25);
    const [location, setLocation] = useState(null);
    const [isActive, setIsActive] = useState(false);
    const [autoFill, setAutoFill] = useState(false);
    const [lastPush, setLastPush] = useState(null);
    const [status, setStatus] = useState('Ready');
    const intervalRef = useRef(null);
    const autoFillRef = useRef(null);

    useEffect(() => {
        (async () => {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Location permission is required for simulation.');
                return;
            }
            let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            setLocation(loc.coords);
        })();

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (autoFillRef.current) clearInterval(autoFillRef.current);
        };
    }, []);

    const pushData = async (lat, lng, fill) => {
        try {
            await set(ref(database, `live/bins/${binId}`), {
                lat: lat,
                lng: lng,
                fillLevel: fill,
                address: `Simulated Bin ${binId}`,
                timestamp: Date.now()
            });
            setLastPush(new Date().toLocaleTimeString());
            setStatus('✅ Data pushed!');
        } catch (error) {
            setStatus('❌ Push failed');
            console.error('Firebase push error:', error);
        }
    };

    const startSimulation = async () => {
        setIsActive(true);
        setStatus('🔄 Simulating...');

        // Push immediately
        if (location) {
            pushData(location.latitude, location.longitude, fillLevel);
        }

        // Push every 3 seconds with GPS update
        intervalRef.current = setInterval(async () => {
            try {
                let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
                // Setting location triggers the useEffect below, which handles pushing with latest state
                setLocation(loc.coords);
            } catch (e) {
                console.error('Location error:', e);
            }
        }, 3000);
    };

    // Auto-push whenever fillLevel or location changes while active
    useEffect(() => {
        if (isActive && location) {
            pushData(location.latitude, location.longitude, fillLevel);
        }
    }, [fillLevel, location, isActive]);

    const stopSimulation = async () => {
        setIsActive(false);
        setAutoFill(false);
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (autoFillRef.current) clearInterval(autoFillRef.current);
        
        // Remove bin from live tracking map
        try {
            await removeData(ref(database, `live/bins/${binId}`));
        } catch (e) { console.error('Failed to remove bin:', e); }

        setStatus('⏸ Stopped - Removed from Map');
    };

    const toggleAutoFill = () => {
        if (autoFill) {
            if (autoFillRef.current) clearInterval(autoFillRef.current);
            setAutoFill(false);
        } else {
            setAutoFill(true);
            autoFillRef.current = setInterval(() => {
                setFillLevel(prev => {
                    const next = Math.min(prev + Math.floor(Math.random() * 5) + 1, 100);
                    return next;
                });
            }, 2000);
        }
    };

    const adjustFill = (delta) => {
        const newFill = Math.max(0, Math.min(100, fillLevel + delta));
        setFillLevel(newFill);
        
        // If simulation is not active but we have location, let's push this manual update anyway
        if (!isActive && location) {
            pushData(location.latitude, location.longitude, newFill);
        }
    };

    const getFillColor = () => {
        if (fillLevel >= 80) return '#fa4b38';
        if (fillLevel >= 50) return '#fa9d38';
        return '#53d22d';
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                {/* Bin ID Input */}
                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>BIN ID</Text>
                    <TextInput
                        style={styles.input}
                        value={binId}
                        onChangeText={setBinId}
                        placeholder="e.g., bin_001"
                        placeholderTextColor="#666"
                        editable={!isActive}
                    />
                </View>

                {/* Fill Level Gauge */}
                <View style={styles.gaugeContainer}>
                    <Text style={styles.sectionLabel}>FILL LEVEL</Text>
                    <View style={styles.gauge}>
                        <View style={[styles.gaugeFill, { height: `${fillLevel}%`, backgroundColor: getFillColor() }]} />
                        <Text style={styles.gaugeText}>{fillLevel}%</Text>
                        <Text style={styles.gaugeEmoji}>🗑️</Text>
                    </View>
                    <View style={styles.fillControls}>
                        <TouchableOpacity style={styles.fillBtn} onPress={() => adjustFill(-10)}>
                            <Text style={styles.fillBtnText}>−10</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.fillBtn} onPress={() => adjustFill(-5)}>
                            <Text style={styles.fillBtnText}>−5</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.fillBtn, { borderColor: '#fa9d38' }]} onPress={() => adjustFill(5)}>
                            <Text style={[styles.fillBtnText, { color: '#fa9d38' }]}>+5</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.fillBtn, { borderColor: '#fa4b38' }]} onPress={() => adjustFill(10)}>
                            <Text style={[styles.fillBtnText, { color: '#fa4b38' }]}>+10</Text>
                        </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                        style={[styles.autoFillBtn, autoFill && styles.autoFillActive]}
                        onPress={toggleAutoFill}
                    >
                        <Text style={styles.autoFillText}>{autoFill ? '⏸ Stop Auto-Fill' : '▶ Auto-Fill Mode'}</Text>
                    </TouchableOpacity>
                </View>

                {/* GPS Info */}
                <View style={styles.section}>
                    <Text style={styles.sectionLabel}>GPS LOCATION</Text>
                    <View style={styles.gpsBox}>
                        <Text style={styles.gpsText}>
                            📍 {location ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}` : 'Acquiring...'}
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
                    style={[styles.mainBtn, isActive ? styles.stopBtn : styles.startBtn]}
                    onPress={isActive ? stopSimulation : startSimulation}
                >
                    <Text style={styles.mainBtnText}>
                        {isActive ? '⏹ Stop Simulation' : '▶ Start Simulation'}
                    </Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0c1a0c' },
    content: { flex: 1, padding: 20, gap: 16 },
    section: { gap: 8 },
    sectionLabel: { color: '#a5b6a0', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
    input: {
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderWidth: 1, borderColor: 'rgba(83,210,45,0.2)',
        borderRadius: 12, color: '#fff', padding: 14, fontSize: 16, fontWeight: '600',
    },
    gaugeContainer: { alignItems: 'center', gap: 12 },
    gauge: {
        width: 120, height: 180,
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)',
        borderRadius: 16, overflow: 'hidden',
        justifyContent: 'flex-end', alignItems: 'center',
        position: 'relative',
    },
    gaugeFill: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        borderRadius: 0,
        opacity: 0.7,
    },
    gaugeText: {
        position: 'absolute', top: '40%',
        color: '#fff', fontSize: 28, fontWeight: '900',
        textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
    },
    gaugeEmoji: { position: 'absolute', bottom: 8, fontSize: 24 },
    fillControls: { flexDirection: 'row', gap: 8 },
    fillBtn: {
        paddingHorizontal: 16, paddingVertical: 8,
        borderWidth: 1, borderColor: '#53d22d', borderRadius: 10,
    },
    fillBtnText: { color: '#53d22d', fontWeight: '700', fontSize: 14 },
    autoFillBtn: {
        paddingHorizontal: 20, paddingVertical: 10,
        borderWidth: 1, borderColor: 'rgba(83,210,45,0.3)', borderRadius: 12,
        backgroundColor: 'rgba(83,210,45,0.05)',
    },
    autoFillActive: { backgroundColor: 'rgba(83,210,45,0.15)', borderColor: '#53d22d' },
    autoFillText: { color: '#53d22d', fontWeight: '700', fontSize: 13 },
    gpsBox: {
        backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 12,
        padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
    },
    gpsText: { color: '#a5b6a0', fontSize: 13, fontFamily: 'monospace' },
    statusBox: { alignItems: 'center', padding: 12 },
    statusText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    lastPushText: { color: '#666', fontSize: 11, marginTop: 4 },
    mainBtn: { padding: 18, borderRadius: 16, alignItems: 'center' },
    startBtn: { backgroundColor: '#53d22d' },
    stopBtn: { backgroundColor: '#fa4b38' },
    mainBtnText: { color: '#0c1a0c', fontSize: 18, fontWeight: '900' },
});

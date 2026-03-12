import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    SafeAreaView,
    TouchableOpacity,
    TextInput,
    Alert,
    ScrollView,
    Animated,
    Linking,
} from 'react-native';
import * as Location from 'expo-location';
import { database, ref, set, removeData } from '../firebase';

const MAP_CENTER = { lat: 11.0168, lng: 76.9558 };
const MAP_SPAN = 0.04;

const THEME_LABELS = {
    neon: 'Neon',
    ocean: 'Ocean',
    sunset: 'Sunset',
    military: 'Ops',
};

const clamp = (num, min, max) => Math.min(Math.max(num, min), max);
const toRad = (deg) => (deg * Math.PI) / 180;
const distanceKm = (aLat, aLng, bLat, bLng) => {
    const R = 6371;
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const x =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

export default function TruckSimulator({ theme, themeKey, setThemeKey, themes }) {
    const [truckId, setTruckId] = useState('truck_1');
    const [driverName, setDriverName] = useState('Driver');
    const [location, setLocation] = useState(null);
    const [speed, setSpeed] = useState(0);
    const [heading, setHeading] = useState(0);
    const [isTracking, setIsTracking] = useState(false);
    const [pushCount, setPushCount] = useState(0);
    const [lastPush, setLastPush] = useState(null);
    const [status, setStatus] = useState('Ready - Start your shift');
    const [lastFixMs, setLastFixMs] = useState(Date.now());
    const watchRef = useRef(null);
    const intervalRef = useRef(null);
    const locationDataRef = useRef(null);
    const pulseAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        (async () => {
            const { status: permissionStatus } = await Location.requestForegroundPermissionsAsync();
            if (permissionStatus !== 'granted') {
                Alert.alert('Permission Denied', 'Location permission is required for truck tracking.');
                return;
            }
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            setLocation(loc.coords);
            setLastFixMs(Date.now());
        })();

        return () => {
            if (watchRef.current) {
                watchRef.current.remove();
                watchRef.current = null;
            }
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!isTracking) {
            pulseAnim.setValue(0);
            return;
        }
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [isTracking, pulseAnim]);

    const pushData = async () => {
        const loc = locationDataRef.current;
        if (!loc) return;

        try {
            await set(ref(database, `live/trucks/${truckId}`), {
                lat: loc.latitude,
                lng: loc.longitude,
                speed: Math.round((loc.speed || 0) * 3.6),
                heading: Math.round(loc.heading) || 0,
                driverName,
                vehicleNumber: `TN-37-SIM-${truckId.replace('truck_', '')}`,
                timestamp: Date.now(),
            });
            setPushCount((prev) => prev + 1);
            setLastPush(new Date().toLocaleTimeString());
            setStatus('Tracking active');
        } catch (error) {
            setStatus('Push failed');
            console.error('Firebase push error:', error);
        }
    };

    const startTracking = async () => {
        setIsTracking(true);
        setStatus('Starting GPS tracking');
        setPushCount(0);

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
                setLastFixMs(Date.now());
            }
        );

        intervalRef.current = setInterval(() => {
            pushData();
        }, 3000);

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

        try {
            await removeData(ref(database, `live/trucks/${truckId}`));
        } catch (e) {
            console.error('Failed to remove truck:', e);
        }

        setStatus('Shift ended and removed from map');
    };

    const getSpeedColor = () => {
        if (speed > 40) return '#ff6f61';
        if (speed > 20) return '#ffb357';
        return theme.accentAlt;
    };

    const mapPoint = location
        ? {
            x: clamp(50 + ((location.longitude - MAP_CENTER.lng) / MAP_SPAN) * 100, 6, 94),
            y: clamp(50 - ((location.latitude - MAP_CENTER.lat) / MAP_SPAN) * 100, 8, 92),
        }
        : null;

    const distToHq = location
        ? distanceKm(location.latitude, location.longitude, MAP_CENTER.lat, MAP_CENTER.lng)
        : null;

    const openInMaps = () => {
        if (!location) return;
        const url = `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
        Linking.openURL(url).catch((err) => console.error('Map open failed', err));
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
            <View style={[styles.bgOrbA, { backgroundColor: theme.orbA }]} />
            <View style={[styles.bgOrbB, { backgroundColor: theme.orbB }]} />

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={[styles.heroCard, { backgroundColor: theme.panel, borderColor: theme.border }]}>
                    <Text style={[styles.heroKicker, { color: theme.accentAlt }]}>TRUCK TELEMETRY</Text>
                    <Text style={styles.heroTitle}>Live Movement Deck</Text>
                    <Text style={styles.heroSub}>Stream speed, heading and route updates in real time.</Text>
                </View>

                <View style={[styles.themeRow, { backgroundColor: theme.panel, borderColor: theme.border }]}>
                    <Text style={styles.themeLabel}>Theme</Text>
                    <View style={styles.themeButtons}>
                        {Object.keys(themes).map((key) => (
                            <TouchableOpacity
                                key={key}
                                style={[
                                    styles.themeBtn,
                                    {
                                        borderColor: key === themeKey ? theme.accentAlt : theme.border,
                                        backgroundColor: key === themeKey ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.2)',
                                    },
                                ]}
                                onPress={() => setThemeKey(key)}
                            >
                                <Text
                                    style={[
                                        styles.themeBtnText,
                                        { color: key === themeKey ? theme.accentAlt : '#b8c8c3' },
                                    ]}
                                >
                                    {THEME_LABELS[key]}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                <View style={styles.row}>
                    <View style={[styles.panel, { flex: 1, backgroundColor: theme.panel, borderColor: theme.border }]}>
                        <Text style={styles.sectionLabel}>TRUCK ID</Text>
                        <TextInput
                            style={[styles.input, { borderColor: theme.border }]}
                            value={truckId}
                            onChangeText={setTruckId}
                            placeholder="truck_1"
                            placeholderTextColor="#7d8aa1"
                            editable={!isTracking}
                        />
                    </View>
                    <View style={[styles.panel, { flex: 1, backgroundColor: theme.panel, borderColor: theme.border }]}>
                        <Text style={styles.sectionLabel}>DRIVER</Text>
                        <TextInput
                            style={[styles.input, { borderColor: theme.border }]}
                            value={driverName}
                            onChangeText={setDriverName}
                            placeholder="Name"
                            placeholderTextColor="#7d8aa1"
                            editable={!isTracking}
                        />
                    </View>
                </View>

                <View style={[styles.speedCard, { backgroundColor: theme.panel, borderColor: theme.border }]}>
                    <Animated.View
                        style={[
                            styles.speedGauge,
                            {
                                borderColor: getSpeedColor(),
                                transform: [{ scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) }],
                            },
                        ]}
                    >
                        <View style={styles.gaugeShine} />
                        <Text style={[styles.speedValue, { color: getSpeedColor() }]}>{speed}</Text>
                        <Text style={styles.speedUnit}>km/h</Text>
                    </Animated.View>

                    <View style={styles.statsRow}>
                        <View style={[styles.statItem, { borderColor: theme.border }]}> 
                            <Text style={styles.statLabel}>HEADING</Text>
                            <Text style={styles.statValue}>{heading} deg</Text>
                        </View>
                        <View style={[styles.statItem, { borderColor: theme.border }]}> 
                            <Text style={styles.statLabel}>PUSHES</Text>
                            <Text style={[styles.statValue, { color: theme.accentAlt }]}>{pushCount}</Text>
                        </View>
                    </View>
                </View>

                <View style={[styles.panel, { backgroundColor: theme.panel, borderColor: theme.border }]}>
                    <Text style={styles.sectionLabel}>GPS COORDINATES</Text>
                    <View style={[styles.gpsBox, { borderColor: theme.border }]}> 
                        <Text style={styles.gpsText}>
                            {location
                                ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
                                : 'Acquiring GPS...'}
                        </Text>
                    </View>
                </View>

                <View style={[styles.panel, { backgroundColor: theme.panel, borderColor: theme.border }]}>
                    <Text style={styles.sectionLabel}>LOC CARD</Text>
                    <View style={styles.locGrid}>
                        <View style={[styles.locCell, { borderColor: theme.border }]}>
                            <Text style={styles.locLabel}>DIST TO HQ</Text>
                            <Text style={[styles.locValue, { color: theme.accent }]}>
                                {distToHq !== null ? `${distToHq.toFixed(2)} km` : '--'}
                            </Text>
                        </View>
                        <View style={[styles.locCell, { borderColor: theme.border }]}>
                            <Text style={styles.locLabel}>ACCURACY</Text>
                            <Text style={[styles.locValue, { color: theme.accentAlt }]}>
                                {location?.accuracy ? `${Math.round(location.accuracy)} m` : '--'}
                            </Text>
                        </View>
                    </View>
                    <View style={styles.locGrid}>
                        <View style={[styles.locCell, { borderColor: theme.border }]}>
                            <Text style={styles.locLabel}>SPEED</Text>
                            <Text style={styles.locValue}>{`${speed} km/h`}</Text>
                        </View>
                        <View style={[styles.locCell, { borderColor: theme.border }]}>
                            <Text style={styles.locLabel}>LAST FIX</Text>
                            <Text style={styles.locValue}>{`${Math.max(0, Math.round((Date.now() - lastFixMs) / 1000))}s`}</Text>
                        </View>
                    </View>
                    <TouchableOpacity style={[styles.locBtn, { borderColor: theme.border }]} onPress={openInMaps}>
                        <Text style={[styles.locBtnText, { color: theme.text }]}>Open in Maps</Text>
                    </TouchableOpacity>
                </View>

                <View style={[styles.panel, { backgroundColor: theme.panel, borderColor: theme.border }]}> 
                    <Text style={styles.sectionLabel}>MINI MAP PREVIEW</Text>
                    <View style={[styles.miniMap, { borderColor: theme.border }]}> 
                        <View style={styles.mapGridH} />
                        <View style={styles.mapGridV} />
                        <View style={styles.mapCenterCrossH} />
                        <View style={styles.mapCenterCrossV} />
                        {mapPoint && (
                            <Animated.View
                                style={[
                                    styles.mapDot,
                                    {
                                        backgroundColor: theme.accentAlt,
                                        left: `${mapPoint.x}%`,
                                        top: `${mapPoint.y}%`,
                                        transform: [
                                            { translateX: -7 },
                                            { translateY: -7 },
                                            { scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) },
                                        ],
                                    },
                                ]}
                            />
                        )}
                    </View>
                    <Text style={styles.mapLegend}>Center: Coimbatore zone | Dot: simulated truck</Text>
                </View>

                <View style={[styles.statusBox, { backgroundColor: theme.panel, borderColor: theme.border }]}>
                    <Text style={styles.statusText}>{status}</Text>
                    {lastPush && <Text style={styles.lastPushText}>Last push: {lastPush}</Text>}
                </View>

                <TouchableOpacity
                    style={[styles.mainBtn, { backgroundColor: isTracking ? '#ff6f61' : theme.accentAlt }]}
                    onPress={isTracking ? stopTracking : startTracking}
                >
                    <Text style={[styles.mainBtnText, { color: theme.buttonTextDark }]}>{isTracking ? 'End Shift' : 'Start Shift'}</Text>
                </TouchableOpacity>

                <Text style={styles.helpText}>
                    {isTracking
                        ? 'Move the phone to simulate route and speed updates on admin maps.'
                        : 'Start Shift to begin location tracking telemetry.'}
                </Text>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: { padding: 18, paddingBottom: 26, gap: 12 },
    bgOrbA: {
        position: 'absolute',
        width: 250,
        height: 250,
        borderRadius: 125,
        top: -90,
        right: -70,
    },
    bgOrbB: {
        position: 'absolute',
        width: 240,
        height: 240,
        borderRadius: 120,
        bottom: -70,
        left: -80,
    },
    heroCard: {
        borderRadius: 22,
        borderWidth: 1,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.24,
        shadowRadius: 14,
        elevation: 8,
    },
    heroKicker: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
    heroTitle: { color: '#ffffff', fontSize: 24, fontWeight: '900', marginTop: 6 },
    heroSub: { color: '#9cb0cb', fontSize: 12.5, marginTop: 4 },
    themeRow: { borderWidth: 1, borderRadius: 14, padding: 12 },
    themeLabel: {
        color: '#b7c9c3',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.4,
        marginBottom: 8,
    },
    themeButtons: { flexDirection: 'row', gap: 8 },
    themeBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
    themeBtnText: { fontSize: 12, fontWeight: '700' },
    row: { flexDirection: 'row', gap: 10 },
    panel: {
        borderWidth: 1,
        borderRadius: 16,
        padding: 12,
    },
    sectionLabel: { color: '#a8bbd9', fontSize: 11, fontWeight: '700', letterSpacing: 1.7, marginBottom: 8 },
    input: {
        backgroundColor: 'rgba(0,0,0,0.32)',
        borderWidth: 1,
        borderRadius: 12,
        color: '#fff',
        padding: 12,
        fontSize: 14,
        fontWeight: '600',
    },
    speedCard: {
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 20,
        paddingVertical: 14,
        paddingHorizontal: 12,
    },
    speedGauge: {
        width: 178,
        height: 178,
        borderRadius: 89,
        backgroundColor: 'rgba(0,0,0,0.35)',
        borderWidth: 3,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#73d8ff',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 14,
        elevation: 8,
        overflow: 'hidden',
    },
    gaugeShine: {
        position: 'absolute',
        top: 10,
        width: 120,
        height: 38,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    speedValue: { fontSize: 56, fontWeight: '900' },
    speedUnit: { color: '#97aaca', fontSize: 13, fontWeight: '700', marginTop: -5, letterSpacing: 0.7 },
    statsRow: { flexDirection: 'row', gap: 34, marginTop: 14 },
    statItem: {
        alignItems: 'center',
        gap: 3,
        backgroundColor: 'rgba(5, 13, 25, 0.55)',
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 15,
        paddingVertical: 9,
        minWidth: 110,
    },
    statLabel: { color: '#7689a7', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
    statValue: { color: '#eaf2ff', fontSize: 20, fontWeight: '900' },
    gpsBox: {
        backgroundColor: 'rgba(0,0,0,0.34)',
        borderRadius: 11,
        padding: 12,
        borderWidth: 1,
    },
    gpsText: { color: '#bac9dd', fontSize: 13, fontFamily: 'monospace' },
    locGrid: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 8,
    },
    locCell: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 10,
    },
    locLabel: {
        color: '#8da59d',
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 1.1,
    },
    locValue: {
        marginTop: 6,
        color: '#ecf6f0',
        fontSize: 15,
        fontWeight: '800',
    },
    locBtn: {
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 10,
        paddingVertical: 10,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    locBtnText: {
        fontSize: 13,
        fontWeight: '700',
    },
    miniMap: {
        height: 130,
        borderWidth: 1,
        borderRadius: 14,
        backgroundColor: 'rgba(0,0,0,0.28)',
        overflow: 'hidden',
        position: 'relative',
    },
    mapGridH: {
        position: 'absolute',
        left: 0,
        right: 0,
        top: '50%',
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    mapGridV: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: '50%',
        width: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    mapCenterCrossH: {
        position: 'absolute',
        left: '46%',
        top: '50%',
        width: '8%',
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.35)',
    },
    mapCenterCrossV: {
        position: 'absolute',
        top: '46%',
        left: '50%',
        width: 1,
        height: '8%',
        backgroundColor: 'rgba(255,255,255,0.35)',
    },
    mapDot: {
        position: 'absolute',
        width: 14,
        height: 14,
        borderRadius: 7,
        borderWidth: 2,
        borderColor: '#fff',
    },
    mapLegend: {
        marginTop: 8,
        color: '#9ab3ac',
        fontSize: 11,
    },
    statusBox: {
        alignItems: 'center',
        borderRadius: 14,
        borderWidth: 1,
        padding: 12,
    },
    statusText: { color: '#fff', fontSize: 15.5, fontWeight: '800' },
    lastPushText: { color: '#8395b3', fontSize: 11, marginTop: 4 },
    mainBtn: {
        padding: 17,
        borderRadius: 16,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 8,
    },
    mainBtnText: { fontSize: 17, fontWeight: '900', letterSpacing: 0.4 },
    helpText: {
        color: '#8798b5',
        fontSize: 12,
        textAlign: 'center',
        lineHeight: 17,
        paddingHorizontal: 8,
    },
});

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
import { database, ref, set, onValue, removeData } from '../firebase';

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

export default function DustbinSimulator({ theme, themeKey, setThemeKey, themes }) {
    const [binId, setBinId] = useState('bin_001');
    const [fillLevel, setFillLevel] = useState(25);
    const [location, setLocation] = useState(null);
    const [isActive, setIsActive] = useState(false);
    const [autoFill, setAutoFill] = useState(false);
    const [lastPush, setLastPush] = useState(null);
    const [status, setStatus] = useState('Ready');
    const [lastFixMs, setLastFixMs] = useState(Date.now());
    const intervalRef = useRef(null);
    const autoFillRef = useRef(null);
    const glowAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        (async () => {
            const { status: permissionStatus } = await Location.requestForegroundPermissionsAsync();
            if (permissionStatus !== 'granted') {
                Alert.alert('Permission Denied', 'Location permission is required for simulation.');
                return;
            }
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            setLocation(loc.coords);
            setLastFixMs(Date.now());
        })();

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (autoFillRef.current) clearInterval(autoFillRef.current);
        };
    }, []);

    useEffect(() => {
        if (!isActive) {
            glowAnim.setValue(0);
            return;
        }
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(glowAnim, { toValue: 1, duration: 850, useNativeDriver: true }),
                Animated.timing(glowAnim, { toValue: 0, duration: 850, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [isActive, glowAnim]);

    const pushData = async (lat, lng, fill) => {
        try {
            await set(ref(database, `live/bins/${binId}`), {
                lat,
                lng,
                fillLevel: fill,
                status: 'active',
                address: `Simulated Bin ${binId}`,
                timestamp: Date.now(),
            });
            setLastPush(new Date().toLocaleTimeString());
            setStatus('Data pushed');
        } catch (error) {
            setStatus('Push failed');
            console.error('Firebase push error:', error);
        }
    };

    const startSimulation = async () => {
        setIsActive(true);
        setStatus('Simulating');

        if (location) {
            pushData(location.latitude, location.longitude, fillLevel);
        }

        intervalRef.current = setInterval(async () => {
            try {
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
                setLocation(loc.coords);
                setLastFixMs(Date.now());
            } catch (e) {
                console.error('Location error:', e);
            }
        }, 3000);
    };

    useEffect(() => {
        if (isActive && location) {
            pushData(location.latitude, location.longitude, fillLevel);
        }
    }, [fillLevel, location, isActive]);

    useEffect(() => {
        const liveBinRef = ref(database, `live/bins/${binId}`);
        const unsubscribe = onValue(liveBinRef, (snapshot) => {
            const val = snapshot.val();
            if (!val) return;

            if (typeof val.fillLevel === 'number') {
                setFillLevel((prev) => (prev === val.fillLevel ? prev : val.fillLevel));
            }

            if (val.status === 'collected') {
                setIsActive(false);
                setAutoFill(false);
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                }
                if (autoFillRef.current) {
                    clearInterval(autoFillRef.current);
                    autoFillRef.current = null;
                }
                setStatus('Collected by truck driver');
            }
        });

        return () => unsubscribe();
    }, [binId]);

    const stopSimulation = async () => {
        setIsActive(false);
        setAutoFill(false);

        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        if (autoFillRef.current) {
            clearInterval(autoFillRef.current);
            autoFillRef.current = null;
        }

        try {
            await removeData(ref(database, `live/bins/${binId}`));
        } catch (e) {
            console.error('Failed to remove bin:', e);
        }

        setStatus('Stopped and removed from map');
    };

    const toggleAutoFill = () => {
        if (autoFill) {
            if (autoFillRef.current) clearInterval(autoFillRef.current);
            autoFillRef.current = null;
            setAutoFill(false);
            return;
        }

        setAutoFill(true);
        autoFillRef.current = setInterval(() => {
            setFillLevel((prev) => Math.min(prev + Math.floor(Math.random() * 5) + 1, 100));
        }, 2000);
    };

    const adjustFill = (delta) => {
        const newFill = Math.max(0, Math.min(100, fillLevel + delta));
        setFillLevel(newFill);

        if (!isActive && location) {
            pushData(location.latitude, location.longitude, newFill);
        }
    };

    const getFillColor = () => {
        if (fillLevel >= 80) return '#ff5c4d';
        if (fillLevel >= 50) return '#ffb34d';
        return theme.accent;
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
                    <Text style={[styles.heroKicker, { color: theme.accent }]}>DUSTBIN ENGINE</Text>
                    <Text style={styles.heroTitle}>Bin Telemetry Deck</Text>
                    <Text style={styles.heroSub}>Live sensor simulation with location beacon.</Text>
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
                                        borderColor: key === themeKey ? theme.accent : theme.border,
                                        backgroundColor: key === themeKey ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.2)',
                                    },
                                ]}
                                onPress={() => setThemeKey(key)}
                            >
                                <Text style={[styles.themeBtnText, { color: key === themeKey ? theme.accent : '#b8c8c3' }]}>
                                    {THEME_LABELS[key]}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                <View style={[styles.panel, { backgroundColor: theme.panel, borderColor: theme.border }]}>
                    <Text style={styles.sectionLabel}>BIN ID</Text>
                    <TextInput
                        style={[styles.input, { borderColor: theme.border }]}
                        value={binId}
                        onChangeText={setBinId}
                        placeholder="e.g., bin_001"
                        placeholderTextColor="#789088"
                        editable={!isActive}
                    />
                </View>

                <View style={[styles.gaugeCard, { backgroundColor: theme.panel, borderColor: theme.border }]}>
                    <Text style={styles.sectionLabel}>FILL LEVEL</Text>
                    <Animated.View
                        style={[
                            styles.gauge,
                            {
                                borderColor: getFillColor(),
                                transform: [{ scale: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) }],
                            },
                        ]}
                    >
                        <View style={styles.gaugeTopShine} />
                        <View style={[styles.gaugeFill, { height: `${fillLevel}%`, backgroundColor: getFillColor() }]} />
                        <Text style={styles.gaugeText}>{fillLevel}%</Text>
                        <Text style={styles.gaugeBottomText}>BIN</Text>
                    </Animated.View>

                    <View style={styles.fillControls}>
                        <TouchableOpacity style={styles.fillBtn} onPress={() => adjustFill(-10)}>
                            <Text style={[styles.fillBtnText, { color: theme.accent }]}>-10</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.fillBtn} onPress={() => adjustFill(-5)}>
                            <Text style={[styles.fillBtnText, { color: theme.accent }]}>-5</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.fillBtn, styles.fillBtnWarm]} onPress={() => adjustFill(5)}>
                            <Text style={[styles.fillBtnText, styles.fillBtnWarmText]}>+5</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.fillBtn, styles.fillBtnHot]} onPress={() => adjustFill(10)}>
                            <Text style={[styles.fillBtnText, styles.fillBtnHotText]}>+10</Text>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        style={[styles.autoFillBtn, { borderColor: theme.border }, autoFill && styles.autoFillActive]}
                        onPress={toggleAutoFill}
                    >
                        <Text style={[styles.autoFillText, { color: theme.text }]}>
                            {autoFill ? 'Stop Auto-Fill' : 'Start Auto-Fill'}
                        </Text>
                    </TouchableOpacity>
                </View>

                <View style={[styles.panel, { backgroundColor: theme.panel, borderColor: theme.border }]}>
                    <Text style={styles.sectionLabel}>GPS LOCATION</Text>
                    <View style={[styles.gpsBox, { borderColor: theme.border }]}> 
                        <Text style={styles.gpsText}>
                            {location
                                ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`
                                : 'Acquiring location...'}
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
                            <Text style={styles.locLabel}>HEADING</Text>
                            <Text style={styles.locValue}>{location?.heading ? `${Math.round(location.heading)} deg` : '--'}</Text>
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
                                        backgroundColor: theme.accent,
                                        left: `${mapPoint.x}%`,
                                        top: `${mapPoint.y}%`,
                                        transform: [
                                            { translateX: -7 },
                                            { translateY: -7 },
                                            { scale: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) },
                                        ],
                                    },
                                ]}
                            />
                        )}
                    </View>
                    <Text style={styles.mapLegend}>Center: Coimbatore zone | Dot: simulated bin</Text>
                </View>

                <View style={[styles.statusBox, { backgroundColor: theme.panel, borderColor: theme.border }]}>
                    <Text style={styles.statusText}>{status}</Text>
                    {lastPush && <Text style={styles.lastPushText}>Last push: {lastPush}</Text>}
                </View>

                <TouchableOpacity
                    style={[
                        styles.mainBtn,
                        { backgroundColor: isActive ? '#ff5c4d' : theme.accent },
                    ]}
                    onPress={isActive ? stopSimulation : startSimulation}
                >
                    <Text style={[styles.mainBtnText, { color: theme.buttonTextDark }]}>
                        {isActive ? 'Stop Simulation' : 'Start Simulation'}
                    </Text>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: { padding: 18, paddingBottom: 28, gap: 12 },
    bgOrbA: {
        position: 'absolute',
        width: 210,
        height: 210,
        borderRadius: 105,
        top: -50,
        right: -35,
    },
    bgOrbB: {
        position: 'absolute',
        width: 250,
        height: 250,
        borderRadius: 125,
        bottom: -80,
        left: -40,
    },
    heroCard: {
        borderWidth: 1,
        borderRadius: 22,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.24,
        shadowRadius: 14,
        elevation: 8,
    },
    heroKicker: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
    heroTitle: { color: '#ffffff', fontSize: 24, fontWeight: '900', marginTop: 6 },
    heroSub: { color: '#9bb3aa', fontSize: 12.5, marginTop: 4 },
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
    panel: {
        borderWidth: 1,
        borderRadius: 16,
        padding: 14,
    },
    sectionLabel: { color: '#a9c2b8', fontSize: 11, fontWeight: '700', letterSpacing: 1.8, marginBottom: 8 },
    input: {
        backgroundColor: 'rgba(0,0,0,0.32)',
        borderWidth: 1,
        borderRadius: 12,
        color: '#fff',
        padding: 14,
        fontSize: 16,
        fontWeight: '600',
    },
    gaugeCard: {
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 20,
        paddingVertical: 14,
        paddingHorizontal: 12,
    },
    gauge: {
        width: 152,
        height: 208,
        backgroundColor: 'rgba(0,0,0,0.38)',
        borderWidth: 2,
        borderRadius: 20,
        overflow: 'hidden',
        justifyContent: 'flex-end',
        alignItems: 'center',
        position: 'relative',
        shadowColor: '#59eba2',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 14,
        elevation: 6,
    },
    gaugeTopShine: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 44,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    gaugeFill: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        opacity: 0.78,
    },
    gaugeText: {
        position: 'absolute',
        top: '38%',
        color: '#fff',
        fontSize: 34,
        fontWeight: '900',
        textShadowColor: 'rgba(0,0,0,0.75)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 6,
    },
    gaugeBottomText: {
        position: 'absolute',
        bottom: 10,
        color: '#d1f8e0',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 2,
    },
    fillControls: { flexDirection: 'row', gap: 8, marginTop: 14 },
    fillBtn: {
        minWidth: 56,
        alignItems: 'center',
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: '#67f59d',
        borderRadius: 11,
        backgroundColor: 'rgba(12, 35, 27, 0.8)',
    },
    fillBtnText: { fontWeight: '800', fontSize: 13 },
    fillBtnWarm: { borderColor: '#ffb34d' },
    fillBtnHot: { borderColor: '#ff5c4d' },
    fillBtnWarmText: { color: '#ffb34d' },
    fillBtnHotText: { color: '#ff5c4d' },
    autoFillBtn: {
        marginTop: 12,
        paddingHorizontal: 22,
        paddingVertical: 10,
        borderWidth: 1,
        borderRadius: 12,
        backgroundColor: 'rgba(103,245,157,0.07)',
    },
    autoFillActive: {
        borderColor: '#67f59d',
        backgroundColor: 'rgba(103,245,157,0.17)',
    },
    autoFillText: { fontWeight: '700', fontSize: 13 },
    gpsBox: {
        backgroundColor: 'rgba(0,0,0,0.33)',
        borderRadius: 11,
        padding: 12,
        borderWidth: 1,
    },
    gpsText: { color: '#b7cfc6', fontSize: 13, fontFamily: 'monospace' },
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
    lastPushText: { color: '#8aa19a', fontSize: 11, marginTop: 4 },
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
});

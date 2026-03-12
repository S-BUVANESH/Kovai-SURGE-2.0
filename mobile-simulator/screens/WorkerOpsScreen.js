import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Linking,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import * as Location from 'expo-location';
import {
    database,
    firestore,
    ref,
    set,
    onValue,
    collection,
    getDocs,
    query,
    where,
    addDoc,
    doc,
    setDoc,
    updateDoc,
    serverTimestamp,
} from '../firebase';

const COIMBATORE = { lat: 11.0168, lng: 76.9558 };
const MAP_SPAN = 0.05;

const clamp = (num, min, max) => Math.min(Math.max(num, min), max);
const toRad = (deg) => (deg * Math.PI) / 180;
const distanceKm = (a, b) => {
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const THEME_LABELS = {
    neon: 'Neon',
    ocean: 'Ocean',
    sunset: 'Sunset',
    military: 'Ops',
};

export default function WorkerOpsScreen({ theme, themeKey, setThemeKey, themes }) {
    const [workerEmail, setWorkerEmail] = useState('worker01@td.in');
    const [truckId, setTruckId] = useState('truck_1');
    const [isShiftActive, setIsShiftActive] = useState(false);
    const [location, setLocation] = useState(null);
    const [speedKmh, setSpeedKmh] = useState(0);
    const [heading, setHeading] = useState(0);
    const [routeBins, setRouteBins] = useState([]);
    const [reports, setReports] = useState([]);
    const [liveBins, setLiveBins] = useState([]);
    const [loadingRoute, setLoadingRoute] = useState(false);
    const [section, setSection] = useState('route');
    const [issueType, setIssueType] = useState('Bin Damaged');
    const [issueBinId, setIssueBinId] = useState('');
    const [issueText, setIssueText] = useState('');
    const [workerDocId, setWorkerDocId] = useState(null);
    const [lastLiveUpdateMs, setLastLiveUpdateMs] = useState(0);

    const watchRef = useRef(null);
    const pushTimerRef = useRef(null);
    const latestLocationRef = useRef(null);

    useEffect(() => {
        (async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission required', 'Location access is required for driver operations.');
                return;
            }
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            const coords = loc.coords;
            setLocation(coords);
            latestLocationRef.current = coords;
        })();

        return () => {
            if (watchRef.current) {
                watchRef.current.remove();
                watchRef.current = null;
            }
            if (pushTimerRef.current) {
                clearInterval(pushTimerRef.current);
                pushTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        refreshData();
    }, []);

    useEffect(() => {
        const liveBinsRef = ref(database, 'live/bins');
        const unsubscribe = onValue(liveBinsRef, (snapshot) => {
            const val = snapshot.val() || {};
            const items = Object.keys(val).map((id) => ({ id, ...val[id] }));
            setLiveBins(items);
            setLastLiveUpdateMs(Date.now());
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        resolveWorkerProfile();
    }, [workerEmail]);

    useEffect(() => {
        const timer = setInterval(() => {
            refreshData(false);
        }, 20000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!lastLiveUpdateMs) return;
        refreshData(false);
    }, [lastLiveUpdateMs]);

    const collectedCount = useMemo(() => routeBins.filter((b) => b.collected).length, [routeBins]);

    const buildRouteFromSources = (firestoreBins, openReports) => {
        const mergedMap = {};

        (firestoreBins || []).forEach((b) => {
            mergedMap[b.id] = { id: b.id, ...b };
        });

        // Always prioritize live simulator bins so worker sees simulation instantly.
        (liveBins || []).forEach((lb) => {
            const existing = mergedMap[lb.id] || { id: lb.id };
            const lat = Number(lb.lat ?? lb.latitude ?? existing.lat);
            const lng = Number(lb.lng ?? lb.longitude ?? existing.lng);
            mergedMap[lb.id] = {
                ...existing,
                ...lb,
                lat: Number.isFinite(lat) ? lat : existing.lat,
                lng: Number.isFinite(lng) ? lng : existing.lng,
                fillLevel:
                    typeof lb.fillLevel === 'number'
                        ? lb.fillLevel
                        : Number.isFinite(Number(existing.fillLevel))
                            ? Number(existing.fillLevel)
                            : 0,
                address: lb.address || existing.address || `Simulated Bin ${lb.id}`,
                // Live simulator presence should be visible unless explicitly marked collected.
                status: typeof lb.status === 'string' ? lb.status : 'active',
            };
        });

        const mergedBins = Object.values(mergedMap);

        const activeBins = mergedBins
            .filter((b) => (b.status || 'active') !== 'collected' && typeof b.lat === 'number' && typeof b.lng === 'number')
            .map((b) => {
                const reportCount = (openReports || []).filter((r) => {
                    const txt = `${(r.type || '').toLowerCase()} ${(r.location || '').toLowerCase()} ${(r.description || '').toLowerCase()}`;
                    const idHit = txt.includes((b.id || '').toLowerCase());
                    const addressHit = txt.includes(((b.address || '').split(',')[0] || '').toLowerCase());
                    const geoHit =
                        typeof r.lat === 'number' &&
                        typeof r.lng === 'number' &&
                        distanceKm({ lat: b.lat, lng: b.lng }, { lat: r.lat, lng: r.lng }) <= 0.4;
                    return idHit || addressHit || geoHit;
                }).length;

                const fillLevel = Number(b.fillLevel || 0);
                let priority = fillLevel;
                if ((b.status || '').toLowerCase() === 'critical') priority += 20;
                if (reportCount > 0) priority += 35 + reportCount * 8;

                return {
                    id: b.id,
                    address: b.address || 'N/A',
                    lat: b.lat,
                    lng: b.lng,
                    fillLevel,
                    status: b.status || 'active',
                    reportCount,
                    priority,
                    collected: false,
                };
            });

        const origin = location
            ? { lat: location.latitude, lng: location.longitude }
            : COIMBATORE;

        const ordered = optimizeRoute(activeBins, origin);
        setRouteBins(ordered);
    };

    const refreshData = async (showLoading = true) => {
        if (showLoading) setLoadingRoute(true);
        try {
            const [binsSnap, reportSnap] = await Promise.all([
                getDocs(collection(firestore, 'bins')),
                getDocs(query(collection(firestore, 'reports'), where('status', '==', 'open'))),
            ]);

            const firestoreBins = binsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            const openReports = reportSnap.docs
                .map((d) => ({ id: d.id, ...d.data() }))
                .sort((a, b) => {
                    const ta = a?.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
                    const tb = b?.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
                    return tb - ta;
                });
            setReports(openReports);
            buildRouteFromSources(firestoreBins, openReports);
        } catch (e) {
            console.error('[WorkerOps] refresh error', e);
            // Still build route from simulator live bins even if Firestore/network/index fails.
            buildRouteFromSources([], reports || []);
        } finally {
            if (showLoading) setLoadingRoute(false);
        }
    };

    const resolveWorkerProfile = async () => {
        const email = workerEmail.trim().toLowerCase();
        if (!email) return;
        try {
            const userSnap = await getDocs(query(collection(firestore, 'users'), where('email', '==', email)));
            if (!userSnap.empty) {
                const row = userSnap.docs[0];
                const data = row.data() || {};
                setWorkerDocId(row.id);
                if (data.truckId && !isShiftActive) {
                    setTruckId(data.truckId);
                }
                return;
            }
            const newUser = await addDoc(collection(firestore, 'users'), {
                email,
                role: 'worker',
                truckId,
                name: email.split('@')[0],
                createdAt: serverTimestamp(),
            });
            setWorkerDocId(newUser.id);
        } catch (e) {
            console.warn('[WorkerOps] resolve worker profile failed', e);
        }
    };

    const optimizeRoute = (bins, origin) => {
        const remaining = [...bins];
        const ordered = [];
        let cursor = { ...origin };

        while (remaining.length) {
            let pickIndex = 0;
            let best = Number.POSITIVE_INFINITY;

            for (let i = 0; i < remaining.length; i++) {
                const b = remaining[i];
                const dist = distanceKm(cursor, { lat: b.lat, lng: b.lng });
                const score = dist - b.priority * 0.01;
                if (score < best) {
                    best = score;
                    pickIndex = i;
                }
            }

            const next = remaining.splice(pickIndex, 1)[0];
            next.distanceFromTruckKm = distanceKm(origin, { lat: next.lat, lng: next.lng });
            ordered.push(next);
            cursor = { lat: next.lat, lng: next.lng };
        }

        return ordered;
    };

    const pushTruckData = async () => {
        const loc = latestLocationRef.current;
        if (!loc) return;
        try {
            await set(ref(database, `live/trucks/${truckId}`), {
                lat: loc.latitude,
                lng: loc.longitude,
                speed: Math.round((loc.speed || 0) * 3.6),
                heading: Math.round(loc.heading || 0),
                driverName: workerEmail.split('@')[0],
                vehicleNumber: `TN-37-SIM-${truckId.replace('truck_', '')}`,
                timestamp: Date.now(),
            });
        } catch (e) {
            console.error('[WorkerOps] push truck failed', e);
        }
    };

    const startShift = async () => {
        if (isShiftActive) return;
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission required', 'Location access is required.');
            return;
        }

        setIsShiftActive(true);
        if (workerDocId) {
            try {
                await updateDoc(doc(firestore, 'users', workerDocId), {
                    role: 'worker',
                    truckId,
                    lastShiftStart: serverTimestamp(),
                });
            } catch (e) {
                console.warn('[WorkerOps] assignment save failed', e);
            }
        }
        watchRef.current = await Location.watchPositionAsync(
            {
                accuracy: Location.Accuracy.BestForNavigation,
                timeInterval: 2000,
                distanceInterval: 5,
            },
            (loc) => {
                const coords = loc.coords;
                setLocation(coords);
                setSpeedKmh(Math.round((coords.speed || 0) * 3.6));
                setHeading(Math.round(coords.heading || 0));
                latestLocationRef.current = coords;
            }
        );

        if (pushTimerRef.current) clearInterval(pushTimerRef.current);
        pushTimerRef.current = setInterval(() => {
            pushTruckData();
        }, 3000);

        await pushTruckData();
        await refreshData(false);
    };

    const endShift = async () => {
        setIsShiftActive(false);
        if (watchRef.current) {
            watchRef.current.remove();
            watchRef.current = null;
        }
        if (pushTimerRef.current) {
            clearInterval(pushTimerRef.current);
            pushTimerRef.current = null;
        }
        try {
            await set(ref(database, `live/trucks/${truckId}`), null);
        } catch (e) {
            console.error('[WorkerOps] remove truck failed', e);
        }
        if (workerDocId) {
            try {
                await updateDoc(doc(firestore, 'users', workerDocId), {
                    lastShiftEnd: serverTimestamp(),
                });
            } catch (e) {
                console.warn('[WorkerOps] shift end save failed', e);
            }
        }
    };

    const navigateToBin = (bin) => {
        const origin = location
            ? `${location.latitude},${location.longitude}`
            : `${COIMBATORE.lat},${COIMBATORE.lng}`;
        const destination = `${bin.lat},${bin.lng}`;
        const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
        Linking.openURL(url).catch((e) => console.error('Map open failed', e));
    };

    const openFullRoute = () => {
        const pending = routeBins.filter((b) => !b.collected);
        if (!pending.length) return;

        const origin = location
            ? `${location.latitude},${location.longitude}`
            : `${COIMBATORE.lat},${COIMBATORE.lng}`;
        const destination = `${pending[pending.length - 1].lat},${pending[pending.length - 1].lng}`;
        const waypoints = pending
            .slice(0, -1)
            .slice(0, 8)
            .map((b) => `${b.lat},${b.lng}`)
            .join('|');
        const wpParam = waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : '';
        const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${wpParam}&travelmode=driving`;
        Linking.openURL(url).catch((e) => console.error('Route open failed', e));
    };

    const collectBin = async (bin) => {
        if (!location) {
            Alert.alert('Location unavailable', 'Current truck location is required for collection.');
            return;
        }
        const dist = distanceKm(
            { lat: location.latitude, lng: location.longitude },
            { lat: bin.lat, lng: bin.lng }
        );
        if (dist > 0.04) {
            Alert.alert(
                'Not at bin yet',
                `You are ${(dist * 1000).toFixed(0)}m away. Move within 40m to collect this bin.`
            );
            return;
        }

        try {
            await setDoc(doc(firestore, 'bins', bin.id), {
                fillLevel: 0,
                status: 'collected',
                collectedBy: workerEmail,
                lastCollected: serverTimestamp(),
                lastUpdated: serverTimestamp(),
                lat: bin.lat,
                lng: bin.lng,
                address: bin.address || `Simulated Bin ${bin.id}`,
            }, { merge: true });
        } catch (e) {
            console.warn('[WorkerOps] firestore collect failed', e);
        }

        try {
            await set(ref(database, `live/bins/${bin.id}`), {
                lat: bin.lat,
                lng: bin.lng,
                fillLevel: 0,
                status: 'collected',
                collectedBy: workerEmail,
                address: bin.address,
                timestamp: Date.now(),
            });
        } catch (e) {
            console.warn('[WorkerOps] rtdb collect failed', e);
        }

        setRouteBins((prev) => prev.map((b) => (b.id === bin.id ? { ...b, collected: true, fillLevel: 0 } : b)));
    };

    const submitIssue = async () => {
        if (!issueText.trim()) {
            Alert.alert('Missing description', 'Please enter issue description.');
            return;
        }
        try {
            await addDoc(collection(firestore, 'reports'), {
                type: issueType,
                location: issueBinId ? `Bin ${issueBinId}` : 'Worker reported',
                description: issueText.trim(),
                reportedBy: workerEmail,
                status: 'open',
                createdAt: serverTimestamp(),
            });
            setIssueText('');
            setIssueBinId('');
            Alert.alert('Submitted', 'Issue reported successfully.');
            refreshData(false);
        } catch (e) {
            console.error('[WorkerOps] report submit failed', e);
            Alert.alert('Error', 'Failed to submit issue.');
        }
    };

    const mapPoint = location
        ? {
            x: clamp(50 + ((location.longitude - COIMBATORE.lng) / MAP_SPAN) * 100, 6, 94),
            y: clamp(50 - ((location.latitude - COIMBATORE.lat) / MAP_SPAN) * 100, 8, 92),
        }
        : null;

    const routeMapPoints = useMemo(() => {
        const points = [];
        if (mapPoint) {
            points.push({ x: mapPoint.x, y: mapPoint.y, kind: 'truck', label: 'T' });
        }
        routeBins
            .filter((b) => !b.collected)
            .slice(0, 8)
            .forEach((b, idx) => {
                const x = clamp(50 + ((b.lng - COIMBATORE.lng) / MAP_SPAN) * 100, 6, 94);
                const y = clamp(50 - ((b.lat - COIMBATORE.lat) / MAP_SPAN) * 100, 8, 92);
                points.push({ x, y, kind: 'bin', label: String(idx + 1) });
            });
        return points;
    }, [mapPoint, routeBins]);

    const totalDistanceKm = routeBins
        .filter((b) => !b.collected)
        .reduce((sum, b) => sum + (b.distanceFromTruckKm || 0), 0);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}> 
            <View style={[styles.bgOrbA, { backgroundColor: theme.orbA }]} />
            <View style={[styles.bgOrbB, { backgroundColor: theme.orbB }]} />

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={[styles.heroCard, { backgroundColor: theme.panel, borderColor: theme.border }]}> 
                    <Text style={[styles.heroKicker, { color: theme.accentAlt }]}>DRIVER OPS</Text>
                    <Text style={styles.heroTitle}>Worker Command App</Text>
                    <Text style={styles.heroSub}>Route, reports and collection in one mobile workflow.</Text>
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
                                <Text style={[styles.themeBtnText, { color: key === themeKey ? theme.accentAlt : '#b8c8c3' }]}>
                                    {THEME_LABELS[key]}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                <View style={[styles.panel, { backgroundColor: theme.panel, borderColor: theme.border }]}>
                    <Text style={styles.sectionLabel}>SHIFT CONTROL</Text>
                    <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.fieldLabel}>Worker Email</Text>
                            <TextInput
                                value={workerEmail}
                                onChangeText={setWorkerEmail}
                                editable={!isShiftActive}
                                style={[styles.input, { borderColor: theme.border }]}
                                autoCapitalize="none"
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.fieldLabel}>Truck ID</Text>
                            <TextInput
                                value={truckId}
                                onChangeText={setTruckId}
                                editable={!isShiftActive}
                                style={[styles.input, { borderColor: theme.border }]}
                                autoCapitalize="none"
                            />
                        </View>
                    </View>
                    <View style={[styles.statStrip, { borderColor: theme.border }]}> 
                        <Text style={styles.statText}>Speed: {speedKmh} km/h</Text>
                        <Text style={styles.statText}>Heading: {heading} deg</Text>
                        <Text style={styles.statText}>Collected: {collectedCount}/{routeBins.length}</Text>
                    </View>
                    <TouchableOpacity
                        style={[styles.primaryBtn, { backgroundColor: isShiftActive ? '#ff6f61' : theme.accentAlt }]}
                        onPress={isShiftActive ? endShift : startShift}
                    >
                        <Text style={[styles.primaryBtnText, { color: theme.buttonTextDark }]}>
                            {isShiftActive ? 'End Shift' : 'Start Shift'}
                        </Text>
                    </TouchableOpacity>
                </View>

                <View style={[styles.sectionTabs, { backgroundColor: theme.panel, borderColor: theme.border }]}> 
                    {['route', 'reports', 'profile'].map((k) => (
                        <TouchableOpacity
                            key={k}
                            onPress={() => setSection(k)}
                            style={[
                                styles.tabBtn,
                                {
                                    borderColor: section === k ? theme.accentAlt : 'transparent',
                                    backgroundColor: section === k ? 'rgba(255,255,255,0.08)' : 'transparent',
                                },
                            ]}
                        >
                            <Text style={[styles.tabText, { color: section === k ? theme.accentAlt : '#9ab0a7' }]}>{k.toUpperCase()}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {section === 'route' && (
                    <View style={[styles.panel, { backgroundColor: theme.panel, borderColor: theme.border }]}> 
                        <View style={styles.headerRow}>
                            <Text style={styles.sectionLabel}>ASSIGNED ROUTE</Text>
                            <View style={styles.headerBtns}>
                                <TouchableOpacity style={[styles.miniBtn, { borderColor: theme.border }]} onPress={() => refreshData(false)}>
                                    <Text style={[styles.miniBtnText, { color: theme.text }]}>{loadingRoute ? 'Loading' : 'Refresh'}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.miniBtn, { borderColor: theme.border }]} onPress={openFullRoute}>
                                    <Text style={[styles.miniBtnText, { color: theme.text }]}>Open Route</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <Text style={styles.routeMeta}>Pending stops: {routeBins.length - collectedCount} | Score distance: {totalDistanceKm.toFixed(2)} km</Text>

                        <View style={[styles.miniMap, { borderColor: theme.border }]}> 
                            <View style={styles.mapGridH} />
                            <View style={styles.mapGridV} />
                            {routeMapPoints.map((p, i) => {
                                const next = routeMapPoints[i + 1];
                                let connector = null;
                                if (next) {
                                    const dx = next.x - p.x;
                                    const dy = next.y - p.y;
                                    const len = Math.sqrt(dx * dx + dy * dy);
                                    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
                                    connector = (
                                        <View
                                            key={`line-${i}`}
                                            style={[
                                                styles.routeConnector,
                                                {
                                                    left: `${p.x}%`,
                                                    top: `${p.y}%`,
                                                    width: `${len}%`,
                                                    transform: [{ translateX: 0 }, { translateY: -1 }, { rotate: `${angle}deg` }],
                                                    backgroundColor: 'rgba(255,255,255,0.28)',
                                                },
                                            ]}
                                        />
                                    );
                                }
                                return (
                                    <React.Fragment key={`point-${p.label}-${i}`}>
                                        {connector}
                                        <View
                                            style={[
                                                styles.mapDot,
                                                {
                                                    backgroundColor: p.kind === 'truck' ? theme.accentAlt : theme.accent,
                                                    left: `${p.x}%`,
                                                    top: `${p.y}%`,
                                                    transform: [{ translateX: -8 }, { translateY: -8 }],
                                                },
                                            ]}
                                        >
                                            <Text style={styles.mapDotLabel}>{p.label}</Text>
                                        </View>
                                    </React.Fragment>
                                );
                            })}
                        </View>

                        <View style={styles.listGap}>
                            {routeBins.map((bin, idx) => {
                                const fillColor = bin.fillLevel >= 80 ? '#fa4b38' : bin.fillLevel >= 50 ? '#fa9d38' : theme.accent;
                                return (
                                    <View key={bin.id} style={[styles.routeCard, { borderColor: theme.border }]}> 
                                        <View style={styles.routeHead}>
                                            <Text style={styles.routeTitle}>#{idx + 1} {bin.id}</Text>
                                            <Text style={[styles.routeBadge, { color: fillColor }]}>{bin.fillLevel}%</Text>
                                        </View>
                                        <Text style={styles.routeAddress}>{bin.address}</Text>
                                        <Text style={styles.routeSub}>
                                            {(bin.distanceFromTruckKm || 0).toFixed(2)} km | Reports: {bin.reportCount || 0}
                                        </Text>
                                        <View style={styles.row}>
                                            <TouchableOpacity
                                                style={[styles.actionBtn, { borderColor: theme.border }]}
                                                onPress={() => navigateToBin(bin)}
                                                disabled={bin.collected}
                                            >
                                                <Text style={[styles.actionBtnText, { color: theme.text }]}>{bin.collected ? 'Done' : 'Navigate'}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.actionBtn, { borderColor: theme.border }]}
                                                onPress={() => collectBin(bin)}
                                                disabled={bin.collected}
                                            >
                                                <Text style={[styles.actionBtnText, { color: bin.collected ? '#7d8f88' : theme.accent }]}>
                                                    {bin.collected ? 'Collected' : 'Collect'}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                )}

                {section === 'reports' && (
                    <View style={[styles.panel, { backgroundColor: theme.panel, borderColor: theme.border }]}> 
                        <Text style={styles.sectionLabel}>CITIZEN REPORTS (OPEN)</Text>
                        <View style={styles.listGap}>
                            {reports.length === 0 && <Text style={styles.emptyText}>No open reports.</Text>}
                            {reports.slice(0, 8).map((r) => (
                                <View key={r.id} style={[styles.reportCard, { borderColor: theme.border }]}> 
                                    <Text style={styles.routeTitle}>{r.type || 'Issue'}</Text>
                                    <Text style={styles.routeAddress}>{r.location || 'Unknown location'}</Text>
                                    <Text style={styles.routeSub}>{(r.description || '').slice(0, 120)}</Text>
                                </View>
                            ))}
                        </View>

                        <Text style={[styles.sectionLabel, { marginTop: 14 }]}>REPORT AN ISSUE</Text>
                        <TextInput value={issueType} onChangeText={setIssueType} style={[styles.input, { borderColor: theme.border }]} />
                        <TextInput
                            value={issueBinId}
                            onChangeText={setIssueBinId}
                            placeholder="Bin ID (optional)"
                            placeholderTextColor="#7f938b"
                            style={[styles.input, { borderColor: theme.border, marginTop: 8 }]}
                        />
                        <TextInput
                            value={issueText}
                            onChangeText={setIssueText}
                            placeholder="Issue description"
                            placeholderTextColor="#7f938b"
                            multiline
                            style={[styles.input, styles.textArea, { borderColor: theme.border }]}
                        />
                        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.accentAlt }]} onPress={submitIssue}>
                            <Text style={[styles.primaryBtnText, { color: theme.buttonTextDark }]}>Submit Issue</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {section === 'profile' && (
                    <View style={[styles.panel, { backgroundColor: theme.panel, borderColor: theme.border }]}> 
                        <Text style={styles.sectionLabel}>DRIVER PROFILE</Text>
                        <View style={styles.listGap}>
                            <View style={[styles.profileCell, { borderColor: theme.border }]}>
                                <Text style={styles.fieldLabel}>Worker</Text>
                                <Text style={styles.profileValue}>{workerEmail}</Text>
                            </View>
                            <View style={[styles.profileCell, { borderColor: theme.border }]}>
                                <Text style={styles.fieldLabel}>Truck</Text>
                                <Text style={styles.profileValue}>{truckId}</Text>
                            </View>
                            <View style={[styles.profileCell, { borderColor: theme.border }]}>
                                <Text style={styles.fieldLabel}>Shift Status</Text>
                                <Text style={[styles.profileValue, { color: isShiftActive ? theme.accent : '#c4937f' }]}>
                                    {isShiftActive ? 'Active' : 'Inactive'}
                                </Text>
                            </View>
                        </View>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: { padding: 18, paddingBottom: 28, gap: 12 },
    bgOrbA: {
        position: 'absolute',
        width: 230,
        height: 230,
        borderRadius: 115,
        top: -80,
        right: -60,
    },
    bgOrbB: {
        position: 'absolute',
        width: 220,
        height: 220,
        borderRadius: 110,
        bottom: -80,
        left: -60,
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
    heroSub: { color: '#9cb0cb', fontSize: 12.5, marginTop: 4 },
    themeRow: { borderWidth: 1, borderRadius: 14, padding: 12 },
    themeLabel: { color: '#b7c9c3', fontSize: 11, fontWeight: '700', letterSpacing: 1.4, marginBottom: 8 },
    themeButtons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    themeBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
    themeBtnText: { fontSize: 12, fontWeight: '700' },
    panel: { borderWidth: 1, borderRadius: 16, padding: 14 },
    sectionLabel: { color: '#a8bbd9', fontSize: 11, fontWeight: '700', letterSpacing: 1.7, marginBottom: 8 },
    fieldLabel: { color: '#8aa099', fontSize: 10, fontWeight: '700', marginBottom: 4 },
    input: {
        backgroundColor: 'rgba(0,0,0,0.32)',
        borderWidth: 1,
        borderRadius: 12,
        color: '#fff',
        padding: 12,
        fontSize: 14,
        fontWeight: '600',
    },
    textArea: { marginTop: 8, minHeight: 84, textAlignVertical: 'top' },
    row: { flexDirection: 'row', gap: 8 },
    statStrip: {
        marginTop: 10,
        marginBottom: 10,
        borderWidth: 1,
        borderRadius: 12,
        padding: 10,
        backgroundColor: 'rgba(0,0,0,0.25)',
    },
    statText: { color: '#c3d6cf', fontSize: 12, marginBottom: 2 },
    primaryBtn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
    primaryBtnText: { fontSize: 14, fontWeight: '800' },
    sectionTabs: { borderWidth: 1, borderRadius: 12, padding: 6, flexDirection: 'row', gap: 6 },
    tabBtn: { flex: 1, paddingVertical: 8, borderWidth: 1, borderRadius: 10, alignItems: 'center' },
    tabText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerBtns: { flexDirection: 'row', gap: 6 },
    miniBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
    miniBtnText: { fontSize: 11, fontWeight: '700' },
    routeMeta: { color: '#90a59e', fontSize: 11, marginBottom: 8 },
    miniMap: {
        height: 100,
        borderWidth: 1,
        borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.3)',
        overflow: 'hidden',
        marginBottom: 10,
        position: 'relative',
    },
    mapGridH: { position: 'absolute', left: 0, right: 0, top: '50%', height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
    mapGridV: { position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
    mapDot: {
        position: 'absolute',
        width: 16,
        height: 16,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    mapDotLabel: { color: '#08111f', fontSize: 8, fontWeight: '900' },
    routeConnector: { position: 'absolute', height: 2 },
    listGap: { gap: 8 },
    routeCard: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 10,
        backgroundColor: 'rgba(0,0,0,0.2)',
    },
    routeHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    routeTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
    routeBadge: { fontSize: 12, fontWeight: '800' },
    routeAddress: { color: '#9ab1a8', fontSize: 12, marginTop: 4 },
    routeSub: { color: '#7f938b', fontSize: 11, marginTop: 3 },
    actionBtn: { marginTop: 8, flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
    actionBtnText: { fontSize: 12, fontWeight: '800' },
    reportCard: { borderWidth: 1, borderRadius: 12, padding: 10, backgroundColor: 'rgba(0,0,0,0.2)' },
    emptyText: { color: '#81958d', fontSize: 12 },
    profileCell: { borderWidth: 1, borderRadius: 12, padding: 10, backgroundColor: 'rgba(0,0,0,0.2)' },
    profileValue: { color: '#e8f2ee', fontSize: 14, fontWeight: '700' },
});

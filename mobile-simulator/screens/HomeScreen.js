import React, { useEffect, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    ScrollView,
    Animated,
} from 'react-native';

const THEME_LABELS = {
    neon: 'Neon',
    ocean: 'Ocean',
    sunset: 'Sunset',
    military: 'Ops',
};

export default function HomeScreen({ navigation, theme, themeKey, setThemeKey, themes }) {
    const pulse = useRef(new Animated.Value(0)).current;
    const introY = useRef(new Animated.Value(28)).current;
    const introOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, { toValue: 1, duration: 2300, useNativeDriver: true }),
                Animated.timing(pulse, { toValue: 0, duration: 2300, useNativeDriver: true }),
            ])
        ).start();

        Animated.parallel([
            Animated.timing(introY, { toValue: 0, duration: 550, useNativeDriver: true }),
            Animated.timing(introOpacity, { toValue: 1, duration: 520, useNativeDriver: true }),
        ]).start();
    }, [introOpacity, introY, pulse]);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}> 
            <View style={[styles.bgOrbA, { backgroundColor: theme.orbA }]} />
            <View style={[styles.bgOrbB, { backgroundColor: theme.orbB }]} />
            <Animated.View
                pointerEvents="none"
                style={[
                    styles.pulseRing,
                    {
                        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.45] }),
                        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] }) }],
                        borderColor: theme.border,
                    },
                ]}
            />

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <Animated.View
                    style={[
                        styles.header,
                        { backgroundColor: theme.panel, borderColor: theme.border },
                        { opacity: introOpacity, transform: [{ translateY: introY }] },
                    ]}
                >
                    <Text style={[styles.kicker, { color: theme.accent }]}>CONTROL DECK</Text>
                    <Text style={styles.logo}>KOVAI SURGE</Text>
                    <Text style={[styles.subtitle, { color: theme.text }]}>Smart Waste Device Simulator</Text>
                    <Text style={styles.description}>
                        Simulate bin and truck telemetry with live GPS and push updates directly to the admin maps.
                    </Text>
                </Animated.View>

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
                                <Text
                                    style={[
                                        styles.themeBtnText,
                                        { color: key === themeKey ? theme.accent : '#b8c8c3' },
                                    ]}
                                >
                                    {THEME_LABELS[key]}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                <View style={styles.cardsContainer}>
                    <TouchableOpacity
                        style={[
                            styles.card,
                            { backgroundColor: theme.binCard, borderColor: theme.border },
                        ]}
                        onPress={() => navigation.navigate('DustbinSimulator')}
                        activeOpacity={0.88}
                    >
                        <View style={[styles.cardLight, { backgroundColor: theme.accent }]} />
                        <View style={styles.cardTopRow}>
                            <Text style={styles.cardTag}>BIN</Text>
                            <View style={[styles.cardBadge, { borderColor: theme.accent }]}>
                                <Text style={[styles.cardBadgeText, { color: theme.accent }]}>Phone to Bin</Text>
                            </View>
                        </View>
                        <Text style={styles.cardTitle}>Dustbin Simulator</Text>
                        <Text style={styles.cardDesc}>
                            Fill-level sensor emulation with auto-fill mode and location beacon updates.
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.card,
                            { backgroundColor: theme.truckCard, borderColor: theme.border },
                        ]}
                        onPress={() => navigation.navigate('TruckSimulator')}
                        activeOpacity={0.88}
                    >
                        <View style={[styles.cardLight, { backgroundColor: theme.accentAlt }]} />
                        <View style={styles.cardTopRow}>
                            <Text style={styles.cardTag}>TRK</Text>
                            <View style={[styles.cardBadge, { borderColor: theme.accentAlt }]}>
                                <Text style={[styles.cardBadgeText, { color: theme.accentAlt }]}>Phone to Truck</Text>
                            </View>
                        </View>
                        <Text style={styles.cardTitle}>Truck Simulator</Text>
                        <Text style={styles.cardDesc}>
                            Continuous GPS, speed and heading stream for live movement on admin tracking maps.
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.card,
                            { backgroundColor: theme.panel, borderColor: theme.border },
                        ]}
                        onPress={() => navigation.navigate('WorkerOps')}
                        activeOpacity={0.88}
                    >
                        <View style={[styles.cardLight, { backgroundColor: theme.text }]} />
                        <View style={styles.cardTopRow}>
                            <Text style={styles.cardTag}>OPS</Text>
                            <View style={[styles.cardBadge, { borderColor: theme.text }]}>
                                <Text style={[styles.cardBadgeText, { color: theme.text }]}>Driver Workflow</Text>
                            </View>
                        </View>
                        <Text style={styles.cardTitle}>Worker Ops</Text>
                        <Text style={styles.cardDesc}>
                            In-app route assignment, citizen reports, navigation and live bin collection sync.
                        </Text>
                    </TouchableOpacity>
                </View>

                <View style={[styles.footer, { backgroundColor: theme.panel, borderColor: theme.border }]}>
                    <Text style={[styles.footerText, { color: theme.text }]}>Real-time Firebase telemetry enabled</Text>
                    <Text style={styles.footerSubtext}>
                        Keep admin dashboard open to monitor markers and movement.
                    </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 24,
        paddingBottom: 28,
        gap: 14,
    },
    bgOrbA: {
        position: 'absolute',
        width: 240,
        height: 240,
        borderRadius: 120,
        top: -60,
        left: -40,
    },
    bgOrbB: {
        position: 'absolute',
        width: 220,
        height: 220,
        borderRadius: 110,
        bottom: -40,
        right: -30,
    },
    pulseRing: {
        position: 'absolute',
        top: 34,
        alignSelf: 'center',
        width: 280,
        height: 120,
        borderRadius: 28,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
    },
    header: {
        borderWidth: 1,
        borderRadius: 24,
        padding: 20,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 18,
        elevation: 10,
    },
    kicker: {
        letterSpacing: 3,
        fontSize: 11,
        fontWeight: '700',
    },
    logo: {
        marginTop: 8,
        fontSize: 34,
        fontWeight: '900',
        color: '#fff',
        letterSpacing: 2,
    },
    subtitle: {
        fontSize: 13,
        fontWeight: '600',
        letterSpacing: 1.4,
        marginTop: 4,
    },
    description: {
        fontSize: 13,
        color: '#b4cbc2',
        textAlign: 'center',
        marginTop: 14,
        lineHeight: 19,
    },
    themeRow: {
        borderWidth: 1,
        borderRadius: 16,
        padding: 12,
    },
    themeLabel: {
        color: '#b7c9c3',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.4,
        marginBottom: 8,
    },
    themeButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    themeBtn: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
    },
    themeBtnText: {
        fontSize: 12,
        fontWeight: '700',
    },
    cardsContainer: {
        gap: 14,
    },
    card: {
        borderRadius: 22,
        padding: 20,
        borderWidth: 1,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.24,
        shadowRadius: 14,
        elevation: 8,
    },
    cardTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    cardLight: {
        position: 'absolute',
        top: -42,
        right: -28,
        width: 118,
        height: 118,
        opacity: 0.22,
        borderRadius: 59,
    },
    cardTag: {
        fontSize: 12,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        overflow: 'hidden',
        color: '#d9fff2',
        backgroundColor: 'rgba(255,255,255,0.1)',
        fontWeight: '800',
        letterSpacing: 1.2,
    },
    cardTitle: {
        marginTop: 14,
        fontSize: 21,
        fontWeight: '800',
        color: '#fff',
        marginBottom: 7,
    },
    cardDesc: {
        fontSize: 13.5,
        color: '#b5cdc4',
        lineHeight: 18,
    },
    cardBadge: {
        paddingHorizontal: 11,
        paddingVertical: 5,
        borderRadius: 999,
        borderWidth: 1,
        backgroundColor: 'rgba(10, 20, 17, 0.5)',
    },
    cardBadgeText: {
        fontSize: 11,
        fontWeight: '700',
    },
    footer: {
        marginTop: 4,
        borderRadius: 16,
        borderWidth: 1,
        paddingVertical: 14,
        paddingHorizontal: 12,
        alignItems: 'center',
    },
    footerText: {
        fontSize: 12.5,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    footerSubtext: {
        color: '#8aa299',
        fontSize: 11,
        marginTop: 4,
        textAlign: 'center',
    },
});

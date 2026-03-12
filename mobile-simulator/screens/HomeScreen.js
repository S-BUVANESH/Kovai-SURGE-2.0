import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';

export default function HomeScreen({ navigation }) {
    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.logo}>KOVAI~SURGE</Text>
                <Text style={styles.subtitle}>IoT Device Simulator</Text>
                <Text style={styles.description}>
                    Simulate smart waste management devices using your phone's GPS.
                    Choose a mode below.
                </Text>
            </View>

            <View style={styles.cardsContainer}>
                <TouchableOpacity
                    style={[styles.card, styles.dustbinCard]}
                    onPress={() => navigation.navigate('DustbinSimulator')}
                    activeOpacity={0.8}
                >
                    <Text style={styles.cardEmoji}>🗑️</Text>
                    <Text style={styles.cardTitle}>Dustbin Simulator</Text>
                    <Text style={styles.cardDesc}>
                        Simulate a smart dustbin with GPS location and adjustable fill level sensor
                    </Text>
                    <View style={styles.cardBadge}>
                        <Text style={styles.cardBadgeText}>Phone = Dustbin</Text>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.card, styles.truckCard]}
                    onPress={() => navigation.navigate('TruckSimulator')}
                    activeOpacity={0.8}
                >
                    <Text style={styles.cardEmoji}>🚛</Text>
                    <Text style={styles.cardTitle}>Truck Simulator</Text>
                    <Text style={styles.cardDesc}>
                        Simulate a waste collection truck with continuous GPS tracking as you move
                    </Text>
                    <View style={[styles.cardBadge, { borderColor: '#3b82f6' }]}>
                        <Text style={[styles.cardBadgeText, { color: '#3b82f6' }]}>Phone = Truck</Text>
                    </View>
                </TouchableOpacity>
            </View>

            <View style={styles.footer}>
                <Text style={styles.footerText}>
                    ⚡ Data pushes to Firebase in real-time
                </Text>
                <Text style={styles.footerSubtext}>
                    Open the admin dashboard on your computer to see live updates
                </Text>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0c1a0c',
        padding: 24,
        justifyContent: 'center',
    },
    header: {
        alignItems: 'center',
        marginBottom: 40,
    },
    logo: {
        fontSize: 32,
        fontWeight: '900',
        color: '#fff',
        letterSpacing: 4,
    },
    subtitle: {
        fontSize: 14,
        color: '#53d22d',
        fontWeight: '600',
        letterSpacing: 3,
        marginTop: 4,
    },
    description: {
        fontSize: 14,
        color: '#a5b6a0',
        textAlign: 'center',
        marginTop: 16,
        lineHeight: 20,
        paddingHorizontal: 20,
    },
    cardsContainer: {
        gap: 16,
    },
    card: {
        borderRadius: 20,
        padding: 24,
        borderWidth: 1,
    },
    dustbinCard: {
        backgroundColor: 'rgba(83, 210, 45, 0.05)',
        borderColor: 'rgba(83, 210, 45, 0.2)',
    },
    truckCard: {
        backgroundColor: 'rgba(59, 130, 246, 0.05)',
        borderColor: 'rgba(59, 130, 246, 0.2)',
    },
    cardEmoji: {
        fontSize: 48,
        marginBottom: 12,
    },
    cardTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#fff',
        marginBottom: 8,
    },
    cardDesc: {
        fontSize: 13,
        color: '#a5b6a0',
        lineHeight: 18,
        marginBottom: 12,
    },
    cardBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: '#53d22d',
    },
    cardBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#53d22d',
    },
    footer: {
        marginTop: 40,
        alignItems: 'center',
    },
    footerText: {
        color: '#53d22d',
        fontSize: 13,
        fontWeight: '600',
    },
    footerSubtext: {
        color: '#666',
        fontSize: 11,
        marginTop: 4,
    },
});

// ============================================================
// KOVAI~SURGE Database Module
// ============================================================
// Firestore for persistent data, RTDB for live tracking
// ============================================================

const SurgeDB = {

    // ---- BINS ----
    async getBins() {
        const snapshot = await db.collection('bins').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    async updateBin(binId, data) {
        await db.collection('bins').doc(binId).update({
            ...data,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    async markBinCollected(binId, workerUid) {
        await db.collection('bins').doc(binId).update({
            fillLevel: 0,
            status: 'collected',
            lastCollected: firebase.firestore.FieldValue.serverTimestamp(),
            collectedBy: workerUid
        });
    },

    // ---- TRUCKS ----
    async getTrucks() {
        const snapshot = await db.collection('trucks').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    // ---- USERS ----
    async getUser(uid) {
        const doc = await db.collection('users').doc(uid).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    },

    async getWorkers() {
        const snapshot = await db.collection('users').where('role', '==', 'worker').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    async updateUserPoints(uid, points) {
        await db.collection('users').doc(uid).update({
            greenPoints: firebase.firestore.FieldValue.increment(points)
        });
    },

    // ---- REPORTS ----
    async submitReport(reportData) {
        return await db.collection('reports').add({
            ...reportData,
            status: 'open',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    async getReports(status = null) {
        let query = db.collection('reports').orderBy('createdAt', 'desc');
        if (status) query = query.where('status', '==', status);
        const snapshot = await query.get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    async resolveReport(reportId) {
        await db.collection('reports').doc(reportId).update({
            status: 'resolved',
            resolvedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    },

    // ---- LIVE TRACKING (RTDB) ----
    onLiveBins(callback) {
        rtdb.ref('live/bins').on('value', snap => {
            const val = snap.val() || {};
            const binsList = Object.keys(val).map(key => ({ id: key, ...val[key] }));
            callback(binsList);
        });
    },

    onLiveTrucks(callback) {
        rtdb.ref('live/trucks').on('value', snap => {
            const val = snap.val() || {};
            const trucksList = Object.keys(val).map(key => ({ id: key, ...val[key] }));
            callback(trucksList);
        });
    },

    stopLiveListeners() {
        rtdb.ref('live/bins').off();
        rtdb.ref('live/trucks').off();
    },

    // ---- FIRESTORE REAL-TIME LISTENERS ----
    onReports(callback) {
        return db.collection('reports').orderBy('createdAt', 'desc')
            .onSnapshot(snapshot => {
                const reports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                callback(reports);
            });
    },

    onBins(callback) {
        return db.collection('bins').onSnapshot(snapshot => {
            const bins = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(bins);
        });
    },

    // ---- SEED DATA ----
    async seedDemoData() {
        const batch = db.batch();

        // Coimbatore bin locations
        const bins = [
            { address: '123 Gandhi Rd, R.S. Puram', zone: 'A', lat: 11.0070, lng: 76.9520, fillLevel: 85, status: 'active' },
            { address: '456 Avinashi Rd, Peelamedu', zone: 'B', lat: 11.0250, lng: 76.9720, fillLevel: 45, status: 'active' },
            { address: '789 Race Course Rd', zone: 'A', lat: 11.0005, lng: 76.9650, fillLevel: 92, status: 'critical' },
            { address: 'Near Ganga Hospital, Mettupalayam Rd', zone: 'C', lat: 11.0420, lng: 76.9380, fillLevel: 30, status: 'active' },
            { address: 'Fun Mall, Avinashi Rd', zone: 'B', lat: 11.0200, lng: 76.9800, fillLevel: 72, status: 'active' },
            { address: 'VOC Park Ground, N.S.R. Rd', zone: 'D', lat: 10.9970, lng: 76.9610, fillLevel: 88, status: 'warning' },
            { address: 'Brookefields Mall, Sivasakthi Nagar', zone: 'B', lat: 11.0180, lng: 77.0000, fillLevel: 15, status: 'active' },
            { address: 'Cross-Cut Rd, Gandhipuram', zone: 'D', lat: 11.0050, lng: 76.9700, fillLevel: 65, status: 'active' },
            { address: 'Saibaba Colony Main Rd', zone: 'A', lat: 11.0100, lng: 76.9450, fillLevel: 95, status: 'critical' },
            { address: 'Ukkadam Bus Stand Area', zone: 'E', lat: 10.9880, lng: 76.9570, fillLevel: 78, status: 'warning' },
        ];

        bins.forEach((bin, i) => {
            const ref = db.collection('bins').doc(`bin_${String(i + 1).padStart(3, '0')}`);
            batch.set(ref, {
                ...bin,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                lastCollected: null
            });
        });

        // Also seed bins to RTDB for live tracking
        const liveData = {};
        bins.forEach((bin, i) => {
            const binId = `bin_${String(i + 1).padStart(3, '0')}`;
            liveData[binId] = {
                lat: bin.lat,
                lng: bin.lng,
                fillLevel: bin.fillLevel,
                address: bin.address,
                timestamp: Date.now()
            };
        });
        await rtdb.ref('live/bins').set(liveData);

        // Trucks
        const trucks = [
            { vehicleNumber: 'TN-37-AB-1234', driverName: 'Rajesh Kumar', route: 'Downtown Core', status: 'active', lat: 11.0120, lng: 76.9600 },
            { vehicleNumber: 'TN-38-CD-5678', driverName: 'Priya Sharma', route: 'Peelamedu Loop', status: 'active', lat: 11.0280, lng: 76.9750 },
            { vehicleNumber: 'TN-37-EF-9012', driverName: 'Vikram Reddy', route: 'South Zone', status: 'active', lat: 10.9950, lng: 76.9550 },
        ];

        trucks.forEach((truck, i) => {
            const ref = db.collection('trucks').doc(`truck_${i + 1}`);
            batch.set(ref, {
                ...truck,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
        });

        // Seed trucks to RTDB
        const liveTrucks = {};
        trucks.forEach((truck, i) => {
            liveTrucks[`truck_${i + 1}`] = {
                lat: truck.lat,
                lng: truck.lng,
                speed: Math.floor(Math.random() * 30) + 10,
                heading: Math.floor(Math.random() * 360),
                driverName: truck.driverName,
                vehicleNumber: truck.vehicleNumber,
                timestamp: Date.now()
            };
        });
        await rtdb.ref('live/trucks').set(liveTrucks);

        // Sample reports
        const reports = [
            { type: 'Overflowing Bin', location: 'Near Ganga Hospital, R.S. Puram', description: 'Bin has been overflowing since yesterday morning.', reportedBy: 'citizen@gmail.com' },
            { type: 'Illegal Dumping', location: 'Behind VOC Park Ground', description: 'Construction debris dumped near the park entrance.', reportedBy: 'resident@gmail.com' },
            { type: 'Damaged Bin', location: 'Cross-Cut Rd, Gandhipuram', description: 'Bin lid broken, waste spilling on road.', reportedBy: 'user@gmail.com' },
        ];

        reports.forEach((report, i) => {
            const ref = db.collection('reports').doc(`report_${i + 1}`);
            batch.set(ref, {
                ...report,
                status: 'open',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });

        await batch.commit();
        console.log('[SURGE] Demo data seeded successfully!');
        return true;
    },

    async clearSeededData() {
        const batch = db.batch();

        for (let i = 1; i <= 10; i++) {
            const binId = `bin_${String(i).padStart(3, '0')}`;
            batch.delete(db.collection('bins').doc(binId));
        }

        for (let i = 1; i <= 3; i++) {
            batch.delete(db.collection('trucks').doc(`truck_${i}`));
            batch.delete(db.collection('reports').doc(`report_${i}`));
        }

        await batch.commit();
        await rtdb.ref('live/bins').set(null);
        await rtdb.ref('live/trucks').set(null);

        console.log('[SURGE] Seeded demo data removed.');
        return true;
    }
};


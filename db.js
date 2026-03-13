// ============================================================
// KOVAI~SURGE Database Module
// ============================================================
// Firebase-first with local cache fallback when auth/rules/network fail
// ============================================================

const SurgeDB = {
    _cacheKey(name) {
        return `surge_cache_${name}`;
    },

    _readCache(name, fallback) {
        try {
            const raw = localStorage.getItem(this._cacheKey(name));
            if (!raw) return fallback;
            const parsed = JSON.parse(raw);
            return parsed == null ? fallback : parsed;
        } catch (e) {
            return fallback;
        }
    },

    _writeCache(name, value) {
        try {
            localStorage.setItem(this._cacheKey(name), JSON.stringify(value));
        } catch (e) {
            // Ignore storage failures (private mode/quota/etc.)
        }
    },

    _touchNow() {
        return Date.now();
    },

    _cacheCollection(name, items) {
        const safeItems = Array.isArray(items) ? items : [];
        this._writeCache(name, safeItems);
        return safeItems;
    },

    _getCollection(name) {
        return this._readCache(name, []);
    },

    _upsertCollectionItem(name, id, patch) {
        const list = this._getCollection(name);
        const idx = list.findIndex(item => item && item.id === id);
        const next = idx >= 0
            ? { ...list[idx], ...patch }
            : { id, ...patch };

        if (idx >= 0) list[idx] = next;
        else list.push(next);

        this._cacheCollection(name, list);
        return next;
    },

    _removeCollectionItem(name, id) {
        const list = this._getCollection(name).filter(item => item && item.id !== id);
        this._cacheCollection(name, list);
    },

    _getUsersMap() {
        return this._readCache('users', {});
    },

    _writeUsersMap(usersMap) {
        this._writeCache('users', usersMap || {});
    },

    _upsertUser(uid, patch) {
        if (!uid) return null;
        const users = this._getUsersMap();
        const current = users[uid] || { id: uid };
        users[uid] = { ...current, ...patch, id: uid };
        this._writeUsersMap(users);
        return users[uid];
    },

    _getUser(uid) {
        if (!uid) return null;
        const users = this._getUsersMap();
        return users[uid] || null;
    },

    _getUserByEmail(email) {
        const safeEmail = (email || '').trim().toLowerCase();
        if (!safeEmail) return null;
        const users = this._getUsersMap();
        const allUsers = Object.values(users || {});
        return allUsers.find(u => (u.email || '').toLowerCase() === safeEmail) || null;
    },

    _sortReportsDesc(items) {
        const list = Array.isArray(items) ? [...items] : [];
        list.sort((a, b) => {
            const aTime = Number(a?.createdAtMs || 0);
            const bTime = Number(b?.createdAtMs || 0);
            return bTime - aTime;
        });
        return list;
    },

    // ---- BINS ----
    async getBins() {
        try {
            const snapshot = await db.collection('bins').get();
            const bins = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return this._cacheCollection('bins', bins);
        } catch (error) {
            console.warn('[SURGE] getBins fallback cache:', error?.code || error?.message || error);
            return this._getCollection('bins');
        }
    },

    async updateBin(binId, data) {
        const patch = {
            ...data,
            lastUpdated: this._touchNow(),
        };

        this._upsertCollectionItem('bins', binId, patch);

        try {
            await db.collection('bins').doc(binId).update({
                ...data,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
            });
            return true;
        } catch (error) {
            console.warn('[SURGE] updateBin queued locally:', error?.code || error?.message || error);
            return false;
        }
    },

    async markBinCollected(binId, workerUid) {
        const patch = {
            fillLevel: 0,
            status: 'collected',
            collectedBy: workerUid,
            lastCollected: this._touchNow(),
            lastUpdated: this._touchNow(),
        };

        this._upsertCollectionItem('bins', binId, patch);

        try {
            await db.collection('bins').doc(binId).update({
                fillLevel: 0,
                status: 'collected',
                lastCollected: firebase.firestore.FieldValue.serverTimestamp(),
                collectedBy: workerUid,
            });
            return true;
        } catch (error) {
            console.warn('[SURGE] markBinCollected queued locally:', error?.code || error?.message || error);
            return false;
        }
    },

    // ---- TRUCKS ----
    async getTrucks() {
        try {
            const snapshot = await db.collection('trucks').get();
            const trucks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return this._cacheCollection('trucks', trucks);
        } catch (error) {
            console.warn('[SURGE] getTrucks fallback cache:', error?.code || error?.message || error);
            return this._getCollection('trucks');
        }
    },

    // ---- USERS ----
    async getUser(uid) {
        try {
            const doc = await db.collection('users').doc(uid).get();
            if (!doc.exists) return this._getUser(uid);
            const user = { id: doc.id, ...doc.data() };
            this._upsertUser(uid, user);
            return user;
        } catch (error) {
            console.warn('[SURGE] getUser fallback cache:', error?.code || error?.message || error);
            return this._getUser(uid);
        }
    },

    async getUserByEmail(email) {
        const safeEmail = (email || '').trim().toLowerCase();
        if (!safeEmail) return null;

        try {
            const snapshot = await db.collection('users').where('email', '==', safeEmail).limit(1).get();
            if (snapshot.empty) return this._getUserByEmail(safeEmail);
            const doc = snapshot.docs[0];
            const user = { id: doc.id, ...doc.data() };
            this._upsertUser(user.id, user);
            return user;
        } catch (error) {
            console.warn('[SURGE] getUserByEmail fallback cache:', error?.code || error?.message || error);
            return this._getUserByEmail(safeEmail);
        }
    },

    async getWorkers() {
        try {
            const snapshot = await db.collection('users').where('role', '==', 'worker').get();
            const workers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const usersMap = this._getUsersMap();
            workers.forEach(worker => {
                usersMap[worker.id] = worker;
            });
            this._writeUsersMap(usersMap);
            return workers;
        } catch (error) {
            console.warn('[SURGE] getWorkers fallback cache:', error?.code || error?.message || error);
            return Object.values(this._getUsersMap()).filter(user => user?.role === 'worker');
        }
    },

    async updateUserPoints(uid, points) {
        const current = this._getUser(uid) || { id: uid, greenPoints: 0 };
        const nextPoints = Number(current.greenPoints || 0) + Number(points || 0);
        this._upsertUser(uid, {
            greenPoints: Math.max(0, nextPoints),
            lastUpdated: this._touchNow(),
        });

        try {
            await db.collection('users').doc(uid).set({
                greenPoints: firebase.firestore.FieldValue.increment(points),
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            return true;
        } catch (error) {
            console.warn('[SURGE] updateUserPoints queued locally:', error?.code || error?.message || error);
            return false;
        }
    },

    async applyCitizenReportReward(uid, email, reward = {}) {
        const points = Number.isFinite(Number(reward.points)) ? Number(reward.points) : 25;
        const recycledItems = Number.isFinite(Number(reward.recycledItems)) ? Number(reward.recycledItems) : 1;
        const wasteReduced = Number.isFinite(Number(reward.wasteReduced)) ? Number(reward.wasteReduced) : 2;
        const safeEmail = (email || '').trim().toLowerCase();

        const current = this._getUser(uid) || { id: uid, greenPoints: 0, recycledItems: 0, wasteReduced: 0 };
        this._upsertUser(uid, {
            email: safeEmail || null,
            role: 'citizen',
            name: safeEmail ? safeEmail.split('@')[0] : 'citizen',
            greenPoints: Number(current.greenPoints || 0) + points,
            recycledItems: Number(current.recycledItems || 0) + recycledItems,
            wasteReduced: Number(current.wasteReduced || 0) + wasteReduced,
            lastReportRewardAt: this._touchNow(),
            lastUpdated: this._touchNow(),
        });

        try {
            await db.collection('users').doc(uid).set({
                email: safeEmail || null,
                role: 'citizen',
                name: safeEmail ? safeEmail.split('@')[0] : 'citizen',
                greenPoints: firebase.firestore.FieldValue.increment(points),
                recycledItems: firebase.firestore.FieldValue.increment(recycledItems),
                wasteReduced: firebase.firestore.FieldValue.increment(wasteReduced),
                lastReportRewardAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            return true;
        } catch (error) {
            console.warn('[SURGE] applyCitizenReportReward queued locally:', error?.code || error?.message || error);
            return false;
        }
    },

    // ---- REPORTS ----
    async submitReport(reportData) {
        const localId = `local_report_${this._touchNow()}`;
        const localReport = {
            id: localId,
            ...reportData,
            status: 'open',
            createdAtMs: this._touchNow(),
            createdAt: this._touchNow(),
        };

        this._upsertCollectionItem('reports', localId, localReport);

        try {
            const ref = await db.collection('reports').add({
                ...reportData,
                status: 'open',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            });

            // Replace temporary local ID with Firestore ID
            this._removeCollectionItem('reports', localId);
            this._upsertCollectionItem('reports', ref.id, {
                ...localReport,
                id: ref.id,
            });

            return ref;
        } catch (error) {
            console.warn('[SURGE] submitReport stored in local cache:', error?.code || error?.message || error);
            return { id: localId };
        }
    },

    async getReports(status = null) {
        try {
            let query = db.collection('reports').orderBy('createdAt', 'desc');
            if (status) query = query.where('status', '==', status);
            const snapshot = await query.get();
            const reports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Cache with a sortable shadow field
            const cacheReady = reports.map(report => ({
                ...report,
                createdAtMs: typeof report?.createdAt?.toDate === 'function'
                    ? report.createdAt.toDate().getTime()
                    : this._touchNow(),
            }));
            this._cacheCollection('reports', cacheReady);
            return reports;
        } catch (error) {
            console.warn('[SURGE] getReports fallback cache:', error?.code || error?.message || error);
            const local = this._sortReportsDesc(this._getCollection('reports'));
            return status ? local.filter(report => report?.status === status) : local;
        }
    },

    async getReportsByUser(user = {}) {
        const safeUid = (user.uid || '').trim();
        const safeEmail = (user.email || '').trim().toLowerCase();

        const normalizeAndSort = (items) => {
            const list = (Array.isArray(items) ? items : []).map(report => {
                if (typeof report?.createdAt?.toDate === 'function') {
                    return { ...report, createdAtMs: report.createdAt.toDate().getTime() };
                }
                return { ...report, createdAtMs: Number(report?.createdAtMs || report?.createdAt || 0) };
            });
            return this._sortReportsDesc(list);
        };

        try {
            if (safeUid) {
                const byUid = await db.collection('reports').where('reportedByUid', '==', safeUid).get();
                if (!byUid.empty) {
                    return normalizeAndSort(byUid.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                }
            }

            if (safeEmail) {
                const byEmail = await db.collection('reports').where('reportedBy', '==', safeEmail).get();
                return normalizeAndSort(byEmail.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            }
        } catch (error) {
            console.warn('[SURGE] getReportsByUser fallback cache:', error?.code || error?.message || error);
        }

        const local = this._sortReportsDesc(this._getCollection('reports'));
        return local.filter(report => {
            const reportUid = (report?.reportedByUid || '').trim();
            const reportEmail = (report?.reportedBy || '').trim().toLowerCase();
            if (safeUid && reportUid && reportUid === safeUid) return true;
            if (safeEmail && reportEmail === safeEmail) return true;
            return false;
        });
    },

    async resolveReport(reportId) {
        this._upsertCollectionItem('reports', reportId, {
            status: 'resolved',
            resolvedAt: this._touchNow(),
        });

        try {
            await db.collection('reports').doc(reportId).update({
                status: 'resolved',
                resolvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            return true;
        } catch (error) {
            console.warn('[SURGE] resolveReport queued locally:', error?.code || error?.message || error);
            return false;
        }
    },

    // ---- LIVE TRACKING (RTDB) ----
    onLiveBins(callback) {
        const ref = rtdb.ref('live/bins');
        ref.on(
            'value',
            snap => {
                const val = snap.val() || {};
                const binsList = Object.keys(val).map(key => ({ id: key, ...val[key] }));
                this._cacheCollection('bins', binsList);
                callback(binsList);
            },
            error => {
                console.warn('[SURGE] live bins fallback cache:', error?.code || error?.message || error);
                callback(this._getCollection('bins'));
            }
        );
    },

    onLiveTrucks(callback) {
        const ref = rtdb.ref('live/trucks');
        ref.on(
            'value',
            snap => {
                const val = snap.val() || {};
                const trucksList = Object.keys(val).map(key => ({ id: key, ...val[key] }));
                this._cacheCollection('trucks', trucksList);
                callback(trucksList);
            },
            error => {
                console.warn('[SURGE] live trucks fallback cache:', error?.code || error?.message || error);
                callback(this._getCollection('trucks'));
            }
        );
    },

    stopLiveListeners() {
        rtdb.ref('live/bins').off();
        rtdb.ref('live/trucks').off();
    },

    // ---- FIRESTORE REAL-TIME LISTENERS ----
    onReports(callback) {
        return db.collection('reports').orderBy('createdAt', 'desc')
            .onSnapshot(
                snapshot => {
                    const reports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    const cacheReady = reports.map(report => ({
                        ...report,
                        createdAtMs: typeof report?.createdAt?.toDate === 'function'
                            ? report.createdAt.toDate().getTime()
                            : this._touchNow(),
                    }));
                    this._cacheCollection('reports', cacheReady);
                    callback(reports);
                },
                error => {
                    console.warn('[SURGE] onReports fallback cache:', error?.code || error?.message || error);
                    callback(this._sortReportsDesc(this._getCollection('reports')));
                }
            );
    },

    onBins(callback) {
        return db.collection('bins').onSnapshot(
            snapshot => {
                const bins = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this._cacheCollection('bins', bins);
                callback(bins);
            },
            error => {
                console.warn('[SURGE] onBins fallback cache:', error?.code || error?.message || error);
                callback(this._getCollection('bins'));
            }
        );
    },

    // ---- SEED DATA ----
    async seedDemoData() {
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

        const trucks = [
            { vehicleNumber: 'TN-37-AB-1234', driverName: 'Rajesh Kumar', route: 'Downtown Core', status: 'active', lat: 11.0120, lng: 76.9600 },
            { vehicleNumber: 'TN-38-CD-5678', driverName: 'Priya Sharma', route: 'Peelamedu Loop', status: 'active', lat: 11.0280, lng: 76.9750 },
            { vehicleNumber: 'TN-37-EF-9012', driverName: 'Vikram Reddy', route: 'South Zone', status: 'active', lat: 10.9950, lng: 76.9550 },
        ];

        const reports = [
            { type: 'Overflowing Bin', location: 'Near Ganga Hospital, R.S. Puram', description: 'Bin has been overflowing since yesterday morning.', reportedBy: 'citizen@gmail.com' },
            { type: 'Illegal Dumping', location: 'Behind VOC Park Ground', description: 'Construction debris dumped near the park entrance.', reportedBy: 'resident@gmail.com' },
            { type: 'Damaged Bin', location: 'Cross-Cut Rd, Gandhipuram', description: 'Bin lid broken, waste spilling on road.', reportedBy: 'user@gmail.com' },
        ];

        // Always keep local cache updated so UI remains usable offline/denied.
        const cacheBins = bins.map((bin, i) => ({ id: `bin_${String(i + 1).padStart(3, '0')}`, ...bin, lastUpdated: this._touchNow(), lastCollected: null }));
        const cacheTrucks = trucks.map((truck, i) => ({ id: `truck_${i + 1}`, ...truck, lastUpdated: this._touchNow() }));
        const cacheReports = reports.map((report, i) => ({ id: `report_${i + 1}`, ...report, status: 'open', createdAtMs: this._touchNow() - i * 1000 }));

        this._cacheCollection('bins', cacheBins);
        this._cacheCollection('trucks', cacheTrucks);
        this._cacheCollection('reports', cacheReports);

        try {
            const batch = db.batch();

            cacheBins.forEach((bin, i) => {
                const ref = db.collection('bins').doc(`bin_${String(i + 1).padStart(3, '0')}`);
                batch.set(ref, {
                    ...bin,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                    lastCollected: null,
                });
            });

            cacheTrucks.forEach((truck, i) => {
                const ref = db.collection('trucks').doc(`truck_${i + 1}`);
                batch.set(ref, {
                    ...truck,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                });
            });

            cacheReports.forEach((report, i) => {
                const ref = db.collection('reports').doc(`report_${i + 1}`);
                batch.set(ref, {
                    ...report,
                    status: 'open',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                });
            });

            const liveBins = {};
            cacheBins.forEach(bin => {
                liveBins[bin.id] = {
                    lat: bin.lat,
                    lng: bin.lng,
                    fillLevel: bin.fillLevel,
                    address: bin.address,
                    timestamp: this._touchNow(),
                };
            });

            const liveTrucks = {};
            cacheTrucks.forEach((truck, i) => {
                liveTrucks[`truck_${i + 1}`] = {
                    lat: truck.lat,
                    lng: truck.lng,
                    speed: Math.floor(Math.random() * 30) + 10,
                    heading: Math.floor(Math.random() * 360),
                    driverName: truck.driverName,
                    vehicleNumber: truck.vehicleNumber,
                    timestamp: this._touchNow(),
                };
            });

            await rtdb.ref('live/bins').set(liveBins);
            await rtdb.ref('live/trucks').set(liveTrucks);
            await batch.commit();

            console.log('[SURGE] Demo data seeded to Firebase + cache.');
            return true;
        } catch (error) {
            console.warn('[SURGE] seedDemoData cache-only mode:', error?.code || error?.message || error);
            return true;
        }
    },

    async clearSeededData() {
        this._cacheCollection('bins', []);
        this._cacheCollection('trucks', []);
        this._cacheCollection('reports', []);

        try {
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

            console.log('[SURGE] Seeded demo data removed from Firebase + cache.');
            return true;
        } catch (error) {
            console.warn('[SURGE] clearSeededData cache-only mode:', error?.code || error?.message || error);
            return true;
        }
    },
};

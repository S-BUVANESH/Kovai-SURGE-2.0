document.addEventListener('DOMContentLoaded', () => {
    // --- 1. SESSION AUTHENTICATION ---
    const user = SurgeAuth.checkAuth('admin');
    if (!user) return;
    document.getElementById('user-display-name').textContent = user.email;
    const themeSelector = document.getElementById('theme-selector');
    const modeSelector = document.getElementById('mode-selector');
    const rootStyle = document.documentElement.style;
    let dashboardMap = null, fullMap = null;
    let dashboardTileLayer = null, fullTileLayer = null;
    const themePalettes = {
        military: {
            accent: '#53d22d',
            accentRgb: '83, 210, 45',
            darkBg: '#0c1a0c',
            darkSidebar: '#0a120a',
            darkCard: '#111a11',
            darkMuted: '#a5b6a0',
            lightBg: '#edf3ee',
            lightSidebar: '#e2ebe3',
            lightCard: '#ffffff',
            lightMuted: '#4f6357',
        },
        ocean: {
            accent: '#22d3ee',
            accentRgb: '34, 211, 238',
            darkBg: '#071621',
            darkSidebar: '#06111a',
            darkCard: '#0c1f2b',
            darkMuted: '#9cb6c6',
            lightBg: '#e8f6fb',
            lightSidebar: '#d9eef5',
            lightCard: '#ffffff',
            lightMuted: '#405d6d',
        },
        ember: {
            accent: '#f97316',
            accentRgb: '249, 115, 22',
            darkBg: '#1c0f08',
            darkSidebar: '#160b06',
            darkCard: '#28140b',
            darkMuted: '#c6a794',
            lightBg: '#fbf1ea',
            lightSidebar: '#f6e4d8',
            lightCard: '#ffffff',
            lightMuted: '#6e5546',
        },
        violet: {
            accent: '#a78bfa',
            accentRgb: '167, 139, 250',
            darkBg: '#110d1f',
            darkSidebar: '#0d0a16',
            darkCard: '#1a1430',
            darkMuted: '#b9abd8',
            lightBg: '#f2effc',
            lightSidebar: '#e8e1fb',
            lightCard: '#ffffff',
            lightMuted: '#5b4e79',
        }
    };

    function syncAppearance() {
        const theme = document.documentElement.getAttribute('data-theme') || 'military';
        const mode = document.documentElement.getAttribute('data-mode') || 'dark';
        const palette = themePalettes[theme] || themePalettes.military;
        const isLight = mode === 'light';
        rootStyle.setProperty('--theme-accent', palette.accent);
        rootStyle.setProperty('--theme-accent-rgb', palette.accentRgb);
        rootStyle.setProperty('--theme-bg', isLight ? palette.lightBg : palette.darkBg);
        rootStyle.setProperty('--theme-sidebar', isLight ? palette.lightSidebar : palette.darkSidebar);
        rootStyle.setProperty('--theme-card', isLight ? palette.lightCard : palette.darkCard);
        rootStyle.setProperty('--theme-muted', isLight ? palette.lightMuted : palette.darkMuted);
    }

    function applyWebsiteTheme(themeKey) {
        const allowed = ['military', 'ocean', 'ember', 'violet'];
        const selected = allowed.includes(themeKey) ? themeKey : 'military';
        document.documentElement.setAttribute('data-theme', selected);
        localStorage.setItem('surge_admin_theme', selected);
        syncAppearance();
        if (themeSelector && themeSelector.value !== selected) {
            themeSelector.value = selected;
        }
    }

    function applyWebsiteMode(modeKey) {
        const selected = modeKey === 'light' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-mode', selected);
        localStorage.setItem('surge_admin_mode', selected);
        syncAppearance();
        syncMapTheme();
        if (modeSelector && modeSelector.value !== selected) {
            modeSelector.value = selected;
        }
    }

    applyWebsiteTheme(localStorage.getItem('surge_admin_theme') || 'military');
    applyWebsiteMode(localStorage.getItem('surge_admin_mode') || 'dark');
    if (themeSelector) {
        themeSelector.addEventListener('change', (e) => applyWebsiteTheme(e.target.value));
    }
    if (modeSelector) {
        modeSelector.addEventListener('change', (e) => applyWebsiteMode(e.target.value));
    }

    // --- 2. LOGOUT MODAL ---
    const logoutButton = document.getElementById('logout-button');
    const logoutModal = document.getElementById('logout-modal');
    const confirmLogoutBtn = document.getElementById('confirm-logout');
    const cancelLogoutBtn = document.getElementById('cancel-logout');

    if (logoutButton && logoutModal) {
        logoutButton.addEventListener('click', (e) => { e.preventDefault(); logoutModal.classList.add('active'); });
        cancelLogoutBtn.addEventListener('click', () => logoutModal.classList.remove('active'));
        confirmLogoutBtn.addEventListener('click', () => SurgeAuth.logout());
        logoutModal.addEventListener('click', (e) => { if (e.target === logoutModal) logoutModal.classList.remove('active'); });
    }

    // --- 3. PAGE NAVIGATION ---
    const navLinks = document.querySelectorAll('#sidebar-nav .nav-link');
    const pages = document.querySelectorAll('main .page');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetPageId = link.dataset.page;
            pages.forEach(page => {
                page.classList.remove('active');
                page.classList.add('hidden');
            });
            const targetPage = document.getElementById(targetPageId);
            if (targetPage) {
                targetPage.classList.remove('hidden');
                targetPage.classList.add('active');
            }
            navLinks.forEach(nav => nav.classList.toggle('active', nav.dataset.page === targetPageId));
            
            // Initialize full map when switching to live tracking
            if (targetPageId === 'live-tracking-page' && !fullMap) {
                initFullMap();
            }
            if (targetPageId === 'worker-management-page') {
                populateWorkerManagement();
            }
            if (targetPageId === 'analytics-page') {
                renderAnalytics(latestBins, latestTrucks, latestReports, latestWorkers);
            }
        });
    });

    // --- 4. LEAFLET MAP INITIALIZATION ---
    const COIMBATORE = [11.0168, 76.9558];
    let binMarkers = {}, truckMarkers = {}, reportMarkers = {};
    let binMarkersF = {}, truckMarkersF = {}, reportMarkersF = {};

    function getBinColor(fillLevel) {
        if (fillLevel >= 80) return '#fa4b38';
        if (fillLevel >= 50) return '#fa9d38';
        return '#53d22d';
    }

    function createBinIcon(fillLevel) {
        const color = getBinColor(fillLevel);
        return L.divIcon({
            className: 'custom-marker',
            html: `<div style="width:28px;height:28px;border-radius:50%;background:${color}22;border:2px solid ${color};display:flex;align-items:center;justify-content:center;box-shadow:0 0 10px ${color}44;">
                     <span style="font-size:14px;">🗑️</span>
                   </div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            popupAnchor: [0, -16]
        });
    }

    function createTruckIcon() {
        return L.divIcon({
            className: 'custom-marker',
            html: `<div style="width:32px;height:32px;border-radius:50%;background:rgba(59,130,246,0.2);border:2px solid #3b82f6;display:flex;align-items:center;justify-content:center;box-shadow:0 0 12px rgba(59,130,246,0.4);animation:pulse 2s infinite;">
                     <span style="font-size:16px;">🚛</span>
                   </div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            popupAnchor: [0, -18]
        });
    }

    function createReportIcon() {
        return L.divIcon({
            className: 'custom-marker',
            html: `<div style="width:30px;height:30px;border-radius:50%;background:rgba(250,75,56,0.2);border:2px solid #fa4b38;display:flex;align-items:center;justify-content:center;box-shadow:0 0 15px rgba(250,75,56,0.5);animation:pulse 1s infinite;">
                     <span style="font-size:16px;">⚠️</span>
                   </div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
            popupAnchor: [0, -16]
        });
    }

    function getTileConfig() {
        const isLight = (document.documentElement.getAttribute('data-mode') || 'dark') === 'light';
        return {
            tileUrl: isLight
                ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
                : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
            tileAttrib: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        };
    }

    function syncMapTheme() {
        const { tileUrl, tileAttrib } = getTileConfig();
        if (dashboardMap) {
            if (dashboardTileLayer) dashboardMap.removeLayer(dashboardTileLayer);
            dashboardTileLayer = L.tileLayer(tileUrl, { attribution: tileAttrib, subdomains: 'abcd', maxZoom: 19 }).addTo(dashboardMap);
        }
        if (fullMap) {
            if (fullTileLayer) fullMap.removeLayer(fullTileLayer);
            fullTileLayer = L.tileLayer(tileUrl, { attribution: tileAttrib, subdomains: 'abcd', maxZoom: 19 }).addTo(fullMap);
        }
    }

    // Store latest data for full map initialization
    let latestBins = [];
    let latestTrucks = [];
    let latestReports = [];
    let latestWorkers = [];

    // Initialize dashboard mini-map
    dashboardMap = L.map('dashboard-map', { zoomControl: true, scrollWheelZoom: true }).setView(COIMBATORE, 13);
    syncMapTheme();

    function initFullMap() {
        fullMap = L.map('full-map', { zoomControl: true, scrollWheelZoom: true }).setView(COIMBATORE, 13);
        syncMapTheme();
        
        // Populate immediately if data exists
        if (latestBins.length) updateMapMarkers(latestBins, fullMap, binMarkersF);
        if (latestTrucks.length) updateTruckMarkers(latestTrucks, fullMap, truckMarkersF);
        if (latestReports.length) updateReportMarkers(latestReports, fullMap, reportMarkersF);
    }

    // --- 5. REAL-TIME DATA LISTENERS ---
    function updateMapMarkers(bins, map, markerStore) {
        // Create a fast lookup Set of incoming active IDs
        const activeIds = new Set(bins.map(b => b.id));

        // Cleanup: Removing markers that are no longer in the live payload (e.g. simulation stopped)
        for (let id in markerStore) {
            if (!activeIds.has(id)) {
                map.removeLayer(markerStore[id]);
                delete markerStore[id];
            }
        }

        bins.forEach(bin => {
            const pos = [bin.lat, bin.lng];
            const popupContent = `
                <div style="font-family:'Space Grotesk';color:#fff;padding:4px;">
                    <strong>🗑️ ${bin.id}</strong><br/>
                    <span style="color:#a5b6a0;">${bin.address || 'N/A'}</span><br/>
                    <span style="color:${getBinColor(bin.fillLevel)};font-weight:700;">Fill: ${bin.fillLevel}%</span>
                </div>`;

            if (markerStore[bin.id]) {
                markerStore[bin.id].setLatLng(pos);
                // Update the icon dynamically based on the new fill level color
                markerStore[bin.id].setIcon(createBinIcon(bin.fillLevel));
                markerStore[bin.id].setPopupContent(popupContent);
            } else {
                markerStore[bin.id] = L.marker(pos, { icon: createBinIcon(bin.fillLevel) })
                    .addTo(map)
                    .bindPopup(popupContent, { className: 'dark-popup' });
            }
        });
    }

    function updateTruckMarkers(trucks, map, markerStore) {
        const activeIds = new Set(trucks.map(t => t.id));

        // Cleanup: remove trucks that ended their shift
        for (let id in markerStore) {
            if (!activeIds.has(id)) {
                map.removeLayer(markerStore[id]);
                delete markerStore[id];
            }
        }

        trucks.forEach(truck => {
            const pos = [truck.lat, truck.lng];
            const popupContent = `
                <div style="font-family:'Space Grotesk';color:#fff;padding:4px;">
                    <strong>🚛 ${truck.vehicleNumber || truck.id}</strong><br/>
                    <span style="color:#a5b6a0;">${truck.driverName || 'Unknown'}</span><br/>
                    <span style="color:#3b82f6;font-weight:700;">Speed: ${truck.speed || 0} km/h</span>
                </div>`;

            if (markerStore[truck.id]) {
                markerStore[truck.id].setLatLng(pos);
                markerStore[truck.id].setPopupContent(popupContent);
            } else {
                markerStore[truck.id] = L.marker(pos, { icon: createTruckIcon() })
                    .addTo(map)
                    .bindPopup(popupContent, { className: 'dark-popup' });
            }
        });
    }

    function updateReportMarkers(reports, map, markerStore) {
        // Clear existing report markers first since reports can be resolved
        for (let id in markerStore) {
            map.removeLayer(markerStore[id]);
            delete markerStore[id];
        }

        reports.forEach(report => {
            if (report.status !== 'open' || !report.lat || !report.lng) return;

            const pos = [report.lat, report.lng];
            const popupContent = `
                <div style="font-family:'Space Grotesk';color:#fff;padding:4px;">
                    <strong>⚠️ Citizen Report</strong><br/>
                    <span style="color:#fa9d38;">${report.type || 'Issue'}</span><br/>
                    <span style="color:#a5b6a0;font-size:12px;">${report.location || report.locationName || 'Unknown Location'}</span>
                </div>`;

            markerStore[report.id] = L.marker(pos, { icon: createReportIcon() })
                .addTo(map)
                .bindPopup(popupContent, { className: 'dark-popup' });
        });
    }

    // Listen for real-time bin updates
    SurgeDB.onLiveBins((bins) => {
        latestBins = bins;
        updateMapMarkers(bins, dashboardMap, binMarkers);
        if (fullMap) updateMapMarkers(bins, fullMap, binMarkersF);
        updateKPIs(bins);
        renderAnalytics(latestBins, latestTrucks, latestReports, latestWorkers);
    });

    // Listen for real-time truck updates
    SurgeDB.onLiveTrucks((trucks) => {
        latestTrucks = trucks;
        updateTruckMarkers(trucks, dashboardMap, truckMarkers);
        if (fullMap) updateTruckMarkers(trucks, fullMap, truckMarkersF);
        document.getElementById('kpi-trucks').textContent = trucks.length;
        renderAnalytics(latestBins, latestTrucks, latestReports, latestWorkers);
    });

    // --- 6. KPI UPDATES ---
    function updateKPIs(bins) {
        const total = bins.length;
        const critical = bins.filter(b => b.fillLevel >= 80).length;
        const avgFill = total > 0 ? Math.round(bins.reduce((s, b) => s + b.fillLevel, 0) / total) : 0;
        const totalWaste = (total * 0.12).toFixed(1); // Simulated tons

        document.getElementById('kpi-waste').textContent = `${totalWaste} tons`;
        document.getElementById('kpi-recycle').textContent = `${100 - avgFill}%`;
        document.getElementById('kpi-attention').textContent = critical;
        
        // Update zone chart
        updateBarChart(bins);
    }

    function updateBarChart(bins) {
        const zones = { A: 0, B: 0, C: 0, D: 0, E: 0 };
        bins.forEach(b => {
            // Use address to determine zone (simplified for POC)
            if (b.address && b.address.includes('Puram')) zones.A += b.fillLevel;
            else if (b.address && b.address.includes('Peelamedu')) zones.B += b.fillLevel;
            else if (b.address && b.address.includes('Race')) zones.C += b.fillLevel;
            else if (b.address && b.address.includes('Colony')) zones.D += b.fillLevel;
            else zones.E += b.fillLevel;
        });
        const maxVal = Math.max(...Object.values(zones), 1);
        const bars = document.querySelectorAll('#bar-chart-container > div.chart-bar');
        const zoneKeys = Object.keys(zones);
        bars.forEach((bar, i) => {
            if (zoneKeys[i]) {
                bar.style.height = `${Math.max((zones[zoneKeys[i]] / maxVal) * 100, 5)}%`;
            }
        });
    }

    function toDateSafe(ts) {
        if (!ts) return null;
        if (typeof ts.toDate === 'function') return ts.toDate();
        if (typeof ts.toMillis === 'function') return new Date(ts.toMillis());
        const parsed = new Date(ts);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function distributeRouteBins(workers, bins) {
        const assignedWorkers = workers
            .filter(w => !!w.truckId)
            .sort((a, b) => String(a.truckId).localeCompare(String(b.truckId)));
        const routeByWorkerId = {};
        assignedWorkers.forEach(w => { routeByWorkerId[w.id] = []; });
        if (!assignedWorkers.length) return routeByWorkerId;

        const pendingBins = bins
            .filter(b => (b.status || 'active') !== 'collected')
            .sort((a, b) => {
                const scoreA = (Number(a.fillLevel) || 0) + ((a.status || '').toLowerCase() === 'critical' ? 25 : 0);
                const scoreB = (Number(b.fillLevel) || 0) + ((b.status || '').toLowerCase() === 'critical' ? 25 : 0);
                return scoreB - scoreA;
            });

        pendingBins.forEach((bin, idx) => {
            const worker = assignedWorkers[idx % assignedWorkers.length];
            routeByWorkerId[worker.id].push(bin);
        });
        return routeByWorkerId;
    }

    function renderAnalytics(bins, trucks, reports, workers) {
        const openReports = reports.filter(r => r.status === 'open').length;
        const criticalBins = bins.filter(b => Number(b.fillLevel) >= 80).length;

        const binsEl = document.getElementById('analytics-bins');
        const criticalEl = document.getElementById('analytics-critical');
        const trucksEl = document.getElementById('analytics-trucks');
        const reportsEl = document.getElementById('analytics-reports');
        if (binsEl) binsEl.textContent = bins.length;
        if (criticalEl) criticalEl.textContent = criticalBins;
        if (trucksEl) trucksEl.textContent = trucks.length;
        if (reportsEl) reportsEl.textContent = openReports;

        const now = new Date();
        const dayKeys = [];
        const byDay = {};
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setHours(0, 0, 0, 0);
            d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            dayKeys.push(key);
            byDay[key] = 0;
        }

        bins.forEach(bin => {
            const collectedAt = toDateSafe(bin.lastCollected);
            if (!collectedAt) return;
            const key = collectedAt.toISOString().slice(0, 10);
            if (Object.prototype.hasOwnProperty.call(byDay, key)) byDay[key] += 1;
        });

        const chart = document.getElementById('analytics-waste-chart');
        if (chart) {
            const maxVal = Math.max(...dayKeys.map(k => byDay[k]), 1);
            chart.innerHTML = dayKeys.map(key => {
                const value = byDay[key];
                const height = Math.max(10, Math.round((value / maxVal) * 100));
                return `
                    <div class="flex-1 h-full flex flex-col justify-end items-center gap-2">
                        <div class="w-full rounded-t-md bg-primary/75 hover:bg-primary transition-all" style="height:${height}%"></div>
                        <p class="text-[11px] text-[#95a89f]">${key.slice(5)}</p>
                    </div>
                `;
            }).join('');
        }

        const efficiencyList = document.getElementById('analytics-efficiency-list');
        if (efficiencyList) {
            if (!workers.length) {
                efficiencyList.innerHTML = '<div class="h-full w-full text-center text-[#a5b6a0] flex items-center justify-center text-sm">No worker profiles yet.</div>';
            } else {
                const routeByWorkerId = distributeRouteBins(workers, bins);
                efficiencyList.innerHTML = workers.map(w => {
                    const assigned = routeByWorkerId[w.id] || [];
                    const completed = bins.filter(b => (b.collectedBy || '').toLowerCase() === (w.email || '').toLowerCase()).length;
                    const total = assigned.length + completed;
                    const efficiency = total > 0 ? Math.round((completed / total) * 100) : 0;
                    return `
                        <div class="border border-white/10 rounded-xl p-3 mb-3 bg-black/20">
                            <div class="flex items-center justify-between">
                                <p class="font-semibold text-white">${w.name || w.email || w.id}</p>
                                <span class="text-xs text-primary font-bold">${efficiency}%</span>
                            </div>
                            <p class="text-xs text-[#9ab0a7] mt-1">Truck: ${w.truckId || 'N/A'}</p>
                            <p class="text-xs text-[#9ab0a7]">Assigned stops: ${assigned.length}</p>
                            <div class="w-full h-2 rounded-full bg-white/10 mt-2 overflow-hidden">
                                <div class="h-full bg-primary" style="width:${efficiency}%"></div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
    }

    // Listen for reports 
    let initialReportsLoaded = false;
    SurgeDB.onReports((reports) => {
        latestReports = reports;
        const openReports = reports.filter(r => r.status === 'open');
        document.getElementById('kpi-reports').textContent = openReports.length;
        populateCitizenReports(reports);
        updateReportMarkers(reports, dashboardMap, reportMarkers);
        if (fullMap) updateReportMarkers(reports, fullMap, reportMarkersF);
        renderAnalytics(latestBins, latestTrucks, latestReports, latestWorkers);

        // Fly to newest open report if this isn't the initial page load
        if (initialReportsLoaded && openReports.length > 0) {
            const newest = openReports[0]; // Built-in sorting is desc by createdAt
            if (newest.lat && newest.lng) {
                const pos = [newest.lat, newest.lng];
                dashboardMap.flyTo(pos, 15, { animate: true, duration: 1.5 });
                if (fullMap) fullMap.flyTo(pos, 15, { animate: true, duration: 1.5 });
                setTimeout(() => {
                    if (reportMarkers[newest.id]) reportMarkers[newest.id].openPopup();
                    if (fullMap && reportMarkersF[newest.id]) reportMarkersF[newest.id].openPopup();
                }, 1500);
            }
        }
        initialReportsLoaded = true;
    });

    // --- 7. WORKER MANAGEMENT (FROM FIRESTORE) ---
    async function populateWorkerManagement() {
        try {
            const workers = await SurgeDB.getWorkers();
            const trucks = await SurgeDB.getTrucks();
            const bins = await SurgeDB.getBins();
            latestWorkers = workers;
            const tableBody = document.getElementById('worker-table-body');
            if (!tableBody) return;

            if (workers.length === 0) {
                // Fallback demo data
                const demoWorkers = [
                    { name: "Rajesh Kumar", status: "Online", vehicle: "TN-37-AB-1234", route: "Downtown Core", efficiency: 98 },
                    { name: "Priya Sharma", status: "Online", vehicle: "TN-38-CD-5678", route: "Peelamedu Loop", efficiency: 95 },
                    { name: "Anjali Singh", status: "Offline", vehicle: "TN-37-EF-9012", route: "Standby", efficiency: 0 },
                    { name: "Vikram Reddy", status: "Online", vehicle: "TN-38-GH-3456", route: "South Zone", efficiency: 92 },
                ];
                tableBody.innerHTML = demoWorkers.map(w => `
                    <tr>
                        <td class="font-medium">${w.name}</td>
                        <td><span class="status-badge ${w.status.toLowerCase()}">${w.status}</span></td>
                        <td>${w.vehicle}</td>
                        <td>${w.route}</td>
                        <td class="${w.efficiency >= 95 ? 'text-primary' : 'text-white'}">${w.efficiency}%</td>
                    </tr>
                `).join('');
            } else {
                const routeByWorkerId = distributeRouteBins(workers, bins);
                tableBody.innerHTML = workers.map(w => {
                    const truck = trucks.find(t => t.id === w.truckId) || trucks.find(t => t.driverUid === w.id);
                    const liveTruck = latestTrucks.find(t => t.id === w.truckId);
                    const assignedBins = routeByWorkerId[w.id] || [];
                    const routeLabel = w.truckId
                        ? (assignedBins.length ? `${assignedBins.length} stops (AI)` : (truck?.route || 'Standby'))
                        : 'Unassigned';
                    const vehicleId = truck?.vehicleNumber || liveTruck?.vehicleNumber || w.truckId || 'N/A';
                    const collected = bins.filter(b => (b.collectedBy || '').toLowerCase() === (w.email || '').toLowerCase()).length;
                    const total = assignedBins.length + collected;
                    const efficiency = total > 0 ? Math.round((collected / total) * 100) : 0;
                    const isOnline = !!liveTruck;
                    return `
                        <tr>
                            <td class="font-medium">${w.name || w.email}</td>
                            <td><span class="status-badge ${isOnline ? 'online' : 'offline'}">${isOnline ? 'Online' : 'Offline'}</span></td>
                            <td>${vehicleId}</td>
                            <td>${routeLabel}</td>
                            <td class="${efficiency >= 70 ? 'text-primary' : 'text-amber-400'}">${efficiency}%</td>
                        </tr>`;
                }).join('');
            }
            renderAnalytics(latestBins, latestTrucks, latestReports, latestWorkers);
        } catch (e) {
            console.error('[SURGE] Worker fetch error:', e);
        }
    }

    // --- 8. CITIZEN REPORTS ---
    function populateCitizenReports(reports) {
        const container = document.getElementById('citizen-reports-container');
        if (!container) return;

        if (reports.length === 0) {
            container.innerHTML = '<p class="text-[#a5b6a0] col-span-3 text-center py-12">No reports yet. Live reports will appear here.</p>';
            return;
        }

        container.innerHTML = reports.map(r => {
            const timeAgo = r.createdAt ? getTimeAgo(r.createdAt.toDate ? r.createdAt.toDate() : new Date()) : 'Just now';
            const statusColor = r.status === 'open' ? 'text-amber-400' : 'text-primary';
            return `
                <div class="report-card">
                    <div class="flex justify-between items-start">
                        <h3>${r.type}</h3>
                        <span class="text-xs ${statusColor} font-bold uppercase">${r.status}</span>
                    </div>
                    <p class="location text-sm mt-1 flex items-center gap-1">
                        <span class="material-symbols-outlined text-sm">location_on</span>${r.location}
                    </p>
                    <p class="text-xs text-[#555] mt-1">${r.description || ''}</p>
                    <div class="flex gap-2 mt-4">
                        <button class="action-button text-xs flex-1" onclick="resolveReport('${r.id}')">
                            ${r.status === 'open' ? 'Resolve' : 'Resolved ✓'}
                        </button>
                    </div>
                </div>`;
        }).join('');
    }

    function getTimeAgo(date) {
        const diff = Date.now() - date.getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    }

    // Global resolve function
    window.resolveReport = async function(reportId) {
        try {
            await SurgeDB.resolveReport(reportId);
        } catch (e) { console.error(e); }
    };

    // --- 9. SEED DEMO DATA ---
    document.getElementById('seed-data-btn').addEventListener('click', async () => {
        const btn = document.getElementById('seed-data-btn');
        btn.textContent = 'Seeding...';
        btn.disabled = true;
        try {
            await SurgeDB.seedDemoData();
            btn.innerHTML = '<span class="material-symbols-outlined text-sm">check</span>Data Seeded!';
            setTimeout(() => {
                btn.innerHTML = '<span class="material-symbols-outlined text-sm">database</span>Seed Demo Data';
                btn.disabled = false;
            }, 3000);
        } catch (e) {
            console.error('[SURGE] Seed error:', e);
            btn.textContent = 'Error - Check Console';
            btn.disabled = false;
        }
    });


    // --- 9B. REMOVE SEEDED DATA ---
    const clearSeedBtn = document.getElementById('clear-seed-data-btn');
    if (clearSeedBtn) {
        clearSeedBtn.addEventListener('click', async () => {
            clearSeedBtn.textContent = 'Removing...';
            clearSeedBtn.disabled = true;
            try {
                await SurgeDB.clearSeededData();
                clearSeedBtn.innerHTML = '<span class="material-symbols-outlined text-sm">check</span>Seed Data Removed';
                setTimeout(() => {
                    clearSeedBtn.innerHTML = '<span class="material-symbols-outlined text-sm">delete_sweep</span>Remove Seeded Data';
                    clearSeedBtn.disabled = false;
                }, 3000);
            } catch (e) {
                console.error('[SURGE] Clear seed error:', e);
                clearSeedBtn.textContent = 'Error - Check Console';
                clearSeedBtn.disabled = false;
            }
        });
    }
    // --- 10. INITIAL LOAD ---
    populateWorkerManagement();

    // Invalidate map size after a short delay (fixes rendering issues)
    setTimeout(() => dashboardMap.invalidateSize(), 300);
});


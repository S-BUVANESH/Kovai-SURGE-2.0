document.addEventListener('DOMContentLoaded', () => {
    const user = SurgeAuth.checkAuth('worker');
    if (!user) return;

    // --- State ---
    let collectedCount = 0;
    let issuesReported = 0;
    let routeData = [];

    // --- Elements ---
    const userNameElement = document.getElementById('user-display-name');
    const routeListContainer = document.getElementById('route-list-container');
    const routeProgressElement = document.getElementById('route-progress');
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page');
    const issueForm = document.getElementById('issue-form');

    // --- Init ---
    function init() {
        userNameElement.textContent = user.email;
        document.getElementById('profile-email').textContent = user.email;
        initMap();
        loadRouteFromFirestore();
        setupEventListeners();
    }

    // --- Leaflet Map ---
    const COIMBATORE = [11.0168, 76.9558];
    let map;
    let routeMarkers = {};

    function initMap() {
        map = L.map('worker-map', { zoomControl: false }).setView(COIMBATORE, 14);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OSM &copy; CARTO',
            subdomains: 'abcd', maxZoom: 19
        }).addTo(map);
        L.control.zoom({ position: 'topright' }).addTo(map);
    }

    function getBinColor(fillLevel) {
        if (fillLevel >= 80) return '#fa4b38';
        if (fillLevel >= 50) return '#fa9d38';
        return '#53d22d';
    }

    function updateMapMarkers() {
        // Clear old markers
        Object.values(routeMarkers).forEach(m => map.removeLayer(m));
        routeMarkers = {};

        routeData.forEach(bin => {
            if (bin.collected) return;
            const color = getBinColor(bin.fillLevel || bin.fill);
            const marker = L.circleMarker([bin.lat || 11.0168, bin.lng || 76.9558], {
                radius: 10,
                fillColor: color,
                fillOpacity: 0.8,
                color: color,
                weight: 2,
                opacity: 1
            }).addTo(map);
            marker.bindPopup(`
                <div style="font-family:'Space Grotesk';color:#fff;">
                    <strong>Bin #${bin.id}</strong><br/>
                    <span style="color:#a5b6a0;">${bin.address}</span><br/>
                    <span style="color:${color};font-weight:700;">Fill: ${bin.fillLevel || bin.fill}%</span>
                </div>
            `, { className: 'dark-popup' });
            routeMarkers[bin.id] = marker;
        });

        // Fit bounds if we have markers
        const markerList = Object.values(routeMarkers);
        if (markerList.length > 0) {
            const group = L.featureGroup(markerList);
            map.fitBounds(group.getBounds().pad(0.3));
        }
    }

    // --- Load bins from Firestore ---
    async function loadRouteFromFirestore() {
        try {
            const bins = await SurgeDB.getBins();
            if (bins.length > 0) {
                routeData = bins.map(b => ({
                    id: b.id,
                    address: b.address,
                    fill: b.fillLevel,
                    fillLevel: b.fillLevel,
                    lat: b.lat,
                    lng: b.lng,
                    collected: b.status === 'collected'
                }));
            } else {
                // Fallback demo data
                routeData = [
                    { id: 'bin_001', address: '123 Gandhi Rd, R.S. Puram', fill: 95, lat: 11.0070, lng: 76.9520 },
                    { id: 'bin_002', address: '456 Avinashi Rd, Peelamedu', fill: 80, lat: 11.0250, lng: 76.9720 },
                    { id: 'bin_003', address: '789 Race Course Rd', fill: 75, lat: 11.0005, lng: 76.9650 }
                ];
            }
            renderRoute();
            updateMapMarkers();
        } catch (e) {
            console.error('[SURGE] Route load error:', e);
            routeData = [
                { id: 'bin_001', address: '123 Gandhi Rd, R.S. Puram', fill: 95, lat: 11.0070, lng: 76.9520 },
                { id: 'bin_002', address: '456 Avinashi Rd, Peelamedu', fill: 80, lat: 11.0250, lng: 76.9720 },
                { id: 'bin_003', address: '789 Race Course Rd', fill: 75, lat: 11.0005, lng: 76.9650 }
            ];
            renderRoute();
            updateMapMarkers();
        }
    }

    // --- Event Listeners ---
    function setupEventListeners() {
        document.getElementById('logout-button').addEventListener('click', () => {
            if (confirm('Logout?')) SurgeAuth.logout();
        });
        document.getElementById('add-priority-bin').addEventListener('click', addPriorityBin);
        routeListContainer.addEventListener('click', handleRouteClick);
        navLinks.forEach(link => link.addEventListener('click', handleNavClick));
        issueForm.addEventListener('submit', handleIssueSubmit);
    }

    // --- Render Route ---
    function renderRoute() {
        routeListContainer.innerHTML = '';
        routeData.forEach(bin => {
            const isCollected = bin.collected;
            const fillLevel = bin.fillLevel || bin.fill;
            const color = getBinColor(fillLevel);
            const itemHTML = `
                <div class="route-item ${isCollected ? 'collected' : ''}" data-id="${bin.id}">
                    <div class="flex gap-3 bg-[#111a11] p-3 rounded-xl justify-between items-center border border-white/5 hover:border-primary/20 transition-all">
                        <div class="flex items-center gap-3 flex-grow">
                            <div class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:${color}15;border:1px solid ${color}33;">
                                <span class="material-symbols-outlined text-lg" style="color:${color};">delete_outline</span>
                            </div>
                            <div>
                                <p class="font-bold text-sm">${bin.id}</p>
                                <p class="text-xs text-[#a5b6a0]">${bin.address}</p>
                                <div class="flex items-center gap-2 mt-1">
                                    <div class="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
                                        <div class="h-full rounded-full" style="width:${fillLevel}%;background:${color};"></div>
                                    </div>
                                    <span class="text-xs font-bold" style="color:${color};">${fillLevel}%</span>
                                </div>
                            </div>
                        </div>
                        <button class="collect-btn" ${isCollected ? 'disabled' : ''}>${isCollected ? '✓ Done' : 'Collect'}</button>
                    </div>
                </div>`;
            routeListContainer.insertAdjacentHTML('beforeend', itemHTML);
        });
        updateProgress();
    }

    function updateProgress() {
        collectedCount = routeData.filter(b => b.collected).length;
        routeProgressElement.textContent = `(${collectedCount}/${routeData.length})`;
        document.getElementById('stat-bins').textContent = collectedCount;
        document.getElementById('stat-progress').textContent = routeData.length > 0 ? `${Math.round((collectedCount / routeData.length) * 100)}%` : '0%';
        document.getElementById('stat-issues').textContent = issuesReported;
    }

    function addPriorityBin() {
        const newBin = { id: `priority_${Date.now()}`, address: 'URGENT: Saibaba Colony', fill: 98, fillLevel: 98, lat: 11.0100, lng: 76.9450 };
        routeData.unshift(newBin);
        renderRoute();
        updateMapMarkers();
    }

    // --- Event Handlers ---
    async function handleRouteClick(event) {
        const target = event.target;
        if (!target.classList.contains('collect-btn')) return;
        
        const routeItem = target.closest('.route-item');
        const binId = routeItem.dataset.id;
        const bin = routeData.find(b => b.id === binId);
        if (!bin || bin.collected) return;

        target.textContent = 'Updating...';
        target.disabled = true;

        try {
            await SurgeDB.markBinCollected(binId, user.uid);
            // Also update RTDB
            await rtdb.ref(`live/bins/${binId}/fillLevel`).set(0);
        } catch (e) {
            console.log('[SURGE] Local collect fallback');
        }

        bin.collected = true;
        renderRoute();
        updateMapMarkers();
    }

    function handleNavClick(event) {
        event.preventDefault();
        const targetPageId = this.dataset.page;
        pages.forEach(page => { page.classList.remove('active'); page.classList.add('hidden'); });
        const target = document.getElementById(targetPageId);
        if (target) { target.classList.remove('hidden'); target.classList.add('active'); }
        navLinks.forEach(link => link.classList.toggle('active', link.dataset.page === targetPageId));
        if (targetPageId === 'route-page') setTimeout(() => map.invalidateSize(), 100);
    }

    async function handleIssueSubmit(event) {
        event.preventDefault();
        const issueType = document.getElementById('issue-type').value;
        const binId = document.getElementById('bin-id').value;
        const comments = document.getElementById('comments').value;

        try {
            await SurgeDB.submitReport({
                type: issueType,
                location: binId ? `Bin ${binId}` : 'Worker reported',
                description: comments,
                reportedBy: user.email
            });
        } catch (e) {
            console.log('[SURGE] Report saved locally');
        }

        issuesReported++;
        updateProgress();
        this.reset();
        alert(`Issue "${issueType}" reported successfully!`);
    }

    init();
});
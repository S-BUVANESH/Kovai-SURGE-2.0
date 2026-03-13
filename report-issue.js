document.addEventListener('DOMContentLoaded', () => {
    const user = SurgeAuth.checkAuth('citizen');
    if (!user) return;
    const form = document.getElementById('issue-form');
    const locationInput = document.getElementById('issue-location');
    const suggestionsBox = document.getElementById('location-suggestions');
    const selectedInfo = document.getElementById('selected-location-info');

    let debounceTimer = null;
    let selectedLocation = null;
    let selectedIndex = -1;
    let currentSuggestions = [];
    const normalizedUserEmail = (user.email || sessionStorage.getItem('userEmail') || '').trim().toLowerCase();
    const pendingRewardKey = `surge_pending_reward_${normalizedUserEmail || user.uid}`;
    const legacyPendingRewardKey = `surge_pending_reward_${user.uid}`;

    // --- Toast ---
    function showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        setTimeout(() => toast.classList.remove('show'), 4000);
    }

    function queuePendingReward(reward) {
        try {
            const existingCurrent = JSON.parse(localStorage.getItem(pendingRewardKey) || '{"points":0,"recycledItems":0,"wasteReduced":0}');
            const existingLegacy = JSON.parse(localStorage.getItem(legacyPendingRewardKey) || '{"points":0,"recycledItems":0,"wasteReduced":0}');
            const merged = {
                points: (existingCurrent.points || 0) + (existingLegacy.points || 0) + (reward.points || 0),
                recycledItems: (existingCurrent.recycledItems || 0) + (existingLegacy.recycledItems || 0) + (reward.recycledItems || 0),
                wasteReduced: (existingCurrent.wasteReduced || 0) + (existingLegacy.wasteReduced || 0) + (reward.wasteReduced || 0),
                email: normalizedUserEmail,
            };
            localStorage.setItem(pendingRewardKey, JSON.stringify(merged));
            if (legacyPendingRewardKey !== pendingRewardKey) {
                localStorage.removeItem(legacyPendingRewardKey);
            }
        } catch (e) {
            console.warn('[SURGE] Pending reward queue failed', e);
        }
    }

    // --- Location Autocomplete (OpenStreetMap Nominatim) ---
    locationInput.addEventListener('input', () => {
        const query = locationInput.value.trim();
        selectedLocation = null;
        selectedIndex = -1;

        if (query.length < 2) {
            hideSuggestions();
            return;
        }

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => searchLocation(query), 350);
    });

    // Keyboard navigation
    locationInput.addEventListener('keydown', (e) => {
        if (!suggestionsBox.classList.contains('active')) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, currentSuggestions.length - 1);
            updateSelectedSuggestion();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, 0);
            updateSelectedSuggestion();
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            selectSuggestion(currentSuggestions[selectedIndex]);
        } else if (e.key === 'Escape') {
            hideSuggestions();
        }
    });

    function updateSelectedSuggestion() {
        const items = suggestionsBox.querySelectorAll('.suggestion-item');
        items.forEach((item, i) => item.classList.toggle('selected', i === selectedIndex));
        if (items[selectedIndex]) items[selectedIndex].scrollIntoView({ block: 'nearest' });
    }

    async function searchLocation(query) {
        // Show loading
        suggestionsBox.innerHTML = '<div class="search-spinner"><span class="material-symbols-outlined" style="animation:spin 1s linear infinite;">progress_activity</span> Searching...</div>';
        suggestionsBox.classList.add('active');

        try {
            // Search with Coimbatore bias for better local results
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Coimbatore, Tamil Nadu')}&limit=6&addressdetails=1&countrycodes=in`;
            const response = await fetch(url, {
                headers: { 'Accept-Language': 'en' }
            });
            const results = await response.json();

            if (results.length === 0) {
                // Fallback: search without Coimbatore bias
                const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6&addressdetails=1&countrycodes=in`;
                const fallbackResponse = await fetch(fallbackUrl, {
                    headers: { 'Accept-Language': 'en' }
                });
                const fallbackResults = await fallbackResponse.json();
                renderSuggestions(fallbackResults);
            } else {
                renderSuggestions(results);
            }
        } catch (error) {
            console.error('[SURGE] Location search error:', error);
            suggestionsBox.innerHTML = '<div class="search-spinner" style="color:#fa4b38;">⚠️ Search unavailable. Type the address manually.</div>';
        }
    }

    function renderSuggestions(results) {
        currentSuggestions = results;
        selectedIndex = -1;

        if (results.length === 0) {
            suggestionsBox.innerHTML = '<div class="search-spinner" style="color:#888;">No results found. Try a different search term.</div>';
            return;
        }

        suggestionsBox.innerHTML = results.map((place, i) => {
            const name = place.display_name.split(',')[0];
            const address = place.display_name.split(',').slice(1, 4).join(',').trim();
            const typeIcon = getPlaceIcon(place.type);

            return `
                <div class="suggestion-item" data-index="${i}">
                    <div class="suggestion-icon">
                        <span class="material-symbols-outlined text-primary" style="font-size:16px;">${typeIcon}</span>
                    </div>
                    <div>
                        <div class="suggestion-name">${name}</div>
                        <div class="suggestion-address">${address}</div>
                    </div>
                </div>`;
        }).join('');

        // Click handlers
        suggestionsBox.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index);
                selectSuggestion(currentSuggestions[index]);
            });
        });

        suggestionsBox.classList.add('active');
    }

    function selectSuggestion(place) {
        const name = place.display_name.split(',')[0];
        const fullAddress = place.display_name.split(',').slice(0, 3).join(',').trim();

        locationInput.value = fullAddress;
        selectedLocation = {
            name: name,
            address: fullAddress,
            lat: parseFloat(place.lat),
            lng: parseFloat(place.lon),
            fullAddress: place.display_name
        };

        // Show selected location badge
        selectedInfo.style.display = 'block';
        selectedInfo.innerHTML = `
            <div class="location-badge">
                <span class="material-symbols-outlined" style="font-size:14px;">location_on</span>
                📍 ${name} — ${place.lat.substring(0,8)}, ${place.lon.substring(0,8)}
            </div>`;

        hideSuggestions();
        locationInput.blur();
    }

    function hideSuggestions() {
        suggestionsBox.classList.remove('active');
        currentSuggestions = [];
        selectedIndex = -1;
    }

    function getPlaceIcon(type) {
        const icons = {
            'university': 'school', 'college': 'school', 'school': 'school',
            'hospital': 'local_hospital', 'bus_stop': 'directions_bus',
            'restaurant': 'restaurant', 'park': 'park',
            'residential': 'home', 'commercial': 'store',
            'administrative': 'location_city'
        };
        return icons[type] || 'location_on';
    }

    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.location-wrapper')) {
            hideSuggestions();
        }
    });

    // --- Form Submit ---
    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const issueType = document.getElementById('issue-type').value;
        const location = locationInput.value;
        const comments = document.getElementById('issue-comments').value;
        const userEmail = normalizedUserEmail || 'anonymous';

        if (!location) {
            showToast('Please search and select a location.', 'error');
            return;
        }

        const btn = document.getElementById('submit-btn');
        btn.textContent = 'Submitting...';
        btn.disabled = true;

        try {
            const reportData = {
                type: issueType,
                location: location,
                description: comments,
                reportedBy: userEmail,
                reportedByUid: user.uid,
            };

            // Include coordinates if location was selected from search
            if (selectedLocation) {
                reportData.lat = selectedLocation.lat;
                reportData.lng = selectedLocation.lng;
                reportData.locationName = selectedLocation.name;
            }

            await SurgeDB.submitReport(reportData);
            const reward = { points: 25, recycledItems: 1, wasteReduced: 2 };
            let rewardSynced = false;
            try {
                rewardSynced = await SurgeDB.applyCitizenReportReward(user.uid, userEmail, reward);
                if (!rewardSynced) {
                    queuePendingReward(reward);
                }
            } catch (rewardError) {
                rewardSynced = false;
                queuePendingReward(reward);
                console.warn('[SURGE] Reward sync delayed, queued locally', rewardError);
            }
            showToast(rewardSynced ? 'Report submitted! +25 GP credited.' : 'Report submitted. +25 GP queued for sync.');
            btn.textContent = 'Submitted! ✓';
            btn.style.background = 'rgba(83,210,45,0.2)';
            btn.style.color = '#53d22d';
            setTimeout(() => {
                window.location.href = 'citizen-dashboard.html';
            }, 1500);
        } catch (error) {
            console.error('[SURGE] Report error:', error);
            showToast('Report saved locally. Will sync when connected.', 'error');
            btn.textContent = 'Submit Report';
            btn.disabled = false;
        }
    });
});





document.addEventListener('DOMContentLoaded', () => {
    // --- AUTHENTICATION ---
    const user = SurgeAuth.checkAuth('citizen');
    if (!user) return;

    // --- STATE ---
    let greenPoints = 0;
    let recycledItems = 0;
    let wasteReduced = 0;
    const pendingRewardKey = `surge_pending_reward_${user.uid}`;

    const rewards = [
        { name: 'Eco-Friendly Tote Bag', cost: 500, img: 'https://images.unsplash.com/photo-1591534461839-8e36e3a49717?w=400&h=300&fit=crop' },
        { name: '₹200 Cafe Voucher', cost: 1000, img: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&h=300&fit=crop' },
        { name: 'Plant a Tree Donation', cost: 1500, img: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=400&h=300&fit=crop' },
        { name: 'Reusable Water Bottle', cost: 2000, img: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400&h=300&fit=crop' }
    ];

    function getPendingReward() {
        try {
            return JSON.parse(localStorage.getItem(pendingRewardKey) || '{"points":0,"recycledItems":0,"wasteReduced":0}');
        } catch (e) {
            return { points: 0, recycledItems: 0, wasteReduced: 0 };
        }
    }

    async function flushPendingReward() {
        const pending = getPendingReward();
        if (!pending || (!pending.points && !pending.recycledItems && !pending.wasteReduced)) return;
        try {
            await SurgeDB.applyCitizenReportReward(user.uid, user.email, pending);
            localStorage.removeItem(pendingRewardKey);
        } catch (e) {
            console.warn('[SURGE] Pending reward sync still pending', e);
        }
    }

    function renderBadge() {
        if (greenPoints >= 1000) {
            document.getElementById('badge-name').textContent = 'GREEN CHAMPION';
            document.getElementById('badge-progress').style.width = '100%';
            document.querySelector('#badge-progress + p').textContent = 'Max badge reached!';
        } else if (greenPoints >= 500) {
            document.getElementById('badge-name').textContent = 'ECO-WARRIOR';
            const progress = Math.round(((greenPoints - 500) / 500) * 100);
            document.getElementById('badge-progress').style.width = progress + '%';
            document.querySelector('#badge-progress + p').textContent = `${progress}% to Green Champion`;
        } else {
            document.getElementById('badge-name').textContent = 'NEWCOMER';
            const progress = Math.round((greenPoints / 500) * 100);
            document.getElementById('badge-progress').style.width = progress + '%';
            document.querySelector('#badge-progress + p').textContent = `${progress}% to Eco-Warrior`;
        }
    }

    // --- INIT ---
    async function init() {
        const userName = user.email.split('@')[0];
        document.getElementById('user-display-name').textContent = user.email;
        document.getElementById('welcome-message').textContent = `Welcome back, ${userName}!`;
        let hasFirestoreStats = false;

        try {
            let userData = await SurgeDB.getUser(user.uid);
            if (!userData) {
                userData = await SurgeDB.getUserByEmail(user.email);
            }
            if (userData) {
                greenPoints = Number(userData.greenPoints || 0);
                recycledItems = Number(userData.recycledItems || 0);
                wasteReduced = Number(userData.wasteReduced || 0);
                hasFirestoreStats = true;
            }
        } catch (e) {
            console.log('[SURGE] Loading user data from Firestore failed, using fallback');
        }

        const pending = getPendingReward();
        if (pending) {
            greenPoints += Number(pending.points || 0);
            recycledItems += Number(pending.recycledItems || 0);
            wasteReduced += Number(pending.wasteReduced || 0);
        }
        renderBadge();
        flushPendingReward();

        // Fallback: if user stats doc is missing, derive baseline points from submitted reports.
        if (!hasFirestoreStats) {
            try {
                const reports = await SurgeDB.getReports();
                const myReports = reports.filter(r => (r.reportedBy || '').toLowerCase() === user.email.toLowerCase());
                const derivedPoints = myReports.length * 25;
                if (derivedPoints > greenPoints) greenPoints = derivedPoints;
            } catch (e) {
                console.log('[SURGE] Fallback report-based points unavailable');
            }
        }

        await loadRealNotifications();
        setUpcomingCollection();
        updateDashboardStats();
        updatePointsBalance();
        renderRewards();
        setupEventListeners();
    }

    // --- REAL NOTIFICATIONS ---
    async function loadRealNotifications() {
        const container = document.getElementById('notifications-container');
        const notifications = [];

        try {
            // Get user's reports from Firestore
            const reports = await SurgeDB.getReports();
            const userReports = reports.filter(r => r.reportedBy === user.email);

            userReports.forEach(r => {
                notifications.push({
                    icon: r.status === 'resolved' ? 'task_alt' : 'pending',
                    text: `Your report "${r.type}" at ${r.location} — ${r.status === 'resolved' ? 'Resolved ✓' : 'Under review'}`,
                    color: r.status === 'resolved' ? '#53d22d' : '#fa9d38'
                });
            });
        } catch (e) {
            console.log('[SURGE] Could not load reports');
        }

        // Add welcome notification for all users
        notifications.push({
            icon: 'waving_hand',
            text: `Welcome to KOVAI~SURGE! Start reporting waste issues to earn Green Points.`,
            color: '#53d22d'
        });

        if (greenPoints > 0) {
            notifications.push({
                icon: 'stars',
                text: `You have ${greenPoints} Green Points. Redeem them in the rewards section!`,
                color: '#f59e0b'
            });
        }

        if (recycledItems > 0) {
            notifications.push({
                icon: 'recycling',
                text: `You've recycled ${recycledItems} items so far. Keep it up!`,
                color: '#53d22d'
            });
        }

        container.innerHTML = notifications.length > 0
            ? notifications.map(n => `
                <div class="notification-card">
                    <div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style="background:${n.color}15;border:1px solid ${n.color}33;">
                        <span class="material-symbols-outlined text-lg" style="color:${n.color};">${n.icon}</span>
                    </div>
                    <p class="text-sm text-[#bbb]">${n.text}</p>
                </div>
            `).join('')
            : '<p class="text-[#666] text-sm">No activity yet. Report an issue to get started!</p>';
    }

    // --- DYNAMIC COLLECTION DATE ---
    function setUpcomingCollection() {
        const now = new Date();
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        // Find next collection day (Tuesday & Friday)
        let nextCollection = new Date(now);
        const collectionDays = [2, 5]; // Tuesday, Friday
        let found = false;
        for (let i = 1; i <= 7; i++) {
            nextCollection.setDate(now.getDate() + i);
            if (collectionDays.includes(nextCollection.getDay())) { found = true; break; }
        }
        if (!found) nextCollection.setDate(now.getDate() + 1);

        const dayName = days[nextCollection.getDay()];
        const dateStr = `${nextCollection.getDate()} ${months[nextCollection.getMonth()]}`;
        const collectionElement = document.querySelector('#my-impact-page .hero-card p.text-xl');
        if (collectionElement) {
            collectionElement.textContent = `${dayName}, ${dateStr} — 8:00 AM`;
        }

        // Waste type alternates
        const wasteType = nextCollection.getDay() === 2 ? 'Recyclable Waste' : 'Organic Waste';
        const wasteDesc = document.querySelector('#my-impact-page .hero-card p.text-\\[\\#a5b6a0\\]');
        if (wasteDesc) {
            wasteDesc.innerHTML = `<span class="material-symbols-outlined text-primary text-sm">recycling</span> ${wasteType} — Ensure proper segregation`;
        }
    }

    function setupEventListeners() {
        document.querySelectorAll('.nav-link').forEach(link => link.addEventListener('click', handleNavClick));
        document.getElementById('logout-button').addEventListener('click', () => SurgeAuth.logout());
        document.getElementById('rewards-grid').addEventListener('click', handleRedemption);
    }

    // --- RENDER ---
    function renderRewards() {
        const grid = document.getElementById('rewards-grid');
        grid.innerHTML = rewards.map(r => {
            const canAfford = greenPoints >= r.cost;
            return `
            <div class="reward-card">
                <img src="${r.img}" alt="${r.name}" onerror="this.style.background='linear-gradient(135deg,#111a11,#1a2a1a)';this.style.display='block';">
                <div class="p-5">
                    <h3 class="text-base font-bold text-white">${r.name}</h3>
                    <p class="text-amber-400 font-bold mt-1">${r.cost.toLocaleString()} GP</p>
                    <button class="redeem-btn mt-3 ${!canAfford ? 'opacity-40' : ''}" data-cost="${r.cost}" ${!canAfford ? 'disabled title="Not enough points"' : ''}>
                        ${canAfford ? 'Redeem' : `Need ${(r.cost - greenPoints).toLocaleString()} more GP`}
                    </button>
                </div>
            </div>`;
        }).join('');
    }

    // --- CORE LOGIC ---
    function handleNavClick(e) {
        if (this.getAttribute('href') !== '#') return;
        e.preventDefault();
        const targetPageId = this.dataset.page;
        document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.classList.add('hidden'); });
        const target = document.getElementById(targetPageId);
        if (target) { target.classList.remove('hidden'); target.classList.add('active'); }
        document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l === this));
    }

    function updateDashboardStats() {
        // Show REAL values from Firestore
        animateValue('stat-recycled', 0, recycledItems, 1000);
        animateValue('stat-reduced', 0, wasteReduced, 1000);
        animateValue('stat-points', 0, greenPoints, 1000);
        updatePointsBalance();
        
        // Change labels based on real data
        document.getElementById('stat-recycled-change').textContent = recycledItems > 0 ? 'Keep recycling!' : 'Start recycling to earn GP';
        document.getElementById('stat-reduced-change').textContent = wasteReduced > 0 ? `${wasteReduced} kg diverted` : 'Report waste to track';
        document.getElementById('stat-points-change').textContent = greenPoints > 0 ? 'Redeem in rewards →' : 'Earn by reporting issues';
    }

    async function handleRedemption(e) {
        if (!e.target.matches('.redeem-btn') || e.target.disabled) return;
        const cost = parseInt(e.target.dataset.cost);

        if (greenPoints >= cost) {
            greenPoints -= cost;
            updatePointsBalance();
            animateValue('stat-points', greenPoints + cost, greenPoints, 500);
            e.target.textContent = 'Redeemed! ✓';
            e.target.disabled = true;
            e.target.style.background = 'rgba(83,210,45,0.1)';
            e.target.style.color = '#53d22d';
            
            try {
                await SurgeDB.updateUserPoints(user.uid, -cost);
            } catch (err) { console.log('[SURGE] Points update fallback'); }
        } else {
            alert('Not enough Green Points!');
            const card = document.getElementById('points-balance').closest('div');
            card.classList.add('shake');
            setTimeout(() => card.classList.remove('shake'), 500);
        }
    }

    function updatePointsBalance() {
        animateValue('points-balance', parseInt(document.getElementById('points-balance').textContent.replace(/,/g, '')) || 0, greenPoints, 500);
    }

    // --- ANIMATION HELPER ---
    function animateValue(id, start, end, duration) {
        const obj = document.getElementById(id);
        if (!obj) return;
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const currentValue = Math.floor(progress * (end - start) + start);
            obj.innerHTML = currentValue.toLocaleString();
            if (progress < 1) window.requestAnimationFrame(step);
        };
        window.requestAnimationFrame(step);
    }

    init();
});



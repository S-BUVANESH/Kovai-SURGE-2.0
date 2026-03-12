// ============================================================
// KOVAI~SURGE Authentication Module
// ============================================================
// Uses Firebase Auth for login/register/logout
// Role determined by email domain: @ad.in=admin, @td.in=worker, @gmail.com=citizen
// ============================================================

const SurgeAuth = {
    // Built-in demo worker credential for quick website access
    demoWorker: {
        email: 'worker01@td.in',
        password: 'Worker@123',
        uid: 'demo_worker_01'
    },

    // Determine role from email domain
    getRole(email) {
        email = email.toLowerCase();
        if (email.endsWith('@ad.in')) return 'admin';
        if (email.endsWith('@td.in')) return 'worker';
        if (email.endsWith('@gmail.com')) return 'citizen';
        return null;
    },

    // Get dashboard URL for role
    getDashboardUrl(role) {
        const dashboards = {
            admin: 'admin-dashboard.html',
            worker: 'worker-dashboard.html',
            citizen: 'citizen-dashboard.html'
        };
        return dashboards[role] || null;
    },

    // Login with email and password
    async login(email, password) {
        try {
            // Allow quick worker login without requiring account creation in Firebase Auth
            const normalizedEmail = email.trim().toLowerCase();
            if (
                normalizedEmail === this.demoWorker.email &&
                password === this.demoWorker.password
            ) {
                const role = 'worker';
                sessionStorage.setItem('userEmail', this.demoWorker.email);
                sessionStorage.setItem('userRole', role);
                sessionStorage.setItem('userUid', this.demoWorker.uid);
                return {
                    user: { uid: this.demoWorker.uid, email: this.demoWorker.email },
                    role,
                    demo: true
                };
            }

            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            const role = this.getRole(email);
            if (!role) {
                await auth.signOut();
                throw new Error('Your email domain is not authorized for this system.');
            }
            // Store session info
            sessionStorage.setItem('userEmail', email);
            sessionStorage.setItem('userRole', role);
            sessionStorage.setItem('userUid', userCredential.user.uid);
            return { user: userCredential.user, role };
        } catch (error) {
            throw this.formatError(error);
        }
    },

    // Register a new citizen
    async register(email, password, fullName) {
        try {
            const role = this.getRole(email);
            if (!role) {
                throw new Error('Your email domain is not authorized for this system.');
            }
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            
            // Create user document in Firestore
            await db.collection('users').doc(userCredential.user.uid).set({
                email: email,
                name: fullName,
                role: role,
                greenPoints: 0,
                recycledItems: 0,
                wasteReduced: 0,
                badges: ['newcomer'],
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            return { user: userCredential.user, role };
        } catch (error) {
            throw this.formatError(error);
        }
    },

    // Logout
    async logout() {
        try {
            await auth.signOut();
            sessionStorage.clear();
            window.location.href = 'index.html';
        } catch (error) {
            console.error('[SURGE] Logout error:', error);
        }
    },

    // Check if user is authenticated and has correct role
    checkAuth(requiredRole) {
        const userEmail = sessionStorage.getItem('userEmail');
        const userRole = sessionStorage.getItem('userRole');
        const userUid = sessionStorage.getItem('userUid');

        if (!userEmail || !userUid || userRole !== requiredRole) {
            window.location.href = 'index.html';
            return null;
        }
        return { email: userEmail, role: userRole, uid: userUid };
    },

    // Format Firebase error messages
    formatError(error) {
        const messages = {
            'auth/user-not-found': 'No account found with this email. Please register first.',
            'auth/wrong-password': 'Incorrect password. Please try again.',
            'auth/email-already-in-use': 'An account with this email already exists.',
            'auth/weak-password': 'Password must be at least 6 characters.',
            'auth/invalid-email': 'Please enter a valid email address.',
            'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
            'auth/invalid-credential': 'Invalid email or password. Please check and try again.'
        };
        const message = messages[error.code] || error.message || 'An unexpected error occurred.';
        return new Error(message);
    }
};

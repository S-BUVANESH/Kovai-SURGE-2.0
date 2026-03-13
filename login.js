document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const loginBtn = document.getElementById('loginBtn');
    const loginText = document.getElementById('loginText');
    const loginSpinner = document.getElementById('loginSpinner');
    const togglePassword = document.getElementById('togglePassword');

    // Password visibility toggle
    togglePassword.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        togglePassword.querySelector('span').textContent = isPassword ? 'visibility' : 'visibility_off';
    });

    // Show toast notification
    function showToast(message, type = 'error') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        setTimeout(() => toast.classList.remove('show'), 4000);
    }

    // Set loading state
    function setLoading(loading) {
        loginBtn.disabled = loading;
        loginText.textContent = loading ? 'Authenticating...' : 'Login';
        loginSpinner.classList.toggle('hidden', !loading);
        loginBtn.style.opacity = loading ? '0.7' : '1';
    }

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = emailInput.value.trim().toLowerCase();
        const password = passwordInput.value;

        if (!email || !password) {
            showToast('Please fill in all fields.');
            return;
        }

        // Validate email domain
        const role = SurgeAuth.getRole(email);
        if (!role) {
            if (email.endsWith('@td.in')) {
                showToast('Worker login is moved to the mobile app. Use Worker Ops there.');
            } else {
                showToast('Access Denied: Use @ad.in or @gmail.com on web.');
            }
            return;
        }

        setLoading(true);

        try {
            const result = await SurgeAuth.login(email, password);
            showToast(`Welcome! Redirecting to ${result.role} dashboard...`, 'success');
            const target = SurgeAuth.getDashboardUrl(result.role);

            if (!target) {
                throw new Error('Unable to resolve dashboard route for this account.');
            }
            
            setTimeout(() => {
                window.location.href = target;
            }, 800);

            // If redirect does not happen for any reason, release the button state.
            setTimeout(() => {
                setLoading(false);
            }, 2500);
        } catch (error) {
            showToast(error.message);
            setLoading(false);
        }
    });
});

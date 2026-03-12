document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const emailInput = document.getElementById('emailInput');
    const passwordInput = document.getElementById('passwordInput');
    const confirmPasswordInput = document.getElementById('confirmPasswordInput');
    const fullName = document.getElementById('fullName');
    const registerBtn = document.getElementById('registerBtn');
    const registerText = document.getElementById('registerText');
    const registerSpinner = document.getElementById('registerSpinner');

    function showToast(message, type = 'error') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type} show`;
        setTimeout(() => toast.classList.remove('show'), 4000);
    }

    function setLoading(loading) {
        registerBtn.disabled = loading;
        registerText.textContent = loading ? 'Creating Account...' : 'Register';
        registerSpinner.classList.toggle('hidden', !loading);
        registerBtn.style.opacity = loading ? '0.7' : '1';
    }

    registerForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const email = emailInput.value.trim().toLowerCase();
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;
        const name = fullName.value.trim();

        // Validations
        if (!name) { showToast('Please enter your full name.'); return; }
        if (!email.endsWith('@gmail.com')) {
            showToast('Registration is currently available for citizens with a @gmail.com address.');
            return;
        }
        if (password !== confirmPassword) { showToast('Passwords do not match.'); return; }
        if (password.length < 6) { showToast('Password must be at least 6 characters.'); return; }

        setLoading(true);

        try {
            await SurgeAuth.register(email, password, name);
            showToast('Registration successful! Redirecting to login...', 'success');
            setTimeout(() => { window.location.href = 'index.html'; }, 1500);
        } catch (error) {
            showToast(error.message);
            setLoading(false);
        }
    });
});
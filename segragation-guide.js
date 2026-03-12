document.addEventListener('DOMContentLoaded', () => {
    // --- SESSION AUTHENTICATION ---
    // Ensures only logged-in citizens can access this page directly.
    const userEmail = sessionStorage.getItem('userEmail');
    if (!userEmail) {
        alert('Access Denied. Please log in.');
        window.location.href = 'login.html';
        return;
    }
});
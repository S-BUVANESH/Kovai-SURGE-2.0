document.addEventListener('DOMContentLoaded', () => {
    const resetForm = document.getElementById('reset-form');
    const emailInput = document.getElementById('email-input');

    resetForm.addEventListener('submit', (event) => {
        event.preventDefault(); // Prevent the form from submitting

        const email = emailInput.value.trim();
        if (!email) {
            alert('Please enter your email address.');
            return;
        }

        // Simulate sending the email
        alert(`If an account with the email "${email}" exists, a password reset link has been sent.`);

        // Redirect back to the login page after a short delay
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1500);
    });
});
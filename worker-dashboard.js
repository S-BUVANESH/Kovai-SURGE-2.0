document.addEventListener('DOMContentLoaded', () => {
    const user = SurgeAuth.checkAuth('worker');
    if (!user) return;

    document.body.innerHTML = `
        <div style="min-height:100vh;background:#0b120b;color:#fff;font-family:'Space Grotesk',sans-serif;display:flex;align-items:center;justify-content:center;padding:24px;">
            <div style="max-width:760px;width:100%;background:rgba(16,26,16,0.9);border:1px solid rgba(83,210,45,0.25);border-radius:18px;padding:28px;box-shadow:0 20px 50px rgba(0,0,0,0.45);">
                <h1 style="margin:0 0 10px 0;font-size:28px;font-weight:800;letter-spacing:0.4px;">Worker Web Dashboard Decommissioned</h1>
                <p style="margin:0 0 16px 0;color:#b7c8b2;line-height:1.5;">
                    Worker operations are now fully moved to the mobile app in <strong>Worker Ops</strong> mode.
                    Use the app for route assignment, navigation, citizen reports, and bin collection updates.
                </p>
                <div style="background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px 16px;margin-bottom:14px;">
                    <p style="margin:0 0 8px 0;color:#d6e8cf;font-weight:700;">Use in app:</p>
                    <ol style="margin:0;padding-left:20px;color:#9eb09a;line-height:1.7;">
                        <li>Open mobile simulator app</li>
                        <li>Go to <strong>Worker Ops</strong></li>
                        <li>Start shift and follow assigned route</li>
                    </ol>
                </div>
                <button id="logout-now" style="height:42px;padding:0 16px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(83,210,45,0.2);color:#d9ffd2;font-weight:700;cursor:pointer;">Logout</button>
            </div>
        </div>
    `;

    const logoutButton = document.getElementById('logout-now');
    if (logoutButton) {
        logoutButton.addEventListener('click', () => SurgeAuth.logout());
    }
});

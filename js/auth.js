/**
 * UPDATED checkAccess for js/auth.js
 * Section 17: The Defaulter Guard
 */
function checkAccess() {
    const banner = document.getElementById('defaulter-banner');
    if (!window.currentProfile) return;

    const isPremium = window.currentProfile.is_premium;
    const expiryDate = window.currentProfile.subscription_expiry ? new Date(window.currentProfile.subscription_expiry) : null;
    const isExpired = expiryDate && expiryDate < new Date();

    // 1. Handle Expiry Update
    if (isPremium && isExpired) {
        // Silently update DB to reflect status
        window.sb.from('profiles').update({ is_premium: false, status: 'EXPIRED' }).eq('id', window.currentUser.id);
        window.currentProfile.is_premium = false;
    }

    // 2. UI Banner Logic
    if (banner) {
        if (isExpired || (window.currentProfile.status === 'EXPIRED')) {
            banner.classList.add('active');
            banner.innerHTML = `⚠️ Your subscription has expired. <a href="index.html#pricing" style="color:#fff; font-weight:700;">Renew Now →</a>`;
        } else {
            banner.classList.remove('active');
        }
    }

    // 3. Page Restriction Logic
    const highValuePages = ['classroom.html', 'dashboard.html', 'cbt.html'];
    const currentPage = window.location.pathname;

    if (isExpired && highValuePages.some(p => currentPage.includes(p))) {
        // Allow CBT but only in limited mode? 
        // Spec says: "Redirect to index.html#pricing if on high-value pages"
        setTimeout(() => {
            window.toast("Subscription expired. Redirecting to pricing...");
            window.location.href = 'index.html#pricing';
        }, 3000);
    }
}
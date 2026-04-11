// ============================================================
// UltimateEdge School — /js/paystack.js  (v3.1)
// Load AFTER auth.js. Only needed on index.html.
// Exposes: openPaystack(plan), handlePaymentSuccess(response, plan)
// ============================================================

const PS_PUBLIC_KEY = 'pk_live_681bc4436b4c4249010d01795bb05f655cd470eb';

// ⚠️  Replace these with your actual PLN_xxxxxxx codes from:
// dashboard.paystack.com → Products → Plans
const PS_PLANS = {
  monthly:  'PLN_REPLACE_MONTHLY',   // ₦1,500/month   — recurring
  '3month': 'PLN_REPLACE_3MONTH',   // ₦4,000 one-time — 90 days
  annual:   'PLN_REPLACE_ANNUAL'    // ₦12,000/year    — recurring
};

// Plan metadata (amounts in kobo for the payments table)
const PS_PLAN_META = {
  monthly:  { label: 'Monthly',   kobo: 150000, days: 30,  autoRenew: true  },
  '3month': { label: '3 Months',  kobo: 400000, days: 90,  autoRenew: false },
  annual:   { label: 'Annual',    kobo: 1200000, days: 365, autoRenew: true  }
};

// ── Open Paystack popup ───────────────────────────────────────
function openPaystack(plan) {
  // Guard: user must be logged in
  if (!window.currentUser || !window.currentProfile) {
    openAuthModal('login');
    toast('Please log in to subscribe.');
    return;
  }

  // Guard: keys must be configured
  const planCode = PS_PLANS[plan];
  if (!PS_PUBLIC_KEY || PS_PUBLIC_KEY.includes('REPLACE') ||
      !planCode || planCode.includes('REPLACE')) {
    toast('Payment is not yet configured. Please check back soon.');
    console.warn('Paystack: PS_PUBLIC_KEY or plan code not set for plan:', plan);
    return;
  }

  const meta      = PS_PLAN_META[plan];
  const ref       = 'ue_' + Date.now() + '_' + currentUser.id.slice(0, 8);

  trackAction('payment_initiated', { plan, ref });

  const handler = PaystackPop.setup({
    key:          PS_PUBLIC_KEY,
    email:        currentUser.email,
    plan:         planCode,
    ref:          ref,
    callback_url: 'https://school.ultimateedge.info/payment-success.html',
    callback:     (response) => handlePaymentSuccess(response, plan),
    onClose:      () => toast('Payment window closed. Your progress is saved.')
  });

  handler.openIframe();
}

// ── Handle successful payment ─────────────────────────────────
async function handlePaymentSuccess(response, plan) {
  if (!window.currentUser || !window.sb) return;

  const meta    = PS_PLAN_META[plan];
  const expiry  = new Date();
  expiry.setDate(expiry.getDate() + meta.days);

  try {
    // 1. Update profiles — premium access
    const { error: profileErr } = await sb.from('profiles').update({
      is_premium:           true,
      status:               'ACTIVE',
      subscription_status:  'ACTIVE',
      subscription_expiry:  expiry.toISOString(),
      auto_renew:           meta.autoRenew
    }).eq('id', currentUser.id);

    if (profileErr) throw profileErr;

    // 2. Log payment record
    const { error: payErr } = await sb.from('payments').insert({
      user_id:   currentUser.id,
      amount:    meta.kobo,
      plan:      plan,
      reference: response.reference || response.trxref || 'ps_' + Date.now(),
      status:    'success'
    });

    if (payErr) console.warn('Payment log error (non-fatal):', payErr);

    // 3. Refresh local state
    await loadProfile();
    updateNavUI();

    // 4. Remove any premium-lock overlays on the page
    document.querySelectorAll('.premium-lock').forEach(el => {
      el.classList.remove('premium-lock');
    });

    // 5. Hide defaulter banner if showing
    const banner = document.getElementById('defaulter-banner');
    if (banner) banner.classList.remove('active');

    // 6. Track
    trackAction('payment_success', { plan, days: meta.days, ref: response.reference });

    toast(`🎉 PRO activated! ${meta.label} access unlocked.`, 5000);

  } catch (err) {
    console.error('Payment success handler error:', err);
    toast('Payment recorded but profile update failed. Please contact support.');
  }
}

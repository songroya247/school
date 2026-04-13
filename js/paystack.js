/* ── UltimateEdge School — paystack.js v4.1 ── */
/* Paystack payment popup · subscription plans · success handler */

// ─── CREDENTIALS ──────────────────────────────────────────────────────────────
const PAYSTACK_PUBLIC_KEY = 'pk_test_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'; // ← replace

// ─── PLAN CODES (from Paystack Dashboard → Products → Plans) ─────────────────
const PLAN_CODES = {
  monthly:    'PLN_XXXXXXXXXXXX',  // ₦1,500/month recurring
  threeMonth: 'PLN_XXXXXXXXXXXX',  // ₦3,500 one-time
  annual:     'PLN_XXXXXXXXXXXX',  // ₦10,000 one-time
};

// ─── PLAN AMOUNTS (in kobo: ₦1 = 100 kobo) ───────────────────────────────────
const PLAN_AMOUNTS = {
  monthly:    150000,   // ₦1,500
  threeMonth: 350000,   // ₦3,500
  annual:    1000000,   // ₦10,000
};

// ─── PLAN LABELS ─────────────────────────────────────────────────────────────
const PLAN_LABELS = {
  monthly:    'Monthly Plan',
  threeMonth: '3-Month Plan',
  annual:     'Annual Plan',
};

// ─── DAYS PER PLAN ────────────────────────────────────────────────────────────
const PLAN_DAYS = {
  monthly:    30,
  threeMonth: 90,
  annual:     365,
};

// ─── OPEN PAYSTACK ────────────────────────────────────────────────────────────
function openPaystack(plan) {
  // Must be logged in
  if (typeof currentUser === 'undefined' || !currentUser) {
    toast('Please log in or create an account first');
    // If openAuthModal is available (from auth modal on index.html), open it
    if (typeof openAuthModal === 'function') openAuthModal('signup');
    else window.location.href = 'login.html';
    return;
  }

  if (!PLAN_CODES[plan] || PLAN_CODES[plan].startsWith('PLN_XX')) {
    toast('Payment not yet configured — contact support');
    return;
  }

  const email = currentProfile ? currentProfile.email : currentUser.email;
  const amount = PLAN_AMOUNTS[plan];

  // Paystack inline handler
  const handler = window.PaystackPop.setup({
    key:       PAYSTACK_PUBLIC_KEY,
    email:     email,
    amount:    amount,
    currency:  'NGN',
    plan:      PLAN_CODES[plan],
    ref:       'UE_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8).toUpperCase(),
    metadata: {
      custom_fields: [
        { display_name: 'Student Name', variable_name: 'student_name', value: currentProfile?.full_name || '' },
        { display_name: 'Plan',         variable_name: 'plan',         value: plan },
      ],
    },
    callback: (response) => handlePaymentSuccess(response, plan),
    onClose:  () => toast('Payment window closed'),
  });

  handler.openIframe();
}
window.openPaystack = openPaystack;

// ─── PAYMENT SUCCESS HANDLER ──────────────────────────────────────────────────
async function handlePaymentSuccess(response, plan) {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + (PLAN_DAYS[plan] || 30));

  // Update profile
  const { error: profileError } = await sb.from('profiles').update({
    is_premium:           true,
    subscription_expiry:  expiryDate.toISOString(),
    auto_renew:           plan === 'monthly',
    paystack_cust_id:     response.customer?.id || null,
  }).eq('id', currentUser.id);

  if (profileError) {
    console.error('Failed to update profile after payment:', profileError);
    toast('Payment received but profile update failed — contact support');
    return;
  }

  // Log payment
  await sb.from('payments').insert({
    user_id:   currentUser.id,
    amount:    PLAN_AMOUNTS[plan],
    plan:      plan,
    reference: response.reference,
    status:    'success',
  });

  // Update local profile
  if (currentProfile) {
    currentProfile.is_premium = true;
    currentProfile.subscription_expiry = expiryDate.toISOString();
  }

  // Track action
  if (typeof trackAction === 'function') {
    trackAction('payment_made', { plan, reference: response.reference, amount: PLAN_AMOUNTS[plan] });
  }

  toast('🎉 Premium activated! Welcome to UltimateEdge PRO');

  // Refresh nav to show PRO badge
  if (typeof updateNavUI === 'function') updateNavUI();

  // Remove defaulter banner if showing
  const banner = document.getElementById('defaulter-banner');
  if (banner) banner.classList.remove('visible');

  // Redirect to dashboard if on homepage
  const page = location.pathname.split('/').pop();
  if (!page || page === 'index.html') {
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 1500);
  }
}
window.handlePaymentSuccess = handlePaymentSuccess;

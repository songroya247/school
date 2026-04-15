/* ═══════════════════════════════════════════════════════════
   UltimateEdge School — paystack.js  v4.1
   Payment flow — Paystack popup → Supabase profile update.
   Only loaded on index.html.
   ═══════════════════════════════════════════════════════════ */

const PAYSTACK_PUBLIC_KEY = 'pk_live_681bc4436b4c4249010d01795bb05f655cd470eb';

const PAYSTACK_PLANS = {
  monthly: {
    planCode: 'PLN_jctl2fmbtbprn79',
    amount:   150000,     // ₦1,500 in kobo
    label:    'Monthly',
    days:     30,
    autoRenew: true,
  },
  '3month': {
    planCode: 'PLN_7k27rm469etnc8y',
    amount:   350000,     // ₦3,500 in kobo
    label:    '3-Month',
    days:     90,
    autoRenew: false,
  },
  annual: {
    planCode: 'PLN_vg1odwe75m793nk',
    amount:   1200000,    // ₦12,000 in kobo
    label:    'Annual',
    days:     365,
    autoRenew: false,
  },
};

/**
 * openPaystack(plan) — opens the Paystack payment popup.
 * plan: 'monthly' | '3month' | 'annual'
 */
function openPaystack(plan) {
  if (!currentUser || !currentProfile) {
    openAuthModal('signup');
    toast('Please create an account first');
    return;
  }

  const cfg = PAYSTACK_PLANS[plan];
  if (!cfg) { toast('Invalid plan'); return; }

  const handler = PaystackPop.setup({
    key:       PAYSTACK_PUBLIC_KEY,
    email:     currentProfile.email,
    amount:    cfg.amount,
    plan:      cfg.planCode,
    currency:  'NGN',
    ref:       `UE_${plan}_${Date.now()}_${currentUser.id.slice(0,8)}`,
    metadata: {
      user_id: currentUser.id,
      plan,
    },
    callback: (response) => handlePaymentSuccess(response, plan),
    onClose: () => toast('Payment window closed'),
  });

  handler.openIframe();
}

/**
 * handlePaymentSuccess(response, plan)
 * Updates profile and inserts payment row.
 */
async function handlePaymentSuccess(response, plan) {
  const cfg    = PAYSTACK_PLANS[plan];
  const expiry = new Date(Date.now() + cfg.days * 24 * 3600 * 1000).toISOString();

  try {
    /* Update profile */
    await sb.from('profiles').update({
      is_premium:          true,
      subscription_expiry: expiry,
      auto_renew:          cfg.autoRenew,
      paystack_cust_id:    response.customer?.id || null,
      status:              'ACTIVE',
    }).eq('id', currentUser.id);

    /* Log payment */
    await sb.from('payments').insert({
      user_id:   currentUser.id,
      amount:    cfg.amount,
      plan,
      reference: response.reference,
      status:    'success',
    });

    /* Update local profile cache */
    if (currentProfile) {
      currentProfile.is_premium          = true;
      currentProfile.subscription_expiry = expiry;
      currentProfile.auto_renew          = cfg.autoRenew;
    }

    /* Track action */
    trackAction('payment_made', { plan, reference: response.reference });

    /* Update UI */
    updateNavUI();
    const proEl = document.getElementById('nav-pro-badge');
    if (proEl) proEl.style.display = 'flex';

    toast(`Premium activated! Welcome to UltimateEdge PRO 🎉`);

    /* Hide defaulter banner */
    const banner = document.getElementById('defaulter-banner');
    if (banner) banner.style.display = 'none';

    /* Redirect to dashboard */
    setTimeout(() => { window.location.href = '/dashboard.html'; }, 2000);

  } catch (err) {
    console.error('Payment success handler error:', err);
    toast('Payment received but profile update failed. Contact support.');
  }
}

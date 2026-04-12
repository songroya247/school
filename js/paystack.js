// ============================================================
// UltimateEdge School — /js/paystack.js  (v3.2)
// Load AFTER auth.js. Only on index.html.
// ============================================================

const PS_PUBLIC_KEY = 'pk_live_681bc4436b4c4249010d01795bb05f655cd470eb';

// ⚠️  Replace with your actual PLN_xxxxxxx codes from Paystack Dashboard
const PS_PLANS = {
  monthly:  'PLN_REPLACE_MONTHLY',
  '3month': 'PLN_REPLACE_3MONTH',
  annual:   'PLN_REPLACE_ANNUAL'
};

const PS_META = {
  monthly:  { label:'Monthly',  kobo:150000,  days:30,  autoRenew:true  },
  '3month': { label:'3 Months', kobo:400000,  days:90,  autoRenew:false },
  annual:   { label:'Annual',   kobo:1200000, days:365, autoRenew:true  }
};

window.openPaystack = function(plan) {
  if (!window.currentUser || !window.currentProfile) {
    window.openAuthModal('login');
    window.toast('Please log in to subscribe.');
    return;
  }
  const code = PS_PLANS[plan];
  if (!PS_PUBLIC_KEY || PS_PUBLIC_KEY.includes('REPLACE') ||
      !code || code.includes('REPLACE')) {
    window.toast('Payment not yet configured. Please check back soon.');
    return;
  }
  const ref = 'ue_' + Date.now() + '_' + window.currentUser.id.slice(0,8);
  window.trackAction('payment_initiated', { plan, ref });

  const handler = PaystackPop.setup({
    key:          PS_PUBLIC_KEY,
    email:        window.currentUser.email,
    plan:         code,
    ref,
    callback_url: 'https://school.ultimateedge.info/payment-success.html',
    callback:     r => window.handlePaymentSuccess(r, plan),
    onClose:      () => window.toast('Payment window closed.')
  });
  handler.openIframe();
};

window.handlePaymentSuccess = async function(response, plan) {
  if (!window.currentUser || !window.sb) return;
  const meta   = PS_META[plan];
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + meta.days);

  try {
    await window.sb.from('profiles').update({
      is_premium:          true,
      status:              'ACTIVE',
      subscription_status: 'ACTIVE',
      subscription_expiry: expiry.toISOString(),
      auto_renew:          meta.autoRenew
    }).eq('id', window.currentUser.id);

    await window.sb.from('payments').insert({
      user_id:   window.currentUser.id,
      amount:    meta.kobo,
      plan,
      reference: response.reference || response.trxref || 'ps_' + Date.now(),
      status:    'success'
    });

    await window.loadProfile();
    window.updateNavUI();

    document.querySelectorAll('.premium-lock').forEach(el =>
      el.classList.remove('premium-lock'));
    document.getElementById('defaulter-banner')?.classList.remove('active');

    window.trackAction('payment_success', { plan, days: meta.days });
    window.toast('🎉 PRO access activated! ' + meta.label + ' plan.', 5000);
  } catch (err) {
    console.error('[UE] Payment handler error:', err);
    window.toast('Payment recorded but update failed. Contact support.');
  }
};

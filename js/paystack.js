/* ================================================================
   paystack.js — UltimateEdge v2.1
   Recurring (₦1,500/mo) + Bulk Plans (₦4,000/3mo · ₦12,000/yr)
   Integrates with Supabase profiles + payments tables
   ================================================================ */

const PS_PUBLIC_KEY = 'pk_live_681bc4436b4c4249010d01795bb05f655cd470eb'; // ← replace

const PLANS = {
  monthly:   { label: '1 Month',    amount: 150000,  days: 30,  naira: '₦1,500',  save: null,       autoRenew: true  },
  quarterly: { label: '3 Months',   amount: 400000,  days: 90,  naira: '₦4,000',  save: '₦500',     autoRenew: false },
  yearly:    { label: '12 Months',  amount: 1200000, days: 365, naira: '₦12,000', save: '₦6,000',   autoRenew: false }
};

/* ── OPEN PAYMENT POPUP ─────────────────────────────────────
   planKey: 'monthly' | 'quarterly' | 'yearly'
   ──────────────────────────────────────────────────────────── */
function openPaystack(planKey = 'monthly') {
  if (typeof currentUser === 'undefined' || !currentUser) {
    openAuthModal('login'); return;
  }
  if (typeof PaystackPop === 'undefined') {
    toast('Payment service loading, please retry in a moment.'); return;
  }

  const plan = PLANS[planKey];
  if (!plan) return;

  const ref = 'UE2_' + planKey.toUpperCase() + '_' + Date.now() + '_' + currentUser.id.slice(0, 8);

  const handler = PaystackPop.setup({
    key:      PS_PUBLIC_KEY,
    email:    currentUser.email,
    amount:   plan.amount,
    currency: 'NGN',
    ref,
    metadata: {
      user_id:   currentUser.id,
      plan_type: planKey,
      auto_renew: plan.autoRenew,
      custom_fields: [
        { display_name: 'Plan', variable_name: 'plan', value: plan.label },
        { display_name: 'Auto-renew', variable_name: 'auto_renew', value: String(plan.autoRenew) }
      ]
    },
    callback: async function(response) {
      await onPaymentSuccess(response, planKey, plan);
    },
    onClose: function() {
      toast('Payment window closed.');
    }
  });

  handler.openIframe();
}

/* ── ON SUCCESS CALLBACK ──────────────────────────────────── */
async function onPaymentSuccess(response, planKey, plan) {
  if (!sb || !currentUser) return;

  const now    = new Date();
  const expiry = new Date(now.getTime() + plan.days * 86400000);

  // 1. Log the payment
  await sb.from('payments').insert({
    user_id:   currentUser.id,
    amount:    plan.amount / 100, // store in naira
    plan_type: planKey,
    reference: response.reference,
    status:    'success',
    created_at: now.toISOString()
  });

  // 2. Update profile
  await sb.from('profiles').update({
    is_premium:            true,
    subscription_status:   'active',
    subscription_type:     planKey,
    subscription_expiry:   expiry.toISOString(),
    auto_renew:            plan.autoRenew
  }).eq('id', currentUser.id);

  // 3. Refresh local profile
  if (typeof loadProfile === 'function') await loadProfile();
  if (typeof updateNavUI === 'function') updateNavUI();

  // 4. Award XP + badge
  if (typeof addXP === 'function') await addXP(100, '🎉 Premium Unlocked');

  // 5. UI feedback
  toast('🎉 Mastery Pro unlocked! Welcome to the 300+ Club.');
  refreshPaymentUI();

  // Dismiss any defaulter banner
  document.getElementById('defaulter-banner')?.classList.remove('show');
}

/* ── REFRESH PAYMENT BUTTONS ─────────────────────────────── */
function refreshPaymentUI() {
  document.querySelectorAll('[data-pay-btn]').forEach(btn => {
    const planKey = btn.dataset.payBtn;
    if (currentProfile?.is_premium && currentProfile?.subscription_type === planKey) {
      btn.textContent = '✅ Active Plan';
      btn.disabled = true;
      btn.style.opacity = '0.65';
    }
  });
}

/* ── PRICING TOGGLE (Monthly vs Bulk) ───────────────────────
   Call this from the pricing toggle UI.
   ──────────────────────────────────────────────────────────── */
function showPricingTab(tab) {
  document.querySelectorAll('.pricing-tab-content').forEach(el => {
    el.style.display = el.dataset.tab === tab ? 'block' : 'none';
  });
  document.querySelectorAll('.pricing-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
}

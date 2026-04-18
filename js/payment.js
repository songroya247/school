/* ═══════════════════════════════════════════════════
   UE School — Payment Module
   Handles Paystack inline popup, payment recording,
   and subscription activation on success.
═══════════════════════════════════════════════════ */

const PAYMENT = (function () {

  // ── Plan config (matches Paystack dashboard) ──────
  const PLANS = {
    monthly: {
      label:    'Monthly',
      amount:   150000,          // kobo (₦1,500)
      naira:    '₦1,500',
      days:     30,
      planCode: 'PLN_jctl2fmbtbprn79',
      features: ['Full CBT access', 'All video lessons', 'Score prediction', 'Basic analytics']
    },
    quarterly: {
      label:    '3-Month',
      amount:   350000,          // kobo (₦3,500)
      naira:    '₦3,500',
      days:     90,
      planCode: 'PLN_7k27rm469etnc8y',
      features: ['Everything in Monthly', 'SmartPath™ Engine', 'Weakness tracker', 'Priority support']
    },
    annual: {
      label:    'Annual',
      amount:   1200000,         // kobo (₦12,000)
      naira:    '₦12,000',
      days:     365,
      planCode: 'PLN_vg1odwe75m793nk',
      features: ['Everything in 3-Month', 'Post-UTME prep', 'Downloadable reports', '1-on-1 tutoring discount']
    }
  };

  const PAYSTACK_PUBLIC_KEY = 'pk_live_681bc4436b4c4249010d01795bb05f655cd470eb';

  // ── Generate unique reference ─────────────────────
  function generateRef() {
    return 'UE_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  // ── Write payment record to Supabase ─────────────
  async function recordPayment(userId, plan, reference, status) {
    const planData = PLANS[plan];
    const { error } = await window.sb.from('payments').insert({
      user_id:   userId,
      amount:    planData.amount,
      plan:      plan,
      reference: reference,
      status:    status
    });
    if (error) console.error('Payment record error:', error);
    return !error;
  }

  // ── Update profile subscription ───────────────────
  async function activateSubscription(userId, plan) {
    const planData = PLANS[plan];
    const now      = new Date();
    const expiry   = new Date(now.getTime() + planData.days * 86400000);

    const { error } = await window.sb.from('profiles').update({
      is_premium:          true,
      subscription_expiry: expiry.toISOString(),
      status:              'ACTIVE',
      auto_renew:          false
    }).eq('id', userId);

    if (error) console.error('Subscription activation error:', error);
    return !error;
  }

  // ── Update payment status to success ─────────────
  async function markPaymentSuccess(reference) {
    await window.sb.from('payments')
      .update({ status: 'success' })
      .eq('reference', reference);
  }

  // ── Main: open Paystack popup ─────────────────────
  async function openCheckout(planKey) {
    if (!window.PaystackPop) {
      showPaymentError('Payment service failed to load. Please refresh and try again.');
      return;
    }

    const plan = PLANS[planKey];
    if (!plan) {
      showPaymentError('Invalid plan selected.');
      return;
    }

    // Get current user
    const { data: { session } } = await window.sb.auth.getSession();
    if (!session) {
      // Not logged in — send to login first
      sessionStorage.setItem('ue_selected_plan', planKey);
      window.location.href = 'login.html?tab=login&next=' + encodeURIComponent('dashboard.html#pricing');
      return;
    }

    const userId    = session.user.id;
    const userEmail = session.user.email;
    const reference = generateRef();

    // Write pending record before opening popup
    await recordPayment(userId, planKey, reference, 'pending');

    // Show loading state on button
    setButtonLoading(planKey, true);

    const handler = window.PaystackPop.setup({
      key:       PAYSTACK_PUBLIC_KEY,
      email:     userEmail,
      amount:    plan.amount,
      currency:  'NGN',
      ref:       reference,
      plan:      plan.planCode,
      metadata: {
        custom_fields: [
          { display_name: 'Plan',    variable_name: 'plan',    value: plan.label },
          { display_name: 'User ID', variable_name: 'user_id', value: userId }
        ]
      },

      onSuccess: async (transaction) => {
        setButtonLoading(planKey, false);
        showPaymentModal('processing');

        // Activate subscription
        await markPaymentSuccess(reference);
        const activated = await activateSubscription(userId, planKey);

        if (activated) {
          showPaymentModal('success', plan);
          // Refresh profile cache
          window.UE_PROFILE = null;
          setTimeout(() => {
            window.location.href = 'dashboard.html';
          }, 3000);
        } else {
          showPaymentModal('error', null, 'Subscription activation failed. Contact support with ref: ' + reference);
        }
      },

      onCancel: () => {
        setButtonLoading(planKey, false);
        // Mark as failed/cancelled in DB
        window.sb.from('payments')
          .update({ status: 'failed' })
          .eq('reference', reference);
      }
    });

    handler.openIframe();
  }

  // ── Button loading states ─────────────────────────
  function setButtonLoading(planKey, loading) {
    const btn = document.querySelector(`[data-plan="${planKey}"]`);
    if (!btn) return;
    btn.disabled = loading;
    btn.innerHTML = loading
      ? '<span class="pay-spinner"></span> Opening…'
      : PLANS[planKey] ? `Subscribe — ${PLANS[planKey].naira}` : 'Subscribe';
  }

  // ── Payment result modal ──────────────────────────
  function showPaymentModal(state, plan, errorMsg) {
    // Remove existing modal
    const existing = document.getElementById('ue-pay-modal');
    if (existing) existing.remove();

    let content = '';
    if (state === 'processing') {
      content = `
        <div style="text-align:center;padding:16px 0">
          <div class="pay-spinner-lg"></div>
          <h3 style="font-size:1.3rem;margin:16px 0 8px">Confirming Payment…</h3>
          <p style="color:var(--muted,#6b7280);font-size:.9rem">Please wait while we activate your subscription.</p>
        </div>`;
    } else if (state === 'success') {
      content = `
        <div style="text-align:center;padding:16px 0">
          <div style="font-size:3.5rem;margin-bottom:12px">🎉</div>
          <h3 style="font-size:1.5rem;margin-bottom:8px">Payment Successful!</h3>
          <p style="color:#065f46;background:#d1fae5;padding:10px 16px;border-radius:8px;font-weight:600;margin-bottom:16px">
            ${plan ? plan.label : ''} Plan Activated
          </p>
          <p style="color:var(--muted,#6b7280);font-size:.9rem;margin-bottom:20px">
            Your account is now active. Redirecting to your dashboard…
          </p>
          <div class="pay-spinner-lg"></div>
        </div>`;
    } else if (state === 'error') {
      content = `
        <div style="text-align:center;padding:16px 0">
          <div style="font-size:3rem;margin-bottom:12px">⚠️</div>
          <h3 style="font-size:1.3rem;margin-bottom:8px">Something went wrong</h3>
          <p style="color:#991b1b;background:#fee2e2;padding:10px 16px;border-radius:8px;font-size:.88rem;margin-bottom:20px">
            ${errorMsg || 'An unexpected error occurred.'}
          </p>
          <button onclick="document.getElementById('ue-pay-modal').remove()"
            style="padding:10px 24px;background:#1a56ff;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer">
            Close
          </button>
        </div>`;
    }

    const modal = document.createElement('div');
    modal.id = 'ue-pay-modal';
    modal.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9000;
      display:flex;align-items:center;justify-content:center;padding:24px;
      backdrop-filter:blur(4px);
    `;
    modal.innerHTML = `
      <div style="background:#fff;border-radius:18px;padding:36px 32px;max-width:420px;width:100%;
                  box-shadow:0 24px 80px rgba(0,0,0,.25);">
        ${content}
      </div>`;
    document.body.appendChild(modal);
  }

  function showPaymentError(msg) {
    showPaymentModal('error', null, msg);
  }

  // ── Render pricing section (used on both index + dashboard) ──
  function renderPricingSection(containerId, context) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = Object.entries(PLANS).map(([key, plan]) => {
      const isFeatured  = key === 'quarterly';
      const save        = key === 'quarterly' ? 'Save 22%' : key === 'annual' ? 'Save 44%' : '';
      const featuresHTML = plan.features.map(f =>
        `<li style="display:flex;align-items:center;gap:10px;padding:6px 0;font-size:.9rem">
          <span style="color:#00c97a;font-size:1rem">✓</span> ${f}
        </li>`).join('');

      return `
        <div class="pricing-card${isFeatured ? ' featured' : ''}" style="position:relative">
          ${isFeatured ? '<div class="pricing-badge">Most Popular</div>' : ''}
          <h3 style="font-weight:700;font-size:1.15rem;margin-bottom:8px">${plan.label}</h3>
          <div class="pricing-price">${plan.naira}${key === 'monthly' ? '<span style="font-size:1rem;color:var(--muted,#6b7280)">/mo</span>' : ''}</div>
          ${save ? `<div class="pricing-save">${save}</div>` : '<div style="margin-bottom:20px"></div>'}
          <ul class="pricing-features" style="list-style:none;margin-bottom:28px">${featuresHTML}</ul>
          <button class="btn ${isFeatured ? 'btn-primary' : 'btn-outline'} btn-block"
                  data-plan="${key}"
                  onclick="PAYMENT.openCheckout('${key}')">
            Subscribe — ${plan.naira}
          </button>
        </div>`;
    }).join('');
  }

  // ── Check URL for plan pre-selection (from index.html) ──
  function checkPendingPlan() {
    const pending = sessionStorage.getItem('ue_selected_plan');
    if (pending && PLANS[pending]) {
      sessionStorage.removeItem('ue_selected_plan');
      // Small delay to ensure page + auth loaded
      setTimeout(() => openCheckout(pending), 800);
    }
  }

  // ── Get plan details (used by other modules) ──────
  function getPlan(key) { return PLANS[key] || null; }
  function getAllPlans() { return PLANS; }

  return {
    openCheckout,
    renderPricingSection,
    checkPendingPlan,
    getPlan,
    getAllPlans,
    PLANS
  };

})();

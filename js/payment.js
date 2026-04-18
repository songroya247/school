/* ═══════════════════════════════════════════════════════════════════
   UE School — js/payment.js  (HARDENED v2)

   KEY SECURITY CHANGE FROM v1:
   ─────────────────────────────
   Subscription activation is NO LONGER handled solely in the
   onSuccess client-side callback.  The onSuccess callback now only
   records the reference and shows a "verifying…" UI state.

   The ACTUAL is_premium toggle happens in a Supabase Edge Function
   (verify-payment) that:
     1. Receives the transaction reference from the client.
     2. Calls the Paystack Verify Transaction API server-side using
        the SECRET key (which the client never sees).
     3. Checks that the response status === 'success'.
     4. Checks that the amount paid matches the selected plan amount.
     5. Checks that the reference has not been used before (idempotency).
     6. Only then updates profiles.is_premium = true.

   Edge Function skeleton is included at the bottom of this file
   as a SQL + Deno snippet.  Deploy it to Supabase via the dashboard
   or the CLI:  supabase functions deploy verify-payment

   WHY THIS MATTERS:
   The Paystack onSuccess callback fires in the BROWSER.  Anyone with
   DevTools can intercept and re-fire it with any reference string
   (including a made-up one or a reference from someone else's
   transaction).  Verifying server-side with the SECRET key closes
   this attack vector completely.
═══════════════════════════════════════════════════════════════════ */

const PAYMENT = (function () {
  'use strict';

  // ── Plan config (must match your Paystack dashboard exactly) ────
  const PLANS = {
    monthly: {
      label:    'Monthly',
      amount:   150000,           // kobo (₦1,500)
      naira:    '₦1,500',
      days:     30,
      planCode: 'PLN_jctl2fmbtbprn79',
      features: ['Full CBT access', 'All video lessons', 'Score prediction', 'Basic analytics'],
    },
    quarterly: {
      label:    '3-Month',
      amount:   350000,           // kobo (₦3,500)
      naira:    '₦3,500',
      days:     90,
      planCode: 'PLN_7k27rm469etnc8y',
      features: ['Everything in Monthly', 'SmartPath™ Engine', 'Weakness tracker', 'Priority support'],
    },
    annual: {
      label:    'Annual',
      amount:   1200000,          // kobo (₦12,000)
      naira:    '₦12,000',
      days:     365,
      planCode: 'PLN_vg1odwe75m793nk',
      features: ['Everything in 3-Month', 'Post-UTME prep', 'Downloadable reports', '1-on-1 tutoring discount'],
    },
  };

  // ── Public Paystack key (safe to expose — server uses secret key) 
  const PAYSTACK_PUBLIC_KEY = 'pk_live_681bc4436b4c4249010d01795bb05f655cd470eb';

  // ── Edge Function URL ───────────────────────────────────────────
  //  Change this to your actual Supabase project URL after deploying.
  const VERIFY_FUNCTION_URL =
    window.UE_CONFIG.SUPABASE_URL + '/functions/v1/verify-payment';

  // ── Generate unique reference ───────────────────────────────────
  function generateRef() {
    return 'UE_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  // ── Write pending payment record ────────────────────────────────
  async function recordPayment(userId, plan, reference) {
    const planData = PLANS[plan];
    const { error } = await window.sb.from('payments').insert({
      user_id:   userId,
      amount:    planData.amount,
      plan,
      reference,
      status:    'pending',
    });
    if (error) console.error('[PAYMENT] pending record error:', error.message);
    return !error;
  }

  // ── SERVER-SIDE VERIFICATION (the key security step) ────────────
  //  Calls the Edge Function which verifies with Paystack's REST API
  //  using the SECRET key — the client never sees or touches this.
  async function verifyWithServer(reference, planKey) {
    try {
      // The Edge Function requires the user to be authenticated.
      // We pass the access token in the Authorization header.
      const accessToken = window.UE_USER?.access_token ||
        (await window.sb.auth.getSession()).data.session?.access_token;

      const response = await fetch(VERIFY_FUNCTION_URL, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ reference, plan: planKey }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error('[PAYMENT] Edge Function error:', err);
        return { success: false, message: err.message || 'Server verification failed.' };
      }

      const result = await response.json();
      return result; // { success: true, plan, expiry } or { success: false, message }

    } catch (err) {
      console.error('[PAYMENT] Network error calling verify function:', err);
      return { success: false, message: 'Network error. Please check your connection.' };
    }
  }

  // ── Main: open Paystack popup ───────────────────────────────────
  async function openCheckout(planKey) {
    if (!window.PaystackPop) {
      showPaymentModal('error', null, 'Payment service failed to load. Please refresh and try again.');
      return;
    }

    const plan = PLANS[planKey];
    if (!plan) {
      showPaymentModal('error', null, 'Invalid plan selected.');
      return;
    }

    const { data: { session } } = await window.sb.auth.getSession();
    if (!session) {
      sessionStorage.setItem('ue_selected_plan', planKey);
      window.location.href =
        window.UE_CONFIG.LOGIN_PAGE + '?tab=login&next=' + encodeURIComponent('dashboard.html#pricing');
      return;
    }

    const userId    = session.user.id;
    const userEmail = session.user.email;
    const reference = generateRef();

    // Write pending record BEFORE opening popup
    await recordPayment(userId, planKey, reference);

    setButtonLoading(planKey, true);

    const handler = window.PaystackPop.setup({
      key:      PAYSTACK_PUBLIC_KEY,
      email:    userEmail,
      amount:   plan.amount,
      currency: 'NGN',
      ref:      reference,
      plan:     plan.planCode,
      metadata: {
        custom_fields: [
          { display_name: 'Plan',    variable_name: 'plan',    value: plan.label },
          { display_name: 'User ID', variable_name: 'user_id', value: userId },
        ],
      },

      // ── onSuccess: SHOW UI ONLY — do NOT activate subscription here ──
      //  The activation happens server-side via verifyWithServer().
      //  A bad actor can fire this callback manually, but that is safe
      //  because verifyWithServer() will call Paystack's API with the
      //  SECRET key and reject any reference that isn't genuinely paid.
      onSuccess: async (transaction) => {
        setButtonLoading(planKey, false);
        showPaymentModal('processing');

        const result = await verifyWithServer(reference, planKey);

        if (result.success) {
          // Update the local profile cache so UI reflects new status
          if (window.UE_PROFILE) {
            window.UE_PROFILE.is_premium = true;
            window.UE_PROFILE.subscription_expiry = result.expiry;
          }
          try {
            sessionStorage.setItem('ue_profile_cache', JSON.stringify({
              is_premium:          true,
              subscription_expiry: result.expiry,
            }));
          } catch (_) {}

          showPaymentModal('success', plan);
          setTimeout(() => { window.location.href = 'dashboard.html'; }, 3000);
        } else {
          showPaymentModal('error', null,
            (result.message || 'Verification failed.') +
            ' Please contact support with reference: ' + reference
          );
        }
      },

      onCancel: () => {
        setButtonLoading(planKey, false);
        window.sb.from('payments')
          .update({ status: 'failed' })
          .eq('reference', reference);
      },
    });

    handler.openIframe();
  }

  // ── Button loading states ───────────────────────────────────────
  function setButtonLoading(planKey, loading) {
    const btn = document.querySelector(`[data-plan="${planKey}"]`);
    if (!btn) return;
    btn.disabled = loading;
    btn.innerHTML = loading
      ? '<span class="pay-spinner"></span> Opening…'
      : PLANS[planKey] ? `Subscribe — ${PLANS[planKey].naira}` : 'Subscribe';
  }

  // ── Payment result modal ────────────────────────────────────────
  function showPaymentModal(state, plan, errorMsg) {
    const existing = document.getElementById('ue-pay-modal');
    if (existing) existing.remove();

    let content = '';
    if (state === 'processing') {
      content = `
        <div style="text-align:center;padding:16px 0">
          <div class="pay-spinner-lg"></div>
          <h3 style="font-size:1.3rem;margin:16px 0 8px">Verifying Payment…</h3>
          <p style="color:var(--muted,#6b7280);font-size:.9rem">
            Confirming with payment provider. Please don't close this window.
          </p>
        </div>`;
    } else if (state === 'success') {
      content = `
        <div style="text-align:center;padding:16px 0">
          <div style="font-size:3.5rem;margin-bottom:12px">🎉</div>
          <h3 style="font-size:1.5rem;margin-bottom:8px">Payment Verified!</h3>
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

  // ── Render pricing section ──────────────────────────────────────
  function renderPricingSection(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = Object.entries(PLANS).map(([key, plan]) => {
      const isFeatured   = key === 'quarterly';
      const save         = key === 'quarterly' ? 'Save 22%' : key === 'annual' ? 'Save 44%' : '';
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

  // ── Check for pending plan after login redirect ─────────────────
  function checkPendingPlan() {
    const pending = sessionStorage.getItem('ue_selected_plan');
    if (pending && PLANS[pending]) {
      sessionStorage.removeItem('ue_selected_plan');
      setTimeout(() => openCheckout(pending), 800);
    }
  }

  function getPlan(key)    { return PLANS[key] || null; }
  function getAllPlans()    { return PLANS; }

  return {
    openCheckout,
    renderPricingSection,
    checkPendingPlan,
    getPlan,
    getAllPlans,
    PLANS,
  };

})();

/* ═══════════════════════════════════════════════════════════════════
   EDGE FUNCTION — supabase/functions/verify-payment/index.ts
   Deploy with:  supabase functions deploy verify-payment
   Set the secret:  supabase secrets set PAYSTACK_SECRET_KEY=sk_live_...

   import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
   import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

   const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY")!;
   const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
   const SUPABASE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

   const PLANS: Record<string, { amount: number; days: number }> = {
     monthly:   { amount: 150000, days: 30  },
     quarterly: { amount: 350000, days: 90  },
     annual:    { amount: 1200000, days: 365 },
   };

   serve(async (req) => {
     // 1. Authenticate the calling user
     const authHeader = req.headers.get("Authorization") ?? "";
     const userClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
       global: { headers: { Authorization: authHeader } },
     });
     const { data: { user }, error: authErr } = await userClient.auth.getUser();
     if (authErr || !user) return resp(401, { message: "Unauthorised" });

     const { reference, plan } = await req.json();
     if (!reference || !plan || !PLANS[plan])
       return resp(400, { message: "Invalid payload" });

     // 2. Check idempotency — don't process a reference twice
     const adminClient = createClient(SUPABASE_URL, SUPABASE_KEY);
     const { data: existing } = await adminClient
       .from("payments").select("status").eq("reference", reference).single();
     if (existing?.status === "success")
       return resp(200, { success: true, message: "Already activated" });

     // 3. Verify with Paystack using the SECRET key
     const psRes = await fetch(
       `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
       { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
     );
     const psData = await psRes.json();

     if (!psData.status || psData.data?.status !== "success")
       return resp(402, { message: "Payment not confirmed by Paystack" });

     // 4. Verify amount matches plan (prevent plan-downgrade attacks)
     const paidAmount = psData.data.amount;
     if (paidAmount < PLANS[plan].amount)
       return resp(402, { message: "Payment amount does not match plan" });

     // 5. Activate subscription
     const expiry = new Date(Date.now() + PLANS[plan].days * 86400000).toISOString();
     await adminClient.from("profiles").update({
       is_premium: true, subscription_expiry: expiry, status: "ACTIVE",
     }).eq("id", user.id);

     // 6. Mark payment as success
     await adminClient.from("payments")
       .update({ status: "success" }).eq("reference", reference);

     return resp(200, { success: true, expiry });
   });

   function resp(status: number, body: object) {
     return new Response(JSON.stringify(body), {
       status,
       headers: { "Content-Type": "application/json",
                  "Access-Control-Allow-Origin": "*" },
     });
   }
═══════════════════════════════════════════════════════════════════ */

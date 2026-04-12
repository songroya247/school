/**
 * UltimateEdge Paystack Controller (v3.1)
 * Handles subscription logic and plan-based billing.
 */

const PS_PUBLIC_KEY = 'pk_live_YOUR_ACTUAL_KEY'; // Replace with your key

const PS_PLANS = {
    'monthly': 'PLN_MONTHLY_CODE', // Replace with Paystack Plan Code
    '3month':  'PLN_3MONTH_CODE',  // Replace with Paystack Plan Code
    'annual':  'PLN_ANNUAL_CODE'   // Replace with Paystack Plan Code
};

async function openPaystack(planKey) {
    if (!window.currentUser) {
        window.openAuthModal('login');
        window.toast("Please log in to subscribe.");
        return;
    }

    const planCode = PS_PLANS[planKey];
    if (planCode.includes('CODE')) {
        window.toast("Payment setup incomplete. Plan codes missing.");
        return;
    }

    const handler = PaystackPop.setup({
        key: PS_PUBLIC_KEY,
        email: window.currentUser.email,
        plan: planCode,
        metadata: {
            user_id: window.currentUser.id,
            plan_type: planKey
        },
        callback: function(response) {
            handlePaymentSuccess(response, planKey);
        },
        onClose: function() {
            window.toast("Payment window closed.");
        }
    });

    handler.openIframe();
    window.trackAction('payment_initiated', { plan: planKey });
}

async function handlePaymentSuccess(response, planKey) {
    window.toast("Verifying payment...");

    // 1. Calculate new expiry
    let daysToAdd = 30;
    if (planKey === '3month') daysToAdd = 90;
    if (planKey === 'annual') daysToAdd = 365;

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + daysToAdd);

    // 2. Update Profile in Supabase
    const { error } = await window.sb.from('profiles').update({
        is_premium: true,
        subscription_expiry: expiryDate.toISOString(),
        status: 'ACTIVE',
        paystack_customer_id: response.customer_code || null
    }).eq('id', window.currentUser.id);

    // 3. Log Payment Transaction
    await window.sb.from('payments').insert([{
        user_id: window.currentUser.id,
        amount: 0, // Paystack handles actual amounts via Plan
        plan: planKey,
        reference: response.reference,
        status: 'SUCCESS'
    }]);

    if (!error) {
        window.trackAction('payment_success', { reference: response.reference });
        window.location.href = 'payment-success.html';
    } else {
        window.toast("Error updating subscription. Contact support.");
    }
}
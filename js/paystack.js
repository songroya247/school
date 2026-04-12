// Paystack Live Key (provided)
const PS_PUBLIC_KEY = 'pk_live_681bc4436b4c4249010d01795bb05f655cd470eb';

// Plan codes – you must replace these with actual Paystack Plan Codes
// Log into Paystack Dashboard → Products → Plans → create 3 plans and copy PLN_xxx
const PS_PLANS = {
  monthly: 'PLN_monthly_placeholder',   // Replace with actual
  '3month': 'PLN_3month_placeholder',   // Replace
  annual: 'PLN_annual_placeholder'      // Replace
};

async function handlePaymentSuccess(response, plan) {
  if (!currentUser) return;
  let expiry = new Date();
  if (plan === 'monthly') expiry.setDate(expiry.getDate() + 30);
  else if (plan === '3month') expiry.setDate(expiry.getDate() + 90);
  else if (plan === 'annual') expiry.setDate(expiry.getDate() + 365);

  const { error } = await sb
    .from('profiles')
    .update({
      is_premium: true,
      subscription_expiry: expiry.toISOString(),
      auto_renew: plan === 'monthly',
      subscription_status: 'ACTIVE'
    })
    .eq('id', currentUser.id);

  if (!error) {
    // Log payment
    await sb.from('payments').insert({
      user_id: currentUser.id,
      amount: plan === 'monthly' ? 1500 : plan === '3month' ? 4000 : 12000,
      plan: plan,
      reference: response.reference,
      status: 'success'
    });
    toast(`Payment successful! Premium active until ${expiry.toLocaleDateString()}`);
    await loadProfile(); // refresh profile
    updateNavUI();
  } else {
    toast('Error updating subscription. Contact support.');
  }
}

function openPaystack(plan) {
  if (!currentUser) {
    toast('Please log in first');
    openAuthModal('login');
    return;
  }
  const planCode = PS_PLANS[plan];
  if (!planCode || planCode.includes('placeholder')) {
    toast('Payment not yet configured. Please contact support.');
    return;
  }
  const handler = PaystackPop.setup({
    key: PS_PUBLIC_KEY,
    email: currentUser.email,
    plan: planCode,
    callback: (response) => handlePaymentSuccess(response, plan),
    onClose: () => toast('Payment window closed.')
  });
  handler.openIframe();
}

window.openPaystack = openPaystack;
export type RazorpayCurrency = 'INR' | 'USD';

/** India pays the rupee plan. Every other locale pays the dollar plan. */
export function razorpayCheckoutCurrency(): RazorpayCurrency {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timeZone === 'Asia/Kolkata' || timeZone === 'Asia/Calcutta') return 'INR';
    const locale = (typeof navigator !== 'undefined' && navigator.language) || '';
    if (/-IN$/i.test(locale)) return 'INR';
  } catch {
    // Unknown locale uses the dollar plan.
  }
  return 'USD';
}

export function razorpayPriceLabel(currency: RazorpayCurrency = razorpayCheckoutCurrency()): string {
  return currency === 'INR' ? '₹499' : '$5';
}

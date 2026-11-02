import { safeGetItem } from './storage';

export interface SubscriptionSnapshot {
  token?: string | null;
  isPremium?: boolean;
  subscriptionTier?: string | null;
  subscriptionExpiry?: string | Date | null;
  trialEndDate?: string | Date | null;
}

function toTime(value: string | Date | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

/**
 * Pro is only an unexpired trial or an unexpired paid period.
 * A leftover isPremium / tier flag with no end date does not unlock anything.
 */
export function accountIsPro(user: SubscriptionSnapshot | null | undefined): boolean {
  if (!user?.token) return false;
  const now = Date.now();
  if (toTime(user.trialEndDate) > now) return true;
  if (!(toTime(user.subscriptionExpiry) > now)) return false;
  const tier = user.subscriptionTier;
  return tier === 'pro' || tier === 'guardian' || user.isPremium === true;
}

export function readAccountIsPro(): boolean {
  try {
    const user = JSON.parse(safeGetItem('focus_user') || '{}');
    return accountIsPro(user);
  } catch {
    return false;
  }
}

export function normalizeTier(user: SubscriptionSnapshot | null | undefined): 'free' | 'pro' | 'guardian' {
  if (!accountIsPro(user)) return 'free';
  return user?.subscriptionTier === 'guardian' ? 'guardian' : 'pro';
}

import { safeGetItem } from './storage';

export interface SubscriptionSnapshot {
  token?: string | null;
  isPremium?: boolean;
  subscriptionTier?: string | null;
  subscriptionExpiry?: string | Date | null;
  trialEndDate?: string | Date | null;
  trialActive?: boolean;
}

function toTime(value: string | Date | null | undefined): number {
  if (value == null || value === '') return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

/**
 * Pro is only an active trial or a paid period that still has a future end date.
 * Tier / isPremium flags alone never unlock the app.
 */
export function accountIsPro(user: SubscriptionSnapshot | null | undefined): boolean {
  if (!user?.token) return false;
  const now = Date.now();

  const trialEnd = toTime(user.trialEndDate);
  if (trialEnd > now && user.trialActive !== false) return true;

  const expiry = toTime(user.subscriptionExpiry);
  if (!(expiry > now)) return false;

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

/** Map /subscription/status into a clean local user subscription block. */
export function subscriptionFromStatus(res: any, token: string | null | undefined): SubscriptionSnapshot {
  const trialActive = res?.trial?.active === true;
  const trialEnd = trialActive ? (res?.trial?.end || res?.trial?.endDate || null) : null;
  const tier = res?.tier || 'free';
  const paid = tier === 'pro' || tier === 'guardian';
  const expiry = paid && res?.expiry ? res.expiry : null;

  return {
    token: token || 'session',
    subscriptionTier: paid ? tier : 'free',
    isPremium: paid && !!res?.isPremium,
    subscriptionExpiry: expiry,
    trialEndDate: trialEnd,
    trialActive,
  };
}

/** Write Pro fields onto a focus_user object; strip stale dates when free. */
export function writeSubscriptionFields(user: any, snapshot: SubscriptionSnapshot): any {
  const isPro = accountIsPro(snapshot);
  const next = { ...user };
  next.isPremium = isPro;
  next.subscriptionTier = normalizeTier(snapshot);
  if (isPro && snapshot.subscriptionExpiry) next.subscriptionExpiry = snapshot.subscriptionExpiry;
  else delete next.subscriptionExpiry;
  if (isPro && snapshot.trialEndDate) next.trialEndDate = snapshot.trialEndDate;
  else delete next.trialEndDate;
  if (snapshot.trialActive != null) next.trialUsed = !!user.trialUsed || snapshot.trialActive;
  return next;
}

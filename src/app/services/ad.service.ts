import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Stub AdService — AdMob has been removed.
 * All methods are no-ops so existing consumers don't break.
 */
@Injectable({ providedIn: 'root' })
export class AdService {
  private adFreeSubject = new BehaviorSubject<boolean>(true);
  isAdFree$: Observable<boolean> = this.adFreeSubject.asObservable();

  rewardedAdReady = false;
  interstitialAdReady = false;
  sessionsSinceLastInterstitial = 0;

  async initialize(): Promise<void> {}

  updateAdFreeStatus(_isAdFree: boolean): void {}

  async showRewardedAd(): Promise<{ rewarded: boolean; kibbleBonus: number }> {
    return { rewarded: false, kibbleBonus: 0 };
  }

  async showInterstitialAfterSession(): Promise<void> {}

  async showDailyBonusAd(): Promise<boolean> {
    return false;
  }

  shouldShowBannerAd(): boolean {
    return false;
  }

  async showBannerAd(): Promise<void> {}

  async hideBannerAd(): Promise<void> {}

  dispose(): void {}
}

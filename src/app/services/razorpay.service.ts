import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { sessionTokenExpiresSoon } from '../utils/session-token';
import { RazorpayCurrency } from '../utils/razorpay-currency';

declare let Razorpay: any;

export interface RazorpayCheckoutResult {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

export interface RazorpayCheckoutOutcome {
  success: boolean;
  trial?: boolean;
  expiry?: string | null;
}

@Injectable({ providedIn: 'root' })
export class RazorpayService {
  private apiUrl = environment.apiUrl;
  private pendingKey = 'pending_razorpay_payment';

  constructor(private http: HttpClient) {}

  /** Loads the Razorpay JS SDK script dynamically (only once). */
  private loadScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof Razorpay !== 'undefined') {
        resolve();
        return;
      }

      const existing = document.getElementById('razorpay-sdk');
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', reject);
        return;
      }

      const script = document.createElement('script');
      script.id = 'razorpay-sdk';
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  tokenExpiresSoon(token: string | null | undefined): boolean {
    return sessionTokenExpiresSoon(token);
  }

  /** Creates a Razorpay subscription via the backend. */
  private async createSubscription(token: string, currency: RazorpayCurrency): Promise<{
    keyId: string;
    subscriptionId: string;
    trial?: boolean;
  }> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    });

    const result: any = await this.http
      .post(`${this.apiUrl}/subscription/razorpay/create`, { tier: 'pro', currency }, { headers })
      .toPromise();

    return result;
  }

  /** Verifies the payment with the backend and activates Pro. */
  async verifyPayment(
    paymentId: string,
    subscriptionId: string,
    signature: string,
    token: string,
  ): Promise<{ success: boolean; tier: string; expiry: string; trial?: boolean }> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    });

    const result: any = await this.http
      .post(
        `${this.apiUrl}/subscription/verify-razorpay`,
        { paymentId, subscriptionId, signature, tier: 'pro' },
        { headers },
      )
      .toPromise();

    return result;
  }

  /**
   * Full Razorpay checkout flow for Android.
   * Returns whether Pro was activated, and whether it started as a free trial.
   */
  async startCheckout(userInfo: { name: string; email: string; token: string; currency?: RazorpayCurrency }): Promise<RazorpayCheckoutOutcome> {
    // 1. Load the Razorpay SDK
    await this.loadScript();

    // 2. Create subscription on backend
    const currency = userInfo.currency === 'USD' ? 'USD' : 'INR';
    const { keyId, subscriptionId, trial } = await this.createSubscription(userInfo.token, currency);

    // Keep the subscription id before checkout opens. The Android success
    // callback is often lost when the payer leaves for a UPI app.
    this.savePending({ subscriptionId, savedAt: Date.now() });

    // 3. Open Razorpay Checkout
    return new Promise((resolve, reject) => {
      let settled = false;
      const releaseCheckout = this.pinCheckoutToSafeArea();
      const finish = (outcome: RazorpayCheckoutOutcome) => {
        if (settled) return;
        settled = true;
        releaseCheckout();
        resolve(outcome);
      };

      const options = {
        key: keyId,
        subscription_id: subscriptionId,
        // Checkout runs inside the app WebView. Without this, Razorpay hides UPI.
        webview_intent: true,
        name: 'StayPaws Pro',
        description: trial
          ? '7-day free trial. Payment details are saved now and charged after the trial.'
          : 'Unlimited focus sessions & premium features',
        image: 'https://pub-af1e1f15f9ef4d2e8fc1d981cbb64344.r2.dev/icons/icon-512x512.png',
        prefill: {
          name: userInfo.name || '',
          email: userInfo.email || '',
        },
        theme: { color: '#6C63FF' },
        modal: {
          ondismiss: async () => {
            releaseCheckout();
            await new Promise((done) => setTimeout(done, 1200));
            if (settled) return;
            const recovered = await this.recoverPending(userInfo.token);
            finish(recovered?.success ? recovered : { success: false });
          },
        },
        handler: async (response: RazorpayCheckoutResult) => {
          releaseCheckout();
          const paymentId = response?.razorpay_payment_id;
          const signature = response?.razorpay_signature;
          const confirmedSubscriptionId = response?.razorpay_subscription_id || subscriptionId;
          this.savePending({
            paymentId,
            subscriptionId: confirmedSubscriptionId,
            signature,
            savedAt: Date.now(),
          });
          try {
            if (paymentId && signature) {
              const result = await this.verifyPayment(
                paymentId,
                confirmedSubscriptionId,
                signature,
                userInfo.token,
              );
              if (result?.success) {
                this.clearPending();
                finish({
                  success: true,
                  trial: result.trial === true,
                  expiry: result.expiry || null,
                });
                return;
              }
            }
            const recovered = await this.recoverPending(userInfo.token);
            if (recovered?.success) {
              finish(recovered);
              return;
            }
            const pendingError = new Error('payment_pending') as Error & { paymentReceived?: boolean };
            pendingError.paymentReceived = true;
            if (!settled) {
              settled = true;
              releaseCheckout();
              reject(pendingError);
            }
          } catch (err) {
            const recovered = await this.recoverPending(userInfo.token);
            if (recovered?.success) {
              finish(recovered);
              return;
            }
            const pendingError = new Error('payment_pending') as Error & { paymentReceived?: boolean };
            pendingError.paymentReceived = true;
            if (!settled) {
              settled = true;
              releaseCheckout();
              reject(pendingError);
            }
          }
        },
      };

      const rzp = new Razorpay(options);
      rzp.on('payment.failed', (resp: any) => {
        console.error('Razorpay payment failed:', resp.error);
      });
      rzp.open();
    });
  }

  /**
   * Finish a payment Razorpay already accepted. Safe to call after login
   * and whenever the paywall opens.
   */
  async recoverPending(token: string | null | undefined): Promise<RazorpayCheckoutOutcome | null> {
    if (!token) return null;
    const pending = this.readPending();
    if (!pending) return null;

    try {
      if (pending.paymentId && pending.signature) {
        const verified = await this.verifyPayment(
          pending.paymentId,
          pending.subscriptionId,
          pending.signature,
          token,
        );
        if (verified?.success) {
          this.clearPending();
          return { success: true, trial: verified.trial === true, expiry: verified.expiry || null };
        }
      }
    } catch (err) {
      console.warn('Saved Razorpay payment could not be verified yet');
    }

    try {
      const headers = new HttpHeaders({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      });
      const result: any = await this.http
        .post(`${this.apiUrl}/subscription/razorpay/recover`, {
          subscriptionId: pending.subscriptionId,
        }, { headers })
        .toPromise();
      if (result?.success) {
        this.clearPending();
        return { success: true, trial: result.trial === true, expiry: result.expiry || null };
      }
    } catch {
      console.warn('Saved Razorpay subscription is not confirmed yet');
    }
    return null;
  }

  private savePending(pending: { paymentId?: string; subscriptionId: string; signature?: string; savedAt: number }): void {
    localStorage.setItem(this.pendingKey, JSON.stringify(pending));
  }

  private readPending(): { paymentId?: string; subscriptionId: string; signature?: string; savedAt: number } | null {
    try {
      const raw = localStorage.getItem(this.pendingKey);
      if (!raw) return null;
      const pending = JSON.parse(raw);
      if (!pending?.subscriptionId) return null;
      if (Date.now() - Number(pending.savedAt || 0) > 7 * 24 * 60 * 60 * 1000) {
        this.clearPending();
        return null;
      }
      return pending;
    } catch {
      return null;
    }
  }

  private clearPending(): void {
    localStorage.removeItem(this.pendingKey);
  }

  /** Call on logout so the next account cannot inherit a previous checkout. */
  clearPendingPayment(): void {
    this.clearPending();
  }

  /**
   * Razorpay draws its own header and footer edge to edge. Pull that frame
   * inside the status bar and gesture bar after it is inserted.
   */
  private pinCheckoutToSafeArea(): () => void {
    let closed = false;
    document.body.classList.add('razorpay-open');
    const inset = (edge: 'top' | 'right' | 'bottom' | 'left') =>
      `var(--safe-area-inset-${edge}, env(safe-area-inset-${edge}, 0px))`;

    const apply = () => {
      if (closed) return;
      document.querySelectorAll<HTMLElement>('.razorpay-container').forEach(container => {
        container.style.setProperty('position', 'fixed', 'important');
        container.style.setProperty('top', inset('top'), 'important');
        container.style.setProperty('right', inset('right'), 'important');
        container.style.setProperty('bottom', inset('bottom'), 'important');
        container.style.setProperty('left', inset('left'), 'important');
        container.style.setProperty('width', 'auto', 'important');
        container.style.setProperty('height', 'auto', 'important');
        container.querySelectorAll<HTMLElement>('iframe').forEach(frame => {
          frame.style.setProperty('position', 'absolute', 'important');
          frame.style.setProperty('top', '0', 'important');
          frame.style.setProperty('right', '0', 'important');
          frame.style.setProperty('bottom', '0', 'important');
          frame.style.setProperty('left', '0', 'important');
          frame.style.setProperty('width', '100%', 'important');
          frame.style.setProperty('height', '100%', 'important');
        });
      });
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      if (closed) return;
      closed = true;
      observer.disconnect();
      document.body.classList.remove('razorpay-open');
      const sweep = () => {
        document.querySelectorAll('.razorpay-container, .razorpay-backdrop, iframe.razorpay-checkout-frame')
          .forEach(node => node.remove());
      };
      sweep();
      window.setTimeout(sweep, 50);
      window.setTimeout(sweep, 400);
    };
  }
}

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';

declare let Razorpay: any;

export interface RazorpayCheckoutResult {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

@Injectable({ providedIn: 'root' })
export class RazorpayService {
  private apiUrl = environment.apiUrl;

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

  /** Creates a Razorpay subscription order via the backend. */
  private async createSubscription(token: string): Promise<{ keyId: string; subscriptionId: string }> {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    });

    const result: any = await this.http
      .post(`${this.apiUrl}/subscription/razorpay/create`, { tier: 'pro' }, { headers })
      .toPromise();

    return result;
  }

  /** Verifies the payment with the backend and activates Pro. */
  async verifyPayment(
    paymentId: string,
    subscriptionId: string,
    signature: string,
    token: string,
  ): Promise<{ success: boolean; tier: string; expiry: string }> {
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
   * Returns true if subscription was activated successfully.
   */
  async startCheckout(userInfo: { name: string; email: string; token: string }): Promise<boolean> {
    // 1. Load the Razorpay SDK
    await this.loadScript();

    // 2. Create subscription on backend
    const { keyId, subscriptionId } = await this.createSubscription(userInfo.token);

    // 3. Open Razorpay Checkout
    return new Promise((resolve, reject) => {
      const options = {
        key: keyId,
        subscription_id: subscriptionId,
        name: 'StayPaws Pro',
        description: 'Unlimited focus sessions & premium features',
        image: 'https://staypaws.zavvi.co.in/assets/icon/icon.png',
        prefill: {
          name: userInfo.name || '',
          email: userInfo.email || '',
        },
        theme: { color: '#6C63FF' },
        modal: {
          ondismiss: () => resolve(false),
        },
        handler: async (response: RazorpayCheckoutResult) => {
          try {
            const result = await this.verifyPayment(
              response.razorpay_payment_id,
              response.razorpay_subscription_id,
              response.razorpay_signature,
              userInfo.token,
            );
            resolve(result?.success === true);
          } catch (err) {
            reject(err);
          }
        },
      };

      const rzp = new Razorpay(options);
      rzp.on('payment.failed', (resp: any) => {
        console.error('Razorpay payment failed:', resp.error);
        resolve(false);
      });
      rzp.open();
    });
  }
}

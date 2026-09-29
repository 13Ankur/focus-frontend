import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  IonContent,
  IonIcon,
  IonSpinner,
  ToastController,
  AlertController,
  NavController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { close, checkmarkCircle } from 'ionicons/icons';
import { trigger, transition, style, animate } from '@angular/animations';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Capacitor } from '@capacitor/core';
import { environment } from '../../../environments/environment';
import { safeSetItem } from '../../utils/storage';
import { RevenueCatService } from '../../services/revenue-cat.service';

type Trigger = 'session_limit' | 'timer_lock' | 'breed_lock' | 'sound_lock' | 'app_block' | 'generic';

const HEADLINES: Record<Trigger, string> = {
  session_limit: '🐾 Keep {breed} Happy & Focused!',
  timer_lock:    '⏱ Unlock Longer Focus Sessions',
  breed_lock:    '🐕 Unlock All Dog Breeds',
  sound_lock:    '🎵 Focus Better with Ambient Sounds',
  app_block:     '🔒 Block Distracting Apps',
  generic:       '🚀 Supercharge Your Focus',
};

@Component({
  selector: 'app-paywall',
  templateUrl: './paywall.page.html',
  styleUrls: ['./paywall.page.scss'],
  standalone: true,
  imports: [CommonModule, IonContent, IonIcon, IonSpinner],
  animations: [
    trigger('slideUp', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(30px)' }),
        animate('400ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
    ]),
  ],
})
export class PaywallPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  triggerContext: Trigger = 'generic';
  breedName = 'Your Buddy';
  returnUrl = '/tabs/home';
  headline = HEADLINES.generic;

  billingPeriod: 'monthly' | 'annual' = 'monthly';
  selectedPlan: 'pro' = 'pro';
  trialAvailable = true;
  loading = false;

  /** True when running inside iOS / Android (use RevenueCat IAP) */
  isNative = Capacitor.isNativePlatform();

  proFeatures = [
    'Unlimited focus sessions',
    'Custom & long focus timer (5–120 min)',
    'All dog breeds unlocked',
    'Focus sounds & ambient audio',
    'App blocking during sessions',
    'Full analytics & insights',
    'Ad-free experience',
    'Weekly streak shield',
  ];

  private apiUrl = environment.apiUrl;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private navCtrl: NavController,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private http: HttpClient,
    private revenueCatService: RevenueCatService
  ) {
    addIcons({ close, checkmarkCircle });
  }

  ngOnInit() {
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.triggerContext = (params['trigger'] as Trigger) || 'generic';
      this.breedName = params['breedName'] || 'Your Buddy';
      this.returnUrl = params['returnUrl'] || '/tabs/home';

      const template = HEADLINES[this.triggerContext] || HEADLINES.generic;
      this.headline = template.replace('{breed}', this.breedName);
    });

    this.checkTrialStatus();
    this.checkAlreadySubscribed();
  }

  ionViewWillEnter() {
    this.checkAlreadySubscribed();
  }

  // ── Actions ──

  /**
   * Primary subscribe action.
   * Native platforms → RevenueCat's native IAP paywall (Apple / Google IAP).
   * Web → Razorpay checkout (allowed by Apple guidelines since it's not on device).
   */
  async onSubscribe() {
    if (this.isNative) {
      await this.subscribeViaNativeIAP();
    } else {
      await this.subscribeViaRazorpay();
    }
  }

  /**
   * Native IAP flow — uses RevenueCat's managed paywall.
   * Apple & Google handle billing; RevenueCat webhook tells our backend.
   */
  private async subscribeViaNativeIAP() {
    this.loading = true;
    try {
      await this.revenueCatService.presentPaywall();

      // After paywall dismissal, check if they are now pro
      if (this.revenueCatService.isProSync) {
        // Sync local cache so the rest of the app picks it up
        const user = this.getLocalUser();
        user.isPremium = true;
        user.subscriptionTier = 'pro';
        safeSetItem('focus_user', JSON.stringify(user));

        await this.showToast('Welcome to Pro! 🎉', 'success');
        this.router.navigateByUrl(this.returnUrl);
      }
    } catch (err) {
      console.error('Native IAP error:', err);
      await this.showToast('Could not complete purchase. Please try again.', 'danger');
    } finally {
      this.loading = false;
    }
  }

  /**
   * Web-only flow — Razorpay subscription checkout.
   * Only used when the app is running in a browser (not on iOS / Android).
   */
  private async subscribeViaRazorpay() {
    this.loading = true;

    try {
      const headers = this.getAuthHeaders();
      const tier = 'pro';
      const createRes: any = await this.http
        .post(`${this.apiUrl}/subscription/razorpay/create`, { tier }, { headers })
        .toPromise();

      if (!createRes?.subscriptionId) {
        throw new Error('Could not start checkout. Please try again.');
      }

      const user = this.getLocalUser();
      const options = {
        key: createRes.keyId || environment.razorpayKeyId,
        subscription_id: createRes.subscriptionId,
        name: 'StayPaws',
        description: 'StayPaws Pro Monthly Plan',
        image: 'assets/icon/favicon.png',
        prefill: {
          name: user?.username || 'Focus Member',
          email: user?.email || '',
        },
        theme: {
          color: '#7ED321',
        },
        handler: async (response: any) => {
          console.log('Razorpay Payment Response:', response);
          try {
            const verifyRes: any = await this.http
              .post(
                `${this.apiUrl}/subscription/verify-razorpay`,
                {
                  paymentId: response.razorpay_payment_id,
                  subscriptionId: response.razorpay_subscription_id || createRes.subscriptionId,
                  signature: response.razorpay_signature,
                  tier,
                },
                { headers },
              )
              .toPromise();

            user.isPremium = true;
            user.subscriptionTier = verifyRes?.tier || tier;
            if (verifyRes?.expiry) {
              user.subscriptionExpiry = verifyRes.expiry;
            }
            safeSetItem('focus_user', JSON.stringify(user));

            await this.showToast('Welcome to Pro! 🎉', 'success');
            this.router.navigateByUrl(this.returnUrl);
          } catch (verifyErr) {
            console.error('Razorpay verification failed:', verifyErr);
            await this.showToast('Payment verification pending. Please refresh.', 'warning');
          } finally {
            this.loading = false;
          }
        },
        modal: {
          ondismiss: () => {
            this.loading = false;
          },
        },
      };

      if ((window as any).Razorpay) {
        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      } else {
        throw new Error('Razorpay SDK not loaded. Check your internet connection.');
      }
    } catch (err: any) {
      console.error('Subscription Error:', err);
      const message =
        err?.error?.message ||
        err?.message ||
        'We couldn\'t process your subscription. Please try again.';
      const alert = await this.alertCtrl.create({
        header: 'Subscription Failed',
        message,
        buttons: ['OK'],
      });
      await alert.present();
      this.loading = false;
    }
  }

  async onStartTrial() {
    this.selectedPlan = 'pro';
    this.loading = true;

    try {
      const headers = this.getAuthHeaders();
      await this.http.post(`${this.apiUrl}/subscription/start-trial`, {}, { headers }).toPromise();

      const user = this.getLocalUser();
      user.isPremium = true;
      user.subscriptionTier = 'pro';
      user.trialUsed = true;
      safeSetItem('focus_user', JSON.stringify(user));

      const alert = await this.alertCtrl.create({
        header: '🎉 Trial Started!',
        message: 'Your 7-day Pro trial has started. Enjoy unlimited focus sessions!',
        buttons: [{ text: 'Let\'s Go!', handler: () => this.router.navigateByUrl(this.returnUrl) }],
        backdropDismiss: false,
      });
      await alert.present();
    } catch (err: any) {
      const status = err?.status;
      if (status === 409) {
        this.trialAvailable = false;
        await this.showToast('You\'ve already used your free trial', 'warning');
      } else {
        await this.showToast('Could not start trial. Please try again.', 'danger');
      }
    } finally {
      this.loading = false;
    }
  }

  async onRestore() {
    this.loading = true;

    try {
      const success = await this.revenueCatService.restorePurchases();
      
      if (success && this.revenueCatService.isProSync) {
        await this.showToast('Subscription restored!', 'success');
        this.dismiss();
      } else {
        const alert = await this.alertCtrl.create({
          header: 'No Subscription Found',
          message: 'We couldn\'t find an active subscription for your account.',
          buttons: ['OK'],
        });
        await alert.present();
      }
    } catch (err) {
      await this.showToast('Could not restore purchases. Check your connection.', 'danger');
    } finally {
      this.loading = false;
    }
  }

  dismiss() {
    if (this.returnUrl) {
      this.router.navigateByUrl(this.returnUrl);
    } else {
      this.navCtrl.back();
    }
  }

  openTerms() {
    this.router.navigate(['/terms']);
  }

  openPrivacy() {
    this.router.navigate(['/privacy-policy']);
  }

  onHeroImgError(event: Event) {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  // ── Private helpers ──

  private async checkTrialStatus() {
    try {
      const headers = this.getAuthHeaders();
      const res: any = await this.http.get(`${this.apiUrl}/subscription/status`, { headers }).toPromise();
      this.trialAvailable = !res?.trial?.used;
    } catch {
      // Offline fallback — assume trial available
      const user = this.getLocalUser();
      this.trialAvailable = !user?.trialUsed;
    }
  }

  private async checkAlreadySubscribed() {
    // Keep paywall visible so user can select/view options
  }

  private getAuthHeaders(): HttpHeaders {
    const user = this.getLocalUser();
    return new HttpHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user?.token || ''}`,
    });
  }

  private getLocalUser(): any {
    try {
      return JSON.parse(localStorage.getItem('focus_user') || '{}');
    } catch {
      return {};
    }
  }

  private async showToast(message: string, color: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      position: 'top',
      color,
    });
    await toast.present();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

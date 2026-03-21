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
import { environment } from '../../../environments/environment';

type Trigger = 'session_limit' | 'timer_lock' | 'breed_lock' | 'sound_lock' | 'app_block' | 'generic';

const HEADLINES: Record<Trigger, string> = {
  session_limit: '🐾 {breed} is Still Hungry!',
  timer_lock:    '⏱ Unlock Longer Focus Sessions',
  breed_lock:    '🐕 Unlock All 9 Dog Breeds',
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

  billingPeriod: 'monthly' | 'annual' = 'annual';
  selectedPlan: 'pro' | 'guardian' = 'pro';
  trialAvailable = true;
  loading = false;

  proFeatures = [
    'Unlimited focus sessions',
    'Custom timer (5–120 min)',
    'All 9 dog breeds',
    'Focus sounds & ambience',
    'App blocking during sessions',
    'Full analytics & insights',
    'Ad-free experience',
    'Weekly streak shield',
  ];

  guardianFeatures = [
    'Everything in Pro',
    '100 extra shelter meals/month',
    'Exclusive gold dog skins',
    '3 Guardian-only breeds',
    'Monthly shelter impact video',
    'Guardian badge on profile',
    'Priority support',
  ];

  private apiUrl = environment.apiUrl;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private navCtrl: NavController,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private http: HttpClient,
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

  async onSubscribe(tier: 'pro' | 'guardian') {
    this.selectedPlan = tier;
    this.loading = true;

    try {
      // RevenueCat / IAP integration placeholder
      // In production, this would call Capacitor RevenueCat plugin
      await this.showToast(`${tier === 'pro' ? 'Pro' : 'Guardian Angel'} subscription started!`, 'success');
      this.router.navigateByUrl(this.returnUrl);
    } catch (err: any) {
      if (err?.userCancelled) {
        // User cancelled — stay on page
      } else {
        const alert = await this.alertCtrl.create({
          header: 'Something went wrong',
          message: 'We couldn\'t process your subscription. Please try again.',
          buttons: [
            { text: 'Cancel', role: 'cancel' },
            { text: 'Retry', handler: () => this.onSubscribe(tier) },
          ],
        });
        await alert.present();
      }
    } finally {
      this.loading = false;
    }
  }

  async onStartTrial() {
    this.selectedPlan = 'pro';
    this.loading = true;

    try {
      const headers = this.getAuthHeaders();
      await this.http.post(`${this.apiUrl}/subscription/start-trial`, {}, { headers }).toPromise();

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
      // RevenueCat restore placeholder
      // In production: await Purchases.restorePurchases()
      const headers = this.getAuthHeaders();
      const res: any = await this.http.get(`${this.apiUrl}/subscription/status`, { headers }).toPromise();

      if (res?.tier && res.tier !== 'free') {
        await this.showToast('Subscription restored!', 'success');
        this.navCtrl.back();
      } else {
        const alert = await this.alertCtrl.create({
          header: 'No Subscription Found',
          message: 'We couldn\'t find an active subscription for your account.',
          buttons: ['OK'],
        });
        await alert.present();
      }
    } catch {
      await this.showToast('Could not restore purchases. Check your connection.', 'danger');
    } finally {
      this.loading = false;
    }
  }

  dismiss() {
    this.navCtrl.back();
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
    try {
      const headers = this.getAuthHeaders();
      const res: any = await this.http.get(`${this.apiUrl}/subscription/status`, { headers }).toPromise();
      if (res?.tier && res.tier !== 'free') {
        this.navCtrl.back();
      }
    } catch {
      // ignore
    }
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

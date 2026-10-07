import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent,
  IonIcon,
  IonSpinner,
  ToastController,
  AlertController,
  NavController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { close, cartOutline } from 'ionicons/icons';
import { trigger, transition, style, animate } from '@angular/animations';
import { Subscription } from 'rxjs';
import { StatsService } from '../../services/stats.service';
import { AuthService } from '../../services/auth.service';
import { RevenueCatService } from '../../services/revenue-cat.service';

export interface KibblePack {
  id: string;
  /** RevenueCat / App Store product identifier for this consumable */
  storeProductId: string;
  name: string;
  icon: string;
  kibble: number;
  bonus: number;
  price: string;
  badge: string | null;
  badgeClass: string;
}

const PACKS: KibblePack[] = [
  {
    id: 'kibble_snack',
    storeProductId: 'staypaws_kibble_100',
    name: 'Snack Pack',
    icon: '🦴',
    kibble: 100,
    bonus: 0,
    price: '$0.99',
    badge: null,
    badgeClass: '',
  },
  {
    id: 'kibble_meal',
    storeProductId: 'staypaws_kibble_500',
    name: 'Meal Pack',
    icon: '🍖',
    kibble: 500,
    bonus: 50,
    price: '$3.99',
    badge: 'Popular',
    badgeClass: 'popular',
  },
  {
    id: 'kibble_feast',
    storeProductId: 'staypaws_kibble_1200',
    name: 'Feast Pack',
    icon: '🥩',
    kibble: 1500,
    bonus: 300,
    price: '$9.99',
    badge: 'Best Value',
    badgeClass: 'best-value',
  },
  {
    id: 'kibble_king',
    storeProductId: 'staypaws_kibble_3000',
    name: 'Kibble King',
    icon: '👑',
    kibble: 5000,
    bonus: 1500,
    price: '$24.99',
    badge: '👑 VIP',
    badgeClass: 'vip',
  },
];

@Component({
  selector: 'app-kibble-store',
  templateUrl: './kibble-store.page.html',
  styleUrls: ['./kibble-store.page.scss'],
  standalone: true,
  imports: [CommonModule, IonContent, IonIcon, IonSpinner],
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(16px)' }),
        animate('350ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
    ]),
    trigger('kibbleRain', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.3)' }),
        animate('500ms cubic-bezier(.17,.67,.35,1.4)', style({ opacity: 1, transform: 'scale(1)' })),
      ]),
      transition(':leave', [
        animate('400ms ease-in', style({ opacity: 0, transform: 'translateY(-30px)' })),
      ]),
    ]),
  ],
})
export class KibbleStorePage implements OnInit, OnDestroy {
  packs = PACKS;
  kibbleBalance = 0;
  purchasingPackId: string | null = null;
  showCelebration = false;
  celebrationKibble = 0;

  private subscriptions: Subscription[] = [];

  constructor(
    private router: Router,
    private navCtrl: NavController,
    private toastCtrl: ToastController,
    private alertCtrl: AlertController,
    private statsService: StatsService,
    private authService: AuthService,
    private revenueCatService: RevenueCatService,
  ) {
    addIcons({ close, cartOutline });
  }

  ngOnInit(): void {
    this.loadBalance();

    const sub = this.statsService.stats$.subscribe(stats => {
      this.kibbleBalance = stats.totalKibble;
    });
    this.subscriptions.push(sub);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
  }

  ionViewWillEnter(): void {
    this.loadBalance();
  }

  dismiss(): void {
    this.navCtrl.back();
  }

  totalKibble(pack: KibblePack): number {
    return pack.kibble + pack.bonus;
  }

  async purchasePack(pack: KibblePack): Promise<void> {
    if (this.purchasingPackId) return;
    this.purchasingPackId = pack.id;

    try {
      // ── Native IAP via RevenueCat ──
      // The actual kibble crediting happens server-side via the
      // RevenueCat NON_RENEWING_PURCHASE webhook.
      const result = await this.revenueCatService.purchaseProduct(pack.storeProductId);

      if (result.cancelled) {
        // User dismissed the payment sheet — no error needed
        return;
      }
      if (!result.success) {
        throw new Error('Purchase could not be completed.');
      }

      // Purchase succeeded — webhook will credit kibble server-side.
      // Update the local balance optimistically so the UI feels instant.
      this.kibbleBalance += this.totalKibble(pack);
      this.authService.updateLocalKibble(this.totalKibble(pack));

      // Show celebration
      this.celebrationKibble = this.totalKibble(pack);
      this.showCelebration = true;
      setTimeout(() => (this.showCelebration = false), 3000);

      await this.showToast(`+${this.totalKibble(pack)} kibble added!`, 'success');
    } catch (err: any) {
      if (err?.userCancelled) return;

      const alert = await this.alertCtrl.create({
        header: 'Purchase Failed',
        message: 'We couldn\'t complete your purchase. Please try again.',
        buttons: [
          { text: 'Cancel', role: 'cancel' },
          { text: 'Retry', handler: () => this.purchasePack(pack) },
        ],
      });
      await alert.present();
    } finally {
      this.purchasingPackId = null;
    }
  }

  // ── Private ──

  private loadBalance(): void {
    const user = this.authService.currentUser;
    if (user) {
      this.kibbleBalance = user.kibble || user.totalKibble || 0;
    }
  }

  private async showToast(message: string, color: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2500,
      position: 'top',
      color,
    });
    await toast.present();
  }
}

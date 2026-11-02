import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonIcon, IonSpinner, AlertController, ToastController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBack, trophy, checkmarkCircle } from 'ionicons/icons';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { trigger, transition, style, animate } from '@angular/animations';

import { environment } from '../../../environments/environment';
import { StatsService } from '../../services/stats.service';
import { BreedService } from '../../services/breed.service';

interface AchievementItem {
  id: string;
  name: string;
  desc: string;
  icon: string;
  kibble: number;
  category: string;
  tier?: 'free' | 'pro';
  proLocked?: boolean;
  unlocked: boolean;
  claimed: boolean;
  unlockedAt: string | null;
  progress: { current: number; target: number; percent: number } | null;
}

@Component({
  selector: 'app-achievements',
  standalone: true,
  imports: [CommonModule, IonContent, IonIcon, IonSpinner],
  templateUrl: './achievements.page.html',
  styleUrls: ['./achievements.page.scss'],
  animations: [
    trigger('claimPop', [
      transition(':enter', [
        style({ transform: 'scale(0.5)', opacity: 0 }),
        animate('400ms cubic-bezier(0.34, 1.56, 0.64, 1)', style({ transform: 'scale(1)', opacity: 1 })),
      ]),
    ]),
  ],
})
export class AchievementsPage implements OnInit {

  achievements: AchievementItem[] = [];
  loading = true;
  claiming: string | null = null;
  showCelebration = false;
  celebrationAchievement: AchievementItem | null = null;

  unlockedCount = 0;
  totalCount = 0;
  unclaimedCount = 0;
  isPro = false;

  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private router: Router,
    private alertController: AlertController,
    private toastController: ToastController,
    private statsService: StatsService,
    private breedService: BreedService,
  ) {
    addIcons({ arrowBack, trophy, checkmarkCircle });
  }

  ngOnInit(): void {
    this.isPro = this.localIsPro();
    this.loadAchievements();
  }

  get freeAchievements(): AchievementItem[] {
    return this.achievements.filter(a => !this.isProAchievement(a));
  }

  get proAchievements(): AchievementItem[] {
    return this.achievements.filter(a => this.isProAchievement(a));
  }

  isProAchievement(achievement: AchievementItem): boolean {
    return achievement.tier === 'pro' || achievement.id.startsWith('pro_');
  }

  isProLocked(achievement: AchievementItem): boolean {
    return this.isProAchievement(achievement) && !this.isPro;
  }

  ionViewWillEnter(): void {
    this.loadAchievements();
  }

  // ── Data loading ──

  async loadAchievements(): Promise<void> {
    this.loading = true;
    try {
      const headers = this.getAuthHeaders();
      const res: any = await this.http.get(`${this.apiUrl}/achievements`, { headers }).toPromise();
      this.achievements = this.sortAchievements(res.achievements || []);
      const claimable = this.achievements.filter(a => a.unlocked && !a.claimed && !this.isProLocked(a));
      this.unlockedCount = this.achievements.filter(a => a.unlocked && !this.isProLocked(a)).length;
      this.totalCount = this.achievements.length;
      this.unclaimedCount = claimable.length;
    } catch {
      this.achievements = [];
    }
    this.loading = false;
  }

  // ── Sorting ──

  private sortAchievements(list: AchievementItem[]): AchievementItem[] {
    return list.sort((a, b) => {
      if (a.unlocked && !a.claimed && !(b.unlocked && !b.claimed)) return -1;
      if (b.unlocked && !b.claimed && !(a.unlocked && !a.claimed)) return 1;
      if (a.unlocked && a.claimed && !b.unlocked) return -1;
      if (b.unlocked && b.claimed && !a.unlocked) return 1;
      if (!a.unlocked && !b.unlocked) {
        const ap = a.progress?.percent || 0;
        const bp = b.progress?.percent || 0;
        return bp - ap;
      }
      return 0;
    });
  }

  // ── Computed ──

  get progressPercent(): number {
    if (this.totalCount === 0) return 0;
    return Math.round((this.unlockedCount / this.totalCount) * 100);
  }

  // ── Claim ──

  async claimAchievement(achievement: AchievementItem): Promise<void> {
    if (this.isProLocked(achievement)) {
      this.router.navigate(['/paywall'], { queryParams: { trigger: 'generic', returnUrl: '/achievements' } });
      return;
    }
    if (!achievement.unlocked || achievement.claimed || this.claiming) return;

    this.claiming = achievement.id;
    try {
      const headers = this.getAuthHeaders();
      const res: any = await this.http
        .post(`${this.apiUrl}/achievements/claim`, { achievementId: achievement.id }, { headers })
        .toPromise();

      achievement.claimed = true;
      this.unclaimedCount = Math.max(0, this.unclaimedCount - 1);

      if (res?.totalKibble != null) {
        this.statsService.setTotalKibble(res.totalKibble);
      } else {
        const awarded = Number(res?.kibbleAwarded ?? achievement.kibble);
        if (awarded > 0) this.statsService.addKibble(awarded);
      }
      this.breedService.updateKibble(this.statsService.totalKibble);

      this.celebrationAchievement = achievement;
      this.showCelebration = true;

      setTimeout(() => {
        this.showCelebration = false;
        this.celebrationAchievement = null;
      }, 2500);

      if (res?.newBreedUnlocked) {
        setTimeout(async () => {
          const alert = await this.alertController.create({
            header: '🎉 New Breed Unlocked!',
            message: `Your achievement kibble unlocked the ${res.newBreedUnlocked}!`,
            buttons: [
              { text: 'Go to Kennel', handler: () => this.router.navigate(['/tabs/kennel']) },
              { text: 'Continue', role: 'cancel' },
            ],
          });
          await alert.present();
        }, 2600);
      }
    } catch {
      const toast = await this.toastController.create({
        message: 'Failed to claim. Try again.',
        duration: 2000,
        position: 'top',
        color: 'danger',
      });
      await toast.present();
    }
    this.claiming = null;
  }

  // ── Navigation ──

  goBack(): void {
    this.router.navigate(['/tabs/profile']);
  }

  // ── Helpers ──

  private localIsPro(): boolean {
    try {
      const user = JSON.parse(localStorage.getItem('focus_user') || '{}');
      const tier = user?.subscriptionTier;
      const isPro = user?.isPremium === true || tier === 'pro' || tier === 'guardian';
      if (!isPro) return false;
      const expiry = user?.subscriptionExpiry ? new Date(user.subscriptionExpiry) : null;
      const trialEnd = user?.trialEndDate ? new Date(user.trialEndDate) : null;
      const now = new Date();
      if (trialEnd && trialEnd > now) return true;
      if (expiry && expiry <= now) return false;
      return true;
    } catch {
      return false;
    }
  }

  private getAuthHeaders(): HttpHeaders {
    try {
      const user = JSON.parse(localStorage.getItem('focus_user') || '{}');
      return new HttpHeaders({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user?.token || ''}`,
      });
    } catch {
      return new HttpHeaders({ 'Content-Type': 'application/json' });
    }
  }
}

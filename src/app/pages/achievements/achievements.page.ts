import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonIcon, IonSpinner, AlertController, ToastController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBack, trophy, checkmarkCircle } from 'ionicons/icons';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { trigger, transition, style, animate } from '@angular/animations';

import { environment } from '../../../environments/environment';

interface AchievementItem {
  id: string;
  name: string;
  desc: string;
  icon: string;
  kibble: number;
  category: string;
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

  private apiUrl = environment.apiUrl;

  constructor(
    private http: HttpClient,
    private router: Router,
    private alertController: AlertController,
    private toastController: ToastController,
  ) {
    addIcons({ arrowBack, trophy, checkmarkCircle });
  }

  ngOnInit(): void {
    this.loadAchievements();
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
      this.unlockedCount = res.summary?.unlocked || 0;
      this.totalCount = res.summary?.total || 0;
      this.unclaimedCount = res.summary?.unclaimed || 0;
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
    if (!achievement.unlocked || achievement.claimed || this.claiming) return;

    this.claiming = achievement.id;
    try {
      const headers = this.getAuthHeaders();
      const res: any = await this.http
        .post(`${this.apiUrl}/achievements/claim`, { achievementId: achievement.id }, { headers })
        .toPromise();

      achievement.claimed = true;
      this.unclaimedCount = Math.max(0, this.unclaimedCount - 1);

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

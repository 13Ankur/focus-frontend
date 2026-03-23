import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent,
  IonIcon,
  AlertController,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  settingsOutline,
  arrowForward,
  flameOutline,
  timeOutline,
  trophyOutline,
  calendarOutline,
  lockClosed,
  shieldCheckmark,
} from 'ionicons/icons';
import { Subscription } from 'rxjs';
import { HttpClient, HttpHeaders } from '@angular/common/http';

import { AuthService } from '../../services/auth.service';
import { StatsService, UserStats, DailyStats } from '../../services/stats.service';
import { BreedService } from '../../services/breed.service';
import { AdService } from '../../services/ad.service';
import { environment } from '../../../environments/environment';
import { safeGetItem } from '../../utils/storage';

type TimePeriod = 'today' | 'week' | 'month' | 'all';
type UserTier = 'free' | 'pro' | 'guardian';

interface DayActivity {
  label: string;
  minutes: number;
  sessions: number;
  isToday: boolean;
  date: string;
}

interface CalendarDay {
  date: string;
  minutes: number;
  sessions: number;
  goalMet: boolean;
  dayOfMonth: number;
}

interface TagItem {
  tag: string;
  minutes: number;
  sessions: number;
  percent: number;
  icon: string;
}

interface Insight {
  type: string;
  text: string;
  change?: number;
  score?: number;
  rate?: number;
  minutes?: number;
  tag?: string;
}

const LEVEL_TITLES: Record<number, string> = {
  1: 'Puppy Trainer',
  2: 'Focus Apprentice',
  3: 'Concentration Coach',
  5: 'Focus Master',
  10: 'Deep Work Guru',
  20: 'Legendary Focuser',
};

const TAG_ICONS: Record<string, string> = {
  study: '📚',
  work: '💼',
  reading: '📖',
  exercise: '🏃',
  meditation: '🧘',
  creative: '🎨',
  other: '📌',
  untagged: '📝',
};

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, IonContent, IonIcon],
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
})
export class ProfilePage implements OnInit, OnDestroy {

  userName = 'Focus Champion';
  userLevel = 1;
  userTier: UserTier = 'guardian';
  isPro = true;

  selectedPeriod: TimePeriod = 'week';

  displayStats = {
    focusTime: '0 min',
    sessions: 0,
    kibble: 0,
    meals: 0,
    avgPerDay: '0 min',
  };

  totalFocusTime = '0 min';
  totalFocusMinutes = 0;
  totalMeals = 0;
  totalKibble = 0;
  currentStreak = 0;
  longestStreak = 0;
  totalSessions = 0;
  globalMeals = 0;

  weeklyData: DayActivity[] = [];
  maxMinutes = 1;
  selectedDay: DayActivity | null = null;

  unlockedBreeds = 1;
  totalBreeds = 9;
  achievementCount = 0;
  totalAchievements = 22;

  // Daily goal progress
  dailyGoal = 60;
  dailyMinutes = 0;

  // Level
  levelProgress = 0;
  levelTitle = 'Puppy Trainer';
  nextLevelMinutes = 600;

  tagBreakdown: TagItem[] = [];
  insights: Insight[] = [];

  // Streak calendar
  streakCalendar: CalendarDay[] = [];

  // Streak shield
  shieldAvailable = false;
  shieldNextDate = '';
  shieldLoading = false;

  Math = Math;
  private apiUrl = environment.apiUrl;
  private subscriptions: Subscription[] = [];

  constructor(
    private authService: AuthService,
    private statsService: StatsService,
    private breedService: BreedService,
    private adService: AdService,
    private http: HttpClient,
    private router: Router,
    private alertController: AlertController,
    private toastController: ToastController,
  ) {
    addIcons({
      settingsOutline, arrowForward, flameOutline, timeOutline,
      trophyOutline, calendarOutline, lockClosed, shieldCheckmark,
    });
  }

  ngOnInit(): void {
    const userSub = this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.userName = user.username || 'Focus Champion';
      }
    });
    this.subscriptions.push(userSub);

    this.loadUserData();

    const statsSub = this.statsService.stats$.subscribe(() => {
      this.loadLocalStats();
    });
    this.subscriptions.push(statsSub);

    const breedSub = this.breedService.collection$.subscribe(col => {
      this.unlockedBreeds = col.unlockedBreeds.length;
    });
    this.subscriptions.push(breedSub);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
  }

  ionViewWillEnter(): void {
    this.loadUserData();
    this.loadLocalStats();
    this.unlockedBreeds = this.breedService.collection.unlockedBreeds.length;
    this.totalBreeds = this.breedService.allBreeds.length;
    this.adService.showBannerAd();
    this.fetchServerStats();
    this.fetchAchievementCount();
  }

  ionViewWillLeave(): void {
    this.adService.hideBannerAd();
  }

  // ── User data ──

  private loadUserData(): void {
    const user = this.authService.currentUser;
    if (user) {
      this.userName = user.username || 'Focus Champion';
    }
    this.loadDailyGoal();
  }

  private loadDailyGoal(): void {
    const stored = safeGetItem('paws_daily_goal');
    if (stored) {
      const parsed = parseInt(stored, 10);
      this.dailyGoal = isNaN(parsed) ? 60 : (parsed ?? 60);
    }
  }

  // ── Local stats ──

  private loadLocalStats(): void {
    const stats = this.statsService.stats;

    this.totalFocusTime = this.statsService.formattedTotalFocusTime;
    this.totalFocusMinutes = stats.totalFocusMinutes;
    this.totalMeals = stats.totalMealsProvided;
    this.totalKibble = stats.totalKibble;
    this.currentStreak = stats.currentStreak;
    this.longestStreak = stats.longestStreak;
    this.totalSessions = stats.completedSessions;
    this.globalMeals = this.statsService.globalMeals;

    this.calculateLevel();

    this.weeklyData = this.statsService.getDailyChartData(7).map((d, i) => {
      const dt = new Date();
      dt.setDate(dt.getDate() - (6 - i));
      const dateStr = dt.toISOString().split('T')[0];
      return { ...d, sessions: 0, date: dateStr };
    });
    this.maxMinutes = Math.max(...this.weeklyData.map(d => d.minutes), 1);

    const today = this.statsService.getTodayStats();
    this.dailyMinutes = today.focusMinutes;

    this.updatePeriodStats();
  }

  // ── Server stats ──

  private async fetchServerStats(): Promise<void> {
    try {
      const headers = this.getAuthHeaders();
      const res: any = await this.http
        .get(`${this.apiUrl}/stats?dailyGoal=${this.dailyGoal}`, { headers })
        .toPromise();

      if (!res) return;

      this.userTier = 'guardian';
      this.isPro = true;

      if (res.allTime) {
        this.currentStreak = res.allTime.currentStreak ?? this.currentStreak;
        this.longestStreak = res.allTime.longestStreak ?? this.longestStreak;
        this.totalKibble = res.allTime.totalKibble ?? this.totalKibble;
        this.totalFocusMinutes = res.allTime.totalFocusMinutes ?? this.totalFocusMinutes;
        this.totalFocusTime = this.statsService.formatFocusTime(this.totalFocusMinutes);
        this.totalMeals = res.allTime.totalMealsProvided ?? this.totalMeals;
        this.totalSessions = res.allTime.completedSessions ?? this.totalSessions;
        this.calculateLevel();
      }

      if (res.today) {
        this.dailyMinutes = res.today.focusMinutes || 0;
      }

      if (res.chartData?.length) {
        this.weeklyData = res.chartData.map((d: any) => ({
          label: d.label,
          minutes: d.minutes,
          sessions: d.sessions || 0,
          isToday: d.isToday,
          date: d.date,
        }));
        this.maxMinutes = Math.max(...this.weeklyData.map(d => d.minutes), 1);
      }

      if (res.streakCalendar?.length) {
        this.streakCalendar = res.streakCalendar.map((d: any) => ({
          date: d.date,
          minutes: d.minutes,
          sessions: d.sessions || 0,
          goalMet: d.goalMet,
          dayOfMonth: parseInt(d.date.split('-')[2], 10),
        }));
      }

      if (res.tagBreakdown) {
        const total = res.tagBreakdown.reduce((s: number, t: any) => s + t.minutes, 0) || 1;
        this.tagBreakdown = res.tagBreakdown.map((t: any) => ({
          tag: t.tag,
          minutes: t.minutes,
          sessions: t.sessions,
          percent: Math.round((t.minutes / total) * 100),
          icon: TAG_ICONS[t.tag] || '📌',
        }));
      }

      if (res.insights?.length) {
        this.insights = res.insights;
      }

      // Streak shield
      if (res.lastShieldUsedDate) {
        const daysSince = Math.floor(
          (Date.now() - new Date(res.lastShieldUsedDate).getTime()) / 86400000,
        );
        this.shieldAvailable = daysSince >= 7;
        if (!this.shieldAvailable) {
          const next = new Date(new Date(res.lastShieldUsedDate).getTime() + 7 * 86400000);
          this.shieldNextDate = next.toISOString().split('T')[0];
        }
      } else {
        this.shieldAvailable = true;
      }

      this.updatePeriodStats();
    } catch {
      // Offline — use cached data
    }
  }

  private async fetchAchievementCount(): Promise<void> {
    try {
      const headers = this.getAuthHeaders();
      const res: any = await this.http
        .get(`${this.apiUrl}/achievements`, { headers })
        .toPromise();
      if (res?.summary) {
        this.achievementCount = res.summary.unlocked || 0;
        this.totalAchievements = res.summary.total || 22;
      }
    } catch { /* offline */ }
  }

  // ── Period selection ──

  selectPeriod(period: TimePeriod): void {
    this.selectedPeriod = period;
    this.updatePeriodStats();
  }

  private updatePeriodStats(): void {
    switch (this.selectedPeriod) {
      case 'today': {
        const t = this.statsService.getTodayStats();
        this.displayStats = {
          focusTime: this.statsService.formatFocusTime(t.focusMinutes),
          sessions: t.sessionsCompleted,
          kibble: t.kibbleEarned,
          meals: Math.floor(t.kibbleEarned / 25),
          avgPerDay: this.statsService.formatFocusTime(t.focusMinutes),
        };
        break;
      }
      case 'week': {
        const w = this.statsService.getWeeklyStats();
        this.displayStats = {
          focusTime: this.statsService.formatFocusTime(w.totalMinutes),
          sessions: w.totalSessions,
          kibble: w.totalKibble,
          meals: Math.floor(w.totalKibble / 25),
          avgPerDay: this.statsService.formatFocusTime(w.averageMinutesPerDay),
        };
        break;
      }
      case 'month': {
        const m = this.statsService.getMonthlyStats();
        this.displayStats = {
          focusTime: this.statsService.formatFocusTime(m.totalMinutes),
          sessions: m.totalSessions,
          kibble: m.totalKibble,
          meals: m.totalMeals,
          avgPerDay: this.statsService.formatFocusTime(m.averageMinutesPerDay),
        };
        break;
      }
      case 'all': {
        const s = this.statsService.stats;
        const activeDays = new Set(s.dailyHistory.map(d => d.date)).size || 1;
        this.displayStats = {
          focusTime: this.statsService.formattedTotalFocusTime,
          sessions: s.completedSessions,
          kibble: s.totalKibble,
          meals: s.totalMealsProvided,
          avgPerDay: this.statsService.formatFocusTime(Math.round(s.totalFocusMinutes / activeDays)),
        };
        break;
      }
    }
  }

  // ── Level ──

  private calculateLevel(): void {
    this.userLevel = Math.max(1, Math.floor(this.totalFocusMinutes / 600) + 1);
    this.nextLevelMinutes = this.userLevel * 600;
    const currentLevelStart = (this.userLevel - 1) * 600;
    this.levelProgress = ((this.totalFocusMinutes - currentLevelStart) / 600) * 100;

    const titles = Object.keys(LEVEL_TITLES).map(Number).sort((a, b) => b - a);
    this.levelTitle = 'Puppy Trainer';
    for (const lvl of titles) {
      if (this.userLevel >= lvl) {
        this.levelTitle = LEVEL_TITLES[lvl];
        break;
      }
    }
  }

  // ── Chart interaction ──

  getBarHeight(minutes: number): number {
    return this.maxMinutes === 0 ? 0 : (minutes / this.maxMinutes) * 100;
  }

  selectChartDay(day: DayActivity): void {
    this.selectedDay = this.selectedDay?.date === day.date ? null : day;
  }

  // ── Daily goal ──

  get dailyGoalProgress(): number {
    if (this.dailyGoal <= 0) return 0;
    return Math.min(1, this.dailyMinutes / this.dailyGoal);
  }

  get dailyGoalRemaining(): number {
    return Math.max(0, this.dailyGoal - this.dailyMinutes);
  }

  get dailyGoalReached(): boolean {
    return this.dailyMinutes >= this.dailyGoal;
  }

  get dailyProgressDashOffset(): number {
    const c = 2 * Math.PI * 54;
    return c * (1 - this.dailyGoalProgress);
  }

  get dailyProgressCircumference(): number {
    return 2 * Math.PI * 54;
  }

  // ── Streak shield ──

  async useStreakShield(): Promise<void> {
    if (this.shieldLoading || !this.shieldAvailable) return;
    this.shieldLoading = true;

    try {
      const headers = this.getAuthHeaders();
      const res: any = await this.http
        .post(`${this.apiUrl}/user/use-streak-shield`, {}, { headers })
        .toPromise();

      if (res?.success) {
        this.shieldAvailable = false;
        this.shieldNextDate = res.nextShieldAvailable;
        const toast = await this.toastController.create({
          message: `Streak protected! 🛡 ${res.streakPreserved} day streak is safe.`,
          duration: 3000,
          position: 'top',
          color: 'success',
        });
        await toast.present();
      }
    } catch (err: any) {
      const msg = err?.error?.message || 'Could not use streak shield.';
      const toast = await this.toastController.create({
        message: msg,
        duration: 2500,
        position: 'top',
        color: 'warning',
      });
      await toast.present();
    } finally {
      this.shieldLoading = false;
    }
  }

  // ── Tag formatting ──

  formatTagTime(minutes: number): string {
    return this.statsService.formatFocusTime(minutes);
  }

  formatTagName(tag: string): string {
    if (tag === 'untagged') return 'Untagged';
    return tag.charAt(0).toUpperCase() + tag.slice(1);
  }

  // ── Navigation ──

  goToSettings(): void { this.router.navigate(['/settings']); }
  goToKennel(): void { this.router.navigate(['/tabs/kennel']); }
  goToFocus(): void { this.router.navigate(['/tabs/home']); }
  goToAchievements(): void { this.router.navigate(['/achievements']); }

  async showGlobalImpact(): Promise<void> {
    const alert = await this.alertController.create({
      header: '🌍 Global Impact',
      message: `Together, the StayPaws community has provided ${this.globalMeals.toLocaleString()} meals to shelter dogs worldwide!\n\nYou've personally contributed ${this.totalMeals} meals. Thank you!`,
      buttons: ['Amazing!'],
    });
    await alert.present();
  }

  // ── Insight helpers ──

  getInsightIcon(type: string): string {
    const icons: Record<string, string> = {
      best_day: '📅',
      best_time: '🕐',
      avg_session: '⏱️',
      weekly_trend: '📈',
      consistency: '🎯',
      completion_rate: '✅',
      longest_session: '🏆',
      favorite_tag: '⭐',
    };
    return icons[type] || '💡';
  }

  getInsightLabel(type: string): string {
    const labels: Record<string, string> = {
      best_day: 'Best Day',
      best_time: 'Peak Hours',
      avg_session: 'Avg Session',
      weekly_trend: 'Weekly Trend',
      consistency: 'Consistency',
      completion_rate: 'Completion Rate',
      longest_session: 'Personal Best',
      favorite_tag: 'Top Category',
    };
    return labels[type] || 'Insight';
  }

  getInsightTrend(insight: Insight): string {
    if (insight.type === 'weekly_trend') {
      return (insight.change ?? 0) >= 0 ? 'trend-positive' : 'trend-negative';
    }
    if (insight.type === 'completion_rate') {
      return (insight.rate ?? 0) >= 80 ? 'trend-positive' : '';
    }
    if (insight.type === 'consistency') {
      return (insight.score ?? 0) >= 50 ? 'trend-positive' : '';
    }
    return '';
  }

  // ── Helpers ──

  get hasAnyData(): boolean {
    return this.totalSessions > 0;
  }

  get periodHasData(): boolean {
    return this.displayStats.sessions > 0;
  }

  get noDataMessage(): string {
    const msgs: Record<TimePeriod, string> = {
      today: 'No focus sessions today yet. Start one now!',
      week: 'No focus sessions this week. Let\'s change that!',
      month: 'No focus sessions this month. Time to focus!',
      all: 'Complete your first focus session to see stats!',
    };
    return msgs[this.selectedPeriod];
  }

  get tierBadgeClass(): string {
    if (this.userTier === 'guardian') return 'guardian';
    if (this.isPro) return 'pro';
    return 'free';
  }

  get tierBadgeText(): string {
    if (this.userTier === 'guardian') return '👑 Guardian Angel';
    if (this.isPro) return '⭐ Pro Member';
    return '';
  }

  private getAuthHeaders(): HttpHeaders {
    try {
      const user = JSON.parse(safeGetItem('focus_user') || '{}');
      return new HttpHeaders({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user?.token || ''}`,
        'x-timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    } catch {
      return new HttpHeaders({ 'Content-Type': 'application/json' });
    }
  }
}

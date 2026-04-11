import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonContent,
  IonIcon,
  IonSpinner,
  IonToggle,
  ModalController,
  AlertController,
  ToastController,
  IonicSafeString,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  settingsOutline,
  chevronForward,
  closeOutline,
  play,
  pause,
  lockClosed,
  timerOutline,
  musicalNotes,
  musicalNote,
  volumeHigh,
  volumeMute,
  shieldCheckmark,
  informationCircleOutline,
} from 'ionicons/icons';
import { Subscription, firstValueFrom } from 'rxjs';
import { trigger, transition, style, animate } from '@angular/animations';
import { HttpClient, HttpHeaders } from '@angular/common/http';

import { TimerService, PomodoroConfig, TimerPhase } from '../../services/timer.service';
import { AuthService } from '../../services/auth.service';
import { StatsService, UserStats } from '../../services/stats.service';
import { BreedService, DogBreed, DogState } from '../../services/breed.service';
import { SoundService } from '../../services/sound.service';
import { DogBarkService } from '../../services/dog-bark.service';
import { FocusSoundService, SoundTrack } from '../../services/focus-sound.service';
import { AdService } from '../../services/ad.service';
import { AppBlockerService } from '../../services/app-blocker.service';
import { WidgetService } from '../../services/widget.service';
import { NotificationService } from '../../services/notification.service';
import { SocialService, FocusRoom } from '../../services/social.service';
import { ApiService } from '../../services/api.service';
import { environment } from '../../../environments/environment';
import { safeGetItem, safeSetItem } from '../../utils/storage';
import { SuccessModalComponent } from '../../components/success-modal/success-modal.component';
import { KibbleInfoModalComponent } from '../../components/kibble-info-modal/kibble-info-modal.component';
import { FailedModalComponent } from '../../components/failed-modal/failed-modal.component';


type UserTier = 'free' | 'pro' | 'guardian';

interface DurationOption {
  value: number;
  locked: boolean;
}

const FREE_DURATIONS = [15, 25];
const PRO_DURATIONS = [15, 25, 45, 60, 90, 120];
const CUSTOM_MIN = 5;
const CUSTOM_MAX = 120;
const CUSTOM_STEP = 5;
const DEFAULT_DAILY_GOAL = 60;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonIcon,
    IonSpinner,
    IonToggle,

  ],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  animations: [
    trigger('fadeSlide', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(20px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(-10px)' })),
      ]),
    ]),
    trigger('overlayFade', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('250ms ease-out', style({ opacity: 1 })),
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0 })),
      ]),
    ]),
  ],
})
export class HomePage implements OnInit, OnDestroy {

  private pendingTimeouts: ReturnType<typeof setTimeout>[] = [];

  // ── Timer state ──
  isTimerRunning = false;
  remainingSeconds = 0;
  totalSeconds = 1500;
  isProcessing = false;
  currentPhase: TimerPhase = 'work';

  // ── Duration ──
  durationOptions: DurationOption[] = [];
  selectedDuration = 25;
  showCustomPicker = false;
  customDuration = 30;

  // ── User tier (all features free) ──
  userTier: UserTier = 'guardian';
  isPro = true;

  // ── Pomodoro ──
  pomodoroEnabled = false;
  pomodoroBreakMinutes = 5;
  pomodoroCycles = 4;
  pomodoroLongBreakMinutes = 15;
  currentCycle = 1;
  showBreakOverlay = false;
  breakIsLong = false;

  // ── Daily progress ──
  dailyGoal = DEFAULT_DAILY_GOAL;
  dailyMinutes = 0;
  hasDailyGoal = true;

  // ── Quick stats ──
  currentStreak = 0;
  todayMinutes = 0;
  todayKibble = 0;

  // ── User stats ──
  userStats: UserStats | null = null;
  userMealsProvided = 0;
  userKibble = 0;
  completedSessions = 0;

  sessionLimitReached = false;

  // ── Sound picker ──
  showSoundPicker = false;
  showMiniSoundControl = false;
  soundMixMode = false;
  soundMixSelection: string[] = [];
  soundPreviewingId: string | null = null;
  currentSoundName = 'Silence';
  currentSoundIcon = '🤫';
  soundVolume = 0.6;
  soundLibrary: (SoundTrack & { locked: boolean })[] = [];

  // ── Achievements ──
  pendingAchievements: { id: string; name: string; icon: string; kibble: number }[] = [];
  newAchievementCount = 0;

  // ── App blocking ──
  blockingEnabled = false;
  blockListCount = 0;
  blockingActive = false;

  // ── Dog tap ──
  dogTapped = false;
  barkBubbleText = '';

  // ── Active breed ──
  activeBreed: DogBreed | null = null;

  // ── Social rooms ──
  activeRooms: FocusRoom[] = [];
  primaryRoom: FocusRoom | null = null;

  // ── SVG ring ──
  readonly radius = 125;
  readonly circumference = 2 * Math.PI * 125;
  readonly progressRingRadius = 90;
  readonly progressRingCircumference = 2 * Math.PI * 90;

  Math = Math;

  private apiUrl = environment.apiUrl;
  private subscriptions: Subscription[] = [];

  constructor(
    private timerService: TimerService,
    private authService: AuthService,
    private statsService: StatsService,
    private breedService: BreedService,
    private soundService: SoundService,
    private dogBarkService: DogBarkService,
    public focusSoundService: FocusSoundService,
    private adService: AdService,
    private appBlocker: AppBlockerService,
    private widgetService: WidgetService,
    private notificationService: NotificationService,
    private socialService: SocialService,
    private apiService: ApiService,
    private http: HttpClient,
    public router: Router,
    private modalController: ModalController,
    private alertController: AlertController,
    private toastController: ToastController,
  ) {
    addIcons({ settingsOutline, info: informationCircleOutline, informationCircleOutline, chevronForward, closeOutline, play, pause, lockClosed, timerOutline, musicalNotes, musicalNote, volumeHigh, volumeMute, shieldCheckmark });
  }

  // ── Lifecycle ──

  userName = 'User';

  ngOnInit(): void {
    this.loadUserTier();
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.userName = user.username || 'User';
      }
    });

    this.checkSessionStatus();
    this.buildDurationOptions();
    this.timerService.setDuration(this.selectedDuration);
    this.loadDailyGoal();

    const statsSub = this.statsService.stats$.subscribe(stats => {
      this.userStats = stats;
      this.userMealsProvided = stats.totalMealsProvided;
      this.userKibble = stats.totalKibble;
      this.completedSessions = stats.completedSessions;
      this.currentStreak = stats.currentStreak;

      const today = this.statsService.getTodayStats();
      this.todayMinutes = today.focusMinutes;
      this.todayKibble = today.kibbleEarned;
      this.dailyMinutes = today.focusMinutes;

      const newlyUnlocked = this.breedService.updateKibble(stats.totalKibble);
      if (newlyUnlocked) this.showBreedUnlockCelebration(newlyUnlocked);
    });
    this.subscriptions.push(statsSub);

    const breedSub = this.breedService.collection$.subscribe(() => {
      this.activeBreed = this.breedService.activeBreed;
    });
    this.subscriptions.push(breedSub);

    const timerSub = this.timerService.remainingSeconds$.subscribe(s => this.remainingSeconds = s);
    this.subscriptions.push(timerSub);

    const totalSub = this.timerService.totalSeconds$.subscribe(t => this.totalSeconds = t);
    this.subscriptions.push(totalSub);

    const runningSub = this.timerService.isRunning$.subscribe(r => this.isTimerRunning = r);
    this.subscriptions.push(runningSub);

    const phaseSub = this.timerService.phase$.subscribe(p => this.currentPhase = p);
    this.subscriptions.push(phaseSub);

    const cycleSub = this.timerService.currentCycle$.subscribe(c => this.currentCycle = c);
    this.subscriptions.push(cycleSub);

    const completeSub = this.timerService.sessionComplete$.subscribe(async () => {
      await this.handleSessionComplete();
    });
    this.subscriptions.push(completeSub);

    const failSub = this.timerService.sessionFailed$.subscribe(async () => {
      const elapsed = Math.floor((this.timerService.elapsedSeconds || 0) / 60);
      const partial = elapsed >= 5 ? Math.floor(elapsed / 5) : 0;
      await this.showFailedModal(elapsed, partial);
    });
    this.subscriptions.push(failSub);

    const breakStartSub = this.timerService.breakStarted$.subscribe(({ isLongBreak }) => {
      this.breakIsLong = isLongBreak;
      this.showBreakOverlay = true;
    });
    this.subscriptions.push(breakStartSub);

    const breakEndSub = this.timerService.breakEnded$.subscribe(() => {
      this.showBreakOverlay = false;
    });
    this.subscriptions.push(breakEndSub);

    const pomoDoneSub = this.timerService.pomodoroComplete$.subscribe(async () => {
      this.showBreakOverlay = false;
      await this.handlePomodoroFullyComplete();
    });
    this.subscriptions.push(pomoDoneSub);

    const soundSub = this.focusSoundService.currentSound$.subscribe(id => {
      const track = this.focusSoundService.getSoundById(id);
      this.currentSoundName = track?.name || 'Silence';
      this.currentSoundIcon = track?.icon || '🤫';
    });
    this.subscriptions.push(soundSub);

    const volSub = this.focusSoundService.volume$.subscribe(v => this.soundVolume = v);
    this.subscriptions.push(volSub);

    this.refreshSoundLibrary();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
    this.pendingTimeouts.forEach(id => clearTimeout(id));
    this.pendingTimeouts = [];
  }

  ionViewWillEnter(): void {
    this.activeBreed = this.breedService.activeBreed;
    this.loadUserTier();
    this.buildDurationOptions();

    const today = this.statsService.getTodayStats();
    this.todayMinutes = today.focusMinutes;
    this.todayKibble = today.kibbleEarned;
    this.dailyMinutes = today.focusMinutes;
    this.currentStreak = this.statsService.currentStreak;

    this.blockingEnabled = this.appBlocker.isEnabled;
    this.blockListCount = this.appBlocker.blockListCount;
    this.blockingActive = this.appBlocker.isBlocking;

    this.loadActiveRooms();
  }

  private async loadActiveRooms(): Promise<void> {
    try {
      this.activeRooms = await this.socialService.loadMyRooms();
      this.primaryRoom = this.activeRooms.length > 0 ? this.activeRooms[0] : null;
    } catch {
      this.activeRooms = [];
      this.primaryRoom = null;
    }
  }

  openRoom(room: FocusRoom): void {
    this.router.navigate(['/room-detail'], { queryParams: { code: room.roomCode } });
  }

  goToSocial(): void {
    this.router.navigate(['/social']);
  }

  // ── Computed getters ──

  get formattedTime(): string {
    const m = Math.floor(this.remainingSeconds / 60);
    const s = this.remainingSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  get progress(): number {
    if (this.totalSeconds === 0) return 0;
    return (this.totalSeconds - this.remainingSeconds) / this.totalSeconds;
  }

  get dashOffset(): number {
    return this.circumference * (1 - this.progress);
  }

  get kibbleToEarn(): number {
    const REWARDS: { [key: number]: number } = { 15: 15, 25: 30, 45: 55, 60: 75, 90: 120, 120: 180 };
    return REWARDS[this.selectedDuration] || this.selectedDuration;
  }

  get mealProgress(): number {
    return this.statsService.getMealProgress();
  }

  get kibbleToNextMeal(): number {
    return this.statsService.getKibbleToNextMeal();
  }

  get dailyGoalProgress(): number {
    if (this.dailyGoal <= 0) return 0;
    return Math.min(1, this.dailyMinutes / this.dailyGoal);
  }

  get dailyProgressDashOffset(): number {
    return this.progressRingCircumference * (1 - this.dailyGoalProgress);
  }

  get isInGracePeriod(): boolean {
    return this.timerService.isInGracePeriod;
  }

  get graceSecondsRemaining(): number {
    return this.timerService.graceSecondsRemaining;
  }

  get isOnBreak(): boolean {
    return this.timerService.isOnBreak;
  }

  get activeBreedImage(): string {
    if (!this.activeBreed) return 'assets/images/golden_retriever.png';
    return this.activeBreed.image;
  }

  get currentDogImage(): string {
    if (!this.activeBreed) return 'assets/images/golden_retriever.png';
    // When timer is running and not on break, show eating image
    if (this.isTimerRunning && !this.isOnBreak) {
      return this.activeBreed.eatingImage || this.activeBreed.image;
    }
    // TODO: Add sleeping logic if needed, but for now idle/sleeping uses default or sleeping image
    return this.activeBreed.image;
  }

  get activeBreedName(): string {
    return this.activeBreed?.name || 'Golden Retriever';
  }

  get currentDogState(): DogState {
    return this.isTimerRunning ? 'eating' : 'idle';
  }

  get dogStatusMessage(): string {
    if (this.isOnBreak) return 'Break time! Relax for a moment.';
    if (this.isTimerRunning) return `${this.activeBreedName} is enjoying the meal!`;
    return `${this.activeBreedName} is ready to help you focus!`;
  }

  get buttonText(): string {
    if (this.isProcessing) return '';
    if (this.isOnBreak && this.isTimerRunning) return `Break: ${this.formattedTime}`;
    if (this.isTimerRunning && this.isInGracePeriod) return 'Cancel';
    if (this.isTimerRunning) return 'Stop Feeding';
    return `Feed ${this.activeBreedName}`;
  }

  get buttonClass(): string {
    if (this.isOnBreak && this.isTimerRunning) return 'on-break';
    if (this.isTimerRunning) return 'running';
    return '';
  }

  get customPickerValues(): number[] {
    const vals: number[] = [];
    for (let i = CUSTOM_MIN; i <= CUSTOM_MAX; i += CUSTOM_STEP) {
      vals.push(i);
    }
    return vals;
  }

  // ── Duration selection ──

  private buildDurationOptions(): void {
    this.durationOptions = PRO_DURATIONS.map(v => ({ value: v, locked: false }));
  }

  selectDuration(option: DurationOption): void {
    if (this.isTimerRunning || this.isProcessing) return;

    this.soundService.play('tap');
    this.selectedDuration = option.value;
    this.showCustomPicker = false;
    this.timerService.setDuration(option.value);

    if (this.pomodoroEnabled && this.timerService.pomodoroConfig) {
      this.applyPomodoroConfig();
    }
  }

  toggleCustomPicker(): void {
    if (this.isTimerRunning || this.isProcessing) return;
    this.showCustomPicker = !this.showCustomPicker;
  }

  applyCustomDuration(): void {
    this.selectedDuration = this.customDuration;
    this.timerService.setDuration(this.customDuration);
    this.showCustomPicker = false;
    this.soundService.play('tap');

    if (this.pomodoroEnabled) this.applyPomodoroConfig();
  }

  // ── Pomodoro ──

  onPomodoroToggle(enabled: boolean): void {
    this.pomodoroEnabled = enabled;
    if (enabled) {
      this.applyPomodoroConfig();
    } else {
      this.timerService.disablePomodoro();
    }
  }

  applyPomodoroConfig(): void {
    const config: PomodoroConfig = {
      workMinutes: this.selectedDuration,
      breakMinutes: this.pomodoroBreakMinutes,
      longBreakMinutes: this.pomodoroLongBreakMinutes,
      totalCycles: this.pomodoroCycles,
    };
    this.timerService.enablePomodoro(config);
  }

  startBreak(): void {
    this.timerService.startBreakTimer();
  }

  skipBreak(): void {
    this.showBreakOverlay = false;
    this.timerService.skipBreak();
  }

  // ── Session lifecycle ──

  async startSession(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;
    try {
      const res: any = await firstValueFrom(this.apiService.startFocusSession(this.selectedDuration));

      if (!res?.allowed) {
        const toast = await this.toastController.create({
          message: res?.message || 'Could not start session.',
          duration: 3500, position: 'top', color: 'warning',
        });
        await toast.present();
        return;
      }

      this.timerService.setSessionToken(res.sessionToken);
      if (this.pomodoroEnabled) this.applyPomodoroConfig();

      await new Promise(r => setTimeout(r, 100));
      this.timerService.start();

      const selectedId = this.focusSoundService.currentSoundId;
      if (selectedId !== 'silence') {
        const mixIds = this.focusSoundService.mixedSoundIds;
        if (mixIds.length > 1) {
          this.focusSoundService.mixSounds(mixIds);
        } else {
          this.focusSoundService.playSound(selectedId);
        }
      }

      if (this.blockingEnabled && this.blockListCount > 0) {
        this.appBlocker.startBlocking(this.activeBreedName, this.selectedDuration);
        this.blockingActive = true;
      }

      const endTimeMs = Date.now() + this.selectedDuration * 60 * 1000;
      this.widgetService.setSessionActive(true, endTimeMs);
    } catch (err: any) {
      console.error('Start session error:', err);
      const toast = await this.toastController.create({
        message: err.message || 'Could not start session. Check your connection.',
        duration: 4000, position: 'top', color: 'danger',
      });
      await toast.present();
    } finally {
      this.isProcessing = false;
    }
  }

  async cancelSession(): Promise<void> {
    if (this.isInGracePeriod) {
      this.timerService.cancelGracefully();
      return;
    }

    const alert = await this.alertController.create({
      header: 'Stop Feeding?',
      message: `Are you sure? ${this.activeBreedName} is still eating!`,
      buttons: [
        { text: 'Continue Feeding', role: 'cancel' },
        {
          text: 'Stop — earn partial kibble',
          role: 'destructive',
          handler: () => this.stopAndRecordFail(),
        },
      ],
    });
    await alert.present();
  }

  private async stopAndRecordFail(): Promise<void> {
    await this.focusSoundService.stopSound();
    await this.appBlocker.stopBlocking();
    this.blockingActive = false;
    const elapsed = this.timerService.elapsedSeconds;
    const minutesCompleted = Math.floor(elapsed / 60);
    const token = this.timerService.sessionToken;

    this.timerService.failSession();

    let partialKibble = 0;
    try {
      const res: any = await firstValueFrom(this.apiService.failFocusSession({
        duration: this.selectedDuration,
        startTime: new Date(Date.now() - elapsed * 1000).toISOString(),
        minutesCompleted,
        sessionToken: token || '',
      }));

      partialKibble = res?.partialKibble || 0;
      if (partialKibble > 0) {
        this.statsService.recordCompletedSession(partialKibble, 0);
        this.authService.updateLocalKibble(partialKibble);
      }
    } catch (err: any) {
      console.error('Session fail recording error:', err);
      // Offline — calculate locally
      partialKibble = minutesCompleted >= 5 ? Math.floor(minutesCompleted / 5) : 0;
    }

    this.widgetService.setSessionActive(false);
    this.widgetService.updateWidgetData();
    await this.showFailedModal(minutesCompleted, partialKibble);
  }

  onActionButtonClick(): void {
    if (this.isOnBreak && !this.isTimerRunning) {
      this.startBreak();
      return;
    }
    if (this.isTimerRunning) {
      this.cancelSession();
    } else {
      this.startSession();
    }
  }

  // ── Session complete ──

  private async handleSessionComplete(): Promise<void> {
    if (!this.timerService.isPomodoroMode) {
      await this.focusSoundService.stopSound();
      await this.appBlocker.stopBlocking();
      this.blockingActive = false;
    }
    const kibble = this.kibbleToEarn;
    const token = this.timerService.sessionToken;
    let streakIncreased = false;

    try {
      const res: any = await firstValueFrom(this.apiService.completeFocusSession({
        duration: this.selectedDuration,
        startTime: new Date(Date.now() - this.selectedDuration * 60 * 1000).toISOString(),
        sessionToken: token || '',
      }));

      const earned = res?.kibbleEarned || kibble;
      this.statsService.recordCompletedSession(earned, this.selectedDuration);
      this.authService.updateLocalKibble(earned);

      if (res?.streak?.current > this.currentStreak) {
        streakIncreased = true;
        this.currentStreak = res.streak.current;
      }

      if (res?.newAchievements?.length > 0) {
        this.pendingAchievements = res.newAchievements;
        this.newAchievementCount += res.newAchievements.length;
      }
    } catch (err: any) {
      console.error('Session complete error:', err);
      this.statsService.recordCompletedSession(kibble, this.selectedDuration);
      this.authService.updateLocalKibble(kibble);
    }

    this.widgetService.setSessionActive(false);
    this.widgetService.updateWidgetData();
    this.notificationService.onSessionCompleted(this.currentStreak);

    if (this.timerService.isPomodoroMode) return;

    await this.showSuccessModal(kibble, this.selectedDuration, streakIncreased);
  }

  private async handlePomodoroFullyComplete(): Promise<void> {
    await this.focusSoundService.stopSound();
    await this.appBlocker.stopBlocking();
    this.blockingActive = false;
    this.widgetService.setSessionActive(false);
    this.widgetService.updateWidgetData();
    this.notificationService.onSessionCompleted(this.currentStreak);
    const totalWork = this.selectedDuration * this.pomodoroCycles;
    await this.showSuccessModal(totalWork, totalWork, false);
  }

  private async showRewardedAdForBonus(): Promise<void> {
    const result = await this.adService.showRewardedAd();
    if (result.rewarded) {
      this.statsService.recordCompletedSession(result.kibbleBonus, 0);
      this.authService.updateLocalKibble(result.kibbleBonus);
    }
  }

  private async showSuccessModal(kibble: number, focusMinutes: number, streakIncreased: boolean): Promise<void> {
    const nextBreed = this.breedService.getNextBreedToUnlock();
    const newlyUnlocked = this.breedService.getAndClearNewlyUnlocked();

    const modal = await this.modalController.create({
      component: SuccessModalComponent,
      componentProps: {
        kibbleEarned: kibble,
        focusMinutes,
        totalMeals: this.statsService.totalMeals,
        totalSessions: this.statsService.completedSessions,
        mealsJustProvided: Math.max(1, Math.floor(kibble / 25)),
        breedName: this.activeBreedName,
        breedImage: this.activeBreedImage,
        currentStreak: this.currentStreak,
        streakIncreased,
        totalKibble: this.userKibble,
        nextBreedName: nextBreed?.name || '',
        nextBreedCost: nextBreed?.unlockRequirement || 0,
        newBreedUnlocked: newlyUnlocked?.name || '',
        isFirstSession: this.completedSessions <= 1,
        isAdFree: true,
        adReady: this.adService.rewardedAdReady,
        newAchievements: this.pendingAchievements,
      },
      cssClass: 'success-modal',
    });
    await modal.present();
    const { data } = await modal.onDidDismiss();

    if (this.pendingAchievements.length > 0) {
      await this.showAchievementToasts();
    }

    if (data?.action === 'watch_ad') {
      await this.showRewardedAdForBonus();
    } else if (data?.action === 'feed_more') {
      // User wants to start another session — stay on page, ready to go
    }

    await this.adService.showInterstitialAfterSession();
  }

  private async showFailedModal(minutesCompleted: number, partialKibble: number): Promise<void> {
    const modal = await this.modalController.create({
      component: FailedModalComponent,
      componentProps: {
        breedName: this.activeBreedName,
        breedImage: this.activeBreedImage,
        minutesCompleted,
        partialKibble,
        originalDuration: this.selectedDuration,
        isPro: true,
      },
      cssClass: 'failed-modal',
    });
    await modal.present();
    const { data } = await modal.onDidDismiss();

    if (data?.action === 'retry' && data?.duration) {
      this.selectedDuration = data.duration;
      this.timerService.setDuration(data.duration);
      await this.startSession();
    }
  }

  // ── Sound picker ──

  private refreshSoundLibrary(): void {
    this.soundLibrary = this.focusSoundService.getSoundLibrary(this.userTier);
  }

  openSoundPicker(): void {
    if (this.isTimerRunning) {
      this.showMiniSoundControl = !this.showMiniSoundControl;
      return;
    }
    this.soundMixMode = false;
    this.soundMixSelection = [...this.focusSoundService.mixedSoundIds];
    this.refreshSoundLibrary();
    this.showSoundPicker = true;
  }

  closeSoundPicker(): void {
    this.showSoundPicker = false;
    this.soundMixMode = false;
    this.soundPreviewingId = null;
  }

  toggleMiniSoundControl(): void {
    this.showMiniSoundControl = !this.showMiniSoundControl;
  }

  async selectSound(sound: SoundTrack & { locked: boolean }): Promise<void> {
    if (this.soundMixMode) {
      this.toggleMixSelection(sound.id);
      return;
    }

    this.soundPreviewingId = null;
    await this.focusSoundService.playSound(sound.id);
    this.currentSoundName = sound.name;
    this.currentSoundIcon = sound.icon;
    this.closeSoundPicker();
  }

  async previewSound(soundId: string): Promise<void> {
    if (this.soundPreviewingId === soundId) {
      this.soundPreviewingId = null;
      return;
    }
    this.soundPreviewingId = soundId;
    await this.focusSoundService.previewSound(soundId, 3000);
    this.pendingTimeouts.push(setTimeout(() => {
      if (this.soundPreviewingId === soundId) this.soundPreviewingId = null;
    }, 3000));
  }

  onSoundVolumeChange(event: Event): void {
    const value = parseFloat((event.target as HTMLInputElement).value);
    this.focusSoundService.setVolume(value);
  }

  enableMixMode(): void {
    this.soundMixMode = true;
    this.soundMixSelection = [...this.focusSoundService.mixedSoundIds];
  }

  toggleMixSelection(soundId: string): void {
    if (soundId === 'silence') return;
    const idx = this.soundMixSelection.indexOf(soundId);
    if (idx >= 0) {
      this.soundMixSelection.splice(idx, 1);
    } else if (this.soundMixSelection.length < 3) {
      this.soundMixSelection.push(soundId);
    }
  }

  async applyMix(): Promise<void> {
    if (this.soundMixSelection.length === 0) {
      await this.focusSoundService.playSound('silence');
    } else if (this.soundMixSelection.length === 1) {
      await this.focusSoundService.playSound(this.soundMixSelection[0]);
    } else {
      await this.focusSoundService.mixSounds(this.soundMixSelection);
    }
    if (!this.isTimerRunning) {
      await this.focusSoundService.stopSound();
    }
    this.soundMixMode = false;
    this.closeSoundPicker();
  }

  isMixSelected(soundId: string): boolean {
    return this.soundMixSelection.includes(soundId);
  }

  private _isPlayingFocusSound(): boolean {
    return this.focusSoundService.isPlaying;
  }

  async changeSoundDuringSession(sound: SoundTrack & { locked: boolean }): Promise<void> {
    if (sound.locked) return;
    await this.focusSoundService.playSound(sound.id);
    this.showMiniSoundControl = false;
  }

  // ── App blocking ──

  toggleBlockingFromHome(): void {
    if (!this.appBlocker.permissionGranted) {
      this.router.navigate(['/app-blocking']);
      return;
    }

    if (this.blockListCount === 0) {
      this.router.navigate(['/app-blocking']);
      return;
    }

    this.blockingEnabled = !this.blockingEnabled;
    this.appBlocker.setEnabled(this.blockingEnabled);
  }

  openBlockingSettings(): void {
    this.router.navigate(['/app-blocking']);
  }

  // ── Achievements ──

  private async showAchievementToasts(): Promise<void> {
    for (const ach of this.pendingAchievements) {
      const toast = await this.toastController.create({
        message: `🏆 ${ach.icon} ${ach.name} — Tap to claim ${ach.kibble} kibble!`,
        duration: 4000,
        position: 'top',
        color: 'success',
        buttons: [
          { text: 'View', handler: () => this.router.navigate(['/achievements']) },
        ],
      });
      await toast.present();
      await new Promise(r => setTimeout(r, 1500));
    }
    this.pendingAchievements = [];
  }

  goToAchievements(): void {
    this.router.navigate(['/achievements']);
  }

  // ── Navigation ──

  goToSettings(): void {
    this.router.navigate(['/settings']);
  }

  goToProfile(): void {
    this.router.navigate(['/tabs/profile']);
  }

  // ── Helpers ──

  private loadUserTier(): void {
    this.userTier = 'guardian';
    this.isPro = true;
    this.buildDurationOptions();
    this.refreshSoundLibrary();
  }

  private loadDailyGoal(): void {
    const stored = safeGetItem('paws_daily_goal');
    if (stored) {
      this.dailyGoal = parseInt(stored, 10);
      this.hasDailyGoal = true;
    } else {
      this.dailyGoal = DEFAULT_DAILY_GOAL;
      this.hasDailyGoal = false;
    }
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

  private async showBreedUnlockCelebration(breed: DogBreed): Promise<void> {
    const alert = await this.alertController.create({
      header: '🎉 New Breed Unlocked!',
      message: `Congratulations! You've unlocked the ${breed.name}!\n\n"${breed.description}"\n\nVisit My Kennel to use your new companion!`,
      buttons: [
        { text: 'Go to Kennel', handler: () => this.router.navigate(['/tabs/kennel']) },
        { text: 'Continue', role: 'cancel' },
      ],
    });
    await alert.present();
  }

  onDogTapped(): void {
    if (this.isTimerRunning) return;

    const breedId = this.activeBreed?.id || 'golden_retriever';
    const barkText = this.dogBarkService.playBark(breedId);
    if (!barkText) return;

    this.dogTapped = true;
    this.barkBubbleText = barkText;

    this.pendingTimeouts.push(setTimeout(() => { this.dogTapped = false; }, 300));
    this.pendingTimeouts.push(setTimeout(() => { this.barkBubbleText = ''; }, 1500));
  }

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (!img) return;
    const src = img.src;
    if (src.includes('eating.png')) return;
    if (src.includes('_sleeping.png')) {
      const breedId = this.activeBreed?.id || 'golden_retriever';
      img.src = `assets/images/${breedId}.png`;
      return;
    }
    if (!src.includes('golden_retriever.png')) {
      img.src = 'assets/images/golden_retriever.png';
    }
  }

  async showKibbleInfo(): Promise<void> {
    const modal = await this.modalController.create({
      component: KibbleInfoModalComponent,
      cssClass: 'kibble-info-modal',
      initialBreakpoint: 0.65,
      breakpoints: [0, 0.65, 0.85]
    });
    await modal.present();
  }

  private checkSessionStatus(): void {
    this.isTimerRunning = this.timerService.isRunning;
    this.remainingSeconds = this.timerService.remainingSeconds;
    this.totalSeconds = this.timerService.totalSeconds;
    this.currentPhase = this.timerService.phase;
    this.currentCycle = this.timerService.currentCycle;
  }
}

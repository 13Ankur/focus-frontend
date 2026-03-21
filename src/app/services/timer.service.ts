import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Subject, Subscription, interval, map } from 'rxjs';
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { environment } from '../../environments/environment';
import { SoundService } from './sound.service';
import { BreedService } from './breed.service';
import { LiveActivityService } from './live-activity.service';

export type TimerState = 'idle' | 'running' | 'paused' | 'completed' | 'failed';
export type TimerPhase = 'work' | 'break' | 'long_break';

const SESSION_KEY = 'paws_focus_session';
const GRACE_PERIOD_SECONDS = 30;

export interface SavedSession {
  startTime: number;
  durationMinutes: number;
  totalSeconds: number;
  breedName: string;
  sessionToken?: string;
  phase?: TimerPhase;
  pomodoroConfig?: PomodoroConfig | null;
  currentCycle?: number;
}

export interface PomodoroConfig {
  workMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  totalCycles: number;
}

interface ForegroundServicePlugin {
  startForegroundService(options: {
    id: number; title: string; body: string; smallIcon?: string;
    buttons?: Array<{ id: number; title: string }>;
  }): Promise<void>;
  updateForegroundService(options: {
    id: number; title: string; body: string; smallIcon?: string;
  }): Promise<void>;
  stopForegroundService(): Promise<void>;
}

let ForegroundService: ForegroundServicePlugin | null = null;
if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
  ForegroundService = registerPlugin<ForegroundServicePlugin>('ForegroundService');
}

@Injectable({ providedIn: 'root' })
export class TimerService {
  private durationMinutes: number = environment.focusDurationMinutes;
  private timerSubscription: Subscription | null = null;
  private _startTime: Date | null = null;
  private backgroundedAt: number | null = null;
  private backgroundUpdateInterval: any = null;

  // Session token from /focus/start
  private _sessionToken: string | null = null;

  // Pomodoro
  private _pomodoroConfig: PomodoroConfig | null = null;
  private _currentCycle = 1;
  private _phase: TimerPhase = 'work';

  // Grace period: timestamp when session started (for 30-second free cancel)
  private _sessionStartedAtMs = 0;

  // ── State subjects ──
  private remainingSecondsSubject = new BehaviorSubject<number>(this.durationMinutes * 60);
  private stateSubject = new BehaviorSubject<TimerState>('idle');
  private totalSecondsSubject = new BehaviorSubject<number>(this.durationMinutes * 60);
  private phaseSubject = new BehaviorSubject<TimerPhase>('work');
  private currentCycleSubject = new BehaviorSubject<number>(1);

  // ── Event subjects ──
  private sessionCompletedSubject = new Subject<void>();
  private sessionFailedSubject = new Subject<void>();
  private breakStartedSubject = new Subject<{ cycle: number; isLongBreak: boolean }>();
  private breakEndedSubject = new Subject<{ nextCycle: number }>();
  private pomodoroCompleteSubject = new Subject<void>();

  // ── Public observables ──
  public remainingSeconds$ = this.remainingSecondsSubject.asObservable();
  public state$ = this.stateSubject.asObservable();
  public totalSeconds$ = this.totalSecondsSubject.asObservable();
  public isRunning$ = this.stateSubject.pipe(map(s => s === 'running'));
  public sessionComplete$ = this.sessionCompletedSubject.asObservable();
  public sessionFailed$ = this.sessionFailedSubject.asObservable();
  public phase$ = this.phaseSubject.asObservable();
  public currentCycle$ = this.currentCycleSubject.asObservable();
  public breakStarted$ = this.breakStartedSubject.asObservable();
  public breakEnded$ = this.breakEndedSubject.asObservable();
  public pomodoroComplete$ = this.pomodoroCompleteSubject.asObservable();

  constructor(
    private ngZone: NgZone,
    private soundService: SoundService,
    private breedService: BreedService,
    private liveActivityService: LiveActivityService,
  ) {
    this.init();
  }

  // ── Public getters ──

  get remainingSeconds(): number { return this.remainingSecondsSubject.value; }
  get totalSeconds(): number { return this.totalSecondsSubject.value; }
  get state(): TimerState { return this.stateSubject.value; }
  get isRunning(): boolean { return this.state === 'running'; }
  get phase(): TimerPhase { return this.phaseSubject.value; }
  get currentCycle(): number { return this._currentCycle; }
  get pomodoroConfig(): PomodoroConfig | null { return this._pomodoroConfig; }
  get sessionToken(): string | null { return this._sessionToken; }
  get sessionStartTime(): Date | null { return this._startTime; }

  get progress(): number {
    if (this.totalSeconds === 0) return 0;
    return 1 - (this.remainingSeconds / this.totalSeconds);
  }

  get isInGracePeriod(): boolean {
    if (!this._sessionStartedAtMs || this.state !== 'running') return false;
    return (Date.now() - this._sessionStartedAtMs) < GRACE_PERIOD_SECONDS * 1000;
  }

  get graceSecondsRemaining(): number {
    if (!this._sessionStartedAtMs || this.state !== 'running') return 0;
    return Math.max(0, GRACE_PERIOD_SECONDS - Math.floor((Date.now() - this._sessionStartedAtMs) / 1000));
  }

  get isOnBreak(): boolean {
    return this._phase === 'break' || this._phase === 'long_break';
  }

  get isPomodoroMode(): boolean {
    return this._pomodoroConfig !== null;
  }

  get elapsedSeconds(): number {
    if (!this._startTime) return 0;
    return Math.floor((Date.now() - this._startTime.getTime()) / 1000);
  }

  private get breedName(): string {
    return this.breedService.activeBreed?.name || 'Your buddy';
  }

  // ── Configuration ──

  setDuration(minutes: number): void {
    if (this.state !== 'idle') return;
    this.durationMinutes = minutes;
    const seconds = minutes * 60;
    this.totalSecondsSubject.next(seconds);
    this.remainingSecondsSubject.next(seconds);
  }

  setSessionToken(token: string): void {
    this._sessionToken = token;
  }

  enablePomodoro(config: PomodoroConfig): void {
    this._pomodoroConfig = config;
    this._currentCycle = 1;
    this.currentCycleSubject.next(1);
    this._phase = 'work';
    this.phaseSubject.next('work');
    this.setDuration(config.workMinutes);
  }

  disablePomodoro(): void {
    this._pomodoroConfig = null;
    this._currentCycle = 1;
    this.currentCycleSubject.next(1);
    this._phase = 'work';
    this.phaseSubject.next('work');
  }

  // ── Timer lifecycle ──

  async start(): Promise<void> {
    if (this.state !== 'idle') return;

    this.soundService.play('start');
    this._startTime = new Date();
    this._sessionStartedAtMs = Date.now();
    this._phase = 'work';
    this.phaseSubject.next('work');

    await this.saveSession(this._startTime.getTime());
    this.startTimerInternal(this.remainingSeconds);

    this.liveActivityService.startActivity(
      this.remainingSeconds, this.totalSeconds, this.breedName,
    );
  }

  stop(): void {
    this.liveActivityService.endActivity(
      this.remainingSeconds, this.totalSeconds, this.breedName,
    );
    this.stopTimer();
    this.stopAllBackgroundServices();
    this.clearSession();
    this.resetInternal();
  }

  cancelGracefully(): void {
    this.stopTimer();
    this.stopAllBackgroundServices();
    this.clearSession();
    this.liveActivityService.endActivity(
      this.remainingSeconds, this.totalSeconds, this.breedName,
    );
    this.resetInternal();
  }

  failSession(): void {
    this.liveActivityService.endActivity(
      this.remainingSeconds, this.totalSeconds, this.breedName,
    );
    this.stopTimer();
    this.stopAllBackgroundServices();
    this.clearSession();
    this.soundService.play('failed');
    this.stateSubject.next('failed');
    this.sessionFailedSubject.next();
    setTimeout(() => this.resetInternal(), 100);
  }

  skipBreak(): void {
    if (!this.isOnBreak || !this._pomodoroConfig) return;
    this.stopTimer();
    this.startNextWorkCycle();
  }

  // ── Internals ──

  private async init() {
    await this.checkSavedSession();
    this.setupAppStateListener();
    this.requestNotificationPermission();
  }

  private async checkSavedSession() {
    try {
      const { value } = await Preferences.get({ key: SESSION_KEY });
      if (!value) return;

      const session: SavedSession = JSON.parse(value);
      const elapsed = Math.floor((Date.now() - session.startTime) / 1000);
      const remaining = session.totalSeconds - elapsed;

      this.durationMinutes = session.durationMinutes;
      this.totalSecondsSubject.next(session.totalSeconds);
      this._sessionToken = session.sessionToken || null;
      this._phase = session.phase || 'work';
      this.phaseSubject.next(this._phase);
      this._pomodoroConfig = session.pomodoroConfig || null;
      this._currentCycle = session.currentCycle || 1;
      this.currentCycleSubject.next(this._currentCycle);
      this._startTime = new Date(session.startTime);
      this._sessionStartedAtMs = session.startTime;

      if (remaining > 0) {
        this.remainingSecondsSubject.next(remaining);
        this.startTimerInternal(remaining);
      } else {
        this.remainingSecondsSubject.next(0);
        this.completePhase();
      }
    } catch (e) {
      console.error('Error checking saved session', e);
    }
  }

  private startTimerInternal(initialSeconds: number) {
    this.stateSubject.next('running');
    if (initialSeconds !== this.remainingSeconds) {
      this.remainingSecondsSubject.next(initialSeconds);
    }
    this.timerSubscription?.unsubscribe();

    this.timerSubscription = interval(1000).subscribe(() => {
      // Drift-proof: calculate from start time
      if (this._startTime) {
        const elapsed = Math.floor((Date.now() - this._startTime.getTime()) / 1000);
        const remaining = Math.max(0, this.totalSeconds - elapsed);
        this.remainingSecondsSubject.next(remaining);
        if (remaining <= 0) {
          this.completePhase();
        }
      } else {
        const v = this.remainingSeconds - 1;
        if (v <= 0) {
          this.remainingSecondsSubject.next(0);
          this.completePhase();
        } else {
          this.remainingSecondsSubject.next(v);
        }
      }
    });
  }

  private completePhase(): void {
    this.stopTimer();

    if (this._phase === 'work') {
      this.completeWorkPhase();
    } else {
      this.completeBreakPhase();
    }
  }

  private completeWorkPhase(): void {
    if (!this._pomodoroConfig) {
      this.completeSession();
      return;
    }

    this.soundService.play('complete');
    this.stateSubject.next('completed');
    this.sessionCompletedSubject.next();

    const cfg = this._pomodoroConfig;
    const isLastCycle = this._currentCycle >= cfg.totalCycles;

    if (isLastCycle) {
      const isLongBreak = true;
      this._phase = 'long_break';
      this.phaseSubject.next('long_break');
      const breakSecs = cfg.longBreakMinutes * 60;
      this.totalSecondsSubject.next(breakSecs);
      this.remainingSecondsSubject.next(breakSecs);
      this._startTime = new Date();
      this._sessionStartedAtMs = Date.now();
      this.breakStartedSubject.next({ cycle: this._currentCycle, isLongBreak });
      this.saveSession(this._startTime.getTime());
      this.stateSubject.next('idle');
    } else {
      this._phase = 'break';
      this.phaseSubject.next('break');
      const breakSecs = cfg.breakMinutes * 60;
      this.totalSecondsSubject.next(breakSecs);
      this.remainingSecondsSubject.next(breakSecs);
      this._startTime = new Date();
      this._sessionStartedAtMs = Date.now();
      this.breakStartedSubject.next({ cycle: this._currentCycle, isLongBreak: false });
      this.saveSession(this._startTime.getTime());
      this.stateSubject.next('idle');
    }
  }

  private completeBreakPhase(): void {
    this.soundService.play('start');
    this.stopAllBackgroundServices();

    if (this._phase === 'long_break') {
      this.pomodoroCompleteSubject.next();
      this.clearSession();
      this.resetInternal();
      return;
    }

    this._currentCycle++;
    this.currentCycleSubject.next(this._currentCycle);
    this.breakEndedSubject.next({ nextCycle: this._currentCycle });
    this.startNextWorkCycle();
  }

  private startNextWorkCycle(): void {
    if (!this._pomodoroConfig) return;
    this._phase = 'work';
    this.phaseSubject.next('work');
    const workSecs = this._pomodoroConfig.workMinutes * 60;
    this.totalSecondsSubject.next(workSecs);
    this.remainingSecondsSubject.next(workSecs);
    this._startTime = new Date();
    this._sessionStartedAtMs = Date.now();
    this.saveSession(this._startTime.getTime());
    this.stateSubject.next('idle');
  }

  startBreakTimer(): void {
    if (this.state !== 'idle' || !this.isOnBreak) return;
    this.startTimerInternal(this.remainingSeconds);

    this.liveActivityService.startActivity(
      this.remainingSeconds, this.totalSeconds, this.breedName,
    );
  }

  startWorkCycleTimer(): void {
    if (this.state !== 'idle' || this._phase !== 'work') return;
    this._startTime = new Date();
    this._sessionStartedAtMs = Date.now();
    this._sessionToken = null; // Will be set by home page after /focus/start
    this.saveSession(this._startTime.getTime());
    this.startTimerInternal(this.remainingSeconds);

    this.liveActivityService.startActivity(
      this.remainingSeconds, this.totalSeconds, this.breedName,
    );
  }

  private completeSession(): void {
    this.liveActivityService.endActivity(0, this.totalSeconds, this.breedName);
    this.stopAllBackgroundServices();
    this.clearSession();
    this.soundService.play('complete');
    this.stateSubject.next('completed');
    this.sessionCompletedSubject.next();
    setTimeout(() => this.resetInternal(), 100);
  }

  private stopTimer(): void {
    this.timerSubscription?.unsubscribe();
    this.timerSubscription = null;
  }

  private async saveSession(startTime: number) {
    const session: SavedSession = {
      startTime,
      durationMinutes: this.durationMinutes,
      totalSeconds: this.totalSeconds,
      breedName: this.breedName,
      sessionToken: this._sessionToken || undefined,
      phase: this._phase,
      pomodoroConfig: this._pomodoroConfig,
      currentCycle: this._currentCycle,
    };
    await Preferences.set({ key: SESSION_KEY, value: JSON.stringify(session) });
  }

  private async clearSession() {
    await Preferences.remove({ key: SESSION_KEY });
    this._startTime = null;
    this._sessionToken = null;
  }

  private resetInternal(): void {
    this.stopTimer();
    this._startTime = null;
    this.backgroundedAt = null;
    this._sessionStartedAtMs = 0;

    if (this._pomodoroConfig && this._phase !== 'work') {
      // Stay in current pomodoro state
    } else if (!this._pomodoroConfig) {
      this.remainingSecondsSubject.next(this.durationMinutes * 60);
      this.totalSecondsSubject.next(this.durationMinutes * 60);
    }

    this.stateSubject.next('idle');
  }

  reset(): void {
    this.stopTimer();
    this._pomodoroConfig = null;
    this._currentCycle = 1;
    this.currentCycleSubject.next(1);
    this._phase = 'work';
    this.phaseSubject.next('work');
    this._startTime = null;
    this.backgroundedAt = null;
    this._sessionStartedAtMs = 0;
    this._sessionToken = null;
    this.remainingSecondsSubject.next(this.durationMinutes * 60);
    this.totalSecondsSubject.next(this.durationMinutes * 60);
    this.stateSubject.next('idle');
  }

  formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // ── App lifecycle ──

  private setupAppStateListener(): void {
    try {
      App.addListener('appStateChange', ({ isActive }) => {
        this.ngZone.run(() => {
          if (this.state === 'running') {
            if (!isActive) this.handleAppBackground();
            else this.handleAppForeground();
          }
        });
      });
    } catch {
      // Web mode — no app state listener
    }
  }

  private async handleAppBackground(): Promise<void> {
    this.backgroundedAt = Date.now();
    if (Capacitor.getPlatform() === 'android') {
      await this.startAndroidForegroundService();
    }
  }

  private async handleAppForeground(): Promise<void> {
    if (this._startTime) {
      const elapsed = Math.floor((Date.now() - this._startTime.getTime()) / 1000);
      const remaining = this.totalSeconds - elapsed;
      if (remaining <= 0) {
        this.remainingSecondsSubject.next(0);
        this.completePhase();
      } else {
        this.remainingSecondsSubject.next(remaining);
      }
    } else if (this.backgroundedAt) {
      const elapsed = Math.floor((Date.now() - this.backgroundedAt) / 1000);
      const remaining = this.remainingSeconds - elapsed;
      if (remaining <= 0) {
        this.remainingSecondsSubject.next(0);
        this.completePhase();
      } else {
        this.remainingSecondsSubject.next(remaining);
      }
    }
    this.backgroundedAt = null;
    if (Capacitor.getPlatform() === 'android') {
      await this.stopAndroidForegroundService();
    }
  }

  // ── Notification / foreground service helpers ──

  private async requestNotificationPermission(): Promise<void> {
    try {
      await LocalNotifications.requestPermissions();
    } catch { /* not available */ }
  }

  private async startAndroidForegroundService(): Promise<void> {
    if (!ForegroundService) return;
    try {
      const t = this.formatTime(this.remainingSeconds);
      await ForegroundService.startForegroundService({
        id: 1000,
        title: `🐾 ${this.breedName} is eating!`,
        body: `Focus timer running — ${t} remaining`,
        smallIcon: 'ic_stat_icon_config_sample',
      });

      this.backgroundUpdateInterval = setInterval(async () => {
        if (!this.backgroundedAt || !ForegroundService) return;
        const elapsed = Math.floor((Date.now() - this.backgroundedAt) / 1000);
        const est = Math.max(0, this.remainingSeconds - elapsed);
        if (est <= 0) {
          await this.scheduleCompletionNotification();
          this.stopAndroidForegroundService();
        } else {
          try {
            await ForegroundService!.updateForegroundService({
              id: 1000,
              title: `🐾 ${this.breedName} is eating!`,
              body: `Focus timer running — ${this.formatTime(est)} remaining`,
              smallIcon: 'ic_stat_icon_config_sample',
            });
          } catch { /* ignore */ }
        }
      }, 30000);
    } catch {
      this.scheduleBackgroundNotification();
    }
  }

  private async stopAndroidForegroundService(): Promise<void> {
    if (this.backgroundUpdateInterval) {
      clearInterval(this.backgroundUpdateInterval);
      this.backgroundUpdateInterval = null;
    }
    if (!ForegroundService) return;
    try { await ForegroundService.stopForegroundService(); } catch { /* ignore */ }
  }

  private async scheduleBackgroundNotification(): Promise<void> {
    try {
      await LocalNotifications.schedule({
        notifications: [{
          id: 1,
          title: `🐾 ${this.breedName} is still eating!`,
          body: `Focus timer running — ${this.formatTime(this.remainingSeconds)} remaining.`,
          schedule: { at: new Date(Date.now() + 1000) },
        }],
      });
    } catch { /* ignore */ }
  }

  private async scheduleCompletionNotification(): Promise<void> {
    try {
      await LocalNotifications.schedule({
        notifications: [{
          id: 2,
          title: `🎉 ${this.breedName} finished eating!`,
          body: 'Great focus session! Come back to collect your kibble.',
          schedule: { at: new Date(Date.now() + 500) },
        }],
      });
    } catch { /* ignore */ }
  }

  private async stopAllBackgroundServices(): Promise<void> {
    this.backgroundedAt = null;
    if (this.backgroundUpdateInterval) {
      clearInterval(this.backgroundUpdateInterval);
      this.backgroundUpdateInterval = null;
    }
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
      await this.stopAndroidForegroundService();
    }
    try {
      await LocalNotifications.cancel({ notifications: [{ id: 1 }, { id: 2 }] });
    } catch { /* ignore */ }
  }
}

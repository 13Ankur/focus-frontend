import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications, ScheduleOptions, LocalNotificationSchema } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { Preferences } from '@capacitor/preferences';
import { StatsService } from './stats.service';
import { BreedService } from './breed.service';

export interface NotificationPreferences {
  enabled: boolean;
  streakReminders: boolean;
  dailyReminder: boolean;
  reminderTime: string; // "HH:mm" format
  buddyHungerAlerts: boolean;
  weeklySummary: boolean;
}

const DEFAULT_PREFS: NotificationPreferences = {
  enabled: true,
  streakReminders: true,
  dailyReminder: true,
  reminderTime: '09:00',
  buddyHungerAlerts: true,
  weeklySummary: true,
};

// Stable IDs for each notification type to allow cancel/replace
const NOTIF_ID = {
  STREAK_RISK: 1001,
  DAILY_GOAL: 1002,
  BUDDY_HUNGER: 1003,
  WEEKLY_SUMMARY: 1004,
  TRIAL_EXPIRY: 1005,
  INACTIVITY_3DAY: 1006,
  INACTIVITY_7DAY: 1007,
  STREAK_CELEBRATION_BASE: 2000, // 2000 + streak milestone
};

const STREAK_MILESTONES = [7, 14, 30, 60, 100];

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private prefs: NotificationPreferences = { ...DEFAULT_PREFS };
  private permissionGranted = false;
  private initialized = false;

  constructor(
    private router: Router,
    private statsService: StatsService,
    private breedService: BreedService,
  ) { }

  // ── Initialization ──

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    await this.loadPreferences();

    if (!this.prefs.enabled) return;

    if (Capacitor.isNativePlatform()) {
      await this.requestPermission();
      await this.registerPushNotifications();
      this.setupNotificationListeners();
    }

    await this.scheduleAllNotifications();
  }

  private async requestPermission(): Promise<boolean> {
    try {
      let permStatus = await LocalNotifications.checkPermissions();
      if (permStatus.display === 'prompt' || permStatus.display === 'prompt-with-rationale') {
        permStatus = await LocalNotifications.requestPermissions();
      }
      this.permissionGranted = permStatus.display === 'granted';
      return this.permissionGranted;
    } catch {
      this.permissionGranted = false;
      return false;
    }
  }

  private async registerPushNotifications(): Promise<void> {
    try {
      let permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }
      if (permStatus.receive === 'granted') {
        await PushNotifications.register();
      }
    } catch {
      // Push not available (web, or user denied)
    }
  }

  private setupNotificationListeners(): void {
    LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
      this.onNotificationTapped(notification.notification);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
      const data = notification.notification.data;
      if (data?.route) {
        this.router.navigate([data.route]);
      } else {
        this.router.navigate(['/tabs/home']);
      }
    });

    PushNotifications.addListener('registration', (token) => {
      console.log('Push registration token:', token.value);
      // Store token for backend push sending
      localStorage.setItem('push_token', token.value);
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.warn('Push registration failed:', err.error);
    });
  }

  private onNotificationTapped(notification: any): void {
    const extra = notification.extra || {};
    const route = extra.route || '/tabs/home';
    this.router.navigate([route]);
  }

  // ── Preferences ──

  async loadPreferences(): Promise<NotificationPreferences> {
    try {
      const { value } = await Preferences.get({ key: 'notification_prefs' });
      if (value) {
        this.prefs = { ...DEFAULT_PREFS, ...JSON.parse(value) };
      }
    } catch {
      this.prefs = { ...DEFAULT_PREFS };
    }
    return this.prefs;
  }

  async savePreferences(prefs: Partial<NotificationPreferences>): Promise<void> {
    this.prefs = { ...this.prefs, ...prefs };
    await Preferences.set({ key: 'notification_prefs', value: JSON.stringify(this.prefs) });
  }

  async updateNotificationPreferences(prefs: Partial<NotificationPreferences>): Promise<void> {
    const wasEnabled = this.prefs.enabled;
    await this.savePreferences(prefs);

    if (!this.prefs.enabled) {
      await this.cancelAllNotifications();
      return;
    }

    if (!wasEnabled && this.prefs.enabled) {
      if (Capacitor.isNativePlatform()) {
        const granted = await this.requestPermission();
        if (!granted) {
          this.prefs.enabled = false;
          await this.savePreferences({ enabled: false });
          return;
        }
      }
    }

    await this.scheduleAllNotifications();
  }

  getPreferences(): NotificationPreferences {
    return { ...this.prefs };
  }

  // ── Schedule All ──

  async scheduleAllNotifications(): Promise<void> {
    if (!this.prefs.enabled || !Capacitor.isNativePlatform()) return;

    // Check permission before scheduling
    const hasPermission = await this.checkPermissionStatus();
    if (!hasPermission) {
      console.warn('Cannot schedule notifications: permission not granted');
      return;
    }

    await this.cancelAllNotifications();

    if (this.prefs.streakReminders) await this.scheduleStreakReminder();
    if (this.prefs.dailyReminder) await this.scheduleDailyGoalReminder();
    if (this.prefs.buddyHungerAlerts) await this.scheduleBuddyHungerCheck();
    if (this.prefs.weeklySummary) await this.scheduleWeeklySummary();
    await this.scheduleInactivityReminders();
  }

  async cancelAllNotifications(): Promise<void> {
    try {
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel({
          notifications: pending.notifications.map(n => ({ id: n.id })),
        });
      }
    } catch {
      // Ignore cancel errors
    }
  }

  // ── Streak Risk Reminder ──

  async scheduleStreakReminder(): Promise<void> {
    if (!this.prefs.enabled || !this.prefs.streakReminders) return;

    const stats = this.statsService.stats;
    const today = new Date().toISOString().slice(0, 10);
    const todayStats = this.statsService.getTodayStats();

    // If already completed a session today, schedule for tomorrow
    if (todayStats.sessionsCompleted > 0) {
      await this.scheduleStreakReminderForTomorrow();
      return;
    }

    const streak = stats.currentStreak;
    if (streak < 1) return; // No streak to protect

    const breedName = this.breedService.activeBreed?.name || 'Your buddy';

    const now = new Date();
    const scheduledDate = new Date();
    scheduledDate.setHours(20, 0, 0, 0); // 8 PM

    // If it's already past 8 PM, skip today
    if (now > scheduledDate) return;

    try {
      await LocalNotifications.schedule({
        notifications: [{
          id: NOTIF_ID.STREAK_RISK,
          title: `🐾 ${breedName} is hungry!`,
          body: `Complete a quick session to keep your ${streak}-day streak alive!`,
          schedule: { at: scheduledDate },
          sound: 'default',
          extra: { route: '/tabs/home', type: 'streak_risk' },
          channelId: 'focus_reminders',
        }],
      });
    } catch (e) {
      console.warn('Failed to schedule streak reminder:', e);
    }
  }

  private async scheduleStreakReminderForTomorrow(): Promise<void> {
    const stats = this.statsService.stats;
    const streak = stats.currentStreak;
    if (streak < 1) return;

    const breedName = this.breedService.activeBreed?.name || 'Your buddy';

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(20, 0, 0, 0);

    try {
      await LocalNotifications.schedule({
        notifications: [{
          id: NOTIF_ID.STREAK_RISK,
          title: `🐾 ${breedName} is hungry!`,
          body: `Complete a quick session to keep your ${streak + 1}-day streak alive!`,
          schedule: { at: tomorrow },
          sound: 'default',
          extra: { route: '/tabs/home', type: 'streak_risk' },
          channelId: 'focus_reminders',
        }],
      });
    } catch (e) {
      console.warn('Failed to schedule tomorrow streak reminder:', e);
    }
  }

  async cancelStreakReminderForToday(): Promise<void> {
    try {
      await LocalNotifications.cancel({ notifications: [{ id: NOTIF_ID.STREAK_RISK }] });
    } catch { /* ignore */ }
  }

  // ── Daily Goal Reminder ──

  async scheduleDailyGoalReminder(): Promise<void> {
    if (!this.prefs.enabled || !this.prefs.dailyReminder) return;

    const [hours, minutes] = this.prefs.reminderTime.split(':').map(Number);
    const breedName = this.breedService.activeBreed?.name || 'Your buddy';
    const dailyGoal = parseInt(localStorage.getItem('paws_daily_goal') || '60', 10);

    const now = new Date();
    const scheduledDate = new Date();
    scheduledDate.setHours(hours, minutes, 0, 0);

    if (now > scheduledDate) {
      scheduledDate.setDate(scheduledDate.getDate() + 1);
    }

    try {
      await LocalNotifications.schedule({
        notifications: [{
          id: NOTIF_ID.DAILY_GOAL,
          title: 'Good morning! Ready to focus?',
          body: `Your goal: ${dailyGoal} minutes today. ${breedName} is waiting!`,
          schedule: {
            at: scheduledDate,
            every: 'day',
          },
          sound: 'default',
          extra: { route: '/tabs/home', type: 'daily_goal' },
          channelId: 'focus_reminders',
        }],
      });
    } catch (e) {
      console.warn('Failed to schedule daily goal reminder:', e);
    }
  }

  // ── Buddy Hunger Alert ──

  async scheduleBuddyHungerCheck(): Promise<void> {
    if (!this.prefs.enabled || !this.prefs.buddyHungerAlerts) return;

    const today = new Date().toISOString().slice(0, 10);
    const lastHungerAlert = localStorage.getItem('last_hunger_alert_date');
    if (lastHungerAlert === today) return; // Max 1 per day

    const fullness = parseInt(localStorage.getItem('buddy_fullness') || '70', 10);
    if (fullness >= 30) return;

    const breedName = this.breedService.activeBreed?.name || 'Your buddy';

    const scheduledDate = new Date();
    scheduledDate.setMinutes(scheduledDate.getMinutes() + 5);

    try {
      await LocalNotifications.schedule({
        notifications: [{
          id: NOTIF_ID.BUDDY_HUNGER,
          title: `${breedName} is getting hungry 😢`,
          body: 'Start a focus session to feed your buddy!',
          schedule: { at: scheduledDate },
          sound: 'default',
          extra: { route: '/tabs/home', type: 'buddy_hunger' },
          channelId: 'focus_reminders',
        }],
      });
      localStorage.setItem('last_hunger_alert_date', today);
    } catch (e) {
      console.warn('Failed to schedule buddy hunger alert:', e);
    }
  }

  // ── Weekly Summary ──

  async scheduleWeeklySummary(): Promise<void> {
    if (!this.prefs.enabled || !this.prefs.weeklySummary) return;

    // Schedule for next Sunday at 6 PM
    const now = new Date();
    const nextSunday = new Date(now);
    const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
    nextSunday.setDate(now.getDate() + daysUntilSunday);
    nextSunday.setHours(18, 0, 0, 0);

    if (nextSunday <= now) {
      nextSunday.setDate(nextSunday.getDate() + 7);
    }

    try {
      await LocalNotifications.schedule({
        notifications: [{
          id: NOTIF_ID.WEEKLY_SUMMARY,
          title: '📊 Your weekly focus summary',
          body: 'Tap to see how much you accomplished this week!',
          schedule: {
            at: nextSunday,
            every: 'week',
          },
          sound: 'default',
          extra: { route: '/tabs/profile', type: 'weekly_summary' },
          channelId: 'focus_reminders',
        }],
      });
    } catch (e) {
      console.warn('Failed to schedule weekly summary:', e);
    }
  }

  // ── Streak Celebration ──

  async checkAndScheduleStreakCelebration(currentStreak: number): Promise<void> {
    if (!this.prefs.enabled) return;

    if (!STREAK_MILESTONES.includes(currentStreak)) return;

    try {
      const scheduledDate = new Date();
      scheduledDate.setSeconds(scheduledDate.getSeconds() + 5);

      await LocalNotifications.schedule({
        notifications: [{
          id: NOTIF_ID.STREAK_CELEBRATION_BASE + currentStreak,
          title: `🔥 Amazing! ${currentStreak}-day streak!`,
          body: "You're on fire! Keep the momentum going.",
          schedule: { at: scheduledDate },
          sound: 'default',
          extra: { route: '/tabs/profile', type: 'streak_celebration' },
          channelId: 'achievements',
        }],
      });
    } catch (e) {
      console.warn('Failed to schedule streak celebration:', e);
    }
  }

  // ── Trial Expiry Warning ──

  async scheduleTrialExpiryWarning(_trialEndDate: string | Date): Promise<void> {
    // Paywall disabled — no trial expiry warnings
  }

  // ── Inactivity Re-engagement ──

  async scheduleInactivityReminders(): Promise<void> {
    if (!this.prefs.enabled) return;

    const breedName = this.breedService.activeBreed?.name || 'Your buddy';

    // 3 days from now
    const threeDay = new Date();
    threeDay.setDate(threeDay.getDate() + 3);
    threeDay.setHours(18, 0, 0, 0);

    // 7 days from now
    const sevenDay = new Date();
    sevenDay.setDate(sevenDay.getDate() + 7);
    sevenDay.setHours(18, 0, 0, 0);

    const stats = this.statsService.stats;

    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: NOTIF_ID.INACTIVITY_3DAY,
            title: `${breedName} misses you! 🐾`,
            body: "It's been a while. Come back for a quick focus session!",
            schedule: { at: threeDay },
            sound: 'default',
            extra: { route: '/tabs/home', type: 'inactivity' },
            channelId: 'focus_reminders',
          },
          {
            id: NOTIF_ID.INACTIVITY_7DAY,
            title: `${breedName} misses you! 🐾`,
            body: stats.currentStreak > 0
              ? `Your ${stats.currentStreak}-day streak was impressive! Ready to start a new one?`
              : 'Come back for a quick focus session!',
            schedule: { at: sevenDay },
            sound: 'default',
            extra: { route: '/tabs/home', type: 'inactivity' },
            channelId: 'focus_reminders',
          },
        ],
      });
    } catch (e) {
      console.warn('Failed to schedule inactivity reminders:', e);
    }
  }

  // ── Session Complete Hook ──

  async onSessionCompleted(currentStreak: number): Promise<void> {
    // Cancel today's streak reminder since user already completed a session
    await this.cancelStreakReminderForToday();

    // Reschedule streak reminder for tomorrow
    if (this.prefs.streakReminders) {
      await this.scheduleStreakReminderForTomorrow();
    }

    // Cancel inactivity reminders (user is active) and reschedule from today
    try {
      await LocalNotifications.cancel({
        notifications: [
          { id: NOTIF_ID.INACTIVITY_3DAY },
          { id: NOTIF_ID.INACTIVITY_7DAY },
        ],
      });
    } catch { /* ignore */ }
    await this.scheduleInactivityReminders();

    // Check streak milestone celebrations
    await this.checkAndScheduleStreakCelebration(currentStreak);
  }

  // ── App Background Hook ──

  async onAppBackgrounded(): Promise<void> {
    if (!this.prefs.enabled || !this.prefs.buddyHungerAlerts) return;
    await this.scheduleBuddyHungerCheck();
  }

  // ── Android Notification Channels ──

  async createNotificationChannels(): Promise<void> {
    if (Capacitor.getPlatform() !== 'android') return;

    try {
      await LocalNotifications.createChannel({
        id: 'focus_reminders',
        name: 'Focus Reminders',
        description: 'Streak reminders, daily goals, and buddy alerts',
        importance: 3, // DEFAULT
        sound: 'default',
        vibration: true,
      });

      await LocalNotifications.createChannel({
        id: 'achievements',
        name: 'Achievements',
        description: 'Streak milestones and achievement celebrations',
        importance: 3,
        sound: 'default',
        vibration: true,
      });
    } catch (e) {
      console.warn('Failed to create notification channels:', e);
    }
  }

  // ── Permission Check ──

  get isPermissionGranted(): boolean {
    return this.permissionGranted;
  }

  async checkPermissionStatus(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    try {
      const status = await LocalNotifications.checkPermissions();
      this.permissionGranted = status.display === 'granted';
      return this.permissionGranted;
    } catch {
      return false;
    }
  }
}

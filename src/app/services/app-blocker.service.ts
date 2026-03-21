import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { LocalNotifications } from '@capacitor/local-notifications';

// ── Native plugin interface ──

export interface AppInfo {
  id: string;
  name: string;
  icon?: string;
  category: 'social' | 'entertainment' | 'news' | 'games' | 'shopping' | 'productivity' | 'other';
}

interface AppBlockerPluginInterface {
  isSupported(): Promise<{ supported: boolean; reason?: string }>;
  requestPermission(): Promise<{ granted: boolean }>;
  checkPermission(): Promise<{ granted: boolean }>;
  getInstalledApps(): Promise<{ apps: AppInfo[] }>;
  startBlocking(options: { appIds: string[]; strictMode: boolean; breedName: string; sessionEndTime: number }): Promise<void>;
  stopBlocking(): Promise<void>;
  isBlocking(): Promise<{ blocking: boolean }>;
}

let NativeAppBlocker: AppBlockerPluginInterface | null = null;
if (Capacitor.isNativePlatform()) {
  NativeAppBlocker = registerPlugin<AppBlockerPluginInterface>('AppBlocker');
}

// ── Preferences keys ──

const PREFS_BLOCK_ENABLED = 'paws_block_enabled';
const PREFS_STRICT_MODE = 'paws_block_strict';
const PREFS_BLOCK_LIST = 'paws_block_list';
const PREFS_BLOCK_STATE = 'paws_block_state';

// ── Exported types ──

export interface BlockingState {
  active: boolean;
  startTime: number | null;
  endTime: number | null;
  appCount: number;
}

// Apps that must NEVER be blocked
const ESSENTIAL_BUNDLES = new Set([
  'com.apple.mobilephone',       // iPhone Phone
  'com.apple.MobileSMS',         // iMessage
  'com.apple.Maps',              // Apple Maps
  'com.apple.camera',            // Camera
  'com.apple.emergencysos',      // Emergency SOS
  'com.apple.Health',            // Health
  'com.android.phone',           // Android Phone
  'com.android.contacts',        // Android Contacts
  'com.google.android.apps.maps', // Google Maps
  'com.android.camera',          // Camera
  'com.android.emergency',       // Emergency
  'com.focusapp.buddy',          // StayPaws itself
]);

// Well-known social/entertainment apps for quick-select
const SOCIAL_MEDIA_IDS = [
  'com.instagram.android', 'com.zhiliaoapp.musically', // TikTok
  'com.twitter.android', 'com.snapchat.android',
  'com.facebook.katana', 'com.facebook.orca', // FB Messenger
  'com.reddit.frontpage', 'com.discord',
  'com.pinterest', 'com.tumblr',
  // iOS equivalents
  'com.burbn.instagram', 'com.zhiliaoapp.musically',
  'com.atebits.Tweetie2', 'com.toyopagroup.picaboo',
  'com.facebook.Facebook', 'com.facebook.Messenger',
  'com.reddit.Reddit', 'com.hammerandchisel.discord',
];

@Injectable({ providedIn: 'root' })
export class AppBlockerService implements OnDestroy {
  private _blockingEnabled = false;
  private _strictMode = false;
  private _blockList: string[] = [];
  private _blockingState: BlockingState = { active: false, startTime: null, endTime: null, appCount: 0 };
  private _permissionGranted = false;
  private _supported = false;
  private _reminderInterval: any = null;

  private blockingStateSubject = new BehaviorSubject<BlockingState>(this._blockingState);
  blockingState$ = this.blockingStateSubject.asObservable();

  private enabledSubject = new BehaviorSubject<boolean>(false);
  enabled$ = this.enabledSubject.asObservable();

  constructor() {
    this.loadPreferences();
  }

  ngOnDestroy(): void {
    this.clearReminderInterval();
  }

  // ── Public getters ──

  get isSupported(): boolean { return this._supported; }
  get isEnabled(): boolean { return this._blockingEnabled; }
  get isStrictMode(): boolean { return this._strictMode; }
  get blockList(): string[] { return [...this._blockList]; }
  get blockListCount(): number { return this._blockList.length; }
  get isBlocking(): boolean { return this._blockingState.active; }
  get permissionGranted(): boolean { return this._permissionGranted; }

  // ── Initialization ──

  async initialize(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      this._supported = false;
      return;
    }

    try {
      if (NativeAppBlocker) {
        const { supported } = await NativeAppBlocker.isSupported();
        this._supported = supported;
        if (supported) {
          const { granted } = await NativeAppBlocker.checkPermission();
          this._permissionGranted = granted;
        }
      }
    } catch {
      this._supported = false;
    }

    await this.loadPreferences();
    await this.checkOrphanedBlockingState();
  }

  // ── Permission management ──

  async checkPermission(): Promise<boolean> {
    if (!NativeAppBlocker || !this._supported) return false;
    try {
      const { granted } = await NativeAppBlocker.checkPermission();
      this._permissionGranted = granted;
      return granted;
    } catch {
      return false;
    }
  }

  async requestPermission(): Promise<boolean> {
    if (!NativeAppBlocker || !this._supported) return false;
    try {
      const { granted } = await NativeAppBlocker.requestPermission();
      this._permissionGranted = granted;
      return granted;
    } catch {
      return false;
    }
  }

  // ── App discovery ──

  async getBlockableApps(): Promise<AppInfo[]> {
    if (!NativeAppBlocker || !this._supported || !this._permissionGranted) return [];
    try {
      const { apps } = await NativeAppBlocker.getInstalledApps();
      return apps.filter(app => !ESSENTIAL_BUNDLES.has(app.id));
    } catch {
      return [];
    }
  }

  getSocialMediaIds(): string[] {
    return SOCIAL_MEDIA_IDS;
  }

  isEssentialApp(appId: string): boolean {
    return ESSENTIAL_BUNDLES.has(appId);
  }

  // ── Configuration ──

  async setEnabled(enabled: boolean): Promise<void> {
    this._blockingEnabled = enabled;
    this.enabledSubject.next(enabled);
    await Preferences.set({ key: PREFS_BLOCK_ENABLED, value: String(enabled) });
  }

  async setStrictMode(strict: boolean): Promise<void> {
    this._strictMode = strict;
    await Preferences.set({ key: PREFS_STRICT_MODE, value: String(strict) });
  }

  async setBlockList(appIds: string[]): Promise<void> {
    this._blockList = appIds.filter(id => !ESSENTIAL_BUNDLES.has(id));
    await Preferences.set({ key: PREFS_BLOCK_LIST, value: JSON.stringify(this._blockList) });
  }

  async addToBlockList(appId: string): Promise<void> {
    if (ESSENTIAL_BUNDLES.has(appId) || this._blockList.includes(appId)) return;
    this._blockList.push(appId);
    await Preferences.set({ key: PREFS_BLOCK_LIST, value: JSON.stringify(this._blockList) });
  }

  async removeFromBlockList(appId: string): Promise<void> {
    this._blockList = this._blockList.filter(id => id !== appId);
    await Preferences.set({ key: PREFS_BLOCK_LIST, value: JSON.stringify(this._blockList) });
  }

  isInBlockList(appId: string): boolean {
    return this._blockList.includes(appId);
  }

  // ── Blocking lifecycle ──

  async startBlocking(breedName: string, sessionDurationMinutes: number): Promise<boolean> {
    if (!this._blockingEnabled || this._blockList.length === 0) return false;

    const endTime = Date.now() + sessionDurationMinutes * 60 * 1000;

    if (NativeAppBlocker && this._supported && this._permissionGranted) {
      try {
        await NativeAppBlocker.startBlocking({
          appIds: this._blockList,
          strictMode: this._strictMode,
          breedName,
          sessionEndTime: endTime,
        });
      } catch (err) {
        console.warn('Native blocking failed, falling back to reminder mode:', err);
        this.startReminderMode(breedName);
      }
    } else {
      this.startReminderMode(breedName);
    }

    this._blockingState = { active: true, startTime: Date.now(), endTime, appCount: this._blockList.length };
    this.blockingStateSubject.next(this._blockingState);
    await this.saveBlockingState();
    return true;
  }

  async stopBlocking(): Promise<void> {
    if (NativeAppBlocker && this._supported) {
      try {
        await NativeAppBlocker.stopBlocking();
      } catch { /* ignore */ }
    }

    this.clearReminderInterval();

    this._blockingState = { active: false, startTime: null, endTime: null, appCount: 0 };
    this.blockingStateSubject.next(this._blockingState);
    await this.saveBlockingState();
  }

  // ── Fallback: Focus Reminder Mode ──
  // Fires local notifications every 30s when user leaves the app during a session.

  private startReminderMode(breedName: string): void {
    this.clearReminderInterval();

    const tips = [
      `${breedName} is still eating! Come back to stay focused.`,
      `Don't leave ${breedName} alone! Your focus session is active.`,
      `Stay focused! ${breedName} needs you to keep going.`,
      `Your focus timer is running. Get back to StayPaws!`,
    ];

    let tipIndex = 0;
    this._reminderInterval = setInterval(async () => {
      try {
        await LocalNotifications.schedule({
          notifications: [{
            id: 9999,
            title: `🐾 ${breedName} misses you!`,
            body: tips[tipIndex % tips.length],
            schedule: { at: new Date(Date.now() + 500) },
            sound: undefined,
            smallIcon: 'ic_stat_icon_config_sample',
          }],
        });
        tipIndex++;
      } catch { /* notification permission may not be granted */ }
    }, 30000);
  }

  private clearReminderInterval(): void {
    if (this._reminderInterval) {
      clearInterval(this._reminderInterval);
      this._reminderInterval = null;
    }
  }

  // ── Persistence ──

  private async loadPreferences(): Promise<void> {
    try {
      const { value: enabledVal } = await Preferences.get({ key: PREFS_BLOCK_ENABLED });
      this._blockingEnabled = enabledVal === 'true';
      this.enabledSubject.next(this._blockingEnabled);

      const { value: strictVal } = await Preferences.get({ key: PREFS_STRICT_MODE });
      this._strictMode = strictVal === 'true';

      const { value: listVal } = await Preferences.get({ key: PREFS_BLOCK_LIST });
      if (listVal) {
        try { this._blockList = JSON.parse(listVal); } catch { this._blockList = []; }
      }
    } catch { /* Preferences unavailable on web */ }
  }

  private async saveBlockingState(): Promise<void> {
    try {
      await Preferences.set({ key: PREFS_BLOCK_STATE, value: JSON.stringify(this._blockingState) });
    } catch { /* ignore */ }
  }

  private async checkOrphanedBlockingState(): Promise<void> {
    try {
      const { value } = await Preferences.get({ key: PREFS_BLOCK_STATE });
      if (!value) return;
      const state: BlockingState = JSON.parse(value);
      if (state.active && state.endTime && Date.now() > state.endTime) {
        await this.stopBlocking();
      }
    } catch { /* ignore */ }
  }
}

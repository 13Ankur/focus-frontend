import { Injectable, Injector } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { safeGetItem, safeSetItem, safeRemoveItem } from '../utils/storage';
import { accountIsPro, normalizeTier, subscriptionFromStatus, writeSubscriptionFields } from '../utils/subscription-access';
import { BehaviorSubject, Observable, tap, catchError, from, switchMap, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiService } from './api.service';
import { BreedService } from './breed.service';
import { RevenueCatService } from './revenue-cat.service';
import { RazorpayService } from './razorpay.service';
import { FocusSoundService } from './focus-sound.service';

// Import Capacitor plugins
// import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { registerPlugin } from '@capacitor/core';

// Custom Apple Sign-In plugin interface (native iOS implementation)
interface AppleSignInResponse {
  response: {
    user: string;
    identityToken: string;
    authorizationCode: string;
    email: string;
    givenName: string;
    familyName: string;
  };
}

interface AppleSignInPlugin {
  authorize(): Promise<AppleSignInResponse>;
}

// Register our custom native Apple Sign-In plugin (v2 - disabled)
// const AppleSignIn = registerPlugin<AppleSignInPlugin>('AppleSignIn');

export interface User {
  _id: string;
  id?: string; // Alias for _id
  username: string;
  email: string;
  totalKibble: number;
  totalFocusMinutes: number;
  token?: string;
  kibble?: number;
  avatar?: string;
  provider?: 'email' | 'google' | 'apple';
  emailVerified?: boolean;
  createdAt?: string;
  subscriptionTier?: string;
  isPremium?: boolean;
  onboardingCompleted?: boolean;
  dailyGoalMinutes?: number;
  focusTags?: string[];
  settings?: {
    soundEnabled: boolean;
    notificationsEnabled: boolean;
    vibrationEnabled: boolean;
    theme: 'system' | 'light' | 'dark';
    defaultTimerDuration: number;
  };
  notificationPrefs?: {
    streakReminders: boolean;
    dailyReminder: boolean;
    reminderTime: string;
    buddyHungerAlerts: boolean;
    weeklySummary: boolean;
  };
}

export interface AuthResponse {
  _id: string;
  username: string;
  email: string;
  totalKibble: number;
  totalFocusMinutes: number;
  token: string;
  avatar?: string;
  emailVerified?: boolean;
  onboardingCompleted?: boolean;
  dailyGoalMinutes?: number;
  focusTags?: string[];
  settings?: any;
  notificationPrefs?: any;
}

export interface SignupResponse {
  message: string;
  email: string;
  userId: string;
  requiresVerification: boolean;
}

export interface OTPVerifyResponse {
  message: string;
  emailVerified: boolean;
  _id: string;
  username: string;
  email: string;
  totalKibble: number;
  totalFocusMinutes: number;
  token: string;
  onboardingCompleted?: boolean;
  dailyGoalMinutes?: number;
  focusTags?: string[];
  settings?: any;
  notificationPrefs?: any;
}

export interface ResendOTPResponse {
  message: string;
  userId?: string;
  email?: string;
  resendCount?: number;
  waitSeconds?: number;
  emailVerified?: boolean;
}

export interface ForgotPasswordResponse {
  message: string;
  userId?: string;
  email?: string;
}

export interface VerifyResetOTPResponse {
  message: string;
  resetToken: string;
  userId: string;
}

export interface ProfileResponse {
  user: User;
  stats: {
    totalSessions: number;
    completedSessions: number;
    failedSessions: number;
    completionRate: number;
  };
  recentSessions: any[];
}

export interface SocialLoginResponse {
  _id: string;
  username: string;
  email: string;
  totalKibble: number;
  totalFocusMinutes: number;
  token: string;
  avatar?: string;
  isNewUser?: boolean;
  emailVerified?: boolean;
}

export interface LoginErrorResponse {
  message: string;
  emailVerified?: boolean;
  email?: string;
  userId?: string;
  requiresVerification?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  /** Bumps on login/logout so cached Ionic tabs can drop the previous account's UI. */
  private accountEpochSubject = new BehaviorSubject(0);
  public accountEpoch$ = this.accountEpochSubject.asObservable();
  private lastAccountId: string | null = null;

  private _breedService: BreedService | null = null;
  private _revenueCatService: RevenueCatService | null = null;
  private _focusSoundService: FocusSoundService | null = null;

  constructor(
    private http: HttpClient,
    private apiService: ApiService,
    private razorpayService: RazorpayService,
    private injector: Injector,
  ) {
    this.loadStoredUser();
    // this.initializeGoogleAuth();
  }

  private get breedService(): BreedService {
    if (!this._breedService) {
      this._breedService = this.injector.get(BreedService);
    }
    return this._breedService;
  }

  private get revenueCatService(): RevenueCatService {
    if (!this._revenueCatService) {
      this._revenueCatService = this.injector.get(RevenueCatService);
    }
    return this._revenueCatService;
  }

  private get focusSoundService(): FocusSoundService {
    if (!this._focusSoundService) {
      this._focusSoundService = this.injector.get(FocusSoundService);
    }
    return this._focusSoundService;
  }

  /*
  private async initializeGoogleAuth(): Promise<void> {
    // ...
  }
  */

  private loadStoredUser(): void {
    const stored = safeGetItem('focus_user');
    if (stored) {
      try {
        const user = JSON.parse(stored);
        user.kibble = user.totalKibble || user.kibble || 0;
        this.currentUserSubject.next(user);
        this.rememberOnboarding(user);
        if (user.token) {
          this.apiService.setToken(user.token);
        }
      } catch {
        safeRemoveItem('focus_user');
      }
    }
  }

  private storeUser(user: User): void {
    user.kibble = user.totalKibble;
    safeSetItem('focus_user', JSON.stringify(user));
    this.rememberOnboarding(user);
    const accountId = user._id || user.id || null;
    const switched = accountId !== this.lastAccountId;
    this.lastAccountId = accountId;
    this.currentUserSubject.next(user);
    if (switched) {
      this.accountEpochSubject.next(this.accountEpochSubject.value + 1);
    }

    if (user.token) {
      this.apiService.setToken(user.token);
    }
  }

  /** Onboarding belongs to the account, not this phone. Restore it after logout clears local flags. */
  private rememberOnboarding(user: User): void {
    if (user.onboardingCompleted) {
      safeSetItem('onboarding_complete', 'true');
      if (user.dailyGoalMinutes) safeSetItem('paws_daily_goal', String(user.dailyGoalMinutes));
      if (Array.isArray(user.focusTags)) safeSetItem('paws_focus_tags', JSON.stringify(user.focusTags));
    } else if (user.token) {
      safeRemoveItem('onboarding_complete');
    }
  }

  private async syncBreedDataAfterLogin(): Promise<void> {
    try {
      this.breedService.resetCollection();
      await this.breedService.syncWithServer();
    } catch (e) {
      console.error('Failed to sync breed data after login:', e);
    }
  }

  get currentUser(): User | null {
    return this.currentUserSubject.value;
  }

  get token(): string | null {
    return this.currentUser?.token || null;
  }

  getToken(): string | null {
    return this.token;
  }

  get isLoggedIn(): boolean {
    return !!this.currentUser;
  }

  getAuthHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`
    });
  }

  // ==================== Email Auth ====================

  signup(username: string, email: string, password: string): Observable<SignupResponse> {
    return this.http.post<SignupResponse>(`${this.apiUrl}/auth/signup`, {
      username,
      email,
      password
    });
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/login`, {
      email,
      password
    }).pipe(
      switchMap(response => {
        this.storeUser(this.userFromAuthResponse(response, 'email'));
        // Wait for breed + subscription sync so home never paints the previous Pro UI.
        return from(this.afterLogin(response._id, response.token)).pipe(map(() => response));
      })
    );
  }

  /** Build a clean per-account user so the previous Pro session cannot leak in. */
  private userFromAuthResponse(
    response: AuthResponse & {
      isPremium?: boolean;
      subscriptionTier?: string;
      subscriptionExpiry?: string;
      trialEndDate?: string;
      trialUsed?: boolean;
    },
    provider: User['provider'],
  ): User {
    const snapshot = {
      token: response.token,
      isPremium: !!response.isPremium,
      subscriptionTier: response.subscriptionTier,
      subscriptionExpiry: response.subscriptionExpiry,
      trialEndDate: response.trialEndDate,
    };
    const isPro = accountIsPro(snapshot);
    const alreadyOnboarded = response.onboardingCompleted === true || (response.totalFocusMinutes || 0) > 0;
    if (alreadyOnboarded && response.onboardingCompleted !== true) {
      this.pendingOnboardingSync = true;
    }
    return {
      _id: response._id,
      username: response.username,
      email: response.email,
      totalKibble: response.totalKibble,
      totalFocusMinutes: response.totalFocusMinutes,
      token: response.token,
      provider,
      emailVerified: response.emailVerified || false,
      onboardingCompleted: alreadyOnboarded,
      dailyGoalMinutes: response.dailyGoalMinutes,
      focusTags: response.focusTags,
      settings: response.settings,
      notificationPrefs: response.notificationPrefs,
      isPremium: isPro,
      subscriptionTier: normalizeTier(snapshot),
      ...(response.subscriptionExpiry ? { subscriptionExpiry: response.subscriptionExpiry } as any : {}),
      ...(response.trialEndDate ? { trialEndDate: response.trialEndDate } as any : {}),
      ...(response.trialUsed != null ? { trialUsed: response.trialUsed } as any : {}),
    };
  }

  private pendingOnboardingSync = false;

  private async afterLogin(userId: string, token: string): Promise<void> {
    if (this.pendingOnboardingSync) {
      this.pendingOnboardingSync = false;
      this.updateOnboarding(true).subscribe({ error: () => { /* next login still skips from focus history */ } });
    }
    await this.syncBreedDataAfterLogin();
    await this.refreshSubscriptionAfterLogin(token);
    await this.revenueCatService.loginUser(userId);
    // Only recover a payment started for THIS login session — never a prior account's pending checkout.
    void this.finishPendingPayment(token);
  }

  private async refreshSubscriptionAfterLogin(token: string): Promise<void> {
    try {
      const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
      const res: any = await this.http.get(`${this.apiUrl}/subscription/status`, { headers }).toPromise();
      const snapshot = subscriptionFromStatus(res, token);
      const isPro = accountIsPro(snapshot);
      const user = writeSubscriptionFields({ ...this.currentUser }, snapshot);
      if (res?.trial?.used != null) user.trialUsed = !!res.trial.used;
      this.storeUser(user);
      this.focusSoundService.setProAccess(isPro);
    } catch {
      // Keep the tier from the login payload.
    }
  }

  applySubscription(result: { expiry?: string | null; trial?: boolean }): void {
    if (!this.currentUser || !result.expiry) return;
    const user: any = {
      ...this.currentUser,
      isPremium: true,
      subscriptionTier: 'pro',
      subscriptionExpiry: result.expiry,
    };
    if (result.trial) {
      user.trialUsed = true;
      user.trialEndDate = result.expiry;
    }
    this.storeUser(user);
  }

  private async finishPendingPayment(token: string): Promise<void> {
    const result = await this.razorpayService.recoverPending(token);
    if (result?.success) this.applySubscription(result);
  }

  // ==================== OTP Verification ====================

  verifyOTP(userId: string, otp: string): Observable<OTPVerifyResponse> {
    return this.http.post<OTPVerifyResponse>(`${this.apiUrl}/auth/verify-otp`, {
      userId,
      otp
    }).pipe(
      switchMap(response => {
        if (!response.token) return from(Promise.resolve(response));
        this.storeUser(this.userFromAuthResponse({ ...response, emailVerified: true }, 'email'));
        return from(this.afterLogin(response._id, response.token)).pipe(map(() => response));
      })
    );
  }

  resendOTP(userId: string): Observable<ResendOTPResponse> {
    return this.http.post<ResendOTPResponse>(`${this.apiUrl}/auth/resend-otp`, {
      userId
    });
  }

  resendOTPByEmail(email: string): Observable<ResendOTPResponse> {
    return this.http.post<ResendOTPResponse>(`${this.apiUrl}/auth/resend-otp`, {
      email
    });
  }

  // ==================== Password Reset with OTP ====================

  forgotPassword(email: string): Observable<ForgotPasswordResponse> {
    return this.http.post<ForgotPasswordResponse>(
      `${this.apiUrl}/auth/forgot-password`,
      { email }
    );
  }

  verifyResetOTP(userId: string, otp: string): Observable<VerifyResetOTPResponse> {
    return this.http.post<VerifyResetOTPResponse>(
      `${this.apiUrl}/auth/verify-reset-otp`,
      { userId, otp }
    );
  }

  resetPassword(userId: string, resetToken: string, password: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.apiUrl}/auth/reset-password`,
      { userId, resetToken, password }
    );
  }

  // Legacy method - kept for backward compatibility
  verifyEmail(token: string): Observable<{ message: string; emailVerified: boolean }> {
    return this.http.post<{ message: string; emailVerified: boolean }>(
      `${this.apiUrl}/auth/verify-email/${token}`,
      {}
    );
  }

  // Legacy method - kept for backward compatibility
  resendVerificationEmail(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.apiUrl}/auth/resend-verification`,
      { email }
    );
  }

  // ==================== Google Sign-In ====================

  /*
  async signInWithGoogle(): Promise<SocialLoginResponse> {
     // ...
  }
  async signOutGoogle(): Promise<void> {
     // ...
  }
  */

  // ==================== Apple Sign-In ====================

  /*
  async signInWithApple(): Promise<SocialLoginResponse> {
    // ...
  }
  */

  // ==================== Profile & Utils ====================

  getProfile(): Observable<ProfileResponse> {
    return this.http.get<ProfileResponse>(`${this.apiUrl}/user/profile`, {
      headers: this.getAuthHeaders()
    }).pipe(
      tap(response => {
        if (this.currentUser) {
          this.storeUser({
            ...this.currentUser,
            totalKibble: response.user.totalKibble,
            totalFocusMinutes: response.user.totalFocusMinutes
          });
        }
      }),
      catchError(() => {
        // Return empty profile if backend fails
        throw new Error('Failed to load profile');
      })
    );
  }

  updateSettings(settings: any, notificationPrefs?: any): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.patch(`${this.apiUrl}/user/settings`, { settings, notificationPrefs }, { headers }).pipe(
      tap((response: any) => {
        if (response.success && this.currentUser) {
          this.storeUser({
            ...this.currentUser,
            settings: response.settings,
            notificationPrefs: response.notificationPrefs
          });
        }
      })
    );
  }

  updateOnboarding(completed: boolean, extras?: { focusTags?: string[]; dailyGoalMinutes?: number }): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.patch(`${this.apiUrl}/user/onboarding`, {
      completed,
      focusTags: extras?.focusTags,
      dailyGoalMinutes: extras?.dailyGoalMinutes,
    }, { headers }).pipe(
      tap((response: any) => {
        if (response.success && this.currentUser) {
          this.storeUser({
            ...this.currentUser,
            onboardingCompleted: response.onboardingCompleted !== false,
            focusTags: response.focusTags || extras?.focusTags || this.currentUser.focusTags,
            dailyGoalMinutes: response.dailyGoalMinutes || extras?.dailyGoalMinutes || this.currentUser.dailyGoalMinutes,
          });
        }
      })
    );
  }

  updateProfile(data: { username?: string, avatar?: string }): Observable<any> {
    const headers = this.getAuthHeaders();
    return this.http.patch(`${this.apiUrl}/user/profile`, data, { headers }).pipe(
      tap((res: any) => {
        if (res.success && this.currentUser) {
          const updatedUser = { ...this.currentUser };
          if (res.user.username) updatedUser.username = res.user.username;
          if (res.user.avatar) updatedUser.avatar = res.user.avatar;
          this.storeUser(updatedUser);
        }
      })
    );
  }

  updateLocalKibble(amount: number): void {
    if (this.currentUser) {
      this.setLocalKibble((this.currentUser.totalKibble || 0) + amount);
    }
  }

  setLocalKibble(total: number): void {
    if (!this.currentUser) return;
    const totalKibble = Math.max(0, Math.round(Number(total) || 0));
    if ((this.currentUser.totalKibble || 0) === totalKibble && (this.currentUser.kibble || 0) === totalKibble) {
      return;
    }
    this.storeUser({
      ...this.currentUser,
      totalKibble,
      kibble: totalKibble,
    });
  }

  private readonly USER_STORAGE_KEYS = [
    'focus_user',
    'auth_token',
    'breed_collection',
    'user_stats',
    'paws_focus_stats',
    'selected_breed',
    'breed_selected',
    'is_new_user',
    'onboarding_complete',
    'buddy_happiness',
    'buddy_fullness',
    'last_kennel_visit',
    'daily_treat_data',
    'last_ad_treat_date',
    'last_session_complete_time',
    'sound',
    'notifications',
    'default_duration',
    'paws_daily_goal',
    'pending_razorpay_payment',
    'pomodoro_enabled',
    'pomodoro_config',
  ];

  logout(): void {
    /*
    if (this.currentUser?.provider === 'google') {
      this.signOutGoogle();
    }
    */

    this.revenueCatService.logoutUser();
    this.razorpayService.clearPendingPayment();
    this.apiService.clearToken();
    this.USER_STORAGE_KEYS.forEach(key => safeRemoveItem(key));
    this.breedService.resetCollection();
    this.focusSoundService.setProAccess(false);
    this.lastAccountId = null;
    this.currentUserSubject.next(null);
    this.accountEpochSubject.next(this.accountEpochSubject.value + 1);
    // StatsService ↔ AuthService circular import — resolve lazily after logout.
    void import('./stats.service').then(({ StatsService }) => {
      if (this.currentUserSubject.value) return; // a new login already won the race
      try { this.injector.get(StatsService).resetStats(); } catch { /* ignore */ }
    });
  }

  /**
   * Delete user account - required by Apple App Store
   * This permanently removes all user data
   */
  async deleteAccount(): Promise<void> {
    const token = this.getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    try {
      await this.http.delete(`${this.apiUrl}/user/account`, {
        headers: { Authorization: `Bearer ${token}` }
      }).toPromise();
    } catch (error: any) {
      // If API not available, proceed with local deletion
      console.warn('API deletion failed, proceeding with local cleanup:', error);
    }

    // logout() already clears all user-specific localStorage keys
    this.logout();
  }

  /**
   * Export user data - required for GDPR compliance
   * Returns all data associated with the user
   */
  async exportUserData(): Promise<any> {
    const token = this.getToken();

    // Try to get data from API
    if (token) {
      try {
        const apiData = await this.http.get(`${this.apiUrl}/user/export`, {
          headers: { Authorization: `Bearer ${token}` }
        }).toPromise();

        if (apiData) {
          return apiData;
        }
      } catch (error) {
        console.warn('API export failed, using local data:', error);
      }
    }

    // Fallback to local data
    const localData = {
      exportDate: new Date().toISOString(),
      source: 'local_storage',
      account: {
        user: this.currentUser ? {
          id: this.currentUser._id,
          email: this.currentUser.email,
          username: this.currentUser.username,
          createdAt: this.currentUser.createdAt || new Date().toISOString()
        } : null
      },
      breedCollection: JSON.parse(safeGetItem('breed_collection') || '{}'),
      statistics: JSON.parse(safeGetItem('user_stats') || '{}'),
      preferences: {
        soundEnabled: safeGetItem('sound'),
        notificationsEnabled: safeGetItem('notifications'),
        defaultDuration: safeGetItem('default_duration')
      }
    };

    return localData;
  }
}

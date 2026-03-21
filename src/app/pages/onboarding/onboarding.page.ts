import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonIcon, IonSpinner, ToastController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowForward, arrowBack, checkmarkCircle, lockClosed, notificationsOutline } from 'ionicons/icons';
import { trigger, transition, style, animate } from '@angular/animations';
import { HttpClient } from '@angular/common/http';
import { Preferences } from '@capacitor/preferences';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

import { BreedService, DogBreed } from '../../services/breed.service';
import { environment } from '../../../environments/environment';

const TOTAL_STEPS = 7;
const PREFS_STEP_KEY = 'paws_onboarding_step';
const DEMO_TIMER_SECONDS = 10;

interface FocusCategory {
  id: string;
  label: string;
  icon: string;
  selected: boolean;
}

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, IonContent, IonIcon, IonSpinner],
  templateUrl: './onboarding.page.html',
  styleUrls: ['./onboarding.page.scss'],
  animations: [
    trigger('stepAnimation', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateX(40px)' }),
        animate('350ms ease-out', style({ opacity: 1, transform: 'translateX(0)' })),
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ opacity: 0, transform: 'translateX(-40px)' })),
      ]),
    ]),
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.8)' }),
        animate('400ms 100ms ease-out', style({ opacity: 1, transform: 'scale(1)' })),
      ]),
    ]),
    trigger('confetti', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(10px) scale(0.5)' }),
        animate('500ms cubic-bezier(0.34, 1.56, 0.64, 1)', style({ opacity: 1, transform: 'translateY(0) scale(1)' })),
      ]),
    ]),
  ],
})
export class OnboardingPage implements OnInit, OnDestroy {

  currentStep = 1;
  isNavigating = false;
  totalSteps = TOTAL_STEPS;

  // Step 2 — mission counter
  mealsDonated = 247583;
  mealsLoading = false;

  // Step 3 — mini demo
  demoTimerRunning = false;
  demoTimerComplete = false;
  demoTimerSeconds = DEMO_TIMER_SECONDS;
  demoKibble = 0;
  private demoInterval: any = null;

  // Step 4 — goal setting
  focusCategories: FocusCategory[] = [
    { id: 'study', label: 'Study & Exams', icon: '📚', selected: false },
    { id: 'work', label: 'Work & Projects', icon: '💼', selected: false },
    { id: 'creative', label: 'Creative Work', icon: '🎨', selected: false },
    { id: 'personal', label: 'Personal Growth', icon: '🧘', selected: false },
  ];
  dailyGoalOptions = [30, 60, 90, 120];
  selectedDailyGoal = 60;

  // Step 5 — breed selection
  allBreeds: DogBreed[] = [];
  selectedBreed = 'golden_retriever';

  // Step 6 — notifications
  notificationPermissionAsked = false;

  // Step 7 — trial
  trialUsed = false;
  trialLoading = false;

  private apiUrl = environment.apiUrl;

  constructor(
    private router: Router,
    private http: HttpClient,
    private breedService: BreedService,
    private toastController: ToastController,
  ) {
    addIcons({ arrowForward, arrowBack, checkmarkCircle, lockClosed, notificationsOutline });
  }

  async ngOnInit(): Promise<void> {
    const onboardingComplete = localStorage.getItem('onboarding_complete');
    if (onboardingComplete === 'true') {
      this.router.navigate(['/auth'], { queryParams: { mode: 'login' }, replaceUrl: true });
      return;
    }

    this.allBreeds = this.breedService.allBreeds;
    await this.restoreStep();
    this.fetchMealsCount();
    this.checkTrialStatus();
  }

  ngOnDestroy(): void {
    this.clearDemoTimer();
  }

  // ── Step navigation ──

  get stepDots(): number[] {
    return Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1);
  }

  get canGoBack(): boolean {
    return this.currentStep > 1;
  }

  get canSkip(): boolean {
    return this.currentStep <= 3;
  }

  get selectedBreedName(): string {
    const breed = this.allBreeds.find(b => b.id === this.selectedBreed);
    return breed?.name || 'Golden Retriever';
  }

  get selectedCategoryCount(): number {
    return this.focusCategories.filter(c => c.selected).length;
  }

  nextStep(): void {
    if (this.isNavigating) return;
    if (this.currentStep < TOTAL_STEPS) {
      this.currentStep++;
      this.saveStep();
    }
  }

  prevStep(): void {
    if (this.isNavigating || this.currentStep <= 1) return;
    this.currentStep--;
    this.saveStep();
  }

  skipToAuth(): void {
    if (this.isNavigating) return;
    this.isNavigating = true;
    localStorage.setItem('onboarding_complete', 'true');
    setTimeout(() => {
      this.router.navigate(['/auth'], { queryParams: { mode: 'signup' }, replaceUrl: true });
    }, 150);
  }

  goToLogin(): void {
    if (this.isNavigating) return;
    this.isNavigating = true;
    localStorage.setItem('onboarding_complete', 'true');
    setTimeout(() => {
      this.router.navigate(['/auth'], { queryParams: { mode: 'login' }, replaceUrl: true });
    }, 150);
  }

  // ── Step persistence ──

  private async saveStep(): Promise<void> {
    try {
      await Preferences.set({ key: PREFS_STEP_KEY, value: String(this.currentStep) });
    } catch { /* web fallback */ }
  }

  private async restoreStep(): Promise<void> {
    try {
      const { value } = await Preferences.get({ key: PREFS_STEP_KEY });
      if (value) {
        const step = parseInt(value, 10);
        if (step >= 1 && step <= TOTAL_STEPS) {
          this.currentStep = step;
        }
      }
    } catch { /* start from 1 */ }
  }

  // ── Step 2: Mission ──

  private fetchMealsCount(): void {
    this.mealsLoading = true;
    this.http.get<any>(`${this.apiUrl}/stats/global`).subscribe({
      next: (res) => {
        if (res?.totalMeals) this.mealsDonated = res.totalMeals;
        this.mealsLoading = false;
      },
      error: () => { this.mealsLoading = false; },
    });
  }

  get formattedMeals(): string {
    return this.mealsDonated.toLocaleString();
  }

  // ── Step 3: Mini demo timer ──

  startDemoTimer(): void {
    if (this.demoTimerRunning || this.demoTimerComplete) return;
    this.demoTimerRunning = true;
    this.demoTimerSeconds = DEMO_TIMER_SECONDS;
    this.demoKibble = 0;

    this.demoInterval = setInterval(() => {
      this.demoTimerSeconds--;
      if (this.demoTimerSeconds <= 0) {
        this.clearDemoTimer();
        this.demoTimerRunning = false;
        this.demoTimerComplete = true;
        this.demoKibble = 1;
      }
    }, 1000);
  }

  private clearDemoTimer(): void {
    if (this.demoInterval) {
      clearInterval(this.demoInterval);
      this.demoInterval = null;
    }
  }

  resetDemo(): void {
    this.clearDemoTimer();
    this.demoTimerRunning = false;
    this.demoTimerComplete = false;
    this.demoTimerSeconds = DEMO_TIMER_SECONDS;
    this.demoKibble = 0;
  }

  get demoProgress(): number {
    return (DEMO_TIMER_SECONDS - this.demoTimerSeconds) / DEMO_TIMER_SECONDS;
  }

  // ── Step 4: Goal setting ──

  toggleCategory(cat: FocusCategory): void {
    cat.selected = !cat.selected;
  }

  selectDailyGoal(mins: number): void {
    this.selectedDailyGoal = mins;
  }

  continueFromGoals(): void {
    const selectedCats = this.focusCategories.filter(c => c.selected).map(c => c.id);
    localStorage.setItem('paws_focus_tags', JSON.stringify(selectedCats));
    localStorage.setItem('paws_daily_goal', String(this.selectedDailyGoal));
    this.nextStep();
  }

  // ── Step 5: Breed selection ──

  selectBreed(breed: DogBreed): void {
    if (breed.unlockRequirement > 0) return;
    this.selectedBreed = breed.id;
  }

  isBreedFree(breed: DogBreed): boolean {
    return breed.unlockRequirement === 0;
  }

  continueWithBreed(): void {
    this.breedService.setActiveBreed(this.selectedBreed);
    localStorage.setItem('selected_breed', this.selectedBreed);
    localStorage.setItem('breed_selected', 'true');
    this.nextStep();
  }

  // ── Step 6: Notifications ──

  async requestNotifications(): Promise<void> {
    this.notificationPermissionAsked = true;
    try {
      if (Capacitor.isNativePlatform()) {
        const perm = await LocalNotifications.requestPermissions();
        localStorage.setItem('paws_notifications_asked', new Date().toISOString());
        if (perm.display === 'granted') {
          localStorage.setItem('notifications', 'true');
          const toast = await this.toastController.create({
            message: 'Notifications enabled!',
            duration: 1500,
            position: 'top',
            color: 'success',
          });
          await toast.present();
        }
      }
    } catch { /* permission dialog may have been dismissed */ }
    this.nextStep();
  }

  skipNotifications(): void {
    localStorage.setItem('paws_notifications_asked', new Date().toISOString());
    this.nextStep();
  }

  // ── Step 7: Trial offer ──

  private checkTrialStatus(): void {
    try {
      const user = JSON.parse(localStorage.getItem('focus_user') || '{}');
      this.trialUsed = user?.trialUsed === true;
    } catch {
      this.trialUsed = false;
    }
  }

  async startTrial(): Promise<void> {
    this.trialLoading = true;
    try {
      const user = JSON.parse(localStorage.getItem('focus_user') || '{}');
      if (user?.token) {
        await this.http.post(`${this.apiUrl}/subscription/start-trial`, {}, {
          headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
        }).toPromise();
      }
    } catch { /* offline or no auth — trial will be handled after login */ }

    this.trialLoading = false;
    this.completeOnboarding();
  }

  skipTrial(): void {
    this.completeOnboarding();
  }

  private completeOnboarding(): void {
    if (this.isNavigating) return;
    this.isNavigating = true;

    localStorage.setItem('onboarding_complete', 'true');
    localStorage.removeItem('is_new_user');
    Preferences.remove({ key: PREFS_STEP_KEY }).catch(() => {});

    const isLoggedIn = !!JSON.parse(localStorage.getItem('focus_user') || '{}')?.token;

    setTimeout(() => {
      if (isLoggedIn) {
        this.router.navigate(['/tabs/home'], { replaceUrl: true });
      } else {
        this.router.navigate(['/auth'], { queryParams: { mode: 'signup' }, replaceUrl: true });
      }
    }, 200);
  }

  // ── Legal ──

  openTerms(): void { this.router.navigate(['/terms']); }
  openPrivacy(): void { this.router.navigate(['/privacy-policy']); }
}

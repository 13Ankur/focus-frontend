import { ChangeDetectorRef, Component, NgZone, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, firstValueFrom } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  IonContent,
  IonButton,
  IonIcon,
  IonSpinner,
  ToastController,
  AlertController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  mailOutline,
  lockClosedOutline,
  eyeOutline,
  eyeOffOutline,
  arrowBack,
  checkmarkCircle,
  alertCircle
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonButton,
    IonIcon,
    IonSpinner
  ],
  templateUrl: './auth.page.html',
  styleUrls: ['./auth.page.scss']
})
export class AuthPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  isLoginMode: boolean = true; // Login is the default mode
  isLoading: boolean = false;
  showPassword: boolean = false;

  email: string = '';
  password: string = '';

  errorMessage: string = '';
  successMessage: string = '';

  // Platform detection
  isIOSPlatform: boolean = false;
  isAndroidPlatform: boolean = false;

  // Form validation states
  emailTouched: boolean = false;
  passwordTouched: boolean = false;
  private submitAttempt = 0;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private toastController: ToastController,
    private alertController: AlertController,
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
  ) {
    addIcons({
      mailOutline,
      lockClosedOutline,
      eyeOutline,
      eyeOffOutline,
      arrowBack,
      checkmarkCircle,
      alertCircle
    });
  }

  ngOnInit(): void {
    // Check if we should start in a specific mode
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params['mode'] === 'login') {
        this.isLoginMode = true;
      } else if (params['mode'] === 'signup') {
        this.isLoginMode = false;
      }
      if (params['reason'] === 'expired') {
        this.errorMessage = 'Your session expired. Log in again to keep your progress and any payment.';
      }
    });

    // If already logged in, redirect to appropriate page
    if (this.authService.isLoggedIn) {
      this.navigateAfterAuth();
    }

    // Detect platform for showing appropriate social login buttons
    this.detectPlatform();
  }

  private detectPlatform(): void {
    if (typeof window !== 'undefined' && 'Capacitor' in window) {
      const platform = (window as any).Capacitor?.getPlatform?.();
      this.isIOSPlatform = platform === 'ios';
      this.isAndroidPlatform = platform === 'android';
    }
  }

  toggleMode(): void {
    this.submitAttempt++;
    this.isLoading = false;
    this.isLoginMode = !this.isLoginMode;
    this.clearMessages();
    this.resetValidation();
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  goBack(): void {
    // Clear onboarding flag to allow going back
    this.router.navigate(['/onboarding'], { replaceUrl: true });
  }

  onEmailBlur(): void {
    this.emailTouched = true;
  }

  onPasswordBlur(): void {
    this.passwordTouched = true;
  }

  async onSubmit(): Promise<void> {
    // Mark all fields as touched
    this.emailTouched = true;
    this.passwordTouched = true;

    if (!this.isFormValid()) {
      return;
    }

    const attempt = ++this.submitAttempt;
    this.isLoading = true;
    this.clearMessages();

    try {
      if (this.isLoginMode) {
        await firstValueFrom(this.authService.login(this.email.trim(), this.password));
        if (attempt !== this.submitAttempt) return;
        await this.showSuccessToast('Welcome back!');
        this.navigateAfterAuth();
      } else {
        // For signup, generate a unique username using email prefix + random suffix
        const emailPrefix = this.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
        const uniqueSuffix = Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(-2);
        const username = `${emailPrefix}${uniqueSuffix}`;
        const response = await firstValueFrom(this.authService.signup(username, this.email.trim(), this.password));
        if (attempt !== this.submitAttempt) return;

        if (response?.userId && this.isValidEmail(response.email || '')) {
          // Store new user flag for onboarding
          localStorage.setItem('is_new_user', 'true');

          // Navigate to OTP verification page
          this.router.navigate(['/otp-verification'], {
            queryParams: {
              userId: response.userId,
              email: response.email,
              mode: 'email'
            }
          });
        } else {
          this.errorMessage = 'Something went wrong. Please try again.';
          void this.showErrorToast(this.errorMessage);
        }
      }
    } catch (error: any) {
      if (attempt !== this.submitAttempt) return;
      console.error('Auth error:', error);
      const message = this.handleAuthError(error);
      if (message) void this.showErrorToast(message);
    } finally {
      if (attempt === this.submitAttempt) this.finishLoading();
    }
  }

  private navigateAfterAuth(isNewUser: boolean = false): void {
    const breedSelected = localStorage.getItem('breed_selected') === 'true';
    const storedIsNewUser = localStorage.getItem('is_new_user') === 'true';

    if ((isNewUser || storedIsNewUser) && !breedSelected) {
      this.router.navigate(['/breed-selection'], { replaceUrl: true });
    } else {
      this.router.navigate(['/tabs/home'], { replaceUrl: true });
    }
  }

  private finishLoading(): void {
    this.isLoading = false;
    this.zone.run(() => this.cdr.detectChanges());
  }

  private handleAuthError(error: any): string {
    const status = Number(error?.status) || 0;
    const rawMessage = error?.error?.message;
    const errorMsg = typeof rawMessage === 'string' ? rawMessage.toLowerCase() : '';

    if (status === 0) {
      this.errorMessage = 'Unable to connect to server. Check your internet or CORS settings.';
    } else if (status === 401) {
      if (this.isLoginMode) {
        this.errorMessage = 'Incorrect email or password. Please try again.';
      } else {
        this.errorMessage = 'Authentication failed. Please try again.';
      }
    } else if (status === 403) {
      // Email not verified - redirect to OTP page
      if (error.error?.requiresVerification || error.error?.emailVerified === false) {
        const userId = error.error?.userId;
        const email = error.error?.email || this.email.trim();

        if (userId && this.isValidEmail(email)) {
          // Navigate to OTP verification page
          this.router.navigate(['/otp-verification'], {
            queryParams: {
              userId: userId,
              email: email,
              mode: 'email'
            }
          });
          return '';
        }

        if (!this.isValidEmail(email)) {
          this.errorMessage = 'Please enter a valid email address.';
          return this.errorMessage;
        }

        this.errorMessage = 'Please verify your email. Check your inbox for the verification code.';
      } else {
        this.errorMessage = error.error?.message || 'Access denied.';
      }
    } else if (status === 409) {
      this.errorMessage = 'An account with this email already exists. Please log in instead.';
    } else if (status === 400) {
      // Handle specific error messages from backend
      if (errorMsg.includes('email already') || errorMsg.includes('email registered')) {
        this.errorMessage = 'This email is already registered. Please log in instead.';
      } else if (errorMsg.includes('username already') || errorMsg.includes('username taken')) {
        // This shouldn't happen now with unique usernames, but handle it gracefully
        this.errorMessage = 'Account creation failed. Please try again.';
      } else if (errorMsg.includes('password')) {
        this.errorMessage = 'Password must be at least 6 characters.';
      } else if (errorMsg.includes('email') && errorMsg.includes('valid')) {
        this.errorMessage = 'Please enter a valid email address.';
      } else {
        this.errorMessage = error.error?.message || 'Invalid input. Please check your details.';
      }
    } else if (status === 429) {
      this.errorMessage = 'Too many attempts. Please wait a moment before trying again.';
    } else if (status === 503) {
      this.errorMessage = 'Service temporarily unavailable. Please try again in a moment.';
    } else if (status === 500) {
      this.errorMessage = 'Something went wrong. Please try again.';
    } else {
      this.errorMessage = 'Something went wrong. Please try again.';
    }
    return this.errorMessage || 'Something went wrong. Please try again.';
  }

  isFormValid(): boolean {
    this.clearMessages();

    if (!this.email.trim()) {
      this.errorMessage = 'Please enter your email address';
      return false;
    }

    if (!this.isValidEmail(this.email.trim())) {
      this.errorMessage = 'Please enter a valid email address';
      return false;
    }

    if (!this.password) {
      this.errorMessage = 'Please enter your password';
      return false;
    }

    if (this.password.length < 6) {
      this.errorMessage = 'Password must be at least 6 characters';
      return false;
    }

    return true;
  }

  get emailError(): string {
    if (!this.emailTouched) return '';
    if (!this.email.trim()) return 'Email is required';
    if (!this.isValidEmail(this.email.trim())) return 'Invalid email format';
    return '';
  }

  get passwordError(): string {
    if (!this.passwordTouched) return '';
    if (!this.password) return 'Password is required';
    if (this.password.length < 6) return 'Must be at least 6 characters';
    return '';
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private clearMessages(): void {
    this.errorMessage = '';
    this.successMessage = '';
  }

  private resetValidation(): void {
    this.emailTouched = false;
    this.passwordTouched = false;
    this.email = '';
    this.password = '';
  }

  private async showSuccessToast(message: string): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: 'top',
      color: 'success',
      icon: 'checkmark-circle'
    });
    await toast.present();
  }

  // ==================== Social Login ====================

  async onForgotPassword(): Promise<void> {
    if (!this.email.trim() || !this.isValidEmail(this.email.trim())) {
      const alert = await this.alertController.create({
        header: 'Reset Password',
        message: 'Please enter your email address first, then tap "Forgot Password".',
        buttons: ['OK']
      });
      await alert.present();
      return;
    }

    this.isLoading = true;
    this.clearMessages();

    try {
      const response = await firstValueFrom(this.authService.forgotPassword(this.email.trim()));

      const resetEmail = response?.email || this.email.trim();
      if (response?.userId) {
        this.router.navigate(['/otp-verification'], {
          queryParams: {
            userId: response.userId,
            email: resetEmail,
            mode: 'password'
          }
        });
      } else {
        this.errorMessage = 'No account found with this email.';
        void this.showErrorToast(this.errorMessage);
      }
    } catch (error: any) {
      console.error('Forgot password error:', error);
      const status = Number(error?.status) || 0;
      const rawMessage = error?.error?.message;
      const errorMsg = typeof rawMessage === 'string' ? rawMessage.toLowerCase() : '';
      if (status === 404) {
        this.errorMessage = 'No account found with this email.';
      } else if (status === 400 && (errorMsg.includes('apple') || errorMsg.includes('google') || errorMsg.includes('sign-in') || errorMsg.includes('social login'))) {
        this.errorMessage = typeof rawMessage === 'string' ? rawMessage : 'This account does not use a password.';
      } else if (status === 400 && errorMsg.includes('email') && errorMsg.includes('valid')) {
        this.errorMessage = 'Please enter a valid email address.';
      } else if (status === 429) {
        this.errorMessage = 'Too many requests. Please wait before trying again.';
      } else {
        this.errorMessage = 'Could not send the reset code. Please try again.';
      }
      void this.showErrorToast(this.errorMessage);
    } finally {
      this.finishLoading();
    }
  }

  private async showErrorToast(message: string): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      position: 'top',
      color: 'danger',
      icon: 'alert-circle'
    });
    await toast.present();
  }

  // Legal pages navigation
  openTerms(): void {
    this.router.navigate(['/terms']);
  }

  openPrivacy(): void {
    this.router.navigate(['/privacy-policy']);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

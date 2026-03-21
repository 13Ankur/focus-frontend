import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
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

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private toastController: ToastController,
    private alertController: AlertController
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

    this.isLoading = true;
    this.clearMessages();

    try {
      if (this.isLoginMode) {
        await this.authService.login(this.email.trim(), this.password).toPromise();
        await this.showSuccessToast('Welcome back!');
        this.navigateAfterAuth();
      } else {
        // For signup, generate a unique username using email prefix + random suffix
        const emailPrefix = this.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
        const uniqueSuffix = Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(-2);
        const username = `${emailPrefix}${uniqueSuffix}`;
        const response = await this.authService.signup(username, this.email.trim(), this.password).toPromise();

        if (response) {
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
        }
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      this.handleAuthError(error);
    } finally {
      this.isLoading = false;
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

  private handleAuthError(error: any): void {
    const errorMsg = error.error?.message?.toLowerCase() || '';

    if (error.status === 0) {
      this.errorMessage = 'Unable to connect to server. Please check your internet connection.';
    } else if (error.status === 401) {
      if (this.isLoginMode) {
        this.errorMessage = 'Incorrect email or password. Please try again.';
      } else {
        this.errorMessage = 'Authentication failed. Please try again.';
      }
    } else if (error.status === 403) {
      // Email not verified - redirect to OTP page
      if (error.error?.requiresVerification || error.error?.emailVerified === false) {
        const userId = error.error?.userId;
        const email = error.error?.email || this.email.trim();

        if (userId) {
          // Navigate to OTP verification page
          this.router.navigate(['/otp-verification'], {
            queryParams: {
              userId: userId,
              email: email,
              mode: 'email'
            }
          });
          return;
        }

        this.errorMessage = 'Please verify your email. Check your inbox for the verification code.';
      } else {
        this.errorMessage = error.error?.message || 'Access denied.';
      }
    } else if (error.status === 409) {
      this.errorMessage = 'An account with this email already exists. Please log in instead.';
    } else if (error.status === 400) {
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
    } else if (error.status === 429) {
      this.errorMessage = 'Too many attempts. Please wait a moment before trying again.';
    } else if (error.status === 503) {
      this.errorMessage = 'Service temporarily unavailable. Please try again in a moment.';
    } else if (error.status === 500) {
      this.errorMessage = 'Something went wrong on our end. Please try again later.';
    } else {
      this.errorMessage = error.error?.message || 'Something went wrong. Please try again.';
    }
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
      const response = await this.authService.forgotPassword(this.email.trim()).toPromise();

      if (response && response.userId) {
        // Navigate to OTP verification for password reset
        this.router.navigate(['/otp-verification'], {
          queryParams: {
            userId: response.userId,
            email: response.email,
            mode: 'password'
          }
        });
      } else {
        // User doesn't exist or email not configured - show generic message
        await this.showSuccessToast('If an account exists, a verification code has been sent.');
      }
    } catch (error: any) {
      console.error('Forgot password error:', error);
      if (error.status === 429) {
        this.errorMessage = 'Too many requests. Please wait before trying again.';
      } else if (error.error?.message?.includes('social login')) {
        this.errorMessage = error.error.message;
      } else {
        // Don't reveal if user exists
        await this.showSuccessToast('If an account exists, a verification code has been sent.');
      }
    } finally {
      this.isLoading = false;
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

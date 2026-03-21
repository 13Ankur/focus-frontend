import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { IonContent, IonIcon, IonSpinner, IonInputOtp, ToastController, AlertController } from '@ionic/angular/standalone';
import { AuthService } from '../../services/auth.service';
import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  mailOutline,
  lockClosedOutline,
  timeOutline,
  alertCircleOutline,
  checkmarkCircleOutline
} from 'ionicons/icons';

@Component({
  selector: 'app-otp-verification',
  templateUrl: './otp-verification.page.html',
  styleUrls: ['./otp-verification.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonIcon, IonSpinner, IonInputOtp]
})
export class OtpVerificationPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // Called every time the page is about to enter (handles back navigation)
  ionViewWillEnter() {
    this.clearOtp();
    this.clearMessages();
  }
  @ViewChild('otpInput') otpInput?: IonInputOtp;

  userId: string = '';
  email: string = '';
  mode: 'email' | 'password' = 'email'; // email verification or password reset

  otpValue: string = '';

  isLoading: boolean = false;
  isVerifying: boolean = false;
  isResending: boolean = false;

  errorMessage: string = '';
  successMessage: string = '';

  // Timer
  expirationTime: number = 10 * 60; // 10 minutes in seconds
  timerInterval: any;
  displayTime: string = '10:00';
  isExpired: boolean = false;

  // Resend cooldown
  resendCooldown: number = 0;
  resendInterval: any;
  canResend: boolean = true;
  resendCount: number = 0;
  maxResends: number = 3;

  // For password reset flow
  resetToken: string = '';

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    private toastController: ToastController,
    private alertController: AlertController
  ) {
    addIcons({
      arrowBackOutline,
      mailOutline,
      lockClosedOutline,
      timeOutline,
      alertCircleOutline,
      checkmarkCircleOutline
    });
  }

  ngOnInit() {
    // Clear any previous OTP value on page load
    this.clearOtp();
    this.clearMessages();

    // Get params from route
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.userId = params['userId'] || '';
      this.email = params['email'] || '';
      this.mode = params['mode'] === 'password' ? 'password' : 'email';

      if (!this.userId) {
        this.showError('Invalid verification link. Please try again.');
        setTimeout(() => this.router.navigate(['/auth']), 2000);
        return;
      }

      // Reset OTP input when params change
      this.clearOtp();

      this.startTimer();
      this.startResendCooldown(30); // Initial 30 second cooldown
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.clearTimers();
  }

  clearTimers() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    if (this.resendInterval) {
      clearInterval(this.resendInterval);
    }
  }

  startTimer() {
    this.expirationTime = 10 * 60;
    this.isExpired = false;
    this.updateDisplayTime();

    this.timerInterval = setInterval(() => {
      this.expirationTime--;
      this.updateDisplayTime();

      if (this.expirationTime <= 0) {
        this.isExpired = true;
        clearInterval(this.timerInterval);
        this.errorMessage = 'Verification code has expired. Please request a new one.';
      }
    }, 1000);
  }

  updateDisplayTime() {
    const minutes = Math.floor(this.expirationTime / 60);
    const seconds = this.expirationTime % 60;
    this.displayTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  startResendCooldown(seconds: number) {
    this.resendCooldown = seconds;
    this.canResend = false;

    this.resendInterval = setInterval(() => {
      this.resendCooldown--;
      if (this.resendCooldown <= 0) {
        this.canResend = true;
        clearInterval(this.resendInterval);
      }
    }, 1000);
  }

  onOtpChange(event: any) {
    const raw = event?.detail?.value ?? '';
    // Enforce numeric-only OTP even though type="text"
    const digits = String(raw).replace(/\D/g, '').slice(0, 6);
    this.otpValue = digits;
    this.clearMessages();

    // Keep the component value in sync if user typed letters/spaces etc.
    if (this.otpInput && (this.otpInput as any).value !== digits) {
      (this.otpInput as any).value = digits;
    }
  }

  onOtpComplete() {
    // Auto-submit when all 6 digits are entered
    if (this.isOtpComplete()) {
      setTimeout(() => this.verifyOTP(), 100);
    }
  }

  isOtpComplete(): boolean {
    return this.otpValue.length === 6;
  }

  getOtp(): string {
    return (this.otpValue || '').replace(/\D/g, '').slice(0, 6);
  }

  clearOtp() {
    this.otpValue = '';
    if (this.otpInput) {
      (this.otpInput as any).value = '';
      // Try to focus for better UX (best-effort)
      try {
        (this.otpInput as any).setFocus?.();
      } catch {
        // ignore
      }
    }
  }

  clearMessages() {
    this.errorMessage = '';
    this.successMessage = '';
  }

  async verifyOTP() {
    if (!this.isOtpComplete()) {
      this.errorMessage = 'Please enter all 6 digits';
      return;
    }

    if (this.isVerifying || this.isExpired) {
      return;
    }

    this.isVerifying = true;
    this.clearMessages();

    const otp = this.getOtp();

    try {
      if (this.mode === 'email') {
        // Email verification
        const response = await this.authService.verifyOTP(this.userId, otp).toPromise();

        if (response) {
          this.successMessage = 'Email verified successfully!';
          await this.showSuccessToast('Welcome to Paws Focus! 🐕');

          // Check if new user for onboarding
          const isNewUser = localStorage.getItem('is_new_user') === 'true';
          localStorage.removeItem('is_new_user');

          setTimeout(() => {
            if (isNewUser) {
              this.router.navigate(['/onboarding']);
            } else {
              this.router.navigate(['/tabs/home']);
            }
          }, 500);
        }
      } else {
        // Password reset - verify OTP first
        const response = await this.authService.verifyResetOTP(this.userId, otp).toPromise();

        if (response) {
          this.resetToken = response.resetToken;
          this.successMessage = 'Code verified! Now set your new password.';

          // Navigate to reset password page with token
          setTimeout(() => {
            this.router.navigate(['/reset-password'], {
              queryParams: {
                userId: this.userId,
                resetToken: this.resetToken
              }
            });
          }, 500);
        }
      }
    } catch (error: any) {
      console.error('OTP verification error:', error);

      if (error.error?.expired) {
        this.isExpired = true;
        this.errorMessage = 'Verification code has expired. Please request a new one.';
      } else if (error.error?.maxAttempts) {
        this.errorMessage = 'Too many failed attempts. Please request a new code.';
        this.clearOtp();
      } else if (error.error?.remainingAttempts !== undefined) {
        this.errorMessage = error.error.message || 'Invalid code.';
        this.clearOtp();
      } else {
        this.errorMessage = error.error?.message || 'Verification failed. Please try again.';
        this.clearOtp();
      }
    } finally {
      this.isVerifying = false;
    }
  }

  async resendOTP() {
    if (!this.canResend || this.isResending || this.resendCount >= this.maxResends) {
      return;
    }

    this.isResending = true;
    this.clearMessages();

    try {
      const response = await this.authService.resendOTP(this.userId).toPromise();

      if (response) {
        this.resendCount = response.resendCount || this.resendCount + 1;
        this.successMessage = 'New verification code sent!';
        await this.showSuccessToast('New code sent to your email');

        // Reset timer and cooldown
        this.clearTimers();
        this.startTimer();
        this.startResendCooldown(60); // 60 second cooldown after resend
        this.clearOtp();
        this.isExpired = false;
      }
    } catch (error: any) {
      console.error('Resend OTP error:', error);

      if (error.status === 429) {
        const waitSeconds = error.error?.waitSeconds || 60;
        this.errorMessage = `Too many requests. Please wait ${Math.ceil(waitSeconds / 60)} minute(s).`;
        this.startResendCooldown(waitSeconds);
      } else {
        this.errorMessage = error.error?.message || 'Failed to resend code. Please try again.';
      }
    } finally {
      this.isResending = false;
    }
  }

  async showSuccessToast(message: string) {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: 'top',
      color: 'success',
      icon: 'checkmark-circle-outline'
    });
    await toast.present();
  }

  showError(message: string) {
    this.errorMessage = message;
  }

  goBack() {
    this.router.navigate(['/auth']);
  }

  getMaskedEmail(): string {
    if (!this.email) return '';

    const [local, domain] = this.email.split('@');
    if (!local || !domain) return this.email;

    const maskedLocal = local.length > 3
      ? local.slice(0, 2) + '***' + local.slice(-1)
      : local.slice(0, 1) + '***';

    return `${maskedLocal}@${domain}`;
  }
}

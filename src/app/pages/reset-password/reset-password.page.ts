import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  IonContent,
  IonIcon,
  IonSpinner,
  ToastController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  lockClosedOutline,
  eyeOutline,
  eyeOffOutline,
  checkmarkCircle,
  alertCircle,
  arrowBackOutline,
  shieldCheckmarkOutline
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonContent,
    IonIcon,
    IonSpinner
  ],
  templateUrl: './reset-password.page.html',
  styleUrls: ['./reset-password.page.scss']
})
export class ResetPasswordPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  isLoading: boolean = false;
  showPassword: boolean = false;
  showConfirmPassword: boolean = false;
  
  password: string = '';
  confirmPassword: string = '';
  
  errorMessage: string = '';
  successMessage: string = '';
  
  passwordTouched: boolean = false;
  confirmPasswordTouched: boolean = false;
  
  userId: string = '';
  resetToken: string = '';
  isSuccess: boolean = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private toastController: ToastController
  ) {
    addIcons({ 
      lockClosedOutline,
      eyeOutline,
      eyeOffOutline,
      checkmarkCircle,
      alertCircle,
      arrowBackOutline,
      shieldCheckmarkOutline
    });
  }

  ngOnInit(): void {
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.userId = params['userId'];
      this.resetToken = params['resetToken'];
      
      if (!this.userId || !this.resetToken) {
        this.errorMessage = 'Invalid reset link. Please request a new password reset.';
        setTimeout(() => {
          this.router.navigate(['/auth'], { queryParams: { mode: 'login' } });
        }, 3000);
      }
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  onPasswordBlur(): void {
    this.passwordTouched = true;
  }

  onConfirmPasswordBlur(): void {
    this.confirmPasswordTouched = true;
  }

  isFormValid(): boolean {
    this.clearMessages();

    if (!this.password) {
      this.errorMessage = 'Please enter a new password';
      return false;
    }
    
    if (this.password.length < 6) {
      this.errorMessage = 'Password must be at least 6 characters';
      return false;
    }
    
    if (!this.confirmPassword) {
      this.errorMessage = 'Please confirm your password';
      return false;
    }
    
    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'Passwords do not match';
      return false;
    }
    
    return true;
  }

  get passwordError(): string {
    if (!this.passwordTouched) return '';
    if (!this.password) return 'Password is required';
    if (this.password.length < 6) return 'Must be at least 6 characters';
    return '';
  }

  get confirmPasswordError(): string {
    if (!this.confirmPasswordTouched) return '';
    if (!this.confirmPassword) return 'Please confirm your password';
    if (this.password !== this.confirmPassword) return 'Passwords do not match';
    return '';
  }

  async onSubmit(): Promise<void> {
    this.passwordTouched = true;
    this.confirmPasswordTouched = true;

    if (!this.isFormValid()) {
      return;
    }

    if (!this.userId || !this.resetToken) {
      this.errorMessage = 'Invalid reset session. Please request a new password reset.';
      return;
    }

    this.isLoading = true;
    this.clearMessages();

    try {
      await this.authService.resetPassword(this.userId, this.resetToken, this.password).toPromise();
      this.isSuccess = true;
      this.successMessage = 'Password reset successfully!';
      await this.showSuccessToast('Password reset successfully!');
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        this.router.navigate(['/auth'], { 
          queryParams: { mode: 'login' },
          replaceUrl: true 
        });
      }, 2000);
    } catch (error: any) {
      console.error('Reset password error:', error);
      this.errorMessage = error.error?.message || 'Failed to reset password. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }

  goToLogin(): void {
    this.router.navigate(['/auth'], { 
      queryParams: { mode: 'login' },
      replaceUrl: true 
    });
  }

  goBack(): void {
    this.router.navigate(['/auth']);
  }

  private clearMessages(): void {
    this.errorMessage = '';
    this.successMessage = '';
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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}

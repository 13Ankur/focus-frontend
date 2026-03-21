import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import {
  IonContent,
  IonButton,
  IonIcon,
  IonSpinner,
  ToastController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  checkmarkCircle,
  alertCircle,
  mailOutline,
  arrowBack
} from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonButton,
    IonIcon,
    IonSpinner
  ],
  templateUrl: './verify-email.page.html',
  styleUrls: ['./verify-email.page.scss']
})
export class VerifyEmailPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  isLoading: boolean = true;
  isVerified: boolean = false;
  errorMessage: string = '';
  token: string = '';

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private toastController: ToastController
  ) {
    addIcons({ 
      checkmarkCircle,
      alertCircle,
      mailOutline,
      arrowBack
    });
  }

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.token = params['token'];
      if (this.token) {
        this.verifyEmail();
      } else {
        this.errorMessage = 'Invalid verification link';
        this.isLoading = false;
      }
    });
  }

  async verifyEmail(): Promise<void> {
    try {
      const response = await this.authService.verifyEmail(this.token).toPromise();
      
      if (response && response.emailVerified) {
        this.isVerified = true;
        await this.showSuccessToast('Email verified successfully!');
        
        // Redirect to login after 2 seconds
        setTimeout(() => {
          this.router.navigate(['/auth'], { 
            queryParams: { mode: 'login' },
            replaceUrl: true 
          });
        }, 2000);
      }
    } catch (error: any) {
      console.error('Verification error:', error);
      this.errorMessage = error.error?.message || 'Invalid or expired verification link';
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

  goToSignup(): void {
    this.router.navigate(['/auth'], { replaceUrl: true });
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

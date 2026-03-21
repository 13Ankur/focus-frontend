import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { safeGetItem } from '../utils/storage';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(): boolean | UrlTree {
    // Check if onboarding is complete
    const onboardingComplete = safeGetItem('onboarding_complete') === 'true';
    
    if (!onboardingComplete) {
      return this.router.createUrlTree(['/onboarding']);
    }

    // Check if user is logged in
    if (!this.authService.isLoggedIn) {
      return this.router.createUrlTree(['/auth']);
    }

    // Check if breed is selected for new users
    const isNewUser = safeGetItem('is_new_user') === 'true';
    const breedSelected = safeGetItem('breed_selected') === 'true';
    
    if (isNewUser && !breedSelected) {
      return this.router.createUrlTree(['/breed-selection']);
    }

    return true;
  }
}

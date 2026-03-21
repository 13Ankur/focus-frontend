import { Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'onboarding',
    loadComponent: () => import('./pages/onboarding/onboarding.page').then(m => m.OnboardingPage)
  },
  {
    path: 'auth',
    loadComponent: () => import('./pages/auth/auth.page').then(m => m.AuthPage)
  },
  {
    path: 'otp-verification',
    loadComponent: () => import('./pages/otp-verification/otp-verification.page').then(m => m.OtpVerificationPage)
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./pages/reset-password/reset-password.page').then(m => m.ResetPasswordPage)
  },
  // Legacy routes for backward compatibility
  {
    path: 'verify-email/:token',
    redirectTo: 'auth',
    pathMatch: 'full'
  },
  {
    path: 'reset-password/:token',
    redirectTo: 'auth',
    pathMatch: 'full'
  },
  {
    path: 'breed-selection',
    loadComponent: () => import('./pages/breed-selection/breed-selection.page').then(m => m.BreedSelectionPage)
  },
  {
    path: 'focus-mode',
    loadComponent: () => import('./pages/focus-mode/focus-mode.page').then(m => m.FocusModePage),
    canActivate: [AuthGuard]
  },
  // Paywall routes disabled — redirect to home (all features are free)
  { path: 'subscription', redirectTo: 'tabs/home', pathMatch: 'full' },
  { path: 'paywall', redirectTo: 'tabs/home', pathMatch: 'full' },
  { path: 'guardian-angel', redirectTo: 'tabs/home', pathMatch: 'full' },
  { path: 'subscription-success', redirectTo: 'tabs/home', pathMatch: 'full' },
  {
    path: 'settings',
    loadComponent: () => import('./pages/settings/settings.page').then(m => m.SettingsPage),
    canActivate: [AuthGuard]
  },
  {
    path: 'kibble-store',
    loadComponent: () => import('./pages/kibble-store/kibble-store.page').then(m => m.KibbleStorePage),
    canActivate: [AuthGuard]
  },
  {
    path: 'app-blocking',
    loadComponent: () => import('./pages/app-blocking/app-blocking.page').then(m => m.AppBlockingPage),
    canActivate: [AuthGuard]
  },
  {
    path: 'achievements',
    loadComponent: () => import('./pages/achievements/achievements.page').then(m => m.AchievementsPage),
    canActivate: [AuthGuard]
  },
  {
    path: 'social',
    loadComponent: () => import('./pages/social/social.page').then(m => m.SocialPage),
    canActivate: [AuthGuard]
  },
  {
    path: 'room-detail',
    loadComponent: () => import('./pages/room-detail/room-detail.page').then(m => m.RoomDetailPage),
    canActivate: [AuthGuard]
  },
  {
    path: 'privacy-policy',
    loadComponent: () => import('./pages/privacy-policy/privacy-policy.page').then(m => m.PrivacyPolicyPage)
  },
  {
    path: 'terms',
    loadComponent: () => import('./pages/terms/terms.page').then(m => m.TermsPage)
  },
  {
    path: 'tabs',
    loadChildren: () => import('./tabs/tabs.routes').then(m => m.routes),
    canActivate: [AuthGuard]
  },
  {
    path: '',
    redirectTo: 'onboarding',
    pathMatch: 'full'
  }
];

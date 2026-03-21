import { Component, OnInit } from '@angular/core';
import { IonApp, IonRouterOutlet, Platform } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';
import { AuthService } from './services/auth.service';
import { VersionService } from './services/version.service';
import { AdService } from './services/ad.service';
import { WidgetService } from './services/widget.service';
import { NotificationService } from './services/notification.service';
import { App } from '@capacitor/app';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnInit {
  constructor(
    private router: Router,
    private platform: Platform,
    private authService: AuthService,
    private versionService: VersionService,
    private adService: AdService,
    private widgetService: WidgetService,
    private notificationService: NotificationService,
  ) { }

  async ngOnInit(): Promise<void> {
    await this.initializeApp();
  }

  private async initializeApp(): Promise<void> {
    // Wait for the native platform to be fully loaded
    await this.platform.ready();

    // Force light mode on app initialization
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.style.colorScheme = 'light only';

    // Configure native platform
    if (Capacitor.isNativePlatform()) {
      try {
        // Configure status bar - always light mode
        await StatusBar.setStyle({ style: Style.Light });
        await StatusBar.setBackgroundColor({ color: '#F8F8F5' });
      } catch (e) {
        console.log('Status bar not available');
      }
    }

    // Check for app updates (this will show popup if needed)
    const canContinue = await this.versionService.checkAndPromptUpdate();

    // If force update is required, don't proceed with navigation
    if (!canContinue) {
      // Hide splash but don't navigate - update popup is showing
      this.hideSplashScreen();
      return;
    }

    // Get current path to avoid unnecessary redirects
    const currentPath = window.location.pathname;

    // Don't redirect if we're already on a valid path
    if (currentPath && currentPath !== '/') {
      // Hide splash screen after short delay
      this.hideSplashScreen();
      return;
    }

    let onboardingComplete = localStorage.getItem('onboarding_complete') === 'true';
    const isLoggedIn = this.authService.isLoggedIn;
    const user = this.authService.currentUser;
    const breedSelected = localStorage.getItem('breed_selected') === 'true';

    // Sync onboarding from DB if logged in
    if (isLoggedIn && user?.onboardingCompleted) {
      onboardingComplete = true;
      localStorage.setItem('onboarding_complete', 'true');
    }

    if (!onboardingComplete) {
      this.router.navigate(['/onboarding'], { replaceUrl: true });
    } else if (!isLoggedIn) {
      this.router.navigate(['/auth'], { queryParams: { mode: 'login' }, replaceUrl: true });
    } else if (!breedSelected && !user?.onboardingCompleted) {
      this.router.navigate(['/onboarding'], { replaceUrl: true });
    } else {
      this.router.navigate(['/tabs/home'], { replaceUrl: true });
    }

    if (isLoggedIn) {
      this.adService.initialize();
      this.widgetService.updateWidgetData();
      this.notificationService.createNotificationChannels();
      this.notificationService.initialize();
    }

    this.setupAppStateListener();

    // Hide splash screen after navigation
    this.hideSplashScreen();
  }

  private setupAppStateListener(): void {
    if (Capacitor.isNativePlatform()) {
      App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) {
          this.notificationService.onAppBackgrounded();
        } else {
          this.notificationService.scheduleAllNotifications();
        }
      });
    }
  }

  private async hideSplashScreen(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        // Small delay to ensure smooth transition
        await new Promise(resolve => setTimeout(resolve, 300));
        await SplashScreen.hide({
          fadeOutDuration: 500
        });
      } catch (e) {
        console.log('Splash screen not available');
      }
    }
  }
}

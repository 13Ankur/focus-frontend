import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AlertController } from '@ionic/angular/standalone';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { environment } from '../../environments/environment';

export interface VersionCheckResponse {
  updateRequired: boolean;
  forceUpdate: boolean;
  currentVersion?: string;
  storeUrl?: string;
  releaseNotes?: string;
  isMaintenanceMode: boolean;
  maintenanceMessage?: string;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class VersionService {
  private readonly APP_VERSION = '1.0.3'; // Update this with each release
  private hasShownUpdatePopup = false;
  private readonly SKIP_UPDATE_KEY = 'skip_update_version';

  constructor(
    private http: HttpClient,
    private alertController: AlertController
  ) { }

  /**
   * Get the current app version
   */
  async getAppVersion(): Promise<string> {
    if (Capacitor.isNativePlatform()) {
      try {
        const info = await App.getInfo();
        return info.version;
      } catch (e) {
        console.log('Could not get native app version, using fallback');
        return this.APP_VERSION;
      }
    }
    return this.APP_VERSION;
  }

  /**
   * Get the current platform
   */
  getPlatform(): 'ios' | 'android' | 'web' {
    const platform = Capacitor.getPlatform();
    if (platform === 'ios' || platform === 'android') {
      return platform as 'ios' | 'android';
    }
    return 'web';
  }

  /**
   * Check if app update is required
   */
  async checkForUpdate(): Promise<VersionCheckResponse> {
    const platform = this.getPlatform();

    // Skip version check for web
    if (platform === 'web') {
      return {
        updateRequired: false,
        forceUpdate: false,
        isMaintenanceMode: false,
      };
    }

    try {
      const version = await this.getAppVersion();

      const response = await this.http.get<VersionCheckResponse>(
        `${environment.apiUrl}/version/check`,
        {
          params: { platform, version }
        }
      ).toPromise();

      return response || {
        updateRequired: false,
        forceUpdate: false,
        isMaintenanceMode: false,
      };
    } catch (error) {
      console.error('Version check failed:', error);
      // Fail open - allow app to run if version check fails
      return {
        updateRequired: false,
        forceUpdate: false,
        isMaintenanceMode: false,
        error: 'Version check failed',
      };
    }
  }

  /**
   * Check if user has skipped this version update
   */
  private hasSkippedVersion(version: string): boolean {
    const skippedVersion = localStorage.getItem(this.SKIP_UPDATE_KEY);
    return skippedVersion === version;
  }

  /**
   * Mark a version as skipped
   */
  private skipVersion(version: string): void {
    localStorage.setItem(this.SKIP_UPDATE_KEY, version);
  }

  /**
   * Clear skipped version (e.g., when a new version is available)
   */
  clearSkippedVersion(): void {
    localStorage.removeItem(this.SKIP_UPDATE_KEY);
  }

  /**
   * Show update popup to user
   */
  async showUpdatePopup(response: VersionCheckResponse): Promise<void> {
    // Don't show multiple times in one session
    if (this.hasShownUpdatePopup) {
      return;
    }

    // If not a force update and user has skipped this version, don't show
    if (!response.forceUpdate && response.currentVersion && this.hasSkippedVersion(response.currentVersion)) {
      return;
    }

    this.hasShownUpdatePopup = true;

    const buttons: any[] = [];

    // If not a force update, allow user to skip
    if (!response.forceUpdate) {
      buttons.push({
        text: 'Later',
        role: 'cancel',
        cssClass: 'secondary-button',
        handler: () => {
          // Mark this version as skipped
          if (response.currentVersion) {
            this.skipVersion(response.currentVersion);
          }
        }
      });
    }

    // Update button
    buttons.push({
      text: 'Update Now',
      cssClass: 'primary-button',
      handler: () => {
        this.openStore(response.storeUrl || '');
      }
    });

    const alert = await this.alertController.create({
      header: response.forceUpdate ? '⚠️ Update Required' : '🎉 Update Available',
      message: this.buildUpdateMessage(response),
      backdropDismiss: !response.forceUpdate,
      cssClass: 'update-alert',
      buttons,
    });

    await alert.present();

    // For force updates, keep showing if dismissed
    if (response.forceUpdate) {
      alert.onDidDismiss().then(() => {
        this.hasShownUpdatePopup = false;
        this.showUpdatePopup(response);
      });
    }
  }

  /**
   * Show maintenance mode popup
   */
  async showMaintenancePopup(message: string): Promise<void> {
    const alert = await this.alertController.create({
      header: '🔧 Maintenance',
      message: message,
      backdropDismiss: false,
      cssClass: 'maintenance-alert',
      buttons: [
        {
          text: 'Retry',
          handler: () => {
            // Reload the app
            window.location.reload();
          }
        }
      ],
    });

    await alert.present();
  }

  /**
   * Build the update message
   */
  private buildUpdateMessage(response: VersionCheckResponse): string {
    let message = '';

    if (response.forceUpdate) {
      message = `A critical update is required to continue using Paws Focus. Please update to version ${response.currentVersion || 'latest'}.`;
    } else {
      message = `A new version (${response.currentVersion || 'latest'}) is available with improvements and bug fixes.`;
    }

    if (response.releaseNotes) {
      message += `<br><br><strong>What's New:</strong><br>${response.releaseNotes}`;
    }

    return message;
  }

  /**
   * Open the app store
   */
  private openStore(storeUrl: string): void {
    if (storeUrl) {
      // Open in system browser
      window.open(storeUrl, '_system');
    } else {
      // Fallback URLs
      const platform = this.getPlatform();
      if (platform === 'ios') {
        window.open('https://apps.apple.com/app/paws-focus/id123456789', '_system');
      } else if (platform === 'android') {
        window.open('https://play.google.com/store/apps/details?id=com.focusapp.buddy', '_system');
      }
    }
  }

  /**
   * Main method to check version and show appropriate popup
   */
  async checkAndPromptUpdate(): Promise<boolean> {
    const response = await this.checkForUpdate();

    // Handle maintenance mode
    if (response.isMaintenanceMode) {
      await this.showMaintenancePopup(response.maintenanceMessage || 'We are currently performing maintenance.');
      return false; // Don't allow app to continue
    }

    // Handle update required
    if (response.updateRequired) {
      await this.showUpdatePopup(response);
      return !response.forceUpdate; // Allow app to continue if not force update
    }

    // No update required
    return true;
  }
}

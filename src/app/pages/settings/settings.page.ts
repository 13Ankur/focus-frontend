import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent,
  IonIcon,
  AlertController,
  ActionSheetController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBack,
  pencilOutline,
  chevronForward,
  logOutOutline
} from 'ionicons/icons';

import { AuthService } from '../../services/auth.service';
import { StatsService } from '../../services/stats.service';
import { BreedService } from '../../services/breed.service';
import { SoundService } from '../../services/sound.service';
import { AppBlockerService } from '../../services/app-blocker.service';
import { NotificationService, NotificationPreferences } from '../../services/notification.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonIcon
  ],
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss']
})
export class SettingsPage implements OnInit {
  userName: string = 'User';
  userEmail: string = 'user@example.com';

  notificationsEnabled: boolean = true;
  soundEnabled: boolean = true;
  defaultDuration: number = 25;
  blockingEnabled: boolean = false;
  blockListCount: number = 0;

  // Notification sub-settings
  streakReminders: boolean = true;
  dailyReminder: boolean = true;
  reminderTime: string = '09:00';
  buddyHungerAlerts: boolean = true;
  weeklySummary: boolean = true;

  // Get buddy info directly from breed service
  get buddyName(): string {
    return this.breedService.activeBreed?.name || 'Golden Retriever';
  }

  get buddyImage(): string {
    return this.breedService.activeBreed?.image || 'assets/images/golden_retriever.png';
  }

  constructor(
    private authService: AuthService,
    private statsService: StatsService,
    private breedService: BreedService,
    private soundService: SoundService,
    private appBlocker: AppBlockerService,
    private notificationService: NotificationService,
    private router: Router,
    private alertController: AlertController,
    private actionSheetController: ActionSheetController
  ) {
    addIcons({ arrowBack, pencilOutline, chevronForward, logOutOutline });
  }

  ngOnInit(): void {
    this.loadSettings();
  }

  ionViewWillEnter(): void {
    this.loadSettings();
    this.loadNotificationPrefs();
  }

  private loadSettings(): void {
    const user = this.authService.currentUser;
    if (user) {
      this.userName = user.username || 'User';
      this.userEmail = user.email || 'user@example.com';

      // Use settings from DB if available, fallback to localStorage
      if (user.settings) {
        this.notificationsEnabled = user.settings.notificationsEnabled;
        this.soundEnabled = user.settings.soundEnabled;
        this.defaultDuration = user.settings.defaultTimerDuration;
      } else {
        this.notificationsEnabled = localStorage.getItem('notifications') !== 'false';
        this.soundEnabled = localStorage.getItem('sound') !== 'false';
        this.defaultDuration = parseInt(localStorage.getItem('default_duration') || '25', 10);
      }

      if (user.notificationPrefs) {
        this.streakReminders = user.notificationPrefs.streakReminders;
        this.dailyReminder = user.notificationPrefs.dailyReminder;
        this.reminderTime = user.notificationPrefs.reminderTime;
        this.buddyHungerAlerts = user.notificationPrefs.buddyHungerAlerts;
        this.weeklySummary = user.notificationPrefs.weeklySummary;
      }
    }

    this.blockingEnabled = this.appBlocker.isEnabled;
    this.blockListCount = this.appBlocker.blockListCount;
  }

  getBuddyIcon(): string {
    return this.buddyImage;
  }

  goBack(): void {
    this.router.navigate(['/tabs/home']);
  }

  async editProfile(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Edit Profile',
      inputs: [
        {
          name: 'username',
          type: 'text',
          placeholder: 'Username',
          value: this.userName
        }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: (data) => {
            if (data.username?.trim()) {
              this.userName = data.username.trim();
              // In a real app, save to backend
            }
          }
        }
      ]
    });
    await alert.present();
  }

  changeBuddy(): void {
    this.router.navigate(['/breed-selection']);
  }

  openAppBlocking(): void {
    this.router.navigate(['/app-blocking']);
  }

  toggleNotifications(): void {
    this.notificationsEnabled = !this.notificationsEnabled;
    localStorage.setItem('notifications', this.notificationsEnabled.toString());
    this.notificationService.updateNotificationPreferences({ enabled: this.notificationsEnabled });

    // Sync to DB
    this.authService.updateSettings({ notificationsEnabled: this.notificationsEnabled }).subscribe();
  }

  private async loadNotificationPrefs(): Promise<void> {
    const user = this.authService.currentUser;
    if (user?.notificationPrefs) {
      this.notificationsEnabled = user.settings?.notificationsEnabled ?? true;
      this.streakReminders = user.notificationPrefs.streakReminders;
      this.dailyReminder = user.notificationPrefs.dailyReminder;
      this.reminderTime = user.notificationPrefs.reminderTime;
      this.buddyHungerAlerts = user.notificationPrefs.buddyHungerAlerts;
      this.weeklySummary = user.notificationPrefs.weeklySummary;
    } else {
      const prefs = await this.notificationService.loadPreferences();
      this.notificationsEnabled = prefs.enabled;
      this.streakReminders = prefs.streakReminders;
      this.dailyReminder = prefs.dailyReminder;
      this.reminderTime = prefs.reminderTime;
      this.buddyHungerAlerts = prefs.buddyHungerAlerts;
      this.weeklySummary = prefs.weeklySummary;
    }
  }

  toggleStreakReminders(): void {
    this.streakReminders = !this.streakReminders;
    this.notificationService.updateNotificationPreferences({ streakReminders: this.streakReminders });
    this.authService.updateSettings(null, { streakReminders: this.streakReminders }).subscribe();
  }

  toggleDailyReminder(): void {
    this.dailyReminder = !this.dailyReminder;
    this.notificationService.updateNotificationPreferences({ dailyReminder: this.dailyReminder });
    this.authService.updateSettings(null, { dailyReminder: this.dailyReminder }).subscribe();
  }

  toggleBuddyHungerAlerts(): void {
    this.buddyHungerAlerts = !this.buddyHungerAlerts;
    this.notificationService.updateNotificationPreferences({ buddyHungerAlerts: this.buddyHungerAlerts });
    this.authService.updateSettings(null, { buddyHungerAlerts: this.buddyHungerAlerts }).subscribe();
  }

  toggleWeeklySummary(): void {
    this.weeklySummary = !this.weeklySummary;
    this.notificationService.updateNotificationPreferences({ weeklySummary: this.weeklySummary });
    this.authService.updateSettings(null, { weeklySummary: this.weeklySummary }).subscribe();
  }

  async changeReminderTime(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Reminder Time',
      inputs: [
        {
          name: 'time',
          type: 'time',
          value: this.reminderTime,
        },
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Save',
          handler: (data) => {
            if (data.time) {
              this.reminderTime = data.time;
              this.notificationService.updateNotificationPreferences({ reminderTime: this.reminderTime });
              this.authService.updateSettings(null, { reminderTime: this.reminderTime }).subscribe();
            }
          },
        },
      ],
    });
    await alert.present();
  }

  get formattedReminderTime(): string {
    const [h, m] = this.reminderTime.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
  }

  toggleSound(): void {
    this.soundEnabled = !this.soundEnabled;
    this.soundService.setEnabled(this.soundEnabled);
    localStorage.setItem('sound', this.soundEnabled.toString());

    // Sync to DB
    this.authService.updateSettings({ soundEnabled: this.soundEnabled }).subscribe();

    // Play a sample sound when enabling so user knows what to expect
    if (this.soundEnabled) {
      this.soundService.play('select');
    }
  }

  async changeDefaultDuration(): Promise<void> {
    const actionSheet = await this.actionSheetController.create({
      header: 'Default Focus Duration',
      buttons: [
        {
          text: '15 minutes',
          handler: () => this.setDuration(15)
        },
        {
          text: '25 minutes',
          handler: () => this.setDuration(25)
        },
        {
          text: '60 minutes',
          handler: () => this.setDuration(60)
        },
        {
          text: 'Cancel',
          role: 'cancel'
        }
      ]
    });
    await actionSheet.present();
  }

  private setDuration(minutes: number): void {
    this.defaultDuration = minutes;
    localStorage.setItem('default_duration', minutes.toString());
    this.authService.updateSettings({ defaultTimerDuration: minutes }).subscribe();
  }

  async openHelp(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Help & Support',
      message: 'Need help? Email us at contact@zavvi.co.in',
      buttons: ['OK']
    });
    await alert.present();
  }

  openPrivacy(): void {
    this.router.navigate(['/privacy-policy']);
  }

  openTerms(): void {
    this.router.navigate(['/terms']);
  }

  async openAbout(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'About Paws Focus',
      message: 'Paws Focus helps you stay productive while caring for your virtual pets. Every focus session you complete contributes to your dog\'s happiness.',
      buttons: ['Amazing!']
    });
    await alert.present();
  }

  async logout(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Log Out',
      message: 'Are you sure you want to log out?',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Log Out',
          role: 'destructive',
          handler: () => {
            this.authService.logout();
            this.router.navigate(['/auth'], { replaceUrl: true });
          }
        }
      ]
    });
    await alert.present();
  }

  async deleteAccount(): Promise<void> {
    // First confirmation
    const firstAlert = await this.alertController.create({
      header: '⚠️ Delete Account',
      message: 'This will permanently delete your account and all associated data including:\n\n• Focus session history\n• Breed collection\n• Kibble balance\n• Statistics\n\nThis action cannot be undone.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Continue',
          role: 'destructive',
          handler: () => this.confirmDeleteAccount()
        }
      ]
    });
    await firstAlert.present();
  }

  private async confirmDeleteAccount(): Promise<void> {
    // Second confirmation with typed confirmation
    const confirmAlert = await this.alertController.create({
      header: 'Confirm Deletion',
      message: 'Type "DELETE" to confirm account deletion:',
      inputs: [
        {
          name: 'confirmation',
          type: 'text',
          placeholder: 'Type DELETE'
        }
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete Forever',
          role: 'destructive',
          handler: async (data) => {
            if (data.confirmation?.toUpperCase() === 'DELETE') {
              await this.executeAccountDeletion();
            } else {
              const errorAlert = await this.alertController.create({
                header: 'Invalid Confirmation',
                message: 'Please type DELETE to confirm.',
                buttons: ['OK']
              });
              await errorAlert.present();
            }
          }
        }
      ]
    });
    await confirmAlert.present();
  }

  private async executeAccountDeletion(): Promise<void> {
    try {
      // Call API to delete account
      await this.authService.deleteAccount();

      // Clear all local data
      localStorage.clear();

      // Show success message
      const successAlert = await this.alertController.create({
        header: 'Account Deleted',
        message: 'Your account and all data have been permanently deleted. We\'re sorry to see you go!',
        buttons: [{
          text: 'OK',
          handler: () => {
            this.router.navigate(['/onboarding'], { replaceUrl: true });
          }
        }]
      });
      await successAlert.present();
    } catch (error) {
      console.error('Error deleting account:', error);
      const errorAlert = await this.alertController.create({
        header: 'Error',
        message: 'Failed to delete account. Please try again or contact support.',
        buttons: ['OK']
      });
      await errorAlert.present();
    }
  }

  async exportData(): Promise<void> {
    try {
      const data = await this.authService.exportUserData();

      // Create a downloadable blob
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      // Create download link
      const a = document.createElement('a');
      a.href = url;
      a.download = `paws-focus-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const successAlert = await this.alertController.create({
        header: 'Data Exported',
        message: 'Your data has been downloaded. This includes your account info, focus history, and statistics.',
        buttons: ['OK']
      });
      await successAlert.present();
    } catch (error) {
      console.error('Error exporting data:', error);
      const errorAlert = await this.alertController.create({
        header: 'Export Failed',
        message: 'Failed to export data. Please try again.',
        buttons: ['OK']
      });
      await errorAlert.present();
    }
  }

  // Developer/Testing Methods
  async createTestUser(): Promise<void> {
    const alert = await this.alertController.create({
      header: '🧪 Create Test User',
      message: 'This will create test data with all dogs unlocked and 30 days of focus history. Your current data will be replaced.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Create Test Data',
          handler: async () => {
            // Create test stats data (includes enough kibble for all breeds)
            this.statsService.createTestUserData();

            // Sync breed unlocks with the new kibble amount
            const stats = this.statsService.stats;
            this.breedService.updateKibble(stats.totalKibble);

            // Show confirmation
            const successAlert = await this.alertController.create({
              header: '✅ Test Data Created',
              message: `Created test user with:\n\n• ${stats.totalKibble} kibble\n• ${stats.completedSessions} sessions\n• ${stats.totalFocusMinutes} minutes focused\n• ${this.breedService.collection.unlockedBreeds.length}/9 breeds unlocked\n\nGo to My Kennel to see all unlocked breeds!`,
              buttons: [
                {
                  text: 'Go to Kennel',
                  handler: () => {
                    this.router.navigate(['/tabs/kennel']);
                  }
                },
                { text: 'OK', role: 'cancel' }
              ]
            });
            await successAlert.present();
          }
        }
      ]
    });
    await alert.present();
  }

  async resetAllData(): Promise<void> {
    const alert = await this.alertController.create({
      header: '⚠️ Reset All Data',
      message: 'This will delete all your focus data, breed unlocks, and progress. This cannot be undone.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Reset Everything',
          role: 'destructive',
          handler: async () => {
            // Reset all services
            this.statsService.resetStats();
            this.breedService.resetCollection();

            // Clear local storage
            localStorage.removeItem('buddy_happiness');
            localStorage.removeItem('buddy_fullness');
            localStorage.removeItem('last_kennel_visit');

            const successAlert = await this.alertController.create({
              header: '✅ Data Reset',
              message: 'All data has been reset. You can start fresh!',
              buttons: ['OK']
            });
            await successAlert.present();
          }
        }
      ]
    });
    await alert.present();
  }
}

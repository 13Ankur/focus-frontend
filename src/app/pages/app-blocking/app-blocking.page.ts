import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonIcon, IonSpinner, AlertController, ToastController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBack, chevronForward, shieldCheckmark, lockClosed } from 'ionicons/icons';
import { Subscription } from 'rxjs';

import { AppBlockerService, AppInfo } from '../../services/app-blocker.service';

type UserTier = 'free' | 'pro' | 'guardian';

@Component({
  selector: 'app-app-blocking',
  standalone: true,
  imports: [CommonModule, IonContent, IonIcon, IonSpinner],
  templateUrl: './app-blocking.page.html',
  styleUrls: ['./app-blocking.page.scss'],
})
export class AppBlockingPage implements OnInit, OnDestroy {

  blockingEnabled = false;
  strictMode = false;
  permissionGranted = false;
  supported = false;
  loading = true;
  loadingApps = false;

  userTier: UserTier = 'free';
  isPro = true;

  installedApps: AppInfo[] = [];
  filteredApps: AppInfo[] = [];
  blockList: Set<string> = new Set();
  selectedCategory: string | null = null;

  categories = [
    { id: 'social', name: 'Social Media', icon: '📱' },
    { id: 'entertainment', name: 'Entertainment', icon: '🎬' },
    { id: 'games', name: 'Games', icon: '🎮' },
    { id: 'news', name: 'News', icon: '📰' },
    { id: 'shopping', name: 'Shopping', icon: '🛒' },
    { id: 'other', name: 'Other', icon: '📦' },
  ];

  private subscriptions: Subscription[] = [];

  constructor(
    private appBlocker: AppBlockerService,
    private router: Router,
    private alertController: AlertController,
    private toastController: ToastController,
  ) {
    addIcons({ arrowBack, chevronForward, shieldCheckmark, lockClosed });
  }

  async ngOnInit(): Promise<void> {
    this.loadUserTier();
    await this.loadState();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
  }

  async ionViewWillEnter(): Promise<void> {
    this.loadUserTier();
    await this.loadState();
  }

  // ── State loading ──

  private async loadState(): Promise<void> {
    this.loading = true;

    await this.appBlocker.initialize();
    this.supported = this.appBlocker.isSupported;
    this.permissionGranted = this.appBlocker.permissionGranted;
    this.blockingEnabled = this.appBlocker.isEnabled;
    this.strictMode = this.appBlocker.isStrictMode;

    const currentList = this.appBlocker.blockList;
    this.blockList = new Set(currentList);

    if (this.permissionGranted) {
      await this.loadInstalledApps();
    }

    this.loading = false;
  }

  private async loadInstalledApps(): Promise<void> {
    this.loadingApps = true;
    this.installedApps = await this.appBlocker.getBlockableApps();
    this.filteredApps = [...this.installedApps];
    this.loadingApps = false;
  }

  private loadUserTier(): void {
    try {
      const user = JSON.parse(localStorage.getItem('focus_user') || '{}');
      this.userTier = user?.subscriptionTier || 'free';
      this.isPro = true;
    } catch {
      this.userTier = 'guardian';
      this.isPro = true;
    }
  }

  // ── Getters ──

  get blockListCount(): number {
    return this.blockList.size;
  }

  get appsInCategory(): AppInfo[] {
    if (!this.selectedCategory) return this.filteredApps;
    return this.filteredApps.filter(a => a.category === this.selectedCategory);
  }

  getAppsForCategory(catId: string): AppInfo[] {
    return this.installedApps.filter(a => a.category === catId);
  }

  getBlockedCountForCategory(catId: string): number {
    return this.installedApps.filter(a => a.category === catId && this.blockList.has(a.id)).length;
  }

  // ── Actions ──

  goBack(): void {
    this.router.navigate(['/settings']);
  }

  async toggleBlocking(): Promise<void> {

    this.blockingEnabled = !this.blockingEnabled;
    await this.appBlocker.setEnabled(this.blockingEnabled);

    if (this.blockingEnabled && !this.permissionGranted) {
      await this.requestPermissions();
    }
  }

  async toggleStrictMode(): Promise<void> {
    if (!this.blockingEnabled) return;

    if (!this.strictMode) {
      const alert = await this.alertController.create({
        header: '⚡ Enable Strict Mode?',
        message: 'In Strict Mode, you CANNOT dismiss the blocking overlay until your focus session ends. This is the most effective way to stay focused.',
        buttons: [
          { text: 'Cancel', role: 'cancel' },
          {
            text: 'Enable Strict Mode',
            handler: async () => {
              this.strictMode = true;
              await this.appBlocker.setStrictMode(true);
            },
          },
        ],
      });
      await alert.present();
    } else {
      this.strictMode = false;
      await this.appBlocker.setStrictMode(false);
    }
  }

  async requestPermissions(): Promise<void> {
    const granted = await this.appBlocker.requestPermission();
    this.permissionGranted = granted;

    if (granted) {
      await this.loadInstalledApps();
      const toast = await this.toastController.create({
        message: 'Permissions granted! You can now select apps to block.',
        duration: 2500,
        position: 'top',
        color: 'success',
      });
      await toast.present();
    } else {
      const alert = await this.alertController.create({
        header: 'Permission Required',
        message: 'App blocking needs permission to detect which app is in the foreground. This is used ONLY during your focus sessions and never collects personal data.',
        buttons: [
          { text: 'Not Now', role: 'cancel' },
          {
            text: 'Open Settings',
            handler: () => this.appBlocker.requestPermission(),
          },
        ],
      });
      await alert.present();
    }
  }

  async toggleApp(app: AppInfo): Promise<void> {
    if (this.blockList.has(app.id)) {
      this.blockList.delete(app.id);
    } else {
      this.blockList.add(app.id);
    }
    await this.appBlocker.setBlockList([...this.blockList]);
  }

  isBlocked(appId: string): boolean {
    return this.blockList.has(appId);
  }

  async blockAllInCategory(catId: string): Promise<void> {
    const apps = this.getAppsForCategory(catId);
    for (const app of apps) {
      this.blockList.add(app.id);
    }
    await this.appBlocker.setBlockList([...this.blockList]);

    const toast = await this.toastController.create({
      message: `${apps.length} apps blocked`,
      duration: 1500,
      position: 'top',
      color: 'success',
    });
    await toast.present();
  }

  async unblockAllInCategory(catId: string): Promise<void> {
    const apps = this.getAppsForCategory(catId);
    for (const app of apps) {
      this.blockList.delete(app.id);
    }
    await this.appBlocker.setBlockList([...this.blockList]);
  }

  filterByCategory(catId: string | null): void {
    this.selectedCategory = this.selectedCategory === catId ? null : catId;
  }

}

import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import {
  IonContent,
  IonIcon,
  AlertController,
  ToastController,
  ActionSheetController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  arrowBack,
  copyOutline,
  shareOutline,
  ellipsisVertical,
  chevronForward,
} from 'ionicons/icons';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Share } from '@capacitor/share';
import { Clipboard } from '@capacitor/clipboard';
import {
  SocialService,
  FocusRoom,
  RoomActivity,
  LeaderboardEntry,
} from '../../services/social.service';

type LeaderboardPeriod = 'weekly' | 'monthly' | 'alltime';

@Component({
  selector: 'app-room-detail',
  standalone: true,
  imports: [CommonModule, IonContent, IonIcon],
  templateUrl: './room-detail.page.html',
  styleUrls: ['./room-detail.page.scss'],
})
export class RoomDetailPage implements OnInit, OnDestroy {
  room: FocusRoom | null = null;
  roomCode = '';
  loading = true;
  loadError = false;

  activity: RoomActivity[] = [];

  leaderboard: LeaderboardEntry[] = [];
  lbPeriod: LeaderboardPeriod = 'weekly';
  lbLoading = false;

  activeSection: 'activity' | 'leaderboard' = 'activity';

  private destroy$ = new Subject<void>();

  constructor(
    private socialService: SocialService,
    private router: Router,
    private route: ActivatedRoute,
    private alertController: AlertController,
    private toastController: ToastController,
    private actionSheetController: ActionSheetController,
  ) {
    addIcons({ arrowBack, copyOutline, shareOutline, ellipsisVertical, chevronForward });
  }

  ngOnInit(): void {
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.roomCode = params['code'] || '';
      if (this.roomCode) this.loadRoom();
    });
  }

  ionViewWillEnter(): void {
    if (this.roomCode) {
      this.loadRoom();
      this.socialService.startPolling(this.roomCode, (activity) => {
        this.activity = activity;
      });
    }
  }

  ionViewWillLeave(): void {
    this.socialService.stopPolling();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.socialService.stopPolling();
  }

  async loadRoom(): Promise<void> {
    this.loading = true;
    this.loadError = false;
    try {
      this.room = await this.socialService.getRoomByCode(this.roomCode);
      if (this.room) {
        this.activity = await this.socialService.getRoomActivity(this.roomCode);
        await this.loadLeaderboard();
      }
    } catch {
      this.loadError = true;
      this.room = null;
    }
    this.loading = false;
  }

  async loadLeaderboard(): Promise<void> {
    this.lbLoading = true;
    try {
      this.leaderboard = await this.socialService.getRoomLeaderboard(this.roomCode, this.lbPeriod);
    } catch {
      this.leaderboard = [];
    }
    this.lbLoading = false;
  }

  switchSection(section: 'activity' | 'leaderboard'): void {
    this.activeSection = section;
  }

  switchPeriod(period: LeaderboardPeriod): void {
    if (this.lbLoading || this.lbPeriod === period) return;
    this.lbPeriod = period;
    this.loadLeaderboard();
  }

  goBack(): void {
    this.router.navigate(['/social']);
  }

  focusTogether(): void {
    this.router.navigate(['/tabs/home'], { queryParams: { room: this.roomCode } });
  }

  async copyCode(): Promise<void> {
    try {
      await Clipboard.write({ string: this.roomCode });
      const toast = await this.toastController.create({
        message: 'Code copied!',
        duration: 1500,
        position: 'bottom',
        color: 'success',
      });
      await toast.present();
    } catch {
      navigator.clipboard?.writeText(this.roomCode);
    }
  }

  async shareRoom(): Promise<void> {
    try {
      await Share.share({
        title: 'Join my StayPaws focus room!',
        text: `Join "${this.room?.name}" on StayPaws! Room code: ${this.roomCode}`,
        dialogTitle: 'Invite Friends',
      });
    } catch {
      await this.copyCode();
    }
  }

  async openOverflowMenu(): Promise<void> {
    const sheet = await this.actionSheetController.create({
      header: this.room?.name || 'Room',
      buttons: [
        {
          text: 'Invite Friends',
          icon: 'share-outline',
          handler: () => this.shareRoom(),
        },
        {
          text: 'Copy Room Code',
          icon: 'copy-outline',
          handler: () => this.copyCode(),
        },
        {
          text: 'Leave Room',
          role: 'destructive',
          handler: () => this.confirmLeaveRoom(),
        },
        {
          text: 'Cancel',
          role: 'cancel',
        },
      ],
    });
    await sheet.present();
  }

  private async confirmLeaveRoom(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Leave Room',
      message: `Are you sure you want to leave "${this.room?.name}"?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Leave',
          role: 'destructive',
          handler: async () => {
            try {
              await this.socialService.leaveRoom(this.roomCode);
              this.router.navigate(['/social']);
            } catch {
              const toast = await this.toastController.create({
                message: 'Failed to leave room',
                duration: 2000,
                color: 'danger',
              });
              await toast.present();
            }
          },
        },
      ],
    });
    await alert.present();
  }

  getTimeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  getBreedEmoji(breed: string): string {
    const map: Record<string, string> = {
      golden_retriever: '🐕',
      husky: '🐺',
      shiba_inu: '🦊',
      cavapoo: '🐩',
      french_bulldog: '🐶',
      labrador: '🦮',
      dachshund: '🌭',
      australian_shepherd: '🐕‍🦺',
      maltese: '🐾',
    };
    return map[breed] || '🐕';
  }

  getMedalEmoji(index: number): string {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return '';
  }

  getTagLabel(tag: string | null): string {
    if (!tag) return '';
    const labels: Record<string, string> = {
      study: 'Study',
      work: 'Work',
      reading: 'Reading',
      exercise: 'Exercise',
      meditation: 'Meditation',
      creative: 'Creative',
      other: 'Other',
    };
    return labels[tag] || tag;
  }
}

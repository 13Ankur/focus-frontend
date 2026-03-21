import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonContent,
  IonIcon,
  AlertController,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBack, copyOutline, shareOutline, addOutline, chevronForward } from 'ionicons/icons';
import { Share } from '@capacitor/share';
import { Clipboard } from '@capacitor/clipboard';
import { Capacitor } from '@capacitor/core';
import { SocialService, FocusRoom, LeaderboardEntry, UserRank } from '../../services/social.service';

type TabId = 'rooms' | 'leaderboard';
type LeaderboardPeriod = 'weekly' | 'monthly' | 'alltime';

@Component({
  selector: 'app-social',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonIcon],
  templateUrl: './social.page.html',
  styleUrls: ['./social.page.scss'],
})
export class SocialPage implements OnInit {
  activeTab: TabId = 'rooms';

  // Rooms
  myRooms: FocusRoom[] = [];
  roomsLoading = true;
  isPro = true;

  // Create room modal
  showCreateModal = false;
  newRoomName = '';
  createdRoomCode = '';
  createLoading = false;

  // Join room modal
  showJoinModal = false;
  joinCode = '';
  joinPreview: FocusRoom | null = null;
  joinLoading = false;
  joinError = '';

  // Leaderboard
  leaderboardPeriod: LeaderboardPeriod = 'weekly';
  leaderboard: LeaderboardEntry[] = [];
  leaderboardLoading = true;
  myRank: UserRank = { rank: null, entry: null, nextEntry: null };

  constructor(
    private socialService: SocialService,
    private router: Router,
    private alertController: AlertController,
    private toastController: ToastController,
  ) {
    addIcons({ arrowBack, copyOutline, shareOutline, addOutline, chevronForward });
  }

  ngOnInit(): void {
    this.loadUserTier();
    this.loadRooms();
    this.loadLeaderboard();
  }

  ionViewWillEnter(): void {
    this.loadRooms();
  }

  private loadUserTier(): void {
    this.isPro = true;
  }

  goBack(): void {
    this.router.navigate(['/tabs/home']);
  }

  switchTab(tab: TabId): void {
    this.activeTab = tab;
    if (tab === 'leaderboard' && this.leaderboard.length === 0) {
      this.loadLeaderboard();
    }
  }

  // ── Rooms ──

  async loadRooms(): Promise<void> {
    this.roomsLoading = true;
    try {
      this.myRooms = await this.socialService.loadMyRooms();
    } catch {
      this.myRooms = [];
    }
    this.roomsLoading = false;
  }

  openRoom(room: FocusRoom): void {
    this.router.navigate(['/room-detail'], { queryParams: { code: room.roomCode } });
  }

  // ── Create Room ──

  openCreateModal(): void {
    this.showCreateModal = true;
    this.newRoomName = '';
    this.createdRoomCode = '';
    this.createLoading = false;
  }

  closeCreateModal(): void {
    this.showCreateModal = false;
  }

  async createRoom(): Promise<void> {
    if (!this.newRoomName.trim() || this.createLoading) return;
    this.createLoading = true;
    try {
      const result = await this.socialService.createRoom(this.newRoomName.trim());
      this.createdRoomCode = result.code;
      this.myRooms = this.socialService.myRooms;
    } catch (err: any) {
      const msg = err?.error?.message || 'Failed to create room';
      const alert = await this.alertController.create({
        header: 'Error',
        message: msg,
        buttons: ['OK'],
      });
      await alert.present();
    }
    this.createLoading = false;
  }

  async copyRoomCode(code: string): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        await Clipboard.write({ string: code });
      } else {
        await navigator.clipboard.writeText(code);
      }
      const toast = await this.toastController.create({
        message: 'Code copied!',
        duration: 1500,
        position: 'bottom',
        color: 'success',
      });
      await toast.present();
    } catch {
      const toast = await this.toastController.create({
        message: 'Could not copy code. Code: ' + code,
        duration: 3000,
        position: 'bottom',
        color: 'warning',
      });
      await toast.present();
    }
  }

  async shareRoomCode(code: string, name: string): Promise<void> {
    const shareText = `Join "${name}" on StayPaws! Room code: ${code}`;
    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({
          title: 'Join my StayPaws focus room!',
          text: shareText,
          dialogTitle: 'Share Room Code',
        });
      } else if (navigator.share) {
        await navigator.share({
          title: 'Join my StayPaws focus room!',
          text: shareText,
        });
      } else {
        await this.copyRoomCode(code);
      }
    } catch {
      await this.copyRoomCode(code);
    }
  }

  // ── Join Room ──

  openJoinModal(): void {
    this.showJoinModal = true;
    this.joinCode = '';
    this.joinPreview = null;
    this.joinError = '';
    this.joinLoading = false;
  }

  closeJoinModal(): void {
    this.showJoinModal = false;
  }

  onJoinCodeInput(): void {
    this.joinCode = this.joinCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    this.joinError = '';
    if (this.joinCode.length === 6) {
      this.previewRoom();
    } else {
      this.joinPreview = null;
    }
  }

  private async previewRoom(): Promise<void> {
    this.joinLoading = true;
    this.joinPreview = await this.socialService.getRoomByCode(this.joinCode);
    if (!this.joinPreview) {
      this.joinError = 'Room not found. Check the code and try again.';
    }
    this.joinLoading = false;
  }

  async joinRoom(): Promise<void> {
    if (!this.joinPreview || this.joinLoading) return;
    this.joinLoading = true;
    try {
      await this.socialService.joinRoom(this.joinCode);
      this.myRooms = this.socialService.myRooms;
      this.showJoinModal = false;
      const toast = await this.toastController.create({
        message: `Joined "${this.joinPreview.name}"!`,
        duration: 2000,
        position: 'bottom',
        color: 'success',
      });
      await toast.present();
    } catch (err: any) {
      this.joinError = err?.error?.message || 'Failed to join room';
    }
    this.joinLoading = false;
  }

  // ── Leaderboard ──

  async loadLeaderboard(): Promise<void> {
    this.leaderboardLoading = true;
    try {
      const [lb, rank] = await Promise.all([
        this.socialService.getGlobalLeaderboard(this.leaderboardPeriod),
        this.socialService.getMyRank(this.leaderboardPeriod),
      ]);
      this.leaderboard = lb;
      this.myRank = rank;
    } catch {
      this.leaderboard = [];
      this.myRank = { rank: null, entry: null, nextEntry: null };
    }
    this.leaderboardLoading = false;
  }

  switchPeriod(period: LeaderboardPeriod): void {
    if (this.leaderboardLoading || this.leaderboardPeriod === period) return;
    this.leaderboardPeriod = period;
    this.loadLeaderboard();
  }

  get minutesAwayText(): string {
    if (!this.myRank.rank || !this.myRank.nextEntry || !this.myRank.entry) return '';
    const diff = this.myRank.nextEntry.focusMinutes - this.myRank.entry.focusMinutes;
    if (diff <= 0) return '';
    return `${diff} min away from #${this.myRank.rank - 1}`;
  }

  get periodLabel(): string {
    if (this.leaderboardPeriod === 'weekly') return 'This Week';
    if (this.leaderboardPeriod === 'monthly') return 'This Month';
    return 'All Time';
  }

  getMedalEmoji(index: number): string {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return '';
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
}

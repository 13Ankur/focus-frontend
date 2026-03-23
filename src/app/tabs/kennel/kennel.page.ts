import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {
  IonContent,
  IonIcon,
  ToastController,
  AlertController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowForward, lockClosed, checkmarkCircle, swapHorizontal, shirtOutline, closeCircle } from 'ionicons/icons';
import { Subscription, firstValueFrom } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

import { AuthService } from '../../services/auth.service';
import { BreedService, DogBreed, BreedCollection, DogState } from '../../services/breed.service';
import { StatsService } from '../../services/stats.service';
import { TimerService } from '../../services/timer.service';
import { SoundService } from '../../services/sound.service';
import { DogBarkService } from '../../services/dog-bark.service';
import { AdService } from '../../services/ad.service';
import { environment } from '../../../environments/environment';
import { safeGetItem, safeSetItem } from '../../utils/storage';

type InteractionType = 'pet' | 'play' | 'treat' | null;
type UserTier = 'free' | 'pro' | 'guardian';

interface FloatingFeedback {
  id: number;
  emoji: string;
  x: number;
  y: number;
}

interface AccessoryItem {
  id: string;
  name: string;
  slot: 'hat' | 'collar' | 'background' | 'special';
  cost: number;
  tier: string;
  icon: string;
  seasonal?: boolean;
  owned: boolean;
  equipped: boolean;
  canBuy: boolean;
  tierLocked: boolean;
}

type AccessorySlot = 'hat' | 'collar' | 'background' | 'special';

const GUARDIAN_BREED_IDS: string[] = ['dachshund', 'australian_shepherd', 'maltese'];

@Component({
  selector: 'app-kennel',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonIcon
  ],
  templateUrl: './kennel.page.html',
  styleUrls: ['./kennel.page.scss']
})
export class KennelPage implements OnInit, OnDestroy {
  private pendingTimeouts: ReturnType<typeof setTimeout>[] = [];

  buddyName: string = 'Buddy';
  happiness: number = 85;
  fullness: number = 70;
  kibbleBalance: number = 0;
  totalKibble: number = 0;

  collection: BreedCollection | null = null;
  allBreeds: DogBreed[] = [];
  activeBreed: DogBreed | null = null;

  isTimerRunning: boolean = false;

  // Tier (all features free)
  userTier: UserTier = 'guardian';
  isPro = true;
  isGuardian = true;
  completedSessions = 0;

  // Ad-powered free treat
  adTreatAvailable: boolean = false;
  adTreatLoading: boolean = false;

  // Treat limits for free users
  dailyTreatsUsed: number = 0;
  readonly FREE_TREAT_LIMIT = 2;

  // Interaction states
  activeInteraction: InteractionType = null;
  isInteracting: boolean = false;
  dogReaction: string = '';

  petCooldown: boolean = false;
  playCooldown: boolean = false;
  treatCooldown: boolean = false;
  readonly COOLDOWN_DURATION = 1500;

  floatingFeedback: FloatingFeedback[] = [];
  private feedbackIdCounter = 0;

  happinessChange: number = 0;
  fullnessChange: number = 0;
  showHappinessChange: boolean = false;
  showFullnessChange: boolean = false;

  // Speech bubble
  speechBubbleText: string = '';
  justCompletedSession: boolean = false;
  newBreedJustUnlocked: boolean = false;

  // Accessories
  showAccessorySheet: boolean = false;
  accessories: AccessoryItem[] = [];
  selectedAccessorySlot: AccessorySlot = 'hat';
  accessorySlots: AccessorySlot[] = ['hat', 'collar', 'background', 'special'];
  equippedAccessories: Record<string, string | null> = { hat: null, collar: null, background: null, special: null };
  accessoryLoading: string | null = null;
  accessoriesLoaded = false;

  private apiUrl = environment.apiUrl;

  private petMessages = [
    'loves the pets! 💚', 'is so happy! 🥰', 'wags their tail! 🐕',
    'leans into your hand! 😊', 'gives you puppy eyes! 🥺', 'rolls over for more! 🎉',
  ];
  private playMessages = [
    'had a blast playing! 🎾', 'is so energetic! ⚡', 'catches the ball! 🏆',
    'zooms around happily! 💨', 'wants to play more! 🐾', 'is having the best time! 🌟',
  ];
  private treatMessages = [
    'gobbled up the treat! 🦴', 'loves the yummy snack! 😋', 'munches happily! 🍖',
    'thanks you with kisses! 💋', 'does a happy dance! 💃', 'savors every bite! ✨',
  ];

  private subscriptions: Subscription[] = [];

  constructor(
    private authService: AuthService,
    private apiService: ApiService,
    private breedService: BreedService,
    private statsService: StatsService,
    private timerService: TimerService,
    private soundService: SoundService,
    private dogBarkService: DogBarkService,
    private adService: AdService,
    private http: HttpClient,
    private router: Router,
    private toastController: ToastController,
    private alertController: AlertController
  ) {
    addIcons({ arrowForward, lockClosed, checkmarkCircle, swapHorizontal, shirtOutline, closeCircle });
  }

  ngOnInit(): void {
    this.loadData();

    const collectionSub = this.breedService.collection$.subscribe(collection => {
      this.collection = collection;
      this.activeBreed = this.breedService.activeBreed;
      this.totalKibble = collection.totalKibble;
    });
    this.subscriptions.push(collectionSub);

    const statsSub = this.statsService.stats$.subscribe(stats => {
      this.kibbleBalance = stats.totalKibble;
      this.completedSessions = stats.completedSessions;
      const newlyUnlocked = this.breedService.checkKibbleUnlocks(stats.totalKibble);
      if (newlyUnlocked) {
        this.newBreedJustUnlocked = true;
        this.updateSpeechBubble();
        this.pendingTimeouts.push(setTimeout(() => { this.newBreedJustUnlocked = false; }, 10000));
        this.showUnlockCelebration(newlyUnlocked);
      }
    });
    this.subscriptions.push(statsSub);

    const timerSub = this.timerService.isRunning$.subscribe(running => {
      this.isTimerRunning = running;
    });
    this.subscriptions.push(timerSub);

    this.updateSpeechBubble();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.pendingTimeouts.forEach(id => clearTimeout(id));
    this.pendingTimeouts = [];
  }

  ionViewWillEnter(): void {
    this.loadData();
    this.activeBreed = this.breedService.activeBreed;
    this.refreshAdTreatAvailability();
    this.loadDailyTreatCount();
    this.updateSpeechBubble();
    this.triggerBreedUnlockCheck();

    const lastSession = safeGetItem('last_session_complete_time');
    if (lastSession) {
      const elapsed = Date.now() - parseInt(lastSession, 10);
      if (elapsed < 30000) {
        this.justCompletedSession = true;
        this.updateSpeechBubble();
        this.pendingTimeouts.push(setTimeout(() => {
          this.justCompletedSession = false;
          this.updateSpeechBubble();
        }, 10000));
      }
    }
  }

  private async triggerBreedUnlockCheck(): Promise<void> {
    try {
      const headers = this.getAuthHeaders();
      const res: any = await this.http
        .post(`${this.apiUrl}/breeds/check-unlocks`, {}, { headers })
        .toPromise();
      if (res?.totalKibble != null) {
        this.totalKibble = res.totalKibble;
      }
      if (res?.newlyUnlocked?.length > 0) {
        await this.breedService.syncWithServer();
        for (const breed of res.newlyUnlocked) {
          const full = this.allBreeds.find(b => b.id === breed.id);
          if (full) await this.showUnlockCelebration(full);
        }
      }
    } catch { /* offline — skip */ }
  }

  // ── Speech Bubble ──

  updateSpeechBubble(): void {
    const name = this.activeBreed?.name || 'Buddy';

    if (this.justCompletedSession) {
      this.speechBubbleText = 'That was delicious! 🍖';
      return;
    }
    if (this.newBreedJustUnlocked) {
      this.speechBubbleText = 'A new friend joined!';
      return;
    }

    const hour = new Date().getHours();
    if (hour >= 0 && hour < 6) {
      this.speechBubbleText = 'zzz...';
      return;
    }

    if (this.fullness < 30) {
      this.speechBubbleText = "I'm getting hungry...";
      return;
    }
    if (this.happiness > 80) {
      this.speechBubbleText = 'I love focus time with you! 🐾';
      return;
    }
    if (this.happiness >= 50) {
      this.speechBubbleText = "Let's focus together!";
      return;
    }
    if (this.happiness >= 20) {
      this.speechBubbleText = "I'm a bit lonely... 😢";
      return;
    }

    this.speechBubbleText = "Let's focus together!";
  }

  // ── Treat Limits ──

  private loadDailyTreatCount(): void {
    const today = new Date().toISOString().slice(0, 10);
    const stored = safeGetItem('daily_treat_data');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        if (data.date === today) {
          this.dailyTreatsUsed = data.count || 0;
          return;
        }
      } catch { /* ignore */ }
    }
    this.dailyTreatsUsed = 0;
    safeSetItem('daily_treat_data', JSON.stringify({ date: today, count: 0 }));
  }

  private incrementDailyTreatCount(): void {
    const today = new Date().toISOString().slice(0, 10);
    this.dailyTreatsUsed++;
    safeSetItem('daily_treat_data', JSON.stringify({ date: today, count: this.dailyTreatsUsed }));
  }

  get treatsRemaining(): number {
    return Infinity;
  }

  get canGiveTreat(): boolean {
    return this.kibbleBalance >= 10;
  }

  // ── Accessories ──

  async openAccessorySheet(): Promise<void> {
    this.showAccessorySheet = true;
    if (!this.accessoriesLoaded) {
      await this.loadAccessories();
    }
  }

  closeAccessorySheet(): void {
    this.showAccessorySheet = false;
  }

  selectSlot(slot: AccessorySlot): void {
    this.selectedAccessorySlot = slot;
  }

  get filteredAccessories(): AccessoryItem[] {
    return this.accessories.filter(a => a.slot === this.selectedAccessorySlot);
  }

  private async loadAccessories(): Promise<void> {
    try {
      const headers = this.getAuthHeaders();
      const res: any = await this.http
        .get(`${this.apiUrl}/buddy/accessories`, { headers })
        .toPromise();
      this.accessories = res.accessories || [];
      this.equippedAccessories = res.equipped || { hat: null, collar: null, background: null, special: null };
      this.accessoriesLoaded = true;
    } catch {
      this.accessories = [];
    }
  }

  async buyAccessory(item: AccessoryItem): Promise<void> {
    if (this.accessoryLoading) return;

    if (item.cost > this.kibbleBalance) {
      const toast = await this.toastController.create({
        message: `Need ${item.cost - this.kibbleBalance} more kibble!`,
        duration: 2000, position: 'top', color: 'warning'
      });
      await toast.present();
      return;
    }

    const alert = await this.alertController.create({
      header: `Buy ${item.name}?`,
      message: item.cost > 0 ? `This costs ${item.cost} kibble.` : `This is free for Guardian members!`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Buy',
          handler: () => this.confirmBuyAccessory(item)
        }
      ]
    });
    await alert.present();
  }

  private async confirmBuyAccessory(item: AccessoryItem): Promise<void> {
    this.accessoryLoading = item.id;
    try {
      const headers = this.getAuthHeaders();
      const res: any = await this.http
        .post(`${this.apiUrl}/buddy/accessories/buy`, { accessoryId: item.id }, { headers })
        .toPromise();

      if (res?.success) {
        item.owned = true;
        item.canBuy = false;
        this.kibbleBalance = res.kibbleBalance ?? (this.kibbleBalance - item.cost);
        this.soundService.play('unlock');
        await this.triggerHaptic('success');

        const toast = await this.toastController.create({
          message: `${item.icon} ${item.name} purchased!`,
          duration: 2000, position: 'top', color: 'success'
        });
        await toast.present();
      }
    } catch (err: any) {
      const msg = err?.error?.message || 'Purchase failed. Try again.';
      const toast = await this.toastController.create({
        message: msg, duration: 2000, position: 'top', color: 'danger'
      });
      await toast.present();
    } finally {
      this.accessoryLoading = null;
    }
  }

  async toggleEquip(item: AccessoryItem): Promise<void> {
    if (this.accessoryLoading) return;

    const shouldEquip = !item.equipped;
    this.accessoryLoading = item.id;

    try {
      const headers = this.getAuthHeaders();
      const res: any = await this.http
        .post(`${this.apiUrl}/buddy/accessories/equip`, { accessoryId: item.id, equip: shouldEquip }, { headers })
        .toPromise();

      if (res?.success) {
        if (shouldEquip) {
          this.accessories
            .filter(a => a.slot === item.slot && a.id !== item.id)
            .forEach(a => a.equipped = false);
        }
        item.equipped = shouldEquip;

        if (res.equippedAccessories) {
          this.equippedAccessories = { ...res.equippedAccessories };
        } else {
          this.equippedAccessories = {
            ...this.equippedAccessories,
            [item.slot]: shouldEquip ? item.id : null,
          };
        }

        this.soundService.play('tap');
        await this.triggerHaptic('light');
      }
    } catch {
      const toast = await this.toastController.create({
        message: 'Could not update. Try again.', duration: 2000, position: 'top', color: 'warning'
      });
      await toast.present();
    } finally {
      this.accessoryLoading = null;
    }
  }

  get hasEquippedAccessories(): boolean {
    return Object.values(this.equippedAccessories).some(v => v !== null);
  }

  getEquippedIcon(slot: string): string {
    const id = this.equippedAccessories[slot];
    if (!id) return '';
    const item = this.accessories.find(a => a.id === id);
    return item?.icon || '';
  }

  get equippedAccessoryCount(): number {
    return Object.values(this.equippedAccessories).filter(v => v !== null).length;
  }

  slotLabel(slot: AccessorySlot): string {
    const labels: Record<AccessorySlot, string> = {
      hat: 'Hats', collar: 'Collars', background: 'Backgrounds', special: 'Special'
    };
    return labels[slot];
  }

  // ── Guardian Breeds ──

  isGuardianBreed(breed: DogBreed): boolean {
    return GUARDIAN_BREED_IDS.includes(breed.id);
  }

  isBreedAccessible(breed: DogBreed): boolean {
    if (this.isGuardianBreed(breed) && !this.isGuardian) return false;
    return this.breedService.isBreedUnlocked(breed.id);
  }

  // ── Ad Free Treat ──

  private refreshAdTreatAvailability(): void {
    const today = new Date().toISOString().slice(0, 10);
    const lastAdTreat = safeGetItem('last_ad_treat_date');
    const isAdFree = this.adService['adFreeSubject']?.value ?? true;
    this.adTreatAvailable = lastAdTreat !== today && !isAdFree && this.adService.rewardedAdReady;
  }

  async watchAdForTreat(): Promise<void> {
    if (this.adTreatLoading) return;
    this.adTreatLoading = true;

    try {
      const rewarded = await this.adService.showDailyBonusAd();
      if (rewarded) {
        safeSetItem('last_ad_treat_date', new Date().toISOString().slice(0, 10));
        this.adTreatAvailable = false;

        this.fullness = Math.min(100, this.fullness + 20);
        this.happiness = Math.min(100, this.happiness + 5);
        this.showStatChange('fullness', 20);
        this.showStatChange('happiness', 5);
        this.saveStats();
        this.updateSpeechBubble();

        this.triggerDogReaction('chomp');
        this.addFloatingFeedback(['🎬', '🦴', '💕']);

        const toast = await this.toastController.create({
          message: `${this.activeBreed?.name || 'Buddy'} enjoyed the free treat! 🦴`,
          duration: 2000, position: 'top', color: 'success',
        });
        await toast.present();
      }
    } catch {
      const toast = await this.toastController.create({
        message: 'Could not load the ad right now. Try again later!',
        duration: 2000, position: 'top', color: 'warning',
      });
      await toast.present();
    } finally {
      this.adTreatLoading = false;
    }
  }

  // ── Data Loading ──

  private async loadData(): Promise<void> {
    this.allBreeds = this.breedService.allBreeds;
    this.activeBreed = this.breedService.activeBreed;
    this.collection = this.breedService.collection;

    const user: any = this.authService.currentUser;
    this.kibbleBalance = user?.kibble || user?.totalKibble || 0;
    this.completedSessions = user?.completedSessions || this.completedSessions;

    // Load local first for speed
    const savedHappiness = safeGetItem('buddy_happiness');
    const savedFullness = safeGetItem('buddy_fullness');
    if (savedHappiness) {
      const parsed = parseInt(savedHappiness, 10);
      if (!isNaN(parsed)) this.happiness = Math.max(0, Math.min(100, parsed));
    }
    if (savedFullness) {
      const parsed = parseInt(savedFullness, 10);
      if (!isNaN(parsed)) this.fullness = Math.max(0, Math.min(100, parsed));
    }

    // Then sync with server
    if (this.authService.isLoggedIn) {
      try {
        const res = await firstValueFrom(this.apiService.getBuddyStats());
        if (res) {
          this.happiness = res.happiness ?? this.happiness;
          this.fullness = res.fullness ?? this.fullness;
          this.saveStats();
          this.updateSpeechBubble();
        }
      } catch (e) {
        console.error('Error syncing buddy stats:', e);
      }
    }

    this.decayStats();
    this.breedService.updateKibble(this.kibbleBalance);
  }

  private decayStats(): void {
    const lastVisit = safeGetItem('last_kennel_visit');
    if (lastVisit) {
      const lastVisitTs = parseInt(lastVisit, 10);
      if (isNaN(lastVisitTs)) return;
      const hoursSince = (Date.now() - lastVisitTs) / (1000 * 60 * 60);
      const decay = Math.floor(hoursSince * 2);
      this.happiness = Math.max(20, this.happiness - decay);
      this.fullness = Math.max(10, this.fullness - decay);
    }
    safeSetItem('last_kennel_visit', Date.now().toString());
    this.saveStats();
  }

  private saveStats(): void {
    safeSetItem('buddy_happiness', this.happiness.toString());
    safeSetItem('buddy_fullness', this.fullness.toString());
  }

  // ── Breed methods ──

  isBreedUnlocked(breed: DogBreed): boolean {
    return this.breedService.isBreedUnlocked(breed.id);
  }

  isBreedActive(breed: DogBreed): boolean {
    return this.activeBreed?.id === breed.id;
  }

  getUnlockProgress(breed: DogBreed): number {
    return this.breedService.getUnlockProgress(breed.id);
  }

  getKibbleToUnlock(breed: DogBreed): number {
    return this.breedService.getKibbleToUnlock(breed.id);
  }


  async selectBreed(breed: DogBreed): Promise<void> {
    if (this.isTimerRunning) {
      const alert = await this.alertController.create({
        header: '⏱️ Focus Session Active',
        message: `You can't change your buddy while ${this.activeBreed?.name || 'your dog'} is eating! Stop the timer first to switch breeds.`,
        buttons: [
          { text: 'Go to Focus', handler: () => this.router.navigate(['/tabs/home']) },
          { text: 'OK', role: 'cancel' }
        ]
      });
      await alert.present();
      return;
    }



    if (!this.isBreedUnlocked(breed)) {
      const kibbleNeeded = this.breedService.getKibbleToUnlock(breed.id);
      const kibbleRequired = breed.unlockRequirement || 0;
      const alert = await this.alertController.create({
        header: '🔒 Locked',
        message: kibbleNeeded > 0
          ? `You need ${kibbleNeeded} more kibble to unlock ${breed.name} (${kibbleRequired} total needed).`
          : `${breed.name} is ready to unlock!`,
        buttons: [
          { text: 'Start Focus', handler: () => this.router.navigate(['/tabs/home']) },
          { text: 'OK', role: 'cancel' }
        ]
      });
      await alert.present();
      return;
    }

    if (this.isBreedActive(breed)) return;

    this.soundService.play('select');
    this.breedService.setActiveBreed(breed.id);
    this.activeBreed = breed;
    this.updateSpeechBubble();

    const toast = await this.toastController.create({
      message: `${breed.name} is now your active buddy! 🐕`,
      duration: 2000, position: 'top', color: 'success'
    });
    await toast.present();
  }

  private async showUnlockCelebration(breed: DogBreed): Promise<void> {
    this.soundService.play('unlock');
    const alert = await this.alertController.create({
      header: '🎉 New Breed Unlocked!',
      message: `Congratulations! You've unlocked ${breed.name}!\n\n"${breed.description}"`,
      buttons: [
        {
          text: 'Use Now',
          handler: () => {
            this.breedService.setActiveBreed(breed.id);
            this.activeBreed = breed;
          }
        },
        { text: 'Later', role: 'cancel' }
      ],
      cssClass: 'unlock-celebration'
    });
    await alert.present();
  }

  get unlockedCount(): number {
    return this.collection?.unlockedBreeds.length || 1;
  }

  get totalBreeds(): number {
    return this.allBreeds.length;
  }

  get currentDogState(): DogState {
    return this.breedService.determineDogState(false, this.fullness, this.happiness, true);
  }

  get isSleeping(): boolean {
    return this.currentDogState === 'sleeping';
  }

  get activeBreedImage(): string {
    if (!this.activeBreed) return 'assets/images/golden_retriever.png';
    return this.breedService.getBreedImage(this.activeBreed, this.currentDogState);
  }

  get dogStatusText(): string {
    const state = this.currentDogState;
    if (state === 'sleeping') {
      return this.breedService.isNightTime() ? 'Having sweet dreams... 💤' : 'Sleepy & needs a meal... 💤';
    }
    if (state === 'happy') return 'Super happy! 🎉';
    if (this.fullness < 50) return 'Getting hungry... 🥺';
    if (this.happiness < 50) return 'Needs some attention 🐕';
    return 'Happy & content 😊';
  }

  get dogStatusEmoji(): string {
    const state = this.currentDogState;
    switch (state) {
      case 'sleeping': return '💤';
      case 'happy': return '🎉';
      default:
        if (this.fullness < 50) return '🥺';
        if (this.happiness < 50) return '🐕';
        return '😊';
    }
  }

  onImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img && !img.src.includes('golden_retriever.png')) {
      img.src = 'assets/images/golden_retriever.png';
    }
  }

  // ── Dog Tap (bark) ──

  onBuddyTapped(): void {
    if (this.isSleeping || this.isInteracting) return;
    const breedId = this.activeBreed?.id || 'golden_retriever';
    const barkText = this.dogBarkService.playBark(breedId);
    if (!barkText) return;

    this.speechBubbleText = barkText;
    this.triggerDogReaction('wiggle');
    this.pendingTimeouts.push(setTimeout(() => this.updateSpeechBubble(), 1500));
  }

  // ── Interaction Methods ──

  private async triggerHaptic(style: 'light' | 'medium' | 'heavy' | 'success' | 'warning' = 'light'): Promise<void> {
    try {
      if (style === 'success') {
        await Haptics.notification({ type: NotificationType.Success });
      } else if (style === 'warning') {
        await Haptics.notification({ type: NotificationType.Warning });
      } else {
        const impactStyle = style === 'light' ? ImpactStyle.Light :
          style === 'medium' ? ImpactStyle.Medium : ImpactStyle.Heavy;
        await Haptics.impact({ style: impactStyle });
      }
    } catch { /* web fallback */ }
  }

  private addFloatingFeedback(emojis: string[]): void {
    emojis.forEach((emoji, index) => {
      this.pendingTimeouts.push(setTimeout(() => {
        const feedback: FloatingFeedback = {
          id: this.feedbackIdCounter++, emoji,
          x: 30 + Math.random() * 40, y: 50 + Math.random() * 20
        };
        this.floatingFeedback.push(feedback);
        this.pendingTimeouts.push(setTimeout(() => {
          this.floatingFeedback = this.floatingFeedback.filter(f => f.id !== feedback.id);
        }, 1500));
      }, index * 150));
    });
  }

  private showStatChange(stat: 'happiness' | 'fullness', change: number): void {
    if (stat === 'happiness') {
      this.happinessChange = change;
      this.showHappinessChange = true;
      this.pendingTimeouts.push(setTimeout(() => this.showHappinessChange = false, 1200));
    } else {
      this.fullnessChange = change;
      this.showFullnessChange = true;
      this.pendingTimeouts.push(setTimeout(() => this.showFullnessChange = false, 1200));
    }
  }

  private triggerDogReaction(reaction: 'jump' | 'wiggle' | 'chomp'): void {
    this.dogReaction = reaction;
    this.pendingTimeouts.push(setTimeout(() => this.dogReaction = '', 800));
  }

  private getRandomMessage(messages: string[]): string {
    return messages[Math.floor(Math.random() * messages.length)];
  }

  private async checkSleepingState(): Promise<boolean> {
    if (this.isSleeping) {
      await this.triggerHaptic('light');
      this.soundService.play('notification');
      if (Math.random() > 0.7) {
        const toast = await this.toastController.create({
          message: `${this.activeBreed?.name || 'Buddy'} is waking up... 🥱`,
          duration: 1500, position: 'top', color: 'primary'
        });
        await toast.present();
        return false;
      }
      const toast = await this.toastController.create({
        message: `Shhh... ${this.activeBreed?.name || 'Buddy'} is sleeping! 😴`,
        duration: 1500, position: 'top', cssClass: 'sleeping-toast'
      });
      await toast.present();
      return true;
    }
    return false;
  }

  async petBuddy(): Promise<void> {
    if (this.petCooldown || this.isInteracting) return;
    if (await this.checkSleepingState()) return;

    this.isInteracting = true;
    this.activeInteraction = 'pet';
    this.petCooldown = true;

    await this.triggerHaptic('light');
    this.soundService.play('tap');
    this.dogBarkService.playBark(this.activeBreed?.id || 'golden_retriever');
    this.triggerDogReaction('wiggle');
    this.addFloatingFeedback(['💚', '💕', '✨']);

    const happinessGain = this.happiness >= 100 ? 0 : Math.min(5, 100 - this.happiness);
    if (happinessGain > 0) {
      this.happiness = Math.min(100, this.happiness + 5);
      this.showStatChange('happiness', 5);

      // Sync with server (fire and forget for better UX, or handle error)
      this.apiService.interactWithBuddy('pet').subscribe({
        next: (res) => {
          if (res.happiness != null) this.happiness = res.happiness;
        },
        error: (err) => console.error('Error syncing pet interaction:', err)
      });
    }
    this.saveStats();
    this.updateSpeechBubble();

    const buddyName = this.activeBreed?.name || 'Buddy';
    let message: string;
    if (this.happiness >= 100) {
      message = `${buddyName} is at maximum happiness! 🌟`;
      await this.triggerHaptic('success');
    } else {
      message = `${buddyName} ${this.getRandomMessage(this.petMessages)}`;
    }

    const toast = await this.toastController.create({
      message, duration: 1500, position: 'top', color: 'success', cssClass: 'interaction-toast'
    });
    await toast.present();

    this.pendingTimeouts.push(setTimeout(() => { this.isInteracting = false; this.activeInteraction = null; }, 500));
    this.pendingTimeouts.push(setTimeout(() => { this.petCooldown = false; }, this.COOLDOWN_DURATION));
  }

  async playWithBuddy(): Promise<void> {
    if (this.playCooldown || this.isInteracting) return;
    if (await this.checkSleepingState()) return;

    if (this.fullness < 20) {
      await this.triggerHaptic('warning');
      this.soundService.play('notification');
      const toast = await this.toastController.create({
        message: `${this.activeBreed?.name || 'Buddy'} is too hungry to play! Give a treat first. 🥺`,
        duration: 2000, position: 'top', color: 'warning'
      });
      await toast.present();
      return;
    }

    this.isInteracting = true;
    this.activeInteraction = 'play';
    this.playCooldown = true;

    await this.triggerHaptic('medium');
    this.soundService.play('select');
    this.dogBarkService.playBark(this.activeBreed?.id || 'golden_retriever');
    this.triggerDogReaction('jump');
    this.addFloatingFeedback(['🎾', '⭐', '💫', '🏃']);

    this.happiness = Math.min(100, this.happiness + 10);
    this.fullness = Math.max(0, this.fullness - 5);
    this.showStatChange('happiness', 10);
    this.showStatChange('fullness', -5);

    // Sync with server
    this.apiService.interactWithBuddy('play').subscribe({
      next: (res) => {
        if (res.happiness != null) this.happiness = res.happiness;
        if (res.fullness != null) this.fullness = res.fullness;
      },
      error: (err) => {
        console.error('Error syncing play interaction:', err);
        const msg = err?.error?.message || 'Could not sync play time.';
        this.showToast(msg, 'warning');
      }
    });

    this.saveStats();
    this.updateSpeechBubble();
    Haptics.impact({ style: ImpactStyle.Medium });

    const buddyName = this.activeBreed?.name || 'Buddy';
    let message: string;
    if (this.happiness >= 100) {
      message = `${buddyName} is having the BEST day ever! 🎉🏆`;
      await this.triggerHaptic('success');
    } else {
      message = `${buddyName} ${this.getRandomMessage(this.playMessages)}`;
    }

    const toast = await this.toastController.create({
      message, duration: 1500, position: 'top', color: 'success', cssClass: 'interaction-toast'
    });
    await toast.present();

    this.pendingTimeouts.push(setTimeout(() => { this.isInteracting = false; this.activeInteraction = null; }, 500));
    this.pendingTimeouts.push(setTimeout(() => { this.playCooldown = false; }, this.COOLDOWN_DURATION));
  }

  async giveTreat(): Promise<void> {
    if (this.treatCooldown || this.isInteracting) return;

    if (this.kibbleBalance < 10) {
      await this.triggerHaptic('warning');
      this.soundService.play('notification');
      const toast = await this.toastController.create({
        message: 'Not enough kibble! Complete focus sessions to earn more. 🦴',
        duration: 2500, position: 'top', color: 'warning'
      });
      await toast.present();
      return;
    }

    if (this.isSleeping) {
      await this.triggerHaptic('light');
      const toast = await this.toastController.create({
        message: `${this.activeBreed?.name || 'Buddy'} smells the treat and wakes up! 👃`,
        duration: 1500, position: 'top', color: 'primary'
      });
      await toast.present();
    }

    if (this.fullness >= 100) {
      await this.triggerHaptic('warning');
      this.soundService.play('notification');
      const toast = await this.toastController.create({
        message: `${this.activeBreed?.name || 'Buddy'} is too full for more treats! 🤰`,
        duration: 2000, position: 'top', color: 'warning'
      });
      await toast.present();
      return;
    }

    this.isInteracting = true;
    this.activeInteraction = 'treat';
    this.treatCooldown = true;

    await this.triggerHaptic('heavy');
    this.soundService.play('treat');
    this.triggerDogReaction('chomp');
    this.addFloatingFeedback(['🦴', '😋', '💕', '✨']);

    this.kibbleBalance -= 10;
    this.authService.updateLocalKibble(-10);
    this.incrementDailyTreatCount();

    const fullnessGain = Math.min(20, 100 - this.fullness);
    this.fullness = Math.min(100, this.fullness + 20);
    this.happiness = Math.min(100, this.happiness + 5);
    this.showStatChange('fullness', fullnessGain);
    this.showStatChange('happiness', 5);

    // Sync with server (crucial because it deducts kibble)
    this.apiService.feedBuddy(10).subscribe({
      next: (res) => {
        if (res.fullness != null) this.fullness = res.fullness;
        if (res.happiness != null) this.happiness = res.happiness;
        if (res.totalKibble != null) {
          this.kibbleBalance = res.totalKibble;
          // Stats service also needs to know
          this.statsService.addKibble(-10);
        }
      },
      error: (err) => {
        console.error('Error syncing feed interaction:', err);
        const msg = err?.error?.message || 'Could not sync treat.';
        this.showToast(msg, 'warning');
      }
    });

    this.saveStats();
    this.updateSpeechBubble();

    const buddyName = this.activeBreed?.name || 'Buddy';
    let message: string;
    if (this.fullness >= 100) {
      message = `${buddyName} is completely full and happy! 🎊`;
      await this.triggerHaptic('success');
    } else {
      message = `${buddyName} ${this.getRandomMessage(this.treatMessages)}`;
    }

    const toast = await this.toastController.create({
      message, duration: 1500, position: 'top', color: 'success', cssClass: 'interaction-toast'
    });
    await toast.present();

    this.pendingTimeouts.push(setTimeout(() => { this.isInteracting = false; this.activeInteraction = null; }, 500));
    this.pendingTimeouts.push(setTimeout(() => { this.treatCooldown = false; }, this.COOLDOWN_DURATION * 1.5));
  }

  // ── Navigation ──

  goToFocus(): void {
    this.router.navigate(['/tabs/home']);
  }

  scrollToBreeds(): void {
    const breedSection = document.querySelector('.collection-section');
    if (breedSection) {
      breedSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ── Helpers ──

  private async showToast(message: string, color: string = 'success'): Promise<void> {
    const toast = await this.toastController.create({
      message, duration: 2000, position: 'top', color
    });
    await toast.present();
  }

  private getAuthHeaders(): HttpHeaders {
    try {
      const user = JSON.parse(safeGetItem('focus_user') || '{}');
      return new HttpHeaders({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user?.token || ''}`,
        'x-timezone': Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    } catch {
      return new HttpHeaders({ 'Content-Type': 'application/json' });
    }
  }
}

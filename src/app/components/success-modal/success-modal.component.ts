import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalController, IonIcon, IonContent } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronBack } from 'ionicons/icons';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

import { SoundService } from '../../services/sound.service';

interface KibbleRainPiece {
  left: number;
  delay: number;
  size: number;
  emoji: string;
}

interface Achievement {
  id: string;
  name: string;
  icon: string;
  kibble: number;
}

@Component({
  selector: 'app-success-modal',
  standalone: true,
  imports: [CommonModule, IonIcon, IonContent],
  templateUrl: './success-modal.component.html',
  styleUrls: ['./success-modal.component.scss'],
})
export class SuccessModalComponent implements OnInit, OnDestroy {
  @Input() kibbleEarned = 25;
  @Input() focusMinutes = 25;
  @Input() totalMeals = 0;
  @Input() totalSessions = 0;
  @Input() mealsJustProvided = 1;
  @Input() breedName = 'Your buddy';
  @Input() breedImage = 'assets/images/golden_retriever.png';
  @Input() currentStreak = 0;
  @Input() streakIncreased = false;
  @Input() totalKibble = 0;
  @Input() nextBreedName = '';
  @Input() nextBreedCost = 0;
  @Input() newBreedUnlocked = '';
  @Input() isFirstSession = false;
  @Input() isAdFree = true;
  @Input() adReady = false;
  @Input() newAchievements: Achievement[] = [];

  // Animation states
  showDog = false;
  showHeadline = false;
  showKibbleRain = false;
  showStats = false;
  showAchievements = false;
  showProgress = false;
  showActions = false;

  // Animated counter
  displayKibble = 0;
  displayMeals = 0;

  kibbleRain: KibbleRainPiece[] = [];

  private counterInterval: any = null;
  private destroyed = false;

  get headline(): string {
    if (this.newBreedUnlocked) return `New Breed Unlocked: ${this.newBreedUnlocked}!`;
    if (this.focusMinutes >= 120) return 'Focus Legend!';
    if (this.isFirstSession) return 'Welcome to StayPaws!';
    return 'Meal Complete!';
  }

  get headlineEmoji(): string {
    if (this.newBreedUnlocked) return '🎊';
    if (this.focusMinutes >= 120) return '🏅';
    if (this.isFirstSession) return '🎉';
    return '🎉';
  }

  get breedProgressPercent(): number {
    if (!this.nextBreedCost || this.nextBreedCost <= 0) return 100;
    return Math.min(100, (this.totalKibble / this.nextBreedCost) * 100);
  }

  get isLegendary(): boolean {
    return this.focusMinutes >= 120;
  }

  constructor(
    private modalController: ModalController,
    private soundService: SoundService,
  ) {
    addIcons({ chevronBack });
  }

  ngOnInit(): void {
    this.kibbleRain = this.generateKibbleRain();
    this.mealsJustProvided = this.mealsJustProvided || Math.max(1, Math.floor(this.kibbleEarned / 25));
    this.runAnimationSequence();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.counterInterval) clearInterval(this.counterInterval);
  }

  private async runAnimationSequence(): Promise<void> {
    // 0.3s — dog bounces in
    await this.delay(300);
    if (this.destroyed) return;
    this.showDog = true;
    this.hapticImpact('heavy');

    // 0.6s — headline fades in
    await this.delay(300);
    if (this.destroyed) return;
    this.showHeadline = true;
    this.soundService.play('complete');

    // 0.8s — kibble rain
    await this.delay(200);
    if (this.destroyed) return;
    this.showKibbleRain = true;

    // 1.0s — stats counter animates
    await this.delay(200);
    if (this.destroyed) return;
    this.showStats = true;
    this.animateCounter();

    // 1.5s — achievements
    await this.delay(500);
    if (this.destroyed) return;
    if (this.newAchievements.length > 0) {
      this.showAchievements = true;
      this.hapticDouble();
      this.soundService.play('unlock');
    }

    // 2.0s — progress bar
    await this.delay(500);
    if (this.destroyed) return;
    this.showProgress = true;

    // 2.5s — action buttons
    await this.delay(500);
    if (this.destroyed) return;
    this.showActions = true;
  }

  private animateCounter(): void {
    const targetKibble = this.kibbleEarned;
    const targetMeals = this.mealsJustProvided;
    const steps = 20;
    let step = 0;

    this.counterInterval = setInterval(() => {
      step++;
      const progress = step / steps;
      const eased = 1 - Math.pow(1 - progress, 3);

      this.displayKibble = Math.round(targetKibble * eased);
      this.displayMeals = Math.round(targetMeals * eased);

      if (step % 4 === 0) this.hapticImpact('light');

      if (step >= steps) {
        this.displayKibble = targetKibble;
        this.displayMeals = targetMeals;
        clearInterval(this.counterInterval);
        this.hapticImpact('medium');
      }
    }, 40);
  }

  private generateKibbleRain(): KibbleRainPiece[] {
    const emojis = ['🦴', '🍖', '⭐', '✨', '🥩', '🦴'];
    return Array.from({ length: 15 }, () => ({
      left: Math.random() * 100,
      delay: Math.random() * 1.5,
      size: 16 + Math.random() * 14,
      emoji: emojis[Math.floor(Math.random() * emojis.length)],
    }));
  }

  async shareResult(): Promise<void> {
    const text = `I just focused for ${this.focusMinutes} minutes and fed a shelter dog! 🐾\n\n` +
      `🦴 ${this.kibbleEarned} kibble earned\n` +
      `🔥 ${this.currentStreak} day streak\n` +
      `🍽 ${this.totalMeals} total meals donated\n\n` +
      `Join me on StayPaws — focus to feed shelter dogs!`;

    try {
      if (Capacitor.isNativePlatform()) {
        await Share.share({
          title: 'StayPaws Focus Session',
          text,
          dialogTitle: 'Share your achievement',
        });
      } else {
        if (navigator.share) {
          await navigator.share({ title: 'StayPaws Focus Session', text });
        } else {
          await navigator.clipboard.writeText(text);
        }
      }
    } catch {
      try {
        await navigator.clipboard.writeText(text);
      } catch { /* silently fail */ }
    }
  }

  async watchAdForBonus(): Promise<void> {
    await this.modalController.dismiss({ action: 'watch_ad' });
  }

  async feedMore(): Promise<void> {
    await this.modalController.dismiss({ action: 'feed_more' });
  }

  async close(): Promise<void> {
    await this.modalController.dismiss({ action: 'close' });
  }

  private async hapticImpact(style: 'light' | 'medium' | 'heavy'): Promise<void> {
    try {
      const map = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy };
      await Haptics.impact({ style: map[style] });
    } catch { /* web / unavailable */ }
  }

  private async hapticDouble(): Promise<void> {
    try {
      await Haptics.impact({ style: ImpactStyle.Heavy });
      await this.delay(80);
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } catch { /* web */ }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

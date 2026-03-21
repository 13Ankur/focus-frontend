import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalController } from '@ionic/angular/standalone';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

import { SoundService } from '../../services/sound.service';

interface Tip {
  icon: string;
  text: string;
  proLink?: boolean;
}

const ALL_TIPS: Tip[] = [
  { icon: '💡', text: 'Try a shorter 15-minute session next time' },
  { icon: '🔒', text: 'Enable app blocking to avoid distractions', proLink: true },
  { icon: '🎵', text: 'Focus sounds can help you stay in the zone', proLink: true },
  { icon: '🔕', text: 'Turn on Do Not Disturb before starting' },
  { icon: '📍', text: 'Find a quiet spot before your next session' },
  { icon: '⏰', text: 'Try scheduling a specific time for focus' },
];

@Component({
  selector: 'app-failed-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './failed-modal.component.html',
  styleUrls: ['./failed-modal.component.scss'],
})
export class FailedModalComponent implements OnInit {
  @Input() breedName = 'Your buddy';
  @Input() breedImage = 'assets/images/golden_retriever.png';
  @Input() minutesCompleted = 0;
  @Input() partialKibble = 0;
  @Input() originalDuration = 25;
  @Input() isPro = false;

  tips: Tip[] = [];

  get earnedSomething(): boolean {
    return this.minutesCompleted >= 5 && this.partialKibble > 0;
  }

  get encouragementMessage(): string {
    if (this.minutesCompleted === 0) {
      return `${this.breedName} is cheering you on! Next time will be great.`;
    }
    if (this.minutesCompleted < 5) {
      return `No kibble this time, but ${this.breedName} is cheering you on!`;
    }
    return `You earned ${this.partialKibble} kibble for your effort`;
  }

  get subtitle(): string {
    if (this.minutesCompleted === 0) return `${this.breedName} understands. Every effort counts! 🐾`;
    return `You focused for ${this.minutesCompleted} minute${this.minutesCompleted !== 1 ? 's' : ''} — that's something!`;
  }

  constructor(
    private modalController: ModalController,
    private soundService: SoundService,
  ) {}

  ngOnInit(): void {
    this.pickTips();
    this.soundService.play('failed');
    this.hapticLight();
  }

  private pickTips(): void {
    const shuffled = [...ALL_TIPS].sort(() => Math.random() - 0.5);
    this.tips = shuffled.slice(0, 2);
  }

  async tryAgainShort(): Promise<void> {
    await this.modalController.dismiss({ action: 'retry', duration: 15 });
  }

  async tryAgainSame(): Promise<void> {
    await this.modalController.dismiss({ action: 'retry', duration: this.originalDuration });
  }

  async close(): Promise<void> {
    await this.modalController.dismiss({ action: 'close' });
  }

  private async hapticLight(): Promise<void> {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch { /* web */ }
  }
}

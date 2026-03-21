import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent,
  IonIcon,
  AlertController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline } from 'ionicons/icons';
import { Subscription } from 'rxjs';

import { TimerService } from '../../services/timer.service';
import { BreedService } from '../../services/breed.service';

@Component({
  selector: 'app-focus-mode',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonIcon
  ],
  templateUrl: './focus-mode.page.html',
  styleUrls: ['./focus-mode.page.scss']
})
export class FocusModePage implements OnInit, OnDestroy {
  remainingSeconds: number = 0;
  totalSeconds: number = 1500;
  progress: number = 0;
  
  // Circular progress properties
  readonly radius: number = 120;
  readonly circumference: number = 2 * Math.PI * 120;
  
  Math = Math;
  
  private subscriptions: Subscription[] = [];

  constructor(
    private timerService: TimerService,
    private breedService: BreedService,
    private router: Router,
    private alertController: AlertController
  ) {
    addIcons({ closeOutline });
  }

  // Get breed name directly from service
  get buddyName(): string {
    return this.breedService.activeBreed?.name || 'Your buddy';
  }

  get buddyImage(): string {
    return this.breedService.activeBreed?.image || 'assets/images/golden_retriever.png';
  }

  ngOnInit(): void {
    const remainingSub = this.timerService.remainingSeconds$.subscribe(seconds => {
      this.remainingSeconds = seconds;
      this.updateProgress();
    });
    this.subscriptions.push(remainingSub);
    
    const totalSub = this.timerService.totalSeconds$.subscribe(total => {
      this.totalSeconds = total;
      this.updateProgress();
    });
    this.subscriptions.push(totalSub);
  }

  get dashOffset(): number {
    return this.circumference * (1 - this.progress);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private updateProgress(): void {
    if (this.totalSeconds > 0) {
      this.progress = (this.totalSeconds - this.remainingSeconds) / this.totalSeconds;
    }
  }

  get formattedTime(): string {
    const minutes = Math.floor(this.remainingSeconds / 60);
    const seconds = this.remainingSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  async endSession(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Stop Feeding?',
      message: `${this.buddyName} is still hungry! Stopping now means no kibble earned.`,
      buttons: [
        {
          text: 'Keep Feeding',
          role: 'cancel'
        },
        {
          text: 'Stop Feeding',
          role: 'destructive',
          handler: () => {
            this.timerService.stop();
            this.router.navigate(['/tabs/home'], { replaceUrl: true });
          }
        }
      ]
    });
    await alert.present();
  }
}

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent,
  IonIcon
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowForward } from 'ionicons/icons';

@Component({
  selector: 'app-subscription-success',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonIcon
  ],
  templateUrl: './subscription-success.page.html',
  styleUrls: ['./subscription-success.page.scss']
})
export class SubscriptionSuccessPage implements OnInit {
  planName: string = 'Pro';
  confettiArray: number[] = Array.from({ length: 20 }, (_, i) => i);
  
  benefits: string[] = [
    'Unlimited focus sessions',
    'Custom & long focus timers',
    'All dog breeds unlocked',
    'Focus sounds & ambient audio',
    'App blocking during sessions',
    'Full analytics & insights',
    'Ad-free experience',
    'Weekly streak shield',
  ];

  constructor(private router: Router) {
    addIcons({ arrowForward });
  }

  ngOnInit(): void {
    this.loadPlanDetails();
  }

  private loadPlanDetails(): void {
    try {
      const stored = localStorage.getItem('focus_user');
      if (stored) {
        const user = JSON.parse(stored);
        const tier = user?.subscriptionTier || 'pro';
        this.planName = tier === 'guardian' ? 'Guardian Angel' : 'Pro';
      }
    } catch {
      // Default to Pro
    }
  }

  getRandomPosition(index: number): number {
    return (index * 5) % 100;
  }

  getRandomDelay(index: number): number {
    return (index * 0.15) % 3;
  }

  goHome(): void {
    this.router.navigate(['/tabs/home'], { replaceUrl: true });
  }
}

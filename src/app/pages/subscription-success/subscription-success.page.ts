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
  planName: string = 'Champion';
  mealsPerMonth: number = 15;
  confettiArray: number[] = Array.from({ length: 20 }, (_, i) => i);
  
  benefits: string[] = [
    'All premium dog breeds',
    '2x kibble earnings',
    'Ad-free experience',
    'Monthly shelter updates'
  ];

  constructor(private router: Router) {
    addIcons({ arrowForward });
  }

  ngOnInit(): void {
    this.loadPlanDetails();
  }

  private loadPlanDetails(): void {
    const planId = localStorage.getItem('subscription_plan');
    
    const plans: { [key: string]: { name: string; meals: number; benefits: string[] } } = {
      'protector': {
        name: 'Protector',
        meals: 5,
        benefits: ['All premium dog breeds', 'Ad-free experience', 'Priority support']
      },
      'champion': {
        name: 'Champion',
        meals: 15,
        benefits: ['All premium dog breeds', '2x kibble earnings', 'Ad-free experience', 'Exclusive accessories', 'Monthly shelter updates']
      },
      'guardian': {
        name: 'Guardian Angel',
        meals: 50,
        benefits: ['All premium dog breeds', '3x kibble earnings', 'Name a shelter dog', 'Direct impact reports', 'VIP shelter visits']
      }
    };
    
    if (planId && plans[planId]) {
      this.planName = plans[planId].name;
      this.mealsPerMonth = plans[planId].meals;
      this.benefits = plans[planId].benefits;
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

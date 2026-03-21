import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent,
  IonIcon
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBack, checkmarkCircle } from 'ionicons/icons';

@Component({
  selector: 'app-subscription',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonIcon
  ],
  templateUrl: './subscription.page.html',
  styleUrls: ['./subscription.page.scss']
})
export class SubscriptionPage {

  constructor(private router: Router) {
    addIcons({ arrowBack, checkmarkCircle });
  }

  goBack(): void {
    this.router.navigate(['/tabs/home']);
  }

  goToHome(): void {
    this.router.navigate(['/tabs/home'], { replaceUrl: true });
  }
}

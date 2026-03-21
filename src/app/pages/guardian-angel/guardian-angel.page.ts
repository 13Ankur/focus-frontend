import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent,
  IonButton,
  IonIcon
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  chevronBack, 
  shareOutline, 
  play, 
  flash,
  shieldCheckmark,
  ribbon,
  heart,
  star
} from 'ionicons/icons';

@Component({
  selector: 'app-guardian-angel',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonButton,
    IonIcon
  ],
  templateUrl: './guardian-angel.page.html',
  styleUrls: ['./guardian-angel.page.scss']
})
export class GuardianAngelPage {

  constructor(private router: Router) {
    addIcons({ 
      chevronBack, 
      shareOutline, 
      play, 
      flash,
      shieldCheckmark,
      ribbon,
      heart,
      star
    });
  }

  goBack(): void {
    this.router.navigate(['/subscription']);
  }

  share(): void {
    if (navigator.share) {
      navigator.share({
        title: 'Paws Focus Guardian Angel',
        text: 'Become a Guardian Angel and help feed 100 shelter dogs every month! 🐕💚',
        url: 'https://pawsfocus.app/guardian'
      }).catch(() => {
        console.log('Share cancelled');
      });
    }
  }

  joinGuardian(): void {
    console.log('Join Guardian Angel - IAP integration pending');
    // In production, this would trigger IAP
    // For now, simulate success
    this.router.navigate(['/subscription-success'], {
      queryParams: { plan: 'guardian' }
    });
  }
}

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBack } from 'ionicons/icons';

@Component({
  selector: 'app-privacy-policy',
  standalone: true,
  imports: [CommonModule, IonContent, IonIcon],
  templateUrl: './privacy-policy.page.html',
  styleUrls: ['./privacy-policy.page.scss']
})
export class PrivacyPolicyPage {
  lastUpdated = 'January 12, 2026';
  appName = 'Paws Focus';
  companyName = 'Paws Focus App';
  contactEmail = 'contact@zavvi.co.in';
  supportEmail = 'contact@zavvi.co.in';

  constructor(private router: Router) {
    addIcons({ arrowBack });
  }

  goBack(): void {
    this.router.navigate(['/settings']);
  }
}

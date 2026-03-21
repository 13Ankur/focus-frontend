import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBack } from 'ionicons/icons';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [CommonModule, IonContent, IonIcon],
  templateUrl: './terms.page.html',
  styleUrls: ['./terms.page.scss']
})
export class TermsPage {
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

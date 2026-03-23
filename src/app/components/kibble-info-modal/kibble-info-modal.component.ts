import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, ModalController, IonIcon, IonButton } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeCircle } from 'ionicons/icons';

@Component({
    selector: 'app-kibble-info-modal',
    standalone: true,
    imports: [CommonModule, IonContent, IonIcon, IonButton],
    template: `
    <div class="modal-wrapper">
      <div class="modal-header">
        <h2 class="title">Kibble Rules</h2>
        <button class="close-btn" (click)="close()" aria-label="Close modal">
          <ion-icon name="close-circle"></ion-icon>
        </button>
      </div>

      <p class="subtitle">Focus longer, earn more!</p>

      <div class="rules-list">
        <div class="rule-item">
          <span class="time">15 min</span>
          <span class="reward">15 🦴</span>
        </div>
        <div class="rule-item">
          <span class="time">25 min</span>
          <span class="reward">30 🦴 <span class="bonus">(+5)</span></span>
        </div>
        <div class="rule-item">
          <span class="time">45 min</span>
          <span class="reward">55 🦴 <span class="bonus">(+10)</span></span>
        </div>
        <div class="rule-item">
          <span class="time">60 min</span>
          <span class="reward">75 🦴 <span class="bonus">(+15)</span></span>
        </div>
        <div class="rule-item">
          <span class="time">90 min</span>
          <span class="reward">120 🦴 <span class="bonus">(+30)</span></span>
        </div>
        <div class="rule-item">
          <span class="time">120 min</span>
          <span class="reward">180 🦴 <span class="bonus">(+60)</span></span>
        </div>
      </div>

      <p class="footer-note">Bonuses are only awarded for fully completed sessions.</p>

      <ion-button expand="block" shape="round" class="got-it-btn" (click)="close()">Got It!</ion-button>
    </div>
  `,
    styles: [`
    .modal-wrapper {
      padding: 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      background: white;
      height: 100%;
      box-sizing: border-box;
    }
    .modal-header {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .title {
      font-size: 24px;
      font-weight: 800;
      color: #2C2C2C;
      margin: 0;
    }
    .close-btn {
      background: none;
      border: none;
      font-size: 28px;
      color: #888;
      padding: 0;
      margin: 0;
      cursor: pointer;
    }
    .subtitle {
      font-size: 16px;
      color: #666;
      margin: 0 0 24px 0;
      font-weight: 600;
      width: 100%;
      text-align: left;
    }
    .rules-list {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: #f8f9fa;
      padding: 16px;
      border-radius: 16px;
      margin-bottom: 24px;
    }
    .rule-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(0,0,0,0.05);
    }
    .rule-item:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
    .time {
      font-weight: 700;
      color: #2C2C2C;
      font-size: 16px;
    }
    .reward {
      font-weight: 700;
      color: #FF9B26; /* Kibble orange */
      font-size: 16px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .bonus {
      font-size: 13px;
      background: rgba(126, 211, 33, 0.15);
      color: #4CAF50;
      padding: 2px 6px;
      border-radius: 10px;
      font-weight: 800;
    }
    .footer-note {
      font-size: 14px;
      color: #888;
      text-align: center;
      font-style: italic;
      margin: 0 0 24px 0;
    }
    .got-it-btn {
      --background: #FF9B26;
      --background-activated: #E88B1C;
      margin-top: auto;
      width: 100%;
      font-weight: 700;
    }
  `]
})
export class KibbleInfoModalComponent {
    constructor(private modalCtrl: ModalController) {
        addIcons({ closeCircle });
    }

    close() {
        this.modalCtrl.dismiss();
    }
}

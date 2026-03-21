import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent,
  IonIcon,
  IonSpinner,
  ToastController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkCircle, lockClosed } from 'ionicons/icons';

import { BreedService, DogBreed } from '../../services/breed.service';
import { DogBarkService } from '../../services/dog-bark.service';

@Component({
  selector: 'app-breed-selection',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonIcon,
    IonSpinner
  ],
  templateUrl: './breed-selection.page.html',
  styleUrls: ['./breed-selection.page.scss']
})
export class BreedSelectionPage implements OnInit {
  selectedBreed: string = '';
  isLoading: boolean = false;

  // All breeds
  allBreeds: DogBreed[] = [];

  constructor(
    private router: Router,
    private toastController: ToastController,
    private breedService: BreedService,
    private dogBarkService: DogBarkService
  ) {
    addIcons({ checkmarkCircle, lockClosed });
  }

  ngOnInit(): void {
    // Get all 9 breeds
    this.allBreeds = this.breedService.allBreeds;
    
    // Load saved selection or default to first breed
    const savedBreed = this.breedService.collection.activeBreed;
    if (savedBreed) {
      this.selectedBreed = savedBreed;
    } else {
      this.selectedBreed = 'golden_retriever';
    }
  }

  isBreedUnlocked(breed: DogBreed): boolean {
    return this.breedService.isBreedUnlocked(breed.id);
  }

  selectBreed(breed: DogBreed): void {
    if (!this.isBreedUnlocked(breed)) {
      return;
    }
    this.selectedBreed = breed.id;
    this.dogBarkService.playBark(breed.id);
  }

  getSelectedBreed(): DogBreed | undefined {
    return this.allBreeds.find(b => b.id === this.selectedBreed);
  }

  getSelectedBreedName(): string {
    const breed = this.getSelectedBreed();
    return breed ? breed.name : 'your buddy';
  }

  getUnlockProgress(breed: DogBreed): number {
    return this.breedService.getUnlockProgress(breed.id);
  }

  getKibbleToUnlock(breed: DogBreed): number {
    return this.breedService.getKibbleToUnlock(breed.id);
  }

  async confirmSelection(): Promise<void> {
    if (!this.selectedBreed || this.isLoading) return;
    
    // Make sure selected breed is unlocked
    const breed = this.getSelectedBreed();
    if (!breed || !this.isBreedUnlocked(breed)) {
      const toast = await this.toastController.create({
        message: 'Please select an unlocked breed',
        duration: 2000,
        position: 'top',
        color: 'warning'
      });
      await toast.present();
      return;
    }
    
    this.isLoading = true;
    
    try {
      // Set as active breed in service
      this.breedService.setActiveBreed(this.selectedBreed);
      
      // Save selection flags
      localStorage.setItem('selected_breed', this.selectedBreed);
      localStorage.setItem('breed_selected', 'true');
      localStorage.removeItem('is_new_user');
      
      // Show success toast
      const toast = await this.toastController.create({
        message: `${this.getSelectedBreedName()} is ready to join you! 🐕`,
        duration: 2000,
        position: 'top',
        color: 'success'
      });
      await toast.present();
      
      // Navigate to home
      setTimeout(() => {
        this.router.navigate(['/tabs/home'], { replaceUrl: true });
      }, 500);
      
    } catch (error) {
      console.error('Error saving breed selection:', error);
      this.isLoading = false;
    }
  }
}

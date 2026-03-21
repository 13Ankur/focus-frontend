import { Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { safeGetItem, safeSetItem } from '../utils/storage';

export type DogState = 'idle' | 'eating' | 'sleeping' | 'happy';

export interface DogBreed {
  id: string;
  name: string;
  description: string;
  image: string;
  eatingImage: string;
  sleepingImage: string;

  unlockRequirement: number;
  sessionUnlockRequirement: number;
  order: number;
}

export interface BreedCollection {
  unlockedBreeds: string[];
  activeBreed: string;
  totalKibble: number;
  completedSessions: number;
}

/**
 * PRODUCT DESIGN - Dog States & Images:
 * 
 * 1. IDLE (Default state)
 *    - When: Timer not running, fullness >= 30%, not sleeping hours
 *    - Shows: Breed's default image (e.g., husky.png)
 * 
 * 2. EATING (Focus session active)
 *    - When: Timer IS running
 *    - Shows: THE SAME BREED's default image (e.g., if Husky is selected, shows husky.png)
 *    - The eating state is indicated through CSS animations (wobble, food particles, glow)
 *    - This ensures users always see their selected breed while eating
 * 
 * 3. SLEEPING (Rest mode)
 *    - When: Timer not running AND (fullness < 30% OR it's nighttime 10pm-6am)
 *    - Shows: Breed-specific sleeping image (e.g., husky_sleeping.png)
 *    - Scene: Night mode background in kennel
 * 
 * 4. HAPPY (Celebrating)
 *    - When: Timer not running AND happiness >= 90%
 *    - Shows: Breed's default image with celebration effects
 */

const FALLBACK_IMAGES = {
  default: 'assets/images/golden_retriever.png',
  sleeping: 'assets/images/golden_retriever_sleeping.png'
};

// Night hours when dog should be sleeping (10 PM - 6 AM)
const SLEEP_START_HOUR = 22; // 10 PM
const SLEEP_END_HOUR = 6;    // 6 AM

const LOCAL_STORAGE_KEY = 'breed_collection';

@Injectable({
  providedIn: 'root'
})
export class BreedService {
  // All available breeds with their unlock requirements and state images
  readonly allBreeds: DogBreed[] = [
    {
      id: 'golden_retriever',
      name: 'Golden Retriever',
      description: 'Friendly & loyal companion',
      image: 'assets/images/golden_retriever.png',
      eatingImage: 'assets/images/golden_retriever.png',
      sleepingImage: 'assets/images/golden_retriever_sleeping.png',

      unlockRequirement: 0,
      sessionUnlockRequirement: 0,
      order: 1
    },
    {
      id: 'husky',
      name: 'Husky',
      description: 'Energetic & adventurous',
      image: 'assets/images/husky.png',
      eatingImage: 'assets/images/husky.png',
      sleepingImage: 'assets/images/husky_sleeping.png',

      unlockRequirement: 500,
      sessionUnlockRequirement: 5,
      order: 2
    },
    {
      id: 'shiba_inu',
      name: 'Shiba Inu',
      description: 'Charming & spirited',
      image: 'assets/images/shiba_inu.png',
      eatingImage: 'assets/images/shiba_inu.png',
      sleepingImage: 'assets/images/shiba_inu_sleeping.png',

      unlockRequirement: 1000,
      sessionUnlockRequirement: 15,
      order: 3
    },
    {
      id: 'cavapoo',
      name: 'Cavapoo',
      description: 'Sweet & cuddly',
      image: 'assets/images/cavapoo.png',
      eatingImage: 'assets/images/cavapoo.png',
      sleepingImage: 'assets/images/cavapoo_sleeping.png',

      unlockRequirement: 2000,
      sessionUnlockRequirement: 30,
      order: 4
    },
    {
      id: 'french_bulldog',
      name: 'French Bulldog',
      description: 'Playful & affectionate',
      image: 'assets/images/french_bulldog.png',
      eatingImage: 'assets/images/french_bulldog.png',
      sleepingImage: 'assets/images/french_bulldog_sleeping.png',

      unlockRequirement: 3000,
      sessionUnlockRequirement: 50,
      order: 5
    },
    {
      id: 'labrador',
      name: 'Labrador Retriever',
      description: 'Gentle & outgoing',
      image: 'assets/images/labrador.png',
      eatingImage: 'assets/images/labrador.png',
      sleepingImage: 'assets/images/labrador_sleeping.png',

      unlockRequirement: 4000,
      sessionUnlockRequirement: 75,
      order: 6
    },
    {
      id: 'dachshund',
      name: 'Dachshund',
      description: 'Clever & curious',
      image: 'assets/images/dachshund.png',
      eatingImage: 'assets/images/dachshund.png',
      sleepingImage: 'assets/images/dachshund_sleeping.png',

      unlockRequirement: 6000,
      sessionUnlockRequirement: 100,
      order: 7
    },
    {
      id: 'australian_shepherd',
      name: 'Australian Shepherd',
      description: 'Smart & work-oriented',
      image: 'assets/images/australian_shepherd.png',
      eatingImage: 'assets/images/australian_shepherd.png',
      sleepingImage: 'assets/images/australian_shepherd_sleeping.png',

      unlockRequirement: 8000,
      sessionUnlockRequirement: 150,
      order: 8
    },
    {
      id: 'maltese',
      name: 'Maltese',
      description: 'Gentle & fearless',
      image: 'assets/images/maltese.png',
      eatingImage: 'assets/images/maltese.png',
      sleepingImage: 'assets/images/maltese_sleeping.png',

      unlockRequirement: 10000,
      sessionUnlockRequirement: 200,
      order: 9
    }
  ];

  private collectionSubject = new BehaviorSubject<BreedCollection>({
    unlockedBreeds: ['golden_retriever'],
    activeBreed: 'golden_retriever',
    totalKibble: 0,
    completedSessions: 0,
  });

  public collection$ = this.collectionSubject.asObservable();
  private newlyUnlockedBreed: DogBreed | null = null;

  constructor(private apiService: ApiService) {
    this.loadCollection();
  }

  // ============ GETTERS ============

  get collection(): BreedCollection {
    return this.collectionSubject.value;
  }

  get activeBreed(): DogBreed {
    const breed = this.allBreeds.find(b => b.id === this.collection.activeBreed);
    return breed || this.allBreeds[0];
  }

  get unlockedBreeds(): DogBreed[] {
    return this.allBreeds.filter(b => this.collection.unlockedBreeds.includes(b.id));
  }

  get lockedBreeds(): DogBreed[] {
    return this.allBreeds.filter(b => !this.collection.unlockedBreeds.includes(b.id));
  }

  // ============ IMAGE METHODS ============

  getActiveBreedImage(state: DogState = 'idle'): string {
    const breed = this.activeBreed;
    return this.getBreedImage(breed, state);
  }

  /**
   * Get the correct image for a breed based on its state
   * 
   * IMPORTANT: For EATING state, we return the breed's DEFAULT image.
   * The "eating" visual is shown through CSS animations (wobble, food particles)
   * rather than a different image. This ensures the user always sees their
   * selected breed (Husky, Shiba, etc.) whether eating or idle.
   * 
   * For SLEEPING, we have breed-specific sleeping images.
   */
  getBreedImage(breed: DogBreed, state: DogState = 'idle'): string {
    switch (state) {
      case 'eating':
        // Use the SAME breed image - eating is indicated through animations
        return breed.image || FALLBACK_IMAGES.default;
      case 'sleeping':
        // Use breed-specific sleeping image
        return breed.sleepingImage || FALLBACK_IMAGES.sleeping;
      case 'happy':
        // Happy uses the same image as idle, but with animations
        return breed.image || FALLBACK_IMAGES.default;
      case 'idle':
      default:
        return breed.image || FALLBACK_IMAGES.default;
    }
  }

  getBreedImageById(breedId: string, state: DogState = 'idle'): string {
    const breed = this.allBreeds.find(b => b.id === breedId);
    if (!breed) {
      return FALLBACK_IMAGES.default;
    }
    return this.getBreedImage(breed, state);
  }

  /**
   * Determine the dog's current state based on various factors
   * 
   * Priority Order:
   * 1. EATING - Timer is running (user is in a focus session)
   * 2. SLEEPING - It's nighttime (10pm-6am) OR fullness is very low (<30%)
   * 3. HAPPY - Happiness is very high (>=90%)
   * 4. IDLE - Default state
   * 
   * @param isTimerRunning - Whether a focus session is active
   * @param fullness - Dog's fullness level (0-100)
   * @param happiness - Dog's happiness level (0-100)
   * @param checkNightTime - Whether to consider time of day for sleeping
   */
  determineDogState(
    isTimerRunning: boolean,
    fullness: number = 70,
    happiness: number = 70,
    checkNightTime: boolean = true
  ): DogState {
    // Priority 1: Eating (focus session active)
    if (isTimerRunning) {
      return 'eating';
    }

    // Priority 2: Sleeping (nighttime or very low fullness)
    if (checkNightTime && this.isNightTime()) {
      return 'sleeping';
    }
    if (fullness < 30) {
      return 'sleeping';
    }

    // Priority 3: Happy (very high happiness)
    if (happiness >= 90) {
      return 'happy';
    }

    // Default: Idle
    return 'idle';
  }

  /**
   * Check if current time is during "night hours" (10 PM - 6 AM)
   * During these hours, the dog should be sleeping
   */
  isNightTime(): boolean {
    const hour = new Date().getHours();
    return hour >= SLEEP_START_HOUR || hour < SLEEP_END_HOUR;
  }

  /**
   * Get a human-readable status message for the current dog state
   */
  getStateMessage(state: DogState): string {
    switch (state) {
      case 'eating':
        return 'Buddy is eating! 🍖';
      case 'sleeping':
        return 'Zzz... Buddy is sleeping 💤';
      case 'happy':
        return 'Buddy is super happy! 🎉';
      case 'idle':
      default:
        return 'Buddy is ready to help you focus!';
    }
  }

  // ============ UNLOCK METHODS ============

  isBreedUnlocked(breedId: string): boolean {
    return this.collection.unlockedBreeds.includes(breedId);
  }

  getUnlockProgress(breedId: string): number {
    const breed = this.allBreeds.find(b => b.id === breedId);
    if (!breed || breed.sessionUnlockRequirement === 0) return 100;

    const progress = (this.collection.completedSessions / breed.sessionUnlockRequirement) * 100;
    return Math.min(100, Math.max(0, progress));
  }

  getKibbleToUnlock(breedId: string): number {
    const breed = this.allBreeds.find(b => b.id === breedId);
    if (!breed) return 0;

    const remaining = breed.unlockRequirement - this.collection.totalKibble;
    return Math.max(0, remaining);
  }

  getSessionsToUnlock(breedId: string): number {
    const breed = this.allBreeds.find(b => b.id === breedId);
    if (!breed) return 0;

    const remaining = breed.sessionUnlockRequirement - this.collection.completedSessions;
    return Math.max(0, remaining);
  }

  // ============ ACTIVE BREED ============

  async setActiveBreed(breedId: string): Promise<boolean> {
    if (!this.isBreedUnlocked(breedId)) {
      return false;
    }

    const current = this.collection;

    // Optimistic update
    this.collectionSubject.next({
      ...current,
      activeBreed: breedId
    });
    this.saveToLocalStorage();

    // Sync with server if authenticated
    if (this.apiService.isAuthenticated()) {
      try {
        await firstValueFrom(this.apiService.setActiveBreed(breedId));
      } catch (error) {
        console.error('Error syncing active breed with server:', error);
        // Keep local change
      }
    }

    return true;
  }

  // ============ KIBBLE & UNLOCKS ============

  updateKibble(totalKibble: number): DogBreed | null {
    const current = this.collection;

    if (totalKibble === current.totalKibble) {
      return null;
    }

    this.collectionSubject.next({
      ...current,
      totalKibble: totalKibble
    });
    this.saveToLocalStorage();

    return null;
  }

  checkSessionUnlocks(completedSessions: number): DogBreed | null {
    const current = this.collection;
    let firstNewUnlock: DogBreed | null = null;

    const newUnlocked = [...current.unlockedBreeds];
    for (const breed of this.allBreeds) {
      if (
        breed.sessionUnlockRequirement > 0 &&
        completedSessions >= breed.sessionUnlockRequirement &&
        !newUnlocked.includes(breed.id)
      ) {
        newUnlocked.push(breed.id);
        if (!firstNewUnlock) firstNewUnlock = breed;
      }
    }

    this.collectionSubject.next({
      ...current,
      completedSessions,
      unlockedBreeds: newUnlocked,
    });
    this.saveToLocalStorage();

    if (firstNewUnlock) {
      this.newlyUnlockedBreed = firstNewUnlock;
    }
    return firstNewUnlock;
  }

  async unlockBreed(breedId: string): Promise<boolean> {
    if (this.isBreedUnlocked(breedId)) return true;

    try {
      const response = await firstValueFrom(this.apiService.unlockBreed(breedId));
      if (response && response.success) {
        const current = this.collection;
        this.collectionSubject.next({
          ...current,
          unlockedBreeds: [...current.unlockedBreeds, breedId],
          activeBreed: breedId,
          totalKibble: response.kibbleBalance || current.totalKibble
        });

        this.newlyUnlockedBreed = this.allBreeds.find(b => b.id === breedId) || null;
        this.saveToLocalStorage();
        return true;
      }
    } catch (error) {
      console.error('Error unlocking breed:', error);
      throw error;
    }
    return false;
  }

  getAndClearNewlyUnlocked(): DogBreed | null {
    const breed = this.newlyUnlockedBreed;
    this.newlyUnlockedBreed = null;
    return breed;
  }

  getNextBreedToUnlock(): DogBreed | null {
    const locked = this.lockedBreeds.sort((a, b) => a.sessionUnlockRequirement - b.sessionUnlockRequirement);
    return locked.length > 0 ? locked[0] : null;
  }

  // ============ PERSISTENCE ============

  async loadCollection(): Promise<void> {
    // First load from local storage
    this.loadFromLocalStorage();

    // Then sync with server if authenticated
    if (this.apiService.isAuthenticated()) {
      await this.syncWithServer();
    }
  }

  private loadFromLocalStorage(): void {
    try {
      const saved = safeGetItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.collectionSubject.next({
          unlockedBreeds: parsed.unlockedBreeds || ['golden_retriever'],
          activeBreed: parsed.activeBreed || 'golden_retriever',
          totalKibble: parsed.totalKibble || 0,
          completedSessions: parsed.completedSessions || 0,
        });
      }
    } catch (e) {
      console.error('Error loading breed collection from localStorage:', e);
    }
  }

  async syncWithServer(): Promise<void> {
    if (!this.apiService.isAuthenticated() || !this.apiService.isOnline) {
      return;
    }

    try {
      const response = await firstValueFrom(this.apiService.getBreedCollection());

      if (response) {
        this.collectionSubject.next({
          unlockedBreeds: response.unlockedBreeds || ['golden_retriever'],
          activeBreed: response.activeBreed || 'golden_retriever',
          totalKibble: response.totalKibble || 0,
          completedSessions: response.completedSessions || this.collection.completedSessions || 0,
        });
        this.saveToLocalStorage();
      }
    } catch (error) {
      console.error('Error syncing breed collection with server:', error);
    }
  }

  private saveToLocalStorage(): void {
    safeSetItem(LOCAL_STORAGE_KEY, JSON.stringify(this.collection));
  }

  // ============ RESET ============

  resetCollection(): void {
    this.collectionSubject.next({
      unlockedBreeds: ['golden_retriever'],
      activeBreed: 'golden_retriever',
      totalKibble: 0,
      completedSessions: 0,
    });
    this.saveToLocalStorage();
  }
}

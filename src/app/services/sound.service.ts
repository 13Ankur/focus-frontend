import { Injectable } from '@angular/core';
import { safeGetItem, safeSetItem } from '../utils/storage';

/**
 * Sound Service for Focus App
 * 
 * Uses Web Audio API to generate calming, peaceful sounds
 * that don't distract users during focus sessions.
 * 
 * All sounds are designed to be:
 * - Soft and non-jarring
 * - Brief and unobtrusive
 * - Relaxing frequencies (nature-inspired tones)
 */

export type SoundType = 
  | 'start'      // Timer start - gentle rising chime
  | 'complete'   // Session complete - soft celebration
  | 'failed'     // Session failed - gentle notification
  | 'tap'        // Button tap - subtle click
  | 'select'     // Selection - soft pop
  | 'unlock'     // New breed unlocked - magical sparkle
  | 'treat'      // Give treat - happy sound
  | 'notification'; // General notification

@Injectable({
  providedIn: 'root'
})
export class SoundService {
  private audioContext: AudioContext | null = null;
  private isEnabled: boolean = true;
  private masterVolume: number = 0.3; // Keep volume low for calmness

  constructor() {
    this.loadSettings();
  }

  /**
   * Load sound settings from localStorage
   */
  private loadSettings(): void {
    const soundSetting = safeGetItem('sound');
    this.isEnabled = soundSetting !== 'false'; // Default to enabled
  }

  /**
   * Enable or disable sounds
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    safeSetItem('sound', enabled.toString());
  }

  /**
   * Check if sounds are enabled
   */
  get enabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Set master volume (0.0 to 1.0)
   */
  setVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Initialize audio context (must be called after user interaction)
   */
  private initAudioContext(): AudioContext | null {
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (e) {
        console.warn('Web Audio API not supported');
        return null;
      }
    }
    
    // Resume if suspended (browsers require user gesture)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    
    return this.audioContext;
  }

  /**
   * Play a sound effect
   */
  play(type: SoundType): void {
    if (!this.isEnabled) return;
    
    const ctx = this.initAudioContext();
    if (!ctx) return;

    switch (type) {
      case 'start':
        this.playStartSound(ctx);
        break;
      case 'complete':
        this.playCompleteSound(ctx);
        break;
      case 'failed':
        this.playFailedSound(ctx);
        break;
      case 'tap':
        this.playTapSound(ctx);
        break;
      case 'select':
        this.playSelectSound(ctx);
        break;
      case 'unlock':
        this.playUnlockSound(ctx);
        break;
      case 'treat':
        this.playTreatSound(ctx);
        break;
      case 'notification':
        this.playNotificationSound(ctx);
        break;
    }
  }

  /**
   * Timer start - Gentle rising chime (like a singing bowl)
   * Creates a peaceful, meditative start to focus
   */
  private playStartSound(ctx: AudioContext): void {
    const now = ctx.currentTime;
    
    // Main tone - soft sine wave with slight shimmer
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(392, now); // G4 - calming frequency
    osc1.frequency.exponentialRampToValueAtTime(523.25, now + 0.6); // Rise to C5
    
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(this.masterVolume * 0.4, now + 0.1);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    
    osc1.start(now);
    osc1.stop(now + 1.2);

    // Harmonic overtone for richness
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(784, now); // G5 - octave up
    osc2.frequency.exponentialRampToValueAtTime(1046.5, now + 0.6);
    
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.linearRampToValueAtTime(this.masterVolume * 0.15, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
    
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    
    osc2.start(now);
    osc2.stop(now + 1.0);
  }

  /**
   * Session complete - Soft, warm celebration
   * Three gentle ascending notes like wind chimes
   */
  private playCompleteSound(ctx: AudioContext): void {
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 - Major chord
    
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.value = freq;
      
      const startTime = now + i * 0.15;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(this.masterVolume * 0.35, startTime + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.8);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(startTime);
      osc.stop(startTime + 0.8);
    });
  }

  /**
   * Session failed - Gentle, non-judgmental notification
   * Soft descending tone that's calming, not alarming
   */
  private playFailedSound(ctx: AudioContext): void {
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now); // A4
    osc.frequency.exponentialRampToValueAtTime(349.23, now + 0.4); // Gentle descend to F4
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(this.masterVolume * 0.25, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.6);
  }

  /**
   * Button tap - Subtle, soft click
   * Almost imperceptible but gives feedback
   */
  private playTapSound(ctx: AudioContext): void {
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = 800;
    
    gain.gain.setValueAtTime(this.masterVolume * 0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.05);
  }

  /**
   * Selection - Soft pop sound
   * For selecting durations, breeds, etc.
   */
  private playSelectSound(ctx: AudioContext): void {
    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.08);
    
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(this.masterVolume * 0.2, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.12);
  }

  /**
   * Unlock - Magical sparkle effect
   * Celebratory but gentle, for unlocking new breeds
   */
  private playUnlockSound(ctx: AudioContext): void {
    const now = ctx.currentTime;
    // Sparkling arpeggio - C major scale ascending
    const notes = [523.25, 587.33, 659.25, 783.99, 880, 987.77, 1046.5];
    
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.value = freq;
      
      const startTime = now + i * 0.08;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(this.masterVolume * 0.2, startTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(startTime);
      osc.stop(startTime + 0.4);
    });
  }

  /**
   * Give treat - Happy, bouncy sound
   * Short and playful for treating the dog
   */
  private playTreatSound(ctx: AudioContext): void {
    const now = ctx.currentTime;
    
    // Two quick ascending notes
    const notes = [440, 554.37]; // A4, C#5
    
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.value = freq;
      
      const startTime = now + i * 0.1;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(this.masterVolume * 0.25, startTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.2);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(startTime);
      osc.stop(startTime + 0.2);
    });
  }

  /**
   * General notification - Gentle attention-getter
   * Soft two-tone chime
   */
  private playNotificationSound(ctx: AudioContext): void {
    const now = ctx.currentTime;
    
    // Two gentle tones
    const notes = [659.25, 783.99]; // E5, G5
    
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.value = freq;
      
      const startTime = now + i * 0.2;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(this.masterVolume * 0.3, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(startTime);
      osc.stop(startTime + 0.5);
    });
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

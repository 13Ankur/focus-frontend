import { Injectable } from '@angular/core';
import { safeGetItem } from '../utils/storage';

interface BreedBarkConfig {
  baseFrequency: number;
  endFrequency: number;
  duration: number;
  noiseAmount: number;
  oscillatorType: OscillatorType;
  pattern: 'single' | 'double' | 'howl' | 'yap' | 'snort';
  barkTexts: string[];
}

const BREED_BARK_CONFIGS: Record<string, BreedBarkConfig> = {
  golden_retriever: {
    baseFrequency: 320,
    endFrequency: 250,
    duration: 0.25,
    noiseAmount: 0.3,
    oscillatorType: 'sawtooth',
    pattern: 'single',
    barkTexts: ['Woof!', 'Bark!', 'Arf!'],
  },
  husky: {
    baseFrequency: 280,
    endFrequency: 450,
    duration: 0.8,
    noiseAmount: 0.15,
    oscillatorType: 'sine',
    pattern: 'howl',
    barkTexts: ['Awoooo!', 'Aroo!', 'Wooo!'],
  },
  shiba_inu: {
    baseFrequency: 550,
    endFrequency: 400,
    duration: 0.15,
    noiseAmount: 0.35,
    oscillatorType: 'square',
    pattern: 'yap',
    barkTexts: ['Yip!', 'Bark!', 'Arf arf!'],
  },
  cavapoo: {
    baseFrequency: 480,
    endFrequency: 380,
    duration: 0.12,
    noiseAmount: 0.25,
    oscillatorType: 'sawtooth',
    pattern: 'yap',
    barkTexts: ['Yap!', 'Arf!', 'Ruff!'],
  },
  french_bulldog: {
    baseFrequency: 200,
    endFrequency: 160,
    duration: 0.3,
    noiseAmount: 0.5,
    oscillatorType: 'sawtooth',
    pattern: 'snort',
    barkTexts: ['*snort*', 'Borf!', 'Gruff!'],
  },
  labrador: {
    baseFrequency: 240,
    endFrequency: 180,
    duration: 0.3,
    noiseAmount: 0.35,
    oscillatorType: 'sawtooth',
    pattern: 'single',
    barkTexts: ['WOOF!', 'Bark!', 'Boof!'],
  },
  dachshund: {
    baseFrequency: 420,
    endFrequency: 340,
    duration: 0.18,
    noiseAmount: 0.4,
    oscillatorType: 'square',
    pattern: 'double',
    barkTexts: ['BARK!', 'Arf arf!', 'Yap!'],
  },
  australian_shepherd: {
    baseFrequency: 350,
    endFrequency: 280,
    duration: 0.2,
    noiseAmount: 0.3,
    oscillatorType: 'sawtooth',
    pattern: 'double',
    barkTexts: ['Woof woof!', 'Bark!', 'Arf!'],
  },
  maltese: {
    baseFrequency: 600,
    endFrequency: 500,
    duration: 0.1,
    noiseAmount: 0.2,
    oscillatorType: 'square',
    pattern: 'yap',
    barkTexts: ['Yip yip!', 'Arf!', 'Yap!'],
  },
};

const DEFAULT_CONFIG: BreedBarkConfig = {
  baseFrequency: 350,
  endFrequency: 280,
  duration: 0.2,
  noiseAmount: 0.3,
  oscillatorType: 'sawtooth',
  pattern: 'single',
  barkTexts: ['Woof!', 'Bark!', 'Arf!'],
};

const DEBOUNCE_MS = 400;

@Injectable({
  providedIn: 'root',
})
export class DogBarkService {
  private audioContext: AudioContext | null = null;
  private lastPlayTime = 0;

  private getConfig(breedId: string): BreedBarkConfig {
    return BREED_BARK_CONFIGS[breedId] || DEFAULT_CONFIG;
  }

  private isMuted(): boolean {
    return safeGetItem('sound') === 'false';
  }

  private initAudioContext(): AudioContext | null {
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch {
        return null;
      }
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  playBark(breedId: string): string | null {
    if (this.isMuted()) return null;

    const now = Date.now();
    if (now - this.lastPlayTime < DEBOUNCE_MS) return null;
    this.lastPlayTime = now;

    const ctx = this.initAudioContext();
    if (!ctx) return null;

    const config = this.getConfig(breedId);
    const pitchVariation = 1 + (Math.random() - 0.5) * 0.1;

    switch (config.pattern) {
      case 'howl':
        this.playHowl(ctx, config, pitchVariation);
        break;
      case 'double':
        this.playSingleBark(ctx, config, pitchVariation);
        setTimeout(() => this.playSingleBark(ctx, config, pitchVariation * 0.95), config.duration * 1000 + 80);
        break;
      case 'yap':
        this.playYap(ctx, config, pitchVariation);
        break;
      case 'snort':
        this.playSnort(ctx, config, pitchVariation);
        break;
      default:
        this.playSingleBark(ctx, config, pitchVariation);
        break;
    }

    return this.getRandomBarkText(breedId);
  }

  getRandomBarkText(breedId: string): string {
    const config = this.getConfig(breedId);
    return config.barkTexts[Math.floor(Math.random() * config.barkTexts.length)];
  }

  getBarkTexts(breedId: string): string[] {
    return this.getConfig(breedId).barkTexts;
  }

  private playSingleBark(ctx: AudioContext, config: BreedBarkConfig, pitchMod: number): void {
    const now = ctx.currentTime;
    const dur = config.duration;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = config.oscillatorType;
    osc.frequency.setValueAtTime(config.baseFrequency * pitchMod, now);
    osc.frequency.exponentialRampToValueAtTime(config.endFrequency * pitchMod, now + dur);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, now);
    filter.frequency.exponentialRampToValueAtTime(800, now + dur);
    filter.Q.value = 2;

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.01);
    gain.gain.setValueAtTime(0.35, now + dur * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + dur);

    if (config.noiseAmount > 0) {
      this.addNoiseBurst(ctx, now, dur * 0.8, config.noiseAmount * 0.35);
    }
  }

  private playHowl(ctx: AudioContext, config: BreedBarkConfig, pitchMod: number): void {
    const now = ctx.currentTime;
    const dur = config.duration;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(config.baseFrequency * pitchMod, now);
    osc.frequency.linearRampToValueAtTime(config.endFrequency * pitchMod, now + dur * 0.4);
    osc.frequency.linearRampToValueAtTime(config.endFrequency * pitchMod * 1.1, now + dur * 0.7);
    osc.frequency.exponentialRampToValueAtTime(config.baseFrequency * pitchMod * 0.8, now + dur);

    filter.type = 'bandpass';
    filter.frequency.value = 400;
    filter.Q.value = 1;

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.25, now + dur * 0.1);
    gain.gain.setValueAtTime(0.3, now + dur * 0.3);
    gain.gain.linearRampToValueAtTime(0.35, now + dur * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + dur);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(config.baseFrequency * pitchMod * 1.5, now);
    osc2.frequency.linearRampToValueAtTime(config.endFrequency * pitchMod * 1.5, now + dur * 0.4);
    osc2.frequency.exponentialRampToValueAtTime(config.baseFrequency * pitchMod * 1.2, now + dur);

    gain2.gain.setValueAtTime(0, now);
    gain2.gain.linearRampToValueAtTime(0.08, now + dur * 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now);
    osc2.stop(now + dur);
  }

  private playYap(ctx: AudioContext, config: BreedBarkConfig, pitchMod: number): void {
    const now = ctx.currentTime;
    const dur = config.duration;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = config.oscillatorType;
    osc.frequency.setValueAtTime(config.baseFrequency * pitchMod * 1.2, now);
    osc.frequency.exponentialRampToValueAtTime(config.endFrequency * pitchMod, now + dur);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.3, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur);

    this.addNoiseBurst(ctx, now, dur * 0.5, config.noiseAmount * 0.25);
  }

  private playSnort(ctx: AudioContext, config: BreedBarkConfig, pitchMod: number): void {
    const now = ctx.currentTime;
    const dur = config.duration;

    this.addNoiseBurst(ctx, now, dur * 0.6, 0.3);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(config.baseFrequency * pitchMod * 0.8, now + dur * 0.3);
    osc.frequency.exponentialRampToValueAtTime(config.endFrequency * pitchMod, now + dur);

    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 5;

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + dur * 0.4);
    gain.gain.setValueAtTime(0.3, now + dur * 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + dur * 0.3);
    osc.stop(now + dur);
  }

  private addNoiseBurst(ctx: AudioContext, startTime: number, duration: number, volume: number): void {
    const bufferSize = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * volume;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(startTime);
    source.stop(startTime + duration);
  }

  dispose(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

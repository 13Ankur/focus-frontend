import { Injectable } from '@angular/core';
import { safeGetItem } from '../utils/storage';
import { assetUrl } from '../utils/assets';
import { AssetLoaderService } from './asset-loader.service';

const BARK_FILES: Record<string, string> = {
  golden_retriever: assetUrl('sounds/barks/golden_retriever.mp3'),
  husky: assetUrl('sounds/barks/husky.mp3'),
  shiba_inu: assetUrl('sounds/barks/shiba_inu.mp3'),
  cavapoo: assetUrl('sounds/barks/cavapoo.mp3'),
  french_bulldog: assetUrl('sounds/barks/french_bulldog.mp3'),
  labrador: assetUrl('sounds/barks/labrador.mp3'),
  dachshund: assetUrl('sounds/barks/dachshund.mp3'),
  australian_shepherd: assetUrl('sounds/barks/australian_shepherd.mp3'),
  maltese: assetUrl('sounds/barks/maltese.mp3'),
};

const BARK_TEXTS: Record<string, string[]> = {
  golden_retriever: ['Woof!', 'Bark!', 'Arf!'],
  husky: ['Awoooo!', 'Aroo!', 'Wooo!'],
  shiba_inu: ['Yip!', 'Bark!', 'Arf arf!'],
  cavapoo: ['Yap!', 'Arf!', 'Ruff!'],
  french_bulldog: ['*snort*', 'Borf!', 'Gruff!'],
  labrador: ['WOOF!', 'Bark!', 'Boof!'],
  dachshund: ['BARK!', 'Arf arf!', 'Yap!'],
  australian_shepherd: ['Woof woof!', 'Bark!', 'Arf!'],
  maltese: ['Yip yip!', 'Arf!', 'Yap!'],
};

const DEFAULT_TEXTS = ['Woof!', 'Bark!', 'Arf!'];
const DEBOUNCE_MS = 350;

@Injectable({
  providedIn: 'root',
})
export class DogBarkService {
  constructor(private assetLoader: AssetLoaderService) {}

  private audioContext: AudioContext | null = null;
  private lastPlayTime = 0;
  private lastBreedId = '';
  private currentSource: AudioBufferSourceNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private playGeneration = 0;

  private textsFor(breedId: string): string[] {
    return BARK_TEXTS[breedId] || DEFAULT_TEXTS;
  }

  private isMuted(): boolean {
    return safeGetItem('sound') === 'false';
  }

  private initAudioContext(): AudioContext | null {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch {
        return null;
      }
    }
    return this.audioContext;
  }

  playBark(breedId: string): string | null {
    if (this.isMuted()) return null;

    const now = Date.now();
    if (breedId === this.lastBreedId && now - this.lastPlayTime < DEBOUNCE_MS) return null;
    this.lastPlayTime = now;
    this.lastBreedId = breedId;

    void this.playFile(breedId);
    return this.getRandomBarkText(breedId);
  }

  getRandomBarkText(breedId: string): string {
    const texts = this.textsFor(breedId);
    return texts[Math.floor(Math.random() * texts.length)];
  }

  getBarkTexts(breedId: string): string[] {
    return this.textsFor(breedId);
  }

  private async playFile(breedId: string): Promise<void> {
    const generation = ++this.playGeneration;
    const ctx = this.initAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        return;
      }
    }
    if (generation !== this.playGeneration) return;

    const fileBreed = BARK_FILES[breedId] ? breedId : 'golden_retriever';
    let buffer: AudioBuffer;
    try {
      buffer = await this.loadBuffer(ctx, fileBreed);
    } catch {
      return;
    }
    if (generation !== this.playGeneration || ctx.state === 'closed') return;

    if (this.currentSource) {
      try { this.currentSource.stop(); } catch { /* already stopped */ }
      this.currentSource = null;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.95;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.onended = () => {
      if (this.currentSource === source) this.currentSource = null;
    };
    source.start();
    this.currentSource = source;
  }

  preload(breedId?: string): void {
    const id = breedId && BARK_FILES[breedId] ? breedId : 'golden_retriever';
    const url = new URL(BARK_FILES[id], document.baseURI).toString();
    void this.assetLoader.loadArrayBuffer(url).catch(() => { /* the bark retries when tapped */ });
  }

  private async loadBuffer(ctx: AudioContext, breedId: string): Promise<AudioBuffer> {
    const cached = this.buffers.get(breedId);
    if (cached) return cached;

    const url = new URL(BARK_FILES[breedId], document.baseURI).toString();
    try {
      const data = await this.assetLoader.loadArrayBuffer(url);
      const buffer = await ctx.decodeAudioData(data.slice(0));
      this.buffers.set(breedId, buffer);
      return buffer;
    } catch (error) {
      this.assetLoader.forget(url);
      throw error;
    }
  }
}

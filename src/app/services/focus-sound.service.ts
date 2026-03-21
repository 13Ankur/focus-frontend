import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Preferences } from '@capacitor/preferences';
import { SOUND_GENERATORS, SoundGenerator } from '../sounds/generators';

export interface SoundTrack {
  id: string;
  name: string;
  icon: string;
  category: 'silence' | 'nature' | 'ambient' | 'noise' | 'music';
  tier: 'free' | 'pro' | 'guardian';
}

const SOUND_LIBRARY: SoundTrack[] = [
  { id: 'silence',      name: 'Silence',         icon: '🤫', category: 'silence', tier: 'free' },
  { id: 'rain',          name: 'Gentle Rain',     icon: '🌧', category: 'nature',  tier: 'free' },
  { id: 'forest',        name: 'Forest Birds',    icon: '🌲', category: 'nature',  tier: 'free' },
  { id: 'ocean',         name: 'Ocean Waves',     icon: '🌊', category: 'nature',  tier: 'free' },
  { id: 'cafe',          name: 'Coffee Shop',     icon: '☕', category: 'ambient', tier: 'free' },
  { id: 'fireplace',     name: 'Fireplace',       icon: '🔥', category: 'ambient', tier: 'free' },
  { id: 'library',       name: 'Library Hum',     icon: '📚', category: 'ambient', tier: 'free' },
  { id: 'lofi',          name: 'Lo-Fi Beats',     icon: '🎵', category: 'music',   tier: 'free' },
  { id: 'white_noise',   name: 'White Noise',     icon: '⚪', category: 'noise',   tier: 'free' },
  { id: 'brown_noise',   name: 'Brown Noise',     icon: '🟤', category: 'noise',   tier: 'free' },
  { id: 'binaural',      name: 'Focus Binaural',  icon: '🧠', category: 'noise',   tier: 'free' },
  { id: 'thunderstorm',  name: 'Thunderstorm',    icon: '⛈',  category: 'nature',  tier: 'free' },
];

const PREFS_KEY = 'paws_focus_sound';
const PREFS_VOLUME_KEY = 'paws_focus_sound_volume';
const PREFS_MIX_KEY = 'paws_focus_sound_mix';
const FADE_DURATION = 2;
const MAX_MIX_COUNT = 3;

interface ActiveSource {
  generator: SoundGenerator;
  gainNode: GainNode;
  soundId: string;
}

@Injectable({ providedIn: 'root' })
export class FocusSoundService implements OnDestroy {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private activeSources: ActiveSource[] = [];
  private _volume = 0.6;
  private _isPlaying = false;

  private currentSoundSubject = new BehaviorSubject<string>('silence');
  private mixedSoundsSubject = new BehaviorSubject<string[]>([]);
  private playingSubject = new BehaviorSubject<boolean>(false);
  private volumeSubject = new BehaviorSubject<number>(0.6);
  private loadingSubject = new BehaviorSubject<boolean>(false);

  currentSound$ = this.currentSoundSubject.asObservable();
  mixedSounds$ = this.mixedSoundsSubject.asObservable();
  isPlaying$ = this.playingSubject.asObservable();
  volume$ = this.volumeSubject.asObservable();
  isLoading$ = this.loadingSubject.asObservable();

  constructor() {
    this.loadPreferences();
  }

  ngOnDestroy(): void {
    this.dispose();
  }

  // ── Public API ──

  get soundLibrary(): SoundTrack[] {
    return SOUND_LIBRARY;
  }

  get currentSoundId(): string {
    return this.currentSoundSubject.value;
  }

  get currentSoundTrack(): SoundTrack | undefined {
    return SOUND_LIBRARY.find(s => s.id === this.currentSoundId);
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get volume(): number {
    return this._volume;
  }

  get mixedSoundIds(): string[] {
    return this.mixedSoundsSubject.value;
  }

  getSoundById(id: string): SoundTrack | undefined {
    return SOUND_LIBRARY.find(s => s.id === id);
  }

  getSoundLibrary(_userTier: 'free' | 'pro' | 'guardian' = 'free'): (SoundTrack & { locked: boolean })[] {
    return SOUND_LIBRARY.map(s => ({ ...s, locked: false }));
  }

  isSoundLocked(_soundId: string, _userTier: 'free' | 'pro' | 'guardian' = 'free'): boolean {
    return false;
  }

  // ── Playback ──

  async playSound(soundId: string): Promise<void> {
    await this.stopSound();

    if (soundId === 'silence') {
      this.currentSoundSubject.next('silence');
      this.mixedSoundsSubject.next([]);
      this.savePreferences();
      return;
    }

    const sound = this.getSoundById(soundId);
    if (!sound) return;

    const generatorFn = SOUND_GENERATORS[soundId];
    if (!generatorFn) return;

    this.loadingSubject.next(true);
    try {
      this.ensureAudioContext();
      const source = this.createGeneratedSource(soundId, generatorFn);
      this.activeSources.push(source);
      this.fadeIn(source.gainNode);
      this.currentSoundSubject.next(soundId);
      this.mixedSoundsSubject.next([soundId]);
      this._isPlaying = true;
      this.playingSubject.next(true);
      this.savePreferences();
    } catch (err) {
      console.warn('Failed to play sound:', err);
    } finally {
      this.loadingSubject.next(false);
    }
  }

  async mixSounds(soundIds: string[]): Promise<void> {
    await this.stopSound();

    const validIds = soundIds.filter(id => id !== 'silence' && SOUND_GENERATORS[id]).slice(0, MAX_MIX_COUNT);
    if (validIds.length === 0) {
      this.currentSoundSubject.next('silence');
      this.mixedSoundsSubject.next([]);
      this.savePreferences();
      return;
    }

    this.loadingSubject.next(true);
    try {
      this.ensureAudioContext();
      const perTrackVolume = 1 / validIds.length;

      for (const id of validIds) {
        const generatorFn = SOUND_GENERATORS[id];
        if (!generatorFn) continue;
        const source = this.createGeneratedSource(id, generatorFn);
        source.gainNode.gain.value = 0;
        this.activeSources.push(source);
        this.fadeIn(source.gainNode, perTrackVolume);
      }

      this.currentSoundSubject.next(validIds[0]);
      this.mixedSoundsSubject.next(validIds);
      this._isPlaying = true;
      this.playingSubject.next(true);
      this.savePreferences();
    } catch (err) {
      console.warn('Failed to mix sounds:', err);
    } finally {
      this.loadingSubject.next(false);
    }
  }

  async stopSound(): Promise<void> {
    if (this.activeSources.length === 0) {
      this._isPlaying = false;
      this.playingSubject.next(false);
      return;
    }

    const fadePromises = this.activeSources.map(source =>
      this.fadeOut(source.gainNode).then(() => {
        source.generator.stop();
        try { source.gainNode.disconnect(); } catch {}
      })
    );

    await Promise.all(fadePromises);
    this.activeSources = [];
    this._isPlaying = false;
    this.playingSubject.next(false);
  }

  setVolume(level: number): void {
    this._volume = Math.max(0, Math.min(1, level));
    this.volumeSubject.next(this._volume);
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this._volume, this.audioContext!.currentTime);
    }
    this.saveVolumePreference();
  }

  async previewSound(soundId: string, durationMs = 3000): Promise<void> {
    if (soundId === 'silence') return;

    const generatorFn = SOUND_GENERATORS[soundId];
    if (!generatorFn) return;

    try {
      this.ensureAudioContext();
      const ctx = this.audioContext!;
      const previewGain = ctx.createGain();
      previewGain.gain.value = this._volume * 0.6;
      previewGain.connect(ctx.destination);

      const generator = generatorFn(ctx);
      generator.outputNode.connect(previewGain);

      setTimeout(() => {
        generator.stop();
        try { previewGain.disconnect(); } catch {}
      }, durationMs);
    } catch {
      // AudioContext blocked or unavailable
    }
  }

  dispose(): void {
    this.activeSources.forEach(source => {
      source.generator.stop();
      try { source.gainNode.disconnect(); } catch {}
    });
    this.activeSources = [];
    this._isPlaying = false;
    this.playingSubject.next(false);

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
      this.masterGain = null;
    }
  }

  // ── Private ──

  private ensureAudioContext(): void {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = this._volume;
      this.masterGain.connect(this.audioContext.destination);
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  private createGeneratedSource(
    soundId: string,
    generatorFn: (ctx: AudioContext) => SoundGenerator,
  ): ActiveSource {
    const ctx = this.audioContext!;
    const generator = generatorFn(ctx);
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0;
    generator.outputNode.connect(gainNode);
    gainNode.connect(this.masterGain!);
    return { generator, gainNode, soundId };
  }

  private fadeIn(gainNode: GainNode, targetVolume = 1): void {
    const ctx = this.audioContext!;
    const now = ctx.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(targetVolume, now + FADE_DURATION);
  }

  private fadeOut(gainNode: GainNode): Promise<void> {
    return new Promise(resolve => {
      if (!this.audioContext || this.audioContext.state === 'closed') {
        resolve();
        return;
      }
      const ctx = this.audioContext;
      const now = ctx.currentTime;
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(0, now + FADE_DURATION);
      setTimeout(resolve, FADE_DURATION * 1000 + 100);
    });
  }

  // ── Persistence ──

  private async loadPreferences(): Promise<void> {
    try {
      const { value: soundVal } = await Preferences.get({ key: PREFS_KEY });
      if (soundVal) {
        this.currentSoundSubject.next(soundVal);
      }

      const { value: volVal } = await Preferences.get({ key: PREFS_VOLUME_KEY });
      if (volVal) {
        this._volume = parseFloat(volVal);
        this.volumeSubject.next(this._volume);
      }

      const { value: mixVal } = await Preferences.get({ key: PREFS_MIX_KEY });
      if (mixVal) {
        try {
          const ids = JSON.parse(mixVal);
          if (Array.isArray(ids)) this.mixedSoundsSubject.next(ids);
        } catch { /* ignore */ }
      }
    } catch {
      // Preferences not available (web dev)
    }
  }

  private async savePreferences(): Promise<void> {
    try {
      await Preferences.set({ key: PREFS_KEY, value: this.currentSoundSubject.value });
      await Preferences.set({ key: PREFS_MIX_KEY, value: JSON.stringify(this.mixedSoundsSubject.value) });
    } catch { /* ignore */ }
  }

  private async saveVolumePreference(): Promise<void> {
    try {
      await Preferences.set({ key: PREFS_VOLUME_KEY, value: this._volume.toString() });
    } catch { /* ignore */ }
  }
}

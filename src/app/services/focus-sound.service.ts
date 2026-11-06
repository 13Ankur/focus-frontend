import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Preferences } from '@capacitor/preferences';
import { RevenueCatService } from './revenue-cat.service';
import { SOUND_GENERATORS, SoundGenerator } from '../sounds/generators';
import { assetUrl } from '../utils/assets';
import { AssetLoaderService } from './asset-loader.service';
import { readAccountIsPro } from '../utils/subscription-access';

export interface SoundTrack {
  id: string;
  name: string;
  icon: string;
  category: 'silence' | 'nature' | 'ambient' | 'noise' | 'music';
  tier: 'free' | 'pro' | 'guardian';
}

const SOUND_LIBRARY: SoundTrack[] = [
  { id: 'silence', name: 'Silence', icon: '🤫', category: 'silence', tier: 'free' },
  { id: 'rain', name: 'Gentle Rain', icon: '🌧', category: 'nature', tier: 'free' },
  { id: 'forest', name: 'Forest Birds', icon: '🌲', category: 'nature', tier: 'free' },
  { id: 'ocean', name: 'Ocean Waves', icon: '🌊', category: 'nature', tier: 'pro' },
  { id: 'cafe', name: 'Coffee Shop', icon: '☕', category: 'ambient', tier: 'pro' },
  { id: 'fireplace', name: 'Fireplace', icon: '🔥', category: 'ambient', tier: 'pro' },
  { id: 'library', name: 'Library Hum', icon: '📚', category: 'ambient', tier: 'pro' },
  { id: 'lofi', name: 'Lo-Fi Beats', icon: '🎵', category: 'music', tier: 'pro' },
  { id: 'white_noise', name: 'White Noise', icon: '⚪', category: 'noise', tier: 'pro' },
  { id: 'brown_noise', name: 'Brown Noise', icon: '🟤', category: 'noise', tier: 'pro' },
  { id: 'binaural', name: 'Focus Binaural', icon: '🧠', category: 'noise', tier: 'pro' },
  { id: 'thunderstorm', name: 'Thunderstorm', icon: '⛈', category: 'nature', tier: 'pro' },
];

const PREFS_KEY = 'paws_focus_sound';
const PREFS_VOLUME_KEY = 'paws_focus_sound_volume';
const PREFS_MIX_KEY = 'paws_focus_sound_mix';
const FADE_DURATION = 0.03;
const MAX_MIX_COUNT = 3;

/** Real field recordings. White noise, brown noise, binaural, and lo-fi stay generated. */
const RECORDED_SOUNDS: Record<string, string> = {
  rain: assetUrl('sounds/rain.mp3'),
  forest: assetUrl('sounds/forest.mp3'),
  ocean: assetUrl('sounds/ocean.mp3'),
  cafe: assetUrl('sounds/cafe.mp3'),
  fireplace: assetUrl('sounds/fireplace.mp3'),
  library: assetUrl('sounds/library.mp3'),
  thunderstorm: assetUrl('sounds/thunderstorm.mp3'),
};

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
  private proUnlocked = false;
  private bufferCache = new Map<string, AudioBuffer>();
  private bufferLoads = new Map<string, Promise<AudioBuffer>>();
  private playbackGeneration = 0;
  private previewStops: Array<() => void> = [];

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

  constructor(
    private revenueCatService: RevenueCatService,
    private assetLoader: AssetLoaderService,
  ) {
    this.loadPreferences();
  }

  /** Decode the selected recordings so playback does not wait on the network. */
  warmCurrent(): void {
    const ids = new Set<string>([
      this.currentSoundSubject.value,
      ...this.mixedSoundsSubject.value,
    ]);
    ids.forEach(id => {
      if (RECORDED_SOUNDS[id]) void this.preloadBuffer(id);
    });
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

  /** Android Pro comes from Razorpay, not RevenueCat. Home calls this when the tier is known. */
  setProAccess(isPro: boolean): void {
    this.proUnlocked = isPro;
  }

  getSoundLibrary(_userTier: 'free' | 'pro' | 'guardian' = 'free'): (SoundTrack & { locked: boolean })[] {
    const isPro = this.hasProAccess();
    return SOUND_LIBRARY.map(s => ({
      ...s,
      locked: (s.tier === 'pro' || s.tier === 'guardian') && !isPro
    }));
  }

  isSoundLocked(soundId: string): boolean {
    const sound = this.getSoundById(soundId);
    if (!sound || sound.tier === 'free') return false;
    return !this.hasProAccess();
  }

  // ── Playback ──

  async playSound(soundId: string): Promise<void> {
    const generation = ++this.playbackGeneration;
    this.haltPlayback();

    if (soundId === 'silence') {
      this.currentSoundSubject.next('silence');
      this.mixedSoundsSubject.next([]);
      this.savePreferences();
      return;
    }

    const sound = this.getSoundById(soundId);
    if (!sound || this.isSoundLocked(soundId)) {
      this.currentSoundSubject.next('silence');
      return;
    }

    const generatorFn = SOUND_GENERATORS[soundId];
    if (!RECORDED_SOUNDS[soundId] && !generatorFn) return;

    this.loadingSubject.next(true);
    try {
      await this.ensureAudioContext();
      if (generation !== this.playbackGeneration) return;
      const source = await this.createSource(soundId);
      if (!source) return;
      if (generation !== this.playbackGeneration) {
        this.releaseSource(source);
        return;
      }
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
    const generation = ++this.playbackGeneration;
    this.haltPlayback();

    const validIds = soundIds
      .filter(id => id !== 'silence' && !this.isSoundLocked(id) && (RECORDED_SOUNDS[id] || SOUND_GENERATORS[id]))
      .slice(0, MAX_MIX_COUNT);
    if (validIds.length === 0) {
      this.currentSoundSubject.next('silence');
      this.mixedSoundsSubject.next([]);
      this.savePreferences();
      return;
    }

    this.loadingSubject.next(true);
    try {
      await this.ensureAudioContext();
      if (generation !== this.playbackGeneration) return;
      const perTrackVolume = 1 / validIds.length;
      const started: ActiveSource[] = [];

      for (const id of validIds) {
        const source = await this.createSource(id);
        if (generation !== this.playbackGeneration) {
          if (source) this.releaseSource(source);
          started.forEach(item => this.releaseSource(item));
          return;
        }
        if (!source) continue;
        source.gainNode.gain.value = 0;
        started.push(source);
        this.fadeIn(source.gainNode, perTrackVolume);
      }

      this.activeSources.push(...started);

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
    this.playbackGeneration++;
    this.haltPlayback();
  }

  stopPreview(): void {
    this.stopPreviews();
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

    if (!RECORDED_SOUNDS[soundId] && !SOUND_GENERATORS[soundId]) return;

    const generation = ++this.playbackGeneration;
    this.haltPlayback();

    try {
      await this.ensureAudioContext();
      if (generation !== this.playbackGeneration) return;
      const ctx = this.audioContext!;
      const previewGain = ctx.createGain();
      previewGain.gain.value = this._volume * 0.6;
      previewGain.connect(ctx.destination);

      const source = await this.createSource(soundId);
      if (!source) return;
      if (generation !== this.playbackGeneration) {
        this.releaseSource(source);
        try { previewGain.disconnect(); } catch { /* already disconnected */ }
        return;
      }
      source.gainNode.disconnect();
      source.generator.outputNode.connect(previewGain);

      let stopped = false;
      const stop = () => {
        if (stopped) return;
        stopped = true;
        this.previewStops = this.previewStops.filter(item => item !== stop);
        this.releaseSource(source);
        try { previewGain.disconnect(); } catch { /* already disconnected */ }
      };
      this.previewStops.push(stop);
      setTimeout(stop, durationMs);
    } catch {
      // AudioContext blocked or unavailable
    }
  }

  dispose(): void {
    this.playbackGeneration++;
    this.haltPlayback();
    this.bufferCache.clear();

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => { });
      this.audioContext = null;
      this.masterGain = null;
    }
  }

  // ── Private ──

  /** Call from a tap so Android unlocks the speaker before any later await. */
  prepareAudio(): void {
    const ctx = this.openAudioContext();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
  }

  private openAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = this._volume;
      this.masterGain.connect(this.audioContext.destination);
    }
    return this.audioContext;
  }

  private async ensureAudioContext(): Promise<void> {
    const ctx = this.openAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  }

  private async preloadBuffer(soundId: string): Promise<void> {
    const url = RECORDED_SOUNDS[soundId];
    if (!url || this.bufferCache.has(soundId)) return;
    try {
      this.openAudioContext();
      await this.loadBuffer(soundId, url);
    } catch {
      // Playback retries when the session starts.
    }
  }

  private hasProAccess(): boolean {
    return readAccountIsPro();
  }

  private haltPlayback(): void {
    this.stopPreviews();
    const sources = this.activeSources.splice(0);
    sources.forEach(source => this.releaseSource(source));
    this._isPlaying = false;
    this.playingSubject.next(false);
  }

  private stopPreviews(): void {
    const stops = this.previewStops.splice(0);
    stops.forEach(stop => stop());
  }

  private releaseSource(source: ActiveSource): void {
    try {
      if (this.audioContext && this.audioContext.state !== 'closed') {
        const now = this.audioContext.currentTime;
        source.gainNode.gain.cancelScheduledValues(now);
        source.gainNode.gain.setValueAtTime(0, now);
      }
    } catch { /* context already closed */ }
    source.generator.stop();
    try { source.gainNode.disconnect(); } catch { /* already disconnected */ }
    try { source.generator.outputNode.disconnect(); } catch { /* already disconnected */ }
  }

  private async createSource(soundId: string): Promise<ActiveSource | null> {
    const recorded = RECORDED_SOUNDS[soundId];
    if (recorded) {
      const buffer = await this.loadBuffer(soundId, recorded);
      return this.createRecordedSource(soundId, buffer);
    }
    const generatorFn = SOUND_GENERATORS[soundId];
    if (!generatorFn) return null;
    return this.createGeneratedSource(soundId, generatorFn);
  }

  private loadBuffer(soundId: string, url: string): Promise<AudioBuffer> {
    const cached = this.bufferCache.get(soundId);
    if (cached) return Promise.resolve(cached);
    const pending = this.bufferLoads.get(soundId);
    if (pending) return pending;

    let tracked: Promise<AudioBuffer>;
    tracked = this.fetchBuffer(url).then(buffer => {
      this.bufferCache.set(soundId, buffer);
      return buffer;
    }).finally(() => {
      if (this.bufferLoads.get(soundId) === tracked) this.bufferLoads.delete(soundId);
    });
    this.bufferLoads.set(soundId, tracked);
    return tracked;
  }

  private async fetchBuffer(url: string): Promise<AudioBuffer> {
    const resolved = new URL(url, document.baseURI).toString();
    try {
      const data = await this.assetLoader.loadArrayBuffer(resolved);
      const ctx = this.openAudioContext();
      return await ctx.decodeAudioData(data.slice(0));
    } catch (error) {
      this.assetLoader.forget(resolved);
      throw error;
    }
  }

  private createRecordedSource(soundId: string, buffer: AudioBuffer): ActiveSource {
    const ctx = this.audioContext!;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const outputNode = ctx.createGain();
    outputNode.gain.value = 1;
    source.connect(outputNode);
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0;
    outputNode.connect(gainNode);
    gainNode.connect(this.masterGain!);
    source.start();
    return {
      generator: {
        outputNode,
        stop: () => {
          try { source.stop(); } catch { /* already stopped */ }
        },
      },
      gainNode,
      soundId,
    };
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

  // ── Persistence ──

  private async loadPreferences(): Promise<void> {
    try {
      const { value: soundVal } = await Preferences.get({ key: PREFS_KEY });
      if (soundVal) {
        if (soundVal !== 'silence' && this.isSoundLocked(soundVal)) {
          this.currentSoundSubject.next('silence');
        } else {
          this.currentSoundSubject.next(soundVal);
        }
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
    this.warmCurrent();
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

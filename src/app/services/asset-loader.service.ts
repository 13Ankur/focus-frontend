import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

const CACHE_NAME = 'paws-assets-v1';
const ATTEMPTS = 4;

/** Loads R2 images and sounds with retries, and keeps a copy for the next visit. */
@Injectable({ providedIn: 'root' })
export class AssetLoaderService {
  private memory = new Map<string, Promise<Blob>>();
  private objectUrls = new Map<string, string>();
  private cutoutJobs = new Map<string, Promise<string>>();
  private observer: MutationObserver | null = null;
  private installed = false;

  isRemote(url: string | null | undefined): boolean {
    if (!url) return false;
    return url.startsWith(environment.assetBaseUrl) || url.includes('.r2.dev/');
  }

  install(root: ParentNode = document.body): void {
    if (this.installed || typeof document === 'undefined') return;
    this.installed = true;

    document.addEventListener('error', (event) => {
      const target = event.target;
      if (target instanceof HTMLImageElement) {
        void this.recoverImage(target);
      }
    }, true);

    const scan = () => {
      root.querySelectorAll('img').forEach(node => this.prepareStatic(node as HTMLImageElement));
    };
    scan();
    this.observer = new MutationObserver(() => scan());
    this.observer.observe(root, { subtree: true, childList: true });
  }

  async loadArrayBuffer(url: string): Promise<ArrayBuffer> {
    const blob = await this.loadBlob(url);
    return blob.arrayBuffer();
  }

  async objectUrl(url: string): Promise<string> {
    const existing = this.objectUrls.get(url);
    if (existing) return existing;
    const blob = await this.loadBlob(url);
    const created = URL.createObjectURL(blob);
    this.objectUrls.set(url, created);
    return created;
  }

  /** Studio-white dog photos become transparent so the buddy sits on the scene. */
  cutoutObjectUrl(url: string): Promise<string> {
    const key = `${url}#cutout`;
    const existing = this.objectUrls.get(key);
    if (existing) return Promise.resolve(existing);
    const pending = this.cutoutJobs.get(key);
    if (pending) return pending;
    const job = this.makeCutout(url).then(blob => {
      const objectUrl = URL.createObjectURL(blob);
      this.objectUrls.set(key, objectUrl);
      return objectUrl;
    });
    this.cutoutJobs.set(key, job);
    job.catch(() => {
      this.cutoutJobs.delete(key);
    });
    return job;
  }

  forget(url: string): void {
    this.memory.delete(url);
    const objectUrl = this.objectUrls.get(url);
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      this.objectUrls.delete(url);
    }
  }

  private prepareStatic(img: HTMLImageElement): void {
    if (img.getAttribute('data-asset-watch') === '1' || img.hasAttribute('appasset')) return;
    const src = img.getAttribute('src') || '';
    if (!this.isRemote(src)) return;
    img.setAttribute('data-asset-watch', '1');
    img.setAttribute('data-asset-original', src);
    // SVG / vector icons load fine as <img src>. Fetching them needs CORS and
    // can fail even when the file itself is public.
    if (this.isDirectDisplayUrl(src)) {
      this.setPending(img, false);
      return;
    }
    this.setPending(img, true);
    void this.objectUrl(src).then(objectUrl => {
      if (img.hasAttribute('appasset')) return;
      img.src = objectUrl;
      this.setPending(img, false);
    }).catch(() => {
      img.src = src;
      this.setPending(img, false);
    });
  }

  private async recoverImage(img: HTMLImageElement): Promise<void> {
    const original = img.getAttribute('data-asset-original') || img.currentSrc || img.src;
    if (!this.isRemote(original) || img.getAttribute('data-asset-retrying') === '1') return;
    if (this.isDirectDisplayUrl(original)) {
      img.src = original;
      this.setPending(img, false);
      return;
    }
    const tries = Number(img.getAttribute('data-asset-tries') || '0') + 1;
    if (tries > ATTEMPTS) {
      img.src = original;
      this.setPending(img, false);
      return;
    }
    img.setAttribute('data-asset-original', original);
    img.setAttribute('data-asset-tries', String(tries));
    img.setAttribute('data-asset-retrying', '1');
    this.setPending(img, true);
    try {
      this.forget(original);
      img.src = await this.objectUrl(original);
      this.setPending(img, false);
    } catch {
      img.src = original;
      this.setPending(img, false);
    } finally {
      img.setAttribute('data-asset-retrying', '');
    }
  }

  /** Vectors and tiny UI icons should stay on the public URL — no fetch/CORS. */
  private isDirectDisplayUrl(url: string): boolean {
    return /\.svg(\?|#|$)/i.test(url);
  }

  private setPending(img: HTMLImageElement, pending: boolean): void {
    img.classList.toggle('asset-pending', pending);
    img.setAttribute('aria-busy', pending ? 'true' : 'false');
    const parent = img.parentElement;
    if (parent) {
      parent.classList.toggle('asset-frame-pending', pending);
    }
  }

  private async loadBlob(url: string): Promise<Blob> {
    const pending = this.memory.get(url);
    if (pending) return pending;
    const request = this.fetchBlob(url);
    this.memory.set(url, request);
    try {
      return await request;
    } catch (error) {
      this.memory.delete(url);
      throw error;
    }
  }

  private async fetchBlob(url: string): Promise<Blob> {
    const cache = await this.openCache();
    if (cache) {
      try {
        const hit = await cache.match(url);
        if (hit) return hit.blob();
      } catch { /* cache read is optional */ }
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 12000 + attempt * 5000);
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          mode: 'cors',
          credentials: 'omit',
          // Avoid reusing a non-CORS <img> cache entry (no ACAO header).
          cache: 'no-cache',
        });
        if (!response.ok) throw new Error(`Asset responded ${response.status}`);
        const blob = await response.blob();
        if (!blob.size) throw new Error('Asset was empty');
        if (cache) {
          try {
            await cache.put(url, new Response(blob.slice(), {
              headers: { 'Content-Type': blob.type || 'application/octet-stream' },
            }));
          } catch { /* storage can be full on a phone */ }
        }
        return blob;
      } catch (error) {
        lastError = error;
        await new Promise(resolve => window.setTimeout(resolve, 400 * (attempt + 1) ** 2));
      } finally {
        window.clearTimeout(timer);
      }
    }
    throw lastError;
  }

  private async makeCutout(url: string): Promise<Blob> {
    const blob = await this.loadBlob(url);
    try {
      return await this.removeStudioBackground(blob);
    } catch {
      return blob;
    }
  }

  private async removeStudioBackground(blob: Blob): Promise<Blob> {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      bitmap.close();
      return blob;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data, width, height } = image;
    const corners = [0, (width - 1) * 4, (height - 1) * width * 4, ((height - 1) * width + width - 1) * 4];
    if (corners.every(index => data[index + 3] < 16)) return blob;

    const count = width * height;
    const seen = new Uint8Array(count);
    const stack: number[] = [];
    const isBackdrop = (pixel: number, minChannel: number, maxChroma: number): boolean => {
      const index = pixel * 4;
      const alpha = data[index + 3];
      if (alpha < 16) return true;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const min = red < green ? (red < blue ? red : blue) : (green < blue ? green : blue);
      const max = red > green ? (red > blue ? red : blue) : (green > blue ? green : blue);
      return min >= minChannel && max - min <= maxChroma;
    };
    const push = (pixel: number, minChannel: number, maxChroma: number): void => {
      if (pixel < 0 || pixel >= count || seen[pixel] || !isBackdrop(pixel, minChannel, maxChroma)) return;
      seen[pixel] = 1;
      stack.push(pixel);
    };

    for (let x = 0; x < width; x++) {
      push(x, 247, 16);
      push((height - 1) * width + x, 247, 16);
    }
    for (let y = 0; y < height; y++) {
      push(y * width, 247, 16);
      push(y * width + width - 1, 247, 16);
    }

    let removed = 0;
    while (stack.length) {
      const pixel = stack.pop() as number;
      data[pixel * 4 + 3] = 0;
      removed++;
      const x = pixel % width;
      const y = (pixel - x) / width;
      if (x > 0) push(pixel - 1, 247, 16);
      if (x + 1 < width) push(pixel + 1, 247, 16);
      if (y > 0) push(pixel - width, 247, 16);
      if (y + 1 < height) push(pixel + width, 247, 16);
    }
    if (removed < width * height * 0.02) return blob;

    const floorY = Math.floor(height * 0.78);
    for (let y = floorY; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = y * width + x;
        if (data[pixel * 4 + 3] !== 0) continue;
        if (x > 0) push(pixel - 1, 228, 12);
        if (x + 1 < width) push(pixel + 1, 228, 12);
        if (y > floorY) push(pixel - width, 228, 12);
        if (y + 1 < height) push(pixel + width, 228, 12);
      }
    }
    while (stack.length) {
      const pixel = stack.pop() as number;
      const y = Math.floor(pixel / width);
      if (y < floorY) continue;
      data[pixel * 4 + 3] = 0;
      const x = pixel % width;
      if (x > 0) push(pixel - 1, 228, 12);
      if (x + 1 < width) push(pixel + 1, 228, 12);
      if (y > floorY) push(pixel - width, 228, 12);
      if (y + 1 < height) push(pixel + width, 228, 12);
    }

    const fringe: number[] = [];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const index = (y * width + x) * 4;
        if (data[index + 3] === 0) continue;
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const min = red < green ? (red < blue ? red : blue) : (green < blue ? green : blue);
        const max = red > green ? (red > blue ? red : blue) : (green > blue ? green : blue);
        if (max - min > 22 || min < 226) continue;
        const touchesHole = data[index - 4 + 3] === 0 || data[index + 4 + 3] === 0
          || data[index - width * 4 + 3] === 0 || data[index + width * 4 + 3] === 0;
        if (!touchesHole) continue;
        fringe.push(index, Math.max(0, Math.min(255, Math.round(255 * (247 - min) / 22))));
      }
    }
    for (let i = 0; i < fringe.length; i += 2) {
      data[fringe[i] + 3] = fringe[i + 1];
    }

    ctx.putImageData(image, 0, 0);
    const cut = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    return cut ?? blob;
  }

  private async openCache(): Promise<Cache | null> {
    if (!('caches' in window)) return null;
    try {
      return await caches.open(CACHE_NAME);
    } catch {
      return null;
    }
  }
}

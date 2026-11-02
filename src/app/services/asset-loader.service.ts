import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

const CACHE_NAME = 'paws-assets-v1';
const ATTEMPTS = 4;

/** Loads R2 images and sounds with retries, and keeps a copy for the next visit. */
@Injectable({ providedIn: 'root' })
export class AssetLoaderService {
  private memory = new Map<string, Promise<Blob>>();
  private objectUrls = new Map<string, string>();
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
    img.classList.add('asset-pending');
    void this.objectUrl(src).then(objectUrl => {
      if (img.hasAttribute('appasset')) return;
      img.src = objectUrl;
      img.classList.remove('asset-pending');
    }).catch(() => {
      img.classList.remove('asset-pending');
    });
  }

  private async recoverImage(img: HTMLImageElement): Promise<void> {
    const original = img.getAttribute('data-asset-original') || img.currentSrc || img.src;
    if (!this.isRemote(original) || img.getAttribute('data-asset-retrying') === '1') return;
    const tries = Number(img.getAttribute('data-asset-tries') || '0') + 1;
    if (tries > ATTEMPTS) return;
    img.setAttribute('data-asset-original', original);
    img.setAttribute('data-asset-tries', String(tries));
    img.setAttribute('data-asset-retrying', '1');
    img.classList.add('asset-pending');
    try {
      this.forget(original);
      img.src = await this.objectUrl(original);
      img.classList.remove('asset-pending');
    } catch {
      img.classList.remove('asset-pending');
    } finally {
      img.setAttribute('data-asset-retrying', '');
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
        const response = await fetch(url, { signal: controller.signal });
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

  private async openCache(): Promise<Cache | null> {
    if (!('caches' in window)) return null;
    try {
      return await caches.open(CACHE_NAME);
    } catch {
      return null;
    }
  }
}

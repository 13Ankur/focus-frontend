import { Directive, ElementRef, Input, OnChanges, OnDestroy } from '@angular/core';
import { AssetLoaderService } from '../services/asset-loader.service';

/** Loads an image from R2, retries on a slow connection, and shows a loader until it arrives. */
@Directive({
  selector: 'img[appAsset]',
  standalone: true,
})
export class AppAssetDirective implements OnChanges, OnDestroy {
  @Input() appAsset = '';
  @Input() appAssetCutout = false;
  private request = 0;

  constructor(
    private el: ElementRef<HTMLImageElement>,
    private loader: AssetLoaderService,
  ) {}

  ngOnChanges(): void {
    const url = this.appAsset;
    const img = this.el.nativeElement;
    const token = ++this.request;
    if (!url) {
      this.setPending(img, false);
      img.removeAttribute('src');
      return;
    }
    if (!this.loader.isRemote(url)) {
      img.src = url;
      this.setPending(img, false);
      return;
    }
    img.setAttribute('data-asset-original', url);
    this.setPending(img, true);
    const load = this.appAssetCutout ? this.loader.cutoutObjectUrl(url) : this.loader.objectUrl(url);
    void load.then(objectUrl => {
      if (token !== this.request) return;
      img.src = objectUrl;
      this.setPending(img, false);
    }).catch(() => {
      if (token !== this.request) return;
      img.src = url;
      this.setPending(img, false);
    });
  }

  ngOnDestroy(): void {
    this.setPending(this.el.nativeElement, false);
  }

  private setPending(img: HTMLImageElement, pending: boolean): void {
    img.classList.toggle('asset-pending', pending);
    img.setAttribute('aria-busy', pending ? 'true' : 'false');
    const parent = img.parentElement;
    if (parent) {
      parent.classList.toggle('asset-frame-pending', pending);
    }
  }
}

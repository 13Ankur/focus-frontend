import { Directive, ElementRef, Input, OnChanges } from '@angular/core';
import { AssetLoaderService } from '../services/asset-loader.service';

/** Loads an image from R2, retries on a slow connection, and shows a placeholder until it arrives. */
@Directive({
  selector: 'img[appAsset]',
  standalone: true,
})
export class AppAssetDirective implements OnChanges {
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
      img.removeAttribute('src');
      return;
    }
    if (!this.loader.isRemote(url)) {
      img.src = url;
      img.classList.remove('asset-pending');
      return;
    }
    img.setAttribute('data-asset-original', url);
    img.classList.add('asset-pending');
    const load = this.appAssetCutout ? this.loader.cutoutObjectUrl(url) : this.loader.objectUrl(url);
    void load.then(objectUrl => {
      if (token !== this.request) return;
      img.src = objectUrl;
      img.classList.remove('asset-pending');
    }).catch(() => {
      if (token !== this.request) return;
      img.classList.remove('asset-pending');
    });
  }
}

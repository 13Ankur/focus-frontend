import { environment } from '../../environments/environment';

/** Turn an app asset path into its public R2 URL. Absolute URLs are left unchanged. */
export function assetUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const relative = path.replace(/^\/+/, '').replace(/^assets\//, '');
  return `${environment.assetBaseUrl}/${relative}`;
}

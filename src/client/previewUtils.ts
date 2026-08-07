import type { PreviewService } from './configCache';

export type PreviewMode = PreviewService;

export function buildStorageBaseUrl(storage: any): string {
  if (!storage) return '';
  const options = storage.options || storage || {};
  let baseUrl = storage.baseUrl || storage.baseurl || options.baseUrl || options.baseurl || options.publicUrl || options.host || '';
  if (!baseUrl && options.endpoint && options.bucket) {
    let ep = String(options.endpoint).trim();
    if (!/^https?:\/\//i.test(ep)) {
      const ssl = options.useSSL || options.ssl || options.secure;
      ep = `${ssl ? 'https' : 'http'}://${ep}`;
    }
    ep = ep.replace(/\/+$/, '');
    const bucket = String(options.bucket).trim().replace(/^\/+|\/+$/g, '');
    baseUrl = `${ep}/${bucket}`;
  } else if (!baseUrl && options.endpoint) {
    let ep = String(options.endpoint).trim();
    if (!/^https?:\/\//i.test(ep)) {
      ep = `http://${ep}`;
    }
    baseUrl = ep;
  }
  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) {
    baseUrl = `http://${baseUrl}`;
  }
  return baseUrl ? baseUrl.replace(/\/+$/, '') : '';
}

export function normalizeExtensions(items: string[] = []) {
  return Array.from(
    new Set(
      items
        .map((item) => String(item).trim().toLowerCase())
        .filter((item) => Boolean(item) && /^[a-z0-9]+$/i.test(item))
    )
  );
}

export function parseExtensions(raw: any, fallback: string[]) {
  if (!raw) return normalizeExtensions(fallback);
  if (Array.isArray(raw)) {
    const normalized = normalizeExtensions(raw as string[]);
    return normalized.length > 0 ? normalized : normalizeExtensions(fallback);
  }
  const str = String(raw).trim();
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(parsed)) {
      const normalized = normalizeExtensions(parsed as string[]);
      return normalized.length > 0 ? normalized : normalizeExtensions(fallback);
    }
  } catch { }
  const splitted = normalizeExtensions(str.split(/[,，;；\s]+/));
  return splitted.length > 0 ? splitted : normalizeExtensions(fallback);
}

export function parseExtensionsInput(input: string | string[] = '') {
  if (Array.isArray(input)) {
    return normalizeExtensions(input);
  }
  const str = String(input || '').trim();
  if (str.startsWith('[') && str.endsWith(']')) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) {
        return normalizeExtensions(parsed);
      }
    } catch {}
  }
  return normalizeExtensions(str.split(/[,，;；\s]+/));
}

export function unwrapDataArray(payload: unknown, depth = 0): Array<Record<string, unknown>> {
  if (depth > 6) return [];
  if (Array.isArray(payload)) {
    return payload as Array<Record<string, unknown>>;
  }
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as Record<string, unknown>;
  if (Array.isArray(root.data)) {
    return root.data as Array<Record<string, unknown>>;
  }
  if (Array.isArray(root.items)) {
    return root.items as Array<Record<string, unknown>>;
  }
  if (root.data && typeof root.data === 'object') {
    const nested = unwrapDataArray(root.data, depth + 1);
    if (nested.length > 0) return nested;
    return [root.data as Record<string, unknown>];
  }
  if (Object.keys(root).length > 0) {
    return [root];
  }
  return [];
}

export function getFileExt(url: string = '', extname: string = '') {
  const ext = extname.replace(/^\./, '').toLowerCase();
  if (ext) return ext;
  const cleaned = url.split('?')[0];
  const matched = cleaned.match(/\.([a-z0-9]+)$/i);
  return matched ? matched[1].toLowerCase() : '';
}

export const NOCOBASE_ACTIVE_CONTENT_EXTENSIONS = ['htm', 'html', 'pdf', 'svg', 'svgz', 'xhtml'];

export function isNocoBaseManagedFileUrl(url: string = ''): boolean {
  const raw = String(url || '').trim();
  if (!raw) return false;
  try {
    const u = new URL(raw, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    const path = u.pathname;
    return path.includes('/storage/uploads/') || path.includes('/files/');
  } catch {
    return false;
  }
}

export function isNocoBaseForcedDownloadUrl(url: string = '', extname: string = ''): boolean {
  const raw = String(url || '').trim();
  if (!raw || !isNocoBaseManagedFileUrl(raw)) return false;
  const ext = getFileExt(raw, extname);
  if (NOCOBASE_ACTIVE_CONTENT_EXTENSIONS.includes(ext)) return true;
  const search = raw.split('?')[1]?.split('#')[0] || '';
  return new URLSearchParams(search).get('download') === '1';
}

export function attachTokenToNocoFileUrl(url: string = '', token?: string | null): string {
  const rawUrl = String(url || '').trim();
  if (!rawUrl || !token) return rawUrl;
  const isNocoFileUrl = rawUrl.includes('/files/') || rawUrl.includes('/storage/') || /^\/?(files|storage|api)\//i.test(rawUrl);
  if (isNocoFileUrl && !rawUrl.includes('token=')) {
    const separator = rawUrl.includes('?') ? '&' : '?';
    return `${rawUrl}${separator}token=${encodeURIComponent(token)}`;
  }
  return rawUrl;
}

export function decidePreviewMode(params: {
  preferredPreview: PreviewMode;
  enabledModes: PreviewMode[];
  enabledAndSupportedModes: PreviewMode[];
}) {
  const { preferredPreview, enabledModes, enabledAndSupportedModes } = params;
  if (enabledAndSupportedModes.includes(preferredPreview)) return preferredPreview;
  return enabledAndSupportedModes[0] || enabledModes[0] || null;
}


import type { PreviewService } from './configCache';

export type PreviewMode = PreviewService;

export function normalizeExtensions(items: string[] = []) {
  return Array.from(new Set(items.map((item) => String(item).trim().toLowerCase()).filter(Boolean)));
}

export function parseExtensions(raw: any, fallback: string[]) {
  if (!raw) return normalizeExtensions(fallback);
  if (Array.isArray(raw)) {
    const normalized = normalizeExtensions(raw as string[]);
    return normalized.length > 0 ? normalized : normalizeExtensions(fallback);
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const normalized = normalizeExtensions(parsed as string[]);
      return normalized.length > 0 ? normalized : normalizeExtensions(fallback);
    }
  } catch { }
  return normalizeExtensions(fallback);
}

export function parseExtensionsInput(input: string | string[] = '') {
  if (Array.isArray(input)) {
    return normalizeExtensions(input);
  }
  return normalizeExtensions(String(input).split(','));
}

export function unwrapDataArray(payload: unknown, depth = 0): Array<Record<string, unknown>> {
  if (depth > 6) return [];
  if (Array.isArray(payload)) {
    return payload as Array<Record<string, unknown>>;
  }
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as { data?: unknown };
  if (Array.isArray(root.data)) {
    return root.data as Array<Record<string, unknown>>;
  }
  if (root.data && typeof root.data === 'object') {
    return unwrapDataArray(root.data, depth + 1);
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

export function decidePreviewMode(params: {
  preferredPreview: PreviewMode;
  enabledModes: PreviewMode[];
  enabledAndSupportedModes: PreviewMode[];
}) {
  const { preferredPreview, enabledModes, enabledAndSupportedModes } = params;
  if (enabledAndSupportedModes.includes(preferredPreview)) return preferredPreview;
  return enabledAndSupportedModes[0] || enabledModes[0] || null;
}

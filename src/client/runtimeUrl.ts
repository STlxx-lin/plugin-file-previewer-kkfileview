type RuntimeWindow = Window & {
  __nocobase_public_path__?: string;
};

function ensureLeadingSlash(value: string) {
  return value.startsWith('/') ? value : `/${value}`;
}

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '');
}

function normalizeBaseHost(host: string) {
  const trimmed = host.trim().replace(/[,\uFF0C\s]+$/g, '');
  if (!trimmed) return '';
  return ensureTrailingSlash(trimmed.replace(/\/+$/g, ''));
}

export function normalizePublicPath(path: string = '') {
  const trimmed = trimSlashes(String(path || '').trim());
  if (!trimmed) return '/';
  return ensureTrailingSlash(ensureLeadingSlash(trimmed));
}

export function getRuntimePublicPath() {
  if (typeof window === 'undefined') return '/';
  const runtimeWindow = window as RuntimeWindow;
  return normalizePublicPath(runtimeWindow.__nocobase_public_path__ || '/');
}

export function getRuntimePublicBase() {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  const publicPath = getRuntimePublicPath();
  if (publicPath === '/') return `${origin}/`;
  return `${origin}${publicPath.replace(/\/$/, '')}/`;
}

export function resolveFileUrl(rawUrl: string = '', fallbackHost: string = '') {
  const normalizedUrl = String(rawUrl || '').trim().replace(/[,\uFF0C\s]+$/g, '');
  if (!normalizedUrl) return '';
  if (/^(https?|ftp):\/\//i.test(normalizedUrl)) return normalizedUrl;
  if (normalizedUrl.startsWith('//')) {
    if (typeof window === 'undefined') return normalizedUrl;
    return `${window.location.protocol}${normalizedUrl}`;
  }
  const resolvedBase = normalizeBaseHost(fallbackHost) || getRuntimePublicBase();
  if (!resolvedBase) return normalizedUrl;
  return new URL(normalizedUrl.replace(/^\/+/, ''), resolvedBase).toString();
}

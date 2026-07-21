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
  if (!window.location) return ''; // 防御 SSR 或测试环境下 location 不可用的情况。
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
  let resolvedBase = normalizeBaseHost(fallbackHost) || getRuntimePublicBase();
  if (resolvedBase) {
    try {
      const parsed = new URL(resolvedBase);
      const modernPrefix = typeof window !== 'undefined' ? (window as any).__nocobase_modern_client_prefix__ || 'v' : 'v';
      if (parsed.pathname.endsWith(`/${modernPrefix}/`)) {
        parsed.pathname = parsed.pathname.slice(0, -modernPrefix.length - 1);
      } else if (parsed.pathname.endsWith(`/${modernPrefix}`)) {
        parsed.pathname = parsed.pathname.slice(0, -modernPrefix.length);
      }
      resolvedBase = parsed.toString();
    } catch {
      // fallback
    }
  }
  if (!resolvedBase) return normalizedUrl;
  return new URL(normalizedUrl.replace(/^\/+/, ''), resolvedBase).toString();
}

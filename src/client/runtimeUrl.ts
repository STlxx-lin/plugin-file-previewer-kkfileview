import { FILE_VIEWER_PROXY_PATH_KEYWORD } from '../shared/constants';

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

export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') return '/api/';
  const runtimeWindow = window as RuntimeWindow & {
    __nocobase_api_base_url__?: string;
  };
  const runtimeApiBase = runtimeWindow.__nocobase_api_base_url__;
  if (typeof runtimeApiBase === 'string' && runtimeApiBase.trim()) {
    return runtimeApiBase.trim().replace(/\/+$/, '');
  }
  return '/api';
}

/**
 * 判断给定地址是否为 File Viewer 代理接口地址。
 * 精确匹配代理 action 路径，避免包含同名关键字的普通地址被误判。
 */
export function isFileViewerProxyUrl(url: unknown): boolean {
  return String(url || '').includes(`${FILE_VIEWER_PROXY_PATH_KEYWORD}:get`);
}

/**
 * 构建 File Viewer 代理地址。
 * 前端只请求该安全代理路径，由服务端代为拉取源文件，避免直接暴露源文件地址。
 * 代理地址默认基于当前浏览器来源生成；
 * 传入 baseHost（如系统公共访问地址 nocobaseHost）时，改用该公网地址，
 * 确保第三方预览服务（如 BaseMetas）可以从公网访问到该代理。
 */
export function buildFileViewerProxyUrl(fileUrl: string, token?: string | null, baseHost: string = ''): string {
  const rawUrl = String(fileUrl || '').trim();
  if (!rawUrl) return '';
  const apiBase = getApiBaseUrl();
  const params = new URLSearchParams();
  params.set('url', rawUrl);
  if (token) {
    params.set('token', token);
  }
  const relativeUrl = `${apiBase}/${FILE_VIEWER_PROXY_PATH_KEYWORD}:get?${params.toString()}`;
  const normalizedBase = String(baseHost || '').trim().replace(/\/+$/, '');
  if (normalizedBase && /^https?:\/\//i.test(normalizedBase)) {
    try {
      // apiBase 为绝对地址时直接返回；相对路径则拼接在公网基础地址之后，
      // 保留基础地址的子路径（如 https://host/nocobase/api/...）。
      if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;
      const combined = `${normalizedBase}${relativeUrl.startsWith('/') ? '' : '/'}${relativeUrl}`;
      return new URL(combined).toString();
    } catch {
      // 回退到浏览器来源。
    }
  }
  if (typeof window === 'undefined' || !window.location) {
    return relativeUrl;
  }
  try {
    return new URL(relativeUrl, window.location.origin).toString();
  } catch {
    return relativeUrl;
  }
}

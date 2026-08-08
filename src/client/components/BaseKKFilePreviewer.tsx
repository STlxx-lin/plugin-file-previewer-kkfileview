import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Button, Space, Typography, Radio, message, Input, Form, Select, Switch, Spin, Progress, Tooltip, Watermark } from 'antd';
import { CloseOutlined, LeftOutlined, RightOutlined, FullscreenOutlined, FullscreenExitOutlined, ExportOutlined, CodeOutlined, DownloadOutlined } from '@ant-design/icons';
import { saveAs } from 'file-saver';
import { Base64 } from 'js-base64';
import { ClientAdapters } from './adapter';
import { FileViewerRenderer, FileViewerFetchFileFn } from '../FileViewerRenderer';
import { resolveFileViewerAssetBase } from '../fileViewerRuntime';
import { attachTokenToNocoFileUrl, buildStorageBaseUrl, decidePreviewMode, getFileExt, isNocoBaseForcedDownloadUrl, parseExtensions } from '../previewUtils';
import {
  EmbedCodePermission,
  PREVIEW_SERVICE_REGISTRY,
  PreviewEngine,
  PreviewService,
} from '../configCache';
import { useKkfileviewConfig } from '../useKkfileviewConfig';
import { resolveWatermarkTemplate } from '../watermarkTemplate';
import { resolveFileUrl, isFileViewerProxyUrl } from '../runtimeUrl';
import { buildFileViewerProxyUrl } from '../runtimeUrl';
import { DEFAULT_EXTENSIONS, DEFAULT_FILE_VIEWER_EXTENSIONS, DEFAULT_MICROSOFT_EXTENSIONS } from '../../shared/constants';

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[c] ?? c;
  });
}

function isImageFile(url: string = '') {
  return /\.(jpeg|jpg|gif|png|webp|svg)$/i.test(url);
}

function isPdfFile(url: string = '', extname: string = '') {
  const ext = extname.replace(/^\./, '').toLowerCase();
  if (ext === 'pdf') return true;
  return /\.pdf$/i.test(url);
}

/**
 * File Viewer 渲染错误边界。
 * File Viewer 库在挂载、渲染或卸载（controller.destroy）过程中可能抛出异常，
 * 若不拦截会击穿 React 组件树，导致整个预览弹窗失去响应（点关闭无效）。
 * 这里把异常限制在边界内，保证弹窗始终可以关闭。
 */
class ViewerErrorBoundary extends React.Component<{ children: React.ReactNode; onError?: () => void }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[fileViewer] viewer error boundary caught:', error);
    this.props.onError?.();
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function getServiceHostFallback(
  service: typeof PREVIEW_SERVICE_REGISTRY[number],
  kkfileviewConfig: ReturnType<typeof useKkfileviewConfig>['config']
) {
  if (service.key === 'kkfileview') return kkfileviewConfig.kkfileviewHost;
  if (service.key === 'basemetas') return kkfileviewConfig.basemetasHost;
  if (service.key === 'fileViewer') return kkfileviewConfig.fileViewerAssetBase;
  return kkfileviewConfig.microsoftHost;
}

function getServiceExtensionsFallback(service: typeof PREVIEW_SERVICE_REGISTRY[number]) {
  if (service.key === 'microsoft') return DEFAULT_MICROSOFT_EXTENSIONS;
  if (service.key === 'fileViewer') return DEFAULT_FILE_VIEWER_EXTENSIONS;
  return DEFAULT_EXTENSIONS;
}

function getServiceEnabledFallback(
  service: typeof PREVIEW_SERVICE_REGISTRY[number],
  kkfileviewConfig: ReturnType<typeof useKkfileviewConfig>['config']
) {
  if (service.key === 'kkfileview') return kkfileviewConfig.enableKkfileview ?? true;
  if (service.key === 'basemetas') return kkfileviewConfig.enableBasemetas ?? false;
  if (service.key === 'fileViewer') return kkfileviewConfig.enableFileViewer ?? true;
  return kkfileviewConfig.enableMicrosoft ?? true;
}

function resolveFileDisplayTitle(file?: PreviewFileRecord | null): string {
  const directTitle = [file?.title, file?.name, file?.filename, file?.originalname]
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .find(Boolean);
  if (directTitle) return directTitle;
  const rawUrl = String(file?.url || '').trim();
  if (!rawUrl) return 'Document';
  try {
    const url = new URL(rawUrl, location.origin);
    const segment = url.pathname.split('/').filter(Boolean).pop() || '';
    const decoded = decodeURIComponent(segment).trim();
    return decoded || 'Document';
  } catch {
    return 'Document';
  }
}



type EmbedHtmlConfig = {
  width: string;
  height: string;
  frameBorder: '0' | '1';
  allowFullScreen: boolean;
};

type FullscreenCapableElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenCapableDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
  msFullscreenElement?: Element | null;
};

type FullscreenViewportSize = {
  width: number;
  height: number;
};

function getFullscreenElement(doc: FullscreenCapableDocument): Element | null {
  return doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement || null;
}

function isMobileDeviceViewport(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = String(window.navigator?.userAgent || '').toLowerCase();
  const uaMatched = /android|iphone|ipad|ipod|mobile|windows phone|harmonyos/.test(ua);
  const viewportMatched = window.innerWidth <= 820;
  return uaMatched || viewportMatched;
}

type RoleEntity = string | {
  name?: string;
  roleName?: string;
  code?: string;
  title?: string;
  displayName?: string;
};

type CurrentUserLike = {
  username?: string;
  nickname?: string;
  isSuperAdmin?: boolean;
  isSystemAdmin?: boolean;
  roles?: RoleEntity[];
};

export type PreviewFileRecord = {
  url?: string;
  extname?: string;
  title?: string;
  name?: string;
  filename?: string;
  originalname?: string;
};

export type PreviewerProps = {
  index?: number | null;
  list?: PreviewFileRecord[];
  file?: PreviewFileRecord;
  onSwitchIndex?: (nextIndex: number | null) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
};

export interface BasePreviewerProps extends PreviewerProps {
  adapters: ClientAdapters;
}

const DEFAULT_EMBED_HTML_CONFIG: EmbedHtmlConfig = {
  width: '100%',
  height: '100%',
  frameBorder: '0',
  allowFullScreen: true,
};

function buildEmbedHtml(src: string, title: string, config: EmbedHtmlConfig) {
  const safeTitle = escapeHtml(title);
  const safeSrc = escapeHtml(src);
  const safeWidth = escapeHtml(config.width.trim() || DEFAULT_EMBED_HTML_CONFIG.width);
  const safeHeight = escapeHtml(config.height.trim() || DEFAULT_EMBED_HTML_CONFIG.height);
  const safeFrameBorder = config.frameBorder === '1' ? '1' : '0';
  const allowFullscreenAttr = config.allowFullScreen ? ' allowfullscreen' : '';
  const borderStyle = safeFrameBorder === '1' ? '1px solid #d9d9d9' : '0';
  return `<iframe title="${safeTitle}" src="${safeSrc}" width="${safeWidth}" height="${safeHeight}" frameborder="${safeFrameBorder}" style="border:${borderStyle};"${allowFullscreenAttr}></iframe>`;
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    document.body.removeChild(textArea);
  }
  return copied;
}

function normalizeRoleTokens(input: unknown[]): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(input.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)));
}

function extractCurrentUserRoleTokens(user?: CurrentUserLike | null): string[] {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const tokens: string[] = [];
  roles.forEach((role) => {
    if (typeof role === 'string') {
      tokens.push(role);
      return;
    }
    if (!role || typeof role !== 'object') return;
    tokens.push(role.name, role.roleName, role.code, role.title, role.displayName);
  });
  return normalizeRoleTokens(tokens);
}

function isAdminUser(user: CurrentUserLike | null | undefined, roleTokens: string[]): boolean {
  const username = String(user?.username || '').trim().toLowerCase();
  if (username === 'admin') return true;
  if (user?.isSuperAdmin === true || user?.isSystemAdmin === true) return true;
  return roleTokens.some((token) => token === 'admin' || token === 'root' || token.includes('admin'));
}

export const BaseKKFilePreviewer = (props: BasePreviewerProps) => {
  const { index, list, file: directFile, onSwitchIndex, open, onOpenChange, onClose, adapters } = props;
  const file = directFile || (typeof index === 'number' ? list?.[index] : undefined);
  const isOpen = typeof open === 'boolean' ? open : index !== null && index !== undefined;
  const t = adapters.useT();
  const api = adapters.useAPIClient();

  const fetchFileWithAuth = useCallback<FileViewerFetchFileFn>(async ({ url, signal }) => {
    try {
      const isExternalCdn = /^https?:\/\//i.test(url) && (typeof window !== 'undefined' && window.location ? !url.startsWith(window.location.origin) : true);
      const isProxyTarget = isFileViewerProxyUrl(url);
      let targetUrl = url;
      const headers: HeadersInit = {};
      // 代理地址已携带短期预览令牌，直接由查询参数鉴权，
      // 避免再把用户会话令牌写入请求头覆盖短期令牌。
      if (!isExternalCdn && !isProxyTarget) {
        if (api.auth.token) {
          headers['Authorization'] = `Bearer ${api.auth.token}`;
          if (!targetUrl.includes('token=')) {
            const separator = targetUrl.includes('?') ? '&' : '?';
            targetUrl = `${targetUrl}${separator}token=${encodeURIComponent(api.auth.token)}`;
          }
        }
        if (api.auth.role) {
          headers['X-Role'] = api.auth.role;
        }
        if (api.auth.authenticator) {
          headers['X-Authenticator'] = api.auth.authenticator;
        }
      }
      const resp = await fetch(targetUrl, { headers, signal });
      if (!resp.ok) {
        throw new Error(`Fetch file failed with status ${resp.status}`);
      }
      return await resp.arrayBuffer();
    } catch (e) {
      if (e && (e as any).name === 'AbortError') {
        throw e;
      }
      console.error('[fileViewer] fetch file error:', e);
      throw e;
    }
  }, [api]);

  const fileDisplayTitle = useMemo(() => resolveFileDisplayTitle(file), [file?.title, file?.name, file?.filename, file?.originalname, file?.url]);

  const { config: kkfileviewConfig, ready: configReady } = useKkfileviewConfig();

  const serviceConfigMap = useMemo(
    () =>
      PREVIEW_SERVICE_REGISTRY.reduce((acc, service) => {
        const hostFallback = getServiceHostFallback(service, kkfileviewConfig);
        const extensionsFallback = getServiceExtensionsFallback(service);
        const enabledFallback = getServiceEnabledFallback(service, kkfileviewConfig);

        acc[service.key] = {
          host: hostFallback,
          extensions: parseExtensions(kkfileviewConfig[service.extensionsField] as unknown, extensionsFallback),
          enabled: enabledFallback,
        };
        return acc;
      }, {} as Record<PreviewService, { host: string; extensions: string[]; enabled: boolean }>),
    [
      kkfileviewConfig.kkfileviewHost,
      kkfileviewConfig.basemetasHost,
      kkfileviewConfig.microsoftHost,
      kkfileviewConfig.fileViewerAssetBase,
      kkfileviewConfig.enableKkfileview,
      kkfileviewConfig.enableBasemetas,
      kkfileviewConfig.enableMicrosoft,
      kkfileviewConfig.enableFileViewer,
      kkfileviewConfig.kkfileviewExtensions,
      kkfileviewConfig.basemetasExtensions,
      kkfileviewConfig.microsoftExtensions,
      kkfileviewConfig.fileViewerExtensions,
    ]
  );

  const preferredPreview = useMemo<PreviewEngine>(() => {
    const raw = kkfileviewConfig.preferredPreview || 'microsoft';
    if (raw === 'none') return 'none';
    return PREVIEW_SERVICE_REGISTRY.some((service) => service.key === raw) ? raw : 'microsoft';
  }, [kkfileviewConfig.preferredPreview]);

  const enabledModes = useMemo(
    () =>
      PREVIEW_SERVICE_REGISTRY.filter((service) => serviceConfigMap[service.key].enabled).map((service) => service.key),
    [serviceConfigMap]
  );

  const [previewMode, setPreviewMode] = useState<PreviewService | null>(null);

  const currentUserContext = adapters.useCurrentUserContext();
  const currentUser = (currentUserContext?.data?.data || currentUserContext?.data || null) as CurrentUserLike | null;

  const requestedAtRef = useRef<Date>(new Date());

  const fileMeta = useMemo(() => {
    let fullUrl = '';
    const rawStorage = (file as any)?.storage || (file as any)?.fileStorage;
    const storageBaseUrl = buildStorageBaseUrl(rawStorage);
    const rawFileName = (file as any)?.filename || (file as any)?.name || (file as any)?.path;

    if (storageBaseUrl && /^https?:\/\//i.test(storageBaseUrl) && rawFileName) {
      const cleanBase = storageBaseUrl.endsWith('/') ? storageBaseUrl : `${storageBaseUrl}/`;
      const cleanFilename = String(rawFileName).replace(/^\/+/, '');
      let encodedName = cleanFilename;
      try {
        if (decodeURIComponent(cleanFilename) === cleanFilename) {
          encodedName = encodeURIComponent(cleanFilename);
        }
      } catch {
        encodedName = encodeURIComponent(cleanFilename);
      }
      fullUrl = `${cleanBase}${encodedName}`;
    } else {
      fullUrl = file?.url ? resolveFileUrl(file.url, kkfileviewConfig.nocobaseHost) : '';
    }

    const isImg = isImageFile(file?.url || fullUrl);
    const isPdf = isPdfFile(file?.url || fullUrl, file?.extname || '');
    const ext = getFileExt(file?.url || fullUrl, file?.extname || '');
    return { fullUrl, isImg, isPdf, ext };
  }, [file, kkfileviewConfig.nocobaseHost]);

  const viewerFileName = useMemo(() => {
    const title = fileDisplayTitle || 'file';
    if (fileMeta.ext && !title.toLowerCase().endsWith(`.${fileMeta.ext.toLowerCase()}`)) {
      return `${title}.${fileMeta.ext}`;
    }
    return title;
  }, [fileDisplayTitle, fileMeta.ext]);

  const watermarkText = useMemo(() => {
    const rawTemplate = kkfileviewConfig.watermark || '';
    const resolved = resolveWatermarkTemplate(rawTemplate, { user: currentUser, requestedAt: requestedAtRef.current }).trim();
    if (resolved) return resolved;
    const fallbackUser = currentUser?.nickname || currentUser?.username || '';
    return fallbackUser ? `${fallbackUser}` : 'NocoBase';
  }, [kkfileviewConfig.watermark, currentUser]);

  const modeSupportedMap = useMemo(
    () =>
      PREVIEW_SERVICE_REGISTRY.reduce((acc, service) => {
        acc[service.key] = serviceConfigMap[service.key].extensions.includes(fileMeta.ext);
        return acc;
      }, {} as Record<PreviewService, boolean>),
    [serviceConfigMap, fileMeta.ext]
  );

  const enabledAndSupportedModes = useMemo(
    () => enabledModes.filter((mode) => modeSupportedMap[mode]),
    [enabledModes, modeSupportedMap]
  );

  useEffect(() => {
    if (!configReady) return;
    const next = decidePreviewMode({
      preferredPreview: (preferredPreview === 'none' ? 'microsoft' : preferredPreview) as PreviewService,
      enabledModes,
      enabledAndSupportedModes,
    });
    setPreviewMode(next);
  }, [configReady, preferredPreview, enabledModes, enabledAndSupportedModes, fileMeta.isImg, fileMeta.isPdf, file?.url]);

  const [resolvedDirectFileUrl, setResolvedDirectFileUrl] = useState<string>('');

  useEffect(() => {
    if (!isOpen || !fileMeta.fullUrl) {
      setResolvedDirectFileUrl('');
      return;
    }
    const rawTarget = attachTokenToNocoFileUrl(fileMeta.fullUrl, api.auth.token);
    if (!rawTarget.includes('/files/')) {
      setResolvedDirectFileUrl(rawTarget);
      return;
    }
    let isMounted = true;
    api.request({
      url: 'kkfileviewPreview:resolveDirectUrl',
      method: 'get',
      params: { url: fileMeta.fullUrl },
      skipNotify: true,
    }).then((res: any) => {
      if (isMounted) {
        const findDirectUrl = (obj: any): string => {
          if (!obj || typeof obj !== 'object') return '';
          if (typeof obj.directUrl === 'string' && /^https?:\/\//i.test(obj.directUrl)) return obj.directUrl;
          for (const key of Object.keys(obj)) {
            if (obj[key] && typeof obj[key] === 'object') {
              const found = findDirectUrl(obj[key]);
              if (found) return found;
            }
          }
          return '';
        };
        const directUrl = findDirectUrl(res);
        if (directUrl) {
          setResolvedDirectFileUrl(directUrl);
        } else {
          setResolvedDirectFileUrl(rawTarget);
        }
      }
    }).catch(() => {
      if (isMounted) setResolvedDirectFileUrl(rawTarget);
    });
    return () => {
      isMounted = false;
    };
  }, [isOpen, fileMeta.fullUrl, api.auth.token, api]);

  const activeTargetFileUrl = useMemo(() => {
    if (resolvedDirectFileUrl) {
      return resolvedDirectFileUrl;
    }
    if (fileMeta.fullUrl.includes('/files/')) {
      return '';
    }
    return attachTokenToNocoFileUrl(fileMeta.fullUrl, api.auth.token);
  }, [resolvedDirectFileUrl, fileMeta.fullUrl, api.auth.token]);

  const previewUrlMap = useMemo(
    () =>
      PREVIEW_SERVICE_REGISTRY.reduce((acc, service) => {
        if (!fileMeta.fullUrl || !activeTargetFileUrl) {
          acc[service.key] = '';
          return acc;
        }
        if (service.key === 'kkfileview') {
          const baseUrl = `${serviceConfigMap.kkfileview.host.replace(/\/$/, '')}/onlinePreview`;
          let targetUrl = activeTargetFileUrl;
          try {
            if (decodeURIComponent(targetUrl) !== targetUrl) {
              targetUrl = decodeURI(targetUrl);
            }
          } catch {
            // ignore
          }
          const encodedUrl = encodeURIComponent(Base64.encode(targetUrl));
          let previewUrl = `${baseUrl}?url=${encodedUrl}`;
          if (watermarkText && kkfileviewConfig.watermarkType === 'preview') {
            previewUrl += `&watermarkTxt=${encodeURIComponent(watermarkText)}`;
          }
          acc[service.key] = previewUrl;
          return acc;
        }
        if (service.key === 'basemetas') {
          const baseUrl = `${serviceConfigMap.basemetas.host.replace(/\/$/, '')}/preview/view`;
          let targetUrl = activeTargetFileUrl;
          try {
            if (decodeURIComponent(targetUrl) !== targetUrl) {
              targetUrl = decodeURI(targetUrl);
            }
          } catch {
            // ignore
          }
          const url = encodeURIComponent(targetUrl);
          const inferredExt = fileMeta.ext ? `.${fileMeta.ext}` : '';
          const ensureExt = (name: string) => {
            if (!inferredExt) return name;
            return name.toLowerCase().endsWith(inferredExt.toLowerCase()) ? name : `${name}${inferredExt}`;
          };
          const safeDecode = (str: string) => {
            try {
              return decodeURIComponent(str);
            } catch {
              return str;
            }
          };
          const rawFileName = safeDecode(file?.name || fileDisplayTitle || 'file');
          const normalizedFileName = ensureExt(rawFileName);
          const rawDisplayName = safeDecode(file?.title || fileDisplayTitle || normalizedFileName);
          const normalizedDisplayName = ensureExt(rawDisplayName);
          const fileName = encodeURIComponent(normalizedFileName);
          const displayName = encodeURIComponent(normalizedDisplayName);
          let previewUrl = '';
          const useBase64Mode = kkfileviewConfig.basemetasRequestType === 'base64';

          if (useBase64Mode) {
            const payloadObj: Record<string, any> = {
              url: targetUrl,
              fileName: normalizedFileName,
              displayName: normalizedDisplayName,
            };
            if (fileMeta.ext) {
              payloadObj.ext = fileMeta.ext;
            }
            if (watermarkText && kkfileviewConfig.watermarkType === 'preview') {
              payloadObj.watermark = {
                value: watermarkText,
              };
              payloadObj.watermarkTxt = watermarkText;
            }
            const encodedData = encodeURIComponent(Base64.encode(JSON.stringify(payloadObj)));
            previewUrl = `${baseUrl}?data=${encodedData}`;
          } else {
            const extParam = fileMeta.ext ? `&ext=${encodeURIComponent(fileMeta.ext)}&fileType=${encodeURIComponent(fileMeta.ext)}` : '';
            previewUrl = `${baseUrl}?url=${url}&fileName=${fileName}&displayName=${displayName}${extParam}`;
          }

          if (watermarkText && kkfileviewConfig.watermarkType === 'preview') {
            const safeWm = encodeURIComponent(watermarkText);
            previewUrl += `&watermark=${safeWm}&watermarkTxt=${safeWm}`;
          }
          acc[service.key] = previewUrl;
          return acc;
        }
        try {
          const officeUrl = new URL(serviceConfigMap.microsoft.host);
          officeUrl.searchParams.set('src', fileMeta.fullUrl);
          acc[service.key] = officeUrl.href;
        } catch {
          acc[service.key] = '';
        }
        return acc;
      }, {} as Record<PreviewService, string>),
    [fileMeta.fullUrl, fileMeta.ext, activeTargetFileUrl, serviceConfigMap, watermarkText, file?.name, file?.title, fileDisplayTitle, kkfileviewConfig.basemetasRequestType, kkfileviewConfig.watermarkType]
  );

  const resolvedPreviewUrl = useMemo(() => {
    if (fileMeta.isImg) return fileMeta.fullUrl;
    if (previewMode === 'fileViewer') return fileMeta.fullUrl;
    if (previewMode) return previewUrlMap[previewMode] || (fileMeta.isPdf ? fileMeta.fullUrl : '');
    return fileMeta.isPdf ? fileMeta.fullUrl : '';
  }, [fileMeta, previewMode, previewUrlMap]);

  const needsInlineBlobFetch = useMemo(() => {
    if (!resolvedPreviewUrl) return false;
    if (previewMode === 'fileViewer') return false;
    return isNocoBaseForcedDownloadUrl(resolvedPreviewUrl, fileMeta.ext);
  }, [resolvedPreviewUrl, fileMeta.ext, previewMode]);

  const servicePreviewDisabled = preferredPreview === 'none' || enabledModes.length === 0;
  const unsupportedByAllOff = servicePreviewDisabled && !fileMeta.isImg && !fileMeta.isPdf;
  const unsupportedByFormats = !servicePreviewDisabled && !fileMeta.isImg && !fileMeta.isPdf && enabledAndSupportedModes.length === 0;
  const unsupportedFile = unsupportedByAllOff || unsupportedByFormats;
  const hasPagination = typeof index === 'number' && Array.isArray(list) && list.length > 0;
  const currentDisplayIndex = hasPagination ? index + 1 : 1;
  const totalDisplayCount = hasPagination ? list.length : 1;
  const [iframeLoadFailed, setIframeLoadFailed] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(false);
  const [iframeRetrySeed, setIframeRetrySeed] = useState(0);
  const [inlinePreviewBlobUrl, setInlinePreviewBlobUrl] = useState('');
  const inlinePreviewRevokeRef = useRef<() => void>();

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    inlinePreviewRevokeRef.current?.();
    inlinePreviewRevokeRef.current = undefined;
    setInlinePreviewBlobUrl('');
    if (!needsInlineBlobFetch || !resolvedPreviewUrl) {
      return;
    }
    const load = async () => {
      try {
        const headers: HeadersInit = {};
        let targetUrl = resolvedPreviewUrl;
        const token = api.auth.token;
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
          if (!targetUrl.includes('token=')) {
            const separator = targetUrl.includes('?') ? '&' : '?';
            targetUrl = `${targetUrl}${separator}token=${encodeURIComponent(token)}`;
          }
        }
        const resp = await fetch(targetUrl, { headers });
        if (!resp.ok) {
          throw new Error(`Fetch preview file failed with status ${resp.status}`);
        }
        const blob = await resp.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        const revoke = () => {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
        inlinePreviewRevokeRef.current = revoke;
        setInlinePreviewBlobUrl(objectUrl);
      } catch (error) {
        if (cancelled) return;
        console.error('[kkfileview] inline preview fetch error:', error);
        iframeLoadedRef.current = false;
        setIframeLoadFailed(true);
        setIframeLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [needsInlineBlobFetch, resolvedPreviewUrl, api.auth.token, iframeRetrySeed]);

  const effectivePreviewUrl = needsInlineBlobFetch ? inlinePreviewBlobUrl : resolvedPreviewUrl;
  const [fileViewerPreviewToken, setFileViewerPreviewToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFileViewerPreviewToken(null);
    if (!isOpen || (previewMode as string) !== 'fileViewer' || !fileMeta.fullUrl) {
      return undefined;
    }
    api.request({
      url: 'kkfileviewPreview:createFileViewerToken',
      method: 'get',
      params: { url: fileMeta.fullUrl },
      skipNotify: true,
    })
      .then((res: any) => {
        if (cancelled) return;
        const findToken = (obj: any): string => {
          if (!obj || typeof obj !== 'object') return '';
          if (typeof obj.token === 'string' && obj.token.trim()) return obj.token;
          for (const key of Object.keys(obj)) {
            if (obj[key] && typeof obj[key] === 'object') {
              const found = findToken(obj[key]);
              if (found) return found;
            }
          }
          return '';
        };
        const token = findToken(res);
        if (token) {
          setFileViewerPreviewToken(token);
        } else {
          iframeLoadedRef.current = false;
          setIframeLoadFailed(true);
          setIframeLoading(false);
        }
      })
      .catch(() => {
        if (cancelled) return;
        iframeLoadedRef.current = false;
        setIframeLoadFailed(true);
        setIframeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, previewMode, fileMeta.fullUrl, api]);

  const fileViewerProxyUrl = useMemo(
    () => buildFileViewerProxyUrl(fileMeta.fullUrl, fileViewerPreviewToken),
    [fileMeta.fullUrl, fileViewerPreviewToken]
  );
  const [fileViewerProgress, setFileViewerProgress] = useState<number>(0);
  const fileViewerProgressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const iframeLoadedRef = useRef(false);
  const [embedConfigVisible, setEmbedConfigVisible] = useState(false);
  const [embedConfig, setEmbedConfig] = useState<EmbedHtmlConfig>(DEFAULT_EMBED_HTML_CONFIG);
  const [embedConfigDraft, setEmbedConfigDraft] = useState<EmbedHtmlConfig>(DEFAULT_EMBED_HTML_CONFIG);
  const [copyingEmbedHtml, setCopyingEmbedHtml] = useState(false);
  const lastPreviewLogSignatureRef = useRef('');
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);
  const [fullscreenViewportSize, setFullscreenViewportSize] = useState<FullscreenViewportSize>({ width: 0, height: 0 });
  const currentUserRoleTokens = useMemo(() => extractCurrentUserRoleTokens(currentUser), [currentUser]);
  const isMobileViewport = useMemo(() => isMobileDeviceViewport(), [isOpen, resolvedPreviewUrl]);
  const useMobileFullscreenLayout = kkfileviewConfig.enableMobileAutoFullscreen === true && isMobileViewport;
  const canSeeCopyEmbedButton = useMemo(() => {
    if (kkfileviewConfig.enableCopyEmbedHtml === false) return false;
    const permission = (kkfileviewConfig.copyEmbedHtmlPermission || 'user') as EmbedCodePermission;
    if (permission === 'user') return true;
    if (permission === 'admin') return isAdminUser(currentUser, currentUserRoleTokens);
    const allowedRoles = normalizeRoleTokens(kkfileviewConfig.copyEmbedHtmlRoles);
    if (allowedRoles.length === 0) return false;
    return currentUserRoleTokens.some((token) => allowedRoles.includes(token));
  }, [kkfileviewConfig.enableCopyEmbedHtml, kkfileviewConfig.copyEmbedHtmlPermission, kkfileviewConfig.copyEmbedHtmlRoles, currentUser, currentUserRoleTokens]);

  useEffect(() => {
    if (!isOpen) {
      lastPreviewLogSignatureRef.current = '';
      return;
    }
    if (!fileMeta.fullUrl || !resolvedPreviewUrl) return;
    const signature = `${fileMeta.fullUrl}|${resolvedPreviewUrl}|${previewMode || ''}`;
    if (lastPreviewLogSignatureRef.current === signature) return;
    lastPreviewLogSignatureRef.current = signature;
    void api.request({
      url: 'kkfileviewPreviewRecords:append',
      method: 'post',
      data: {
        fileName: fileDisplayTitle || file?.name || '',
        previewService: previewMode || (fileMeta.isImg ? 'image' : (fileMeta.isPdf ? 'pdf' : '')),
        fileUrl: fileMeta.fullUrl,
        requestedAt: new Date().toISOString(),
      },
      skipNotify: true,
    }).catch(() => {
    });
  }, [isOpen, fileMeta.fullUrl, resolvedPreviewUrl, previewMode, fileDisplayTitle, file?.name, api]);

  useEffect(() => {
    if ((previewMode as string) === 'fileViewer') {
      if (unsupportedFile || !resolvedPreviewUrl) {
        iframeLoadedRef.current = false;
        setIframeLoadFailed(false);
        setIframeLoading(false);
        setFileViewerProgress(0);
        return;
      }
      iframeLoadedRef.current = false;
      setIframeLoadFailed(false);
      setIframeLoading(true);
      setFileViewerProgress(0);
      return;
    }
    const shouldWatchIframe = !unsupportedFile && !fileMeta.isImg && Boolean(resolvedPreviewUrl) && (previewMode as string) !== 'fileViewer';
    if (!shouldWatchIframe) {
      iframeLoadedRef.current = false;
      setIframeLoadFailed(false);
      setIframeLoading(false);
      return;
    }
    iframeLoadedRef.current = false;
    setIframeLoadFailed(false);
    setIframeLoading(true);
    const timer = window.setTimeout(() => {
      if (!iframeLoadedRef.current) {
        setIframeLoadFailed(true);
        setIframeLoading(false);
      }
    }, 60000);
    return () => window.clearTimeout(timer);
  }, [resolvedPreviewUrl, previewMode, file?.url, unsupportedFile, fileMeta.isImg, iframeRetrySeed]);
  const showIframeLoading = (previewMode as string) !== 'fileViewer' && iframeLoading && !iframeLoadFailed;
  const showFileViewerLoading = (previewMode as string) === 'fileViewer' && iframeLoading && !iframeLoadFailed && !!resolvedPreviewUrl;

  useEffect(() => {
    if (fileViewerProgressTimerRef.current) {
      clearInterval(fileViewerProgressTimerRef.current);
      fileViewerProgressTimerRef.current = null;
    }
    if (!showFileViewerLoading) return;
    setFileViewerProgress(0);
    fileViewerProgressTimerRef.current = setInterval(() => {
      setFileViewerProgress((prev) => {
        if (prev >= 90) return prev;
        const remaining = 90 - prev;
        const step = Math.max(0.5, remaining * 0.06);
        return Math.min(90, prev + step);
      });
    }, 200);
    return () => {
      if (fileViewerProgressTimerRef.current) {
        clearInterval(fileViewerProgressTimerRef.current);
        fileViewerProgressTimerRef.current = null;
      }
    };
  }, [showFileViewerLoading]);


  const handleOpenNewWindow = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (unsupportedFile) return;

    if (previewMode === 'fileViewer') {
      const popup = window.open('', '_blank');
      if (popup) {
        const resolvedAssetBase = resolveFileViewerAssetBase(
          serviceConfigMap.fileViewer.host,
          kkfileviewConfig.fileViewerDownloaded
        );
        const scriptUrl = `${resolvedAssetBase}flyfish-file-viewer-web-full.iife.js`;
        const safeTitle = escapeHtml(viewerFileName);
        const safeFileUrl = JSON.stringify(fileViewerProxyUrl || fileMeta.fullUrl);
        const safeFileName = JSON.stringify(viewerFileName);
        const safeAssetBase = JSON.stringify(resolvedAssetBase);
        const safeWatermarkConfig = watermarkText
          ? JSON.stringify({
              text: watermarkText,
              opacity: typeof kkfileviewConfig.watermarkOpacity === 'number' ? kkfileviewConfig.watermarkOpacity : 0.18,
              color: kkfileviewConfig.watermarkColor || 'rgba(0, 0, 0, 0.18)',
              rotate: typeof kkfileviewConfig.watermarkRotate === 'number' ? kkfileviewConfig.watermarkRotate : -24,
            })
          : 'null';

        const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <style>
    * { box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background-color: #f5f5f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #viewer-host {
      width: 100vw;
      height: 100vh;
      position: relative;
    }
    #loading-mask {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #ffffff;
      z-index: 999;
      transition: opacity 0.3s;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #1677ff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div id="viewer-host">
    <div id="loading-mask">
      <div class="spinner"></div>
      <p style="margin-top: 16px; color: #666; font-size: 14px;">正在加载 File Viewer 预览组件...</p>
    </div>
  </div>
  <script src="${scriptUrl}"></script>
  <script>
    // 将掩膜打印所需的 .fv-print-mask-* CSS 注入到 ShadowRoot（与主窗口逻辑保持一致）
    // 库自身将此 CSS 写入 document.head，但 ShadowRoot 内元素无法继承，需手动补注入。
    function injectPrintMaskCss(host) {
      var PRINT_MASK_CSS = [
        '.fv-print-mask-layer{position:absolute;inset:0;z-index:2147483000;pointer-events:none;}',
        '.fv-print-mask-canvas{position:absolute;inset:0;z-index:2147483000;pointer-events:none;cursor:default;}',
        '.fv-print-mask-canvas.is-armed{pointer-events:auto;cursor:crosshair;touch-action:none;}',
        '.fv-print-mask-block{position:absolute;background:#000;box-sizing:border-box;pointer-events:auto;}',
        '.fv-print-mask-block-remove{position:absolute;right:-8px;top:-8px;width:18px;height:18px;border:0;border-radius:999px;background:#111;color:#fff;font:700 12px/18px system-ui,sans-serif;cursor:pointer;padding:0;}',
        '.fv-print-mask-toolbar{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483001;display:inline-flex;align-items:center;gap:6px;padding:6px 8px;border:1px solid rgba(20,35,53,.12);border-radius:999px;background:rgba(255,255,255,.94);box-shadow:0 12px 28px rgba(15,23,42,.16);pointer-events:auto;max-width:calc(100% - 24px);flex-wrap:wrap;justify-content:center;}',
        '.fv-print-mask-toolbar span{font:600 12px/1.2 system-ui,sans-serif;color:#40546a;white-space:nowrap;}',
        '.fv-print-mask-toolbar button{min-width:42px;height:30px;padding:0 10px;border:0;border-radius:999px;background:transparent;color:#40546a;font:800 12px/1 system-ui,sans-serif;cursor:pointer;}',
        '.fv-print-mask-toolbar button:hover,.fv-print-mask-toolbar button.is-active{background:rgba(33,163,102,.1);color:#16774c;}',
        '.fv-print-mask-toolbar button.primary{background:#16774c;color:#fff;}',
        '.fv-print-mask-toolbar button.primary:hover{background:#0f5f3c;}'
      ].join('');
      try {
        var shadowRoot = host.shadowRoot;
        if (shadowRoot) {
          if (typeof CSSStyleSheet !== 'undefined' && CSSStyleSheet.prototype.replaceSync) {
            var sheet = new CSSStyleSheet();
            sheet.replaceSync(PRINT_MASK_CSS);
            shadowRoot.adoptedStyleSheets = Array.from(shadowRoot.adoptedStyleSheets).concat(sheet);
          } else {
            var style = document.createElement('style');
            style.id = 'fv-print-mask-designer-style-shadow';
            style.textContent = PRINT_MASK_CSS;
            shadowRoot.appendChild(style);
          }
        }
      } catch(e) { /* 注入失败时静默忽略 */ }
    }

    (function() {
      var attempts = 0;
      function startViewer() {
        var globalLib = window.FlyfishFileViewerWebFull;
        var host = document.getElementById('viewer-host');
        var loadingMask = document.getElementById('loading-mask');
        if (!globalLib || !globalLib.mountViewer || !host) {
          attempts++;
          if (attempts < 100) {
            setTimeout(startViewer, 100);
          } else if (loadingMask) {
            loadingMask.innerHTML = '<p style="color: #ff4d4f; font-size: 14px;">预览组件加载超时，请刷新重试</p>';
          }
          return;
        }
        if (globalLib.setDefaultFullAssetBaseUrl) {
          globalLib.setDefaultFullAssetBaseUrl(${safeAssetBase});
        }
        var watermarkConfig = ${safeWatermarkConfig};
        var options = { styleIsolation: 'shadow', toolbar: true };
        if (watermarkConfig) {
          options.watermark = watermarkConfig;
        }
        try {
          globalLib.mountViewer(host, {
            url: ${safeFileUrl},
            name: ${safeFileName},
            filename: ${safeFileName},
            watermark: watermarkConfig ? watermarkConfig.text : undefined,
            options: options
          });
          // 掩膜打印 CSS 补注入，确保 Shadow DOM 内掩膜工具栏样式正常
          injectPrintMaskCss(host);
          if (loadingMask) {
            loadingMask.style.opacity = '0';
            setTimeout(function() { if (loadingMask.parentNode) loadingMask.parentNode.removeChild(loadingMask); }, 300);
          }
        } catch(err) {
          console.error('[FileViewer Error]', err);
          if (loadingMask) {
            loadingMask.innerHTML = '<p style="color: #ff4d4f; font-size: 14px;">预览渲染失败，请检查网络</p>';
          }
        }
      }

      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        startViewer();
      } else {
        window.addEventListener('DOMContentLoaded', startViewer);
      }
    })();
  </script>
</body>
</html>`;

        popup.document.open();
        popup.document.write(htmlContent);
        popup.document.close();
        return;
      }
    }

    if (!resolvedPreviewUrl) return;
    const popup = window.open(effectivePreviewUrl, '_blank', 'noopener,noreferrer');
    if (popup) {
      try { popup.opener = null; } catch { }
    }
  }, [unsupportedFile, previewMode, serviceConfigMap.fileViewer.host, kkfileviewConfig.fileViewerDownloaded, kkfileviewConfig.watermarkOpacity, kkfileviewConfig.watermarkRotate, kkfileviewConfig.watermarkColor, viewerFileName, fileMeta.fullUrl, watermarkText, resolvedPreviewUrl, effectivePreviewUrl, fileViewerProxyUrl]);

  const openEmbedConfigModal = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (unsupportedFile) return;
    if (!resolvedPreviewUrl) return;
    setEmbedConfigDraft(embedConfig);
    setEmbedConfigVisible(true);
  }, [resolvedPreviewUrl, unsupportedFile, embedConfig]);

  const handleConfirmCopyEmbedHtml = useCallback(async () => {
    if (unsupportedFile) return;
    if (!resolvedPreviewUrl) return;
    const normalizedConfig: EmbedHtmlConfig = {
      width: embedConfigDraft.width.trim() || DEFAULT_EMBED_HTML_CONFIG.width,
      height: embedConfigDraft.height.trim() || DEFAULT_EMBED_HTML_CONFIG.height,
      frameBorder: embedConfigDraft.frameBorder === '1' ? '1' : '0',
      allowFullScreen: !!embedConfigDraft.allowFullScreen,
    };
    setCopyingEmbedHtml(true);
    try {
      const embedHtml = buildEmbedHtml(resolvedPreviewUrl, fileDisplayTitle || 'Document', normalizedConfig);
      const copied = await copyTextToClipboard(embedHtml);
      if (!copied) {
        message.error(t('Failed to copy Embed HTML'));
        return;
      }
      setEmbedConfig(normalizedConfig);
      setEmbedConfigVisible(false);
      message.success(t('Embed HTML copied'));
    } catch {
      message.error(t('Failed to copy Embed HTML'));
    } finally {
      setCopyingEmbedHtml(false);
    }
  }, [resolvedPreviewUrl, unsupportedFile, file, t, embedConfigDraft, fileDisplayTitle]);

  const handleRetryPreview = useCallback(() => {
    iframeLoadedRef.current = false;
    setIframeLoadFailed(false);
    setIframeRetrySeed((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!isPreviewFullscreen) {
      setFullscreenViewportSize({ width: 0, height: 0 });
      return;
    }
    const updateSize = () => {
      const rect = previewContainerRef.current?.getBoundingClientRect();
      const width = Math.max(0, Math.round(rect?.width || window.innerWidth || 0));
      const height = Math.max(0, Math.round(rect?.height || window.innerHeight || 0));
      setFullscreenViewportSize({ width, height });
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => {
      window.removeEventListener('resize', updateSize);
    };
  }, [isPreviewFullscreen]);

  useEffect(() => {
    const doc = document as FullscreenCapableDocument;
    const updateFullscreenState = () => {
      const fullscreenElement = getFullscreenElement(doc);
      const target = previewContainerRef.current;
      setIsPreviewFullscreen(Boolean(fullscreenElement && target && (fullscreenElement === target || target.contains(fullscreenElement))));
    };
    updateFullscreenState();
    const handleFullscreenChange = () => updateFullscreenState();
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  const requestElementFullscreen = useCallback(async () => {
    const el = previewContainerRef.current as FullscreenCapableElement | null;
    if (!el) return;
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
      } else if (el.msRequestFullscreen) {
        await el.msRequestFullscreen();
      } else {
        message.warning(t('Fullscreen API is not supported in current browser'));
      }
    } catch {
      message.error(t('Failed to enter fullscreen mode'));
    }
  }, [t]);

  const exitElementFullscreen = useCallback(async () => {
    const doc = document as FullscreenCapableDocument;
    try {
      if (doc.exitFullscreen) {
        await doc.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
      } else if (doc.msExitFullscreen) {
        await doc.msExitFullscreen();
      }
    } catch {
      message.error(t('Failed to exit fullscreen mode'));
    }
  }, [t]);

  const handleToggleFullscreen = useCallback(async () => {
    if (isPreviewFullscreen) {
      await exitElementFullscreen();
    } else {
      await requestElementFullscreen();
    }
  }, [isPreviewFullscreen, exitElementFullscreen, requestElementFullscreen]);

  const handleClose = useCallback(() => {
    if (onClose) onClose();
    if (onOpenChange) onOpenChange(false);
  }, [onClose, onOpenChange]);

  // 使用捕获阶段监听 Esc：File Viewer 的阴影 DOM 可能吞掉按键事件导致
  // antd Modal 自带的 Esc 关闭失效，捕获阶段监听可以保证始终能关闭预览弹窗。
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !embedConfigVisible) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, embedConfigVisible, handleClose]);

  const handleDownload = useCallback(() => {
    if (kkfileviewConfig.enableDownload === false) {
      message.warning(t('Download functionality is disabled'));
      return;
    }
    if (!fileMeta.fullUrl) {
      message.error(t('File URL is empty'));
      return;
    }
    saveAs(fileMeta.fullUrl, fileDisplayTitle);
  }, [kkfileviewConfig.enableDownload, fileMeta.fullUrl, fileDisplayTitle, t]);

  const modalWidth = useMemo(() => (useMobileFullscreenLayout ? '100vw' : '82vw'), [useMobileFullscreenLayout]);

  const activeModeSupportsCurrentFile = useMemo(() => {
    if (!previewMode) return false;
    return modeSupportedMap[previewMode] ?? false;
  }, [previewMode, modeSupportedMap]);

  return (
    <>
      <Modal
        open={isOpen}
        onCancel={handleClose}
        footer={null}
        width={modalWidth}
        style={useMobileFullscreenLayout ? { top: 0, padding: 0, margin: 0, maxWidth: '100vw' } : { top: '3vh' }}
        bodyStyle={
          useMobileFullscreenLayout
            ? { height: '100vh', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
            : { height: '84vh', padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
        }
        destroyOnClose
        closeIcon={null}
      >
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography.Title level={5} style={{ margin: 0 }} ellipsis={{ tooltip: fileDisplayTitle }}>
            {fileDisplayTitle}
          </Typography.Title>
          <Button type="text" icon={<CloseOutlined />} onClick={handleClose} />
        </div>

        <div ref={previewContainerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#f5f5f5' }}>
          {unsupportedFile ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
              <Typography.Text type="secondary">{t('Current file format does not support online preview')}</Typography.Text>
              {kkfileviewConfig.enableDownload !== false && (
                <Button type="primary" onClick={handleDownload}>
                  {t('Download File')}
                </Button>
              )}
            </div>
          ) : !activeModeSupportsCurrentFile && !fileMeta.isImg && !fileMeta.isPdf ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
              <Typography.Text type="secondary">
                {t('Current preview mode does not support this file format, please switch preview mode')}
              </Typography.Text>
            </div>
          ) : iframeLoadFailed ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
              <Typography.Text type="secondary">{t('Preview load timeout or failed')}</Typography.Text>
              <Space>
                <Button type="primary" onClick={handleRetryPreview}>
                  {t('Retry')}
                </Button>
                {kkfileviewConfig.enableDownload !== false && <Button onClick={handleDownload}>{t('Download File')}</Button>}
              </Space>
            </div>
          ) : fileMeta.isImg ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
              <img src={effectivePreviewUrl || fileMeta.fullUrl} alt={fileDisplayTitle} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
          ) : (previewMode as string) === 'fileViewer' ? (
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
              {resolvedPreviewUrl && fileViewerPreviewToken ? (
                <ViewerErrorBoundary
                  key={`fv-${iframeRetrySeed}`}
                  onError={() => {
                    iframeLoadedRef.current = false;
                    setIframeLoadFailed(true);
                    setIframeLoading(false);
                    setFileViewerProgress(0);
                  }}
                >
                  <FileViewerRenderer
                    fileUrl={fileViewerProxyUrl}
                    fileName={viewerFileName}
                    watermark={watermarkText}
                    watermarkOpacity={kkfileviewConfig.watermarkOpacity}
                    watermarkRotate={kkfileviewConfig.watermarkRotate}
                    watermarkColor={kkfileviewConfig.watermarkColor}
                    enableDownload={kkfileviewConfig.enableDownload !== false}
                    assetBase={serviceConfigMap.fileViewer.host}
                    fileViewerDownloaded={Boolean(kkfileviewConfig.fileViewerDownloaded)}
                    fetchFile={kkfileviewConfig.fileViewerLoadMode === 'cdn' ? undefined : fetchFileWithAuth}
                    onReady={() => {
                      iframeLoadedRef.current = true;
                      setIframeLoadFailed(false);
                      setIframeLoading(false);
                      setFileViewerProgress(100);
                    }}
                    onError={(err) => {
                      console.error('[fileViewer] render error:', err);
                      iframeLoadedRef.current = false;
                      setIframeLoadFailed(true);
                      setIframeLoading(false);
                      setFileViewerProgress(0);
                    }}
                    onProgress={(percent) => {
                      setFileViewerProgress(percent);
                    }}
                  />
                </ViewerErrorBoundary>
              ) : null}

              {showFileViewerLoading ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.72)', zIndex: 10 }}>
                  <Space direction="vertical" align="center" size={12}>
                    <Spin size="large" />
                    <Typography.Text type="secondary">
                      {t('Loading preview component...')} {Math.floor(fileViewerProgress)}%
                    </Typography.Text>
                    <Progress
                      percent={Math.floor(fileViewerProgress)}
                      size="small"
                      status={fileViewerProgress >= 100 ? 'success' : 'active'}
                      style={{ width: 220 }}
                      showInfo={false}
                      strokeColor={{ from: '#1677ff', to: '#52c41a' }}
                    />
                  </Space>
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
              {effectivePreviewUrl ? (
                <iframe
                  key={`${effectivePreviewUrl}-${iframeRetrySeed}`}
                  src={effectivePreviewUrl}
                  style={{ width: '100%', height: '100%', border: 'none', display: 'block', backgroundColor: '#fff' }}
                  onLoad={() => {
                    iframeLoadedRef.current = true;
                    setIframeLoadFailed(false);
                    setIframeLoading(false);
                  }}
                  onError={() => {
                    iframeLoadedRef.current = false;
                    setIframeLoadFailed(true);
                    setIframeLoading(false);
                  }}
                />
              ) : null}
              {showIframeLoading ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.72)', zIndex: 10 }}>
                  <Space direction="vertical" align="center" size={8}>
                    <Spin size="large" />
                    <Typography.Text type="secondary">
                      {previewMode === 'basemetas'
                        ? t('BaseMetas is loading preview...')
                        : previewMode === 'kkfileview'
                          ? t('kkFileView is loading preview...')
                          : previewMode === 'microsoft'
                            ? t('Microsoft Online Viewer is loading preview...')
                            : t('Loading preview...')}
                    </Typography.Text>
                  </Space>
                </div>
              ) : null}
            </div>
          )}


          {isPreviewFullscreen && (
            <Button
              icon={<FullscreenExitOutlined />}
              onClick={handleToggleFullscreen}
              style={{
                position: 'absolute',
                top: 16,
                right: 16,
                zIndex: 100,
                backgroundColor: 'rgba(0, 0, 0, 0.65)',
                color: '#fff',
                borderColor: 'transparent',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
            >
              {t('Exit Fullscreen')}
            </Button>
          )}
        </div>

        <div
          style={{
            padding: isMobileViewport ? '8px 12px' : '10px 16px',
            borderTop: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: isMobileViewport ? 6 : 8,
            maxWidth: '100%',
            boxSizing: 'border-box',
          }}
        >
          <Space size={isMobileViewport ? 'small' : 'middle'} style={{ flexWrap: 'wrap' }}>
            {enabledModes.length > 1 && (
              isMobileViewport ? (
                <Select
                  size="small"
                  value={previewMode}
                  onChange={(val) => setPreviewMode(val as PreviewService)}
                  options={enabledModes.map((mode) => ({
                    label: mode === 'microsoft' ? '微软' : mode === 'kkfileview' ? 'kkFile' : mode === 'basemetas' ? 'BaseMetas' : 'FileViewer',
                    value: mode,
                  }))}
                  style={{ minWidth: 100 }}
                />
              ) : (
                <Radio.Group
                  value={previewMode}
                  onChange={(e) => setPreviewMode(e.target.value as PreviewService)}
                  optionType="button"
                  buttonStyle="solid"
                >
                  {enabledModes.map((mode) => (
                    <Radio.Button key={mode} value={mode}>
                      {mode === 'microsoft' ? '微软在线预览' : mode === 'kkfileview' ? 'kkFileView' : mode === 'basemetas' ? 'BaseMetas' : 'File Viewer'}
                    </Radio.Button>
                  ))}
                </Radio.Group>
              )
            )}

            {hasPagination && (
              <Space size={isMobileViewport ? 4 : 'middle'}>
                <Button
                  size={isMobileViewport ? 'small' : 'middle'}
                  icon={<LeftOutlined />}
                  disabled={index! <= 0}
                  onClick={() => onSwitchIndex && onSwitchIndex(index! - 1)}
                />
                <Typography.Text type="secondary" style={{ fontSize: isMobileViewport ? 12 : 13 }}>
                  {currentDisplayIndex} / {totalDisplayCount}
                </Typography.Text>
                <Button
                  size={isMobileViewport ? 'small' : 'middle'}
                  icon={<RightOutlined />}
                  disabled={index! >= list!.length - 1}
                  onClick={() => onSwitchIndex && onSwitchIndex(index! + 1)}
                />
              </Space>
            )}
          </Space>

          <Space size={isMobileViewport ? 4 : 'middle'} style={{ flexWrap: 'wrap' }}>

            {kkfileviewConfig.enableOpenInNewWindow !== false && (
              isMobileViewport ? (
                <Tooltip title={t('Open in new window')}>
                  <Button
                    size="small"
                    icon={<ExportOutlined />}
                    onClick={handleOpenNewWindow}
                    disabled={unsupportedFile || !effectivePreviewUrl}
                  />
                </Tooltip>
              ) : (
                <Button icon={<ExportOutlined />} onClick={handleOpenNewWindow} disabled={unsupportedFile || !effectivePreviewUrl}>
                  {t('Open in new window')}
                </Button>
              )
            )}
            {canSeeCopyEmbedButton && (
              isMobileViewport ? (
                <Tooltip title={t('Copy Embed HTML')}>
                  <Button
                    size="small"
                    icon={<CodeOutlined />}
                    onClick={openEmbedConfigModal}
                    disabled={unsupportedFile || !resolvedPreviewUrl}
                  />
                </Tooltip>
              ) : (
                <Button icon={<CodeOutlined />} onClick={openEmbedConfigModal} disabled={unsupportedFile || !resolvedPreviewUrl}>
                  {t('Copy Embed HTML')}
                </Button>
              )
            )}
            {kkfileviewConfig.enableFullscreenButton !== false && (
              isMobileViewport ? (
                <Tooltip title={isPreviewFullscreen ? t('Exit Fullscreen') : t('Fullscreen')}>
                  <Button
                    size="small"
                    icon={isPreviewFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                    onClick={handleToggleFullscreen}
                  />
                </Tooltip>
              ) : (
                <Button icon={isPreviewFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />} onClick={handleToggleFullscreen}>
                  {isPreviewFullscreen ? t('Exit Fullscreen') : t('Fullscreen')}
                </Button>
              )
            )}
            {kkfileviewConfig.enableDownload !== false && (
              <Button
                type="primary"
                size={isMobileViewport ? 'small' : 'middle'}
                icon={<DownloadOutlined />}
                onClick={handleDownload}
                disabled={!fileMeta.fullUrl}
              >
                {t('Download')}
              </Button>
            )}
            <Button size={isMobileViewport ? 'small' : 'middle'} onClick={handleClose}>
              {t('Close')}
            </Button>
          </Space>
        </div>
      </Modal>

      <Modal
        title={t('Configure Embed HTML')}
        open={embedConfigVisible}
        onOk={handleConfirmCopyEmbedHtml}
        onCancel={() => setEmbedConfigVisible(false)}
        confirmLoading={copyingEmbedHtml}
        destroyOnClose
      >
        <Form layout="vertical" initialValues={embedConfigDraft}>
          <Form.Item label={t('Width')}>
            <Input value={embedConfigDraft.width} onChange={(e) => setEmbedConfigDraft((prev) => ({ ...prev, width: e.target.value }))} placeholder="100%" />
          </Form.Item>
          <Form.Item label={t('Height')}>
            <Input value={embedConfigDraft.height} onChange={(e) => setEmbedConfigDraft((prev) => ({ ...prev, height: e.target.value }))} placeholder="100%" />
          </Form.Item>
          <Form.Item label={t('Border')}>
            <Select
              value={embedConfigDraft.frameBorder}
              onChange={(value) => setEmbedConfigDraft((prev) => ({ ...prev, frameBorder: value }))}
              options={[
                { label: t('No Border'), value: '0' },
                { label: t('Show Border'), value: '1' },
              ]}
            />
          </Form.Item>
          <Form.Item label={t('Allow Fullscreen')} valuePropName="checked">
            <Switch checked={embedConfigDraft.allowFullScreen} onChange={(checked) => setEmbedConfigDraft((prev) => ({ ...prev, allowFullScreen: checked }))} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAPIClient, useCurrentUserContext } from '@nocobase/client';
import { Modal, Button, Space, Typography, Radio, message, Input, Form, Select, Switch, Spin } from 'antd';
import { CloseOutlined, LeftOutlined, RightOutlined, PrinterOutlined, FullscreenOutlined, FullscreenExitOutlined } from '@ant-design/icons';
import { saveAs } from 'file-saver';
import { Base64 } from 'js-base64';
import { useT } from './locale';
import { decidePreviewMode, getFileExt, parseExtensions } from './previewUtils';
import {
  EmbedCodePermission,
  PREVIEW_SERVICE_REGISTRY,
  PreviewEngine,
  PreviewService,
} from './configCache';
import { useKkfileviewConfig } from './useKkfileviewConfig';
import { resolveWatermarkTemplate } from './watermarkTemplate';
import { DEFAULT_EXTENSIONS, DEFAULT_MICROSOFT_EXTENSIONS } from '../shared/constants';

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/** 对字符串做 HTML 实体转义，防止 XSS（用于 document.write 场景） */
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

/** 判断文件是否为图片 */
function isImageFile(url: string = '') {
  return /\.(jpeg|jpg|gif|png|webp|svg)$/i.test(url);
}

/** 判断文件是否为 PDF */
function isPdfFile(url: string = '', extname: string = '') {
  const ext = extname.replace(/^\./, '').toLowerCase();
  if (ext === 'pdf') return true;
  return /\.pdf$/i.test(url);
}

/** 获取完整的文件 URL */
function getFullUrl(url: string = '', fallbackHost: string = '') {
  const normalized = url.trim().replace(/[,\uFF0C\s]+$/g, '');
  if (normalized.startsWith('http://') || normalized.startsWith('https://') || normalized.startsWith('ftp://')) return normalized;
  let host = fallbackHost || location.origin;
  host = host.replace(/\/$/, '');
  return `${host}/${normalized.replace(/^\//, '')}`;
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

function openPopupWindow(url: string, features: string = '') {
  const popup = window.open(url, '_blank', features ? `${features},noopener,noreferrer` : 'noopener,noreferrer');
  if (popup) {
    try {
      popup.opener = null;
    } catch {
    }
  }
  return popup;
}

/** 在临时窗口中打印图片 */
function printImage(src: string, title: string) {
  const safeTitle = escapeHtml(title);
  const w = openPopupWindow('', 'width=800,height=600');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>${safeTitle}</title>
    <style>*{margin:0;padding:0}body{display:flex;justify-content:center;align-items:center;min-height:100vh}
    img{max-width:100%;max-height:100vh;object-fit:contain}@media print{body{height:100vh}}</style>
    </head><body><img src="${src}" onload="window.focus();window.print();setTimeout(()=>window.close(),300);" /></body></html>`);
  w.document.close();
}

/** 在临时 iframe 中打印 PDF（同源有效；跨域降级为新窗口） */
function printPdf(src: string) {
  try {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;';
    iframe.src = src;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        openPopupWindow(src);
      }
      setTimeout(() => document.body.removeChild(iframe), 2000);
    };
  } catch {
    openPopupWindow(src);
  }
}

/** 在临时弹窗中内嵌 iframe 并在加载完毕后自动触发打印（适用于跨域内容）*/
function printViaPopup(src: string, title: string) {
  const safeTitle = escapeHtml(title);
  // 使用 A4 宽度（794px @ 96dpi）以贴近打印纸张尺寸
  const w = openPopupWindow('', 'width=794,height=1123,left=0,top=0');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>${safeTitle}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 100%; height: 100%; overflow: hidden; }
      iframe { width: 100%; height: 100vh; border: none; display: block; }
      @page { size: auto; margin: 0; }
      @media print {
        html, body { width: 100%; height: auto; overflow: visible; }
        iframe { width: 100%; height: 100vh; }
      }
    </style>
    </head><body>
    <iframe src="${src}" onload="window.focus();window.print();"></iframe>
    </body></html>`);
  w.document.close();
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
  isSuperAdmin?: boolean;
  isSystemAdmin?: boolean;
  roles?: RoleEntity[];
};

type PreviewFileRecord = {
  url?: string;
  extname?: string;
  title?: string;
  name?: string;
  filename?: string;
  originalname?: string;
};

type PreviewerProps = {
  index?: number | null;
  list?: PreviewFileRecord[];
  file?: PreviewFileRecord;
  onSwitchIndex?: (nextIndex: number | null) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
};

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

// ---------------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------------

export const KKFilePreviewer = (props: PreviewerProps) => {
  const { index, list, file: directFile, onSwitchIndex, open, onOpenChange, onClose } = props;
  const file = directFile || (typeof index === 'number' ? list?.[index] : undefined);
  const isOpen = typeof open === 'boolean' ? open : index !== null && index !== undefined;
  const t = useT();
  const api = useAPIClient();
  const fileDisplayTitle = useMemo(() => resolveFileDisplayTitle(file), [file?.title, file?.name, file?.filename, file?.originalname, file?.url]);

  // #3 优化：直接读取全局配置缓存，不再每次触发 useRequest
  const { config: kkfileviewConfig, ready: configReady } = useKkfileviewConfig();

  const serviceConfigMap = useMemo(
    () =>
      PREVIEW_SERVICE_REGISTRY.reduce((acc, service) => {
        const hostFallback =
          service.key === 'kkfileview'
            ? kkfileviewConfig.kkfileviewHost
            : service.key === 'basemetas'
            ? kkfileviewConfig.basemetasHost
            : kkfileviewConfig.microsoftHost;
        const extensionsFallback =
          service.key === 'microsoft' ? DEFAULT_MICROSOFT_EXTENSIONS : DEFAULT_EXTENSIONS;
        const enabledFallback = kkfileviewConfig[service.enabledField] ?? (service.key === 'kkfileview' ? true : service.key === 'basemetas' ? false : true);

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
      kkfileviewConfig.enableKkfileview,
      kkfileviewConfig.enableBasemetas,
      kkfileviewConfig.enableMicrosoft,
      kkfileviewConfig.kkfileviewExtensions,
      kkfileviewConfig.basemetasExtensions,
      kkfileviewConfig.microsoftExtensions,
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

  const currentUserContext = useCurrentUserContext();
  const currentUser = (currentUserContext?.data?.data || currentUserContext?.data || null) as CurrentUserLike | null;

  const requestedAtRef = useRef<Date>(new Date());

  const fileMeta = useMemo(() => {
    const fullUrl = file?.url ? getFullUrl(file.url, kkfileviewConfig.nocobaseHost) : '';
    const isImg = isImageFile(file?.url || '');
    const isPdf = isPdfFile(file?.url || '', file?.extname || '');
    const ext = getFileExt(file?.url || '', file?.extname || '');
    return { fullUrl, isImg, isPdf, ext };
  }, [file?.url, file?.extname, kkfileviewConfig.nocobaseHost]);

  // #4 优化：移除多余的 fileMeta.fullUrl 依赖
  const watermarkText = useMemo(
    () => resolveWatermarkTemplate(kkfileviewConfig.watermark || '', { user: currentUser, requestedAt: requestedAtRef.current }).trim(),
    [kkfileviewConfig.watermark, currentUser]
  );

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

  const previewUrlMap = useMemo(
    () =>
      PREVIEW_SERVICE_REGISTRY.reduce((acc, service) => {
        if (!fileMeta.fullUrl) {
          acc[service.key] = '';
          return acc;
        }
        if (service.key === 'kkfileview') {
          const baseUrl = `${serviceConfigMap.kkfileview.host.replace(/\/$/, '')}/onlinePreview`;
          const encodedUrl = encodeURIComponent(btoa(unescape(encodeURIComponent(fileMeta.fullUrl))));
          let previewUrl = `${baseUrl}?url=${encodedUrl}`;
          if (watermarkText && kkfileviewConfig.watermarkType === 'preview') {
            previewUrl += `&watermarkTxt=${encodeURIComponent(watermarkText)}`;
          }
          acc[service.key] = previewUrl;
          return acc;
        }
        if (service.key === 'basemetas') {
          const baseUrl = `${serviceConfigMap.basemetas.host.replace(/\/$/, '')}/preview/view`;
          const url = encodeURIComponent(fileMeta.fullUrl);
          const inferredExt = fileMeta.ext ? `.${fileMeta.ext}` : '';
          const ensureExt = (name: string) => {
            if (!inferredExt) return name;
            return name.toLowerCase().endsWith(inferredExt.toLowerCase()) ? name : `${name}${inferredExt}`;
          };
          const rawFileName = file?.name || fileDisplayTitle || 'file';
          const normalizedFileName = ensureExt(rawFileName);
          const rawDisplayName = file?.title || fileDisplayTitle || normalizedFileName;
          const normalizedDisplayName = ensureExt(rawDisplayName);
          const fileName = encodeURIComponent(normalizedFileName);
          const displayName = encodeURIComponent(normalizedDisplayName);
          let previewUrl = '';
          if (kkfileviewConfig.basemetasRequestType === 'base64') {
            const encodedData = encodeURIComponent(Base64.encode(JSON.stringify({
              url: fileMeta.fullUrl,
              fileName: normalizedFileName,
              displayName: normalizedDisplayName,
            })));
            previewUrl = `${baseUrl}?data=${encodedData}`;
          } else {
            previewUrl = `${baseUrl}?url=${url}&fileName=${fileName}&displayName=${displayName}`;
          }
          if (watermarkText && kkfileviewConfig.watermarkType === 'preview') {
            previewUrl += `&watermark=${encodeURIComponent(watermarkText)}`;
            previewUrl += `&watermarkTxt=${encodeURIComponent(watermarkText)}`;
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
    [fileMeta.fullUrl, fileMeta.ext, serviceConfigMap, watermarkText, file?.name, file?.title, fileDisplayTitle, kkfileviewConfig.basemetasRequestType, kkfileviewConfig.watermarkType]
  );

  const resolvedPreviewUrl = useMemo(() => {
    if (fileMeta.isImg) return fileMeta.fullUrl;
    if (previewMode) return previewUrlMap[previewMode] || (fileMeta.isPdf ? fileMeta.fullUrl : '');
    return fileMeta.isPdf ? fileMeta.fullUrl : '';
  }, [fileMeta, previewMode, previewUrlMap]);

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
  const iframeLoadedRef = useRef(false);
  const [embedConfigVisible, setEmbedConfigVisible] = useState(false);
  const [embedConfig, setEmbedConfig] = useState<EmbedHtmlConfig>(DEFAULT_EMBED_HTML_CONFIG);
  const [embedConfigDraft, setEmbedConfigDraft] = useState<EmbedHtmlConfig>(DEFAULT_EMBED_HTML_CONFIG);
  const [copyingEmbedHtml, setCopyingEmbedHtml] = useState(false);
  const lastPreviewLogSignatureRef = useRef('');
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);
  const [fullscreenViewportSize, setFullscreenViewportSize] = useState<FullscreenViewportSize>({ width: 0, height: 0 });
  const autoMobileFullscreenSignatureRef = useRef('');
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
    const shouldWatchIframe = !unsupportedFile && !fileMeta.isImg && Boolean(resolvedPreviewUrl);
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
  const showKkfileviewLoading = previewMode === 'kkfileview' && iframeLoading && !iframeLoadFailed && !!resolvedPreviewUrl;

  /** 智能打印处理 */
  const handlePrint = useCallback(() => {
    if (!file?.url) return;
    if (unsupportedFile) return;
    if (fileMeta.isImg) {
      printImage(fileMeta.fullUrl, fileDisplayTitle || 'Image');
    } else if (fileMeta.isPdf) {
      printPdf(fileMeta.fullUrl);
    } else if (previewMode && resolvedPreviewUrl) {
      printViaPopup(resolvedPreviewUrl, fileDisplayTitle || 'Document');
    } else {
      printViaPopup(fileMeta.fullUrl, fileDisplayTitle || 'Document');
    }
  }, [file, previewMode, fileMeta, resolvedPreviewUrl, unsupportedFile, fileDisplayTitle]);

  const handleOpenNewWindow = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (unsupportedFile) return;
    if (!resolvedPreviewUrl) return;
    openPopupWindow(resolvedPreviewUrl);
  }, [resolvedPreviewUrl, unsupportedFile]);

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
    document.addEventListener('fullscreenchange', updateFullscreenState);
    document.addEventListener('webkitfullscreenchange', updateFullscreenState as EventListener);
    document.addEventListener('MSFullscreenChange', updateFullscreenState as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreenState);
      document.removeEventListener('webkitfullscreenchange', updateFullscreenState as EventListener);
      document.removeEventListener('MSFullscreenChange', updateFullscreenState as EventListener);
    };
  }, []);

  const handleToggleFullscreen = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (unsupportedFile) return;
    if (!resolvedPreviewUrl) return;
    const doc = document as FullscreenCapableDocument;
    const fullscreenElement = getFullscreenElement(doc);
    if (fullscreenElement) {
      await Promise.resolve(
        doc.exitFullscreen?.() ||
        doc.webkitExitFullscreen?.() ||
        doc.msExitFullscreen?.()
      ).catch(() => {
      });
      return;
    }
    const target = previewContainerRef.current as FullscreenCapableElement | null;
    if (!target) return;
    const requestFullscreen =
      target.requestFullscreen ||
      target.webkitRequestFullscreen ||
      target.msRequestFullscreen;
    if (!requestFullscreen) {
      openPopupWindow(resolvedPreviewUrl);
      return;
    }
    await Promise.resolve(requestFullscreen.call(target)).catch(() => {
      openPopupWindow(resolvedPreviewUrl);
    });
  }, [resolvedPreviewUrl, unsupportedFile]);

  const handleExitPreviewFullscreen = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const doc = document as FullscreenCapableDocument;
    const fullscreenElement = getFullscreenElement(doc);
    const target = previewContainerRef.current;
    if (!fullscreenElement || !target) return;
    if (!(fullscreenElement === target || target.contains(fullscreenElement))) return;
    await Promise.resolve(
      doc.exitFullscreen?.() ||
      doc.webkitExitFullscreen?.() ||
      doc.msExitFullscreen?.()
    ).catch(() => {
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      autoMobileFullscreenSignatureRef.current = '';
      return;
    }
    if (kkfileviewConfig.enableMobileAutoFullscreen !== true) return;
    if (!isMobileViewport) return;
    if (unsupportedFile) return;
    if (!resolvedPreviewUrl) return;
    if (isPreviewFullscreen) return;
    const target = previewContainerRef.current as FullscreenCapableElement | null;
    if (!target) return;
    const requestFullscreen =
      target.requestFullscreen ||
      target.webkitRequestFullscreen ||
      target.msRequestFullscreen;
    if (!requestFullscreen) return;
    const signature = `${fileMeta.fullUrl}|${resolvedPreviewUrl}`;
    if (autoMobileFullscreenSignatureRef.current === signature) return;
    autoMobileFullscreenSignatureRef.current = signature;
    window.setTimeout(() => {
      Promise.resolve(requestFullscreen.call(target)).catch(() => {
      });
    }, 0);
  }, [
    isOpen,
    isMobileViewport,
    unsupportedFile,
    resolvedPreviewUrl,
    isPreviewFullscreen,
    fileMeta.fullUrl,
    kkfileviewConfig.enableMobileAutoFullscreen,
  ]);

  const handleDownload = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const downloadUrl = fileMeta.fullUrl;
    if (!downloadUrl) return;
    const extname = typeof file?.extname === 'string' ? file.extname : '';
    try {
      saveAs(downloadUrl, `${fileDisplayTitle}${extname}`);
    } catch {
      openPopupWindow(downloadUrl);
    }
  }, [file, fileMeta.fullUrl, fileDisplayTitle]);

  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
      return;
    }
    if (onOpenChange) {
      onOpenChange(false);
      return;
    }
    if (onSwitchIndex) {
      onSwitchIndex(null);
    }
  }, [onClose, onOpenChange, onSwitchIndex]);

  const shouldShowFullscreenWatermark = kkfileviewConfig.watermarkType === 'global' && !!watermarkText && isPreviewFullscreen;
  const fullscreenWatermarkLayout = useMemo(() => {
    const width = fullscreenViewportSize.width || window.innerWidth || 1440;
    const height = fullscreenViewportSize.height || window.innerHeight || 900;
    const desktopMode = width >= 1024;
    const minCellWidth = desktopMode ? 420 : 220;
    const minCellHeight = desktopMode ? 250 : 150;
    const columns = Math.max(2, Math.floor(width / minCellWidth));
    const rows = Math.max(2, Math.floor(height / minCellHeight));
    const count = columns * rows;
    return {
      desktopMode,
      columns,
      rows,
      count,
      gapX: desktopMode ? 78 : 34,
      gapY: desktopMode ? 52 : 24,
      paddingX: desktopMode ? 44 : 20,
      paddingY: desktopMode ? 30 : 16,
      fontSize: desktopMode ? 'clamp(13px, 1vw, 17px)' : 'clamp(12px, 3vw, 16px)',
      rotateDeg: desktopMode ? -16 : -22,
      opacity: desktopMode ? 0.12 : 0.14,
    };
  }, [fullscreenViewportSize.width, fullscreenViewportSize.height]);

  if (!file) return null;
  // 配置未就绪时不渲染内容（等待全局缓存加载完成）
  if (!configReady) return null;

  return (
    <Modal
      open={isOpen}
      closable={false}
      title={null}
      onCancel={handleClose}
      style={useMobileFullscreenLayout ? { top: 0, maxWidth: '100vw', paddingBottom: 0 } : undefined}
      footer={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minHeight: 32, display: 'flex', alignItems: 'center', minWidth: 220, flex: '1 1 320px' }}>
              {!servicePreviewDisabled && (
                <Radio.Group value={previewMode} onChange={e => setPreviewMode(e.target.value as PreviewService)} size="small" optionType="button" buttonStyle="solid">
                  {PREVIEW_SERVICE_REGISTRY.map((service) => {
                    if (!enabledModes.includes(service.key)) return null;
                    if (!modeSupportedMap[service.key]) return null;
                    return (
                      <Radio.Button key={service.key} value={service.key}>
                        {t(service.title)}
                      </Radio.Button>
                    );
                  })}
                </Radio.Group>
              )}
            </div>
            {hasPagination && onSwitchIndex ? (
              <Space style={{ flex: '0 0 auto' }}>
                <Button size="small" type="text" icon={<LeftOutlined />} disabled={index === 0} onClick={() => onSwitchIndex(index - 1)} />
                <span style={{ color: '#999', fontSize: '13px' }}>{currentDisplayIndex} / {totalDisplayCount}</span>
                <Button size="small" type="text" icon={<RightOutlined />} disabled={index >= list.length - 1} onClick={() => onSwitchIndex(index + 1)} />
              </Space>
            ) : <div />}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', flex: '1 1 320px' }}>
              {kkfileviewConfig.enablePrint ? (
                <Button key="print" icon={<PrinterOutlined />} onClick={handlePrint}>
                  {t('Print')}
                </Button>
              ) : null}
              {kkfileviewConfig.enableFullscreenButton !== false ? (
                <Button key="fullscreen" icon={<FullscreenOutlined />} onClick={handleToggleFullscreen} disabled={unsupportedFile || !resolvedPreviewUrl}>
                  {t('Fullscreen Preview')}
                </Button>
              ) : null}
              {canSeeCopyEmbedButton ? (
                <Button key="copy-embed-html" onClick={openEmbedConfigModal} disabled={unsupportedFile || !resolvedPreviewUrl}>
                  {t('Copy Embed HTML')}
                </Button>
              ) : null}
              {kkfileviewConfig.enableOpenInNewWindow !== false ? (
                <Button key="open" onClick={handleOpenNewWindow} disabled={unsupportedFile}>
                  {t('Open in new window')}
                </Button>
              ) : null}
              {kkfileviewConfig.enableDownload !== false ? (
                <Button key="download" onClick={handleDownload}>
                  {t('Download')}
                </Button>
              ) : null}
              <Button key="close" onClick={handleClose}>
                {t('Close')}
              </Button>
            </div>
          </div>
        </div>
      }
      width={useMobileFullscreenLayout ? '100vw' : '85vw'}
      centered={!useMobileFullscreenLayout}
      styles={{ body: { padding: 0 } }}
    >
      <div style={{ maxWidth: '100%', height: useMobileFullscreenLayout ? '100vh' : '90vh', width: '100%', background: 'white', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 顶部标题栏 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
          <Typography.Title level={5} style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '40%' }}>
            {fileDisplayTitle}
          </Typography.Title>
          <div />
          <Button type="text" icon={<CloseOutlined />} onClick={handleClose} />
        </div>

        {/* 预览内容区 */}
        <div ref={previewContainerRef} style={{ flex: '1 1 auto', overflow: 'hidden', backgroundColor: '#f0f2f5', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
          {isPreviewFullscreen ? (
            <Button
              size="small"
              type="text"
              icon={<FullscreenExitOutlined />}
              onClick={handleExitPreviewFullscreen}
              style={{ position: 'absolute', top: 10, right: 10, zIndex: 30, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.35)', color: '#000', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', borderRadius: 14, height: 28, paddingInline: 10 }}
            >
              {t('Exit Fullscreen')}
            </Button>
          ) : null}
          {unsupportedFile ? (
            <Typography.Text type="secondary">{t('Preview not supported for this file type. Please download and view it locally.')}</Typography.Text>
          ) : fileMeta.isImg ? (
            <img src={fileMeta.fullUrl} alt={fileDisplayTitle} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          ) : iframeLoadFailed ? (
            <Space direction="vertical" size={12} style={{ alignItems: 'center' }}>
              <Typography.Text type="secondary">{t('Iframe preview failed. Please open in a new window or download the file.')}</Typography.Text>
              <Space>
                <Button onClick={handleRetryPreview}>{t('Retry Preview')}</Button>
                {kkfileviewConfig.enableOpenInNewWindow !== false ? (
                  <Button type="primary" onClick={handleOpenNewWindow}>{t('Open in new window')}</Button>
                ) : null}
              </Space>
            </Space>
          ) : (
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
              <iframe
                key={`${resolvedPreviewUrl}-${iframeRetrySeed}`}
                src={resolvedPreviewUrl}
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
              {showKkfileviewLoading ? (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.72)' }}>
                  <Space direction="vertical" align="center" size={8}>
                    <Spin size="large" />
                    <Typography.Text type="secondary">{t('kkFileView is loading preview...')}</Typography.Text>
                  </Space>
                </div>
              ) : null}
            </div>
          )}
          {shouldShowFullscreenWatermark ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                zIndex: 20,
                opacity: fullscreenWatermarkLayout.opacity,
                display: 'grid',
                gridTemplateColumns: `repeat(${fullscreenWatermarkLayout.columns}, minmax(0, 1fr))`,
                columnGap: fullscreenWatermarkLayout.gapX,
                rowGap: fullscreenWatermarkLayout.gapY,
                padding: `${fullscreenWatermarkLayout.paddingY}px ${fullscreenWatermarkLayout.paddingX}px`,
                alignContent: 'space-around',
                justifyItems: 'center',
                overflow: 'hidden',
              }}
            >
              {Array.from({ length: fullscreenWatermarkLayout.count }).map((_, idx) => {
                const row = Math.floor(idx / fullscreenWatermarkLayout.columns);
                const col = idx % fullscreenWatermarkLayout.columns;
                const staggerX = row % 2 === 0 ? 0 : 40;
                const staggerY = col % 2 === 0 ? 0 : 10;
                return (
                <span
                  key={`fs-watermark-${idx}`}
                  style={{
                    transform: `translate(${staggerX}px, ${staggerY}px) rotate(${fullscreenWatermarkLayout.rotateDeg}deg)`,
                    color: '#000',
                    fontSize: fullscreenWatermarkLayout.fontSize,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    lineHeight: 1.2,
                    userSelect: 'none',
                    textShadow: fullscreenWatermarkLayout.desktopMode ? '0 0 1px rgba(255,255,255,0.4)' : 'none',
                  }}
                >
                  {watermarkText}
                </span>
                );
              })}
            </div>
          ) : null}
        </div>
        </div>
      <Modal
        open={embedConfigVisible}
        title={t('Configure Embed HTML')}
        onCancel={() => setEmbedConfigVisible(false)}
        onOk={handleConfirmCopyEmbedHtml}
        okText={t('Copy')}
        cancelText={t('Cancel')}
        confirmLoading={copyingEmbedHtml}
        destroyOnClose
      >
        <Form layout="vertical">
          <Form.Item label={t('Embed Width')}>
            <Input
              value={embedConfigDraft.width}
              onChange={(e) => setEmbedConfigDraft((prev) => ({ ...prev, width: e.target.value }))}
              placeholder="100%"
            />
          </Form.Item>
          <Form.Item label={t('Embed Height')}>
            <Input
              value={embedConfigDraft.height}
              onChange={(e) => setEmbedConfigDraft((prev) => ({ ...prev, height: e.target.value }))}
              placeholder="100%"
            />
          </Form.Item>
          <Form.Item label={t('Embed Border')}>
            <Select
              value={embedConfigDraft.frameBorder}
              options={[
                { label: t('No Border'), value: '0' },
                { label: t('Show Border'), value: '1' },
              ]}
              onChange={(value) => setEmbedConfigDraft((prev) => ({ ...prev, frameBorder: value as '0' | '1' }))}
            />
          </Form.Item>
          <Form.Item label={t('Allow Fullscreen')} valuePropName="checked">
            <Switch
              checked={embedConfigDraft.allowFullScreen}
              onChange={(checked) => setEmbedConfigDraft((prev) => ({ ...prev, allowFullScreen: checked }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Modal>
  );
};

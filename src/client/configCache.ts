/**
 * 插件客户端运行时配置缓存
 *
 * 职责：
 * 1. 维护全局 kkfileviewConfig 对象（含默认值）
 * 2. 提供 updateConfigCache() 更新缓存并通知订阅者
 * 3. 提供 subscribeConfig() / notifyConfigUpdated() 支持 React 组件响应式更新
 */
import {
  DEFAULT_EXTENSIONS,
  DEFAULT_MICROSOFT_EXTENSIONS,
  DEFAULT_KKFILEVIEW_HOST,
  DEFAULT_BASEMETAS_HOST,
  DEFAULT_MICROSOFT_HOST,
} from '../shared/constants';
import { parseExtensions } from './previewUtils';

// 重新导出，方便使用方不必关心常量来源
export {
  DEFAULT_EXTENSIONS,
  DEFAULT_MICROSOFT_EXTENSIONS,
  DEFAULT_KKFILEVIEW_HOST,
  DEFAULT_BASEMETAS_HOST,
  DEFAULT_MICROSOFT_HOST,
};

export type PreviewEngine = 'microsoft' | 'kkfileview' | 'basemetas' | 'none';
export type PreviewService = Exclude<PreviewEngine, 'none'>;
export type EmbedCodePermission = 'admin' | 'user' | 'roles';
export type BasemetasRequestType = 'query' | 'base64';
export type KkfileviewConfigRecord = Partial<{
    kkfileviewHost: string;
    basemetasHost: string;
    microsoftHost: string;
    nocobaseHost: string;
    kkfileviewExtensions: string[] | string;
    basemetasExtensions: string[] | string;
    microsoftExtensions: string[] | string;
    enablePrint: boolean;
    enableOpenInNewWindow: boolean;
    enableFullscreenButton: boolean;
    enableMobileAutoFullscreen: boolean;
    enableDownload: boolean;
    basemetasRequestType: BasemetasRequestType | string;
    watermarkType: string;
    watermark: string;
    enableKkfileview: boolean;
    enableBasemetas: boolean;
    enableMicrosoft: boolean;
    preferredPreview: PreviewEngine | string;
    enableCopyEmbedHtml: boolean;
    copyEmbedHtmlPermission: EmbedCodePermission | string;
    copyEmbedHtmlRoles: unknown;
}>;

export const PREVIEW_SERVICE_REGISTRY = [
    {
        key: 'microsoft' as const,
        title: 'Microsoft Online Preview',
        hostField: 'microsoftHost' as const,
        extensionsField: 'microsoftExtensions' as const,
        enabledField: 'enableMicrosoft' as const,
        defaultHost: DEFAULT_MICROSOFT_HOST,
    },
    {
        key: 'kkfileview' as const,
        title: 'kkFileView',
        hostField: 'kkfileviewHost' as const,
        extensionsField: 'kkfileviewExtensions' as const,
        enabledField: 'enableKkfileview' as const,
        defaultHost: DEFAULT_KKFILEVIEW_HOST,
    },
    {
        key: 'basemetas' as const,
        title: 'BaseMetas',
        hostField: 'basemetasHost' as const,
        extensionsField: 'basemetasExtensions' as const,
        enabledField: 'enableBasemetas' as const,
        defaultHost: DEFAULT_BASEMETAS_HOST,
    },
] as const;

export const PREVIEW_SERVICE_KEYS = PREVIEW_SERVICE_REGISTRY.map((item) => item.key) as PreviewService[];

interface KkfileviewConfig {
    kkfileviewHost: string;
    basemetasHost: string;
    microsoftHost: string;
    nocobaseHost: string;
    kkfileviewExtensions: string[];
    basemetasExtensions: string[];
    microsoftExtensions: string[];
    enablePrint: boolean;
    enableOpenInNewWindow: boolean;
    enableFullscreenButton: boolean;
    enableMobileAutoFullscreen: boolean;
    enableDownload: boolean;
    basemetasRequestType: BasemetasRequestType;
    watermarkType: string;
    watermark: string;
    enableKkfileview: boolean;
    enableBasemetas: boolean;
    enableMicrosoft: boolean;
    preferredPreview: PreviewEngine;
    enableCopyEmbedHtml: boolean;
    copyEmbedHtmlPermission: EmbedCodePermission;
    copyEmbedHtmlRoles: string[];
}

export const kkfileviewConfig: KkfileviewConfig = {
    kkfileviewHost: DEFAULT_KKFILEVIEW_HOST,
    basemetasHost: DEFAULT_BASEMETAS_HOST,
    microsoftHost: DEFAULT_MICROSOFT_HOST,
    nocobaseHost: '',
    kkfileviewExtensions: [...DEFAULT_EXTENSIONS],
    basemetasExtensions: [...DEFAULT_EXTENSIONS],
    microsoftExtensions: [...DEFAULT_MICROSOFT_EXTENSIONS],
    enablePrint: false,
    enableOpenInNewWindow: true,
    enableFullscreenButton: true,
    enableMobileAutoFullscreen: false,
    enableDownload: true,
    basemetasRequestType: 'query',
    watermarkType: 'preview',
    watermark: '',
    enableKkfileview: true,
    enableBasemetas: false,
    enableMicrosoft: true,
    preferredPreview: 'microsoft',
    enableCopyEmbedHtml: true,
    copyEmbedHtmlPermission: 'user',
    copyEmbedHtmlRoles: [],
};

function parseRoleList(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map((item) => String(item || '').trim()).filter(Boolean);
    }
    const text = String(value || '').trim();
    if (!text) return [];
    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
            return parsed.map((item) => String(item || '').trim()).filter(Boolean);
        }
    } catch {
    }
    return text.split(/[,，;；\s]+/).map((item) => item.trim()).filter(Boolean);
}

function isEmbedCodePermission(value: unknown): value is EmbedCodePermission {
    return value === 'admin' || value === 'user' || value === 'roles';
}

function isPreviewEngine(value: unknown): value is PreviewEngine {
    return value === 'microsoft' || value === 'kkfileview' || value === 'basemetas' || value === 'none';
}

// ---------------------------------------------------------------------------
// 订阅机制：config 更新后通知 React 组件重新渲染（避免在组件内重复请求接口）
// ---------------------------------------------------------------------------

/** 是否已从服务端加载过真实配置（区别于仅使用默认值） */
export let configReady = false;

type ConfigListener = () => void;
const configListeners = new Set<ConfigListener>();

/** 订阅配置更新事件，返回取消订阅的函数 */
export function subscribeConfig(fn: ConfigListener): () => void {
    configListeners.add(fn);
    return () => configListeners.delete(fn);
}

/** 通知所有订阅者（在 updateConfigCache 结束后自动调用） */
export function notifyConfigUpdated(): void {
    configListeners.forEach((fn) => fn());
}

// ---------------------------------------------------------------------------
// 配置更新
// ---------------------------------------------------------------------------

export function updateConfigCache(record?: KkfileviewConfigRecord | null) {
    if (!record) return;
    if (record.kkfileviewHost) kkfileviewConfig.kkfileviewHost = record.kkfileviewHost;
    if (record.basemetasHost) kkfileviewConfig.basemetasHost = record.basemetasHost;
    if (record.microsoftHost) kkfileviewConfig.microsoftHost = record.microsoftHost;
    if (record.nocobaseHost !== undefined) kkfileviewConfig.nocobaseHost = record.nocobaseHost;
    kkfileviewConfig.kkfileviewExtensions = parseExtensions(record.kkfileviewExtensions, DEFAULT_EXTENSIONS);
    kkfileviewConfig.basemetasExtensions = parseExtensions(record.basemetasExtensions, DEFAULT_EXTENSIONS);
    kkfileviewConfig.microsoftExtensions = parseExtensions(record.microsoftExtensions, DEFAULT_MICROSOFT_EXTENSIONS);
    kkfileviewConfig.enablePrint = record.enablePrint === true;
    kkfileviewConfig.enableOpenInNewWindow = record.enableOpenInNewWindow ?? true;
    kkfileviewConfig.enableFullscreenButton = record.enableFullscreenButton ?? true;
    kkfileviewConfig.enableMobileAutoFullscreen = record.enableMobileAutoFullscreen === true;
    kkfileviewConfig.enableDownload = record.enableDownload ?? true;
    kkfileviewConfig.basemetasRequestType = record.basemetasRequestType === 'base64' ? 'base64' : 'query';
    kkfileviewConfig.watermarkType = record.watermarkType || 'preview';
    kkfileviewConfig.watermark = record.watermark || '';
    kkfileviewConfig.enableKkfileview = record.enableKkfileview ?? true;
    kkfileviewConfig.enableBasemetas = record.enableBasemetas ?? false;
    kkfileviewConfig.enableMicrosoft = record.enableMicrosoft ?? true;
    kkfileviewConfig.enableCopyEmbedHtml = record.enableCopyEmbedHtml ?? true;
    kkfileviewConfig.copyEmbedHtmlPermission = isEmbedCodePermission(record.copyEmbedHtmlPermission)
        ? record.copyEmbedHtmlPermission
        : 'user';
    kkfileviewConfig.copyEmbedHtmlRoles = parseRoleList(record.copyEmbedHtmlRoles);

    const preferredPreview = record.preferredPreview || 'microsoft';
    kkfileviewConfig.preferredPreview = isPreviewEngine(preferredPreview)
        ? preferredPreview
        : 'microsoft';

    // 标记配置已就绪，并通知所有订阅者
    configReady = true;
    notifyConfigUpdated();
}

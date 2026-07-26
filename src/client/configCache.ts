/**
 * 插件客户端运行时配置缓存
 *
 * 职责：
 * 1. 维护全局 kkfileviewConfig 对象（含默认值）
 * 2. 提供 updateConfigCache() 更新缓存并通知订阅者
 * 3. 提供 subscribeConfig() / notifyConfigUpdated() 支持 React 组件响应式更新
 */
import {
  DEFAULT_EXTENSIONS, // 引入通用默认扩展名列表。
  DEFAULT_FILE_VIEWER_ASSET_BASE, // 引入 File Viewer 资源基础路径默认值。
  DEFAULT_FILE_VIEWER_EXTENSIONS, // 引入 File Viewer 默认扩展名列表。
  DEFAULT_MICROSOFT_EXTENSIONS, // 引入微软预览默认扩展名列表。
  DEFAULT_KKFILEVIEW_HOST, // 引入 kkFileView 默认主机地址。
  DEFAULT_BASEMETAS_HOST, // 引入 BaseMetas 默认主机地址。
  DEFAULT_MICROSOFT_HOST, // 引入微软预览默认主机地址。
} from '../shared/constants'; // 从共享常量模块导入默认配置。
import { parseExtensions } from './previewUtils';

// 重新导出，方便使用方不必关心常量来源
export {
  DEFAULT_EXTENSIONS, // 重新导出通用默认扩展名列表。
  DEFAULT_FILE_VIEWER_ASSET_BASE, // 重新导出 File Viewer 资源基础路径默认值。
  DEFAULT_FILE_VIEWER_EXTENSIONS, // 重新导出 File Viewer 默认扩展名列表。
  DEFAULT_MICROSOFT_EXTENSIONS, // 重新导出微软预览默认扩展名列表。
  DEFAULT_KKFILEVIEW_HOST, // 重新导出 kkFileView 默认主机地址。
  DEFAULT_BASEMETAS_HOST, // 重新导出 BaseMetas 默认主机地址。
  DEFAULT_MICROSOFT_HOST, // 重新导出微软预览默认主机地址。
}; // 结束共享默认常量的重新导出。

export type PreviewEngine = 'microsoft' | 'kkfileview' | 'basemetas' | 'fileViewer' | 'none'; // 定义包含 fileViewer 在内的预览引擎类型。
export type PreviewService = Exclude<PreviewEngine, 'none'>;
export type EmbedCodePermission = 'admin' | 'user' | 'roles';
export type BasemetasRequestType = 'query' | 'base64';
export type KkfileviewConfigRecord = Partial<{
    kkfileviewHost: string;
    basemetasHost: string;
    microsoftHost: string;
    fileViewerAssetBase: string; // 声明 File Viewer 资源基础路径字段。
    nocobaseHost: string;
    kkfileviewExtensions: string[] | string;
    basemetasExtensions: string[] | string;
    microsoftExtensions: string[] | string;
    fileViewerExtensions: string[] | string; // 声明 File Viewer 扩展名字段。
    enableOpenInNewWindow: boolean;
    enableFullscreenButton: boolean;
    enableMobileAutoFullscreen: boolean;
    enableDownload: boolean;
    fileViewerLoadMode: 'cdn' | 'proxy';
    basemetasRequestType: BasemetasRequestType | string;
    watermarkType: string;
    watermark: string;
    enableKkfileview: boolean;
    enableBasemetas: boolean;
    enableMicrosoft: boolean;
    enableFileViewer: boolean; // 声明 File Viewer 启用状态字段。
    preferredPreview: PreviewEngine | string;
    enableCopyEmbedHtml: boolean;
    copyEmbedHtmlPermission: EmbedCodePermission | string;
    copyEmbedHtmlRoles: unknown;
    fileViewerDownloaded: boolean;
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
    {
        key: 'fileViewer' as const, // 注册第四个预览服务键名为 fileViewer。
        title: 'File Viewer', // 定义第四个预览服务标题。
        hostField: 'fileViewerAssetBase' as const, // 声明第四个预览服务的资源基础路径字段。
        extensionsField: 'fileViewerExtensions' as const, // 声明第四个预览服务的扩展名字段。
        enabledField: 'enableFileViewer' as const, // 声明第四个预览服务的启用字段。
        defaultHost: DEFAULT_FILE_VIEWER_ASSET_BASE, // 指定第四个预览服务的默认资源基础路径。
    }, // 结束第四个预览服务注册项定义。
] as const;

export const PREVIEW_SERVICE_KEYS = PREVIEW_SERVICE_REGISTRY.map((item) => item.key) as PreviewService[];

interface KkfileviewConfig {
    kkfileviewHost: string;
    basemetasHost: string;
    microsoftHost: string;
    fileViewerAssetBase: string; // 声明缓存中的 File Viewer 资源基础路径字段。
    nocobaseHost: string;
    kkfileviewExtensions: string[];
    basemetasExtensions: string[];
    microsoftExtensions: string[];
    fileViewerExtensions: string[]; // 声明缓存中的 File Viewer 扩展名字段。
    enableOpenInNewWindow: boolean;
    enableFullscreenButton: boolean;
    enableMobileAutoFullscreen: boolean;
    enableDownload: boolean;
    fileViewerLoadMode: 'cdn' | 'proxy';
    basemetasRequestType: BasemetasRequestType;
    watermarkType: string;
    watermark: string;
    enableKkfileview: boolean;
    enableBasemetas: boolean;
    enableMicrosoft: boolean;
    enableFileViewer: boolean; // 声明缓存中的 File Viewer 启用状态字段。
    preferredPreview: PreviewEngine;
    enableCopyEmbedHtml: boolean;
    copyEmbedHtmlPermission: EmbedCodePermission;
    copyEmbedHtmlRoles: string[];
    fileViewerDownloaded: boolean;
}

export const kkfileviewConfig: KkfileviewConfig = {
    kkfileviewHost: DEFAULT_KKFILEVIEW_HOST,
    basemetasHost: DEFAULT_BASEMETAS_HOST,
    microsoftHost: DEFAULT_MICROSOFT_HOST,
    fileViewerAssetBase: DEFAULT_FILE_VIEWER_ASSET_BASE, // 设置 File Viewer 资源基础路径默认值。
    nocobaseHost: '',
    kkfileviewExtensions: [...DEFAULT_EXTENSIONS],
    basemetasExtensions: [...DEFAULT_EXTENSIONS],
    microsoftExtensions: [...DEFAULT_MICROSOFT_EXTENSIONS],
    fileViewerExtensions: [...DEFAULT_FILE_VIEWER_EXTENSIONS], // 设置 File Viewer 默认支持扩展名列表。
    enableOpenInNewWindow: true,
    enableFullscreenButton: true,
    enableMobileAutoFullscreen: false,
    enableDownload: true,
    fileViewerLoadMode: 'proxy',
    basemetasRequestType: 'query',
    watermarkType: 'preview',
    watermark: '',
    enableKkfileview: true,
    enableBasemetas: false,
    enableMicrosoft: true,
    enableFileViewer: false, // 设置 File Viewer 默认关闭。
    preferredPreview: 'microsoft',
    enableCopyEmbedHtml: true,
    copyEmbedHtmlPermission: 'user',
    copyEmbedHtmlRoles: [],
    fileViewerDownloaded: false,
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

function isPreviewEngine(value: unknown): value is PreviewEngine { // 校验传入值是否属于受支持的预览引擎。
    return value === 'microsoft' || value === 'kkfileview' || value === 'basemetas' || value === 'fileViewer' || value === 'none'; // 允许 fileViewer 作为合法预览引擎值。
} // 结束预览引擎类型守卫定义。

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
    if (record.fileViewerAssetBase !== undefined) kkfileviewConfig.fileViewerAssetBase = String(record.fileViewerAssetBase || '').trim(); // 同步更新 File Viewer 资源基础路径。
    if (record.nocobaseHost !== undefined) kkfileviewConfig.nocobaseHost = record.nocobaseHost;
    kkfileviewConfig.kkfileviewExtensions = parseExtensions(record.kkfileviewExtensions, DEFAULT_EXTENSIONS);
    kkfileviewConfig.basemetasExtensions = parseExtensions(record.basemetasExtensions, DEFAULT_EXTENSIONS);
    kkfileviewConfig.microsoftExtensions = parseExtensions(record.microsoftExtensions, DEFAULT_MICROSOFT_EXTENSIONS);
    kkfileviewConfig.fileViewerExtensions = parseExtensions(record.fileViewerExtensions, DEFAULT_FILE_VIEWER_EXTENSIONS); // 解析并更新 File Viewer 扩展名列表。
    kkfileviewConfig.enableOpenInNewWindow = record.enableOpenInNewWindow ?? true;
    kkfileviewConfig.enableFullscreenButton = record.enableFullscreenButton ?? true;
    kkfileviewConfig.enableMobileAutoFullscreen = record.enableMobileAutoFullscreen === true;
    kkfileviewConfig.enableDownload = record.enableDownload ?? true;
    kkfileviewConfig.fileViewerLoadMode = record.fileViewerLoadMode === 'cdn' ? 'cdn' : 'proxy';
    kkfileviewConfig.basemetasRequestType = record.basemetasRequestType === 'base64' ? 'base64' : 'query';
    kkfileviewConfig.watermarkType = record.watermarkType || 'preview';
    kkfileviewConfig.watermark = record.watermark || '';
    kkfileviewConfig.enableKkfileview = record.enableKkfileview ?? true;
    kkfileviewConfig.enableBasemetas = record.enableBasemetas ?? false;
    kkfileviewConfig.enableMicrosoft = record.enableMicrosoft ?? true;
    kkfileviewConfig.enableFileViewer = record.enableFileViewer === true; // 同步更新 File Viewer 是否启用。
    kkfileviewConfig.enableCopyEmbedHtml = record.enableCopyEmbedHtml ?? true;
    kkfileviewConfig.copyEmbedHtmlPermission = isEmbedCodePermission(record.copyEmbedHtmlPermission)
        ? record.copyEmbedHtmlPermission
        : 'user';
    kkfileviewConfig.copyEmbedHtmlRoles = parseRoleList(record.copyEmbedHtmlRoles);
    kkfileviewConfig.fileViewerDownloaded = record.fileViewerDownloaded === true;

    const preferredPreview = record.preferredPreview || 'microsoft';
    kkfileviewConfig.preferredPreview = isPreviewEngine(preferredPreview)
        ? preferredPreview
        : 'microsoft';

    // 标记配置已就绪，并通知所有订阅者
    configReady = true;
    notifyConfigUpdated();
}

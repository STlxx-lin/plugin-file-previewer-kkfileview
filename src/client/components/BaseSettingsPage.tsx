/**
 * @jsxRuntime classic
 * 旧版 `/admin` 入口强制使用 classic JSX runtime，避免开发态 `jsx-dev-runtime` 与旧后台 React 加载链路冲突。
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Form, message } from 'antd';
import { ClientAdapters } from './adapter';
import {
    DEFAULT_EXTENSIONS,
    DEFAULT_FILE_VIEWER_ASSET_BASE,
    DEFAULT_FILE_VIEWER_EXTENSIONS,
    DEFAULT_MICROSOFT_EXTENSIONS,
    DEFAULT_BASEMETAS_HOST,
    DEFAULT_KKFILEVIEW_HOST,
    DEFAULT_MICROSOFT_HOST,
    PREVIEW_SERVICE_REGISTRY,
    PreviewEngine,
    PreviewService,
    updateConfigCache,
} from '../configCache';
import { buildFileViewerFormState, buildFileViewerSaveState, buildWatermarkSaveState } from '../settingsPayload';
import { parseExtensions, parseExtensionsInput, unwrapDataArray } from '../previewUtils';
import {
    AdvancedSettingsCard,
    BasicSettingsCard,
    FieldCleanupCard,
    ModificationRecordItem,
    ModificationRecordsCard,
    PreviewRecordItem,
    PreviewRecordsCard,
    SettingsActivePanel,
    SettingsToolbar,
    SettingsWizard,
    DownloadProgressState,
} from '../settingsSections';

const WIZARD_DISMISSED_KEY = 'kkfileview.setup.wizard.dismissed';

type KkfileviewSettingsRecord = {
    id?: number | string;
    kkfileviewHost?: string;
    basemetasHost?: string;
    microsoftHost?: string;
    fileViewerAssetBase?: string;
    nocobaseHost?: string;
    kkfileviewExtensions?: string | string[];
    basemetasExtensions?: string | string[];
    microsoftExtensions?: string | string[];
    fileViewerExtensions?: string | string[];
    preferredPreview?: PreviewEngine;
    enableKkfileview?: boolean;
    enableBasemetas?: boolean;
    enableMicrosoft?: boolean;
    enableFileViewer?: boolean;
    enablePrint?: boolean;
    enableOpenInNewWindow?: boolean;
    enableFullscreenButton?: boolean;
    enableMobileAutoFullscreen?: boolean;
    enableDownload?: boolean;
    basemetasRequestType?: 'query' | 'base64';
    enableCopyEmbedHtml?: boolean;
    copyEmbedHtmlPermission?: 'admin' | 'user' | 'roles' | string;
    copyEmbedHtmlRoles?: string | string[];
    watermarkType?: string;
    watermark?: string;
    fileViewerDownloaded?: boolean;
};

type SettingsFormValues = {
    kkfileviewHost: string;
    basemetasHost: string;
    microsoftHost: string;
    fileViewerAssetBase: string;
    nocobaseHost: string;
    kkfileviewExtensions: string[] | string;
    basemetasExtensions: string[] | string;
    microsoftExtensions: string[] | string;
    fileViewerExtensions: string[] | string;
    enableKkfileview: boolean;
    enableBasemetas: boolean;
    enableMicrosoft: boolean;
    enableFileViewer: boolean;
    preferredPreview: PreviewEngine;
    enablePrint: boolean;
    enableOpenInNewWindow: boolean;
    enableFullscreenButton: boolean;
    enableMobileAutoFullscreen: boolean;
    enableDownload: boolean;
    basemetasRequestType: 'query' | 'base64';
    enableCopyEmbedHtml: boolean;
    copyEmbedHtmlPermission: 'admin' | 'user' | 'roles' | string;
    copyEmbedHtmlRoles: string[] | string;
    watermarkType: string;
    watermark: string;
};

type ServiceHealthPayload = {
    message?: string;
    success?: boolean;
    reachable?: boolean;
    mode?: string;
    status?: number;
};

export interface BaseSettingsPageProps {
  adapters: ClientAdapters;
}

const extractProgressData = (payload: any): DownloadProgressState | null => {
    if (!payload) return null;
    let current = payload;
    for (let i = 0; i < 5; i++) {
        if (!current || typeof current !== 'object') break;
        if (current.progress && typeof current.progress === 'object') {
            current = current.progress;
        }
        if (typeof current.percent === 'number' || (typeof current.status === 'string' && current.status !== '200')) {
            return current as DownloadProgressState;
        }
        if (current.data) {
            current = current.data;
        } else {
            break;
        }
    }
    return null;
};

const extractSettingsRecords = (payload: unknown): KkfileviewSettingsRecord[] => {
    return unwrapDataArray(payload) as KkfileviewSettingsRecord[];
};

const extractListRecords = (payload: unknown): Array<Record<string, unknown>> => {
    return unwrapDataArray(payload);
};

const formatLogTime = (value: unknown) => {
    const raw = String(value || '').trim();
    if (!raw) return '-';
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return parsed.toLocaleString();
};

const getLogText = (row: Record<string, unknown>, keys: string[]) => {
    for (const key of keys) {
        const value = row[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
};

const getOperatorName = (row: Record<string, unknown>) => {
    const direct = getLogText(row, ['operator', 'username', 'userName', 'user', 'createdBy', 'updatedBy']);
    if (direct) return direct;
    const user = row.user as Record<string, unknown> | undefined;
    if (user && typeof user === 'object') {
        const nested = getLogText(user, ['nickname', 'username', 'name']);
        if (nested) return nested;
    }
    const createdBy = row.createdBy as Record<string, unknown> | undefined;
    if (createdBy && typeof createdBy === 'object') {
        const nested = getLogText(createdBy, ['nickname', 'username', 'name']);
        if (nested) return nested;
    }
    return '-';
};

const getChangeSummary = (row: Record<string, unknown>) => {
    const content = getLogText(row, ['content', 'detail']);
    if (content) return content;
    const summary = getLogText(row, ['summary', 'message', 'description', 'title', 'action', 'actionName', 'event', 'type']);
    if (summary) return summary;
    const changedFields = row.changedFields;
    if (Array.isArray(changedFields) && changedFields.length > 0) {
        return changedFields.map((item) => String(item || '').trim()).filter(Boolean).join(', ');
    }
    return 'kkfileviewSettings';
};

const getPreviewFileSummary = (row: Record<string, unknown>) => {
    const fileName = getLogText(row, ['fileName', 'name', 'title', 'filename']);
    const fileUrl = getLogText(row, ['fileUrl', 'url', 'src']);
    if (fileName && fileUrl) return `${fileName} (${fileUrl})`;
    if (fileName) return fileName;
    if (fileUrl) return fileUrl;
    return '-';
};

const getPreviewServiceLabel = (row: Record<string, unknown>) => {
    const raw = getLogText(row, ['previewService', 'service', 'engine']).toLowerCase();
    if (raw === 'kkfileview') return 'kkFileView';
    if (raw === 'basemetas') return 'BaseMetas';
    if (raw === 'microsoft') return 'Microsoft';
    if (raw === 'image') return '图片直开';
    if (raw === 'pdf') return 'PDF 直开';
    if (raw) return raw;
    return '-';
};

const getChangedFieldNames = (
    payload: Record<string, unknown>,
    previous?: KkfileviewSettingsRecord
) => {
    const keys = Object.keys(payload);
    if (!previous) return keys;
    return keys.filter((key) => {
        const nextValue = payload[key];
        const prevValue = (previous as Record<string, unknown>)[key];
        return JSON.stringify(nextValue) !== JSON.stringify(prevValue);
    });
};

const FIELD_LABEL_MAP: Record<string, string> = {
    host: '主机地址',
    kkfileviewHost: 'kkFileView 主机地址',
    basemetasHost: 'BaseMetas 服务地址',
    microsoftHost: '微软在线服务地址',
    fileViewerAssetBase: 'File Viewer 资源基础路径',
    nocobaseHost: '系统公共访问地址',
    preferredPreview: '优先预览',
    basemetasRequestType: 'BaseMetas 请求类型',
    enablePrint: '打印按钮',
    enableOpenInNewWindow: '新窗口按钮',
    enableFullscreenButton: '全屏按钮',
    enableMobileAutoFullscreen: '移动端自动全屏',
    enableDownload: '下载按钮',
    enableKkfileview: '启用 kkFileView',
    enableBasemetas: '启用 BaseMetas',
    enableMicrosoft: '启用微软在线',
    enableFileViewer: '启用 File Viewer',
    fileViewerExtensions: 'File Viewer 文件格式',
    watermarkType: '水印类型',
    watermark: '水印内容',
};

const formatFieldLabel = (key: string) => FIELD_LABEL_MAP[key] || key;

const toDisplayValue = (value: unknown) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (Array.isArray(value)) return value.map((item) => String(item)).join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
};

const buildSavedContentText = (
    payload: Record<string, unknown>,
    changedFields: string[],
    previous?: KkfileviewSettingsRecord
) => {
    const keys = changedFields.length > 0 ? changedFields : Object.keys(payload);
    const lines = keys
        .flatMap((key) => {
            const label = formatFieldLabel(key);
            const afterValue = toDisplayValue(payload[key]).trim() || '空';
            const beforeRaw = previous ? toDisplayValue((previous as Record<string, unknown>)[key]).trim() : '';
            const beforeValue = beforeRaw || '空';
            return [
                `${label}（修改前）: ${beforeValue}`,
                `${label}（修改后）: ${afterValue}`,
            ];
        })
        .filter(Boolean);
    const text = lines.join(' | ');
    if (!text) return '保存配置';
    return text.length > 1000 ? `${text.slice(0, 1000)}...` : text;
};

const normalizeRoleNames = (input: string | string[] = '') => {
    if (Array.isArray(input)) {
        return Array.from(new Set(input.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)));
    }
    return Array.from(new Set(String(input || '').split(/[,，;；\s]+/).map((item) => item.trim().toLowerCase()).filter(Boolean)));
};

const hasErrorFields = (error: unknown): boolean => {
    if (!error || typeof error !== 'object') return false;
    return Array.isArray((error as { errorFields?: unknown }).errorFields);
};

const isPermissionDeniedError = (error: unknown): boolean => {
    if (!error || typeof error !== 'object') return false;
    const root = error as {
        status?: number;
        response?: {
            status?: number;
            data?: {
                code?: string;
                message?: string;
                data?: {
                    code?: string;
                    message?: string;
                };
                errors?: Array<{ code?: string; message?: string }>;
            };
        };
    };
    const status = root.response?.status ?? root.status;
    if (status === 401 || status === 403) return true;
    const codes = [
        root.response?.data?.code,
        root.response?.data?.data?.code,
        ...(root.response?.data?.errors || []).map((item) => item?.code),
    ]
        .map((value) => String(value || '').trim().toUpperCase())
        .filter(Boolean);
    if (codes.some((code) => code === 'FORBIDDEN' || code === 'UNAUTHORIZED' || code === 'PERMISSION_DENIED' || code === 'EMPTY_TOKEN')) return true;
    const messages = [
        root.response?.data?.message,
        root.response?.data?.data?.message,
        ...(root.response?.data?.errors || []).map((item) => item?.message),
    ]
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean);
    return messages.some((text) =>
        text.includes('forbidden')
        || text.includes('unauthorized')
        || text.includes('permission')
        || text.includes('权限')
        || text.includes('未授权')
        || text.includes('无权限')
    );
};

const getServiceHealthPayload = (value: unknown): ServiceHealthPayload => {
    if (!value || typeof value !== 'object') return {};
    const root = value as { data?: unknown };
    if (root.data && typeof root.data === 'object') {
        const nested = root.data as { data?: unknown };
        if (nested.data && typeof nested.data === 'object') {
            return nested.data as ServiceHealthPayload;
        }
        return root.data as ServiceHealthPayload;
    }
    return value as ServiceHealthPayload;
};

const validateServerUrl = (value?: string): boolean => {
    const raw = String(value || '').trim();
    if (!raw) return false;
    return /^https?:\/\//i.test(raw);
};

export const BaseSettingsPage: React.FC<BaseSettingsPageProps> = ({ adapters }) => {
    const api = adapters.useAPIClient();
    const t = adapters.useT();
    const tr = (key: string, fallback: string) => {
        const res = t(key);
        return !res || res === key ? fallback : res;
    };
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(true);
    const [settingsRecords, setSettingsRecords] = useState<KkfileviewSettingsRecord[]>([]);
    const [activePanel, setActivePanel] = useState<SettingsActivePanel>('basic');
    const [wizardVisible, setWizardVisible] = useState(false);
    const [wizardStep, setWizardStep] = useState(0);
    const [testingServices, setTestingServices] = useState<Record<PreviewService, boolean>>({
        kkfileview: false,
        basemetas: false,
        microsoft: false,
        fileViewer: false,
    });
    const [modificationRecords, setModificationRecords] = useState<ModificationRecordItem[]>([]);
    const [modificationLoading, setModificationLoading] = useState(false);
    const [modificationLoaded, setModificationLoaded] = useState(false);
    const [deletingRecordKey, setDeletingRecordKey] = useState<string | null>(null);
    const [clearingRecords, setClearingRecords] = useState(false);
    const [previewRecords, setPreviewRecords] = useState<PreviewRecordItem[]>([]);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewLoaded, setPreviewLoaded] = useState(false);
    const [deletingPreviewRecordKey, setDeletingPreviewRecordKey] = useState<string | null>(null);
    const [clearingPreviewRecords, setClearingPreviewRecords] = useState(false);
    const [cleanupLoading, setCleanupLoading] = useState(false);
    const [cleanupMessage, setCleanupMessage] = useState('');
    const [watermarkDraft, setWatermarkDraft] = useState('');
    const [watermarkTypeDraft, setWatermarkTypeDraft] = useState<'global' | 'preview'>('preview');
    const [downloadingFileViewer, setDownloadingFileViewer] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState<DownloadProgressState | null>(null);
    const [serviceState, setServiceState] = useState<{
        enableKkfileview: boolean;
        enableBasemetas: boolean;
        enableMicrosoft: boolean;
        enableFileViewer: boolean;
        preferredPreview: PreviewEngine;
    }>({
        enableKkfileview: true,
        enableBasemetas: false,
        enableMicrosoft: true,
        enableFileViewer: false,
        preferredPreview: 'microsoft',
    });
    const allServicesOff = useMemo(
        () => !serviceState.enableKkfileview && !serviceState.enableBasemetas && !serviceState.enableMicrosoft && !serviceState.enableFileViewer,
        [serviceState.enableKkfileview, serviceState.enableBasemetas, serviceState.enableMicrosoft, serviceState.enableFileViewer]
    );
    const enabledStateMap = useMemo(
        () => ({
            kkfileview: serviceState.enableKkfileview,
            basemetas: serviceState.enableBasemetas,
            microsoft: serviceState.enableMicrosoft,
            fileViewer: serviceState.enableFileViewer,
        }),
        [serviceState.enableKkfileview, serviceState.enableBasemetas, serviceState.enableMicrosoft, serviceState.enableFileViewer]
    );

    useEffect(() => {
        let active = true;
        const loadSettings = async () => {
            setLoading(true);
            try {
                const response = await api.request({
                    url: 'kkfileviewSettings:list',
                    skipNotify: true,
                });
                if (active) {
                    setSettingsRecords(extractSettingsRecords(response));
                }
            } catch (error: unknown) {
                if (!isPermissionDeniedError(error)) {
                    console.error(error);
                }
                if (active) {
                    setSettingsRecords([]);
                }
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        };
        void loadSettings();
        return () => {
            active = false;
        };
    }, [api]);

    const currentRecord = settingsRecords[0];

    const isWizardDismissed = () => {
        try {
            return window.localStorage.getItem(WIZARD_DISMISSED_KEY) === '1';
        } catch {
            return false;
        }
    };

    const dismissWizard = () => {
        try {
            window.localStorage.setItem(WIZARD_DISMISSED_KEY, '1');
        } catch {
        }
    };

    const isDefaultConfigRecord = (record?: KkfileviewSettingsRecord) => {
        if (!record) return true;
        const kkExt = parseExtensions(record.kkfileviewExtensions, DEFAULT_EXTENSIONS);
        const baseExt = parseExtensions(record.basemetasExtensions, DEFAULT_EXTENSIONS);
        const msExt = parseExtensions(record.microsoftExtensions, DEFAULT_MICROSOFT_EXTENSIONS);
        const fileViewerState = buildFileViewerFormState(record, {
            enableFileViewer: false,
            fileViewerAssetBase: DEFAULT_FILE_VIEWER_ASSET_BASE,
            fileViewerExtensions: DEFAULT_FILE_VIEWER_EXTENSIONS,
        });
        return (record.kkfileviewHost || DEFAULT_KKFILEVIEW_HOST) === DEFAULT_KKFILEVIEW_HOST
            && (record.basemetasHost || DEFAULT_BASEMETAS_HOST) === DEFAULT_BASEMETAS_HOST
            && (record.microsoftHost || DEFAULT_MICROSOFT_HOST) === DEFAULT_MICROSOFT_HOST
            && fileViewerState.fileViewerAssetBase === DEFAULT_FILE_VIEWER_ASSET_BASE
            && (record.nocobaseHost || '') === ''
            && JSON.stringify(kkExt) === JSON.stringify(DEFAULT_EXTENSIONS)
            && JSON.stringify(baseExt) === JSON.stringify(DEFAULT_EXTENSIONS)
            && JSON.stringify(msExt) === JSON.stringify(DEFAULT_MICROSOFT_EXTENSIONS)
            && JSON.stringify(fileViewerState.fileViewerExtensions) === JSON.stringify(DEFAULT_FILE_VIEWER_EXTENSIONS)
            && (record.enableKkfileview ?? true) === true
            && (record.enableBasemetas ?? false) === false
            && (record.enableMicrosoft ?? true) === true
            && fileViewerState.enableFileViewer === false
            && (record.enablePrint ?? false) === false
            && (record.enableOpenInNewWindow ?? true) === true
            && (record.enableFullscreenButton ?? true) === true
            && (record.enableMobileAutoFullscreen ?? false) === false
            && (record.enableDownload ?? true) === true
            && ((record.basemetasRequestType || 'query') === 'query')
            && (record.enableCopyEmbedHtml ?? true) === true
            && ((record.copyEmbedHtmlPermission || 'user') === 'user')
            && (String(record.copyEmbedHtmlRoles || '').trim() === '' || String(record.copyEmbedHtmlRoles || '').trim() === '[]')
            && (record.watermark || '') === ''
            && ((record.watermarkType || 'preview') === 'preview')
            && ((record.preferredPreview || 'microsoft') === 'microsoft');
    };

    useEffect(() => {
        if (loading) return;
        const shouldShow = !isWizardDismissed() && (!currentRecord?.id || isDefaultConfigRecord(currentRecord));
        setWizardVisible(shouldShow);
        setWizardStep(0);
    }, [loading, currentRecord]);

    useEffect(() => {
        if (!currentRecord) return;
        const enableKk = currentRecord.enableKkfileview ?? true;
        const enableBase = currentRecord.enableBasemetas ?? false;
        const enableMs = currentRecord.enableMicrosoft ?? true;
        const fileViewerState = buildFileViewerFormState(currentRecord, {
            enableFileViewer: false,
            fileViewerAssetBase: DEFAULT_FILE_VIEWER_ASSET_BASE,
            fileViewerExtensions: DEFAULT_FILE_VIEWER_EXTENSIONS,
        });

        const preferred: PreviewEngine = (['microsoft', 'kkfileview', 'basemetas', 'fileViewer', 'none'] as PreviewEngine[]).includes(
            currentRecord.preferredPreview!
        )
            ? currentRecord.preferredPreview!
            : 'microsoft';

        const serviceFields = PREVIEW_SERVICE_REGISTRY.reduce((acc, service) => {
            const extensionFallback = service.key === 'microsoft'
                ? DEFAULT_MICROSOFT_EXTENSIONS
                : service.key === 'fileViewer'
                    ? DEFAULT_FILE_VIEWER_EXTENSIONS
                    : DEFAULT_EXTENSIONS;
            const hostFallback = service.defaultHost;

            acc[service.hostField] = currentRecord[service.hostField] || hostFallback;
            acc[service.extensionsField] = parseExtensions(currentRecord[service.extensionsField], extensionFallback);
            return acc;
        }, {} as Record<string, string | string[]>);

        const nextState = {
            enableKkfileview: enableKk,
            enableBasemetas: enableBase,
            enableMicrosoft: enableMs,
            enableFileViewer: fileViewerState.enableFileViewer,
            preferredPreview: preferred,
        };
        form.setFieldsValue({
            ...serviceFields,
            ...nextState,
            fileViewerAssetBase: fileViewerState.fileViewerAssetBase,
            fileViewerExtensions: fileViewerState.fileViewerExtensions,
            nocobaseHost: String(currentRecord.nocobaseHost || '').trim(),
            enablePrint: currentRecord.enablePrint === true,
            enableOpenInNewWindow: currentRecord.enableOpenInNewWindow !== false,
            enableFullscreenButton: currentRecord.enableFullscreenButton !== false,
            enableMobileAutoFullscreen: currentRecord.enableMobileAutoFullscreen === true,
            enableDownload: currentRecord.enableDownload !== false,
            basemetasRequestType: currentRecord.basemetasRequestType === 'base64' ? 'base64' : 'query',
            enableCopyEmbedHtml: currentRecord.enableCopyEmbedHtml !== false,
            copyEmbedHtmlPermission: ['admin', 'user', 'roles'].includes(currentRecord.copyEmbedHtmlPermission || '') ? currentRecord.copyEmbedHtmlPermission : 'user',
            copyEmbedHtmlRoles: normalizeRoleNames(currentRecord.copyEmbedHtmlRoles),
            watermarkType: currentRecord.watermarkType || 'preview',
            watermark: currentRecord.watermark || '',
        });
        setWatermarkTypeDraft(currentRecord.watermarkType === 'global' ? 'global' : 'preview');
        setWatermarkDraft(String(currentRecord.watermark || ''));
        setServiceState(nextState);
    }, [currentRecord, form]);

    useEffect(() => {
        const { enableMicrosoft, enableKkfileview, enableBasemetas, enableFileViewer, preferredPreview } = serviceState;
        const allowed: PreviewEngine[] = [];
        if (enableMicrosoft) allowed.push('microsoft');
        if (enableKkfileview) allowed.push('kkfileview');
        if (enableBasemetas) allowed.push('basemetas');
        if (enableFileViewer) allowed.push('fileViewer');
        allowed.push('none');

        if (allowed.includes(preferredPreview)) return;
        const fallback = (allowed.find((item) => item !== 'none') || 'none') as PreviewEngine;
        form.setFieldValue('preferredPreview', fallback);
        setServiceState((prev) => ({ ...prev, preferredPreview: fallback }));
    }, [serviceState.enableMicrosoft, serviceState.enableKkfileview, serviceState.enableBasemetas, serviceState.enableFileViewer, form]);

    const loadModificationRecords = async (force = false) => {
        if (!force && modificationLoading) return;
        setModificationLoading(true);
        try {
            const response = await api.request({
                url: 'kkfileviewModificationRecords:list',
                method: 'get',
                params: {
                    pageSize: 100,
                },
                skipNotify: true,
            });
            const rows = extractListRecords(response);
            const records: ModificationRecordItem[] = rows.map((row, index) => {
                const time = formatLogTime(
                    row.updatedAt || row.createdAt || row.timestamp || row.time
                );
                return {
                    key: String(row.id || index),
                    time,
                    operator: getOperatorName(row),
                    change: getChangeSummary(row),
                };
            });
            setModificationRecords(records);
        } catch {
            setModificationRecords([]);
        } finally {
            setModificationLoaded(true);
            setModificationLoading(false);
        }
    };

    const executeRemoveRecord = async (
        key: string,
        setDeletingKey: (value: string | null) => void,
        removeUrl: string,
        removeLocal: (targetKey: string) => void,
    ) => {
        setDeletingKey(key);
        try {
            await api.request({
                url: removeUrl,
                method: 'post',
                data: {
                    id: key,
                },
                skipNotify: true,
            });
            removeLocal(key);
            message.success(tr('Deleted successfully', '删除记录成功'));
        } catch {
            message.error(tr('Delete failed', '删除记录失败'));
        } finally {
            setDeletingKey(null);
        }
    };

    const executeClearRecords = async (
        setClearing: (value: boolean) => void,
        clearUrl: string,
        clearLocal: () => void,
    ) => {
        setClearing(true);
        try {
            await api.request({
                url: clearUrl,
                method: 'post',
                skipNotify: true,
            });
            clearLocal();
            message.success(tr('Cleared successfully', '清空记录成功'));
        } catch {
            message.error(tr('Clear failed', '清空记录失败'));
        } finally {
            setClearing(false);
        }
    };

    const handleDeleteRecord = async (key: string) => {
        await executeRemoveRecord(
            key,
            setDeletingRecordKey,
            'kkfileviewModificationRecords:remove',
            (targetKey) => setModificationRecords((prev) => prev.filter((item) => item.key !== targetKey)),
        );
    };

    const handleClearRecords = async () => {
        await executeClearRecords(
            setClearingRecords,
            'kkfileviewModificationRecords:clear',
            () => setModificationRecords([]),
        );
    };

    const loadPreviewRecords = async (force = false) => {
        if (!force && previewLoading) return;
        setPreviewLoading(true);
        try {
            const response = await api.request({
                url: 'kkfileviewPreviewRecords:list',
                method: 'get',
                params: {
                    pageSize: 100,
                },
                skipNotify: true,
            });
            const rows = extractListRecords(response);
            const records: PreviewRecordItem[] = rows.map((row, index) => ({
                key: String(row.id || index),
                time: formatLogTime(row.requestedAt || row.createdAt || row.updatedAt || row.time),
                operator: getOperatorName(row),
                service: getPreviewServiceLabel(row),
                file: getPreviewFileSummary(row),
            }));
            setPreviewRecords(records);
        } catch {
            setPreviewRecords([]);
        } finally {
            setPreviewLoaded(true);
            setPreviewLoading(false);
        }
    };

    const handleDeletePreviewRecord = async (key: string) => {
        await executeRemoveRecord(
            key,
            setDeletingPreviewRecordKey,
            'kkfileviewPreviewRecords:remove',
            (targetKey) => setPreviewRecords((prev) => prev.filter((item) => item.key !== targetKey)),
        );
    };

    const handleClearPreviewRecords = async () => {
        await executeClearRecords(
            setClearingPreviewRecords,
            'kkfileviewPreviewRecords:clear',
            () => setPreviewRecords([]),
        );
    };

    const handleRunFieldCleanup = async () => {
        setCleanupLoading(true);
        try {
            const response = await api.request({
                url: 'kkfileviewFieldCleanup:run',
                method: 'post',
                skipNotify: true,
            });
            const result = (response as { data?: { data?: { message?: string } } })?.data?.data;
            const messageText = String(result?.message || '').trim() || t('Cleanup completed');
            setCleanupMessage(messageText);
            message.success(messageText);
            const refreshed = await api.request({
                url: 'kkfileviewSettings:list',
                skipNotify: true,
            });
            setSettingsRecords(extractSettingsRecords(refreshed));
        } catch {
            const messageText = t('Cleanup failed');
            setCleanupMessage(messageText);
            message.error(messageText);
        } finally {
            setCleanupLoading(false);
        }
    };

    const handleDownloadFileViewer = async () => {
        setDownloadingFileViewer(true);
        setDownloadProgress({
            status: 'searching',
            percent: 0,
            downloadedBytes: 0,
            totalBytes: 0,
            speedBytesPerSec: 0,
            speedText: '0 KB/s',
            downloadedText: '0 B',
            totalText: '进行中',
            message: t('Preparing to extract static files...'),
        });

        const timer = setInterval(async () => {
            try {
                const res = await api.request({
                    url: 'kkfileviewFileViewerDownload:progress',
                    method: 'get',
                    skipNotify: true,
                });
                const prog = extractProgressData(res);
                if (prog && prog.status) {
                    setDownloadProgress(prog);
                }
            } catch {}
        }, 300);

        try {
            const res = await api.request({
                url: 'kkfileviewFileViewerDownload:download',
                method: 'post',
            });
            const resData = extractProgressData(res) as any;
            const finalProg = resData?.progress || resData;
            if (finalProg && finalProg.percent !== undefined) {
                setDownloadProgress(finalProg);
            } else {
                setDownloadProgress({
                    status: 'completed',
                    percent: 100,
                    downloadedBytes: 0,
                    totalBytes: 0,
                    speedBytesPerSec: 0,
                    speedText: '0 KB/s',
                    downloadedText: '完成',
                    totalText: '完成',
                    message: t('Static files downloaded/copied successfully'),
                });
            }
            message.success(t('Static files downloaded/copied successfully'));
            const response = await api.request({
                url: 'kkfileviewSettings:list',
                skipNotify: true,
            });
            const refreshedRecords = extractSettingsRecords(response);
            if (refreshedRecords.length > 0) {
                setSettingsRecords(refreshedRecords);
                updateConfigCache(refreshedRecords[0]);
            }
        } catch (error: any) {
            console.error(error);
            const serverMessage = error?.response?.data?.data?.message || error?.response?.data?.message || error?.message;
            const detailMsg = serverMessage ? `: ${serverMessage}` : '';
            message.error(`${t('Failed to download File Viewer static files')}${detailMsg}`);
        } finally {
            clearInterval(timer);
            setDownloadingFileViewer(false);
        }
    };

    const handleFormValuesChange = (_changedValues: unknown, allValues: SettingsFormValues) => {
        setServiceState({
            enableKkfileview: allValues.enableKkfileview === true,
            enableBasemetas: allValues.enableBasemetas === true,
            enableMicrosoft: allValues.enableMicrosoft === true,
            enableFileViewer: allValues.enableFileViewer === true,
            preferredPreview: allValues.preferredPreview || 'microsoft',
        });
    };

    const handleTestServiceConnectivity = async (serviceKey: PreviewService) => {
        try {
            const values = await form.validateFields();
            const hostFieldMap: Record<PreviewService, keyof SettingsFormValues> = {
                kkfileview: 'kkfileviewHost',
                basemetas: 'basemetasHost',
                microsoft: 'microsoftHost',
                fileViewer: 'fileViewerAssetBase',
            };
            const hostValue = String(values[hostFieldMap[serviceKey]] || '').trim();
            if (!hostValue) {
                message.warning(tr('Please fill in service address first', '请先填写服务地址'));
                return;
            }
            setTestingServices((prev) => ({ ...prev, [serviceKey]: true }));
            const response = await api.request({
                url: 'kkfileviewSettings:testConnectivity',
                method: 'post',
                data: {
                    service: serviceKey,
                    host: hostValue,
                },
                skipNotify: true,
            });
            const payload = getServiceHealthPayload(response);
            if (payload.reachable || payload.success) {
                const modeText = payload.mode ? ` (${payload.mode})` : '';
                message.success(`${tr('Service connectivity normal', '服务连通正常')}${modeText}`);
            } else {
                message.error(payload.message || tr('Service unreachable or abnormal response', '服务无法访问或响应异常'));
            }
        } catch (error: unknown) {
            if (hasErrorFields(error)) return;
            console.error(error);
            message.error(tr('Service connectivity test failed', '服务连通性测试失败'));
        } finally {
            setTestingServices((prev) => ({ ...prev, [serviceKey]: false }));
        }
    };

    const handleResetDefaults = () => {
        const defaultFields = PREVIEW_SERVICE_REGISTRY.reduce((acc, service) => {
            const extensionFallback = service.key === 'microsoft'
                ? DEFAULT_MICROSOFT_EXTENSIONS
                : service.key === 'fileViewer'
                    ? DEFAULT_FILE_VIEWER_EXTENSIONS
                    : DEFAULT_EXTENSIONS;
            acc[service.hostField] = service.defaultHost;
            acc[service.extensionsField] = extensionFallback;
            return acc;
        }, {} as Record<string, string | string[]>);

        const resetValues = {
            ...defaultFields,
            nocobaseHost: '',
            enableKkfileview: true,
            enableBasemetas: false,
            enableMicrosoft: true,
            enableFileViewer: false,
            preferredPreview: 'microsoft' as PreviewEngine,
            enablePrint: false,
            enableOpenInNewWindow: true,
            enableFullscreenButton: true,
            enableMobileAutoFullscreen: false,
            enableDownload: true,
            basemetasRequestType: 'query' as const,
            enableCopyEmbedHtml: true,
            copyEmbedHtmlPermission: 'user' as const,
            copyEmbedHtmlRoles: [],
            watermarkType: 'preview',
            watermark: '',
        };

        form.setFieldsValue(resetValues);
        setServiceState({
            enableKkfileview: true,
            enableBasemetas: false,
            enableMicrosoft: true,
            enableFileViewer: false,
            preferredPreview: 'microsoft',
        });
        message.info(tr('Reset to default values, please click save to submit', '已恢复默认值，请点击保存提交生效'));
    };

    const handleWizardFinish = async () => {
        dismissWizard();
        setWizardVisible(false);
        try {
            await handleSave();
        } catch {
        }
    };

    const handleWizardClose = () => {
        dismissWizard();
        setWizardVisible(false);
    };

    const handleSave = async () => {
        try {
            const values = (await form.validateFields()) as SettingsFormValues;
            const parsedFields = PREVIEW_SERVICE_REGISTRY.reduce((acc, service) => {
                const extensionFallback = service.key === 'microsoft'
                    ? DEFAULT_MICROSOFT_EXTENSIONS
                    : service.key === 'fileViewer'
                        ? DEFAULT_FILE_VIEWER_EXTENSIONS
                        : DEFAULT_EXTENSIONS;

                acc[service.extensionsField] = parseExtensions(
                    values[service.extensionsField],
                    extensionFallback
                );
                return acc;
            }, {} as Record<string, string[]>);

            const fileViewerSaveState = buildFileViewerSaveState(values, {
                fileViewerAssetBase: DEFAULT_FILE_VIEWER_ASSET_BASE,
                fileViewerExtensions: DEFAULT_FILE_VIEWER_EXTENSIONS,
            });

            const watermarkSaveState = buildWatermarkSaveState(
                { watermark: values.watermark, watermarkType: watermarkTypeDraft },
                { watermarkType: 'preview', watermark: '' }
            );

            const payload: Record<string, unknown> = {
                kkfileviewHost: values.kkfileviewHost.trim() || DEFAULT_KKFILEVIEW_HOST,
                basemetasHost: values.basemetasHost.trim() || DEFAULT_BASEMETAS_HOST,
                microsoftHost: values.microsoftHost.trim() || DEFAULT_MICROSOFT_HOST,
                fileViewerAssetBase: fileViewerSaveState.fileViewerAssetBase,
                nocobaseHost: values.nocobaseHost.trim(),
                kkfileviewExtensions: parsedFields.kkfileviewExtensions,
                basemetasExtensions: parsedFields.basemetasExtensions,
                microsoftExtensions: parsedFields.microsoftExtensions,
                fileViewerExtensions: fileViewerSaveState.fileViewerExtensions,
                enableKkfileview: values.enableKkfileview === true,
                enableBasemetas: values.enableBasemetas === true,
                enableMicrosoft: values.enableMicrosoft === true,
                enableFileViewer: fileViewerSaveState.enableFileViewer,
                preferredPreview: values.preferredPreview,
                enablePrint: values.enablePrint === true,
                enableOpenInNewWindow: values.enableOpenInNewWindow === true,
                enableFullscreenButton: values.enableFullscreenButton === true,
                enableMobileAutoFullscreen: values.enableMobileAutoFullscreen === true,
                enableDownload: values.enableDownload === true,
                basemetasRequestType: values.basemetasRequestType === 'base64' ? 'base64' : 'query',
                enableCopyEmbedHtml: values.enableCopyEmbedHtml === true,
                copyEmbedHtmlPermission: values.copyEmbedHtmlPermission || 'user',
                copyEmbedHtmlRoles: normalizeRoleNames(values.copyEmbedHtmlRoles),
                watermarkType: watermarkSaveState.watermarkType,
                watermark: watermarkSaveState.watermark,
            };

            const changedFields = getChangedFieldNames(payload, currentRecord);
            const savedContent = buildSavedContentText(payload, changedFields, currentRecord);

            let savedRecord: KkfileviewSettingsRecord | undefined;
            if (currentRecord?.id) {
                const response = await api.request({
                    url: 'kkfileviewSettings:update',
                    method: 'post',
                    params: {
                        filterByTk: currentRecord.id,
                        filter: { id: currentRecord.id },
                    },
                    data: {
                        filterByTk: currentRecord.id,
                        filter: { id: currentRecord.id },
                        ...payload,
                    },
                });
                const records = extractSettingsRecords(response);
                savedRecord = records[0];
            } else {
                const response = await api.request({
                    url: 'kkfileviewSettings:create',
                    method: 'post',
                    data: payload,
                });
                const records = extractSettingsRecords(response);
                savedRecord = records[0];
            }

            const activeRecord = savedRecord || { ...currentRecord, ...payload };
            setSettingsRecords([activeRecord]);
            updateConfigCache(activeRecord);

            void api.request({
                url: 'kkfileviewModificationRecords:append',
                method: 'post',
                data: {
                    content: savedContent,
                    timestamp: new Date().toISOString(),
                },
                skipNotify: true,
            }).then(() => {
                if (modificationLoaded) {
                    void loadModificationRecords(true);
                }
            }).catch(() => {
            });

            message.success(tr('Configuration saved successfully', '配置保存成功'));
        } catch (error: unknown) {
            if (hasErrorFields(error)) return;
            console.error(error);
            message.error(tr('Failed to save configuration', '保存配置失败'));
            throw error;
        }
    };

    return (
        <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
            <SettingsToolbar
                t={t}
                activePanel={activePanel}
                onPanelChange={(panel) => {
                    setActivePanel(panel);
                    if (panel === 'history' && !modificationLoaded) {
                        void loadModificationRecords();
                    }
                    if (panel === 'previewRecords' && !previewLoaded) {
                        void loadPreviewRecords();
                    }
                }}
                onReset={handleResetDefaults}
                onSave={handleSave}
            />

            <Form
                form={form}
                layout="vertical"
                onValuesChange={handleFormValuesChange}
                disabled={loading}
            >
                <BasicSettingsCard
                    t={t}
                    visible={activePanel === 'basic'}
                    allServicesOff={allServicesOff}
                    enabledStateMap={enabledStateMap}
                />

                <AdvancedSettingsCard
                    t={t}
                    visible={activePanel === 'advanced'}
                    watermark={watermarkDraft}
                    watermarkType={watermarkTypeDraft}
                    onWatermarkChange={(val) => setWatermarkDraft(val)}
                    onWatermarkTypeChange={(val) => setWatermarkTypeDraft(val)}
                    onTestConnection={handleTestServiceConnectivity}
                    testingServices={testingServices}
                    validateServerUrl={validateServerUrl}
                    fileViewerDownloaded={currentRecord?.fileViewerDownloaded}
                    downloadingFileViewer={downloadingFileViewer}
                    onDownloadFileViewer={handleDownloadFileViewer}
                    downloadProgress={downloadProgress}
                />
            </Form>

            <FieldCleanupCard
                t={t}
                visible={activePanel === 'cleanup'}
                loading={cleanupLoading}
                message={cleanupMessage}
                onRun={handleRunFieldCleanup}
            />

            <ModificationRecordsCard
                t={t}
                visible={activePanel === 'history'}
                records={modificationRecords}
                loading={modificationLoading}
                deletingKey={deletingRecordKey}
                clearing={clearingRecords}
                onRefresh={() => void loadModificationRecords(true)}
                onDelete={handleDeleteRecord}
                onClear={handleClearRecords}
            />

            <PreviewRecordsCard
                t={t}
                visible={activePanel === 'previewRecords'}
                records={previewRecords}
                loading={previewLoading}
                deletingKey={deletingPreviewRecordKey}
                clearing={clearingPreviewRecords}
                onRefresh={() => void loadPreviewRecords(true)}
                onDelete={handleDeletePreviewRecord}
                onClear={handleClearPreviewRecords}
            />

            {wizardVisible && (
                <SettingsWizard
                    t={t}
                    wizardStep={wizardStep}
                    onHide={handleWizardClose}
                    onPrev={() => setWizardStep((prev) => Math.max(0, prev - 1))}
                    onNext={() => {
                        if (wizardStep >= 2) {
                            void handleWizardFinish();
                        } else {
                            setWizardStep((prev) => prev + 1);
                        }
                    }}
                    allServicesOff={allServicesOff}
                    enabledStateMap={enabledStateMap}
                    testingServices={testingServices}
                    onTestConnection={handleTestServiceConnectivity}
                    validateServerUrl={validateServerUrl}
                    form={form}
                />
            )}
        </div>
    );
};

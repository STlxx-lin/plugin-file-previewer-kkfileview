import React, { useEffect, useMemo, useState } from 'react';
import { useAPIClient } from '@nocobase/client';
import { Form, message } from 'antd';
import { useT } from './locale';
import {
    DEFAULT_EXTENSIONS,
    DEFAULT_MICROSOFT_EXTENSIONS,
    DEFAULT_BASEMETAS_HOST,
    DEFAULT_KKFILEVIEW_HOST,
    DEFAULT_MICROSOFT_HOST,
    PREVIEW_SERVICE_REGISTRY,
    PreviewEngine,
    PreviewService,
    updateConfigCache,
} from './configCache';
import { buildWatermarkSaveState } from './settingsPayload';
import { parseExtensions, parseExtensionsInput, unwrapDataArray } from './previewUtils';
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
} from './settingsSections';

const WIZARD_DISMISSED_KEY = 'kkfileview.setup.wizard.dismissed';

type KkfileviewSettingsRecord = {
    id?: number | string;
    kkfileviewHost?: string;
    basemetasHost?: string;
    microsoftHost?: string;
    nocobaseHost?: string;
    kkfileviewExtensions?: string | string[];
    basemetasExtensions?: string | string[];
    microsoftExtensions?: string | string[];
    preferredPreview?: PreviewEngine;
    enableKkfileview?: boolean;
    enableBasemetas?: boolean;
    enableMicrosoft?: boolean;
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
};

type SettingsFormValues = {
    kkfileviewHost: string;
    basemetasHost: string;
    microsoftHost: string;
    nocobaseHost: string;
    kkfileviewExtensions: string[] | string;
    basemetasExtensions: string[] | string;
    microsoftExtensions: string[] | string;
    enableKkfileview: boolean;
    enableBasemetas: boolean;
    enableMicrosoft: boolean;
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

export const SettingsPage = () => {
    const api = useAPIClient();
    const t = useT();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(true);
    const [settingsRecords, setSettingsRecords] = useState<KkfileviewSettingsRecord[]>([]);
    const [activePanel, setActivePanel] = useState<SettingsActivePanel>('basic');
    const [isDirty, setIsDirty] = useState(false);
    const [wizardVisible, setWizardVisible] = useState(false);
    const [wizardStep, setWizardStep] = useState(0);
    const [testingServices, setTestingServices] = useState<Record<PreviewService, boolean>>({
        kkfileview: false,
        basemetas: false,
        microsoft: false,
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
    const [watermarkDraft, setWatermarkDraft] = useState(''); // 单独维护水印草稿，避免表单异常时保存到旧值。
    const [watermarkTypeDraft, setWatermarkTypeDraft] = useState<'global' | 'preview'>('preview'); // 单独维护水印类型草稿，确保水印类型与文本始终同步。
    const [serviceState, setServiceState] = useState<{
        enableKkfileview: boolean;
        enableBasemetas: boolean;
        enableMicrosoft: boolean;
        preferredPreview: PreviewEngine;
    }>({
        enableKkfileview: true,
        enableBasemetas: false,
        enableMicrosoft: true,
        preferredPreview: 'microsoft',
    });
    const allServicesOff = useMemo(
        () => !serviceState.enableKkfileview && !serviceState.enableBasemetas && !serviceState.enableMicrosoft,
        [serviceState.enableKkfileview, serviceState.enableBasemetas, serviceState.enableMicrosoft]
    );
    const enabledStateMap = useMemo(
        () => ({
            kkfileview: serviceState.enableKkfileview,
            basemetas: serviceState.enableBasemetas,
            microsoft: serviceState.enableMicrosoft,
        }),
        [serviceState.enableKkfileview, serviceState.enableBasemetas, serviceState.enableMicrosoft]
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
                    // 权限不足时按空配置处理，避免抛出未捕获异常
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
        return (record.kkfileviewHost || DEFAULT_KKFILEVIEW_HOST) === DEFAULT_KKFILEVIEW_HOST
            && (record.basemetasHost || DEFAULT_BASEMETAS_HOST) === DEFAULT_BASEMETAS_HOST
            && (record.microsoftHost || DEFAULT_MICROSOFT_HOST) === DEFAULT_MICROSOFT_HOST
            && (record.nocobaseHost || '') === ''
            && JSON.stringify(kkExt) === JSON.stringify(DEFAULT_EXTENSIONS)
            && JSON.stringify(baseExt) === JSON.stringify(DEFAULT_EXTENSIONS)
            && JSON.stringify(msExt) === JSON.stringify(DEFAULT_MICROSOFT_EXTENSIONS)
            && (record.enableKkfileview ?? true) === true
            && (record.enableBasemetas ?? false) === false
            && (record.enableMicrosoft ?? true) === true
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

        const preferred: PreviewEngine = (['microsoft', 'kkfileview', 'basemetas', 'none'] as PreviewEngine[]).includes(
            currentRecord.preferredPreview
        )
            ? currentRecord.preferredPreview
            : 'microsoft';

        const serviceFields = PREVIEW_SERVICE_REGISTRY.reduce((acc, service) => {
            const extensionFallback = service.key === 'microsoft' ? DEFAULT_MICROSOFT_EXTENSIONS : DEFAULT_EXTENSIONS;
            const hostFallback = service.key === 'kkfileview'
                ? DEFAULT_KKFILEVIEW_HOST
                : service.key === 'basemetas'
                    ? DEFAULT_BASEMETAS_HOST
                    : DEFAULT_MICROSOFT_HOST;

            acc[service.hostField] = currentRecord[service.hostField] || hostFallback;
            acc[service.extensionsField] = parseExtensions(currentRecord[service.extensionsField], extensionFallback);
            return acc;
        }, {} as Record<string, string | string[]>);

        const nextState = {
            enableKkfileview: enableKk,
            enableBasemetas: enableBase,
            enableMicrosoft: enableMs,
            preferredPreview: preferred,
        };
        form.setFieldsValue({
            ...serviceFields,
            ...nextState,
            nocobaseHost: String(currentRecord.nocobaseHost || '').trim(),
            enablePrint: currentRecord.enablePrint === true,
            enableOpenInNewWindow: currentRecord.enableOpenInNewWindow !== false,
            enableFullscreenButton: currentRecord.enableFullscreenButton !== false,
            enableMobileAutoFullscreen: currentRecord.enableMobileAutoFullscreen === true,
            enableDownload: currentRecord.enableDownload !== false,
            basemetasRequestType: currentRecord.basemetasRequestType === 'base64' ? 'base64' : 'query',
            enableCopyEmbedHtml: currentRecord.enableCopyEmbedHtml !== false,
            copyEmbedHtmlPermission: ['admin', 'user', 'roles'].includes(currentRecord.copyEmbedHtmlPermission) ? currentRecord.copyEmbedHtmlPermission : 'user',
            copyEmbedHtmlRoles: normalizeRoleNames(currentRecord.copyEmbedHtmlRoles),
            watermarkType: currentRecord.watermarkType || 'preview',
            watermark: currentRecord.watermark || '',
        });
        setWatermarkTypeDraft(currentRecord.watermarkType === 'global' ? 'global' : 'preview'); // 回填当前数据库中的水印类型，避免页面刷新后受控值丢失。
        setWatermarkDraft(String(currentRecord.watermark || '')); // 回填当前数据库中的水印文本，确保输入框显示与待保存值一致。
        setServiceState(nextState);
        setIsDirty(false);
    }, [currentRecord, form]);

    useEffect(() => {
        const { enableMicrosoft, enableKkfileview, enableBasemetas, preferredPreview } = serviceState;
        const allowed: PreviewEngine[] = [];
        if (enableMicrosoft) allowed.push('microsoft');
        if (enableKkfileview) allowed.push('kkfileview');
        if (enableBasemetas) allowed.push('basemetas');
        allowed.push('none');

        if (allowed.includes(preferredPreview)) return;
        const fallback = (allowed.find((item) => item !== 'none') || 'none') as PreviewEngine;
        form.setFieldValue('preferredPreview', fallback);
        setServiceState((prev) => ({ ...prev, preferredPreview: fallback }));
    }, [serviceState.enableMicrosoft, serviceState.enableKkfileview, serviceState.enableBasemetas, form]);

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
            message.success(t('Deleted successfully'));
        } catch {
            message.error(t('Delete failed'));
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
            message.success(t('Cleared successfully'));
        } catch {
            message.error(t('Clear failed'));
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

    useEffect(() => {
        if (activePanel !== 'history') return;
        if (modificationLoaded) return;
        void loadModificationRecords();
    }, [activePanel, modificationLoaded]);

    useEffect(() => {
        if (activePanel !== 'previewRecords') return;
        if (previewLoaded) return;
        void loadPreviewRecords();
    }, [activePanel, previewLoaded]);

    const handleWatermarkTypeChange = (value: 'global' | 'preview') => {
        setWatermarkTypeDraft(value); // 先更新本地受控状态，确保界面立即显示最新水印类型。
        form.setFieldValue('watermarkType', value); // 再同步写回表单缓存，兼容其它依赖表单值的逻辑。
        setIsDirty(true); // 标记页面已有未保存改动，避免用户误以为已落库。
    };

    const handleWatermarkChange = (value: string) => {
        setWatermarkDraft(value); // 先更新本地受控状态，保证输入框与待保存值始终一致。
        form.setFieldValue('watermark', value); // 同步写回表单缓存，兼容现有表单序列化与调试查看。
        setIsDirty(true); // 标记页面存在未保存修改，保持与其它字段一致的交互体验。
    };

    const handleSave = async () => {
        try {
            const values = await form.validateFields() as SettingsFormValues;
            const extensionsMap = PREVIEW_SERVICE_REGISTRY.reduce((acc, service) => {
                acc[service.key] = parseExtensionsInput(values[service.extensionsField]);
                return acc;
            }, {} as Record<PreviewService, string[]>);
            const enabledMap = PREVIEW_SERVICE_REGISTRY.reduce((acc, service) => {
                acc[service.key] = values[service.enabledField] === true;
                return acc;
            }, {} as Record<PreviewService, boolean>);
            let preferredPreview: PreviewEngine = values.preferredPreview;
            if (preferredPreview !== 'none' && !enabledMap[preferredPreview]) {
                preferredPreview = (Object.keys(enabledMap).find((key) => enabledMap[key]) || 'none') as PreviewEngine;
            }

            const servicePayload = PREVIEW_SERVICE_REGISTRY.reduce((acc, service) => {
                acc[service.hostField] = values[service.hostField];
                acc[service.extensionsField] = JSON.stringify(extensionsMap[service.key]);
                acc[service.enabledField] = values[service.enabledField];
                return acc;
            }, {} as Record<string, string | boolean>);

            const payload = {
                ...servicePayload,
                nocobaseHost: String(values.nocobaseHost || '').trim(),
                preferredPreview,
                enablePrint: values.enablePrint,
                enableOpenInNewWindow: values.enableOpenInNewWindow !== false,
                enableFullscreenButton: values.enableFullscreenButton !== false,
                enableMobileAutoFullscreen: values.enableMobileAutoFullscreen === true,
                enableDownload: values.enableDownload,
                basemetasRequestType: values.basemetasRequestType === 'base64' ? 'base64' : 'query',
                enableCopyEmbedHtml: values.enableCopyEmbedHtml !== false,
                copyEmbedHtmlPermission: ['admin', 'user', 'roles'].includes(values.copyEmbedHtmlPermission) ? values.copyEmbedHtmlPermission : 'user',
                copyEmbedHtmlRoles: JSON.stringify(normalizeRoleNames(values.copyEmbedHtmlRoles)),
                ...buildWatermarkSaveState(
                    {
                        watermark: watermarkDraft,
                        watermarkType: watermarkTypeDraft,
                    },
                    {
                        watermark: values.watermark,
                        watermarkType: values.watermarkType === 'global' ? 'global' : 'preview',
                    }
                ),
            };

            await api.request({
                url: 'kkfileviewSettingsSave:save',
                method: 'post',
                data: payload,
                skipNotify: true,
            });

            const changedFields = getChangedFieldNames(payload as Record<string, unknown>, currentRecord);
            if (changedFields.length > 0) {
                const content = buildSavedContentText(payload as Record<string, unknown>, changedFields, currentRecord);
                try {
                    await api.request({
                        url: 'kkfileviewModificationRecords:append',
                        method: 'post',
                        data: {
                            summary: '保存配置',
                            changedFields,
                            content,
                        },
                        skipNotify: true,
                    });
                } catch {
                }
            }

            try {
                const refreshed = await api.request({
                    url: 'kkfileviewSettings:list',
                    skipNotify: true,
                });
                const refreshedRecords = extractSettingsRecords(refreshed);
                if (refreshedRecords.length > 0) {
                    setSettingsRecords(refreshedRecords);
                    updateConfigCache(refreshedRecords[0]);
                } else {
                    updateConfigCache(payload);
                }
            } catch {
                updateConfigCache(payload);
            }

            message.success(t('Saved successfully'));
            setIsDirty(false);
            return true;
        } catch (err: unknown) {
            if (hasErrorFields(err)) return;
            if (isPermissionDeniedError(err)) {
                message.warning(t('No permission to save settings'));
                return false;
            }
            console.error(err);
            message.error(t('Save failed'));
            return false;
        }
    };
    const handleResetExtensions = () => {
        form.setFieldsValue({
            kkfileviewExtensions: DEFAULT_EXTENSIONS,
            basemetasExtensions: DEFAULT_EXTENSIONS,
            microsoftExtensions: DEFAULT_MICROSOFT_EXTENSIONS,
        });
        setIsDirty(true);
        message.success(t('Default file formats restored'));
    };

    const validateServerUrl = (value?: string) => {
        const urlText = String(value || '').trim();
        if (!urlText) return false;
        try {
            const parsed = new URL(urlText);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
            return false;
        }
    };

    const probeBrowserReachability = async (url: string) => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            await fetch(url, {
                method: 'GET',
                mode: 'no-cors',
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            return true;
        } catch {
            return false;
        }
    };

    const handleTestConnection = async (service: PreviewService) => {
        const serviceConfig = PREVIEW_SERVICE_REGISTRY.find((item) => item.key === service);
        if (!serviceConfig) return;
        const target = form.getFieldValue(serviceConfig.hostField);
        if (!validateServerUrl(target)) {
            message.warning(t('Please enter a valid URL for connection test'));
            return;
        }
        if (service === 'microsoft') {
            message.success(t('Microsoft preview uses browser-side access only'));
            return;
        }
        setTestingServices((prev) => ({ ...prev, [service]: true }));
        try {
            const response = await api.request({
                url: 'kkfileviewHealthCheck:check',
                method: 'post',
                data: {
                    url: String(target),
                    service,
                },
                skipNotify: true,
            });
            const payload = getServiceHealthPayload(response);
            if (payload?.message === 'browser-side-service') {
                message.success(t('Microsoft preview uses browser-side access only'));
                return;
            }
            if (payload?.success === true && (payload?.mode === 'ping' || payload?.mode === 'tcp')) {
                message.success(t('Connection test reachable'));
                return;
            }
            if (payload?.success && typeof payload?.status === 'number') {
                message.success(`${t('Connection test reachable')} (HTTP ${payload.status})`);
                return;
            }
            if (payload?.reachable && typeof payload?.status === 'number') {
                message.warning(`${t('Connection test responded with status')} ${payload.status}`);
                return;
            }
            if (payload?.message === 'timeout') {
                message.error(t('Connection test timed out'));
                return;
            }
            const browserReachable = await probeBrowserReachability(String(target));
            if (browserReachable) {
                message.success(t('Connection test reachable'));
                return;
            }
            message.error(t('Connection test failed'));
        } catch (error: unknown) {
            const errorResponse = (error as { response?: unknown })?.response;
            const payload = getServiceHealthPayload(errorResponse);
            if (payload?.message === 'timeout') {
                message.error(t('Connection test timed out'));
            } else if (payload?.message === 'ping-failed') {
                const browserReachable = await probeBrowserReachability(String(target));
                if (browserReachable) {
                    message.success(t('Connection test reachable'));
                } else {
                    message.error(t('Connection test failed'));
                }
            } else {
                message.error(t('Connection test failed'));
            }
        } finally {
            setTestingServices((prev) => ({ ...prev, [service]: false }));
        }
    };

    const handleValuesChange = (changedValues: Partial<SettingsFormValues>, allValues: SettingsFormValues) => {
        setIsDirty(true);
        if (
            Object.prototype.hasOwnProperty.call(changedValues, 'enableKkfileview')
            || Object.prototype.hasOwnProperty.call(changedValues, 'enableBasemetas')
            || Object.prototype.hasOwnProperty.call(changedValues, 'enableMicrosoft')
            || Object.prototype.hasOwnProperty.call(changedValues, 'preferredPreview')
        ) {
            const nextState = {
                enableKkfileview: allValues.enableKkfileview === true,
                enableBasemetas: allValues.enableBasemetas === true,
                enableMicrosoft: allValues.enableMicrosoft === true,
                preferredPreview: (allValues.preferredPreview || 'microsoft') as PreviewEngine,
            };
            setServiceState(nextState);
        }
        if (Object.prototype.hasOwnProperty.call(changedValues, 'watermark')) {
            setWatermarkDraft(String(allValues.watermark || '')); // 兼容外部 setFieldsValue 等路径，确保受控状态始终跟随表单最新值。
        }
        if (Object.prototype.hasOwnProperty.call(changedValues, 'watermarkType')) {
            setWatermarkTypeDraft(allValues.watermarkType === 'global' ? 'global' : 'preview'); // 兼容表单层更新水印类型时同步刷新受控状态。
        }
    };

    const getEnabledServices = () => PREVIEW_SERVICE_REGISTRY.filter((service) => form.getFieldValue(service.enabledField) === true);

    const handleWizardNext = async () => {
        if (wizardStep === 0) {
            if (getEnabledServices().length === 0) {
                message.warning(t('Please enable at least one preview service'));
                return;
            }
            setWizardStep(1);
            return;
        }
        if (wizardStep === 1) {
            const fields = getEnabledServices().map((service) => service.hostField);
            if (fields.length > 0) {
                await form.validateFields(fields);
            }
            setWizardStep(2);
            return;
        }
        if (wizardStep === 2) {
            const enabledServices = getEnabledServices();
            const fields: string[] = enabledServices.map((service) => service.extensionsField);
            await form.validateFields(fields);
            await form.validateFields(['preferredPreview']);
            const saved = await handleSave();
            if (saved) {
                dismissWizard();
                setWizardVisible(false);
                message.success(t('Setup completed'));
            }
        }
    };

    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (!isDirty) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    if (loading) return null;

    return (
        <div style={{ padding: 24 }}>
            <Form
                form={form}
                layout="horizontal"
                labelCol={{ span: 8 }}
                wrapperCol={{ span: 14 }}
                onValuesChange={handleValuesChange}
                initialValues={{
                    kkfileviewHost: DEFAULT_KKFILEVIEW_HOST,
                    basemetasHost: DEFAULT_BASEMETAS_HOST,
                    microsoftHost: DEFAULT_MICROSOFT_HOST,
                    nocobaseHost: '',
                    kkfileviewExtensions: DEFAULT_EXTENSIONS,
                    basemetasExtensions: DEFAULT_EXTENSIONS,
                    microsoftExtensions: DEFAULT_MICROSOFT_EXTENSIONS,
                    enableKkfileview: true,
                    enableBasemetas: false,
                    enableMicrosoft: true,
                    preferredPreview: 'microsoft',
                    enablePrint: false,
                    enableOpenInNewWindow: true,
                    enableFullscreenButton: true,
                    enableMobileAutoFullscreen: false,
                    enableDownload: true,
                    basemetasRequestType: 'query',
                    enableCopyEmbedHtml: true,
                    copyEmbedHtmlPermission: 'user',
                    copyEmbedHtmlRoles: [],
                    watermarkType: 'preview',
                    watermark: '',
                }}
            >
                {wizardVisible ? (
                    <SettingsWizard
                        allServicesOff={allServicesOff}
                        enabledStateMap={enabledStateMap}
                        form={form}
                        onHide={() => {
                            dismissWizard();
                            setWizardVisible(false);
                        }}
                        onNext={handleWizardNext}
                        onPrev={() => setWizardStep((prev) => Math.max(0, prev - 1))}
                        onTestConnection={handleTestConnection}
                        t={t}
                        testingServices={testingServices}
                        validateServerUrl={validateServerUrl}
                        wizardStep={wizardStep}
                    />
                ) : (
                    <SettingsToolbar
                        activePanel={activePanel}
                        onPanelChange={setActivePanel}
                        onReset={handleResetExtensions}
                        onSave={() => {
                            void handleSave();
                        }}
                        t={t}
                    />
                )}

                <BasicSettingsCard
                    allServicesOff={allServicesOff}
                    enabledStateMap={enabledStateMap}
                    t={t}
                    visible={!wizardVisible && activePanel === 'basic'}
                />

                <AdvancedSettingsCard
                    onTestConnection={handleTestConnection}
                    onWatermarkChange={handleWatermarkChange}
                    onWatermarkTypeChange={handleWatermarkTypeChange}
                    t={t}
                    testingServices={testingServices}
                    validateServerUrl={validateServerUrl}
                    visible={!wizardVisible && activePanel === 'advanced'}
                    watermark={watermarkDraft}
                    watermarkType={watermarkTypeDraft}
                />

                <ModificationRecordsCard
                    clearing={clearingRecords}
                    deletingKey={deletingRecordKey}
                    loading={modificationLoading}
                    onClear={() => {
                        void handleClearRecords();
                    }}
                    onDelete={(key) => {
                        void handleDeleteRecord(key);
                    }}
                    onRefresh={() => {
                        void loadModificationRecords(true);
                    }}
                    records={modificationRecords}
                    t={t}
                    visible={!wizardVisible && activePanel === 'history'}
                />

                <PreviewRecordsCard
                    clearing={clearingPreviewRecords}
                    deletingKey={deletingPreviewRecordKey}
                    loading={previewLoading}
                    onClear={() => {
                        void handleClearPreviewRecords();
                    }}
                    onDelete={(key) => {
                        void handleDeletePreviewRecord(key);
                    }}
                    onRefresh={() => {
                        void loadPreviewRecords(true);
                    }}
                    records={previewRecords}
                    t={t}
                    visible={!wizardVisible && activePanel === 'previewRecords'}
                />

                <FieldCleanupCard
                    loading={cleanupLoading}
                    message={cleanupMessage}
                    onRun={() => {
                        void handleRunFieldCleanup();
                    }}
                    t={t}
                    visible={!wizardVisible && activePanel === 'cleanup'}
                />

            </Form>
        </div>
    );
};

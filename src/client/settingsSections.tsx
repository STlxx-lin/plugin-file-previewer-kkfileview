/**
 * @jsxRuntime classic
 * 旧版 `/admin` 入口强制使用 classic JSX runtime，避免开发态 `jsx-dev-runtime` 与旧后台 React 加载链路冲突。
 */
import React, { useState } from 'react';
import { AppstoreOutlined, SettingOutlined, EyeOutlined, CopyOutlined, CheckOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, InputNumber, Modal, Popconfirm, Radio, Select, Space, Steps, Switch, Table, Typography, Tag, Tooltip, Row, Col, Progress, Statistic, Alert, Divider, Badge, Tabs, Descriptions } from 'antd';
import type { FormInstance } from 'antd';
import {
  DEFAULT_EXTENSIONS,
  DEFAULT_MICROSOFT_EXTENSIONS,
  EmbedCodePermission,
  PREVIEW_SERVICE_REGISTRY,
  PreviewEngine,
  PreviewService,
} from './configCache';
import { parseExtensionsInput } from './previewUtils';

type Translation = (key: string) => string;

export type SettingsActivePanel = 'basic' | 'advanced' | 'history' | 'previewRecords' | 'cleanup';

export type DownloadProgressState = {
  status: 'idle' | 'searching' | 'downloading' | 'extracting' | 'copying' | 'completed' | 'error';
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  speedBytesPerSec: number;
  speedText: string;
  downloadedText: string;
  totalText: string;
  message: string;
  error?: string;
};

export type ChangeDetail = {
  field: string;
  fieldLabelKey: string;
  before?: string;
  after?: string;
  raw?: string;
};

export type ModificationRecordItem = {
  key: string;
  time: string;
  operator: string;
  change: string;
  content?: string;
  changedFields?: string[];
};

export type PreviewRecordItem = {
  key: string;
  time: string;
  operator: string;
  service: string;
  file: string;
};

const CHINESE_LABEL_TO_KEY_MAP: Record<string, string> = {
  '主机地址': 'host',
  'kkFileView 主机地址': 'kkfileviewHost',
  'BaseMetas 服务地址': 'basemetasHost',
  '微软在线服务地址': 'microsoftHost',
  'File Viewer 资源基础路径': 'fileViewerAssetBase',
  '系统公共访问地址': 'nocobaseHost',
  '文件格式': 'extensions',
  'kkFileView 文件格式': 'kkfileviewExtensions',
  'BaseMetas 文件格式': 'basemetasExtensions',
  '微软在线文件格式': 'microsoftExtensions',
  'File Viewer 文件格式': 'fileViewerExtensions',
  '优先预览': 'preferredPreview',
  'BaseMetas 请求类型': 'basemetasRequestType',
  'BaseMetas 文件获取方式': 'basemetasFileAccess',
  'kkFileView 文件获取方式': 'kkfileviewFileAccess',
  '新窗口按钮': 'enableOpenInNewWindow',
  '新窗口按鈕': 'enableOpenInNewWindow',
  '全屏按钮': 'enableFullscreenButton',
  '全屏按鈕': 'enableFullscreenButton',
  '移动端自动全屏': 'enableMobileAutoFullscreen',
  '下载按钮': 'enableDownload',
  '下载按鈕': 'enableDownload',
  'File Viewer 默认加载模式': 'fileViewerLoadMode',
  '启用 kkFileView': 'enableKkfileview',
  '启用 BaseMetas': 'enableBasemetas',
  '启用微软在线': 'enableMicrosoft',
  '启用 File Viewer': 'enableFileViewer',
  '水印类型': 'watermarkType',
  '水印内容': 'watermark',
};

export const FIELD_KEY_TO_I18N_LABEL: Record<string, string> = {
  host: 'kkFileView Server Address',
  kkfileviewHost: 'kkFileView Server Address',
  basemetasHost: 'BaseMetas Server Address',
  microsoftHost: 'Microsoft Server Address',
  fileViewerAssetBase: 'File Viewer Asset Base',
  nocobaseHost: 'System Public Host Address',
  extensions: 'Supported File Formats',
  kkfileviewExtensions: 'kkFileView File Extensions',
  basemetasExtensions: 'BaseMetas File Extensions',
  microsoftExtensions: 'Microsoft File Extensions',
  fileViewerExtensions: 'File Viewer File Extensions',
  preferredPreview: 'Preferred Preview Engine',
  basemetasRequestType: 'BaseMetas Request Type',
  basemetasFileAccess: 'BaseMetas File Access Mode',
  kkfileviewFileAccess: 'kkFileView File Access Mode',
  enableOpenInNewWindow: 'Enable Open In New Window Button',
  enableFullscreenButton: 'Enable Fullscreen Button',
  enableMobileAutoFullscreen: 'Enable Mobile Auto Fullscreen',
  enableDownload: 'Enable File Download',
  enableKkfileview: 'Enable kkFileView Engine',
  enableBasemetas: 'Enable BaseMetas Engine',
  enableMicrosoft: 'Enable Microsoft Engine',
  enableFileViewer: 'Enable File Viewer Engine',
  fileViewerLoadMode: 'File Viewer Default Load Mode',
  watermarkType: 'Watermark Scope',
  watermark: 'Watermark Content',
  watermarkOpacity: 'Watermark Opacity',
  watermarkRotate: 'Watermark Rotation Angle',
  watermarkColor: 'Watermark Color',
  copyEmbedHtmlPermission: 'Copy Embed HTML Permission',
  copyEmbedHtmlRoles: 'Allowed Copy Roles',
  enableCopyEmbedHtml: 'Enable Copy Embed HTML Button',
};

export const FIELD_CATEGORY_MAP: Record<string, string> = {
  host: 'kkFileView',
  kkfileviewHost: 'kkFileView',
  kkfileviewExtensions: 'kkFileView',
  kkfileviewFileAccess: 'kkFileView',
  enableKkfileview: 'kkFileView',

  basemetasHost: 'BaseMetas',
  basemetasExtensions: 'BaseMetas',
  basemetasRequestType: 'BaseMetas',
  basemetasFileAccess: 'BaseMetas',
  enableBasemetas: 'BaseMetas',

  microsoftHost: 'Microsoft',
  microsoftExtensions: 'Microsoft',
  enableMicrosoft: 'Microsoft',

  fileViewerAssetBase: 'File Viewer',
  fileViewerExtensions: 'File Viewer',
  fileViewerLoadMode: 'File Viewer',
  enableFileViewer: 'File Viewer',

  preferredPreview: 'Global',
  nocobaseHost: 'Global',
  enableOpenInNewWindow: 'UI & Features',
  enableFullscreenButton: 'UI & Features',
  enableMobileAutoFullscreen: 'UI & Features',
  enableDownload: 'UI & Features',
  enableCopyEmbedHtml: 'UI & Features',
  copyEmbedHtmlPermission: 'Permissions',
  copyEmbedHtmlRoles: 'Permissions',

  watermarkType: 'Watermark',
  watermark: 'Watermark',
  watermarkOpacity: 'Watermark',
  watermarkRotate: 'Watermark',
  watermarkColor: 'Watermark',
};

export const getFieldCategoryLabel = (rawKeyOrLabel: string, t: Translation): string => {
  const raw = String(rawKeyOrLabel || '').trim();
  const normalizedKey = CHINESE_LABEL_TO_KEY_MAP[raw] || raw;
  const category = FIELD_CATEGORY_MAP[normalizedKey] || 'General';
  return t(category);
};

export const truncateValue = (val?: string, maxLen = 14): string => {
  const text = String(val || '').trim();
  if (!text) return '空';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
};

export const formatFriendlyValue = (val: string | undefined, field: string | undefined, t: Translation) => {
  if (val === undefined || val === null) {
    return <Typography.Text type="secondary">-</Typography.Text>;
  }
  const text = String(val).trim();
  if (!text || text === '空') {
    return <Tag style={{ color: '#8c8c8c', background: '#f5f5f5', borderColor: '#d9d9d9' }}>{t('Empty')}</Tag>;
  }

  if (text === 'true') {
    return <Tag color="success">🟢 {t('Enabled')}</Tag>;
  }
  if (text === 'false') {
    return <Tag color="default">🔴 {t('Disabled')}</Tag>;
  }

  if (field && (field.includes('Extensions') || field === 'extensions')) {
    let tokens: string[] = [];
    if (text.startsWith('[') && text.endsWith(']')) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) tokens = parsed.map(s => String(s).trim()).filter(Boolean);
      } catch {}
    }
    if (tokens.length === 0) {
      tokens = text.split(/[,,\s]+/).map(s => s.trim()).filter(Boolean);
    }
    if (tokens.length > 0) {
      return (
        <Space size={4} wrap>
          {tokens.map(token => (
            <Tag key={token} color="blue" style={{ fontFamily: 'monospace' }}>{token}</Tag>
          ))}
        </Space>
      );
    }
  }

  return <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace' }}>{text}</span>;
};

export const getTranslatedFieldLabel = (rawKeyOrLabel: string, t: Translation): string => {
  const raw = String(rawKeyOrLabel || '').trim();
  if (!raw) return '-';
  const normalizedKey = CHINESE_LABEL_TO_KEY_MAP[raw] || raw;
  const i18nKey = FIELD_KEY_TO_I18N_LABEL[normalizedKey];
  if (i18nKey) {
    return t(i18nKey);
  }
  const directTrans = t(normalizedKey);
  if (directTrans && directTrans !== normalizedKey) {
    return directTrans;
  }
  return raw;
};

export const parseChangeDetails = (
  content?: string,
  change?: string,
  changedFields?: string[]
): ChangeDetail[] => {
  const rawContent = String(content || '').trim();

  const normalizeTextForFilter = (val?: string): string => {
    const s = String(val || '').trim();
    if (!s || s === '空' || s === '[]' || s === '""' || s === "''") return '';
    if (s.includes(',')) {
      return s.split(',').map((x) => x.trim()).filter(Boolean).sort().join(',');
    }
    return s;
  };

  const filterPseudoChanges = (items: ChangeDetail[]): ChangeDetail[] => {
    return items.filter((item) => {
      if (item.before !== undefined && item.after !== undefined) {
        const nb = normalizeTextForFilter(item.before);
        const na = normalizeTextForFilter(item.after);
        if (nb === na) return false;
      }
      return true;
    });
  };

  // 1. 结构化 JSON 格式解析（支持数组或包含 changes 属性的对象）
  let resultList: ChangeDetail[] = [];
  if ((rawContent.startsWith('[') && rawContent.endsWith(']')) || (rawContent.startsWith('{') && rawContent.endsWith('}'))) {
    try {
      const parsed = JSON.parse(rawContent);
      const items = Array.isArray(parsed)
        ? parsed
        : (Array.isArray(parsed?.changes) ? parsed.changes : []);
      if (items.length > 0) {
        resultList = items.map((item: any) => ({
          field: String(item.field || item.key || ''),
          fieldLabelKey: String(item.field || item.key || item.label || ''),
          before: item.before !== undefined ? String(item.before) : undefined,
          after: item.after !== undefined ? String(item.after) : undefined,
          raw: item.raw ? String(item.raw) : undefined,
        }));
        return filterPseudoChanges(resultList);
      }
    } catch {
      // ignore
    }
  }

  // 2. 文本解析: "label（修改前）: A | label（修改后）: B" 格式或冒号分隔格式
  const rawText = rawContent || String(change || '').trim();
  if (rawText) {
    const parts = rawText.split('|').map((s) => s.trim()).filter(Boolean);
    const beforeMap = new Map<string, string>();
    const afterMap = new Map<string, string>();
    const unparsed: string[] = [];

    for (const part of parts) {
      const beforeMatch = part.match(/^(.*?)（修改前）\s*:\s*(.*)$/);
      const afterMatch = part.match(/^(.*?)（修改后）\s*:\s*(.*)$/);
      if (beforeMatch) {
        beforeMap.set(beforeMatch[1].trim(), beforeMatch[2].trim());
      } else if (afterMatch) {
        afterMap.set(afterMatch[1].trim(), afterMatch[2].trim());
      } else {
        unparsed.push(part);
      }
    }

    const allKeys = Array.from(new Set([...beforeMap.keys(), ...afterMap.keys()]));
    if (allKeys.length > 0) {
      resultList = allKeys.map((k) => ({
        field: k,
        fieldLabelKey: k,
        before: beforeMap.get(k),
        after: afterMap.get(k),
      }));
      return filterPseudoChanges(resultList);
    }

    if (parts.length > 0) {
      resultList = parts.map((part) => {
        const idx = part.indexOf(':');
        if (idx > 0) {
          const k = part.slice(0, idx).trim();
          const v = part.slice(idx + 1).trim();
          return { field: k, fieldLabelKey: k, after: v, raw: part };
        }
        return { field: part, fieldLabelKey: part, raw: part };
      });
      return filterPseudoChanges(resultList);
    }
  }

  // 3. 回退到 changedFields 数组
  if (Array.isArray(changedFields) && changedFields.length > 0) {
    resultList = changedFields.map((f) => ({
      field: String(f).trim(),
      fieldLabelKey: String(f).trim(),
    }));
    return filterPseudoChanges(resultList);
  }

  return [];
};

type ToolbarProps = {
  activePanel: SettingsActivePanel;
  onPanelChange: (value: SettingsActivePanel) => void;
  onReset: () => void;
  onSave: () => void;
  t: Translation;
};

type WizardProps = {
  allServicesOff: boolean;
  enabledStateMap: Record<PreviewService, boolean>;
  form: FormInstance;
  onHide: () => void;
  onNext: () => void;
  onPrev: () => void;
  onTestConnection: (service: PreviewService) => void;
  t: Translation;
  testingServices: Record<PreviewService, boolean>;
  validateServerUrl: (value?: string) => boolean;
  wizardStep: number;
};

type BasicProps = {
  allServicesOff: boolean;
  enabledStateMap: Record<PreviewService, boolean>;
  visible: boolean;
  t: Translation;
  onTestConnection?: (service: PreviewService) => void;
  testingServices?: Record<PreviewService, boolean>;
  validateServerUrl?: (value?: string) => boolean;
  fileViewerDownloaded?: boolean;
  downloadingFileViewer?: boolean;
  onDownloadFileViewer?: () => void;
  downloadProgress?: DownloadProgressState | null;
  form?: FormInstance;
};

type AdvancedProps = {
  onTestConnection?: (service: PreviewService) => void;
  onWatermarkChange: (value: string) => void;
  onWatermarkTypeChange: (value: 'global' | 'preview') => void;
  t: Translation;
  testingServices?: Record<PreviewService, boolean>;
  validateServerUrl?: (value?: string) => boolean;
  visible: boolean;
  watermark: string;
  watermarkType: 'global' | 'preview';
  fileViewerDownloaded?: boolean;
  downloadingFileViewer?: boolean;
  onDownloadFileViewer?: () => void;
  downloadProgress?: DownloadProgressState | null;
};

type HistoryProps = {
  clearing: boolean;
  deletingKey?: string | null;
  onClear: () => void;
  onDelete: (key: string) => void;
  loading: boolean;
  onRefresh: () => void;
  records: ModificationRecordItem[];
  t: Translation;
  visible: boolean;
};

type PreviewHistoryProps = {
  clearing: boolean;
  deletingKey?: string | null;
  loading: boolean;
  onClear: () => void;
  onDelete: (key: string) => void;
  onRefresh: () => void;
  records: PreviewRecordItem[];
  t: Translation;
  visible: boolean;
};

type CleanupResult = {
  migratedCount: number;
  cleanedCount: number;
  message: string;
  executedAt: string; // ISO 时间字符串
};

type CleanupProps = {
  loading: boolean;
  result?: CleanupResult;
  onRun: () => void;
  t: Translation;
  visible: boolean;
};

const getHostLabel = (service: PreviewService) =>
  service === 'kkfileview'
    ? 'kkFileView Server Address'
    : service === 'basemetas'
      ? 'BaseMetas Server Address'
      : service === 'fileViewer'
        ? 'File Viewer Asset Base'
        : 'Microsoft Server Address';

const getHostPlaceholder = (service: PreviewService) =>
  service === 'kkfileview'
    ? 'e.g., http://127.0.0.1:8012'
    : service === 'basemetas'
      ? 'e.g., https://fileview.basemetas.cn'
      : service === 'fileViewer'
        ? 'Leave empty to resolve from runtime public path'
        : 'e.g., https://view.officeapps.live.com/op/embed.aspx';

const getExtensionLabel = (service: PreviewService) =>
  service === 'kkfileview'
    ? 'kkFileView File Formats'
    : service === 'basemetas'
      ? 'BaseMetas File Formats'
      : service === 'fileViewer'
        ? 'File Viewer File Formats'
        : 'Microsoft File Formats';

const getExtensionExtra = (service: PreviewService) =>
  service === 'kkfileview'
    ? 'Select file formats for kkFileView preview service'
    : service === 'basemetas'
      ? 'Select file formats for BaseMetas preview service'
      : service === 'fileViewer'
        ? 'Select file formats for File Viewer preview service'
        : 'Select file formats for Microsoft online preview service';

const buildHostRules = (
  service: PreviewService,
  t: Translation,
  validateServerUrl: (value?: string) => boolean,
) => {
  if (service === 'fileViewer') {
    return [
      {
        validator: async (_: unknown, value: string) => {
          const rawValue = String(value || '').trim();
          if (!rawValue) return;
          if (rawValue.startsWith('/') || validateServerUrl(rawValue)) return;
          throw new Error(t('Please enter a valid File Viewer asset base'));
        },
      },
    ];
  }
  return [
    { required: true, message: t('Please enter the server address') },
    {
      validator: async (_: unknown, value: string) => {
        if (!validateServerUrl(value)) {
          throw new Error(t('Please enter a valid URL with http or https'));
        }
      },
    },
  ];
};

const buildExtensionRules = (t: Translation) => [
  {
    validator: async (_: unknown, value: string[]) => {
      const normalized = parseExtensionsInput(value || []);
      if (normalized.length === 0) {
        throw new Error(t('Please enter at least one file format'));
      }
      const invalid = normalized.find((item) => !/^[a-z0-9]+$/i.test(item));
      if (invalid) {
        throw new Error(t('File format can only contain letters and numbers'));
      }
    },
  },
];

const renderServiceHostField = (
  service: (typeof PREVIEW_SERVICE_REGISTRY)[number],
  t: Translation,
  validateServerUrl: (value?: string) => boolean,
  onTestConnection: (service: PreviewService) => void,
  testingServices: Record<PreviewService, boolean>,
) => (
  <Form.Item
    key={`${service.key}-host`}
    name={service.hostField}
    label={t(getHostLabel(service.key))}
    rules={buildHostRules(service.key, t, validateServerUrl)}
  >
    <Input
      placeholder={t(getHostPlaceholder(service.key))}
      addonAfter={service.key === 'fileViewer' ? undefined : (
        <Button
          type="link"
          size="small"
          loading={testingServices[service.key]}
          onClick={() => onTestConnection(service.key)}
        >
          {t('Test')}
        </Button>
      )}
    />
  </Form.Item>
);

const renderServiceExtensionsField = (
  service: (typeof PREVIEW_SERVICE_REGISTRY)[number],
  t: Translation,
) => (
  <Form.Item
    key={`${service.key}-extensions`}
    name={service.extensionsField}
    label={t(getExtensionLabel(service.key))}
    extra={t(getExtensionExtra(service.key))}
    rules={buildExtensionRules(t)}
  >
    <Select
      mode="tags"
      tokenSeparators={[',', ' ', ';']}
      placeholder={t('e.g. doc,docx,xls,xlsx,ppt,pptx,pdf')}
      options={parseExtensionsInput(
        service.key === 'microsoft' ? DEFAULT_MICROSOFT_EXTENSIONS : DEFAULT_EXTENSIONS,
      ).map((item) => ({
        label: item,
        value: item,
      }))}
    />
  </Form.Item>
);



export const SettingsToolbar = ({
  activePanel,
  onPanelChange,
  onReset,
  onSave,
  t,
}: ToolbarProps) => (
  <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <Radio.Group
      value={activePanel}
      onChange={(e) => onPanelChange(e.target.value as SettingsActivePanel)}
      optionType="button"
      buttonStyle="solid"
    >
      <Radio.Button value="basic">
        <Space size={6}>
          <AppstoreOutlined />
          <span>{t('Basic Settings')}</span>
        </Space>
      </Radio.Button>
      <Radio.Button value="advanced">
        <Space size={6}>
          <SettingOutlined />
          <span>{t('Advanced Settings')}</span>
        </Space>
      </Radio.Button>
      <Radio.Button value="history">
        <Space size={6}>
          <span>{t('Modification Records')}</span>
        </Space>
      </Radio.Button>
      <Radio.Button value="previewRecords">
        <Space size={6}>
          <span>{t('Preview Records')}</span>
        </Space>
      </Radio.Button>
      <Radio.Button value="cleanup">
        <Space size={6}>
          <span>{t('Field Cleanup')}</span>
        </Space>
      </Radio.Button>
    </Radio.Group>
    <Space>
      <Button onClick={onReset}>
        {t('Reset to Default')}
      </Button>
      <Button type="primary" onClick={onSave}>
        {t('Save')}
      </Button>
    </Space>
  </div>
);

export const SettingsWizard = ({
  allServicesOff,
  enabledStateMap,
  onHide,
  onNext,
  onPrev,
  onTestConnection,
  t,
  testingServices,
  validateServerUrl,
  wizardStep,
}: WizardProps) => (
  <Card bordered={false} title={t('First-time Setup Wizard')}>
    <Steps
      current={wizardStep}
      items={[
        { title: t('Select Preview Services') },
        { title: t('Configure Service Addresses') },
        { title: t('Configure File Formats') },
      ]}
      style={{ marginBottom: 24 }}
    />
    <div style={{ display: wizardStep === 0 ? 'block' : 'none' }}>
      {PREVIEW_SERVICE_REGISTRY.map((service) => (
        <Form.Item
          key={`wizard-${service.key}-enabled`}
          name={service.enabledField}
          label={t(service.title)}
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
      ))}
    </div>
    <div style={{ display: wizardStep === 1 ? 'block' : 'none' }}>
      {PREVIEW_SERVICE_REGISTRY.map((service) => renderServiceHostField(service, t, validateServerUrl, onTestConnection, testingServices))}
    </div>
    <div style={{ display: wizardStep === 2 ? 'block' : 'none' }}>
      {PREVIEW_SERVICE_REGISTRY.map((service) => renderServiceExtensionsField(service, t))}
      <Form.Item name="preferredPreview" label={t('Preferred Preview')}>
        <Radio.Group disabled={allServicesOff}>
          {PREVIEW_SERVICE_REGISTRY.map((service) => (
            <Radio.Button
              key={`wizard-${service.key}-preferred`}
              value={service.key}
              disabled={enabledStateMap[service.key] !== true}
            >
              {t(service.title)}
            </Radio.Button>
          ))}
        </Radio.Group>
      </Form.Item>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
      <Button onClick={onHide}>
        {t('Skip Wizard')}
      </Button>
      <Space>
        <Button onClick={onPrev} disabled={wizardStep === 0}>
          {t('Previous')}
        </Button>
        <Button type="primary" onClick={onNext}>
          {wizardStep === 2 ? t('Finish Setup') : t('Next')}
        </Button>
      </Space>
    </div>
  </Card>
);

export const BasicSettingsCard = ({
  allServicesOff,
  enabledStateMap,
  t,
  visible,
  onTestConnection,
  testingServices = { kkfileview: false, basemetas: false, microsoft: false, fileViewer: false },
  fileViewerDownloaded,
  downloadingFileViewer,
  onDownloadFileViewer,
  downloadProgress,
  form,
}: BasicProps) => {
  const [configModalService, setConfigModalService] = useState<PreviewService | null>(null);

  const activeService = PREVIEW_SERVICE_REGISTRY.find((s) => s.key === configModalService);

  return (
    <Card bordered={false} title={t('Basic Settings')} style={{ display: visible ? 'block' : 'none' }}>
      <Card
        size="small"
        bordered={false}
        title={t('Preview Service Switches')}
        style={{ marginBottom: 16, background: '#fafafa', border: '1px solid #f0f0f0' }}
        bodyStyle={{ padding: 16 }}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          {t('Enable or disable each preview service')}
        </Typography.Paragraph>
        <Row gutter={[12, 12]}>
          {PREVIEW_SERVICE_REGISTRY.map((service) => (
            <Col key={`${service.key}-enabled`} xs={24} md={12}>
              <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
                <Space align="center">
                  <Typography.Text strong>{t(service.title)}</Typography.Text>
                  {service.key === 'fileViewer' && (
                    <Tag color={fileViewerDownloaded ? 'green' : 'orange'} style={{ margin: 0 }}>
                      {fileViewerDownloaded ? t('Static files ready (Local Mode)') : t('Static files missing (CDN Mode)')}
                    </Tag>
                  )}
                </Space>
                <Space size={4} align="center">
                  <Tooltip title={`${t('Configure')} ${t(service.title)}`}>
                    <Button
                      type="text"
                      size="small"
                      icon={<SettingOutlined />}
                      onClick={() => setConfigModalService(service.key)}
                    />
                  </Tooltip>
                  <Form.Item
                    name={service.enabledField}
                    valuePropName="checked"
                    noStyle
                  >
                    <Switch />
                  </Form.Item>
                </Space>
              </div>
            </Col>
          ))}
        </Row>
        <div style={{ marginTop: 16 }}>
          <Typography.Text strong>{t('Preferred Preview')}</Typography.Text>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 8, marginTop: 4, fontSize: 12 }}>
            {t('Select the default preview engine, or disable all service previews')}
          </Typography.Paragraph>
          <Form.Item
            name="preferredPreview"
            style={{ marginBottom: 0 }}
            labelCol={{ span: 0 }}
            wrapperCol={{ span: 24 }}
          >
            <Radio.Group disabled={allServicesOff} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {PREVIEW_SERVICE_REGISTRY.map((service) => (
                <Radio.Button
                  key={service.key}
                  value={service.key}
                  disabled={enabledStateMap[service.key] !== true}
                >
                  {t(service.title)}
                </Radio.Button>
              ))}
            </Radio.Group>
          </Form.Item>
        </div>
      </Card>

      {/* 服务配置专属 Modal 弹窗 */}
      <Modal
        title={
          activeService ? (
            <Space align="center" size={8}>
              <SettingOutlined style={{ fontSize: 18, color: '#1677ff' }} />
              <Typography.Title level={5} style={{ margin: 0 }}>
                {`${t(activeService.title)} ${t('Settings')}`}
              </Typography.Title>
            </Space>
          ) : (
            t('Service Settings')
          )
        }
        open={Boolean(configModalService)}
        onCancel={() => setConfigModalService(null)}
        footer={[
          <Button type="primary" key="ok" size="middle" style={{ minWidth: 88 }} onClick={() => setConfigModalService(null)}>
            {t('Confirm')}
          </Button>,
        ]}
        width={760}
        bodyStyle={{ padding: '20px 24px' }}
      >
        {activeService && (
          <Space direction="vertical" style={{ width: '100%' }} size={20}>
            {/* 1. 服务器主机地址与连通性测试 */}
            <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '16px' }}>
              <Form.Item
                name={activeService.hostField}
                preserve={true}
                label={<Typography.Text strong>{t('Server Address')}</Typography.Text>}
                extra={
                  activeService.key === 'microsoft'
                    ? t('Microsoft preview uses browser-side access only')
                    : t('Configure server address for this service')
                }
                style={{ marginBottom: 0 }}
              >
                <Input
                  size="large"
                  placeholder={
                    activeService.key === 'kkfileview'
                      ? t('e.g., http://127.0.0.1:8012')
                      : activeService.key === 'basemetas'
                        ? t('e.g., https://fileview.basemetas.cn')
                        : activeService.key === 'microsoft'
                          ? t('e.g., https://view.officeapps.live.com/op/embed.aspx')
                          : '/assets/file-viewer/'
                  }
                  addonAfter={
                    onTestConnection ? (
                      <Button
                        type="link"
                        size="small"
                        loading={testingServices[activeService.key]}
                        onClick={() => onTestConnection(activeService.key)}
                      >
                        {t('Test')}
                      </Button>
                    ) : null
                  }
                />
              </Form.Item>
            </div>

            {/* 2. BaseMetas 专属：请求类型控制 */}
            {activeService.key === 'basemetas' && (
              <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '16px' }}>
                <Form.Item
                  name="basemetasRequestType"
                  preserve={true}
                  label={<Typography.Text strong>{t('BaseMetas Request Type')}</Typography.Text>}
                  extra={t('Select how BaseMetas preview URL is generated')}
                  style={{ marginBottom: 0 }}
                >
                  <Radio.Group size="middle">
                    <Radio value="query">{t('Query Parameters')}</Radio>
                    <Radio value="base64">{t('Base64 Encoded')}</Radio>
                  </Radio.Group>
                </Form.Item>
              </div>
            )}

            {/* 2b. BaseMetas 专属：文件获取方式控制 */}
            {activeService.key === 'basemetas' && (
              <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '16px' }}>
                <Form.Item
                  name="basemetasFileAccess"
                  preserve={true}
                  label={<Typography.Text strong>{t('BaseMetas File Access Mode')}</Typography.Text>}
                  extra={t(
                    'Proxy Mode: file is streamed through the NocoBase proxy (suitable when the object storage is internal-only). Direct Mode: the preview service downloads the file directly from the file server (suitable when the file server is reachable by the preview service).',
                  )}
                  style={{ marginBottom: 0 }}
                >
                  <Radio.Group size="middle">
                    <Radio value="direct">{t('Direct Mode (default, file server accessible)')}</Radio>
                    <Radio value="proxy">{t('Proxy Mode (via NocoBase)')}</Radio>
                  </Radio.Group>
                </Form.Item>
              </div>
            )}

            {/* 2c. kkFileView 专属：文件获取方式控制 */}
            {activeService.key === 'kkfileview' && (
              <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '16px' }}>
                <Form.Item
                  name="kkfileviewFileAccess"
                  preserve={true}
                  label={<Typography.Text strong>{t('kkFileView File Access Mode')}</Typography.Text>}
                  extra={t(
                    'Direct Mode: kkFileView downloads the file directly from its real location (suitable when the file server is reachable by kkFileView). Proxy Mode: file is streamed through the NocoBase proxy (suitable when the object storage is internal-only).',
                  )}
                  style={{ marginBottom: 0 }}
                >
                  <Radio.Group size="middle">
                    <Radio value="direct">{t('Direct Mode (default, file server accessible)')}</Radio>
                    <Radio value="proxy">{t('Proxy Mode (via NocoBase)')}</Radio>
                  </Radio.Group>
                </Form.Item>
              </div>
            )}

            {/* 3. File Viewer 专属：离线模式与加载模式 */}
            {activeService.key === 'fileViewer' && (
              <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '16px' }}>
                <Form.Item
                  name="fileViewerLoadMode"
                  preserve={true}
                  label={<Typography.Text strong>{t('File Viewer Default Load Mode')}</Typography.Text>}
                  extra={t(
                    'CDN Mode (default): File Viewer loads its runtime from the public CDN. Static Mode: local static files are served first, and the mode automatically switches to CDN when no local static files exist.',
                  )}
                  style={{ marginBottom: 16 }}
                >
                  <Radio.Group size="middle">
                    <Radio value="cdn">{t('CDN Mode (default, direct link)')}</Radio>
                    <Radio value="proxy">{t('Static Mode (local static files)')}</Radio>
                  </Radio.Group>
                </Form.Item>

                <Card size="small" style={{ background: '#fff', border: '1px solid #e8e8e8', borderRadius: 6 }}>
                  <Typography.Text strong>{t('Download Static Files')}</Typography.Text>
                  <Typography.Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 12, fontSize: 12 }}>
                    {t(
                      'Local static files will be served first. No external internet connection is required for File Viewer.',
                    )}
                  </Typography.Paragraph>

                  {downloadingFileViewer && downloadProgress && downloadProgress.status !== 'idle' ? (
                    <Space direction="vertical" style={{ width: '100%' }} size={4}>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {downloadProgress.status === 'downloading'
                          ? `${t('Downloading...')} ${downloadProgress.downloadedText} (${downloadProgress.speedText})`
                          : downloadProgress.status === 'extracting'
                            ? t('Extracting static files...')
                            : t('Processing...')}
                      </Typography.Text>
                      <Progress percent={downloadProgress.percent} size="small" status="active" />
                    </Space>
                  ) : (
                    <Button
                      type={fileViewerDownloaded ? 'default' : 'primary'}
                      size="middle"
                      loading={downloadingFileViewer}
                      onClick={onDownloadFileViewer}
                    >
                      {fileViewerDownloaded ? t('Re-download') : t('Download Static Files')}
                    </Button>
                  )}
                </Card>
              </div>
            )}

            {/* 4. 文件格式矩阵配置 */}
            <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: '16px' }}>
              <Form.Item
                name={activeService.extensionsField}
                preserve={true}
                label={<Typography.Text strong>{t('Enabled File Formats')}</Typography.Text>}
                extra={t('Select file formats for this preview service')}
                style={{ marginBottom: 0 }}
              >
                <Select
                  mode="tags"
                  size="large"
                  style={{ width: '100%' }}
                  placeholder={t('e.g. doc,docx,xls,xlsx,ppt,pptx,pdf')}
                  tokenSeparators={[',', ' ']}
                />
              </Form.Item>
            </div>
          </Space>
        )}
      </Modal>
    <Card
      size="small"
      bordered={false}
      title={t('Preview Dialog Buttons')}
      style={{ marginBottom: 16, background: '#fafafa', border: '1px solid #f0f0f0' }}
      bodyStyle={{ padding: 16 }}
    >
      <Row gutter={[12, 12]}>
        <Col xs={24} md={12}>
          <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Typography.Text strong>{t('Enable Open In New Window Button')}</Typography.Text>
              <Form.Item
                name="enableOpenInNewWindow"
                valuePropName="checked"
                noStyle
              >
                <Switch />
              </Form.Item>
            </div>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 6, fontSize: 12 }}>
              {t('Show open in new window button in preview dialog (enabled by default)')}
            </Typography.Paragraph>
          </div>
        </Col>
        <Col xs={24} md={12}>
          <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Typography.Text strong>{t('Enable Fullscreen Button')}</Typography.Text>
              <Form.Item
                name="enableFullscreenButton"
                valuePropName="checked"
                noStyle
              >
                <Switch />
              </Form.Item>
            </div>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 6, fontSize: 12 }}>
              {t('Show fullscreen button in preview dialog (enabled by default)')}
            </Typography.Paragraph>
          </div>
        </Col>
        <Col xs={24} md={12}>
          <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Typography.Text strong>{t('Enable Mobile Auto Fullscreen')}</Typography.Text>
              <Form.Item
                name="enableMobileAutoFullscreen"
                valuePropName="checked"
                noStyle
              >
                <Switch />
              </Form.Item>
            </div>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 6, fontSize: 12 }}>
              {t('Automatically enter fullscreen preview on mobile devices (disabled by default)')}
            </Typography.Paragraph>
          </div>
        </Col>
        <Col xs={24} md={12}>
          <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Typography.Text strong>{t('Enable Download Button')}</Typography.Text>
              <Form.Item
                name="enableDownload"
                valuePropName="checked"
                noStyle
              >
                <Switch />
              </Form.Item>
            </div>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 6, fontSize: 12 }}>
              {t('Show download button in preview dialog (enabled by default)')}
            </Typography.Paragraph>
          </div>
        </Col>
        <Col xs={24} md={24}>
          <div style={{ background: '#fff', border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Typography.Text strong>{t('Enable Copy Embed Button')}</Typography.Text>
              <Form.Item
                name="enableCopyEmbedHtml"
                valuePropName="checked"
                noStyle
              >
                <Switch />
              </Form.Item>
            </div>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 6, fontSize: 12 }}>
              {t('Show copy embed code button in preview dialog')}
            </Typography.Paragraph>

            <Form.Item
              shouldUpdate={(prevValues, currentValues) =>
                prevValues.enableCopyEmbedHtml !== currentValues.enableCopyEmbedHtml
                || prevValues.copyEmbedHtmlPermission !== currentValues.copyEmbedHtmlPermission
              }
              noStyle
            >
              {({ getFieldValue }) => {
                if (getFieldValue('enableCopyEmbedHtml') !== true) return null;
                const permission = (getFieldValue('copyEmbedHtmlPermission') || 'user') as EmbedCodePermission;
                return (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #f0f0f0' }}>
                    <Typography.Text strong>{t('Copy Embed Button Permission')}</Typography.Text>
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 8, marginTop: 4, fontSize: 12 }}>
                      {t('Who can see the copy embed code button')}
                    </Typography.Paragraph>
                    <Form.Item
                      name="copyEmbedHtmlPermission"
                      style={{ marginBottom: permission === 'roles' ? 12 : 0 }}
                      labelCol={{ span: 0 }}
                      wrapperCol={{ span: 24 }}
                    >
                      <Radio.Group style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <Radio.Button value="admin">{t('Administrators')}</Radio.Button>
                        <Radio.Button value="user">{t('Users')}</Radio.Button>
                        <Radio.Button value="roles">{t('Specified roles')}</Radio.Button>
                      </Radio.Group>
                    </Form.Item>
                    {permission === 'roles' ? (
                      <div>
                        <Typography.Text strong>{t('Specified roles')}</Typography.Text>
                        <Typography.Paragraph type="secondary" style={{ marginBottom: 8, marginTop: 4, fontSize: 12 }}>
                          {t('Enter role names, separated by commas')}
                        </Typography.Paragraph>
                        <Form.Item
                          name="copyEmbedHtmlRoles"
                          labelCol={{ span: 0 }}
                          wrapperCol={{ span: 24 }}
                          style={{ marginBottom: 0 }}
                          rules={[
                            {
                              validator: async (_, value: string[]) => {
                                const normalized = parseExtensionsInput(value || []);
                                if (normalized.length === 0) {
                                  throw new Error(t('Please enter at least one role'));
                                }
                              },
                            },
                          ]}
                        >
                          <Select
                            mode="tags"
                            tokenSeparators={[',', '，', ';', '；', ' ']}
                            placeholder={t('e.g. admin,manager')}
                          />
                        </Form.Item>
                      </div>
                    ) : null}
                  </div>
                );
              }}
            </Form.Item>
          </div>
        </Col>
      </Row>
    </Card>
  </Card>
  );
};

export const AdvancedSettingsCard = ({
  onWatermarkChange,
  onWatermarkTypeChange,
  t,
  visible,
  watermark,
  watermarkType,
}: AdvancedProps) => {
  // 将外部传入的水印类型归一化为预期枚举，避免异常值导致文案和状态错乱。
  const resolvedWatermarkType = watermarkType === 'global' ? 'global' : 'preview';

  return (
    <Card
      bordered={false} // 高级设置外层卡片容器，去掉默认边框
      title={t('Advanced Settings')} // 使用与基础设置一致的标题样式
      style={{ marginTop: 16, display: visible ? 'block' : 'none' }} // 仅在当前面板激活时展示
    >
      <Card
        size="small" // 使用小卡片尺寸，与基础设置保持一致
        bordered={false} // 内层卡片不显示边框
        title={t('NocoBase Server Address')} // NocoBase 服务器地址配置分组标题
        style={{ marginBottom: 16, background: '#fafafa', border: '1px solid #f0f0f0' }} // 浅灰背景和细边框，与基础设置卡片风格统一
        bodyStyle={{ padding: 16 }} // 内边距与基础设置一致
      >
        <Typography.Paragraph
          type="secondary" // 使用次要说明文本样式
          style={{ marginBottom: 12 }} // 与下方表单项保持间距
        >
          {t('Used to complete the full URL if the file attachment path is a relative path (e.g., /storage/uploads/...). If not provided, the current site runtime public path will be used automatically.')}
        </Typography.Paragraph>
        <Form.Item
          name="nocobaseHost" // 绑定 NocoBase 服务器地址字段
          labelCol={{ span: 0 }} // 不展示左侧标签列，视觉上只保留卡片标题
          wrapperCol={{ span: 24 }} // 输入框占满整行
          style={{ marginBottom: 0 }} // 与描述文案紧凑排布
        >
          <Input placeholder={t('e.g. https://app.nocobase.com')} />
        </Form.Item>
      </Card>

      <Card
        size="small" // 水印相关配置小卡片
        bordered={false} // 不显示外边框
        title={t('Watermark Type')} // 使用水印类型作为整体分组标题
        style={{ marginBottom: 0, background: '#fafafa', border: '1px solid #f0f0f0' }} // 与其它小卡片统一浅灰背景和边框
        bodyStyle={{ padding: 16 }} // 统一内边距
      >
        <Form.Item name="watermarkType" style={{ marginBottom: 12 }}>
          <Radio.Group onChange={(event) => onWatermarkTypeChange(event.target.value === 'global' ? 'global' : 'preview')}>
            <Radio.Button value="global">{t('Global Watermark')}</Radio.Button>
            <Radio.Button value="preview">{t('Preview Watermark')}</Radio.Button>
          </Radio.Group>
        </Form.Item>
        <Form.Item
          name="watermark"
          labelCol={{ span: 0 }}
          wrapperCol={{ span: 24 }}
          label={resolvedWatermarkType === 'global' ? t('Global Watermark') : t('Preview Watermark')}
          extra={`${t('Set a text watermark for the previewed file (optional)')} ${t('Supported variables: {{user.username}}, {{user.nickname}}, {{user.department}}, {{request.time}}')}`}
          style={{ marginBottom: 16 }}
        >
          <Input onChange={(event) => onWatermarkChange(event.target.value)} placeholder={t('e.g. {{user.department}} {{request.time}}')} />
        </Form.Item>
        <Row gutter={16}>
          <Col span={8}>
            <Form.Item
              name="watermarkOpacity"
              label={t('Watermark Opacity')}
              extra={t('Range: 0.01 - 1.0 (default 0.18)')}
              style={{ marginBottom: 0 }}
            >
              <InputNumber min={0.01} max={1} step={0.01} precision={2} style={{ width: '100%' }} placeholder="0.18" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="watermarkRotate"
              label={t('Watermark Angle')}
              extra={t('Range: -180 to 180 (default -24)')}
              style={{ marginBottom: 0 }}
            >
              <InputNumber min={-180} max={180} step={1} style={{ width: '100%' }} placeholder="-24" addonAfter="°" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="watermarkColor"
              label={t('Watermark Color')}
              extra={t('e.g. rgba(0,0,0,0.18) or #1f7a58')}
              style={{ marginBottom: 0 }}
            >
              <Input placeholder="rgba(0, 0, 0, 0.18)" />
            </Form.Item>
          </Col>
        </Row>
      </Card>
    </Card>
  );
};

export const ModificationRecordsCard = ({
  clearing,
  deletingKey,
  onClear,
  onDelete,
  loading,
  onRefresh,
  records,
  t,
  visible,
}: HistoryProps) => {
  const tr = (key: string, fallback: string) => {
    const translated = t(key);
    return translated === key ? fallback : translated;
  };

  const [detailModalRecord, setDetailModalRecord] = useState<ModificationRecordItem | null>(null);
  const [copiedRawJson, setCopiedRawJson] = useState(false);

  const handleCopyJson = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedRawJson(true);
      setTimeout(() => setCopiedRawJson(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <Card
      bordered={false}
      title={t('Modification Records')}
      extra={(
        <Space>
          <Popconfirm
            title={tr('Confirm clear all records?', '确认清空全部记录吗？')}
            onConfirm={onClear}
            okText={tr('Confirm', '确认')}
            cancelText={t('Cancel')}
          >
            <Button danger loading={clearing}>{tr('Clear Records', '清空记录')}</Button>
          </Popconfirm>
          <Button onClick={onRefresh} loading={loading}>{t('Refresh')}</Button>
        </Space>
      )}
      style={{ marginTop: 16, display: visible ? 'block' : 'none' }}
    >
      <Table<ModificationRecordItem>
        rowKey="key"
        loading={loading}
        dataSource={records}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        locale={{ emptyText: t('No modification records found') }}
        columns={[
          {
            title: t('Time'),
            dataIndex: 'time',
            key: 'time',
            width: 180,
          },
          {
            title: t('Operator'),
            dataIndex: 'operator',
            key: 'operator',
            width: 150,
          },
          {
            title: tr('Changed Details', '变更明细'),
            key: 'changeDetails',
            render: (_, record) => {
              const details = parseChangeDetails(record.content, record.change, record.changedFields);
              if (details.length === 0) {
                return <Typography.Text type="secondary">-</Typography.Text>;
              }

              const categories = Array.from(
                new Set(details.map((item) => getFieldCategoryLabel(item.fieldLabelKey || item.field, t)))
              );

              const displayItems = details.slice(0, 2);
              const extraCount = details.length - displayItems.length;

              const fullTooltipText = details
                .map((item) => {
                  const cat = getFieldCategoryLabel(item.fieldLabelKey || item.field, t);
                  const label = getTranslatedFieldLabel(item.fieldLabelKey || item.field, t);
                  if (item.before !== undefined && item.after !== undefined) {
                    return `[${cat}] ${label} (${item.field}): ${item.before} ➔ ${item.after}`;
                  }
                  return `[${cat}] ${label} (${item.field}): ${item.after || item.raw || '-'}`;
                })
                .join('\n');

              return (
                <Tooltip title={<div style={{ whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto' }}>{fullTooltipText}</div>}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: '100%' }}>
                    {/* 模块分类展示行 */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: '#8c8c8c', marginRight: 2 }}>{t('Module')}:</span>
                      {categories.map((cat) => (
                        <Tag color="purple" key={cat} style={{ marginInlineEnd: 0, fontWeight: 600, fontSize: 12 }}>
                          {cat}
                        </Tag>
                      ))}
                    </div>

                    {/* 变更字段与对比展示行 */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      {displayItems.map((item, idx) => {
                        const label = getTranslatedFieldLabel(item.fieldLabelKey || item.field, t);
                        if (item.before !== undefined && item.after !== undefined) {
                          const shortBefore = truncateValue(item.before, 10);
                          const shortAfter = truncateValue(item.after, 10);
                          return (
                            <Tag color="blue" key={idx} style={{ marginInlineEnd: 0, padding: '1px 6px' }}>
                              <span>{label}:</span>{' '}
                              <span style={{ textDecoration: 'line-through', opacity: 0.65, marginRight: 2 }}>{shortBefore}</span>
                              ➔{' '}
                              <span style={{ fontWeight: 600, color: '#1677ff', marginLeft: 2 }}>{shortAfter}</span>
                            </Tag>
                          );
                        }
                        if (item.after !== undefined) {
                          return (
                            <Tag color="cyan" key={idx} style={{ marginInlineEnd: 0, padding: '1px 6px' }}>
                              <span>{label}:</span> {truncateValue(item.after, 12)}
                            </Tag>
                          );
                        }
                        return (
                          <Tag color="geekblue" key={idx} style={{ marginInlineEnd: 0, padding: '1px 6px' }}>
                            {label}
                          </Tag>
                        );
                      })}
                      {extraCount > 0 && (
                        <Tag
                          color="default"
                          style={{ marginInlineEnd: 0, cursor: 'pointer' }}
                          onClick={() => setDetailModalRecord(record)}
                        >
                          +{extraCount} {tr('more items', '项')}
                        </Tag>
                      )}
                    </div>
                  </div>
                </Tooltip>
              );
            },
          },
          {
            title: tr('Actions', '操作'),
            key: 'actions',
            width: 160,
            render: (_, record) => (
              <Space size="small">
                <Button
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => setDetailModalRecord(record)}
                >
                  {tr('Details', '详情')}
                </Button>
                <Popconfirm
                  title={tr('Confirm delete this record?', '确认删除这条记录吗？')}
                  onConfirm={() => onDelete(record.key)}
                  okText={tr('Confirm', '确认')}
                  cancelText={t('Cancel')}
                >
                  <Button
                    size="small"
                    danger
                    loading={deletingKey === record.key}
                  >
                    {tr('Delete', '删除')}
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      {/* 修改记录详情 Modal */}
      <Modal
        open={!!detailModalRecord}
        title={
          <Space>
            <EyeOutlined style={{ color: '#1677ff' }} />
            <span>{tr('Modification Record Details', '修改记录详情')}</span>
          </Space>
        }
        onCancel={() => setDetailModalRecord(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setDetailModalRecord(null)}>
            {tr('Close', '关闭')}
          </Button>,
        ]}
        width={760}
      >
        {detailModalRecord && (() => {
          const details = parseChangeDetails(detailModalRecord.content, detailModalRecord.change, detailModalRecord.changedFields);
          const rawJsonString = (() => {
            const text = String(detailModalRecord.content || '').trim();
            if (text.startsWith('{') || text.startsWith('[')) {
              try {
                return JSON.stringify(JSON.parse(text), null, 2);
              } catch {
                // ignore
              }
            }
            return JSON.stringify(
              {
                recordId: detailModalRecord.key,
                operator: detailModalRecord.operator,
                time: detailModalRecord.time,
                changedCount: details.length,
                changes: details,
              },
              null,
              2
            );
          })();

          return (
            <div style={{ paddingTop: 8 }}>
              {/* 元数据简报 */}
              <Descriptions
                bordered
                size="small"
                column={2}
                style={{ marginBottom: 16 }}
              >
                <Descriptions.Item label={tr('Record ID', '记录 ID')}>
                  <Tag color="default">#{detailModalRecord.key}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label={t('Operator')}>
                  <Typography.Text strong>{detailModalRecord.operator}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label={t('Time')}>
                  {detailModalRecord.time}
                </Descriptions.Item>
                <Descriptions.Item label={tr('Total Changes', '受影响字段')}>
                  <Badge count={`${details.length} ${tr('fields', '项')}`} overflowCount={999} style={{ backgroundColor: '#52c41a' }} />
                </Descriptions.Item>
              </Descriptions>

              {/* Tabs 呈现结构化明细与 RAW 审计视图 */}
              <Tabs
                defaultActiveKey="diff"
                items={[
                  {
                    key: 'diff',
                    label: tr('Field Changes Table', '结构化变更明细'),
                    children: (
                      <Table<ChangeDetail>
                        rowKey={(item, index) => `${item.field}-${index}`}
                        pagination={false}
                        bordered
                        size="small"
                        dataSource={details}
                        columns={[
                          {
                            title: tr('Module', '模块分类'),
                            key: 'category',
                            width: 140,
                            render: (_, item) => (
                              <Tag color="orange" style={{ fontWeight: 600 }}>
                                {getFieldCategoryLabel(item.fieldLabelKey || item.field, t)}
                              </Tag>
                            ),
                          },
                          {
                            title: tr('Changed Field', '变更字段'),
                            dataIndex: 'fieldLabelKey',
                            width: 210,
                            render: (val, item) => (
                              <Space direction="vertical" size={2}>
                                <Typography.Text strong style={{ fontSize: 13, color: '#1f1f1f' }}>
                                  {getTranslatedFieldLabel(val || item.field, t)}
                                </Typography.Text>
                                <Tag color="cyan" style={{ fontFamily: 'monospace', marginInlineEnd: 0, fontSize: 11 }}>
                                  {item.field}
                                </Tag>
                              </Space>
                            ),
                          },
                          {
                            title: tr('Value Before', '修改前数值'),
                            dataIndex: 'before',
                            width: 180,
                            render: (val, item) => formatFriendlyValue(val, item.field, t),
                          },
                          {
                            title: tr('Value After', '修改后数值'),
                            dataIndex: 'after',
                            render: (val, item) => formatFriendlyValue(val !== undefined ? val : item.raw, item.field, t),
                          },
                        ]}
                      />
                    ),
                  },
                  {
                    key: 'raw',
                    label: tr('Audit Snapshot (JSON)', '原始审计快照'),
                    children: (
                      <div style={{ position: 'relative' }}>
                        <Button
                          size="small"
                          icon={copiedRawJson ? <CheckOutlined style={{ color: '#52c41a' }} /> : <CopyOutlined />}
                          style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }}
                          onClick={() => void handleCopyJson(rawJsonString)}
                        >
                          {copiedRawJson ? tr('Copied', '已复制') : tr('Copy RAW', '复制原始 JSON')}
                        </Button>
                        <pre style={{
                          background: '#282c34',
                          color: '#abb2bf',
                          padding: 12,
                          borderRadius: 6,
                          fontSize: 12,
                          maxHeight: 300,
                          overflow: 'auto',
                          fontFamily: 'Consolas, Monaco, monospace',
                        }}>
                          {rawJsonString}
                        </pre>
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          );
        })()}
      </Modal>
    </Card>
  );
};

export const PreviewRecordsCard = ({
  clearing,
  deletingKey,
  loading,
  onClear,
  onDelete,
  onRefresh,
  records,
  t,
  visible,
}: PreviewHistoryProps) => (
  <Card
    bordered={false}
    title={t('Preview Records')}
    extra={(
      <Space>
        <Popconfirm
          title={t('Confirm clear all records?')}
          onConfirm={onClear}
          okText={t('Confirm')}
          cancelText={t('Cancel')}
        >
          <Button danger loading={clearing}>{t('Clear Records')}</Button>
        </Popconfirm>
        <Button onClick={onRefresh} loading={loading}>{t('Refresh')}</Button>
      </Space>
    )}
    style={{ marginTop: 16, display: visible ? 'block' : 'none' }}
  >
    <Table<PreviewRecordItem>
      rowKey="key"
      loading={loading}
      dataSource={records}
      pagination={{ pageSize: 10, showSizeChanger: false }}
      locale={{ emptyText: t('No preview records found') }}
      columns={[
        {
          title: t('Time'),
          dataIndex: 'time',
          key: 'time',
          width: 220,
        },
        {
          title: t('Operator'),
          dataIndex: 'operator',
          key: 'operator',
          width: 180,
        },
        {
          title: t('Preview Service'),
          dataIndex: 'service',
          key: 'service',
          width: 180,
        },
        {
          title: t('Requested File'),
          dataIndex: 'file',
          key: 'file',
          render: (value: string) => <Typography.Text ellipsis={{ tooltip: value }}>{value || '-'}</Typography.Text>,
        },
        {
          title: t('Actions'),
          key: 'actions',
          width: 120,
          render: (_, record) => (
            <Popconfirm
              title={t('Confirm delete this record?')}
              onConfirm={() => onDelete(record.key)}
              okText={t('Confirm')}
              cancelText={t('Cancel')}
            >
              <Button
                size="small"
                danger
                loading={deletingKey === record.key}
              >
                {t('Delete')}
              </Button>
            </Popconfirm>
          ),
        },
      ]}
    />
  </Card>
);

/** 旧版兼容字段列表：用于展示每次迁移涉及的字段和其替代字段 */
const LEGACY_FIELD_ROWS = [
  { legacy: 'host',             newFields: 'kkfileviewHost, basemetasHost',                              desc: 'desc.host' },
  { legacy: 'extensions',       newFields: 'kkfileviewExtensions, basemetasExtensions, microsoftExtensions', desc: 'desc.extensions' },
  { legacy: 'preferKkfileview', newFields: 'preferredPreview',                                          desc: 'desc.preferKkfileview' },
  { legacy: 'serviceType',      newFields: 'preferredPreview, enableBasemetas',                         desc: 'desc.serviceType' },
];

export const FieldCleanupCard = ({
  loading,
  result,
  onRun,
  t,
  visible,
}: CleanupProps) => (
  <Card
    bordered={false}
    title={t('Field Cleanup')}
    extra={<Button type="primary" loading={loading} onClick={onRun}>{t('Run Cleanup')}</Button>}
    style={{ marginTop: 16, display: visible ? 'block' : 'none' }}
  >
    {/* 功能说明 */}
    <Alert
      type="info"
      showIcon
      message={t('Field Cleanup Description')}
      description={t('Migrate legacy fields to new fields when missing, then clear legacy compatibility fields.')}
      style={{ marginBottom: 16 }}
    />

    {/* 执行结果统计 */}
    {result ? (
      <>
        <Divider orientation="left" style={{ fontSize: 13, color: '#666' }}>
          {t('Last Execution Result')} &nbsp;
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {result.executedAt}
          </Typography.Text>
        </Divider>
        <Row gutter={24} style={{ marginBottom: 16 }}>
          <Col span={8}>
            <Card size="small" bordered style={{ textAlign: 'center', background: '#f6ffed', borderColor: '#b7eb8f' }}>
              <Statistic
                title={<span style={{ color: '#389e0d', fontWeight: 600 }}>{t('Migrated Records')}</span>}
                value={result.migratedCount}
                suffix={t('records')}
                valueStyle={{ color: '#389e0d', fontSize: 28 }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" bordered style={{ textAlign: 'center', background: '#e6f4ff', borderColor: '#91caff' }}>
              <Statistic
                title={<span style={{ color: '#0958d9', fontWeight: 600 }}>{t('Cleaned Records')}</span>}
                value={result.cleanedCount}
                suffix={t('records')}
                valueStyle={{ color: '#0958d9', fontSize: 28 }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" bordered style={{ textAlign: 'center', background: result.migratedCount === 0 && result.cleanedCount === 0 ? '#fffbe6' : '#f9f9f9', borderColor: result.migratedCount === 0 && result.cleanedCount === 0 ? '#ffe58f' : '#d9d9d9' }}>
              <Statistic
                title={<span style={{ fontWeight: 600 }}>{t('Status')}</span>}
                value={result.migratedCount === 0 && result.cleanedCount === 0 ? t('Already Clean') : t('Cleanup Done')}
                valueStyle={{
                  fontSize: 16,
                  color: result.migratedCount === 0 && result.cleanedCount === 0 ? '#d48806' : '#52c41a',
                }}
              />
            </Card>
          </Col>
        </Row>
      </>
    ) : (
      <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        <Badge status="default" />&nbsp;{t('Not executed yet')}
      </Typography.Text>
    )}

    {/* 旧字段 → 新字段映射说明表 */}
    <Divider orientation="left" style={{ fontSize: 13, color: '#666' }}>{t('Legacy Field Mapping')}</Divider>
    <Table
      size="small"
      rowKey="legacy"
      pagination={false}
      bordered
      dataSource={LEGACY_FIELD_ROWS}
      columns={[
        {
          title: t('Legacy Field'),
          dataIndex: 'legacy',
          width: 160,
          render: (val: string) => <Tag color="warning" style={{ fontFamily: 'monospace' }}>{val}</Tag>,
        },
        {
          title: t('Migrated To'),
          dataIndex: 'newFields',
          render: (val: string) => (
            <Space size={4} wrap>
              {val.split(',').map((f) => (
                <Tag key={f.trim()} color="success" style={{ fontFamily: 'monospace' }}>{f.trim()}</Tag>
              ))}
            </Space>
          ),
        },
        {
          title: t('Description'),
          dataIndex: 'desc',
          render: (val: string) => <Typography.Text type="secondary">{t(val)}</Typography.Text>,
        },
      ]}
    />
  </Card>
);

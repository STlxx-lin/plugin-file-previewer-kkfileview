/**
 * @jsxRuntime classic
 * 旧版 `/admin` 入口强制使用 classic JSX runtime，避免开发态 `jsx-dev-runtime` 与旧后台 React 加载链路冲突。
 */
import './appDevDepsBridge';
import { Plugin, attachmentFileTypes } from '@nocobase/client';
import { filePreviewTypes } from '@nocobase/plugin-file-manager/client';
import { SettingsPage } from './SettingsPage';
import { KKFilePreviewer } from './KKFilePreviewer';
import { kkfileviewConfig, PREVIEW_SERVICE_REGISTRY, updateConfigCache } from './configCache';
import type { KkfileviewConfigRecord } from './configCache';
import { getFileExt, unwrapDataArray } from './previewUtils';
import { GlobalWatermarkProvider } from './GlobalWatermarkProvider';
import { registerKkfileviewSettings } from './settingsRegistration';

// 供其他插件（如附件清理工具）复用预览能力
export { KKFilePreviewer } from './KKFilePreviewer';
export type { PreviewerProps, PreviewFileRecord } from './KKFilePreviewer';

let configLoaded = false;
let configLoading = false;
type ApiClientLike = {
  request: (params: { url: string }) => Promise<unknown>;
};

type PreviewFileLike = {
  url?: string;
  extname?: string;
};

let apiClientRef: ApiClientLike | null = null;

function extractFirstSettingsRecord(payload: unknown): KkfileviewConfigRecord | undefined {
  // 兼容 `data` 与 `data.data` 等多层包装结构，避免预览侧拿不到最新配置。
  const records = unwrapDataArray(payload);
  // 没有任何记录时返回 undefined，让调用方保持原有兜底行为。
  if (records.length === 0) return undefined;
  // 统一返回第一条配置记录。
  return records[0] as KkfileviewConfigRecord;
}

function hasAuthToken() {
  if (typeof window === 'undefined') return false;
  const storages = [window.localStorage, window.sessionStorage].filter(Boolean);
  for (const storage of storages) {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i) || '';
      const value = storage.getItem(key) || '';
      const lowerKey = key.toLowerCase();
      if (!/(token|auth)/.test(lowerKey)) continue;
      if (!value || value === 'null' || value === 'undefined') continue;
      return true;
    }
  }
  return false;
}

async function syncConfigCacheFromServer() {
  if (!apiClientRef || configLoaded || configLoading) return;
  if (!hasAuthToken()) return;
  configLoading = true;
  try {
    const res = await apiClientRef.request({ url: 'kkfileviewSettings:list' });
    updateConfigCache(extractFirstSettingsRecord(res));
    configLoaded = true;
  } catch {
  } finally {
    configLoading = false;
  }
}

const match = (file: PreviewFileLike) => {
  void syncConfigCacheFromServer();
  if (kkfileviewConfig.preferredPreview === 'none') return false;
  const ext = getFileExt(file?.url || '', file?.extname || '');
  if (!ext) return false;
  const extSet = new Set<string>();
  PREVIEW_SERVICE_REGISTRY.forEach((service) => {
    if (!kkfileviewConfig[service.enabledField]) return;
    kkfileviewConfig[service.extensionsField].forEach((item) => extSet.add(String(item).toLowerCase()));
  });
  return extSet.has(ext);
};

export class PluginFilePreviewerKkfileviewClient extends Plugin {
  async load() {
    apiClientRef = this.app.apiClient;
    void syncConfigCacheFromServer();

    this.app.addProvider(GlobalWatermarkProvider);

    registerKkfileviewSettings(this.app.pluginSettingsManager as any, this.app.i18n.t.bind(this.app.i18n), {
      Component: SettingsPage,
      pluginNames: [this.options?.name, this.options?.packageName, 'file-previewer-kkfileview'],
    });

    attachmentFileTypes.add({
      match,
      Previewer: KKFilePreviewer,
    });
    filePreviewTypes.add({
      match,
      Previewer: KKFilePreviewer,
    });
  }
}

export default PluginFilePreviewerKkfileviewClient;

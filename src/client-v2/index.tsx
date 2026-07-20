import { Plugin } from '@nocobase/client-v2';
import { filePreviewTypes } from '@nocobase/plugin-file-manager/client-v2';
import { kkfileviewConfig, PREVIEW_SERVICE_REGISTRY, updateConfigCache } from '../client/configCache';
import type { KkfileviewConfigRecord } from '../client/configCache';
import { getFileExt, unwrapDataArray } from '../client/previewUtils';
import { registerKkfileviewSettings } from '../client/settingsRegistration';
import { SettingsPage } from './SettingsPage';
import { GlobalWatermarkProvider } from './GlobalWatermarkProvider';
import { KKFilePreviewer } from './KKFilePreviewer';

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
  const records = unwrapDataArray(payload);
  if (records.length === 0) return undefined;
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

export class PluginFilePreviewerKkfileviewClientV2 extends Plugin {
  async load() {
    apiClientRef = this.app.apiClient;
    void syncConfigCacheFromServer();

    this.app.addProvider(GlobalWatermarkProvider);

    registerKkfileviewSettings(this.app.pluginSettingsManager as any, this.app.i18n.t.bind(this.app.i18n), {
      Component: SettingsPage,
      pluginNames: [this.options?.name, this.options?.packageName, 'file-previewer-kkfileview'],
    });

    filePreviewTypes.add({
      match,
      Previewer: KKFilePreviewer,
    });
  }
}

export default PluginFilePreviewerKkfileviewClientV2;

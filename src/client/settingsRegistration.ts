import type { ComponentType } from 'react';

type SettingsManagerLike = {
  add?: (name: string, options: Record<string, unknown>) => void;
  addMenuItem?: (options: Record<string, unknown>) => void;
  addPageTabItem?: (options: Record<string, unknown>) => void;
  setPluginSettingsLink?: (pluginName: string, settingsName: string) => void;
};

type TranslateLike = (key: string, options?: Record<string, unknown>) => string;
type ComponentLoader = () => Promise<{ default: ComponentType }>;

type RegisterSettingsOptions = {
  Component?: ComponentType;
  componentLoader?: ComponentLoader;
  icon?: string;
  menuKey?: string;
  pluginNames?: string[];
  title?: string;
};

function uniquePluginNames(pluginNames: string[] = []) {
  return [...new Set(pluginNames.map((item) => String(item || '').trim()).filter(Boolean))];
}

export function registerKkfileviewSettings(
  manager: SettingsManagerLike,
  t: TranslateLike,
  options: RegisterSettingsOptions,
) {
  const menuKey = options.menuKey || 'file-previewer-kkfileview';
  const title =
    options.title || t('kkFileView Settings', { ns: '@nocobase/plugin-file-previewer-kkfileview' });
  const icon = options.icon || 'SettingOutlined';
  const pageName = `${menuKey}.index`;
  const pageOptions: Record<string, unknown> = {
    menuKey,
    key: 'index',
    title,
    icon,
    aclSnippet: 'pm',
  };

  if (options.componentLoader) {
    pageOptions.componentLoader = options.componentLoader;
  } else {
    pageOptions.Component = options.Component;
  }

  if (typeof manager.addMenuItem === 'function' && typeof manager.addPageTabItem === 'function') {
    manager.addMenuItem({
      key: menuKey,
      title,
      icon,
      aclSnippet: 'pm',
    });

    manager.addPageTabItem(pageOptions);

    uniquePluginNames(options.pluginNames).forEach((pluginName) => {
      manager.setPluginSettingsLink?.(pluginName, pageName);
    });
    return;
  }

  if (typeof manager.add === 'function') {
    manager.add(menuKey, {
      title,
      icon,
      aclSnippet: 'pm',
      Component: options.Component,
    });
  }
}

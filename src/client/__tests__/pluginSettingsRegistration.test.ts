import { describe, expect, it, vi } from 'vitest';
import { registerKkfileviewSettings } from '../settingsRegistration';

describe('registerKkfileviewSettings', () => {
  it('should fall back to legacy pluginSettingsManager.add for client v1', () => {
    const manager = {
      add: vi.fn(),
    };
    const Component = (() => null) as any;
    const t = vi.fn().mockReturnValue('kkFileView Settings');

    registerKkfileviewSettings(manager as any, t, {
      Component,
      pluginNames: ['file-previewer-kkfileview'],
    });

    expect(manager.add).toHaveBeenCalledWith('file-previewer-kkfileview', {
      title: 'kkFileView Settings',
      icon: 'SettingOutlined',
      aclSnippet: 'pm',
      Component,
    });
  });

  it('should register a settings-center menu and index page for client v2', () => {
    const manager = {
      addMenuItem: vi.fn(),
      addPageTabItem: vi.fn(),
      setPluginSettingsLink: vi.fn(),
    };
    const t = vi.fn().mockReturnValue('kkFileView Settings');

    registerKkfileviewSettings(manager as any, t, {
      Component: (() => null) as any,
      pluginNames: ['file-previewer-kkfileview', '@nocobase/plugin-file-previewer-kkfileview'],
    });

    expect(manager.addMenuItem).toHaveBeenCalledWith({
      key: 'file-previewer-kkfileview',
      title: 'kkFileView Settings',
      icon: 'SettingOutlined',
      aclSnippet: 'pm',
    });
    expect(manager.addPageTabItem).toHaveBeenCalledWith({
      menuKey: 'file-previewer-kkfileview',
      key: 'index',
      title: 'kkFileView Settings',
      Component: expect.any(Function),
      icon: 'SettingOutlined',
      aclSnippet: 'pm',
    });
    expect(manager.setPluginSettingsLink).toHaveBeenCalledWith(
      'file-previewer-kkfileview',
      'file-previewer-kkfileview.index',
    );
    expect(manager.setPluginSettingsLink).toHaveBeenCalledWith(
      '@nocobase/plugin-file-previewer-kkfileview',
      'file-previewer-kkfileview.index',
    );
  });

  it('should support lazy componentLoader for client v2 settings pages', () => {
    const manager = {
      addMenuItem: vi.fn(),
      addPageTabItem: vi.fn(),
      setPluginSettingsLink: vi.fn(),
    };
    const t = vi.fn().mockReturnValue('kkFileView Settings');
    const componentLoader = vi.fn(async () => ({ default: () => null }));

    registerKkfileviewSettings(manager as any, t, {
      componentLoader,
      pluginNames: ['file-previewer-kkfileview'],
    } as any);

    expect(manager.addPageTabItem).toHaveBeenCalledWith({
      menuKey: 'file-previewer-kkfileview',
      key: 'index',
      title: 'kkFileView Settings',
      componentLoader,
      icon: 'SettingOutlined',
      aclSnippet: 'pm',
    });
  });
});

import { describe, expect, it } from 'vitest';

describe('ensureLegacyAppDevDeps', () => {
  it('should backfill legacy app-dev deps from requirejs defined modules', async () => {
    // 模拟旧版 `/admin` 页面里的 RequireJS 已注册模块表。
    const defined = {
      react: { version: '18.x' },
      '@nocobase/client': { Plugin: class Plugin {} },
      '@nocobase/plugin-file-manager/client': { filePreviewTypes: { add() {} } },
    };
    // 模拟旧后台全局对象，初始时不带 `__nocobase_app_dev_deps__`。
    const globalObject = {
      requirejs: {
        s: {
          contexts: {
            _: {
              defined,
            },
          },
        },
      },
    } as any;
    // 动态导入桥接模块，避免测试在文件缺失时被静态分析吞掉真实失败原因。
    const { ensureLegacyAppDevDeps } = await import('../appDevDepsBridge');

    const deps = ensureLegacyAppDevDeps(globalObject);

    expect(deps.react).toBe(defined.react);
    expect(deps['@nocobase/client']).toBe(defined['@nocobase/client']);
    expect(deps['@nocobase/plugin-file-manager/client']).toBe(defined['@nocobase/plugin-file-manager/client']);
    expect(globalObject.__nocobase_app_dev_deps__).toEqual(deps);
  });

  it('should support the nested window.requirejs.requirejs shape used by legacy admin', async () => {
    // 模拟旧版 `/admin` 实际暴露的 RequireJS 包装对象结构。
    const defined = {
      react: { version: '18.x' },
      '@nocobase/client': { Plugin: class Plugin {} },
    };
    // 模拟真实页面中 `window.requirejs.requirejs.s.contexts._.defined` 这层嵌套。
    const globalObject = {
      requirejs: {
        requirejs: {
          s: {
            contexts: {
              _: {
                defined,
              },
            },
          },
        },
      },
    } as any;
    const { ensureLegacyAppDevDeps } = await import('../appDevDepsBridge');

    const deps = ensureLegacyAppDevDeps(globalObject);

    expect(deps.react).toBe(defined.react);
    expect(deps['@nocobase/client']).toBe(defined['@nocobase/client']);
  });
});

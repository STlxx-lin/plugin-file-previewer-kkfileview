import { afterEach, describe, expect, it, vi } from 'vitest'; // 引入 Vitest 的生命周期、分组、断言与桩工具。
import { resolveFileViewerAssetBase } from '../fileViewerRuntime'; // 引入待实现的 File Viewer 资源路径解析函数。

afterEach(() => { // 在每个测试结束后恢复全局桩状态。
  vi.unstubAllGlobals(); // 清理对 window 等全局对象的临时替换。
  vi.unstubAllEnvs(); // 清理对 process.env 的临时替换。
}); // 结束全局清理逻辑。

describe('fileViewerRuntime', () => { // 定义 fileViewer 运行时工具测试分组。
  it('should resolve fileViewer asset base from runtime public path when settings are empty', () => { // 验证 BUILD_FULL 模式下从 window.location.origin 推导本地资源基址。
    vi.stubGlobal('window', { // 为测试注入最小化 window 运行时对象。
      location: { origin: 'http://localhost:13000' }, // 提供当前站点来源地址。
      __nocobase_public_path__: '/v/', // 提供带子路径前缀的运行时公共路径。
    } as Window & { __nocobase_public_path__?: string }); // 结束 window 模拟对象定义。
    vi.stubEnv('BUILD_FULL', 'true'); // 桩住 BUILD_FULL 环境变量，模拟完整构建模式。

    expect(resolveFileViewerAssetBase('')).toBe('http://localhost:13000/static/plugins/@nocobase/plugin-file-previewer-kkfileview/public/file-viewer/');
  }); // 结束 BUILD_FULL 本地资源路径推导测试。

  it('should fall back to getRuntimePublicBase when window.location is missing in BUILD_FULL mode', () => { // 验证 BUILD_FULL 模式下 window.location 不可用时的行为。
    vi.stubGlobal('window', { // 注入缺少 location 的最小化 window。
      location: undefined, // 模拟 SSR 或测试环境下 location 不可用。
      __nocobase_public_path__: '/v/', // 提供运行时公共路径字段。
    } as unknown as Window & { __nocobase_public_path__?: string }); // 结束 window 模拟对象定义。
    vi.stubEnv('BUILD_FULL', 'true'); // 桩住 BUILD_FULL 环境变量，模拟完整构建模式。

    // 当 window.location 为 undefined 时：
    // 1. fileViewerRuntime.ts 中 origin 为空字符串（因 `window.location` 不存在）
    // 2. 回退调用 getRuntimePublicBase()，后者遇到 window.location 为 undefined 时也返回 ''
    // 3. new URL(path, '') 传入空 base 将抛出 TypeError
    // 此用例确认源码的防御层级和已知边界：location 完全缺失时无法构建完整 URL。
    expect(() => resolveFileViewerAssetBase('')).toThrow();
  }); // 结束 location 缺失边界测试。

  describe('CDN 模式（非 BUILD_FULL 构建）', () => { // 定义 CDN 模式专项分组。
    it('should return npmmirror CDN URL when rawBase is empty and BUILD_FULL is not set', () => { // 验证非 BUILD_FULL 且无显式配置时回退到 npmmirror CDN。
      vi.stubEnv('BUILD_FULL', ''); // 显式置空 BUILD_FULL，确保走 CDN 分支。

      expect(resolveFileViewerAssetBase('')).toBe('https://registry.npmmirror.com/@file-viewer/web-full/2.2.2/files/dist/');
    }); // 结束 CDN URL 兜底测试。

    it('should return npmmirror CDN URL when BUILD_FULL env is not defined', () => { // 验证环境变量完全未定义时的 CDN 兜底行为。
      // vi.stubEnv 无法"删除"变量，只能置空；afterEach 中 vi.unstubAllEnvs() 保证每轮隔离。
      vi.stubEnv('BUILD_FULL', ''); // 空字符串对应 falsy，应进入 CDN 分支。

      expect(resolveFileViewerAssetBase('')).toBe('https://registry.npmmirror.com/@file-viewer/web-full/2.2.2/files/dist/');
    }); // 结束 CDN 兜底默认值测试。

    it('should return CDN URL even when window has origin set', () => { // 验证非 BUILD_FULL 模式下即使有 window.location.origin 也走 CDN 分支。
      vi.stubGlobal('window', { // 注入含 origin 的 window，确认非 BUILD_FULL 时不读取 origin。
        location: { origin: 'http://localhost:13000' },
        __nocobase_public_path__: '/v/',
      } as Window & { __nocobase_public_path__?: string });
      vi.stubEnv('BUILD_FULL', ''); // 置空 BUILD_FULL 以触发 CDN 分支。

      expect(resolveFileViewerAssetBase('')).toBe('https://registry.npmmirror.com/@file-viewer/web-full/2.2.2/files/dist/');
    }); // 结束非 BUILD_FULL 忽略 origin 测试。

    it('should return local URL when rawBase is empty, BUILD_FULL is empty but downloaded is true', () => { // 验证 downloaded 为 true 时即使 BUILD_FULL 为空也会解析本地路径。
      vi.stubGlobal('window', {
        location: { origin: 'http://localhost:13000' },
        __nocobase_public_path__: '/v/',
      } as Window & { __nocobase_public_path__?: string });
      vi.stubEnv('BUILD_FULL', '');

      expect(resolveFileViewerAssetBase('', true)).toBe('http://localhost:13000/static/plugins/@nocobase/plugin-file-previewer-kkfileview/public/file-viewer/');
    }); // 结束 downloaded 标志测试。
  }); // 结束 CDN 模式专项分组。

  it('should preserve explicit configured asset base', () => { // 验证显式配置存在时保留该配置。
    expect(resolveFileViewerAssetBase('/custom/file-viewer/')).toBe('/custom/file-viewer/'); // 断言已规范化的显式地址会被原样保留。
    expect(resolveFileViewerAssetBase('/custom/file-viewer')).toBe('/custom/file-viewer/'); // 断言缺失尾部斜杠的显式地址会被自动补齐。
  }); // 结束显式资源地址保留测试。

  it('should preserve explicit CDN URL as asset base', () => { // 验证显式配置为 CDN 地址时也会被正确保留。
    const cdnUrl = 'https://cdn.example.com/file-viewer/';
    expect(resolveFileViewerAssetBase(cdnUrl)).toBe(cdnUrl); // CDN 地址已含尾部斜杠，应原样保留。
    expect(resolveFileViewerAssetBase('https://cdn.example.com/file-viewer')).toBe('https://cdn.example.com/file-viewer/'); // 补全尾部斜杠。
  });

  it('should auto migrate explicit unpkg URL to domestic npmmirror URL', () => {
    expect(resolveFileViewerAssetBase('https://unpkg.com/@file-viewer/web-full@2.2.2/dist/')).toBe('https://registry.npmmirror.com/@file-viewer/web-full/2.2.2/files/dist/');
  });
}); // 结束 fileViewerRuntime 测试分组。

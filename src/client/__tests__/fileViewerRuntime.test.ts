import { afterEach, describe, expect, it, vi } from 'vitest'; // 引入 Vitest 的生命周期、分组、断言与桩工具。
import { resolveFileViewerAssetBase } from '../fileViewerRuntime'; // 引入待实现的 File Viewer 资源路径解析函数。

afterEach(() => { // 在每个测试结束后恢复全局桩状态。
  vi.unstubAllGlobals(); // 清理对 window 等全局对象的临时替换。
}); // 结束全局清理逻辑。

describe('fileViewerRuntime', () => { // 定义 fileViewer 运行时工具测试分组。
  it('should resolve fileViewer asset base from runtime public path when settings are empty', () => { // 验证空配置时会从运行时公共路径推导资源基址。
    vi.stubGlobal('window', { // 为测试注入最小化 window 运行时对象。
      location: { origin: 'http://localhost:13000' }, // 提供当前站点来源地址。
      __nocobase_public_path__: '/v/', // 提供带子路径前缀的运行时公共路径。
    } as Window & { __nocobase_public_path__?: string }); // 结束 window 模拟对象定义。

    expect(resolveFileViewerAssetBase('')).toBe('http://localhost:13000/static/plugins/@nocobase/plugin-file-previewer-kkfileview/public/file-viewer/');
  }); // 结束运行时默认资源地址测试。

  it('should preserve explicit configured asset base', () => { // 验证显式配置存在时保留该配置。
    expect(resolveFileViewerAssetBase('/custom/file-viewer/')).toBe('/custom/file-viewer/'); // 断言已规范化的显式地址会被原样保留。
    expect(resolveFileViewerAssetBase('/custom/file-viewer')).toBe('/custom/file-viewer/'); // 断言缺失尾部斜杠的显式地址会被自动补齐。
  }); // 结束显式资源地址保留测试。
}); // 结束 fileViewerRuntime 测试分组。

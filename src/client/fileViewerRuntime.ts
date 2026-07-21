import { getRuntimePublicBase } from './runtimeUrl'; // 引入运行时公共基址解析工具。

function ensureTrailingSlash(value: string) { // 定义确保字符串以斜杠结尾的内部工具函数。
  return value.endsWith('/') ? value : `${value}/`; // 当路径缺少末尾斜杠时自动补齐。
} // 结束末尾斜杠归一化工具定义。

export function resolveFileViewerAssetBase(rawBase: string = '') { // 导出 File Viewer 资源基址解析函数。
  const explicit = String(rawBase || '').trim(); // 读取并清理显式传入的资源基础路径。
  if (explicit) { // 当存在显式配置时优先使用显式配置。
    return ensureTrailingSlash(explicit); // 返回补齐末尾斜杠后的显式资源路径。
  } // 结束显式配置优先分支。

  // 零配置默认兜底路径：根据构建版本类型（由 process.env.BUILD_FULL 决定）决定是使用本地内置资源还是公共 CDN
  if (process.env.BUILD_FULL) {
    const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
    const base = origin ? `${origin}/` : getRuntimePublicBase();
    return new URL('static/plugins/@nocobase/plugin-file-previewer-kkfileview/public/file-viewer/', base).toString();
  }

  // 默认从 unpkg 公共 CDN 加载 @file-viewer/web-full 的静态资源，以优化插件包自身体积
  return 'https://unpkg.com/@file-viewer/web-full@2.2.2/dist/';
} // 结束 File Viewer 资源基址解析函数定义。

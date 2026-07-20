import { getRuntimePublicBase } from './runtimeUrl'; // 引入运行时公共基址解析工具。

declare const __webpack_public_path__: string | undefined;

function ensureTrailingSlash(value: string) { // 定义确保字符串以斜杠结尾的内部工具函数。
  return value.endsWith('/') ? value : `${value}/`; // 当路径缺少末尾斜杠时自动补齐。
} // 结束末尾斜杠归一化工具定义。

export function resolveFileViewerAssetBase(rawBase: string = '') { // 导出 File Viewer 资源基址解析函数。
  const explicit = String(rawBase || '').trim(); // 读取并清理显式传入 of 资源基础路径。
  if (explicit) { // 当存在显式配置时优先使用显式配置。
    return ensureTrailingSlash(explicit); // 返回补齐末尾斜杠后的显式资源路径。
  } // 结束显式配置优先分支。

  let pubPath = '';
  // 优先检测 webpack runtime 上的模块托管公共路径
  if (typeof __webpack_public_path__ !== 'undefined' && __webpack_public_path__) {
    pubPath = __webpack_public_path__;
  }

  if (pubPath) {
    try {
      const baseHost = typeof window !== 'undefined' && window.location ? window.location.href : 'http://localhost';
      // 将 dist/client/ 或 dist/client-v2/ 映射为 public/
      const normalizedPath = pubPath
        .replace(/\/dist\/client-v2\/?$/, '/public/')
        .replace(/\/dist\/client\/?$/, '/public/');
      return ensureTrailingSlash(new URL('file-viewer/', new URL(normalizedPath, baseHost)).toString());
    } catch {
      // 忽略解析错误，走到兜底
    }
  }

  return new URL('static/plugins/@nocobase/plugin-file-previewer-kkfileview/public/file-viewer/', getRuntimePublicBase()).toString(); // 当配置为空时基于运行时公共基址拼接默认资源路径。
} // 结束 File Viewer 资源基址解析函数定义。

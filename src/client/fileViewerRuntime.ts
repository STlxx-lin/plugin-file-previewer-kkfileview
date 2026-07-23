import { getRuntimePublicBase } from './runtimeUrl'; // 引入运行时公共基址解析工具。

function ensureTrailingSlash(value: string) { // 定义确保字符串以斜杠结尾的内部工具函数。
  return value.endsWith('/') ? value : `${value}/`; // 当路径缺少末尾斜杠时自动补齐。
} // 结束末尾斜杠归一化工具定义。

export function resolveFileViewerAssetBase(rawBase: string = '', downloaded: boolean = false) { // 导出 File Viewer 资源基址解析函数。
  let explicit = String(rawBase || '').trim(); // 读取并清理显式传入的资源基础路径。
  if (explicit) { // 当存在显式配置时优先使用显式配置。
    // 如果配置中存有旧的 unpkg.com 地址，在国内网络下会被墙，自动将其升级替换为 npmmirror 阿里镜像
    if (explicit.includes('unpkg.com')) {
      explicit = explicit
        .replace('https://unpkg.com/', 'https://registry.npmmirror.com/')
        .replace('http://unpkg.com/', 'https://registry.npmmirror.com/')
        .replace('@file-viewer/web-full@2.2.2/dist', '@file-viewer/web-full/2.2.2/files/dist');
    }
    return ensureTrailingSlash(explicit); // 返回补齐末尾斜杠后的显式资源路径。
  } // 结束显式配置优先分支。

  // 零配置默认兜底路径：根据构建版本类型（由 BUILD_FULL 决定）或本地提取状态（由 downloaded 决定）决定是使用本地内置资源还是公共 CDN
  const isBuildFull = typeof process !== 'undefined' && Boolean(process.env?.BUILD_FULL);
  if (isBuildFull || downloaded) {
    const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
    const base = origin ? `${origin}/` : getRuntimePublicBase();
    return new URL('api/kkfileviewPublicAssets/file-viewer/', base).toString();
  }

  // 默认使用国内极速 npmmirror (阿里 npm 镜像 CDN)，无需梯子即可秒级加载
  return 'https://registry.npmmirror.com/@file-viewer/web-full/2.2.2/files/dist/';
} // 结束 File Viewer 资源基址解析函数定义。

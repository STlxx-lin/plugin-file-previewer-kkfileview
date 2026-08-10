/**
 * @jsxRuntime classic
 * File Viewer 渲染器在 legacy `/admin` 中也会被加载，因此统一使用 classic JSX runtime。
 */
import React, { useEffect, useRef } from 'react'; // 引入 React 及其副作用和引用能力。
import {
  FILE_VIEWER_SCRIPT_NAME,
  buildFileViewerScriptUrls,
  markFileViewerLocalAssetUnavailable,
  resolveFileViewerAssetBase,
} from './fileViewerRuntime'; // 引入 File Viewer 资源基址解析工具。

/** 与 @file-viewer/web ViewerFetchInput 结构对齐的最小入参类型，避免静态引入 SDK 包。 */
export type FileViewerFetchInput = {
  url: string; // 待下载的文件地址。
  signal?: AbortSignal; // 可选取消信号，用于组件卸载时中断正在进行的下载请求。
};

/**
 * 调用方注入的认证下载函数签名。
 * 返回 ArrayBuffer（或 Blob/File）供 fileViewer 渲染；返回 null/undefined 则退回库默认行为。
 */
export type FileViewerFetchFileFn = (
  input: FileViewerFetchInput,
) => Promise<ArrayBuffer | Blob | File | null | undefined>;

type FileViewerController = { // 定义可能返回的控制器对象形状。
  destroy?: () => void; // 声明控制器可能提供的销毁方法。
  unmount?: () => void; // 声明控制器可能提供的卸载方法。
}; // 结束控制器对象类型定义。

export type FileViewerRendererProps = { // 导出 File Viewer 渲染组件属性类型。
  assetBase: string; // 声明资源基址属性。
  fileUrl: string; // 声明文件地址属性。
  fileName: string; // 声明文件名属性。
  /** 可选：水印文本内容，由 options.watermark 原生渲染。 */
  watermark?: string; // 声明可选的水印文本属性。
  /** 可选：水印透明度 (0.01 - 1.0) */
  watermarkOpacity?: number;
  /** 可选：水印旋转角度 (-180 - 180) */
  watermarkRotate?: number;
  /** 可选：水印颜色 */
  watermarkColor?: string;
  /** 可选：样式隔离策略 ('scoped' | 'shadow' | 'none' | 'auto')。默认为 'scoped' 以保证打印与完整渲染。 */
  styleIsolation?: 'scoped' | 'shadow' | 'none' | 'auto';
  /** 可选：控制工具栏下载按钮。 */
  enableDownload?: boolean;
  /** 可选：工具栏定位策略 ('auto' | 'top' | 'top-center' | 'bottom-right')。 */
  toolbarPosition?: 'auto' | 'top' | 'top-center' | 'bottom-right';
  /** 可选：调用方提供的认证下载函数，用于让库通过认证渠道获取受保护的文件内容。 */
  fetchFile?: FileViewerFetchFileFn; // 声明可选的认证下载函数属性。
  fileViewerDownloaded?: boolean; // 声明是否已下载本地依赖属性。
  onReady?: () => void; // 声明加载成功回调属性。
  onError?: (error: Error) => void; // 声明加载失败回调属性。
  onProgress?: (percent: number) => void; // 声明可选的加载进度回调属性。
}; // 结束组件属性类型定义。

function cleanupViewerController(controller: FileViewerController | null | undefined, host: HTMLDivElement | null) { // 定义统一清理控制器和宿主的内部工具。
  controller?.destroy?.(); // 优先调用控制器的销毁方法释放资源。
  controller?.unmount?.(); // 兼容调用控制器可能存在的卸载方法。
  if (host) { // 当宿主节点仍然存在时继续执行 DOM 清理。
    host.innerHTML = ''; // 清空宿主节点，避免残留 DOM 影响下次挂载。
  } // 结束宿主节点清理分支。
} // 结束控制器统一清理工具定义。

/**
 * 将掩膜打印所需的 .fv-print-mask-* CSS 注入到宿主内的 ShadowRoot（如有）。
 * 库自身（flyfish-file-viewer-web-full.iife.js）在触发掩膜打印时会把这段 CSS
 * 通过 Li(document) 写入 document.head，但 ShadowRoot 内的元素无法继承
 * document.head 的样式表，导致掩膜工具栏显示异常。此函数在挂载后手动将同样的
 * CSS 再追加一份到 ShadowRoot 的 adoptedStyleSheets，使其在隔离环境中也能生效。
 */
function injectPrintMaskCssToShadowRoot(host: HTMLDivElement): void {
  // IIFE 内部 Di 变量的完整 CSS，逐字同步以确保选择器/样式一致
  const PRINT_MASK_CSS = `
.fv-print-mask-layer{position:absolute;inset:0;z-index:2147483000;pointer-events:none;}
.fv-print-mask-canvas{position:absolute;inset:0;z-index:2147483000;pointer-events:none;cursor:default;}
.fv-print-mask-canvas.is-armed{pointer-events:auto;cursor:crosshair;touch-action:none;}
.fv-print-mask-block{position:absolute;background:#000;box-sizing:border-box;pointer-events:auto;}
.fv-print-mask-block-remove{position:absolute;right:-8px;top:-8px;width:18px;height:18px;border:0;border-radius:999px;background:#111;color:#fff;font:700 12px/18px system-ui,sans-serif;cursor:pointer;padding:0;}
.fv-print-mask-toolbar{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483001;display:inline-flex;align-items:center;gap:6px;padding:6px 8px;border:1px solid rgba(20,35,53,.12);border-radius:999px;background:rgba(255,255,255,.94);box-shadow:0 12px 28px rgba(15,23,42,.16);pointer-events:auto;max-width:calc(100% - 24px);flex-wrap:wrap;justify-content:center;}
.fv-print-mask-toolbar span{font:600 12px/1.2 system-ui,sans-serif;color:#40546a;white-space:nowrap;}
.fv-print-mask-toolbar button{min-width:42px;height:30px;padding:0 10px;border:0;border-radius:999px;background:transparent;color:#40546a;font:800 12px/1 system-ui,sans-serif;cursor:pointer;}
.fv-print-mask-toolbar button:hover,.fv-print-mask-toolbar button.is-active{background:rgba(33,163,102,.1);color:#16774c;}
.fv-print-mask-toolbar button.primary{background:#16774c;color:#fff;}
.fv-print-mask-toolbar button.primary:hover{background:#0f5f3c;}
`;

  try {
    // 库直接在 host 上调用 attachShadow({mode:"open"})（见 fo 函数：e.attachShadow(...)，e === host）
    // 因此 ShadowRoot 挂在 host.shadowRoot 上，而非子元素上。
    const shadowRoot = host.shadowRoot;

    if (shadowRoot) {
      // 优先用 adoptedStyleSheets（现代浏览器均支持）
      if (typeof CSSStyleSheet !== 'undefined' && 'replace' in CSSStyleSheet.prototype) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(PRINT_MASK_CSS);
        shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, sheet];
      } else {
        // 降级：在 ShadowRoot 内插入 <style> 节点
        const style = shadowRoot.ownerDocument.createElement('style');
        style.id = 'fv-print-mask-designer-style-shadow';
        style.textContent = PRINT_MASK_CSS;
        shadowRoot.appendChild(style);
      }
    }
  } catch {
    // 注入失败时静默忽略，不影响主渲染流程
  }
}

// 全局缓存已经加载完的 script 状态。
const scriptLoadCache = new Map<string, Promise<void>>();

function loadScriptWithProgress(src: string, onProgress?: (percent: number) => void): Promise<void> {
  const cached = scriptLoadCache.get(src);
  if (cached) {
    onProgress?.(100);
    return cached;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existingScript) {
      onProgress?.(100);
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;

    // 25 秒超时保护
    const timer = setTimeout(() => {
      script.onload = null;
      script.onerror = null;
      if (script.parentNode) script.parentNode.removeChild(script);
      scriptLoadCache.delete(src);
      console.error('[loadScriptWithProgress] Timeout loading script:', src);
      reject(new Error(`Script loading timed out: ${src}`));
    }, 25000);

    script.onload = () => {
      clearTimeout(timer);
      onProgress?.(100);
      resolve();
    };

    script.onerror = (e) => {
      clearTimeout(timer);
      if (script.parentNode) script.parentNode.removeChild(script);
      scriptLoadCache.delete(src);
      console.error('[loadScriptWithProgress] Script onerror fired for:', src, e);
      reject(new Error(`Failed to load script: ${src}`));
    };

    document.body.appendChild(script);
  });

  scriptLoadCache.set(src, promise);
  return promise;
}

export function FileViewerRenderer(props: FileViewerRendererProps) { // 导出 File Viewer 渲染组件。
  const { assetBase, fileUrl, fileName, watermark, watermarkOpacity, watermarkRotate, watermarkColor, styleIsolation, enableDownload, toolbarPosition, fetchFile, fileViewerDownloaded, onReady, onError, onProgress } = props; // 解构组件所需的核心属性与回调。
  const hostRef = useRef<HTMLDivElement>(null); // 创建宿主容器引用以供挂载 Viewer。

  const fetchFileRef = useRef(fetchFile);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  const onProgressRef = useRef(onProgress);

  useEffect(() => {
    fetchFileRef.current = fetchFile;
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
    onProgressRef.current = onProgress;
  }, [fetchFile, onReady, onError, onProgress]);

  useEffect(() => { // 在资源路径或文件信息变化时重新挂载 Viewer。
    let disposed = false; // 定义卸载标记，避免异步完成后重复操作。
    let controller: FileViewerController | null = null; // 定义控制器引用，用于 effect 清理时释放资源。
    const host = hostRef.current; // 读取当前宿主节点，避免异步过程中引用变化。

    if (!host || !fileUrl) { // 当宿主节点或文件地址缺失时直接退出。
      return undefined; // 返回空清理逻辑以结束当前 effect。
    } // 结束挂载前参数校验分支。

    const mount = async () => { // 定义异步挂载流程。
      try { // 捕获动态加载或挂载过程中的运行异常。
        const resolvedAssetBase = resolveFileViewerAssetBase(assetBase, fileViewerDownloaded); // 解析最终生效 of 资源基址。

        // 动态加载 UMD/IIFE 打包好的静态 JS 资源，而不是由打包器静态编译，以绕过打包器编译错误。
        // 本地静态资源（/api/kkfileviewPublicAssets/）不可用时自动回退到公共 CDN。
        const scriptUrls = buildFileViewerScriptUrls(resolvedAssetBase);
        let loadedScriptUrl = '';
        let lastLoadError: unknown = null;
        for (const scriptUrl of scriptUrls) {
          try {
            await loadScriptWithProgress(scriptUrl, (percent) => {
              if (!disposed) {
                onProgressRef.current?.(percent);
              }
            });
            loadedScriptUrl = scriptUrl;
            break;
          } catch (err) {
            lastLoadError = err;
          }
        }
        if (!loadedScriptUrl) {
          // 本地优先地址全部失败：若包含本地路径则标记为不可用，后续预览直接走 CDN。
          if (scriptUrls.length > 1) {
            markFileViewerLocalAssetUnavailable();
          }
          throw lastLoadError || new Error('fileViewer script load failed');
        }
        const finalAssetBase = loadedScriptUrl.slice(0, -FILE_VIEWER_SCRIPT_NAME.length);

        if (disposed) return;

        const globalLib = (window as any).FlyfishFileViewerWebFull;
        if (!globalLib) {
          throw new Error('window.FlyfishFileViewerWebFull is not defined after script loading');
        }

        const setAssetBase = globalLib.setDefaultFullAssetBaseUrl;
        const mountViewer = globalLib.mountViewer;

        if (!mountViewer) { // 当模块未暴露挂载函数时抛出明确错误。
          throw new Error('fileViewer mountViewer is unavailable'); // 抛出挂载函数缺失错误。
        } // 结束挂载函数存在性校验分支。

        setAssetBase?.(finalAssetBase); // 当模块支持时先设置全局资源基址，确保资产（本地或 CDN）与入口脚本同源。

        /**
         * coreOptions.fetchFile 是 @file-viewer/web 提供的扩展点，允许调用方
         * 拦截库内部的文件 fetch 行为，改为使用携带认证 token 的自定义下载函数。
         * 返回 ArrayBuffer/Blob/File 均被接受；返回 null/undefined 则退回库的默认 fetch 逻辑。
         */
        const coreOptions = fetchFileRef.current
          ? {
            fetchFile: async (input: { url: string; signal?: AbortSignal }) => {
              // 将调用方注入 of 认证下载函数包装为符合库签名 of fetchFile 回调。
              return fetchFileRef.current?.({ url: input.url, signal: input.signal }) ?? null;
            },
          }
          : undefined; // 当调用方未提供 fetchFile 时不注入 coreOptions，使用库默认行为。

        const normalizedWatermark = watermark ? String(watermark).trim() : '';

        // 遵循官方规范构建 options 配置
        // styleIsolation: 'shadow'（默认）— 使用 ShadowRoot 隔离，确保库内部工具栏样式不受 NocoBase/AntD 全局 CSS 干扰。
        // 掩膜打印所需的 .fv-print-mask-* CSS 将在挂载后补注入到 ShadowRoot，解决 Shadow DOM 无法继承 document.head 样式的问题。
        const viewerOptions: Record<string, any> = {
          styleIsolation: styleIsolation || 'shadow',
          toolbar: typeof enableDownload === 'boolean' && !enableDownload
            ? { download: false }
            : true, // true = 使用库默认完整工具栏（由渲染器能力决定显示打印/下载等按钮）
        };

        if (normalizedWatermark) {
          viewerOptions.watermark = {
            text: normalizedWatermark,
            opacity: typeof watermarkOpacity === 'number' ? watermarkOpacity : 0.18,
            color: watermarkColor || 'rgba(0, 0, 0, 0.18)',
            rotate: typeof watermarkRotate === 'number' ? watermarkRotate : -24,
          };
        }

        const mountParams: Record<string, any> = {
          url: fileUrl,
          name: fileName,
          filename: fileName,
          watermark: normalizedWatermark,
          options: viewerOptions,
          onEvent: (event: any) => {
            if (event?.type === 'ready' || event?.type === 'loaded') {
              onReadyRef.current?.();
            } else if (event?.type === 'error') {
              onErrorRef.current?.(event?.error || new Error('FileViewer render error'));
            }
          },
        };

        if (normalizedWatermark && host) {
          try {
            host.setAttribute('watermark', normalizedWatermark);
          } catch {
            // ignore
          }
        }

        controller = (mountViewer(
          host, // 宿主容器
          mountParams,
          coreOptions, // 可选：注入认证下载函数
        ) || null) as FileViewerController | null; // 保存返回的控制器对象，便于后续清理。

        if (disposed) { // 当异步挂载完成前组件已经卸载时立即清理刚创建的实例。
          cleanupViewerController(controller, host); // 调用统一清理工具释放资源与 DOM。
          return; // 结束当前挂载流程，避免触发成功回调。
        } // 结束卸载后补清理分支。

        // 将掩膜打印所需的 CSS 注入到 ShadowRoot（如有），确保 .fv-print-mask-* 样式在 Shadow DOM 内生效。
        // 库自身只把这段 CSS 注入到 document.head，Shadow DOM 内的元素无法继承，需手动补注。
        injectPrintMaskCssToShadowRoot(host);

        onReadyRef.current?.(); // 在挂载成功后通知宿主关闭加载态。
      } catch (error) { // 处理动态导入或挂载时的所有异常。
        if (disposed) { // 当组件已卸载时忽略后续异常通知。
          return; // 结束当前异常处理分支.
        } // 结束已卸载保护分支。
        onErrorRef.current?.(error instanceof Error ? error : new Error('fileViewer mount failed')); // 向宿主回传标准化错误对象。
      } // 结束异步挂载异常处理。
    }; // 结束异步挂载函数定义。

    void mount(); // 立即执行异步挂载流程。

    return () => { // 在 effect 清理阶段释放 Viewer 实例。
      disposed = true; // 标记组件已卸载，阻止异步流程继续更新状态。
      cleanupViewerController(controller, host); // 调用统一清理工具释放控制器与宿主 DOM。
    }; // 结束 effect 清理逻辑定义。
  }, [assetBase, fileUrl, fileName, watermark, enableDownload, toolbarPosition, fileViewerDownloaded]); // 仅在影响挂载结果的依赖变化时重建 Viewer。

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={hostRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
} // 结束 File Viewer 渲染组件定义。

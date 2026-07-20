/**
 * @jsxRuntime classic
 * File Viewer 渲染器在 legacy `/admin` 中也会被加载，因此统一使用 classic JSX runtime。
 */
import React, { useEffect, useRef } from 'react'; // 引入 React 及其副作用和引用能力。
import { resolveFileViewerAssetBase } from './fileViewerRuntime'; // 引入 File Viewer 资源基址解析工具。

type FileViewerController = { // 定义可能返回的控制器对象形状。
  destroy?: () => void; // 声明控制器可能提供的销毁方法。
  unmount?: () => void; // 声明控制器可能提供的卸载方法。
}; // 结束控制器对象类型定义。

export type FileViewerRendererProps = { // 导出 File Viewer 渲染组件属性类型。
  assetBase: string; // 声明资源基址属性。
  fileUrl: string; // 声明文件地址属性。
  fileName: string; // 声明文件名属性.
  onReady?: () => void; // 声明加载成功回调属性。
  onError?: (error: Error) => void; // 声明加载失败回调属性。
}; // 结束组件属性类型定义。

function cleanupViewerController(controller: FileViewerController | null | undefined, host: HTMLDivElement | null) { // 定义统一清理控制器和宿主的内部工具。
  controller?.destroy?.(); // 优先调用控制器的销毁方法释放资源。
  controller?.unmount?.(); // 兼容调用控制器可能存在的卸载方法。
  if (host) { // 当宿主节点仍然存在时继续执行 DOM 清理。
    host.innerHTML = ''; // 清空宿主节点，避免残留 DOM 影响下次挂载。
  } // 结束宿主节点清理分支。
} // 结束控制器统一清理工具定义。

// 全局缓存已经加载完的 script 状态
const scriptLoadCache = new Map<string, Promise<void>>();

function loadScriptOnce(src: string): Promise<void> {
  let promise = scriptLoadCache.get(src);
  if (!promise) {
    promise = new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector(`script[src="${src}"]`);
      if (existingScript) {
        resolve();
        return;
      }
      
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptLoadCache.delete(src); // 加载失败时允许下一次重新加载
        reject(new Error(`Failed to load script: ${src}`));
      };
      document.body.appendChild(script);
    });
    scriptLoadCache.set(src, promise);
  }
  return promise;
}

export function FileViewerRenderer(props: FileViewerRendererProps) { // 导出 File Viewer 渲染组件。
  const { assetBase, fileUrl, fileName, onReady, onError } = props; // 解构组件所需的核心属性与回调。
  const hostRef = useRef<HTMLDivElement>(null); // 创建宿主容器引用以供挂载 Viewer。

  useEffect(() => { // 在资源路径或文件信息变化时重新挂载 Viewer。
    let disposed = false; // 定义卸载标记，避免异步完成后重复操作。
    let controller: FileViewerController | null = null; // 定义控制器引用，用于 effect 清理时释放资源。
    const host = hostRef.current; // 读取当前宿主节点，避免异步过程中引用变化。

    if (!host || !fileUrl) { // 当宿主节点或文件地址缺失时直接退出。
      return undefined; // 返回空清理逻辑以结束当前 effect。
    } // 结束挂载前参数校验分支。

    const mount = async () => { // 定义异步挂载流程。
      try { // 捕获动态加载或挂载过程中的运行异常。
        const resolvedAssetBase = resolveFileViewerAssetBase(assetBase); // 解析最终生效 of 资源基址。
        
        // 动态加载 UMD/IIFE 打包好的静态 JS 资源，而不是由打包器静态编译，以绕过打包器编译错误
        const scriptUrl = `${resolvedAssetBase}flyfish-file-viewer-web-full.iife.js`;
        await loadScriptOnce(scriptUrl);

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

        setAssetBase?.(resolvedAssetBase); // 当模块支持时先设置全局资源基址，确保离线资产走自部署路径。

        controller = (mountViewer(host, { // 调用官方挂载函数将 Viewer 装载到宿主容器。
          url: fileUrl, // 传入待预览文件地址。
          filename: fileName, // 传入文件名以辅助格式识别与展示。
          options: { // 传入最小化运行参数以提升宿主稳定性。
            styleIsolation: 'shadow', // 使用 Shadow DOM 隔离后台全局样式干扰。
          }, // 结束最小运行参数定义。
        }) || null) as FileViewerController | null; // 保存返回的控制器对象，便于后续清理。

        if (disposed) { // 当异步挂载完成前组件已经卸载时立即清理刚创建的实例。
          cleanupViewerController(controller, host); // 调用统一清理工具释放资源与 DOM。
          return; // 结束当前挂载流程，避免触发成功回调。
        } // 结束卸载后补清理分支。

        onReady?.(); // 在挂载成功后通知宿主关闭加载态。
      } catch (error) { // 处理动态导入或挂载时的所有异常。
        if (disposed) { // 当组件已卸载时忽略后续异常通知。
          return; // 结束当前异常处理分支.
        } // 结束已卸载保护分支。
        onError?.(error instanceof Error ? error : new Error('fileViewer mount failed')); // 向宿主回传标准化错误对象。
      } // 结束异步挂载异常处理。
    }; // 结束异步挂载函数定义。

    void mount(); // 立即执行异步挂载流程。

    return () => { // 在 effect 清理阶段释放 Viewer 实例。
      disposed = true; // 标记组件已卸载，阻止异步流程继续更新状态。
      cleanupViewerController(controller, host); // 调用统一清理工具释放控制器与宿主 DOM。
    }; // 结束 effect 清理逻辑定义。
  }, [assetBase, fileUrl, fileName, onReady, onError]); // 仅在影响挂载结果的依赖变化时重建 Viewer。

  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />; // 返回占满可用空间的宿主容器供 File Viewer 挂载。
} // 结束 File Viewer 渲染组件定义。

import { describe, expect, it } from 'vitest'; // 引入 Vitest 的基础测试 API。
import { PREVIEW_SERVICE_REGISTRY, kkfileviewConfig, updateConfigCache } from '../configCache'; // 引入预览服务注册表、配置缓存与更新方法。

describe('configCache fileViewer', () => { // 定义 fileViewer 配置缓存相关测试分组。
  it('should expose fileViewer as a disabled-by-default preview service', () => { // 验证 fileViewer 已注册且默认关闭。
    expect(PREVIEW_SERVICE_REGISTRY.map((item) => item.key)).toContain('fileViewer'); // 断言预览服务注册表包含 fileViewer。
    expect(kkfileviewConfig.enableFileViewer).toBe(false); // 断言 fileViewer 默认关闭。
    expect(kkfileviewConfig.fileViewerAssetBase).toBe(''); // 断言 fileViewer 资源基础路径默认为空。
    expect(kkfileviewConfig.fileViewerExtensions).toContain('pdf'); // 断言 fileViewer 默认扩展名包含 pdf。
  }); // 结束默认配置测试。

  it('should update fileViewer fields from server records', () => { // 验证服务端记录可更新 fileViewer 配置缓存。
    updateConfigCache({ // 调用配置更新方法模拟服务端回写。
      enableFileViewer: true, // 设置 fileViewer 为开启状态。
      fileViewerAssetBase: '/v/file-viewer/', // 设置 fileViewer 资源基础路径。
      fileViewerExtensions: '["pdf","docx"]', // 设置 fileViewer 扩展名 JSON 字符串。
      preferredPreview: 'fileViewer', // 设置首选预览服务为 fileViewer。
    }); // 结束配置更新调用。

    expect(kkfileviewConfig.enableFileViewer).toBe(true); // 断言 fileViewer 已更新为开启。
    expect(kkfileviewConfig.fileViewerAssetBase).toBe('/v/file-viewer/'); // 断言 fileViewer 资源基础路径已更新。
    expect(kkfileviewConfig.fileViewerExtensions).toEqual(['pdf', 'docx']); // 断言 fileViewer 扩展名已被解析。
    expect(kkfileviewConfig.preferredPreview).toBe('fileViewer'); // 断言首选预览服务已更新为 fileViewer。
  }); // 结束更新逻辑测试。
}); // 结束 fileViewer 配置缓存测试分组。

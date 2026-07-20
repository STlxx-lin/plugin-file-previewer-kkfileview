import { describe, expect, it } from 'vitest'; // 引入 Vitest 断言工具。
import { buildFileViewerFormState, buildFileViewerSaveState, buildWatermarkSaveState } from '../settingsPayload'; // 引入设置保存载荷构建函数。

describe('settingsPayload', () => { // 定义设置载荷测试分组。
  it('应该优先保存受控草稿中的水印文本', () => { // 验证水印文本优先使用草稿值。
    const result = buildWatermarkSaveState( // 构建水印保存载荷。
      {
        watermark: ' NEW_WATERMARK ', // 提供带空格的新水印文本。
        watermarkType: 'global', // 提供新的水印类型。
      },
      {
        watermark: 'OLD_WATERMARK', // 提供旧水印文本作为回退值。
        watermarkType: 'preview', // 提供旧水印类型作为回退值。
      },
    );
    expect(result).toEqual({ // 断言结果使用草稿中的新值。
      watermark: 'NEW_WATERMARK', // 断言水印文本被去除首尾空格。
      watermarkType: 'global', // 断言水印类型保留为合法草稿值。
    });
  });

  it('应该在草稿类型异常时回退到可用的表单类型', () => { // 验证水印类型回退逻辑。
    const result = buildWatermarkSaveState( // 构建水印保存载荷。
      {
        watermark: '', // 提供空字符串水印文本。
        watermarkType: 'preview', // 提供合法的草稿类型。
      },
      {
        watermark: 'OLD_WATERMARK', // 提供旧水印文本作为回退值。
        watermarkType: 'global', // 提供旧水印类型作为回退值。
      },
    );
    expect(result).toEqual({ // 断言结果保持当前合法草稿类型。
      watermark: '', // 断言空文本会被原样保留。
      watermarkType: 'preview', // 断言合法草稿类型不会被旧值覆盖。
    });
  });

  it('应该归一化 fileViewer 保存载荷', () => { // 验证 fileViewer 新字段的保存归一化逻辑。
    const result = buildFileViewerSaveState( // 构建 fileViewer 保存载荷。
      {
        enableFileViewer: true, // 提供开启状态。
        fileViewerAssetBase: ' /v/assets/file-viewer/ ', // 提供带空格的资源基础路径。
        fileViewerExtensions: [' PDF ', 'docx', 'pdf', ''], // 提供大小写混合且重复的扩展名列表。
      },
      {
        enableFileViewer: false, // 提供默认关闭状态作为回退值。
        fileViewerAssetBase: '', // 提供空路径作为回退值。
        fileViewerExtensions: ['pdf'], // 提供默认扩展名作为回退值。
      },
    );
    expect(result).toEqual({ // 断言结果已完成统一归一化。
      enableFileViewer: true, // 断言布尔值按显式 true 保存。
      fileViewerAssetBase: '/v/assets/file-viewer/', // 断言资源路径被修剪并补齐末尾斜杠。
      fileViewerExtensions: ['pdf', 'docx'], // 断言扩展名被去重、转小写并移除空值。
    });
  });

  it('应该为 fileViewer 表单回填默认值并解析历史记录', () => { // 验证 fileViewer 表单回填逻辑可复用于 v1 与 v2 设置页。
    const result = buildFileViewerFormState({ // 构建 fileViewer 表单初始值。
      enableFileViewer: true, // 提供开启状态。
      fileViewerAssetBase: ' /v/file-viewer/ ', // 提供带空格的资源基础路径。
      fileViewerExtensions: '["PDF","docx","pdf"]', // 提供字符串形式的历史扩展名配置。
    });
    expect(result).toEqual({ // 断言返回值适合作为表单初始状态。
      enableFileViewer: true, // 断言开关状态被正确保留。
      fileViewerAssetBase: '/v/file-viewer/', // 断言资源路径被修剪并保留稳定格式。
      fileViewerExtensions: ['pdf', 'docx'], // 断言扩展名被解析、去重并转成数组。
    });
  });
}); // 结束设置载荷测试分组。

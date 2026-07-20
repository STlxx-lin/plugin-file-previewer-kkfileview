import { describe, expect, it } from 'vitest'; // 引入 Vitest 测试工具。
import collection from '../collections/kkfileviewSettings'; // 引入设置集合定义。
import { normalizeSettingsSaveValues } from '../plugin'; // 引入服务端保存归一化函数。

describe('kkfileviewSettings fileViewer', () => { // 定义 fileViewer 服务端设置测试分组。
  it('应该声明 fileViewer 字段并提供安全默认值', () => { // 验证集合新增字段的默认值。
    const fields = Object.fromEntries(collection.fields.map((field: any) => [field.name, field])); // 将字段数组转换为便于断言的字典结构。

    expect(fields.fileViewerAssetBase.defaultValue).toBe(''); // 断言资源基础路径默认值为空字符串。
    expect(fields.fileViewerExtensions.defaultValue).toContain('pdf'); // 断言默认扩展名包含 pdf。
    expect(fields.enableFileViewer.defaultValue).toBe(false); // 断言新服务默认关闭。
  });

  it('应该归一化 fileViewer 保存值', () => { // 验证服务端保存前会再次归一化新字段。
    const result = normalizeSettingsSaveValues({ // 传入待保存的原始设置值。
      fileViewerAssetBase: ' /v/assets/file-viewer/ ', // 提供带空格的资源基础路径。
      fileViewerExtensions: [' PDF ', 'docx', 'pdf', ''], // 提供重复且大小写混合的扩展名列表。
      enableFileViewer: true, // 提供显式开启状态。
    }); // 执行服务端归一化。

    expect(result.fileViewerAssetBase).toBe('/v/assets/file-viewer/'); // 断言资源路径被修剪并补齐末尾斜杠。
    expect(result.fileViewerExtensions).toBe('["pdf","docx"]'); // 断言扩展名会被标准化并序列化为 JSON 字符串。
    expect(result.enableFileViewer).toBe(true); // 断言显式开启状态被保留。
  });
}); // 结束 fileViewer 服务端设置测试分组。

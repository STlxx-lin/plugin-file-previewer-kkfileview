import { describe, expect, it } from 'vitest';
import { decidePreviewMode, getFileExt, normalizeExtensions, parseExtensions, parseExtensionsInput } from '../previewUtils';

describe('previewUtils', () => {
  it('normalizeExtensions 应该去重并转小写', () => {
    expect(normalizeExtensions([' DOC ', 'doc', 'Pdf', ''])).toEqual(['doc', 'pdf']);
  });

  it('parseExtensions 应该解析 JSON 字符串并回退默认值', () => {
    expect(parseExtensions('["DOC","pdf"]', ['txt'])).toEqual(['doc', 'pdf']);
    expect(parseExtensions('invalid-json', ['TXT', 'txt'])).toEqual(['txt']);
    expect(parseExtensions([], ['ppt'])).toEqual(['ppt']);
  });

  it('parseExtensionsInput 应该按逗号分割并清洗', () => {
    expect(parseExtensionsInput(' doc, DOCX ,pdf,,')).toEqual(['doc', 'docx', 'pdf']);
  });

  it('getFileExt 应该优先 extname 并支持 URL 推断', () => {
    expect(getFileExt('/api/attach/file.pptx?download=1', '')).toBe('pptx');
    expect(getFileExt('/api/attach/file.pptx', '.DOCX')).toBe('docx');
    expect(getFileExt('/api/attach/file', '')).toBe('');
  });

  it('decidePreviewMode 应该按图片PDF与支持模式决策', () => {
    expect(
      decidePreviewMode({
        preferredPreview: 'kkfileview',
        enabledModes: ['microsoft', 'kkfileview', 'basemetas'],
        enabledAndSupportedModes: ['basemetas'],
      })
    ).toBe('basemetas');

    expect(
      decidePreviewMode({
        preferredPreview: 'basemetas',
        enabledModes: ['microsoft', 'kkfileview'],
        enabledAndSupportedModes: ['microsoft'],
      })
    ).toBe('microsoft');

    expect(
      decidePreviewMode({
        preferredPreview: 'kkfileview',
        enabledModes: ['microsoft', 'kkfileview'],
        enabledAndSupportedModes: ['microsoft'],
      })
    ).toBe('microsoft');

    expect(
      decidePreviewMode({
        preferredPreview: 'kkfileview',
        enabledModes: ['kkfileview'],
        enabledAndSupportedModes: ['kkfileview'],
      })
    ).toBe('kkfileview');
  });

  it('decidePreviewMode 应该支持 fileViewer 参与候选与回退', () => { // 验证 fileViewer 可被优先命中且可在不支持时回退。
    expect( // 断言当 fileViewer 可用且受支持时优先命中 fileViewer。
      decidePreviewMode({ // 调用预览模式决策函数。
        preferredPreview: 'fileViewer', // 指定首选预览模式为 fileViewer。
        enabledModes: ['microsoft', 'fileViewer'], // 声明已启用的预览模式列表。
        enabledAndSupportedModes: ['fileViewer'], // 声明已启用且支持当前文件的模式列表。
      }) // 结束首次决策参数定义。
    ).toBe('fileViewer'); // 断言首次决策结果为 fileViewer。

    expect( // 断言当 fileViewer 不支持时回退到 microsoft。
      decidePreviewMode({ // 再次调用预览模式决策函数。
        preferredPreview: 'fileViewer', // 仍然指定首选预览模式为 fileViewer。
        enabledModes: ['microsoft', 'fileViewer'], // 保持两个服务都已启用。
        enabledAndSupportedModes: ['microsoft'], // 仅声明 microsoft 支持当前文件。
      }) // 结束第二次决策参数定义。
    ).toBe('microsoft'); // 断言第二次决策结果回退为 microsoft。
  }); // 结束 fileViewer 决策与回退测试。
});

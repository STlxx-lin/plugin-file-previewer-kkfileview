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
});

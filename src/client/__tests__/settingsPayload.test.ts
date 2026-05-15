import { describe, expect, it } from 'vitest';
import { buildWatermarkSaveState } from '../settingsPayload';

describe('settingsPayload', () => {
  it('应该优先保存受控草稿中的水印文本', () => {
    const result = buildWatermarkSaveState(
      {
        watermark: ' NEW_WATERMARK ',
        watermarkType: 'global',
      },
      {
        watermark: 'OLD_WATERMARK',
        watermarkType: 'preview',
      },
    );
    expect(result).toEqual({
      watermark: 'NEW_WATERMARK',
      watermarkType: 'global',
    });
  });

  it('应该在草稿类型异常时回退到可用的表单类型', () => {
    const result = buildWatermarkSaveState(
      {
        watermark: '',
        watermarkType: 'preview',
      },
      {
        watermark: 'OLD_WATERMARK',
        watermarkType: 'global',
      },
    );
    expect(result).toEqual({
      watermark: '',
      watermarkType: 'preview',
    });
  });
});

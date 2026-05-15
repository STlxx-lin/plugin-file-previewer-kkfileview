export type WatermarkDraftState = {
  watermark: string;
  watermarkType: 'global' | 'preview';
};

function normalizeWatermarkType(value: unknown): WatermarkDraftState['watermarkType'] | undefined {
  // 仅接受 global 或 preview 两种合法类型。
  if (value === 'global' || value === 'preview') {
    return value;
  }
  // 其他值统一视为无效。
  return undefined;
}

export function buildWatermarkSaveState(
  draft: WatermarkDraftState,
  fallback?: Partial<WatermarkDraftState>,
): WatermarkDraftState {
  // 优先使用受控草稿值，避免表单缓存滞后时把旧水印再次保存回数据库。
  const nextWatermark = String(draft.watermark ?? fallback?.watermark ?? '').trim();
  // 优先采用草稿中的合法类型；仅当草稿类型异常时再回退到 fallback。
  const nextWatermarkType =
    normalizeWatermarkType(draft.watermarkType) ??
    normalizeWatermarkType(fallback?.watermarkType) ??
    'preview';
  // 返回稳定的保存结果，供设置页和测试统一复用。
  return {
    watermark: nextWatermark,
    watermarkType: nextWatermarkType,
  };
}

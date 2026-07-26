import { DEFAULT_FILE_VIEWER_ASSET_BASE, DEFAULT_FILE_VIEWER_EXTENSIONS } from '../shared/constants'; // 引入 File Viewer 默认值，供表单回填与保存统一复用。
import { parseExtensions, parseExtensionsInput } from './previewUtils'; // 引入扩展名解析工具，复用已有去重与清洗逻辑。

export type WatermarkDraftState = {
  watermark: string;
  watermarkType: 'global' | 'preview';
  watermarkOpacity?: number;
  watermarkRotate?: number;
  watermarkColor?: string;
};

export type FileViewerDraftState = {
  enableFileViewer: boolean; // 声明 File Viewer 是否开启。
  fileViewerAssetBase: string; // 声明 File Viewer 资源基础路径。
  fileViewerExtensions: string[] | string; // 声明 File Viewer 支持的扩展名输入。
};

function normalizeFileViewerAssetBase(value: unknown): string {
  // 先把传入值转为字符串并移除首尾空格，避免把空白字符保存进配置。
  const rawAssetBase = String(value ?? '').trim();
  // 统一去除尾部多余斜杠后再补一个斜杠，保证路径序列化结果稳定。
  return rawAssetBase ? `${rawAssetBase.replace(/\/+$/, '')}/` : '';
}

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

  const nextOpacity =
    typeof draft.watermarkOpacity === 'number' && !isNaN(draft.watermarkOpacity)
      ? Math.max(0.01, Math.min(1, draft.watermarkOpacity))
      : (typeof fallback?.watermarkOpacity === 'number' ? fallback.watermarkOpacity : 0.18);

  const nextRotate =
    typeof draft.watermarkRotate === 'number' && !isNaN(draft.watermarkRotate)
      ? Math.max(-180, Math.min(180, Math.round(draft.watermarkRotate)))
      : (typeof fallback?.watermarkRotate === 'number' ? fallback.watermarkRotate : -24);

  const nextColor = String(draft.watermarkColor ?? fallback?.watermarkColor ?? 'rgba(0, 0, 0, 0.18)').trim();

  // 返回稳定的保存结果，供设置页和测试统一复用。
  return {
    watermark: nextWatermark,
    watermarkType: nextWatermarkType,
    watermarkOpacity: nextOpacity,
    watermarkRotate: nextRotate,
    watermarkColor: nextColor,
  };
}

export function buildFileViewerFormState(
  draft?: Partial<FileViewerDraftState>, // 接收服务端记录或默认值组成的 File Viewer 表单源数据。
  fallback?: Partial<FileViewerDraftState>, // 接收记录缺失时的回退值，供 v1 与 v2 页面共享。
): FileViewerDraftState {
  // 优先读取记录中的启用状态，缺失时回退到默认关闭。
  const nextEnabled = draft?.enableFileViewer ?? fallback?.enableFileViewer ?? false;
  // 优先读取记录中的资源基础路径，并统一做稳定化处理。
  const nextAssetBase = normalizeFileViewerAssetBase(
    draft?.fileViewerAssetBase ?? fallback?.fileViewerAssetBase ?? DEFAULT_FILE_VIEWER_ASSET_BASE,
  );
  // 优先解析记录中的扩展名配置，缺失时回退到共享默认扩展名列表。
  const nextExtensions = parseExtensions(
    draft?.fileViewerExtensions ?? fallback?.fileViewerExtensions,
    DEFAULT_FILE_VIEWER_EXTENSIONS,
  );
  // 返回适合作为表单初始值和回填值的标准结构。
  return {
    enableFileViewer: nextEnabled === true,
    fileViewerAssetBase: nextAssetBase,
    fileViewerExtensions: nextExtensions,
  };
}

export function buildFileViewerSaveState(
  draft: FileViewerDraftState, // 接收当前表单草稿中的 File Viewer 设置。
  fallback?: Partial<FileViewerDraftState>, // 接收缺省情况下的 File Viewer 回退设置。
): FileViewerDraftState {
  // 返回可直接提交给服务端的稳定保存结果。
  return {
    enableFileViewer: draft.enableFileViewer === true, // 仅显式 true 才视为开启。
    fileViewerAssetBase: normalizeFileViewerAssetBase(
      draft.fileViewerAssetBase ?? fallback?.fileViewerAssetBase ?? DEFAULT_FILE_VIEWER_ASSET_BASE,
    ), // 返回归一化后的资源基础路径。
    fileViewerExtensions: parseExtensionsInput(
      draft.fileViewerExtensions ?? fallback?.fileViewerExtensions ?? [], // 复用扩展名输入并在缺失时回退到默认值。
    ),
  };
}

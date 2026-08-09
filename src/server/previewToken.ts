/**
 * File Viewer 预览令牌相关纯函数。
 * 负责：短期预览令牌的有效期解析、负载构建、作用域校验与代理地址识别，
 * 便于服务端与单元测试统一复用。
 */
import { FILE_VIEWER_PROXY_PATH_KEYWORD } from '../shared/constants';

/** File Viewer 预览令牌的 audience 标识，用于与其他会话令牌区分。 */
export const FILE_VIEWER_PREVIEW_TOKEN_AUDIENCE = 'kkfileview-preview';

/** File Viewer 预览令牌的作用域标识。 */
export const FILE_VIEWER_PREVIEW_TOKEN_SCOPE = 'file-viewer';

/** File Viewer 预览令牌默认有效期。 */
export const FILE_VIEWER_PREVIEW_TOKEN_DEFAULT_EXPIRES_IN = '10m';

/** File Viewer 预览令牌允许的最短有效期（秒）。 */
const PREVIEW_TOKEN_MIN_SECONDS = 60;

/** File Viewer 预览令牌允许的最长有效期（秒）。 */
const PREVIEW_TOKEN_MAX_SECONDS = 30 * 60;

/**
 * 解析 File Viewer 预览令牌的有效期。
 * 优先读取环境变量 KKFILEVIEW_PREVIEW_TOKEN_EXPIRES_IN，
 * 仅接受 `n`（秒）或 `nm`（分钟）格式，并限制在 1m ~ 30m 之间，
 * 超出范围或格式非法时回退到默认值。
 */
export function getPreviewTokenExpiresIn(rawValue: string = ''): string {
  const value = String(rawValue || process.env.KKFILEVIEW_PREVIEW_TOKEN_EXPIRES_IN || FILE_VIEWER_PREVIEW_TOKEN_DEFAULT_EXPIRES_IN).trim();
  const matched = /^(\d+)([sm])$/.exec(value);
  const seconds = matched ? Number(matched[1]) * (matched[2] === 'm' ? 60 : 1) : Number.NaN;
  if (!Number.isFinite(seconds) || seconds < PREVIEW_TOKEN_MIN_SECONDS || seconds > PREVIEW_TOKEN_MAX_SECONDS) {
    return FILE_VIEWER_PREVIEW_TOKEN_DEFAULT_EXPIRES_IN;
  }
  return value;
}

/**
 * 将有效期字符串（`n` 秒 / `nm` 分钟）转换为毫秒。
 * 格式非法时回退到默认 10 分钟，供服务端计算过期时间兜底。
 */
export function parsePreviewTokenExpiresInToMs(expiresIn: string = ''): number {
  const matched = /^(\d+)([sm])$/.exec(String(expiresIn || '').trim());
  if (!matched) return 10 * 60 * 1000;
  const seconds = Number(matched[1]) * (matched[2] === 'm' ? 60 : 1);
  return seconds * 1000;
}

/**
 * 判断是否为 NocoBase 托管的文件地址。
 * 仅允许两种形态，防止代理被用作任意 URL 的 SSRF 通道：
 * 1. 永久文件路径 `/files/{app}/{dataSource}/{collection}/{id}(.ext)`；
 * 2. 本地存储路径 `/storage/...`。
 * 其余（任意 http(s) 地址、内网 IP、云元数据地址等）一律拒绝。
 */
export function isNocoBaseManagedFileUrl(url: unknown): boolean {
  const raw = String(url || '').trim();
  if (!raw) return false;
  let pathname = raw;
  try {
    pathname = new URL(raw, 'http://localhost').pathname;
  } catch {
    // 无法解析时按原值处理。
  }
  const segments = pathname.replace(/^\/+/, '').split('/').filter(Boolean);
  if (segments.length >= 5 && segments[0] === 'files' && /^\d+(\.\w+)?$/.test(segments[4] || '')) {
    return true;
  }
  if (segments.length >= 2 && segments[0] === 'storage') {
    return true;
  }
  return false;
}

/**
 * 构建 File Viewer 预览令牌的 JWT 负载。
 * 令牌绑定当前用户、目标文件地址与预览作用域，配合短有效期实现临时使用。
 */
export function buildFileViewerPreviewTokenPayload(
  userId: number | string,
  options: { roleName?: string; targetUrl: string },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    userId,
    aud: FILE_VIEWER_PREVIEW_TOKEN_AUDIENCE,
    scope: FILE_VIEWER_PREVIEW_TOKEN_SCOPE,
    targetUrl: String(options.targetUrl || '').trim(),
  };
  if (options.roleName) {
    payload.roleName = String(options.roleName).trim();
  }
  return payload;
}

/**
 * 判断解码后的 JWT 负载是否为 File Viewer 预览令牌。
 */
export function isFileViewerPreviewTokenPayload(decoded: unknown): boolean {
  if (!decoded || typeof decoded !== 'object') return false;
  const record = decoded as Record<string, unknown>;
  return record.aud === FILE_VIEWER_PREVIEW_TOKEN_AUDIENCE && record.scope === FILE_VIEWER_PREVIEW_TOKEN_SCOPE;
}

/**
 * 判断给定地址是否为 File Viewer 代理接口地址。
 * 精确匹配代理 action 路径，避免包含同名关键字的普通地址被误判。
 */
export function isFileViewerProxyUrl(url: unknown): boolean {
  return String(url || '').includes(`${FILE_VIEWER_PROXY_PATH_KEYWORD}:get`);
}

import { buildStorageBaseUrl } from '../client/previewUtils';
import { Plugin } from '@nocobase/server';
import path from 'path';
import { spawn } from 'child_process';
import crypto from 'crypto';
import dns from 'dns';
import os from 'os';
import net from 'net';
import {
  DEFAULT_EXTENSIONS,
  DEFAULT_MICROSOFT_EXTENSIONS,
  DEFAULT_KKFILEVIEW_HOST,
  DEFAULT_BASEMETAS_HOST,
  DEFAULT_MICROSOFT_HOST,
  DEFAULT_FILE_VIEWER_ASSET_BASE,
  DEFAULT_FILE_VIEWER_EXTENSIONS,
  DEFAULT_PREFERRED_PREVIEW,
  DEFAULT_BASEMETAS_FILE_ACCESS,
  DEFAULT_KKFILEVIEW_FILE_ACCESS,
} from '../shared/constants';
import { resolveWatermarkTemplate } from '../shared/watermarkTemplate';
import {
  buildFileViewerPreviewTokenPayload,
  getPreviewTokenExpiresIn,
  isFileViewerPreviewTokenPayload,
  isNocoBaseManagedFileUrl,
  parsePreviewTokenExpiresInToMs,
} from './previewToken';

type RoleLike = string | {
  name?: string;
  roleName?: string;
  code?: string;
  title?: string;
  displayName?: string;
};

type CurrentUserLike = {
  nickname?: string;
  username?: string;
  isSuperAdmin?: boolean;
  isSystemAdmin?: boolean;
  roles?: RoleLike[];
};

type HealthCheckSettings = {
  kkfileviewHost?: string;
  basemetasHost?: string;
  microsoftHost?: string;
  nocobaseHost?: string;
  watermarkType?: string;
  watermark?: string;
  watermarkOpacity?: number;
  watermarkRotate?: number;
  watermarkColor?: string;
};

type KkfileviewSettingsRecord = HealthCheckSettings & {
  id?: number | string;
  host?: string;
  extensions?: string;
  kkfileviewExtensions?: string;
  basemetasExtensions?: string;
  microsoftExtensions?: string;
  fileViewerAssetBase?: string;
  fileViewerExtensions?: string | string[];
  nocobaseHost?: string;
  preferKkfileview?: boolean;
  enableKkfileview?: boolean;
  enableBasemetas?: boolean;
  enableMicrosoft?: boolean;
  enableFileViewer?: boolean;
  enableOpenInNewWindow?: boolean;
  enableFullscreenButton?: boolean;
  enableMobileAutoFullscreen?: boolean;
  enableDownload?: boolean;
  basemetasRequestType?: string;
  basemetasFileAccess?: string;
  kkfileviewFileAccess?: string;
  enableCopyEmbedHtml?: boolean;
  copyEmbedHtmlPermission?: string;
  copyEmbedHtmlRoles?: string;
  serviceType?: string;
  preferredPreview?: string;
  fileViewerLoadMode?: 'cdn' | 'proxy';
};

type DestroyCapableRepository = {
  destroy?: (args: { filterByTk: unknown }) => Promise<unknown>;
  model?: {
    destroy: (args: { where: { id: unknown } }) => Promise<unknown>;
  };
};

type ActionContext = {
  action?: {
    params?: {
      values?: Record<string, unknown>;
    };
  };
  request?: {
    body?: Record<string, unknown>;
  };
  state?: {
    currentUser?: CurrentUserLike;
    user?: CurrentUserLike;
  };
  auth?: {
    user?: CurrentUserLike;
  };
  db: any;
  app?: any;
  status?: number;
  body?: any;
  set?: (key: string, val: string) => void;
  type?: string;
};

type ModificationLogRow = {
  id?: number | string;
  updatedAt?: string;
  createdAt?: string;
  timestamp?: string;
  time?: string;
  operator?: string;
  username?: string;
  userName?: string;
  user?: unknown;
  createdBy?: unknown;
  summary?: string;
  message?: string;
  description?: string;
  title?: string;
  action?: string;
  actionName?: string;
  event?: string;
  type?: string;
  changedFields?: unknown;
  content?: string;
  resourceName?: string;
  collectionName?: string;
  collection?: string;
  resource?: string;
  tableName?: string;
  model?: string;
  actionPath?: string;
};

export interface FileViewerDownloadProgress {
  status: 'idle' | 'searching' | 'downloading' | 'extracting' | 'copying' | 'completed' | 'error';
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  speedBytesPerSec: number;
  speedText: string;
  downloadedText: string;
  totalText: string;
  message: string;
  error?: string;
  updatedAt: number;
}

let globalDownloadProgress: FileViewerDownloadProgress = {
  status: 'idle',
  percent: 0,
  downloadedBytes: 0,
  totalBytes: 0,
  speedBytesPerSec: 0,
  speedText: '0 KB/s',
  downloadedText: '0 B',
  totalText: '0 B',
  message: '',
  updatedAt: Date.now(),
};

function formatProgressBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function getActionValues(ctx: ActionContext): Record<string, unknown> {
  const actionParams = ctx?.action?.params || {};
  const requestBody = ctx?.request?.body || {};
  const requestQuery = (ctx as any)?.request?.query || (ctx as any)?.query || {};

  return {
    ...requestQuery,
    ...actionParams,
    ...(actionParams.values || {}),
    ...requestBody,
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return fallback;
}

function normalizeExtensionTokens(items: Array<unknown> = []): string[] {
  // 统一清洗扩展名列表，避免大小写、空值与重复项带来脏数据。
  return Array.from(new Set(items.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)));
}

function parseExtensionsSaveInput(input: unknown, fallback: Array<unknown> = []): string[] {
  // 数组输入直接清洗，兼容前端 tags 组件提交结果。
  if (Array.isArray(input)) {
    return normalizeExtensionTokens(input);
  }
  // 读取字符串输入，兼容 JSON 字符串与逗号分隔两种历史格式。
  const rawValue = String(input ?? '').trim();
  // 空输入时回退到给定默认值。
  if (!rawValue) {
    return normalizeExtensionTokens(fallback);
  }
  try {
    // 优先按 JSON 数组解析，兼容数据库历史存量值。
    const parsed = JSON.parse(rawValue);
    if (Array.isArray(parsed)) {
      return normalizeExtensionTokens(parsed);
    }
  } catch {
    // JSON 解析失败时继续按逗号分隔处理普通字符串输入。
  }
  // 最后回退到逗号分隔解析，兼容手工输入场景。
  return normalizeExtensionTokens(rawValue.split(','));
}

function normalizeFileViewerAssetBase(value: unknown, fallback: unknown = DEFAULT_FILE_VIEWER_ASSET_BASE): string {
  // 优先使用当前值，缺失时再回退到已有值或默认值。
  const rawValue = String(value ?? fallback ?? '').trim();
  // 统一去掉尾部多余斜杠后再补一个，保证路径保存结果稳定。
  return rawValue ? `${rawValue.replace(/\/+$/, '')}/` : '';
}

export function normalizeSettingsSaveValues(
  values: Record<string, unknown>, // 接收本次提交的原始配置值。
  fallback: Partial<KkfileviewSettingsRecord> = {}, // 接收当前记录作为缺省回退值。
): Record<string, unknown> {
  // 统一归一化复制权限，避免非法值污染数据库。
  const copyEmbedHtmlPermission = String(
    values.copyEmbedHtmlPermission ?? fallback.copyEmbedHtmlPermission ?? '',
  ).trim();
  // 统一归一化水印类型，只允许 global 与 preview 两种值。
  const watermarkType = String(values.watermarkType ?? fallback.watermarkType ?? '').trim();
  // 统一解析 File Viewer 扩展名输入，兼容数组、JSON 字符串和逗号字符串。
  const fileViewerExtensions = parseExtensionsSaveInput(
    values.fileViewerExtensions ?? fallback.fileViewerExtensions ?? DEFAULT_FILE_VIEWER_EXTENSIONS,
    DEFAULT_FILE_VIEWER_EXTENSIONS,
  );
  // 返回服务端最终写库的稳定值集合。
  return {
    ...values,
    nocobaseHost: String(values.nocobaseHost ?? fallback.nocobaseHost ?? '').trim(),
    basemetasRequestType:
      (values.basemetasRequestType ?? fallback.basemetasRequestType) === 'base64' ? 'base64' : 'query',
    basemetasFileAccess:
      (values.basemetasFileAccess ?? fallback.basemetasFileAccess) === 'proxy' ? 'proxy' : DEFAULT_BASEMETAS_FILE_ACCESS,
    kkfileviewFileAccess:
      (values.kkfileviewFileAccess ?? fallback.kkfileviewFileAccess) === 'proxy' ? 'proxy' : DEFAULT_KKFILEVIEW_FILE_ACCESS,
    copyEmbedHtmlPermission: ['admin', 'user', 'roles'].includes(copyEmbedHtmlPermission)
      ? copyEmbedHtmlPermission
      : 'user',
    watermarkType: watermarkType === 'global' ? 'global' : 'preview',
    watermark: String(values.watermark ?? fallback.watermark ?? '').trim(),
    watermarkOpacity:
      typeof values.watermarkOpacity === 'number' && !isNaN(values.watermarkOpacity)
        ? Math.max(0.01, Math.min(1, values.watermarkOpacity))
        : (typeof fallback.watermarkOpacity === 'number' ? fallback.watermarkOpacity : 0.18),
    watermarkRotate:
      typeof values.watermarkRotate === 'number' && !isNaN(values.watermarkRotate)
        ? Math.max(-180, Math.min(180, Math.round(values.watermarkRotate)))
        : (typeof fallback.watermarkRotate === 'number' ? fallback.watermarkRotate : -24),
    watermarkColor: String(values.watermarkColor ?? fallback.watermarkColor ?? 'rgba(0, 0, 0, 0.18)').trim(),
    fileViewerAssetBase: normalizeFileViewerAssetBase(
      values.fileViewerAssetBase,
      fallback.fileViewerAssetBase,
    ),
    fileViewerExtensions: JSON.stringify(fileViewerExtensions),
    fileViewerLoadMode:
      (values.fileViewerLoadMode ?? fallback.fileViewerLoadMode) === 'proxy' ? 'proxy' : 'cdn',
    enableFileViewer:
      values.enableFileViewer === true ||
      (values.enableFileViewer !== false && fileViewerExtensions.length > 0),
  };
}

export class PluginFilePreviewerKkfileviewServer extends Plugin {
  /** 已签发的短期预览令牌注册表：jti -> { token, userId, expiresAt }，用于退出登录时批量吊销。 */
  private previewTokenRegistry = new Map<string, { token: string; userId: number | string; expiresAt: number }>();

  /** 令牌签发请求限流记录：userId -> 时间戳列表（滑动窗口）。 */
  private previewTokenRequestLog = new Map<number | string, number[]>();

  /** 预览记录写入限流记录：userId -> 时间戳列表（滑动窗口）。 */
  private previewRecordAppendLog = new Map<number | string, number[]>();

  /** 令牌签发限流：每个用户每分钟最多签发次数。 */
  private static readonly PREVIEW_TOKEN_RATE_LIMIT_MAX = 30;

  /** 令牌签发限流滑动窗口（毫秒）。 */
  private static readonly PREVIEW_TOKEN_RATE_LIMIT_WINDOW = 60 * 1000;

  async load() {
    const servePublicFile = async (ctx: any, next: () => Promise<any>) => {
      const apiPrefix = '/api/kkfileviewPublicAssets/';
      const publicPrefix = '/static/plugins/@nocobase/plugin-file-previewer-kkfileview/public/';
      const directPrefix = '/static/plugins/@nocobase/plugin-file-previewer-kkfileview/';
      let relPath = '';
      if (ctx.path && ctx.path.startsWith(apiPrefix)) {
        relPath = ctx.path.substring(apiPrefix.length);
      } else if (ctx.path && ctx.path.startsWith(publicPrefix)) {
        relPath = ctx.path.substring(publicPrefix.length);
      } else if (ctx.path && ctx.path.startsWith(directPrefix) && !ctx.path.includes('/dist/')) {
        relPath = ctx.path.substring(directPrefix.length);
      }

      if (relPath) {
        const fs = require('fs-extra');
        const publicDir = path.resolve(__dirname, '../../public');
        const targetFile = path.resolve(publicDir, relPath);
        // 路径穿越防护：解析后的目标必须位于 public 目录内。
        if (targetFile !== publicDir && !targetFile.startsWith(`${publicDir}${path.sep}`)) {
          ctx.status = 403;
          ctx.body = { error: 'Forbidden' };
          return;
        }
        if (await fs.pathExists(targetFile)) {
          const stat = await fs.stat(targetFile);
          if (stat.isFile()) {
            ctx.status = 200;
            ctx.set('Access-Control-Allow-Origin', '*');
            ctx.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            ctx.set('Cache-Control', 'public, max-age=31536000');
            const ext = path.extname(targetFile).toLowerCase();
            if (ext === '.js') {
              ctx.type = 'application/javascript; charset=utf-8';
            } else if (ext === '.css') {
              ctx.type = 'text/css; charset=utf-8';
            } else if (ext === '.json') {
              ctx.type = 'application/json; charset=utf-8';
            } else if (ext === '.wasm') {
              ctx.type = 'application/wasm';
            } else {
              ctx.type = ext;
            }
            ctx.body = await fs.readFile(targetFile);
            return;
          }
        }
      }
      await next();
    };

    const patchSettingsUpdate = async (ctx: any, next: () => Promise<any>) => {
      if (ctx.path && ctx.path.includes('kkfileviewSettings:update')) {
        const body = ctx.request?.body || {};
        ctx.action = ctx.action || {};
        ctx.action.params = ctx.action.params || {};
        const targetId = body.filterByTk || body.id || (body.filter && body.filter.id);
        if (targetId) {
          if (!ctx.action.params.filterByTk) {
            ctx.action.params.filterByTk = targetId;
          }
          if (!ctx.action.params.filter) {
            ctx.action.params.filter = { id: targetId };
          }
        }
      }
      await next();
    };

    if (Array.isArray((this.app as any).middleware)) {
      (this.app as any).middleware.unshift(servePublicFile, patchSettingsUpdate);
    } else {
      this.app.use(servePublicFile);
      this.app.use(patchSettingsUpdate);
    }

    await this.db.import({
      directory: path.resolve(__dirname, 'collections'),
    });

    this.registerSettingsSaveResource();
    this.registerHealthCheckResource();
    this.registerPreviewResource(); // 注册预览接口资源
    this.registerModificationRecordsResource();
    this.registerPreviewRecordsResource();
    this.registerFieldCleanupResource();
    this.registerFileViewerDownloadResource();
    this.registerFileViewerProxyResource();
    this.registerSettingsListResource();
    this.registerPublicAssetsResource();
    this.registerTokenRevocationHooks();
    this.app.acl.allow('kkfileviewPublicAssets', 'get', 'public');
    this.app.acl.allow('kkfileviewSettings', 'list', 'loggedIn');
    this.app.acl.allow('kkfileviewSettingsSave', 'save', 'loggedIn');
    this.app.acl.allow('kkfileviewHealthCheck', 'check', 'loggedIn');
    this.app.acl.allow('kkfileviewPreview', 'generate', 'loggedIn'); // 允许已登录用户访问预览接口
    this.app.acl.allow('kkfileviewPreview', 'resolveDirectUrl', 'loggedIn');
    this.app.acl.allow('kkfileviewPreview', 'createFileViewerToken', 'loggedIn');
    this.app.acl.allow('kkfileviewModificationRecords', 'list', 'loggedIn');
    this.app.acl.allow('kkfileviewModificationRecords', 'append', 'loggedIn');
    this.app.acl.allow('kkfileviewModificationRecords', 'remove', 'loggedIn');
    this.app.acl.allow('kkfileviewModificationRecords', 'clear', 'loggedIn');
    this.app.acl.allow('kkfileviewPreviewRecords', 'list', 'loggedIn');
    this.app.acl.allow('kkfileviewPreviewRecords', 'append', 'loggedIn');
    this.app.acl.allow('kkfileviewPreviewRecords', 'remove', 'loggedIn');
    this.app.acl.allow('kkfileviewPreviewRecords', 'clear', 'loggedIn');
    this.app.acl.allow('kkfileviewFieldCleanup', 'run', 'loggedIn');
    this.app.acl.allow('kkfileviewFileViewerDownload', ['download', 'progress'], 'loggedIn');
    this.app.acl.allow('kkfileviewFileViewerProxy', 'get', 'loggedIn');

    await this.db.sync({ force: false, alter: { drop: false } });
    await this.ensureDefaultRecord();
  }

  private registerSettingsSaveResource() {
    // 若资源已注册，则直接跳过，避免重复定义。
    if (this.app.resourceManager.isDefined('kkfileviewSettingsSave')) {
      return;
    }
    // 定义专用保存资源，确保配置保存时显式覆盖数据库中的第一条记录。
    const autoCorrectFileViewerLoadMode = this.autoCorrectFileViewerLoadMode.bind(this);
    const isFileViewerDistDownloaded = this.isFileViewerDistDownloaded.bind(this);
    this.app.resourceManager.define({
      name: 'kkfileviewSettingsSave',
      actions: {
        async save(ctx: ActionContext) {
          // 读取前端提交的配置值，兼容 action params 与 request body 两种来源。
          const values = getActionValues(ctx);
          // 获取配置仓库，用于更新或创建唯一配置记录。
          const repo = ctx.db.getRepository('kkfileviewSettings');
          // 按创建时间升序读取现有配置，第一条视为主配置。
          const rows = await repo.find({ sort: ['createdAt'] });
          // 统一将查询结果转成数组，避免空值导致后续判断异常。
          const list = Array.isArray(rows) ? rows : [];
          // 读取首条配置记录，后续优先执行更新。
          const first = (list[0] || null) as KkfileviewSettingsRecord | null;
          // 生成归一化后的保存值，确保布尔与字符串字段都按当前前端输入覆盖旧值。
          const nextValues = normalizeSettingsSaveValues(values, first || {});
          // 若已有配置记录，则直接覆盖更新，删除旧水印并保留最新前端输入。
          if (first?.id != null) {
            await repo.update({
              filterByTk: first.id,
              values: nextValues,
            });
          } else {
            // 若不存在配置记录，则创建一条新的配置记录。
            await repo.create({
              values: nextValues,
            });
          }
          // 若存在多余历史配置记录，则逐条清理，只保留第一条主配置。
          const extras = list.slice(1);
          // 复用可销毁仓库类型，兼容不同仓库实现。
          const destroyRepo = repo as DestroyCapableRepository;
          // 逐条删除多余记录，避免后续读取到旧配置。
          for (const item of extras) {
            // 提取多余记录 ID，缺失时跳过当前项。
            const itemId = (item as KkfileviewSettingsRecord)?.id;
            // 没有主键时无法删除，直接跳过。
            if (itemId == null) continue;
            // 优先使用 destroy 接口删除记录。
            if (destroyRepo.destroy) {
              await destroyRepo.destroy({ filterByTk: itemId });
              continue;
            }
            // 若仅提供底层 model.destroy，则走 where 删除。
            if (destroyRepo.model?.destroy) {
              await destroyRepo.model.destroy({ where: { id: itemId } });
            }
          }
          // 保存完成后重新读取首条记录，并将最新结果返回给前端。
          const refreshedRows = await repo.find({ sort: ['createdAt'] });
          // 取更新后的首条配置作为响应体。
          const refreshedFirst = Array.isArray(refreshedRows) ? refreshedRows[0] : null;
          // 自动纠偏：用户选择了本地静态模式（proxy）但本地静态文件缺失时，切换为 CDN 模式并同步数据库。
          await autoCorrectFileViewerLoadMode(ctx, repo, (refreshedFirst || null) as KkfileviewSettingsRecord | null, await isFileViewerDistDownloaded());
          // 按常规 data 包装格式返回保存结果。
          ctx.body = {
            data: refreshedFirst || null,
          };
        },
      },
    });
  }

  private registerModificationRecordsResource() {
    if (this.app.resourceManager.isDefined('kkfileviewModificationRecords')) {
      return;
    }
    this.app.resourceManager.define({
      name: 'kkfileviewModificationRecords',
      actions: {
        async append(ctx: ActionContext) {
          const values = getActionValues(ctx);
          const currentUser = ctx?.state?.currentUser || ctx?.state?.user || ctx?.auth?.user || null;
          const operator = String(
            currentUser?.nickname || currentUser?.username || values.operator || '-'
          ).trim() || '-';
          const summary = String(values.summary || '保存配置').trim();
          const content = String(values.content || '').trim();
          const rawChangedFields = values.changedFields;
          const changedFields = Array.isArray(rawChangedFields)
            ? rawChangedFields.map((item) => String(item || '').trim()).filter(Boolean)
            : [];
          const repo = ctx.db.getRepository('kkfileviewModificationRecordItems');
          await repo.create({
            values: {
              operator,
              summary,
              changedFields: JSON.stringify(changedFields),
              content,
            },
          });
          ctx.body = {
            data: {
              success: true,
            },
          };
        },
        async list(ctx: ActionContext) {
          try {
            const repo = ctx.db.getRepository('kkfileviewModificationRecordItems');
            const rows = await repo.find({
              sort: ['-createdAt'],
              limit: 100,
            });
            const records = (Array.isArray(rows) ? rows : []).map((item, index) => {
              const row = (item || {}) as Record<string, unknown>;
              let changedFields: string[] = [];
              const rawChangedFields = row.changedFields;
              if (Array.isArray(rawChangedFields)) {
                changedFields = rawChangedFields.map((field) => String(field || '').trim()).filter(Boolean);
              } else {
                const text = String(rawChangedFields || '').trim();
                if (text) {
                  try {
                    const parsed = JSON.parse(text);
                    if (Array.isArray(parsed)) {
                      changedFields = parsed.map((field) => String(field || '').trim()).filter(Boolean);
                    }
                  } catch {
                    changedFields = text.split(/[,，;；\s]+/).map((field) => field.trim()).filter(Boolean);
                  }
                }
              }
              return {
                id: row.id || `local-${index}`,
                updatedAt: row.updatedAt || row.createdAt || null,
                operator: String(row.operator || '').trim() || '-',
                summary: String(row.summary || '').trim() || '保存配置',
                changedFields,
                content: String(row.content || '').trim(),
              };
            });
            ctx.body = {
              data: records,
            };
            return;
          } catch {
          }
          const repositoryCandidates = ['audits', 'auditLogs', 'systemLogs', 'logs', 'applicationLogs'];
          const matchKkfileview = (row: ModificationLogRow) => {
            const text = [
              row.resourceName,
              row.collectionName,
              row.collection,
              row.resource,
              row.tableName,
              row.model,
              row.actionPath,
              row.actionName,
              row.message,
              row.summary,
              row.description,
              row.title,
            ]
              .map((item) => String(item || '').toLowerCase())
              .filter(Boolean)
              .join(' ');
            return text.includes('kkfileview');
          };
          const resolveOperator = (row: ModificationLogRow) => {
            const direct = [row.operator, row.username, row.userName].map((item) => String(item || '').trim()).find(Boolean);
            if (direct) return direct;
            const user = row.user as Record<string, unknown> | undefined;
            if (user && typeof user === 'object') {
              const nested = [user.nickname, user.username, user.name].map((item) => String(item || '').trim()).find(Boolean);
              if (nested) return nested;
            }
            const createdBy = row.createdBy as Record<string, unknown> | undefined;
            if (createdBy && typeof createdBy === 'object') {
              const nested = [createdBy.nickname, createdBy.username, createdBy.name].map((item) => String(item || '').trim()).find(Boolean);
              if (nested) return nested;
            }
            return '-';
          };
          const resolveChange = (row: ModificationLogRow) => {
            const direct = [row.summary, row.message, row.description, row.title, row.action, row.actionName, row.event, row.type]
              .map((item) => String(item || '').trim())
              .find(Boolean);
            if (direct) return direct;
            if (Array.isArray(row.changedFields) && row.changedFields.length > 0) {
              return row.changedFields.map((item) => String(item || '').trim()).filter(Boolean).join(', ');
            }
            return 'kkfileviewSettings';
          };
          for (const name of repositoryCandidates) {
            try {
              const repo = ctx.db.getRepository(name);
              if (!repo) continue;
              const rows = await repo.find({
                sort: ['-createdAt'],
                limit: 100,
              });
              const sourceRows = Array.isArray(rows) ? rows : [];
              const matchedRows = sourceRows.filter((item) => matchKkfileview((item || {}) as ModificationLogRow));
              const finalRows = (matchedRows.length > 0 ? matchedRows : sourceRows).map((item, index) => {
                const row = (item || {}) as ModificationLogRow;
                return {
                  id: row.id || `${name}-${index}`,
                  updatedAt: row.updatedAt || row.createdAt || row.timestamp || row.time || null,
                  operator: resolveOperator(row),
                  summary: resolveChange(row),
                };
              });
              ctx.body = {
                data: finalRows,
              };
              return;
            } catch {
            }
          }
          ctx.body = {
            data: [],
          };
        },
        async remove(ctx: ActionContext) {
          const values = getActionValues(ctx);
          const id = values.id;
          if (id == null || String(id).trim() === '') {
            ctx.status = 400;
            ctx.body = { data: { success: false, message: 'id-required' } };
            return;
          }
          const repo = ctx.db.getRepository('kkfileviewModificationRecordItems') as DestroyCapableRepository;
          if (repo.destroy) {
            await repo.destroy({ filterByTk: id });
          } else if (repo.model?.destroy) {
            await repo.model.destroy({ where: { id } });
          }
          ctx.body = { data: { success: true } };
        },
        async clear(ctx: ActionContext) {
          const repo = ctx.db.getRepository('kkfileviewModificationRecordItems');
          const rows = await repo.find({ limit: 1000 });
          const list = Array.isArray(rows) ? rows : [];
          const destroyRepo = repo as DestroyCapableRepository;
          for (const item of list) {
            const id = (item as { id?: unknown })?.id;
            if (id == null) continue;
            if (destroyRepo.destroy) {
              await destroyRepo.destroy({ filterByTk: id });
            } else if (destroyRepo.model?.destroy) {
              await destroyRepo.model.destroy({ where: { id } });
            }
          }
          ctx.body = { data: { success: true } };
        },
      },
    });
  }

  private registerPreviewRecordsResource() {
    if (this.app.resourceManager.isDefined('kkfileviewPreviewRecords')) {
      return;
    }
    // 资源动作由 koa-compose 调用，不绑定 this，需用闭包显式绑定。
    const isActionRateLimited = this.isActionRateLimited.bind(this);
    const previewRecordAppendLog = this.previewRecordAppendLog;
    this.app.resourceManager.define({
      name: 'kkfileviewPreviewRecords',
      actions: {
        async append(ctx: ActionContext) {
          const values = getActionValues(ctx);
          const currentUser = ctx?.state?.currentUser || ctx?.state?.user || ctx?.auth?.user || null;
          // 防止恶意刷写预览记录表：每用户每分钟最多写入 30 条。
          const userId = (currentUser as any)?.id;
          if (userId != null && isActionRateLimited(previewRecordAppendLog, userId, 30, 60 * 1000)) {
            ctx.status = 429;
            ctx.body = { data: { success: false, message: 'preview-record-rate-limited' } };
            return;
          }
          const operator = String(
            currentUser?.nickname || currentUser?.username || values.operator || '-'
          ).trim() || '-';
          const fileName = String(values.fileName || '').trim();
          const previewService = String(values.previewService || '').trim();
          const fileUrl = String(values.fileUrl || '').trim();
          const requestedAtRaw = String(values.requestedAt || '').trim();
          const requestedAt = requestedAtRaw || new Date().toISOString();
          const repo = ctx.db.getRepository('kkfileviewPreviewRecordItems');
          await repo.create({
            values: {
              operator,
              fileName,
              previewService,
              fileUrl,
              requestedAt,
            },
          });
          ctx.body = {
            data: {
              success: true,
            },
          };
        },
        async list(ctx: ActionContext) {
          const repo = ctx.db.getRepository('kkfileviewPreviewRecordItems');
          const rows = await repo.find({
            sort: ['-requestedAt', '-createdAt'],
            limit: 200,
          });
          const records = (Array.isArray(rows) ? rows : []).map((item, index) => {
            const row = (item || {}) as Record<string, unknown>;
            return {
              id: row.id || `preview-${index}`,
              operator: String(row.operator || '').trim() || '-',
              fileName: String(row.fileName || '').trim(),
              previewService: String(row.previewService || '').trim(),
              fileUrl: String(row.fileUrl || '').trim(),
              requestedAt: row.requestedAt || row.createdAt || null,
            };
          });
          ctx.body = {
            data: records,
          };
        },
        async remove(ctx: ActionContext) {
          const values = getActionValues(ctx);
          const id = values.id;
          if (id == null || String(id).trim() === '') {
            ctx.status = 400;
            ctx.body = { data: { success: false, message: 'id-required' } };
            return;
          }
          const repo = ctx.db.getRepository('kkfileviewPreviewRecordItems') as DestroyCapableRepository;
          if (repo.destroy) {
            await repo.destroy({ filterByTk: id });
          } else if (repo.model?.destroy) {
            await repo.model.destroy({ where: { id } });
          }
          ctx.body = { data: { success: true } };
        },
        async clear(ctx: ActionContext) {
          const repo = ctx.db.getRepository('kkfileviewPreviewRecordItems');
          const rows = await repo.find({ limit: 1000 });
          const list = Array.isArray(rows) ? rows : [];
          const destroyRepo = repo as DestroyCapableRepository;
          for (const item of list) {
            const id = (item as { id?: unknown })?.id;
            if (id == null) continue;
            if (destroyRepo.destroy) {
              await destroyRepo.destroy({ filterByTk: id });
            } else if (destroyRepo.model?.destroy) {
              await destroyRepo.model.destroy({ where: { id } });
            }
          }
          ctx.body = { data: { success: true } };
        },
      },
    });
  }

  private registerFieldCleanupResource() {
    if (this.app.resourceManager.isDefined('kkfileviewFieldCleanup')) {
      return;
    }
    this.app.resourceManager.define({
      name: 'kkfileviewFieldCleanup',
      actions: {
        async run(ctx: ActionContext) {
          const repo = ctx.db.getRepository('kkfileviewSettings');
          const rows = await repo.find({ sort: ['createdAt'] });
          const list = Array.isArray(rows) ? rows : [];
          const parseExtensionsText = (raw: unknown, fallback: string[]) => {
            if (Array.isArray(raw)) {
              const values = raw.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean);
              return values.length > 0 ? values : [...fallback];
            }
            const text = String(raw || '').trim();
            if (!text) return [...fallback];
            try {
              const parsed = JSON.parse(text);
              if (Array.isArray(parsed)) {
                const values = parsed.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean);
                return values.length > 0 ? values : [...fallback];
              }
            } catch {
            }
            const values = text.split(/[,，;；\s]+/).map((item) => item.trim().toLowerCase()).filter(Boolean);
            return values.length > 0 ? values : [...fallback];
          };
          let migratedCount = 0;
          let cleanedCount = 0;
          for (const rowItem of list) {
            const row = (rowItem || {}) as KkfileviewSettingsRecord;
            // ── 第一步：确定需要迁移的新字段值（新字段缺失时先从旧字段补齐）────────
            const migrationPatch: Record<string, unknown> = {};
            const legacyHost = String(row.host || '').trim();
            const legacyService = String(row.serviceType || '').trim().toLowerCase();
            const legacyPrefer = row.preferKkfileview;
            const legacyExt = parseExtensionsText(row.extensions, DEFAULT_EXTENSIONS);

            if (!String(row.kkfileviewHost || '').trim()) {
              migrationPatch.kkfileviewHost = legacyService === 'kkfileview' && legacyHost ? legacyHost : DEFAULT_KKFILEVIEW_HOST;
            }
            if (!String(row.basemetasHost || '').trim()) {
              migrationPatch.basemetasHost = legacyService === 'basemetas' && legacyHost ? legacyHost : DEFAULT_BASEMETAS_HOST;
            }
            if (!String(row.microsoftHost || '').trim()) {
              migrationPatch.microsoftHost = DEFAULT_MICROSOFT_HOST;
            }
            if (!String(row.kkfileviewExtensions || '').trim()) {
              migrationPatch.kkfileviewExtensions = JSON.stringify(legacyExt);
            }
            if (!String(row.basemetasExtensions || '').trim()) {
              migrationPatch.basemetasExtensions = JSON.stringify(legacyExt);
            }
            if (!String(row.microsoftExtensions || '').trim()) {
              migrationPatch.microsoftExtensions = JSON.stringify(DEFAULT_MICROSOFT_EXTENSIONS);
            }
            if (row.enableKkfileview === undefined) migrationPatch.enableKkfileview = true;
            if (row.enableBasemetas === undefined) migrationPatch.enableBasemetas = legacyService === 'basemetas';
            if (row.enableMicrosoft === undefined) migrationPatch.enableMicrosoft = legacyPrefer === false;
            if (!row.preferredPreview) {
              migrationPatch.preferredPreview = legacyPrefer === false
                ? 'microsoft'
                : legacyService === 'basemetas'
                  ? 'basemetas'
                  : DEFAULT_PREFERRED_PREVIEW;
            }

            // ── 第二步：新字段均已确认有值后，才清空旧兼容字段 ───────────────────
            // 以迁移后的最终值（patch 中的 or 行中已有的）来判断是否可以安全清空旧字段。
            const finalKkviewHost = String(migrationPatch.kkfileviewHost ?? row.kkfileviewHost ?? '').trim();
            const finalBasemetasHost = String(migrationPatch.basemetasHost ?? row.basemetasHost ?? '').trim();
            const finalMicrosoftHost = String(migrationPatch.microsoftHost ?? row.microsoftHost ?? '').trim();
            const finalKkviewExt = String(migrationPatch.kkfileviewExtensions ?? row.kkfileviewExtensions ?? '').trim();
            const finalBasemetasExt = String(migrationPatch.basemetasExtensions ?? row.basemetasExtensions ?? '').trim();
            const finalMicrosoftExt = String(migrationPatch.microsoftExtensions ?? row.microsoftExtensions ?? '').trim();

            const cleanupPatch: Record<string, unknown> = {};
            // 三个主机新字段均有值时，才清空旧 host 字段
            if (finalKkviewHost && finalBasemetasHost && finalMicrosoftHost) {
              cleanupPatch.host = '';
            }
            // 三个扩展名新字段均有值时，才清空旧 extensions 字段
            if (finalKkviewExt && finalBasemetasExt && finalMicrosoftExt) {
              cleanupPatch.extensions = '[]';
            }
            // preferredPreview 已覆盖 preferKkfileview 语义，可安全清零
            cleanupPatch.preferKkfileview = false;
            // serviceType 已无实际读取路径，可安全清空
            cleanupPatch.serviceType = '';

            const hasMigration = Object.keys(migrationPatch).length > 0;
            const patch = { ...migrationPatch, ...cleanupPatch };
            const hasChange = Object.keys(patch).length > 0;

            if (!hasChange) continue;

            await repo.update({
              filterByTk: row.id,
              values: patch,
            });
            if (hasMigration) migratedCount += 1;
            cleanedCount += 1;
          }
          ctx.body = {
            data: {
              migratedCount,
              cleanedCount,
              message: `清理完成：迁移 ${migratedCount} 条，清理 ${cleanedCount} 条`,
            },
          };
        },
      },
    });
  }

  async install() {
    await this.ensureDefaultRecord();
  }

  async afterEnable() {
    await this.ensureDefaultRecord();
  }

  /**
   * 签发 File Viewer 预览用的短期令牌。
   * 令牌使用与 NocoBase 会话一致的签名密钥，但带独立 audience/scope，
   * 有效期默认 10 分钟（可被环境变量调整），并且绑定到具体的文件地址，
   * 确保预览地址中的令牌只能临时使用，且每次预览都会签发全新的令牌。
   * 仅允许为 NocoBase 托管的文件地址签发，避免代理被用作任意 URL 的 SSRF 通道。
   */
  private async issueFileViewerPreviewToken(ctx: ActionContext): Promise<{ token: string; expiresAt: number; expiresIn: string } | null> {
    const values = getActionValues(ctx);
    const fileUrl = String(values.url || '').trim();
    if (!fileUrl) {
      ctx.status = 400;
      ctx.body = { data: { message: 'url-required' } };
      return null;
    }
    const currentUser = ctx?.state?.currentUser || ctx?.state?.user || ctx?.auth?.user || null;
    const userId = (currentUser as any)?.id;
    if (!userId) {
      ctx.status = 401;
      ctx.body = { data: { message: 'unauthenticated' } };
      return null;
    }
    if (this.isPreviewTokenRateLimited(userId)) {
      ctx.status = 429;
      ctx.body = { data: { message: 'preview-token-rate-limited' } };
      return null;
    }
    const token = await this.issuePreviewTokenForFileUrl(ctx, fileUrl);
    if (!token) {
      ctx.status = 403;
      ctx.body = { data: { message: 'url-not-allowed' } };
      return null;
    }
    const expiresIn = getPreviewTokenExpiresIn();
    let expiresAt = Date.now() + parsePreviewTokenExpiresInToMs(expiresIn);
    try {
      const decoded = await (this.app as any).authManager.jwt.decode(token);
      if (decoded && typeof decoded === 'object' && typeof (decoded as any).exp === 'number') {
        expiresAt = (decoded as any).exp * 1000;
      }
    } catch {
      // 忽略解码失败，回退到估算过期时间。
    }
    return { token, expiresAt, expiresIn };
  }

  /**
   * 将 NocoBase 托管路径（相对或绝对）归一化为可被外部预览服务访问的绝对地址。
   * 外部存储直链一律不返回，统一经 NocoBase 自身路径访问以应用 ACL 校验。
   * 配置了系统公共访问地址（nocobaseHost）时优先使用该地址，
   * 否则回退到当前请求来源，保证第三方服务（如 BaseMetas）能从公网拉取文件。
   */
  private buildSameOriginAbsoluteUrl(ctx: ActionContext, url: string, preferredHost: string = ''): string {
    if (!url) return url;
    let pathAndQuery = url;
    try {
      const parsed = new URL(pathAndQuery, 'http://localhost');
      pathAndQuery = parsed.pathname + parsed.search;
    } catch {
      // 保持原样。
    }
    if (/^https?:\/\//i.test(pathAndQuery)) return pathAndQuery;
    const normalizedPreferred = String(preferredHost || '').trim().replace(/\/+$/, '');
    if (normalizedPreferred && /^https?:\/\//i.test(normalizedPreferred)) {
      try {
        const parsedPreferred = new URL(normalizedPreferred);
        const preferredPublicPath = parsedPreferred.pathname.replace(/\/+$/, '');
        if (preferredPublicPath && preferredPublicPath !== '/') {
          pathAndQuery = `${preferredPublicPath}${pathAndQuery.startsWith('/') ? '' : '/'}${pathAndQuery}`;
        }
        return `${parsedPreferred.origin}${pathAndQuery.startsWith('/') ? '' : '/'}${pathAndQuery}`;
      } catch {
        return `${normalizedPreferred}${pathAndQuery.startsWith('/') ? '' : '/'}${pathAndQuery}`;
      }
    }
    const request = (ctx as any)?.request || {};
    const host = request.header?.host || request.host || '';
    const protocol = request.protocol || 'http';
    const publicPath = (ctx as any)?.app?.getAppPublicPath?.() || process.env.APP_PUBLIC_PATH || '/';
    const base = `${protocol}://${host}${publicPath.replace(/\/+$/, '')}`;
    return `${base}${pathAndQuery.startsWith('/') ? '' : '/'}${pathAndQuery}`;
  }

  /**
   * 将 NocoBase 托管文件地址解析为存储的真实文件地址。
   * 复用 file-manager 插件的 getFileURL 计算逻辑（与 /files/ 302 重定向目标一致），
   * 外部存储（如内网 MinIO/S3、远程文件服务器）返回绝对直链，
   * 本地存储返回相对路径时统一视为无法直连并返回 null。
   */
  private async resolveStorageDirectUrl(ctx: ActionContext, fileUrl: string): Promise<string | null> {
    try {
      const parsed = new URL(fileUrl, 'http://localhost');
      const segments = parsed.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
      // 永久文件地址形态：/files/{appName}/{dataSourceKey}/{collectionName}/{id}(.ext)
      if (segments.length < 5 || segments[0] !== 'files') return null;
      const collectionName = segments[3];
      const id = String(segments[4] || '').replace(/\.\w+$/, '');
      if (!collectionName || !id) return null;
      const fileManager = (ctx.app as any)?.pm?.get?.('file-manager');
      if (!fileManager || typeof fileManager.getFileURL !== 'function') return null;
      const repo = ctx.db.getRepository(collectionName);
      if (!repo) return null;
      const file = await repo.findOne({
        filter: { id },
        fields: ['id', 'storageId', 'path', 'filename', 'extname', 'mimetype', 'url', 'meta'],
      });
      if (!file || file.storageId == null) return null;
      const rawUrl = String((await fileManager.getFileURL(file, false)) || '').trim();
      if (!/^https?:\/\//i.test(rawUrl)) return null;
      return rawUrl;
    } catch {
      return null;
    }
  }

  /**
   * 将请求中的文件地址解析为允许拉取的目标地址，兼容两类来源：
   * 1. NocoBase 托管地址（/files/ 永久地址、/storage/ 本地地址）——按原逻辑直接放行；
   * 2. 外部存储直链（如 MinIO/S3）——仅当能在文件记录表中匹配到对应文件时放行，
   *    防止代理被用作任意 URL 的 SSRF 通道。
   *    兼容 NocoBase 2.1：附件记录返回的 url 即为存储直链（无 /files/ 永久地址），
   *    客户端会携带该地址请求令牌/代理，若一律拒绝将导致 MinIO 等外部存储的附件无法预览。
   */
  private async resolveAllowedFileFetchTarget(ctx: ActionContext, fileUrl: string): Promise<{ allowed: boolean; targetUrl: string }> {
    if (isNocoBaseManagedFileUrl(fileUrl)) {
      return { allowed: true, targetUrl: fileUrl };
    }
    const found = await this.findFileRecordByStorageUrl(ctx, fileUrl);
    if (!found?.record) return { allowed: false, targetUrl: '' };
    return { allowed: true, targetUrl: fileUrl };
  }

  /** 外部存储直链放行结果的短期缓存，避免代理高频请求反复扫描文件表。 */
  private fileUrlAllowCache = new Map<string, { allowed: boolean; expiresAt: number }>();

  private readonly FILE_URL_ALLOW_CACHE_TTL_MS = 60 * 1000;

  private getCachedFileUrlAllowance(fileUrl: string): boolean | undefined {
    const entry = this.fileUrlAllowCache.get(fileUrl);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.fileUrlAllowCache.delete(fileUrl);
      return undefined;
    }
    return entry.allowed;
  }

  private cacheFileUrlAllowance(fileUrl: string, allowed: boolean): void {
    if (this.fileUrlAllowCache.size > 2000) {
      const now = Date.now();
      for (const [key, entry] of this.fileUrlAllowCache) {
        if (entry.expiresAt <= now) this.fileUrlAllowCache.delete(key);
      }
    }
    this.fileUrlAllowCache.set(fileUrl, { allowed, expiresAt: Date.now() + this.FILE_URL_ALLOW_CACHE_TTL_MS });
  }

  /**
   * 在文件记录中查找与外部存储直链匹配的记录。
   * 匹配策略：
   * 1. 记录 url 字段与请求地址（解码后）完全一致；
   * 2. 按文件名匹配候选记录后，用 file-manager 的 getFileURL 生成规范地址并与请求地址比较，
   *    确保地址确实属于该文件记录对应的存储，而非任意外部地址。
   */
  private async findFileRecordByStorageUrl(
    ctx: ActionContext,
    fileUrl: string,
  ): Promise<{ record: unknown; collectionName: string } | null> {
    try {
      const parsed = new URL(fileUrl);
      const decodedPath = decodeURIComponent(parsed.pathname);
      const decodedUrl = `${parsed.origin}${decodedPath}`;
      const fileName = String(decodedPath.split('/').pop() || '').trim();
      if (!fileName) return null;
      const collections: string[] = [];
      for (const collection of (ctx.db as any).collections?.values?.() || []) {
        if (collection?.name === 'attachments' || collection?.options?.template === 'file') {
          collections.push(collection.name);
        }
      }
      if (collections.length === 0) return null;
      const fileManager = (ctx.app as any)?.pm?.get?.('file-manager');
      const fields = ['id', 'url', 'path', 'filename', 'extname', 'storageId'];
      for (const collectionName of collections) {
        const repo = ctx.db.getRepository(collectionName);
        if (!repo) continue;
        try {
          const byUrl = await repo.findOne({ filter: { url: decodedUrl }, fields });
          if (byUrl) return { record: byUrl, collectionName };
        } catch {
          // 忽略单次查询失败。
        }
        try {
          const candidates = await repo.find({ filter: { filename: fileName }, fields, limit: 20 });
          for (const record of candidates) {
            try {
              if (typeof fileManager?.getFileURL === 'function') {
                const canonical = String((await fileManager.getFileURL(record, false)) || '').trim();
                if (canonical && decodeURIComponent(canonical.split('?')[0]) === decodedUrl) return { record, collectionName };
              }
            } catch {
              // 忽略单条记录解析失败。
            }
          }
        } catch {
          // 忽略单次查询失败。
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 记录级文件访问判定：复用 file-manager 的 ACL view 权限解析（resolveActionParams），
   * 管理员配置的附件表权限（含 own 合并参数/字段权限）在此同步生效；
   * 平台默认（attachments 对登录用户开放 view）时行为不变，判定失败一律拒绝（fail-closed）。
   */
  private async canViewAttachment(ctx: ActionContext, record: any, collectionName: string): Promise<boolean> {
    try {
      const id = record?.get ? record.get('id') : record?.id;
      if (id === undefined || id === null) return false;
      const db = ctx.db || this.app.db;
      const collection = db.getCollection(collectionName || 'attachments');
      if (!collection) return false;
      const acl = (ctx as any).dataSource?.acl || (this.app as any).acl;
      if (!acl) return false;
      if ((this.app as any).options?.acl === false) return true; // 平台关闭 ACL 时与文件端点行为一致
      const permission = await acl.resolveActionParams(ctx, {
        resourceName: collection.name,
        actionName: 'view',
        params: { filter: { id } },
      });
      const mergedFilter = permission?.mergedParams?.filter ?? { id };
      const found = await db.getRepository(collection.name)?.findOne({ filter: mergedFilter, fields: ['id'] });
      return !!found;
    } catch {
      return false;
    }
  }

  /**
   * 为指定文件地址签发短期预览令牌（不写 ctx）。
   * 令牌绑定的是源文件地址（NocoBase 托管路径或匹配的存储直链），代理侧据此校验一致性。
   * 非 NocoBase 托管地址、无法匹配到文件记录或未登录时返回 null。
   */
  private async issuePreviewTokenForFileUrl(ctx: ActionContext, fileUrl: string): Promise<string | null> {
    let allowed = this.getCachedFileUrlAllowance(fileUrl);
    if (allowed === undefined) {
      const resolution = await this.resolveAllowedFileFetchTarget(ctx, fileUrl);
      allowed = resolution.allowed;
      this.cacheFileUrlAllowance(fileUrl, resolution.allowed);
    }
    if (!allowed) return null;
    const currentUser = ctx?.state?.currentUser || ctx?.state?.user || ctx?.auth?.user || null;
    const userId = (currentUser as any)?.id;
    if (!userId) return null;
    const roleName = typeof (ctx as any)?.state?.currentRole === 'string' ? (ctx as any).state.currentRole : undefined;
    const expiresIn = getPreviewTokenExpiresIn();
    const payload = buildFileViewerPreviewTokenPayload(userId, {
      roleName,
      targetUrl: fileUrl,
    });
    const token = (this.app as any).authManager.jwt.sign(payload, {
      expiresIn,
      jwtid: crypto.randomUUID(),
    });
    this.registerPreviewToken(token, userId);
    return token;
  }

  /** 登记已签发的预览令牌，供代理校验与退出登录吊销。 */
  private async registerPreviewToken(token: string, userId: number | string): Promise<void> {
    this.prunePreviewTokenRegistry();
    try {
      const decoded = await (this.app as any).authManager.jwt.decode(token);
      if (!decoded || typeof decoded !== 'object') return;
      const jti = String((decoded as any).jti || '');
      const exp = (decoded as any).exp as number | undefined;
      if (!jti) return;
      this.previewTokenRegistry.set(jti, {
        token,
        userId,
        expiresAt: typeof exp === 'number' ? exp * 1000 : Date.now() + 10 * 60 * 1000,
      });
    } catch {
      // 解码失败时忽略登记，令牌自然失效。
    }
  }

  /** 清理已过期的令牌登记，避免内存无限增长。 */
  private prunePreviewTokenRegistry(): void {
    const now = Date.now();
    for (const [jti, entry] of this.previewTokenRegistry) {
      if (entry.expiresAt <= now) {
        this.previewTokenRegistry.delete(jti);
      }
    }
  }

  /** 吊销指定用户的全部短期预览令牌（加入 NocoBase 令牌黑名单，立即全局失效）。 */
  private async revokePreviewTokensForUser(userId: number | string): Promise<void> {
    for (const [jti, entry] of this.previewTokenRegistry) {
      if (entry.userId !== userId) continue;
      try {
        await (this.app as any).authManager.jwt.block(entry.token);
      } catch {
        // 忽略单个令牌吊销失败。
      }
      this.previewTokenRegistry.delete(jti);
    }
  }

  /**
   * 注册退出登录事件钩子：用户登出时吊销其全部预览令牌，
   * 避免短期令牌在登出后仍可被用于拉取文件。
   */
  private registerTokenRevocationHooks(): void {
    (this.app as any).on?.('auth:signOut', ({ ctx }: { ctx: any }) => {
      const currentUser = ctx?.state?.currentUser || ctx?.state?.user || ctx?.auth?.user || null;
      const userId = (currentUser as any)?.id;
      if (userId == null) return;
      void this.revokePreviewTokensForUser(userId);
    });
  }

  /** 令牌签发限流：每个用户每分钟最多签发 PREVIEW_TOKEN_RATE_LIMIT_MAX 次。 */
  private isPreviewTokenRateLimited(userId: number | string): boolean {
    return this.isActionRateLimited(
      this.previewTokenRequestLog,
      userId,
      PluginFilePreviewerKkfileviewServer.PREVIEW_TOKEN_RATE_LIMIT_MAX,
      PluginFilePreviewerKkfileviewServer.PREVIEW_TOKEN_RATE_LIMIT_WINDOW,
    );
  }

  /** 通用滑动窗口限流：记录命中窗口内超过 max 次则拒绝。 */
  private isActionRateLimited(log: Map<number | string, number[]>, userId: number | string, max: number, windowMs: number): boolean {
    const now = Date.now();
    const recent = (log.get(userId) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      log.set(userId, recent);
      return true;
    }
    recent.push(now);
    log.set(userId, recent);
    return false;
  }

  private registerPreviewResource() {
    if (this.app.resourceManager.isDefined('kkfileviewPreview')) {
      return;
    }
    const issuePreviewToken = this.issueFileViewerPreviewToken.bind(this);
    const issuePreviewTokenForFileUrl = this.issuePreviewTokenForFileUrl.bind(this);
    const buildSameOriginAbsoluteUrl = this.buildSameOriginAbsoluteUrl.bind(this);
    const resolveStorageDirectUrl = this.resolveStorageDirectUrl.bind(this);
    const resolveAllowedFileFetchTarget = this.resolveAllowedFileFetchTarget.bind(this);
    this.app.resourceManager.define({
      name: 'kkfileviewPreview',
      actions: {
        async generate(ctx: ActionContext) {
          // 获取请求参数中的 url
          const values = getActionValues(ctx);
          // 读取当前登录用户，用于统一解析水印模板变量。
          const currentUser = ctx?.state?.currentUser || ctx?.state?.user || ctx?.auth?.user || null;
          const fileUrl = String(values.url || '').trim();

          // 如果没有提供 url，返回错误
          if (!fileUrl) {
            ctx.status = 400;
            ctx.body = {
              data: {
                message: 'url-required',
              },
            };
            return;
          }

          try {
            // 仅允许 NocoBase 托管地址或与文件记录匹配的存储直链，防止把任意地址交给 kkFileView 服务器拉取。
            const resolution = await resolveAllowedFileFetchTarget(ctx, fileUrl);
            if (!resolution.allowed) {
              ctx.status = 403;
              ctx.body = { data: { message: 'url-not-allowed' } };
              return;
            }
            // 获取数据库中的 kkFileView 配置
            const repo = ctx.db.getRepository('kkfileviewSettings');
            const rows = await repo.find({ sort: ['createdAt'] });
            const settings = (rows?.[0] || {}) as HealthCheckSettings;

            // 获取 kkFileView 服务地址
            const host = settings.kkfileviewHost || DEFAULT_KKFILEVIEW_HOST;
            // 不解析到外部存储直链：返回同源 /files/ 路径并附加短期令牌，
            // kkFileView 拉取时经 NocoBase 文件中间件执行 ACL 校验。
            // 配置了系统公共访问地址时优先使用，确保外部服务可访问该地址。
            let targetFileUrl = buildSameOriginAbsoluteUrl(ctx, fileUrl, String(settings.nocobaseHost || ''));
            // 使用短期预览令牌替代用户会话令牌，避免长期令牌泄露给 kkFileView 服务器。
            const token = await issuePreviewTokenForFileUrl(ctx, fileUrl);
            if (token && !targetFileUrl.includes('token=')) {
              const separator = targetFileUrl.includes('?') ? '&' : '?';
              targetFileUrl = `${targetFileUrl}${separator}token=${encodeURIComponent(token)}`;
            }

            // 将文件地址进行 Base64 编码
            const encodedUrl = Buffer.from(targetFileUrl).toString('base64');
            // 拼接基础预览地址
            let previewUrl = `${host.replace(/\/$/, '')}/onlinePreview?url=${encodeURIComponent(encodedUrl)}`;

            // 先按前端一致的规则解析水印模板变量，确保不同入口的水印文本完全一致。
            const resolvedWatermark = resolveWatermarkTemplate(String(settings.watermark || ''), {
              user: currentUser,
              requestedAt: new Date(),
            }).trim();
            // 仅当水印类型为预览水印时，才向 kkFileView 传递预览水印参数。
            const normalizedWatermarkType = String(settings.watermarkType || 'preview').trim().toLowerCase();
            if ((normalizedWatermarkType === 'preview' || normalizedWatermarkType === 'global') && resolvedWatermark) {
              previewUrl += `&watermarkTxt=${encodeURIComponent(resolvedWatermark)}`;
            }

            // 返回生成的预览地址
            ctx.body = {
              data: {
                previewUrl,
                originalUrl: fileUrl,
              },
            };
          } catch (error: unknown) {
            ctx.status = 500;
            ctx.body = {
              data: {
                message: getErrorMessage(error, 'generate-preview-failed'),
              },
            };
          }
        },
        async resolveDirectUrl(ctx: ActionContext) {
          const values = getActionValues(ctx);
          const fileUrl = String(values.url || '').trim();
          if (!fileUrl) {
            ctx.status = 400;
            ctx.body = { data: { message: 'url-required' } };
            return;
          }
          const resolution = await resolveAllowedFileFetchTarget(ctx, fileUrl);
          if (!resolution.allowed) {
            ctx.status = 403;
            ctx.body = { data: { message: 'url-not-allowed' } };
            return;
          }
          // 外部存储直链（如 MinIO/S3）：地址即为文件真实地址，直接返回，
          // 第三方预览服务（如 BaseMetas）可直接从文件所在服务器下载。
          if (!isNocoBaseManagedFileUrl(fileUrl)) {
            ctx.body = {
              data: {
                directUrl: fileUrl,
                originalUrl: fileUrl,
              },
            };
            return;
          }
          // 优先解析为文件存储的真实地址（如内网 MinIO/S3/远程文件服务器），
          // 第三方预览服务（如 BaseMetas）可直接从文件所在服务器下载，无需访问 NocoBase。
          const storageUrl = await resolveStorageDirectUrl(ctx, fileUrl);
          if (storageUrl) {
            ctx.body = {
              data: {
                directUrl: storageUrl,
                originalUrl: fileUrl,
              },
            };
            return;
          }
          // 兜底（本地存储）：不解析到外部存储直链，返回同源 /files/ 路径并附加短期令牌，
          // 第三方服务拉取时经 NocoBase 文件中间件执行 ACL 校验，防止越权读取任意附件。
          const settings = await (async () => {
            const repo = ctx.db.getRepository('kkfileviewSettings');
            const rows = await repo.find({ sort: ['createdAt'] });
            return (rows?.[0] || {}) as KkfileviewSettingsRecord;
          })();
          let directUrl = buildSameOriginAbsoluteUrl(ctx, fileUrl, String(settings.nocobaseHost || ''));
          // 使用短期预览令牌替代用户会话令牌，避免长期令牌泄露给第三方预览服务。
          const token = await issuePreviewTokenForFileUrl(ctx, fileUrl);
          if (token && !directUrl.includes('token=')) {
            const separator = directUrl.includes('?') ? '&' : '?';
            directUrl = `${directUrl}${separator}token=${encodeURIComponent(token)}`;
          }
          ctx.body = {
            data: {
              directUrl,
              originalUrl: fileUrl,
            },
          };
        },
        async createFileViewerToken(ctx: ActionContext) {
          const result = await issuePreviewToken(ctx);
          if (!result) return;
          ctx.body = {
            data: result,
          };
        },
      },
    });
  }

  private registerHealthCheckResource() {
    if (this.app.resourceManager.isDefined('kkfileviewHealthCheck')) {
      return;
    }
    const pingHost = this.pingHost.bind(this);
    const tcpConnect = this.tcpConnect.bind(this);
    const isAdminUser = this.isAdminUser.bind(this);
    const isAllowedHealthCheckTarget = this.isAllowedHealthCheckTarget.bind(this);
    this.app.resourceManager.define({
      name: 'kkfileviewHealthCheck',
      actions: {
        async check(ctx: ActionContext) {
          const values = getActionValues(ctx);
          const target = String(values.url || values.host || '').trim();
          const service = String(values.service || '').trim();
          const currentUser = ctx?.state?.currentUser || ctx?.state?.user || ctx?.auth?.user || null;
          if (!isAdminUser(currentUser)) {
            ctx.status = 403;
            ctx.body = {
              data: {
                success: false,
                reachable: false,
                message: 'forbidden',
              },
            };
            return;
          }
          const repo = ctx.db.getRepository('kkfileviewSettings');
          const rows = await repo.find({ sort: ['createdAt'] });
          const settings = (rows?.[0] || {}) as HealthCheckSettings;
          const isTargetAllowed = await isAllowedHealthCheckTarget(target, service, settings);
          if (!isTargetAllowed) {
            ctx.status = 403;
            ctx.body = {
              data: {
                success: false,
                reachable: false,
                message: 'target-not-allowed',
              },
            };
            return;
          }
          if (!/^https?:\/\//i.test(target)) {
            ctx.status = 400;
            ctx.body = {
              data: {
                success: false,
                reachable: false,
                message: 'invalid-url',
              },
            };
            return;
          }
          if (service === 'microsoft') {
            ctx.body = {
              data: {
                success: true,
                reachable: true,
                mode: 'browser-side',
                message: 'browser-side-service',
              },
            };
            return;
          }
          try {
            const url = new URL(target);
            const host = url.hostname;
            const port = Number(url.port || (url.protocol === 'https:' ? '443' : '80'));
            const tcpReachable = await tcpConnect(host, port, 3000);
            if (tcpReachable) {
              ctx.body = {
                data: {
                  success: true,
                  reachable: true,
                  mode: 'tcp',
                  host,
                  port,
                },
              };
              return;
            }
            const pingReachable = await pingHost(host, 3000);
            if (pingReachable) {
              ctx.body = {
                data: {
                  success: true,
                  reachable: true,
                  mode: 'ping',
                  host,
                },
              };
              return;
            }
            ctx.status = 502;
            ctx.body = {
              data: {
                success: false,
                reachable: false,
                message: 'unreachable',
                host,
                port,
              },
            };
          } catch {
            ctx.status = 502;
            ctx.body = {
              data: {
                success: false,
                reachable: false,
                message: 'check-failed',
              },
            };
          }
        },
      },
    });
  }

  private tcpConnect(host: string, port: number, timeoutMs: number) {
    return new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      let settled = false;
      const done = (value: boolean) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(value);
      };
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => done(true));
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));
      socket.connect(port, host);
    });
  }

  private pingHost(host: string, timeoutMs: number) {
    const isWindows = os.platform() === 'win32';
    const args = isWindows
      ? ['-n', '1', '-w', String(timeoutMs), host]
      : ['-c', '1', '-W', String(Math.max(1, Math.ceil(timeoutMs / 1000))), host];
    return new Promise<boolean>((resolve) => {
      const child = spawn('ping', args, { windowsHide: true });
      child.on('error', () => resolve(false));
      child.on('close', (code) => resolve(code === 0));
    });
  }

  private normalizeRoleTokens(input: Array<unknown>): string[] {
    if (!Array.isArray(input)) return [];
    return Array.from(new Set(input.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)));
  }

  private extractUserRoleTokens(user?: CurrentUserLike | null): string[] {
    const roles = Array.isArray(user?.roles) ? user.roles : [];
    const tokens: string[] = [];
    roles.forEach((role) => {
      if (typeof role === 'string') {
        tokens.push(role);
        return;
      }
      if (!role || typeof role !== 'object') return;
      tokens.push(role.name, role.roleName, role.code, role.title, role.displayName);
    });
    return this.normalizeRoleTokens(tokens);
  }

  private isAdminUser(user?: CurrentUserLike | null): boolean {
    const username = String(user?.username || '').trim().toLowerCase();
    if (username === 'admin') return true;
    if (user?.isSuperAdmin === true || user?.isSystemAdmin === true) return true;
    const roleTokens = this.extractUserRoleTokens(user);
    return roleTokens.some((token) => token === 'admin' || token === 'root' || token.includes('admin'));
  }

  /** 判断 IP 是否为内网/环回/链路本地/云元数据等不可信地址。 */
  private isPrivateOrReservedIp(hostname: string): boolean {
    const ipVersion = net.isIP(hostname);
    if (ipVersion === 4) {
      const parts = hostname.split('.').map(Number);
      const [a, b] = parts;
      if (a === 0 || a === 10 || a === 127) return true; // 保留段/私网/环回
      if (a === 169 && b === 254) return true; // 链路本地（含云元数据 169.254.169.254）
      if (a === 172 && b >= 16 && b <= 31) return true; // 私网 172.16-31
      if (a === 192 && b === 168) return true; // 私网 192.168
      if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
      if (a >= 224) return true; // 组播/保留
      return false;
    }
    if (ipVersion === 6) {
      const lower = hostname.toLowerCase();
      if (lower === '::1' || lower === '::') return true; // 环回/未指定
      if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
      if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // 链路本地 fe80::/10
      return false;
    }
    return false;
  }

  private async isAllowedHealthCheckTarget(target: string, _service: string, _settings: HealthCheckSettings): Promise<boolean> {
    if (!/^https?:\/\//i.test(target)) return false;
    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname) return false;
    if (hostname === 'localhost') return false;
    // 字面 IP 直接校验；域名则解析 DNS 后逐个校验，防止域名反解指向内网。
    let addresses: string[] = [];
    if (net.isIP(hostname)) {
      addresses = [hostname];
    } else {
      try {
        const resolved = await dns.promises.lookup(hostname, { all: true });
        addresses = resolved.map((r) => r.address);
      } catch {
        return false;
      }
    }
    if (addresses.length === 0) return false;
    for (const ip of addresses) {
      if (this.isPrivateOrReservedIp(ip)) return false;
    }
    return true;
  }

  private async ensureDefaultRecord() {
    const repo = this.db.getRepository('kkfileviewSettings');
    if (!repo) return;

    const rows = await repo.find({
      sort: ['createdAt'],
    });
    if (!rows?.length) {
      await repo.create({
        values: {
          host: DEFAULT_KKFILEVIEW_HOST,
          kkfileviewHost: DEFAULT_KKFILEVIEW_HOST,
          basemetasHost: DEFAULT_BASEMETAS_HOST,
          microsoftHost: DEFAULT_MICROSOFT_HOST,
          extensions: JSON.stringify(DEFAULT_EXTENSIONS),
          kkfileviewExtensions: JSON.stringify(DEFAULT_EXTENSIONS),
          basemetasExtensions: JSON.stringify(DEFAULT_EXTENSIONS),
          microsoftExtensions: JSON.stringify(DEFAULT_MICROSOFT_EXTENSIONS),
          preferKkfileview: false,
          enableKkfileview: false,
          enableBasemetas: false,
          enableMicrosoft: false,
          fileViewerAssetBase: DEFAULT_FILE_VIEWER_ASSET_BASE,
          fileViewerExtensions: JSON.stringify(DEFAULT_FILE_VIEWER_EXTENSIONS),
          enableFileViewer: true,
          enableOpenInNewWindow: true,
          enableFullscreenButton: true,
          enableMobileAutoFullscreen: false,
          enableDownload: true,
          basemetasRequestType: 'query',
          basemetasFileAccess: DEFAULT_BASEMETAS_FILE_ACCESS,
          kkfileviewFileAccess: DEFAULT_KKFILEVIEW_FILE_ACCESS,
          enableCopyEmbedHtml: true,
          copyEmbedHtmlPermission: 'user',
          copyEmbedHtmlRoles: '[]',
          watermark: '',
          serviceType: 'kkfileview',
          preferredPreview: DEFAULT_PREFERRED_PREVIEW,
        },
      });
      return;
    }
    const first = (rows[0] || {}) as KkfileviewSettingsRecord;
    await repo.update({
      filterByTk: first.id,
      values: this.buildNormalizedValues(first),
    });
    const extras = rows.slice(1);
    const destroyRepo = repo as DestroyCapableRepository;
    for (const item of extras) {
      const itemId = (item as KkfileviewSettingsRecord)?.id;
      if (itemId == null) continue;
      if (destroyRepo.destroy) {
        await destroyRepo.destroy({ filterByTk: itemId });
        continue;
      }
      if (destroyRepo.model?.destroy) {
        await destroyRepo.model.destroy({ where: { id: itemId } });
      }
    }
  }

  private buildNormalizedValues(first: KkfileviewSettingsRecord) {
    const normalizedSaveValues = normalizeSettingsSaveValues({}, first);
    const serviceType = first.serviceType === 'basemetas' ? 'basemetas' : 'kkfileview';
    const legacyHost = String(first.host || '').trim();
    const preferredPreview = first.preferredPreview || (first.preferKkfileview === false ? 'microsoft' : serviceType);

    // ── 第一步：确定新字段的最终值（新字段缺失时，先用旧字段迁移）──────────────
    const kkfileviewHost = String(first.kkfileviewHost || '').trim()
      || (serviceType === 'kkfileview' && legacyHost ? legacyHost : DEFAULT_KKFILEVIEW_HOST);
    const basemetasHost = String(first.basemetasHost || '').trim()
      || (serviceType === 'basemetas' && legacyHost ? legacyHost : DEFAULT_BASEMETAS_HOST);
    const microsoftHost = String(first.microsoftHost || '').trim() || DEFAULT_MICROSOFT_HOST;
    const kkfileviewExtensions = String(first.kkfileviewExtensions || '').trim()
      || String(first.extensions || '').trim() || JSON.stringify(DEFAULT_EXTENSIONS);
    const basemetasExtensions = String(first.basemetasExtensions || '').trim()
      || String(first.extensions || '').trim() || JSON.stringify(DEFAULT_EXTENSIONS);
    const microsoftExtensions = String(first.microsoftExtensions || '').trim()
      || JSON.stringify(DEFAULT_MICROSOFT_EXTENSIONS);

    // ── 第二步：新字段已有确定值后，才清空旧兼容字段 ───────────────────────────
    // 只有当三个主机地址新字段均已填充时，才可以安全清空旧的 host 字段。
    const canClearLegacyHost = !!(kkfileviewHost && basemetasHost && microsoftHost);
    // 只有当扩展名新字段均已填充时，才可以安全清空旧的 extensions 字段。
    const canClearLegacyExtensions = !!(kkfileviewExtensions && basemetasExtensions && microsoftExtensions);

    return {
      // 新字段（使用迁移后的确定值）
      kkfileviewHost,
      basemetasHost,
      microsoftHost,
      nocobaseHost: String(normalizedSaveValues.nocobaseHost || ''),
      kkfileviewExtensions,
      basemetasExtensions,
      microsoftExtensions,
      fileViewerAssetBase: String(normalizedSaveValues.fileViewerAssetBase || DEFAULT_FILE_VIEWER_ASSET_BASE),
      fileViewerExtensions: String(
        normalizedSaveValues.fileViewerExtensions || JSON.stringify(DEFAULT_FILE_VIEWER_EXTENSIONS),
      ),
      enableKkfileview: first.enableKkfileview ?? false,
      enableBasemetas: first.enableBasemetas ?? false,
      enableMicrosoft: first.enableMicrosoft ?? false,
      enableFileViewer: normalizedSaveValues.enableFileViewer !== false,
      enableOpenInNewWindow: first.enableOpenInNewWindow ?? true,
      enableFullscreenButton: first.enableFullscreenButton ?? true,
      enableMobileAutoFullscreen: first.enableMobileAutoFullscreen ?? false,
      enableDownload: first.enableDownload ?? true,
      fileViewerLoadMode: String(first.fileViewerLoadMode || 'cdn') === 'proxy' ? 'proxy' : 'cdn',
      basemetasRequestType: normalizedSaveValues.basemetasRequestType === 'base64' ? 'base64' : 'query',
      basemetasFileAccess: normalizedSaveValues.basemetasFileAccess === 'proxy' ? 'proxy' : DEFAULT_BASEMETAS_FILE_ACCESS,
      kkfileviewFileAccess: normalizedSaveValues.kkfileviewFileAccess === 'proxy' ? 'proxy' : DEFAULT_KKFILEVIEW_FILE_ACCESS,
      enableCopyEmbedHtml: first.enableCopyEmbedHtml ?? true,
      copyEmbedHtmlPermission: ['admin', 'user', 'roles'].includes(String(normalizedSaveValues.copyEmbedHtmlPermission))
        ? String(normalizedSaveValues.copyEmbedHtmlPermission)
        : 'user',
      copyEmbedHtmlRoles: first.copyEmbedHtmlRoles || '[]',
      watermarkType: String(normalizedSaveValues.watermarkType || 'preview'),
      watermark: String(normalizedSaveValues.watermark || ''),
      preferredPreview: ['microsoft', 'kkfileview', 'basemetas', 'fileViewer', 'none'].includes(preferredPreview)
        ? preferredPreview
        : DEFAULT_PREFERRED_PREVIEW,
      // 旧兼容字段：新字段已确认有值后才清空，否则保留原值
      host: canClearLegacyHost ? '' : (first.host || DEFAULT_KKFILEVIEW_HOST),
      extensions: canClearLegacyExtensions ? '[]' : (first.extensions || JSON.stringify(DEFAULT_EXTENSIONS)),
      preferKkfileview: false,   // preferredPreview 已覆盖此语义，可安全清零
      serviceType: '',           // serviceType 已无实际读取路径，可安全清空
    };
  }

  private async findOrDownloadFileViewerDist(targetDir: string): Promise<string> {
    const fs = require('fs-extra');

    globalDownloadProgress = {
      status: 'searching',
      percent: 5,
      downloadedBytes: 0,
      totalBytes: 0,
      speedBytesPerSec: 0,
      speedText: '0 KB/s',
      downloadedText: '0 B',
      totalText: '0 B',
      message: '正在检测本地 node_modules 依赖包...',
      updatedAt: Date.now(),
    };

    // 1. 尝试 require.resolve
    try {
      const pkgPath = require.resolve('@file-viewer/web-full/package.json');
      const distDir = path.join(path.dirname(pkgPath), 'dist');
      if (await fs.pathExists(distDir)) {
        globalDownloadProgress = {
          ...globalDownloadProgress,
          status: 'copying',
          percent: 95,
          message: '已找到本地依赖包，正在复制静态文件...',
          updatedAt: Date.now(),
        };
        return distDir;
      }
    } catch { }

    try {
      const mainPath = require.resolve('@file-viewer/web-full');
      const distDir = path.join(path.dirname(mainPath), 'dist');
      if (await fs.pathExists(distDir)) {
        globalDownloadProgress = {
          ...globalDownloadProgress,
          status: 'copying',
          percent: 95,
          message: '已找到本地依赖包，正在复制静态文件...',
          updatedAt: Date.now(),
        };
        return distDir;
      }
    } catch { }

    // 2. 向上递归搜索 node_modules/@file-viewer/web-full/dist
    const startDirs = [__dirname, process.cwd()];
    for (const startDir of startDirs) {
      let curr = startDir;
      while (curr) {
        const candidate = path.join(curr, 'node_modules', '@file-viewer', 'web-full', 'dist');
        if (await fs.pathExists(candidate)) {
          globalDownloadProgress = {
            ...globalDownloadProgress,
            status: 'copying',
            percent: 95,
            message: '已找到本地依赖包，正在复制静态文件...',
            updatedAt: Date.now(),
          };
          return candidate;
        }
        const parent = path.dirname(curr);
        if (parent === curr) break;
        curr = parent;
      }
    }

    // 3. 在线 Fallback 下载解压
    const https = require('https');
    const http = require('http');
    const { exec } = require('child_process');

    const urls = [
      'https://registry.npmmirror.com/@file-viewer/web-full/-/web-full-2.2.2.tgz',
      'https://registry.npmjs.org/@file-viewer/web-full/-/web-full-2.2.2.tgz'
    ];

    const tmpDir = path.join(os.tmpdir(), `file-viewer-download-${Date.now()}`);
    await fs.ensureDir(tmpDir);
    const tgzPath = path.join(tmpDir, 'package.tgz');
    const extractDir = path.join(tmpDir, 'extracted');
    await fs.ensureDir(extractDir);

    let downloaded = false;
    let lastErr: Error | null = null;

    const axios = require('axios');
    const downloadFile = async (urlStr: string, destPath: string): Promise<void> => {
      globalDownloadProgress = {
        status: 'downloading',
        percent: 10,
        downloadedBytes: 0,
        totalBytes: 0,
        speedBytesPerSec: 0,
        speedText: '0 KB/s',
        downloadedText: '0 B',
        totalText: '连接中...',
        message: '正在建立连接下载静态资源包...',
        updatedAt: Date.now(),
      };

      const response = await axios({
        method: 'get',
        url: urlStr,
        responseType: 'stream',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
        },
        maxRedirects: 5,
      });

      const totalHeader = response.headers['content-length'];
      const totalBytes = totalHeader ? parseInt(totalHeader, 10) : 0;
      let downloadedBytes = 0;
      let lastTime = Date.now();
      let lastDownloadedBytes = 0;

      globalDownloadProgress = {
        status: 'downloading',
        percent: 15,
        downloadedBytes: 0,
        totalBytes,
        speedBytesPerSec: 0,
        speedText: '0 KB/s',
        downloadedText: '0 B',
        totalText: totalBytes > 0 ? formatProgressBytes(totalBytes) : '未知',
        message: '连接成功，开始下载数据包...',
        updatedAt: Date.now(),
      };

      const fileStream = fs.createWriteStream(destPath);

      response.data.on('data', (chunk: any) => {
        downloadedBytes += chunk.length;
        const now = Date.now();
        const timeDiff = now - lastTime;
        if (timeDiff >= 300 || (totalBytes > 0 && downloadedBytes === totalBytes)) {
          const bytesDiff = downloadedBytes - lastDownloadedBytes;
          const speed = (bytesDiff / Math.max(1, timeDiff)) * 1000;
          lastTime = now;
          lastDownloadedBytes = downloadedBytes;
          const percent = totalBytes > 0 ? Math.min(99, Math.round((downloadedBytes / totalBytes) * 100)) : 50;

          globalDownloadProgress = {
            status: 'downloading',
            percent,
            downloadedBytes,
            totalBytes,
            speedBytesPerSec: speed,
            speedText: `${formatProgressBytes(speed)}/s`,
            downloadedText: formatProgressBytes(downloadedBytes),
            totalText: totalBytes > 0 ? formatProgressBytes(totalBytes) : '未知',
            message: `正在从镜像源下载静态资源包 (${formatProgressBytes(speed)}/s)...`,
            updatedAt: Date.now(),
          };
        }
      });

      response.data.pipe(fileStream);

      await new Promise<void>((resolve, reject) => {
        fileStream.on('finish', () => resolve());
        fileStream.on('error', (err: any) => {
          fs.unlink(destPath, () => { });
          reject(err);
        });
        response.data.on('error', (err: any) => {
          fs.unlink(destPath, () => { });
          reject(err);
        });
      });
    };

    for (const urlStr of urls) {
      try {
        await downloadFile(urlStr, tgzPath);
        downloaded = true;
        break;
      } catch (e: any) {
        lastErr = e;
      }
    }

    if (!downloaded) {
      await fs.remove(tmpDir).catch(() => { });
      const errMsg = `本地未检测到 @file-viewer/web-full 依赖，且在线下载失败: ${lastErr?.message || '未知网络错误'}`;
      globalDownloadProgress = {
        ...globalDownloadProgress,
        status: 'error',
        message: errMsg,
        updatedAt: Date.now(),
      };
      throw new Error(errMsg);
    }

    // 解压 tgz 包
    globalDownloadProgress = {
      ...globalDownloadProgress,
      status: 'extracting',
      percent: 92,
      speedText: '0 KB/s',
      message: '资源包下载完成，正在解压静态文件...',
      updatedAt: Date.now(),
    };

    await new Promise<void>((resolve, reject) => {
      exec(`tar -xzf "${tgzPath}" -C "${extractDir}"`, (err: any) => {
        if (err) return reject(new Error(`解压静态文件失败: ${err.message}`));
        resolve();
      });
    });

    const downloadedDist = path.join(extractDir, 'package', 'dist');
    if (!await fs.pathExists(downloadedDist)) {
      await fs.remove(tmpDir).catch(() => { });
      throw new Error('解压产物中未找到 dist 目录');
    }

    globalDownloadProgress = {
      ...globalDownloadProgress,
      status: 'copying',
      percent: 96,
      message: '解压完成，正在将静态文件写入目标目录...',
      updatedAt: Date.now(),
    };

    const finalTempDist = path.join(tmpDir, 'dist_ready');
    await fs.copy(downloadedDist, finalTempDist);
    return finalTempDist;
  }

  private registerFileViewerDownloadResource() {
    if (this.app.resourceManager.isDefined('kkfileviewFileViewerDownload')) {
      return;
    }
    // 资源动作由 koa-compose 调用，不绑定 this，需用闭包显式绑定。
    const isAdminUser = this.isAdminUser.bind(this);
    const findOrDownloadFileViewerDist = this.findOrDownloadFileViewerDist.bind(this);
    this.app.resourceManager.define({
      name: 'kkfileviewFileViewerDownload',
      actions: {
        progress: async (ctx: ActionContext) => {
          ctx.body = globalDownloadProgress;
        },
        download: async (ctx: ActionContext) => {
          const currentUser = ctx?.state?.currentUser || ctx?.state?.user || ctx?.auth?.user || null;
          if (!isAdminUser(currentUser)) {
            ctx.status = 403;
            ctx.body = {
              data: {
                success: false,
                message: 'forbidden',
              },
            };
            return;
          }
          globalDownloadProgress = {
            status: 'searching',
            percent: 5,
            downloadedBytes: 0,
            totalBytes: 0,
            speedBytesPerSec: 0,
            speedText: '0 KB/s',
            downloadedText: '0 B',
            totalText: '进行中',
            message: '正在检索本地依赖包及网络状态...',
            updatedAt: Date.now(),
          };
          const fs = require('fs-extra');
          try {
            const targetDir = path.resolve(__dirname, '../../public/file-viewer');
            const sourceDir = await findOrDownloadFileViewerDist(targetDir);

            if (!await fs.pathExists(sourceDir)) {
              ctx.status = 400;
              ctx.body = {
                data: {
                  success: false,
                  message: `Source directory ${sourceDir} does not exist.`,
                }
              };
              return;
            }

            await fs.ensureDir(targetDir);
            await fs.copy(sourceDir, targetDir, { overwrite: true });

            globalDownloadProgress = {
              status: 'completed',
              percent: 100,
              downloadedBytes: globalDownloadProgress.totalBytes || globalDownloadProgress.downloadedBytes,
              totalBytes: globalDownloadProgress.totalBytes,
              speedBytesPerSec: 0,
              speedText: '0 KB/s',
              downloadedText: formatProgressBytes(globalDownloadProgress.downloadedBytes || globalDownloadProgress.totalBytes),
              totalText: formatProgressBytes(globalDownloadProgress.totalBytes),
              message: '静态文件提取与部署完成',
              updatedAt: Date.now(),
            };

            ctx.body = {
              data: {
                success: true,
                message: 'Dependencies downloaded/copied successfully',
                progress: globalDownloadProgress,
              }
            };
          } catch (error: any) {
            globalDownloadProgress = {
              status: 'error',
              percent: 0,
              downloadedBytes: 0,
              totalBytes: 0,
              speedBytesPerSec: 0,
              speedText: '0 KB/s',
              downloadedText: '0 B',
              totalText: '0 B',
              message: '静态文件提取失败',
              error: error.message || 'Failed to copy dependencies',
              updatedAt: Date.now(),
            };

            ctx.status = 500;
            ctx.body = {
              data: {
                success: false,
                message: error.message || 'Failed to copy dependencies',
                progress: globalDownloadProgress,
              }
            };
          }
        }
      }
    });
  }

  private registerSettingsListResource() {
    const autoCorrectFileViewerLoadMode = this.autoCorrectFileViewerLoadMode.bind(this);
    const isFileViewerDistDownloaded = this.isFileViewerDistDownloaded.bind(this);
    this.app.resourceManager.define({
      name: 'kkfileviewSettings',
      actions: {
        list: async (ctx: ActionContext, next: () => Promise<void>) => {
          const repo = ctx.db.getRepository('kkfileviewSettings');
          const rows = await repo.find({ sort: ['createdAt'] });
          const list = Array.isArray(rows) ? rows : [];

          const isDownloaded = await isFileViewerDistDownloaded();
          // 自动纠偏：本地静态模式（proxy）但本地静态文件缺失时，切换为 CDN 模式并同步数据库。
          await autoCorrectFileViewerLoadMode(ctx, repo, (list[0] || null) as KkfileviewSettingsRecord | null, isDownloaded);

          const result = list.map(item => {
            const data = item.toJSON ? item.toJSON() : { ...item };
            data.fileViewerDownloaded = isDownloaded;
            return data;
          });

          ctx.body = {
            data: result,
          };
        },
        update: async (ctx: ActionContext, next: () => Promise<void>) => {
          await next();
          const fs = require('fs-extra');
          const filePath = path.resolve(__dirname, '../../public/file-viewer/flyfish-file-viewer-web-full.iife.js');
          const isDownloaded = await fs.pathExists(filePath);
          if (ctx.body && ctx.body.data) {
            if (Array.isArray(ctx.body.data)) {
              ctx.body.data = ctx.body.data.map((item: any) => ({ ...item, fileViewerDownloaded: isDownloaded }));
            } else if (typeof ctx.body.data === 'object') {
              ctx.body.data.fileViewerDownloaded = isDownloaded;
            }
          }
        },
        create: async (ctx: ActionContext, next: () => Promise<void>) => {
          await next();
          const fs = require('fs-extra');
          const filePath = path.resolve(__dirname, '../../public/file-viewer/flyfish-file-viewer-web-full.iife.js');
          const isDownloaded = await fs.pathExists(filePath);
          if (ctx.body && ctx.body.data) {
            if (Array.isArray(ctx.body.data)) {
              ctx.body.data = ctx.body.data.map((item: any) => ({ ...item, fileViewerDownloaded: isDownloaded }));
            } else if (typeof ctx.body.data === 'object') {
              ctx.body.data.fileViewerDownloaded = isDownloaded;
            }
          }
        },
      }
    });
  }

  /** 判断 File Viewer 本地静态文件是否已下载部署。 */
  private async isFileViewerDistDownloaded(): Promise<boolean> {
    const fs = require('fs-extra');
    const filePath = path.resolve(__dirname, '../../public/file-viewer/flyfish-file-viewer-web-full.iife.js');
    return fs.pathExists(filePath);
  }

  /**
   * File Viewer 加载模式自动纠偏：
   * 本地静态文件模式（proxy）但本地静态文件缺失时，自动切换为 CDN 模式并同步数据库。
   */
  private async autoCorrectFileViewerLoadMode(
    ctx: ActionContext,
    repo: any,
    first: KkfileviewSettingsRecord | null,
    isDownloaded: boolean,
  ): Promise<void> {
    if (!first || first.id == null) return;
    if (String(first.fileViewerLoadMode || '') !== 'proxy' || isDownloaded) return;
    try {
      await repo.update({ filterByTk: first.id, values: { fileViewerLoadMode: 'cdn' } });
      first.fileViewerLoadMode = 'cdn';
    } catch (error: unknown) {
      (ctx as any)?.logger?.warn?.(
        '[kkfileview] auto switch fileViewerLoadMode to cdn failed:',
        getErrorMessage(error, 'auto-switch-failed'),
      );
      return;
    }
    try {
      const currentUser = ctx?.state?.currentUser || ctx?.state?.user || ctx?.auth?.user || null;
      const operator = String(currentUser?.nickname || currentUser?.username || '-').trim() || '-';
      const recordRepo = ctx.db.getRepository('kkfileviewModificationRecordItems');
      if (recordRepo) {
        await recordRepo.create({
          values: {
            operator,
            summary: '自动切换：本地静态文件缺失，File Viewer 加载模式由静态(proxy)切换为 CDN',
            changedFields: JSON.stringify(['fileViewerLoadMode']),
            content: 'proxy -> cdn',
          },
        });
      }
    } catch {
      // 记录日志失败不影响切换结果。
    }
  }

  private registerFileViewerProxyResource() {
    if (this.app.resourceManager.isDefined('kkfileviewFileViewerProxy')) {
      return;
    }
    const decodeToken = (this.app as any).authManager.jwt.decode.bind((this.app as any).authManager.jwt);
    const previewTokenRegistry = this.previewTokenRegistry;
    const resolveAllowedFileFetchTarget = this.resolveAllowedFileFetchTarget.bind(this);
    this.app.resourceManager.define({
      name: 'kkfileviewFileViewerProxy',
      actions: {
        async get(ctx: ActionContext) {
          const values = getActionValues(ctx);
          const fileUrl = String(values.url || '').trim();
          if (!fileUrl) {
            ctx.status = 400;
            ctx.body = { data: { message: 'url-required' } };
            return;
          }
          try {
            // 仅允许 NocoBase 托管地址或与文件记录匹配的存储直链，防止代理被用作任意 URL 的 SSRF 通道。
            const resolution = await resolveAllowedFileFetchTarget(ctx, fileUrl);
            if (!resolution.allowed) {
              ctx.status = 403;
              ctx.body = { data: { message: 'url-not-allowed' } };
              return;
            }
            let targetUrl = resolution.targetUrl;
            if (isNocoBaseManagedFileUrl(fileUrl)) {
              // 不解析到外部存储直链：改为请求 NocoBase 自身的 /files/ 或 /storage/ 路径，
              // 由 NocoBase 文件中间件执行 ACL 校验后再 302 跳转到存储地址，axios 跟随重定向获取文件。
              try {
                const parsed = new URL(targetUrl, 'http://localhost');
                targetUrl = parsed.pathname + parsed.search;
              } catch {
                // 保持原样。
              }
            }
            // 仅接受短期预览令牌访问，避免在预览地址中长期暴露用户会话令牌。
            const rawToken = String(values.token || '').trim();
            let previewPayload: Record<string, unknown> | null = null;
            let previewJti = '';
            if (rawToken) {
              try {
                const decoded = await decodeToken(rawToken);
                if (isFileViewerPreviewTokenPayload(decoded)) {
                  previewPayload = (decoded as Record<string, unknown>) || null;
                  previewJti = String((decoded as any)?.jti || '');
                }
              } catch {
                previewPayload = null;
              }
            }
            if (!previewPayload) {
              ctx.status = 403;
              ctx.body = { data: { message: 'file-viewer-preview-token-required' } };
              return;
            }
            // 令牌必须由本服务签发（注册表存在）且未被吊销。
            if (!previewJti || !previewTokenRegistry.has(previewJti)) {
              ctx.status = 403;
              ctx.body = { data: { message: 'file-viewer-preview-token-revoked' } };
              return;
            }
            const boundTargetUrl = String(previewPayload.targetUrl || '').trim();
            // 绑定校验：令牌绑定的是签发时的源文件地址，必须与本次请求一致。
            if (boundTargetUrl && boundTargetUrl !== fileUrl) {
              ctx.status = 403;
              ctx.body = { data: { message: 'file-viewer-preview-token-mismatch' } };
              return;
            }
            // 优先直接从本地磁盘或文件管理器获取文件流，避免回环 HTTP 请求导致的端口与网络 404 错误
            try {
              const fs = require('fs');
              const path = require('path');
              let record: any = null;
              let recordCollection = '';
              const matchedByStorage = await this.findFileRecordByStorageUrl(ctx, fileUrl);
              if (matchedByStorage?.record) {
                record = matchedByStorage.record;
                recordCollection = matchedByStorage.collectionName;
              } else if (isNocoBaseManagedFileUrl(fileUrl)) {
                const matched = fileUrl.match(/\/attachments\/(\d+)/i) || fileUrl.match(/\/files\/(\d+)/i);
                if (matched && matched[1]) {
                  const repo = ctx.db.getRepository('attachments');
                  if (repo) {
                    record = await repo.findOne({ filter: { id: matched[1] } });
                    if (record) recordCollection = 'attachments';
                  }
                }
              }
              // 记录级访问判定：复用 file-manager 的 ACL view 权限解析，
              // 防止代理绕过文件级权限（含管理员配置的 own 过滤/字段权限）被用作 IDOR 通道
              if (record && !(await this.canViewAttachment(ctx, record, recordCollection))) {
                ctx.status = 403;
                ctx.body = { data: { message: 'file-viewer-preview-token-no-access' } };
                return;
              }
              if (record) {
                const filename = (typeof record.get === 'function' ? record.get('filename') : record.filename) || '';
                const recPath = (typeof record.get === 'function' ? record.get('path') : record.path) || '';
                const storageId = typeof record.get === 'function' ? record.get('storageId') : record.storageId;
                const mime = (typeof record.get === 'function' ? record.get('mimetype') : record.mimetype) || 'application/octet-stream';

                let localDocRoot = '';
                if (storageId) {
                  try {
                    const storageRepo = ctx.db.getRepository('storages');
                    const storage = await storageRepo?.findOne?.({ filter: { id: storageId } });
                    if (storage?.options?.documentRoot) {
                      localDocRoot = storage.options.documentRoot;
                    }
                  } catch {}
                }

                if (filename) {
                  const candidatePaths = [
                    localDocRoot ? path.resolve(localDocRoot, recPath, filename) : null,
                    localDocRoot ? path.resolve(localDocRoot, filename) : null,
                    process.env.LOCAL_STORAGE_DEST ? path.resolve(process.env.LOCAL_STORAGE_DEST, recPath, filename) : null,
                    process.env.LOCAL_STORAGE_DEST ? path.resolve(process.env.LOCAL_STORAGE_DEST, filename) : null,
                    path.resolve(process.cwd(), 'storage/uploads', recPath, filename),
                    path.resolve(process.cwd(), 'storage/uploads', filename),
                  ].filter(Boolean);

                  for (const p of candidatePaths) {
                    if (fs.existsSync(p)) {
                      ctx.status = 200;
                      ctx.set('Content-Type', mime);
                      ctx.set('Content-Disposition', 'inline');
                      ctx.body = fs.createReadStream(p);
                      return;
                    }
                  }
                }

                const fileManager = (this.app as any)?.pm?.get?.('@nocobase/plugin-file-manager') ||
                                    (this.app as any)?.pm?.get?.('file-manager') ||
                                    (ctx.app as any)?.pm?.get?.('@nocobase/plugin-file-manager') ||
                                    (ctx.app as any)?.pm?.get?.('file-manager');
                if (fileManager && typeof fileManager.getFileStream === 'function') {
                  const result = await fileManager.getFileStream(record);
                  const stream = result?.stream || result;
                  if (stream && typeof stream.pipe === 'function') {
                    ctx.status = 200;
                    ctx.set('Content-Type', mime);
                    ctx.set('Content-Disposition', 'inline');
                    ctx.body = stream;
                    return;
                  }
                }
              }
            } catch (streamErr) {
              // 忽略本地与流式获取异常，回退至 HTTP 代理
            }

            const token = rawToken;
            if (token && (targetUrl.includes('/files/') || targetUrl.includes('/storage/') || /^\/?(files|storage|api)\//i.test(targetUrl)) && !targetUrl.includes('token=')) {
              const separator = targetUrl.includes('?') ? '&' : '?';
              targetUrl = `${targetUrl}${separator}token=${encodeURIComponent(token)}`;
            }
            if (!/^https?:\/\//i.test(targetUrl)) {
              const request = (ctx as any)?.request || {};
              const host = request.header?.host || request.host || `127.0.0.1:${process.env.APP_PORT || 13000}`;
              const protocol = request.protocol || 'http';
              const publicPath = (ctx as any)?.app?.getAppPublicPath?.() || process.env.APP_PUBLIC_PATH || '/';
              const base = `${protocol}://${host}${publicPath.replace(/\/+$/, '')}`;
              targetUrl = `${base}${targetUrl.startsWith('/') ? '' : '/'}${targetUrl}`;
            }
            const axios = require('axios');
            const response = await axios({
              method: 'get',
              url: targetUrl,
              responseType: 'stream',
              timeout: 60000,
              maxRedirects: 5,
              headers: {
                'Accept': '*/*',
              },
            });
            const contentType = response.headers['content-type'] || 'application/octet-stream';
            ctx.status = 200;
            ctx.set('Content-Type', contentType);
            ctx.set('Content-Disposition', 'inline');
            ctx.body = response.data;
          } catch (error) {
            ctx.status = 502;
            ctx.body = {
              data: {
                message: getErrorMessage(error, 'file-viewer-proxy-failed'),
              },
            };
          }
        },
      },
    });
  }

  private registerPublicAssetsResource() {
    this.app.resourceManager.define({
      name: 'kkfileviewPublicAssets',
      actions: {
        get: async (ctx: ActionContext) => {
          const relPath = String((ctx.action?.params as any)?.file || (ctx as any).request?.query?.file || '').trim();
          if (!relPath) {
            ctx.status = 400;
            ctx.body = { error: 'Missing file parameter' };
            return;
          }
          const safeRel = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, '');
          const publicDir = path.resolve(__dirname, '../../public');
          const targetFile = path.resolve(publicDir, safeRel);
          // 路径穿越防护：解析后的目标必须位于 public 目录内。
          if (targetFile !== publicDir && !targetFile.startsWith(`${publicDir}${path.sep}`)) {
            ctx.status = 403;
            ctx.body = { error: 'Forbidden' };
            return;
          }
          const fs = require('fs-extra');
          if (await fs.pathExists(targetFile)) {
            const stat = await fs.stat(targetFile);
            if (stat.isFile()) {
              ctx.status = 200;
              (ctx as any).set?.('Access-Control-Allow-Origin', '*');
              (ctx as any).set?.('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
              (ctx as any).set?.('Cache-Control', 'public, max-age=31536000');
              const ext = path.extname(targetFile).toLowerCase();
              if (ext === '.js') {
                (ctx as any).type = 'application/javascript; charset=utf-8';
              } else if (ext === '.css') {
                (ctx as any).type = 'text/css; charset=utf-8';
              } else if (ext === '.json') {
                (ctx as any).type = 'application/json; charset=utf-8';
              } else if (ext === '.wasm') {
                (ctx as any).type = 'application/wasm';
              } else {
                (ctx as any).type = ext;
              }
              ctx.body = await fs.readFile(targetFile);
              return;
            }
          }
          ctx.status = 404;
          ctx.body = { error: 'File not found' };
        }
      }
    });
  }
}

export default PluginFilePreviewerKkfileviewServer;

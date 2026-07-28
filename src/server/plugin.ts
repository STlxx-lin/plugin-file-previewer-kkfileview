import { buildStorageBaseUrl } from '../client/previewUtils';
import { Plugin } from '@nocobase/server';
import path from 'path';
import { spawn } from 'child_process';
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
} from '../shared/constants';
import { resolveWatermarkTemplate } from '../shared/watermarkTemplate';

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
      (values.fileViewerLoadMode ?? fallback.fileViewerLoadMode) === 'cdn' ? 'cdn' : 'proxy',
    enableFileViewer:
      values.enableFileViewer === true ||
      (values.enableFileViewer !== false && fileViewerExtensions.length > 0),
  };
}

export class PluginFilePreviewerKkfileviewServer extends Plugin {
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
        const targetFile = path.resolve(__dirname, '../../public', relPath);
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
    this.registerSettingsListResource();
    this.registerPublicAssetsResource();
    this.app.acl.allow('kkfileviewPublicAssets', 'get', 'public');
    this.app.acl.allow('kkfileviewSettings', 'list', 'loggedIn');
    this.app.acl.allow('kkfileviewSettingsSave', 'save', 'loggedIn');
    this.app.acl.allow('kkfileviewHealthCheck', 'check', 'loggedIn');
    this.app.acl.allow('kkfileviewPreview', 'generate', 'loggedIn'); // 允许已登录用户访问预览接口
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

    await this.db.sync({ force: false, alter: { drop: false } });
    await this.ensureDefaultRecord();
  }

  private registerSettingsSaveResource() {
    // 若资源已注册，则直接跳过，避免重复定义。
    if (this.app.resourceManager.isDefined('kkfileviewSettingsSave')) {
      return;
    }
    // 定义专用保存资源，确保配置保存时显式覆盖数据库中的第一条记录。
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
    this.app.resourceManager.define({
      name: 'kkfileviewPreviewRecords',
      actions: {
        async append(ctx: ActionContext) {
          const values = getActionValues(ctx);
          const currentUser = ctx?.state?.currentUser || ctx?.state?.user || ctx?.auth?.user || null;
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

  private async resolveNocoBasePermanentFileUrl(ctx: any, fileUrl: string): Promise<string> {
    const urlString = String(fileUrl || '').trim();
    if (!urlString) return urlString;
    
    // 1. 匹配 NocoBase 永久地址格式: /files/{app}/{dataSource}/{table}/{id}.{ext}
    const match = urlString.match(/\/files\/([^\/]+)\/([^\/]+)\/([^\/]+)\/(\d+)(?:\.([a-z0-9]+))?/i);
    if (match && ctx?.db) {
      const [, appName, dataSourceKey, tableName, fileId] = match;
      
      // 方案 A: 使用 Sequelize 原生 SQL 联查（100% 准确提取数据库中存好的 baseUrl 与 filename）
      try {
        if (ctx.db.sequelize && typeof ctx.db.sequelize.query === 'function') {
          const sql = `SELECT a.filename, a.name, a.path, a.url, s.baseUrl, s.baseurl, s.options
                       FROM ${tableName} a 
                       LEFT JOIN storages s ON (a.storageId = s.id OR a.storage_id = s.id)
                       WHERE a.id = :id LIMIT 1`;
          const [results] = await ctx.db.sequelize.query(sql, {
            replacements: { id: fileId },
            type: ctx.db.sequelize.QueryTypes?.SELECT || 'SELECT',
          });
          const row = Array.isArray(results) ? results[0] : results;
          if (row) {
            const filename = row.filename || row.name || row.path || row.url;
            let baseUrl = row.baseUrl || row.baseurl;
            if (!baseUrl && row.options) {
              try {
                const opts = typeof row.options === 'string' ? JSON.parse(row.options) : row.options;
                baseUrl = opts?.baseUrl || opts?.baseurl || opts?.endpoint;
              } catch {
                // ignore
              }
            }
            if (baseUrl && /^https?:\/\//i.test(baseUrl) && filename) {
              const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
              const cleanFilename = String(filename).replace(/^\/+/, '');
              let encodedName = cleanFilename;
              try {
                if (decodeURIComponent(cleanFilename) === cleanFilename) {
                  encodedName = encodeURIComponent(cleanFilename);
                }
              } catch {
                encodedName = encodeURIComponent(cleanFilename);
              }
              return `${cleanBase}${encodedName}`;
            }
          }
        }
      } catch {
        // fallback to repository query
      }

      // 方案 B: 使用 NocoBase Repository 联查
      try {
        if (typeof ctx.db.getRepository === 'function') {
          const repo = ctx.db.getRepository(tableName);
          if (repo) {
            const fileRecord = await repo.findOne({
              filter: { id: fileId },
              appends: ['storage', 'fileStorage', 'storages'],
            });
            if (fileRecord) {
              const rawFile = typeof fileRecord.toJSON === 'function' ? fileRecord.toJSON() : fileRecord;
              const filename = rawFile.filename || rawFile.name || rawFile.path || rawFile.url;
              const storage = rawFile.storage || rawFile.fileStorage || rawFile.storages;
              const storageId = rawFile.storageId || rawFile.storage_id;

              let baseUrl = storage?.baseUrl || storage?.baseurl || storage?.options?.baseUrl;

              if (!baseUrl && storageId) {
                for (const tableCandidate of ['storages', 'file_storages', 'fileStorages', 'attachments_storages']) {
                  try {
                    const storageRepo = ctx.db.getRepository(tableCandidate);
                    if (storageRepo) {
                      const storageRecord = await storageRepo.findOne({ filter: { id: storageId } });
                      if (storageRecord) {
                        const rawStorage = typeof storageRecord.toJSON === 'function' ? storageRecord.toJSON() : storageRecord;
                        baseUrl = rawStorage.baseUrl || rawStorage.baseurl || rawStorage.options?.baseUrl || rawStorage.options?.host;
                        if (baseUrl) break;
                      }
                    }
                  } catch {
                    // ignore
                  }
                }
              }

              if (baseUrl && /^https?:\/\//i.test(baseUrl) && filename) {
                const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
                const cleanFilename = String(filename).replace(/^\/+/, '');
                let encodedName = cleanFilename;
                try {
                  if (decodeURIComponent(cleanFilename) === cleanFilename) {
                    encodedName = encodeURIComponent(cleanFilename);
                  }
                } catch {
                  encodedName = encodeURIComponent(cleanFilename);
                }
                return `${cleanBase}${encodedName}`;
              }
            }
          }
        }
      } catch {
        // ignore
      }
    }
    return urlString;
  }

  private registerPreviewResource() {
    if (this.app.resourceManager.isDefined('kkfileviewPreview')) {
      return;
    }
    const resolvePermanentUrl = this.resolveNocoBasePermanentFileUrl.bind(this);
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
            // 获取数据库中的 kkFileView 配置
            const repo = ctx.db.getRepository('kkfileviewSettings');
            const rows = await repo.find({ sort: ['createdAt'] });
            const settings = (rows?.[0] || {}) as HealthCheckSettings;

            // 获取 kkFileView 服务地址
            const host = settings.kkfileviewHost || DEFAULT_KKFILEVIEW_HOST;
            let targetFileUrl = await resolvePermanentUrl(ctx, fileUrl);
            const token = (ctx as any)?.auth?.token || (ctx as any)?.state?.token;
            if (token && (targetFileUrl.includes('/files/') || targetFileUrl.includes('/storage/') || /^\/?(files|storage|api)\//i.test(targetFileUrl)) && !targetFileUrl.includes('token=')) {
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
          let directUrl = await resolvePermanentUrl(ctx, fileUrl);
          const token = (ctx as any)?.auth?.token || (ctx as any)?.state?.token;
          if (token && (directUrl.includes('/files/') || directUrl.includes('/storage/') || /^\/?(files|storage|api)\//i.test(directUrl)) && !directUrl.includes('token=')) {
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
          if (!isAllowedHealthCheckTarget(target, service, settings)) {
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

  private isAllowedHealthCheckTarget(target: string, _service: string, _settings: HealthCheckSettings): boolean {
    if (!/^https?:\/\//i.test(target)) return false;
    try {
      const parsed = new URL(target);
      return Boolean(parsed.hostname);
    } catch {
      return false;
    }
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
          enableKkfileview: true,
          enableBasemetas: false,
          enableMicrosoft: true,
          fileViewerAssetBase: DEFAULT_FILE_VIEWER_ASSET_BASE,
          fileViewerExtensions: JSON.stringify(DEFAULT_FILE_VIEWER_EXTENSIONS),
          enableFileViewer: true,
          enableOpenInNewWindow: true,
          enableFullscreenButton: true,
          enableMobileAutoFullscreen: false,
          enableDownload: true,
          basemetasRequestType: 'query',
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
      enableKkfileview: first.enableKkfileview ?? true,
      enableBasemetas: first.enableBasemetas ?? serviceType === 'basemetas',
      enableMicrosoft: first.enableMicrosoft ?? first.preferKkfileview === false,
      enableFileViewer: normalizedSaveValues.enableFileViewer !== false,
      enableOpenInNewWindow: first.enableOpenInNewWindow ?? true,
      enableFullscreenButton: first.enableFullscreenButton ?? true,
      enableMobileAutoFullscreen: first.enableMobileAutoFullscreen ?? false,
      enableDownload: first.enableDownload ?? true,
      basemetasRequestType: normalizedSaveValues.basemetasRequestType === 'base64' ? 'base64' : 'query',
      enableCopyEmbedHtml: first.enableCopyEmbedHtml ?? true,
      copyEmbedHtmlPermission: ['admin', 'user', 'roles'].includes(String(normalizedSaveValues.copyEmbedHtmlPermission))
        ? String(normalizedSaveValues.copyEmbedHtmlPermission)
        : 'user',
      copyEmbedHtmlRoles: first.copyEmbedHtmlRoles || '[]',
      watermarkType: String(normalizedSaveValues.watermarkType || 'preview'),
      watermark: String(normalizedSaveValues.watermark || ''),
      preferredPreview: ['microsoft', 'kkfileview', 'basemetas', 'none'].includes(preferredPreview)
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
    this.app.resourceManager.define({
      name: 'kkfileviewFileViewerDownload',
      actions: {
        progress: async (ctx: ActionContext) => {
          ctx.body = globalDownloadProgress;
        },
        download: async (ctx: ActionContext) => {
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
            const sourceDir = await this.findOrDownloadFileViewerDist(targetDir);

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
    this.app.resourceManager.define({
      name: 'kkfileviewSettings',
      actions: {
        list: async (ctx: ActionContext, next: () => Promise<void>) => {
          const repo = ctx.db.getRepository('kkfileviewSettings');
          const rows = await repo.find({ sort: ['createdAt'] });
          const list = Array.isArray(rows) ? rows : [];

          const fs = require('fs-extra');
          const filePath = path.resolve(__dirname, '../../public/file-viewer/flyfish-file-viewer-web-full.iife.js');
          const isDownloaded = await fs.pathExists(filePath);

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
          const targetFile = path.resolve(__dirname, '../../public', safeRel);
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

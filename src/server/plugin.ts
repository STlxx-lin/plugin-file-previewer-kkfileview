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
};

type KkfileviewSettingsRecord = HealthCheckSettings & {
  id?: number | string;
  host?: string;
  extensions?: string;
  kkfileviewExtensions?: string;
  basemetasExtensions?: string;
  microsoftExtensions?: string;
  nocobaseHost?: string;
  preferKkfileview?: boolean;
  enableKkfileview?: boolean;
  enableBasemetas?: boolean;
  enableMicrosoft?: boolean;
  enablePrint?: boolean;
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

function getActionValues(ctx: ActionContext): Record<string, unknown> {
  return ctx?.action?.params?.values || ctx?.request?.body || {};
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

export class PluginFilePreviewerKkfileviewServer extends Plugin {
  async load() {
    await this.db.import({
      directory: path.resolve(__dirname, 'collections'),
    });

    this.registerSettingsSaveResource();
    this.registerHealthCheckResource();
    this.registerPreviewResource(); // 注册预览接口资源
    this.registerModificationRecordsResource();
    this.registerPreviewRecordsResource();
    this.registerFieldCleanupResource();
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
          const nextValues = {
            ...values,
            nocobaseHost: String(values.nocobaseHost || '').trim(),
            basemetasRequestType: values.basemetasRequestType === 'base64' ? 'base64' : 'query',
            copyEmbedHtmlPermission: ['admin', 'user', 'roles'].includes(String(values.copyEmbedHtmlPermission || ''))
              ? String(values.copyEmbedHtmlPermission)
              : 'user',
            watermarkType: String(values.watermarkType || '').trim() === 'global' ? 'global' : 'preview',
            watermark: String(values.watermark || '').trim(),
          };
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
            const patch: Record<string, unknown> = {};
            const legacyHost = String(row.host || '').trim();
            const legacyService = String(row.serviceType || '').trim().toLowerCase();
            const legacyPrefer = row.preferKkfileview;
            const legacyExt = parseExtensionsText(row.extensions, DEFAULT_EXTENSIONS);
            if (!String(row.kkfileviewHost || '').trim()) {
              patch.kkfileviewHost = legacyService === 'kkfileview' && legacyHost ? legacyHost : DEFAULT_KKFILEVIEW_HOST;
            }
            if (!String(row.basemetasHost || '').trim()) {
              patch.basemetasHost = legacyService === 'basemetas' && legacyHost ? legacyHost : DEFAULT_BASEMETAS_HOST;
            }
            if (!String(row.microsoftHost || '').trim()) {
              patch.microsoftHost = DEFAULT_MICROSOFT_HOST;
            }
            if (!String(row.kkfileviewExtensions || '').trim()) {
              patch.kkfileviewExtensions = JSON.stringify(legacyExt);
            }
            if (!String(row.basemetasExtensions || '').trim()) {
              patch.basemetasExtensions = JSON.stringify(legacyExt);
            }
            if (!String(row.microsoftExtensions || '').trim()) {
              patch.microsoftExtensions = JSON.stringify(DEFAULT_MICROSOFT_EXTENSIONS);
            }
            if (row.enableKkfileview === undefined) patch.enableKkfileview = true;
            if (row.enableBasemetas === undefined) patch.enableBasemetas = legacyService === 'basemetas';
            if (row.enableMicrosoft === undefined) patch.enableMicrosoft = legacyPrefer === false;
            if (!row.preferredPreview) {
              patch.preferredPreview = legacyPrefer === false
                ? 'microsoft'
                : legacyService === 'basemetas'
                  ? 'basemetas'
                  : DEFAULT_PREFERRED_PREVIEW;
            }
            const beforeSize = Object.keys(patch).length;
            patch.host = '';
            patch.extensions = '[]';
            patch.preferKkfileview = false;
            patch.serviceType = '';
            const afterSize = Object.keys(patch).length;
            if (afterSize <= 4 && beforeSize === 0) {
              continue;
            }
            await repo.update({
              filterByTk: row.id,
              values: patch,
            });
            if (beforeSize > 0) migratedCount += 1;
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

  private registerPreviewResource() {
    if (this.app.resourceManager.isDefined('kkfileviewPreview')) {
      return;
    }
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
            // 将文件地址进行 Base64 编码
            const encodedUrl = Buffer.from(fileUrl).toString('base64');
            // 拼接基础预览地址
            let previewUrl = `${host.replace(/\/$/, '')}/onlinePreview?url=${encodeURIComponent(encodedUrl)}`;
            
            // 先按前端一致的规则解析水印模板变量，确保不同入口的水印文本完全一致。
            const resolvedWatermark = resolveWatermarkTemplate(String(settings.watermark || ''), {
              user: currentUser,
              requestedAt: new Date(),
            }).trim();
            // 仅当水印类型为预览水印时，才向 kkFileView 传递预览水印参数。
            const normalizedWatermarkType = String(settings.watermarkType || 'preview').trim().toLowerCase();
            if (normalizedWatermarkType === 'preview' && resolvedWatermark) {
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
          const target = String(values.url || '').trim();
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
            const pingReachable = await pingHost(host, 3000);
            if (!pingReachable) {
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
              ctx.status = 502;
              ctx.body = {
                data: {
                  success: false,
                  reachable: false,
                  message: 'ping-failed',
                  host,
                },
              };
              return;
            }
            ctx.body = {
              data: {
                success: true,
                reachable: true,
                mode: 'ping',
                host,
              },
            };
          } catch {
            ctx.status = 502;
            ctx.body = {
              data: {
                success: false,
                reachable: false,
                message: 'ping-failed',
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

  private isAllowedHealthCheckTarget(target: string, service: string, settings: HealthCheckSettings): boolean {
    if (!/^https?:\/\//i.test(target)) return false;
    const serviceHostMap: Record<string, string> = {
      kkfileview: settings?.kkfileviewHost || DEFAULT_KKFILEVIEW_HOST,
      basemetas: settings?.basemetasHost || DEFAULT_BASEMETAS_HOST,
      microsoft: settings?.microsoftHost || DEFAULT_MICROSOFT_HOST,
    };
    const allowedHost = serviceHostMap[service];
    if (!allowedHost) return false;
    try {
      const targetUrl = new URL(target);
      const allowedUrl = new URL(allowedHost);
      return targetUrl.origin === allowedUrl.origin;
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
          enablePrint: false,
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
    const serviceType = first.serviceType === 'basemetas' ? 'basemetas' : 'kkfileview';
    const legacyHost = first.host || DEFAULT_KKFILEVIEW_HOST;
    const preferredPreview = first.preferredPreview || (first.preferKkfileview === false ? 'microsoft' : serviceType);
    return {
      host: first.host || DEFAULT_KKFILEVIEW_HOST,
      kkfileviewHost: first.kkfileviewHost || (serviceType === 'kkfileview' ? legacyHost : DEFAULT_KKFILEVIEW_HOST),
      basemetasHost: first.basemetasHost || (serviceType === 'basemetas' ? legacyHost : DEFAULT_BASEMETAS_HOST),
      microsoftHost: first.microsoftHost || DEFAULT_MICROSOFT_HOST,
      nocobaseHost: first.nocobaseHost || '',
      extensions: first.extensions || JSON.stringify(DEFAULT_EXTENSIONS),
      kkfileviewExtensions: first.kkfileviewExtensions || first.extensions || JSON.stringify(DEFAULT_EXTENSIONS),
      basemetasExtensions: first.basemetasExtensions || first.extensions || JSON.stringify(DEFAULT_EXTENSIONS),
      microsoftExtensions: first.microsoftExtensions || JSON.stringify(DEFAULT_MICROSOFT_EXTENSIONS),
      enableKkfileview: first.enableKkfileview ?? true,
      enableBasemetas: first.enableBasemetas ?? serviceType === 'basemetas',
      enableMicrosoft: first.enableMicrosoft ?? first.preferKkfileview === false,
      enablePrint: first.enablePrint === true,
      enableOpenInNewWindow: first.enableOpenInNewWindow ?? true,
      enableFullscreenButton: first.enableFullscreenButton ?? true,
      enableMobileAutoFullscreen: first.enableMobileAutoFullscreen ?? false,
      enableDownload: first.enableDownload ?? true,
      basemetasRequestType: first.basemetasRequestType === 'base64' ? 'base64' : 'query',
      enableCopyEmbedHtml: first.enableCopyEmbedHtml ?? true,
      copyEmbedHtmlPermission: ['admin', 'user', 'roles'].includes(first.copyEmbedHtmlPermission)
        ? first.copyEmbedHtmlPermission
        : 'user',
      copyEmbedHtmlRoles: first.copyEmbedHtmlRoles || '[]',
      watermarkType: first.watermarkType || 'preview',
      watermark: first.watermark || '',
      preferKkfileview: first.preferKkfileview ?? false,
      preferredPreview: ['microsoft', 'kkfileview', 'basemetas', 'none'].includes(preferredPreview)
        ? preferredPreview
        : DEFAULT_PREFERRED_PREVIEW,
    };
  }
}

export default PluginFilePreviewerKkfileviewServer;

// 该文件用于描述插件对外资源动作，保持与 `src/server/plugin.ts` 当前实现一致。
export default {
  info: {
    title: 'NocoBase API - kkFileView Previewer plugin',
    version: '1.1.0',
    description: 'kkFileView 文件预览插件 API 文档（已对齐当前服务端资源动作）',
  },
  tags: [
    {
      name: 'kkfileviewSettings',
      description: '配置读取与保存接口',
    },
    {
      name: 'kkfileviewHealthCheck',
      description: '预览服务健康检查接口',
    },
    {
      name: 'kkfileviewPreview',
      description: '预览地址生成接口',
    },
    {
      name: 'kkfileviewModificationRecords',
      description: '配置修改记录接口',
    },
    {
      name: 'kkfileviewPreviewRecords',
      description: '预览记录接口',
    },
    {
      name: 'kkfileviewFieldCleanup',
      description: '兼容字段清理接口',
    },
  ],
  paths: {
    '/kkfileviewSettings:list': {
      get: {
        tags: ['kkfileviewSettings'],
        summary: '获取 kkFileView 配置列表',
        responses: {
          200: {
            description: '成功返回配置列表',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: {
                        $ref: '#/components/schemas/KkfileviewSettings',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/kkfileviewSettingsSave:save': {
      post: {
        tags: ['kkfileviewSettings'],
        summary: '保存 kkFileView 配置（更新首条或创建）',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/KkfileviewSettings',
              },
            },
          },
        },
        responses: {
          200: {
            description: '保存成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      $ref: '#/components/schemas/KkfileviewSettings',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/kkfileviewHealthCheck:check': {
      post: {
        tags: ['kkfileviewHealthCheck'],
        summary: '检查预览服务连通性',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  url: {
                    type: 'string',
                    description: '预览服务地址',
                  },
                  service: {
                    type: 'string',
                    description: '服务类型（microsoft | kkfileview | basemetas）',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: '检查完成',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'object',
                      properties: {
                        success: { type: 'boolean' },
                        reachable: { type: 'boolean' },
                        mode: { type: 'string' },
                        status: { type: 'number' },
                        message: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/kkfileviewPreview:generate': {
      post: {
        tags: ['kkfileviewPreview'],
        summary: '生成 kkFileView 预览地址',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['url'],
                properties: {
                  url: {
                    type: 'string',
                    description: '需要预览的文件原始地址',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: '生成成功',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'object',
                      properties: {
                        previewUrl: { type: 'string' },
                        originalUrl: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            description: '请求参数错误（如缺少 url）',
          },
        },
      },
    },
    '/kkfileviewModificationRecords:list': {
      get: {
        tags: ['kkfileviewModificationRecords'],
        summary: '获取配置修改记录',
        responses: {
          200: {
            description: '返回记录列表',
          },
        },
      },
    },
    '/kkfileviewModificationRecords:append': {
      post: {
        tags: ['kkfileviewModificationRecords'],
        summary: '新增配置修改记录',
        responses: {
          200: {
            description: '新增成功',
          },
        },
      },
    },
    '/kkfileviewModificationRecords:remove': {
      post: {
        tags: ['kkfileviewModificationRecords'],
        summary: '删除单条配置修改记录',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['id'],
                properties: {
                  id: { type: ['string', 'number'] },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: '删除成功',
          },
        },
      },
    },
    '/kkfileviewModificationRecords:clear': {
      post: {
        tags: ['kkfileviewModificationRecords'],
        summary: '清空配置修改记录',
        responses: {
          200: {
            description: '清空成功',
          },
        },
      },
    },
    '/kkfileviewPreviewRecords:list': {
      get: {
        tags: ['kkfileviewPreviewRecords'],
        summary: '获取预览记录',
        responses: {
          200: {
            description: '返回记录列表',
          },
        },
      },
    },
    '/kkfileviewPreviewRecords:append': {
      post: {
        tags: ['kkfileviewPreviewRecords'],
        summary: '新增预览记录',
        responses: {
          200: {
            description: '新增成功',
          },
        },
      },
    },
    '/kkfileviewPreviewRecords:remove': {
      post: {
        tags: ['kkfileviewPreviewRecords'],
        summary: '删除单条预览记录',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['id'],
                properties: {
                  id: { type: ['string', 'number'] },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: '删除成功',
          },
        },
      },
    },
    '/kkfileviewPreviewRecords:clear': {
      post: {
        tags: ['kkfileviewPreviewRecords'],
        summary: '清空预览记录',
        responses: {
          200: {
            description: '清空成功',
          },
        },
      },
    },
    '/kkfileviewFieldCleanup:run': {
      post: {
        tags: ['kkfileviewFieldCleanup'],
        summary: '执行兼容字段清理与迁移',
        responses: {
          200: {
            description: '执行完成',
          },
        },
      },
    },
  },
  components: {
    schemas: {
      KkfileviewSettings: {
        type: 'object',
        properties: {
          id: {
            type: 'integer',
            description: '配置 ID',
          },
          host: {
            type: 'string',
            description: '旧版本兼容字段：主机地址',
          },
          kkfileviewHost: {
            type: 'string',
            description: 'kkFileView 服务地址',
          },
          basemetasHost: {
            type: 'string',
            description: 'BaseMetas 服务地址',
          },
          microsoftHost: {
            type: 'string',
            description: 'Microsoft 预览服务地址',
          },
          nocobaseHost: {
            type: 'string',
            description: '系统公共访问地址',
          },
          extensions: {
            type: 'string',
            description: '旧版本兼容字段：支持的文件扩展名（JSON 字符串）',
          },
          kkfileviewExtensions: {
            type: 'string',
            description: 'kkFileView 支持的扩展名（JSON 字符串）',
          },
          basemetasExtensions: {
            type: 'string',
            description: 'BaseMetas 支持的扩展名（JSON 字符串）',
          },
          microsoftExtensions: {
            type: 'string',
            description: 'Microsoft 支持的扩展名（JSON 字符串）',
          },
          preferKkfileview: {
            type: 'boolean',
            description: '旧版本兼容字段：是否优先使用 kkFileView',
          },
          enableKkfileview: {
            type: 'boolean',
            description: '是否启用 kkFileView',
          },
          enableBasemetas: {
            type: 'boolean',
            description: '是否启用 BaseMetas',
          },
          enableMicrosoft: {
            type: 'boolean',
            description: '是否启用 Microsoft 预览',
          },
          enablePrint: {
            type: 'boolean',
            description: '是否启用打印',
          },
          enableOpenInNewWindow: {
            type: 'boolean',
            description: '是否显示“新窗口打开”按钮',
          },
          enableFullscreenButton: {
            type: 'boolean',
            description: '是否显示“全屏预览”按钮',
          },
          enableMobileAutoFullscreen: {
            type: 'boolean',
            description: '是否启用移动端自动全屏',
          },
          enableDownload: {
            type: 'boolean',
            description: '是否显示下载按钮',
          },
          basemetasRequestType: {
            type: 'string',
            description: 'BaseMetas 请求类型（query | base64）',
          },
          enableCopyEmbedHtml: {
            type: 'boolean',
            description: '是否显示复制嵌入代码按钮',
          },
          copyEmbedHtmlPermission: {
            type: 'string',
            description: '复制嵌入代码权限（admin | user | roles）',
          },
          copyEmbedHtmlRoles: {
            type: 'string',
            description: '角色白名单（JSON 字符串）',
          },
          watermarkType: {
            type: 'string',
            description: '水印类型（global | preview）',
          },
          watermark: {
            type: 'string',
            description: '水印文本模板',
          },
          serviceType: {
            type: 'string',
            description: '旧版本兼容字段：服务类型',
          },
          preferredPreview: {
            type: 'string',
            description: '优先预览服务（microsoft | kkfileview | basemetas | none）',
          },
        },
      },
    },
  },
};
